import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { curriculum, subjects, sampleQuiz } from './src-content.js';
import { geminiModelCandidates } from './ai-models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.STUDYWISE_DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'progress.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const scrypt = promisify(scryptCb);
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ROLES = ['creator', 'institution_admin', 'teacher', 'learner', 'parent_guardian', 'support_staff'];
const ROLE_LABELS = { creator: 'Creator / Super Admin', institution_admin: 'Institution Administrator', teacher: 'Teacher', learner: 'Learner', parent_guardian: 'Parent / Guardian', support_staff: 'Support Staff' };
let accounts = await loadAccounts();
async function loadAccounts() { await mkdir(DATA_DIR, { recursive: true }); try { const v = JSON.parse(await readFile(ACCOUNTS_FILE, 'utf8')); return { users: Array.isArray(v.users) ? v.users : [], audit: Array.isArray(v.audit) ? v.audit : [] }; } catch { return { users: [], audit: [] }; } }
async function saveAccounts() { await writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), { mode: 0o600 }); }
function audit(action, actor, target, details = {}) { accounts.audit.push({ id: randomUUID(), action, actor: actor || 'system', target: target || null, details, at: new Date().toISOString() }); accounts.audit = accounts.audit.slice(-1000); }
function publicUser(user) { const { passwordHash, passwordSalt, ...safe } = user; return safe; }
async function passwordHash(password, salt = randomBytes(16).toString('hex')) { const derived = await scrypt(password, salt, 64); return { salt, hash: Buffer.from(derived).toString('hex') }; }
async function checkPassword(password, user) { const derived = Buffer.from(await scrypt(password, user.passwordSalt, 64)); const expected = Buffer.from(user.passwordHash, 'hex'); return derived.length === expected.length && timingSafeEqual(derived, expected); }
function cookieValue(req, key) { const raw = req.headers.cookie || ''; for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === key) return decodeURIComponent(v.join('=')); } return ''; }
function currentUser(req) { const sid = cookieValue(req, 'sw_session'); const entry = sessions.get(sid); if (!entry || entry.expiresAt < Date.now()) { if (entry) sessions.delete(sid); return null; } const user = accounts.users.find(x => x.id === entry.userId && x.active); return user ? { user, sid } : null; }
function setSession(res, sid) { const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''; res.setHeader('set-cookie', `sw_session=${encodeURIComponent(sid)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`); }
function clearSession(res) { res.setHeader('set-cookie', 'sw_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); }
function requireUser(req, res) { const session = currentUser(req); if (!session) { json(res, 401, { error: 'Please sign in to continue.' }); return null; } return session.user; }
function canCreate(actorRole, targetRole) { if (actorRole === 'creator') return targetRole !== 'creator'; if (actorRole === 'institution_admin') return ['teacher','learner','parent_guardian'].includes(targetRole); return false; }
const PORT = Number(process.env.PORT || 10000);
const MAX_BODY = 1_000_000;

async function loadStore() {
  await mkdir(DATA_DIR, { recursive: true });
  try { return JSON.parse(await readFile(DATA_FILE, 'utf8')); }
  catch { return { learners: {} }; }
}
let store = await loadStore();
let writeQueue = Promise.resolve();
function persist() {
  writeQueue = writeQueue.then(() => writeFile(DATA_FILE, JSON.stringify(store, null, 2)));
  return writeQueue;
}
function getLearner(id) {
  const safeId = String(id || 'guest').slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, '') || 'guest';
  if (!store.learners[safeId]) store.learners[safeId] = { id: safeId, name: 'Learner', level: 'Secondary', curriculum: 'KCSE / Kenya', streak: 0, attempts: [], errorBook: [], plans: [], notes: [], updatedAt: new Date().toISOString() };
  return store.learners[safeId];
}
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}
async function bodyJson(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > MAX_BODY) throw Object.assign(new Error('Request body too large'), { status: 413 }); }
  try { return body ? JSON.parse(body) : {}; } catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}
function cleanText(v, max = 2000) { return String(v ?? '').trim().slice(0, max); }
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json; charset=utf-8'})[ext] || 'application/octet-stream';
}
function configuredProviders() {
  const list = [];
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const grokKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (geminiKey) list.push({ id: 'gemini', key: geminiKey, model: process.env.GEMINI_MODEL || 'gemini-3.8-flash' });
  // Groq provides an OpenAI-compatible chat-completions endpoint.
  if (groqKey) list.push({ id: 'groq', key: groqKey, model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', base: 'https://api.groq.com/openai/v1' });
  if (grokKey) list.push({ id: 'grok', key: grokKey, model: process.env.GROK_MODEL || 'grok-3-mini', base: 'https://api.x.ai/v1' });
  if (openaiKey) list.push({ id: 'openai', key: openaiKey, model: process.env.OPENAI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini', base: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') });
  const preference = (process.env.AI_PROVIDER_ORDER || 'gemini,groq,grok,openai').split(',').map(x => x.trim().toLowerCase());
  return list.sort((a,b) => { const ai = preference.indexOf(a.id), bi = preference.indexOf(b.id); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
}
async function callProvider(provider, systemPrompt, question) {
  if (provider.id === 'gemini') {
    // Model availability varies by API key/project. If a model is missing (404),
    // retry current supported model candidates before failing over to another
    // configured provider. Gemini 2.0 Flash is retired and is not a fallback.
    // Never retry auth/quota errors as model errors.
    const models = geminiModelCandidates(provider.model);
    const base = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    let lastError;
    for (const model of models) {
      const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(provider.key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: question }] }], generationConfig: { temperature: 0.3 } }),
        signal: AbortSignal.timeout(25000)
      });
      if (response.status === 404) {
        lastError = new Error(`Gemini model ${model} returned HTTP 404 (model unavailable at ${base})`);
        continue;
      }
      if (!response.ok) {
        let detail = '';
        try { const body = await response.json(); detail = body?.error?.message ? `: ${body.error.message}` : ''; } catch {}
        throw new Error(`Gemini returned HTTP ${response.status}${detail}`);
      }
      const data = await response.json();
      const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
      if (!answer) throw new Error(`Gemini model ${model} returned an empty answer`);
      return answer;
    }
    throw lastError || new Error('No available Gemini model succeeded');
  }
  const response = await fetch(`${provider.base}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
    body: JSON.stringify({ model: provider.model, temperature: 0.3, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }] }),
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`${provider.id} returned HTTP ${response.status}`);
  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error(`${provider.id} returned an empty answer`);
  return answer.trim();
}
const RESOURCE_INDEX = path.join(__dirname, 'resources', 'index.json');
async function loadRevisionResources() {
  try {
    const parsed = JSON.parse(await readFile(RESOURCE_INDEX, 'utf8'));
    return Array.isArray(parsed.resources) ? parsed.resources : [];
  } catch { return []; }
}
function findRevisionResources(resources, { question, subject, level, curriculum, topic }) {
  const terms = `${question} ${subject} ${level} ${curriculum || ''} ${topic || ''}`.toLowerCase();
  const words = [...new Set(terms.split(/[^a-z0-9]+/).filter(w => w.length > 2))];
  return resources.map(resource => {
    const metadata = `${resource.title || ''} ${resource.resourceType || ''} ${resource.curriculum || ''} ${resource.level || ''} ${resource.subject || ''} ${resource.topic || ''} ${(resource.tags || []).join(' ')}`.toLowerCase();
    let score = 0;
    if (String(resource.subject || '').toLowerCase() === String(subject || '').toLowerCase()) score += 8;
    if (topic && String(resource.topic || '').toLowerCase().includes(String(topic).toLowerCase())) score += 7;
    if (level && metadata.includes(String(level).toLowerCase())) score += 2;
    if (curriculum && metadata.includes(String(curriculum).toLowerCase())) score += 2;
    for (const word of words) if (metadata.includes(word)) score += 1;
    return { resource, score };
  }).filter(x => x.score > 0 && ['public-domain','licensed','permission-granted','link-only'].includes(String(x.resource.rights || '').toLowerCase()))
    .sort((a,b) => b.score-a.score).slice(0,5).map(x => x.resource);
}

async function tutorAnswer(question, subject, level, learnerContext = {}) {
  const resources = findRevisionResources(await loadRevisionResources(), { question, subject, level, ...learnerContext });
  const resourceContext = resources.length ? `\n\nVERIFIED REVISION RESOURCES (use only these supplied records; do not invent details):\n${resources.map((r, i) => `[${i+1}] ${r.title || 'Untitled'} | ${r.resourceType || 'resource'} | ${r.year || 'year not specified'} | ${r.sourceName || 'source not specified'} | ${r.sourceUrl || 'no URL'}\nSubject/topic: ${r.subject || ''} / ${r.topic || ''}\nPermitted excerpt: ${String(r.contentText || '').slice(0, 3500)}`).join('\n\n').slice(0, 12000)}\nCite any used item by its title/year/source. If these records do not contain the requested paper or answer, say so and do not pretend that a paper was retrieved.` : '\n\nNo verified revision resources matched this request. Do not claim to have searched or retrieved an actual past paper; answer from knowledge or create clearly labelled original practice questions.';
  const systemPrompt = `You are StudyWise AI Tutor: an accurate, patient, inclusive tutor for learners across subjects and courses. Learner level: ${level}; subject: ${subject}; curriculum: ${learnerContext.curriculum || 'not specified'}; topic: ${learnerContext.topic || 'not specified'}. Answer the actual question first, then explain in clear, age-appropriate student language. For mathematics, show the formula or method, substitution, ordered working, units and final answer; check the result where practical. For sciences, define key terms and explain processes accurately. For languages, use the requested language and correct register. For humanities and religious studies, give relevant points with short explanations and examples. For technical/TVET and university subjects, adapt depth to the course and include safety where relevant. For exam answers, match detail to marks when supplied. Use valid Markdown headings, lists, tables and worked steps where useful; never return HTML. Do not invent official marking schemes, paper years, question numbers, citations or sources. Never describe generated questions as official past papers. If asked for predictions, give cautious revision priorities based on evidence, never guaranteed or leaked questions. If syllabus details are uncertain, say so. If a subject or course is unfamiliar, still help with the underlying concept and acknowledge any limits. End with one short check-for-understanding question when suitable.${resourceContext}`;
  const providers = configuredProviders();
  if (!providers.length) return { mode: 'demo', provider: 'demo', answer: demoExplain(question, subject), note: 'No supported AI API key is configured. This is demo guidance, not a live AI response.' };
  const failures = [];
  for (const provider of providers) {
    try { return { mode: 'live', provider: provider.id, answer: await callProvider(provider, systemPrompt, question) }; }
    catch (error) { failures.push(`${provider.id}: ${error.name === 'TimeoutError' ? 'request timed out after 25 seconds' : error.message}`); }
  }
  throw new Error(`All configured AI providers failed. ${failures.join('; ')}. Check key validity, model access, quota and provider status.`);
}
function demoExplain(question, subject) {
  const q = question.toLowerCase();
  if (subject === 'Mathematics' && (q.includes('factor') || q.includes('quadratic'))) return 'Try this method: (1) Write the expression in standard form. (2) Find two numbers whose product is the constant term and whose sum is the coefficient of x. (3) Split the middle term, then factor by grouping. (4) Expand your factors to check. Send the exact expression and I can demonstrate the steps.';
  if (subject === 'Chemistry') return 'Start by identifying the key concept and writing down the relevant definitions or equation. For calculations, list the given values, choose the relationship, substitute with units, and check that the final answer is reasonable. Add your exact question for a more targeted explanation.';
  return `Let's break this down for ${subject}. First identify the key term or idea in the question. Then write a short definition, explain the main points in a logical order, and use a relevant example. For an exam answer, match the number of clear points to the marks available. Add the exact question so I can guide you more precisely.`;
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const origin = process.env.ALLOWED_ORIGIN;
    if (origin && req.headers.origin && !origin.split(',').map(x => x.trim()).includes(req.headers.origin)) return json(res, 403, { error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers':'content-type' }); return res.end(); }
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, app: 'StudyWise AI', version: '2.1.5', aiConfigured: configuredProviders().length > 0, providers: configuredProviders().map(p => p.id), time: new Date().toISOString() });
      if (req.method === 'GET' && url.pathname === '/api/accounts/status') return json(res, 200, { setupRequired: accounts.users.length === 0, roles: ROLES.filter(r => r !== 'creator').map(id => ({ id, label: ROLE_LABELS[id] })), sessionActive: Boolean(currentUser(req)) });
      if (req.method === 'POST' && url.pathname === '/api/accounts/setup-creator') {
        const b = await bodyJson(req); const setupSecret = process.env.CREATOR_SETUP_SECRET || '';
        if (accounts.users.length) return json(res, 409, { error: 'Creator setup has already been completed. No public Creator registration is allowed.' });
        if (!setupSecret || Buffer.byteLength(String(b.setupSecret || '')) !== Buffer.byteLength(setupSecret) || !timingSafeEqual(Buffer.from(String(b.setupSecret || '')), Buffer.from(setupSecret))) return json(res, 403, { error: 'Creator setup secret is missing or incorrect. Configure CREATOR_SETUP_SECRET in the server environment.' });
        const email = cleanText(b.email, 254).toLowerCase(); const password = String(b.password || ''); const name = cleanText(b.name, 100);
        if (!/^.{3,254}@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 200 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !name) return json(res, 400, { error: 'Provide a valid email, name, and password of 12–200 characters containing letters and numbers.' });
        const creds = await passwordHash(password); const user = { id: randomUUID(), email, name, role: 'creator', institutionId: null, active: true, createdAt: new Date().toISOString(), passwordSalt: creds.salt, passwordHash: creds.hash };
        accounts.users.push(user); audit('creator_setup', user.id, user.id); await saveAccounts(); const sid = randomBytes(32).toString('hex'); sessions.set(sid, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS }); setSession(res, sid); return json(res, 201, { user: publicUser(user), message: 'Creator account created. Save your credentials securely.' });
      }
      if (req.method === 'POST' && url.pathname === '/api/accounts/login') {
        const b = await bodyJson(req); const email = cleanText(b.email, 254).toLowerCase(); const user = accounts.users.find(x => x.email === email && x.active);
        if (!user || !(await checkPassword(String(b.password || ''), user))) { audit('login_failed', null, email); await saveAccounts(); return json(res, 401, { error: 'Email or password is incorrect.' }); }
        const sid = randomBytes(32).toString('hex'); sessions.set(sid, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS }); setSession(res, sid); audit('login_success', user.id, user.id); await saveAccounts(); return json(res, 200, { user: publicUser(user) });
      }
      if (req.method === 'POST' && url.pathname === '/api/accounts/logout') { const sid = cookieValue(req, 'sw_session'); const entry = sessions.get(sid); if (entry) { audit('logout', entry.userId, entry.userId); sessions.delete(sid); await saveAccounts(); } clearSession(res); return json(res, 200, { ok: true }); }
      if (req.method === 'GET' && url.pathname === '/api/accounts/me') { const session = currentUser(req); return session ? json(res, 200, { user: publicUser(session.user), permissions: session.user.role === 'creator' ? ['platform:*'] : session.user.role === 'institution_admin' ? ['institution:manage','users:create:teacher,learner,parent_guardian'] : session.user.role === 'teacher' ? ['assigned-classes:manage'] : session.user.role === 'learner' ? ['own-learning:read-write'] : session.user.role === 'parent_guardian' ? ['linked-learner:read-limited'] : ['support:limited-audited'] }) : json(res, 401, { error: 'Not signed in.' }); }
      if (req.method === 'GET' && url.pathname === '/api/accounts/users') { const actor = requireUser(req, res); if (!actor) return; if (!['creator','institution_admin'].includes(actor.role)) return json(res, 403, { error: 'You do not have permission to manage accounts.' }); const visible = accounts.users.filter(u => u.role !== 'creator' && (actor.role === 'creator' || u.institutionId === actor.institutionId)); return json(res, 200, { users: visible.map(publicUser) }); }
      if (req.method === 'POST' && url.pathname === '/api/accounts/users') {
        const actor = requireUser(req, res); if (!actor) return; const b = await bodyJson(req); const role = cleanText(b.role, 40); const email = cleanText(b.email, 254).toLowerCase(); const name = cleanText(b.name, 100); const password = String(b.password || '');
        if (!ROLES.includes(role) || role === 'creator' || !canCreate(actor.role, role)) return json(res, 403, { error: 'Your role cannot create this account type.' });
        if (!/^.{3,254}@[^\s@]+\.[^\s@]+$/.test(email) || accounts.users.some(u => u.email === email)) return json(res, 400, { error: 'Provide a valid, unused email address.' });
        if (password.length < 12 || password.length > 200 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !name) return json(res, 400, { error: 'Provide a name and a password of at least 12 characters containing letters and numbers.' });
        let institutionId = actor.role === 'institution_admin' ? actor.institutionId : cleanText(b.institutionId, 100) || null;
        if (role === 'institution_admin' && actor.role !== 'creator') return json(res, 403, { error: 'Only the Creator can create Institution Administrators.' });
        if (actor.role === 'institution_admin' && !institutionId) return json(res, 400, { error: 'Your account is not linked to an institution.' });
        if (role === 'institution_admin' && !institutionId) institutionId = randomUUID();
        const creds = await passwordHash(password); const user = { id: randomUUID(), email, name, role, institutionId, active: true, createdAt: new Date().toISOString(), passwordSalt: creds.salt, passwordHash: creds.hash };
        accounts.users.push(user); audit('account_created', actor.id, user.id, { role, institutionId }); await saveAccounts(); return json(res, 201, { user: publicUser(user) });
      }
      if (req.method === 'POST' && url.pathname === '/api/accounts/users/:id/disable') return json(res, 404, { error: 'Use the supported user ID route format: /api/accounts/users/{id}/disable is not yet enabled.' });
      const disableMatch = url.pathname.match(/^\/api\/accounts\/users\/([a-f0-9-]+)\/disable$/i);
      if (req.method === 'POST' && disableMatch) { const actor = requireUser(req, res); if (!actor) return; const target = accounts.users.find(x => x.id === disableMatch[1]); if (!target) return json(res, 404, { error: 'Account not found.' }); if (target.role === 'creator' || !canCreate(actor.role, target.role) || (actor.role === 'institution_admin' && target.institutionId !== actor.institutionId)) return json(res, 403, { error: 'You cannot disable this account.' }); target.active = false; audit('account_disabled', actor.id, target.id); await saveAccounts(); return json(res, 200, { user: publicUser(target) }); }
      if (req.method === 'GET' && url.pathname === '/api/accounts/audit') { const actor = requireUser(req, res); if (!actor) return; if (actor.role !== 'creator') return json(res, 403, { error: 'Only the Creator can view the platform audit log.' }); return json(res, 200, { events: accounts.audit.slice(-200).reverse() }); }
      if (req.method === 'GET' && url.pathname === '/api/curriculum') return json(res, 200, { curriculum, subjects, educationLevels: ['Early years','Primary','Lower secondary','Upper secondary','TVET / vocational','College','Undergraduate','Postgraduate','Professional learning','Lifelong learning'], curriculumNote: 'This is an expandable starter directory, not a claim that every national syllabus has been verified.' });
      if (req.method === 'GET' && url.pathname === '/api/resources') { const all = await loadRevisionResources(); const q = cleanText(url.searchParams.get('q'), 200).toLowerCase(); const subject = cleanText(url.searchParams.get('subject'), 100).toLowerCase(); const topic = cleanText(url.searchParams.get('topic'), 160).toLowerCase(); const type = cleanText(url.searchParams.get('type'), 80).toLowerCase(); const results = all.filter(r => ['public-domain','licensed','permission-granted','link-only'].includes(String(r.rights || '').toLowerCase()) && (!q || `${r.title||''} ${r.subject||''} ${r.topic||''} ${(r.tags||[]).join(' ')}`.toLowerCase().includes(q)) && (!subject || String(r.subject||'').toLowerCase()===subject) && (!topic || String(r.topic||'').toLowerCase().includes(topic)) && (!type || String(r.resourceType||'').toLowerCase()===type)).slice(0,50); return json(res, 200, { resources: results.map(({contentText, ...r}) => r), count: results.length, libraryCount: all.length, note: all.length ? 'Only indexed, rights-cleared resources are listed.' : 'The resource index is currently empty. Add verified, rights-cleared resources to resources/index.json.' }); }
      if (req.method === 'GET' && url.pathname === '/api/quiz') {
        const subject = url.searchParams.get('subject') || 'Mathematics';
        const items = sampleQuiz.filter(q => q.subject === subject);
        const topic = url.searchParams.get('topic');
        const paper = url.searchParams.get('paper');
        const filtered = items.filter(q => (!topic || q.topic.toLowerCase() === topic.toLowerCase()) && (!paper || q.paper === paper));
        return json(res, 200, { questions: filtered.map(({answer, explanation, ...q}) => q), count: filtered.length, topics: [...new Set(items.map(q => q.topic))], papers: [...new Set(items.map(q => q.paper).filter(Boolean))], note: 'Original practice questions; not official KNEC examination papers.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/progress') {
        const learner = getLearner(url.searchParams.get('learnerId'));
        return json(res, 200, { learner: { ...learner, attempts: learner.attempts.slice(-100) } });
      }
      if (req.method === 'POST' && url.pathname === '/api/tutor') {
        const b = await bodyJson(req); const question = cleanText(b.question, 4000); const subject = cleanText(b.subject, 80) || 'General';
        if (question.length < 3) return json(res, 400, { error: 'Please enter a question of at least 3 characters.' });
        try { return json(res, 200, await tutorAnswer(question, subject, cleanText(b.level, 80) || 'Secondary', { curriculum: cleanText(b.curriculum, 120), topic: cleanText(b.topic, 160) })); }
        catch (e) { return json(res, 502, { error: e.message || 'Tutor service unavailable.' }); }
      }
      if (req.method === 'POST' && url.pathname === '/api/attempt') {
        const b = await bodyJson(req); const learner = getLearner(b.learnerId); const questionId = cleanText(b.questionId, 100); const answer = cleanText(b.answer, 1000);
        const q = sampleQuiz.find(x => x.id === questionId);
        if (!q) return json(res, 404, { error: 'Practice question not found.' });
        const correct = answer.toLowerCase() === q.answer.toLowerCase();
        const attempt = { id: randomUUID(), questionId, subject: q.subject, answer, correct, createdAt: new Date().toISOString() };
        learner.attempts.push(attempt);
        if (!correct && !learner.errorBook.some(x => x.questionId === q.id)) learner.errorBook.push({ questionId: q.id, subject: q.subject, question: q.question, yourAnswer: answer, correctAnswer: q.answer, explanation: q.explanation, createdAt: attempt.createdAt });
        learner.updatedAt = attempt.createdAt; await persist();
        return json(res, 200, { correct, correctAnswer: q.answer, explanation: q.explanation, attempt });
      }
      if (req.method === 'POST' && url.pathname === '/api/profile') {
        const b = await bodyJson(req); const learner = getLearner(b.learnerId);
        learner.name = cleanText(b.name, 80) || 'Learner'; learner.level = cleanText(b.level, 80) || 'Secondary'; learner.curriculum = cleanText(b.curriculum, 100) || 'KCSE / Kenya'; learner.updatedAt = new Date().toISOString(); await persist();
        return json(res, 200, { learner });
      }
      if (req.method === 'POST' && url.pathname === '/api/error-book/remove') {
        const b = await bodyJson(req); const learner = getLearner(b.learnerId); learner.errorBook = learner.errorBook.filter(x => x.questionId !== b.questionId); await persist(); return json(res, 200, { errorBook: learner.errorBook });
      }
      if (req.method === 'POST' && url.pathname === '/api/notes') {
        const b = await bodyJson(req); const learner = getLearner(b.learnerId); const title = cleanText(b.title, 120); const content = cleanText(b.content, 8000);
        if (!title || !content) return json(res, 400, { error: 'A title and note content are required.' });
        const note = { id: randomUUID(), title, content, subject: cleanText(b.subject, 80) || 'General', createdAt: new Date().toISOString() }; learner.notes.unshift(note); learner.notes = learner.notes.slice(0, 100); await persist(); return json(res, 201, { note, notes: learner.notes });
      }
      if (req.method === 'POST' && url.pathname === '/api/notes/delete') {
        const b = await bodyJson(req); const learner = getLearner(b.learnerId); learner.notes = learner.notes.filter(x => x.id !== b.id); await persist(); return json(res, 200, { notes: learner.notes });
      }
      if (req.method === 'POST' && url.pathname === '/api/plan') {
        const b = await bodyJson(req); const learner = getLearner(b.learnerId); const subject = cleanText(b.subject, 80) || 'Mathematics'; const minutes = Math.min(180, Math.max(15, Number(b.minutes) || 30));
        const plan = { id: randomUUID(), subject, minutes, topic: cleanText(b.topic, 160) || 'Review a recent topic', steps: [`Review notes for ${Math.round(minutes * 0.3)} minutes`, `Attempt practice questions for ${Math.round(minutes * 0.5)} minutes`, 'Check answers and record mistakes for the remaining time'], createdAt: new Date().toISOString() }; learner.plans.unshift(plan); learner.plans = learner.plans.slice(0, 30); await persist(); return json(res, 201, { plan, plans: learner.plans });
      }
      return json(res, 404, { error: 'API route not found.' });
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) return json(res, 403, { error: 'Forbidden' });
    try { const bytes = await readFile(file); res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' }); return res.end(bytes); }
    catch { return json(res, 404, { error: 'Not found' }); }
  } catch (error) { return json(res, error.status || 500, { error: error.message || 'Internal server error' }); }
});
server.listen(PORT, '0.0.0.0', () => console.log(`StudyWise AI listening on ${PORT}`));

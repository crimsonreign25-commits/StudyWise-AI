import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
const { Pool } = pg;
const scrypt = promisify(scryptCb);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }, max: 5 }) : null;
const SESSION_COOKIE = 'studywise_session';
const SESSION_DAYS = 7;
const ROLES = ['creator','institution_admin','teacher','learner','parent_guardian','support_staff'];
const ROLE_RANK = { learner: 1, parent_guardian: 1, teacher: 2, support_staff: 2, institution_admin: 3, creator: 4 };
const authAttempts = new Map();
function authRateLimited(req) { const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim(); const now=Date.now(); const item=authAttempts.get(ip)||{count:0,start:now}; if(now-item.start>15*60*1000){authAttempts.set(ip,{count:1,start:now});return false;} item.count++;authAttempts.set(ip,item);return item.count>30; }
import { curriculum, subjects, sampleQuiz } from './src-content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'progress.json');
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
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'})[ext] || 'application/octet-stream';
}
function configuredProviders() {
  const list = [];
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const grokKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (geminiKey) list.push({ id: 'gemini', key: geminiKey, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
  if (grokKey) list.push({ id: 'grok', key: grokKey, model: process.env.GROK_MODEL || 'grok-3-mini', base: 'https://api.x.ai/v1' });
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) list.push({ id: 'groq', key: groqKey, model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', base: 'https://api.groq.com/openai/v1' });
  if (openaiKey) list.push({ id: 'openai', key: openaiKey, model: process.env.OPENAI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini', base: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') });
  const preference = (process.env.AI_PROVIDER_ORDER || 'gemini,groq,grok,openai').split(',').map(x => x.trim().toLowerCase());
  return list.sort((a,b) => preference.indexOf(a.id) - preference.indexOf(b.id));
}
async function callProvider(provider, systemPrompt, question) {
  if (provider.id === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: question }] }], generationConfig: { temperature: 0.3 } })
    });
    if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);
    const data = await response.json();
    const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
    if (!answer) throw new Error('Gemini returned an empty answer');
    return answer;
  }
  const response = await fetch(`${provider.base}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
    body: JSON.stringify({ model: provider.model, temperature: 0.3, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }] })
  });
  if (!response.ok) throw new Error(`${provider.id} returned HTTP ${response.status}`);
  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error(`${provider.id} returned an empty answer`);
  return answer.trim();
}
async function tutorAnswer(question, subject, level, learnerContext = {}) {
  const systemPrompt = `You are StudyWise AI, a patient and encouraging tutor. Learner education level: ${level}; subject: ${subject}; curriculum: ${learnerContext.curriculum || 'not specified'}; topic: ${learnerContext.topic || 'not specified'}. Explain in age-appropriate, clear student-friendly language. Ask short guiding questions when useful, give worked examples and check understanding. For exam answers, match detail to marks when supplied. Never claim AI-generated questions are official exam papers. If curriculum details are uncertain, say so and ask for the official syllabus. End with one short check-for-understanding question when suitable.`;
  const providers = configuredProviders();
  if (!providers.length) return { mode: 'demo', provider: 'demo', answer: demoExplain(question, subject), note: 'No supported AI API key is configured. This is demo guidance, not a live AI response.' };
  const failures = [];
  for (const provider of providers) {
    try { return { mode: 'live', provider: provider.id, answer: await callProvider(provider, systemPrompt, question) }; }
    catch (error) { failures.push(`${provider.id}: ${error.message}`); }
  }
  throw new Error(`All configured AI providers failed. ${failures.join('; ')}. Check key validity, model access, quota and provider status.`);
}
function demoExplain(question, subject) {
  const q = question.toLowerCase();
  if (subject === 'Mathematics' && (q.includes('factor') || q.includes('quadratic'))) return 'Try this method: (1) Write the expression in standard form. (2) Find two numbers whose product is the constant term and whose sum is the coefficient of x. (3) Split the middle term, then factor by grouping. (4) Expand your factors to check. Send the exact expression and I can demonstrate the steps.';
  if (subject === 'Chemistry') return 'Start by identifying the key concept and writing down the relevant definitions or equation. For calculations, list the given values, choose the relationship, substitute with units, and check that the final answer is reasonable. Add your exact question for a more targeted explanation.';
  return `Let's break this down for ${subject}. First identify the key term or idea in the question. Then write a short definition, explain the main points in a logical order, and use a relevant example. For an exam answer, match the number of clear points to the marks available. Add the exact question so I can guide you more precisely.`;
}
function cookieValue(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) { const i = part.indexOf('='); if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return '';
}
function sessionCookie(token, maxAge = SESSION_DAYS * 86400) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(key).toString('hex') };
}
async function verifyPassword(password, salt, expected) {
  const actual = Buffer.from(await scrypt(password, salt, 64)); const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
async function initAuthDb() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS sw_users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
    password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'learner',
    institution_id TEXT, class_ids TEXT[] NOT NULL DEFAULT '{}', active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sw_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES sw_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sw_institutions (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES sw_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sw_audit_log (
    id BIGSERIAL PRIMARY KEY, actor_id TEXT, actor_role TEXT, action TEXT NOT NULL,
    target_id TEXT, institution_id TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS sw_sessions_expiry_idx ON sw_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS sw_users_institution_idx ON sw_users(institution_id);`);
}
async function audit(user, action, targetId = null, details = {}) {
  if (!pool) return;
  await pool.query('INSERT INTO sw_audit_log(actor_id,actor_role,action,target_id,institution_id,details) VALUES($1,$2,$3,$4,$5,$6)', [user?.id || null, user?.role || null, action, targetId, user?.institution_id || null, JSON.stringify(details)]);
}
async function getSessionUser(req) {
  if (!pool) return null;
  const token = cookieValue(req, SESSION_COOKIE); if (!token) return null;
  const result = await pool.query(`SELECT u.id,u.email,u.display_name,u.role,u.institution_id,u.class_ids,u.active,s.expires_at
    FROM sw_sessions s JOIN sw_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`, [hashToken(token)]);
  const user = result.rows[0]; if (!user || !user.active) return null; return user;
}
async function createSession(userId, res) {
  const token = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO sw_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+($3 * INTERVAL \'1 day\'))', [hashToken(token), userId, SESSION_DAYS]);
  res.setHeader('set-cookie', sessionCookie(token));
}
function publicUser(user) { return { id:user.id, email:user.email, name:user.display_name, role:user.role, institutionId:user.institution_id || null, classIds:user.class_ids || [] }; }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()) && String(v).length <= 254; }
function validPassword(v) { return typeof v === 'string' && v.length >= 10 && v.length <= 200; }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const origin = process.env.ALLOWED_ORIGIN;
    if (origin && req.headers.origin && !origin.split(',').map(x => x.trim()).includes(req.headers.origin)) return json(res, 403, { error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers':'content-type' }); return res.end(); }
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, app: 'StudyWise AI', version: '2.0.0-rbac', databaseConfigured: !!pool, authConfigured: !!pool, aiConfigured: configuredProviders().length > 0, providers: configuredProviders().map(p => p.id), time: new Date().toISOString() });
      if (req.method === 'POST' && ['/api/auth/register','/api/auth/login','/api/auth/bootstrap-creator'].includes(url.pathname) && authRateLimited(req)) return json(res,429,{error:'Too many account attempts. Please wait 15 minutes and try again.'});
      if (req.method === 'POST' && url.pathname === '/api/auth/register') {
        if (!pool) return json(res, 503, { error: 'Accounts are unavailable until DATABASE_URL is configured in Render.' });
        const b = await bodyJson(req); const email = cleanText(b.email,254).toLowerCase(); const name = cleanText(b.name,80); const password = b.password;
        if (!validEmail(email) || !name || !validPassword(password)) return json(res,400,{error:'Enter a valid email, display name, and password of at least 10 characters.'});
        const credentials = await hashPassword(password); const id = randomUUID();
        try { await pool.query('INSERT INTO sw_users(id,email,display_name,password_salt,password_hash,role) VALUES($1,$2,$3,$4,$5,\'learner\')',[id,email,name,credentials.salt,credentials.hash]); }
        catch (e) { if (e.code === '23505') return json(res,409,{error:'An account with this email already exists.'}); throw e; }
        await audit({id,role:'learner'},'account.registered',id,{role:'learner'}); await createSession(id,res);
        return json(res,201,{user:{id,email,name,role:'learner',institutionId:null,classIds:[]}});
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        if (!pool) return json(res,503,{error:'Accounts are unavailable until DATABASE_URL is configured in Render.'});
        const b=await bodyJson(req); const email=cleanText(b.email,254).toLowerCase(); const result=await pool.query('SELECT * FROM sw_users WHERE email=$1',[email]); const user=result.rows[0];
        if (!user || !user.active || !await verifyPassword(String(b.password||''),user.password_salt,user.password_hash)) return json(res,401,{error:'Email or password is incorrect.'});
        await createSession(user.id,res); await audit(user,'account.login',user.id); return json(res,200,{user:publicUser(user)});
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        if (pool) { const token=cookieValue(req,SESSION_COOKIE); if(token) await pool.query('DELETE FROM sw_sessions WHERE token_hash=$1',[hashToken(token)]); }
        res.setHeader('set-cookie',sessionCookie('',0)); return json(res,200,{ok:true});
      }
      if (req.method === 'GET' && url.pathname === '/api/auth/me') {
        const user=await getSessionUser(req); return user ? json(res,200,{user:publicUser(user)}) : json(res,200,{user:null, databaseConfigured:!!pool});
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/bootstrap-creator') {
        if (!pool) return json(res,503,{error:'Configure DATABASE_URL and CREATOR_BOOTSTRAP_SECRET in Render first.'});
        const b=await bodyJson(req); const secret=process.env.CREATOR_BOOTSTRAP_SECRET;
        if (!secret || typeof b.secret!=='string' || b.secret.length!==secret.length || !timingSafeEqual(Buffer.from(b.secret),Buffer.from(secret))) return json(res,403,{error:'Creator setup is not authorised.'});
        const count=await pool.query("SELECT COUNT(*)::int AS n FROM sw_users WHERE role='creator'"); if(count.rows[0].n>0) return json(res,409,{error:'Creator account has already been bootstrapped. Ask the existing creator to manage roles.'});
        const email=cleanText(b.email,254).toLowerCase(),name=cleanText(b.name,80),password=b.password;
        if(!validEmail(email)||!name||!validPassword(password)) return json(res,400,{error:'Enter a valid email, display name, and password of at least 10 characters.'});
        const c=await hashPassword(password),id=randomUUID();
        try { await pool.query("INSERT INTO sw_users(id,email,display_name,password_salt,password_hash,role) VALUES($1,$2,$3,$4,$5,'creator')",[id,email,name,c.salt,c.hash]); }
        catch(e){if(e.code==='23505')return json(res,409,{error:'An account with this email already exists.'});throw e;}
        await audit({id,role:'creator'},'creator.bootstrap_completed',id); await createSession(id,res); return json(res,201,{user:{id,email,name,role:'creator',institutionId:null,classIds:[]}});
      }
      const user = await getSessionUser(req);
      const publicApi = ['/api/health','/api/curriculum','/api/quiz','/api/tutor'];
      if (!publicApi.includes(url.pathname) && !(url.pathname === '/api/auth/me')) {
        if (!pool) return json(res,503,{error:'Private learning records are locked until DATABASE_URL is configured in Render.'});
        if (!user) return json(res,401,{error:'Please sign in to access your learning records.'});
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/users') {
        if (user.role !== 'creator' && user.role !== 'institution_admin') return json(res,403,{error:'Only authorised administrators can manage accounts.'});
        const result = user.role==='creator' ? await pool.query('SELECT id,email,display_name,role,institution_id,class_ids,active,created_at FROM sw_users ORDER BY created_at DESC LIMIT 500') : await pool.query('SELECT id,email,display_name,role,institution_id,class_ids,active,created_at FROM sw_users WHERE institution_id=$1 ORDER BY created_at DESC LIMIT 500',[user.institution_id]);
        return json(res,200,{users:result.rows.map(publicUser)});
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/assign-role') {
        if (!['creator','institution_admin'].includes(user.role)) return json(res,403,{error:'You cannot assign roles.'});
        const b=await bodyJson(req),targetId=cleanText(b.userId,80),role=cleanText(b.role,40);
        if(!ROLES.includes(role)||role==='creator') return json(res,400,{error:'That role cannot be assigned through this endpoint.'});
        const targetResult=await pool.query('SELECT id,role,institution_id FROM sw_users WHERE id=$1',[targetId]);const target=targetResult.rows[0];if(!target)return json(res,404,{error:'Account not found.'});
        if(user.role!=='creator' && (!user.institution_id||target.institution_id!==user.institution_id||!['teacher','learner','parent_guardian','support_staff'].includes(role))) return json(res,403,{error:'You may only manage permitted roles within your own institution.'});
        const institutionId=user.role==='creator'?(cleanText(b.institutionId,100)||null):user.institution_id;if(institutionId){const inst=await pool.query('SELECT id FROM sw_institutions WHERE id=$1',[institutionId]);if(!inst.rowCount)return json(res,400,{error:'Institution was not found.'});}const classIds=Array.isArray(b.classIds)?b.classIds.map(x=>cleanText(x,80)).filter(Boolean).slice(0,100):[];if(role==='institution_admin'&&!institutionId)return json(res,400,{error:'Institution administrators must be assigned to an institution.'});await pool.query('UPDATE sw_users SET role=$1,institution_id=$2,class_ids=$3,updated_at=NOW() WHERE id=$4',[role,institutionId,classIds,targetId]);await audit(user,'account.role_changed',targetId,{from:target.role,to:role,institutionId,classIds});return json(res,200,{ok:true});
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/institutions') {
        if(user.role!=='creator')return json(res,403,{error:'Only the creator can create institutions.'});const b=await bodyJson(req),name=cleanText(b.name,160);if(!name)return json(res,400,{error:'Institution name is required.'});const id=randomUUID();await pool.query('INSERT INTO sw_institutions(id,name,created_by) VALUES($1,$2,$3)',[id,name,user.id]);await audit(user,'institution.created',id,{name});return json(res,201,{institution:{id,name}});
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
        if(user.role!=='creator' && user.role!=='institution_admin')return json(res,403,{error:'You cannot view audit records.'});const result=user.role==='creator'?await pool.query('SELECT * FROM sw_audit_log ORDER BY created_at DESC LIMIT 200'):await pool.query('SELECT * FROM sw_audit_log WHERE institution_id=$1 ORDER BY created_at DESC LIMIT 200',[user.institution_id]);return json(res,200,{events:result.rows});
      }

      if (req.method === 'GET' && url.pathname === '/api/curriculum') return json(res, 200, { curriculum, subjects, educationLevels: ['Early years','Primary','Lower secondary','Upper secondary','TVET / vocational','College','Undergraduate','Postgraduate','Professional learning','Lifelong learning'], curriculumNote: 'This is an expandable starter directory, not a claim that every national syllabus has been verified.' });
      if (req.method === 'GET' && url.pathname === '/api/quiz') {
        const subject = url.searchParams.get('subject') || 'Mathematics';
        const items = sampleQuiz.filter(q => q.subject === subject);
        const topic = url.searchParams.get('topic');
        const paper = url.searchParams.get('paper');
        const filtered = items.filter(q => (!topic || q.topic.toLowerCase() === topic.toLowerCase()) && (!paper || q.paper === paper));
        return json(res, 200, { questions: filtered.map(({answer, explanation, ...q}) => q), count: filtered.length, topics: [...new Set(items.map(q => q.topic))], papers: [...new Set(items.map(q => q.paper).filter(Boolean))], note: 'Original practice questions; not official KNEC examination papers.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/progress') {
        const learner = getLearner(user.id);
        if (learner.name === 'Learner' && user.display_name) { learner.name = user.display_name; await persist(); }
        return json(res, 200, { learner: { ...learner, attempts: learner.attempts.slice(-100) } });
      }
      if (req.method === 'POST' && url.pathname === '/api/tutor') {
        const b = await bodyJson(req); const question = cleanText(b.question, 4000); const subject = cleanText(b.subject, 80) || 'General';
        if (question.length < 3) return json(res, 400, { error: 'Please enter a question of at least 3 characters.' });
        try { return json(res, 200, await tutorAnswer(question, subject, cleanText(b.level, 80) || 'Secondary', { curriculum: cleanText(b.curriculum, 120), topic: cleanText(b.topic, 160) })); }
        catch (e) { return json(res, 502, { error: e.message || 'Tutor service unavailable.' }); }
      }
      if (req.method === 'POST' && url.pathname === '/api/attempt') {
        const b = await bodyJson(req); const learner = getLearner(user.id); const questionId = cleanText(b.questionId, 100); const answer = cleanText(b.answer, 1000);
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
        const b = await bodyJson(req); const learner = getLearner(user.id);
        learner.name = cleanText(b.name, 80) || 'Learner'; learner.level = cleanText(b.level, 80) || 'Secondary'; learner.curriculum = cleanText(b.curriculum, 100) || 'KCSE / Kenya'; learner.updatedAt = new Date().toISOString(); await persist(); await pool.query('UPDATE sw_users SET display_name=$1,updated_at=NOW() WHERE id=$2',[learner.name,user.id]);
        return json(res, 200, { learner });
      }
      if (req.method === 'POST' && url.pathname === '/api/error-book/remove') {
        const b = await bodyJson(req); const learner = getLearner(user.id); learner.errorBook = learner.errorBook.filter(x => x.questionId !== b.questionId); await persist(); return json(res, 200, { errorBook: learner.errorBook });
      }
      if (req.method === 'POST' && url.pathname === '/api/notes') {
        const b = await bodyJson(req); const learner = getLearner(user.id); const title = cleanText(b.title, 120); const content = cleanText(b.content, 8000);
        if (!title || !content) return json(res, 400, { error: 'A title and note content are required.' });
        const note = { id: randomUUID(), title, content, subject: cleanText(b.subject, 80) || 'General', createdAt: new Date().toISOString() }; learner.notes.unshift(note); learner.notes = learner.notes.slice(0, 100); await persist(); return json(res, 201, { note, notes: learner.notes });
      }
      if (req.method === 'POST' && url.pathname === '/api/notes/delete') {
        const b = await bodyJson(req); const learner = getLearner(user.id); learner.notes = learner.notes.filter(x => x.id !== b.id); await persist(); return json(res, 200, { notes: learner.notes });
      }
      if (req.method === 'POST' && url.pathname === '/api/plan') {
        const b = await bodyJson(req); const learner = getLearner(user.id); const subject = cleanText(b.subject, 80) || 'Mathematics'; const minutes = Math.min(180, Math.max(15, Number(b.minutes) || 30));
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
initAuthDb().then(() => server.listen(PORT, '0.0.0.0', () => console.log(`StudyWise AI listening on ${PORT}`))).catch(error => { console.error('Database initialisation failed:', error.message); process.exit(1); });

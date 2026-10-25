import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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
async function tutorAnswer(question, subject, level) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { mode: 'demo', answer: demoExplain(question, subject), note: 'Built-in demo tutor: add an OPENAI_API_KEY in Render environment variables to enable live AI answers.' };
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.3, messages: [
      { role: 'system', content: `You are StudyWise, a patient tutor. The learner's level is ${level}; subject is ${subject}. Explain in clear student-friendly language. For KCSE-style work, show steps and use mark-worthy points when relevant. Never claim generated questions are official KNEC papers. If uncertain, say so. Encourage learning rather than simply giving unsupported answers.` },
      { role: 'user', content: question }
    ] })
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}. Check your model and API configuration.`);
  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) throw new Error('AI provider returned an empty answer.');
  return { mode: 'live', answer };
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
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, app: 'StudyWise AI', version: '1.0.0', aiConfigured: Boolean(process.env.OPENAI_API_KEY), time: new Date().toISOString() });
      if (req.method === 'GET' && url.pathname === '/api/curriculum') return json(res, 200, { curriculum, subjects });
      if (req.method === 'GET' && url.pathname === '/api/quiz') {
        const subject = url.searchParams.get('subject') || 'Mathematics';
        const items = sampleQuiz.filter(q => q.subject === subject);
        return json(res, 200, { questions: items.map(({answer, explanation, ...q}) => q), count: items.length, note: 'Original practice questions; not official KNEC examination papers.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/progress') {
        const learner = getLearner(url.searchParams.get('learnerId'));
        return json(res, 200, { learner: { ...learner, attempts: learner.attempts.slice(-100) } });
      }
      if (req.method === 'POST' && url.pathname === '/api/tutor') {
        const b = await bodyJson(req); const question = cleanText(b.question, 4000); const subject = cleanText(b.subject, 80) || 'General';
        if (question.length < 3) return json(res, 400, { error: 'Please enter a question of at least 3 characters.' });
        try { return json(res, 200, await tutorAnswer(question, subject, cleanText(b.level, 80) || 'Secondary')); }
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

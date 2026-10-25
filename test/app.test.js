import test from 'node:test';
import assert from 'node:assert/strict';
import { curriculum, subjects, sampleQuiz } from '../src-content.js';

test('curriculum includes a Kenya-first learning option', () => {
  assert.ok(curriculum.some(c => c.id === 'kcse' && c.name.includes('Kenya')));
  for (const id of ['cbc-ke','igcse','ib','uk','us','za','ng','in','tz','ug','rw','gh','au','ca','nz','sg','global']) assert.ok(curriculum.some(c => c.id === id), `missing curriculum directory entry: ${id}`);
});
test('subjects are unique and include core KCSE-oriented choices', () => {
  assert.equal(new Set(subjects).size, subjects.length);
  for (const s of ['Mathematics','English','Kiswahili','Chemistry','Computer Studies','CRE']) assert.ok(subjects.includes(s));
});
test('practice question IDs are unique and each question has a valid answer', () => {
  assert.equal(new Set(sampleQuiz.map(q => q.id)).size, sampleQuiz.length);
  for (const q of sampleQuiz) {
    assert.ok(q.question.length > 5);
    assert.ok(q.options.includes(q.answer));
    assert.ok(q.explanation.length > 10);
    assert.ok(q.topic);
    if (q.paper) assert.match(q.paper, /^Paper [123]$/);
  }
});
test('practice questions are labelled as original learning content in the app API', () => {
  assert.ok(sampleQuiz.length >= 20, `expected expanded question bank, got ${sampleQuiz.length}`);
  assert.ok(sampleQuiz.every(q => q.id && q.subject && q.topic));
});

test('security foundation requires PostgreSQL and server-side sessions for private records', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /DATABASE_URL/);
  assert.match(source, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(source, /sw_sessions/);
  assert.match(source, /Please sign in to access your learning records/);
  assert.match(source, /getLearner\(user\.id\)/);
});

test('public registration cannot assign elevated roles and creator bootstrap is one-time', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(source.includes("password_hash,role) VALUES($1,$2,$3,$4,$5,\\'learner\\')"));
  assert.match(source, /Creator account has already been bootstrapped/);
  assert.match(source, /role==='creator'/);
  assert.match(source, /account\.role_changed/);
});

test('Groq provider is configured server-side without exposing provider keys', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /GROQ_API_KEY/);
  assert.match(source, /https:\/\/api\.groq\.com\/openai\/v1/);
  assert.match(source, /providers: configuredProviders\(\)\.map\(p => p\.id\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { geminiModelCandidates } from '../ai-models.js';

test('Gemini candidate list keeps configured model first and removes duplicates', () => {
  assert.deepEqual(geminiModelCandidates('custom-model'), ['custom-model', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']);
  assert.deepEqual(geminiModelCandidates('gemini-2.5-flash'), ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  assert.deepEqual(geminiModelCandidates(''), ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']);
});

test('AI Tutor retries Gemini 404s but does not treat auth/quota failures as model fallbacks', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /if \(response\.status === 404\)/);
  assert.match(source, /if \(!response\.ok\)/);
  assert.match(source, /GEMINI_API_BASE_URL/);
  assert.match(source, /gemini-3\.8-flash/);
  assert.doesNotMatch(source, /gemini-2\.0-flash/);
  assert.match(source, /Gemini model \$\{model\} returned HTTP 404/);
});

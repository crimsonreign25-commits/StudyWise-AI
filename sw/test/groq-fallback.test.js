import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Groq API key, endpoint and default model are supported', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.GROQ_API_KEY/);
  assert.match(source, /https:\/\/api\.groq\.com\/openai\/v1/);
  assert.match(source, /process\.env\.GROQ_MODEL \|\| 'llama-3\.3-70b-versatile'/);
  assert.match(source, /gemini,groq,grok,openai/);
  assert.match(source, /for \(const provider of providers\)/);
});

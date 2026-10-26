import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('Settings is a separate visible navigation destination from Learner profile', () => {
  assert.match(html, /data-view="preferences"[^>]*>[\s\S]*?Settings/);
  assert.match(html, /data-view="settings"[^>]*>[\s\S]*?Learner profile/);
});

test('Settings includes role-aware sections and personal preferences', () => {
  for (const role of ['creator', 'institution_admin', 'teacher', 'learner', 'parent_guardian', 'support_staff', 'guest']) {
    assert.ok(app.includes(`${role}:`), `missing settings role ${role}`);
  }
  for (const pref of ['pref-theme', 'pref-language', 'pref-text-size', 'pref-notifications', 'pref-voice']) {
    assert.ok(app.includes(pref), `missing preference control ${pref}`);
  }
  assert.match(app, /studywise-preferences/);
  assert.match(app, /state\.accountUser\?\.role/);
});

test('Settings supports accessible text-size preferences and mobile layout', () => {
  assert.match(css, /data-text-size=large/);
  assert.match(css, /data-text-size=larger/);
  assert.match(css, /\.settings-grid/);
  assert.match(css, /max-width:520px/);
});

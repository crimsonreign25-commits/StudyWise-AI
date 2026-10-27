import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
test('speech cleanup and playback safeguards exist',()=>{assert.match(app,/function cleanSpeechText\(raw\)/);assert.match(app,/SpeechSynthesisUtterance/);assert.match(app,/Speech playback failed/);assert.match(app,/replace\(\/\^\\s\{0,3\}#\{1,6\}\\s\*\/gm/)});
test('main design theme choices are exactly the three requested themes',()=>{const start=app.indexOf('id="pref-design-theme"');const end=app.indexOf('</select>',start);const selector=app.slice(start,end);assert.match(selector,/>Classy</);assert.match(selector,/>Luxurious</);assert.match(selector,/>Premium</);assert.doesNotMatch(selector,/>Modern</);assert.doesNotMatch(selector,/>Futuristic</)});
test('service worker cache version is updated',()=>{assert.match(sw,/studywise-shell-v2-1-14/)});

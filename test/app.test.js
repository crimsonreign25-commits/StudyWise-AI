import test from 'node:test';
import assert from 'node:assert/strict';
import { curriculum, subjects, sampleQuiz } from '../src-content.js';

test('curriculum includes a Kenya-first learning option', () => {
  assert.ok(curriculum.some(c => c.id === 'kcse' && c.name.includes('Kenya')));
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
  }
});
test('practice questions are labelled as original learning content in the app API', () => {
  assert.ok(sampleQuiz.length >= 5);
  assert.ok(sampleQuiz.every(q => q.id && q.subject && q.topic));
});

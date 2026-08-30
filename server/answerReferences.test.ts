import assert from 'node:assert/strict';
import test from 'node:test';
import { referencesUsedInAnswer } from '../src/utils/answerReferences.ts';

const references = [
  { number: 1, pageNumber: 1, quote: 'Birth date evidence.' },
  { number: 2, pageNumber: 3, quote: 'Unrelated contract evidence.' },
  { number: 3, pageNumber: 4, quote: 'Another unrelated passage.' },
];

test('source panel keeps only references cited by the answer', () => {
  assert.deepEqual(referencesUsedInAnswer('The birth date is 03/09/2003 [1].', references), [references[0]]);
});

test('source panel is empty when the answer does not cite evidence', () => {
  assert.deepEqual(referencesUsedInAnswer('The document does not contain the answer.', references), []);
});

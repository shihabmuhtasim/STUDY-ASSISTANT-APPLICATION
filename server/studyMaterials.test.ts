import { test } from 'node:test';
import assert from 'node:assert/strict';
import { includeStudyMaterials } from '../src/utils/studyMaterials.ts';

const materials = [
  { pageNumber: 1, text: 'Manual note. Lecture transcript: lecturer example.', images: ['diagram-one'] },
  { pageNumber: 2, text: 'Second page private notes', images: ['diagram-two'] },
  { pageNumber: 3, text: 'Third page notes', images: [] },
];

test('Study material follows the current page and includes transcript and diagrams', () => {
  const result = includeStudyMaterials('Slide evidence', materials, 1, 'page');
  assert.match(result.context, /lecturer example/);
  assert.match(result.context, /Slide evidence/);
  assert.doesNotMatch(result.context, /Second page|Third page/);
  assert.deepEqual(result.images, ['diagram-one']);
});

test('Manual range and document scope select the correct study material', () => {
  const result = includeStudyMaterials('Slides', materials, 1, 'page', { start: 2, end: 3 });
  assert.doesNotMatch(result.context, /lecturer example/);
  assert.match(result.context, /Second page/);
  assert.match(result.context, /Third page/);
  assert.deepEqual(result.images, ['diagram-two']);
  assert.match(includeStudyMaterials('Slides', materials, 1, 'document').context, /Third page/);
});

test('Long notes are not silently dropped and total study context stays bounded', () => {
  const result = includeStudyMaterials('s'.repeat(60_000), [{ pageNumber: 1, text: 'n'.repeat(30_000), images: [] }], 1, 'page');
  assert.ok(result.context.includes('n'.repeat(30_000)));
  assert.equal(result.context.length, 50_000);
  assert.throws(() => includeStudyMaterials('', [{ pageNumber: 1, text: 'n'.repeat(51_000), images: [] }], 1, 'page'), /too large/);
});

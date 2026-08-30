import assert from 'node:assert/strict';
import test from 'node:test';
import { findCitationSpanRange } from '../src/utils/citationHighlight.ts';

test('citation matching follows text split across PDF text-layer spans', () => {
  const spans = ['Tenant', 'address:', '10 Cours', "de l'Yser,", '33800 Bordeaux', 'Lease duration'];
  assert.deepEqual(findCitationSpanRange(spans, "The tenant address is 10 Cours de l'Yser, 33800 Bordeaux."), {
    firstSpan: 2,
    lastSpan: 4,
  });
});

test('citation matching returns null when a scanned page has no text layer', () => {
  assert.equal(findCitationSpanRange([], 'Any cited OCR excerpt'), null);
});

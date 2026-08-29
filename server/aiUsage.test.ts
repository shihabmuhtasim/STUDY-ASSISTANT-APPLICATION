import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREE_AI_MODEL,
  FREE_MONTHLY_AI_LIMIT,
  estimateAIUsageUnits,
  nextMonthlyReset,
  remainingPercentage,
} from './aiUsage.ts';

test('long document context consumes more allowance than a short question', () => {
  const short = estimateAIUsageUnits({
    provider: 'cloudflare',
    model: FREE_AI_MODEL,
    inputCharacters: 1_000,
    outputCharacters: 800,
  });
  const long = estimateAIUsageUnits({
    provider: 'cloudflare',
    model: FREE_AI_MODEL,
    inputCharacters: 50_000,
    outputCharacters: 3_000,
  });
  assert.ok(long > short * 5);
});

test('image analysis includes an additional compute charge', () => {
  const textOnly = estimateAIUsageUnits({ provider: 'cloudflare', model: FREE_AI_MODEL, inputCharacters: 2_000, outputCharacters: 800 });
  const vision = estimateAIUsageUnits({ provider: 'cloudflare', model: FREE_AI_MODEL, inputCharacters: 2_000, outputCharacters: 800, hasImage: true });
  assert.ok(vision > textOnly);
});

test('local fallback does not consume hosted AI allowance', () => {
  assert.equal(estimateAIUsageUnits({ provider: 'local', model: 'page-text-fallback', inputCharacters: 50_000, outputCharacters: 3_000 }), 0);
});

test('remaining percentage is bounded and understandable', () => {
  assert.equal(remainingPercentage(FREE_MONTHLY_AI_LIMIT, FREE_MONTHLY_AI_LIMIT), 100);
  assert.equal(remainingPercentage(FREE_MONTHLY_AI_LIMIT, FREE_MONTHLY_AI_LIMIT / 2), 50);
  assert.equal(remainingPercentage(FREE_MONTHLY_AI_LIMIT, -10), 0);
});

test('monthly reset points to the next UTC month', () => {
  assert.equal(nextMonthlyReset(new Date('2026-08-29T12:00:00Z')), Date.UTC(2026, 8, 1));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminPromotion } from './accountPolicy.ts';

test('Only verified allowlisted identities are promoted; trusted manual roles are not implicitly revoked', () => {
  const allowlist = new Set(['owner@example.com']);
  assert.deepEqual(adminPromotion('OWNER@example.com', true, allowlist), { plan: 'pro', role: 'admin' });
  assert.deepEqual(adminPromotion('owner@example.com', false, allowlist), {});
  assert.deepEqual(adminPromotion('other@example.com', true, allowlist), {});
  assert.equal({ role: 'admin', ...adminPromotion('manual@example.com', true, allowlist) }.role, 'admin');
});

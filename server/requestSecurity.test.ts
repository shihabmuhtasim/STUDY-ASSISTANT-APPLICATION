import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSameOrigin, readJSON, validateStudyInput, publicProviderEndpoint, safeProviderError } from './requestSecurity.ts';
import { validConnection } from './connectionInput.ts';
import { secureResponse } from './securityHeaders.ts';
import { verifyFirebaseRequest } from './firebaseUser.ts';

const url = 'https://notemydocai.pages.dev/api/ai/chat';
const request = (body: unknown, headers = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('AI inputs reject malformed, oversized and mistyped data before using a provider', async () => {
  for (const body of [null, [], 'question']) await assert.rejects(() => readJSON(request(body)));
  for (const extra of [{ prompt: 42 }, { pageNumber: -1 }, { history: [{}] }, { history: 'text' }, { scope: 'all' }, { allowFallback: 'true' }, { pageText: {} }, { modelPreference: 'unapproved-model' }]) assert.throws(() => validateStudyInput({ prompt: 'Explain', pageNumber: 1, ...extra }));
  assert.doesNotThrow(() => validateStudyInput({ prompt: 'Explain', pageNumber: 1, history: [], pageText: 'Page' }));
  await assert.rejects(() => readJSON(request({ value: 'x'.repeat(100) }), 32), /too large/);
  await assert.rejects(() => readJSON(new Request(url, { method: 'POST', body: '{}' })), /JSON/);
});

test('Cross-origin state-changing requests are rejected; same-origin bearer clients remain valid', () => {
  assert.throws(() => assertSameOrigin(request({}, { origin: 'https://attacker.example' })), /NoteMyDoc/);
  assert.throws(() => assertSameOrigin(request({}, { 'sec-fetch-site': 'cross-site' })), /NoteMyDoc/);
  assert.doesNotThrow(() => assertSameOrigin(request({}, { origin: new URL(url).origin })));
  assert.doesNotThrow(() => assertSameOrigin(request({})));
});

test('Custom endpoints reject private addresses, embedded credentials and redirect-style parameters', () => {
  for (const endpoint of ['http://api.example.com', 'https://localhost/v1', 'https://10.0.0.1/v1', 'https://169.254.169.254', 'https://[::1]/v1', 'https://127.1', 'https://2130706433', 'https://0x7f000001', 'https://metadata.google.internal', 'https://service.local', 'https://key@api.example.com', 'https://api.example.com:8443', 'https://api.example.com?target=private']) assert.throws(() => publicProviderEndpoint(endpoint));
  assert.equal(publicProviderEndpoint('https://api.openai.com/v1/'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(publicProviderEndpoint('https://openrouter.ai/api/v1/chat/completions'), 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(validConnection({ id: 'test-key', name: 'Test', model: 'model', service: 'custom', provider: 'openai-compatible', apiKey: { secret: 'x' } }), false);
});

test('Provider errors redact credentials and API responses are never cached or framed', () => {
  assert.equal(safeProviderError('Rejected secret-value', 'secret-value'), 'Rejected [redacted]');
  assert.doesNotMatch(safeProviderError('Bearer abcdefghijklmno nvapi-abcdefghijklmnop'), /abcdefgh/);
  const response = secureResponse(new Request(url), Response.json({ ok: true }));
  assert.match(response.headers.get('cache-control')!, /no-store/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('permissions-policy')!, /microphone=\(self\)/);
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
});

test('Firebase verification rejects missing tokens and trusts verified email only from lookup', async () => {
  const original = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return Response.json({ users: [{ localId: 'owner-one', email: 'admin@example.com', emailVerified: false }] }); };
    assert.equal(await verifyFirebaseRequest(new Request(url)), null);
    assert.equal(await verifyFirebaseRequest(new Request(url, { headers: { authorization: 'Bearer not-a-token' } })), null);
    assert.equal(calls, 0);
    const user = await verifyFirebaseRequest(new Request(url, { headers: { authorization: 'Bearer test.token.signature' } }));
    assert.equal(user?.uid, 'owner-one'); assert.equal(user?.emailVerified, false);
    globalThis.fetch = async () => Response.json({ users: [{ localId: 'disabled', disabled: true, emailVerified: true }] });
    assert.equal(await verifyFirebaseRequest(new Request(url, { headers: { authorization: 'Bearer test.token.signature' } })), null);
  } finally { globalThis.fetch = original; }
});

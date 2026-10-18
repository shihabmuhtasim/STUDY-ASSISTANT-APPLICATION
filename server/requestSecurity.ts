export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    throw new InputError('Send this request from NoteMyDoc AI.', 403);
  }
}

export async function readJSON(request: Request, maxBytes = 16_000_000): Promise<Record<string, unknown>> {
  assertSameOrigin(request);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new InputError('Send a JSON request.', 415);
  if (Number(request.headers.get('content-length')) > maxBytes) throw new InputError('The request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('The request is empty.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new InputError('The request is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InputError('Invalid JSON request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Enter a valid request.');
  return body as Record<string, unknown>;
}

export function validateStudyInput(body: Record<string, unknown>, custom = false) {
  const maxPrompt = custom || body.purpose === 'voice-notes' ? 24_000 : 4_000;
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > maxPrompt || !Number.isInteger(body.pageNumber) || Number(body.pageNumber) < 1 || Number(body.pageNumber) > 1_000_000) throw new InputError('Enter a valid question and page number.');
  for (const [name, limit] of [['pageText', 12_000], ['documentText', 52_000], ['documentContext', 52_000], ['pageImage', 4_000_000]] as const) {
    if (body[name] !== undefined && (typeof body[name] !== 'string' || (body[name] as string).length > limit)) throw new InputError(`The ${name} is invalid or too large.`, 413);
  }
  for (const name of ['allowFallback', 'referencesEnabled', 'testMode']) if (body[name] !== undefined && typeof body[name] !== 'boolean') throw new InputError(`Invalid ${name}.`);
  if (body.scope !== undefined && body.scope !== 'page' && body.scope !== 'document') throw new InputError('Invalid study scope.');
  if (body.modelPreference !== undefined && (typeof body.modelPreference !== 'string' || !['auto', 'basic', 'gemini-flash', 'gemini-flash-lite', 'qwen', 'llama', 'gemma', 'glm', 'nemotron'].includes(body.modelPreference))) throw new InputError('Choose an available model.');
  if (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 3 || body.history.some(item => !item || typeof item.prompt !== 'string' || typeof item.response !== 'string' || item.prompt.length > 700 || item.response.length > 1_800))) throw new InputError('The conversation history is invalid or too large.');
}

export function inputErrorResponse(error: unknown) {
  return Response.json({ error: error instanceof InputError ? error.message : 'Invalid request.' }, { status: error instanceof InputError ? error.status : 400, headers: { 'cache-control': 'no-store' } });
}

export function publicProviderEndpoint(baseUrl: string) {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new InputError('Enter a public HTTPS API endpoint.'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // IP literals, private service names, credentials and redirects must never receive keys.
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443') || !host.includes('.') || /[:\[\]]/.test(host) || /^[\d.]+$/.test(host) || /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host) || host === 'metadata.google.internal') throw new InputError('Use a public HTTPS hostname without credentials, query parameters or a custom port.');
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  return url.toString();
}

export function safeProviderError(message: string, apiKey = '') {
  const redacted = apiKey ? message.split(apiKey).join('[redacted]') : message;
  return redacted.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]').replace(/(?:nvapi-|sk-)[a-zA-Z0-9_-]{12,}/g, '[redacted]').slice(0, 400);
}

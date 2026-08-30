import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const NVIDIA_CHAT_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MAX_REQUEST_BYTES = 5_500_000;

function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return origin === new URL(request.url).origin && fetchSite !== 'cross-site';
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'This request must come from Clarivo.' }, { status: 403 });

  const apiKey = request.headers.get('x-nvidia-api-key')?.trim();
  if (!apiKey || apiKey.length > 1_024) return NextResponse.json({ error: 'Enter a valid NVIDIA API key.' }, { status: 401 });

  let body: { model?: unknown; messages?: unknown; max_tokens?: unknown; temperature?: unknown };
  try {
    const payload = await request.text();
    if (payload.length > MAX_REQUEST_BYTES) return NextResponse.json({ error: 'The page context is too large for this model request.' }, { status: 413 });
    body = JSON.parse(payload) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid NVIDIA request.' }, { status: 400 });
  }

  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,159}$/.test(model) || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'Enter a valid NVIDIA model ID.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(NVIDIA_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: body.messages,
        max_tokens: typeof body.max_tokens === 'number' ? Math.min(Math.max(body.max_tokens, 1), 4_000) : 3_000,
        temperature: typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.2,
      }),
      signal: controller.signal,
    });
    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    return NextResponse.json({ error: timedOut ? 'NVIDIA took too long to respond.' : 'NVIDIA could not be reached by the Clarivo service.' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

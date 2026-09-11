import { NextResponse } from 'next/server';
import type { CustomAIConnection } from '../../../../src/types';
import { verifyFirebaseRequest } from '../../../../server/firebaseUser';
import { listConnections, removeConnection, saveConnection } from '../../../../server/userConnections';

export const dynamic = 'force-dynamic';

const services = new Set(['openai', 'openrouter', 'nvidia', 'groq', 'together', 'gemini', 'anthropic', 'custom']);
const providers = new Set(['openai-compatible', 'gemini', 'anthropic']);

function validConnection(value: unknown): value is CustomAIConnection {
  const item = value as Partial<CustomAIConnection>;
  return Boolean(item && typeof item.id === 'string' && /^[a-zA-Z0-9_-]{6,80}$/.test(item.id)
    && typeof item.name === 'string' && item.name.trim().length <= 80
    && typeof item.model === 'string' && item.model.trim().length <= 160
    && typeof item.service === 'string' && services.has(item.service)
    && typeof item.provider === 'string' && providers.has(item.provider)
    && (!item.apiKey || item.apiKey.length <= 4096)
    && (!item.baseUrl || (item.baseUrl.length <= 500 && /^https:\/\//i.test(item.baseUrl))));
}

export async function GET(request: Request) {
  const user = await verifyFirebaseRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in again to load AI connections.' }, { status: 401 });
  try {
    return NextResponse.json({ connections: await listConnections(user) }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Connection list failed', error);
    return NextResponse.json({ error: 'AI connections could not be loaded.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await verifyFirebaseRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in again to save this connection.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { connection?: unknown } | null;
  if (!validConnection(body?.connection)) return NextResponse.json({ error: 'Enter a valid AI connection.' }, { status: 400 });
  try {
    return NextResponse.json({ connection: await saveConnection(user, body.connection) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI connection could not be saved.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await verifyFirebaseRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in again to delete this connection.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id || !/^[a-zA-Z0-9_-]{6,80}$/.test(body.id)) return NextResponse.json({ error: 'Invalid connection.' }, { status: 400 });
  await removeConnection(user, body.id);
  return NextResponse.json({ ok: true });
}

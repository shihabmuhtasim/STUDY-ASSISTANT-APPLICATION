import { NextResponse } from 'next/server';
import type { CustomAIConnection } from '../../../../src/types';
import { verifyFirebaseRequest } from '../../../../server/firebaseUser';
import { listConnections, removeConnection, saveConnection } from '../../../../server/userConnections';
import { validConnection } from '../../../../server/connectionInput';
import { readJSON, inputErrorResponse } from '../../../../server/requestSecurity';

export const dynamic = 'force-dynamic';

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
  let body: { connection?: unknown };
  try { body = await readJSON(request, 16_000); } catch (error) { return inputErrorResponse(error); }
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
  let body: { id?: string };
  try { body = await readJSON(request, 16_000); } catch (error) { return inputErrorResponse(error); }
  if (!body?.id || !/^[a-zA-Z0-9_-]{6,80}$/.test(body.id)) return NextResponse.json({ error: 'Invalid connection.' }, { status: 400 });
  await removeConnection(user, body.id);
  return NextResponse.json({ ok: true });
}

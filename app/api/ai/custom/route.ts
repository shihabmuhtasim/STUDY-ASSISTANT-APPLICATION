import { NextResponse } from 'next/server';
import type { AIInteraction, CustomAIConnection } from '../../../../src/types';
import { verifyFirebaseRequest } from '../../../../server/firebaseUser';
import { connectionWithDecryptedKey } from '../../../../server/userConnections';
import { callCustomProvider } from '../../../../server/customProvider';

export const dynamic = 'force-dynamic';

interface RequestBody {
  connectionId?: string;
  transientConnection?: CustomAIConnection;
  prompt?: string;
  pageNumber?: number;
  pageText?: string;
  documentContext?: string;
  pageImage?: string;
  history?: AIInteraction[];
  testMode?: boolean;
}

export async function POST(request: Request) {
  const user = await verifyFirebaseRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in again to use your AI connection.' }, { status: 401 });
  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body?.prompt?.trim() || body.prompt.length > 4_000 || !Number.isInteger(body.pageNumber) || (body.pageNumber || 0) < 1) return NextResponse.json({ error: 'Enter a valid question.' }, { status: 400 });
  if (body.pageImage && body.pageImage.length > 4_000_000) return NextResponse.json({ error: 'The page image is too large.' }, { status: 413 });

  let connection: CustomAIConnection | null = null;
  if (body.connectionId) connection = await connectionWithDecryptedKey(user, body.connectionId);
  else if (body.transientConnection?.apiKey) connection = body.transientConnection;
  if (!connection) return NextResponse.json({ error: 'The selected AI connection was not found.' }, { status: 404 });

  try {
    const result = await callCustomProvider({
      connection,
      prompt: body.prompt.trim(),
      pageNumber: body.pageNumber!,
      pageText: body.pageText?.slice(0, 12_000) || '',
      documentContext: body.documentContext?.slice(0, 48_000) || '',
      pageImage: body.pageImage,
      history: body.history?.slice(-3) || [],
      testMode: body.testMode === true,
    });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The provider could not answer.';
    return NextResponse.json({ error: message.slice(0, 400) }, { status: 502 });
  }
}

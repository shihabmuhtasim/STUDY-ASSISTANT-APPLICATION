import { NextResponse } from 'next/server';
import { routeAIRequest, type AIRequest } from '../../../../server/aiRouter';

export const dynamic = 'force-dynamic';
const clients = new Map<string, { startedAt: number; count: number }>();

export async function POST(request: Request) {
  const clientId = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
  const now = Date.now();
  const current = clients.get(clientId);
  if (!current || now - current.startedAt > 10 * 60 * 1000) clients.set(clientId, { startedAt: now, count: 1 });
  else if (current.count >= 20) return NextResponse.json({ error: 'Too many requests from this connection. Try again in a few minutes.', code: 'RATE_LIMITED' }, { status: 429 });
  else current.count += 1;

  let body: AIRequest;
  try { body = await request.json() as AIRequest; }
  catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length > 4_000 || !Number.isInteger(body.pageNumber) || body.pageNumber < 1) return NextResponse.json({ error: 'Enter a valid question about the current page.' }, { status: 400 });
  if (body.pageImage && body.pageImage.length > 4_000_000) return NextResponse.json({ error: 'The page preview is too large. Turn off visual analysis and try again.' }, { status: 413 });

  try {
    const result = await routeAIRequest({ prompt, pageNumber: body.pageNumber, pageText: body.pageText?.slice(0, 18_000), pageImage: body.pageImage, history: body.history?.slice(-4) });
    return NextResponse.json({ response: result.text, provider: result.provider, model: result.model }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE';
    console.error('AI request failed', error);
    if (code === 'AI_NOT_CONFIGURED') return NextResponse.json({ error: 'The AI service has not been configured yet.', code }, { status: 503 });
    return NextResponse.json({ error: 'The free AI service is busy or its daily allocation has been used. Try again shortly.', code: 'AI_UNAVAILABLE' }, { status: 503 });
  }
}

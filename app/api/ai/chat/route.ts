import { NextResponse } from 'next/server';
import { routeAIRequest, type AIRequest } from '../../../../server/aiRouter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: AIRequest;
  try { body = await request.json() as AIRequest; }
  catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length > 4_000 || !Number.isInteger(body.pageNumber) || body.pageNumber < 1) return NextResponse.json({ error: 'Enter a valid question about the current page.' }, { status: 400 });
  if (body.pageImage && body.pageImage.length > 4_000_000) return NextResponse.json({ error: 'The page preview is too large. Turn off visual analysis and try again.' }, { status: 413 });

  try {
    const result = await routeAIRequest({ prompt, pageNumber: body.pageNumber, pageText: body.pageText?.slice(0, 12_000), pageImage: body.pageImage, history: body.history?.slice(-3), modelPreference: body.modelPreference, allowFallback: body.allowFallback });
    return NextResponse.json({ response: result.text, provider: result.provider, model: result.model, requestedModel: result.requestedModel, fallbackUsed: result.fallbackUsed }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE';
    console.error('AI request failed', error);
    return NextResponse.json({ error: 'The assistant could not process this page. Try the question again.', code }, { status: 503 });
  }
}

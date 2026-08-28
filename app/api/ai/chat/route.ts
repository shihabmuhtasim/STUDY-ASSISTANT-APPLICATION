import { NextResponse } from 'next/server';
import { routeAIRequest, type AIRequest } from '../../../../server/aiRouter';
import { consumeAIAllowance, recordAIUsage, releaseAIAllowance } from '../../../../server/accounts';
import { verifyFirebaseRequest } from '../../../../server/firebaseUser';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await verifyFirebaseRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in again to use the AI assistant.', code: 'AUTH_REQUIRED' }, { status: 401 });
  let body: AIRequest;
  try { body = await request.json() as AIRequest; }
  catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length > 4_000 || !Number.isInteger(body.pageNumber) || body.pageNumber < 1) return NextResponse.json({ error: 'Enter a valid question about the current page.' }, { status: 400 });
  if (body.pageImage && body.pageImage.length > 4_000_000) return NextResponse.json({ error: 'The page preview is too large. Turn off visual analysis and try again.' }, { status: 413 });
  if (body.documentText && body.documentText.length > 52_000) return NextResponse.json({ error: 'The document context is too large. Reopen the document and try again.' }, { status: 413 });

  const allowance = await consumeAIAllowance(user);
  if (!allowance.allowed) {
    return NextResponse.json({
      error: 'You have used this month\'s AI allowance. Upgrade to Pro for expanded access.',
      code: 'AI_LIMIT_REACHED',
      remaining: 0,
    }, { status: 429 });
  }

  const requestedPreference = body.modelPreference || 'auto';
  const hasProAccess = allowance.account.plan === 'pro' || allowance.account.role === 'admin';
  if (!hasProAccess && requestedPreference !== 'auto' && requestedPreference !== 'glm') {
    await releaseAIAllowance(user.uid);
    return NextResponse.json({
      error: 'This AI model is available with Pro. Study Basic remains available on your Free plan.',
      code: 'PLAN_REQUIRED',
      remaining: allowance.account.aiRemaining,
    }, { status: 403 });
  }

  try {
    const result = await routeAIRequest({
      prompt,
      pageNumber: body.pageNumber,
      pageText: body.pageText?.slice(0, 12_000),
      documentText: body.documentText?.slice(0, 48_000),
      pageImage: hasProAccess ? body.pageImage : undefined,
      history: body.history?.slice(-3),
      modelPreference: hasProAccess ? body.modelPreference : 'glm',
      allowFallback: hasProAccess ? body.allowFallback : false,
    });
    await recordAIUsage({
      userId: user.uid,
      provider: result.provider,
      model: result.model,
      requestType: body.pageImage && hasProAccess ? 'vision' : 'text',
      inputCharacters: prompt.length + (body.pageText?.length || 0) + (body.documentText?.length || 0),
      outputCharacters: result.text.length,
    }).catch((usageError) => console.error('Failed to record AI usage event', usageError));
    return NextResponse.json({ response: result.text, remaining: allowance.remaining, provider: result.provider, model: result.model, requestedModel: result.requestedModel, fallbackUsed: result.fallbackUsed }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    await releaseAIAllowance(user.uid).catch(() => undefined);
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE';
    console.error('AI request failed', error);
    return NextResponse.json({ error: 'The assistant could not process this page. Try the question again.', code }, { status: 503 });
  }
}

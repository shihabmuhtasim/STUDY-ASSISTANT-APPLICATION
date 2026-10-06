import { NextResponse } from 'next/server';
import { visualImages } from '../../../../server/visualInput';
import { routeAIRequest, type AIRequest } from '../../../../server/aiRouter';
import { getAccountSummary, recordAIRequestEvent, recordAIUsage, releaseAIAllowance, reserveAIAllowance, settleAIAllowance } from '../../../../server/accounts';
import { verifyFirebaseRequest } from '../../../../server/firebaseUser';
import { FREE_AI_MODEL, estimateAIUsageUnits, remainingPercentage } from '../../../../server/aiUsage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const user = await verifyFirebaseRequest(request);
  if (!user) return NextResponse.json({ error: 'Sign in again to use the AI assistant.', code: 'AUTH_REQUIRED' }, { status: 401 });
  let body: AIRequest & { purpose?: string };
  try { body = await request.json() as AIRequest; }
  catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const prompt = body.prompt?.trim();
  const isVoice = body.purpose === 'voice-notes';
  if (!prompt || prompt.length > (isVoice ? 24_000 : 4_000) || !Number.isInteger(body.pageNumber) || body.pageNumber < 1) return NextResponse.json({ error: 'Enter a valid question about the current page.' }, { status: 400 });
  if (body.pageImage && body.pageImage.length > 4_000_000) return NextResponse.json({ error: 'The page preview is too large. Turn off visual analysis and try again.' }, { status: 413 });
  if (body.documentText && body.documentText.length > 52_000) return NextResponse.json({ error: 'The document context is too large. Reopen the document and try again.' }, { status: 413 });

  const requestedPreference = body.modelPreference || 'auto';
  let imageCount = 0;
  try { imageCount = visualImages(body).length; } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const account = await getAccountSummary(user);
  const hasProAccess = account.plan === 'pro' || account.role === 'admin' || isVoice;
  if (imageCount && !hasProAccess) return NextResponse.json({ error: 'Image analysis and chat attachments require Pro.', code: 'PLAN_REQUIRED' }, { status: 403 });
  if (!hasProAccess && requestedPreference !== 'auto' && requestedPreference !== 'basic') {
    return NextResponse.json({
      error: 'This AI model is available with Pro. Study Basic remains available on your Free plan.',
      code: 'PLAN_REQUIRED',
      remaining: account.aiRemaining,
      remainingPercent: account.aiRemainingPercent,
    }, { status: 403 });
  }

  const inputCharacters = prompt.length
    + (body.pageText?.length || 0)
    + (body.documentText?.length || 0) + Math.max(0, imageCount - 1) * 4000
    + (body.history || []).slice(-3).reduce((total, item) => total + item.prompt.length + item.response.length, 0);
  const reservationModel = hasProAccess ? 'gemini-3.6-flash' : FREE_AI_MODEL;
  const reservedUnits = estimateAIUsageUnits({
    provider: hasProAccess ? 'gemini' : 'cloudflare',
    model: reservationModel,
    inputCharacters,
    outputCharacters: hasProAccess ? 12_000 : 2_800,
    hasImage: imageCount > 0,
  });
  const allowance = await reserveAIAllowance(user, reservedUnits);
  if (!allowance.allowed) {
    return NextResponse.json({
      error: 'Your AI usage is at 0% for this month. It resets automatically next month.',
      code: 'AI_LIMIT_REACHED',
      remaining: allowance.remaining,
      remainingPercent: remainingPercentage(allowance.account.aiLimit, allowance.remaining),
    }, { status: 429 });
  }

  try {
    const result = await routeAIRequest({
      prompt,
      pageNumber: body.pageNumber,
      pageText: body.pageText?.slice(0, 12_000),
      documentText: body.documentText?.slice(0, 22_000),
      pageImage: hasProAccess ? body.pageImage : undefined,
      attachmentImages: body.attachmentImages,
      history: body.history?.slice(-3),
      modelPreference: isVoice ? 'gemini-flash' : hasProAccess ? body.modelPreference : 'basic',
      allowFallback: hasProAccess ? body.allowFallback : false,
      scope: body.scope === 'document' ? 'document' : 'page',
      referencesEnabled: body.referencesEnabled === true,
    });
    await recordAIUsage({
      userId: user.uid,
      provider: result.provider,
      model: result.model,
      requestType: imageCount ? 'vision' : 'text',
      inputCharacters,
      outputCharacters: result.text.length,
    }).catch((usageError) => console.error('Failed to record AI usage event', usageError));
    const actualUnits = estimateAIUsageUnits({
      provider: result.provider,
      model: result.model,
      inputCharacters,
      outputCharacters: result.text.length,
      hasImage: imageCount > 0,
    });
    const used = await settleAIAllowance(user.uid, allowance.reservedUnits, actualUnits, account.aiLimit);
    const remaining = Math.max(0, account.aiLimit - used);
    await recordAIRequestEvent({
      userId: user.uid,
      provider: result.provider,
      model: result.model,
      status: result.provider === 'local' || result.fallbackUsed ? 'fallback' : 'success',
      latencyMs: Date.now() - startedAt,
      usageUnits: actualUnits,
    }).catch((eventError) => console.error('Failed to record AI request health', eventError));
    return NextResponse.json({
      response: result.text,
      remaining,
      remainingPercent: remainingPercentage(account.aiLimit, remaining),
      usageCharged: actualUnits,
      provider: result.provider,
      model: result.model,
      requestedModel: result.requestedModel,
      fallbackUsed: result.fallbackUsed,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    await releaseAIAllowance(user.uid, allowance.reservedUnits).catch(() => undefined);
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE';
    await recordAIRequestEvent({
      userId: user.uid,
      provider: 'hosted',
      model: String(requestedPreference),
      status: 'error',
      errorCode: code.slice(0, 120),
      latencyMs: Date.now() - startedAt,
      usageUnits: 0,
    }).catch((eventError) => console.error('Failed to record AI request error', eventError));
    console.error('AI request failed', error);
    return NextResponse.json({ error: code === 'GEMINI_401' || code === 'GEMINI_403' ? 'Gemini rejected the hosted API credential. The site administrator needs to check its key and permissions. Enable auto fallback to use another available model.' : code === 'VISION_MODEL_REQUIRED' ? 'The selected model cannot read images. Choose Gemini/Gemma or enable auto fallback.' : code === 'VISION_UNAVAILABLE' ? 'Image-capable AI is temporarily unavailable. Your images were not sent to a text-only model. Please retry shortly.' : 'The assistant could not process this page. Try the question again.', code }, { status: 503 });
  }
}

import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { getAccountSummary, recordAIUsage } from '../../../../server/accounts';
import { routeAIRequest, type AIRequest } from '../../../../server/aiRouter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to use the AI assistant.', code: 'AUTH_REQUIRED' }, { status: 401 });
  }

  let body: AIRequest;
  try {
    body = await request.json() as AIRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length > 4_000 || !Number.isInteger(body.pageNumber) || body.pageNumber < 1) {
    return NextResponse.json({ error: 'Enter a valid question about the current page.' }, { status: 400 });
  }
  if (body.pageImage && body.pageImage.length > 6_000_000) {
    return NextResponse.json({ error: 'The page preview is too large. Turn off visual analysis and try again.' }, { status: 413 });
  }

  try {
    const account = await getAccountSummary(user);
    if (account.aiRemaining <= 0) {
      return NextResponse.json({
        error: `You have used your ${account.aiLimit} included AI questions for this month.`,
        code: 'USAGE_LIMIT',
        account,
      }, { status: 429 });
    }

    const result = await routeAIRequest({
      prompt,
      pageNumber: body.pageNumber,
      pageText: body.pageText?.slice(0, 24_000),
      pageImage: body.pageImage,
      history: body.history?.slice(-4),
    });
    await recordAIUsage({
      userId: user.userId,
      provider: result.provider,
      model: result.model,
      requestType: body.pageImage ? 'vision' : 'text',
      inputCharacters: prompt.length + (body.pageText?.length || 0),
      outputCharacters: result.text.length,
    });

    return NextResponse.json({
      response: result.text,
      provider: result.provider,
      model: result.model,
      remaining: Math.max(0, account.aiRemaining - 1),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AI_UNAVAILABLE';
    if (code === 'AI_NOT_CONFIGURED') {
      return NextResponse.json({ error: 'The AI service has not been configured yet.', code }, { status: 503 });
    }
    console.error('AI request failed', error);
    return NextResponse.json({ error: 'The AI service is temporarily unavailable. Please try again.', code: 'AI_UNAVAILABLE' }, { status: 503 });
  }
}

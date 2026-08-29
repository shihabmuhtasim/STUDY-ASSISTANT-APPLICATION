import type { AIInteraction, AIModelPreference } from '../types';
import { firebaseAuth } from './auth';

export class AIRequestError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

export async function askAIAboutPage(input: {
  prompt: string;
  pageNumber: number;
  pageText: string;
  documentContext: string;
  pageImage?: string;
  history: AIInteraction[];
  modelPreference: AIModelPreference;
  allowFallback: boolean;
}): Promise<{ response: string; remaining?: number; remainingPercent?: number; usageCharged?: number; provider?: AIInteraction['provider']; model?: string; requestedModel?: AIModelPreference; fallbackUsed?: boolean }> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new AIRequestError('Sign in again to use the AI assistant.', 'AUTH_REQUIRED', 401);
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      pageNumber: input.pageNumber,
      pageText: input.pageText,
      documentText: input.documentContext,
      pageImage: input.pageImage,
      history: input.history.slice(-4).map((item) => ({ prompt: item.prompt, response: item.response })),
      modelPreference: input.modelPreference,
      allowFallback: input.allowFallback,
    }),
  });

  const data = await response.json() as {
    response?: string;
    error?: string;
    code?: string;
    remaining?: number;
    remainingPercent?: number;
    usageCharged?: number;
    provider?: AIInteraction['provider'];
    model?: string;
    requestedModel?: AIModelPreference;
    fallbackUsed?: boolean;
  };

  if (!response.ok || !data.response) {
    throw new AIRequestError(data.error || 'The AI assistant could not answer right now.', data.code, response.status);
  }
  return { response: data.response, remaining: data.remaining, remainingPercent: data.remainingPercent, usageCharged: data.usageCharged, provider: data.provider, model: data.model, requestedModel: data.requestedModel, fallbackUsed: data.fallbackUsed };
}

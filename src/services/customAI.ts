import type { AIInteraction, CustomAIConnection } from '../types';
import { firebaseAuth } from './auth';
import { AIRequestError } from './ai';

interface CustomAIInput {
  connection: CustomAIConnection;
  prompt: string;
  pageNumber: number;
  pageText: string;
  documentContext: string;
  scope?: 'page' | 'document';
  referencesEnabled?: boolean;
  pageImage?: string;
  history: AIInteraction[];
  testMode?: boolean;
  signal?: AbortSignal;
}

async function authenticatedRequest(path: string, init: RequestInit, timeoutMs = 75_000, externalSignal?: AbortSignal) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new AIRequestError('Sign in again to use your saved AI models.', 'CUSTOM_AUTH');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  let data: { error?: string; response?: string; provider?: 'custom'; model?: string };
  try {
    response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await user.getIdToken()}`,
        ...init.headers,
      },
    });
    data = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalSignal?.aborted) throw new AIRequestError('Generation stopped.', 'ABORTED', 499);
      throw new AIRequestError(`The provider did not respond within ${Math.round(timeoutMs / 1_000)} seconds.`, 'CUSTOM_TIMEOUT', 504);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) throw new AIRequestError(data.error || `Provider returned ${response.status}.`, `CUSTOM_${response.status}`, response.status);
  return data;
}

export async function askCustomAI(input: CustomAIInput) {
  const data = await authenticatedRequest('/api/ai/custom', {
    method: 'POST',
    body: JSON.stringify({
      ...(input.connection.isStored ? { connectionId: input.connection.id } : { transientConnection: input.connection }),
      prompt: input.prompt,
      pageNumber: input.pageNumber,
      pageText: input.pageText,
      documentContext: input.documentContext,
      scope: input.scope || 'page',
      referencesEnabled: input.referencesEnabled === true,
      pageImage: input.pageImage,
      history: input.history.slice(-2).map((item) => ({ ...item, prompt: item.prompt.slice(0, 700), response: item.response.slice(0, 1_800) })),
      testMode: input.testMode === true,
    }),
  }, input.connection.service === 'nvidia' ? 120_000 : input.testMode ? 70_000 : 75_000, input.signal);
  if (!data.response?.trim()) throw new AIRequestError('The provider returned an empty response.', 'CUSTOM_EMPTY');
  return { response: data.response, provider: 'custom' as const, model: data.model || input.connection.model };
}

export async function testCustomAIConnection(connection: CustomAIConnection) {
  return askCustomAI({
    connection,
    prompt: 'Reply with exactly: Connection successful.',
    pageNumber: 1,
    pageText: 'This is a connection test.',
    documentContext: '[Page 1] This is a connection test.',
    history: [],
    testMode: true,
  });
}

import type { AIInteraction, CustomAIConnection } from '../types';
import { firebaseAuth } from './auth';
import { AIRequestError } from './ai';

interface CustomAIInput {
  connection: CustomAIConnection;
  prompt: string;
  pageNumber: number;
  pageText: string;
  documentContext: string;
  pageImage?: string;
  history: AIInteraction[];
}

async function authenticatedRequest(path: string, init: RequestInit) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new AIRequestError('Sign in again to use your saved AI models.', 'CUSTOM_AUTH');
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await user.getIdToken()}`,
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({})) as { error?: string; response?: string; provider?: 'custom'; model?: string };
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
      pageImage: input.pageImage,
      history: input.history,
    }),
  });
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
  });
}

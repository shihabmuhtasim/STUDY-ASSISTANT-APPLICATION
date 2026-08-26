import type { AIInteraction } from '../types';

export class AIRequestError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

export async function askAIAboutPage(input: {
  prompt: string;
  pageNumber: number;
  pageText: string;
  pageImage?: string;
  history: AIInteraction[];
}): Promise<{ response: string; remaining?: number }> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: input.prompt,
      pageNumber: input.pageNumber,
      pageText: input.pageText,
      pageImage: input.pageImage,
      history: input.history.slice(-4).map((item) => ({ prompt: item.prompt, response: item.response })),
    }),
  });

  const data = await response.json() as {
    response?: string;
    error?: string;
    code?: string;
    remaining?: number;
  };

  if (!response.ok || !data.response) {
    throw new AIRequestError(data.error || 'The AI assistant could not answer right now.', data.code, response.status);
  }
  return { response: data.response, remaining: data.remaining };
}

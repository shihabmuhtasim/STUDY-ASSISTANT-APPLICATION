import { env } from 'cloudflare:workers';

export type AIHistoryItem = { prompt: string; response: string };
export type AIRequest = {
  prompt: string;
  pageNumber: number;
  pageText?: string;
  pageImage?: string;
  history?: AIHistoryItem[];
};

type AIResult = { text: string; provider: 'gemini'; model: string };

const SYSTEM_PROMPT = `You are a careful study assistant. Answer using only the supplied PDF page context when possible. If the context does not contain the answer, say so clearly. Use concise markdown with short sections and bullets. Cite the supplied PDF page number when referring to evidence.`;

export async function routeAIRequest(request: AIRequest): Promise<AIResult> {
  if (!env.GEMINI_API_KEY) throw new Error('AI_NOT_CONFIGURED');
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const parts: Array<Record<string, unknown>> = [{ text: buildContext(request) }];

  if (request.pageImage) {
    const [metadata, data] = request.pageImage.split(',');
    const mimeType = metadata?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    parts.unshift({ inlineData: { mimeType, data: data || request.pageImage } });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 1200, temperature: 0.25 },
      }),
    },
  );
  if (!response.ok) throw new Error(`AI_PROVIDER_ERROR_${response.status}`);
  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('AI_EMPTY_RESPONSE');
  return { text, provider: 'gemini', model };
}

function buildContext(request: AIRequest) {
  const history = (request.history || []).slice(-4)
    .map((item) => `Student: ${item.prompt}\nAssistant: ${item.response}`)
    .join('\n\n');
  const pageText = request.pageText?.trim()
    ? request.pageText.slice(0, 24_000)
    : '[No selectable text was extracted from this page.]';
  return `${SYSTEM_PROMPT}\n\nPDF page: ${request.pageNumber}\n\nExtracted page text:\n${pageText}${history ? `\n\nRecent conversation:\n${history}` : ''}\n\nStudent question:\n${request.prompt}`;
}

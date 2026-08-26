import { env } from 'cloudflare:workers';

export type AIHistoryItem = { prompt: string; response: string };
export type AIRequest = { prompt: string; pageNumber: number; pageText?: string; pageImage?: string; history?: AIHistoryItem[] };
type AIResult = { text: string; provider: 'cloudflare' | 'gemini'; model: string };

const SYSTEM_PROMPT = `You are a careful study assistant. Answer using the supplied PDF page context when possible. If the context does not contain the answer, say so clearly. Use concise markdown with short sections and bullets. Cite the supplied PDF page number when referring to evidence.`;

export async function routeAIRequest(request: AIRequest): Promise<AIResult> {
  const runners: Array<() => Promise<AIResult>> = [];
  if (env.AI) runners.push(() => runCloudflare(request));
  if (!env.AI && env.CLOUDFLARE_AI_ENDPOINT) runners.push(() => runRemoteCloudflare(request));
  if (env.GEMINI_API_KEY) runners.push(() => runGemini(request));
  if (runners.length === 0) throw new Error('AI_NOT_CONFIGURED');

  let lastError: unknown;
  for (const run of runners) {
    try { return await run(); }
    catch (error) { lastError = error; console.error('AI provider failed; trying fallback', error); }
  }
  throw lastError || new Error('AI_UNAVAILABLE');
}

async function runRemoteCloudflare(request: AIRequest): Promise<AIResult> {
  const response = await fetch(env.CLOUDFLARE_AI_ENDPOINT!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = await response.json() as { response?: string; error?: string; model?: string };
  if (!response.ok || !data.response) throw new Error(data.error || `CLOUDFLARE_${response.status}`);
  return {
    text: data.response,
    provider: 'cloudflare',
    model: data.model || '@cf/google/gemma-4-26b-a4b-it',
  };
}

async function runCloudflare(request: AIRequest): Promise<AIResult> {
  const model = env.CLOUDFLARE_AI_MODEL || '@cf/google/gemma-4-26b-a4b-it';
  const text = buildContext(request);
  const userContent = request.pageImage
    ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: request.pageImage } }]
    : text;
  const input = { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }], max_tokens: 1200, temperature: 0.25 };

  let output: unknown;
  try {
    output = await env.AI!.run(model as Parameters<Ai['run']>[0], input as never);
  } catch (error) {
    if (!request.pageImage) throw error;
    output = await env.AI!.run(model as Parameters<Ai['run']>[0], { ...input, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }] } as never);
  }
  const response = readModelText(output);
  if (!response) throw new Error('AI_EMPTY_RESPONSE');
  return { text: response, provider: 'cloudflare', model };
}

async function runGemini(request: AIRequest): Promise<AIResult> {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const parts: Array<Record<string, unknown>> = [{ text: buildContext(request) }];
  if (request.pageImage) {
    const [metadata, data] = request.pageImage.split(',');
    const mimeType = metadata?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    parts.unshift({ inlineData: { mimeType, data: data || request.pageImage } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY!)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 1200, temperature: 0.25 } }),
  });
  if (!response.ok) throw new Error(`GEMINI_${response.status}`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('AI_EMPTY_RESPONSE');
  return { text, provider: 'gemini', model };
}

function readModelText(output: unknown) {
  if (!output || typeof output !== 'object') return '';
  const result = output as { response?: string; choices?: Array<{ message?: { content?: string } }> };
  return result.response?.trim() || result.choices?.[0]?.message?.content?.trim() || '';
}

function buildContext(request: AIRequest) {
  const history = (request.history || []).slice(-4).map((item) => `Student: ${item.prompt}\nAssistant: ${item.response}`).join('\n\n');
  const pageText = request.pageText?.trim() ? request.pageText.slice(0, 18_000) : '[No selectable text was extracted from this page. Use the page image if supplied.]';
  return `PDF page: ${request.pageNumber}\n\nExtracted page text:\n${pageText}${history ? `\n\nRecent conversation:\n${history}` : ''}\n\nStudent question:\n${request.prompt}`;
}

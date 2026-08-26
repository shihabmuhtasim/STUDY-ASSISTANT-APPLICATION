import { env } from 'cloudflare:workers';

export type AIHistoryItem = { prompt: string; response: string };
export type AIRequest = { prompt: string; pageNumber: number; pageText?: string; pageImage?: string; history?: AIHistoryItem[] };
type AIResult = { text: string; provider: 'cloudflare' | 'gemini' | 'local'; model: string };

const SYSTEM_PROMPT = `You are a careful study assistant. Answer using the supplied PDF page context. If the context does not contain the answer, say so clearly. Explain concepts in plain language, use concise markdown with short sections and bullets, and cite the supplied PDF page number when referring to evidence.`;
const TEXT_MODELS = ['@cf/meta/llama-3.2-3b-instruct', '@cf/meta/llama-3.1-8b-instruct-fast'];
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

export async function routeAIRequest(request: AIRequest): Promise<AIResult> {
  const runners: Array<() => Promise<AIResult>> = [];
  if (env.AI) runners.push(() => runCloudflare(request));
  if (!env.AI && env.CLOUDFLARE_AI_ENDPOINT) runners.push(() => runRemoteCloudflare(request));
  if (env.GEMINI_API_KEY) runners.push(() => runGemini(request));

  for (const run of runners) {
    try {
      return await run();
    } catch (error) {
      console.error('AI provider failed; trying fallback', error);
    }
  }

  return runLocalPageAnswer(request);
}

async function runRemoteCloudflare(request: AIRequest): Promise<AIResult> {
  const response = await fetchWithTimeout(env.CLOUDFLARE_AI_ENDPOINT!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = await response.json() as { response?: string; error?: string; model?: string; provider?: AIResult['provider'] };
  if (!response.ok || !data.response) throw new Error(data.error || `CLOUDFLARE_${response.status}`);
  return { text: data.response, provider: data.provider || 'cloudflare', model: data.model || TEXT_MODELS[0] };
}

async function runCloudflare(request: AIRequest): Promise<AIResult> {
  const configuredModels = modelList(env.CLOUDFLARE_AI_MODEL, TEXT_MODELS);
  const models = request.pageImage ? [VISION_MODEL, ...configuredModels] : configuredModels;
  let lastError: unknown;

  for (const model of [...new Set(models)]) {
    try {
      const text = buildContext(request);
      const userContent = request.pageImage && model === VISION_MODEL
        ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: request.pageImage } }]
        : text;
      const output = await env.AI!.run(model as Parameters<Ai['run']>[0], {
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
        max_tokens: 700,
        temperature: 0.2,
      } as never);
      const response = readModelText(output);
      if (!response) throw new Error('AI_EMPTY_RESPONSE');
      return { text: response, provider: 'cloudflare', model };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('CLOUDFLARE_UNAVAILABLE');
}

async function runGemini(request: AIRequest): Promise<AIResult> {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const parts: Array<Record<string, unknown>> = [{ text: buildContext(request) }];
  if (request.pageImage) {
    const [metadata, data] = request.pageImage.split(',');
    const mimeType = metadata?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    parts.unshift({ inlineData: { mimeType, data: data || request.pageImage } });
  }
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY!)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 700, temperature: 0.2 } }),
  });
  if (!response.ok) throw new Error(`GEMINI_${response.status}`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('AI_EMPTY_RESPONSE');
  return { text, provider: 'gemini', model };
}

function runLocalPageAnswer(request: AIRequest): AIResult {
  const source = request.pageText?.replace(/\s+/g, ' ').trim() || '';
  if (!source) {
    return {
      text: `### Page ${request.pageNumber}\n\nI could not extract readable text from this page. Turn on **Include page image** and ask again so the vision model can inspect it.`,
      provider: 'local',
      model: 'page-text-fallback',
    };
  }

  const sentences = splitSentences(source).slice(0, 160);
  const queryWords = words(request.prompt).filter((word) => !STOP_WORDS.has(word));
  const frequencies = new Map<string, number>();
  for (const word of words(source)) {
    if (!STOP_WORDS.has(word)) frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }

  const ranked = sentences.map((sentence, index) => {
    const sentenceWords = new Set(words(sentence));
    const overlap = queryWords.filter((word) => sentenceWords.has(word)).length;
    const relevance = [...sentenceWords].reduce((score, word) => score + Math.min(frequencies.get(word) || 0, 8), 0) / Math.max(sentenceWords.size, 1);
    const position = index < 4 ? 2 : index < 12 ? 1 : 0;
    const dataBonus = /\d/.test(sentence) ? 0.75 : 0;
    return { sentence, index, overlap, score: overlap * 8 + relevance + position + dataBonus };
  }).sort((a, b) => b.score - a.score);

  const selected = ranked.slice(0, 6).sort((a, b) => a.index - b.index);
  const hasDirectMatch = queryWords.length === 0 || (ranked[0]?.overlap || 0) > 0;
  const generic = /summari[sz]e|explain|key ideas?|main points?|what (?:is|does) this page/i.test(request.prompt);
  const heading = generic ? `Page ${request.pageNumber} explained` : `Answer from page ${request.pageNumber}`;
  const lead = hasDirectMatch
    ? 'The most relevant information on this page is:'
    : 'I could not find a direct statement matching every part of the question. These are the closest relevant details:';
  const bullets = selected.length
    ? selected.map(({ sentence }) => `- ${sentence}`).join('\n')
    : `- ${source.slice(0, 900)}`;

  return {
    text: `### ${heading}\n\n${lead}\n\n${bullets}\n\n*Answer generated directly from the extracted text on page ${request.pageNumber}.*`,
    provider: 'local',
    model: 'page-text-fallback',
  };
}

function readModelText(output: unknown) {
  if (!output || typeof output !== 'object') return '';
  const result = output as { response?: string; choices?: Array<{ message?: { content?: string } }> };
  return result.response?.trim() || result.choices?.[0]?.message?.content?.trim() || '';
}

function buildContext(request: AIRequest) {
  const history = (request.history || []).slice(-3).map((item) => `Student: ${item.prompt}\nAssistant: ${item.response}`).join('\n\n');
  const pageText = request.pageText?.trim() ? request.pageText.slice(0, 12_000) : '[No selectable text was extracted from this page. Use the page image if supplied.]';
  return `PDF page: ${request.pageNumber}\n\nExtracted page text:\n${pageText}${history ? `\n\nRecent conversation:\n${history}` : ''}\n\nStudent question:\n${request.prompt}`;
}

function modelList(value: string | undefined, defaults: string[]) {
  const models = value?.split(',').map((model) => model.trim()).filter(Boolean);
  return models?.length ? models : defaults;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\s*[\r\n]+\s*/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24 && sentence.length <= 500);
}

function words(text: string) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((word) => word.length > 2);
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were', 'has', 'have', 'had', 'not', 'but', 'you', 'your',
  'about', 'into', 'than', 'then', 'they', 'their', 'there', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'how',
  'page', 'pdf', 'please', 'explain', 'summarize', 'summary', 'question', 'answer', 'can', 'could', 'would', 'should', 'will',
]);

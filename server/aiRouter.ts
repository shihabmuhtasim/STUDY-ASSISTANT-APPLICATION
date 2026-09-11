import { env } from 'cloudflare:workers';
import { FREE_AI_MODEL } from './aiUsage';
import { getAIControlState } from './modelControls';

export type AIHistoryItem = { prompt: string; response: string };
export type AIModelPreference = 'auto' | 'basic' | 'gemini-flash' | 'gemini-flash-lite' | 'qwen' | 'llama' | 'gemma' | 'glm' | 'nemotron';
export type AIRequest = { prompt: string; pageNumber: number; pageText?: string; documentText?: string; pageImage?: string; history?: AIHistoryItem[]; modelPreference?: AIModelPreference; allowFallback?: boolean; scope?: 'page' | 'document'; referencesEnabled?: boolean };
type AIResult = { text: string; provider: 'cloudflare' | 'gemini' | 'local'; model: string; requestedModel?: AIModelPreference; fallbackUsed?: boolean };

const SYSTEM_PROMPT = `You are a careful, capable study assistant. Use supplied document evidence first, but use your general trained knowledge when the document does not contain the answer. Briefly say when information is not stated in the document, relate it to the document only when genuinely useful, and then answer directly. Never refuse only because the answer is absent from the document. Follow the study scope and reference-mode instructions. Cite only claims supported by supplied evidence and never cite general knowledge. Preserve names, numbers, formulas, and qualifications. Explain in plain language with short headings and bullets. Use readable Markdown, but never show raw LaTeX dollar delimiters around variables. Match the student's language.`;
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const TEXT_MODELS = [
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/nvidia/nemotron-3-120b-a12b',
];
const VISION_MODELS = [
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/meta/llama-3.2-11b-vision-instruct',
];
const modelCooldowns = new Map<string, number>();
const CAPACITY_COOLDOWN_MS = 90_000;
const BROAD_PROMPT = /summari[sz]e|overview|study guide|main (?:topics|ideas|points)|key (?:topics|ideas|points)|entire document|whole document|all pages/i;
const MODEL_TARGETS: Record<Exclude<AIModelPreference, 'auto'>, { provider: 'gemini' | 'cloudflare'; model: string }> = {
  basic: { provider: 'cloudflare', model: FREE_AI_MODEL },
  'gemini-flash': { provider: 'gemini', model: GEMINI_MODELS[0] },
  'gemini-flash-lite': { provider: 'gemini', model: GEMINI_MODELS[1] },
  qwen: { provider: 'cloudflare', model: TEXT_MODELS[0] },
  glm: { provider: 'cloudflare', model: TEXT_MODELS[1] },
  gemma: { provider: 'cloudflare', model: TEXT_MODELS[2] },
  llama: { provider: 'cloudflare', model: TEXT_MODELS[3] },
  nemotron: { provider: 'cloudflare', model: TEXT_MODELS[5] },
};

export async function routeAIRequest(request: AIRequest): Promise<AIResult> {
  const controls = await getAIControlState();
  if (controls.paused) return { ...runLocalPageAnswer(request), requestedModel: normalizePreference(request.modelPreference), fallbackUsed: true };
  const preference = normalizePreference(request.modelPreference);
  const preferredTarget = preference === 'auto' ? null : MODEL_TARGETS[preference];
  const runners: Array<() => Promise<AIResult>> = [];

  if (preferredTarget?.provider === 'gemini' && env.GEMINI_API_KEY && !controls.disabledModels.has(preferredTarget.model)) runners.push(() => runGemini(request, [preferredTarget.model], controls.disabledModels));
  if (preferredTarget?.provider === 'cloudflare' && env.AI && !controls.disabledModels.has(preferredTarget.model)) runners.push(() => runCloudflare(request, [preferredTarget.model], controls.disabledModels));
  if (preferredTarget?.provider === 'cloudflare' && !env.AI && env.CLOUDFLARE_AI_ENDPOINT) runners.push(() => runRemoteCloudflare(request));

  if (preference === 'auto' || request.allowFallback !== false) {
    const remainingGemini = GEMINI_MODELS.filter((model) => model !== preferredTarget?.model);
    const remainingCloudflare = TEXT_MODELS.filter((model) => model !== preferredTarget?.model);
    if (env.GEMINI_API_KEY && remainingGemini.length) runners.push(() => runGemini(request, remainingGemini, controls.disabledModels));
    if (env.AI) runners.push(() => runCloudflare(request, remainingCloudflare, controls.disabledModels));
    if (!env.AI && env.CLOUDFLARE_AI_ENDPOINT) runners.push(() => runRemoteCloudflare(request));
  }

  for (const run of runners) {
    try {
      const result = await run();
      return {
        ...result,
        requestedModel: preference,
        fallbackUsed: Boolean(preferredTarget && result.model !== preferredTarget.model),
      };
    } catch (error) {
      console.error('AI provider failed; trying fallback', error);
    }
  }

  return { ...runLocalPageAnswer(request), requestedModel: preference, fallbackUsed: preference !== 'auto' };
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

async function runCloudflare(request: AIRequest, requestedModels?: string[], disabledModels = new Set<string>()): Promise<AIResult> {
  const configuredModels = requestedModels?.length ? requestedModels : modelList(env.CLOUDFLARE_AI_MODEL, TEXT_MODELS);
  const models = requestedModels?.length ? configuredModels : request.pageImage ? [...VISION_MODELS, ...configuredModels] : configuredModels;
  let lastError: unknown;

  for (const model of [...new Set(models)].filter((candidate) => !disabledModels.has(candidate))) {
    const cooldownKey = `cloudflare:${model}`;
    if (isCoolingDown(cooldownKey)) continue;
    try {
      const text = buildContext(request);
      const userContent = request.pageImage && VISION_MODELS.includes(model)
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
      applyCapacityCooldown(cooldownKey, error);
    }
  }

  throw lastError || new Error('CLOUDFLARE_UNAVAILABLE');
}

async function runGemini(request: AIRequest, requestedModels?: string[], disabledModels = new Set<string>()): Promise<AIResult> {
  const configured = env.GEMINI_MODELS || env.GEMINI_MODEL;
  const models = requestedModels?.length ? requestedModels : [...new Set([...modelList(configured, []), ...GEMINI_MODELS])];
  const providerDeadline = Date.now() + 10_000;
  let lastError: unknown;

  for (const model of models.filter((candidate) => !disabledModels.has(candidate))) {
    const cooldownKey = `gemini:${model}`;
    if (isCoolingDown(cooldownKey)) continue;
    try {
      const parts: Array<Record<string, unknown>> = [{ text: `${SYSTEM_PROMPT}\n\n${buildContext(request)}` }];
      if (request.pageImage) {
        const [metadata, data] = request.pageImage.split(',');
        const mimeType = metadata?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
        parts.unshift({ inlineData: { mimeType, data: data || request.pageImage } });
      }
      const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            maxOutputTokens: BROAD_PROMPT.test(request.prompt) ? 3_000 : 1_400,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      }, Math.max(2_500, Math.min(6_500, providerDeadline - Date.now())));
      if (!response.ok) throw new Error(`GEMINI_${response.status}`);
      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
      if (!text) throw new Error('AI_EMPTY_RESPONSE');
      if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('GEMINI_TRUNCATED_RESPONSE');
      return { text, provider: 'gemini', model };
    } catch (error) {
      lastError = error;
      applyCapacityCooldown(cooldownKey, error);
    }
  }

  throw lastError || new Error('GEMINI_UNAVAILABLE');
}

function runLocalPageAnswer(request: AIRequest): AIResult {
  const source = (request.scope === 'document' ? request.documentText : request.pageText)?.replace(/\s+/g, ' ').trim() || '';
  if (!source) {
    return {
      text: request.scope === 'document'
        ? '### Whole document\n\nI could not extract readable text from this document. OCR may still be processing scanned pages.'
        : `### Page ${request.pageNumber}\n\nI could not extract readable text from this page. Turn on **Include page image** and ask again so the vision model can inspect it.`,
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
  const heading = request.scope === 'document' ? 'Whole document overview' : generic ? `Page ${request.pageNumber} explained` : `Answer from page ${request.pageNumber}`;
  const lead = hasDirectMatch
    ? 'The most relevant information on this page is:'
    : 'I could not find a direct statement matching every part of the question. These are the closest relevant details:';
  const bullets = selected.length
    ? selected.map(({ sentence }) => `- ${sentence}`).join('\n')
    : `- ${source.slice(0, 900)}`;

  return {
    text: `### ${heading}\n\n${lead}\n\n${bullets}\n\n*Answer generated directly from the extracted ${request.scope === 'document' ? 'document text' : `text on page ${request.pageNumber}`}.*`,
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
  const history = (request.history || []).slice(-2).map((item) => `Student: ${item.prompt.slice(0, 700)}\nAssistant: ${item.response.slice(0, 1_800)}`).join('\n\n');
  const pageText = request.pageText?.trim() ? request.pageText.slice(0, 12_000) : '[No selectable text was extracted from this page. Use the page image if supplied.]';
  const documentText = request.documentText?.trim() ? request.documentText.slice(0, 22_000) : '[Whole-document text is unavailable.]';
  const focus = request.scope === 'document'
    ? 'Study scope: WHOLE DOCUMENT. Synthesize across all supplied pages, cite relevant page numbers, and do not treat the current page as the primary focus.'
    : `Study scope: PAGE ${request.pageNumber}. Focus on this page first, using the wider document for context or cross-page questions.`;
  const citationInstruction = request.referencesEnabled
    ? 'Reference mode: ON. The supplied evidence is labeled Source 1, Source 2, and so on. Cite factual claims with the matching bracketed source number, for example [1]. Use only supplied source numbers and do not invent citations.'
    : 'Reference mode: OFF. Answer without bracketed source markers.';
  return `${focus}\n${citationInstruction}\n\nCurrent document page: ${request.pageNumber}\n\nCurrent page text:\n${pageText}\n\nRetrieved document evidence:\n${documentText}${history ? `\n\nRecent ${request.scope === 'document' ? 'whole-document' : `page ${request.pageNumber}`} conversation:\n${history}` : ''}\n\nStudent question:\n${request.prompt}`;
}

function modelList(value: string | undefined, defaults: string[]) {
  const models = value?.split(',').map((model) => model.trim()).filter(Boolean);
  return models?.length ? models : defaults;
}

function normalizePreference(value: AIModelPreference | undefined): AIModelPreference {
  return value && (value === 'auto' || value in MODEL_TARGETS) ? value : 'auto';
}

function isCoolingDown(key: string) {
  const until = modelCooldowns.get(key) || 0;
  if (until <= Date.now()) {
    modelCooldowns.delete(key);
    return false;
  }
  return true;
}

function applyCapacityCooldown(key: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|quota|capacity|resource[_ ]?exhausted|daily allocation|3036/i.test(message)) {
    modelCooldowns.set(key, Date.now() + CAPACITY_COOLDOWN_MS);
  }
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

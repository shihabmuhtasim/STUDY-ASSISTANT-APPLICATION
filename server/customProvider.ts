import type { AIInteraction, CustomAIConnection } from '../src/types';

const SYSTEM_PROMPT = `You are a careful, capable study assistant working from a supplied document. Focus first on the current page and explain it in the context of the whole document. Use other pages when the question requires background, comparison, or information not repeated on the current page. If the document does not contain the answer, say so clearly. Preserve important names, numbers, formulas, and qualifications. Explain concepts in plain language, organize longer answers with short headings and bullets, and cite page numbers when referring to evidence. Match the student's requested language.`;

export interface CustomProviderInput {
  connection: CustomAIConnection;
  prompt: string;
  pageNumber: number;
  pageText: string;
  documentContext: string;
  pageImage?: string;
  history: AIInteraction[];
  testMode?: boolean;
}

function buildContext(input: CustomProviderInput) {
  const history = input.history.slice(-3).map((item) => `Student: ${item.prompt}\nAssistant: ${item.response}`).join('\n\n');
  const page = input.pageText.trim() ? input.pageText.slice(0, 12_000) : '[No selectable text was extracted from this page. Use the page image if supplied.]';
  const document = input.documentContext.trim() ? input.documentContext.slice(0, 48_000) : '[Whole-document text is unavailable.]';
  return `Current document page: ${input.pageNumber}\n\nCurrent page text (primary focus):\n${page}\n\nWhole document context (consult when useful):\n${document}${history ? `\n\nRecent conversation on page ${input.pageNumber}:\n${history}` : ''}\n\nStudent question:\n${input.prompt}`;
}

async function providerFetch(url: string, init: RequestInit, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`The provider did not respond within ${Math.round(timeoutMs / 1_000)} seconds.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function errorMessage(response: Response) {
  try {
    const data = await response.json() as { error?: string | { message?: string }; message?: string; detail?: string };
    return (typeof data.error === 'string' ? data.error : data.error?.message || data.message || data.detail || `Provider returned ${response.status}.`).slice(0, 400);
  } catch {
    return `Provider returned ${response.status}.`;
  }
}

function safeEndpoint(baseUrl: string) {
  const url = new URL(baseUrl);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) throw new Error('Enter a public HTTPS API endpoint.');
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

async function openAICompatible(input: CustomProviderInput, promptContext: string) {
  const isNvidia = input.connection.service === 'nvidia';
  const isNvidiaDeepSeek = isNvidia && /deepseek/i.test(input.connection.model);
  const canUseImage = input.connection.service !== 'nvidia' || /(vision|multimodal|omni|muse-glimmer|\bvl\b)/i.test(input.connection.model);
  const userContent: string | Array<Record<string, unknown>> = input.pageImage && canUseImage
    ? [{ type: 'text', text: promptContext }, { type: 'image_url', image_url: { url: input.pageImage } }]
    : promptContext;
  const response = await providerFetch(safeEndpoint(input.connection.baseUrl || ''), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${input.connection.apiKey}`,
      ...(input.connection.service === 'openrouter' ? { 'HTTP-Referer': 'https://ai-pdf-study-assistant.pages.dev', 'X-Title': 'Study Assistant' } : {}),
    },
    body: JSON.stringify({
      model: input.connection.model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      max_tokens: input.testMode ? 96 : 3_000,
      temperature: isNvidiaDeepSeek ? 1 : 0.2,
      ...(isNvidiaDeepSeek ? { top_p: 0.95, chat_template_kwargs: { thinking: false } } : {}),
      stream: false,
    }),
  }, 60_000);
  if (response.status === 202) throw new Error('The provider queued the request instead of answering. Try the test again shortly.');
  if (!response.ok) throw new Error(await errorMessage(response));
  const data = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }>; reasoning?: string; reasoning_content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  const reasoning = data.choices?.[0]?.message?.reasoning || data.choices?.[0]?.message?.reasoning_content;
  const text = (typeof content === 'string' ? content : content?.map((part) => part.text || '').join('')) || reasoning;
  if (!text?.trim()) throw new Error('The provider returned an empty response.');
  return text.trim();
}

async function gemini(input: CustomProviderInput, promptContext: string) {
  const parts: Array<Record<string, unknown>> = [{ text: `${SYSTEM_PROMPT}\n\n${promptContext}` }];
  if (input.pageImage) {
    const [metadata, data] = input.pageImage.split(',');
    parts.unshift({ inlineData: { mimeType: metadata?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg', data: data || input.pageImage } });
  }
  const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.connection.model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': input.connection.apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 3_000 } }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

async function anthropic(input: CustomProviderInput, promptContext: string) {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: promptContext }];
  if (input.pageImage) {
    const [metadata, data] = input.pageImage.split(',');
    content.unshift({ type: 'image', source: { type: 'base64', media_type: metadata?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg', data: data || input.pageImage } });
  }
  const response = await providerFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': input.connection.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: input.connection.model, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }], max_tokens: 3_000, temperature: 0.2 }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content?.filter((part) => part.type === 'text').map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('Claude returned an empty response.');
  return text;
}

export async function callCustomProvider(input: CustomProviderInput) {
  if (!input.connection.apiKey) throw new Error('This connection has no API key.');
  const promptContext = buildContext(input);
  const response = input.connection.provider === 'gemini'
    ? await gemini(input, promptContext)
    : input.connection.provider === 'anthropic'
      ? await anthropic(input, promptContext)
      : await openAICompatible(input, promptContext);
  return { response, provider: 'custom' as const, model: input.connection.model };
}

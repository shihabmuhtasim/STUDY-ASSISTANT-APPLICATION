import type { AIInteraction, CustomAIConnection } from '../types';
import { AIRequestError } from './ai';

const SYSTEM_PROMPT = `You are a careful, capable study assistant working from a supplied document. Focus first on the current page and explain it in the context of the whole document. Use other pages when the question requires background, comparison, or information not repeated on the current page. If the document does not contain the answer, say so clearly. Preserve important names, numbers, formulas, and qualifications. Explain concepts in plain language, organize longer answers with short headings and bullets, and cite page numbers when referring to evidence. Match the student's requested language.`;

interface CustomAIInput {
  connection: CustomAIConnection;
  prompt: string;
  pageNumber: number;
  pageText: string;
  documentContext: string;
  pageImage?: string;
  history: AIInteraction[];
}

function buildContext(input: CustomAIInput) {
  const history = input.history.slice(-3).map((item) => `Student: ${item.prompt}\nAssistant: ${item.response}`).join('\n\n');
  const pageText = input.pageText.trim() ? input.pageText.slice(0, 12_000) : '[No selectable text was extracted from this page. Use the page image if supplied.]';
  const documentText = input.documentContext.trim() ? input.documentContext.slice(0, 48_000) : '[Whole-document text is unavailable.]';
  return `Current document page: ${input.pageNumber}\n\nCurrent page text (primary focus):\n${pageText}\n\nWhole document context (consult when useful):\n${documentText}${history ? `\n\nRecent conversation on page ${input.pageNumber}:\n${history}` : ''}\n\nStudent question:\n${input.prompt}`;
}

function endpoint(baseUrl: string, suffix: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith(suffix) ? normalized : `${normalized}${suffix}`;
}

async function providerError(response: Response) {
  try {
    const data = await response.json() as { error?: string | { message?: string }; message?: string };
    const message = typeof data.error === 'string' ? data.error : data.error?.message || data.message;
    if (message) return message.slice(0, 400);
  } catch {
    // The provider did not return JSON.
  }
  return `Provider returned ${response.status}.`;
}

async function fetchProvider(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new AIRequestError('The provider took too long to respond.', 'CUSTOM_TIMEOUT');
    throw new AIRequestError('The provider could not be reached from this browser. Check the endpoint and whether it permits browser requests.', 'CUSTOM_NETWORK');
  } finally {
    window.clearTimeout(timeout);
  }
}

async function askOpenAICompatible(input: CustomAIInput, context: string) {
  if (!/^https:\/\//i.test(input.connection.baseUrl || '')) throw new AIRequestError('Enter a secure API base URL beginning with https://.', 'CUSTOM_ENDPOINT');
  const url = endpoint(input.connection.baseUrl!, '/chat/completions');
  const userContent: string | Array<Record<string, unknown>> = input.pageImage
    ? [{ type: 'text', text: context }, { type: 'image_url', image_url: { url: input.pageImage } }]
    : context;
  const response = await fetchProvider(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.connection.apiKey}`,
      ...(input.connection.service === 'openrouter' ? { 'HTTP-Referer': window.location.origin, 'X-Title': 'Study Assistant' } : {}),
    },
    body: JSON.stringify({
      model: input.connection.model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
      max_tokens: 3_000,
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new AIRequestError(await providerError(response), `CUSTOM_${response.status}`, response.status);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : content?.map((part) => part.text || '').join('');
  if (!text?.trim()) throw new AIRequestError('The provider returned an empty response.', 'CUSTOM_EMPTY');
  return text.trim();
}

async function askGemini(input: CustomAIInput, context: string) {
  const parts: Array<Record<string, unknown>> = [{ text: `${SYSTEM_PROMPT}\n\n${context}` }];
  if (input.pageImage) {
    const [metadata, data] = input.pageImage.split(',');
    const mimeType = metadata?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    parts.unshift({ inlineData: { mimeType, data: data || input.pageImage } });
  }
  const response = await fetchProvider(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.connection.model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': input.connection.apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 3_000 } }),
  });
  if (!response.ok) throw new AIRequestError(await providerError(response), `CUSTOM_${response.status}`, response.status);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new AIRequestError('Gemini returned an empty response.', 'CUSTOM_EMPTY');
  return text;
}

async function askAnthropic(input: CustomAIInput, context: string) {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: context }];
  if (input.pageImage) {
    const [metadata, data] = input.pageImage.split(',');
    content.unshift({ type: 'image', source: { type: 'base64', media_type: metadata?.match(/data:(.*?);base64/)?.[1] || 'image/jpeg', data: data || input.pageImage } });
  }
  const response = await fetchProvider('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.connection.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: input.connection.model, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }], max_tokens: 3_000, temperature: 0.2 }),
  });
  if (!response.ok) throw new AIRequestError(await providerError(response), `CUSTOM_${response.status}`, response.status);
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content?.filter((part) => part.type === 'text').map((part) => part.text || '').join('').trim();
  if (!text) throw new AIRequestError('Claude returned an empty response.', 'CUSTOM_EMPTY');
  return text;
}

export async function askCustomAI(input: CustomAIInput) {
  const context = buildContext(input);
  const response = input.connection.provider === 'gemini'
    ? await askGemini(input, context)
    : input.connection.provider === 'anthropic'
      ? await askAnthropic(input, context)
      : await askOpenAICompatible(input, context);
  return { response, provider: 'custom' as const, model: input.connection.model };
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

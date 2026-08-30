import type { AIInteraction, CustomAIConnection } from '../src/types';

const SYSTEM_PROMPT = `You are a careful, capable study assistant working from supplied document evidence. Follow the study scope and reference-mode instructions in the user context. If the evidence does not contain the answer, say so clearly. Preserve important names, numbers, formulas, and qualifications. Explain concepts in plain language and organize longer answers with short headings and bullets. Match the student's requested language.`;
const NVIDIA_CHAT_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const BROAD_PROMPT = /summari[sz]e|overview|study guide|main (?:topics|ideas|points)|key (?:topics|ideas|points)|entire document|whole document|all pages/i;

export interface CustomProviderInput {
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
}

function outputTokenLimit(input: CustomProviderInput) {
  if (input.testMode) return 96;
  return BROAD_PROMPT.test(input.prompt) ? 3_000 : 1_400;
}

function buildContext(input: CustomProviderInput) {
  const history = input.history.slice(-2).map((item) => `Student: ${item.prompt.slice(0, 700)}\nAssistant: ${item.response.slice(0, 1_800)}`).join('\n\n');
  const page = input.pageText.trim() ? input.pageText.slice(0, 12_000) : '[No selectable text was extracted from this page. Use the page image if supplied.]';
  const document = input.documentContext.trim() ? input.documentContext.slice(0, 22_000) : '[Whole-document text is unavailable.]';
  const focus = input.scope === 'document'
    ? 'Study scope: WHOLE DOCUMENT. Synthesize across all supplied pages, cite relevant page numbers, and do not treat the current page as the primary focus.'
    : `Study scope: PAGE ${input.pageNumber}. Focus on this page first, using the wider document when useful.`;
  const citationInstruction = input.referencesEnabled
    ? 'Reference mode: ON. Cite factual claims with the matching bracketed Source number, for example [1]. Use only supplied source numbers.'
    : 'Reference mode: OFF. Answer without bracketed source markers.';
  return `${focus}\n${citationInstruction}\n\nCurrent document page: ${input.pageNumber}\n\nCurrent page text:\n${page}\n\nRetrieved document evidence:\n${document}${history ? `\n\nRecent ${input.scope === 'document' ? 'whole-document' : `page ${input.pageNumber}`} conversation:\n${history}` : ''}\n\nStudent question:\n${input.prompt}`;
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
      max_tokens: outputTokenLimit(input),
      temperature: 0.2,
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

async function nvidia(input: CustomProviderInput, promptContext: string) {
  const response = await providerFetch(NVIDIA_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      authorization: `Bearer ${input.connection.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: input.connection.model.trim(),
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: promptContext }],
      max_tokens: outputTokenLimit(input),
      temperature: 1,
      top_p: 0.95,
      chat_template_kwargs: { thinking: false },
      stream: true,
    }),
  }, 60_000);
  if (response.status === 202) throw new Error('NVIDIA queued this request. Try again shortly or select a faster NVIDIA model.');
  if (!response.ok) {
    const providerError = await errorMessage(response);
    const message = response.status === 401
      ? 'NVIDIA rejected this API key. Edit the connection and paste the generated key beginning with nvapi-.'
      : /specified function in account|function id .+ is not found/i.test(providerError)
        ? 'NVIDIA\'s hosted endpoint is currently unavailable for this account or model. This is an NVIDIA service issue, not a timeout. Try NVIDIA Nemotron 3 from the built-in model menu or another provider; automatic fallback will continue when enabled.'
        : providerError;
    throw new Error(message);
  }
  if (!response.body) throw new Error('NVIDIA returned no response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let reasoning = '';
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return false;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return true;
    if (!payload) return false;
    try {
      const data = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string }; message?: { content?: string; reasoning_content?: string } }> };
      const choice = data.choices?.[0];
      answer += choice?.delta?.content || choice?.message?.content || '';
      reasoning += choice?.delta?.reasoning_content || choice?.message?.reasoning_content || '';
    } catch {
      // Ignore keep-alive or provider metadata events.
    }
    return false;
  };
  let completed = false;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (consume(line)) {
        completed = true;
        break;
      }
    }
    if (done || completed) break;
  }
  if (!completed) consume(buffer);
  else await reader.cancel().catch(() => undefined);
  const text = answer || reasoning;
  if (!text?.trim()) throw new Error('NVIDIA returned an empty response.');
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
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: outputTokenLimit(input) } }),
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
    body: JSON.stringify({ model: input.connection.model, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }], max_tokens: outputTokenLimit(input), temperature: 0.2 }),
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
  const response = input.connection.service === 'nvidia'
    ? await nvidia(input, promptContext)
    : input.connection.provider === 'gemini'
    ? await gemini(input, promptContext)
    : input.connection.provider === 'anthropic'
      ? await anthropic(input, promptContext)
      : await openAICompatible(input, promptContext);
  return { response, provider: 'custom' as const, model: input.connection.model };
}

import type { CustomAIConnection } from '../src/types';
import { publicProviderEndpoint } from './requestSecurity.ts';

export function validConnection(value: unknown): value is CustomAIConnection {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CustomAIConnection>;
  if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{6,80}$/.test(item.id)
    || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80
    || typeof item.model !== 'string' || !item.model.trim() || item.model.length > 160
    || typeof item.service !== 'string' || !['openai', 'openrouter', 'nvidia', 'groq', 'together', 'gemini', 'anthropic', 'custom'].includes(item.service)
    || typeof item.provider !== 'string' || !['openai-compatible', 'gemini', 'anthropic'].includes(item.provider)
    || (item.apiKey !== undefined && (typeof item.apiKey !== 'string' || item.apiKey.length > 4_096))) return false;
  if (item.baseUrl !== undefined) {
    if (typeof item.baseUrl !== 'string' || item.baseUrl.length > 500) return false;
    try { publicProviderEndpoint(item.baseUrl); } catch { return false; }
  }
  return true;
}

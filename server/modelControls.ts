import { env } from 'cloudflare:workers';
import { ensureDatabaseSchema } from '../db/init';

export type AIControlState = {
  paused: boolean;
  disabledModels: Set<string>;
};

let cached: { expiresAt: number; value: AIControlState } | null = null;

export async function getAIControlState(): Promise<AIControlState> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  await ensureDatabaseSchema();
  const [setting, controls] = await Promise.all([
    env.DB.prepare("SELECT value FROM app_settings WHERE key = 'hosted_ai_paused'").first<{ value: string }>(),
    env.DB.prepare('SELECT model FROM ai_model_controls WHERE enabled = 0').all<{ model: string }>(),
  ]);
  const value = {
    paused: setting?.value === 'true',
    disabledModels: new Set((controls.results || []).map((row) => row.model)),
  };
  cached = { expiresAt: Date.now() + 15_000, value };
  return value;
}

export function clearAIControlCache() {
  cached = null;
}

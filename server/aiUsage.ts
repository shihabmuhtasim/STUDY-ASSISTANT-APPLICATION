export const USAGE_UNIT_SCALE = 10;
export const FREE_MONTHLY_AI_LIMIT = 500 * USAGE_UNIT_SCALE;
export const PRO_MONTHLY_AI_LIMIT = 10_000 * USAGE_UNIT_SCALE;
export const ADMIN_MONTHLY_AI_LIMIT = 1_000_000 * USAGE_UNIT_SCALE;

export const FREE_AI_MODEL = '@cf/meta/llama-3.2-1b-instruct';

type Provider = 'cloudflare' | 'gemini' | 'local';

type ModelRate = {
  inputNeuronsPerMillionTokens: number;
  outputNeuronsPerMillionTokens: number;
};

const DEFAULT_RATE: ModelRate = {
  inputNeuronsPerMillionTokens: 10_000,
  outputNeuronsPerMillionTokens: 50_000,
};

const MODEL_RATES: Array<[RegExp, ModelRate]> = [
  [/llama-3\.2-1b-instruct/i, { inputNeuronsPerMillionTokens: 2_457, outputNeuronsPerMillionTokens: 18_252 }],
  [/(llama-3\.2-3b|qwen3-30b)/i, { inputNeuronsPerMillionTokens: 4_625, outputNeuronsPerMillionTokens: 30_475 }],
  [/llama-3\.1-8b-instruct.*fast/i, { inputNeuronsPerMillionTokens: 4_119, outputNeuronsPerMillionTokens: 34_868 }],
  [/glm-4\.7-flash/i, { inputNeuronsPerMillionTokens: 5_500, outputNeuronsPerMillionTokens: 36_400 }],
  [/gemma-4/i, { inputNeuronsPerMillionTokens: 31_000, outputNeuronsPerMillionTokens: 51_000 }],
  [/nemotron-3/i, { inputNeuronsPerMillionTokens: 45_455, outputNeuronsPerMillionTokens: 136_364 }],
  [/gemini.*flash-lite/i, { inputNeuronsPerMillionTokens: 4_000, outputNeuronsPerMillionTokens: 28_000 }],
  [/gemini.*flash/i, { inputNeuronsPerMillionTokens: 6_000, outputNeuronsPerMillionTokens: 40_000 }],
];

function approximateTokens(characters: number) {
  return Math.max(0, Math.ceil(characters / 4));
}

function rateForModel(model: string) {
  return MODEL_RATES.find(([pattern]) => pattern.test(model))?.[1] || DEFAULT_RATE;
}

export function estimateAIUsageUnits(input: {
  provider: Provider;
  model: string;
  inputCharacters: number;
  outputCharacters: number;
  hasImage?: boolean;
}) {
  if (input.provider === 'local') return 0;
  const rate = rateForModel(input.model);
  const inputNeurons = approximateTokens(input.inputCharacters) * rate.inputNeuronsPerMillionTokens / 1_000_000;
  const outputNeurons = approximateTokens(input.outputCharacters) * rate.outputNeuronsPerMillionTokens / 1_000_000;
  const imageNeurons = input.hasImage ? 25 : 0;
  return Math.max(10, Math.ceil((inputNeurons + outputNeurons + imageNeurons) * USAGE_UNIT_SCALE));
}

export function remainingPercentage(limit: number, remaining: number) {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(remaining / limit * 100)));
}

export function nextMonthlyReset(date = new Date()) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

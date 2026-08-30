import type { AISourceReference } from '../types';

export function referencesUsedInAnswer(answer: string, references: AISourceReference[]) {
  const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
  return references.filter((reference) => cited.has(reference.number));
}

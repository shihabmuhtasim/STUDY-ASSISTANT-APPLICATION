const STOP_WORDS = new Set(['about', 'after', 'also', 'and', 'are', 'been', 'before', 'can', 'does', 'for', 'from', 'have', 'into', 'more', 'that', 'the', 'their', 'this', 'what', 'when', 'where', 'which', 'whole', 'with', 'would', 'your']);

function words(value: string) {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function evenlySpacedPages(total: number, count: number) {
  if (total <= count) return Array.from({ length: total }, (_, index) => index);
  return Array.from({ length: count }, (_, index) => Math.round(index * (total - 1) / (count - 1)));
}

export function buildQuestionDocumentContext(
  pages: string[],
  question: string,
  currentPage: number,
  scope: 'page' | 'document',
  maxCharacters = 48_000,
) {
  if (pages.length === 0) return '';
  const terms = new Set(words(question));
  const overviewBudget = Math.min(14_000, Math.floor(maxCharacters * 0.35));
  const perPage = Math.max(80, Math.min(700, Math.floor(overviewBudget / pages.length) - 18));
  const overview = pages.map((text, index) => `[Page ${index + 1} overview] ${text.slice(0, perPage)}`).join('\n');

  const ranked = pages.map((text, index) => {
    const pageWords = new Set(words(text));
    const overlap = [...terms].reduce((score, term) => score + (pageWords.has(term) ? 1 : 0), 0);
    const currentBoost = index === currentPage - 1 && scope === 'page' ? 100 : 0;
    return { index, score: overlap * 10 + currentBoost };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const fallback = evenlySpacedPages(pages.length, scope === 'document' ? 12 : 8);
  const candidates = terms.size > 0 && ranked[0]?.score > 0
    ? ranked.map((item) => item.index)
    : fallback;
  const priority = [...new Set([
    ...(scope === 'page' ? [Math.max(0, currentPage - 1)] : []),
    0,
    pages.length - 1,
    ...candidates,
  ])];

  const detailed: string[] = [];
  let used = overview.length + 2;
  for (const index of priority) {
    if (index < 0 || index >= pages.length || !pages[index]?.trim()) continue;
    const prefix = `[Page ${index + 1} detailed]\n`;
    const remaining = maxCharacters - used - prefix.length - 2;
    if (remaining < 200) break;
    const text = pages[index].slice(0, Math.min(remaining, 8_000));
    detailed.push(`${prefix}${text}`);
    used += prefix.length + text.length + 2;
  }

  return `${overview}\n\nRelevant page detail:\n${detailed.join('\n\n')}`.slice(0, maxCharacters);
}

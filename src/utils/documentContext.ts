import type { AISourceReference } from '../types';

const STOP_WORDS = new Set(['about', 'after', 'also', 'and', 'are', 'been', 'before', 'can', 'does', 'for', 'from', 'have', 'into', 'more', 'that', 'the', 'their', 'this', 'what', 'when', 'where', 'which', 'whole', 'with', 'would', 'your']);
const BROAD_QUESTION = /summari[sz]e|overview|study guide|main (?:topics|ideas|points)|key (?:topics|ideas|points)|entire document|whole document|all pages/i;

function words(value: string) {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function evenlySpacedPages(total: number, count: number) {
  if (total <= count) return Array.from({ length: total }, (_, index) => index);
  return Array.from({ length: count }, (_, index) => Math.round(index * (total - 1) / (count - 1)));
}

function passages(text: string) {
  const rawUnits = text
    .split(/\n{2,}|(?<=[.!?])\s+(?=[\p{Lu}\d])/u)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const units = rawUnits.flatMap((unit) => {
    if (unit.length <= 700) return [unit];
    const slices: string[] = [];
    for (let start = 0; start < unit.length; start += 620) slices.push(unit.slice(start, start + 700).trim());
    return slices;
  });
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (!current) current = unit;
    else if (current.length + unit.length < 560) current += ` ${unit}`;
    else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current) chunks.push(current.slice(0, 700));
  return chunks.length ? chunks : [text.replace(/\s+/g, ' ').trim().slice(0, 700)].filter(Boolean);
}

function relevance(text: string, terms: Set<string>) {
  if (terms.size === 0) return 0;
  const textWords = words(text);
  const available = new Set(textWords);
  const overlap = [...terms].filter((term) => available.has(term)).length;
  const occurrences = textWords.reduce((score, word) => score + (terms.has(word) ? 1 : 0), 0);
  return overlap * 20 + Math.min(occurrences, 12);
}

export interface DocumentContextBundle {
  context: string;
  references: AISourceReference[];
}

export function buildQuestionContextBundle(
  pages: string[],
  question: string,
  currentPage: number,
  scope: 'page' | 'document',
  includeReferences = false,
  maxCharacters = scope === 'document' ? 20_000 : 14_000,
): DocumentContextBundle {
  if (pages.length === 0) return { context: '', references: [] };
  const terms = new Set(words(question));
  const broad = BROAD_QUESTION.test(question) || terms.size === 0;
  const coverageCount = scope === 'document' ? Math.min(24, pages.length) : Math.min(10, pages.length);
  const pageCandidates = pages.flatMap((text, pageIndex) => passages(text).map((quote, passageIndex) => ({
    pageIndex,
    passageIndex,
    quote,
    score: relevance(quote, terms) + (scope === 'page' && pageIndex === currentPage - 1 ? 500 : 0),
  })));
  pageCandidates.sort((a, b) => b.score - a.score || a.pageIndex - b.pageIndex || a.passageIndex - b.passageIndex);

  const selected = broad
    ? [...new Set([...(scope === 'page' ? [Math.max(0, currentPage - 1)] : []), ...evenlySpacedPages(pages.length, coverageCount)])]
      .map((pageIndex) => pageCandidates.find((candidate) => candidate.pageIndex === pageIndex))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    : pageCandidates.filter((candidate) => candidate.score > 0).slice(0, scope === 'document' ? 12 : 8);

  if (selected.length === 0) selected.push(...pageCandidates.slice(0, Math.min(8, pageCandidates.length)));
  if (scope === 'page' && !selected.some((item) => item.pageIndex === currentPage - 1)) {
    const current = pageCandidates.find((candidate) => candidate.pageIndex === currentPage - 1);
    if (current) selected.unshift(current);
  }

  const unique = selected.filter((item, index, all) => all.findIndex((candidate) => candidate.pageIndex === item.pageIndex && candidate.quote === item.quote) === index);
  const referenceCandidates = unique.slice(0, broad ? 6 : 5);
  const references = includeReferences ? referenceCandidates.map((item, index) => ({
    number: index + 1,
    pageNumber: item.pageIndex + 1,
    quote: item.quote,
  })) : [];
  const referenceNumber = new Map(references.map((reference) => [`${reference.pageNumber}:${reference.quote}`, reference.number]));

  const sections: string[] = [];
  let used = 0;
  for (const item of unique) {
    const pageNumber = item.pageIndex + 1;
    const source = referenceNumber.get(`${pageNumber}:${item.quote}`);
    const heading = source ? `[Source ${source} | Page ${pageNumber}]` : `[Page ${pageNumber}]`;
    const section = `${heading}\n${item.quote}`;
    if (used + section.length + 2 > maxCharacters) break;
    sections.push(section);
    used += section.length + 2;
  }

  return { context: sections.join('\n\n'), references };
}

export function buildQuestionDocumentContext(
  pages: string[],
  question: string,
  currentPage: number,
  scope: 'page' | 'document',
  maxCharacters?: number,
) {
  return buildQuestionContextBundle(pages, question, currentPage, scope, false, maxCharacters).context;
}

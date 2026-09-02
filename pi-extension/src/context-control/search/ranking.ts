import type { ProjectedContextSource } from "../sources/types.js";
import {
  normalizeText,
  splitTextIntoPassages,
  throwIfAborted,
  tokenize,
  unique,
  type ContextTextPassage,
} from "./passages.js";

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export type RankedContextPassage = {
  source: ProjectedContextSource;
  passage: ContextTextPassage;
  exactPhrase: boolean;
  matchedTerms: string[];
  score: number;
};

function bm25Score(
  tokens: readonly string[],
  terms: readonly string[],
  documentFrequency: ReadonlyMap<string, number>,
  documentCount: number,
  averageLength: number,
): number {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const length = Math.max(1, tokens.length);
  let score = 0;
  for (const term of terms) {
    const termFrequency = counts.get(term) ?? 0;
    if (termFrequency === 0) continue;
    const df = documentFrequency.get(term) ?? 0;
    const inverseDocumentFrequency = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    const normalization = BM25_K1 * (1 - BM25_B + BM25_B * (length / Math.max(1, averageLength)));
    score += inverseDocumentFrequency * ((termFrequency * (BM25_K1 + 1)) / (termFrequency + normalization));
  }
  return score;
}

function comparePassages(left: RankedContextPassage, right: RankedContextPassage): number {
  if (left.exactPhrase !== right.exactPhrase) return left.exactPhrase ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  if (left.matchedTerms.length !== right.matchedTerms.length) {
    return right.matchedTerms.length - left.matchedTerms.length;
  }
  if (left.source.position !== right.source.position) return right.source.position - left.source.position;
  return left.passage.start - right.passage.start;
}

export function rankMatchingPassages(
  sources: readonly ProjectedContextSource[],
  query: string,
  signal?: AbortSignal,
): RankedContextPassage[] {
  throwIfAborted(signal);
  const normalizedQuery = normalizeText(query);
  const terms = unique(tokenize(query));
  if (!normalizedQuery || terms.length === 0) return [];

  const inputs: Array<{
    source: ProjectedContextSource;
    passage: ContextTextPassage;
    exactPhrase: boolean;
    matchedTerms: string[];
  }> = [];
  for (const source of sources) {
    throwIfAborted(signal);
    for (const passage of splitTextIntoPassages(source.text, signal)) {
      const normalizedPassage = normalizeText(passage.text);
      inputs.push({
        source,
        passage,
        exactPhrase: normalizedPassage.includes(normalizedQuery),
        matchedTerms: terms.filter((term) => passage.tokens.includes(term)),
      });
    }
  }

  const documentFrequency = new Map<string, number>();
  for (const input of inputs) {
    throwIfAborted(signal);
    for (const term of unique(input.passage.tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const averageLength =
    inputs.length === 0 ? 1 : inputs.reduce((total, input) => total + input.passage.length, 0) / inputs.length;
  const ranked = inputs
    .filter((input) => input.matchedTerms.length > 0 || input.exactPhrase)
    .map((input) => ({
      ...input,
      score: bm25Score(input.passage.tokens, terms, documentFrequency, inputs.length, averageLength),
    }))
    .sort(comparePassages);
  return ranked;
}

export function focusedWindow(text: string, focus: string, maxCharacters: number): string | undefined {
  const normalizedFocus = normalizeText(focus);
  if (!normalizedFocus || maxCharacters < 1) return undefined;
  const lowerText = text.normalize("NFKC").toLocaleLowerCase();
  const lowerFocus = normalizedFocus.toLocaleLowerCase();
  let center = lowerText.indexOf(lowerFocus);
  if (center < 0) {
    for (const term of unique(tokenize(focus))) {
      const index = lowerText.indexOf(term);
      if (index >= 0 && (center < 0 || index < center)) center = index;
    }
  }
  if (center < 0) return undefined;
  const proposedStart = Math.max(0, Math.min(center - Math.floor(maxCharacters / 2), text.length - maxCharacters));
  const previousLineBreak = proposedStart > 0 ? text.lastIndexOf("\n", proposedStart - 1) : -1;
  const start = previousLineBreak >= 0 ? previousLineBreak + 1 : proposedStart;
  const proposedEnd = Math.min(text.length, start + maxCharacters);
  const previousEndLineBreak = proposedEnd < text.length ? text.lastIndexOf("\n", proposedEnd) : -1;
  const end = previousEndLineBreak > start ? previousEndLineBreak + 1 : proposedEnd;
  return text.slice(start, end);
}

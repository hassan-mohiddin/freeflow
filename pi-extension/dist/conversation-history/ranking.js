import { normalizeText, splitTextIntoPassages, throwIfAborted, tokenize, unique } from "./passages.js";
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
function bm25Score(tokens, terms, documentFrequency, documentCount, averageLength) {
  const counts = new Map();
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
function comparePassages(left, right) {
  if (left.exactPhrase !== right.exactPhrase) return left.exactPhrase ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  if (left.matchedTerms.length !== right.matchedTerms.length) {
    return right.matchedTerms.length - left.matchedTerms.length;
  }
  if (left.entry.position !== right.entry.position) return right.entry.position - left.entry.position;
  return left.passage.start - right.passage.start;
}
function compareTextPassages(left, right) {
  if (left.exactPhrase !== right.exactPhrase) return left.exactPhrase ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  if (left.matchedTerms.length !== right.matchedTerms.length) {
    return right.matchedTerms.length - left.matchedTerms.length;
  }
  return left.passage.start - right.passage.start;
}
function rankInputs(inputs, terms, signal) {
  const documentFrequency = new Map();
  for (const input of inputs) {
    throwIfAborted(signal);
    for (const term of unique(input.passage.tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const averageLength =
    inputs.length === 0 ? 1 : inputs.reduce((total, input) => total + input.passage.length, 0) / inputs.length;
  const matching = [];
  for (const input of inputs) {
    throwIfAborted(signal);
    if (input.matchedTerms.length > 0 || input.exactPhrase) matching.push(input);
  }
  return matching
    .map((input) => ({
      ...input,
      score: bm25Score(input.passage.tokens, terms, documentFrequency, inputs.length, averageLength),
    }))
    .sort((left, right) => {
      if (left.entry && right.entry) {
        return comparePassages({ ...left, entry: left.entry }, { ...right, entry: right.entry });
      }
      return compareTextPassages(left, right);
    });
}
export function rankMatchingPassages(entries, query, signal) {
  throwIfAborted(signal);
  const normalizedQuery = normalizeText(query);
  const terms = unique(tokenize(query));
  if (!normalizedQuery || terms.length === 0) return [];
  const inputs = [];
  for (const entry of entries) {
    throwIfAborted(signal);
    for (const passage of splitTextIntoPassages(entry.text, signal)) {
      const normalizedPassage = normalizeText(passage.text);
      inputs.push({
        entry,
        passage,
        exactPhrase: normalizedPassage.includes(normalizedQuery),
        matchedTerms: terms.filter((term) => passage.tokens.includes(term)),
      });
    }
  }
  return rankInputs(inputs, terms, signal);
}
export function strongestTextPassage(text, query) {
  const normalizedQuery = normalizeText(query);
  const terms = unique(tokenize(query));
  if (!normalizedQuery || terms.length === 0) return undefined;
  const inputs = splitTextIntoPassages(text).map((passage) => ({
    passage,
    exactPhrase: normalizeText(passage.text).includes(normalizedQuery),
    matchedTerms: terms.filter((term) => passage.tokens.includes(term)),
  }));
  return rankInputs(inputs, terms)[0];
}
export function focusedWindow(text, focus, maxCharacters) {
  const strongest = strongestTextPassage(text, focus);
  if (!strongest) return undefined;
  const center = Math.floor((strongest.passage.start + strongest.passage.end) / 2);
  const proposedStart = Math.max(0, Math.min(center - Math.floor(maxCharacters / 2), text.length - maxCharacters));
  const previousLineBreak = proposedStart > 0 ? text.lastIndexOf("\n", proposedStart - 1) : -1;
  const start = previousLineBreak >= 0 ? previousLineBreak + 1 : proposedStart;
  const proposedEnd = Math.min(text.length, start + maxCharacters);
  const previousEndLineBreak = proposedEnd < text.length ? text.lastIndexOf("\n", proposedEnd) : -1;
  const end = previousEndLineBreak > start ? previousEndLineBreak + 1 : proposedEnd;
  return text.slice(start, end);
}

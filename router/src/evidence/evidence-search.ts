import { selectEvidenceRangeForChunk } from "./evidence-range-selector.js";

export interface EvidenceSearchLineRange {
  start: number;
  end: number;
}

export interface EvidenceSearchFile {
  path: string;
  lines: readonly string[];
}

export interface EvidenceSearchCandidate<TFile extends EvidenceSearchFile = EvidenceSearchFile> {
  file: TFile;
  lineIndex: number;
  score: number;
  reason: string;
  range?: EvidenceSearchLineRange;
  exactNormalizedPhrase?: string;
}

export interface SearchRepoEvidenceCandidatesOptions<TFile extends EvidenceSearchFile = EvidenceSearchFile> {
  files: readonly TFile[];
  query: string;
  topK: number;
  defaultContextLines?: number;
  queryCoverageMaxLines?: number;
}

interface CandidateChunk<TFile extends EvidenceSearchFile = EvidenceSearchFile> {
  file: TFile;
  range: EvidenceSearchLineRange;
  text: string;
  heading?: string;
  kind: "section" | "symbol" | "window";
  tokens?: string[];
  phraseSequence?: string;
}

interface ChunkStats {
  averageLength: number;
  documentFrequency: Map<string, number>;
  chunkCount: number;
}

const DEFAULT_CONTEXT_LINES = 2;
const QUERY_COVERAGE_MAX_LINES = 80;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
  "use",
]);

export function searchRepoEvidenceCandidates<TFile extends EvidenceSearchFile>(
  options: SearchRepoEvidenceCandidatesOptions<TFile>,
): EvidenceSearchCandidate<TFile>[] {
  const tokens = uniqueTokens(tokenize(options.query));
  const normalizedQueryPhrase = normalizePhraseSequence(options.query);
  const chunks = options.files.flatMap((file) => candidateChunksForFile(file));
  const matchingChunks = chunks.filter((chunk) => chunkMightMatch(chunk, tokens));
  const stats = chunkStats(matchingChunks);
  const scored: EvidenceSearchCandidate<TFile>[] = [];

  for (const chunk of matchingChunks) {
    const candidate = scoreCandidateChunk(chunk, tokens, normalizedQueryPhrase, stats, {
      defaultContextLines: options.defaultContextLines ?? DEFAULT_CONTEXT_LINES,
      queryCoverageMaxLines: options.queryCoverageMaxLines ?? QUERY_COVERAGE_MAX_LINES,
    });
    if (candidate) {
      scored.push(candidate);
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const selected: EvidenceSearchCandidate<TFile>[] = [];
  const seen = new Set<string>();
  for (const candidate of scored) {
    const key = candidate.file.path;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(candidate);
    if (selected.length >= options.topK) {
      break;
    }
  }

  return selected;
}

export function findBestLineForQuery(lines: readonly string[], query: string): number | null {
  const tokens = tokenize(query);
  let bestLineIndex: number | null = null;
  let bestScore = 0;

  lines.forEach((line, lineIndex) => {
    const score = scoreText(line, tokens);
    if (score > bestScore) {
      bestLineIndex = lineIndex;
      bestScore = score;
    }
  });

  return bestLineIndex;
}

function candidateChunksForFile<TFile extends EvidenceSearchFile>(file: TFile): CandidateChunk<TFile>[] {
  const structuralChunks: CandidateChunk<TFile>[] = [];
  structuralChunks.push(...markdownPreambleChunk(file));
  structuralChunks.push(...markdownSectionChunks(file));
  structuralChunks.push(...codeSymbolChunks(file));
  return structuralChunks.length ? structuralChunks : lineWindowChunks(file);
}

function markdownPreambleChunk<TFile extends EvidenceSearchFile>(file: TFile): CandidateChunk<TFile>[] {
  const firstHeadingIndex = file.lines.findIndex((line) => line.trimStart().startsWith("#"));
  if (firstHeadingIndex <= 0) {
    return [];
  }

  const range = { start: 1, end: firstHeadingIndex };
  return [{
    file,
    range,
    text: file.lines.slice(range.start - 1, range.end).join("\n"),
    heading: "",
    kind: "section" as const,
  }];
}

function markdownSectionChunks<TFile extends EvidenceSearchFile>(file: TFile): CandidateChunk<TFile>[] {
  const headingIndexes = file.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trimStart().startsWith("#"));

  if (!headingIndexes.length) {
    return [];
  }

  return headingIndexes.map(({ line, index }, headingOrdinal) => {
    const nextHeading = headingIndexes[headingOrdinal + 1]?.index ?? file.lines.length;
    const range = { start: index + 1, end: Math.max(index + 1, nextHeading) };
    return {
      file,
      range,
      text: file.lines.slice(range.start - 1, range.end).join("\n"),
      heading: line,
      kind: "section" as const,
    };
  });
}

function codeSymbolChunks<TFile extends EvidenceSearchFile>(file: TFile): CandidateChunk<TFile>[] {
  const symbolIndexes = file.lines
    .map((line, index) => ({ line, index, match: codeSymbolMatch(line) }))
    .filter((entry): entry is { line: string; index: number; match: RegExpExecArray } => Boolean(entry.match));

  if (!symbolIndexes.length) {
    return [];
  }

  return symbolIndexes.map(({ line, index }, symbolOrdinal) => {
    const nextSymbol = nextSymbolBoundary(file.lines, symbolIndexes, symbolOrdinal);
    const end = Math.min(file.lines.length, Math.max(index + 1, Math.min(nextSymbol, index + 80)));
    const range = { start: index + 1, end };
    return {
      file,
      range,
      text: file.lines.slice(range.start - 1, range.end).join("\n"),
      heading: line,
      kind: "symbol" as const,
    };
  });
}

function nextSymbolBoundary(
  lines: readonly string[],
  symbolIndexes: readonly { line: string; index: number; match: RegExpExecArray }[],
  symbolOrdinal: number,
): number {
  const current = symbolIndexes[symbolOrdinal];
  if (!current) {
    return lines.length;
  }

  if (/^\s*impl\b/.test(current.line)) {
    const nextTopLevel = symbolIndexes.slice(symbolOrdinal + 1).find((entry) => isTopLevelCodeSymbol(entry.line));
    return nextTopLevel?.index ?? lines.length;
  }

  return symbolIndexes[symbolOrdinal + 1]?.index ?? lines.length;
}

function isTopLevelCodeSymbol(line: string): boolean {
  return /^(?:pub\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl|mod|class|interface|type|const|def)\s+([A-Za-z_][A-Za-z0-9_]*)\b/.test(line);
}

function codeSymbolMatch(line: string): RegExpExecArray | null {
  return /^\s*(?:pub\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl|mod|class|interface|type|const|def)\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
}

function lineWindowChunks<TFile extends EvidenceSearchFile>(file: TFile): CandidateChunk<TFile>[] {
  return file.lines.map((_, lineIndex) => {
    const start = Math.max(0, lineIndex - DEFAULT_CONTEXT_LINES);
    const end = Math.min(file.lines.length - 1, lineIndex + DEFAULT_CONTEXT_LINES);
    return {
      file,
      range: { start: start + 1, end: end + 1 },
      text: file.lines.slice(start, end + 1).join("\n"),
      kind: "window" as const,
    };
  });
}

function chunkStats<TFile extends EvidenceSearchFile>(chunks: readonly CandidateChunk<TFile>[]): ChunkStats {
  const documentFrequency = new Map<string, number>();
  let totalLength = 0;

  for (const chunk of chunks) {
    const tokens = tokensForChunk(chunk);
    totalLength += Math.max(1, tokens.length);
    for (const token of uniqueTokens(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  return {
    averageLength: chunks.length ? totalLength / chunks.length : 1,
    documentFrequency,
    chunkCount: chunks.length,
  };
}

function scoreCandidateChunk<TFile extends EvidenceSearchFile>(
  chunk: CandidateChunk<TFile>,
  queryTokens: readonly string[],
  normalizedQueryPhrase: string,
  stats: ChunkStats,
  options: { defaultContextLines: number; queryCoverageMaxLines: number },
): EvidenceSearchCandidate<TFile> | null {
  if (!queryTokens.length) {
    return null;
  }

  const chunkTokens = tokensForChunk(chunk);
  const tokenCounts = tokenCountMap(chunkTokens);
  const matchingTokens = queryTokens.filter((token) => (tokenCounts.get(token) ?? 0) > 0);
  const pathScore = scoreText(chunk.file.path, queryTokens);
  if (!matchingTokens.length && pathScore <= 0) {
    return null;
  }

  const exactPhrase = hasExactNormalizedPhraseInChunk(chunk, normalizedQueryPhrase);
  const chunkLength = Math.max(1, chunkTokens.length);
  const score =
    exactPhraseBoost(exactPhrase, chunk.file.path, queryTokens) +
    bm25Score(queryTokens, tokenCounts, chunkLength, stats) * 10 +
    coverageRatio(matchingTokens, queryTokens) * 120 +
    contentCoverageBoost(matchingTokens, queryTokens, chunk.kind) +
    completeCoverageBoost(matchingTokens, queryTokens, chunk.kind) -
    missingCoveragePenalty(matchingTokens, queryTokens, chunk.kind) -
    lowContentCoveragePenalty(matchingTokens, queryTokens, pathScore) +
    headingCoverageBoost(chunk.heading ?? "", queryTokens) +
    identifierBoost(chunk.text, queryTokens) +
    (matchingTokens.length >= 4 ? orderedPhraseBoost(chunkTokens, queryTokens) : 0) +
    (chunk.kind === "symbol" ? codeDefinitionBoost(chunk.text, queryTokens) : 0) +
    chunkKindBoost(chunk.kind) +
    pathIntentBoost(chunk.file.path, queryTokens) +
    sourceTestPrior(chunk.file.path, queryTokens) +
    pathScore -
    Math.log1p(chunkLength) * 10;
  const selection = selectEvidenceRangeForChunk({
    lines: chunk.file.lines,
    chunkRange: chunk.range,
    chunkKind: chunk.kind,
    queryTokens,
    normalizedQueryPhrase,
    chunkHasExactPhrase: exactPhrase,
    defaultContextLines: options.defaultContextLines,
    queryCoverageMaxLines: options.queryCoverageMaxLines,
  });
  const reason = selection.matchKind === "exact-phrase"
    ? `matched exact normalized query phrase in ${chunk.kind} chunk`
    : `BM25-style scored ${chunk.kind} chunk with ${matchingTokens.length}/${queryTokens.length} query-token coverage`;

  return {
    file: chunk.file,
    lineIndex: selection.anchorLine - 1,
    range: selection.range,
    score,
    reason,
    ...(selection.matchKind === "exact-phrase" ? { exactNormalizedPhrase: normalizedQueryPhrase } : {}),
  };
}

function chunkMightMatch<TFile extends EvidenceSearchFile>(chunk: CandidateChunk<TFile>, queryTokens: readonly string[]): boolean {
  const path = chunk.file.path.toLowerCase();
  const heading = chunk.heading?.toLowerCase() ?? "";
  const text = chunk.text.toLowerCase();
  return queryTokens.some((token) => path.includes(token) || heading.includes(token) || text.includes(token));
}

function bm25Score(
  queryTokens: readonly string[],
  tokenCounts: ReadonlyMap<string, number>,
  chunkLength: number,
  stats: ChunkStats,
): number {
  const k1 = 1.2;
  const b = 0.75;
  return queryTokens.reduce((score, token) => {
    const termFrequency = tokenCounts.get(token) ?? 0;
    if (termFrequency <= 0) {
      return score;
    }

    const documentFrequency = stats.documentFrequency.get(token) ?? 0;
    const idf = Math.log(1 + (stats.chunkCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
    const normalizedLength = k1 * (1 - b + b * (chunkLength / Math.max(1, stats.averageLength)));
    const saturatedFrequency = (termFrequency * (k1 + 1)) / (termFrequency + normalizedLength);
    return score + idf * saturatedFrequency;
  }, 0);
}

function coverageRatio(matchingTokens: readonly string[], queryTokens: readonly string[]): number {
  return queryTokens.length ? matchingTokens.length / queryTokens.length : 0;
}

function contentCoverageBoost(matchingTokens: readonly string[], queryTokens: readonly string[], chunkKind: CandidateChunk["kind"]): number {
  if (queryTokens.length === 0) {
    return 0;
  }
  const perTokenBoost = chunkKind === "window" ? 180 : 350;
  return matchingTokens.length * perTokenBoost + coverageRatio(matchingTokens, queryTokens) * 100;
}

function completeCoverageBoost(
  matchingTokens: readonly string[],
  queryTokens: readonly string[],
  chunkKind: CandidateChunk["kind"],
): number {
  if (queryTokens.length === 0 || matchingTokens.length !== queryTokens.length) {
    return 0;
  }

  if (chunkKind === "symbol") {
    return 240;
  }

  return queryTokens.length >= 4 ? 1_200 : 240;
}

function missingCoveragePenalty(
  matchingTokens: readonly string[],
  queryTokens: readonly string[],
  chunkKind: CandidateChunk["kind"],
): number {
  if (chunkKind === "symbol" || queryTokens.length < 4 || matchingTokens.length >= queryTokens.length) {
    return 0;
  }

  return (queryTokens.length - matchingTokens.length) * 90;
}

function lowContentCoveragePenalty(matchingTokens: readonly string[], queryTokens: readonly string[], pathScore: number): number {
  if (queryTokens.length < 4 || matchingTokens.length >= 2) {
    return 0;
  }

  const pathOnlyPenalty = matchingTokens.length === 0 && pathScore > 0 ? 1_000 : 0;
  return (2 - matchingTokens.length) * 600 + pathOnlyPenalty;
}

function exactPhraseBoost(exactPhrase: boolean, path: string, queryTokens: readonly string[]): number {
  if (!exactPhrase) {
    return 0;
  }

  const testPath = isTestPath(path);
  const testIntent = queryTokens.some((token) => ["test", "tests", "expect", "expected", "should", "emitted"].includes(token));
  return testPath && !testIntent ? 1_000 : 100_000;
}

function headingCoverageBoost(heading: string, queryTokens: readonly string[]): number {
  const headingTokens = new Set(tokenize(heading));
  const coveredTokens = queryTokens.filter((token) => headingTokens.has(token)).length;
  return coveredTokens * 8;
}

function identifierBoost(text: string, queryTokens: readonly string[]): number {
  if (!text.includes("`")) {
    return 0;
  }
  const identifiers = Array.from(text.matchAll(/`([^`]+)`/g), (match) => tokenize(match[1] ?? "")).flat();
  if (!identifiers.length) {
    return 0;
  }

  const identifierSet = new Set(identifiers);
  return queryTokens.filter((token) => identifierSet.has(token)).length * 10;
}

function orderedPhraseBoost(chunkTokens: readonly string[], queryTokens: readonly string[]): number {
  const normalizedText = ` ${chunkTokens.join(" ")} `;
  let best = 0;
  for (let start = 0; start < queryTokens.length; start += 1) {
    const phrase: string[] = [];
    for (let end = start; end < queryTokens.length; end += 1) {
      phrase.push(queryTokens[end] ?? "");
      if (phrase.length <= best) {
        continue;
      }
      if (normalizedText.includes(` ${phrase.join(" ")} `)) {
        best = phrase.length;
      }
    }
  }
  return best >= 3 ? best * best * 20 : 0;
}

function codeDefinitionBoost(text: string, queryTokens: readonly string[]): number {
  const definitionMatches = Array.from(
    text.matchAll(/^\s*(?:pub\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl|mod|class|interface|type|const|def)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm),
    (match) => match[1] ?? "",
  );
  if (!definitionMatches.length) {
    return 0;
  }

  let bestBoost = 0;
  for (const name of definitionMatches) {
    const symbolTokens = new Set(tokenize(name));
    const coverage = queryTokens.filter((token) => symbolTokens.has(token)).length;
    const exactCompoundCoverage = queryTokens.filter(
      (token) => token.length >= 8 && symbolTokens.has(token) && !/[._/-]/.test(token),
    ).length;
    if (coverage > 0) {
      bestBoost = Math.max(bestBoost, 120 + coverage * 80 + exactCompoundCoverage * 520);
    }
  }
  return bestBoost;
}

function chunkKindBoost(kind: CandidateChunk["kind"]): number {
  if (kind === "symbol") {
    return 500;
  }
  if (kind === "section") {
    return 12;
  }
  return 0;
}

function pathIntentBoost(path: string, queryTokens: readonly string[]): number {
  const pathTokens = new Set(tokenize(path));
  const coveredTokens = queryTokens.filter((token) => pathTokens.has(token)).length;
  return coveredTokens * 140 + (coveredTokens >= 2 ? 600 : 0);
}

function sourceTestPrior(path: string, queryTokens: readonly string[]): number {
  const testPath = isTestPath(path);
  const testIntent = queryTokens.some((token) => ["test", "tests", "expect", "expected", "should", "emitted"].includes(token));
  if (testPath && !testIntent) {
    return -2_000;
  }
  if (testPath && testIntent) {
    return 35;
  }
  if (!testPath && testIntent) {
    return -8;
  }
  return 0;
}

function isTestPath(path: string): boolean {
  const lower = path.toLowerCase();
  return /(^|\/)(tests?|fixtures?)(\/|$)/.test(lower) || lower.endsWith("_tests.rs") || lower.endsWith(".test.ts") || lower.endsWith(".test.js");
}

function hasExactNormalizedPhraseInChunk<TFile extends EvidenceSearchFile>(chunk: CandidateChunk<TFile>, normalizedQueryPhrase: string): boolean {
  return normalizedQueryPhrase !== "" && phraseSequenceForChunk(chunk).includes(normalizedQueryPhrase);
}

function tokensForChunk<TFile extends EvidenceSearchFile>(chunk: CandidateChunk<TFile>): string[] {
  chunk.tokens ??= tokenize(chunk.text);
  return chunk.tokens;
}

function phraseSequenceForChunk<TFile extends EvidenceSearchFile>(chunk: CandidateChunk<TFile>): string {
  chunk.phraseSequence ??= normalizePhraseSequence(chunk.text);
  return chunk.phraseSequence;
}

function normalizePhraseSequence(text: string): string {
  const tokens = tokenizeForPhrase(text);
  return tokens.length >= 2 ? tokens.join(" ") : "";
}

function tokenCountMap(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function uniqueTokens(tokens: readonly string[]): string[] {
  return Array.from(new Set(tokens));
}

function scoreText(text: string, tokens: readonly string[]): number {
  const lower = text.toLowerCase();
  return tokens.reduce((score, token) => score + countOccurrences(lower, token), 0);
}

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let index = text.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(token, index + token.length);
  }
  return count;
}

function tokenize(query: string): string[] {
  return query
    .split(/[^A-Za-z0-9_./-]+/)
    .flatMap((token) => expandedIdentifierTokens(token.trim()))
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function tokenizeForPhrase(query: string): string[] {
  return query
    .split(/[^A-Za-z0-9_./-]+/)
    .flatMap((token) => expandedIdentifierTokens(token.trim()))
    .filter((token) => token.length >= 2);
}

function expandedIdentifierTokens(token: string): string[] {
  if (!token) {
    return [];
  }

  const lower = token.toLowerCase();
  if (!needsIdentifierSplit(token)) {
    return [lower];
  }

  const variants = new Set<string>();
  addTokenVariant(variants, lower);
  for (const part of splitIdentifierToken(token)) {
    addTokenVariant(variants, part.toLowerCase());
  }
  return Array.from(variants);
}

function addTokenVariant(variants: Set<string>, token: string) {
  if (token) {
    variants.add(token);
  }
}

function needsIdentifierSplit(token: string): boolean {
  if (/[._/-]/.test(token)) {
    return true;
  }

  for (let index = 1; index < token.length; index += 1) {
    const previous = token.charCodeAt(index - 1);
    const current = token.charCodeAt(index);
    const next = index + 1 < token.length ? token.charCodeAt(index + 1) : 0;
    const previousIsLowerOrDigit = (previous >= 97 && previous <= 122) || (previous >= 48 && previous <= 57);
    const previousIsUpper = previous >= 65 && previous <= 90;
    const currentIsUpper = current >= 65 && current <= 90;
    const nextIsLower = next >= 97 && next <= 122;
    if ((previousIsLowerOrDigit && currentIsUpper) || (previousIsUpper && currentIsUpper && nextIsLower)) {
      return true;
    }
  }

  return false;
}

function splitIdentifierToken(token: string): string[] {
  const separated = token
    .replace(/[._/-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return separated.split(/\s+/).filter(Boolean);
}

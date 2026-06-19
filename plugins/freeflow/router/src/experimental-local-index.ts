import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";

export interface ExperimentalLocalIndexOptions {
  root: string;
  cacheRoot?: string;
  generatedPathGlobs?: readonly string[];
}

export interface ExperimentalIndexLoadResult {
  mode: ExperimentalIndexLoadMode;
  index: ExperimentalRepoIndex;
  cachePath: string;
  buildMs: number;
  refreshReason?: string;
}

export type ExperimentalIndexLoadMode = "cold-built" | "warm-loaded" | "stale-refreshed";

export interface ExperimentalRepoIndex {
  version: 1;
  root: string;
  builtAt: string;
  files: Record<string, ExperimentalIndexedFile>;
  chunks: ExperimentalIndexedChunk[];
  tokenDocumentFrequency: Record<string, number>;
  averageChunkTokens: number;
  cachePath: string;
}

export interface ExperimentalIndexedFile {
  path: string;
  hashSha256: string;
  sizeBytes: number;
  lineCount: number;
  chunkIds: number[];
}

export interface ExperimentalIndexedChunk {
  id: number;
  path: string;
  startLine: number;
  endLine: number;
  kind: "section" | "window";
  text: string;
  tokens: string[];
  tokenCounts: Record<string, number>;
  heading?: string;
}

export interface ExperimentalIndexQueryOptions {
  topK?: number;
}

export interface ExperimentalIndexCandidate {
  path: string;
  lines: string;
  excerpt: string;
  score: number;
  reason: string;
  chunkKind: ExperimentalIndexedChunk["kind"];
  hashSha256: string;
  contextBytes: number;
}

interface ScannedTextFile {
  path: string;
  absolutePath: string;
  text: string;
  lines: string[];
  hashSha256: string;
  sizeBytes: number;
}

interface LineRange {
  start: number;
  end: number;
}

interface ChunkStats {
  averageLength: number;
  documentFrequency: Map<string, number>;
  chunkCount: number;
}

const INDEX_VERSION = 1;
const DEFAULT_CONTEXT_LINES = 2;
const DEFAULT_TOP_K = 1;
const MAX_TOP_K = 10;
const BROAD_SCAN_MAX_FILE_BYTES = 1024 * 1024;
const QUERY_EXCERPT_MAX_BYTES = 8_192;
const LINE_PREVIEW_MAX_BYTES = 2_048;
const TRUNCATION_SUFFIX = " … [truncated; query index stores bounded preview only]";
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
]);
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "target",
  "graphify-out",
  ".cache",
  ".tmp",
  "tmp",
  "temp",
  "logs",
  "generated",
]);
const BROAD_SKIP_FILE_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bin",
  ".bmp",
  ".br",
  ".class",
  ".db",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".heic",
  ".icns",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".parquet",
  ".pdf",
  ".png",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tgz",
  ".ttf",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
  ".zst",
]);

export function defaultExperimentalIndexCacheRoot(): string {
  const xdgCache = process.env.XDG_CACHE_HOME;
  return resolve(xdgCache && xdgCache.trim() ? xdgCache : join(homedir(), ".cache"), "freeflow-router", "experimental-index");
}

export async function experimentalIndexCachePath(options: ExperimentalLocalIndexOptions): Promise<string> {
  const root = await realpath(resolve(options.root));
  const cacheRoot = resolve(options.cacheRoot ?? defaultExperimentalIndexCacheRoot());
  return join(cacheRoot, `${hash(JSON.stringify({ root, generatedPathGlobs: options.generatedPathGlobs ?? [] })).slice(0, 24)}.json`);
}

export async function buildOrLoadExperimentalRepoIndex(
  options: ExperimentalLocalIndexOptions,
): Promise<ExperimentalIndexLoadResult> {
  const startedAt = performance.now();
  const root = await realpath(resolve(options.root));
  const cacheOptions: ExperimentalLocalIndexOptions = { root };
  if (options.cacheRoot !== undefined) {
    cacheOptions.cacheRoot = options.cacheRoot;
  }
  if (options.generatedPathGlobs !== undefined) {
    cacheOptions.generatedPathGlobs = options.generatedPathGlobs;
  }
  const cachePath = await experimentalIndexCachePath(cacheOptions);
  const scannedFiles = await scanRepoTextFiles(root, options.generatedPathGlobs ?? []);
  const cachedIndex = await readCachedIndex(cachePath, root);

  if (cachedIndex && manifestMatches(cachedIndex, scannedFiles)) {
    return {
      mode: "warm-loaded",
      index: cachedIndex,
      cachePath,
      buildMs: performance.now() - startedAt,
    };
  }

  const index = buildIndexFromScannedFiles(root, cachePath, scannedFiles);
  await writeIndex(cachePath, index);
  return {
    mode: cachedIndex ? "stale-refreshed" : "cold-built",
    index,
    cachePath,
    buildMs: performance.now() - startedAt,
    ...(cachedIndex ? { refreshReason: staleReason(cachedIndex, scannedFiles) } : {}),
  };
}

export function queryExperimentalRepoIndex(
  index: ExperimentalRepoIndex,
  query: string,
  options: ExperimentalIndexQueryOptions = {},
): ExperimentalIndexCandidate[] {
  const requestedTopK = options.topK ?? DEFAULT_TOP_K;
  const topK = Number.isFinite(requestedTopK)
    ? Math.min(MAX_TOP_K, Math.max(1, Math.floor(requestedTopK)))
    : DEFAULT_TOP_K;
  const queryTokens = uniqueTokens(tokenize(query));
  if (queryTokens.length === 0) {
    return [];
  }

  const normalizedQueryPhrase = normalizeTokenSequence(query);
  const stats: ChunkStats = {
    averageLength: index.averageChunkTokens || 1,
    documentFrequency: new Map(Object.entries(index.tokenDocumentFrequency)),
    chunkCount: index.chunks.length,
  };
  const scored: ExperimentalIndexCandidate[] = [];

  for (const chunk of index.chunks) {
    const candidate = scoreIndexedChunk(index, chunk, queryTokens, normalizedQueryPhrase, stats);
    if (candidate) {
      scored.push(candidate);
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const selected: ExperimentalIndexCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of scored) {
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);
    selected.push(candidate);
    if (selected.length >= topK) {
      break;
    }
  }

  return selected;
}

async function readCachedIndex(cachePath: string, root: string): Promise<ExperimentalRepoIndex | null> {
  try {
    const parsed = JSON.parse(await readFile(cachePath, "utf8")) as ExperimentalRepoIndex;
    if (parsed.version !== INDEX_VERSION || parsed.root !== root || !parsed.files || !Array.isArray(parsed.chunks)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeIndex(cachePath: string, index: ExperimentalRepoIndex): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function manifestMatches(index: ExperimentalRepoIndex, scannedFiles: readonly ScannedTextFile[]): boolean {
  const indexedPaths = Object.keys(index.files).sort();
  const scannedPaths = scannedFiles.map((file) => file.path).sort();
  if (indexedPaths.length !== scannedPaths.length) {
    return false;
  }

  for (let indexPath = 0; indexPath < scannedPaths.length; indexPath += 1) {
    if (indexedPaths[indexPath] !== scannedPaths[indexPath]) {
      return false;
    }
  }

  return scannedFiles.every((file) => index.files[file.path]?.hashSha256 === file.hashSha256);
}

function staleReason(index: ExperimentalRepoIndex, scannedFiles: readonly ScannedTextFile[]): string {
  const indexedPaths = new Set(Object.keys(index.files));
  const scannedPaths = new Set(scannedFiles.map((file) => file.path));
  const added = [...scannedPaths].filter((path) => !indexedPaths.has(path));
  const removed = [...indexedPaths].filter((path) => !scannedPaths.has(path));
  const changed = scannedFiles
    .filter((file) => indexedPaths.has(file.path) && index.files[file.path]?.hashSha256 !== file.hashSha256)
    .map((file) => file.path);
  const parts = [];
  if (added.length) {
    parts.push(`${added.length} added`);
  }
  if (removed.length) {
    parts.push(`${removed.length} removed`);
  }
  if (changed.length) {
    parts.push(`${changed.length} changed`);
  }
  return parts.length ? parts.join(", ") : "cache metadata changed";
}

function buildIndexFromScannedFiles(root: string, cachePath: string, scannedFiles: readonly ScannedTextFile[]): ExperimentalRepoIndex {
  const chunks: ExperimentalIndexedChunk[] = [];
  const files: Record<string, ExperimentalIndexedFile> = {};

  for (const file of scannedFiles) {
    const fileChunks = candidateChunksForFile(file);
    const chunkIds: number[] = [];
    for (const chunk of fileChunks) {
      const tokens = tokenize(chunk.text);
      const indexedChunk: ExperimentalIndexedChunk = {
        id: chunks.length,
        path: file.path,
        startLine: chunk.range.start,
        endLine: chunk.range.end,
        kind: chunk.kind,
        text: chunk.text,
        tokens,
        tokenCounts: Object.fromEntries(tokenCountMap(tokens)),
      };
      if (chunk.heading !== undefined) {
        indexedChunk.heading = chunk.heading;
      }
      chunks.push(indexedChunk);
      chunkIds.push(indexedChunk.id);
    }

    files[file.path] = {
      path: file.path,
      hashSha256: file.hashSha256,
      sizeBytes: file.sizeBytes,
      lineCount: file.lines.length,
      chunkIds,
    };
  }

  const tokenDocumentFrequency: Record<string, number> = {};
  let totalTokens = 0;
  for (const chunk of chunks) {
    totalTokens += Math.max(1, chunk.tokens.length);
    for (const token of uniqueTokens(chunk.tokens)) {
      tokenDocumentFrequency[token] = (tokenDocumentFrequency[token] ?? 0) + 1;
    }
  }

  return {
    version: INDEX_VERSION,
    root,
    builtAt: new Date().toISOString(),
    files,
    chunks,
    tokenDocumentFrequency,
    averageChunkTokens: chunks.length ? totalTokens / chunks.length : 1,
    cachePath,
  };
}

async function scanRepoTextFiles(root: string, generatedPathGlobs: readonly string[] = []): Promise<ScannedTextFile[]> {
  const files: ScannedTextFile[] = [];
  const visitedDirectories = new Set<string>();
  await collectTextFiles(root, root, files, visitedDirectories, generatedPathGlobs);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectTextFiles(
  root: string,
  currentPath: string,
  files: ScannedTextFile[],
  visitedDirectories: Set<string>,
  generatedPathGlobs: readonly string[] = [],
): Promise<void> {
  let currentRealPath: string;
  try {
    currentRealPath = await realpath(currentPath);
  } catch {
    return;
  }
  if (!isPathInsideRoot(root, currentRealPath)) {
    return;
  }

  let currentStat: Awaited<ReturnType<typeof stat>>;
  try {
    currentStat = await stat(currentRealPath);
  } catch {
    return;
  }
  const relativePath = normalizeRelativePath(relative(root, currentRealPath));

  if (currentStat.isDirectory()) {
    if (visitedDirectories.has(currentRealPath)) {
      return;
    }
    visitedDirectories.add(currentRealPath);
    if (relativePath !== "" && (shouldSkipBroadDirectory(currentRealPath) || matchesGeneratedPathHint(relativePath, generatedPathGlobs))) {
      return;
    }

    const entries = await readdir(currentRealPath, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      await collectTextFiles(root, resolve(currentRealPath, entry.name), files, visitedDirectories, generatedPathGlobs);
    }
    return;
  }

  if (!currentStat.isFile()) {
    return;
  }

  if (shouldSkipBroadFile(relativePath, currentStat.size) || matchesGeneratedPathHint(relativePath, generatedPathGlobs)) {
    return;
  }

  const text = await readFile(currentRealPath, "utf8");
  if (text.includes("\0")) {
    return;
  }

  files.push({
    path: relativePath,
    absolutePath: currentRealPath,
    text,
    lines: splitLines(text),
    hashSha256: hash(text),
    sizeBytes: byteLength(text),
  });
}

interface CandidateChunk {
  range: LineRange;
  text: string;
  kind: "section" | "window";
  heading?: string;
}

function candidateChunksForFile(file: ScannedTextFile): CandidateChunk[] {
  const chunks = [...markdownSectionChunks(file), ...lineWindowChunks(file)];
  return chunks.length ? chunks : lineWindowChunks(file);
}

function markdownSectionChunks(file: ScannedTextFile): CandidateChunk[] {
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
      range,
      text: file.lines.slice(range.start - 1, range.end).join("\n"),
      heading: line,
      kind: "section" as const,
    };
  });
}

function lineWindowChunks(file: ScannedTextFile): CandidateChunk[] {
  return file.lines.map((_, lineIndex) => {
    const start = Math.max(0, lineIndex - DEFAULT_CONTEXT_LINES);
    const end = Math.min(file.lines.length - 1, lineIndex + DEFAULT_CONTEXT_LINES);
    return {
      range: { start: start + 1, end: end + 1 },
      text: file.lines.slice(start, end + 1).join("\n"),
      kind: "window" as const,
    };
  });
}

function scoreIndexedChunk(
  index: ExperimentalRepoIndex,
  chunk: ExperimentalIndexedChunk,
  queryTokens: readonly string[],
  normalizedQueryPhrase: string,
  stats: ChunkStats,
): ExperimentalIndexCandidate | null {
  const tokenCounts = new Map(Object.entries(chunk.tokenCounts));
  const matchingTokens = queryTokens.filter((token) => (tokenCounts.get(token) ?? 0) > 0);
  const pathScore = scoreText(chunk.path, queryTokens);
  if (!matchingTokens.length && pathScore <= 0) {
    return null;
  }

  const exactPhrase = hasExactNormalizedPhrase(chunk.text, normalizedQueryPhrase);
  const chunkLength = Math.max(1, chunk.tokens.length);
  const score =
    (exactPhrase ? 100_000 : 0) +
    bm25Score(queryTokens, tokenCounts, chunkLength, stats) * 10 +
    coverageRatio(matchingTokens, queryTokens) * 25 +
    headingCoverageBoost(chunk.heading ?? "", queryTokens) +
    identifierBoost(chunk.text, queryTokens) +
    pathScore -
    Math.log1p(chunkLength) * 10;
  const file = index.files[chunk.path];
  if (!file) {
    return null;
  }

  const lines = `${chunk.startLine}-${chunk.endLine}`;
  const excerpt = boundedExcerpt(chunk.text);
  return {
    path: chunk.path,
    lines,
    excerpt,
    score,
    reason: exactPhrase
      ? `matched exact normalized query phrase in indexed ${chunk.kind} chunk`
      : `BM25-style indexed ${chunk.kind} chunk with ${matchingTokens.length}/${queryTokens.length} query-token coverage`,
    chunkKind: chunk.kind,
    hashSha256: file.hashSha256,
    contextBytes: byteLength(excerpt),
  };
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

function headingCoverageBoost(heading: string, queryTokens: readonly string[]): number {
  const headingTokens = new Set(tokenize(heading));
  return queryTokens.filter((token) => headingTokens.has(token)).length * 4;
}

function identifierBoost(text: string, queryTokens: readonly string[]): number {
  const identifiers = Array.from(text.matchAll(/`([^`]+)`/g), (match) => tokenize(match[1] ?? "")).flat();
  if (!identifiers.length) {
    return 0;
  }
  const identifierSet = new Set(identifiers);
  return queryTokens.filter((token) => identifierSet.has(token)).length * 6;
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

function normalizeTokenSequence(text: string): string {
  const tokens = tokenize(text);
  return tokens.length >= 2 ? tokens.join(" ") : "";
}

function hasExactNormalizedPhrase(text: string, normalizedQueryPhrase: string): boolean {
  return normalizedQueryPhrase !== "" && normalizeTokenSequence(text).includes(normalizedQueryPhrase);
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
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

function boundedExcerpt(text: string): string {
  const previewedLines = splitLines(text).map((line) => truncateToUtf8Bytes(line, LINE_PREVIEW_MAX_BYTES));
  return truncateToUtf8Bytes(previewedLines.join("\n"), QUERY_EXCERPT_MAX_BYTES);
}

function shouldSkipBroadDirectory(path: string): boolean {
  const name = path.split(/[\\/]+/).at(-1) ?? path;
  return SKIP_DIRS.has(name);
}

function matchesGeneratedPathHint(path: string, hints: readonly string[]): boolean {
  if (hints.length === 0) {
    return false;
  }

  const normalizedPath = normalizeRelativePath(path);
  return hints.some((hint) => matchesSimpleGlob(normalizedPath, hint));
}

function matchesSimpleGlob(path: string, pattern: string): boolean {
  if (!pattern) {
    return false;
  }

  const normalizedPattern = normalizeRelativePath(pattern);
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(path);
}

function shouldSkipBroadFile(path: string, size: number): boolean {
  const name = path.split("/").at(-1)?.toLowerCase() ?? path.toLowerCase();
  if (isLockfile(name)) {
    return false;
  }
  if (hasBroadSkippedFileExtension(name)) {
    return true;
  }
  if (size > BROAD_SCAN_MAX_FILE_BYTES) {
    return true;
  }
  if (name.endsWith(".min.js") || name.endsWith(".min.css") || name.endsWith(".map")) {
    return true;
  }
  if (name.includes(".bundle.") || name.endsWith(".log")) {
    return true;
  }
  if ((name.endsWith(".html") || name.endsWith(".json")) && size > 64_000) {
    return true;
  }
  return false;
}

function hasBroadSkippedFileExtension(name: string): boolean {
  for (const extension of BROAD_SKIP_FILE_EXTENSIONS) {
    if (name.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function isLockfile(name: string): boolean {
  return (
    name === "package-lock.json" ||
    name === "npm-shrinkwrap.json" ||
    name === "pnpm-lock.yaml" ||
    name === "yarn.lock" ||
    name === "bun.lockb"
  );
}

function truncateToUtf8Bytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) {
    return text;
  }

  const suffixBytes = byteLength(TRUNCATION_SUFFIX);
  const contentBytes = Math.max(0, maxBytes - suffixBytes);
  let truncated = Buffer.from(text, "utf8").subarray(0, contentBytes).toString("utf8");
  while (byteLength(truncated) > contentBytes) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}${TRUNCATION_SUFFIX}`;
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function isPathInsideRoot(root: string, absolutePath: string): boolean {
  const relativePath = relative(root, absolutePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !/^[A-Za-z]:/.test(relativePath));
}

function normalizeRelativePath(path: string): string {
  return path.split(/[\\/]+/).filter(Boolean).join("/");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

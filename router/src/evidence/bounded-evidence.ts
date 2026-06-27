import type { EvidenceWindow } from "../config/types.js";

export interface LineRange {
  start: number;
  end: number;
}

export interface BoundedEvidenceCaps {
  queryExcerptMaxBytes: number;
  linePreviewMaxBytes: number;
  expandLines30MaxBytes: number;
  expandLines30MaxLines: number;
  expandLines80MaxBytes: number;
  expandLines80MaxLines: number;
  exactChunkMaxBytes: number;
}

export interface BuildBoundedExcerptOptions {
  lines: readonly string[];
  range: LineRange;
  window: EvidenceWindow;
  caps: BoundedEvidenceCaps;
  exactNormalizedPhrase?: string;
}

export interface BoundedExcerpt {
  range: LineRange;
  linesLabel: string;
  excerpt: string;
  truncatedByLineCap: boolean;
  truncatedByByteCap: boolean;
}

export interface BoundedEdgeChunk {
  range: LineRange;
  linesLabel: string;
  edge: "head" | "tail";
  excerpt: string;
}

const TRUNCATION_SUFFIX = " … [truncated; expand or retrieve exact lines for recovery]";
const TRUNCATION_PREFIX = "[truncated head; expand or retrieve exact lines for recovery] … ";

export function buildBoundedEdgeChunks(options: {
  lines: readonly string[];
  range: LineRange;
  caps: BoundedEvidenceCaps;
}): BoundedEdgeChunk[] {
  return overCapEdgeRanges(options.lines, options.range, options.caps).map((range) => {
    const excerpt = range.edge === "tail"
      ? truncateTailToUtf8Bytes(linesForRange(options.lines, range), options.caps.exactChunkMaxBytes)
      : truncateToUtf8Bytes(linesForRange(options.lines, range), options.caps.exactChunkMaxBytes);
    return {
      range: { start: range.start, end: range.end },
      linesLabel: `${range.start}-${range.end}`,
      edge: range.edge,
      excerpt,
    };
  });
}

export function buildBoundedExcerpt(options: BuildBoundedExcerptOptions): BoundedExcerpt {
  const capped = capLineRangeForWindow(options.range, options.window, options.caps);
  const selected = options.lines.slice(capped.range.start - 1, capped.range.end);
  const maxBytes = maxExcerptBytesForWindow(options.window, options.caps);
  if (maxBytes !== null && options.exactNormalizedPhrase !== undefined) {
    const exactExcerpt = excerptAroundNormalizedPhrase(selected.join("\n"), options.exactNormalizedPhrase, maxBytes);
    if (exactExcerpt !== null) {
      return {
        range: capped.range,
        linesLabel: `${capped.range.start}-${capped.range.end}`,
        excerpt: exactExcerpt,
        truncatedByLineCap: capped.truncated,
        truncatedByByteCap: byteLength(selected.join("\n")) > maxBytes,
      };
    }
  }

  const previewedLines = maxBytes !== null
    ? selected.map((line) => truncateLinePreview(line, options.caps.linePreviewMaxBytes, options.exactNormalizedPhrase))
    : selected;
  const uncappedExcerpt = previewedLines.join("\n");
  const excerpt = maxBytes === null ? uncappedExcerpt : truncateToUtf8Bytes(uncappedExcerpt, maxBytes);
  return {
    range: capped.range,
    linesLabel: `${capped.range.start}-${capped.range.end}`,
    excerpt,
    truncatedByLineCap: capped.truncated,
    truncatedByByteCap: maxBytes !== null && byteLength(uncappedExcerpt) > maxBytes,
  };
}

interface OverCapEdgeRange extends LineRange {
  edge: "head" | "tail";
}

function overCapEdgeRanges(lines: readonly string[], range: LineRange, caps: BoundedEvidenceCaps): OverCapEdgeRange[] {
  const lineCount = range.end - range.start + 1;
  const chunkLineCount = Math.min(10, Math.max(1, Math.floor(lineCount / 2)));
  const headRange = shrinkRangeToMaxBytes(
    lines,
    { start: range.start, end: Math.min(range.end, range.start + chunkLineCount - 1) },
    "head",
    caps,
  );
  const tailRange = shrinkRangeToMaxBytes(
    lines,
    { start: Math.max(range.start, range.end - chunkLineCount + 1), end: range.end },
    "tail",
    caps,
  );
  const head: OverCapEdgeRange = { ...headRange, edge: "head" };
  const tail: OverCapEdgeRange = { ...tailRange, edge: "tail" };

  if (tail.start <= head.end) {
    return byteLength(linesForRange(lines, head)) > caps.exactChunkMaxBytes ? [head, tail] : [head];
  }

  return [head, tail];
}

function shrinkRangeToMaxBytes(
  lines: readonly string[],
  range: LineRange,
  edge: "head" | "tail",
  caps: BoundedEvidenceCaps,
): LineRange {
  let current = range;
  while (current.end > current.start && byteLength(linesForRange(lines, current)) > caps.exactChunkMaxBytes) {
    current = edge === "head" ? { start: current.start, end: current.end - 1 } : { start: current.start + 1, end: current.end };
  }
  return current;
}

function linesForRange(lines: readonly string[], range: LineRange): string {
  return lines.slice(range.start - 1, range.end).join("\n");
}

function capLineRangeForWindow(
  range: LineRange,
  window: EvidenceWindow,
  caps: BoundedEvidenceCaps,
): { range: LineRange; truncated: boolean } {
  const maxLines = maxLinesForWindow(window, caps);
  const lineCount = range.end - range.start + 1;
  if (maxLines === null || lineCount <= maxLines) {
    return { range, truncated: false };
  }

  return {
    range: { start: range.start, end: range.start + maxLines - 1 },
    truncated: true,
  };
}

function maxLinesForWindow(window: EvidenceWindow, caps: BoundedEvidenceCaps): number | null {
  if (window === "lines_30") {
    return caps.expandLines30MaxLines;
  }
  if (window === "lines_80") {
    return caps.expandLines80MaxLines;
  }
  return null;
}

function maxExcerptBytesForWindow(window: EvidenceWindow, caps: BoundedEvidenceCaps): number | null {
  if (window === "small" || window === "section") {
    return caps.queryExcerptMaxBytes;
  }
  if (window === "lines_30") {
    return caps.expandLines30MaxBytes;
  }
  if (window === "lines_80") {
    return caps.expandLines80MaxBytes;
  }
  return null;
}

function excerptAroundNormalizedPhrase(text: string, exactNormalizedPhrase: string, maxBytes: number): string | null {
  const span = normalizedPhraseRawSpan(text, exactNormalizedPhrase);
  if (span === null) {
    return null;
  }
  return truncateToUtf8BytesAroundSpan(text, span, maxBytes);
}

function truncateLinePreview(text: string, maxBytes: number, exactNormalizedPhrase?: string): string {
  if (exactNormalizedPhrase === undefined || byteLength(text) <= maxBytes) {
    return truncateToUtf8Bytes(text, maxBytes);
  }

  const span = normalizedPhraseRawSpan(text, exactNormalizedPhrase);
  if (span === null) {
    return truncateToUtf8Bytes(text, maxBytes);
  }

  return truncateToUtf8BytesAroundSpan(text, span, maxBytes);
}

function truncateToUtf8Bytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) {
    return text;
  }

  const suffixBytes = byteLength(TRUNCATION_SUFFIX);
  const contentBytes = Math.max(0, maxBytes - suffixBytes);
  return `${truncateHeadToUtf8Bytes(text, contentBytes)}${TRUNCATION_SUFFIX}`;
}

function truncateToUtf8BytesAroundSpan(text: string, span: { start: number; end: number }, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) {
    return text;
  }

  const prefix = span.start > 0 ? TRUNCATION_PREFIX : "";
  const suffix = span.end < text.length ? TRUNCATION_SUFFIX : "";
  const budget = maxBytes - byteLength(prefix) - byteLength(suffix);
  const phrase = text.slice(span.start, span.end);
  const phraseBytes = byteLength(phrase);
  if (budget <= 0 || phraseBytes >= budget) {
    return truncateToUtf8Bytes(text.slice(span.start), maxBytes);
  }

  const contextBudget = budget - phraseBytes;
  const beforeBudget = Math.floor(contextBudget / 2);
  const afterBudget = contextBudget - beforeBudget;
  let start = span.start;
  while (start > 0 && byteLength(text.slice(start - 1, span.start)) <= beforeBudget) {
    start -= 1;
  }
  if (byteLength(text.slice(start, span.start)) > beforeBudget) {
    start += 1;
  }

  let end = span.end;
  while (end < text.length && byteLength(text.slice(span.end, end + 1)) <= afterBudget) {
    end += 1;
  }
  if (byteLength(text.slice(span.end, end)) > afterBudget) {
    end -= 1;
  }

  start = moveToCodePointStartBoundary(text, start);
  end = moveToCodePointEndBoundary(text, end);

  const actualPrefix = start > 0 ? prefix : "";
  const actualSuffix = end < text.length ? suffix : "";
  return `${actualPrefix}${text.slice(start, end)}${actualSuffix}`;
}

function normalizedPhraseRawSpan(text: string, normalizedPhrase: string): { start: number; end: number } | null {
  const phraseTokens = normalizedPhrase.split(/\s+/).filter(Boolean);
  if (phraseTokens.length === 0) {
    return null;
  }

  const spans = tokenSpansForPhrase(text);
  for (let startIndex = 0; startIndex <= spans.length - phraseTokens.length; startIndex += 1) {
    let matched = true;
    for (let offset = 0; offset < phraseTokens.length; offset += 1) {
      if (spans[startIndex + offset]?.token !== phraseTokens[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      const first = spans[startIndex];
      const last = spans[startIndex + phraseTokens.length - 1];
      if (first !== undefined && last !== undefined) {
        return { start: first.start, end: last.end };
      }
    }
  }

  return null;
}

function tokenSpansForPhrase(text: string): Array<{ token: string; start: number; end: number }> {
  const spans: Array<{ token: string; start: number; end: number }> = [];
  for (const match of text.matchAll(/[A-Za-z0-9_./-]+/g)) {
    const rawToken = match[0];
    const start = match.index ?? 0;
    const end = start + rawToken.length;
    for (const token of expandedIdentifierTokens(rawToken)) {
      if (token.length >= 2) {
        spans.push({ token, start, end });
      }
    }
  }
  return spans;
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

function truncateTailToUtf8Bytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) {
    return text;
  }

  const prefixBytes = byteLength(TRUNCATION_PREFIX);
  const contentBytes = Math.max(0, maxBytes - prefixBytes);
  return `${TRUNCATION_PREFIX}${truncateTailToUtf8BytesContent(text, contentBytes)}`;
}

function truncateHeadToUtf8Bytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }
  if (byteLength(text) <= maxBytes) {
    return text;
  }

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(text.slice(0, mid)) <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return text.slice(0, moveToCodePointEndBoundary(text, low));
}

function truncateTailToUtf8BytesContent(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }
  if (byteLength(text) <= maxBytes) {
    return text;
  }

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (byteLength(text.slice(mid)) <= maxBytes) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return text.slice(moveToCodePointStartBoundary(text, low));
}

function moveToCodePointStartBoundary(text: string, index: number): number {
  if (index > 0 && index < text.length && isLowSurrogate(text.charCodeAt(index))) {
    return index + 1;
  }
  return index;
}

function moveToCodePointEndBoundary(text: string, index: number): number {
  if (index > 0 && isHighSurrogate(text.charCodeAt(index - 1))) {
    return index - 1;
  }
  return index;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

import type { ImportantLine } from "./types.js";

export type ImportantStream = ImportantLine["stream"];

export interface LineEntry {
  line: string;
  lineNumber: number;
}

export interface EvidenceCaps {
  maxLines?: number;
  maxExcerptBytes?: number;
  maxLineBytes?: number;
}

export interface BoundedEvidence {
  importantLines: ImportantLine[];
  fidelity: "exact" | "lossy";
  compressed: boolean;
  selectedLineCount: number;
  sourceLineCount: number;
}

export const DEFAULT_MAX_IMPORTANT_LINES = 8;
export const DEFAULT_MAX_IMPORTANT_EXCERPT_BYTES = 8 * 1024;
export const DEFAULT_MAX_IMPORTANT_LINE_BYTES = 2 * 1024;
export const TRUNCATION_MARKER = "… [truncated; recover exact output from vault]";

export function assembleImportantLines(options: {
  stream: ImportantStream;
  entries: readonly LineEntry[];
  sourceText: string;
  caps?: EvidenceCaps;
}): BoundedEvidence {
  const caps = normalizeCaps(options.caps);
  const sourceLineCount = countLines(options.sourceText);
  const sortedEntries = uniqueSortedEntries(options.entries).slice(0, caps.maxLines);
  const sourceEntries = lineEntries(options.sourceText);

  if (sortedEntries.length === 0) {
    return {
      importantLines: [],
      fidelity: "exact",
      compressed: sourceLineCount > 0,
      selectedLineCount: 0,
      sourceLineCount,
    };
  }

  const selectedLineNumbers = new Set(sortedEntries.map((entry) => entry.lineNumber));
  const omittedSelectedEntries = uniqueSortedEntries(options.entries).length > sortedEntries.length;
  const omittedSourceEntries = sourceEntries.some((entry) => !selectedLineNumbers.has(entry.lineNumber));
  const groups = contiguousGroups(sortedEntries);
  const importantLines: ImportantLine[] = [];
  let remainingBytes = caps.maxExcerptBytes;
  let lossy = omittedSelectedEntries;
  let selectedLineCount = 0;

  for (const group of groups) {
    if (remainingBytes <= 0) {
      lossy = true;
      break;
    }

    const built = buildBoundedExcerpt(group, remainingBytes, caps.maxLineBytes);
    if (built.excerpt.length === 0 && group.length > 0) {
      lossy = true;
      break;
    }

    importantLines.push({
      stream: options.stream,
      lines: lineRange(built.entries),
      excerpt: built.excerpt,
    });
    remainingBytes -= byteLength(built.excerpt);
    selectedLineCount += built.selectedLineCount;
    lossy = lossy || built.lossy;
  }

  return {
    importantLines,
    fidelity: lossy ? "lossy" : "exact",
    compressed: lossy || omittedSourceEntries,
    selectedLineCount,
    sourceLineCount,
  };
}

export function assembleTextEvidence(options: {
  stream: ImportantStream;
  text: string;
  caps?: EvidenceCaps;
}): BoundedEvidence {
  const caps = normalizeCaps(options.caps);
  const entries = lineEntries(options.text);
  const sourceLineCount = entries.length;

  if (entries.length === 0) {
    return {
      importantLines: [],
      fidelity: "exact",
      compressed: false,
      selectedLineCount: 0,
      sourceLineCount,
    };
  }

  if (
    entries.length <= caps.maxLines &&
    byteLength(options.text) <= caps.maxExcerptBytes &&
    entries.every((entry) => byteLength(entry.line) <= caps.maxLineBytes)
  ) {
    return {
      importantLines: [
        {
          stream: options.stream,
          lines: lineRange(entries),
          excerpt: options.text,
        },
      ],
      fidelity: "exact",
      compressed: false,
      selectedLineCount: entries.length,
      sourceLineCount,
    };
  }

  return assembleImportantLines({ stream: options.stream, entries, sourceText: options.text, caps });
}

export function lineEntries(text: string): LineEntry[] {
  return splitLines(text).map((line, index) => ({ line, lineNumber: index + 1 }));
}

export function nonEmptyLineEntries(text: string): LineEntry[] {
  return lineEntries(text).filter((entry) => entry.line.trim().length > 0);
}

export function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

export function countLines(text: string): number {
  return splitLines(text).length;
}

export function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function normalizeCaps(caps: EvidenceCaps | undefined): Required<EvidenceCaps> {
  return {
    maxLines: caps?.maxLines ?? DEFAULT_MAX_IMPORTANT_LINES,
    maxExcerptBytes: caps?.maxExcerptBytes ?? DEFAULT_MAX_IMPORTANT_EXCERPT_BYTES,
    maxLineBytes: caps?.maxLineBytes ?? DEFAULT_MAX_IMPORTANT_LINE_BYTES,
  };
}

function uniqueSortedEntries(entries: readonly LineEntry[]): LineEntry[] {
  const byLineNumber = new Map<number, LineEntry>();
  for (const entry of entries) {
    if (entry.lineNumber <= 0 || byLineNumber.has(entry.lineNumber)) {
      continue;
    }
    byLineNumber.set(entry.lineNumber, entry);
  }
  return [...byLineNumber.values()].sort((a, b) => a.lineNumber - b.lineNumber);
}

function contiguousGroups(entries: readonly LineEntry[]): LineEntry[][] {
  const groups: LineEntry[][] = [];
  let current: LineEntry[] = [];

  for (const entry of entries) {
    const previous = current[current.length - 1];
    if (!previous || entry.lineNumber === previous.lineNumber + 1) {
      current.push(entry);
      continue;
    }

    groups.push(current);
    current = [entry];
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function buildBoundedExcerpt(
  entries: readonly LineEntry[],
  maxExcerptBytes: number,
  maxLineBytes: number,
): { excerpt: string; entries: LineEntry[]; lossy: boolean; selectedLineCount: number } {
  const parts: string[] = [];
  const includedEntries: LineEntry[] = [];
  let remainingBytes = maxExcerptBytes;
  let lossy = false;
  let selectedLineCount = 0;

  for (const entry of entries) {
    const separatorBytes = parts.length === 0 ? 0 : 1;
    const remainingForLine = remainingBytes - separatorBytes;
    if (remainingForLine <= 0) {
      lossy = true;
      break;
    }

    const line = truncateLine(entry.line, Math.min(maxLineBytes, remainingForLine));
    if (parts.length > 0) {
      remainingBytes -= 1;
    }
    parts.push(line.text);
    includedEntries.push(entry);
    remainingBytes -= byteLength(line.text);
    selectedLineCount += 1;
    lossy = lossy || line.lossy;
  }

  return { excerpt: parts.join("\n"), entries: includedEntries, lossy, selectedLineCount };
}

function truncateLine(line: string, maxBytes: number): { text: string; lossy: boolean } {
  if (byteLength(line) <= maxBytes) {
    return { text: line, lossy: false };
  }

  if (maxBytes <= 0) {
    return { text: "", lossy: true };
  }

  const markerBytes = byteLength(TRUNCATION_MARKER);
  if (maxBytes <= markerBytes) {
    return { text: truncateUtf8(TRUNCATION_MARKER, maxBytes), lossy: true };
  }

  return {
    text: `${truncateUtf8(line, maxBytes - markerBytes)}${TRUNCATION_MARKER}`,
    lossy: true,
  };
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) {
    return text;
  }

  let end = Math.min(text.length, maxBytes);
  while (end > 0 && byteLength(text.slice(0, end)) > maxBytes) {
    end -= 1;
  }
  return text.slice(0, end);
}

function lineRange(entries: readonly LineEntry[]): string {
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (!first || !last) {
    return "1-1";
  }
  return first.lineNumber === last.lineNumber ? `${first.lineNumber}-${first.lineNumber}` : `${first.lineNumber}-${last.lineNumber}`;
}

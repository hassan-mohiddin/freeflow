import {
  assembleImportantLines,
  lineEntries,
  type BoundedEvidence,
  type LineEntry,
} from "./evidence.js";
import type { ImportantLine, RunOutputFilterMetadata } from "./types.js";
export type { RunOutputFilterMetadata } from "./types.js";

export const RUN_FILTER_STREAMS = ["stdout", "stderr", "combined"] as const;
export type RunFilterStream = (typeof RUN_FILTER_STREAMS)[number];

export interface RunOutputFiltersInput {
  stream?: RunFilterStream;
  include?: string | readonly string[];
  exclude?: string | readonly string[];
  flags?: string;
  head?: number;
  tail?: number;
  maxLines?: number;
  maxBytes?: number;
}

export interface NormalizedRunOutputFilters {
  stream?: RunFilterStream;
  include: string[];
  exclude: string[];
  flags: string;
  head?: number;
  tail?: number;
  maxLines?: number;
  maxBytes?: number;
}

export interface RunOutputFilterResult {
  stream: RunFilterStream;
  evidence: BoundedEvidence;
  metadata: RunOutputFilterMetadata;
  description: string;
}

export type RunOutputFilterValidationResult =
  | { ok: true; filters?: NormalizedRunOutputFilters }
  | { ok: false; message: string; path: string };

export function normalizeRunOutputFilters(input: unknown): RunOutputFilterValidationResult {
  if (input === undefined || input === null) {
    return { ok: true };
  }
  if (!isRecord(input)) {
    return { ok: false, path: "$.filters", message: "freeflow_run filters must be an object." };
  }

  const filters: NormalizedRunOutputFilters = {
    include: [],
    exclude: [],
    flags: typeof input.flags === "string" ? input.flags : "",
  };

  if (input.stream !== undefined) {
    if (!isRunFilterStream(input.stream)) {
      return { ok: false, path: "$.filters.stream", message: "filters.stream must be stdout, stderr, or combined." };
    }
    filters.stream = input.stream;
  }

  for (const key of ["include", "exclude"] as const) {
    const normalized = normalizeStringList(input[key], `$.filters.${key}`);
    if (!normalized.ok) {
      return normalized;
    }
    filters[key] = normalized.values;
  }

  if (!/^(?!.*([gimsu]).*\1)[gimsu]*$/.test(filters.flags)) {
    return { ok: false, path: "$.filters.flags", message: "filters.flags may contain g, i, m, s, or u without duplicates." };
  }

  for (const key of ["head", "tail", "maxLines", "maxBytes"] as const) {
    if (input[key] === undefined) {
      continue;
    }
    const value = input[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return { ok: false, path: `$.filters.${key}`, message: `${key} must be a positive integer.` };
    }
    filters[key] = value;
  }

  for (const [kind, patterns] of [
    ["include", filters.include],
    ["exclude", filters.exclude],
  ] as const) {
    for (const pattern of patterns) {
      try {
        new RegExp(pattern, filters.flags);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, path: `$.filters.${kind}`, message: `Invalid ${kind} regex ${JSON.stringify(pattern)}: ${message}` };
      }
    }
  }

  return { ok: true, filters };
}

export function hasRunOutputFilters(filters: NormalizedRunOutputFilters | undefined): filters is NormalizedRunOutputFilters {
  return Boolean(
    filters &&
      (filters.stream ||
        filters.include.length > 0 ||
        filters.exclude.length > 0 ||
        filters.head !== undefined ||
        filters.tail !== undefined ||
        filters.maxLines !== undefined ||
        filters.maxBytes !== undefined),
  );
}

export function applyRunOutputFilters(options: {
  filters: NormalizedRunOutputFilters;
  defaultStream: RunFilterStream;
  stdout: string;
  stderr: string;
  combined: string;
  fallbackImportantLines?: readonly ImportantLine[];
  preserveFallbackFailureEvidence?: boolean;
  caps?: {
    maxLines?: number;
    maxExcerptBytes?: number;
    maxLineBytes?: number;
  };
}): RunOutputFilterResult {
  const stream = options.filters.stream ?? options.defaultStream;
  const text = streamText(stream, options);
  const sourceEntries = lineEntries(text);
  const includeRegexes = options.filters.include.map((pattern) => new RegExp(pattern, options.filters.flags));
  const excludeRegexes = options.filters.exclude.map((pattern) => new RegExp(pattern, options.filters.flags));

  let selected = sourceEntries.filter((entry) => {
    if (includeRegexes.length > 0 && !includeRegexes.some((regex) => regex.test(entry.line))) {
      return false;
    }
    if (excludeRegexes.some((regex) => regex.test(entry.line))) {
      return false;
    }
    return true;
  });

  selected = applyHeadTail(selected, options.filters.head, options.filters.tail);
  if (options.filters.maxLines !== undefined) {
    selected = selected.slice(0, options.filters.maxLines);
  }

  let fallbackPreservedFailureEvidence = false;
  let evidence: BoundedEvidence;
  if (selected.length === 0 && options.preserveFallbackFailureEvidence && options.fallbackImportantLines?.length) {
    fallbackPreservedFailureEvidence = true;
    evidence = importantLinesAsEvidence(options.fallbackImportantLines, text);
  } else {
    const caps: { maxLines?: number; maxExcerptBytes?: number; maxLineBytes?: number } = {};
    const maxLines = options.filters.maxLines ?? options.caps?.maxLines;
    const maxExcerptBytes = options.filters.maxBytes ?? options.caps?.maxExcerptBytes;
    const maxLineBytes = options.filters.maxBytes ?? options.caps?.maxLineBytes;
    if (maxLines !== undefined) {
      caps.maxLines = maxLines;
    }
    if (maxExcerptBytes !== undefined) {
      caps.maxExcerptBytes = maxExcerptBytes;
    }
    if (maxLineBytes !== undefined) {
      caps.maxLineBytes = maxLineBytes;
    }
    evidence = assembleImportantLines({
      stream,
      entries: selected,
      sourceText: text,
      caps,
    });
  }

  const metadata: RunOutputFilterMetadata = {
    stream,
    sourceLines: sourceEntries.length,
    selectedLines: selected.length,
  };
  if (options.filters.include.length > 0) {
    metadata.include = options.filters.include;
  }
  if (options.filters.exclude.length > 0) {
    metadata.exclude = options.filters.exclude;
  }
  if (options.filters.flags) {
    metadata.flags = options.filters.flags;
  }
  if (options.filters.head !== undefined) {
    metadata.head = options.filters.head;
  }
  if (options.filters.tail !== undefined) {
    metadata.tail = options.filters.tail;
  }
  if (options.filters.maxLines !== undefined) {
    metadata.maxLines = options.filters.maxLines;
  }
  if (options.filters.maxBytes !== undefined) {
    metadata.maxBytes = options.filters.maxBytes;
  }
  if (fallbackPreservedFailureEvidence) {
    metadata.fallbackPreservedFailureEvidence = true;
  }

  return {
    stream,
    evidence,
    metadata,
    description: describeRunOutputFilters(metadata),
  };
}

function normalizeStringList(value: unknown, path: string): { ok: true; values: string[] } | { ok: false; path: string; message: string } {
  if (value === undefined) {
    return { ok: true, values: [] };
  }
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : undefined;
  if (!values) {
    return { ok: false, path, message: `${path} must be a string or string array.` };
  }
  if (!values.every((item) => typeof item === "string" && item.length > 0)) {
    return { ok: false, path, message: `${path} must contain non-empty strings.` };
  }
  return { ok: true, values: [...values] };
}

function isRunFilterStream(value: unknown): value is RunFilterStream {
  return typeof value === "string" && (RUN_FILTER_STREAMS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function streamText(stream: RunFilterStream, options: { stdout: string; stderr: string; combined: string }): string {
  if (stream === "stdout") {
    return options.stdout;
  }
  if (stream === "stderr") {
    return options.stderr;
  }
  return options.combined;
}

function applyHeadTail(entries: LineEntry[], head: number | undefined, tail: number | undefined): LineEntry[] {
  if (head === undefined && tail === undefined) {
    return entries;
  }
  if (head !== undefined && tail !== undefined) {
    const byLine = new Map<number, LineEntry>();
    for (const entry of [...entries.slice(0, head), ...entries.slice(Math.max(0, entries.length - tail))]) {
      byLine.set(entry.lineNumber, entry);
    }
    return [...byLine.values()].sort((left, right) => left.lineNumber - right.lineNumber);
  }
  if (head !== undefined) {
    return entries.slice(0, head);
  }
  return entries.slice(Math.max(0, entries.length - tail!));
}

function importantLinesAsEvidence(importantLines: readonly ImportantLine[], sourceText: string): BoundedEvidence {
  return {
    importantLines: [...importantLines],
    fidelity: "exact",
    compressed: true,
    selectedLineCount: importantLines.length,
    sourceLineCount: lineEntries(sourceText).length,
  };
}

export function describeRunOutputFilters(metadata: RunOutputFilterMetadata): string {
  const parts = [`stream=${metadata.stream}`];
  if (metadata.include?.length) {
    parts.push(`include=${metadata.include.map((pattern) => JSON.stringify(pattern)).join("|")}`);
  }
  if (metadata.exclude?.length) {
    parts.push(`exclude=${metadata.exclude.map((pattern) => JSON.stringify(pattern)).join("|")}`);
  }
  if (metadata.flags) {
    parts.push(`flags=${metadata.flags}`);
  }
  if (metadata.head !== undefined) {
    parts.push(`head=${metadata.head}`);
  }
  if (metadata.tail !== undefined) {
    parts.push(`tail=${metadata.tail}`);
  }
  if (metadata.maxLines !== undefined) {
    parts.push(`maxLines=${metadata.maxLines}`);
  }
  if (metadata.maxBytes !== undefined) {
    parts.push(`maxBytes=${metadata.maxBytes}`);
  }
  parts.push(`selected=${metadata.selectedLines}/${metadata.sourceLines} lines`);
  if (metadata.fallbackPreservedFailureEvidence) {
    parts.push("fallback=failure-evidence");
  }
  return parts.join(" ");
}

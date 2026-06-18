import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { createVault, readOutputText, readVaultRecord } from "./vault.js";
import type {
  EvidencePacket,
  EvidenceWindow,
  OutputStream,
  PreserveMode,
  RetrievalAction,
  RetrievalRoutedResult,
} from "./types.js";

export interface RepoRetrieveSourceInput {
  kind: "repo";
  root: string;
  path?: string;
}

export interface VaultRetrieveSourceInput {
  kind: "vault";
  root: string;
  sessionId: string;
  outputId: string;
  stream?: OutputStream;
}

export type RetrieveSourceInput = RepoRetrieveSourceInput | VaultRetrieveSourceInput;

export type RepoExpansion = "lines_30" | "lines_80" | "full";

export interface RetrieveLineRangeInput {
  start: number;
  end: number;
}

export interface FreeflowRetrieveOptions {
  action: RetrievalAction;
  source: RetrieveSourceInput;
  query?: string;
  preserve?: PreserveMode;
  evidence?: EvidencePacket;
  expansion?: RepoExpansion;
  maxFullBytes?: number;
  lineRange?: RetrieveLineRangeInput;
  topK?: number;
  decision?: RetrievalRoutedResult;
}

type RepoRetrieveOptions = FreeflowRetrieveOptions & { source: RepoRetrieveSourceInput };
type VaultRetrieveOptions = FreeflowRetrieveOptions & { source: VaultRetrieveSourceInput };

interface RepoTextFile {
  path: string;
  absolutePath: string;
  text: string;
  lines: string[];
}

interface RepoTextFileRef {
  path: string;
  absolutePath: string;
}

interface CandidateSpan {
  file: RepoTextFile;
  lineIndex: number;
  score: number;
  reason: string;
  range?: LineRange;
}

interface CandidateChunk {
  file: RepoTextFile;
  range: LineRange;
  text: string;
  heading?: string;
  kind: "section" | "symbol" | "window";
  tokens?: string[];
  phraseSequence?: string;
}

const DEFAULT_CONTEXT_LINES = 2;
const DEFAULT_QUERY_TOP_K = 1;
const DEFAULT_LOCATE_TOP_K = 5;
const MAX_TOP_K = 10;
const QUERY_EXCERPT_MAX_BYTES = 8_192;
const LINE_PREVIEW_MAX_BYTES = 2_048;
const EXPAND_LINES_30_MAX_BYTES = 32 * 1024;
const EXPAND_LINES_30_MAX_LINES = 120;
const EXPAND_LINES_80_MAX_BYTES = 64 * 1024;
const EXPAND_LINES_80_MAX_LINES = 240;
const EXACT_LINE_RANGE_MAX_BYTES = 64_000;
const EXACT_CHUNK_MAX_BYTES = 32_000;
const BROAD_SCAN_MAX_FILE_BYTES = 1024 * 1024;
const CONCURRENT_REPO_FILE_READS = 32;
const TRUNCATION_SUFFIX = " … [truncated; expand or retrieve exact lines for recovery]";
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
  "use",
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

export async function freeflowRetrieve(options: FreeflowRetrieveOptions): Promise<RetrievalRoutedResult> {
  const preserve = options.preserve ?? "important";

  try {
    if (options.source.kind === "vault") {
      return await retrieveVault(options as VaultRetrieveOptions, preserve);
    }

    const root = resolve(options.source.root);

    if (options.action === "query") {
      return await queryRepo(root, options as RepoRetrieveOptions, preserve);
    }

    if (options.action === "locate") {
      return await locateRepo(root, options as RepoRetrieveOptions, preserve);
    }

    if (options.action === "expand") {
      return await expandRepoEvidence(root, options as RepoRetrieveOptions, preserve);
    }

    if (options.action === "retrieve") {
      return await retrieveRepoPath(root, options as RepoRetrieveOptions, preserve);
    }

    if (options.action === "explain") {
      return explainRepoDecision(options, preserve);
    }

    return errorResult(preserve, `Retrieval action ${options.action} is not implemented yet.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(preserve, `freeflow_retrieve failed while reading ${options.source.kind} source: ${message}`);
  }
}

async function retrieveVault(
  options: VaultRetrieveOptions,
  preserve: PreserveMode,
): Promise<RetrievalRoutedResult> {
  if (options.action === "retrieve") {
    return retrieveVaultLines(options, preserve);
  }

  if (options.action === "expand") {
    return expandVaultEvidence(options, preserve);
  }

  if (options.action === "explain") {
    return explainVaultOutput(options, preserve);
  }

  if (options.action !== "query") {
    return errorResult(preserve, `Vault retrieval action ${options.action} is not implemented yet.`);
  }

  if (!options.query?.trim()) {
    return errorResult(preserve, "Vault query requires a non-empty query string.");
  }

  const stream = options.source.stream ?? "combined";
  const vault = createVault({ root: options.source.root });
  const text = await readOutputText(vault, options.source.sessionId, options.source.outputId, stream);
  const lines = splitLines(text);
  const candidateLine = findBestLine(lines, options.query);

  if (candidateLine === null) {
    return {
      toolStatus: "ok",
      decisionId: decisionId("vault-query", options.source.outputId, stream, options.query, "none"),
      preserve,
      source: { kind: "vault", outputId: options.source.outputId, stream },
      routing: {
        status: "routed",
        route: "retrieve",
        reason: "Deterministic lexical vault retrieval found no matching output evidence.",
      },
      evidence: [],
      recovery: {
        how: `Refine the query or use freeflow_retrieve action=retrieve with outputId=${options.source.outputId} and an exact line range.`,
        outputId: options.source.outputId,
      },
    };
  }

  const start = Math.max(0, candidateLine - DEFAULT_CONTEXT_LINES);
  const end = Math.min(lines.length - 1, candidateLine + DEFAULT_CONTEXT_LINES);
  const evidenceLines = `${start + 1}-${end + 1}`;
  const evidence: EvidencePacket = {
    id: evidenceIdFor(`${options.source.outputId}:${stream}`, evidenceLines, options.query),
    source: { kind: "vault", outputId: options.source.outputId, stream },
    path: `${options.source.outputId}:${stream}`,
    lines: evidenceLines,
    excerpt: excerptForLineRange(lines, { start: start + 1, end: end + 1 }, "small"),
    why: `Deterministic lexical match for query terms in vaulted ${stream} output near line ${candidateLine + 1}.`,
    window: "small",
    expandable: true,
  };

  return {
    toolStatus: "ok",
    decisionId: decisionId("vault-query", options.source.outputId, stream, options.query, evidenceLines),
    preserve,
    source: { kind: "vault", outputId: options.source.outputId, stream },
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Deterministic lexical retrieval selected vaulted outputId=${options.source.outputId} stream=${stream} lines=${evidenceLines}.`,
    },
    evidence: [evidence],
    recovery: {
      how: `Use freeflow_retrieve action=expand with evidenceId=${evidence.id}, or action=retrieve with outputId=${options.source.outputId} and stream=${stream}.`,
      outputId: options.source.outputId,
      evidenceId: evidence.id,
    },
  };
}

async function retrieveVaultLines(
  options: VaultRetrieveOptions,
  preserve: PreserveMode,
): Promise<RetrievalRoutedResult> {
  const stream = options.source.stream ?? "combined";
  const lineRange = options.lineRange;
  if (!lineRange || !isValidLineRange(lineRange)) {
    return errorResult(preserve, "Vault retrieve requires a valid 1-based lineRange.");
  }

  const vault = createVault({ root: options.source.root });
  const text = await readOutputText(vault, options.source.sessionId, options.source.outputId, stream);
  const lines = splitLines(text);
  const end = Math.min(lineRange.end, lines.length);
  const start = Math.min(lineRange.start, end);
  const evidenceLines = `${start}-${end}`;
  const excerpt = lines.slice(start - 1, end).join("\n");
  if (byteLength(excerpt) > EXACT_LINE_RANGE_MAX_BYTES) {
    return retrieveVaultLineRangeOverCap(options, preserve, stream, lines, { start, end }, byteLength(excerpt));
  }

  const evidence: EvidencePacket = {
    id: evidenceIdFor(`${options.source.outputId}:${stream}`, evidenceLines, "retrieve"),
    source: { kind: "vault", outputId: options.source.outputId, stream },
    path: `${options.source.outputId}:${stream}`,
    lines: evidenceLines,
    excerpt,
    why: `Retrieved exact vaulted ${stream} output lines ${evidenceLines}.`,
    window: "exact",
    expandable: true,
  };

  return {
    toolStatus: "ok",
    decisionId: decisionId("vault-retrieve", options.source.outputId, stream, evidenceLines),
    preserve,
    source: { kind: "vault", outputId: options.source.outputId, stream },
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Retrieved exact vaulted outputId=${options.source.outputId} stream=${stream} lines=${evidenceLines}.`,
    },
    evidence: [evidence],
    recovery: {
      how: `Use freeflow_retrieve action=expand with evidenceId=${evidence.id} for more vaulted output context.`,
      outputId: options.source.outputId,
      evidenceId: evidence.id,
    },
  };
}

function retrieveVaultLineRangeOverCap(
  options: VaultRetrieveOptions,
  preserve: PreserveMode,
  stream: OutputStream,
  lines: readonly string[],
  requestedRange: LineRange,
  requestedBytes: number,
): RetrievalRoutedResult {
  const ranges = overCapEdgeRanges(lines, requestedRange);
  const evidence = ranges.map((range, index): EvidencePacket => {
    const evidenceLines = `${range.start}-${range.end}`;
    return {
      id: evidenceIdFor(`${options.source.outputId}:${stream}`, evidenceLines, `retrieve-over-cap-${index}`),
      source: { kind: "vault", outputId: options.source.outputId, stream },
      path: `${options.source.outputId}:${stream}`,
      lines: evidenceLines,
      excerpt: boundedExactChunkExcerpt(lines, range),
      why: `Bounded recoverable ${index === 0 ? "head" : "tail"} preview for vaulted ${stream} output line range over cap ${EXACT_LINE_RANGE_MAX_BYTES}.`,
      window: "small",
      expandable: true,
    };
  });

  return {
    toolStatus: "ok",
    decisionId: decisionId(
      "vault-retrieve-lines-over-cap",
      options.source.outputId,
      stream,
      `${requestedRange.start}-${requestedRange.end}`,
      String(requestedBytes),
    ),
    preserve,
    source: { kind: "vault", outputId: options.source.outputId, stream },
    routing: {
      status: "partial",
      route: "retrieve",
      reason: `Requested vaulted outputId=${options.source.outputId} stream=${stream} lines=${requestedRange.start}-${requestedRange.end} is ${requestedBytes} bytes and exceeds cap ${EXACT_LINE_RANGE_MAX_BYTES}; returned bounded edge previews with recovery guidance.`,
    },
    evidence,
    recovery: {
      how: `Use narrower freeflow_retrieve action=retrieve lineRange spans for exact vaulted output recovery, or native vault file access if a full raw span is required.`,
      outputId: options.source.outputId,
    },
  };
}

function expandVaultEvidenceOverCap(
  options: VaultRetrieveOptions,
  preserve: PreserveMode,
  stream: OutputStream,
  evidence: EvidencePacket,
  lines: readonly string[],
  expandedRange: LineRange,
  expandedBytes: number,
): RetrievalRoutedResult {
  const chunks = overCapEdgeRanges(lines, expandedRange).map((range, index): EvidencePacket => {
    const evidenceLines = `${range.start}-${range.end}`;
    return {
      id: evidenceIdFor(`${options.source.outputId}:${stream}`, evidenceLines, `expand-over-cap-${index}`),
      source: { kind: "vault", outputId: options.source.outputId, stream },
      path: `${options.source.outputId}:${stream}`,
      lines: evidenceLines,
      excerpt: boundedExactChunkExcerpt(lines, range),
      why: `Bounded recoverable ${index === 0 ? "head" : "tail"} preview for vaulted ${stream} expansion over cap ${EXACT_LINE_RANGE_MAX_BYTES}.`,
      window: "small",
      expandable: true,
    };
  });
  const expandedLines = `${expandedRange.start}-${expandedRange.end}`;

  return {
    toolStatus: "ok",
    decisionId: decisionId("vault-expand-over-cap", evidence.id, expandedLines, String(expandedBytes)),
    preserve,
    source: { kind: "vault", outputId: options.source.outputId, stream },
    routing: {
      status: "partial",
      route: "retrieve",
      reason: `Expanded vaulted outputId=${options.source.outputId} stream=${stream} evidence ${evidence.id} to lines=${expandedLines}, but ${expandedBytes} bytes exceeds cap ${EXACT_LINE_RANGE_MAX_BYTES}; returned bounded edge chunks with recovery guidance.`,
    },
    evidence: chunks,
    recovery: {
      how: `Use narrower freeflow_retrieve action=retrieve lineRange spans for exact vaulted output recovery.`,
      outputId: options.source.outputId,
      evidenceId: evidence.id,
    },
  };
}

async function expandVaultEvidence(
  options: VaultRetrieveOptions,
  preserve: PreserveMode,
): Promise<RetrievalRoutedResult> {
  const evidence = options.evidence;
  if (!evidence?.lines || evidence.source.kind !== "vault") {
    return errorResult(preserve, "Vault expansion requires a previous vault evidence packet with lines.");
  }

  const stream = options.source.stream ?? evidence.source.stream ?? "combined";
  const originalRange = parseLineRange(evidence.lines);
  if (!originalRange) {
    return errorResult(preserve, `Cannot expand unsupported vault evidence line range ${evidence.lines}.`);
  }

  const expansion = options.expansion ?? "lines_30";
  const vault = createVault({ root: options.source.root });
  const text = await readOutputText(vault, options.source.sessionId, options.source.outputId, stream);
  const lines = splitLines(text);
  const expandedRange = expandLineRange(originalRange, lines.length, expansion);
  const window = windowForExpansion(expansion);
  const expandedExcerpt = lines.slice(expandedRange.start - 1, expandedRange.end).join("\n");
  if (expansion === "full" && byteLength(expandedExcerpt) > EXACT_LINE_RANGE_MAX_BYTES) {
    return expandVaultEvidenceOverCap(options, preserve, stream, evidence, lines, expandedRange, byteLength(expandedExcerpt));
  }

  const capped = capLineRangeForWindow(expandedRange, window);
  const expandedLines = `${capped.range.start}-${capped.range.end}`;
  const expandedEvidence: EvidencePacket = {
    ...evidence,
    source: { kind: "vault", outputId: options.source.outputId, stream },
    path: `${options.source.outputId}:${stream}`,
    lines: expandedLines,
    excerpt: excerptForLineRange(lines, capped.range, window),
    why: capped.truncated
      ? `Expanded deterministic vault evidence from ${evidence.lines} and bounded it to ${expandedLines} by the ${window} line cap.`
      : `Expanded deterministic vault evidence from ${evidence.lines} to ${expandedLines}.`,
    window,
    expandable: expansion !== "full",
  };

  return {
    toolStatus: "ok",
    decisionId: decisionId("vault-expand", evidence.id, expandedLines),
    preserve,
    source: { kind: "vault", outputId: options.source.outputId, stream },
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Expanded vaulted outputId=${options.source.outputId} stream=${stream} evidence ${evidence.id} to lines=${expandedLines}.`,
    },
    evidence: [expandedEvidence],
    recovery: {
      how: `Use freeflow_retrieve action=retrieve with outputId=${options.source.outputId}, stream=${stream}, and an exact line range for precise recovery.`,
      outputId: options.source.outputId,
      evidenceId: evidence.id,
    },
  };
}

async function explainVaultOutput(
  options: VaultRetrieveOptions,
  preserve: PreserveMode,
): Promise<RetrievalRoutedResult> {
  const vault = createVault({ root: options.source.root });
  const record = await readVaultRecord(vault, options.source.sessionId, options.source.outputId);
  const details =
    record.kind === "command"
      ? `kind=command executionStatus=${record.executionStatus} exitCode=${record.exitCode} decisions=${record.decisionIds.join(",")}`
      : `kind=${record.kind} decisions=${record.decisionIds.join(",")}`;

  const source = { kind: "vault" as const, outputId: options.source.outputId };
  if (options.source.stream !== undefined) {
    Object.assign(source, { stream: options.source.stream });
  }

  return {
    toolStatus: "ok",
    decisionId: decisionId("vault-explain", options.source.outputId, record.contentHashSha256),
    preserve,
    source,
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Vault outputId=${options.source.outputId} ${details}. Raw output is recoverable from the vault record without rerunning the original command.`,
    },
    evidence: [],
    recovery: {
      how: `Use freeflow_retrieve action=retrieve with outputId=${options.source.outputId}, stream=stdout|stderr|combined, and an exact lineRange to recover raw command output.`,
      outputId: options.source.outputId,
    },
  };
}

async function queryRepo(
  root: string,
  options: RepoRetrieveOptions,
  preserve: PreserveMode,
): Promise<RetrievalRoutedResult> {
  if (!options.query?.trim()) {
    return errorResult(preserve, "Repo query requires a non-empty query string.");
  }

  const query = options.query.trim();
  const topK = parseTopK(options.topK, DEFAULT_QUERY_TOP_K);
  if (typeof topK === "string") {
    return errorResult(preserve, topK);
  }

  const files = await readRepoTextFiles(root, options.source.path);
  const candidates = findTopCandidates(files, query, topK);

  if (candidates.length === 0) {
    return {
      toolStatus: "ok",
      decisionId: decisionId("repo-query", query, root, "none"),
      preserve,
      source: { kind: "repo", path: options.source.path ?? "." },
      routing: {
        status: "routed",
        route: "retrieve",
        reason: "Deterministic lexical retrieval found no matching repo evidence.",
      },
      evidence: [],
      recovery: {
        how: "Refine the query, use action=locate for candidate paths, or use native read for a known whole file.",
      },
    };
  }

  const evidence = candidates.map((candidate) => evidenceFromCandidate(candidate, query));
  const first = evidence[0];
  const firstCandidate = candidates[0];
  if (!first || !firstCandidate) {
    return errorResult(preserve, "Repo query produced no usable candidate evidence.");
  }

  return {
    toolStatus: "ok",
    decisionId: decisionId("repo-query", query, String(topK), evidence.map((packet) => `${packet.path}:${packet.lines ?? ""}`).join("|")),
    preserve,
    source: { kind: "repo", path: firstCandidate.file.path },
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Deterministic repo retrieval selected ${evidence.length} candidate(s); top result ${firstCandidate.file.path}:${first.lines} (${firstCandidate.reason}).`,
    },
    evidence,
    recovery: {
      how: `Use freeflow_retrieve action=expand with evidenceId=${first.id} for more surrounding context, action=locate for candidate paths, or action=retrieve with path=${firstCandidate.file.path} for an explicit span.`,
      evidenceId: first.id,
    },
  };
}

async function locateRepo(
  root: string,
  options: RepoRetrieveOptions,
  preserve: PreserveMode,
): Promise<RetrievalRoutedResult> {
  if (!options.query?.trim()) {
    return errorResult(preserve, "Repo locate requires a non-empty query string.");
  }

  const query = options.query.trim();
  const topK = parseTopK(options.topK, DEFAULT_LOCATE_TOP_K);
  if (typeof topK === "string") {
    return errorResult(preserve, topK);
  }

  const files = await readRepoTextFiles(root, options.source.path);
  const candidates = findTopCandidates(files, query, topK);
  if (candidates.length === 0) {
    return {
      toolStatus: "ok",
      decisionId: decisionId("repo-locate", query, root, "none"),
      preserve,
      source: { kind: "repo", path: options.source.path ?? "." },
      routing: {
        status: "routed",
        route: "retrieve",
        reason: "Deterministic lexical locate found no candidate location.",
      },
      evidence: [],
      recovery: {
        how: "Refine the query or use native read for a known whole file.",
      },
    };
  }

  const evidence = candidates.map((candidate) => {
    const line = candidate.lineIndex + 1;
    return evidenceFromRange({
      id: evidenceIdFor(candidate.file.path, `${line}-${line}`, query),
      file: candidate.file,
      lines: { start: line, end: line },
      why: `Candidate location from deterministic repo scoring.`,
      window: "small",
      expandable: true,
    });
  });
  const first = evidence[0];
  const firstCandidate = candidates[0];
  if (!first || !firstCandidate) {
    return errorResult(preserve, "Repo locate produced no usable candidate evidence.");
  }

  return {
    toolStatus: "ok",
    decisionId: decisionId("repo-locate", query, String(topK), evidence.map((packet) => `${packet.path}:${packet.lines ?? ""}`).join("|")),
    preserve,
    source: { kind: "repo", path: firstCandidate.file.path },
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Located ${evidence.length} candidate location(s) without broad evidence retrieval; top result ${firstCandidate.file.path}:${first.lines} (${firstCandidate.reason}).`,
    },
    evidence,
    recovery: {
      how: `Use freeflow_retrieve action=retrieve with path=${firstCandidate.file.path} for an explicit span, or action=expand with evidenceId=${first.id}.`,
      evidenceId: first.id,
    },
  };
}

async function expandRepoEvidence(
  root: string,
  options: RepoRetrieveOptions,
  preserve: PreserveMode,
): Promise<RetrievalRoutedResult> {
  const evidence = options.evidence;
  if (!evidence?.path || !evidence.lines) {
    return errorResult(preserve, "Repo expansion requires a previous repo evidence packet with path and lines.");
  }

  const expansion = options.expansion ?? "lines_30";
  const originalRange = parseLineRange(evidence.lines);
  if (!originalRange) {
    return errorResult(preserve, `Cannot expand unsupported evidence line range ${evidence.lines}.`);
  }

  const file = await readRepoTextFile(root, evidence.path);
  const expandedRange = expandLineRange(originalRange, file.lines.length, expansion);
  const expandedLines = `${expandedRange.start}-${expandedRange.end}`;
  const expandedExcerpt = file.lines.slice(expandedRange.start - 1, expandedRange.end).join("\n");
  if (expansion === "full" && byteLength(expandedExcerpt) > EXACT_LINE_RANGE_MAX_BYTES) {
    return expandRepoEvidenceOverCap(file, evidence, expandedRange, preserve, byteLength(expandedExcerpt));
  }

  const expandedEvidence = evidenceFromRange({
    id: evidence.id,
    file,
    lines: expandedRange,
    why: `Expanded deterministic repo evidence from ${evidence.lines} to ${expandedLines}.`,
    window: windowForExpansion(expansion),
    expandable: expansion !== "full",
  });

  return {
    toolStatus: "ok",
    decisionId: decisionId("repo-expand", evidence.id, expandedEvidence.lines ?? expandedLines),
    preserve,
    source: { kind: "repo", path: evidence.path },
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Expanded repo evidence ${evidence.id} to ${evidence.path}:${expandedEvidence.lines ?? expandedLines}.`,
    },
    evidence: [expandedEvidence],
    recovery: {
      how:
        expansion === "full"
          ? `Use native read for direct whole-file behavior if needed for ${evidence.path}.`
          : `Use freeflow_retrieve action=expand with expansion=lines_80 or full for more context from ${evidence.path}.`,
      evidenceId: evidence.id,
    },
  };
}

async function retrieveRepoPath(
  root: string,
  options: RepoRetrieveOptions,
  preserve: PreserveMode,
): Promise<RetrievalRoutedResult> {
  if (!options.source.path) {
    return errorResult(preserve, "Repo retrieve requires source.path.");
  }

  const file = await readRepoTextFile(root, options.source.path);
  const maxFullBytes = options.maxFullBytes ?? 64_000;

  if (options.lineRange) {
    return retrieveRepoLineRange(file, options.lineRange, preserve);
  }

  if (preserve === "full") {
    return retrieveFullFile(file, maxFullBytes);
  }

  const end = Math.min(file.lines.length, 10);
  const evidence = evidenceFromRange({
    id: evidenceIdFor(file.path, `1-${end}`, "retrieve"),
    file,
    lines: { start: 1, end },
    why: `Retrieved explicit repo span ${file.path}:1-${end}.`,
    window: "small",
    expandable: true,
  });

  return {
    toolStatus: "ok",
    decisionId: decisionId("repo-retrieve", file.path, evidence.lines ?? ""),
    preserve,
    source: { kind: "repo", path: file.path },
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Retrieved explicit repo span ${file.path}:${evidence.lines}.`,
    },
    evidence: [evidence],
    recovery: {
      how: `Use freeflow_retrieve action=expand with evidenceId=${evidence.id} for more context from ${file.path}.`,
      evidenceId: evidence.id,
    },
  };
}

function expandRepoEvidenceOverCap(
  file: RepoTextFile,
  evidence: EvidencePacket,
  expandedRange: LineRange,
  preserve: PreserveMode,
  expandedBytes: number,
): RetrievalRoutedResult {
  const chunks = overCapEdgeRanges(file.lines, expandedRange).map((range, index) =>
    repoEvidenceForBoundedExactChunk(file, range, index),
  );
  const expandedLines = `${expandedRange.start}-${expandedRange.end}`;

  return {
    toolStatus: "ok",
    decisionId: decisionId("repo-expand-over-cap", evidence.id, expandedLines, String(expandedBytes)),
    preserve,
    source: { kind: "repo", path: file.path },
    routing: {
      status: "partial",
      route: "retrieve",
      reason: `Expanded repo evidence ${evidence.id} to ${file.path}:${expandedLines}, but ${expandedBytes} bytes exceeds cap ${EXACT_LINE_RANGE_MAX_BYTES}; returned bounded edge chunks with recovery guidance.`,
    },
    evidence: chunks,
    recovery: {
      how: `Use narrower freeflow_retrieve action=retrieve lineRange spans for exact content recovery from ${file.path}, or native read for direct whole-file host behavior.`,
      evidenceId: evidence.id,
    },
  };
}

function retrieveRepoLineRange(
  file: RepoTextFile,
  lineRange: RetrieveLineRangeInput,
  preserve: PreserveMode,
): RetrievalRoutedResult {
  if (!isValidLineRange(lineRange)) {
    return errorResult(preserve, "Repo retrieve requires a valid 1-based lineRange.");
  }

  const end = Math.min(lineRange.end, file.lines.length);
  const start = Math.min(lineRange.start, end);
  const evidenceLines = `${start}-${end}`;
  const excerpt = file.lines.slice(start - 1, end).join("\n");
  if (byteLength(excerpt) > EXACT_LINE_RANGE_MAX_BYTES) {
    return retrieveRepoLineRangeOverCap(file, { start, end }, preserve, byteLength(excerpt));
  }

  const evidence = evidenceFromRange({
    id: evidenceIdFor(file.path, evidenceLines, "retrieve"),
    file,
    lines: { start, end },
    why: `Retrieved exact repo lines ${file.path}:${evidenceLines}.`,
    window: "exact",
    expandable: true,
  });

  return {
    toolStatus: "ok",
    decisionId: decisionId("repo-retrieve-lines", file.path, evidenceLines),
    preserve,
    source: { kind: "repo", path: file.path },
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Retrieved exact repo lines ${file.path}:${evidenceLines}.`,
    },
    evidence: [evidence],
    recovery: {
      how: `Use freeflow_retrieve action=expand with evidenceId=${evidence.id} for more context from ${file.path}.`,
      evidenceId: evidence.id,
    },
  };
}

function retrieveRepoLineRangeOverCap(
  file: RepoTextFile,
  requestedRange: LineRange,
  preserve: PreserveMode,
  requestedBytes: number,
): RetrievalRoutedResult {
  const ranges = overCapEdgeRanges(file.lines, requestedRange);
  const evidence = ranges.map((range, index) => repoEvidenceForBoundedExactChunk(file, range, index));

  return {
    toolStatus: "ok",
    decisionId: decisionId(
      "repo-retrieve-lines-over-cap",
      file.path,
      `${requestedRange.start}-${requestedRange.end}`,
      String(requestedBytes),
    ),
    preserve,
    source: { kind: "repo", path: file.path },
    routing: {
      status: "partial",
      route: "retrieve",
      reason: `Requested repo lines ${file.path}:${requestedRange.start}-${requestedRange.end} are ${requestedBytes} bytes and exceed cap ${EXACT_LINE_RANGE_MAX_BYTES}; returned bounded edge previews with recovery guidance.`,
    },
    evidence,
    recovery: {
      how: `Use narrower freeflow_retrieve action=retrieve lineRange spans for exact content recovery from ${file.path}, or native read for direct whole-file host behavior.`,
    },
  };
}

function repoEvidenceForBoundedExactChunk(file: RepoTextFile, range: LineRange, index: number): EvidencePacket {
  const evidenceLines = `${range.start}-${range.end}`;
  return {
    id: evidenceIdFor(file.path, evidenceLines, `retrieve-over-cap-${index}`),
    source: { kind: "repo", path: file.path },
    path: file.path,
    lines: evidenceLines,
    excerpt: boundedExactChunkExcerpt(file.lines, range),
    why: `Bounded recoverable ${index === 0 ? "head" : "tail"} preview for repo line range over cap ${EXACT_LINE_RANGE_MAX_BYTES}.`,
    window: "small",
    expandable: true,
  };
}

function retrieveFullFile(file: RepoTextFile, maxFullBytes: number): RetrievalRoutedResult {
  const fullBytes = byteLength(file.text);

  if (fullBytes <= maxFullBytes) {
    const evidence = evidenceFromRange({
      id: evidenceIdFor(file.path, `1-${file.lines.length}`, "full"),
      file,
      lines: { start: 1, end: file.lines.length },
      why: `Returned full exact content because ${file.path} is under the full-context cap.`,
      window: "full",
      expandable: false,
    });

    return {
      toolStatus: "ok",
      decisionId: decisionId("repo-full", file.path, String(fullBytes)),
      preserve: "full",
      source: { kind: "repo", path: file.path },
      routing: {
        status: "routed",
        route: "retrieve",
        reason: `Returned full exact content for ${file.path}; ${fullBytes} bytes is under cap ${maxFullBytes}.`,
      },
      evidence: [evidence],
      recovery: {
        how: `Use native read for direct whole-file host behavior if needed for ${file.path}.`,
        evidenceId: evidence.id,
      },
    };
  }

  const evidence = overCapEdgeRanges(file.lines, { start: 1, end: file.lines.length }).map((range, index) =>
    repoEvidenceForBoundedExactChunk(file, range, index),
  );

  return {
    toolStatus: "ok",
    decisionId: decisionId("repo-full-over-cap", file.path, String(fullBytes), String(maxFullBytes)),
    preserve: "full",
    source: { kind: "repo", path: file.path },
    routing: {
      status: "partial",
      route: "retrieve",
      reason: `Full exact content for ${file.path} is ${fullBytes} bytes and exceeds cap ${maxFullBytes}; returned bounded edge previews instead of a summary.`,
    },
    evidence,
    recovery: {
      how: `Use freeflow_retrieve action=retrieve with path=${file.path} and an explicit span to recover exact content, or native read for direct whole-file output.`,
    },
  };
}

function explainRepoDecision(
  options: FreeflowRetrieveOptions,
  preserve: PreserveMode,
): RetrievalRoutedResult {
  const decision = options.decision;
  if (!decision) {
    return errorResult(preserve, "Repo explain requires a previous routed result decision.");
  }

  const recovery = {
    how:
      decision.recovery?.how ??
      "Use freeflow_retrieve action=expand with a returned evidence id, or action=retrieve for an explicit repo span.",
  };
  if (decision.recovery?.outputId !== undefined) {
    Object.assign(recovery, { outputId: decision.recovery.outputId });
  }
  if (decision.recovery?.evidenceId !== undefined) {
    Object.assign(recovery, { evidenceId: decision.recovery.evidenceId });
  }

  const result: RetrievalRoutedResult = {
    toolStatus: "ok",
    decisionId: decisionId("repo-explain", decision.decisionId),
    preserve: decision.preserve,
    routing: {
      status: "routed",
      route: "retrieve",
      reason: `Decision ${decision.decisionId} used route=${decision.routing.route}, routing.status=${decision.routing.status}: ${decision.routing.reason}`,
    },
    evidence: [],
    recovery,
  };
  if (decision.source !== undefined) {
    result.source = decision.source;
  }
  return result;
}

async function readRepoTextFiles(root: string, requestedPath?: string): Promise<RepoTextFile[]> {
  const start = await resolveRepoPath(root, requestedPath);
  const startStat = await stat(start.absolutePath);
  const fileRefs: RepoTextFileRef[] = [];
  const visitedDirectories = new Set<string>();
  await collectTextFileRefs(
    start.root,
    start.absolutePath,
    fileRefs,
    shouldAllowGeneratedTraversal(requestedPath ? start.relativePath : undefined, startStat.isFile()),
    visitedDirectories,
  );
  return readRepoTextFileRefs(fileRefs);
}

async function readRepoTextFile(root: string, path: string): Promise<RepoTextFile> {
  const resolved = await resolveRepoPath(root, path);
  const text = await readFile(resolved.absolutePath, "utf8");
  return {
    path: resolved.relativePath,
    absolutePath: resolved.absolutePath,
    text,
    lines: splitLines(text),
  };
}

async function collectTextFileRefs(
  root: string,
  currentPath: string,
  fileRefs: RepoTextFileRef[],
  allowGenerated: boolean,
  visitedDirectories: Set<string>,
) {
  const currentRealPath = await realpath(currentPath);
  if (!isPathInsideRoot(root, currentRealPath)) {
    return;
  }

  const currentStat = await stat(currentRealPath);
  const path = normalizeRelativePath(relative(root, currentRealPath));

  if (currentStat.isDirectory()) {
    if (visitedDirectories.has(currentRealPath)) {
      return;
    }
    visitedDirectories.add(currentRealPath);

    if (!allowGenerated && path !== "" && shouldSkipBroadDirectory(currentRealPath)) {
      return;
    }

    const entries = await readdir(currentRealPath, { withFileTypes: true });
    for (const entry of entries) {
      await collectTextFileRefs(root, resolve(currentRealPath, entry.name), fileRefs, allowGenerated, visitedDirectories);
    }
    return;
  }

  if (!currentStat.isFile()) {
    return;
  }

  if (!allowGenerated && shouldSkipBroadFile(path, currentStat.size)) {
    return;
  }

  fileRefs.push({ path, absolutePath: currentRealPath });
}

async function readRepoTextFileRefs(fileRefs: readonly RepoTextFileRef[]): Promise<RepoTextFile[]> {
  const files: Array<RepoTextFile | undefined> = new Array(fileRefs.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < fileRefs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const ref = fileRefs[currentIndex];
      if (!ref) {
        continue;
      }

      const text = await readFile(ref.absolutePath, "utf8");
      if (text.includes("\0")) {
        continue;
      }

      files[currentIndex] = { path: ref.path, absolutePath: ref.absolutePath, text, lines: splitLines(text) };
    }
  }

  const workerCount = Math.min(CONCURRENT_REPO_FILE_READS, fileRefs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return files.filter((file): file is RepoTextFile => Boolean(file));
}

function findBestCandidate(files: RepoTextFile[], query: string): CandidateSpan | null {
  return findTopCandidates(files, query, 1)[0] ?? null;
}

function findTopCandidates(files: RepoTextFile[], query: string, topK: number): CandidateSpan[] {
  const tokens = uniqueTokens(tokenize(query));
  const normalizedQueryPhrase = normalizePhraseSequence(query);
  const chunks = files.flatMap((file) => candidateChunksForFile(file));
  const matchingChunks = chunks.filter((chunk) => chunkMightMatch(chunk, tokens));
  const stats = chunkStats(matchingChunks);
  const scored: CandidateSpan[] = [];

  for (const chunk of matchingChunks) {
    const candidate = scoreCandidateChunk(chunk, tokens, normalizedQueryPhrase, stats);
    if (candidate) {
      scored.push(candidate);
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const selected: CandidateSpan[] = [];
  const seen = new Set<string>();
  for (const candidate of scored) {
    const key = candidate.file.path;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(candidate);
    if (selected.length >= topK) {
      break;
    }
  }

  return selected;
}

function parseTopK(value: number | undefined, defaultValue: number): number | string {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || value < 1 || value > MAX_TOP_K) {
    return `topK must be an integer from 1 to ${MAX_TOP_K}.`;
  }

  return value;
}

function findBestLine(lines: readonly string[], query: string): number | null {
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

function evidenceFromCandidate(candidate: CandidateSpan, query: string): EvidencePacket {
  const defaultStart = Math.max(0, candidate.lineIndex - DEFAULT_CONTEXT_LINES);
  const defaultEnd = Math.min(candidate.file.lines.length - 1, candidate.lineIndex + DEFAULT_CONTEXT_LINES);
  const lines = candidate.range ?? { start: defaultStart + 1, end: defaultEnd + 1 };
  return evidenceFromRange({
    id: evidenceIdFor(candidate.file.path, `${lines.start}-${lines.end}`, query),
    file: candidate.file,
    lines,
    why: `${candidate.reason} near ${candidate.file.path}:${candidate.lineIndex + 1}.`,
    window: "small",
    expandable: true,
  });
}

interface EvidenceRangeOptions {
  id: string;
  file: RepoTextFile;
  lines: LineRange;
  why: string;
  window: EvidenceWindow;
  expandable: boolean;
}

function evidenceFromRange(options: EvidenceRangeOptions): EvidencePacket {
  const capped = capLineRangeForWindow(options.lines, options.window);
  const lines = `${capped.range.start}-${capped.range.end}`;
  const excerpt = excerptForLineRange(options.file.lines, capped.range, options.window);
  const why = capped.truncated
    ? `${options.why} Bounded to ${lines} by the ${options.window} line cap; use retrieve lineRange or a wider expansion for more exact context.`
    : options.why;
  return {
    id: options.id,
    source: { kind: "repo", path: options.file.path },
    path: options.file.path,
    lines,
    excerpt,
    why,
    window: options.window,
    expandable: options.expandable,
  };
}

interface LineRange {
  start: number;
  end: number;
}

function overCapEdgeRanges(lines: readonly string[], range: LineRange): LineRange[] {
  const lineCount = range.end - range.start + 1;
  const chunkLineCount = Math.min(10, Math.max(1, Math.floor(lineCount / 2)));
  const head = shrinkRangeToMaxBytes(lines, { start: range.start, end: Math.min(range.end, range.start + chunkLineCount - 1) }, "head");
  const tail = shrinkRangeToMaxBytes(lines, { start: Math.max(range.start, range.end - chunkLineCount + 1), end: range.end }, "tail");

  if (tail.start <= head.end) {
    return [head];
  }

  return [head, tail];
}

function shrinkRangeToMaxBytes(lines: readonly string[], range: LineRange, edge: "head" | "tail"): LineRange {
  let current = range;
  while (current.end > current.start && byteLength(lines.slice(current.start - 1, current.end).join("\n")) > EXACT_CHUNK_MAX_BYTES) {
    current = edge === "head" ? { start: current.start, end: current.end - 1 } : { start: current.start + 1, end: current.end };
  }
  return current;
}

function boundedExactChunkExcerpt(lines: readonly string[], range: LineRange): string {
  const excerpt = lines.slice(range.start - 1, range.end).join("\n");
  return truncateToUtf8Bytes(excerpt, EXACT_CHUNK_MAX_BYTES);
}

function isValidLineRange(range: RetrieveLineRangeInput): boolean {
  return Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 1 && range.end >= range.start;
}

function parseLineRange(lines: string): LineRange | null {
  const match = /^(\d+)(?:-(\d+))?$/.exec(lines);
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return null;
  }
  return { start, end };
}

function expandLineRange(range: LineRange, fileLineCount: number, expansion: RepoExpansion): LineRange {
  if (expansion === "full") {
    return { start: 1, end: fileLineCount };
  }

  const context = expansion === "lines_80" ? 80 : 30;
  return {
    start: Math.max(1, range.start - context),
    end: Math.min(fileLineCount, range.end + context),
  };
}

function windowForExpansion(expansion: RepoExpansion): EvidenceWindow {
  return expansion;
}

interface ChunkStats {
  averageLength: number;
  documentFrequency: Map<string, number>;
  chunkCount: number;
}

function candidateChunksForFile(file: RepoTextFile): CandidateChunk[] {
  const structuralChunks: CandidateChunk[] = [];
  structuralChunks.push(...markdownSectionChunks(file));
  structuralChunks.push(...codeSymbolChunks(file));
  return structuralChunks.length ? structuralChunks : lineWindowChunks(file);
}

function markdownSectionChunks(file: RepoTextFile): CandidateChunk[] {
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

function codeSymbolChunks(file: RepoTextFile): CandidateChunk[] {
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

function lineWindowChunks(file: RepoTextFile): CandidateChunk[] {
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

function chunkStats(chunks: readonly CandidateChunk[]): ChunkStats {
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

function scoreCandidateChunk(
  chunk: CandidateChunk,
  queryTokens: readonly string[],
  normalizedQueryPhrase: string,
  stats: ChunkStats,
): CandidateSpan | null {
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
    completeCoverageBoost(matchingTokens, queryTokens) +
    headingCoverageBoost(chunk.heading ?? "", queryTokens) +
    identifierBoost(chunk.text, queryTokens) +
    (matchingTokens.length >= 4 ? orderedPhraseBoost(chunkTokens, queryTokens) : 0) +
    (chunk.kind === "symbol" ? codeDefinitionBoost(chunk.text, queryTokens) : 0) +
    chunkKindBoost(chunk.kind) +
    pathIntentBoost(chunk.file.path, queryTokens) +
    sourceTestPrior(chunk.file.path, queryTokens) +
    pathScore -
    Math.log1p(chunkLength) * 10;
  const bestLineIndex = bestLineIndexInChunk(chunk, queryTokens, normalizedQueryPhrase);
  const range = evidenceRangeForChunk(chunk, bestLineIndex);
  const reason = exactPhrase
    ? `matched exact normalized query phrase in ${chunk.kind} chunk`
    : `BM25-style scored ${chunk.kind} chunk with ${matchingTokens.length}/${queryTokens.length} query-token coverage`;

  return {
    file: chunk.file,
    lineIndex: bestLineIndex,
    range,
    score,
    reason,
  };
}

function chunkMightMatch(chunk: CandidateChunk, queryTokens: readonly string[]): boolean {
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

function completeCoverageBoost(matchingTokens: readonly string[], queryTokens: readonly string[]): number {
  return queryTokens.length > 0 && matchingTokens.length === queryTokens.length ? 200 : 0;
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
    if (coverage > 0) {
      bestBoost = Math.max(bestBoost, 120 + coverage * 80);
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
  return coveredTokens * 28;
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

function bestLineIndexInChunk(
  chunk: CandidateChunk,
  queryTokens: readonly string[],
  normalizedQueryPhrase: string,
): number {
  let bestIndex = chunk.range.start - 1;
  let bestScore = 0;

  for (let lineIndex = chunk.range.start - 1; lineIndex < chunk.range.end; lineIndex += 1) {
    const line = chunk.file.lines[lineIndex] ?? "";
    const score =
      (hasExactNormalizedPhrase(line, normalizedQueryPhrase) ? 1_000 : 0) +
      scoreText(line, queryTokens) * 4 +
      (line.trimStart().startsWith("#") ? 2 : 0);
    if (score > bestScore) {
      bestIndex = lineIndex;
      bestScore = score;
    }
  }

  return bestIndex;
}

function evidenceRangeForChunk(chunk: CandidateChunk, bestLineIndex: number): LineRange {
  const chunkLength = chunk.range.end - chunk.range.start + 1;
  if (chunk.kind === "symbol" || chunkLength <= DEFAULT_CONTEXT_LINES * 2 + 4) {
    return chunk.range;
  }

  return {
    start: Math.max(chunk.range.start, bestLineIndex + 1 - DEFAULT_CONTEXT_LINES),
    end: Math.min(chunk.range.end, bestLineIndex + 1 + DEFAULT_CONTEXT_LINES),
  };
}

function hasExactNormalizedPhrase(text: string, normalizedQueryPhrase: string): boolean {
  return normalizedQueryPhrase !== "" && normalizePhraseSequence(text).includes(normalizedQueryPhrase);
}

function hasExactNormalizedPhraseInChunk(chunk: CandidateChunk, normalizedQueryPhrase: string): boolean {
  return normalizedQueryPhrase !== "" && phraseSequenceForChunk(chunk).includes(normalizedQueryPhrase);
}

function tokensForChunk(chunk: CandidateChunk): string[] {
  chunk.tokens ??= tokenize(chunk.text);
  return chunk.tokens;
}

function phraseSequenceForChunk(chunk: CandidateChunk): string {
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

function shouldAllowGeneratedTraversal(requestedRelativePath: string | undefined, requestedPathIsFile: boolean): boolean {
  if (!requestedRelativePath) {
    return false;
  }

  if (requestedRelativePath === "" || requestedRelativePath === ".") {
    return false;
  }

  return requestedPathIsFile || isGeneratedPathRequest(requestedRelativePath);
}

function isGeneratedPathRequest(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((segment) => SKIP_DIRS.has(segment))) {
    return true;
  }

  const name = segments.at(-1)?.toLowerCase() ?? path.toLowerCase();
  return (
    name.endsWith(".min.js") ||
    name.endsWith(".min.css") ||
    name.endsWith(".map") ||
    name.includes(".bundle.") ||
    name.endsWith(".log")
  );
}

function shouldSkipBroadDirectory(path: string): boolean {
  const name = path.split(/[\\/]+/).at(-1) ?? path;
  return SKIP_DIRS.has(name);
}

function shouldSkipBroadFile(path: string, size: number): boolean {
  const name = path.split("/").at(-1)?.toLowerCase() ?? path.toLowerCase();
  if (isLockfile(name)) {
    return false;
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

function isLockfile(name: string): boolean {
  return (
    name === "package-lock.json" ||
    name === "npm-shrinkwrap.json" ||
    name === "pnpm-lock.yaml" ||
    name === "yarn.lock" ||
    name === "bun.lockb"
  );
}

function excerptForLineRange(lines: readonly string[], range: LineRange, window: EvidenceWindow): string {
  const selected = lines.slice(range.start - 1, range.end);
  const previewedLines = shouldBoundEvidence(window)
    ? selected.map((line) => truncateToUtf8Bytes(line, LINE_PREVIEW_MAX_BYTES))
    : selected;
  const maxBytes = maxExcerptBytesForWindow(window);
  const excerpt = previewedLines.join("\n");
  return maxBytes === null ? excerpt : truncateToUtf8Bytes(excerpt, maxBytes);
}

function capLineRangeForWindow(range: LineRange, window: EvidenceWindow): { range: LineRange; truncated: boolean } {
  const maxLines = maxLinesForWindow(window);
  const lineCount = range.end - range.start + 1;
  if (maxLines === null || lineCount <= maxLines) {
    return { range, truncated: false };
  }

  return {
    range: { start: range.start, end: range.start + maxLines - 1 },
    truncated: true,
  };
}

function maxLinesForWindow(window: EvidenceWindow): number | null {
  if (window === "lines_30") {
    return EXPAND_LINES_30_MAX_LINES;
  }
  if (window === "lines_80") {
    return EXPAND_LINES_80_MAX_LINES;
  }
  return null;
}

function maxExcerptBytesForWindow(window: EvidenceWindow): number | null {
  if (window === "small" || window === "section") {
    return QUERY_EXCERPT_MAX_BYTES;
  }
  if (window === "lines_30") {
    return EXPAND_LINES_30_MAX_BYTES;
  }
  if (window === "lines_80") {
    return EXPAND_LINES_80_MAX_BYTES;
  }
  return null;
}

function shouldBoundEvidence(window: EvidenceWindow): boolean {
  return maxExcerptBytesForWindow(window) !== null;
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

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

async function resolveRepoPath(root: string, requestedPath?: string): Promise<{ root: string; absolutePath: string; relativePath: string }> {
  const rootRealPath = await realpath(resolve(root));
  const requestedAbsolutePath = requestedPath ? resolve(rootRealPath, requestedPath) : rootRealPath;
  const requestedRealPath = await realpath(requestedAbsolutePath);

  if (!isPathInsideRoot(rootRealPath, requestedRealPath)) {
    throw new Error(`Repo path escapes root: ${requestedPath ?? "."}`);
  }

  return {
    root: rootRealPath,
    absolutePath: requestedRealPath,
    relativePath: normalizeRelativePath(relative(rootRealPath, requestedRealPath)),
  };
}

function isPathInsideRoot(root: string, absolutePath: string): boolean {
  const relativePath = relative(root, absolutePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !/^[A-Za-z]:/.test(relativePath));
}

function normalizeRelativePath(path: string): string {
  return path.split(/[\\/]+/).join("/");
}

function decisionId(...parts: string[]): string {
  return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}

function evidenceIdFor(path: string, lines: string, query: string): string {
  return `ev_${hash(`${path}\0${lines}\0${query}`).slice(0, 16)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorResult(preserve: PreserveMode, reason: string): RetrievalRoutedResult {
  return {
    toolStatus: "error",
    decisionId: decisionId("repo-error", reason),
    preserve,
    routing: {
      status: "failed",
      route: "retrieve",
      reason,
    },
    evidence: [],
    recovery: {
      how: "Use native read for a known whole file, or retry freeflow_retrieve with a supported repo query.",
    },
  };
}

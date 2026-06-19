import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildBoundedEdgeChunks, buildBoundedExcerpt, type BoundedEdgeChunk, type BoundedEvidenceCaps } from "./bounded-evidence.js";
import {
  findBestLineForQuery,
  searchRepoEvidenceCandidates,
  type EvidenceSearchCandidate,
} from "./evidence-search.js";
import { resolveExactLineRange } from "./line-ranges.js";
import { collectRepoTextFileRefs, resolveRepoPath, type RepoTextFileRef } from "./repo-traversal.js";
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
  generatedPathGlobs?: readonly string[];
}

type RepoRetrieveOptions = FreeflowRetrieveOptions & { source: RepoRetrieveSourceInput };
type VaultRetrieveOptions = FreeflowRetrieveOptions & { source: VaultRetrieveSourceInput };

interface RepoTextFile {
  path: string;
  absolutePath: string;
  text: string;
  lines: string[];
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
const CONCURRENT_REPO_FILE_READS = 32;
const QUERY_COVERAGE_MAX_LINES = 80;
const BOUNDED_EVIDENCE_CAPS: BoundedEvidenceCaps = {
  queryExcerptMaxBytes: QUERY_EXCERPT_MAX_BYTES,
  linePreviewMaxBytes: LINE_PREVIEW_MAX_BYTES,
  expandLines30MaxBytes: EXPAND_LINES_30_MAX_BYTES,
  expandLines30MaxLines: EXPAND_LINES_30_MAX_LINES,
  expandLines80MaxBytes: EXPAND_LINES_80_MAX_BYTES,
  expandLines80MaxLines: EXPAND_LINES_80_MAX_LINES,
  exactChunkMaxBytes: EXACT_CHUNK_MAX_BYTES,
};
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
  const candidateLine = findBestLineForQuery(lines, options.query);

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
  if (!lineRange) {
    return errorResult(preserve, "Vault retrieve requires a valid 1-based lineRange.");
  }

  const vault = createVault({ root: options.source.root });
  const text = await readOutputText(vault, options.source.sessionId, options.source.outputId, stream);
  const lines = splitLines(text);
  const resolvedRange = resolveExactLineRange({
    requested: lineRange,
    lineCount: lines.length,
    availableLabel: "available vaulted output lines",
    invalidReason: "Vault retrieve requires a valid 1-based lineRange.",
  });
  if (!resolvedRange.ok) {
    return errorResult(preserve, resolvedRange.reason);
  }
  const { start, end } = resolvedRange.range;
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
  const evidence = buildBoundedEdgeChunks({ lines, range: requestedRange, caps: BOUNDED_EVIDENCE_CAPS }).map((chunk, index): EvidencePacket => {
    const evidenceLines = chunk.linesLabel;
    return {
      id: evidenceIdFor(`${options.source.outputId}:${stream}`, evidenceLines, `retrieve-over-cap-${index}`),
      source: { kind: "vault", outputId: options.source.outputId, stream },
      path: `${options.source.outputId}:${stream}`,
      lines: evidenceLines,
      excerpt: chunk.excerpt,
      why: `Bounded recoverable ${chunk.edge} preview for vaulted ${stream} output line range over cap ${EXACT_LINE_RANGE_MAX_BYTES}.`,
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
  const chunks = buildBoundedEdgeChunks({ lines, range: expandedRange, caps: BOUNDED_EVIDENCE_CAPS }).map((chunk, index): EvidencePacket => {
    const evidenceLines = chunk.linesLabel;
    return {
      id: evidenceIdFor(`${options.source.outputId}:${stream}`, evidenceLines, `expand-over-cap-${index}`),
      source: { kind: "vault", outputId: options.source.outputId, stream },
      path: `${options.source.outputId}:${stream}`,
      lines: evidenceLines,
      excerpt: chunk.excerpt,
      why: `Bounded recoverable ${chunk.edge} preview for vaulted ${stream} expansion over cap ${EXACT_LINE_RANGE_MAX_BYTES}.`,
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

  const bounded = buildBoundedExcerpt({ lines, range: expandedRange, window, caps: BOUNDED_EVIDENCE_CAPS });
  const expandedLines = bounded.linesLabel;
  const expandedEvidence: EvidencePacket = {
    ...evidence,
    source: { kind: "vault", outputId: options.source.outputId, stream },
    path: `${options.source.outputId}:${stream}`,
    lines: expandedLines,
    excerpt: bounded.excerpt,
    why: bounded.truncatedByLineCap
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

  const files = await readRepoTextFiles(root, options.source.path, options.generatedPathGlobs);
  const candidates = searchRepoEvidenceCandidates({
    files,
    query,
    topK,
    defaultContextLines: DEFAULT_CONTEXT_LINES,
    queryCoverageMaxLines: QUERY_COVERAGE_MAX_LINES,
  });

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

  const files = await readRepoTextFiles(root, options.source.path, options.generatedPathGlobs);
  const candidates = searchRepoEvidenceCandidates({
    files,
    query,
    topK,
    defaultContextLines: DEFAULT_CONTEXT_LINES,
    queryCoverageMaxLines: QUERY_COVERAGE_MAX_LINES,
  });
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
  const chunks = buildBoundedEdgeChunks({ lines: file.lines, range: expandedRange, caps: BOUNDED_EVIDENCE_CAPS }).map((chunk, index) =>
    repoEvidenceForBoundedExactChunk(file, chunk, index),
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
  const resolvedRange = resolveExactLineRange({
    requested: lineRange,
    lineCount: file.lines.length,
    availableLabel: "available repo lines",
    invalidReason: "Repo retrieve requires a valid 1-based lineRange.",
  });
  if (!resolvedRange.ok) {
    return errorResult(preserve, resolvedRange.reason);
  }
  const { start, end } = resolvedRange.range;
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
  const evidence = buildBoundedEdgeChunks({ lines: file.lines, range: requestedRange, caps: BOUNDED_EVIDENCE_CAPS }).map((chunk, index) =>
    repoEvidenceForBoundedExactChunk(file, chunk, index),
  );

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

function repoEvidenceForBoundedExactChunk(file: RepoTextFile, chunk: BoundedEdgeChunk, index: number): EvidencePacket {
  const evidenceLines = chunk.linesLabel;
  return {
    id: evidenceIdFor(file.path, evidenceLines, `retrieve-over-cap-${index}`),
    source: { kind: "repo", path: file.path },
    path: file.path,
    lines: evidenceLines,
    excerpt: chunk.excerpt,
    why: `Bounded recoverable ${chunk.edge} preview for repo line range over cap ${EXACT_LINE_RANGE_MAX_BYTES}.`,
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

  const evidence = buildBoundedEdgeChunks({
    lines: file.lines,
    range: { start: 1, end: file.lines.length },
    caps: BOUNDED_EVIDENCE_CAPS,
  }).map((chunk, index) => repoEvidenceForBoundedExactChunk(file, chunk, index));

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

async function readRepoTextFiles(root: string, requestedPath?: string, generatedPathGlobs: readonly string[] = []): Promise<RepoTextFile[]> {
  const options: { root: string; requestedPath?: string; generatedPathGlobs: readonly string[] } = { root, generatedPathGlobs };
  if (requestedPath !== undefined) {
    options.requestedPath = requestedPath;
  }
  const fileRefs = await collectRepoTextFileRefs(options);
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

function parseTopK(value: number | undefined, defaultValue: number): number | string {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || value < 1 || value > MAX_TOP_K) {
    return `topK must be an integer from 1 to ${MAX_TOP_K}.`;
  }

  return value;
}

function evidenceFromCandidate(candidate: EvidenceSearchCandidate<RepoTextFile>, query: string): EvidencePacket {
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
    ...(candidate.exactNormalizedPhrase !== undefined ? { exactNormalizedPhrase: candidate.exactNormalizedPhrase } : {}),
  });
}

interface EvidenceRangeOptions {
  id: string;
  file: RepoTextFile;
  lines: LineRange;
  why: string;
  window: EvidenceWindow;
  expandable: boolean;
  exactNormalizedPhrase?: string;
}

function evidenceFromRange(options: EvidenceRangeOptions): EvidencePacket {
  const bounded = buildBoundedExcerpt({
    lines: options.file.lines,
    range: options.lines,
    window: options.window,
    caps: BOUNDED_EVIDENCE_CAPS,
    ...(options.exactNormalizedPhrase !== undefined ? { exactNormalizedPhrase: options.exactNormalizedPhrase } : {}),
  });
  const lines = bounded.linesLabel;
  const why = bounded.truncatedByLineCap
    ? `${options.why} Bounded to ${lines} by the ${options.window} line cap; use retrieve lineRange or a wider expansion for more exact context.`
    : options.why;
  return {
    id: options.id,
    source: { kind: "repo", path: options.file.path },
    path: options.file.path,
    lines,
    excerpt: bounded.excerpt,
    why,
    window: options.window,
    expandable: options.expandable,
  };
}

interface LineRange {
  start: number;
  end: number;
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

function excerptForLineRange(
  lines: readonly string[],
  range: LineRange,
  window: EvidenceWindow,
  exactNormalizedPhrase?: string,
): string {
  return buildBoundedExcerpt({
    lines,
    range,
    window,
    caps: BOUNDED_EVIDENCE_CAPS,
    ...(exactNormalizedPhrase !== undefined ? { exactNormalizedPhrase } : {}),
  }).excerpt;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
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

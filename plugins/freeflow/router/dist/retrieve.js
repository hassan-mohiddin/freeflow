import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createVault, readOutputText, readVaultRecord } from "./vault.js";
const DEFAULT_CONTEXT_LINES = 2;
const QUERY_EXCERPT_MAX_BYTES = 8_192;
const LINE_PREVIEW_MAX_BYTES = 2_048;
const EXPAND_LINES_30_MAX_BYTES = 32 * 1024;
const EXPAND_LINES_30_MAX_LINES = 120;
const EXPAND_LINES_80_MAX_BYTES = 64 * 1024;
const EXPAND_LINES_80_MAX_LINES = 240;
const EXACT_LINE_RANGE_MAX_BYTES = 64_000;
const EXACT_CHUNK_MAX_BYTES = 32_000;
const BROAD_SCAN_MAX_FILE_BYTES = 1024 * 1024;
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
]);
export async function freeflowRetrieve(options) {
    const preserve = options.preserve ?? "important";
    if (options.source.kind === "vault") {
        return retrieveVault(options, preserve);
    }
    const root = resolve(options.source.root);
    if (options.action === "query") {
        return queryRepo(root, options, preserve);
    }
    if (options.action === "locate") {
        return locateRepo(root, options, preserve);
    }
    if (options.action === "expand") {
        return expandRepoEvidence(root, options, preserve);
    }
    if (options.action === "retrieve") {
        return retrieveRepoPath(root, options, preserve);
    }
    if (options.action === "explain") {
        return explainRepoDecision(options, preserve);
    }
    return errorResult(preserve, `Retrieval action ${options.action} is not implemented yet.`);
}
async function retrieveVault(options, preserve) {
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
    const evidence = {
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
async function retrieveVaultLines(options, preserve) {
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
    const evidence = {
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
function retrieveVaultLineRangeOverCap(options, preserve, stream, lines, requestedRange, requestedBytes) {
    const ranges = overCapEdgeRanges(lines, requestedRange);
    const evidence = ranges.map((range, index) => {
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
        decisionId: decisionId("vault-retrieve-lines-over-cap", options.source.outputId, stream, `${requestedRange.start}-${requestedRange.end}`, String(requestedBytes)),
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
function expandVaultEvidenceOverCap(options, preserve, stream, evidence, lines, expandedRange, expandedBytes) {
    const chunks = overCapEdgeRanges(lines, expandedRange).map((range, index) => {
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
async function expandVaultEvidence(options, preserve) {
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
    const expandedEvidence = {
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
async function explainVaultOutput(options, preserve) {
    const vault = createVault({ root: options.source.root });
    const record = await readVaultRecord(vault, options.source.sessionId, options.source.outputId);
    const details = record.kind === "command"
        ? `kind=command executionStatus=${record.executionStatus} exitCode=${record.exitCode} decisions=${record.decisionIds.join(",")}`
        : `kind=${record.kind} decisions=${record.decisionIds.join(",")}`;
    const source = { kind: "vault", outputId: options.source.outputId };
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
async function queryRepo(root, options, preserve) {
    if (!options.query?.trim()) {
        return errorResult(preserve, "Repo query requires a non-empty query string.");
    }
    const files = await readRepoTextFiles(root, options.source.path);
    const candidate = findBestCandidate(files, options.query);
    if (!candidate) {
        return {
            toolStatus: "ok",
            decisionId: decisionId("repo-query", options.query, root, "none"),
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
    const evidence = evidenceFromCandidate(candidate, options.query);
    return {
        toolStatus: "ok",
        decisionId: decisionId("repo-query", options.query, candidate.file.path, evidence.lines ?? ""),
        preserve,
        source: { kind: "repo", path: candidate.file.path },
        routing: {
            status: "routed",
            route: "retrieve",
            reason: `Deterministic repo retrieval selected ${candidate.file.path}:${evidence.lines} (${candidate.reason}).`,
        },
        evidence: [evidence],
        recovery: {
            how: `Use freeflow_retrieve action=expand with evidenceId=${evidence.id} for more surrounding context, or action=retrieve with path=${candidate.file.path} for an explicit span.`,
            evidenceId: evidence.id,
        },
    };
}
async function locateRepo(root, options, preserve) {
    if (!options.query?.trim()) {
        return errorResult(preserve, "Repo locate requires a non-empty query string.");
    }
    const files = await readRepoTextFiles(root, options.source.path);
    const candidate = findBestCandidate(files, options.query);
    if (!candidate) {
        return {
            toolStatus: "ok",
            decisionId: decisionId("repo-locate", options.query, root, "none"),
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
    const line = candidate.lineIndex + 1;
    const evidence = evidenceFromRange({
        id: evidenceIdFor(candidate.file.path, `${line}-${line}`, options.query),
        file: candidate.file,
        lines: { start: line, end: line },
        why: `Candidate location from deterministic repo scoring.`,
        window: "small",
        expandable: true,
    });
    return {
        toolStatus: "ok",
        decisionId: decisionId("repo-locate", options.query, candidate.file.path, evidence.lines ?? ""),
        preserve,
        source: { kind: "repo", path: candidate.file.path },
        routing: {
            status: "routed",
            route: "retrieve",
            reason: `Located candidate location ${candidate.file.path}:${evidence.lines} without broad evidence retrieval (${candidate.reason}).`,
        },
        evidence: [evidence],
        recovery: {
            how: `Use freeflow_retrieve action=retrieve with path=${candidate.file.path} for an explicit span, or action=expand with evidenceId=${evidence.id}.`,
            evidenceId: evidence.id,
        },
    };
}
async function expandRepoEvidence(root, options, preserve) {
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
            how: expansion === "full"
                ? `Use native read for direct whole-file behavior if needed for ${evidence.path}.`
                : `Use freeflow_retrieve action=expand with expansion=lines_80 or full for more context from ${evidence.path}.`,
            evidenceId: evidence.id,
        },
    };
}
async function retrieveRepoPath(root, options, preserve) {
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
function expandRepoEvidenceOverCap(file, evidence, expandedRange, preserve, expandedBytes) {
    const chunks = overCapEdgeRanges(file.lines, expandedRange).map((range, index) => repoEvidenceForBoundedExactChunk(file, range, index));
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
function retrieveRepoLineRange(file, lineRange, preserve) {
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
function retrieveRepoLineRangeOverCap(file, requestedRange, preserve, requestedBytes) {
    const ranges = overCapEdgeRanges(file.lines, requestedRange);
    const evidence = ranges.map((range, index) => repoEvidenceForBoundedExactChunk(file, range, index));
    return {
        toolStatus: "ok",
        decisionId: decisionId("repo-retrieve-lines-over-cap", file.path, `${requestedRange.start}-${requestedRange.end}`, String(requestedBytes)),
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
function repoEvidenceForBoundedExactChunk(file, range, index) {
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
function retrieveFullFile(file, maxFullBytes) {
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
    const evidence = overCapEdgeRanges(file.lines, { start: 1, end: file.lines.length }).map((range, index) => repoEvidenceForBoundedExactChunk(file, range, index));
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
function explainRepoDecision(options, preserve) {
    const decision = options.decision;
    if (!decision) {
        return errorResult(preserve, "Repo explain requires a previous routed result decision.");
    }
    const recovery = {
        how: decision.recovery?.how ??
            "Use freeflow_retrieve action=expand with a returned evidence id, or action=retrieve for an explicit repo span.",
    };
    if (decision.recovery?.outputId !== undefined) {
        Object.assign(recovery, { outputId: decision.recovery.outputId });
    }
    if (decision.recovery?.evidenceId !== undefined) {
        Object.assign(recovery, { evidenceId: decision.recovery.evidenceId });
    }
    const result = {
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
async function readRepoTextFiles(root, requestedPath) {
    const start = requestedPath ? resolve(root, requestedPath) : root;
    const startStat = await stat(start);
    const files = [];
    await collectTextFiles(root, start, files, shouldAllowGeneratedTraversal(root, requestedPath, startStat.isFile()));
    return files;
}
async function readRepoTextFile(root, path) {
    const absolutePath = resolve(root, path);
    const text = await readFile(absolutePath, "utf8");
    return {
        path: normalizeRelativePath(relative(root, absolutePath)),
        absolutePath,
        text,
        lines: splitLines(text),
    };
}
async function collectTextFiles(root, currentPath, files, allowGenerated) {
    const currentStat = await stat(currentPath);
    const path = normalizeRelativePath(relative(root, currentPath));
    if (currentStat.isDirectory()) {
        if (!allowGenerated && path !== "" && shouldSkipBroadDirectory(currentPath)) {
            return;
        }
        const entries = await readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            await collectTextFiles(root, resolve(currentPath, entry.name), files, allowGenerated);
        }
        return;
    }
    if (!currentStat.isFile()) {
        return;
    }
    if (!allowGenerated && shouldSkipBroadFile(path, currentStat.size)) {
        return;
    }
    const text = await readFile(currentPath, "utf8");
    if (text.includes("\0")) {
        return;
    }
    files.push({ path, absolutePath: currentPath, text, lines: splitLines(text) });
}
function findBestCandidate(files, query) {
    const tokens = uniqueTokens(tokenize(query));
    const normalizedQueryPhrase = normalizeTokenSequence(query);
    const chunks = files.flatMap((file) => candidateChunksForFile(file));
    const stats = chunkStats(chunks);
    let best = null;
    for (const chunk of chunks) {
        const candidate = scoreCandidateChunk(chunk, tokens, normalizedQueryPhrase, stats);
        if (!candidate) {
            continue;
        }
        if (!best || candidate.score > best.score) {
            best = candidate;
        }
    }
    return best;
}
function findBestLine(lines, query) {
    const tokens = tokenize(query);
    let bestLineIndex = null;
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
function evidenceFromCandidate(candidate, query) {
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
function evidenceFromRange(options) {
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
function overCapEdgeRanges(lines, range) {
    const lineCount = range.end - range.start + 1;
    const chunkLineCount = Math.min(10, Math.max(1, Math.floor(lineCount / 2)));
    const head = shrinkRangeToMaxBytes(lines, { start: range.start, end: Math.min(range.end, range.start + chunkLineCount - 1) }, "head");
    const tail = shrinkRangeToMaxBytes(lines, { start: Math.max(range.start, range.end - chunkLineCount + 1), end: range.end }, "tail");
    if (tail.start <= head.end) {
        return [head];
    }
    return [head, tail];
}
function shrinkRangeToMaxBytes(lines, range, edge) {
    let current = range;
    while (current.end > current.start && byteLength(lines.slice(current.start - 1, current.end).join("\n")) > EXACT_CHUNK_MAX_BYTES) {
        current = edge === "head" ? { start: current.start, end: current.end - 1 } : { start: current.start + 1, end: current.end };
    }
    return current;
}
function boundedExactChunkExcerpt(lines, range) {
    const excerpt = lines.slice(range.start - 1, range.end).join("\n");
    return truncateToUtf8Bytes(excerpt, EXACT_CHUNK_MAX_BYTES);
}
function isValidLineRange(range) {
    return Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 1 && range.end >= range.start;
}
function parseLineRange(lines) {
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
function expandLineRange(range, fileLineCount, expansion) {
    if (expansion === "full") {
        return { start: 1, end: fileLineCount };
    }
    const context = expansion === "lines_80" ? 80 : 30;
    return {
        start: Math.max(1, range.start - context),
        end: Math.min(fileLineCount, range.end + context),
    };
}
function windowForExpansion(expansion) {
    return expansion;
}
function candidateChunksForFile(file) {
    const chunks = [];
    chunks.push(...markdownSectionChunks(file));
    chunks.push(...lineWindowChunks(file));
    return chunks;
}
function markdownSectionChunks(file) {
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
            kind: "section",
        };
    });
}
function lineWindowChunks(file) {
    return file.lines.map((_, lineIndex) => {
        const start = Math.max(0, lineIndex - DEFAULT_CONTEXT_LINES);
        const end = Math.min(file.lines.length - 1, lineIndex + DEFAULT_CONTEXT_LINES);
        return {
            file,
            range: { start: start + 1, end: end + 1 },
            text: file.lines.slice(start, end + 1).join("\n"),
            kind: "window",
        };
    });
}
function chunkStats(chunks) {
    const documentFrequency = new Map();
    let totalLength = 0;
    for (const chunk of chunks) {
        const tokens = tokenize(chunk.text);
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
function scoreCandidateChunk(chunk, queryTokens, normalizedQueryPhrase, stats) {
    if (!queryTokens.length) {
        return null;
    }
    const chunkTokens = tokenize(chunk.text);
    const tokenCounts = tokenCountMap(chunkTokens);
    const matchingTokens = queryTokens.filter((token) => (tokenCounts.get(token) ?? 0) > 0);
    const pathScore = scoreText(chunk.file.path, queryTokens);
    if (!matchingTokens.length && pathScore <= 0) {
        return null;
    }
    const exactPhrase = hasExactNormalizedPhrase(chunk.text, normalizedQueryPhrase);
    const chunkLength = Math.max(1, chunkTokens.length);
    const score = (exactPhrase ? 100_000 : 0) +
        bm25Score(queryTokens, tokenCounts, chunkLength, stats) * 10 +
        coverageRatio(matchingTokens, queryTokens) * 25 +
        headingCoverageBoost(chunk.heading ?? "", queryTokens) +
        identifierBoost(chunk.text, queryTokens) +
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
function bm25Score(queryTokens, tokenCounts, chunkLength, stats) {
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
function coverageRatio(matchingTokens, queryTokens) {
    return queryTokens.length ? matchingTokens.length / queryTokens.length : 0;
}
function headingCoverageBoost(heading, queryTokens) {
    const headingTokens = new Set(tokenize(heading));
    const coveredTokens = queryTokens.filter((token) => headingTokens.has(token)).length;
    return coveredTokens * 4;
}
function identifierBoost(text, queryTokens) {
    const identifiers = Array.from(text.matchAll(/`([^`]+)`/g), (match) => tokenize(match[1] ?? "")).flat();
    if (!identifiers.length) {
        return 0;
    }
    const identifierSet = new Set(identifiers);
    return queryTokens.filter((token) => identifierSet.has(token)).length * 6;
}
function bestLineIndexInChunk(chunk, queryTokens, normalizedQueryPhrase) {
    let bestIndex = chunk.range.start - 1;
    let bestScore = 0;
    for (let lineIndex = chunk.range.start - 1; lineIndex < chunk.range.end; lineIndex += 1) {
        const line = chunk.file.lines[lineIndex] ?? "";
        const score = (hasExactNormalizedPhrase(line, normalizedQueryPhrase) ? 1_000 : 0) +
            scoreText(line, queryTokens) * 4 +
            (line.trimStart().startsWith("#") ? 2 : 0);
        if (score > bestScore) {
            bestIndex = lineIndex;
            bestScore = score;
        }
    }
    return bestIndex;
}
function evidenceRangeForChunk(chunk, bestLineIndex) {
    const chunkLength = chunk.range.end - chunk.range.start + 1;
    if (chunkLength <= DEFAULT_CONTEXT_LINES * 2 + 4) {
        return chunk.range;
    }
    return {
        start: Math.max(chunk.range.start, bestLineIndex + 1 - DEFAULT_CONTEXT_LINES),
        end: Math.min(chunk.range.end, bestLineIndex + 1 + DEFAULT_CONTEXT_LINES),
    };
}
function hasExactNormalizedPhrase(text, normalizedQueryPhrase) {
    return normalizedQueryPhrase !== "" && normalizeTokenSequence(text).includes(normalizedQueryPhrase);
}
function normalizeTokenSequence(text) {
    const tokens = tokenize(text);
    return tokens.length >= 2 ? tokens.join(" ") : "";
}
function tokenCountMap(tokens) {
    const counts = new Map();
    for (const token of tokens) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return counts;
}
function uniqueTokens(tokens) {
    return Array.from(new Set(tokens));
}
function scoreText(text, tokens) {
    const lower = text.toLowerCase();
    return tokens.reduce((score, token) => score + countOccurrences(lower, token), 0);
}
function countOccurrences(text, token) {
    let count = 0;
    let index = text.indexOf(token);
    while (index !== -1) {
        count += 1;
        index = text.indexOf(token, index + token.length);
    }
    return count;
}
function tokenize(query) {
    return query
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}
function shouldAllowGeneratedTraversal(root, requestedPath, requestedPathIsFile) {
    if (!requestedPath) {
        return false;
    }
    const normalized = normalizeRelativePath(relative(root, resolve(root, requestedPath)));
    if (normalized === "" || normalized === ".") {
        return false;
    }
    return requestedPathIsFile || isGeneratedPathRequest(normalized);
}
function isGeneratedPathRequest(path) {
    const segments = path.split("/");
    if (segments.some((segment) => SKIP_DIRS.has(segment))) {
        return true;
    }
    const name = segments.at(-1)?.toLowerCase() ?? path.toLowerCase();
    return (name.endsWith(".min.js") ||
        name.endsWith(".min.css") ||
        name.endsWith(".map") ||
        name.includes(".bundle.") ||
        name.endsWith(".log"));
}
function shouldSkipBroadDirectory(path) {
    const name = path.split(/[\\/]+/).at(-1) ?? path;
    return SKIP_DIRS.has(name);
}
function shouldSkipBroadFile(path, size) {
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
function isLockfile(name) {
    return (name === "package-lock.json" ||
        name === "npm-shrinkwrap.json" ||
        name === "pnpm-lock.yaml" ||
        name === "yarn.lock" ||
        name === "bun.lockb");
}
function excerptForLineRange(lines, range, window) {
    const selected = lines.slice(range.start - 1, range.end);
    const previewedLines = shouldBoundEvidence(window)
        ? selected.map((line) => truncateToUtf8Bytes(line, LINE_PREVIEW_MAX_BYTES))
        : selected;
    const maxBytes = maxExcerptBytesForWindow(window);
    const excerpt = previewedLines.join("\n");
    return maxBytes === null ? excerpt : truncateToUtf8Bytes(excerpt, maxBytes);
}
function capLineRangeForWindow(range, window) {
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
function maxLinesForWindow(window) {
    if (window === "lines_30") {
        return EXPAND_LINES_30_MAX_LINES;
    }
    if (window === "lines_80") {
        return EXPAND_LINES_80_MAX_LINES;
    }
    return null;
}
function maxExcerptBytesForWindow(window) {
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
function shouldBoundEvidence(window) {
    return maxExcerptBytesForWindow(window) !== null;
}
function truncateToUtf8Bytes(text, maxBytes) {
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
function byteLength(text) {
    return Buffer.byteLength(text, "utf8");
}
function splitLines(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
function normalizeRelativePath(path) {
    return path.split(/[\\/]+/).join("/");
}
function decisionId(...parts) {
    return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}
function evidenceIdFor(path, lines, query) {
    return `ev_${hash(`${path}\0${lines}\0${query}`).slice(0, 16)}`;
}
function hash(value) {
    return createHash("sha256").update(value).digest("hex");
}
function errorResult(preserve, reason) {
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

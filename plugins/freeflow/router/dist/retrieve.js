import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildBoundedEdgeChunks, buildBoundedExcerpt } from "./bounded-evidence.js";
import { findBestLineForQuery, searchRepoEvidenceCandidates, } from "./evidence-search.js";
import { resolveExactLineRange } from "./line-ranges.js";
import { collectRepoTextFileRefs, resolveRepoPath } from "./repo-traversal.js";
import { createLocalVaultIndex } from "./vault-index.js";
import { createVault, readOutputText, readVaultRecord } from "./vault.js";
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
const BOUNDED_EVIDENCE_CAPS = {
    queryExcerptMaxBytes: QUERY_EXCERPT_MAX_BYTES,
    linePreviewMaxBytes: LINE_PREVIEW_MAX_BYTES,
    expandLines30MaxBytes: EXPAND_LINES_30_MAX_BYTES,
    expandLines30MaxLines: EXPAND_LINES_30_MAX_LINES,
    expandLines80MaxBytes: EXPAND_LINES_80_MAX_BYTES,
    expandLines80MaxLines: EXPAND_LINES_80_MAX_LINES,
    exactChunkMaxBytes: EXACT_CHUNK_MAX_BYTES,
};
export async function freeflowRetrieve(options) {
    const preserve = options.preserve ?? "important";
    try {
        if (options.source.kind === "vault") {
            return await retrieveVault(options, preserve);
        }
        const root = resolve(options.source.root);
        if (options.action === "query") {
            return await queryRepo(root, options, preserve);
        }
        if (options.action === "locate") {
            return await locateRepo(root, options, preserve);
        }
        if (options.action === "expand") {
            return await expandRepoEvidence(root, options, preserve);
        }
        if (options.action === "retrieve") {
            return await retrieveRepoPath(root, options, preserve);
        }
        if (options.action === "explain") {
            return explainRepoDecision(options, preserve);
        }
        return errorResult(preserve, `Retrieval action ${options.action} is not implemented yet.`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(preserve, `freeflow_retrieve failed while reading ${options.source.kind} source: ${message}`);
    }
}
async function retrieveVault(options, preserve) {
    if (options.action === "retrieve") {
        if (!hasVaultOutputId(options)) {
            return errorResult(preserve, "Vault retrieve requires source.outputId.");
        }
        return retrieveVaultLines(options, preserve);
    }
    if (options.action === "expand") {
        if (!hasVaultOutputId(options)) {
            return errorResult(preserve, "Vault expansion requires source.outputId for exact raw recovery.");
        }
        return expandVaultEvidence(options, preserve);
    }
    if (options.action === "explain") {
        if (!hasVaultOutputId(options)) {
            return errorResult(preserve, "Vault explain requires source.outputId.");
        }
        return explainVaultOutput(options, preserve);
    }
    if (options.action !== "query" && options.action !== "locate") {
        return errorResult(preserve, `Vault retrieval action ${options.action} is not implemented yet.`);
    }
    if (!options.query?.trim()) {
        return errorResult(preserve, `Vault ${options.action} requires a non-empty query string.`);
    }
    if (hasVaultOutputId(options) && options.action === "query") {
        return querySingleVaultOutput(options, preserve);
    }
    return queryVaultIndex(options, preserve, options.action);
}
async function querySingleVaultOutput(options, preserve) {
    const query = options.query?.trim();
    if (!query) {
        return errorResult(preserve, "Vault query requires a non-empty query string.");
    }
    const vault = createVault({ root: options.source.root });
    const record = await readVaultRecord(vault, options.source.sessionId, options.source.outputId);
    const stream = resolveVaultStream(record, options.source.stream);
    const text = await readOutputText(vault, options.source.sessionId, options.source.outputId, stream);
    const lines = splitLines(text);
    const candidateLine = findBestLineForQuery(lines, query);
    if (candidateLine === null) {
        return {
            toolStatus: "ok",
            decisionId: decisionId("vault-query", options.source.outputId, stream, query, "none"),
            preserve,
            source: { kind: "vault", outputId: options.source.outputId, stream },
            ...vaultRecordResultFields(record),
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
        id: evidenceIdFor(`${options.source.outputId}:${stream}`, evidenceLines, query),
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
        decisionId: decisionId("vault-query", options.source.outputId, stream, query, evidenceLines),
        preserve,
        source: { kind: "vault", outputId: options.source.outputId, stream },
        ...vaultRecordResultFields(record),
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
async function queryVaultIndex(options, preserve, action) {
    const query = options.query?.trim();
    if (!query) {
        return errorResult(preserve, `Vault ${action} requires a non-empty query string.`);
    }
    const topK = parseTopK(options.topK, action === "query" ? DEFAULT_QUERY_TOP_K : DEFAULT_LOCATE_TOP_K);
    if (typeof topK === "string") {
        return errorResult(preserve, topK);
    }
    const vault = createVault({ root: options.source.root });
    const indexResult = await createLocalVaultIndex(vault).queryVault(query, vaultIndexFiltersFromSource(options.source, options.filters), {
        topK,
        maxExcerptBytes: action === "locate" ? LINE_PREVIEW_MAX_BYTES : QUERY_EXCERPT_MAX_BYTES,
    });
    if (indexResult.matches.length === 0) {
        return {
            toolStatus: "ok",
            decisionId: decisionId(`vault-${action}-index`, query, String(topK), "none"),
            preserve,
            routing: {
                status: "routed",
                route: "retrieve",
                reason: `Vault-wide ${action} found no matching indexed evidence for the current filters.`,
            },
            evidence: [],
            recovery: {
                how: "Refine the query, adjust vault filters, or use source.outputId with action=retrieve/explain when the exact output is known.",
            },
        };
    }
    const evidence = indexResult.matches.map((match) => evidenceFromVaultIndexMatch(match, query, action));
    const first = indexResult.matches[0];
    const firstEvidence = evidence[0];
    if (!first || !firstEvidence) {
        return errorResult(preserve, `Vault ${action} produced no usable indexed evidence.`);
    }
    return {
        toolStatus: "ok",
        decisionId: decisionId(`vault-${action}-index`, query, String(topK), evidence.map((packet) => `${packet.path}:${packet.lines ?? ""}`).join("|")),
        preserve,
        source: sourceRefForVaultIndexMatch(first),
        routing: {
            status: "routed",
            route: "retrieve",
            reason: action === "locate"
                ? `Located ${evidence.length} indexed vault candidate(s) without raw output retrieval; top result ${first.outputId}${first.stream ? `:${first.stream}` : ""}${firstEvidence.lines ? `:${firstEvidence.lines}` : ""}.`
                : `Vault-wide query selected ${evidence.length} indexed candidate(s); top result ${first.outputId}${first.stream ? `:${first.stream}` : ""}${firstEvidence.lines ? `:${firstEvidence.lines}` : ""}.`,
        },
        evidence,
        recovery: {
            how: first.metadataOnly
                ? `Top match ${first.outputId} is metadata-only; use freeflow_retrieve action=explain with outputId=${first.outputId} for recoverability details.`
                : `Use freeflow_retrieve action=expand with source.outputId=${first.outputId} and evidenceId=${firstEvidence.id}, or action=retrieve with outputId=${first.outputId}${first.stream ? ` and stream=${first.stream}` : ""}.`,
            outputId: first.outputId,
            evidenceId: firstEvidence.id,
        },
    };
}
function evidenceFromVaultIndexMatch(match, query, action) {
    const source = sourceRefForVaultIndexMatch(match);
    const lines = match.lineStart !== undefined && match.lineEnd !== undefined ? `${match.lineStart}-${match.lineEnd}` : undefined;
    const path = `${match.outputId}${match.stream ? `:${match.stream}` : ":metadata"}`;
    const why = match.metadataOnly
        ? `Indexed metadata-only ${action} match for query terms; raw content is not recoverable from this entry.`
        : `Indexed vault ${action} match for query terms with score ${match.score}.`;
    return {
        id: evidenceIdFor(path, lines ?? match.chunkId, query),
        source,
        path,
        ...(lines !== undefined ? { lines } : {}),
        excerpt: match.excerpt,
        why,
        window: "small",
        expandable: !match.metadataOnly && lines !== undefined && match.stream !== undefined,
    };
}
function sourceRefForVaultIndexMatch(match) {
    return {
        kind: "vault",
        outputId: match.outputId,
        ...(match.stream !== undefined ? { stream: match.stream } : {}),
    };
}
function vaultIndexFiltersFromSource(source, filters) {
    return {
        ...filters,
        sessionId: filters?.sessionId ?? source.sessionId,
        ...(source.outputId !== undefined ? { outputId: source.outputId } : {}),
        ...(source.producerKind !== undefined ? { producerKind: source.producerKind } : {}),
        ...(source.server !== undefined ? { server: source.server } : {}),
        ...(source.tool !== undefined ? { tool: source.tool } : {}),
        ...(source.hostToolName !== undefined ? { hostToolName: source.hostToolName } : {}),
        ...(source.stream !== undefined ? { stream: source.stream } : {}),
        ...(source.recordKind !== undefined ? { recordKind: source.recordKind } : {}),
        ...(source.recoverability !== undefined ? { recoverability: source.recoverability } : {}),
    };
}
function hasVaultOutputId(options) {
    return typeof options.source.outputId === "string" && options.source.outputId.length > 0;
}
async function retrieveVaultLines(options, preserve) {
    const lineRange = options.lineRange;
    if (!lineRange) {
        return errorResult(preserve, "Vault retrieve requires a valid 1-based lineRange.");
    }
    const vault = createVault({ root: options.source.root });
    const record = await readVaultRecord(vault, options.source.sessionId, options.source.outputId);
    const stream = resolveVaultStream(record, options.source.stream);
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
        return retrieveVaultLineRangeOverCap(options, preserve, stream, record, lines, { start, end }, byteLength(excerpt));
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
        ...vaultRecordResultFields(record),
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
function retrieveVaultLineRangeOverCap(options, preserve, stream, record, lines, requestedRange, requestedBytes) {
    const evidence = buildBoundedEdgeChunks({ lines, range: requestedRange, caps: BOUNDED_EVIDENCE_CAPS }).map((chunk, index) => {
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
        decisionId: decisionId("vault-retrieve-lines-over-cap", options.source.outputId, stream, `${requestedRange.start}-${requestedRange.end}`, String(requestedBytes)),
        preserve,
        source: { kind: "vault", outputId: options.source.outputId, stream },
        ...vaultRecordResultFields(record),
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
function expandVaultEvidenceOverCap(options, preserve, stream, record, evidence, lines, expandedRange, expandedBytes) {
    const chunks = buildBoundedEdgeChunks({ lines, range: expandedRange, caps: BOUNDED_EVIDENCE_CAPS }).map((chunk, index) => {
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
        ...vaultRecordResultFields(record),
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
    const originalRange = parseLineRange(evidence.lines);
    if (!originalRange) {
        return errorResult(preserve, `Cannot expand unsupported vault evidence line range ${evidence.lines}.`);
    }
    const expansion = options.expansion ?? "lines_30";
    const vault = createVault({ root: options.source.root });
    const record = await readVaultRecord(vault, options.source.sessionId, options.source.outputId);
    const stream = resolveVaultStream(record, options.source.stream ?? evidence.source.stream);
    const text = await readOutputText(vault, options.source.sessionId, options.source.outputId, stream);
    const lines = splitLines(text);
    const expandedRange = expandLineRange(originalRange, lines.length, expansion);
    const window = windowForExpansion(expansion);
    const expandedExcerpt = lines.slice(expandedRange.start - 1, expandedRange.end).join("\n");
    if (expansion === "full" && byteLength(expandedExcerpt) > EXACT_LINE_RANGE_MAX_BYTES) {
        return expandVaultEvidenceOverCap(options, preserve, stream, record, evidence, lines, expandedRange, byteLength(expandedExcerpt));
    }
    const bounded = buildBoundedExcerpt({ lines, range: expandedRange, window, caps: BOUNDED_EVIDENCE_CAPS });
    const expandedLines = bounded.linesLabel;
    const expandedEvidence = {
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
        ...vaultRecordResultFields(record),
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
    const producer = producerForVaultRecord(record);
    const persistence = persistenceForVaultRecord(record);
    const details = vaultRecordDetails(record);
    const recovery = vaultRecordRecovery(record, options.source.stream);
    const source = { kind: "vault", outputId: options.source.outputId };
    if (options.source.stream !== undefined) {
        Object.assign(source, { stream: options.source.stream });
    }
    return {
        toolStatus: "ok",
        decisionId: decisionId("vault-explain", options.source.outputId, record.contentHashSha256),
        preserve,
        source,
        ...vaultRecordResultFields(record),
        routing: {
            status: "routed",
            route: "retrieve",
            reason: `Vault outputId=${options.source.outputId} ${details}; producer=${producer.kind}; persistence.status=${persistence.status}; recoverability=${persistence.recoverability}. ${recovery.reason}`,
        },
        evidence: [],
        recovery: recovery.hint,
    };
}
function resolveVaultStream(record, requested) {
    if (requested !== undefined) {
        return requested;
    }
    if (record.kind === "command") {
        return "combined";
    }
    if (record.kind === "text") {
        return "raw";
    }
    if (record.kind === "metadata") {
        throw new Error("Metadata only records store no raw stream.");
    }
    throw new Error("Repo file reference records store metadata only and have no raw stream.");
}
function vaultRecordResultFields(record) {
    const fields = {
        producer: producerForVaultRecord(record),
        persistence: persistenceForVaultRecord(record),
    };
    const recordId = record.recordId;
    if (typeof recordId === "string") {
        fields.recordId = recordId;
    }
    if (record.lineage !== undefined) {
        fields.lineage = record.lineage;
    }
    return fields;
}
function producerForVaultRecord(record) {
    const producer = record.producer;
    if (producer?.kind) {
        return producer;
    }
    if (record.kind === "command") {
        return { kind: "command" };
    }
    if (record.kind === "text" || record.kind === "metadata") {
        if (record.sourceKind === "native") {
            return { kind: "native" };
        }
        if (record.sourceKind === "mcp") {
            return { kind: "mcp" };
        }
        if (record.sourceKind === "web") {
            return { kind: "web" };
        }
        if (record.sourceKind === "fetch") {
            return { kind: "fetch" };
        }
        if (record.sourceKind === "code_search") {
            return { kind: "code_search" };
        }
        return { kind: "other" };
    }
    return { kind: "repo" };
}
function persistenceForVaultRecord(record) {
    const persistence = record.persistence;
    if (persistence?.status && persistence.recoverability) {
        return persistence;
    }
    if (record.kind === "repo-file" || record.kind === "metadata") {
        return { status: "metadata_only", recoverability: "metadata_only", outputId: record.outputId };
    }
    return {
        status: "vaulted",
        recoverability: "exact",
        recoveryOutputId: record.outputId,
        outputId: record.outputId,
    };
}
function vaultRecordDetails(record) {
    const decisions = Array.isArray(record.decisionIds) ? record.decisionIds.join(",") : "";
    const recordId = record.recordId;
    const recordIdText = typeof recordId === "string" ? ` recordId=${recordId}` : "";
    if (record.kind === "command") {
        return `kind=command${recordIdText} executionStatus=${record.executionStatus} exitCode=${record.exitCode} decisions=${decisions}`;
    }
    if (record.kind === "text") {
        return `kind=text${recordIdText} sourceKind=${record.sourceKind} decisions=${decisions}`;
    }
    if (record.kind === "metadata") {
        return `kind=metadata${recordIdText} sourceKind=${record.sourceKind} rawLines=${record.lineCounts.raw} rawBytes=${record.byteCounts.raw} decisions=${decisions}`;
    }
    return `kind=repo-file${recordIdText} path=${record.path} decisions=${decisions}`;
}
function vaultRecordRecovery(record, requestedStream) {
    const persistence = persistenceForVaultRecord(record);
    const recoveryOutputId = persistence.recoveryOutputId ?? persistence.outputId ?? record.outputId;
    if (persistence.recoverability === "exact") {
        const stream = requestedStream ?? resolveVaultStream(record);
        const streamText = record.kind === "command" && requestedStream === undefined ? "stdout|stderr|combined" : stream;
        return {
            reason: `Exact content is recoverable from the vault with recoveryOutputId=${recoveryOutputId}.`,
            hint: {
                how: `Use freeflow_retrieve action=retrieve with outputId=${recoveryOutputId}, stream=${streamText}, and an exact lineRange to recover exact vaulted content.`,
                outputId: recoveryOutputId,
            },
        };
    }
    if (persistence.recoverability === "redacted") {
        return {
            reason: `Only redacted content is recoverable from the vault; exact raw content is intentionally unavailable.`,
            hint: {
                how: `Use freeflow_retrieve action=retrieve with outputId=${recoveryOutputId} to recover redacted persisted content. Exact raw recovery is unavailable.`,
                outputId: recoveryOutputId,
            },
        };
    }
    if (persistence.recoverability === "metadata_only") {
        return {
            reason: "Only metadata was persisted; no raw content recovery is promised.",
            hint: {
                how: "Only vault metadata is available for this record. There is no raw content stream to recover.",
            },
        };
    }
    return {
        reason: "No content was persisted; recovery is unavailable.",
        hint: {
            how: "No persisted content is available for this record.",
        },
    };
}
async function queryRepo(root, options, preserve) {
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
async function locateRepo(root, options, preserve) {
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
    const chunks = buildBoundedEdgeChunks({ lines: file.lines, range: expandedRange, caps: BOUNDED_EVIDENCE_CAPS }).map((chunk, index) => repoEvidenceForBoundedExactChunk(file, chunk, index));
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
function retrieveRepoLineRangeOverCap(file, requestedRange, preserve, requestedBytes) {
    const evidence = buildBoundedEdgeChunks({ lines: file.lines, range: requestedRange, caps: BOUNDED_EVIDENCE_CAPS }).map((chunk, index) => repoEvidenceForBoundedExactChunk(file, chunk, index));
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
function repoEvidenceForBoundedExactChunk(file, chunk, index) {
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
async function readRepoTextFiles(root, requestedPath, generatedPathGlobs = []) {
    const options = { root, generatedPathGlobs };
    if (requestedPath !== undefined) {
        options.requestedPath = requestedPath;
    }
    const fileRefs = await collectRepoTextFileRefs(options);
    return readRepoTextFileRefs(fileRefs);
}
async function readRepoTextFile(root, path) {
    const resolved = await resolveRepoPath(root, path);
    const text = await readFile(resolved.absolutePath, "utf8");
    return {
        path: resolved.relativePath,
        absolutePath: resolved.absolutePath,
        text,
        lines: splitLines(text),
    };
}
async function readRepoTextFileRefs(fileRefs) {
    const files = new Array(fileRefs.length);
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
    return files.filter((file) => Boolean(file));
}
function parseTopK(value, defaultValue) {
    if (value === undefined) {
        return defaultValue;
    }
    if (!Number.isInteger(value) || value < 1 || value > MAX_TOP_K) {
        return `topK must be an integer from 1 to ${MAX_TOP_K}.`;
    }
    return value;
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
        ...(candidate.exactNormalizedPhrase !== undefined ? { exactNormalizedPhrase: candidate.exactNormalizedPhrase } : {}),
    });
}
function evidenceFromRange(options) {
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
function excerptForLineRange(lines, range, window, exactNormalizedPhrase) {
    return buildBoundedExcerpt({
        lines,
        range,
        window,
        caps: BOUNDED_EVIDENCE_CAPS,
        ...(exactNormalizedPhrase !== undefined ? { exactNormalizedPhrase } : {}),
    }).excerpt;
}
function byteLength(text) {
    return Buffer.byteLength(text, "utf8");
}
function splitLines(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
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

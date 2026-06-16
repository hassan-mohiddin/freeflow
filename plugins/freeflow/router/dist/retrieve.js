import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createVault, readOutputText, readVaultRecord } from "./vault.js";
const DEFAULT_CONTEXT_LINES = 2;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".next", "coverage"]);
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
        excerpt: lines.slice(start, end + 1).join("\n"),
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
    const evidence = {
        id: evidenceIdFor(`${options.source.outputId}:${stream}`, evidenceLines, "retrieve"),
        source: { kind: "vault", outputId: options.source.outputId, stream },
        path: `${options.source.outputId}:${stream}`,
        lines: evidenceLines,
        excerpt: lines.slice(start - 1, end).join("\n"),
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
    const expandedLines = `${expandedRange.start}-${expandedRange.end}`;
    const expandedEvidence = {
        ...evidence,
        source: { kind: "vault", outputId: options.source.outputId, stream },
        path: `${options.source.outputId}:${stream}`,
        lines: expandedLines,
        excerpt: lines.slice(expandedRange.start - 1, expandedRange.end).join("\n"),
        why: `Expanded deterministic vault evidence from ${evidence.lines} to ${expandedLines}.`,
        window: windowForExpansion(expansion),
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
            reason: `Deterministic lexical retrieval selected ${candidate.file.path}:${evidence.lines} (${candidate.reason}).`,
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
        why: `Candidate location from deterministic lexical match for query terms.`,
        window: "exact",
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
            reason: `Located candidate location ${candidate.file.path}:${evidence.lines} without broad evidence retrieval.`,
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
    const expandedEvidence = {
        ...evidence,
        lines: expandedLines,
        excerpt: file.lines.slice(expandedRange.start - 1, expandedRange.end).join("\n"),
        window: windowForExpansion(expansion),
        why: `Expanded deterministic repo evidence from ${evidence.lines} to ${expandedLines}.`,
        expandable: expansion !== "full",
    };
    return {
        toolStatus: "ok",
        decisionId: decisionId("repo-expand", evidence.id, expandedLines),
        preserve,
        source: { kind: "repo", path: evidence.path },
        routing: {
            status: "routed",
            route: "retrieve",
            reason: `Expanded repo evidence ${evidence.id} to ${evidence.path}:${expandedLines}.`,
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
    const chunkSize = Math.min(10, Math.max(1, Math.floor(file.lines.length / 2)));
    const headRange = { start: 1, end: chunkSize };
    const tailRange = { start: Math.max(chunkSize + 1, file.lines.length - chunkSize + 1), end: file.lines.length };
    const head = evidenceFromRange({
        id: evidenceIdFor(file.path, `${headRange.start}-${headRange.end}`, "full-head"),
        file,
        lines: headRange,
        why: `Exact head chunk for full-fidelity retrieval over cap ${maxFullBytes}.`,
        window: "exact",
        expandable: true,
    });
    const tail = evidenceFromRange({
        id: evidenceIdFor(file.path, `${tailRange.start}-${tailRange.end}`, "full-tail"),
        file,
        lines: tailRange,
        why: `Exact tail chunk for full-fidelity retrieval over cap ${maxFullBytes}.`,
        window: "exact",
        expandable: true,
    });
    return {
        toolStatus: "ok",
        decisionId: decisionId("repo-full-over-cap", file.path, String(fullBytes), String(maxFullBytes)),
        preserve: "full",
        source: { kind: "repo", path: file.path },
        routing: {
            status: "partial",
            route: "retrieve",
            reason: `Full exact content for ${file.path} is ${fullBytes} bytes and exceeds cap ${maxFullBytes}; returned exact chunk metadata instead of a summary.`,
        },
        evidence: [head, tail],
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
    const files = [];
    await collectTextFiles(root, start, files);
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
async function collectTextFiles(root, currentPath, files) {
    const currentStat = await stat(currentPath);
    if (currentStat.isDirectory()) {
        const entries = await readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
                continue;
            }
            await collectTextFiles(root, resolve(currentPath, entry.name), files);
        }
        return;
    }
    if (!currentStat.isFile()) {
        return;
    }
    const text = await readFile(currentPath, "utf8");
    if (text.includes("\0")) {
        return;
    }
    const path = normalizeRelativePath(relative(root, currentPath));
    files.push({ path, absolutePath: currentPath, text, lines: splitLines(text) });
}
function findBestCandidate(files, query) {
    const tokens = tokenize(query);
    let best = null;
    for (const file of files) {
        const pathScore = scoreText(file.path, tokens);
        file.lines.forEach((line, lineIndex) => {
            const lineScore = scoreText(line, tokens);
            const headingBonus = line.trimStart().startsWith("#") ? 2 : 0;
            const score = lineScore * 4 + pathScore + headingBonus;
            if (score <= 0) {
                return;
            }
            if (!best || score > best.score) {
                best = {
                    file,
                    lineIndex,
                    score,
                    reason: lineScore > 0 ? "matched query terms in file content" : "matched query terms in path",
                };
            }
        });
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
    const start = Math.max(0, candidate.lineIndex - DEFAULT_CONTEXT_LINES);
    const end = Math.min(candidate.file.lines.length - 1, candidate.lineIndex + DEFAULT_CONTEXT_LINES);
    const lines = { start: start + 1, end: end + 1 };
    return evidenceFromRange({
        id: evidenceIdFor(candidate.file.path, `${lines.start}-${lines.end}`, query),
        file: candidate.file,
        lines,
        why: `Deterministic lexical match for query terms near ${candidate.file.path}:${candidate.lineIndex + 1}.`,
        window: "small",
        expandable: true,
    });
}
function evidenceFromRange(options) {
    const lines = `${options.lines.start}-${options.lines.end}`;
    return {
        id: options.id,
        source: { kind: "repo", path: options.file.path },
        path: options.file.path,
        lines,
        excerpt: options.file.lines.slice(options.lines.start - 1, options.lines.end).join("\n"),
        why: options.why,
        window: options.window,
        expandable: options.expandable,
    };
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
        .filter((token) => token.length >= 2);
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

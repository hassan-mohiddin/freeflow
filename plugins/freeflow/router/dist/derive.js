import { createHash } from "node:crypto";
import { DEFAULT_ROUTER_THRESHOLDS } from "./config.js";
import { assembleTextEvidence, byteLength, countLines, splitLines } from "./evidence.js";
import { deriveSourceUnavailableFailure, deriveValidationFailure, deriveExecutionFailure, storageFailure, } from "./failure-contracts.js";
import { createVault, readOutputText, readVaultRecord, storeTextOutput } from "./vault.js";
const PRESERVE_MODES = new Set(["summary", "important", "full"]);
const OPERATION_KINDS = new Set(["regexFilter", "countMatches", "jsonExtract"]);
const REGEX_FLAGS = new Set(["g", "i", "m", "s", "u"]);
const DEFAULT_CONTEXT_LINES = 0;
const DEFAULT_MAX_MATCHES = 50;
const MAX_CONTEXT_LINES = 20;
const MAX_MATCHES = 1_000;
export function validateDeriveInput(value) {
    const issues = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [{ path: "$", message: "Expected derive input object." }] };
    }
    validateDeriveSource(value.source, "$.source", issues);
    validateDeriveOperation(value.operation, "$.operation", issues);
    if (value.preserve !== undefined && (typeof value.preserve !== "string" || !PRESERVE_MODES.has(value.preserve))) {
        issues.push({ path: "$.preserve", message: "Expected preserve mode summary, important, or full." });
    }
    if (issues.length > 0) {
        return { ok: false, issues };
    }
    const input = {
        source: value.source,
        operation: value.operation,
    };
    if (value.preserve !== undefined) {
        input.preserve = value.preserve;
    }
    return { ok: true, value: input };
}
export async function freeflowDerive(options) {
    const preserve = options.preserve ?? "important";
    const inputValidation = validateDeriveInput(options);
    if (!inputValidation.ok) {
        return deriveValidationFailureWithOptionalLineage({
            message: validationMessage(inputValidation.issues),
            preserve,
            lineage: lineageFromInput(options),
            decisionSeed: "input-validation",
        });
    }
    const operation = inputValidation.value.operation;
    const prepared = prepareDeriveOperation(operation);
    if (!prepared.ok) {
        return deriveValidationFailureWithOptionalLineage({
            message: prepared.message,
            preserve,
            lineage: lineageFromInput(inputValidation.value),
            decisionSeed: "operation-validation",
        });
    }
    const source = inputValidation.value.source;
    const vaultOptions = {};
    if (options.vaultRoot !== undefined) {
        vaultOptions.root = options.vaultRoot;
    }
    if (options.vaultRetention !== undefined) {
        vaultOptions.retention = options.vaultRetention;
    }
    const vault = createVault(vaultOptions);
    const thresholds = { ...DEFAULT_ROUTER_THRESHOLDS, ...options.thresholds };
    let sourceRecord;
    let stream;
    let sourceText;
    try {
        sourceRecord = await readVaultRecord(vault, options.sessionId, source.outputId);
    }
    catch (error) {
        return deriveSourceUnavailableFailureWithOptionalLineage({
            message: `Vault source outputId=${source.outputId} could not be found or read: ${errorMessage(error)}`,
            preserve,
            lineage: lineageFromInput(inputValidation.value),
            decisionSeed: "source-record",
        });
    }
    const streamResult = resolveSourceStream(sourceRecord, source.stream);
    if (!streamResult.ok) {
        return deriveValidationFailure({
            message: streamResult.message,
            preserve,
            lineage: lineageForSource(sourceRecord, operation),
            decisionSeed: "source-stream",
        });
    }
    stream = streamResult.stream;
    try {
        sourceText = await readOutputText(vault, options.sessionId, source.outputId, stream);
    }
    catch (error) {
        return deriveSourceUnavailableFailure({
            message: `Vault source outputId=${source.outputId} stream=${stream} could not be read: ${errorMessage(error)}`,
            preserve,
            lineage: lineageForSource(sourceRecord, operation),
            decisionSeed: "source-text",
        });
    }
    let derived;
    try {
        derived = deriveText({
            text: sourceText,
            sourceLabel: `${source.outputId}:${stream}`,
            operation,
            prepared: prepared.value,
        });
    }
    catch (error) {
        return deriveExecutionFailure({
            message: `Derive operation ${operation.kind} failed: ${errorMessage(error)}`,
            preserve,
            lineage: lineageForSource(sourceRecord, operation),
            decisionSeed: "derive-execution",
        });
    }
    const producer = { kind: "derive", name: operation.kind };
    const lineage = lineageForSource(sourceRecord, operation);
    let record;
    try {
        record = await storeTextOutput(vault, {
            sessionId: options.sessionId,
            raw: derived.text,
            sourceKind: "derive",
            producer,
            lineage,
            decisionIds: [decisionId("derive-store", source.outputId, stream, operation.kind, lineage.operationHash ?? "")],
        });
    }
    catch (error) {
        return storageFailure({
            operation: "derive",
            message: `Derived output could not be persisted: ${errorMessage(error)}`,
            preserve,
            producer,
            lineage,
        });
    }
    const routed = routeDerivedText({
        outputId: record.outputId,
        text: derived.text,
        preserve,
        thresholds,
        source: { kind: "vault", outputId: source.outputId, stream },
        operationKind: operation.kind,
    });
    return {
        toolStatus: "ok",
        decisionId: decisionId("derive", record.outputId, source.outputId, stream, operation.kind, routed.routingStatus),
        outputId: record.outputId,
        recordId: record.recordId,
        preserve,
        source: { kind: "vault", outputId: source.outputId, stream },
        operation: operationSummary(operation),
        producer: record.producer,
        persistence: record.persistence,
        lineage,
        routing: {
            status: routed.routingStatus,
            route: "derive",
            reason: routed.reason,
        },
        summary: derived.summary,
        evidence: routed.evidence,
        recovery: {
            how: `Use freeflow_retrieve with source.kind=vault and outputId=${record.outputId}, stream=raw, and an exact lineRange to recover exact derived content. Source evidence remains outputId=${source.outputId} stream=${stream}.`,
            outputId: record.outputId,
        },
    };
}
function validateDeriveSource(value, path, issues) {
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected derive source object." });
        return;
    }
    if (value.kind !== "vault") {
        issues.push({ path: `${path}.kind`, message: "Slice 5A supports only vault derive sources." });
        return;
    }
    if (typeof value.outputId !== "string" || value.outputId.length === 0) {
        issues.push({ path: `${path}.outputId`, message: "Expected non-empty vault outputId." });
    }
    if (value.stream !== undefined && !isOutputStream(value.stream)) {
        issues.push({ path: `${path}.stream`, message: "Expected a known output stream." });
    }
}
function validateDeriveOperation(value, path, issues) {
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected derive operation object." });
        return;
    }
    if (typeof value.kind !== "string" || !OPERATION_KINDS.has(value.kind)) {
        issues.push({ path: `${path}.kind`, message: "Expected derive operation kind regexFilter, countMatches, or jsonExtract." });
        return;
    }
    if (value.kind === "jsonExtract") {
        validateJsonExtractOperation(value, path, issues);
        return;
    }
    if (typeof value.pattern !== "string" || value.pattern.length === 0) {
        issues.push({ path: `${path}.pattern`, message: "Expected a non-empty regex pattern string." });
    }
    validateRegexFlags(value.flags, `${path}.flags`, issues);
    if (value.kind === "regexFilter") {
        if (value.contextLines !== undefined) {
            validateIntegerRange(value.contextLines, `${path}.contextLines`, 0, MAX_CONTEXT_LINES, issues);
        }
        if (value.maxMatches !== undefined) {
            validateIntegerRange(value.maxMatches, `${path}.maxMatches`, 1, MAX_MATCHES, issues);
        }
    }
    else {
        for (const key of ["contextLines", "maxMatches"]) {
            if (value[key] !== undefined) {
                issues.push({ path: `${path}.${key}`, message: `Operation ${value.kind} does not accept ${key}.` });
            }
        }
    }
}
function validateJsonExtractOperation(value, path, issues) {
    const hasPointer = value.pointer !== undefined;
    const hasPath = value.path !== undefined;
    if (hasPointer === hasPath) {
        issues.push({ path, message: "Expected exactly one JSON selector: pointer or path." });
    }
    if (value.pointer !== undefined) {
        if (typeof value.pointer !== "string") {
            issues.push({ path: `${path}.pointer`, message: "Expected JSON pointer string." });
        }
        else {
            const pointer = parseJsonPointer(value.pointer);
            if (!pointer.ok) {
                issues.push({ path: `${path}.pointer`, message: `Invalid JSON pointer: ${pointer.message}` });
            }
        }
    }
    if (value.path !== undefined) {
        if (typeof value.path !== "string") {
            issues.push({ path: `${path}.path`, message: "Expected JSON path string." });
        }
        else {
            const parsedPath = parseJsonPath(value.path);
            if (!parsedPath.ok) {
                issues.push({ path: `${path}.path`, message: `Invalid JSON path: ${parsedPath.message}` });
            }
        }
    }
    for (const key of ["pattern", "flags", "contextLines", "maxMatches"]) {
        if (value[key] !== undefined) {
            issues.push({ path: `${path}.${key}`, message: `Operation jsonExtract does not accept ${key}.` });
        }
    }
}
function validateRegexFlags(value, path, issues) {
    if (value === undefined) {
        return;
    }
    if (typeof value !== "string") {
        issues.push({ path, message: "Expected regex flags string when present." });
        return;
    }
    const seen = new Set();
    for (const flag of value) {
        if (!REGEX_FLAGS.has(flag)) {
            issues.push({ path, message: "Expected regex flags to contain only g, i, m, s, or u." });
            return;
        }
        if (seen.has(flag)) {
            issues.push({ path, message: "Expected regex flags without duplicates." });
            return;
        }
        seen.add(flag);
    }
}
function validateIntegerRange(value, path, min, max, issues) {
    if (!Number.isInteger(value) || value < min || value > max) {
        issues.push({ path, message: `Expected integer from ${min} to ${max}.` });
    }
}
function prepareDeriveOperation(operation) {
    if (operation.kind === "jsonExtract") {
        const preparedJson = prepareJsonExtractOperation(operation);
        if (!preparedJson.ok) {
            return preparedJson;
        }
        return { ok: true, value: { kind: "json", value: preparedJson.value } };
    }
    const compiledRegex = compileRegexOperation(operation);
    if (!compiledRegex.ok) {
        return compiledRegex;
    }
    return { ok: true, value: { kind: "regex", value: compiledRegex.value } };
}
function compileRegexOperation(operation) {
    const flags = normalizeRegexFlags(operation.flags);
    let regex;
    try {
        regex = new RegExp(operation.pattern, ensureGlobalFlag(flags));
    }
    catch (error) {
        return { ok: false, message: `Invalid regex pattern for ${operation.kind}: ${errorMessage(error)}` };
    }
    try {
        const zeroWidthCheck = new RegExp(operation.pattern, flags);
        if (zeroWidthCheck.test("")) {
            return { ok: false, message: `Invalid regex pattern for ${operation.kind}: patterns that match empty strings are not supported.` };
        }
    }
    catch (error) {
        return { ok: false, message: `Invalid regex pattern for ${operation.kind}: ${errorMessage(error)}` };
    }
    return {
        ok: true,
        value: {
            regex,
            displayPattern: operation.pattern,
            flags,
        },
    };
}
function prepareJsonExtractOperation(operation) {
    if (operation.pointer !== undefined) {
        const pointer = parseJsonPointer(operation.pointer);
        if (!pointer.ok) {
            return { ok: false, message: `Invalid JSON pointer: ${pointer.message}` };
        }
        return {
            ok: true,
            value: {
                selectorKind: "pointer",
                selector: operation.pointer,
                segments: pointer.segments,
            },
        };
    }
    if (operation.path !== undefined) {
        const path = parseJsonPath(operation.path);
        if (!path.ok) {
            return { ok: false, message: `Invalid JSON path: ${path.message}` };
        }
        return {
            ok: true,
            value: {
                selectorKind: "path",
                selector: operation.path,
                segments: path.segments,
            },
        };
    }
    return { ok: false, message: "jsonExtract requires exactly one JSON selector: pointer or path." };
}
function deriveText(options) {
    if (options.operation.kind === "jsonExtract") {
        if (options.prepared.kind !== "json") {
            throw new Error("jsonExtract operation was not prepared with a JSON selector.");
        }
        return deriveJsonExtract({
            text: options.text,
            sourceLabel: options.sourceLabel,
            operation: options.operation,
            prepared: options.prepared.value,
        });
    }
    if (options.prepared.kind !== "regex") {
        throw new Error(`${options.operation.kind} operation was not prepared with a regex.`);
    }
    if (options.operation.kind === "regexFilter") {
        return deriveRegexFilter({
            text: options.text,
            sourceLabel: options.sourceLabel,
            operation: options.operation,
            compiled: options.prepared.value,
        });
    }
    return deriveCountMatches({
        text: options.text,
        sourceLabel: options.sourceLabel,
        operation: options.operation,
        compiled: options.prepared.value,
    });
}
function deriveRegexFilter(options) {
    const lines = splitLines(options.text);
    const contextLines = options.operation.contextLines ?? DEFAULT_CONTEXT_LINES;
    const maxMatches = options.operation.maxMatches ?? DEFAULT_MAX_MATCHES;
    const stats = collectMatches(lines, options.compiled.regex, maxMatches);
    const windows = mergeLineWindows(stats.matchedLineNumbers.map((lineNumber) => ({
        start: Math.max(1, lineNumber - contextLines),
        end: Math.min(lines.length, lineNumber + contextLines),
    })));
    const parts = [
        "# freeflow_derive regexFilter",
        `source: ${options.sourceLabel}`,
        `pattern: ${formatPattern(options.compiled)}`,
        `contextLines: ${contextLines}`,
        `maxMatches: ${maxMatches}`,
        `matches: ${stats.matches}`,
        `matchedLines: ${stats.matchedLines}`,
        `truncated: ${stats.truncated}`,
    ];
    for (const window of windows) {
        parts.push("", `@@ source lines ${window.start}-${window.end} @@`);
        for (let lineNumber = window.start; lineNumber <= window.end; lineNumber += 1) {
            parts.push(`${lineNumber}| ${lines[lineNumber - 1] ?? ""}`);
        }
    }
    return {
        text: `${parts.join("\n")}\n`,
        summary: `Derived regexFilter from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${stats.matches} match(es) across ${stats.matchedLines} line(s).`,
        stats,
    };
}
function deriveCountMatches(options) {
    const lines = splitLines(options.text);
    const stats = collectMatches(lines, options.compiled.regex);
    const text = [
        "# freeflow_derive countMatches",
        `source: ${options.sourceLabel}`,
        `pattern: ${formatPattern(options.compiled)}`,
        `matches: ${stats.matches}`,
        `matchedLines: ${stats.matchedLines}`,
        "",
    ].join("\n");
    return {
        text,
        summary: `Derived countMatches from vaulted ${sourceStreamLabel(options.sourceLabel)} output: ${stats.matches} match(es) across ${stats.matchedLines} line(s).`,
        stats,
    };
}
function deriveJsonExtract(options) {
    let parsed;
    try {
        parsed = JSON.parse(options.text);
    }
    catch (error) {
        throw new Error(`Invalid JSON source for jsonExtract: ${errorMessage(error)}`);
    }
    const resolved = resolveJsonSelector(parsed, options.prepared.segments);
    if (!resolved.ok) {
        throw new Error(`JSON selector ${options.prepared.selector} did not resolve: ${resolved.message}`);
    }
    const valueType = jsonValueType(resolved.value);
    const valueText = `${JSON.stringify(resolved.value, null, 2)}\n`;
    const text = [
        "# freeflow_derive jsonExtract",
        `source: ${options.sourceLabel}`,
        `selectorKind: ${options.prepared.selectorKind}`,
        `selector: ${options.prepared.selector}`,
        `valueType: ${valueType}`,
        "",
        valueText,
    ].join("\n");
    return {
        text,
        summary: `Derived jsonExtract from vaulted ${sourceStreamLabel(options.sourceLabel)} output using ${options.prepared.selectorKind} ${options.prepared.selector}.`,
        stats: {
            matches: 1,
            matchedLines: 1,
            matchedLineNumbers: [],
            truncated: false,
        },
    };
}
function collectMatches(lines, regex, maxMatches) {
    let matches = 0;
    let truncated = false;
    const matchedLineNumbers = [];
    lineLoop: for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        let lineMatches = 0;
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(line)) !== null) {
            if (match[0].length === 0) {
                throw new Error("Regex patterns that produce zero-width matches are not supported.");
            }
            lineMatches += 1;
            matches += 1;
            if (maxMatches !== undefined && matches >= maxMatches) {
                truncated = index < lines.length - 1 || regex.lastIndex < line.length;
                break;
            }
        }
        if (lineMatches > 0) {
            matchedLineNumbers.push(index + 1);
        }
        if (maxMatches !== undefined && matches >= maxMatches) {
            break lineLoop;
        }
    }
    return {
        matches,
        matchedLines: matchedLineNumbers.length,
        matchedLineNumbers,
        truncated,
    };
}
function mergeLineWindows(windows) {
    const sorted = windows
        .filter((window) => window.start <= window.end)
        .sort((left, right) => left.start - right.start || left.end - right.end);
    const merged = [];
    for (const window of sorted) {
        const previous = merged[merged.length - 1];
        if (!previous || window.start > previous.end + 1) {
            merged.push({ ...window });
        }
        else {
            previous.end = Math.max(previous.end, window.end);
        }
    }
    return merged;
}
function routeDerivedText(options) {
    const caps = options.preserve === "full"
        ? {
            maxLines: Number.MAX_SAFE_INTEGER,
            maxExcerptBytes: options.thresholds.largeOutputBytes,
            maxLineBytes: options.thresholds.largeOutputBytes,
        }
        : {
            maxLines: options.thresholds.largeOutputLines,
            maxExcerptBytes: options.thresholds.largeOutputBytes,
            maxLineBytes: options.thresholds.largeOutputBytes,
        };
    const bounded = assembleTextEvidence({ stream: "combined", text: options.text, caps });
    const outputBytes = byteLength(options.text);
    const outputLines = countLines(options.text);
    const routingStatus = bounded.compressed || bounded.fidelity === "lossy" ? "partial" : "routed";
    const sourceLabel = `${options.source.outputId}:${options.source.stream ?? "combined"}`;
    const evidence = bounded.importantLines.map((line, index) => ({
        id: evidenceId(options.outputId, line.lines, index),
        source: { kind: "vault", outputId: options.outputId, stream: "raw" },
        path: `${options.outputId}:raw`,
        lines: line.lines,
        excerpt: line.excerpt,
        why: routingStatus === "partial"
            ? `Bounded derived ${options.operationKind} output from source ${sourceLabel}; exact derived content is recoverable from the vault and source lineage is preserved.`
            : `Derived exact ${options.operationKind} output from source ${sourceLabel} within routing caps; source lineage is preserved.`,
        window: routingStatus === "partial" ? "small" : "exact",
        expandable: true,
    }));
    return {
        routingStatus,
        reason: routingStatus === "partial"
            ? `Derived output from operation ${options.operationKind} over source ${sourceLabel} (${outputBytes} bytes, ${outputLines} lines) was vaulted; bounded evidence was returned with exact recovery.`
            : `Derived output from operation ${options.operationKind} over source ${sourceLabel} (${outputBytes} bytes, ${outputLines} lines) was vaulted and returned within routing caps.`,
        evidence,
    };
}
function parseJsonPointer(pointer) {
    if (pointer === "") {
        return { ok: true, segments: [] };
    }
    if (!pointer.startsWith("/")) {
        return { ok: false, message: "JSON pointer must be empty or start with /." };
    }
    const segments = [];
    for (const rawSegment of pointer.slice(1).split("/")) {
        if (/~(?![01])/.test(rawSegment)) {
            return { ok: false, message: "JSON pointer contains an invalid escape; use ~0 for ~ and ~1 for /." };
        }
        segments.push({ kind: "property", key: rawSegment.replace(/~1/g, "/").replace(/~0/g, "~") });
    }
    return { ok: true, segments };
}
function parseJsonPath(path) {
    if (path.length === 0 || path[0] !== "$") {
        return { ok: false, message: "JSON path must start with $." };
    }
    const segments = [];
    let index = 1;
    while (index < path.length) {
        const char = path[index];
        if (char === ".") {
            const parsed = parseJsonPathProperty(path, index + 1);
            if (!parsed.ok) {
                return parsed;
            }
            segments.push({ kind: "property", key: parsed.key });
            index = parsed.nextIndex;
            continue;
        }
        if (char === "[") {
            const parsed = parseJsonPathBracket(path, index + 1);
            if (!parsed.ok) {
                return parsed;
            }
            segments.push(parsed.segment);
            index = parsed.nextIndex;
            continue;
        }
        return { ok: false, message: `Unexpected token ${char} at offset ${index}.` };
    }
    return { ok: true, segments };
}
function parseJsonPathProperty(path, startIndex) {
    const match = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(path.slice(startIndex));
    if (!match?.[0]) {
        return { ok: false, message: `Expected property name after . at offset ${startIndex - 1}.` };
    }
    return { ok: true, key: match[0], nextIndex: startIndex + match[0].length };
}
function parseJsonPathBracket(path, startIndex) {
    const first = path[startIndex];
    if (first === '"') {
        return parseJsonPathQuotedProperty(path, startIndex);
    }
    if (first === "'") {
        return { ok: false, message: `Use double-quoted bracket properties at offset ${startIndex}.` };
    }
    const closeIndex = path.indexOf("]", startIndex);
    if (closeIndex === -1) {
        return { ok: false, message: `Expected ] for bracket selector at offset ${startIndex - 1}.` };
    }
    const indexText = path.slice(startIndex, closeIndex);
    if (!/^(0|[1-9][0-9]*)$/.test(indexText)) {
        return { ok: false, message: `Expected non-negative array index in bracket selector at offset ${startIndex - 1}.` };
    }
    return { ok: true, segment: { kind: "index", index: Number(indexText) }, nextIndex: closeIndex + 1 };
}
function parseJsonPathQuotedProperty(path, quoteIndex) {
    let escaped = false;
    for (let index = quoteIndex + 1; index < path.length; index += 1) {
        const char = path[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = true;
            continue;
        }
        if (char === '"') {
            if (path[index + 1] !== "]") {
                return { ok: false, message: `Expected ] after quoted property at offset ${index}.` };
            }
            const literal = path.slice(quoteIndex, index + 1);
            try {
                const key = JSON.parse(literal);
                if (typeof key !== "string") {
                    return { ok: false, message: "Expected quoted JSON path property to decode to a string." };
                }
                return { ok: true, segment: { kind: "property", key }, nextIndex: index + 2 };
            }
            catch (error) {
                return { ok: false, message: `Invalid quoted property string: ${errorMessage(error)}` };
            }
        }
    }
    return { ok: false, message: `Unterminated quoted property at offset ${quoteIndex}.` };
}
function resolveJsonSelector(value, segments) {
    let current = value;
    for (const segment of segments) {
        if (segment.kind === "index") {
            if (!Array.isArray(current)) {
                return { ok: false, message: `array index ${segment.index} cannot be applied to ${jsonValueType(current)}.` };
            }
            if (segment.index >= current.length) {
                return { ok: false, message: `array index ${segment.index} is outside length ${current.length}.` };
            }
            current = current[segment.index];
            continue;
        }
        if (Array.isArray(current)) {
            if (!isArrayIndexSegment(segment.key)) {
                return { ok: false, message: `array source requires numeric pointer segment, got ${segment.key}.` };
            }
            const arrayIndex = Number(segment.key);
            if (arrayIndex >= current.length) {
                return { ok: false, message: `array index ${arrayIndex} is outside length ${current.length}.` };
            }
            current = current[arrayIndex];
            continue;
        }
        if (!isJsonObject(current)) {
            return { ok: false, message: `property ${segment.key} cannot be applied to ${jsonValueType(current)}.` };
        }
        if (!Object.prototype.hasOwnProperty.call(current, segment.key)) {
            return { ok: false, message: `property ${segment.key} is not present.` };
        }
        current = current[segment.key];
    }
    return { ok: true, value: current };
}
function isJsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isArrayIndexSegment(value) {
    return /^(0|[1-9][0-9]*)$/.test(value);
}
function jsonValueType(value) {
    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "array";
    }
    return typeof value;
}
function resolveSourceStream(record, requested) {
    if (record.kind === "command") {
        const stream = requested ?? "combined";
        if (stream === "raw") {
            return { ok: false, message: "Command vault sources support stdout, stderr, or combined streams, not raw." };
        }
        return { ok: true, stream };
    }
    if (record.kind === "text") {
        const stream = requested ?? "raw";
        if (stream !== "raw") {
            return { ok: false, message: "Text vault sources support only the raw stream." };
        }
        return { ok: true, stream };
    }
    return { ok: false, message: "Repo file reference vault records store metadata only and cannot be used as derive text sources." };
}
function lineageForSource(record, operation) {
    return {
        sourceRecordIds: [record.recordId],
        sourceOutputIds: [record.outputId],
        operation: operation.kind,
        operationHash: operationHash(operation),
    };
}
function lineageFromInput(input) {
    if (!isRecord(input) || !isRecord(input.source)) {
        return undefined;
    }
    const lineage = {};
    if (typeof input.source.outputId === "string") {
        lineage.sourceOutputIds = [input.source.outputId];
    }
    if (isRecord(input.operation) && typeof input.operation.kind === "string") {
        lineage.operation = input.operation.kind;
    }
    return Object.keys(lineage).length > 0 ? lineage : undefined;
}
function operationSummary(operation) {
    if (operation.kind === "regexFilter") {
        return {
            kind: operation.kind,
            pattern: operation.pattern,
            ...(operation.flags !== undefined ? { flags: normalizeRegexFlags(operation.flags) } : {}),
            contextLines: operation.contextLines ?? DEFAULT_CONTEXT_LINES,
            maxMatches: operation.maxMatches ?? DEFAULT_MAX_MATCHES,
        };
    }
    if (operation.kind === "countMatches") {
        return {
            kind: operation.kind,
            pattern: operation.pattern,
            ...(operation.flags !== undefined ? { flags: normalizeRegexFlags(operation.flags) } : {}),
        };
    }
    return {
        kind: operation.kind,
        ...(operation.pointer !== undefined ? { pointer: operation.pointer } : {}),
        ...(operation.path !== undefined ? { path: operation.path } : {}),
    };
}
function operationHash(operation) {
    return `sha256_${hash(JSON.stringify(operationSummary(operation)))}`;
}
function normalizeRegexFlags(flags) {
    return [...new Set((flags ?? "").replace(/g/g, "").split(""))].sort().join("");
}
function ensureGlobalFlag(flags) {
    return flags.includes("g") ? flags : `${flags}g`;
}
function formatPattern(compiled) {
    return `/${compiled.displayPattern}/${compiled.flags}`;
}
function sourceStreamLabel(sourceLabel) {
    const [, stream] = sourceLabel.split(":");
    return stream ?? "combined";
}
function deriveValidationFailureWithOptionalLineage(options) {
    const failureOptions = {
        message: options.message,
        preserve: options.preserve,
        decisionSeed: options.decisionSeed,
    };
    if (options.lineage !== undefined) {
        return deriveValidationFailure({ ...failureOptions, lineage: options.lineage });
    }
    return deriveValidationFailure(failureOptions);
}
function deriveSourceUnavailableFailureWithOptionalLineage(options) {
    const failureOptions = {
        message: options.message,
        preserve: options.preserve,
        decisionSeed: options.decisionSeed,
    };
    if (options.lineage !== undefined) {
        return deriveSourceUnavailableFailure({ ...failureOptions, lineage: options.lineage });
    }
    return deriveSourceUnavailableFailure(failureOptions);
}
function validationMessage(issues) {
    return `Invalid derive input: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`;
}
function isOutputStream(value) {
    return value === "stdout" || value === "stderr" || value === "combined" || value === "raw";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function evidenceId(outputId, lines, index) {
    return `ev_${hash(`${outputId}:${lines}:${index}`).slice(0, 16)}`;
}
function decisionId(...parts) {
    return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}
function hash(value) {
    return createHash("sha256").update(value).digest("hex");
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

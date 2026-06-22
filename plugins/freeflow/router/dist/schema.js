import { EXECUTION_STATUSES, EVIDENCE_WINDOWS, FAILURE_EXECUTION_STATUSES, OUTPUT_STREAMS, PERSISTENCE_STATUSES, PRESERVE_MODES, PRODUCER_KINDS, RECOVERABILITY_MODES, RETRIEVAL_ACTIONS, ROUTE_KINDS, ROUTER_FAILURE_KINDS, ROUTING_STATUSES, TOOL_STATUSES, } from "./types.js";
import { isValidPostToolRoutingMode, validateNormalizedRouterHints, validatePositiveIntegerThreshold, validateVaultRetentionPolicy, } from "./router-contract.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function success(value) {
    return { ok: true, value };
}
function failure(issues) {
    return { ok: false, issues };
}
function isOneOf(value, allowed) {
    return typeof value === "string" && allowed.includes(value);
}
function requireString(record, key, path, issues) {
    if (typeof record[key] !== "string" || record[key] === "") {
        issues.push({ path: `${path}.${key}`, message: "Expected a non-empty string." });
    }
}
function requireBoolean(record, key, path, issues) {
    if (typeof record[key] !== "boolean") {
        issues.push({ path: `${path}.${key}`, message: "Expected a boolean." });
    }
}
function requireNonNegativeNumber(record, key, path, issues) {
    if (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] < 0) {
        issues.push({ path: `${path}.${key}`, message: "Expected a non-negative finite number." });
    }
}
function requireInteger(record, key, path, issues) {
    if (!Number.isInteger(record[key])) {
        issues.push({ path: `${path}.${key}`, message: "Expected an integer." });
    }
}
function requireNullableInteger(record, key, path, issues) {
    if (record[key] !== null && !Number.isInteger(record[key])) {
        issues.push({ path: `${path}.${key}`, message: "Expected an integer or null." });
    }
}
function validateSourceRef(value, path, issues) {
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected a source object." });
        return;
    }
    if (value.kind === "repo") {
        requireString(value, "path", path, issues);
        return;
    }
    if (value.kind === "vault") {
        requireString(value, "outputId", path, issues);
        if (value.stream !== undefined && !isOneOf(value.stream, OUTPUT_STREAMS)) {
            issues.push({ path: `${path}.stream`, message: "Expected a known output stream." });
        }
        return;
    }
    if (value.kind === "native") {
        requireString(value, "tool", path, issues);
        requireString(value, "outputId", path, issues);
        return;
    }
    issues.push({ path: `${path}.kind`, message: "Expected source kind repo, vault, or native." });
}
function validateProducerDescriptor(value, path, issues, required = false) {
    if (value === undefined) {
        if (required) {
            issues.push({ path, message: "Expected producer descriptor object." });
        }
        return;
    }
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected producer descriptor object." });
        return;
    }
    if (!isOneOf(value.kind, PRODUCER_KINDS)) {
        issues.push({ path: `${path}.kind`, message: "Expected a known producer kind." });
    }
    for (const key of ["adapter", "name", "server", "tool"]) {
        if (value[key] !== undefined && typeof value[key] !== "string") {
            issues.push({ path: `${path}.${key}`, message: "Expected a string when present." });
        }
    }
}
function validateEvidencePersistence(value, path, issues, required = false) {
    if (value === undefined) {
        if (required) {
            issues.push({ path, message: "Expected persistence object." });
        }
        return;
    }
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected persistence object." });
        return;
    }
    if (!isOneOf(value.status, PERSISTENCE_STATUSES)) {
        issues.push({ path: `${path}.status`, message: "Expected a known persistence status." });
    }
    if (!isOneOf(value.recoverability, RECOVERABILITY_MODES)) {
        issues.push({ path: `${path}.recoverability`, message: "Expected a known recoverability mode." });
    }
    if (value.recoveryOutputId !== undefined && typeof value.recoveryOutputId !== "string") {
        issues.push({ path: `${path}.recoveryOutputId`, message: "Expected recovery output id string when present." });
    }
    if (value.outputId !== undefined && typeof value.outputId !== "string") {
        issues.push({ path: `${path}.outputId`, message: "Expected output id string when present." });
    }
    if (value.recoverability === "exact" && typeof value.recoveryOutputId !== "string") {
        issues.push({ path: `${path}.recoveryOutputId`, message: "Expected recoveryOutputId for exact recoverability." });
    }
}
function validateEvidenceLineage(value, path, issues) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected lineage object." });
        return;
    }
    for (const key of ["sourceRecordIds", "sourceOutputIds"]) {
        if (value[key] !== undefined) {
            if (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === "string")) {
                issues.push({ path: `${path}.${key}`, message: "Expected a string array when present." });
            }
        }
    }
    for (const key of ["operation", "operationHash"]) {
        if (value[key] !== undefined && typeof value[key] !== "string") {
            issues.push({ path: `${path}.${key}`, message: "Expected a string when present." });
        }
    }
}
function validateFailure(value, path, issues) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected failure object." });
        return;
    }
    if (!isOneOf(value.kind, ROUTER_FAILURE_KINDS)) {
        issues.push({ path: `${path}.kind`, message: "Expected a known router failure kind." });
    }
    requireString(value, "message", path, issues);
}
function validateFailureExecution(value, path, issues) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected failure execution object." });
        return;
    }
    if (!isOneOf(value.status, FAILURE_EXECUTION_STATUSES)) {
        issues.push({ path: `${path}.status`, message: "Expected a known failure execution status." });
    }
    if (!isOneOf(value.failureKind, ROUTER_FAILURE_KINDS)) {
        issues.push({ path: `${path}.failureKind`, message: "Expected a known router failure kind." });
    }
    requireString(value, "message", path, issues);
}
function validateParserMetadata(value, path, issues) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected parser metadata object." });
        return;
    }
    requireString(value, "name", path, issues);
    if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
        issues.push({ path: `${path}.confidence`, message: "Expected confidence between 0 and 1." });
    }
    if (value.fidelity !== "exact" && value.fidelity !== "lossy") {
        issues.push({ path: `${path}.fidelity`, message: "Expected parser fidelity exact or lossy." });
    }
    requireBoolean(value, "compressed", path, issues);
    if (value.counts !== undefined) {
        if (!isRecord(value.counts)) {
            issues.push({ path: `${path}.counts`, message: "Expected parser counts object." });
        }
        else {
            for (const [key, count] of Object.entries(value.counts)) {
                if (typeof count !== "number" || !Number.isFinite(count)) {
                    issues.push({ path: `${path}.counts.${key}`, message: "Expected finite numeric parser count." });
                }
            }
        }
    }
    if (value.references !== undefined) {
        if (!Array.isArray(value.references)) {
            issues.push({ path: `${path}.references`, message: "Expected parser references array." });
        }
        else {
            value.references.forEach((reference, index) => validateParserReference(reference, `${path}.references[${index}]`, issues));
        }
    }
}
function validateParserReference(value, path, issues) {
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected parser reference object." });
        return;
    }
    requireString(value, "path", path, issues);
    requireString(value, "message", path, issues);
    if (value.line !== undefined) {
        if (typeof value.line !== "number" || !Number.isInteger(value.line) || value.line <= 0) {
            issues.push({ path: `${path}.line`, message: "Expected a positive integer line." });
        }
    }
    if (value.column !== undefined) {
        if (typeof value.column !== "number" || !Number.isInteger(value.column) || value.column <= 0) {
            issues.push({ path: `${path}.column`, message: "Expected a positive integer column." });
        }
    }
    if (value.code !== undefined && typeof value.code !== "string") {
        issues.push({ path: `${path}.code`, message: "Expected parser reference code string." });
    }
    if (value.severity !== undefined && value.severity !== "error" && value.severity !== "warning" && value.severity !== "info") {
        issues.push({ path: `${path}.severity`, message: "Expected parser reference severity error, warning, or info." });
    }
}
function validateImportantLines(value, path, issues) {
    if (value === undefined) {
        return;
    }
    if (!Array.isArray(value)) {
        issues.push({ path, message: "Expected importantLines array." });
        return;
    }
    value.forEach((line, index) => validateImportantLine(line, `${path}[${index}]`, issues));
}
function validateImportantLine(value, path, issues) {
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected important line object." });
        return;
    }
    if (!isOneOf(value.stream, OUTPUT_STREAMS) || value.stream === "raw") {
        issues.push({ path: `${path}.stream`, message: "Expected stdout, stderr, or combined stream." });
    }
    if (typeof value.lines !== "string" || !validLineRange(value.lines)) {
        issues.push({ path: `${path}.lines`, message: "Expected line range in start-end form." });
    }
    if (typeof value.excerpt !== "string") {
        issues.push({ path: `${path}.excerpt`, message: "Expected excerpt string." });
    }
}
function validLineRange(value) {
    const match = /^(\d+)-(\d+)$/.exec(value);
    if (!match?.[1] || !match[2]) {
        return false;
    }
    const start = Number(match[1]);
    const end = Number(match[2]);
    return Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start;
}
function validateEvidenceArray(value, path, issues) {
    if (value === undefined) {
        return;
    }
    if (!Array.isArray(value)) {
        issues.push({ path, message: "Expected an evidence array." });
        return;
    }
    value.forEach((packet, index) => {
        const result = validateEvidencePacket(packet);
        if (!result.ok) {
            for (const issue of result.issues) {
                issues.push({ path: `${path}[${index}]${issue.path.slice(1)}`, message: issue.message });
            }
        }
    });
}
export function validatePreserveMode(value) {
    if (!isOneOf(value, PRESERVE_MODES)) {
        return failure([{ path: "$", message: "Expected preserve mode summary, important, or full." }]);
    }
    return success(value);
}
export function validateRetrievalAction(value) {
    if (!isOneOf(value, RETRIEVAL_ACTIONS)) {
        return failure([{ path: "$", message: "Expected retrieval action query, locate, retrieve, expand, or explain." }]);
    }
    return success(value);
}
export function validateEvidencePacket(value) {
    const issues = [];
    if (!isRecord(value)) {
        return failure([{ path: "$", message: "Expected an evidence packet object." }]);
    }
    requireString(value, "id", "$", issues);
    validateSourceRef(value.source, "$.source", issues);
    requireString(value, "excerpt", "$", issues);
    requireString(value, "why", "$", issues);
    requireBoolean(value, "expandable", "$", issues);
    if (!isOneOf(value.window, EVIDENCE_WINDOWS)) {
        issues.push({ path: "$.window", message: "Expected a known evidence window." });
    }
    if (value.path !== undefined && typeof value.path !== "string") {
        issues.push({ path: "$.path", message: "Expected a string when present." });
    }
    if (value.lines !== undefined && typeof value.lines !== "string") {
        issues.push({ path: "$.lines", message: "Expected a string when present." });
    }
    return issues.length === 0 ? success(value) : failure(issues);
}
export function validateRoutedResult(value) {
    const issues = [];
    if (!isRecord(value)) {
        return failure([{ path: "$", message: "Expected a routed result object." }]);
    }
    if ("status" in value) {
        issues.push({
            path: "$.status",
            message: "Do not use ambiguous top-level status; use toolStatus, execution.status, and routing.status.",
        });
    }
    if (!isOneOf(value.toolStatus, TOOL_STATUSES)) {
        issues.push({ path: "$.toolStatus", message: "Expected toolStatus ok or error." });
    }
    requireString(value, "decisionId", "$", issues);
    if (!isOneOf(value.preserve, PRESERVE_MODES)) {
        issues.push({ path: "$.preserve", message: "Expected preserve mode summary, important, or full." });
    }
    if (!isRecord(value.routing)) {
        issues.push({ path: "$.routing", message: "Expected routing object." });
    }
    else {
        if (!isOneOf(value.routing.status, ROUTING_STATUSES)) {
            issues.push({ path: "$.routing.status", message: "Expected a known routing status." });
        }
        if (!isOneOf(value.routing.route, ROUTE_KINDS)) {
            issues.push({ path: "$.routing.route", message: "Expected a known route kind." });
        }
        requireString(value.routing, "reason", "$.routing", issues);
    }
    if (value.recovery !== undefined) {
        if (!isRecord(value.recovery)) {
            issues.push({ path: "$.recovery", message: "Expected recovery object." });
        }
        else {
            requireString(value.recovery, "how", "$.recovery", issues);
        }
    }
    validateEvidenceArray(value.evidence, "$.evidence", issues);
    if (value.execution !== undefined) {
        if (!isRecord(value.execution)) {
            issues.push({ path: "$.execution", message: "Expected execution object." });
        }
        else {
            if (!isOneOf(value.execution.status, EXECUTION_STATUSES)) {
                issues.push({ path: "$.execution.status", message: "Expected a known execution status." });
            }
            requireNullableInteger(value.execution, "exitCode", "$.execution", issues);
            if (value.execution.durationMs !== undefined) {
                requireNonNegativeNumber(value.execution, "durationMs", "$.execution", issues);
            }
        }
    }
    if (value.outputId !== undefined && typeof value.outputId !== "string") {
        issues.push({ path: "$.outputId", message: "Expected output id string when present." });
    }
    if (value.recordId !== undefined && typeof value.recordId !== "string") {
        issues.push({ path: "$.recordId", message: "Expected record id string when present." });
    }
    validateProducerDescriptor(value.producer, "$.producer", issues);
    validateEvidencePersistence(value.persistence, "$.persistence", issues);
    validateEvidenceLineage(value.lineage, "$.lineage", issues);
    validateFailure(value.failure, "$.failure", issues);
    validateFailureExecution(value.producerExecution, "$.producerExecution", issues);
    validateFailureExecution(value.deriveExecution, "$.deriveExecution", issues);
    validateImportantLines(value.importantLines, "$.importantLines", issues);
    validateParserMetadata(value.parser, "$.parser", issues);
    return issues.length === 0 ? success(value) : failure(issues);
}
export function validateRouterConfig(value) {
    const issues = [];
    if (!isRecord(value)) {
        return failure([{ path: "$", message: "Expected a router config object." }]);
    }
    if (!isValidPostToolRoutingMode(value.postToolRouting)) {
        issues.push({ path: "$.postToolRouting", message: "Expected postToolRouting off, safety-net, or strict." });
    }
    if (!isRecord(value.thresholds)) {
        issues.push({ path: "$.thresholds", message: "Expected thresholds object." });
    }
    else {
        issues.push(...validatePositiveIntegerThreshold(value.thresholds.largeOutputBytes, "$.thresholds.largeOutputBytes"));
        issues.push(...validatePositiveIntegerThreshold(value.thresholds.largeOutputLines, "$.thresholds.largeOutputLines"));
    }
    if (!isRecord(value.vault)) {
        issues.push({ path: "$.vault", message: "Expected vault config object." });
    }
    else {
        requireString(value.vault, "root", "$.vault", issues);
        if (value.vault.retention !== undefined) {
            issues.push(...validateVaultRetentionPolicy(value.vault.retention, "$.vault.retention"));
        }
    }
    issues.push(...validateNormalizedRouterHints(value.hints, "$.hints"));
    return issues.length === 0 ? success(value) : failure(issues);
}
export function validateCommandOutputRecord(value) {
    const issues = [];
    if (!isRecord(value)) {
        return failure([{ path: "$", message: "Expected a command output record object." }]);
    }
    if ("status" in value) {
        issues.push({
            path: "$.status",
            message: "Do not use ambiguous command record status; use executionStatus.",
        });
    }
    if (value.kind !== "command") {
        issues.push({ path: "$.kind", message: "Expected kind command." });
    }
    requireString(value, "outputId", "$", issues);
    requireString(value, "recordId", "$", issues);
    requireString(value, "objectId", "$", issues);
    requireString(value, "createdAt", "$", issues);
    requireString(value, "contentHashSha256", "$", issues);
    const commandIsValid = typeof value.command === "string" ||
        (Array.isArray(value.command) && value.command.every((part) => typeof part === "string"));
    if (!commandIsValid) {
        issues.push({ path: "$.command", message: "Expected command string or string array." });
    }
    if (!isOneOf(value.executionStatus, EXECUTION_STATUSES)) {
        issues.push({ path: "$.executionStatus", message: "Expected a known execution status." });
    }
    requireNullableInteger(value, "exitCode", "$", issues);
    if (!isRecord(value.paths)) {
        issues.push({ path: "$.paths", message: "Expected command output paths object." });
    }
    else {
        requireString(value.paths, "meta", "$.paths", issues);
        requireString(value.paths, "stdout", "$.paths", issues);
        requireString(value.paths, "stderr", "$.paths", issues);
        requireString(value.paths, "combined", "$.paths", issues);
    }
    if (!isRecord(value.lineCounts)) {
        issues.push({ path: "$.lineCounts", message: "Expected lineCounts object." });
    }
    else {
        requireInteger(value.lineCounts, "stdout", "$.lineCounts", issues);
        requireInteger(value.lineCounts, "stderr", "$.lineCounts", issues);
        requireInteger(value.lineCounts, "combined", "$.lineCounts", issues);
    }
    if (!isRecord(value.byteCounts)) {
        issues.push({ path: "$.byteCounts", message: "Expected byteCounts object." });
    }
    else {
        requireInteger(value.byteCounts, "stdout", "$.byteCounts", issues);
        requireInteger(value.byteCounts, "stderr", "$.byteCounts", issues);
        requireInteger(value.byteCounts, "combined", "$.byteCounts", issues);
    }
    if (!isRecord(value.hashes)) {
        issues.push({ path: "$.hashes", message: "Expected hashes object." });
    }
    if (!Array.isArray(value.decisionIds) || !value.decisionIds.every((item) => typeof item === "string")) {
        issues.push({ path: "$.decisionIds", message: "Expected decision id string array." });
    }
    validateProducerDescriptor(value.producer, "$.producer", issues, true);
    validateEvidencePersistence(value.persistence, "$.persistence", issues, true);
    validateEvidenceLineage(value.lineage, "$.lineage", issues);
    return issues.length === 0 ? success(value) : failure(issues);
}

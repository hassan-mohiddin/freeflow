import { EXECUTION_STATUSES, EVIDENCE_WINDOWS, OUTPUT_STREAMS, POST_TOOL_ROUTING_MODES, PRESERVE_MODES, RETRIEVAL_ACTIONS, ROUTE_KINDS, ROUTING_STATUSES, TOOL_STATUSES, } from "./types.js";
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
    return issues.length === 0 ? success(value) : failure(issues);
}
export function validateRouterConfig(value) {
    const issues = [];
    if (!isRecord(value)) {
        return failure([{ path: "$", message: "Expected a router config object." }]);
    }
    if (!isOneOf(value.postToolRouting, POST_TOOL_ROUTING_MODES)) {
        issues.push({ path: "$.postToolRouting", message: "Expected postToolRouting off, safety-net, or strict." });
    }
    if (!isRecord(value.thresholds)) {
        issues.push({ path: "$.thresholds", message: "Expected thresholds object." });
    }
    else {
        requireInteger(value.thresholds, "largeOutputBytes", "$.thresholds", issues);
        requireInteger(value.thresholds, "largeOutputLines", "$.thresholds", issues);
        requireNonNegativeNumber(value.thresholds, "largeOutputBytes", "$.thresholds", issues);
        requireNonNegativeNumber(value.thresholds, "largeOutputLines", "$.thresholds", issues);
    }
    if (!isRecord(value.vault)) {
        issues.push({ path: "$.vault", message: "Expected vault config object." });
    }
    else {
        requireString(value.vault, "root", "$.vault", issues);
        if (value.vault.retention !== undefined) {
            validateRetention(value.vault.retention, "$.vault.retention", issues);
        }
    }
    return issues.length === 0 ? success(value) : failure(issues);
}
function validateRetention(value, path, issues) {
    if (!isRecord(value)) {
        issues.push({ path, message: "Expected retention policy object." });
        return;
    }
    if (value.strategy === "manual") {
        return;
    }
    if (value.strategy === "ttl") {
        requireInteger(value, "ttlDays", path, issues);
        if (typeof value.ttlDays === "number" && value.ttlDays <= 0) {
            issues.push({ path: `${path}.ttlDays`, message: "Expected ttlDays to be greater than zero." });
        }
        return;
    }
    issues.push({ path: `${path}.strategy`, message: "Expected retention strategy manual or ttl." });
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
    return issues.length === 0 ? success(value) : failure(issues);
}

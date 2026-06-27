import { POST_TOOL_ROUTING_MODES } from "./types.js";
export function isValidPostToolRoutingMode(value) {
    return typeof value === "string" && POST_TOOL_ROUTING_MODES.includes(value);
}
export function isNativeSafetyNetEnabled(value) {
    return value === "safety-net" || value === "strict";
}
export function validatePositiveIntegerThreshold(value, path) {
    if (typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0) {
        return [];
    }
    return [{ path, message: "Expected a positive integer." }];
}
export function validateVaultRetentionPolicy(value, path) {
    if (!isRecord(value)) {
        return [{ path, message: "Expected retention policy object." }];
    }
    if (value.strategy === "manual") {
        return [];
    }
    if (value.strategy === "ttl") {
        const ttlIssues = validatePositiveIntegerThreshold(value.ttlDays, `${path}.ttlDays`);
        return ttlIssues.length ? ttlIssues : [];
    }
    return [{ path: `${path}.strategy`, message: "Expected retention strategy manual or ttl." }];
}
export function validateNormalizedRouterHints(value, path) {
    if (value === undefined) {
        return [];
    }
    if (!isRecord(value)) {
        return [{ path, message: "Expected hints object." }];
    }
    return [
        ...validateOptionalStringArray(value.generatedPathGlobs, `${path}.generatedPathGlobs`),
        ...validateOptionalStringArray(value.noisyCommandPatterns, `${path}.noisyCommandPatterns`),
    ];
}
function validateOptionalStringArray(value, path) {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        return [{ path, message: "Expected an array of non-empty strings." }];
    }
    const invalidIndex = value.findIndex((item) => typeof item !== "string" || item.length === 0);
    if (invalidIndex !== -1) {
        return [{ path: `${path}[${invalidIndex}]`, message: "Expected a non-empty string." }];
    }
    return [];
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

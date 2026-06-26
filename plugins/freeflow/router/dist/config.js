import { isValidPostToolRoutingMode, validatePositiveIntegerThreshold } from "./router-contract.js";
import { CAPTURE_FREEFLOW_MEDIATED_MODES, DIRECT_HOST_TOOL_CAPTURE_MODES, OBSERVED_ROUTING_FAILURE_MODES, OBSERVED_ROUTING_PERSISTENCE_MODES, OUTPUT_ROUTER_PROFILES, PROVIDER_CATEGORIES, PROVIDER_MODES, RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES, STORAGE_POLICY_MODES, } from "./types.js";
export const OUTPUT_ROUTER_SKILL_PATH = "plugins/freeflow/skills/output-router/SKILL.md";
export const DEFAULT_VAULT_ROOT = "~/.cache/freeflow-router/vault";
export const DEFAULT_POST_TOOL_ROUTING = "off";
export const DEFAULT_OUTPUT_ROUTER_ENABLED = true;
export const DEFAULT_OUTPUT_ROUTER_PROFILE = "standard";
export const DEFAULT_STORAGE_POLICY = "hybrid-dedupe";
export const DEFAULT_VAULT_RETENTION = {
    strategy: "ttl",
    ttlDays: 7,
};
export const DEFAULT_ROUTER_THRESHOLDS = {
    largeOutputBytes: 64_000,
    largeOutputLines: 1_000,
};
export const DEFAULT_CAPTURE_CONFIG = {
    freeflowMediated: "raw",
    directHostTools: "off",
};
export const DEFAULT_PROVIDERS_CONFIG = {
    enabled: [],
};
export const DEFAULT_OBSERVED_ROUTING_PERSISTENCE = "none";
export const SAFE_OBSERVED_ROUTING_PERSISTENCE_FALLBACK = "metadata-only";
export const DEFAULT_OBSERVED_ROUTING_CONFIG = {
    enabled: false,
    onRoutingFailure: "fail-open",
    mcp: { servers: {} },
    web: { enabled: false, persistence: DEFAULT_OBSERVED_ROUTING_PERSISTENCE },
    fetch: { enabled: false, persistence: DEFAULT_OBSERVED_ROUTING_PERSISTENCE },
    codeSearch: { enabled: false, persistence: DEFAULT_OBSERVED_ROUTING_PERSISTENCE },
};
export const SCRIPT_DERIVE_LANGUAGES = ["javascript", "python", "jq"];
export const DEFAULT_SCRIPT_DERIVE_LIMITS = {
    timeoutMs: 5_000,
    maxInputBytes: 1_048_576,
    maxOutputBytes: 65_536,
};
export const MAX_SCRIPT_DERIVE_LIMITS = {
    timeoutMs: 30_000,
    maxInputBytes: 10_485_760,
    maxOutputBytes: 1_048_576,
};
export const DEFAULT_SCRIPT_DERIVE_CONFIG = {
    enabled: false,
    sandbox: "auto",
    languages: [...SCRIPT_DERIVE_LANGUAGES],
    network: "off",
    limits: { ...DEFAULT_SCRIPT_DERIVE_LIMITS },
    rawScriptPersistence: "disabled",
};
export function createDefaultRouterConfig(options = {}) {
    return {
        enabled: DEFAULT_OUTPUT_ROUTER_ENABLED,
        profile: DEFAULT_OUTPUT_ROUTER_PROFILE,
        postToolRouting: DEFAULT_POST_TOOL_ROUTING,
        storagePolicy: DEFAULT_STORAGE_POLICY,
        thresholds: { ...DEFAULT_ROUTER_THRESHOLDS },
        vault: {
            root: options.vaultRoot ?? DEFAULT_VAULT_ROOT,
            retention: options.vaultRetention ?? DEFAULT_VAULT_RETENTION,
        },
    };
}
export function normalizeRouterConfig(input) {
    const config = createDefaultRouterConfig();
    const warnings = [];
    if (input === undefined || input === null) {
        return { config, warnings };
    }
    if (!isRecord(input)) {
        return {
            config,
            warnings: ["outputRouter config must be an object; using built-in output router defaults."],
        };
    }
    applyRouterEnabled(config, warnings, input.enabled);
    applyRouterProfile(config, warnings, input.profile);
    applyPostToolRouting(config, warnings, input.postToolRouting);
    applyStringEnum(config, warnings, input.storagePolicy, "storagePolicy", "outputRouter.storagePolicy", STORAGE_POLICY_MODES, DEFAULT_STORAGE_POLICY);
    applyPositiveInteger(config.thresholds, warnings, input.largeOutputBytes, "largeOutputBytes");
    applyPositiveInteger(config.thresholds, warnings, input.largeOutputLines, "largeOutputLines");
    applyVaultRoot(config, warnings, input.vaultRoot);
    applyVaultRetention(config, warnings, input.vaultRetentionDays);
    applyHints(config, warnings, input.generatedPaths, input.noisyCommandHints);
    return { config, warnings };
}
export function normalizeCaptureConfig(input) {
    const config = { ...DEFAULT_CAPTURE_CONFIG };
    const warnings = [];
    if (input === undefined || input === null) {
        return { config, warnings };
    }
    if (!isRecord(input)) {
        return {
            config,
            warnings: ["capture config must be an object; using built-in capture defaults."],
        };
    }
    applyStringEnum(config, warnings, input.freeflowMediated, "freeflowMediated", "capture.freeflowMediated", CAPTURE_FREEFLOW_MEDIATED_MODES, DEFAULT_CAPTURE_CONFIG.freeflowMediated);
    applyStringEnum(config, warnings, input.directHostTools, "directHostTools", "capture.directHostTools", DIRECT_HOST_TOOL_CAPTURE_MODES, DEFAULT_CAPTURE_CONFIG.directHostTools);
    return { config, warnings };
}
export function normalizeProvidersConfig(input) {
    const config = { enabled: [] };
    const warnings = [];
    if (input === undefined || input === null) {
        return { config, warnings };
    }
    if (!isRecord(input)) {
        return {
            config,
            warnings: ["providers config must be an object; using built-in provider defaults."],
        };
    }
    if (input.enabled === undefined) {
        return { config, warnings };
    }
    if (!Array.isArray(input.enabled)) {
        warnings.push("Invalid providers.enabled; expected an array of provider ids or provider enablement objects.");
        return { config, warnings };
    }
    input.enabled.forEach((entry, index) => {
        const parsed = parseProviderEnablement(entry, index, warnings);
        if (parsed) {
            config.enabled.push(parsed);
        }
    });
    return { config, warnings };
}
export function normalizeObservedRoutingConfig(input) {
    const config = createDefaultObservedRoutingConfig();
    const warnings = [];
    if (input === undefined || input === null) {
        return { config, warnings };
    }
    if (!isRecord(input)) {
        return {
            config,
            warnings: ["observedRouting config must be an object; observed routing is off by default."],
        };
    }
    applyObservedRoutingEnabled(config, warnings, input.enabled);
    applyStringEnum(config, warnings, input.onRoutingFailure, "onRoutingFailure", "observedRouting.onRoutingFailure", OBSERVED_ROUTING_FAILURE_MODES, DEFAULT_OBSERVED_ROUTING_CONFIG.onRoutingFailure);
    applyObservedMcpConfig(config, warnings, input.mcp);
    config.web = parseObservedProducerConfig(input.web, "observedRouting.web", warnings);
    config.fetch = parseObservedProducerConfig(input.fetch, "observedRouting.fetch", warnings);
    config.codeSearch = parseObservedProducerConfig(input.codeSearch, "observedRouting.codeSearch", warnings);
    return { config, warnings };
}
export function normalizeScriptDeriveConfig(input) {
    const config = {
        ...DEFAULT_SCRIPT_DERIVE_CONFIG,
        languages: [...DEFAULT_SCRIPT_DERIVE_CONFIG.languages],
        limits: { ...DEFAULT_SCRIPT_DERIVE_CONFIG.limits },
    };
    const warnings = [];
    if (input === undefined || input === null) {
        return { config, warnings };
    }
    if (!isRecord(input)) {
        return {
            config,
            warnings: ["scriptDerive config must be an object; script derive is disabled by default."],
        };
    }
    if (input.enabled !== undefined) {
        if (typeof input.enabled === "boolean") {
            config.enabled = input.enabled;
        }
        else {
            warnings.push(`Invalid scriptDerive.enabled=${JSON.stringify(input.enabled)}; using false.`);
        }
    }
    applyStringEnum(config, warnings, input.sandbox, "sandbox", "scriptDerive.sandbox", ["auto"], DEFAULT_SCRIPT_DERIVE_CONFIG.sandbox);
    applyStringEnum(config, warnings, input.network, "network", "scriptDerive.network", ["off"], DEFAULT_SCRIPT_DERIVE_CONFIG.network);
    applyStringEnum(config, warnings, input.rawScriptPersistence, "rawScriptPersistence", "scriptDerive.rawScriptPersistence", ["disabled"], DEFAULT_SCRIPT_DERIVE_CONFIG.rawScriptPersistence);
    applyScriptDeriveLanguages(config, warnings, input.languages);
    applyScriptDeriveLimits(config, warnings, input.limits);
    return { config, warnings };
}
export function normalizeFreeflowConfig(input) {
    const warnings = [];
    if (input !== undefined && input !== null && !isRecord(input)) {
        const router = normalizeRouterConfig(undefined);
        const capture = normalizeCaptureConfig(undefined);
        const providers = normalizeProvidersConfig(undefined);
        const observedRouting = normalizeObservedRoutingConfig(undefined);
        const scriptDerive = normalizeScriptDeriveConfig(undefined);
        return {
            config: {
                outputRouter: router.config,
                capture: capture.config,
                providers: providers.config,
                observedRouting: observedRouting.config,
                scriptDerive: scriptDerive.config,
            },
            warnings: ["Freeflow config must be an object; using built-in defaults."],
        };
    }
    const source = isRecord(input) ? input : {};
    const router = normalizeRouterConfig(source.outputRouter);
    const capture = normalizeCaptureConfig(source.capture);
    const providers = normalizeProvidersConfig(source.providers);
    const observedRouting = normalizeObservedRoutingConfig(source.observedRouting);
    const scriptDerive = normalizeScriptDeriveConfig(source.scriptDerive);
    warnings.push(...router.warnings, ...capture.warnings, ...providers.warnings, ...observedRouting.warnings, ...scriptDerive.warnings);
    return {
        config: {
            outputRouter: router.config,
            capture: capture.config,
            providers: providers.config,
            observedRouting: observedRouting.config,
            scriptDerive: scriptDerive.config,
        },
        warnings,
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function applyRouterEnabled(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (typeof value === "boolean") {
        config.enabled = value;
        return;
    }
    warnings.push(`Invalid outputRouter.enabled=${JSON.stringify(value)}; using ${DEFAULT_OUTPUT_ROUTER_ENABLED}.`);
}
function applyRouterProfile(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (isStringIn(value, OUTPUT_ROUTER_PROFILES)) {
        config.profile = value;
        return;
    }
    warnings.push(`Invalid outputRouter.profile=${JSON.stringify(value)}; using ${DEFAULT_OUTPUT_ROUTER_PROFILE}.`);
}
function applyPostToolRouting(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (isValidPostToolRoutingMode(value)) {
        config.postToolRouting = value;
        return;
    }
    warnings.push(`Invalid outputRouter.postToolRouting=${JSON.stringify(value)}; using ${DEFAULT_POST_TOOL_ROUTING}.`);
}
function applyPositiveInteger(thresholds, warnings, value, key) {
    if (value === undefined) {
        return;
    }
    if (validatePositiveIntegerThreshold(value, `outputRouter.${key}`).length === 0) {
        thresholds[key] = value;
        return;
    }
    warnings.push(`Invalid outputRouter.${key}=${JSON.stringify(value)}; using ${DEFAULT_ROUTER_THRESHOLDS[key]}.`);
}
function applyVaultRoot(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        config.vault.root = value;
        return;
    }
    warnings.push(`Invalid outputRouter.vaultRoot=${JSON.stringify(value)}; using ${DEFAULT_VAULT_ROOT}.`);
}
function applyVaultRetention(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (validatePositiveIntegerThreshold(value, "outputRouter.vaultRetentionDays").length === 0) {
        config.vault.retention = { strategy: "ttl", ttlDays: value };
        return;
    }
    warnings.push(`Invalid outputRouter.vaultRetentionDays=${JSON.stringify(value)}; using ${DEFAULT_VAULT_RETENTION.ttlDays}.`);
}
function applyHints(config, warnings, generatedPaths, noisyCommandHints) {
    const hints = {};
    if (generatedPaths !== undefined) {
        const parsed = parseStringArray(generatedPaths, "generatedPaths", warnings);
        if (parsed) {
            hints.generatedPathGlobs = parsed;
        }
    }
    if (noisyCommandHints !== undefined) {
        const parsed = parseStringArray(noisyCommandHints, "noisyCommandHints", warnings);
        if (parsed) {
            hints.noisyCommandPatterns = parsed;
        }
    }
    if (hints.generatedPathGlobs || hints.noisyCommandPatterns) {
        config.hints = hints;
    }
}
function applyScriptDeriveLanguages(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (!Array.isArray(value)) {
        warnings.push("Invalid scriptDerive.languages; expected an array of supported language ids.");
        return;
    }
    const languages = [];
    for (const item of value) {
        if (isStringIn(item, SCRIPT_DERIVE_LANGUAGES)) {
            if (!languages.includes(item)) {
                languages.push(item);
            }
        }
        else {
            warnings.push(`Invalid scriptDerive.languages entry=${JSON.stringify(item)}; supported languages are ${SCRIPT_DERIVE_LANGUAGES.join(", ")}.`);
        }
    }
    if (languages.length > 0) {
        config.languages = languages;
    }
}
function applyScriptDeriveLimits(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        warnings.push("Invalid scriptDerive.limits; expected an object with positive integer limits.");
        return;
    }
    applyScriptLimit(config, warnings, value.timeoutMs, "timeoutMs");
    applyScriptLimit(config, warnings, value.maxInputBytes, "maxInputBytes");
    applyScriptLimit(config, warnings, value.maxOutputBytes, "maxOutputBytes");
}
function applyScriptLimit(config, warnings, value, key) {
    if (value === undefined) {
        return;
    }
    const max = MAX_SCRIPT_DERIVE_LIMITS[key];
    if (Number.isInteger(value) && Number(value) > 0 && Number(value) <= max) {
        config.limits[key] = Number(value);
        return;
    }
    warnings.push(`Invalid scriptDerive.limits.${key}=${JSON.stringify(value)}; using ${DEFAULT_SCRIPT_DERIVE_LIMITS[key]}.`);
}
function applyStringEnum(config, warnings, value, key, path, allowed, fallback) {
    if (value === undefined) {
        return;
    }
    if (isStringIn(value, allowed)) {
        config[String(key)] = value;
        return;
    }
    warnings.push(`Invalid ${path}=${JSON.stringify(value)}; using ${fallback}.`);
}
function createDefaultObservedRoutingConfig() {
    return {
        enabled: DEFAULT_OBSERVED_ROUTING_CONFIG.enabled,
        onRoutingFailure: DEFAULT_OBSERVED_ROUTING_CONFIG.onRoutingFailure,
        mcp: { servers: {} },
        web: { ...DEFAULT_OBSERVED_ROUTING_CONFIG.web },
        fetch: { ...DEFAULT_OBSERVED_ROUTING_CONFIG.fetch },
        codeSearch: { ...DEFAULT_OBSERVED_ROUTING_CONFIG.codeSearch },
    };
}
function applyObservedRoutingEnabled(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (typeof value === "boolean") {
        config.enabled = value;
        return;
    }
    warnings.push(`Invalid observedRouting.enabled=${JSON.stringify(value)}; using ${DEFAULT_OBSERVED_ROUTING_CONFIG.enabled}.`);
}
function applyObservedMcpConfig(config, warnings, value) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        warnings.push("Invalid observedRouting.mcp; expected an object with explicit servers. MCP observed routing remains disabled.");
        return;
    }
    if (value.servers === undefined) {
        return;
    }
    if (!isRecord(value.servers)) {
        warnings.push("Invalid observedRouting.mcp.servers; expected an object keyed by MCP server id.");
        return;
    }
    for (const [serverId, serverConfig] of Object.entries(value.servers)) {
        const normalizedServerId = parseConfigString(serverId, "observedRouting.mcp.servers server id", warnings);
        if (!normalizedServerId) {
            continue;
        }
        config.mcp.servers[normalizedServerId] = parseObservedProducerConfig(serverConfig, `observedRouting.mcp.servers.${normalizedServerId}`, warnings);
    }
}
function parseObservedProducerConfig(value, path, warnings) {
    const fallback = { enabled: false, persistence: DEFAULT_OBSERVED_ROUTING_PERSISTENCE };
    if (value === undefined || value === null) {
        return fallback;
    }
    if (!isRecord(value)) {
        warnings.push(`Invalid ${path}; expected an object with enabled and persistence. Observed routing remains disabled for this producer.`);
        return fallback;
    }
    const enabled = parseObservedProducerEnabled(value.enabled, path, warnings);
    const persistence = parseObservedPersistence(value.persistence, `${path}.persistence`, enabled, warnings);
    return { enabled, persistence };
}
function parseObservedProducerEnabled(value, path, warnings) {
    if (value === undefined) {
        return false;
    }
    if (typeof value === "boolean") {
        return value;
    }
    warnings.push(`Invalid ${path}.enabled=${JSON.stringify(value)}; using false.`);
    return false;
}
function parseObservedPersistence(value, path, enabled, warnings) {
    if (value === undefined) {
        if (enabled) {
            warnings.push(`Missing ${path}; setup must choose persistence explicitly. Using ${SAFE_OBSERVED_ROUTING_PERSISTENCE_FALLBACK}.`);
            return SAFE_OBSERVED_ROUTING_PERSISTENCE_FALLBACK;
        }
        return DEFAULT_OBSERVED_ROUTING_PERSISTENCE;
    }
    if (isStringIn(value, OBSERVED_ROUTING_PERSISTENCE_MODES)) {
        return value;
    }
    if (isStringIn(value, RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES)) {
        warnings.push(`Unsupported ${path}=${JSON.stringify(value)}; redacted persistence is reserved for future work. Using ${SAFE_OBSERVED_ROUTING_PERSISTENCE_FALLBACK}.`);
        return SAFE_OBSERVED_ROUTING_PERSISTENCE_FALLBACK;
    }
    const fallback = enabled ? SAFE_OBSERVED_ROUTING_PERSISTENCE_FALLBACK : DEFAULT_OBSERVED_ROUTING_PERSISTENCE;
    warnings.push(`Invalid ${path}=${JSON.stringify(value)}; expected exact, metadata-only, or none. Using ${fallback}.`);
    return fallback;
}
function parseProviderEnablement(entry, index, warnings) {
    const path = `providers.enabled[${index}]`;
    if (typeof entry === "string") {
        const id = parseConfigString(entry, path, warnings);
        return id ? { id, mode: "discovery" } : undefined;
    }
    if (!isRecord(entry)) {
        warnings.push(`Invalid ${path}; expected a provider id string or provider enablement object.`);
        return undefined;
    }
    const id = parseConfigString(entry.id, `${path}.id`, warnings);
    if (!id) {
        return undefined;
    }
    let mode = "discovery";
    if (entry.mode !== undefined) {
        if (!isStringIn(entry.mode, PROVIDER_MODES)) {
            warnings.push(`Invalid ${path}.mode=${JSON.stringify(entry.mode)}; expected discovery or read-only.`);
            return undefined;
        }
        mode = entry.mode;
    }
    const categories = parseProviderCategories(entry.categories, `${path}.categories`, warnings);
    if (entry.categories !== undefined && categories === undefined) {
        return undefined;
    }
    return categories ? { id, mode, categories } : { id, mode };
}
function parseProviderCategories(value, path, warnings) {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.length === 0) {
        warnings.push(`Invalid ${path}; expected a non-empty array of read-only provider categories.`);
        return undefined;
    }
    const categories = [];
    for (const category of value) {
        if (!isStringIn(category, PROVIDER_CATEGORIES)) {
            warnings.push(`Invalid ${path}; unsupported provider category ${JSON.stringify(category)}.`);
            return undefined;
        }
        categories.push(category);
    }
    return categories;
}
function parseConfigString(value, path, warnings) {
    if (typeof value !== "string" || value.trim().length === 0 || /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(value)) {
        warnings.push(`Invalid ${path}; expected a non-empty single-line string.`);
        return undefined;
    }
    return value.trim();
}
function isStringIn(value, allowed) {
    return typeof value === "string" && allowed.includes(value);
}
function parseStringArray(value, key, warnings) {
    if (!Array.isArray(value)) {
        warnings.push(`Invalid outputRouter.${key}; expected an array of strings.`);
        return undefined;
    }
    if (!value.every((item) => typeof item === "string")) {
        warnings.push(`Invalid outputRouter.${key}; expected an array of strings.`);
        return undefined;
    }
    return value;
}

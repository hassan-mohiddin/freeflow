import { constants as fsConstants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_CAPTURE_CONFIG, DEFAULT_OBSERVED_ROUTING_CONFIG, DEFAULT_OUTPUT_ROUTER_ENABLED, DEFAULT_OUTPUT_ROUTER_PROFILE, DEFAULT_POST_TOOL_ROUTING, DEFAULT_PROVIDERS_CONFIG, DEFAULT_ROUTER_THRESHOLDS, DEFAULT_SCRIPT_DERIVE_CONFIG, OBSERVED_ROUTING_PERSISTENCE_MODES, RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES, DEFAULT_VAULT_RETENTION, DEFAULT_VAULT_ROOT, createLocalVaultIndex, createVault, normalizeFreeflowConfig, probeScriptSandboxAdapters, } from "../../router/dist/index.js";
import { isMcpServerConfigured } from "./mcp-config.js";
import { BUILT_IN_PROVIDER_MANIFESTS, validateProviderManifest } from "./provider-manifests.js";
import { VALID_MODES, readModeState } from "./runtime-context.js";
const STATUS_ACTIONS = new Set(["status", "doctor", "migration"]);
const TOP_LEVEL_CONFIG_KEYS = new Set(["defaultMode", "outputRouter", "capture", "providers", "observedRouting", "scriptDerive"]);
const OUTPUT_ROUTER_CONFIG_KEYS = new Set([
    "enabled",
    "profile",
    "postToolRouting",
    "largeOutputBytes",
    "largeOutputLines",
    "vaultRoot",
    "vaultRetentionDays",
    "generatedPaths",
    "noisyCommandHints",
]);
const CAPTURE_CONFIG_KEYS = new Set(["freeflowMediated", "directHostTools"]);
const PROVIDERS_CONFIG_KEYS = new Set(["enabled", "manifests", "customManifests"]);
const OBSERVED_ROUTING_CONFIG_KEYS = new Set(["enabled", "onRoutingFailure", "mcp", "web", "fetch", "codeSearch"]);
const OBSERVED_ROUTING_PRODUCER_KEYS = new Set(["enabled", "persistence"]);
const OBSERVED_ROUTING_MCP_KEYS = new Set(["servers"]);
const SCRIPT_DERIVE_CONFIG_KEYS = new Set(["enabled", "sandbox", "languages", "network", "limits", "rawScriptPersistence"]);
export async function buildFreeflowStatusReport(params = {}, ctx) {
    const action = normalizeStatusAction(params.action);
    const configFile = await readConfigFile(ctx.cwd);
    const normalized = normalizeFreeflowConfig(configFile.parsed);
    const modeState = await readModeState(ctx.cwd);
    const vault = createVault({
        root: normalized.config.outputRouter.vault.root,
        retention: normalized.config.outputRouter.vault.retention,
    });
    const configWarnings = [...normalized.warnings];
    if (configFile.parseError) {
        configWarnings.unshift(`.freeflow/config.json could not be parsed; using built-in defaults. ${configFile.parseError}`);
    }
    if (isRecord(configFile.parsed) && configFile.parsed.defaultMode !== undefined && !VALID_MODES.has(configFile.parsed.defaultMode)) {
        configWarnings.push(`Invalid defaultMode=${JSON.stringify(configFile.parsed.defaultMode)}; using workflow.`);
    }
    const [vaultWritability, vaultIndex, providers, scriptSandbox] = await Promise.all([
        inspectVaultWritability(vault.root),
        inspectVaultIndex(vault),
        inspectProviders(ctx.cwd, configFile.parsed, normalized.config.providers),
        probeScriptSandboxAdapters({ config: normalized.config.scriptDerive }),
    ]);
    const migration = migrationReport(configFile.parsed);
    return {
        toolStatus: "ok",
        action,
        generatedAt: new Date().toISOString(),
        configPath: configFile.path,
        configExists: configFile.exists,
        mode: modeState,
        effectiveConfig: {
            outputRouter: {
                enabled: normalized.config.outputRouter.enabled,
                profile: normalized.config.outputRouter.profile,
                postToolRouting: normalized.config.outputRouter.postToolRouting,
                thresholds: normalized.config.outputRouter.thresholds,
                vault: normalized.config.outputRouter.vault,
                hints: normalized.config.outputRouter.hints ?? {},
            },
            capture: normalized.config.capture,
            providers: normalized.config.providers,
            observedRouting: normalized.config.observedRouting,
            scriptDerive: normalized.config.scriptDerive,
        },
        effectiveDefaults: {
            outputRouter: {
                enabled: DEFAULT_OUTPUT_ROUTER_ENABLED,
                profile: DEFAULT_OUTPUT_ROUTER_PROFILE,
                postToolRouting: DEFAULT_POST_TOOL_ROUTING,
                thresholds: DEFAULT_ROUTER_THRESHOLDS,
                vaultRoot: DEFAULT_VAULT_ROOT,
                vaultRetention: DEFAULT_VAULT_RETENTION,
            },
            capture: DEFAULT_CAPTURE_CONFIG,
            providers: DEFAULT_PROVIDERS_CONFIG,
            observedRouting: DEFAULT_OBSERVED_ROUTING_CONFIG,
            scriptDerive: DEFAULT_SCRIPT_DERIVE_CONFIG,
        },
        vault: {
            root: vault.root,
            configuredRoot: normalized.config.outputRouter.vault.root,
            retention: normalized.config.outputRouter.vault.retention,
            writability: vaultWritability,
        },
        vaultIndex,
        capture: {
            freeflowMediated: normalized.config.capture.freeflowMediated,
            directHostTools: normalized.config.capture.directHostTools,
            directHostToolCaptureStatus: normalized.config.capture.directHostTools === "off" ? "off" : "unsupported",
            recoverabilityDefault: "Pi public freeflow_capture has been removed; observed routing handles configured MCP/web/fetch/code-search outputs after host execution. Direct host-tool capture is off."
        },
        observedRouting: observedRoutingStatus(normalized.config.observedRouting),
        scriptDerive: scriptDeriveStatus(normalized.config.scriptDerive, scriptSandbox),
        providers,
        recoverabilityDefaults: {
            freeflowRun: "exact stdout/stderr/combined recovery through outputId when persisted",
            observedRouting: "exact raw recovery for enabled observed producers when exact persistence is configured; metadata-only stores no raw stream",
            freeflowDerive: "deterministic derive stores exact derived-output recovery with source lineage when persisted; script derive is disabled by default and unavailable without a sandbox adapter",
            directHostTools: "off by default; optional native read/bash safety-net only when outputRouter.postToolRouting is safety-net",
        },
        configWarnings,
        staleConfig: migration.recommendations,
        migration,
    };
}
function normalizeStatusAction(value) {
    if (typeof value === "string" && STATUS_ACTIONS.has(value)) {
        return value;
    }
    return "status";
}
async function readConfigFile(cwd) {
    const path = join(cwd, ".freeflow/config.json");
    try {
        const raw = await readFile(path, "utf8");
        try {
            const parsed = JSON.parse(raw);
            return { path, exists: true, raw, parsed: isRecord(parsed) ? parsed : {}, parseError: null };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { path, exists: true, raw, parsed: {}, parseError: message };
        }
    }
    catch {
        return { path, exists: false, raw: null, parsed: {}, parseError: null };
    }
}
async function inspectVaultWritability(root) {
    try {
        const rootStats = await stat(root);
        if (!rootStats.isDirectory()) {
            return { status: "not_directory", detail: "Vault root exists but is not a directory." };
        }
        await access(root, fsConstants.W_OK | fsConstants.X_OK);
        return { status: "writable", detail: "Vault root exists and is writable." };
    }
    catch (error) {
        const code = error && typeof error === "object" ? error.code : undefined;
        if (code === "ENOENT") {
            return inspectMissingVaultRoot(root);
        }
        if (code === "EACCES" || code === "EPERM") {
            return { status: "not_writable", detail: `Vault root exists but is not writable (${code}).` };
        }
        return { status: "unknown", detail: `Could not determine vault writability (${code ?? "unknown"}).` };
    }
}
async function inspectVaultIndex(vault) {
    try {
        return await createLocalVaultIndex(vault).status();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            engine: "local-json-sidecar",
            root: `${vault.root}/index/v1`,
            available: false,
            degraded: true,
            stale: true,
            rebuildRecommended: true,
            entryCount: 0,
            textEntryCount: 0,
            metadataOnlyEntryCount: 0,
            outputCount: 0,
            lastError: message,
        };
    }
}
async function inspectMissingVaultRoot(root) {
    const ancestor = await nearestExistingAncestor(dirname(root));
    if (!ancestor) {
        return { status: "missing_ancestor_unavailable", detail: "Vault root does not exist and no existing writable ancestor could be found. No directory was created." };
    }
    if (!ancestor.stats.isDirectory()) {
        return { status: "missing_ancestor_unavailable", detail: `Nearest existing ancestor is not a directory: ${ancestor.path}. No directory was created.` };
    }
    try {
        await access(ancestor.path, fsConstants.W_OK | fsConstants.X_OK);
        return { status: "missing_ancestor_writable", detail: `Vault root does not exist; nearest existing ancestor is writable: ${ancestor.path}. Recursive vault creation should be possible. No directory was created.` };
    }
    catch (error) {
        const code = error && typeof error === "object" ? error.code : undefined;
        return { status: "missing_ancestor_unavailable", detail: `Vault root does not exist and nearest existing ancestor is not writable: ${ancestor.path} (${code ?? "unknown"}). No directory was created.` };
    }
}
async function nearestExistingAncestor(startPath) {
    let current = startPath;
    while (true) {
        try {
            return { path: current, stats: await stat(current) };
        }
        catch (error) {
            const code = error && typeof error === "object" ? error.code : undefined;
            if (code !== "ENOENT") {
                return null;
            }
            const parent = dirname(current);
            if (parent === current) {
                return null;
            }
            current = parent;
        }
    }
}
async function inspectProviders(cwd, rawConfig, providersConfig) {
    const customManifestValidation = validateCustomManifests(rawConfig);
    const enabled = [];
    const availability = [];
    for (const provider of providersConfig.enabled) {
        enabled.push(provider);
        availability.push(await providerAvailability(cwd, provider, customManifestValidation));
    }
    return {
        enabled,
        availability,
        customManifests: customManifestValidation,
    };
}
async function providerAvailability(cwd, provider, customManifestValidation) {
    if (provider.id === "serena") {
        const configured = await isMcpServerConfigured("serena", cwd);
        return {
            id: provider.id,
            mode: provider.mode,
            categories: provider.categories ?? [],
            status: configured ? "available" : "unavailable",
            reason: configured ? "Serena MCP server is configured for Pi." : "MCP server serena is not configured for Pi.",
        };
    }
    if (provider.id === "codebase-memory") {
        return {
            id: provider.id,
            mode: provider.mode,
            categories: provider.categories ?? [],
            status: "unavailable",
            reason: "No Pi observed-routing capability check is registered for this provider yet.",
        };
    }
    const customManifest = customManifestValidation.valid.find((manifest) => manifest.id === provider.id);
    if (customManifest) {
        return {
            id: provider.id,
            mode: provider.mode,
            categories: provider.categories ?? [],
            status: "custom_unverified",
            reason: "Custom provider manifest is valid but no executable adapter is verified by Freeflow.",
        };
    }
    const builtIn = BUILT_IN_PROVIDER_MANIFESTS.find((manifest) => manifest.id === provider.id);
    return {
        id: provider.id,
        mode: provider.mode,
        categories: provider.categories ?? [],
        status: builtIn ? "configured" : "unknown_provider",
        reason: builtIn ? "Provider is configured; availability is not detectable in this Pi adapter." : "Provider id has no built-in manifest or valid custom manifest.",
    };
}
function scriptDeriveStatus(config, sandboxReport) {
    return {
        enabled: config.enabled,
        sandbox: config.sandbox,
        adapterAvailable: sandboxReport.adapterAvailable,
        adapterStatus: sandboxReport.adapterStatus,
        adapterContractVersion: sandboxReport.contractVersion,
        configuredLanguages: sandboxReport.configuredLanguages,
        availableLanguages: sandboxReport.availableLanguages,
        unavailableLanguages: sandboxReport.unavailableLanguages,
        registeredAdapters: sandboxReport.registeredAdapters,
        requiredProofs: sandboxReport.requiredProofs,
        candidateMechanisms: sandboxReport.candidateMechanisms,
        network: config.network,
        limits: config.limits,
        rawScriptPersistence: config.rawScriptPersistence,
        executionStatus: config.enabled && sandboxReport.adapterAvailable ? "adapter_available_execution_deferred" : config.enabled ? "adapter_unavailable" : "disabled",
        notes: [
            "Script derive is disabled by default and setup must not enable it implicitly.",
            "No unsandboxed fallback is allowed; script code is not executed without an approved sandbox adapter.",
            "Raw script text is not persisted by default.",
            ...sandboxReport.notes,
        ],
    };
}
function observedRoutingStatus(config) {
    const servers = Object.entries((config.mcp?.servers ?? {})).map(([id, server]) => ({
        id,
        enabled: server.enabled,
        persistence: server.persistence,
    }));
    return {
        enabled: config.enabled,
        onRoutingFailure: config.onRoutingFailure,
        host: {
            name: "pi",
            outputReplacement: "available",
            reason: "Pi tool_result hooks can modify tool results; observed routing remains controlled by explicit producer/server config.",
        },
        mcp: {
            configuredServerCount: servers.length,
            servers,
        },
        web: config.web,
        fetch: config.fetch,
        codeSearch: config.codeSearch,
        persistenceModes: [...OBSERVED_ROUTING_PERSISTENCE_MODES],
        unsupportedPersistenceModes: [...RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES],
        notes: [
            "Observed routing is off unless observedRouting.enabled and the individual producer/server are enabled.",
            "redacted persistence is reserved for future work; unsupported redacted config falls back to metadata-only.",
        ],
    };
}
function validateCustomManifests(rawConfig) {
    const rawManifests = configuredCustomManifests(rawConfig);
    const valid = [];
    const invalid = [];
    rawManifests.forEach((manifest, index) => {
        const result = validateProviderManifest(manifest, "custom");
        if (result.ok) {
            valid.push({
                id: result.value.id,
                displayName: result.value.displayName,
                capabilityCount: result.value.capabilities.length,
                pairingRuleCount: result.value.pairingRules.length,
            });
        }
        else {
            invalid.push({ index, issues: result.issues });
        }
    });
    return {
        total: rawManifests.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        valid,
        invalid,
    };
}
function configuredCustomManifests(rawConfig) {
    if (!isRecord(rawConfig) || !isRecord(rawConfig.providers)) {
        return [];
    }
    if (Array.isArray(rawConfig.providers.manifests)) {
        return rawConfig.providers.manifests;
    }
    if (Array.isArray(rawConfig.providers.customManifests)) {
        return rawConfig.providers.customManifests;
    }
    return [];
}
function migrationReport(rawConfig) {
    const recommendations = collectMigrationRecommendations(rawConfig);
    return {
        applied: false,
        requiresConfirmation: recommendations.length > 0,
        recommendations,
        note: recommendations.length > 0
            ? "Recommendations are informational only. Freeflow status/doctor does not rewrite .freeflow/config.json without explicit confirmation."
            : "No migration recommendations detected.",
    };
}
function collectMigrationRecommendations(rawConfig) {
    const recommendations = [];
    if (!isRecord(rawConfig)) {
        return recommendations;
    }
    for (const key of Object.keys(rawConfig)) {
        if (!TOP_LEVEL_CONFIG_KEYS.has(key)) {
            recommendations.push(recommendation(key, "review", "Unrecognized top-level Freeflow config key; review before migrating."));
        }
    }
    collectOutputRouterRecommendations(rawConfig.outputRouter, recommendations);
    collectCaptureRecommendations(rawConfig.capture, recommendations);
    collectProviderRecommendations(rawConfig.providers, recommendations);
    collectObservedRoutingRecommendations(rawConfig.observedRouting, recommendations);
    collectScriptDeriveRecommendations(rawConfig.scriptDerive, recommendations);
    return recommendations;
}
function collectOutputRouterRecommendations(value, recommendations) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        recommendations.push(recommendation("outputRouter", "fix", "Expected object; remove or rewrite invalid outputRouter config."));
        return;
    }
    for (const key of Object.keys(value)) {
        if (!OUTPUT_ROUTER_CONFIG_KEYS.has(key)) {
            recommendations.push(recommendation(`outputRouter.${key}`, "review", "Unrecognized outputRouter key; review before migrating."));
        }
    }
    addDefaultRecommendation(recommendations, "outputRouter.enabled", value.enabled, DEFAULT_OUTPUT_ROUTER_ENABLED);
    addDefaultRecommendation(recommendations, "outputRouter.profile", value.profile, DEFAULT_OUTPUT_ROUTER_PROFILE);
    addDefaultRecommendation(recommendations, "outputRouter.postToolRouting", value.postToolRouting, DEFAULT_POST_TOOL_ROUTING);
    addDefaultRecommendation(recommendations, "outputRouter.largeOutputBytes", value.largeOutputBytes, DEFAULT_ROUTER_THRESHOLDS.largeOutputBytes);
    addDefaultRecommendation(recommendations, "outputRouter.largeOutputLines", value.largeOutputLines, DEFAULT_ROUTER_THRESHOLDS.largeOutputLines);
    addDefaultRecommendation(recommendations, "outputRouter.vaultRoot", value.vaultRoot, DEFAULT_VAULT_ROOT);
    addDefaultRecommendation(recommendations, "outputRouter.vaultRetentionDays", value.vaultRetentionDays, DEFAULT_VAULT_RETENTION.ttlDays);
    if (Object.keys(value).length === 0) {
        recommendations.push(recommendation("outputRouter", "remove", "Empty outputRouter object can be removed; built-in defaults apply."));
    }
}
function collectCaptureRecommendations(value, recommendations) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        recommendations.push(recommendation("capture", "fix", "Expected object; remove or rewrite invalid capture config."));
        return;
    }
    for (const key of Object.keys(value)) {
        if (!CAPTURE_CONFIG_KEYS.has(key)) {
            recommendations.push(recommendation(`capture.${key}`, "review", "Unrecognized capture key; review before migrating."));
        }
    }
    addDefaultRecommendation(recommendations, "capture.freeflowMediated", value.freeflowMediated, DEFAULT_CAPTURE_CONFIG.freeflowMediated);
    addDefaultRecommendation(recommendations, "capture.directHostTools", value.directHostTools, DEFAULT_CAPTURE_CONFIG.directHostTools);
    if (Object.keys(value).length === 0) {
        recommendations.push(recommendation("capture", "remove", "Empty capture object can be removed; built-in defaults apply."));
    }
}
function collectProviderRecommendations(value, recommendations) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        recommendations.push(recommendation("providers", "fix", "Expected object; remove or rewrite invalid providers config."));
        return;
    }
    for (const key of Object.keys(value)) {
        if (!PROVIDERS_CONFIG_KEYS.has(key)) {
            recommendations.push(recommendation(`providers.${key}`, "review", "Unrecognized providers key; review before migrating."));
        }
    }
    if (Array.isArray(value.enabled) && value.enabled.length === 0 && Object.keys(value).length === 1) {
        recommendations.push(recommendation("providers", "remove", "providers.enabled is empty; remove providers object unless preserving an intentional setup decision."));
    }
    if (Object.keys(value).length === 0) {
        recommendations.push(recommendation("providers", "remove", "Empty providers object can be removed; built-in defaults apply."));
    }
}
function collectScriptDeriveRecommendations(value, recommendations) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        recommendations.push(recommendation("scriptDerive", "fix", "Expected object; remove or rewrite invalid scriptDerive config."));
        return;
    }
    for (const key of Object.keys(value)) {
        if (!SCRIPT_DERIVE_CONFIG_KEYS.has(key)) {
            recommendations.push(recommendation(`scriptDerive.${key}`, "review", "Unrecognized scriptDerive key; review before migrating."));
        }
    }
    addDefaultRecommendation(recommendations, "scriptDerive.enabled", value.enabled, DEFAULT_SCRIPT_DERIVE_CONFIG.enabled);
    addDefaultRecommendation(recommendations, "scriptDerive.sandbox", value.sandbox, DEFAULT_SCRIPT_DERIVE_CONFIG.sandbox);
    addDefaultRecommendation(recommendations, "scriptDerive.network", value.network, DEFAULT_SCRIPT_DERIVE_CONFIG.network);
    addDefaultRecommendation(recommendations, "scriptDerive.rawScriptPersistence", value.rawScriptPersistence, DEFAULT_SCRIPT_DERIVE_CONFIG.rawScriptPersistence);
    if (Object.keys(value).length === 0) {
        recommendations.push(recommendation("scriptDerive", "remove", "Empty scriptDerive object can be removed; script derive is disabled by default."));
    }
}
function collectObservedRoutingRecommendations(value, recommendations) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        recommendations.push(recommendation("observedRouting", "fix", "Expected object; remove or rewrite invalid observedRouting config."));
        return;
    }
    for (const key of Object.keys(value)) {
        if (!OBSERVED_ROUTING_CONFIG_KEYS.has(key)) {
            recommendations.push(recommendation(`observedRouting.${key}`, "review", "Unrecognized observedRouting key; review before migrating."));
        }
    }
    addDefaultRecommendation(recommendations, "observedRouting.enabled", value.enabled, DEFAULT_OBSERVED_ROUTING_CONFIG.enabled);
    addDefaultRecommendation(recommendations, "observedRouting.onRoutingFailure", value.onRoutingFailure, DEFAULT_OBSERVED_ROUTING_CONFIG.onRoutingFailure);
    collectObservedMcpRecommendations(value.mcp, recommendations);
    collectObservedProducerRecommendations(value.web, "observedRouting.web", recommendations);
    collectObservedProducerRecommendations(value.fetch, "observedRouting.fetch", recommendations);
    collectObservedProducerRecommendations(value.codeSearch, "observedRouting.codeSearch", recommendations);
    if (Object.keys(value).length === 0) {
        recommendations.push(recommendation("observedRouting", "remove", "Empty observedRouting object can be removed; observed routing is off by default."));
    }
}
function collectObservedMcpRecommendations(value, recommendations) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        recommendations.push(recommendation("observedRouting.mcp", "fix", "Expected object with explicit servers."));
        return;
    }
    for (const key of Object.keys(value)) {
        if (!OBSERVED_ROUTING_MCP_KEYS.has(key)) {
            recommendations.push(recommendation(`observedRouting.mcp.${key}`, "review", "Unrecognized observedRouting.mcp key; review before migrating."));
        }
    }
    if (value.servers !== undefined && !isRecord(value.servers)) {
        recommendations.push(recommendation("observedRouting.mcp.servers", "fix", "Expected object keyed by MCP server id."));
    }
}
function collectObservedProducerRecommendations(value, path, recommendations) {
    if (value === undefined) {
        return;
    }
    if (!isRecord(value)) {
        recommendations.push(recommendation(path, "fix", "Expected object with enabled and persistence."));
        return;
    }
    for (const key of Object.keys(value)) {
        if (!OBSERVED_ROUTING_PRODUCER_KEYS.has(key)) {
            recommendations.push(recommendation(`${path}.${key}`, "review", "Unrecognized observed routing producer key; review before migrating."));
        }
    }
}
function addDefaultRecommendation(recommendations, path, value, defaultValue) {
    if (value === undefined) {
        return;
    }
    if (JSON.stringify(value) === JSON.stringify(defaultValue)) {
        recommendations.push(recommendation(path, "remove", `Explicit default value ${JSON.stringify(defaultValue)} can be removed unless it records an intentional override.`));
    }
}
function recommendation(path, action, message) {
    return { path, action, message };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { constants as fsConstants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  DEFAULT_OBSERVED_ROUTING_CONFIG,
  DEFAULT_OUTPUT_ROUTER_ENABLED,
  DEFAULT_OUTPUT_ROUTER_PROFILE,
  DEFAULT_POST_TOOL_ROUTING,
  DEFAULT_ROUTER_THRESHOLDS,
  DEFAULT_SCRIPT_TRANSFORM_CONFIG,
  DEFAULT_STORAGE_POLICY,
  OBSERVED_ROUTING_PERSISTENCE_MODES,
  RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES,
  DEFAULT_VAULT_RETENTION,
  DEFAULT_VAULT_ROOT,
  defaultScriptTransformAdaptersHome,
  createLocalVaultIndex,
  createVault,
  discoverEryxPythonSandboxAdaptersFromEnv,
  discoverJqWasmSandboxAdaptersFromEnv,
  discoverQuickJsWasiSandboxAdaptersFromEnv,
  normalizeFreeflowConfig,
  normalizeLocalFreeflowConfig,
  probeScriptSandboxAdapters,
} from "../../../router/dist/index.js";
import { VALID_MODES, readCapabilityState, readModeState } from "../runtime/runtime-context.js";

const STATUS_ACTIONS = new Set(["status", "doctor", "migration"]);
const TOP_LEVEL_CONFIG_KEYS = new Set([
  "enabled",
  "defaultMode",
  "interactionContract",
  "skills",
  "outputRouter",
  "observedRouting",
  "scriptTransform",
  "cognitiveRouting",
]);
const OUTPUT_ROUTER_CONFIG_KEYS = new Set([
  "enabled",
  "profile",
  "postToolRouting",
  "storagePolicy",
  "largeOutputBytes",
  "largeOutputLines",
  "thresholds",
  "vaultRoot",
  "vaultRetentionDays",
  "vault",
  "generatedPaths",
  "noisyCommandHints",
  "hints",
  "observedRouting",
  "scriptTransform",
]);
const OBSERVED_ROUTING_CONFIG_KEYS = new Set(["enabled", "onRoutingFailure", "mcp", "web", "fetch", "codeSearch"]);
const OBSERVED_ROUTING_PRODUCER_KEYS = new Set(["enabled", "persistence"]);
const OBSERVED_ROUTING_MCP_KEYS = new Set(["servers"]);
const SCRIPT_TRANSFORM_CONFIG_KEYS = new Set([
  "enabled",
  "sandbox",
  "languages",
  "network",
  "limits",
  "rawScriptPersistence",
]);

function cognitiveRoutingStatus(state, runtime, ctx) {
  if (!state) return state;
  const preflightEffective = state.effective === true;
  const suppressed =
    ctx?.modelStateProvenance?.explicitModel === true || ctx?.modelStateProvenance?.explicitThinking === true;
  const runtimeStatus = preflightEffective
    ? runtime?.effective === true
      ? "active"
      : runtime
        ? "pending"
        : suppressed
          ? "suppressed"
          : "inactive"
    : "inactive";
  const runtimeReason = suppressed ? "startup_suppressed" : runtime ? "runtime_pending" : "runtime_inactive";
  return {
    ...state,
    preflightEffective,
    preflightBlockingReason: preflightEffective ? null : state.blockingReason,
    effective: preflightEffective && runtime?.effective === true,
    blockingReason: preflightEffective
      ? runtime?.effective === true
        ? null
        : { code: "runtime_inactive", message: `Cognitive Routing runtime is ${runtimeStatus}.` }
      : state.blockingReason,
    runtimeStatus,
    runtime: runtime ? { ...runtime, runtimeStatus } : { effective: false, runtimeStatus, reason: runtimeReason },
  };
}

export async function buildFreeflowStatusReport(
  params = {},
  ctx,
  cognitiveRoutingRuntime = undefined,
  hostInfo = undefined,
) {
  const action = normalizeStatusAction((params as any).action);
  const configFile = await readConfigFile(ctx.cwd);
  const localConfigFile = await readLocalConfigFile(ctx.cwd);
  const normalized = normalizeFreeflowConfig(configFile.parsed);
  const localNormalized = normalizeLocalFreeflowConfig(localConfigFile.parsed);
  const [modeState, runtimeState] = await Promise.all([
    readModeState(ctx.cwd),
    readCapabilityState(ctx.cwd, ctx, hostInfo),
  ]);
  const effectiveFreeflowConfig = runtimeState.enabled
    ? normalized.config
    : {
        ...normalized.config,
        outputRouter: { ...normalized.config.outputRouter, enabled: false },
        observedRouting: {
          ...normalized.config.observedRouting,
          enabled: false,
        },
        scriptTransform: {
          ...normalized.config.scriptTransform,
          enabled: false,
        },
      };
  const vault = createVault({
    root: effectiveFreeflowConfig.outputRouter.vault.root,
    retention: effectiveFreeflowConfig.outputRouter.vault.retention,
  });
  const configWarnings = [...normalized.warnings];
  const localConfigWarnings = [...localNormalized.warnings];

  if (!runtimeState.repositoryConfigured && configFile.exists) {
    configWarnings.unshift(
      `.freeflow/config.json is invalid; Freeflow runtime is inactive. ${runtimeState.parseError ?? configFile.parseError ?? "Unknown config error."}`,
    );
  }
  if (
    isRecord(configFile.parsed) &&
    configFile.parsed.defaultMode !== undefined &&
    !VALID_MODES.has(configFile.parsed.defaultMode)
  ) {
    configWarnings.push(`Invalid defaultMode=${JSON.stringify(configFile.parsed.defaultMode)}; using workflow.`);
  }
  if (runtimeState.localConfigExists && !runtimeState.localConfigValid) {
    localConfigWarnings.unshift(
      `.freeflow/local.json is invalid; Freeflow runtime is inactive. ${runtimeState.localConfigParseError ?? localConfigFile.parseError ?? "Unknown local config error."}`,
    );
  }

  const scriptSandboxAdapters = [
    ...(await discoverQuickJsWasiSandboxAdaptersFromEnv()),
    ...(await discoverJqWasmSandboxAdaptersFromEnv()),
    ...(await discoverEryxPythonSandboxAdaptersFromEnv()),
  ];
  const [vaultWritability, vaultIndex, scriptSandbox] = await Promise.all([
    inspectVaultWritability(vault.root),
    inspectVaultIndex(vault),
    probeScriptSandboxAdapters({
      config: effectiveFreeflowConfig.scriptTransform,
      adapters: scriptSandboxAdapters,
    }),
  ]);
  const migration = migrationReport(configFile.parsed);

  return {
    toolStatus: "ok",
    action,
    generatedAt: new Date().toISOString(),
    configPath: configFile.path,
    configExists: configFile.exists,
    configValid: runtimeState.configValid,
    repositoryConfigValid: runtimeState.repositoryConfigured,
    localConfigPath: localConfigFile.path,
    localConfigExists: localConfigFile.exists,
    localConfigValid: runtimeState.localConfigValid,
    configuration: {
      repository: {
        path: configFile.path,
        exists: configFile.exists,
        valid: runtimeState.repositoryConfigured,
        error: runtimeState.repositoryConfigured ? null : (runtimeState.parseError ?? configFile.parseError),
      },
      personal: {
        path: localConfigFile.path,
        exists: localConfigFile.exists,
        valid: runtimeState.localConfigValid,
        error: runtimeState.localConfigParseError,
      },
      sources: runtimeState.configSources,
    },
    mode: {
      ...modeState,
      active: modeState.active,
      resolvedMode: modeState.resolvedMode,
      defaultModeSource: runtimeState.configSources.defaultMode,
    },
    effectiveConfig: {
      configured: runtimeState.configured,
      enabled: runtimeState.enabled,
      defaultMode: runtimeState.defaultMode,
      sources: runtimeState.configSources,
      interactionContract: runtimeState.interactionContract,
      skills: runtimeState.skills,
      outputRouter: {
        enabled: effectiveFreeflowConfig.outputRouter.enabled,
        profile: effectiveFreeflowConfig.outputRouter.profile,
        postToolRouting: effectiveFreeflowConfig.outputRouter.postToolRouting,
        storagePolicy: effectiveFreeflowConfig.outputRouter.storagePolicy,
        thresholds: effectiveFreeflowConfig.outputRouter.thresholds,
        vault: effectiveFreeflowConfig.outputRouter.vault,
        hints: effectiveFreeflowConfig.outputRouter.hints ?? {},
        observedRouting: effectiveFreeflowConfig.observedRouting,
        scriptTransform: effectiveFreeflowConfig.scriptTransform,
      },
      cognitiveRouting: cognitiveRoutingStatus(runtimeState.cognitiveRouting, cognitiveRoutingRuntime, ctx),
    },
    effectiveLocalConfig: localNormalized.config,
    effectiveDefaults: {
      enabled: true,
      interactionContract: true,
      skills: { enabled: true },
      outputRouter: {
        enabled: DEFAULT_OUTPUT_ROUTER_ENABLED,
        profile: DEFAULT_OUTPUT_ROUTER_PROFILE,
        postToolRouting: DEFAULT_POST_TOOL_ROUTING,
        storagePolicy: DEFAULT_STORAGE_POLICY,
        thresholds: DEFAULT_ROUTER_THRESHOLDS,
        vaultRoot: DEFAULT_VAULT_ROOT,
        vaultRetention: DEFAULT_VAULT_RETENTION,
        observedRouting: DEFAULT_OBSERVED_ROUTING_CONFIG,
        scriptTransform: DEFAULT_SCRIPT_TRANSFORM_CONFIG,
      },
    },
    vault: {
      root: vault.root,
      configuredRoot: effectiveFreeflowConfig.outputRouter.vault.root,
      retention: effectiveFreeflowConfig.outputRouter.vault.retention,
      writability: vaultWritability,
    },
    vaultIndex,
    observedRouting: observedRoutingStatus(effectiveFreeflowConfig.observedRouting),
    scriptTransform: scriptTransformStatus(effectiveFreeflowConfig.scriptTransform, scriptSandbox),
    processing: processingStatus(localNormalized.config),
    recoverabilityDefaults: {
      freeflowRun:
        "hybrid-dedupe command capture: exact when exactness-sensitive or duplicate recovery points to a prior exact outputId; small non-sensitive successes may be metadata-only",
      observedRouting:
        "exact raw recovery for enabled observed producers when exact persistence is configured; metadata-only stores no raw stream",
      freeflowTransform:
        "deterministic transform stores exact transformed-output recovery with source lineage when persisted; script transform is disabled by default and requires an approved sandbox adapter",
      nativeSafetyNet:
        "off by default; optional native read/bash safety-net only when outputRouter.postToolRouting is safety-net",
    },
    configWarnings,
    localConfigWarnings,
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
      return {
        path,
        exists: true,
        raw,
        parsed: isRecord(parsed) ? parsed : {},
        parseError: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { path, exists: true, raw, parsed: {}, parseError: message };
    }
  } catch {
    return { path, exists: false, raw: null, parsed: {}, parseError: null };
  }
}

async function readLocalConfigFile(cwd) {
  const path = join(cwd, ".freeflow/local.json");
  try {
    const raw = await readFile(path, "utf8");
    try {
      const parsed = JSON.parse(raw);
      return {
        path,
        exists: true,
        raw,
        parsed: isRecord(parsed) ? parsed : {},
        parseError: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { path, exists: true, raw, parsed: {}, parseError: message };
    }
  } catch {
    return { path, exists: false, raw: null, parsed: {}, parseError: null };
  }
}

async function inspectVaultWritability(root) {
  try {
    const rootStats = await stat(root);
    if (!rootStats.isDirectory()) {
      return {
        status: "not_directory",
        detail: "Vault root exists but is not a directory.",
      };
    }
    await access(root, fsConstants.W_OK | fsConstants.X_OK);
    return { status: "writable", detail: "Vault root exists and is writable." };
  } catch (error) {
    const code = error && typeof error === "object" ? (error as any).code : undefined;
    if (code === "ENOENT") {
      return inspectMissingVaultRoot(root);
    }
    if (code === "EACCES" || code === "EPERM") {
      return {
        status: "not_writable",
        detail: `Vault root exists but is not writable (${code}).`,
      };
    }
    return {
      status: "unknown",
      detail: `Could not determine vault writability (${code ?? "unknown"}).`,
    };
  }
}

async function inspectVaultIndex(vault) {
  try {
    return await createLocalVaultIndex(vault).status();
  } catch (error) {
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
    return {
      status: "missing_ancestor_unavailable",
      detail: "Vault root does not exist and no existing writable ancestor could be found. No directory was created.",
    };
  }

  if (!ancestor.stats.isDirectory()) {
    return {
      status: "missing_ancestor_unavailable",
      detail: `Nearest existing ancestor is not a directory: ${ancestor.path}. No directory was created.`,
    };
  }

  try {
    await access(ancestor.path, fsConstants.W_OK | fsConstants.X_OK);
    return {
      status: "missing_ancestor_writable",
      detail: `Vault root does not exist; nearest existing ancestor is writable: ${ancestor.path}. Recursive vault creation should be possible. No directory was created.`,
    };
  } catch (error) {
    const code = error && typeof error === "object" ? (error as any).code : undefined;
    return {
      status: "missing_ancestor_unavailable",
      detail: `Vault root does not exist and nearest existing ancestor is not writable: ${ancestor.path} (${code ?? "unknown"}). No directory was created.`,
    };
  }
}

async function nearestExistingAncestor(startPath) {
  let current = startPath;
  while (true) {
    try {
      return { path: current, stats: await stat(current) };
    } catch (error) {
      const code = error && typeof error === "object" ? (error as any).code : undefined;
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

function scriptTransformStatus(config, sandboxReport) {
  const adapterHome = defaultScriptTransformAdaptersHome();
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
    executionStatus:
      config.enabled && sandboxReport.adapterAvailable
        ? "available"
        : config.enabled
          ? "adapter_unavailable"
          : "disabled",
    adapterHome,
    setupCommand:
      "node <plugin-root>/router/dist/setup/script-transform-adapters.js install --config .freeflow/config.json",
    notes: [
      "Script transform is disabled until setup/user config opts in with outputRouter.scriptTransform.enabled=true.",
      "Setup can install proof-backed adapters into a user-global Freeflow cache and enable only languages that pass sandbox probes.",
      "No unsandboxed fallback is allowed; script code is not executed without an approved sandbox adapter.",
      "Raw script text is not persisted by default.",
      `Global adapter cache: ${adapterHome}. Custom roots may use FREEFLOW_QUICKJS_WASI_ROOT, FREEFLOW_JQ_WASM_ROOT, or FREEFLOW_ERYX_ROOT.`,
      ...sandboxReport.notes,
    ],
  };
}

function processingStatus(localConfig) {
  const enabled = localConfig.processing.unsafeUnsandboxed.enabled;
  return {
    unsafeUnsandboxed: {
      enabled,
      source: ".freeflow/local.json",
      status: enabled ? "enabled_unsafe" : "disabled",
      notes: enabled
        ? [
            "Unsafe unsandboxed processing is enabled only by local config for this checkout.",
            "Every unsafe execution result must be labeled unsafe/unsandboxed and must not claim sandbox/read-only/network-off execution.",
          ]
        : [
            "Unsafe unsandboxed processing is disabled. Shared .freeflow/config.json cannot enable it.",
            "Enable only in local-only .freeflow/local.json after accepting the risk.",
          ],
    },
  };
}

function observedRoutingStatus(config) {
  const servers = Object.entries((config.mcp?.servers ?? {}) as Record<string, any>).map(([id, server]) => ({
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
      reason:
        "Pi tool_result hooks can modify tool results; observed routing remains controlled by explicit producer/server config.",
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
      "Observed routing is off unless outputRouter.enabled, outputRouter.observedRouting.enabled, and the individual producer/server are enabled.",
      "redacted persistence is reserved for future work; unsupported redacted config falls back to metadata-only.",
    ],
  };
}

function migrationReport(rawConfig) {
  const recommendations = collectMigrationRecommendations(rawConfig);
  return {
    applied: false,
    requiresConfirmation: recommendations.length > 0,
    recommendations,
    note:
      recommendations.length > 0
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
      recommendations.push(
        recommendation(key, "review", "Unrecognized top-level Freeflow config key; review before migrating."),
      );
    }
  }

  collectOutputRouterRecommendations(rawConfig.outputRouter, recommendations);
  if (rawConfig.observedRouting !== undefined) {
    recommendations.push(
      recommendation("observedRouting", "move", "Move top-level observedRouting under outputRouter.observedRouting."),
    );
    collectObservedRoutingRecommendations(rawConfig.observedRouting, recommendations, "observedRouting");
  }
  if (rawConfig.scriptTransform !== undefined) {
    recommendations.push(
      recommendation("scriptTransform", "move", "Move top-level scriptTransform under outputRouter.scriptTransform."),
    );
    collectScriptTransformRecommendations(rawConfig.scriptTransform, recommendations, "scriptTransform");
  }
  return recommendations;
}

function collectOutputRouterRecommendations(value, recommendations) {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    recommendations.push(
      recommendation("outputRouter", "fix", "Expected object; remove or rewrite invalid outputRouter config."),
    );
    return;
  }

  for (const key of Object.keys(value)) {
    if (!OUTPUT_ROUTER_CONFIG_KEYS.has(key)) {
      recommendations.push(
        recommendation(`outputRouter.${key}`, "review", "Unrecognized outputRouter key; review before migrating."),
      );
    }
  }

  addDefaultRecommendation(recommendations, "outputRouter.enabled", value.enabled, DEFAULT_OUTPUT_ROUTER_ENABLED);
  addDefaultRecommendation(recommendations, "outputRouter.profile", value.profile, DEFAULT_OUTPUT_ROUTER_PROFILE);
  addDefaultRecommendation(
    recommendations,
    "outputRouter.postToolRouting",
    value.postToolRouting,
    DEFAULT_POST_TOOL_ROUTING,
  );
  addDefaultRecommendation(recommendations, "outputRouter.storagePolicy", value.storagePolicy, DEFAULT_STORAGE_POLICY);
  collectThresholdRecommendations(value.thresholds, recommendations);
  collectVaultRecommendations(value.vault, recommendations);
  collectHintsRecommendations(value.hints, recommendations);
  addLegacyMoveOrDefaultRecommendation(
    recommendations,
    "outputRouter.largeOutputBytes",
    value.largeOutputBytes,
    DEFAULT_ROUTER_THRESHOLDS.largeOutputBytes,
    "outputRouter.thresholds.largeOutputBytes",
  );
  addLegacyMoveOrDefaultRecommendation(
    recommendations,
    "outputRouter.largeOutputLines",
    value.largeOutputLines,
    DEFAULT_ROUTER_THRESHOLDS.largeOutputLines,
    "outputRouter.thresholds.largeOutputLines",
  );
  addLegacyMoveOrDefaultRecommendation(
    recommendations,
    "outputRouter.vaultRoot",
    value.vaultRoot,
    DEFAULT_VAULT_ROOT,
    "outputRouter.vault.root",
  );
  addLegacyMoveOrDefaultRecommendation(
    recommendations,
    "outputRouter.vaultRetentionDays",
    value.vaultRetentionDays,
    DEFAULT_VAULT_RETENTION.ttlDays,
    "outputRouter.vault.retention.ttlDays",
  );
  collectObservedRoutingRecommendations(value.observedRouting, recommendations, "outputRouter.observedRouting");
  collectScriptTransformRecommendations(value.scriptTransform, recommendations, "outputRouter.scriptTransform");

  if (Object.keys(value).length === 0) {
    recommendations.push(
      recommendation("outputRouter", "remove", "Empty outputRouter object can be removed; built-in defaults apply."),
    );
  }
}

function collectThresholdRecommendations(value, recommendations) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    recommendations.push(
      recommendation("outputRouter.thresholds", "fix", "Expected object with largeOutputBytes and largeOutputLines."),
    );
    return;
  }
  addDefaultRecommendation(
    recommendations,
    "outputRouter.thresholds.largeOutputBytes",
    value.largeOutputBytes,
    DEFAULT_ROUTER_THRESHOLDS.largeOutputBytes,
  );
  addDefaultRecommendation(
    recommendations,
    "outputRouter.thresholds.largeOutputLines",
    value.largeOutputLines,
    DEFAULT_ROUTER_THRESHOLDS.largeOutputLines,
  );
}

function collectVaultRecommendations(value, recommendations) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    recommendations.push(recommendation("outputRouter.vault", "fix", "Expected object with root and retention."));
    return;
  }
  addDefaultRecommendation(recommendations, "outputRouter.vault.root", value.root, DEFAULT_VAULT_ROOT);
  const retention = value.retention;
  if (isRecord(retention)) {
    addDefaultRecommendation(
      recommendations,
      "outputRouter.vault.retention.strategy",
      retention.strategy,
      DEFAULT_VAULT_RETENTION.strategy,
    );
    addDefaultRecommendation(
      recommendations,
      "outputRouter.vault.retention.ttlDays",
      retention.ttlDays,
      DEFAULT_VAULT_RETENTION.ttlDays,
    );
  } else if (retention !== undefined) {
    recommendations.push(recommendation("outputRouter.vault.retention", "fix", "Expected retention object."));
  }
}

function collectHintsRecommendations(value, recommendations) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    recommendations.push(
      recommendation(
        "outputRouter.hints",
        "fix",
        "Expected object with generatedPathGlobs/noisyCommandPatterns arrays.",
      ),
    );
  }
}

function collectScriptTransformRecommendations(value, recommendations, path) {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    recommendations.push(recommendation(path, "fix", `Expected object; remove or rewrite invalid ${path} config.`));
    return;
  }

  for (const key of Object.keys(value)) {
    if (!SCRIPT_TRANSFORM_CONFIG_KEYS.has(key)) {
      recommendations.push(
        recommendation(`${path}.${key}`, "review", "Unrecognized scriptTransform key; review before migrating."),
      );
    }
  }

  addDefaultRecommendation(recommendations, `${path}.enabled`, value.enabled, DEFAULT_SCRIPT_TRANSFORM_CONFIG.enabled);
  addDefaultRecommendation(recommendations, `${path}.sandbox`, value.sandbox, DEFAULT_SCRIPT_TRANSFORM_CONFIG.sandbox);
  addDefaultRecommendation(recommendations, `${path}.network`, value.network, DEFAULT_SCRIPT_TRANSFORM_CONFIG.network);
  addDefaultRecommendation(
    recommendations,
    `${path}.rawScriptPersistence`,
    value.rawScriptPersistence,
    DEFAULT_SCRIPT_TRANSFORM_CONFIG.rawScriptPersistence,
  );

  if (Object.keys(value).length === 0) {
    recommendations.push(
      recommendation(
        path,
        "remove",
        "Empty scriptTransform object can be removed; script transform is disabled by default.",
      ),
    );
  }
}

function collectObservedRoutingRecommendations(value, recommendations, path) {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    recommendations.push(recommendation(path, "fix", `Expected object; remove or rewrite invalid ${path} config.`));
    return;
  }

  for (const key of Object.keys(value)) {
    if (!OBSERVED_ROUTING_CONFIG_KEYS.has(key)) {
      recommendations.push(
        recommendation(`${path}.${key}`, "review", "Unrecognized observedRouting key; review before migrating."),
      );
    }
  }

  addDefaultRecommendation(recommendations, `${path}.enabled`, value.enabled, DEFAULT_OBSERVED_ROUTING_CONFIG.enabled);
  addDefaultRecommendation(
    recommendations,
    `${path}.onRoutingFailure`,
    value.onRoutingFailure,
    DEFAULT_OBSERVED_ROUTING_CONFIG.onRoutingFailure,
  );
  collectObservedMcpRecommendations(value.mcp, recommendations, `${path}.mcp`);
  collectObservedProducerRecommendations(value.web, `${path}.web`, recommendations);
  collectObservedProducerRecommendations(value.fetch, `${path}.fetch`, recommendations);
  collectObservedProducerRecommendations(value.codeSearch, `${path}.codeSearch`, recommendations);

  if (Object.keys(value).length === 0) {
    recommendations.push(
      recommendation(
        path,
        "remove",
        "Empty observedRouting object can be removed; observed routing is off by default.",
      ),
    );
  }
}

function collectObservedMcpRecommendations(value, recommendations, path) {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    recommendations.push(recommendation(path, "fix", "Expected object with explicit servers."));
    return;
  }

  for (const key of Object.keys(value)) {
    if (!OBSERVED_ROUTING_MCP_KEYS.has(key)) {
      recommendations.push(
        recommendation(`${path}.${key}`, "review", "Unrecognized observedRouting.mcp key; review before migrating."),
      );
    }
  }

  if (value.servers !== undefined && !isRecord(value.servers)) {
    recommendations.push(recommendation(`${path}.servers`, "fix", "Expected object keyed by MCP server id."));
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
      recommendations.push(
        recommendation(
          `${path}.${key}`,
          "review",
          "Unrecognized observed routing producer key; review before migrating.",
        ),
      );
    }
  }
}

function addDefaultRecommendation(recommendations, path, value, defaultValue) {
  if (value === undefined) {
    return;
  }
  if (JSON.stringify(value) === JSON.stringify(defaultValue)) {
    recommendations.push(
      recommendation(
        path,
        "remove",
        `Explicit default value ${JSON.stringify(defaultValue)} can be removed unless it records an intentional override.`,
      ),
    );
  }
}

function addLegacyMoveOrDefaultRecommendation(recommendations, path, value, defaultValue, targetPath) {
  if (value === undefined) {
    return;
  }
  if (JSON.stringify(value) === JSON.stringify(defaultValue)) {
    addDefaultRecommendation(recommendations, path, value, defaultValue);
    return;
  }
  recommendations.push(recommendation(path, "move", `Move legacy ${path} to ${targetPath}.`));
}

function recommendation(path, action, message) {
  return { path, action, message };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

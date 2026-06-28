import { isValidPostToolRoutingMode, validatePositiveIntegerThreshold } from "./router-contract.js";
import {
  CAPTURE_FREEFLOW_MEDIATED_MODES,
  DIRECT_HOST_TOOL_CAPTURE_MODES,
  OBSERVED_ROUTING_FAILURE_MODES,
  OBSERVED_ROUTING_PERSISTENCE_MODES,
  OUTPUT_ROUTER_PROFILES,
  PROVIDER_CATEGORIES,
  PROVIDER_MODES,
  RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES,
  STORAGE_POLICY_MODES,
} from "./types.js";
import type {
  CaptureConfig,
  FreeflowConfig,
  ObservedRoutingConfig,
  ObservedRoutingPersistenceMode,
  ObservedRoutingProducerConfig,
  LocalFreeflowConfig,
  ProviderCategory,
  ProviderEnablement,
  ProvidersConfig,
  RouterConfig,
  RouterHints,
  RouterThresholds,
  ScriptDeriveConfig,
  ScriptDeriveLanguage,
  VaultRetentionPolicy,
} from "./types.js";

export const OUTPUT_ROUTER_SKILL_PATH = "skills/output-router/SKILL.md";

export const DEFAULT_VAULT_ROOT = "~/.cache/freeflow-router/vault";

export const DEFAULT_POST_TOOL_ROUTING = "off";

export const DEFAULT_OUTPUT_ROUTER_ENABLED = true;

export const DEFAULT_OUTPUT_ROUTER_PROFILE = "standard";

export const DEFAULT_STORAGE_POLICY = "hybrid-dedupe" as const;

export const DEFAULT_VAULT_RETENTION = {
  strategy: "ttl",
  ttlDays: 7,
} as const satisfies VaultRetentionPolicy;

export const DEFAULT_ROUTER_THRESHOLDS = {
  largeOutputBytes: 64_000,
  largeOutputLines: 1_000,
} as const satisfies RouterThresholds;

export const DEFAULT_CAPTURE_CONFIG = {
  freeflowMediated: "raw",
  directHostTools: "off",
} as const satisfies CaptureConfig;

export const DEFAULT_PROVIDERS_CONFIG = {
  enabled: [],
} as const satisfies ProvidersConfig;

export const DEFAULT_OBSERVED_ROUTING_PERSISTENCE = "none" as const satisfies ObservedRoutingPersistenceMode;
export const SAFE_OBSERVED_ROUTING_PERSISTENCE_FALLBACK = "metadata-only" as const satisfies ObservedRoutingPersistenceMode;

export const DEFAULT_OBSERVED_ROUTING_CONFIG = {
  enabled: false,
  onRoutingFailure: "fail-open",
  mcp: { servers: {} },
  web: { enabled: false, persistence: DEFAULT_OBSERVED_ROUTING_PERSISTENCE },
  fetch: { enabled: false, persistence: DEFAULT_OBSERVED_ROUTING_PERSISTENCE },
  codeSearch: { enabled: false, persistence: DEFAULT_OBSERVED_ROUTING_PERSISTENCE },
} as const satisfies ObservedRoutingConfig;

export const SCRIPT_DERIVE_LANGUAGES = ["javascript", "python", "jq"] as const satisfies readonly ScriptDeriveLanguage[];

export const DEFAULT_SCRIPT_DERIVE_LIMITS = {
  timeoutMs: 5_000,
  maxInputBytes: 1_048_576,
  maxOutputBytes: 65_536,
} as const;

export const MAX_SCRIPT_DERIVE_LIMITS = {
  timeoutMs: 30_000,
  maxInputBytes: 10_485_760,
  maxOutputBytes: 1_048_576,
} as const;

export const DEFAULT_SCRIPT_DERIVE_CONFIG = {
  enabled: false,
  sandbox: "auto",
  languages: [...SCRIPT_DERIVE_LANGUAGES],
  network: "off",
  limits: { ...DEFAULT_SCRIPT_DERIVE_LIMITS },
  rawScriptPersistence: "disabled",
} satisfies ScriptDeriveConfig;

export const DEFAULT_LOCAL_FREEFLOW_CONFIG = {
  processing: {
    unsafeUnsandboxed: {
      enabled: false,
    },
  },
} satisfies LocalFreeflowConfig;

export interface CreateDefaultRouterConfigOptions {
  vaultRetention?: VaultRetentionPolicy;
  vaultRoot?: string;
}

export function createDefaultRouterConfig(options: CreateDefaultRouterConfigOptions = {}): RouterConfig {
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

export interface NormalizeRouterConfigResult {
  config: RouterConfig;
  warnings: string[];
}

export interface NormalizeCaptureConfigResult {
  config: CaptureConfig;
  warnings: string[];
}

export interface NormalizeProvidersConfigResult {
  config: ProvidersConfig;
  warnings: string[];
}

export interface NormalizeObservedRoutingConfigResult {
  config: ObservedRoutingConfig;
  warnings: string[];
}

export interface NormalizeScriptDeriveConfigResult {
  config: ScriptDeriveConfig;
  warnings: string[];
}

export interface NormalizeFreeflowConfigResult {
  config: FreeflowConfig;
  warnings: string[];
}

export interface NormalizeLocalFreeflowConfigResult {
  config: LocalFreeflowConfig;
  warnings: string[];
}

export function normalizeRouterConfig(input: unknown): NormalizeRouterConfigResult {
  const config = createDefaultRouterConfig();
  const warnings: string[] = [];

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

export function normalizeCaptureConfig(input: unknown): NormalizeCaptureConfigResult {
  const config: CaptureConfig = { ...DEFAULT_CAPTURE_CONFIG };
  const warnings: string[] = [];

  if (input === undefined || input === null) {
    return { config, warnings };
  }

  if (!isRecord(input)) {
    return {
      config,
      warnings: ["capture config must be an object; using built-in capture defaults."],
    };
  }

  applyStringEnum(
    config,
    warnings,
    input.freeflowMediated,
    "freeflowMediated",
    "capture.freeflowMediated",
    CAPTURE_FREEFLOW_MEDIATED_MODES,
    DEFAULT_CAPTURE_CONFIG.freeflowMediated,
  );
  applyStringEnum(
    config,
    warnings,
    input.directHostTools,
    "directHostTools",
    "capture.directHostTools",
    DIRECT_HOST_TOOL_CAPTURE_MODES,
    DEFAULT_CAPTURE_CONFIG.directHostTools,
  );

  return { config, warnings };
}

export function normalizeProvidersConfig(input: unknown): NormalizeProvidersConfigResult {
  const config: ProvidersConfig = { enabled: [] };
  const warnings: string[] = [];

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

export function normalizeObservedRoutingConfig(input: unknown): NormalizeObservedRoutingConfigResult {
  const config = createDefaultObservedRoutingConfig();
  const warnings: string[] = [];

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
  applyStringEnum(
    config,
    warnings,
    input.onRoutingFailure,
    "onRoutingFailure",
    "observedRouting.onRoutingFailure",
    OBSERVED_ROUTING_FAILURE_MODES,
    DEFAULT_OBSERVED_ROUTING_CONFIG.onRoutingFailure,
  );
  applyObservedMcpConfig(config, warnings, input.mcp);
  config.web = parseObservedProducerConfig(input.web, "observedRouting.web", warnings);
  config.fetch = parseObservedProducerConfig(input.fetch, "observedRouting.fetch", warnings);
  config.codeSearch = parseObservedProducerConfig(input.codeSearch, "observedRouting.codeSearch", warnings);

  return { config, warnings };
}

export function normalizeScriptDeriveConfig(input: unknown): NormalizeScriptDeriveConfigResult {
  const config: ScriptDeriveConfig = {
    ...DEFAULT_SCRIPT_DERIVE_CONFIG,
    languages: [...DEFAULT_SCRIPT_DERIVE_CONFIG.languages],
    limits: { ...DEFAULT_SCRIPT_DERIVE_CONFIG.limits },
  };
  const warnings: string[] = [];

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
    } else {
      warnings.push(`Invalid scriptDerive.enabled=${JSON.stringify(input.enabled)}; using false.`);
    }
  }

  applyStringEnum(config, warnings, input.sandbox, "sandbox", "scriptDerive.sandbox", ["auto"] as const, DEFAULT_SCRIPT_DERIVE_CONFIG.sandbox);
  applyStringEnum(config, warnings, input.network, "network", "scriptDerive.network", ["off"] as const, DEFAULT_SCRIPT_DERIVE_CONFIG.network);
  applyStringEnum(config, warnings, input.rawScriptPersistence, "rawScriptPersistence", "scriptDerive.rawScriptPersistence", ["disabled"] as const, DEFAULT_SCRIPT_DERIVE_CONFIG.rawScriptPersistence);
  applyScriptDeriveLanguages(config, warnings, input.languages);
  applyScriptDeriveLimits(config, warnings, input.limits);

  return { config, warnings };
}

export function normalizeLocalFreeflowConfig(input: unknown): NormalizeLocalFreeflowConfigResult {
  const config: LocalFreeflowConfig = {
    processing: {
      unsafeUnsandboxed: { ...DEFAULT_LOCAL_FREEFLOW_CONFIG.processing.unsafeUnsandboxed },
    },
  };
  const warnings: string[] = [];

  if (input === undefined || input === null) {
    return { config, warnings };
  }
  if (!isRecord(input)) {
    return {
      config,
      warnings: [".freeflow/local.json must be an object; local unsafe processing opt-ins are disabled."],
    };
  }
  if (input.processing === undefined) {
    return { config, warnings };
  }
  if (!isRecord(input.processing)) {
    warnings.push("Invalid local processing config; expected an object. unsafeUnsandboxed remains disabled.");
    return { config, warnings };
  }
  const unsafe = input.processing.unsafeUnsandboxed;
  if (unsafe === undefined) {
    return { config, warnings };
  }
  if (!isRecord(unsafe)) {
    warnings.push("Invalid local processing.unsafeUnsandboxed config; expected an object with enabled boolean. unsafeUnsandboxed remains disabled.");
    return { config, warnings };
  }
  if (typeof unsafe.enabled === "boolean") {
    config.processing.unsafeUnsandboxed.enabled = unsafe.enabled;
  } else if (unsafe.enabled !== undefined) {
    warnings.push(`Invalid local processing.unsafeUnsandboxed.enabled=${JSON.stringify(unsafe.enabled)}; using false.`);
  }
  return { config, warnings };
}

export function normalizeFreeflowConfig(input: unknown): NormalizeFreeflowConfigResult {
  const warnings: string[] = [];

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
  if (source.processing !== undefined) {
    warnings.push(".freeflow/config.json processing config is ignored; unsafe unsandboxed processing must be enabled in local-only .freeflow/local.json.");
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyRouterEnabled(config: RouterConfig, warnings: string[], value: unknown) {
  if (value === undefined) {
    return;
  }

  if (typeof value === "boolean") {
    config.enabled = value;
    return;
  }

  warnings.push(`Invalid outputRouter.enabled=${JSON.stringify(value)}; using ${DEFAULT_OUTPUT_ROUTER_ENABLED}.`);
}

function applyRouterProfile(config: RouterConfig, warnings: string[], value: unknown) {
  if (value === undefined) {
    return;
  }

  if (isStringIn(value, OUTPUT_ROUTER_PROFILES)) {
    config.profile = value;
    return;
  }

  warnings.push(`Invalid outputRouter.profile=${JSON.stringify(value)}; using ${DEFAULT_OUTPUT_ROUTER_PROFILE}.`);
}

function applyPostToolRouting(config: RouterConfig, warnings: string[], value: unknown) {
  if (value === undefined) {
    return;
  }

  if (isValidPostToolRoutingMode(value)) {
    config.postToolRouting = value;
    return;
  }

  warnings.push(`Invalid outputRouter.postToolRouting=${JSON.stringify(value)}; using ${DEFAULT_POST_TOOL_ROUTING}.`);
}

function applyPositiveInteger(
  thresholds: RouterThresholds,
  warnings: string[],
  value: unknown,
  key: keyof RouterThresholds,
) {
  if (value === undefined) {
    return;
  }

  if (validatePositiveIntegerThreshold(value, `outputRouter.${key}`).length === 0) {
    thresholds[key] = value as number;
    return;
  }

  warnings.push(`Invalid outputRouter.${key}=${JSON.stringify(value)}; using ${DEFAULT_ROUTER_THRESHOLDS[key]}.`);
}

function applyVaultRoot(config: RouterConfig, warnings: string[], value: unknown) {
  if (value === undefined) {
    return;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    config.vault.root = value;
    return;
  }

  warnings.push(`Invalid outputRouter.vaultRoot=${JSON.stringify(value)}; using ${DEFAULT_VAULT_ROOT}.`);
}

function applyVaultRetention(config: RouterConfig, warnings: string[], value: unknown) {
  if (value === undefined) {
    return;
  }

  if (validatePositiveIntegerThreshold(value, "outputRouter.vaultRetentionDays").length === 0) {
    config.vault.retention = { strategy: "ttl", ttlDays: value as number };
    return;
  }

  warnings.push(
    `Invalid outputRouter.vaultRetentionDays=${JSON.stringify(value)}; using ${DEFAULT_VAULT_RETENTION.ttlDays}.`,
  );
}

function applyHints(
  config: RouterConfig,
  warnings: string[],
  generatedPaths: unknown,
  noisyCommandHints: unknown,
) {
  const hints: RouterHints = {};

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

function applyScriptDeriveLanguages(config: ScriptDeriveConfig, warnings: string[], value: unknown) {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    warnings.push("Invalid scriptDerive.languages; expected an array of supported language ids.");
    return;
  }

  const languages: ScriptDeriveLanguage[] = [];
  for (const item of value) {
    if (isStringIn(item, SCRIPT_DERIVE_LANGUAGES)) {
      if (!languages.includes(item)) {
        languages.push(item);
      }
    } else {
      warnings.push(`Invalid scriptDerive.languages entry=${JSON.stringify(item)}; supported languages are ${SCRIPT_DERIVE_LANGUAGES.join(", ")}.`);
    }
  }

  if (languages.length > 0) {
    config.languages = languages;
  }
}

function applyScriptDeriveLimits(config: ScriptDeriveConfig, warnings: string[], value: unknown) {
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

function applyScriptLimit(config: ScriptDeriveConfig, warnings: string[], value: unknown, key: keyof ScriptDeriveConfig["limits"]) {
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

function applyStringEnum<TConfig extends object, TValue extends string>(
  config: TConfig,
  warnings: string[],
  value: unknown,
  key: keyof TConfig,
  path: string,
  allowed: readonly TValue[],
  fallback: TValue,
) {
  if (value === undefined) {
    return;
  }

  if (isStringIn(value, allowed)) {
    (config as Record<string, unknown>)[String(key)] = value;
    return;
  }

  warnings.push(`Invalid ${path}=${JSON.stringify(value)}; using ${fallback}.`);
}

function createDefaultObservedRoutingConfig(): ObservedRoutingConfig {
  return {
    enabled: DEFAULT_OBSERVED_ROUTING_CONFIG.enabled,
    onRoutingFailure: DEFAULT_OBSERVED_ROUTING_CONFIG.onRoutingFailure,
    mcp: { servers: {} },
    web: { ...DEFAULT_OBSERVED_ROUTING_CONFIG.web },
    fetch: { ...DEFAULT_OBSERVED_ROUTING_CONFIG.fetch },
    codeSearch: { ...DEFAULT_OBSERVED_ROUTING_CONFIG.codeSearch },
  };
}

function applyObservedRoutingEnabled(config: ObservedRoutingConfig, warnings: string[], value: unknown) {
  if (value === undefined) {
    return;
  }

  if (typeof value === "boolean") {
    config.enabled = value;
    return;
  }

  warnings.push(`Invalid observedRouting.enabled=${JSON.stringify(value)}; using ${DEFAULT_OBSERVED_ROUTING_CONFIG.enabled}.`);
}

function applyObservedMcpConfig(config: ObservedRoutingConfig, warnings: string[], value: unknown) {
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
    config.mcp.servers[normalizedServerId] = parseObservedProducerConfig(
      serverConfig,
      `observedRouting.mcp.servers.${normalizedServerId}`,
      warnings,
    );
  }
}

function parseObservedProducerConfig(value: unknown, path: string, warnings: string[]): ObservedRoutingProducerConfig {
  const fallback: ObservedRoutingProducerConfig = { enabled: false, persistence: DEFAULT_OBSERVED_ROUTING_PERSISTENCE };

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

function parseObservedProducerEnabled(value: unknown, path: string, warnings: string[]): boolean {
  if (value === undefined) {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  warnings.push(`Invalid ${path}.enabled=${JSON.stringify(value)}; using false.`);
  return false;
}

function parseObservedPersistence(
  value: unknown,
  path: string,
  enabled: boolean,
  warnings: string[],
): ObservedRoutingPersistenceMode {
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

function parseProviderEnablement(entry: unknown, index: number, warnings: string[]): ProviderEnablement | undefined {
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

  let mode: ProviderEnablement["mode"] = "discovery";
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

function parseProviderCategories(
  value: unknown,
  path: string,
  warnings: string[],
): ProviderCategory[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    warnings.push(`Invalid ${path}; expected a non-empty array of read-only provider categories.`);
    return undefined;
  }

  const categories: ProviderCategory[] = [];
  for (const category of value) {
    if (!isStringIn(category, PROVIDER_CATEGORIES)) {
      warnings.push(`Invalid ${path}; unsupported provider category ${JSON.stringify(category)}.`);
      return undefined;
    }
    categories.push(category);
  }

  return categories;
}

function parseConfigString(value: unknown, path: string, warnings: string[]): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0 || /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(value)) {
    warnings.push(`Invalid ${path}; expected a non-empty single-line string.`);
    return undefined;
  }

  return value.trim();
}

function isStringIn<TValue extends string>(value: unknown, allowed: readonly TValue[]): value is TValue {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function parseStringArray(value: unknown, key: string, warnings: string[]): string[] | undefined {
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

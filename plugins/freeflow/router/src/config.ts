import { POST_TOOL_ROUTING_MODES } from "./types.js";
import type { PostToolRoutingMode, RouterConfig, RouterHints, RouterThresholds, VaultRetentionPolicy } from "./types.js";

export const OUTPUT_ROUTER_SKILL_PATH = "plugins/freeflow/skills/output-router/SKILL.md";

export const DEFAULT_VAULT_ROOT = "~/.cache/freeflow-router/vault";

export const DEFAULT_POST_TOOL_ROUTING = "off";

export const DEFAULT_VAULT_RETENTION = {
  strategy: "ttl",
  ttlDays: 7,
} as const satisfies VaultRetentionPolicy;

export const DEFAULT_ROUTER_THRESHOLDS = {
  largeOutputBytes: 64_000,
  largeOutputLines: 1_000,
} as const satisfies RouterThresholds;

export interface CreateDefaultRouterConfigOptions {
  vaultRetention?: VaultRetentionPolicy;
  vaultRoot?: string;
}

export function createDefaultRouterConfig(options: CreateDefaultRouterConfigOptions = {}): RouterConfig {
  return {
    postToolRouting: DEFAULT_POST_TOOL_ROUTING,
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

  applyPostToolRouting(config, warnings, input.postToolRouting);
  applyPositiveInteger(config.thresholds, warnings, input.largeOutputBytes, "largeOutputBytes");
  applyPositiveInteger(config.thresholds, warnings, input.largeOutputLines, "largeOutputLines");
  applyVaultRoot(config, warnings, input.vaultRoot);
  applyVaultRetention(config, warnings, input.vaultRetentionDays);
  applyHints(config, warnings, input.generatedPaths, input.noisyCommandHints);

  return { config, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyPostToolRouting(config: RouterConfig, warnings: string[], value: unknown) {
  if (value === undefined) {
    return;
  }

  if (typeof value === "string" && (POST_TOOL_ROUTING_MODES as readonly string[]).includes(value)) {
    config.postToolRouting = value as PostToolRoutingMode;
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

  if (Number.isInteger(value) && typeof value === "number" && value > 0) {
    thresholds[key] = value;
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

  if (Number.isInteger(value) && typeof value === "number" && value > 0) {
    config.vault.retention = { strategy: "ttl", ttlDays: value };
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

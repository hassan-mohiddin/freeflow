import type { CaptureConfig, FreeflowConfig, ProvidersConfig, RouterConfig, VaultRetentionPolicy } from "./types.js";
export declare const OUTPUT_ROUTER_SKILL_PATH = "plugins/freeflow/skills/output-router/SKILL.md";
export declare const DEFAULT_VAULT_ROOT = "~/.cache/freeflow-router/vault";
export declare const DEFAULT_POST_TOOL_ROUTING = "off";
export declare const DEFAULT_OUTPUT_ROUTER_ENABLED = true;
export declare const DEFAULT_OUTPUT_ROUTER_PROFILE = "standard";
export declare const DEFAULT_VAULT_RETENTION: {
    readonly strategy: "ttl";
    readonly ttlDays: 7;
};
export declare const DEFAULT_ROUTER_THRESHOLDS: {
    readonly largeOutputBytes: 64000;
    readonly largeOutputLines: 1000;
};
export declare const DEFAULT_CAPTURE_CONFIG: {
    readonly freeflowMediated: "raw";
    readonly directHostTools: "off";
};
export declare const DEFAULT_PROVIDERS_CONFIG: {
    readonly enabled: [];
};
export interface CreateDefaultRouterConfigOptions {
    vaultRetention?: VaultRetentionPolicy;
    vaultRoot?: string;
}
export declare function createDefaultRouterConfig(options?: CreateDefaultRouterConfigOptions): RouterConfig;
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
export interface NormalizeFreeflowConfigResult {
    config: FreeflowConfig;
    warnings: string[];
}
export declare function normalizeRouterConfig(input: unknown): NormalizeRouterConfigResult;
export declare function normalizeCaptureConfig(input: unknown): NormalizeCaptureConfigResult;
export declare function normalizeProvidersConfig(input: unknown): NormalizeProvidersConfigResult;
export declare function normalizeFreeflowConfig(input: unknown): NormalizeFreeflowConfigResult;

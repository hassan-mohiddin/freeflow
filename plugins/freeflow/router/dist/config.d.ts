import type { CaptureConfig, FreeflowConfig, ObservedRoutingConfig, ProvidersConfig, RouterConfig, ScriptDeriveConfig, VaultRetentionPolicy } from "./types.js";
export declare const OUTPUT_ROUTER_SKILL_PATH = "plugins/freeflow/skills/output-router/SKILL.md";
export declare const DEFAULT_VAULT_ROOT = "~/.cache/freeflow-router/vault";
export declare const DEFAULT_POST_TOOL_ROUTING = "off";
export declare const DEFAULT_OUTPUT_ROUTER_ENABLED = true;
export declare const DEFAULT_OUTPUT_ROUTER_PROFILE = "standard";
export declare const DEFAULT_STORAGE_POLICY: "hybrid-dedupe";
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
export declare const DEFAULT_OBSERVED_ROUTING_PERSISTENCE: "none";
export declare const SAFE_OBSERVED_ROUTING_PERSISTENCE_FALLBACK: "metadata-only";
export declare const DEFAULT_OBSERVED_ROUTING_CONFIG: {
    readonly enabled: false;
    readonly onRoutingFailure: "fail-open";
    readonly mcp: {
        readonly servers: {};
    };
    readonly web: {
        readonly enabled: false;
        readonly persistence: "none";
    };
    readonly fetch: {
        readonly enabled: false;
        readonly persistence: "none";
    };
    readonly codeSearch: {
        readonly enabled: false;
        readonly persistence: "none";
    };
};
export declare const SCRIPT_DERIVE_LANGUAGES: readonly ["javascript", "python", "jq"];
export declare const DEFAULT_SCRIPT_DERIVE_LIMITS: {
    readonly timeoutMs: 5000;
    readonly maxInputBytes: 1048576;
    readonly maxOutputBytes: 65536;
};
export declare const MAX_SCRIPT_DERIVE_LIMITS: {
    readonly timeoutMs: 30000;
    readonly maxInputBytes: 10485760;
    readonly maxOutputBytes: 1048576;
};
export declare const DEFAULT_SCRIPT_DERIVE_CONFIG: {
    enabled: false;
    sandbox: "auto";
    languages: ("javascript" | "python" | "jq")[];
    network: "off";
    limits: {
        timeoutMs: 5000;
        maxInputBytes: 1048576;
        maxOutputBytes: 65536;
    };
    rawScriptPersistence: "disabled";
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
export declare function normalizeRouterConfig(input: unknown): NormalizeRouterConfigResult;
export declare function normalizeCaptureConfig(input: unknown): NormalizeCaptureConfigResult;
export declare function normalizeProvidersConfig(input: unknown): NormalizeProvidersConfigResult;
export declare function normalizeObservedRoutingConfig(input: unknown): NormalizeObservedRoutingConfigResult;
export declare function normalizeScriptDeriveConfig(input: unknown): NormalizeScriptDeriveConfigResult;
export declare function normalizeFreeflowConfig(input: unknown): NormalizeFreeflowConfigResult;

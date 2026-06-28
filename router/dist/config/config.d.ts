import type { FreeflowConfig, ObservedRoutingConfig, LocalFreeflowConfig, RouterConfig, ScriptTransformConfig, VaultRetentionPolicy } from "./types.js";
export declare const OUTPUT_ROUTER_SKILL_PATH = "skills/output-router/SKILL.md";
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
export declare const SCRIPT_TRANSFORM_LANGUAGES: readonly ["javascript", "python", "jq"];
export declare const DEFAULT_SCRIPT_TRANSFORM_LIMITS: {
    readonly timeoutMs: 5000;
    readonly maxInputBytes: 1048576;
    readonly maxOutputBytes: 65536;
};
export declare const MAX_SCRIPT_TRANSFORM_LIMITS: {
    readonly timeoutMs: 30000;
    readonly maxInputBytes: 10485760;
    readonly maxOutputBytes: 1048576;
};
export declare const DEFAULT_SCRIPT_TRANSFORM_CONFIG: {
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
export declare const DEFAULT_LOCAL_FREEFLOW_CONFIG: {
    processing: {
        unsafeUnsandboxed: {
            enabled: false;
        };
    };
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
export interface NormalizeObservedRoutingConfigResult {
    config: ObservedRoutingConfig;
    warnings: string[];
}
export interface NormalizeScriptTransformConfigResult {
    config: ScriptTransformConfig;
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
export declare function normalizeRouterConfig(input: unknown): NormalizeRouterConfigResult;
export declare function normalizeObservedRoutingConfig(input: unknown): NormalizeObservedRoutingConfigResult;
export declare function normalizeScriptTransformConfig(input: unknown): NormalizeScriptTransformConfigResult;
export declare function normalizeLocalFreeflowConfig(input: unknown): NormalizeLocalFreeflowConfigResult;
export declare function normalizeFreeflowConfig(input: unknown): NormalizeFreeflowConfigResult;

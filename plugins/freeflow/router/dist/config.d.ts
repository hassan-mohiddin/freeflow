import type { RouterConfig, VaultRetentionPolicy } from "./types.js";
export declare const OUTPUT_ROUTER_SKILL_PATH = "plugins/freeflow/skills/output-router/SKILL.md";
export declare const DEFAULT_VAULT_ROOT = "~/.cache/freeflow-router/vault";
export declare const DEFAULT_POST_TOOL_ROUTING = "off";
export declare const DEFAULT_VAULT_RETENTION: {
    readonly strategy: "ttl";
    readonly ttlDays: 7;
};
export declare const DEFAULT_ROUTER_THRESHOLDS: {
    readonly largeOutputBytes: 64000;
    readonly largeOutputLines: 1000;
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
export declare function normalizeRouterConfig(input: unknown): NormalizeRouterConfigResult;

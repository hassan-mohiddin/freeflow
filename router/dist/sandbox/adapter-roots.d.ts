export declare const SCRIPT_TRANSFORM_ADAPTERS_HOME_ENV = "FREEFLOW_SCRIPT_TRANSFORM_ADAPTERS_HOME";
export declare const SCRIPT_TRANSFORM_NODE_ENV = "FREEFLOW_SCRIPT_TRANSFORM_NODE";
export declare const SCRIPT_TRANSFORM_ADAPTER_PACKAGES: {
    readonly javascript: {
        readonly packageName: "quickjs-wasi";
        readonly version: "3.0.1";
        readonly env: "FREEFLOW_QUICKJS_WASI_ROOT";
    };
    readonly jq: {
        readonly packageName: "jq-wasm";
        readonly version: "1.2.0-jq-1.8.2";
        readonly env: "FREEFLOW_JQ_WASM_ROOT";
    };
    readonly python: {
        readonly packageName: "@bsull/eryx";
        readonly version: "0.5.0";
        readonly env: "FREEFLOW_ERYX_ROOT";
    };
};
export declare const SCRIPT_TRANSFORM_SUPPORT_PACKAGES: {
    readonly node: {
        readonly packageName: "node";
        readonly version: "24";
        readonly env: "FREEFLOW_SCRIPT_TRANSFORM_NODE";
    };
};
export type ScriptTransformAdapterLanguage = keyof typeof SCRIPT_TRANSFORM_ADAPTER_PACKAGES;
export interface ScriptTransformAdapterRootCandidate {
    packageRoot: string;
    source: "env" | "global-cache";
    envVar: string;
}
export declare function defaultScriptTransformAdaptersHome(env?: NodeJS.ProcessEnv): string;
export declare function defaultScriptTransformAdapterRoot(language: ScriptTransformAdapterLanguage, env?: NodeJS.ProcessEnv): string;
export declare function resolveScriptTransformAdapterRoot(language: ScriptTransformAdapterLanguage, env?: NodeJS.ProcessEnv): Promise<ScriptTransformAdapterRootCandidate | null>;
export declare function defaultScriptTransformNodeBinary(env?: NodeJS.ProcessEnv): string;
export declare function scriptTransformAdapterInstallSpecs(languages?: readonly ScriptTransformAdapterLanguage[]): string[];
export declare function scriptTransformAdapterEnvExports(home?: string): Record<string, string>;

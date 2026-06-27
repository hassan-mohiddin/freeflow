import type { ScriptSandboxAdapter } from "./script-sandbox.js";
export declare const QUICKJS_WASI_ROOT_ENV = "FREEFLOW_QUICKJS_WASI_ROOT";
export interface QuickJsWasiSandboxAdapterOptions {
    packageRoot: string;
    id?: string;
    version?: string;
}
export declare function discoverQuickJsWasiSandboxAdaptersFromEnv(env?: NodeJS.ProcessEnv): Promise<ScriptSandboxAdapter[]>;
export declare function createQuickJsWasiSandboxAdapter(options: QuickJsWasiSandboxAdapterOptions): Promise<ScriptSandboxAdapter>;

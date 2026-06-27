import type { ScriptSandboxAdapter } from "./script-sandbox.js";
export declare const JQ_WASM_ROOT_ENV = "FREEFLOW_JQ_WASM_ROOT";
export interface JqWasmSandboxAdapterOptions {
    packageRoot: string;
    id?: string;
    version?: string;
}
export declare function discoverJqWasmSandboxAdaptersFromEnv(env?: NodeJS.ProcessEnv): Promise<ScriptSandboxAdapter[]>;
export declare function createJqWasmSandboxAdapter(options: JqWasmSandboxAdapterOptions): Promise<ScriptSandboxAdapter>;

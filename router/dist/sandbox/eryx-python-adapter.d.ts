import type { ScriptSandboxAdapter } from "./script-sandbox.js";
export declare const ERYX_ROOT_ENV = "FREEFLOW_ERYX_ROOT";
export interface EryxPythonSandboxAdapterOptions {
    packageRoot: string;
    id?: string;
    version?: string;
}
export declare function discoverEryxPythonSandboxAdaptersFromEnv(env?: NodeJS.ProcessEnv): Promise<ScriptSandboxAdapter[]>;
export declare function createEryxPythonSandboxAdapter(options: EryxPythonSandboxAdapterOptions): Promise<ScriptSandboxAdapter>;

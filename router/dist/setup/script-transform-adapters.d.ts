#!/usr/bin/env node
import type { ScriptTransformLanguage } from "../config/types.js";
import { type ScriptTransformAdapterLanguage } from "../sandbox/adapter-roots.js";
interface InstallerOptions {
    command: "install" | "status";
    home: string;
    configPath?: string;
    writeConfig: boolean;
    languages: ScriptTransformAdapterLanguage[];
    json: boolean;
}
interface InstallReport {
    adapterHome: string;
    installed: boolean;
    installSpecs: string[];
    envFile: string;
    configPath?: string;
    configUpdated: boolean;
    configuredLanguages: ScriptTransformLanguage[];
    availableLanguages: ScriptTransformLanguage[];
    unavailableLanguages: Array<{
        language: string;
        reason?: string;
    }>;
    notes: string[];
}
export declare function installOrInspect(options: InstallerOptions): Promise<InstallReport>;
export {};

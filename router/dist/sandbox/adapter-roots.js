import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
export const SCRIPT_TRANSFORM_ADAPTERS_HOME_ENV = "FREEFLOW_SCRIPT_TRANSFORM_ADAPTERS_HOME";
export const SCRIPT_TRANSFORM_NODE_ENV = "FREEFLOW_SCRIPT_TRANSFORM_NODE";
export const SCRIPT_TRANSFORM_ADAPTER_PACKAGES = {
    javascript: { packageName: "quickjs-wasi", version: "3.0.1", env: "FREEFLOW_QUICKJS_WASI_ROOT" },
    jq: { packageName: "jq-wasm", version: "1.2.0-jq-1.8.2", env: "FREEFLOW_JQ_WASM_ROOT" },
    python: { packageName: "@bsull/eryx", version: "0.5.0", env: "FREEFLOW_ERYX_ROOT" },
};
export const SCRIPT_TRANSFORM_SUPPORT_PACKAGES = {
    node: { packageName: "node", version: "24", env: SCRIPT_TRANSFORM_NODE_ENV },
};
export function defaultScriptTransformAdaptersHome(env = process.env) {
    return env[SCRIPT_TRANSFORM_ADAPTERS_HOME_ENV] || join(homedir(), ".cache", "freeflow-script-adapters");
}
export function defaultScriptTransformAdapterRoot(language, env = process.env) {
    const packageName = SCRIPT_TRANSFORM_ADAPTER_PACKAGES[language].packageName;
    return join(defaultScriptTransformAdaptersHome(env), "node_modules", ...packageName.split("/"));
}
export async function resolveScriptTransformAdapterRoot(language, env = process.env) {
    const adapter = SCRIPT_TRANSFORM_ADAPTER_PACKAGES[language];
    const explicitRoot = env[adapter.env];
    if (explicitRoot) {
        return { packageRoot: explicitRoot, source: "env", envVar: adapter.env };
    }
    const packageRoot = defaultScriptTransformAdapterRoot(language, env);
    if (await packageRootExists(packageRoot)) {
        return { packageRoot, source: "global-cache", envVar: adapter.env };
    }
    return null;
}
export function defaultScriptTransformNodeBinary(env = process.env) {
    return env[SCRIPT_TRANSFORM_NODE_ENV] || join(defaultScriptTransformAdaptersHome(env), "node_modules", "node", "bin", "node");
}
export function scriptTransformAdapterInstallSpecs(languages = ["javascript", "jq", "python"]) {
    const specs = languages.map((language) => {
        const adapter = SCRIPT_TRANSFORM_ADAPTER_PACKAGES[language];
        return `${adapter.packageName}@${adapter.version}`;
    });
    if (languages.includes("python")) {
        const node = SCRIPT_TRANSFORM_SUPPORT_PACKAGES.node;
        specs.push(`${node.packageName}@${node.version}`);
    }
    return specs;
}
export function scriptTransformAdapterEnvExports(home = defaultScriptTransformAdaptersHome()) {
    return {
        [SCRIPT_TRANSFORM_ADAPTERS_HOME_ENV]: home,
        [SCRIPT_TRANSFORM_ADAPTER_PACKAGES.javascript.env]: join(home, "node_modules", "quickjs-wasi"),
        [SCRIPT_TRANSFORM_ADAPTER_PACKAGES.jq.env]: join(home, "node_modules", "jq-wasm"),
        [SCRIPT_TRANSFORM_ADAPTER_PACKAGES.python.env]: join(home, "node_modules", "@bsull", "eryx"),
        [SCRIPT_TRANSFORM_NODE_ENV]: join(home, "node_modules", "node", "bin", "node"),
    };
}
async function packageRootExists(packageRoot) {
    try {
        await access(join(packageRoot, "package.json"));
        return true;
    }
    catch {
        return false;
    }
}

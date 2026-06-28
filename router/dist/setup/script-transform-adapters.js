#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SCRIPT_TRANSFORM_CONFIG, SCRIPT_TRANSFORM_LANGUAGES, } from "../config/config.js";
import { defaultScriptTransformAdaptersHome, scriptTransformAdapterEnvExports, scriptTransformAdapterInstallSpecs, } from "../sandbox/adapter-roots.js";
import { discoverEryxPythonSandboxAdaptersFromEnv } from "../sandbox/eryx-python-adapter.js";
import { discoverJqWasmSandboxAdaptersFromEnv } from "../sandbox/jq-wasm-adapter.js";
import { discoverQuickJsWasiSandboxAdaptersFromEnv } from "../sandbox/quickjs-wasi-adapter.js";
import { probeScriptSandboxAdapters } from "../sandbox/script-sandbox.js";
const DEFAULT_LANGUAGES = ["javascript", "jq", "python"];
async function main(argv) {
    const options = parseArgs(argv);
    const report = await installOrInspect(options);
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    printHumanReport(report);
}
export async function installOrInspect(options) {
    const adapterHome = resolve(options.home);
    const installSpecs = scriptTransformAdapterInstallSpecs(options.languages);
    if (options.command === "install") {
        await installAdapterPackages(adapterHome, installSpecs);
    }
    else {
        await mkdir(adapterHome, { recursive: true });
    }
    const envFile = await writeAdapterEnvFile(adapterHome);
    const probe = await probeInstalledAdapters(options.languages);
    const availableLanguages = probe.availableLanguages.filter(isScriptTransformLanguage);
    const unavailableLanguages = probe.unavailableLanguages.map((status) => ({
        language: status.language,
        ...(status.reason !== undefined ? { reason: status.reason } : {}),
    }));
    let configUpdated = false;
    const configuredLanguages = availableLanguages;
    if (options.command === "install" && options.writeConfig && options.configPath && configuredLanguages.length > 0) {
        await enableScriptTransformConfig(resolve(options.configPath), configuredLanguages);
        configUpdated = true;
    }
    const notes = [
        "Adapters are installed in a user-global Freeflow cache, not in the repo.",
        "Freeflow auto-discovers this global cache; the env file is provided for shells or hosts that prefer explicit roots.",
    ];
    if (unavailableLanguages.some((entry) => entry.language === "python")) {
        notes.push("Python/Eryx uses a child Node process launched with --experimental-wasm-jspi; if this Node binary cannot run that flag, setup reports Python unavailable instead of enabling it.");
    }
    if (configuredLanguages.length === 0) {
        notes.push("No adapter passed sandbox proofs, so scriptTransform config was not enabled.");
    }
    return {
        adapterHome,
        installed: options.command === "install",
        installSpecs,
        envFile,
        ...(options.configPath !== undefined ? { configPath: resolve(options.configPath) } : {}),
        configUpdated,
        configuredLanguages,
        availableLanguages,
        unavailableLanguages,
        notes,
    };
}
async function installAdapterPackages(adapterHome, installSpecs) {
    await mkdir(adapterHome, { recursive: true });
    const packageJson = resolve(adapterHome, "package.json");
    if (!(await exists(packageJson))) {
        await writeFile(packageJson, JSON.stringify({ private: true, type: "module" }, null, 2) + "\n", "utf8");
    }
    await run("npm", ["install", "--no-fund", "--no-audit", ...installSpecs], adapterHome);
}
async function writeAdapterEnvFile(adapterHome) {
    const envFile = resolve(adapterHome, "freeflow-adapter-env.sh");
    const exports = scriptTransformAdapterEnvExports(adapterHome);
    const lines = [
        "# Source this file before launching hosts that do not use Freeflow global adapter auto-discovery.",
        ...Object.entries(exports).map(([key, value]) => `export ${key}=${shellQuote(value)}`),
        "",
    ];
    await writeFile(envFile, lines.join("\n"), "utf8");
    return envFile;
}
async function probeInstalledAdapters(languages) {
    const adapters = [
        ...(languages.includes("javascript") ? await discoverQuickJsWasiSandboxAdaptersFromEnv() : []),
        ...(languages.includes("jq") ? await discoverJqWasmSandboxAdaptersFromEnv() : []),
        ...(languages.includes("python") ? await discoverEryxPythonSandboxAdaptersFromEnv() : []),
    ];
    return probeScriptSandboxAdapters({
        config: {
            ...DEFAULT_SCRIPT_TRANSFORM_CONFIG,
            enabled: true,
            languages: languages.filter(isScriptTransformLanguage),
        },
        adapters,
    });
}
async function enableScriptTransformConfig(configPath, languages) {
    await mkdir(dirname(configPath), { recursive: true });
    const parsed = await readJsonObject(configPath);
    if (parsed.defaultMode === undefined) {
        parsed.defaultMode = "workflow";
    }
    parsed.scriptTransform = {
        enabled: true,
        languages: [...languages],
    };
    await writeFile(configPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
}
async function readJsonObject(path) {
    try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw);
        return isRecord(parsed) ? parsed : {};
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return {};
        }
        throw error;
    }
}
function parseArgs(argv) {
    let command = "install";
    let home = defaultScriptTransformAdaptersHome();
    let configPath;
    let writeConfig = false;
    let languages = [...DEFAULT_LANGUAGES];
    let json = false;
    const args = [...argv];
    if (args[0] === "install" || args[0] === "status") {
        command = args.shift();
    }
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--home") {
            home = requiredValue(args, ++index, arg);
            continue;
        }
        if (arg === "--config") {
            configPath = requiredValue(args, ++index, arg);
            writeConfig = true;
            continue;
        }
        if (arg === "--no-config") {
            writeConfig = false;
            configPath = undefined;
            continue;
        }
        if (arg === "--languages") {
            languages = parseLanguages(requiredValue(args, ++index, arg));
            continue;
        }
        if (arg === "--json") {
            json = true;
            continue;
        }
        if (arg === "--help" || arg === "-h") {
            printUsageAndExit();
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    const result = { command, home, writeConfig, languages, json };
    if (configPath !== undefined) {
        result.configPath = configPath;
    }
    return result;
}
function parseLanguages(value) {
    const requested = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    const invalid = requested.filter((entry) => !isScriptTransformAdapterLanguage(entry));
    if (invalid.length > 0) {
        throw new Error(`Unsupported script transform adapter language(s): ${invalid.join(", ")}`);
    }
    return [...new Set(requested)];
}
function isScriptTransformLanguage(value) {
    return SCRIPT_TRANSFORM_LANGUAGES.includes(value);
}
function isScriptTransformAdapterLanguage(value) {
    return value === "javascript" || value === "jq" || value === "python";
}
function requiredValue(args, index, flag) {
    const value = args[index];
    if (!value) {
        throw new Error(`${flag} requires a value.`);
    }
    return value;
}
async function run(command, args, cwd) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolvePromise({ stdout, stderr });
            }
            else {
                reject(new Error(`${command} ${args.join(" ")} failed with exitCode=${code}. ${stderr || stdout}`));
            }
        });
    });
}
async function exists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error) {
    return typeof error === "object" && error !== null && "code" in error;
}
function shellQuote(value) {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}
function printHumanReport(report) {
    console.log(`Freeflow script transform adapters: ${report.installed ? "installed" : "status"}`);
    console.log(`adapterHome=${report.adapterHome}`);
    console.log(`envFile=${report.envFile}`);
    console.log(`available=${report.availableLanguages.join(",") || "none"}`);
    if (report.configPath) {
        console.log(`config=${report.configPath} updated=${String(report.configUpdated)} languages=${report.configuredLanguages.join(",") || "none"}`);
    }
    for (const unavailable of report.unavailableLanguages) {
        console.log(`unavailable ${unavailable.language}: ${unavailable.reason ?? "unknown"}`);
    }
    report.notes.forEach((note) => console.log(`note: ${note}`));
}
function printUsageAndExit() {
    console.log(`Usage: node router/dist/setup/script-transform-adapters.js [install|status] [--config .freeflow/config.json] [--home PATH] [--languages javascript,jq,python] [--json]\n\nInstalls Freeflow script transform adapters into a user-global cache and optionally enables scriptTransform for proof-passing languages in a repo config.`);
    process.exit(0);
}
const isCli = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isCli) {
    main(process.argv.slice(2)).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
    });
}

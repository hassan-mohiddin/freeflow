import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveScriptTransformAdapterRoot } from "./adapter-roots.js";
import { SCRIPT_SANDBOX_REQUIRED_PROOFS, scriptSandboxProofFixturesForLanguage } from "./script-sandbox.js";
const DEFAULT_PROBE_TIMEOUT_MS = 250;
const DEFAULT_PROBE_MEMORY_BYTES = 8 * 1024 * 1024;
const DEFAULT_PROBE_OUTPUT_BYTES = 4096;
const SECRET_SENTINEL = "FREEFLOW_SANDBOX_SECRET_SENTINEL_VALUE";
export const QUICKJS_WASI_ROOT_ENV = "FREEFLOW_QUICKJS_WASI_ROOT";
const quickJsProbeCache = new Map();
export async function discoverQuickJsWasiSandboxAdaptersFromEnv(env = process.env) {
    const candidate = await resolveScriptTransformAdapterRoot("javascript", env);
    if (!candidate) {
        return [];
    }
    try {
        return [await createQuickJsWasiSandboxAdapter({ packageRoot: candidate.packageRoot })];
    }
    catch (error) {
        return [unavailableQuickJsAdapter(`quickjs-wasi adapter could not load from ${candidate.source === "env" ? candidate.envVar : "global adapter cache"}: ${errorMessage(error)}`)];
    }
}
export async function createQuickJsWasiSandboxAdapter(options) {
    const runtime = await loadQuickJsRuntime(options.packageRoot);
    return {
        id: options.id ?? "quickjs-wasi",
        version: options.version ?? runtime.packageVersion,
        languages: ["javascript"],
        async probe(language, config) {
            if (language !== "javascript") {
                return {
                    status: "unavailable",
                    reason: `quickjs-wasi supports javascript, not ${language}.`,
                    passedProofs: [],
                    failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
                    runtime: runtimeInfo(runtime),
                };
            }
            return probeQuickJsRuntime(runtime, config);
        },
        async execute(request) {
            if (request.language !== "javascript") {
                return {
                    status: "policy_violation",
                    stdout: "",
                    stderr: "",
                    outputFiles: [],
                    exitCode: null,
                    reason: `quickjs-wasi supports javascript, not ${request.language}.`,
                };
            }
            if (request.network !== "off") {
                return {
                    status: "policy_violation",
                    stdout: "",
                    stderr: "",
                    outputFiles: [],
                    exitCode: null,
                    reason: "quickjs-wasi adapter only supports network=off.",
                };
            }
            const inputs = {};
            for (const source of request.sources) {
                inputs[source.alias] = await readFile(source.path, "utf8");
            }
            const run = await runQuickJs(runtime, {
                code: request.code,
                timeoutMs: request.limits.timeoutMs,
                memoryBytes: 128 * 1024 * 1024,
                outputBytes: request.limits.maxOutputBytes,
                inputs,
            });
            if (run.status === "timed_out") {
                return {
                    status: "timed_out",
                    stdout: run.stdout,
                    stderr: run.stderr,
                    outputFiles: [],
                    exitCode: null,
                    durationMs: run.durationMs,
                    reason: "QuickJS execution exceeded timeoutMs.",
                };
            }
            if (run.status === "output_limit_exceeded") {
                return {
                    status: "failed",
                    stdout: run.stdout,
                    stderr: run.stderr,
                    outputFiles: [],
                    exitCode: null,
                    durationMs: run.durationMs,
                    reason: "QuickJS execution exceeded maxOutputBytes.",
                };
            }
            if (run.status === "failed") {
                return {
                    status: "failed",
                    stdout: run.stdout,
                    stderr: run.stderr || run.errorMessage || "QuickJS execution failed.",
                    outputFiles: [],
                    exitCode: 1,
                    durationMs: run.durationMs,
                    reason: "QuickJS execution failed.",
                };
            }
            return {
                status: "success",
                stdout: run.stdout,
                stderr: run.stderr,
                outputFiles: [],
                exitCode: 0,
                durationMs: run.durationMs,
            };
        },
    };
}
function unavailableQuickJsAdapter(reason) {
    return {
        id: "quickjs-wasi",
        version: "unavailable",
        languages: ["javascript"],
        async probe() {
            return {
                status: "unavailable",
                reason,
                passedProofs: [],
                failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
            };
        },
        async execute() {
            return {
                status: "policy_violation",
                stdout: "",
                stderr: "",
                outputFiles: [],
                exitCode: null,
                reason,
            };
        },
    };
}
async function loadQuickJsRuntime(packageRoot) {
    const resolvedRoot = resolve(packageRoot);
    const packageJson = JSON.parse(await readFile(join(resolvedRoot, "package.json"), "utf8"));
    const wasm = await readFile(join(resolvedRoot, "quickjs.wasm"));
    const module = await import(pathToFileURL(join(resolvedRoot, "dist/index.js")).href);
    return {
        QuickJS: module.QuickJS,
        wasm,
        packageName: String(packageJson.name ?? "quickjs-wasi"),
        packageVersion: String(packageJson.version ?? "unknown"),
        wasmSha256: createHash("sha256").update(wasm).digest("hex"),
    };
}
async function probeQuickJsRuntime(runtime, config) {
    const timeoutMs = Math.min(config.limits.timeoutMs, DEFAULT_PROBE_TIMEOUT_MS);
    const outputBytes = Math.min(config.limits.maxOutputBytes, DEFAULT_PROBE_OUTPUT_BYTES);
    const cacheKey = [runtime.packageVersion, runtime.wasmSha256, timeoutMs, outputBytes, config.network].join(":");
    const cached = quickJsProbeCache.get(cacheKey);
    if (cached) {
        return cloneProbeResult(await cached);
    }
    const probePromise = runQuickJsProbe(runtime, timeoutMs, outputBytes);
    quickJsProbeCache.set(cacheKey, probePromise);
    try {
        return cloneProbeResult(await probePromise);
    }
    catch (error) {
        quickJsProbeCache.delete(cacheKey);
        throw error;
    }
}
async function runQuickJsProbe(runtime, timeoutMs, outputBytes) {
    const previousSecret = process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL;
    process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL = SECRET_SENTINEL;
    try {
        const passedProofs = [];
        const failedProofs = [];
        const fixtures = scriptSandboxProofFixturesForLanguage("javascript");
        for (const fixture of fixtures) {
            const run = await runQuickJs(runtime, {
                code: fixture.program,
                timeoutMs,
                memoryBytes: DEFAULT_PROBE_MEMORY_BYTES,
                outputBytes,
                inputs: { test_log: "INFO setup\nERROR target\n" },
            });
            const assessment = assessQuickJsProof(fixture.proof, run, timeoutMs, outputBytes);
            if (assessment) {
                passedProofs.push(fixture.proof);
            }
            else {
                failedProofs.push(fixture.proof);
            }
        }
        const allPassed = SCRIPT_SANDBOX_REQUIRED_PROOFS.every((proof) => passedProofs.includes(proof));
        return {
            status: allPassed ? "available" : "unavailable",
            reason: allPassed ? "quickjs-wasi passed every required JavaScript sandbox proof." : "quickjs-wasi did not pass every required JavaScript sandbox proof.",
            passedProofs,
            failedProofs,
            runtime: runtimeInfo(runtime),
        };
    }
    finally {
        if (previousSecret === undefined) {
            delete process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL;
        }
        else {
            process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL = previousSecret;
        }
    }
}
function cloneProbeResult(result) {
    const clone = {
        ...result,
        passedProofs: [...result.passedProofs],
        failedProofs: [...result.failedProofs],
    };
    if (result.runtime) {
        clone.runtime = { ...result.runtime };
    }
    return clone;
}
async function runQuickJs(runtime, options) {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const appendOutput = (stream, value) => {
        const text = String(value ?? "");
        const currentBytes = Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8");
        const remaining = options.outputBytes - currentBytes;
        if (remaining <= 0) {
            truncated = true;
            return;
        }
        const textBytes = Buffer.from(text, "utf8");
        const nextText = textBytes.byteLength > remaining ? textBytes.subarray(0, remaining).toString("utf8") : text;
        if (textBytes.byteLength > remaining) {
            truncated = true;
        }
        if (stream === "stderr") {
            stderr += nextText;
        }
        else {
            stdout += nextText;
        }
    };
    let vm;
    try {
        vm = await runtime.QuickJS.create({
            wasm: runtime.wasm,
            memoryLimit: options.memoryBytes,
            interruptHandler: () => Date.now() - start > options.timeoutMs || truncated,
        });
        installHostApi(vm, appendOutput, options.inputs ?? {});
        const result = vm.evalCode(options.code);
        try {
            const dumped = vm.dump(result);
            if (dumped !== undefined) {
                appendOutput("stdout", typeof dumped === "string" ? dumped : JSON.stringify(dumped));
            }
        }
        finally {
            disposeHandle(result);
        }
        return buildRunResult(truncated ? "output_limit_exceeded" : "success", stdout, stderr, truncated, start);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const name = error instanceof Error ? error.name : "Error";
        if (truncated) {
            return { ...buildRunResult("output_limit_exceeded", stdout, stderr, truncated, start), errorName: name, errorMessage: message };
        }
        if (message.includes("interrupted")) {
            return { ...buildRunResult("timed_out", stdout, stderr, truncated, start), errorName: name, errorMessage: message };
        }
        return { ...buildRunResult("failed", stdout, stderr, truncated, start), errorName: name, errorMessage: message };
    }
    finally {
        if (vm && typeof vm.dispose === "function") {
            vm.dispose();
        }
    }
}
function installHostApi(vm, appendOutput, inputs) {
    const readText = vm.newFunction("readText", (...args) => {
        const alias = formatHostArgs(vm, args);
        return vm.newString(inputs[alias] ?? "");
    });
    vm.setProp(vm.global, "readText", readText);
    disposeHandle(readText);
    const writeText = vm.newFunction("writeText", (...args) => {
        appendOutput("stdout", formatHostArgs(vm, args));
        return vm.undefined;
    });
    vm.setProp(vm.global, "writeText", writeText);
    disposeHandle(writeText);
    const consoleObject = vm.newObject();
    const consoleLog = vm.newFunction("console.log", (...args) => {
        appendOutput("stdout", `${formatHostArgs(vm, args)}\n`);
        return vm.undefined;
    });
    const consoleError = vm.newFunction("console.error", (...args) => {
        appendOutput("stderr", `${formatHostArgs(vm, args)}\n`);
        return vm.undefined;
    });
    vm.setProp(consoleObject, "log", consoleLog);
    vm.setProp(consoleObject, "error", consoleError);
    vm.setProp(vm.global, "console", consoleObject);
    disposeHandle(consoleLog);
    disposeHandle(consoleError);
    disposeHandle(consoleObject);
}
function assessQuickJsProof(proof, run, timeoutMs, outputBytes) {
    const combined = `${run.stdout}\n${run.stderr}\n${run.errorMessage ?? ""}`;
    switch (proof) {
        case "env_access_denied":
            return !combined.includes(SECRET_SENTINEL) && !combined.includes("process.env");
        case "home_access_denied":
            return !combined.includes(process.env.HOME ?? "__no_home__") && !combined.match(/PRIVATE KEY|\.ssh/);
        case "repo_access_denied":
            return !combined.includes("@hassangameryt/freeflow") && !combined.includes("package.json");
        case "vault_access_denied":
            return !combined.includes("ffout_") && !combined.includes("ffrec_");
        case "network_access_denied":
            return combined.includes("fetch unavailable") || combined.includes("fetch is not defined");
        case "input_read_only":
            return !combined.includes("mutated") || combined.includes("fs unavailable");
        case "output_escape_denied":
            return !combined.includes("escape attempted") || combined.includes("fs unavailable");
        case "stdout_stderr_bounded":
            return run.truncated && run.outputBytes <= outputBytes && run.stdoutBytes > 0 && run.stderrBytes > 0;
        case "timeout_enforced":
            return run.status === "timed_out" && run.durationMs < timeoutMs * 5;
    }
}
function buildRunResult(status, stdout, stderr, truncated, start) {
    return {
        status,
        stdout,
        stderr,
        stdoutBytes: Buffer.byteLength(stdout, "utf8"),
        stderrBytes: Buffer.byteLength(stderr, "utf8"),
        outputBytes: Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8"),
        truncated,
        durationMs: Date.now() - start,
    };
}
function formatHostArgs(vm, args) {
    return args.map((arg) => {
        try {
            const dumped = vm.dump(arg);
            if (typeof dumped === "string")
                return dumped;
            if (dumped === undefined)
                return "undefined";
            return JSON.stringify(dumped);
        }
        catch {
            return arg?.toString() ?? "";
        }
    }).join(" ");
}
function runtimeInfo(runtime) {
    return { name: runtime.packageName, version: `${runtime.packageVersion} wasm:${runtime.wasmSha256.slice(0, 12)}` };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function disposeHandle(value) {
    if (value && typeof value.dispose === "function") {
        value.dispose();
    }
    else if (value && typeof value[Symbol.dispose] === "function") {
        value[Symbol.dispose]();
    }
}

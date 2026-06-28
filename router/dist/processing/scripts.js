import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SCRIPT_DERIVE_CONFIG, MAX_SCRIPT_DERIVE_LIMITS } from "../config/config.js";
import { selectScriptSandboxAdapter } from "../sandbox/script-sandbox.js";
const execFileAsync = promisify(execFile);
export function processingScriptNotConfigured() {
    return {
        status: "not_configured",
        reason: "No processing script was requested.",
    };
}
export function processingScriptUnavailableForUnloadedSource(script, reason) {
    return unavailableResult(script, reason, "Load the source successfully before running the requested processing script.");
}
export async function runProcessingScript(options) {
    const policy = options.script.policy ?? "sandboxed";
    const config = effectiveProcessingScriptConfig(options.scriptDerive);
    const limits = effectiveScriptLimits(config, options.script.limits);
    if (policy === "unsafe-unsandboxed") {
        return runUnsafeUnsandboxedProcessingScript({ ...options, config, limits });
    }
    if (policy !== "sandboxed") {
        return unavailableResult(options.script, `Unsupported processing script policy ${JSON.stringify(policy)}. No script code was executed.`, "Use policy=sandboxed or explicitly enable local unsafe-unsandboxed processing.");
    }
    if (!config.enabled) {
        return unavailableResult(options.script, "Processing script execution is disabled by config. No script code was executed.", "Enable script processing only with an approved sandbox adapter, or use a deterministic reducer.");
    }
    if (options.loaded.stats.bytes > limits.maxInputBytes) {
        return unavailableResult(options.script, `Processing script input is ${options.loaded.stats.bytes} bytes, above maxInputBytes=${limits.maxInputBytes}. No script code was executed.`, "Use a deterministic reducer, raise the bounded script input limit, or process a smaller source window.");
    }
    const selection = await selectScriptSandboxAdapter(options.script.language, config, options.adapters ?? []);
    if (!selection.ok) {
        return unavailableResult(options.script, `${selection.status.reason} No script code was executed.`, "Use a deterministic reducer or configure an approved sandbox adapter. Freeflow does not fall back to an unsandboxed host script.", {
            ...(selection.status.adapterId !== undefined ? { adapterId: selection.status.adapterId } : {}),
            ...(selection.status.adapterVersion !== undefined ? { adapterVersion: selection.status.adapterVersion } : {}),
            failedProofs: selection.status.failedProofs,
        });
    }
    const execution = await executeProcessingScriptWithAdapter({
        adapter: selection.adapter,
        loaded: options.loaded,
        script: options.script,
        config,
        limits,
    });
    if (!execution.ok) {
        return {
            status: "failed",
            language: options.script.language,
            policy: "sandboxed",
            reason: execution.reason,
            adapterId: selection.adapter.id,
            adapterVersion: selection.adapter.version,
            ...(execution.stdoutBytes !== undefined ? { stdoutBytes: execution.stdoutBytes } : {}),
            ...(execution.stderrBytes !== undefined ? { stderrBytes: execution.stderrBytes } : {}),
            noHostFallback: true,
            rawScriptPersistence: "disabled",
            codeHashSha256: sha256(options.script.code),
        };
    }
    const stdout = execution.result.stdout ?? "";
    const stderr = execution.result.stderr ?? "";
    const executed = {
        status: "executed",
        language: options.script.language,
        policy: "sandboxed",
        adapterId: selection.adapter.id,
        adapterVersion: selection.adapter.version,
        outputText: stdout,
        stderr,
        stdoutBytes: byteLength(stdout),
        stderrBytes: byteLength(stderr),
        noHostFallback: true,
        rawScriptPersistence: "disabled",
        codeHashSha256: sha256(options.script.code),
    };
    if (selection.status.runtime !== undefined) {
        executed.runtime = selection.status.runtime;
    }
    if (execution.result.durationMs !== undefined) {
        executed.durationMs = execution.result.durationMs;
    }
    return executed;
}
function unavailableResult(script, reason, recommendation, adapter) {
    return {
        status: "unavailable",
        language: script.language,
        policy: script.policy ?? "sandboxed",
        reason,
        recommendation,
        noHostFallback: true,
        rawScriptPersistence: "disabled",
        codeHashSha256: sha256(script.code),
        ...(adapter?.adapterId !== undefined ? { adapterId: adapter.adapterId } : {}),
        ...(adapter?.adapterVersion !== undefined ? { adapterVersion: adapter.adapterVersion } : {}),
        ...(adapter?.failedProofs !== undefined ? { failedProofs: [...adapter.failedProofs] } : {}),
    };
}
async function runUnsafeUnsandboxedProcessingScript(options) {
    if (!options.localConfig?.processing.unsafeUnsandboxed.enabled) {
        return {
            status: "rejected",
            language: options.script.language,
            policy: "unsafe-unsandboxed",
            reason: "Unsafe unsandboxed processing was requested, but .freeflow/local.json has not enabled processing.unsafeUnsandboxed.enabled. No script code was executed.",
            recommendation: "Create local-only .freeflow/local.json with processing.unsafeUnsandboxed.enabled=true, then retry with script.policy=unsafe-unsandboxed.",
            rawScriptPersistence: "disabled",
            codeHashSha256: sha256(options.script.code),
            localOptInRequired: true,
        };
    }
    if (options.script.language !== "javascript") {
        return {
            status: "rejected",
            language: options.script.language,
            policy: "unsafe-unsandboxed",
            reason: `Unsafe unsandboxed processing currently supports javascript only; requested ${options.script.language}. No script code was executed.`,
            recommendation: "Use javascript for local YOLO processing, or use a proven sandbox adapter for other languages.",
            rawScriptPersistence: "disabled",
            codeHashSha256: sha256(options.script.code),
        };
    }
    if (options.loaded.stats.bytes > options.limits.maxInputBytes) {
        return {
            status: "rejected",
            language: options.script.language,
            policy: "unsafe-unsandboxed",
            reason: `Unsafe unsandboxed processing input is ${options.loaded.stats.bytes} bytes, above maxInputBytes=${options.limits.maxInputBytes}. No script code was executed.`,
            recommendation: "Raise the bounded script input limit locally or process a smaller source window.",
            rawScriptPersistence: "disabled",
            codeHashSha256: sha256(options.script.code),
        };
    }
    const execution = await executeUnsafeJavaScriptProcessingScript(options);
    if (!execution.ok) {
        return {
            status: "failed",
            language: options.script.language,
            policy: "unsafe-unsandboxed",
            reason: execution.reason,
            ...(execution.stdoutBytes !== undefined ? { stdoutBytes: execution.stdoutBytes } : {}),
            ...(execution.stderrBytes !== undefined ? { stderrBytes: execution.stderrBytes } : {}),
            unsafeUnsandboxed: true,
            rawScriptPersistence: "disabled",
            codeHashSha256: sha256(options.script.code),
        };
    }
    const stdout = execution.stdout;
    const stderr = execution.stderr;
    return {
        status: "executed",
        language: options.script.language,
        policy: "unsafe-unsandboxed",
        runtime: { name: "node", version: process.version },
        outputText: stdout,
        stderr,
        stdoutBytes: byteLength(stdout),
        stderrBytes: byteLength(stderr),
        ...(execution.durationMs !== undefined ? { durationMs: execution.durationMs } : {}),
        unsafeUnsandboxed: true,
        rawScriptPersistence: "disabled",
        codeHashSha256: sha256(options.script.code),
    };
}
async function executeUnsafeJavaScriptProcessingScript(options) {
    const tempRoot = await mkdtemp(join(tmpdir(), "freeflow-processing-unsafe-script-"));
    const inputDir = join(tempRoot, "input");
    const workDir = join(tempRoot, "work");
    try {
        await mkdir(inputDir, { recursive: true });
        await mkdir(workDir, { recursive: true });
        const alias = safeAlias(options.script.alias ?? "source");
        const sourcePath = join(inputDir, `${alias}.txt`);
        const manifestPath = join(inputDir, "manifest.json");
        const scriptPath = join(workDir, "script.mjs");
        await writeFile(sourcePath, options.loaded.text, "utf8");
        await writeFile(manifestPath, JSON.stringify({
            schemaVersion: 1,
            unsafeUnsandboxed: true,
            sources: [{
                    alias,
                    path: sourcePath,
                    source: options.loaded.source,
                    bytes: options.loaded.stats.bytes,
                    sha256: options.loaded.stats.sha256,
                }],
        }, null, 2), "utf8");
        await writeFile(scriptPath, options.script.code, "utf8");
        const startedAt = Date.now();
        try {
            const output = await execFileAsync(process.execPath, [scriptPath], {
                cwd: workDir,
                timeout: options.limits.timeoutMs,
                maxBuffer: options.limits.maxOutputBytes,
                env: {
                    ...process.env,
                    FREEFLOW_PROCESSING_INPUT_DIR: inputDir,
                    FREEFLOW_PROCESSING_SOURCE_PATH: sourcePath,
                    FREEFLOW_PROCESSING_MANIFEST: manifestPath,
                    FREEFLOW_PROCESSING_UNSAFE_UNSANDBOXED: "1",
                },
            });
            const stdout = String(output.stdout ?? "");
            const stderr = String(output.stderr ?? "");
            if (byteLength(stdout) + byteLength(stderr) > options.limits.maxOutputBytes) {
                return {
                    ok: false,
                    reason: `Unsafe unsandboxed processing script output bytes ${byteLength(stdout) + byteLength(stderr)} exceed maxOutputBytes ${options.limits.maxOutputBytes}.`,
                    stdoutBytes: byteLength(stdout),
                    stderrBytes: byteLength(stderr),
                };
            }
            return { ok: true, stdout, stderr, durationMs: Date.now() - startedAt };
        }
        catch (error) {
            const maybe = error;
            const stdout = String(maybe.stdout ?? "");
            const stderr = String(maybe.stderr ?? "");
            const code = typeof maybe.code === "number" ? maybe.code : "unknown";
            const signal = typeof maybe.signal === "string" ? maybe.signal : undefined;
            const reason = maybe.killed || signal
                ? `Unsafe unsandboxed processing script timed out or was terminated. Detail omitted to avoid returning raw script text. stdoutBytes=${byteLength(stdout)} stderrBytes=${byteLength(stderr)}.`
                : `Unsafe unsandboxed processing script failed with exitCode=${code}. Detail omitted to avoid returning raw script text. stdoutBytes=${byteLength(stdout)} stderrBytes=${byteLength(stderr)}.`;
            return { ok: false, reason, stdoutBytes: byteLength(stdout), stderrBytes: byteLength(stderr) };
        }
    }
    finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}
async function executeProcessingScriptWithAdapter(options) {
    const tempRoot = await mkdtemp(join(tmpdir(), "freeflow-processing-script-"));
    const inputDir = join(tempRoot, "input");
    const workDir = join(tempRoot, "work");
    const outputDir = join(tempRoot, "output");
    try {
        await mkdir(inputDir, { recursive: true });
        await mkdir(workDir, { recursive: true });
        await mkdir(outputDir, { recursive: true });
        const alias = safeAlias(options.script.alias ?? "source");
        const sourcePath = join(inputDir, `${alias}.txt`);
        await writeFile(sourcePath, options.loaded.text, "utf8");
        const sources = [{
                alias,
                path: sourcePath,
                bytes: options.loaded.stats.bytes,
                sha256: options.loaded.stats.sha256,
            }];
        await writeFile(join(inputDir, "manifest.json"), JSON.stringify({
            schemaVersion: 1,
            sources: [{
                    alias,
                    source: options.loaded.source,
                    bytes: options.loaded.stats.bytes,
                    sha256: options.loaded.stats.sha256,
                }],
        }, null, 2), "utf8");
        let result;
        try {
            result = await options.adapter.execute({
                language: options.script.language,
                code: options.script.code,
                inputDir,
                workDir,
                outputDir,
                sources,
                limits: options.limits,
                network: options.config.network,
            });
        }
        catch {
            return { ok: false, reason: `Processing script adapter ${options.adapter.id} threw before returning a result. Adapter error detail omitted to avoid returning raw script text.` };
        }
        const stdoutBytes = byteLength(result.stdout ?? "");
        const stderrBytes = byteLength(result.stderr ?? "");
        if (stdoutBytes + stderrBytes > options.limits.maxOutputBytes) {
            return {
                ok: false,
                reason: `Processing script output bytes ${stdoutBytes + stderrBytes} exceed maxOutputBytes ${options.limits.maxOutputBytes}.`,
                stdoutBytes,
                stderrBytes,
            };
        }
        if (result.status !== "success") {
            return {
                ok: false,
                reason: `Processing script ${options.script.language} ${result.status}. Adapter failure detail omitted to avoid returning raw script text. stdoutBytes=${stdoutBytes} stderrBytes=${stderrBytes}.`,
                stdoutBytes,
                stderrBytes,
            };
        }
        return { ok: true, result };
    }
    finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}
function effectiveProcessingScriptConfig(config) {
    const base = config ?? { ...DEFAULT_SCRIPT_DERIVE_CONFIG, enabled: true };
    return {
        ...base,
        languages: [...base.languages],
        limits: { ...base.limits },
    };
}
function effectiveScriptLimits(config, input) {
    return {
        timeoutMs: boundedScriptLimit(input?.timeoutMs, config.limits.timeoutMs, MAX_SCRIPT_DERIVE_LIMITS.timeoutMs),
        maxInputBytes: boundedScriptLimit(input?.maxInputBytes, config.limits.maxInputBytes, MAX_SCRIPT_DERIVE_LIMITS.maxInputBytes),
        maxOutputBytes: boundedScriptLimit(input?.maxOutputBytes, config.limits.maxOutputBytes, MAX_SCRIPT_DERIVE_LIMITS.maxOutputBytes),
    };
}
function boundedScriptLimit(value, configured, max) {
    const configuredLimit = Math.min(configured, max);
    if (!Number.isInteger(value) || Number(value) <= 0) {
        return configuredLimit;
    }
    return Math.min(Number(value), configuredLimit);
}
function safeAlias(alias) {
    return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(alias) ? alias : "source";
}
function sha256(text) {
    return createHash("sha256").update(text).digest("hex");
}
function byteLength(text) {
    return Buffer.byteLength(text, "utf8");
}

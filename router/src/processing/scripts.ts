import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_SCRIPT_TRANSFORM_CONFIG, MAX_SCRIPT_TRANSFORM_LIMITS } from "../config/config.js";
import { selectScriptSandboxAdapter, type ScriptSandboxAdapter, type ScriptSandboxExecutionResult, type ScriptSandboxSourceMount } from "../sandbox/script-sandbox.js";
import type { LocalFreeflowConfig, ProcessingScriptPolicy, ScriptTransformConfig, ScriptTransformLanguage } from "../config/types.js";
import type { LoadedProcessingSource } from "./engine.js";

export interface ProcessingScriptRequest {
  language: ScriptTransformLanguage;
  code: string;
  label?: string;
  alias?: string;
  policy?: ProcessingScriptPolicy;
  limits?: Partial<ScriptTransformConfig["limits"]>;
}

export type ProcessingScriptResult =
  | {
      status: "not_configured";
      reason: string;
    }
  | {
      status: "unavailable";
      language: ScriptTransformLanguage;
      policy: ProcessingScriptPolicy;
      reason: string;
      recommendation: string;
      noHostFallback: true;
      rawScriptPersistence: "disabled";
      codeHashSha256: string;
      adapterId?: string;
      adapterVersion?: string;
      failedProofs?: string[];
    }
  | {
      status: "rejected";
      language: ScriptTransformLanguage;
      policy: "unsafe-unsandboxed";
      reason: string;
      recommendation: string;
      rawScriptPersistence: "disabled";
      codeHashSha256: string;
      localOptInRequired?: true;
    }
  | {
      status: "executed";
      language: ScriptTransformLanguage;
      policy: ProcessingScriptPolicy;
      adapterId?: string;
      adapterVersion?: string;
      runtime?: { name: string; version?: string };
      outputText: string;
      stderr: string;
      stdoutBytes: number;
      stderrBytes: number;
      durationMs?: number;
      noHostFallback?: true;
      unsafeUnsandboxed?: true;
      rawScriptPersistence: "disabled";
      codeHashSha256: string;
    }
  | {
      status: "failed";
      language: ScriptTransformLanguage;
      policy: ProcessingScriptPolicy;
      reason: string;
      adapterId?: string;
      adapterVersion?: string;
      stdoutBytes?: number;
      stderrBytes?: number;
      noHostFallback?: true;
      unsafeUnsandboxed?: true;
      rawScriptPersistence: "disabled";
      codeHashSha256: string;
    };

export interface RunProcessingScriptOptions {
  loaded: LoadedProcessingSource;
  script: ProcessingScriptRequest;
  scriptTransform?: ScriptTransformConfig;
  localConfig?: LocalFreeflowConfig;
  adapters?: readonly ScriptSandboxAdapter[];
}

const execFileAsync = promisify(execFile);

export function processingScriptNotConfigured(): ProcessingScriptResult {
  return {
    status: "not_configured",
    reason: "No processing script was requested.",
  };
}

export function processingScriptUnavailableForUnloadedSource(script: ProcessingScriptRequest, reason: string): ProcessingScriptResult {
  return unavailableResult(script, reason, "Load the source successfully before running the requested processing script.");
}

export async function runProcessingScript(options: RunProcessingScriptOptions): Promise<ProcessingScriptResult> {
  const policy = options.script.policy ?? "sandboxed";
  const config = effectiveProcessingScriptConfig(options.scriptTransform);
  const limits = effectiveScriptLimits(config, options.script.limits);

  if (policy === "unsafe-unsandboxed") {
    return runUnsafeUnsandboxedProcessingScript({ ...options, config, limits });
  }
  if (policy !== "sandboxed") {
    return unavailableResult(
      options.script,
      `Unsupported processing script policy ${JSON.stringify(policy)}. No script code was executed.`,
      "Use policy=sandboxed or explicitly enable local unsafe-unsandboxed processing.",
    );
  }

  if (!config.enabled) {
    return unavailableResult(
      options.script,
      "Processing script execution is disabled by config. No script code was executed.",
      "Enable script processing only with an approved sandbox adapter, or use a deterministic reducer.",
    );
  }

  if (options.loaded.stats.bytes > limits.maxInputBytes) {
    return unavailableResult(
      options.script,
      `Processing script input is ${options.loaded.stats.bytes} bytes, above maxInputBytes=${limits.maxInputBytes}. No script code was executed.`,
      "Use a deterministic reducer, raise the bounded script input limit, or process a smaller source window.",
    );
  }

  const selection = await selectScriptSandboxAdapter(options.script.language, config, options.adapters ?? []);
  if (!selection.ok) {
    return unavailableResult(
      options.script,
      `${selection.status.reason} No script code was executed.`,
      "Use a deterministic reducer or configure an approved sandbox adapter. Freeflow does not fall back to an unsandboxed host script.",
      {
        ...(selection.status.adapterId !== undefined ? { adapterId: selection.status.adapterId } : {}),
        ...(selection.status.adapterVersion !== undefined ? { adapterVersion: selection.status.adapterVersion } : {}),
        failedProofs: selection.status.failedProofs,
      },
    );
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
  const executed: ProcessingScriptResult = {
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

function unavailableResult(
  script: ProcessingScriptRequest,
  reason: string,
  recommendation: string,
  adapter?: { adapterId?: string; adapterVersion?: string; failedProofs?: readonly string[] },
): ProcessingScriptResult {
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

async function runUnsafeUnsandboxedProcessingScript(options: RunProcessingScriptOptions & {
  config: ScriptTransformConfig;
  limits: ScriptTransformConfig["limits"];
}): Promise<ProcessingScriptResult> {
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

async function executeUnsafeJavaScriptProcessingScript(options: RunProcessingScriptOptions & {
  limits: ScriptTransformConfig["limits"];
}): Promise<
  | { ok: true; stdout: string; stderr: string; durationMs?: number }
  | { ok: false; reason: string; stdoutBytes?: number; stderrBytes?: number }
> {
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
    } catch (error) {
      const maybe = error as { stdout?: unknown; stderr?: unknown; code?: unknown; signal?: unknown; killed?: unknown };
      const stdout = String(maybe.stdout ?? "");
      const stderr = String(maybe.stderr ?? "");
      const code = typeof maybe.code === "number" ? maybe.code : "unknown";
      const signal = typeof maybe.signal === "string" ? maybe.signal : undefined;
      const reason = maybe.killed || signal
        ? `Unsafe unsandboxed processing script timed out or was terminated. Detail omitted to avoid returning raw script text. stdoutBytes=${byteLength(stdout)} stderrBytes=${byteLength(stderr)}.`
        : `Unsafe unsandboxed processing script failed with exitCode=${code}. Detail omitted to avoid returning raw script text. stdoutBytes=${byteLength(stdout)} stderrBytes=${byteLength(stderr)}.`;
      return { ok: false, reason, stdoutBytes: byteLength(stdout), stderrBytes: byteLength(stderr) };
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function executeProcessingScriptWithAdapter(options: {
  adapter: ScriptSandboxAdapter;
  loaded: LoadedProcessingSource;
  script: ProcessingScriptRequest;
  config: ScriptTransformConfig;
  limits: ScriptTransformConfig["limits"];
}): Promise<
  | { ok: true; result: ScriptSandboxExecutionResult }
  | { ok: false; reason: string; stdoutBytes?: number; stderrBytes?: number }
> {
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
    const sources: ScriptSandboxSourceMount[] = [{
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

    let result: ScriptSandboxExecutionResult;
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
    } catch {
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
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function effectiveProcessingScriptConfig(config: ScriptTransformConfig | undefined): ScriptTransformConfig {
  const base = config ?? { ...DEFAULT_SCRIPT_TRANSFORM_CONFIG, enabled: true };
  return {
    ...base,
    languages: [...base.languages],
    limits: { ...base.limits },
  };
}

function effectiveScriptLimits(config: ScriptTransformConfig, input: Partial<ScriptTransformConfig["limits"]> | undefined): ScriptTransformConfig["limits"] {
  return {
    timeoutMs: boundedScriptLimit(input?.timeoutMs, config.limits.timeoutMs, MAX_SCRIPT_TRANSFORM_LIMITS.timeoutMs),
    maxInputBytes: boundedScriptLimit(input?.maxInputBytes, config.limits.maxInputBytes, MAX_SCRIPT_TRANSFORM_LIMITS.maxInputBytes),
    maxOutputBytes: boundedScriptLimit(input?.maxOutputBytes, config.limits.maxOutputBytes, MAX_SCRIPT_TRANSFORM_LIMITS.maxOutputBytes),
  };
}

function boundedScriptLimit(value: number | undefined, configured: number, max: number): number {
  const configuredLimit = Math.min(configured, max);
  if (!Number.isInteger(value) || Number(value) <= 0) {
    return configuredLimit;
  }
  return Math.min(Number(value), configuredLimit);
}

function safeAlias(alias: string): string {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(alias) ? alias : "source";
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

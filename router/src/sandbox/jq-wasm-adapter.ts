import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";

import { resolveScriptTransformAdapterRoot } from "./adapter-roots.js";
import { SCRIPT_SANDBOX_REQUIRED_PROOFS, scriptSandboxProofFixturesForLanguage } from "./script-sandbox.js";
import type {
  ScriptSandboxAdapter,
  ScriptSandboxExecutionRequest,
  ScriptSandboxExecutionResult,
  ScriptSandboxProof,
  ScriptSandboxProbeResult,
} from "./script-sandbox.js";
import type { ScriptTransformConfig } from "../config/types.js";

const DEFAULT_PROBE_TIMEOUT_MS = 250;
const DEFAULT_PROBE_OUTPUT_BYTES = 4096;
const DEFAULT_WORKER_OLD_GENERATION_MB = 64;
const DEFAULT_WORKER_YOUNG_GENERATION_MB = 16;
const SECRET_SENTINEL = "FREEFLOW_SANDBOX_SECRET_SENTINEL_VALUE";

export const JQ_WASM_ROOT_ENV = "FREEFLOW_JQ_WASM_ROOT";

const jqProbeCache = new Map<string, Promise<ScriptSandboxProbeResult>>();

export interface JqWasmSandboxAdapterOptions {
  packageRoot: string;
  id?: string;
  version?: string;
}

interface JqWasmRuntime {
  packageName: string;
  packageVersion: string;
  entrySha256: string;
  jqPath: string;
}

interface JqRunOptions {
  query: string;
  json: Record<string, string>;
  timeoutMs: number;
  outputBytes: number;
}

interface JqRunResult {
  status: "success" | "error" | "timed_out" | "output_limit_exceeded";
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  outputBytes: number;
  rawStdoutBytes: number;
  rawStderrBytes: number;
  truncated: boolean;
  exitCode: number | null;
  durationMs: number;
  errorMessage?: string;
}

export async function discoverJqWasmSandboxAdaptersFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<ScriptSandboxAdapter[]> {
  const candidate = await resolveScriptTransformAdapterRoot("jq", env);
  if (!candidate) {
    return [];
  }
  try {
    return [await createJqWasmSandboxAdapter({ packageRoot: candidate.packageRoot })];
  } catch (error) {
    return [unavailableJqAdapter(`jq-wasm adapter could not load from ${candidate.source === "env" ? candidate.envVar : "global adapter cache"}: ${errorMessage(error)}`)];
  }
}

export async function createJqWasmSandboxAdapter(options: JqWasmSandboxAdapterOptions): Promise<ScriptSandboxAdapter> {
  const runtime = await loadJqRuntime(options.packageRoot);
  return {
    id: options.id ?? "jq-wasm",
    version: options.version ?? runtime.packageVersion,
    languages: ["jq"],
    async probe(language: string, config: ScriptTransformConfig): Promise<ScriptSandboxProbeResult> {
      if (language !== "jq") {
        return {
          status: "unavailable",
          reason: `jq-wasm supports jq, not ${language}.`,
          passedProofs: [],
          failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
          runtime: runtimeInfo(runtime),
        };
      }
      return probeJqRuntime(runtime, config);
    },
    async execute(request: ScriptSandboxExecutionRequest): Promise<ScriptSandboxExecutionResult> {
      if (request.language !== "jq") {
        return {
          status: "policy_violation",
          stdout: "",
          stderr: "",
          outputFiles: [],
          exitCode: null,
          reason: `jq-wasm supports jq, not ${request.language}.`,
        };
      }
      if (request.network !== "off") {
        return {
          status: "policy_violation",
          stdout: "",
          stderr: "",
          outputFiles: [],
          exitCode: null,
          reason: "jq-wasm adapter only supports network=off.",
        };
      }

      const json: Record<string, string> = {};
      for (const source of request.sources) {
        json[source.alias] = await readFile(source.path, "utf8");
      }
      const run = await runJq(runtime, {
        query: request.code,
        json,
        timeoutMs: request.limits.timeoutMs,
        outputBytes: request.limits.maxOutputBytes,
      });
      if (run.status === "timed_out") {
        return {
          status: "timed_out",
          stdout: run.stdout,
          stderr: run.stderr,
          outputFiles: [],
          exitCode: null,
          durationMs: run.durationMs,
          reason: "jq-wasm execution exceeded timeoutMs.",
        };
      }
      if (run.truncated || run.status === "output_limit_exceeded") {
        return {
          status: "failed",
          stdout: run.stdout,
          stderr: run.stderr,
          outputFiles: [],
          exitCode: run.exitCode,
          durationMs: run.durationMs,
          reason: "jq-wasm execution exceeded maxOutputBytes.",
        };
      }
      if (run.status === "error") {
        return {
          status: "failed",
          stdout: run.stdout,
          stderr: run.stderr || run.errorMessage || "jq-wasm execution failed.",
          outputFiles: [],
          exitCode: run.exitCode,
          durationMs: run.durationMs,
          reason: "jq-wasm execution failed.",
        };
      }
      if (run.exitCode !== 0) {
        return {
          status: "failed",
          stdout: run.stdout,
          stderr: run.stderr,
          outputFiles: [],
          exitCode: run.exitCode,
          durationMs: run.durationMs,
          reason: `jq-wasm execution exited with code ${run.exitCode}.`,
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

function unavailableJqAdapter(reason: string): ScriptSandboxAdapter {
  return {
    id: "jq-wasm",
    version: "unavailable",
    languages: ["jq"],
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

async function loadJqRuntime(packageRoot: string): Promise<JqWasmRuntime> {
  const resolvedRoot = resolve(packageRoot);
  const packageJson = JSON.parse(await readFile(join(resolvedRoot, "package.json"), "utf8"));
  const jqPath = join(resolvedRoot, String(packageJson.main ?? "dist/index.js"));
  const entry = await readFile(jqPath);
  return {
    packageName: String(packageJson.name ?? "jq-wasm"),
    packageVersion: String(packageJson.version ?? "unknown"),
    entrySha256: createHash("sha256").update(entry).digest("hex"),
    jqPath,
  };
}

async function probeJqRuntime(runtime: JqWasmRuntime, config: ScriptTransformConfig): Promise<ScriptSandboxProbeResult> {
  const timeoutMs = Math.min(config.limits.timeoutMs, DEFAULT_PROBE_TIMEOUT_MS);
  const outputBytes = Math.min(config.limits.maxOutputBytes, DEFAULT_PROBE_OUTPUT_BYTES);
  const cacheKey = [runtime.packageVersion, runtime.entrySha256, timeoutMs, outputBytes, config.network].join(":");
  const cached = jqProbeCache.get(cacheKey);
  if (cached) {
    return cloneProbeResult(await cached);
  }

  const probePromise = runJqProbe(runtime, timeoutMs, outputBytes);
  jqProbeCache.set(cacheKey, probePromise);
  try {
    return cloneProbeResult(await probePromise);
  } catch (error) {
    jqProbeCache.delete(cacheKey);
    throw error;
  }
}

async function runJqProbe(runtime: JqWasmRuntime, timeoutMs: number, outputBytes: number): Promise<ScriptSandboxProbeResult> {
  const previousSecret = process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL;
  process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL = SECRET_SENTINEL;
  try {
    const passedProofs: ScriptSandboxProof[] = [];
    const failedProofs: ScriptSandboxProof[] = [];
    const fixtures = scriptSandboxProofFixturesForLanguage("jq");
    for (const fixture of fixtures) {
      const run = await runJq(runtime, {
        query: fixture.program,
        json: { test_log: "INFO setup\nERROR target\n" },
        timeoutMs,
        outputBytes,
      });
      const assessment = assessJqProof(fixture.proof, run, timeoutMs, outputBytes);
      if (assessment) {
        passedProofs.push(fixture.proof);
      } else {
        failedProofs.push(fixture.proof);
      }
    }
    const allPassed = SCRIPT_SANDBOX_REQUIRED_PROOFS.every((proof) => passedProofs.includes(proof));
    return {
      status: allPassed ? "available" : "unavailable",
      reason: allPassed ? "jq-wasm passed every required jq sandbox proof." : "jq-wasm did not pass every required jq sandbox proof.",
      passedProofs,
      failedProofs,
      runtime: runtimeInfo(runtime),
    };
  } finally {
    if (previousSecret === undefined) {
      delete process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL;
    } else {
      process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL = previousSecret;
    }
  }
}

function cloneProbeResult(result: ScriptSandboxProbeResult): ScriptSandboxProbeResult {
  const clone: ScriptSandboxProbeResult = {
    ...result,
    passedProofs: [...result.passedProofs],
    failedProofs: [...result.failedProofs],
  };
  if (result.runtime) {
    clone.runtime = { ...result.runtime };
  }
  return clone;
}

async function runJq(runtime: JqWasmRuntime, options: JqRunOptions): Promise<JqRunResult> {
  const start = Date.now();
  const workerSource = `
    (async () => {
    const { parentPort, workerData } = await import('node:worker_threads');
    const { createRequire } = await import('node:module');
    const require = createRequire(workerData.jqPath);
    const jq = require(workerData.jqPath);
    const byteLength = (value) => Buffer.byteLength(String(value ?? ''), 'utf8');
    const capText = (value, cap) => {
      const text = String(value ?? '');
      const buffer = Buffer.from(text, 'utf8');
      return {
        text: buffer.byteLength > cap ? buffer.subarray(0, cap).toString('utf8') : text,
        bytes: buffer.byteLength,
        truncated: buffer.byteLength > cap,
      };
    };
    const capStreams = (stdoutValue, stderrValue, outputBytes) => {
      const stdoutRawBytes = byteLength(stdoutValue);
      const stderrRawBytes = byteLength(stderrValue);
      let stdoutCap = 0;
      let stderrCap = 0;
      if (stdoutRawBytes > 0 && stderrRawBytes > 0) {
        stdoutCap = Math.max(1, Math.floor(outputBytes / 2));
        stderrCap = Math.max(1, outputBytes - stdoutCap);
      } else if (stdoutRawBytes > 0) {
        stdoutCap = Math.max(0, outputBytes);
      } else if (stderrRawBytes > 0) {
        stderrCap = Math.max(0, outputBytes);
      }
      const stdout = capText(stdoutValue, stdoutCap);
      const stderr = capText(stderrValue, stderrCap);
      return {
        stdout: stdout.text,
        stderr: stderr.text,
        rawStdoutBytes: stdout.bytes,
        rawStderrBytes: stderr.bytes,
        truncated: stdout.truncated || stderr.truncated,
      };
    };
      try {
        const result = await jq.raw(workerData.json, workerData.query, ['-c']);
        const capped = capStreams(result.stdout, result.stderr, workerData.outputBytes);
        parentPort.postMessage({
          status: capped.truncated ? 'output_limit_exceeded' : 'success',
          stdout: capped.stdout,
          stderr: capped.stderr,
          exitCode: result.exitCode,
          truncated: capped.truncated,
          rawStdoutBytes: capped.rawStdoutBytes,
          rawStderrBytes: capped.rawStderrBytes,
        });
      } catch (error) {
        const message = String(error && error.stack || error);
        const capped = capStreams('', message, workerData.outputBytes);
        parentPort.postMessage({
          status: capped.truncated ? 'output_limit_exceeded' : 'error',
          stdout: capped.stdout,
          stderr: capped.stderr,
          exitCode: null,
          truncated: capped.truncated,
          rawStdoutBytes: capped.rawStdoutBytes,
          rawStderrBytes: capped.rawStderrBytes,
          errorMessage: message,
        });
      }
    })();
  `;
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: {
      jqPath: runtime.jqPath,
      query: options.query,
      json: options.json,
      outputBytes: options.outputBytes,
    },
    resourceLimits: {
      maxOldGenerationSizeMb: DEFAULT_WORKER_OLD_GENERATION_MB,
      maxYoungGenerationSizeMb: DEFAULT_WORKER_YOUNG_GENERATION_MB,
    },
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Omit<JqRunResult, "durationMs" | "stdoutBytes" | "stderrBytes" | "outputBytes">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      const stdout = result.stdout ?? "";
      const stderr = result.stderr ?? "";
      resolve({
        ...result,
        stdout,
        stderr,
        stdoutBytes: Buffer.byteLength(stdout, "utf8"),
        stderrBytes: Buffer.byteLength(stderr, "utf8"),
        outputBytes: Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8"),
        durationMs: Date.now() - start,
      });
    };
    const timer = setTimeout(() => {
      finish({
        status: "timed_out",
        stdout: "",
        stderr: "",
        exitCode: null,
        truncated: false,
        rawStdoutBytes: 0,
        rawStderrBytes: 0,
      });
    }, options.timeoutMs);
    worker.on("message", (message) => finish(normalizeWorkerMessage(message)));
    worker.on("error", (error) => {
      const message = String(error?.stack ?? error);
      finish({
        status: "error",
        stdout: "",
        stderr: message,
        exitCode: null,
        truncated: false,
        rawStdoutBytes: 0,
        rawStderrBytes: Buffer.byteLength(message, "utf8"),
        errorMessage: message,
      });
    });
    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        finish({
          status: "error",
          stdout: "",
          stderr: `worker exited with code ${code}`,
          exitCode: code,
          truncated: false,
          rawStdoutBytes: 0,
          rawStderrBytes: 0,
        });
      }
    });
  });
}

function normalizeWorkerMessage(message: any): Omit<JqRunResult, "durationMs" | "stdoutBytes" | "stderrBytes" | "outputBytes"> {
  return {
    status: isJqRunStatus(message?.status) ? message.status : "error",
    stdout: typeof message?.stdout === "string" ? message.stdout : "",
    stderr: typeof message?.stderr === "string" ? message.stderr : "",
    exitCode: Number.isInteger(message?.exitCode) ? Number(message.exitCode) : null,
    truncated: Boolean(message?.truncated),
    rawStdoutBytes: Number.isFinite(message?.rawStdoutBytes) ? Number(message.rawStdoutBytes) : 0,
    rawStderrBytes: Number.isFinite(message?.rawStderrBytes) ? Number(message.rawStderrBytes) : 0,
    errorMessage: typeof message?.errorMessage === "string" ? message.errorMessage : undefined,
  };
}

function isJqRunStatus(value: unknown): value is JqRunResult["status"] {
  return value === "success" || value === "error" || value === "timed_out" || value === "output_limit_exceeded";
}

function assessJqProof(proof: ScriptSandboxProof, run: JqRunResult, timeoutMs: number, outputBytes: number): boolean {
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
      return run.exitCode !== 0 && combined.includes("network unavailable");
    case "input_read_only":
      return run.exitCode !== 0 && combined.includes("module not found");
    case "output_escape_denied":
      return run.exitCode !== 0 && combined.includes("module not found");
    case "stdout_stderr_bounded":
      return run.status !== "error" && run.truncated && run.outputBytes <= outputBytes && run.stdoutBytes > 0 && run.stderrBytes > 0 && run.rawStdoutBytes > outputBytes && run.rawStderrBytes > outputBytes;
    case "timeout_enforced":
      return run.status === "timed_out" && run.durationMs < timeoutMs * 5;
  }
}

function runtimeInfo(runtime: JqWasmRuntime) {
  return { name: runtime.packageName, version: `${runtime.packageVersion} entry:${runtime.entrySha256.slice(0, 12)}` };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { defaultScriptTransformNodeBinary, resolveScriptTransformAdapterRoot } from "./adapter-roots.js";
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
const DEFAULT_WORKER_OLD_GENERATION_MB = 256;
const DEFAULT_WORKER_YOUNG_GENERATION_MB = 32;
const SECRET_SENTINEL = "FREEFLOW_SANDBOX_SECRET_SENTINEL_VALUE";
const HOST_HOME = process.env.HOME ?? "__no_home__";
const ERYX_CHILD_MODE_ARG = "__freeflow_eryx_child__";
const ERYX_CHILD_TIMEOUT_FLOOR_MS = 30_000;

export const ERYX_ROOT_ENV = "FREEFLOW_ERYX_ROOT";

const PREVIEW2_IMPORTS = new Map<string, string>([
  ["@bytecodealliance/preview2-shim/cli", "../../@bytecodealliance/preview2-shim/lib/browser/cli.js"],
  ["@bytecodealliance/preview2-shim/clocks", "../../@bytecodealliance/preview2-shim/lib/browser/clocks.js"],
  ["@bytecodealliance/preview2-shim/filesystem", "../../@bytecodealliance/preview2-shim/lib/browser/filesystem.js"],
  ["@bytecodealliance/preview2-shim/io", "../../@bytecodealliance/preview2-shim/lib/browser/io.js"],
  ["@bytecodealliance/preview2-shim/random", "../../@bytecodealliance/preview2-shim/lib/browser/random.js"],
]);

const eryxProbeCache = new Map<string, Promise<ScriptSandboxProbeResult>>();

export interface EryxPythonSandboxAdapterOptions {
  packageRoot: string;
  id?: string;
  version?: string;
}

interface EryxRuntime {
  packageName: string;
  packageVersion: string;
  packageRoot: string;
  preview2ShimRoot: string;
  preview2ShimVersion: string;
  runtimeHash: string;
  jspiAvailable: boolean;
}

interface EryxRunOptions {
  code: string;
  timeoutMs: number;
  outputBytes: number;
  inputs?: Record<string, string>;
}

interface EryxRunResult {
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
  outputFiles: Array<{ path: string; bytes: number; sha256?: string }>;
  networkEvents: Array<{ kind?: string; operation?: string; decision?: string }>;
  errorName?: string;
  errorMessage?: string;
}

interface EryxChildProbeRequest {
  kind: "probe";
  packageRoot: string;
  config: ScriptTransformConfig;
}

interface EryxChildExecuteRequest {
  kind: "execute";
  packageRoot: string;
  request: ScriptSandboxExecutionRequest;
}

type EryxChildRequest = EryxChildProbeRequest | EryxChildExecuteRequest;

type EryxChildResponse =
  | { ok: true; result: ScriptSandboxProbeResult | ScriptSandboxExecutionResult }
  | { ok: false; message: string };

export async function discoverEryxPythonSandboxAdaptersFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<ScriptSandboxAdapter[]> {
  const candidate = await resolveScriptTransformAdapterRoot("python", env);
  if (!candidate) {
    return [];
  }
  try {
    return [await createEryxPythonSandboxAdapter({ packageRoot: candidate.packageRoot })];
  } catch (error) {
    return [unavailableEryxAdapter(`eryx-python adapter could not load from ${candidate.source === "env" ? candidate.envVar : "global adapter cache"}: ${errorMessage(error)}`)];
  }
}

export async function createEryxPythonSandboxAdapter(options: EryxPythonSandboxAdapterOptions): Promise<ScriptSandboxAdapter> {
  const runtime = await loadEryxRuntime(options.packageRoot);
  return {
    id: options.id ?? "eryx-python",
    version: options.version ?? runtime.packageVersion,
    languages: ["python"],
    async probe(language: string, config: ScriptTransformConfig): Promise<ScriptSandboxProbeResult> {
      if (language !== "python") {
        return {
          status: "unavailable",
          reason: `eryx-python supports python, not ${language}.`,
          passedProofs: [],
          failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
          runtime: runtimeInfo(runtime),
        };
      }
      return probeEryxRuntime(runtime, config);
    },
    async execute(request: ScriptSandboxExecutionRequest): Promise<ScriptSandboxExecutionResult> {
      if (request.language !== "python") {
        return {
          status: "policy_violation",
          stdout: "",
          stderr: "",
          outputFiles: [],
          exitCode: null,
          reason: `eryx-python supports python, not ${request.language}.`,
        };
      }
      if (request.network !== "off") {
        return {
          status: "policy_violation",
          stdout: "",
          stderr: "",
          outputFiles: [],
          exitCode: null,
          reason: "eryx-python adapter only supports network=off.",
        };
      }
      if (!runtime.jspiAvailable) {
        return executeEryxInJspiChild(runtime, request);
      }

      const inputs: Record<string, string> = {};
      for (const source of request.sources) {
        inputs[source.alias] = await readFile(source.path, "utf8");
      }
      const run = await runEryx(runtime, {
        code: pythonPrelude(inputs) + request.code,
        timeoutMs: request.limits.timeoutMs,
        outputBytes: request.limits.maxOutputBytes,
        inputs,
      });
      return eryxRunToExecutionResult(run);
    },
  };
}

function unavailableEryxAdapter(reason: string): ScriptSandboxAdapter {
  return {
    id: "eryx-python",
    version: "unavailable",
    languages: ["python"],
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

async function loadEryxRuntime(packageRoot: string): Promise<EryxRuntime> {
  const resolvedRoot = resolve(packageRoot);
  const packageJson = JSON.parse(await readFile(join(resolvedRoot, "package.json"), "utf8"));
  const preview2ShimRoot = resolve(resolvedRoot, "..", "..", "@bytecodealliance", "preview2-shim");
  const preview2ShimJson = JSON.parse(await readFile(join(preview2ShimRoot, "package.json"), "utf8"));
  const runtimeHash = await hashEryxRuntime(resolvedRoot, preview2ShimRoot);
  return {
    packageName: String(packageJson.name ?? "@bsull/eryx"),
    packageVersion: String(packageJson.version ?? "unknown"),
    packageRoot: resolvedRoot,
    preview2ShimRoot,
    preview2ShimVersion: String(preview2ShimJson.version ?? "unknown"),
    runtimeHash,
    jspiAvailable: nodeJspiAvailable(),
  };
}

async function hashEryxRuntime(packageRoot: string, preview2ShimRoot: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update("eryx-runtime-tree-v1\0");
  await hashRuntimeTree(hash, packageRoot, "eryx");
  await hashRuntimeTree(hash, preview2ShimRoot, "preview2-shim");
  return `sha256_${hash.digest("hex")}`;
}

async function hashRuntimeTree(hash: ReturnType<typeof createHash>, root: string, label: string, relativeDir = "."): Promise<void> {
  const dir = join(root, relativeDir);
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = relativeDir === "." ? entry.name : join(relativeDir, entry.name);
    const fullPath = join(root, relativePath);
    const stats = await lstat(fullPath);
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} runtime tree contains unsupported symlink: ${relativePath}`);
    }
    if (stats.isDirectory()) {
      hash.update(`${label}:dir:${relativePath}\0`);
      await hashRuntimeTree(hash, root, label, relativePath);
      continue;
    }
    if (!stats.isFile()) {
      throw new Error(`${label} runtime tree contains unsupported non-file entry: ${relativePath}`);
    }
    hash.update(`${label}:file:${relativePath}:${stats.size}\0`);
    hash.update(await readFile(fullPath));
  }
}

function nodeJspiAvailable(): boolean {
  const nodeOptions = process.env.NODE_OPTIONS ?? "";
  const flagPresent = process.execArgv.includes("--experimental-wasm-jspi") || nodeOptions.split(/\s+/).includes("--experimental-wasm-jspi");
  return flagPresent && typeof (WebAssembly as any).Suspending === "function";
}

function runtimeInfo(runtime: EryxRuntime) {
  return {
    name: runtime.packageName,
    version: `${runtime.packageVersion}+preview2-shim-${runtime.preview2ShimVersion}`,
  };
}

async function probeEryxRuntime(runtime: EryxRuntime, config: ScriptTransformConfig): Promise<ScriptSandboxProbeResult> {
  const timeoutMs = Math.min(config.limits.timeoutMs, DEFAULT_PROBE_TIMEOUT_MS);
  const outputBytes = Math.min(config.limits.maxOutputBytes, DEFAULT_PROBE_OUTPUT_BYTES);
  const currentRuntimeHash = await hashEryxRuntime(runtime.packageRoot, runtime.preview2ShimRoot);
  if (currentRuntimeHash !== runtime.runtimeHash) {
    return {
      status: "unavailable",
      reason: "eryx-python explicit package root changed after adapter creation; refusing to reuse stale proof cache.",
      passedProofs: [],
      failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
      runtime: runtimeInfo(runtime),
    };
  }
  const cacheKey = [runtime.packageVersion, runtime.preview2ShimVersion, currentRuntimeHash, runtime.jspiAvailable, timeoutMs, outputBytes, config.network].join(":");
  const cached = eryxProbeCache.get(cacheKey);
  if (cached) {
    return cloneProbeResult(await cached);
  }

  const probePromise = runEryxProbe(runtime, config, timeoutMs, outputBytes);
  eryxProbeCache.set(cacheKey, probePromise);
  try {
    return cloneProbeResult(await probePromise);
  } catch (error) {
    eryxProbeCache.delete(cacheKey);
    throw error;
  }
}

async function runEryxProbe(runtime: EryxRuntime, config: ScriptTransformConfig, timeoutMs: number, outputBytes: number): Promise<ScriptSandboxProbeResult> {
  if (config.network !== "off") {
    return {
      status: "unavailable",
      reason: "eryx-python adapter only supports network=off.",
      passedProofs: [],
      failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
      runtime: runtimeInfo(runtime),
    };
  }
  if (!runtime.jspiAvailable) {
    return probeEryxInJspiChild(runtime, config);
  }

  const previousSecret = process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL;
  process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL = SECRET_SENTINEL;
  try {
    const passedProofs: ScriptSandboxProof[] = [];
    const failedProofs: ScriptSandboxProof[] = [];
    const fixtures = scriptSandboxProofFixturesForLanguage("python");
    for (const fixture of fixtures) {
      const run = await runEryx(runtime, {
        code: fixture.program,
        timeoutMs,
        outputBytes,
      });
      const assessment = assessEryxProof(fixture.proof, run, timeoutMs, outputBytes);
      if (assessment) {
        passedProofs.push(fixture.proof);
      } else {
        failedProofs.push(fixture.proof);
      }
    }
    const allPassed = SCRIPT_SANDBOX_REQUIRED_PROOFS.every((proof) => passedProofs.includes(proof));
    return {
      status: allPassed ? "available" : "unavailable",
      reason: allPassed ? "eryx-python passed every required Python sandbox proof." : "eryx-python did not pass every required Python sandbox proof.",
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

async function probeEryxInJspiChild(runtime: EryxRuntime, config: ScriptTransformConfig): Promise<ScriptSandboxProbeResult> {
  try {
    const result = await runEryxChildRequest({
      kind: "probe",
      packageRoot: runtime.packageRoot,
      config,
    }, childTimeoutMsForProbe(config));
    if (isProbeResult(result)) {
      return {
        ...result,
        reason: result.status === "available"
          ? `${result.reason} via child Node --experimental-wasm-jspi.`
          : result.reason,
      };
    }
    return unavailableProbeResult("eryx-python child probe returned an execution result instead of a probe result.", runtime);
  } catch (error) {
    return unavailableProbeResult(`eryx-python child JSPI probe failed: ${errorMessage(error)}`, runtime);
  }
}

async function executeEryxInJspiChild(runtime: EryxRuntime, request: ScriptSandboxExecutionRequest): Promise<ScriptSandboxExecutionResult> {
  try {
    const result = await runEryxChildRequest({
      kind: "execute",
      packageRoot: runtime.packageRoot,
      request,
    }, childTimeoutMsForExecution(request));
    if (isExecutionResult(result)) {
      return result;
    }
    return {
      status: "failed",
      stdout: "",
      stderr: "eryx-python child execution returned a probe result instead of an execution result.",
      outputFiles: [],
      exitCode: null,
      reason: "Invalid child execution response.",
    };
  } catch (error) {
    const message = errorMessage(error);
    return {
      status: "failed",
      stdout: "",
      stderr: message,
      outputFiles: [],
      exitCode: null,
      reason: `eryx-python child JSPI execution failed: ${message}`,
    };
  }
}

async function runEryxChildRequest(request: EryxChildRequest, timeoutMs: number): Promise<ScriptSandboxProbeResult | ScriptSandboxExecutionResult> {
  const root = await mkdtemp(join(tmpdir(), "freeflow-eryx-child-"));
  const requestPath = join(root, "request.json");
  const responsePath = join(root, "response.json");
  try {
    await writeFile(requestPath, JSON.stringify(request), "utf8");
    await runEryxChildProcess(requestPath, responsePath, timeoutMs);
    const response = JSON.parse(await readFile(responsePath, "utf8")) as EryxChildResponse;
    if (!response.ok) {
      throw new Error(response.message);
    }
    return response.result;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runEryxChildProcess(requestPath: string, responsePath: string, timeoutMs: number): Promise<void> {
  const nodeBinary = await resolveEryxChildNodeBinary();
  const child = spawn(nodeBinary, ["--experimental-wasm-jspi", fileURLToPath(import.meta.url), ERYX_CHILD_MODE_ARG, requestPath, responsePath], {
    stdio: ["ignore", "ignore", "pipe"],
    env: process.env,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`eryx-python child process timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`eryx-python child process ${nodeBinary} exited with code ${code}. ${stderr.trim()}`));
      }
    });
  });
}

async function resolveEryxChildNodeBinary(): Promise<string> {
  const configured = defaultScriptTransformNodeBinary();
  if (await fileExists(configured)) {
    return configured;
  }
  return process.execPath;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function childTimeoutMsForProbe(config: ScriptTransformConfig): number {
  return Math.max(ERYX_CHILD_TIMEOUT_FLOOR_MS, Math.min(config.limits.timeoutMs, DEFAULT_PROBE_TIMEOUT_MS) * SCRIPT_SANDBOX_REQUIRED_PROOFS.length * 8);
}

function childTimeoutMsForExecution(request: ScriptSandboxExecutionRequest): number {
  return Math.max(ERYX_CHILD_TIMEOUT_FLOOR_MS, request.limits.timeoutMs + 5_000);
}

function unavailableProbeResult(reason: string, runtime: EryxRuntime): ScriptSandboxProbeResult {
  return {
    status: "unavailable",
    reason,
    passedProofs: [],
    failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
    runtime: runtimeInfo(runtime),
  };
}

function isProbeResult(value: ScriptSandboxProbeResult | ScriptSandboxExecutionResult): value is ScriptSandboxProbeResult {
  return Array.isArray((value as ScriptSandboxProbeResult).passedProofs) && Array.isArray((value as ScriptSandboxProbeResult).failedProofs);
}

function isExecutionResult(value: ScriptSandboxProbeResult | ScriptSandboxExecutionResult): value is ScriptSandboxExecutionResult {
  return Array.isArray((value as ScriptSandboxExecutionResult).outputFiles);
}

async function runEryx(runtime: EryxRuntime, options: EryxRunOptions): Promise<EryxRunResult> {
  const start = Date.now();
  const patched = await createPatchedPackageTree(runtime);
  try {
    const eryxEntryUrl = pathToFileURL(join(patched.eryxRoot, "index.js")).href;
    return await runEryxWorker({ eryxEntryUrl, code: options.code, timeoutMs: options.timeoutMs, outputBytes: options.outputBytes, startedAt: start });
  } finally {
    await rm(patched.root, { recursive: true, force: true });
  }
}

async function createPatchedPackageTree(runtime: EryxRuntime): Promise<{ root: string; eryxRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "freeflow-eryx-adapter-"));
  const eryxRoot = join(root, "node_modules", "@bsull", "eryx");
  const preview2ShimRoot = join(root, "node_modules", "@bytecodealliance", "preview2-shim");
  try {
    await mkdir(dirname(eryxRoot), { recursive: true });
    await mkdir(dirname(preview2ShimRoot), { recursive: true });
    await cp(runtime.packageRoot, eryxRoot, { recursive: true, dereference: false });
    await cp(runtime.preview2ShimRoot, preview2ShimRoot, { recursive: true, dereference: false });

    const copiedRuntimeHash = await hashEryxRuntime(eryxRoot, preview2ShimRoot);
    if (copiedRuntimeHash !== runtime.runtimeHash) {
      throw new Error("eryx-python explicit package root changed while preparing sandbox copy; refusing to execute unproven runtime files.");
    }

    for (const file of [join(eryxRoot, "index.js"), join(eryxRoot, "eryx-sandbox.js")]) {
      let text = await readFile(file, "utf8");
      for (const [from, to] of PREVIEW2_IMPORTS) {
        text = text.split(from).join(to);
      }
      await writeFile(file, text, "utf8");
    }
    await writeInstrumentedNetworkDenyShim(eryxRoot);
    return { root, eryxRoot };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function writeInstrumentedNetworkDenyShim(eryxRoot: string): Promise<void> {
  await writeFile(join(eryxRoot, "shims", "net.js"), `
const recordNetworkDeny = (kind, operation) => {
  globalThis.__freeflowEryxNetworkEvents ??= [];
  globalThis.__freeflowEryxNetworkEvents.push({ kind, operation, decision: "not-permitted" });
};

const notPermitted = { tag: "not-permitted", val: "networking is not available in the Freeflow Eryx adapter" };

export const tcp = {
  connect(_host, _port) {
    recordNetworkDeny("tcp", "connect");
    return { tag: "err", val: notPermitted };
  },
  read(_handle, _len) {
    recordNetworkDeny("tcp", "read");
    return { tag: "err", val: { tag: "invalid-handle" } };
  },
  write(_handle, _data) {
    recordNetworkDeny("tcp", "write");
    return { tag: "err", val: { tag: "invalid-handle" } };
  },
  close(_handle) {
    recordNetworkDeny("tcp", "close");
  },
};

export const tls = {
  upgrade(_tcp, _hostname) {
    recordNetworkDeny("tls", "upgrade");
    return { tag: "err", val: { tag: "tcp", val: notPermitted } };
  },
  read(_handle, _len) {
    recordNetworkDeny("tls", "read");
    return { tag: "err", val: { tag: "invalid-handle" } };
  },
  write(_handle, _data) {
    recordNetworkDeny("tls", "write");
    return { tag: "err", val: { tag: "invalid-handle" } };
  },
  close(_handle) {
    recordNetworkDeny("tls", "close");
  },
};
`, "utf8");
}

async function runEryxWorker(options: { eryxEntryUrl: string; code: string; timeoutMs: number; outputBytes: number; startedAt: number }): Promise<EryxRunResult> {
  const workerSource = `
    import { parentPort, workerData } from 'node:worker_threads';

    let stdout = '';
    let stderr = '';
    let rawStdoutBytes = 0;
    let rawStderrBytes = 0;
    let truncated = false;

    const byteLength = (value) => Buffer.byteLength(String(value ?? ''), 'utf8');
    const stdoutCap = Math.max(1, Math.floor(workerData.outputBytes / 2));
    const stderrCap = Math.max(1, workerData.outputBytes - stdoutCap);
    const append = (stream, value) => {
      const text = String(value ?? '');
      const bytes = byteLength(text);
      const cap = stream === 'stderr' ? stderrCap : stdoutCap;
      const currentBytes = stream === 'stderr' ? byteLength(stderr) : byteLength(stdout);
      if (stream === 'stderr') rawStderrBytes += bytes;
      else rawStdoutBytes += bytes;
      const remaining = cap - currentBytes;
      if (remaining <= 0) {
        truncated = truncated || bytes > 0;
        return;
      }
      const buffer = Buffer.from(text, 'utf8');
      const nextText = buffer.byteLength > remaining ? buffer.subarray(0, remaining).toString('utf8') : text;
      if (buffer.byteLength > remaining) truncated = true;
      if (stream === 'stderr') stderr += nextText;
      else stdout += nextText;
    };
    const formatArgs = (args) => args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
    globalThis.console = {
      log: (...args) => append('stdout', formatArgs(args) + '\\n'),
      info: (...args) => append('stdout', formatArgs(args) + '\\n'),
      warn: (...args) => append('stderr', formatArgs(args) + '\\n'),
      error: (...args) => append('stderr', formatArgs(args) + '\\n'),
      debug: (...args) => append('stderr', formatArgs(args) + '\\n'),
    };

    const finish = (result) => {
      parentPort.postMessage({
        ...result,
        stdout,
        stderr,
        outputFiles: [],
        networkEvents: Array.isArray(globalThis.__freeflowEryxNetworkEvents) ? globalThis.__freeflowEryxNetworkEvents.slice(0, 20) : [],
        rawStdoutBytes,
        rawStderrBytes,
        stdoutBytes: byteLength(stdout),
        stderrBytes: byteLength(stderr),
        outputBytes: byteLength(stdout) + byteLength(stderr),
        truncated,
      });
    };

    try {
      const mod = await import(workerData.eryxEntryUrl);
      const sandbox = new mod.Sandbox();
      const result = await sandbox.execute(workerData.code);
      append('stdout', result?.stdout ?? '');
      append('stderr', result?.stderr ?? '');
      finish({ status: 'success', exitCode: 0, result: result?.result ?? null, resultError: result?.resultError ?? null });
    } catch (error) {
      const message = String(error?.message ?? error);
      append('stderr', message);
      finish({ status: 'error', errorName: error?.name ?? 'Error', errorMessage: message, exitCode: 1 });
    }
  `;

  const worker = new Worker(workerSource, {
    eval: true,
    type: "module",
    workerData: { eryxEntryUrl: options.eryxEntryUrl, code: options.code, outputBytes: options.outputBytes },
    stdout: true,
    stderr: true,
    resourceLimits: {
      maxOldGenerationSizeMb: DEFAULT_WORKER_OLD_GENERATION_MB,
      maxYoungGenerationSizeMb: DEFAULT_WORKER_YOUNG_GENERATION_MB,
    },
  } as any);

  let externalStdout = "";
  let externalStderr = "";
  let externalRawStdoutBytes = 0;
  let externalRawStderrBytes = 0;
  let externalTruncated = false;
  const appendExternal = (stream: "stdout" | "stderr", chunk: unknown) => {
    const text = String(chunk ?? "");
    const bytes = Buffer.byteLength(text, "utf8");
    if (stream === "stderr") externalRawStderrBytes += bytes;
    else externalRawStdoutBytes += bytes;
    const currentBytes = Buffer.byteLength(externalStdout, "utf8") + Buffer.byteLength(externalStderr, "utf8");
    const remaining = options.outputBytes - currentBytes;
    if (remaining <= 0) {
      externalTruncated = externalTruncated || bytes > 0;
      return;
    }
    const buffer = Buffer.from(text, "utf8");
    const nextText = buffer.byteLength > remaining ? buffer.subarray(0, remaining).toString("utf8") : text;
    if (buffer.byteLength > remaining) externalTruncated = true;
    if (stream === "stderr") externalStderr += nextText;
    else externalStdout += nextText;
  };
  worker.stdout?.on("data", (chunk) => appendExternal("stdout", chunk));
  worker.stderr?.on("data", (chunk) => appendExternal("stderr", chunk));

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Partial<EryxRunResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const merged = mergeWorkerResult(result, {
        externalStdout,
        externalStderr,
        externalRawStdoutBytes,
        externalRawStderrBytes,
        externalTruncated,
        outputBytes: options.outputBytes,
      });
      resolve({ ...merged, durationMs: Date.now() - options.startedAt });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      finish({ status: "timed_out", stdout: "", stderr: "", exitCode: null, rawStdoutBytes: 0, rawStderrBytes: 0, stdoutBytes: 0, stderrBytes: 0, outputBytes: 0, truncated: false, outputFiles: [], networkEvents: [] });
      void worker.terminate();
    }, options.timeoutMs);
    worker.on("message", (message) => finish(message as Partial<EryxRunResult>));
    worker.on("error", (error) => {
      const message = errorMessage(error);
      finish({ status: "error", stdout: "", stderr: message, exitCode: null, rawStdoutBytes: 0, rawStderrBytes: Buffer.byteLength(message, "utf8"), truncated: false, outputFiles: [], networkEvents: [], errorName: error.name, errorMessage: message });
    });
    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        finish({ status: "error", stdout: "", stderr: `worker exited with code ${code}`, exitCode: code, rawStdoutBytes: 0, rawStderrBytes: 0, truncated: false, outputFiles: [], networkEvents: [] });
      }
    });
  });
}

function mergeWorkerResult(result: Partial<EryxRunResult>, external: {
  externalStdout: string;
  externalStderr: string;
  externalRawStdoutBytes: number;
  externalRawStderrBytes: number;
  externalTruncated: boolean;
  outputBytes: number;
}): EryxRunResult {
  let stdout = "";
  let stderr = "";
  let truncated = Boolean(result.truncated || external.externalTruncated);
  const append = (stream: "stdout" | "stderr", value: string) => {
    const currentBytes = Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8");
    const remaining = external.outputBytes - currentBytes;
    if (remaining <= 0) {
      truncated = truncated || Buffer.byteLength(value, "utf8") > 0;
      return;
    }
    const buffer = Buffer.from(value, "utf8");
    const nextText = buffer.byteLength > remaining ? buffer.subarray(0, remaining).toString("utf8") : value;
    if (buffer.byteLength > remaining) truncated = true;
    if (stream === "stderr") stderr += nextText;
    else stdout += nextText;
  };
  append("stdout", external.externalStdout);
  append("stderr", external.externalStderr);
  append("stdout", result.stdout ?? "");
  append("stderr", result.stderr ?? "");
  const rawStdoutBytes = (result.rawStdoutBytes ?? 0) + external.externalRawStdoutBytes;
  const rawStderrBytes = (result.rawStderrBytes ?? 0) + external.externalRawStderrBytes;
  const merged: EryxRunResult = {
    status: result.status ?? "error",
    stdout,
    stderr,
    rawStdoutBytes,
    rawStderrBytes,
    stdoutBytes: Buffer.byteLength(stdout, "utf8"),
    stderrBytes: Buffer.byteLength(stderr, "utf8"),
    outputBytes: Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8"),
    truncated,
    exitCode: result.exitCode ?? null,
    durationMs: result.durationMs ?? 0,
    outputFiles: result.outputFiles ?? [],
    networkEvents: result.networkEvents ?? [],
  };
  if (result.errorName !== undefined) {
    merged.errorName = result.errorName;
  }
  if (result.errorMessage !== undefined) {
    merged.errorMessage = result.errorMessage;
  }
  return merged;
}

function eryxRunToExecutionResult(run: EryxRunResult): ScriptSandboxExecutionResult {
  if (run.status === "timed_out") {
    return {
      status: "timed_out",
      stdout: run.stdout,
      stderr: run.stderr,
      outputFiles: [],
      exitCode: null,
      durationMs: run.durationMs,
      reason: "Eryx Python execution exceeded timeoutMs.",
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
      reason: "Eryx Python execution exceeded maxOutputBytes.",
    };
  }
  if (run.status === "error") {
    return {
      status: "failed",
      stdout: run.stdout,
      stderr: run.stderr || run.errorMessage || "Eryx Python execution failed.",
      outputFiles: [],
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      reason: "Eryx Python execution failed.",
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
}

function assessEryxProof(proof: ScriptSandboxProof, run: EryxRunResult, timeoutMs: number, outputBytes: number): boolean {
  const combined = `${run.stdout ?? ""}\n${run.stderr ?? ""}\n${run.errorMessage ?? ""}`;
  switch (proof) {
    case "env_access_denied":
      return !combined.includes(SECRET_SENTINEL) && !combined.includes(HOST_HOME) && !combined.includes("process.env") && !/AWS_|GITHUB_|TOKEN|SECRET/i.test(combined);
    case "home_access_denied":
      return !combined.includes(HOST_HOME) && !/PRIVATE KEY|FREEFLOW_SANDBOX_SECRET/.test(combined);
    case "repo_access_denied":
      return !combined.includes("@hassangameryt/freeflow") && !combined.includes("@earendil-works/freeflow") && !combined.includes('"scripts"');
    case "vault_access_denied":
      return !combined.includes("ffout_") && !combined.includes("ffrec_");
    case "network_access_denied":
      return run.status !== "success" && networkDeniedByShim(run) && !combined.includes("Example Domain");
    case "input_read_only":
      return run.status !== "success" && !combined.includes("mutated");
    case "output_escape_denied":
      return !combined.includes("/etc/passwd") && run.outputFiles.length === 0;
    case "stdout_stderr_bounded":
      return run.status !== "error" && run.truncated && run.outputBytes <= outputBytes && run.rawStdoutBytes > outputBytes && run.rawStderrBytes > outputBytes;
    case "timeout_enforced":
      return run.status === "timed_out" && run.durationMs < timeoutMs * 5;
    default:
      return false;
  }
}

function networkDeniedByShim(run: EryxRunResult): boolean {
  return run.networkEvents.some((event) => event?.decision === "not-permitted" && (event?.kind === "tcp" || event?.kind === "tls"));
}

function pythonPrelude(inputs: Record<string, string>): string {
  const encodedInputs = JSON.stringify(inputs).replaceAll("</", "<\\/");
  return [
    "# Freeflow injected input/output helpers.",
    "import json as __freeflow_json",
    `__freeflow_sources = __freeflow_json.loads(${JSON.stringify(encodedInputs)})`,
    "sources = dict(__freeflow_sources)",
    "def read_text(alias):",
    "    return __freeflow_sources[alias]",
    "def write_text(text):",
    "    print(str(text), end='')",
    "",
  ].join("\n");
}

function cloneProbeResult(result: ScriptSandboxProbeResult): ScriptSandboxProbeResult {
  const cloned: ScriptSandboxProbeResult = {
    ...result,
    passedProofs: [...result.passedProofs],
    failedProofs: [...result.failedProofs],
  };
  if (result.runtime !== undefined) {
    cloned.runtime = { ...result.runtime };
  }
  return cloned;
}

async function runEryxChildCli(argv: readonly string[]): Promise<void> {
  const requestPath = argv[0];
  const responsePath = argv[1];
  if (!requestPath || !responsePath) {
    throw new Error("eryx-python child mode requires request and response paths.");
  }
  const payload = JSON.parse(await readFile(requestPath, "utf8")) as EryxChildRequest;
  let response: EryxChildResponse;
  try {
    const adapter = await createEryxPythonSandboxAdapter({ packageRoot: payload.packageRoot });
    if (payload.kind === "probe") {
      response = { ok: true, result: await adapter.probe("python", payload.config) };
    } else {
      response = { ok: true, result: await adapter.execute(payload.request) };
    }
  } catch (error) {
    response = { ok: false, message: errorMessage(error) };
  }
  await writeFile(responsePath, JSON.stringify(response), "utf8");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[2] === ERYX_CHILD_MODE_ARG) {
  runEryxChildCli(process.argv.slice(3)).catch((error) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}

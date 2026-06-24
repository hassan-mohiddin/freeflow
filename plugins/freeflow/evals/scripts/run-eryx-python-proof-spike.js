#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { SCRIPT_SANDBOX_REQUIRED_PROOFS, scriptSandboxProofFixturesForLanguage } from "../../router/dist/index.js";

const DEFAULT_REPORT_PATH = "plugins/freeflow/evals/reports/runtime/eryx-python-proof-spike-2-report.md";
const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_OUTPUT_BYTES = 4096;
const SECRET_SENTINEL = "FREEFLOW_SANDBOX_SECRET_SENTINEL_VALUE";
const HOST_HOME = process.env.HOME ?? "__no_home__";

const PREVIEW2_IMPORTS = new Map([
  ["@bytecodealliance/preview2-shim/cli", "../../@bytecodealliance/preview2-shim/lib/browser/cli.js"],
  ["@bytecodealliance/preview2-shim/clocks", "../../@bytecodealliance/preview2-shim/lib/browser/clocks.js"],
  ["@bytecodealliance/preview2-shim/filesystem", "../../@bytecodealliance/preview2-shim/lib/browser/filesystem.js"],
  ["@bytecodealliance/preview2-shim/io", "../../@bytecodealliance/preview2-shim/lib/browser/io.js"],
  ["@bytecodealliance/preview2-shim/random", "../../@bytecodealliance/preview2-shim/lib/browser/random.js"],
]);

async function main() {
  process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL = SECRET_SENTINEL;
  const args = parseArgs(process.argv.slice(2));
  const root = args.eryxRoot ?? process.env.ERYX_ROOT;
  if (!root) {
    throw new Error("Missing --eryx-root or ERYX_ROOT. Install @bsull/eryx in a temp directory and pass its package root.");
  }
  if (!process.execArgv.includes("--experimental-wasm-jspi")) {
    throw new Error("Eryx requires Node to be started with --experimental-wasm-jspi; Worker execArgv cannot add it later.");
  }

  const reportPath = args.report ?? DEFAULT_REPORT_PATH;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outputBytes = args.outputBytes ?? DEFAULT_OUTPUT_BYTES;
  const packageRoot = resolve(root);
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const preview2ShimRoot = resolve(packageRoot, "..", "..", "@bytecodealliance", "preview2-shim");
  const preview2ShimJson = JSON.parse(await readFile(join(preview2ShimRoot, "package.json"), "utf8"));
  const packageFiles = await collectPackageFiles(packageRoot);
  const wasmFiles = await hashPackageWasmFiles(packageRoot, packageFiles);

  const patched = await createPatchedPackageTree({ packageRoot, preview2ShimRoot });
  const eryxEntryUrl = pathToFileURL(join(patched.eryxRoot, packageJson.main ?? "index.js")).href;

  const importProbe = await runEryxWorker({
    eryxEntryUrl,
    mode: "import",
    code: "",
    timeoutMs,
    outputBytes,
  });
  const positive = await runEryxWorker({
    eryxEntryUrl,
    mode: "execute",
    code: "print('INFO setup')\nprint('ERROR target')",
    timeoutMs,
    outputBytes,
  });

  const fixtures = scriptSandboxProofFixturesForLanguage("python");
  const results = [];
  for (const fixture of fixtures) {
    const run = await runEryxWorker({ eryxEntryUrl, mode: "execute", code: fixture.program, timeoutMs, outputBytes });
    results.push({ fixture, run, pass: assessProof(fixture.proof, run, { timeoutMs, outputBytes }) });
  }

  const failed = results.filter((result) => !result.pass.ok);
  const report = renderReport({
    packageJson,
    preview2ShimJson,
    packageRoot,
    preview2ShimRoot,
    patchedRoot: patched.root,
    packageFiles,
    wasmFiles,
    timeoutMs,
    outputBytes,
    importProbe,
    positive,
    results,
    failed,
  });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");
  console.log(`Wrote ${reportPath}`);
  console.log(`eryx python proof fixtures: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    for (const result of failed) {
      console.log(`FAIL ${result.fixture.proof}: ${result.pass.reason}`);
    }
    process.exitCode = 1;
  }
}

async function createPatchedPackageTree({ packageRoot, preview2ShimRoot }) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-eryx-proof-"));
  const eryxRoot = join(root, "node_modules", "@bsull", "eryx");
  const patchedPreview2ShimRoot = join(root, "node_modules", "@bytecodealliance", "preview2-shim");
  await mkdir(dirname(eryxRoot), { recursive: true });
  await mkdir(dirname(patchedPreview2ShimRoot), { recursive: true });
  await cp(packageRoot, eryxRoot, { recursive: true, dereference: false });
  await cp(preview2ShimRoot, patchedPreview2ShimRoot, { recursive: true, dereference: false });

  for (const file of [join(eryxRoot, "index.js"), join(eryxRoot, "eryx-sandbox.js")]) {
    let text = await readFile(file, "utf8");
    for (const [from, to] of PREVIEW2_IMPORTS) {
      text = text.split(from).join(to);
    }
    await writeFile(file, text, "utf8");
  }
  await writeInstrumentedNetworkDenyShim(eryxRoot);

  return { root, eryxRoot, preview2ShimRoot: patchedPreview2ShimRoot };
}

async function writeInstrumentedNetworkDenyShim(eryxRoot) {
  await writeFile(join(eryxRoot, "shims", "net.js"), `
const recordNetworkDeny = (kind, operation) => {
  globalThis.__freeflowEryxNetworkEvents ??= [];
  globalThis.__freeflowEryxNetworkEvents.push({ kind, operation, decision: "not-permitted" });
};

const notPermitted = { tag: "not-permitted", val: "networking is not available in the Freeflow Eryx proof wrapper" };

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

async function collectPackageFiles(packageRoot) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const info = await stat(full);
        files.push({ path: full.slice(packageRoot.length + 1), bytes: info.size });
      }
    }
  }
  await walk(packageRoot);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function hashPackageWasmFiles(packageRoot, packageFiles) {
  const wasmFiles = [];
  for (const file of packageFiles.filter((entry) => entry.path.endsWith(".wasm"))) {
    const bytes = await readFile(join(packageRoot, file.path));
    wasmFiles.push({ ...file, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return wasmFiles;
}

async function runEryxWorker({ eryxEntryUrl, mode, code, timeoutMs, outputBytes }) {
  const start = Date.now();
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
      if (workerData.mode === 'import') {
        finish({ status: 'success', exports: Object.keys(mod).sort(), exitCode: 0 });
      } else {
        const sandbox = new mod.Sandbox();
        const result = await sandbox.execute(workerData.code);
        append('stdout', result?.stdout ?? '');
        append('stderr', result?.stderr ?? '');
        finish({ status: 'success', exitCode: 0, result: result?.result ?? null, resultError: result?.resultError ?? null });
      }
    } catch (error) {
      const message = String(error?.message ?? error);
      append('stderr', message);
      finish({ status: 'error', errorName: error?.name ?? 'Error', errorMessage: message, exitCode: 1 });
    }
  `;

  const worker = new Worker(workerSource, {
    eval: true,
    type: "module",
    workerData: { eryxEntryUrl, mode, code, outputBytes },
    stdout: true,
    stderr: true,
    resourceLimits: {
      maxOldGenerationSizeMb: 256,
      maxYoungGenerationSizeMb: 32,
    },
  });

  let externalStdout = "";
  let externalStderr = "";
  let externalRawStdoutBytes = 0;
  let externalRawStderrBytes = 0;
  let externalTruncated = false;
  const appendExternal = (stream, chunk) => {
    const text = String(chunk ?? "");
    const bytes = Buffer.byteLength(text, "utf8");
    if (stream === "stderr") externalRawStderrBytes += bytes;
    else externalRawStdoutBytes += bytes;
    const currentBytes = Buffer.byteLength(externalStdout, "utf8") + Buffer.byteLength(externalStderr, "utf8");
    const remaining = outputBytes - currentBytes;
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
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const merged = mergeWorkerResult(result, {
        externalStdout,
        externalStderr,
        externalRawStdoutBytes,
        externalRawStderrBytes,
        externalTruncated,
        outputBytes,
      });
      resolve({ ...merged, durationMs: Date.now() - start });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      finish({ status: "timed_out", stdout: "", stderr: "", exitCode: null, rawStdoutBytes: 0, rawStderrBytes: 0, stdoutBytes: 0, stderrBytes: 0, outputBytes: 0, truncated: false });
      void worker.terminate();
    }, timeoutMs);
    worker.on("message", (message) => finish(message));
    worker.on("error", (error) => {
      const message = String(error?.message ?? error);
      finish({ status: "error", stdout: "", stderr: message, exitCode: null, rawStdoutBytes: 0, rawStderrBytes: Buffer.byteLength(message, "utf8"), truncated: false });
    });
    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        finish({ status: "error", stdout: "", stderr: `worker exited with code ${code}`, exitCode: code, rawStdoutBytes: 0, rawStderrBytes: 0, truncated: false });
      }
    });
  });
}

function mergeWorkerResult(result, external) {
  let stdout = "";
  let stderr = "";
  let truncated = Boolean(result.truncated || external.externalTruncated);
  const append = (stream, value) => {
    const text = String(value ?? "");
    const currentBytes = Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8");
    const remaining = external.outputBytes - currentBytes;
    if (remaining <= 0) {
      truncated = truncated || Buffer.byteLength(text, "utf8") > 0;
      return;
    }
    const buffer = Buffer.from(text, "utf8");
    const nextText = buffer.byteLength > remaining ? buffer.subarray(0, remaining).toString("utf8") : text;
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
  return {
    ...result,
    stdout,
    stderr,
    outputFiles: result.outputFiles ?? [],
    networkEvents: Array.isArray(result.networkEvents) ? result.networkEvents : [],
    rawStdoutBytes,
    rawStderrBytes,
    stdoutBytes: Buffer.byteLength(stdout, "utf8"),
    stderrBytes: Buffer.byteLength(stderr, "utf8"),
    outputBytes: Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8"),
    truncated,
  };
}

function assessProof(proof, run, limits) {
  const combined = `${run.stdout ?? ""}\n${run.stderr ?? ""}\n${run.errorMessage ?? ""}`;
  switch (proof) {
    case "env_access_denied":
      return passIf(
        !combined.includes(SECRET_SENTINEL) && !combined.includes(HOST_HOME) && !combined.includes("process.env") && !combined.match(/AWS_|GITHUB_|TOKEN|SECRET/i),
        "ambient host environment and secret sentinel were not exposed",
      );
    case "home_access_denied":
      return passIf(!combined.includes(HOST_HOME) && !combined.match(/PRIVATE KEY|FREEFLOW_SANDBOX_SECRET/), "home directory was unavailable and home/secret file contents were not exposed");
    case "repo_access_denied":
      return passIf(!combined.includes("@hassangameryt/freeflow") && !combined.includes("@earendil-works/freeflow") && !combined.includes('"scripts"'), "repo file contents were not exposed");
    case "vault_access_denied":
      return passIf(!combined.includes("ffout_") && !combined.includes("ffrec_"), "vault records were not exposed");
    case "network_access_denied": {
      const deniedByShim = Array.isArray(run.networkEvents) && run.networkEvents.some((event) => event?.decision === "not-permitted" && (event?.kind === "tcp" || event?.kind === "tls"));
      return passIf(run.status !== "success" && deniedByShim && !combined.includes("Example Domain"), "outbound network attempt reached the instrumented Eryx shim and was denied as not-permitted");
    }
    case "input_read_only":
      return passIf(run.status !== "success" && !combined.includes("mutated"), "input mutation was not possible through filesystem paths");
    case "output_escape_denied":
      return passIf(!combined.includes("/etc/passwd") && Array.isArray(run.outputFiles) && run.outputFiles.length === 0, "output symlink attempt stayed inside ignored in-memory filesystem and no output files were collected");
    case "stdout_stderr_bounded":
      return passIf(
        run.status !== "error" && run.truncated && run.outputBytes <= limits.outputBytes && run.rawStdoutBytes > limits.outputBytes && run.rawStderrBytes > limits.outputBytes,
        "stdout/stderr flood was capped before crossing from Worker to parent",
      );
    case "timeout_enforced":
      return passIf(run.status === "timed_out" && run.durationMs < limits.timeoutMs * 5, "infinite loop was stopped by Worker termination");
    default:
      return { ok: false, reason: `No assessment rule for proof ${proof}` };
  }
}

function passIf(condition, reason) {
  return condition ? { ok: true, reason } : { ok: false, reason: `Failed: ${reason}` };
}

function renderReport(data) {
  const lines = [];
  lines.push("# Eryx Python Sandbox Proof Spike 2 Report");
  lines.push("");
  lines.push(`> **Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push("> **Status:** " + (data.failed.length === 0 ? "Passed temp-patched proof spike for Python candidate" : "Failed temp-patched proof spike for Python candidate"));
  lines.push("> **Scope:** Proof-only evaluation. No Freeflow script execution path is enabled.");
  lines.push("");
  lines.push("## Candidate");
  lines.push("");
  lines.push(`- Package: \`${data.packageJson.name}@${data.packageJson.version}\``);
  lines.push(`- License: ${data.packageJson.license ?? "unknown"}`);
  lines.push(`- Package root: \`${data.packageRoot}\``);
  lines.push(`- Preview2 shim: \`${data.preview2ShimJson.name}@${data.preview2ShimJson.version}\``);
  lines.push(`- Preview2 shim root: \`${data.preview2ShimRoot}\``);
  lines.push(`- Patched temp copy: \`${data.patchedRoot}\``);
  lines.push(`- WASM shards: ${data.wasmFiles.length}`);
  lines.push(`- WASM total bytes: ${data.wasmFiles.reduce((sum, file) => sum + file.bytes, 0)}`);
  lines.push(`- Timeout: ${data.timeoutMs}ms via Worker termination`);
  lines.push(`- Output cap: ${data.outputBytes} bytes across stdout + stderr before Worker result crosses to parent`);
  lines.push("- Worker resource limits: `maxOldGenerationSizeMb=256`, `maxYoungGenerationSizeMb=32`");
  lines.push("- Node requirement: parent process started with `--experimental-wasm-jspi`");
  lines.push("");
  lines.push("## Package Files");
  lines.push("");
  for (const file of data.packageFiles) {
    lines.push(`- \`${file.path}\` — ${file.bytes} bytes`);
  }
  lines.push("");
  lines.push("## WASM Shard Hashes");
  lines.push("");
  for (const file of data.wasmFiles) {
    lines.push(`- \`${file.path}\` — ${file.bytes} bytes — \`${file.sha256}\``);
  }
  lines.push("");
  lines.push("## Import Patch");
  lines.push("");
  lines.push("The runner copies `@bsull/eryx` and `@bytecodealliance/preview2-shim` into a temp `node_modules` tree, then rewrites Eryx's generated preview2-shim imports from bare package subpaths to explicit browser/in-memory shim files:");
  lines.push("");
  for (const [from, to] of PREVIEW2_IMPORTS) {
    lines.push(`- \`${from}\` → \`${to}\``);
  }
  lines.push("");
  lines.push("This avoids Node resolving `@bytecodealliance/preview2-shim/filesystem` to the host-filesystem-oriented Node shim that lacks `_setFileData`.");
  lines.push("");
  lines.push("The runner also replaces the temp-copied Eryx `shims/net.js` with an equivalent deny-only shim that records TCP/TLS attempts and returns `not-permitted`. This makes the network proof check the wrapper denial event instead of accepting any generic socket failure.");
  lines.push("");
  lines.push("## Import Probe");
  lines.push("");
  lines.push(`- Status: ${data.importProbe.status}`);
  lines.push(`- Exports: ${Array.isArray(data.importProbe.exports) ? data.importProbe.exports.map((name) => `\`${name}\``).join(", ") : "unavailable"}`);
  lines.push(`- Error: ${data.importProbe.errorMessage ? `\`${escapeInline(data.importProbe.errorMessage)}\`` : "none"}`);
  lines.push("");
  lines.push("## Positive API Probe");
  lines.push("");
  lines.push(`- Status: ${data.positive.status}`);
  lines.push(`- Output: \`${escapeInline(data.positive.stdout)}\``);
  lines.push(`- Error: ${data.positive.stderr ? `\`${escapeInline(data.positive.stderr)}\`` : "none"}`);
  lines.push("");
  lines.push("## Required Proof Results");
  lines.push("");
  lines.push("| Proof | Result | Evidence |");
  lines.push("| --- | --- | --- |");
  for (const result of data.results) {
    const evidence = [
      result.pass.reason,
      `status=${result.run.status}`,
      `exitCode=${result.run.exitCode}`,
      `durationMs=${result.run.durationMs}`,
      `outputBytes=${result.run.outputBytes}`,
      `stdoutBytes=${result.run.stdoutBytes}`,
      `stderrBytes=${result.run.stderrBytes}`,
      `rawStdoutBytes=${result.run.rawStdoutBytes}`,
      `rawStderrBytes=${result.run.rawStderrBytes}`,
      `truncated=${result.run.truncated}`,
      `outputFiles=${Array.isArray(result.run.outputFiles) ? result.run.outputFiles.length : "unknown"}`,
      `networkEvents=${formatNetworkEvents(result.run.networkEvents)}`,
      result.run.errorMessage ? `error=${result.run.errorMessage}` : "error=none",
    ].join("; ");
    lines.push(`| ${result.fixture.proof} | ${result.pass.ok ? "pass" : "fail"} | ${escapeTable(evidence)} |`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This proof runner uses a temporary installed `@bsull/eryx` package root passed explicitly by the caller.");
  lines.push("- It does not add repo dependencies and does not wire Python into `freeflow_derive` execution.");
  lines.push("- It performs a temp-copy import rewrite and deny-only network-shim replacement. A product adapter would need an explicit package-root wrapper and focused security review before enabling this path.");
  lines.push("- Timeout proof uses Node Worker termination because Eryx's high-level JS API does not expose timeout or fuel controls.");
  lines.push("- Output proof caps what crosses from Worker to parent; Eryx/Python can still materialize large strings inside the Worker before the wrapper truncates them.");
  lines.push("- The runner intentionally collects no output files, matching the current QuickJS/jq product adapters. In-memory filesystem writes and symlink attempts are ignored unless their contents reach stdout/stderr.");
  lines.push("- The runner returns bounded error messages rather than JS host stack traces so proof output does not leak repo/home paths through adapter diagnostics.");
  lines.push("- The runner overrides Worker `console` before importing Eryx so preview2 browser shim debug logs are captured and bounded instead of inherited by host stdout.");
  lines.push("- Passing this spike supports candidate feasibility only. Product execution still requires adapter implementation, probe caching, review, and runtime-status wiring.");
  lines.push("");
  lines.push("## Required Proof Set");
  lines.push("");
  for (const proof of SCRIPT_SANDBOX_REQUIRED_PROOFS) {
    lines.push(`- ${proof}`);
  }
  return `${lines.join("\n")}\n`;
}

function formatNetworkEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return "none";
  }
  return events.map((event) => `${event.kind ?? "unknown"}.${event.operation ?? "unknown"}:${event.decision ?? "unknown"}`).join(",");
}

function escapeInline(value) {
  return String(value ?? "").replaceAll("`", "\\`").replaceAll("\n", "\\n");
}

function escapeTable(value) {
  return escapeInline(value).replaceAll("|", "\\|");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--eryx-root") {
      args.eryxRoot = next;
      index += 1;
    } else if (arg === "--report") {
      args.report = next;
      index += 1;
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(next);
      index += 1;
    } else if (arg === "--output-bytes") {
      args.outputBytes = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Worker } from "node:worker_threads";

import { SCRIPT_SANDBOX_REQUIRED_PROOFS, scriptSandboxProofFixturesForLanguage } from "../../router/dist/index.js";

const DEFAULT_REPORT_PATH = "evals/reports/runtime/jq-wasm-proof-spike-1-report.md";
const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_OUTPUT_BYTES = 4096;
const SECRET_SENTINEL = "FREEFLOW_SANDBOX_SECRET_SENTINEL_VALUE";
const HOST_HOME = process.env.HOME ?? "__no_home__";

async function main() {
  process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL = SECRET_SENTINEL;
  const args = parseArgs(process.argv.slice(2));
  const root = args.jqWasmRoot ?? process.env.JQ_WASM_ROOT;
  if (!root) {
    throw new Error("Missing --jq-wasm-root or JQ_WASM_ROOT. Install jq-wasm in a temp directory and pass its package root.");
  }

  const reportPath = args.report ?? DEFAULT_REPORT_PATH;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outputBytes = args.outputBytes ?? DEFAULT_OUTPUT_BYTES;
  const packageRoot = resolve(root);
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const jqPath = join(packageRoot, packageJson.main ?? "dist/index.js");
  const packageFiles = await collectPackageFiles(packageRoot);

  const version = await runJqWorker({ jqPath, query: "__version__", timeoutMs, outputBytes });
  const positive = await runJqWorker({ jqPath, query: ".test_log", json: { test_log: "INFO setup\nERROR target\n" }, timeoutMs, outputBytes });

  const fixtures = scriptSandboxProofFixturesForLanguage("jq");
  const results = [];
  for (const fixture of fixtures) {
    const run = await runJqWorker({ jqPath, query: fixture.program, json: { test_log: "INFO setup\nERROR target\n" }, timeoutMs, outputBytes });
    results.push({ fixture, run, pass: assessProof(fixture.proof, run, { timeoutMs, outputBytes }) });
  }

  const failed = results.filter((result) => !result.pass.ok);
  const report = renderReport({
    packageJson,
    packageRoot,
    jqPath,
    packageFiles,
    timeoutMs,
    outputBytes,
    version,
    positive,
    results,
    failed,
  });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");
  console.log(`Wrote ${reportPath}`);
  console.log(`jq-wasm proof fixtures: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    for (const result of failed) {
      console.log(`FAIL ${result.fixture.proof}: ${result.pass.reason}`);
    }
    process.exitCode = 1;
  }
}

async function collectPackageFiles(packageRoot) {
  const { readdir, stat } = await import("node:fs/promises");
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

async function runJqWorker({ jqPath, query, json = {}, timeoutMs, outputBytes }) {
  const start = Date.now();
  const workerSource = `
    const { parentPort, workerData } = require('node:worker_threads');
    const jq = require(workerData.jqPath);
    const capText = (value, cap) => {
      const text = String(value ?? '');
      const buffer = Buffer.from(text, 'utf8');
      return {
        text: buffer.byteLength > cap ? buffer.subarray(0, cap).toString('utf8') : text,
        bytes: buffer.byteLength,
        truncated: buffer.byteLength > cap,
      };
    };
    (async () => {
      try {
        if (workerData.query === '__version__') {
          const version = await jq.version();
          parentPort.postMessage({ status: 'success', version, stdout: '', stderr: '', exitCode: 0, truncated: false, rawStdoutBytes: 0, rawStderrBytes: 0 });
          return;
        }
        const result = await jq.raw(workerData.json, workerData.query, ['-c']);
        const stdoutCap = Math.max(1, Math.floor(workerData.outputBytes / 2));
        const stderrCap = Math.max(1, workerData.outputBytes - stdoutCap);
        const stdout = capText(result.stdout, stdoutCap);
        const stderr = capText(result.stderr, stderrCap);
        parentPort.postMessage({
          status: 'success',
          stdout: stdout.text,
          stderr: stderr.text,
          exitCode: result.exitCode,
          truncated: stdout.truncated || stderr.truncated,
          rawStdoutBytes: stdout.bytes,
          rawStderrBytes: stderr.bytes,
        });
      } catch (error) {
        const message = String(error && error.stack || error);
        const stderr = capText(message, workerData.outputBytes);
        parentPort.postMessage({ status: 'error', stdout: '', stderr: stderr.text, exitCode: null, truncated: stderr.truncated, rawStdoutBytes: 0, rawStderrBytes: stderr.bytes });
      }
    })();
  `;
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: { jqPath, query, json, outputBytes },
    resourceLimits: {
      maxOldGenerationSizeMb: 64,
      maxYoungGenerationSizeMb: 16,
    },
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        durationMs: Date.now() - start,
        outputBytes: Buffer.byteLength(`${result.stdout ?? ""}${result.stderr ?? ""}`, "utf8"),
        stdoutBytes: Buffer.byteLength(result.stdout ?? "", "utf8"),
        stderrBytes: Buffer.byteLength(result.stderr ?? "", "utf8"),
      });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      finish({ status: "timed_out", stdout: "", stderr: "", exitCode: null, truncated: false, rawStdoutBytes: 0, rawStderrBytes: 0 });
      void worker.terminate();
    }, timeoutMs);
    worker.on("message", (message) => finish(message));
    worker.on("error", (error) => finish({ status: "error", stdout: "", stderr: String(error?.stack ?? error), exitCode: null, truncated: false, rawStdoutBytes: 0, rawStderrBytes: Buffer.byteLength(String(error?.stack ?? error), "utf8") }));
    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        finish({ status: "error", stdout: "", stderr: `worker exited with code ${code}`, exitCode: code, truncated: false, rawStdoutBytes: 0, rawStderrBytes: 0 });
      }
    });
  });
}

function assessProof(proof, run, limits) {
  const combined = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  switch (proof) {
    case "env_access_denied":
      return passIf(!combined.includes(SECRET_SENTINEL) && !combined.includes("process.env"), "jq exposed only fixed runtime env, not ambient host env or secrets");
    case "home_access_denied":
      return passIf(!combined.includes(HOST_HOME) && !combined.match(/PRIVATE KEY|\.ssh/), "home/secret paths were not exposed");
    case "repo_access_denied":
      return passIf(!combined.includes("@hassangameryt/freeflow") && !combined.includes("package.json"), "repo files were not exposed");
    case "vault_access_denied":
      return passIf(!combined.includes("ffout_") && !combined.includes("ffrec_"), "vault records were not exposed");
    case "network_access_denied":
      return passIf(run.exitCode !== 0 && combined.includes("network unavailable"), "jq has no ambient network primitive; synthetic fetch errored boundedly");
    case "input_read_only":
      return passIf(run.exitCode !== 0 && combined.includes("module not found"), "input mutation include was unavailable");
    case "output_escape_denied":
      return passIf(run.exitCode !== 0 && combined.includes("module not found"), "output escape include was unavailable");
    case "stdout_stderr_bounded":
      return passIf(
        run.status !== "error" && run.truncated && run.outputBytes <= limits.outputBytes && run.stdoutBytes > 0 && run.stderrBytes > 0 && run.rawStdoutBytes > limits.outputBytes && run.rawStderrBytes > limits.outputBytes,
        "stdout and stderr flood output was truncated before crossing the worker boundary",
      );
    case "timeout_enforced":
      return passIf(run.status === "timed_out" && run.durationMs < limits.timeoutMs * 5, "recursive jq loop was interrupted by worker termination");
    default:
      return { ok: false, reason: `No assessment rule for proof ${proof}` };
  }
}

function passIf(condition, reason) {
  return condition ? { ok: true, reason } : { ok: false, reason: `Failed: ${reason}` };
}

function renderReport(data) {
  const lines = [];
  lines.push("# jq-wasm Sandbox Proof Spike Report");
  lines.push("");
  lines.push(`> **Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push("> **Status:** " + (data.failed.length === 0 ? "Passed proof spike for jq candidate" : "Failed proof spike for jq candidate"));
  lines.push("> **Scope:** Proof-only evaluation. No Freeflow script execution path is enabled.");
  lines.push("");
  lines.push("## Candidate");
  lines.push("");
  lines.push(`- Package: \`${data.packageJson.name}@${data.packageJson.version}\``);
  lines.push(`- License: ${data.packageJson.license ?? "unknown"}`);
  lines.push(`- Package root: \`${data.packageRoot}\``);
  lines.push(`- Entry point: \`${data.jqPath}\``);
  lines.push(`- Runtime version: ${data.version.version ? `\`${data.version.version}\`` : "unavailable"}`);
  lines.push(`- Timeout: ${data.timeoutMs}ms via Worker termination`);
  lines.push(`- Output cap: ${data.outputBytes} bytes across stdout + stderr before Worker result crosses to host`);
  lines.push("- Worker resource limits: `maxOldGenerationSizeMb=64`, `maxYoungGenerationSizeMb=16`");
  lines.push("");
  lines.push("## Package Files");
  lines.push("");
  for (const file of data.packageFiles) {
    lines.push(`- \`${file.path}\` — ${file.bytes} bytes`);
  }
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
    ].join("; ");
    lines.push(`| ${result.fixture.proof} | ${result.pass.ok ? "pass" : "fail"} | ${escapeTable(evidence)} |`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This proof runner uses a temporary installed `jq-wasm` package root passed explicitly by the caller.");
  lines.push("- It does not add repo dependencies and does not wire the adapter into `freeflow_derive` execution.");
  lines.push("- Timeout proof uses Node Worker termination because in-thread recursive jq blocks the event loop.");
  lines.push("- Output proof caps what crosses the Worker boundary; `jq-wasm` itself can still generate large in-Worker strings before the wrapper truncates them.");
  lines.push("- Passing this spike only supports jq adapter feasibility; Python remains unavailable until a Python candidate passes proofs.");
  lines.push("- Before product execution, this must still go through implementation/security review and source-plan update.");
  lines.push("");
  lines.push("## Required Proof Set");
  lines.push("");
  for (const proof of SCRIPT_SANDBOX_REQUIRED_PROOFS) {
    lines.push(`- ${proof}`);
  }
  return `${lines.join("\n")}\n`;
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
    if (arg === "--jq-wasm-root") {
      args.jqWasmRoot = next;
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
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { SCRIPT_SANDBOX_REQUIRED_PROOFS, scriptSandboxProofFixturesForLanguage } from "../../router/dist/index.js";

const DEFAULT_REPORT_PATH = "evals/reports/runtime/quickjs-wasi-proof-spike-1-report.md";
const DEFAULT_TIMEOUT_MS = 250;
const DEFAULT_MEMORY_BYTES = 8 * 1024 * 1024;
const DEFAULT_OUTPUT_BYTES = 4096;
const SECRET_SENTINEL = "FREEFLOW_SANDBOX_SECRET_SENTINEL_VALUE";

async function main() {
  process.env.FREEFLOW_SANDBOX_SECRET_SENTINEL = SECRET_SENTINEL;
  const args = parseArgs(process.argv.slice(2));
  const root = args.quickjsWasiRoot ?? process.env.QUICKJS_WASI_ROOT;
  if (!root) {
    throw new Error("Missing --quickjs-wasi-root or QUICKJS_WASI_ROOT. Install quickjs-wasi in a temp directory and pass its package root.");
  }

  const reportPath = args.report ?? DEFAULT_REPORT_PATH;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const memoryBytes = args.memoryBytes ?? DEFAULT_MEMORY_BYTES;
  const outputBytes = args.outputBytes ?? DEFAULT_OUTPUT_BYTES;
  const packageRoot = resolve(root);
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const wasmPath = join(packageRoot, "quickjs.wasm");
  const wasm = await readFile(wasmPath);
  const wasmSha256 = createHash("sha256").update(wasm).digest("hex");
  const { QuickJS } = await import(pathToFileURL(join(packageRoot, "dist/index.js")).href);

  const positive = await runQuickJsProgram(QuickJS, wasm, {
    code: "writeText(readText('test_log'))",
    timeoutMs,
    memoryBytes,
    outputBytes,
  });
  const fixtures = scriptSandboxProofFixturesForLanguage("javascript");
  const results = [];
  for (const fixture of fixtures) {
    const run = await runQuickJsProgram(QuickJS, wasm, {
      code: fixture.program,
      timeoutMs,
      memoryBytes,
      outputBytes,
    });
    results.push({ fixture, run, pass: assessProof(fixture.proof, run, { timeoutMs, outputBytes }) });
  }

  const failed = results.filter((result) => !result.pass.ok);
  const report = renderReport({
    packageJson,
    packageRoot,
    wasmPath,
    wasmBytes: wasm.byteLength,
    wasmSha256,
    timeoutMs,
    memoryBytes,
    outputBytes,
    positive,
    results,
    failed,
  });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");
  console.log(`Wrote ${reportPath}`);
  console.log(`quickjs-wasi proof fixtures: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    for (const result of failed) {
      console.log(`FAIL ${result.fixture.proof}: ${result.pass.reason}`);
    }
    process.exitCode = 1;
  }
}

async function runQuickJsProgram(QuickJS, wasm, options) {
  const start = Date.now();
  let output = "";
  let stdout = "";
  let stderr = "";
  let truncated = false;
  const appendOutput = (stream, value) => {
    const text = String(value ?? "");
    const currentBytes = Buffer.byteLength(output, "utf8");
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
    output += nextText;
    if (stream === "stderr") {
      stderr += nextText;
    } else {
      stdout += nextText;
    }
  };

  let vm;
  try {
    vm = await QuickJS.create({
      wasm,
      memoryLimit: options.memoryBytes,
      interruptHandler: () => Date.now() - start > options.timeoutMs,
    });

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

    const readText = vm.newFunction("readText", (...args) => {
      const alias = args[0]?.toString() ?? "";
      const text = alias === "test_log" ? "INFO setup\nERROR target\n" : "";
      return vm.newString(text);
    });
    vm.setProp(vm.global, "readText", readText);
    disposeHandle(readText);

    const result = vm.evalCode(options.code);
    try {
      const dumped = vm.dump(result);
      if (dumped !== undefined) {
        appendOutput("stdout", typeof dumped === "string" ? dumped : JSON.stringify(dumped));
      }
    } finally {
      disposeHandle(result);
    }

    return {
      status: "success",
      output,
      stdout,
      stderr,
      outputBytes: Buffer.byteLength(output, "utf8"),
      stdoutBytes: Buffer.byteLength(stdout, "utf8"),
      stderrBytes: Buffer.byteLength(stderr, "utf8"),
      truncated,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Error";
    disposeHandle(error);
    return {
      status: message.includes("interrupted") ? "timed_out" : "error",
      output,
      stdout,
      stderr,
      outputBytes: Buffer.byteLength(output, "utf8"),
      stdoutBytes: Buffer.byteLength(stdout, "utf8"),
      stderrBytes: Buffer.byteLength(stderr, "utf8"),
      truncated,
      errorName: name,
      errorMessage: message,
      durationMs: Date.now() - start,
    };
  } finally {
    if (vm && typeof vm.dispose === "function") {
      vm.dispose();
    }
  }
}

function assessProof(proof, run, limits) {
  const combined = `${run.output}\n${run.errorMessage ?? ""}`;
  switch (proof) {
    case "env_access_denied":
      return passIf(!combined.includes(SECRET_SENTINEL) && !combined.includes("process.env"), "ambient environment was not exposed");
    case "home_access_denied":
      return passIf(!combined.includes(process.env.HOME ?? "__no_home__") && !combined.match(/PRIVATE KEY|\.ssh/), "home/secret paths were not exposed");
    case "repo_access_denied":
      return passIf(!combined.includes("@hassangameryt/freeflow") && !combined.includes("package.json"), "repo files were not exposed");
    case "vault_access_denied":
      return passIf(!combined.includes("ffout_") && !combined.includes("ffrec_"), "vault records were not exposed");
    case "network_access_denied":
      return passIf(combined.includes("fetch unavailable") || combined.includes("fetch is not defined"), "network/fetch capability was absent");
    case "input_read_only":
      return passIf(!combined.includes("mutated") || combined.includes("fs unavailable"), "input mutation was not possible through host filesystem APIs");
    case "output_escape_denied":
      return passIf(!combined.includes("escape attempted") || combined.includes("fs unavailable"), "output symlink/file escape was not possible through host filesystem APIs");
    case "stdout_stderr_bounded":
      return passIf(
        run.status !== "error" && run.truncated && run.outputBytes <= limits.outputBytes && run.stdoutBytes > 0 && run.stderrBytes > 0,
        "stdout and stderr flood capture was truncated within the cap",
      );
    case "timeout_enforced":
      return passIf(run.status === "timed_out" && run.durationMs < limits.timeoutMs * 5, "infinite loop was interrupted by runtime timeout");
    default:
      return { ok: false, reason: `No assessment rule for proof ${proof}` };
  }
}

function passIf(condition, reason) {
  return condition ? { ok: true, reason } : { ok: false, reason: `Failed: ${reason}` };
}

function formatHostArgs(vm, args) {
  return args.map((arg) => {
    try {
      const dumped = vm.dump(arg);
      if (typeof dumped === "string") return dumped;
      if (dumped === undefined) return "undefined";
      return JSON.stringify(dumped);
    } catch {
      return arg?.toString() ?? "";
    }
  }).join(" ");
}

function renderReport(data) {
  const lines = [];
  lines.push("# QuickJS WASI Sandbox Proof Spike Report");
  lines.push("");
  lines.push(`> **Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push("> **Status:** " + (data.failed.length === 0 ? "Passed proof spike for JavaScript candidate" : "Failed proof spike for JavaScript candidate"));
  lines.push("> **Scope:** Proof-only evaluation. No Freeflow script execution path is enabled.");
  lines.push("");
  lines.push("## Candidate");
  lines.push("");
  lines.push(`- Package: \`${data.packageJson.name}@${data.packageJson.version}\``);
  lines.push(`- License: ${data.packageJson.license ?? "unknown"}`);
  lines.push(`- Package root: \`${data.packageRoot}\``);
  lines.push(`- WASM bytes: ${data.wasmBytes}`);
  lines.push(`- WASM SHA-256: \`${data.wasmSha256}\``);
  lines.push(`- Timeout: ${data.timeoutMs}ms`);
  lines.push(`- Memory limit: ${data.memoryBytes} bytes`);
  lines.push(`- Output cap: ${data.outputBytes} bytes`);
  lines.push("");
  lines.push("## Positive API Probe");
  lines.push("");
  lines.push(`- Status: ${data.positive.status}`);
  lines.push(`- Output: \`${escapeInline(data.positive.output)}\``);
  lines.push(`- Error: ${data.positive.errorMessage ? `\`${escapeInline(data.positive.errorMessage)}\`` : "none"}`);
  lines.push("");
  lines.push("## Required Proof Results");
  lines.push("");
  lines.push("| Proof | Result | Evidence |");
  lines.push("| --- | --- | --- |");
  for (const result of data.results) {
    const evidence = [
      result.pass.reason,
      `status=${result.run.status}`,
      `durationMs=${result.run.durationMs}`,
      `outputBytes=${result.run.outputBytes}`,
      `stdoutBytes=${result.run.stdoutBytes}`,
      `stderrBytes=${result.run.stderrBytes}`,
      `truncated=${result.run.truncated}`,
      result.run.errorMessage ? `error=${result.run.errorMessage}` : undefined,
    ].filter(Boolean).join("; ");
    lines.push(`| ${result.fixture.proof} | ${result.pass.ok ? "pass" : "fail"} | ${escapeTable(evidence)} |`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This proof runner uses a temporary installed `quickjs-wasi` package root passed explicitly by the caller.");
  lines.push("- It does not add repo dependencies and does not wire the adapter into `freeflow_search action=transform` execution.");
  lines.push("- Passing this spike only supports JavaScript adapter feasibility; Python and jq remain unavailable until their own proof slices pass.");
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
  return String(value).replaceAll("`", "\\`").replaceAll("\n", "\\n");
}

function escapeTable(value) {
  return escapeInline(value).replaceAll("|", "\\|");
}

function disposeHandle(value) {
  if (value && typeof value.dispose === "function") {
    value.dispose();
  } else if (value && typeof value[Symbol.dispose] === "function") {
    value[Symbol.dispose]();
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--quickjs-wasi-root") {
      args.quickjsWasiRoot = next;
      index += 1;
    } else if (arg === "--report") {
      args.report = next;
      index += 1;
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(next);
      index += 1;
    } else if (arg === "--memory-bytes") {
      args.memoryBytes = Number(next);
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

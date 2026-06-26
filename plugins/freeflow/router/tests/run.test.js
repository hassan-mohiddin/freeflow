import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createVault, freeflowRun, readOutputText, SCRIPT_SANDBOX_REQUIRED_PROOFS } from "../dist/index.js";
import { parseCommandOutput } from "../dist/parsers.js";

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-run-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function availableScriptAdapter(execute) {
  return {
    id: "fake-run-script-filter",
    version: "test",
    languages: ["javascript"],
    async probe() {
      return {
        status: "available",
        reason: "fake adapter passed every required proof",
        passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        failedProofs: [],
        runtime: { name: "fake-js", version: "test" },
      };
    },
    execute,
  };
}

test("freeflowRun uses an adapter runner and stores small successful output metadata-only by default", async () => {
  await withTempVault(async (vault) => {
    const calls = [];
    const runner = {
      async run(request) {
        calls.push(request);
        return {
          stdout: "done\n",
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
          durationMs: 12,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "echo done",
        cwd: "/repo",
        timeoutMs: 1_000,
        sessionId: "run-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.deepEqual(calls, [{ command: "echo done", cwd: "/repo", timeoutMs: 1_000 }]);
    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "success");
    assert.equal(result.execution.exitCode, 0);
    assert.ok(result.outputId.startsWith("ffout_"));
    assert.ok(result.recordId.startsWith("ffrec_"));
    assert.equal(result.producer?.kind, "command");
    assert.deepEqual(result.persistence, {
      status: "metadata_only",
      recoverability: "metadata_only",
      outputId: result.outputId,
    });
    assert.equal(result.routing.status, "routed");
    assert.match(result.summary, /success/);
    assert.equal(result.parser?.name, "generic");
    assert.equal(result.parser?.fidelity, "exact");
    assert.equal(result.importantLines?.[0].stream, "stdout");
    assert.equal(result.importantLines?.[0].excerpt, "done\n");
    assert.equal(result.recovery?.outputId, undefined);
    assert.match(result.recovery?.how ?? "", /metadata-only/);

    await assert.rejects(
      readOutputText(vault, "run-session", result.outputId, "stdout"),
      /Metadata only records store no raw stream/,
    );
  });
});

test("repeated command output returns a compact duplicate note with recovery ids", async () => {
  await withTempVault(async (vault) => {
    const stdout = Array.from({ length: 20 }, (_, index) => `repeat line ${index + 1}`).join("\n");
    let calls = 0;
    const runner = {
      async run() {
        calls += 1;
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
          durationMs: calls,
        };
      },
    };

    const first = await freeflowRun(
      {
        command: "npm test -- --repeat",
        cwd: "/repo",
        sessionId: "duplicate-session",
        vaultRoot: vault.root,
        preserve: "important",
        thresholds: { largeOutputLines: 10, largeOutputBytes: 10_000 },
      },
      runner,
    );
    const second = await freeflowRun(
      {
        command: "npm test -- --repeat",
        cwd: "/repo",
        sessionId: "duplicate-session",
        vaultRoot: vault.root,
        preserve: "important",
        thresholds: { largeOutputLines: 10, largeOutputBytes: 10_000 },
      },
      runner,
    );

    assert.equal(first.toolStatus, "ok");
    assert.doesNotMatch(first.summary ?? "", /duplicate/i);
    assert.equal(second.toolStatus, "ok");
    assert.equal(second.routing.status, "partial");
    assert.equal(second.parser?.name, "duplicate-output");
    assert.match(second.summary ?? "", new RegExp(`exact duplicate.+${first.outputId}`));
    assert.match(second.recovery?.how ?? "", new RegExp(`metadata-only outputId=${second.outputId}`));
    assert.match(second.recovery?.how ?? "", new RegExp(`outputId=${first.outputId}`));
    assert.equal(second.persistence?.recoverability, "metadata_only");
    assert.equal(second.recovery?.outputId, first.outputId);
    assert.equal(second.importantLines?.length ?? 0, 0);
    assert.notEqual(second.outputId, first.outputId);
    assert.equal(await readOutputText(vault, "duplicate-session", first.outputId, "stdout"), stdout);
    await assert.rejects(
      readOutputText(vault, "duplicate-session", second.outputId, "stdout"),
      /Metadata only records store no raw stream/,
    );
  });
});

test("preserve full duplicate output returns exact output instead of a duplicate note", async () => {
  await withTempVault(async (vault) => {
    const stdout = "exact duplicate body\n";
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    await freeflowRun(
      {
        command: "printf duplicate",
        sessionId: "duplicate-full-session",
        vaultRoot: vault.root,
        preserve: "full",
      },
      runner,
    );
    const second = await freeflowRun(
      {
        command: "printf duplicate",
        sessionId: "duplicate-full-session",
        vaultRoot: vault.root,
        preserve: "full",
      },
      runner,
    );

    assert.equal(second.toolStatus, "ok");
    assert.equal(second.routing.status, "routed");
    assert.equal(second.parser?.name, "generic");
    assert.equal(second.importantLines?.[0].excerpt, stdout);
    assert.doesNotMatch(second.summary ?? "", /duplicate/i);
  });
});

test("small successful parsed output remains near-raw", async () => {
  await withTempVault(async (vault) => {
    const stdout = ["PASS tests/router.test.ts", "Tests: 1 passed, 1 total"].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm test",
        sessionId: "small-parsed-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.equal(result.parser?.name, "test-runner");
    assert.equal(result.parser?.compressed, false);
    assert.equal(result.importantLines?.[0].stream, "stdout");
    assert.equal(result.importantLines?.[0].excerpt, stdout);
    assert.equal(await readOutputText(vault, "small-parsed-session", result.outputId, "stdout"), stdout);
  });
});

test("preserve full keeps blank lines and trailing newline exact under cap", async () => {
  await withTempVault(async (vault) => {
    const stdout = "alpha\n\nbeta\n";
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "printf exact",
        sessionId: "preserve-full-session",
        vaultRoot: vault.root,
        preserve: "full",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.equal(result.parser?.fidelity, "exact");
    assert.equal(result.parser?.compressed, false);
    assert.equal(result.importantLines?.[0].stream, "stdout");
    assert.equal(result.importantLines?.[0].lines, "1-4");
    assert.equal(result.importantLines?.[0].excerpt, stdout);
    assert.equal(await readOutputText(vault, "preserve-full-session", result.outputId, "stdout"), stdout);
  });
});

test("large successful command returns deterministic important lines plus output id", async () => {
  await withTempVault(async (vault) => {
    const output = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n");
    const runner = {
      async run() {
        return {
          stdout: output,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "generate noisy output",
        sessionId: "large-session",
        vaultRoot: vault.root,
        thresholds: { largeOutputLines: 10, largeOutputBytes: 10_000 },
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "success");
    assert.equal(result.routing.status, "partial");
    assert.match(result.summary, /30 output lines/);
    assert.equal(result.parser?.name, "generic");
    assert.equal(result.parser?.compressed, true);
    assert.equal(result.importantLines?.[0].stream, "combined");
    assert.match(result.importantLines?.[0].excerpt, /line 1/);
    assert.ok(!result.importantLines?.[0].excerpt.includes("line 30"));
    assert.equal(await readOutputText(vault, "large-session", result.outputId, "stdout"), output);
  });
});

test("freeflowRun declarative include filter returns matching lines with raw recovery", async () => {
  await withTempVault(async (vault) => {
    const stdout = ["alpha", "TARGET keep", "beta", "TARGET second"].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "generate output",
        sessionId: "filter-include-session",
        vaultRoot: vault.root,
        preserve: "important",
        filters: { include: ["TARGET"], maxLines: 10 },
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.match(result.routing.reason, /declarative filters/);
    assert.equal(result.filters?.stream, "stdout");
    assert.deepEqual(result.filters?.include, ["TARGET"]);
    assert.equal(result.filters?.selectedLines, 2);
    assert.equal(result.filters?.sourceLines, 4);
    assert.equal(result.parser?.counts?.filterSelectedLines, 2);
    assert.equal(result.importantLines?.length, 2);
    assert.equal(result.importantLines?.[0].lines, "2-2");
    assert.equal(result.importantLines?.[0].excerpt, "TARGET keep");
    assert.equal(result.importantLines?.[1].lines, "4-4");
    assert.equal(result.importantLines?.[1].excerpt, "TARGET second");
    assert.equal(await readOutputText(vault, "filter-include-session", result.outputId, "stdout"), stdout);
  });
});

test("freeflowRun declarative stream and exclude filters hide routed noise but keep raw output", async () => {
  await withTempVault(async (vault) => {
    const stdout = "public\nSECRET_TOKEN=abc\nfinal\n";
    const stderr = "warn one\nwarn two\n";
    const runner = {
      async run() {
        return {
          stdout,
          stderr,
          combined: `[stdout]\n${stdout}\n[stderr]\n${stderr}`,
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "mixed output",
        sessionId: "filter-exclude-session",
        vaultRoot: vault.root,
        preserve: "important",
        filters: { stream: "stdout", exclude: ["SECRET_TOKEN"], tail: 2 },
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.filters?.stream, "stdout");
    assert.deepEqual(result.filters?.exclude, ["SECRET_TOKEN"]);
    assert.doesNotMatch(result.importantLines?.map((line) => line.excerpt).join("\n") ?? "", /SECRET_TOKEN/);
    assert.match(result.importantLines?.map((line) => line.excerpt).join("\n") ?? "", /public|final/);
    assert.equal(await readOutputText(vault, "filter-exclude-session", result.outputId, "stdout"), stdout);
  });
});

test("freeflowRun preserves parsed failure evidence when filters match nothing", async () => {
  await withTempVault(async (vault) => {
    const stdout = "Tests: 2 failed, 8 passed, 10 total\n";
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "failed",
          exitCode: 1,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm test",
        sessionId: "filter-failure-session",
        vaultRoot: vault.root,
        preserve: "important",
        filters: { include: ["DOES_NOT_MATCH"] },
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.filters?.selectedLines, 0);
    assert.equal(result.filters?.fallbackPreservedFailureEvidence, true);
    assert.match(result.routing.reason, /parsed failure evidence was preserved/);
    assert.equal(result.importantLines?.[0].excerpt, "Tests: 2 failed, 8 passed, 10 total");
    assert.equal(await readOutputText(vault, "filter-failure-session", result.outputId, "stdout"), stdout);
  });
});

test("freeflowRun rejects invalid declarative filters before executing command", async () => {
  await withTempVault(async (vault) => {
    let calls = 0;
    const runner = {
      async run() {
        calls += 1;
        return {
          stdout: "should not run",
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "dangerous command",
        sessionId: "filter-invalid-session",
        vaultRoot: vault.root,
        preserve: "important",
        filters: { include: ["("], maxLines: 1 },
      },
      runner,
    );

    assert.equal(calls, 0);
    assert.equal(result.toolStatus, "error");
    assert.equal(result.outputId, "");
    assert.equal(result.routing.status, "failed");
    assert.match(result.routing.reason, /Invalid freeflow_run filters/);
    assert.match(result.recovery?.how ?? "", /No command output was captured/);
  });
});

test("freeflowRun script filter runs command once, sees captured streams, and stores derived output", async () => {
  await withTempVault(async (vault) => {
    let calls = 0;
    const stdout = "alpha\nTARGET stdout\n";
    const stderr = "warn stderr\n";
    const combined = `[stdout]\n${stdout}\n[stderr]\n${stderr}`;
    const runner = {
      async run() {
        calls += 1;
        return {
          stdout,
          stderr,
          combined,
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };
    const adapter = availableScriptAdapter(async (request) => {
      assert.equal(request.language, "javascript");
      assert.equal(request.network, "off");
      assert.equal(request.sources.length, 3);
      assert.deepEqual(request.sources.map((source) => source.alias), ["stdout", "stderr", "combined"]);
      const stdoutText = await readFile(request.sources.find((source) => source.alias === "stdout").path, "utf8");
      const stderrText = await readFile(request.sources.find((source) => source.alias === "stderr").path, "utf8");
      const combinedText = await readFile(request.sources.find((source) => source.alias === "combined").path, "utf8");
      assert.equal(stdoutText, stdout);
      assert.equal(stderrText, stderr);
      assert.equal(combinedText, combined);
      return {
        status: "success",
        stdout: `SCRIPT:${stdoutText.split("\n").find((line) => line.includes("TARGET"))}:${stderrText.trim()}:${combinedText.includes("[stderr]")}`,
        stderr: "",
        outputFiles: [],
        exitCode: 0,
        durationMs: 2,
      };
    });

    const result = await freeflowRun(
      {
        command: "expensive command",
        sessionId: "run-script-filter-session",
        vaultRoot: vault.root,
        preserve: "important",
        scriptFilter: { language: "javascript", code: "write filtered output", label: "target-only" },
        scriptDerive: {
          enabled: true,
          sandbox: "auto",
          languages: ["javascript"],
          network: "off",
          limits: { timeoutMs: 1000, maxInputBytes: 4096, maxOutputBytes: 4096 },
          rawScriptPersistence: "disabled",
        },
        scriptSandboxAdapters: [adapter],
      },
      runner,
    );

    assert.equal(calls, 1);
    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "success");
    assert.equal(result.outputId.startsWith("ffout_"), true);
    assert.equal(result.scriptFilter?.status, "success");
    assert.equal(result.scriptFilter?.language, "javascript");
    assert.equal(result.scriptFilter?.label, "target-only");
    assert.equal(result.scriptFilter?.rawOutputId, result.outputId);
    assert.equal(result.scriptFilter?.outputId?.startsWith("ffout_"), true);
    assert.notEqual(result.scriptFilter?.outputId, result.outputId);
    assert.match(result.scriptFilter?.operation?.codeSha256, /^sha256_[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(result), /write filtered output/);
    assert.match(result.summary ?? "", /derived outputId=ffout_/);
    assert.match(result.importantLines?.[0].excerpt ?? "", /SCRIPT:TARGET stdout:warn stderr:true/);
    assert.equal(await readOutputText(vault, "run-script-filter-session", result.outputId, "stdout"), stdout);
    assert.equal(await readOutputText(vault, "run-script-filter-session", result.scriptFilter.outputId, "raw"), "SCRIPT:TARGET stdout:warn stderr:true");
    assert.match(result.recovery?.how ?? "", new RegExp(`outputId=${result.outputId}`));
    assert.match(result.recovery?.how ?? "", new RegExp(`outputId=${result.scriptFilter.outputId}`));
  });
});

test("freeflowRun script filter disabled preserves base command result and raw recovery", async () => {
  await withTempVault(async (vault) => {
    let calls = 0;
    const runner = {
      async run() {
        calls += 1;
        return {
          stdout: "base output\n",
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "base command",
        sessionId: "run-script-disabled-session",
        vaultRoot: vault.root,
        preserve: "important",
        scriptFilter: { language: "javascript", code: "RAW_SCRIPT_SENTINEL" },
      },
      runner,
    );

    assert.equal(calls, 1);
    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "success");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.failure?.kind, "script_derive_disabled");
    assert.equal(result.deriveExecution?.status, "unavailable");
    assert.equal(result.scriptFilter?.status, "unavailable");
    assert.equal(result.scriptFilter?.outputId, undefined);
    assert.doesNotMatch(JSON.stringify(result), /RAW_SCRIPT_SENTINEL/);
    assert.equal(result.importantLines?.[0].excerpt, "base output\n");
    assert.equal(await readOutputText(vault, "run-script-disabled-session", result.outputId, "stdout"), "base output\n");
  });
});

test("freeflowRun rejects invalid script filters before executing command", async () => {
  await withTempVault(async (vault) => {
    let calls = 0;
    const runner = {
      async run() {
        calls += 1;
        return {
          stdout: "should not run",
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "dangerous command",
        sessionId: "run-script-invalid-session",
        vaultRoot: vault.root,
        preserve: "important",
        scriptFilter: { language: "ruby", code: "puts 1" },
      },
      runner,
    );

    assert.equal(calls, 0);
    assert.equal(result.toolStatus, "error");
    assert.equal(result.outputId, "");
    assert.match(result.routing.reason, /Invalid freeflow_run scriptFilter/);
    assert.match(result.recovery?.how ?? "", /No command output was captured/);
  });
});

test("freeflowRun script filter output caps and timeouts do not hide raw command output", async () => {
  await withTempVault(async (vault) => {
    const runner = {
      async run() {
        return {
          stdout: "raw before script failure\n",
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };
    const overCapAdapter = availableScriptAdapter(async () => ({
      status: "success",
      stdout: "x".repeat(100),
      stderr: "",
      outputFiles: [],
      exitCode: 0,
    }));
    const overCap = await freeflowRun(
      {
        command: "base command",
        sessionId: "run-script-overcap-session",
        vaultRoot: vault.root,
        preserve: "important",
        scriptFilter: { language: "javascript", code: "flood", limits: { maxOutputBytes: 10 } },
        scriptDerive: {
          enabled: true,
          sandbox: "auto",
          languages: ["javascript"],
          network: "off",
          limits: { timeoutMs: 1000, maxInputBytes: 4096, maxOutputBytes: 4096 },
          rawScriptPersistence: "disabled",
        },
        scriptSandboxAdapters: [overCapAdapter],
      },
      runner,
    );

    assert.equal(overCap.failure?.kind, "derive_execution_failure");
    assert.equal(overCap.scriptFilter?.status, "failed");
    assert.equal(overCap.scriptFilter?.outputId, undefined);
    assert.match(overCap.failure?.message ?? "", /maxOutputBytes 10/);
    assert.equal(await readOutputText(vault, "run-script-overcap-session", overCap.outputId, "stdout"), "raw before script failure\n");

    const timeoutAdapter = availableScriptAdapter(async () => ({
      status: "timed_out",
      stdout: "partial",
      stderr: "",
      outputFiles: [],
      exitCode: null,
      reason: "timeout enforced",
    }));
    const timeout = await freeflowRun(
      {
        command: "base command",
        sessionId: "run-script-timeout-session",
        vaultRoot: vault.root,
        preserve: "important",
        scriptFilter: { language: "javascript", code: "while(true){}", limits: { timeoutMs: 5 } },
        scriptDerive: {
          enabled: true,
          sandbox: "auto",
          languages: ["javascript"],
          network: "off",
          limits: { timeoutMs: 1000, maxInputBytes: 4096, maxOutputBytes: 4096 },
          rawScriptPersistence: "disabled",
        },
        scriptSandboxAdapters: [timeoutAdapter],
      },
      runner,
    );

    assert.equal(timeout.failure?.kind, "derive_execution_failure");
    assert.equal(timeout.scriptFilter?.status, "failed");
    assert.match(timeout.failure?.message ?? "", /timed_out/);
    assert.equal(await readOutputText(vault, "run-script-timeout-session", timeout.outputId, "stdout"), "raw before script failure\n");
  });
});

test("large single-line command output returns a bounded preview", async () => {
  await withTempVault(async (vault) => {
    const stdout = "A".repeat(60_000);
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "generate json",
        sessionId: "large-single-line-session",
        vaultRoot: vault.root,
        thresholds: { largeOutputBytes: 10_000, largeOutputLines: 1_000 },
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.parser?.name, "generic");
    assert.equal(result.parser?.fidelity, "lossy");
    assert.equal(result.parser?.compressed, true);
    assert.ok(Buffer.byteLength(result.importantLines?.[0].excerpt ?? "", "utf8") < 4_096);
    assert.match(result.importantLines?.[0].excerpt ?? "", /truncated; recover exact output from vault/);
    assert.equal(await readOutputText(vault, "large-single-line-session", result.outputId, "stdout"), stdout);
  });
});

test("verification goal preserves exact pass/fail summary lines", async () => {
  await withTempVault(async (vault) => {
    const stdout = [
      ...Array.from({ length: 12 }, (_, index) => `setup line ${index + 1}`),
      "Tests: 3 failed, 214 passed, 217 total",
      "Time: 8.23s",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "failed",
          exitCode: 1,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm test",
        sessionId: "verification-session",
        vaultRoot: vault.root,
        goal: "verification",
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.parser?.name, "test-runner");
    assert.equal(result.parser?.counts?.testsFailed, 3);
    assert.equal(result.parser?.counts?.testsPassed, 214);
    assert.equal(result.parser?.counts?.testsTotal, 217);
    assert.equal(result.importantLines?.[0].stream, "combined");
    assert.equal(result.importantLines?.[0].excerpt, "Tests: 3 failed, 214 passed, 217 total");
    assert.equal(await readOutputText(vault, "verification-session", result.outputId, "stdout"), stdout);
  });
});

test("non-test commands mentioning Tests use generic fallback", async () => {
  await withTempVault(async (vault) => {
    const stdout = "docs/example.md:Tests: 3 failed, 214 passed, 217 total";
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "rg \"Tests:\" docs",
        sessionId: "rg-tests-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "generic");
    assert.equal(result.importantLines?.[0].excerpt, stdout);
    assert.equal(await readOutputText(vault, "rg-tests-session", result.outputId, "stdout"), stdout);
  });
});

test("successful non-test commands mentioning FAIL use generic fallback", () => {
  const parsed = parseCommandOutput({
    command: "rg \"^FAIL\" docs",
    executionStatus: "success",
    exitCode: 0,
    stdout: "docs/example.md:FAIL is a literal example",
    stderr: "",
    combined: "docs/example.md:FAIL is a literal example",
  });

  assert.equal(parsed.parser.name, "generic");
});

test("non-tool command output does not claim specialized parser semantics", () => {
  const cases = [
    {
      command: "python script.py",
      executionStatus: "failed",
      exitCode: 1,
      stdout: "",
      stderr: "Traceback (most recent call last):\nValueError: nope",
      combined: "Traceback (most recent call last):\nValueError: nope",
    },
    {
      command: "rg \"files changed\" docs",
      executionStatus: "success",
      exitCode: 0,
      stdout: "docs/example.md: 3 files changed",
      stderr: "",
      combined: "docs/example.md: 3 files changed",
    },
    {
      command: "rg \"Build failed\" docs",
      executionStatus: "success",
      exitCode: 0,
      stdout: "docs/example.md: Build failed is an example",
      stderr: "",
      combined: "docs/example.md: Build failed is an example",
    },
    {
      command: "rg \"TS2322\" docs",
      executionStatus: "success",
      exitCode: 0,
      stdout: "docs/example.md: src/a.ts(1,2): error TS2322: example",
      stderr: "",
      combined: "docs/example.md: src/a.ts(1,2): error TS2322: example",
    },
  ];

  for (const probe of cases) {
    assert.equal(parseCommandOutput(probe).parser.name, "generic", probe.command);
    assert.equal(parseCommandOutput({ ...probe, goal: "verify" }).parser.name, "generic", `${probe.command} with verify goal`);
  }
});

test("post-execution routing failures return bounded in-memory evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-run-vault-failure-"));
  try {
    const vaultFile = join(root, "not-a-directory");
    await writeFile(vaultFile, "occupied", "utf8");
    const stdout = `${"ROUTING_FAILURE_MARKER repeated ".repeat(1000)}ROUTING_FAILURE_TAIL`;
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "generate output",
        sessionId: "routing-failure-session",
        vaultRoot: vaultFile,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "error");
    assert.equal(result.execution.status, "success");
    assert.equal(result.routing.status, "failed");
    assert.equal(result.outputId, "");
    assert.equal(result.producer?.kind, "command");
    assert.deepEqual(result.persistence, { status: "not_persisted", recoverability: "none" });
    assert.match(result.importantLines?.[0].excerpt ?? "", /ROUTING_FAILURE_MARKER/);
    assert.ok(Buffer.byteLength(result.importantLines?.[0].excerpt ?? "", "utf8") <= 8_192);
    assert.match(result.recovery?.how ?? "", /could not be vaulted/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parser evidence splits non-contiguous line ranges", () => {
  const parsed = parseCommandOutput({
    command: "npm test",
    executionStatus: "failed",
    exitCode: 1,
    stdout: "Tests: 1 failed, 2 passed, 3 total\nnoise\nTest Suites: 1 failed, 1 total",
    stderr: "",
    combined: "Tests: 1 failed, 2 passed, 3 total\nnoise\nTest Suites: 1 failed, 1 total",
  });

  assert.equal(parsed.parser.name, "test-runner");
  assert.equal(parsed.importantLines[0]?.lines, "1-1");
  assert.equal(parsed.importantLines[0]?.excerpt, "Tests: 1 failed, 2 passed, 3 total");
  assert.equal(parsed.importantLines[1]?.lines, "3-3");
  assert.equal(parsed.importantLines[1]?.excerpt, "Test Suites: 1 failed, 1 total");
});

test("pytest-style summaries parse as test runner output", async () => {
  await withTempVault(async (vault) => {
    const stdout = "2 failed, 5 passed in 0.42s";
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "failed",
          exitCode: 1,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "pytest",
        sessionId: "pytest-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "test-runner");
    assert.equal(result.parser?.counts?.testsFailed, 2);
    assert.equal(result.parser?.counts?.testsPassed, 5);
    assert.equal(result.parser?.compressed, false);
    assert.equal(result.importantLines?.[0].excerpt, stdout);
    assert.equal(await readOutputText(vault, "pytest-session", result.outputId, "stdout"), stdout);
  });
});

test("TypeScript diagnostics parser preserves exact file references", async () => {
  await withTempVault(async (vault) => {
    const stdout = [
      "src/router.ts(12,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/other.ts(4,1): error TS6133: 'unused' is declared but its value is never read.",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "failed",
          exitCode: 2,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm run typecheck",
        sessionId: "tsc-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "typescript-lint");
    assert.equal(result.parser?.counts?.errors, 2);
    assert.equal(result.parser?.compressed, false);
    assert.equal(result.parser?.references?.[0].path, "src/router.ts");
    assert.equal(result.parser?.references?.[0].line, 12);
    assert.equal(result.parser?.references?.[0].column, 7);
    assert.equal(result.parser?.references?.[0].code, "TS2322");
    assert.equal(result.importantLines?.[0].stream, "stdout");
    assert.equal(result.importantLines?.[0].excerpt, stdout);
    assert.equal(await readOutputText(vault, "tsc-session", result.outputId, "stdout"), stdout);
  });
});

test("ESLint stylish diagnostics parser preserves exact file references", async () => {
  await withTempVault(async (vault) => {
    const stdout = [
      "/repo/src/a.ts",
      "  1:7  error  x is assigned a value but never used  no-unused-vars",
      "",
      "✖ 1 problem (1 error, 0 warnings)",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "failed",
          exitCode: 1,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm run lint",
        sessionId: "eslint-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "typescript-lint");
    assert.equal(result.parser?.references?.[0].path, "/repo/src/a.ts");
    assert.equal(result.parser?.references?.[0].line, 1);
    assert.equal(result.parser?.references?.[0].column, 7);
    assert.equal(result.parser?.references?.[0].code, "no-unused-vars");
    assert.match(result.importantLines?.[0].excerpt ?? "", /\/repo\/src\/a\.ts/);
    assert.match(result.importantLines?.[0].excerpt ?? "", /no-unused-vars/);
    assert.equal(await readOutputText(vault, "eslint-session", result.outputId, "stdout"), stdout);
  });
});

test("build parser preserves toolchain error blocks without test-runner mislabeling", async () => {
  await withTempVault(async (vault) => {
    const stderr = [
      "Build failed",
      "Error: Cannot find module '@freeflow/router'",
      "    at src/index.ts:1:1",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout: "",
          stderr,
          executionStatus: "failed",
          exitCode: 1,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm run build",
        sessionId: "build-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "build-toolchain");
    assert.match(result.importantLines?.[0].excerpt ?? "", /Cannot find module/);
    assert.equal(await readOutputText(vault, "build-session", result.outputId, "stderr"), stderr);
  });
});

test("build parser matches npm ERR toolchain failures", async () => {
  await withTempVault(async (vault) => {
    const stderr = [
      "npm ERR! code ERESOLVE",
      "npm ERR! ERESOLVE unable to resolve dependency tree",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout: "",
          stderr,
          executionStatus: "failed",
          exitCode: 1,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm install",
        sessionId: "npm-err-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "build-toolchain");
    assert.match(result.importantLines?.[0].excerpt ?? "", /npm ERR! code ERESOLVE/);
    assert.equal(await readOutputText(vault, "npm-err-session", result.outputId, "stderr"), stderr);
  });
});

test("successful command output mentioning build tools uses generic fallback", async () => {
  await withTempVault(async (vault) => {
    const stdout = '  "typescript": "^5.8.3"';
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "grep -R typescript package.json",
        sessionId: "grep-typescript-session",
        vaultRoot: vault.root,
        preserve: "important",
        storagePolicy: "store-everything",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "generic");
    assert.equal(result.importantLines?.[0].excerpt, stdout);
    assert.equal(await readOutputText(vault, "grep-typescript-session", result.outputId, "stdout"), stdout);
  });
});

test("non-build runtime errors use the generic fallback", async () => {
  await withTempVault(async (vault) => {
    const stderr = ["Error: bad input", "    at script.js:1:1"].join("\n");
    const runner = {
      async run() {
        return {
          stdout: "",
          stderr,
          executionStatus: "failed",
          exitCode: 1,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "node script.js",
        sessionId: "runtime-error-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "generic");
    assert.equal(result.importantLines?.[0].stream, "stderr");
    assert.equal(result.importantLines?.[0].excerpt, stderr);
    assert.equal(await readOutputText(vault, "runtime-error-session", result.outputId, "stderr"), stderr);
  });
});

test("git output parser leaves non-status git output to generic fallback", async () => {
  await withTempVault(async (vault) => {
    const stdout = ["abc123 initial commit", "def456 add parser"].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "git log --oneline -2",
        sessionId: "git-log-session",
        vaultRoot: vault.root,
        preserve: "important",
        storagePolicy: "store-everything",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "generic");
    assert.equal(result.importantLines?.[0].excerpt, stdout);
    assert.equal(await readOutputText(vault, "git-log-session", result.outputId, "stdout"), stdout);
  });
});

test("git porcelain status counts common status forms", async () => {
  await withTempVault(async (vault) => {
    const stdout = [" M src/a.ts", "A  src/b.ts", " D src/c.ts", "?? src/d.ts"].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "git status --short",
        sessionId: "git-porcelain-session",
        vaultRoot: vault.root,
        thresholds: { largeOutputLines: 1, largeOutputBytes: 100_000 },
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "git-status-diffstat");
    assert.equal(result.parser?.counts?.modified, 1);
    assert.equal(result.parser?.counts?.added, 1);
    assert.equal(result.parser?.counts?.deleted, 1);
    assert.equal(result.parser?.counts?.untracked, 1);
    assert.equal(await readOutputText(vault, "git-porcelain-session", result.outputId, "stdout"), stdout);
  });
});

test("combined git status and diffstat output preserves status evidence when routed", async () => {
  await withTempVault(async (vault) => {
    const stdout = [
      " M src/a.ts",
      "?? src/new.ts",
      " a.ts | 2 ++",
      " b.ts | 2 ++",
      " c.ts | 2 ++",
      " d.ts | 2 ++",
      " e.ts | 2 ++",
      " f.ts | 2 ++",
      " g.ts | 2 ++",
      " h.ts | 2 ++",
      " 8 files changed, 16 insertions(+)",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "git status --short && git diff --stat",
        sessionId: "combined-git-session",
        vaultRoot: vault.root,
        thresholds: { largeOutputLines: 1, largeOutputBytes: 100_000 },
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.parser?.name, "git-status-diffstat");
    assert.equal(result.parser?.compressed, true);
    assert.equal(result.parser?.counts?.modified, 1);
    assert.equal(result.parser?.counts?.untracked, 1);
    assert.match(result.importantLines?.[0].excerpt ?? "", / M src\/a\.ts/);
    assert.match(result.importantLines?.[0].excerpt ?? "", /\?\? src\/new\.ts/);
    assert.doesNotMatch(result.importantLines?.[0].excerpt ?? "", /8 files changed/);
    assert.equal(await readOutputText(vault, "combined-git-session", result.outputId, "stdout"), stdout);
  });
});

test("git output parser preserves exact status and diffstat lines", async () => {
  await withTempVault(async (vault) => {
    const stdout = [
      " FAIL.md | 2 ++",
      " plugins/freeflow/router/src/run.ts | 41 ++++++++++++++++++++----",
      " plugins/freeflow/router/src/schema.ts | 8 ++++++--",
      " 3 files changed, 45 insertions(+), 6 deletions(-)",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "git status --short && git diff --stat",
        sessionId: "git-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.parser?.name, "git-status-diffstat");
    assert.equal(result.parser?.counts?.filesChanged, 3);
    assert.match(result.importantLines?.[0].excerpt ?? "", /FAIL\.md/);
    assert.match(result.importantLines?.[0].excerpt ?? "", /plugins\/freeflow\/router\/src\/run\.ts/);
    assert.match(result.importantLines?.[0].excerpt ?? "", /plugins\/freeflow\/router\/src\/schema\.ts/);
    assert.match(result.importantLines?.[0].excerpt ?? "", /3 files changed/);
    assert.equal(await readOutputText(vault, "git-session", result.outputId, "stdout"), stdout);
  });
});

test("generic failed command returns late diagnostic evidence", async () => {
  await withTempVault(async (vault) => {
    const stderr = [
      ...Array.from({ length: 20 }, (_, index) => `setup line ${index + 1}`),
      "FATAL_ROOT_CAUSE unique failure diagnostic",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout: "",
          stderr,
          executionStatus: "failed",
          exitCode: 1,
          durationMs: 20,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "custom-tool --not-a-known-parser",
        sessionId: "generic-late-failure-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.parser?.name, "generic");
    assert.equal(result.importantLines?.[0].stream, "stderr");
    const evidenceText = result.importantLines?.map((line) => line.excerpt).join("\n") ?? "";
    assert.match(evidenceText, /FATAL_ROOT_CAUSE unique failure diagnostic/);
    assert.doesNotMatch(evidenceText, /setup line 1\nsetup line 2\nsetup line 3\nsetup line 4\nsetup line 5\nsetup line 6\nsetup line 7\nsetup line 8/);
    assert.equal(await readOutputText(vault, "generic-late-failure-session", result.outputId, "stderr"), stderr);
  });
});

test("failed command returns exact stderr evidence and raw output id", async () => {
  await withTempVault(async (vault) => {
    const runner = {
      async run() {
        return {
          stdout: "214 passing\n",
          stderr: "FAIL target test\nexpected true to equal false\nstack line\n",
          executionStatus: "failed",
          exitCode: 1,
          durationMs: 20,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm test",
        sessionId: "failed-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.execution.exitCode, 1);
    assert.equal(result.routing.status, "routed");
    assert.match(result.summary, /failed|Test runner/);
    assert.equal(result.parser?.name, "test-runner");
    assert.ok((result.parser?.confidence ?? 0) >= 0.9);
    assert.equal(result.importantLines?.[0].stream, "stderr");
    assert.equal(
      result.importantLines?.[0].excerpt,
      "FAIL target test\nexpected true to equal false\nstack line\n",
    );
    assert.equal(result.recovery?.outputId, result.outputId);
    assert.equal(
      await readOutputText(vault, "failed-session", result.outputId, "stderr"),
      "FAIL target test\nexpected true to equal false\nstack line\n",
    );
  });
});

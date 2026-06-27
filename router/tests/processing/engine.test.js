import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import { loadProcessingSource, processSource } from "../../dist/processing/engine.js";
import { SCRIPT_SANDBOX_REQUIRED_PROOFS } from "../../dist/sandbox/script-sandbox.js";
import { freeflowRun } from "../../dist/tools/run.js";
import { createVault, readOutputText } from "../../dist/vault/vault.js";

function testOutputSample() {
  return [
    " RUN  v2.1.8 /repo",
    " ✗ src/components/UserList.test.tsx (4 tests) 234ms",
    "   ✗ handles empty state 156ms",
    " ✗ src/components/DataGrid.test.tsx (5 tests) 345ms",
    "   ✗ filters with complex queries 198ms",
    " Test Files  2 failed | 28 passed (30)",
    " Tests       2 failed | 110 passed (112)",
  ].join("\n");
}

function accessLogSample() {
  return [
    '192.168.1.1 - - [23/Feb/2026:10:00:01 +0000] "GET /api/a HTTP/1.1" 200 892 100ms',
    '192.168.1.2 - - [23/Feb/2026:10:00:02 +0000] "GET /api/b HTTP/1.1" 200 892 200ms',
    '192.168.1.3 - - [23/Feb/2026:10:00:03 +0000] "POST /api/c HTTP/1.1" 500 892 1200ms',
    '192.168.1.4 - - [23/Feb/2026:10:00:04 +0000] "GET /api/d HTTP/1.1" 404 892 20ms',
    '192.168.1.5 - - [23/Feb/2026:10:00:05 +0000] "GET /api/e HTTP/1.1" 201 892 300ms',
  ].join("\n");
}

function provenScriptAdapter({ id = "processing-test-sandbox", execute }) {
  return {
    id,
    version: "test",
    languages: ["javascript"],
    async probe() {
      return {
        status: "available",
        reason: "test adapter passed proof suite",
        passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        failedProofs: [],
        runtime: { name: "test-js", version: "1" },
      };
    },
    execute,
  };
}

function fixtureRunner() {
  return {
    async run(request) {
      if (request.command === "emit vault source") {
        return {
          stdout: "VAULT_SOURCE_TOKEN\nsecond line\n",
          stderr: "",
          combined: "VAULT_SOURCE_TOKEN\nsecond line\n",
          executionStatus: "success",
          exitCode: 0,
          durationMs: 1,
        };
      }
      return {
        stdout: "",
        stderr: "unknown command\n",
        combined: "unknown command\n",
        executionStatus: "failed",
        exitCode: 127,
        durationMs: 1,
      };
    },
  };
}

test("processing engine loads repo file sources and returns fact-first source metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-repo-"));
  try {
    await writeFile(join(root, "input.log"), "alpha\nbeta\n", "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "input.log" });

    assert.equal(result.status, "ok");
    assert.equal(result.source.ref.kind, "repo");
    assert.equal(result.source.displayPath, "input.log");
    assert.equal(result.visibleText.split("\n")[0], "source.kind: repo-file");
    assert.doesNotMatch(result.visibleText, /processing source loaded/);
    assert.deepEqual(result.facts.map((fact) => fact.name), [
      "source.kind",
      "source.path",
      "source.bytes",
      "source.lines",
      "source.sha256",
    ]);
    assert.equal(result.reducer.status, "not_selected");
    assert.equal(result.script.status, "not_configured");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine blocks repo path escapes and symlink escapes without reading content", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-containment-"));
  const outside = await mkdtemp(join(tmpdir(), "freeflow-processing-outside-"));
  try {
    await writeFile(join(root, "safe.txt"), "SAFE_TOKEN\n", "utf8");
    await writeFile(join(outside, "secret.txt"), "OUTSIDE_SECRET_TOKEN\n", "utf8");
    await symlink(join(outside, "secret.txt"), join(root, "secret-link.txt"));

    const parentEscape = await loadProcessingSource({ kind: "repo-file", root, path: relative(root, join(outside, "secret.txt")) });
    assert.equal(parentEscape.status, "blocked");
    assert.equal(parentEscape.policy, "repo_containment");
    assert.doesNotMatch(parentEscape.reason, /OUTSIDE_SECRET_TOKEN/);

    const symlinkEscape = await loadProcessingSource({ kind: "repo-file", root, path: "secret-link.txt" });
    assert.equal(symlinkEscape.status, "blocked");
    assert.equal(symlinkEscape.policy, "repo_containment");
    assert.doesNotMatch(symlinkEscape.reason, /OUTSIDE_SECRET_TOKEN/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("processing engine selects test-output reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-test-output-"));
  try {
    await writeFile(join(root, "test-output.txt"), testOutputSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "test-output.txt" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "test-output");
    assert.equal(result.visibleText.split("\n")[0], "tests: 2 failed, 110 passed, (112)");
    assert.doesNotMatch(result.visibleText, /testFiles:/);
    assert.match(result.visibleText, /UserList\.test\.tsx/);
    assert.match(result.visibleText, /DataGrid\.test\.tsx/);
    assert.doesNotMatch(result.visibleText, /test-output summary/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine selects access-log reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-access-log-"));
  try {
    await writeFile(join(root, "access.log"), accessLogSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "access.log" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "access-log");
    assert.equal(result.visibleText.split("\n")[0], "requests: 5");
    assert.match(result.visibleText, /errors: 2/);
    assert.match(result.visibleText, /errorRatePercent: 40/);
    assert.match(result.visibleText, /status: 200:2, 201:1, 404:1, 500:1/);
    assert.match(result.visibleText, /slow>=1000ms: 1/);
    assert.doesNotMatch(result.visibleText, /access-log summary/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine executes requested script only through a proven sandbox adapter", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-script-available-"));
  const calls = [];
  try {
    await writeFile(join(root, "input.txt"), "alpha\nbeta\n", "utf8");
    const adapter = provenScriptAdapter({
      async execute(request) {
        calls.push(request);
        const sourceText = await readFile(request.sources[0].path, "utf8");
        assert.equal(request.network, "off");
        assert.equal(request.code, "SCRIPT_CODE_TOKEN_AVAILABLE");
        return {
          status: "success",
          stdout: `computedLines: ${sourceText.trim().split(/\r?\n/).length}\nfirst: ${sourceText.split(/\r?\n/)[0]}\n`,
          stderr: "",
          outputFiles: [],
          durationMs: 3,
        };
      },
    });

    const result = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      { script: { language: "javascript", code: "SCRIPT_CODE_TOKEN_AVAILABLE" }, scriptSandboxAdapters: [adapter] },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "executed");
    assert.equal(result.script.adapterId, "processing-test-sandbox");
    assert.equal(result.script.rawScriptPersistence, "disabled");
    assert.equal(result.script.noHostFallback, true);
    assert.equal(calls.length, 1);
    assert.equal(result.visibleText.split("\n")[0], "computedLines: 2");
    assert.match(result.visibleText, /script: javascript sandboxed adapter=processing-test-sandbox/);
    assert.equal(result.reducer.status, "not_selected");
    assert.doesNotMatch(JSON.stringify(result), /SCRIPT_CODE_TOKEN_AVAILABLE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine returns script-unavailable without unsandboxed fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-script-unavailable-"));
  let executeCalled = false;
  try {
    await writeFile(join(root, "access.log"), accessLogSample(), "utf8");
    const unprovenAdapter = {
      id: "unproven-processing-sandbox",
      version: "test",
      languages: ["javascript"],
      async probe() {
        return {
          status: "unavailable",
          reason: "proofs missing",
          passedProofs: [],
          failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        };
      },
      async execute() {
        executeCalled = true;
        throw new Error("must not execute");
      },
    };

    const result = await processSource(
      { kind: "repo-file", root, path: "access.log" },
      { script: { language: "javascript", code: "SCRIPT_CODE_TOKEN_UNAVAILABLE" }, scriptSandboxAdapters: [unprovenAdapter] },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "unavailable");
    assert.equal(result.script.noHostFallback, true);
    assert.equal(result.script.rawScriptPersistence, "disabled");
    assert.match(result.script.recommendation, /deterministic reducer|sandbox adapter/);
    assert.equal(executeCalled, false);
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.visibleText.split("\n")[0], "requests: 5");
    assert.match(result.visibleText, /script: unavailable; reducer fallback; no host fallback/);
    assert.doesNotMatch(JSON.stringify(result), /SCRIPT_CODE_TOKEN_UNAVAILABLE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine sanitizes script failure details and does not persist raw script text", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-script-failure-repo-"));
  const vaultRoot = await mkdtemp(join(tmpdir(), "freeflow-processing-script-failure-vault-"));
  try {
    await writeFile(join(root, "input.txt"), "alpha\n", "utf8");
    const failedAdapter = provenScriptAdapter({
      id: "failing-processing-sandbox",
      async execute() {
        return {
          status: "failed",
          reason: "compile failed near RAW_SCRIPT_SECRET_TOKEN_FAILURE",
          stdout: "",
          stderr: "RAW_SCRIPT_SECRET_TOKEN_FAILURE",
          outputFiles: [],
        };
      },
    });

    const failed = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      {
        sessionId: "processing-script-failure-test",
        vaultRoot,
        script: { language: "javascript", code: "RAW_SCRIPT_SECRET_TOKEN_FAILURE" },
        scriptSandboxAdapters: [failedAdapter],
      },
    );

    assert.equal(failed.status, "ok");
    assert.equal(failed.script.status, "failed");
    assert.match(failed.script.reason, /detail omitted/);
    assert.doesNotMatch(JSON.stringify(failed), /RAW_SCRIPT_SECRET_TOKEN_FAILURE/);
    assert.ok(failed.recovery?.outputId);
    const raw = await readOutputText(createVault({ root: vaultRoot }), "processing-script-failure-test", failed.recovery.outputId, "raw");
    assert.doesNotMatch(raw, /RAW_SCRIPT_SECRET_TOKEN_FAILURE/);

    const throwingAdapter = provenScriptAdapter({
      id: "throwing-processing-sandbox",
      async execute() {
        throw new Error("compile failed near RAW_SCRIPT_SECRET_TOKEN_THROW");
      },
    });
    const thrown = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      { script: { language: "javascript", code: "RAW_SCRIPT_SECRET_TOKEN_THROW" }, scriptSandboxAdapters: [throwingAdapter] },
    );

    assert.equal(thrown.status, "ok");
    assert.equal(thrown.script.status, "failed");
    assert.match(thrown.script.reason, /detail omitted/);
    assert.doesNotMatch(JSON.stringify(thrown), /RAW_SCRIPT_SECRET_TOKEN_THROW/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("processing engine does not persist raw script text by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-script-persist-repo-"));
  const vaultRoot = await mkdtemp(join(tmpdir(), "freeflow-processing-script-persist-vault-"));
  try {
    await writeFile(join(root, "input.txt"), "alpha\n", "utf8");
    const adapter = provenScriptAdapter({
      async execute() {
        return { status: "success", stdout: "computed: 1\n", stderr: "", outputFiles: [] };
      },
    });

    const result = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      {
        sessionId: "processing-script-persist-test",
        vaultRoot,
        script: { language: "javascript", code: "RAW_SCRIPT_SECRET_TOKEN" },
        scriptSandboxAdapters: [adapter],
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "executed");
    assert.ok(result.recovery?.outputId);
    assert.doesNotMatch(JSON.stringify(result), /RAW_SCRIPT_SECRET_TOKEN/);

    const raw = await readOutputText(createVault({ root: vaultRoot }), "processing-script-persist-test", result.recovery.outputId, "raw");
    assert.match(raw, /computed: 1/);
    assert.doesNotMatch(raw, /RAW_SCRIPT_SECRET_TOKEN/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("processing engine loads vault output sources with source lineage", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-vault-"));
  try {
    const sessionId = "processing-vault-test";
    const run = await freeflowRun(
      {
        command: "emit vault source",
        sessionId,
        vaultRoot: root,
        preserve: "full",
        goal: "processing fixture",
      },
      fixtureRunner(),
    );

    const result = await processSource(
      { kind: "vault-output", sessionId, vaultRoot: root, outputId: run.outputId, stream: "stdout" },
      { sessionId, vaultRoot: root },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.source.ref.kind, "vault");
    assert.equal(result.source.ref.outputId, run.outputId);
    assert.equal(result.source.stream, "stdout");
    assert.ok(result.lineage?.sourceOutputIds?.includes(run.outputId));
    assert.equal(result.persistence?.recoverability, "exact");
    assert.match(result.recovery?.how ?? "", /Recover processing result/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine defaults text vault records to raw stream", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-vault-text-"));
  const repo = await mkdtemp(join(tmpdir(), "freeflow-processing-vault-text-repo-"));
  try {
    await writeFile(join(repo, "input.txt"), "repo text\n", "utf8");
    const first = await processSource(
      { kind: "repo-file", root: repo, path: "input.txt" },
      { sessionId: "processing-vault-text-test", vaultRoot: root },
    );
    assert.equal(first.status, "ok");
    assert.ok(first.recovery?.outputId);

    const loaded = await loadProcessingSource({
      kind: "vault-output",
      sessionId: "processing-vault-text-test",
      vaultRoot: root,
      outputId: first.recovery.outputId,
    });

    assert.equal(loaded.status, "ok");
    assert.equal(loaded.source.stream, "raw");
    assert.match(loaded.text, /source.kind: repo-file/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
});

test("processing engine loads already captured command output and enforces source limits", async () => {
  const ok = await processSource({ kind: "command-output", stdout: "first\n", stderr: "warn\n", stream: "combined" });
  assert.equal(ok.status, "ok");
  assert.equal(ok.source.ref.kind, "native");
  assert.match(ok.visibleText, /source.lines:/);

  const limited = await processSource(
    { kind: "command-output", combined: "1234567890", stream: "combined" },
    { limits: { maxSourceBytes: 4 } },
  );
  assert.equal(limited.status, "blocked");
  assert.equal(limited.policy, "source_limit");
  assert.match(limited.visibleText, /source_limit/);
});

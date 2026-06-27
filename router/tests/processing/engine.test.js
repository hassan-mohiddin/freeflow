import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import { loadProcessingSource, processSource } from "../../dist/processing/engine.js";
import { freeflowRun } from "../../dist/tools/run.js";

function accessLogSample() {
  return [
    '192.168.1.1 - - [23/Feb/2026:10:00:01 +0000] "GET /api/a HTTP/1.1" 200 892 100ms',
    '192.168.1.2 - - [23/Feb/2026:10:00:02 +0000] "GET /api/b HTTP/1.1" 200 892 200ms',
    '192.168.1.3 - - [23/Feb/2026:10:00:03 +0000] "POST /api/c HTTP/1.1" 500 892 1200ms',
    '192.168.1.4 - - [23/Feb/2026:10:00:04 +0000] "GET /api/d HTTP/1.1" 404 892 20ms',
    '192.168.1.5 - - [23/Feb/2026:10:00:05 +0000] "GET /api/e HTTP/1.1" 201 892 300ms',
  ].join("\n");
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
    assert.match(result.visibleText, /processing source loaded/);
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

test("processing engine selects access-log reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-access-log-"));
  try {
    await writeFile(join(root, "access.log"), accessLogSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "access.log" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "access-log");
    assert.match(result.visibleText, /access-log summary/);
    assert.match(result.visibleText, /requests: 5/);
    assert.match(result.visibleText, /errors: 2 \(40\.0%\)/);
    assert.match(result.visibleText, /status: 200:2/);
    assert.match(result.visibleText, /slow>=1000ms: 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
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
    assert.match(loaded.text, /processing source loaded/);
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

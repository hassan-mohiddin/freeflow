import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createVault, freeflowRetrieve, storeCommandOutput } from "../dist/index.js";

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-vault-retrieve-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withFixtureRepo(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-repo-"));
  try {
    await writeFile(
      join(root, "router-notes.md"),
      [
        "# Router Notes",
        "",
        "Intro line that should not be enough by itself.",
        "",
        "## Output Router Skill",
        "",
        "The output router skill teaches tool choice without enforcement.",
        "It says freeflow_retrieve is for targeted evidence and freeflow_run is for noisy commands.",
        "Native read and bash remain available for intentional raw output.",
        "",
        ...Array.from({ length: 140 }, (_, index) => `filler line ${index + 1}`),
      ].join("\n"),
      "utf8",
    );

    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("querying vaulted command output returns exact matching failure evidence", async () => {
  await withTempVault(async (vault) => {
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-session",
      command: "npm test",
      stdout: "214 passing",
      stderr: [
        "FAIL first test",
        "first stack line",
        "",
        "FAIL second target test",
        "second stack line",
        "expected true to equal false",
      ].join("\n"),
      executionStatus: "failed",
      exitCode: 1,
      decisionIds: ["ffdec_run"],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const result = await freeflowRetrieve({
      action: "query",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-session",
        outputId: record.outputId,
        stream: "stderr",
      },
      query: "second target",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.equal(result.source?.kind, "vault");
    assert.equal(result.source?.outputId, record.outputId);
    assert.equal(result.evidence?.length, 1);

    const [evidence] = result.evidence;
    assert.equal(evidence.source.kind, "vault");
    assert.equal(evidence.source.outputId, record.outputId);
    assert.match(evidence.excerpt, /FAIL second target test/);
    assert.match(evidence.excerpt, /second stack line/);
    assert.ok(!evidence.excerpt.includes("214 passing"));
    assert.ok(result.recovery?.how.includes("outputId"));
  });
});

test("querying vaulted command output with a huge line returns bounded evidence", async () => {
  await withTempVault(async (vault) => {
    const stdout = `${"VAULT_HUGE_QUERY_MARKER repeated evidence ".repeat(6000)}VAULT_QUERY_TAIL_SENTINEL_SHOULD_NOT_APPEAR`;
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-huge-query-session",
      command: "npm test",
      stdout,
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const result = await freeflowRetrieve({
      action: "query",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-huge-query-session",
        outputId: record.outputId,
        stream: "stdout",
      },
      query: "VAULT_HUGE_QUERY_MARKER",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.match(result.evidence[0].excerpt, /VAULT_HUGE_QUERY_MARKER/);
    assert.doesNotMatch(result.evidence[0].excerpt, /VAULT_QUERY_TAIL_SENTINEL_SHOULD_NOT_APPEAR/);
    assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") <= 8_192);
  });
});

test("expanding vaulted output evidence widens the same stream", async () => {
  await withTempVault(async (vault) => {
    const stderr = Array.from({ length: 50 }, (_, index) =>
      index === 24 ? "line 25 target failure marker" : `line ${index + 1}`,
    ).join("\n");
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-expand-session",
      command: "npm test",
      stdout: "",
      stderr,
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-16T00:00:00.000Z",
    });
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-expand-session",
        outputId: record.outputId,
        stream: "stderr",
      },
      query: "target failure marker",
      preserve: "important",
    });
    const [evidence] = queryResult.evidence;

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-expand-session",
        outputId: record.outputId,
        stream: "stderr",
      },
      evidence,
      expansion: "lines_30",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.evidence?.length, 1);
    const [expandedEvidence] = expanded.evidence;
    assert.equal(expandedEvidence.id, evidence.id);
    assert.equal(expandedEvidence.source.kind, "vault");
    assert.equal(expandedEvidence.lines, "1-50");
    assert.equal(expandedEvidence.window, "lines_30");
    assert.match(expandedEvidence.excerpt, /line 1/);
    assert.match(expandedEvidence.excerpt, /line 50/);
  });
});

test("expanding vaulted output evidence with a huge line returns bounded evidence", async () => {
  await withTempVault(async (vault) => {
    const stdout = `${"VAULT_HUGE_EXPAND_MARKER repeated evidence ".repeat(6000)}VAULT_EXPAND_TAIL_SENTINEL_SHOULD_NOT_APPEAR`;
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-huge-expand-session",
      command: "npm test",
      stdout,
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-16T00:00:00.000Z",
    });
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-huge-expand-session",
        outputId: record.outputId,
        stream: "stdout",
      },
      query: "VAULT_HUGE_EXPAND_MARKER",
      preserve: "important",
    });
    const [evidence] = queryResult.evidence;

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-huge-expand-session",
        outputId: record.outputId,
        stream: "stdout",
      },
      evidence,
      expansion: "lines_30",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.evidence?.length, 1);
    assert.match(expanded.evidence[0].excerpt, /VAULT_HUGE_EXPAND_MARKER/);
    assert.doesNotMatch(expanded.evidence[0].excerpt, /VAULT_EXPAND_TAIL_SENTINEL_SHOULD_NOT_APPEAR/);
    assert.ok(Buffer.byteLength(expanded.evidence[0].excerpt, "utf8") <= 32 * 1024);
  });
});

test("expanding vaulted output evidence to full over cap returns bounded chunks", async () => {
  await withTempVault(async (vault) => {
    const stdout = `${"VAULT_EXPAND_FULL_MARKER repeated evidence ".repeat(6000)}VAULT_EXPAND_FULL_TAIL_SENTINEL_SHOULD_NOT_APPEAR`;
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-expand-full-session",
      command: "npm test",
      stdout,
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-16T00:00:00.000Z",
    });
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-expand-full-session",
        outputId: record.outputId,
        stream: "stdout",
      },
      query: "VAULT_EXPAND_FULL_MARKER",
      preserve: "important",
    });
    const [evidence] = queryResult.evidence;

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-expand-full-session",
        outputId: record.outputId,
        stream: "stdout",
      },
      evidence,
      expansion: "full",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.routing.status, "partial");
    assert.equal(expanded.evidence?.length, 1);
    assert.match(expanded.evidence[0].excerpt, /VAULT_EXPAND_FULL_MARKER/);
    assert.doesNotMatch(expanded.evidence[0].excerpt, /VAULT_EXPAND_FULL_TAIL_SENTINEL_SHOULD_NOT_APPEAR/);
    assert.ok(Buffer.byteLength(expanded.evidence[0].excerpt, "utf8") <= 32_000);
  });
});

test("expanding vaulted output with many short lines labels the bounded line window", async () => {
  await withTempVault(async (vault) => {
    const stdout = Array.from({ length: 260 }, (_, index) => `vault short line ${index + 1}`).join("\n");
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-many-short-expand-session",
      command: "npm test",
      stdout,
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-many-short-expand-session",
        outputId: record.outputId,
        stream: "stdout",
      },
      evidence: {
        id: "ev_many_vault_lines",
        source: { kind: "vault", outputId: record.outputId, stream: "stdout" },
        path: `${record.outputId}:stdout`,
        lines: "1-200",
        excerpt: "vault short line 1",
        why: "fixture",
        window: "small",
        expandable: true,
      },
      expansion: "lines_30",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.evidence?.length, 1);
    assert.equal(expanded.evidence[0].lines, "1-120");
    assert.match(expanded.routing.reason, /1-120/);
    assert.match(expanded.evidence[0].why, /line cap/);
    assert.match(expanded.evidence[0].excerpt, /vault short line 120/);
    assert.doesNotMatch(expanded.evidence[0].excerpt, /vault short line 121/);
  });
});

test("explaining vaulted output returns stored command decision context", async () => {
  await withTempVault(async (vault) => {
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-explain-session",
      command: "npm test",
      stdout: "214 passing",
      stderr: "1 failing",
      executionStatus: "failed",
      exitCode: 1,
      decisionIds: ["ffdec_run_123"],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const result = await freeflowRetrieve({
      action: "explain",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-explain-session",
        outputId: record.outputId,
      },
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.match(result.routing.reason, new RegExp(record.outputId));
    assert.match(result.routing.reason, /executionStatus=failed/);
    assert.ok(result.recovery?.how.includes("stream"));
    assert.equal(result.recovery?.outputId, record.outputId);
  });
});

test("retrieving vaulted command output returns exact requested lines", async () => {
  await withTempVault(async (vault) => {
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-lines-session",
      command: "npm test",
      stdout: "one\ntwo\nthree",
      stderr: "alpha\nbeta\ngamma",
      combined: "one\ntwo\nthree\nalpha\nbeta\ngamma",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const result = await freeflowRetrieve({
      action: "retrieve",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-lines-session",
        outputId: record.outputId,
        stream: "combined",
      },
      lineRange: { start: 2, end: 5 },
      preserve: "full",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.preserve, "full");
    assert.equal(result.evidence?.length, 1);
    const [evidence] = result.evidence;
    assert.equal(evidence.lines, "2-5");
    assert.equal(evidence.window, "exact");
    assert.equal(evidence.excerpt, "two\nthree\nalpha\nbeta");
    assert.equal(evidence.source.kind, "vault");
    assert.equal(evidence.source.outputId, record.outputId);
  });
});

test("retrieving vaulted command output over cap returns bounded previews", async () => {
  await withTempVault(async (vault) => {
    const combined = Array.from({ length: 5000 }, (_, index) => `vault over cap line ${index + 1}`).join("\n");
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-over-cap-lines-session",
      command: "npm test",
      stdout: combined,
      stderr: "",
      combined,
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const result = await freeflowRetrieve({
      action: "retrieve",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-over-cap-lines-session",
        outputId: record.outputId,
        stream: "combined",
      },
      lineRange: { start: 1, end: 5000 },
      preserve: "full",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.evidence?.length, 2);
    assert.match(result.evidence[0].excerpt, /vault over cap line 1/);
    assert.match(result.evidence[1].excerpt, /vault over cap line 5000/);
    assert.doesNotMatch(JSON.stringify(result), /vault over cap line 2500/);
    assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") < Buffer.byteLength(combined, "utf8"));
  });
});

test("retrieving repo files honors exact line ranges", async () => {
  await withFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "router-notes.md" },
      lineRange: { start: 5, end: 8 },
      preserve: "full",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.preserve, "full");
    assert.equal(result.evidence?.length, 1);
    const [evidence] = result.evidence;
    assert.equal(evidence.path, "router-notes.md");
    assert.equal(evidence.lines, "5-8");
    assert.equal(evidence.window, "exact");
    assert.equal(
      evidence.excerpt,
      [
        "## Output Router Skill",
        "",
        "The output router skill teaches tool choice without enforcement.",
        "It says freeflow_retrieve is for targeted evidence and freeflow_run is for noisy commands.",
      ].join("\n"),
    );
  });
});

test("repo retrieval rejects paths outside the repo root", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-safe-root-"));
  const outside = await mkdtemp(join(tmpdir(), "freeflow-router-outside-"));
  try {
    await writeFile(join(root, "inside.md"), "inside", "utf8");
    await writeFile(join(outside, "secret.md"), "SECRET_OUTSIDE_REPO", "utf8");

    const relativeEscape = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "../secret.md" },
      preserve: "important",
    });
    assert.equal(relativeEscape.toolStatus, "error");
    assert.doesNotMatch(JSON.stringify(relativeEscape), /SECRET_OUTSIDE_REPO/);

    const absoluteEscape = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: join(outside, "secret.md") },
      preserve: "important",
    });
    assert.equal(absoluteEscape.toolStatus, "error");
    assert.doesNotMatch(JSON.stringify(absoluteEscape), /SECRET_OUTSIDE_REPO/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("repo retrieval rejects symlink escapes outside the repo root", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-safe-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "freeflow-router-safe-symlink-outside-"));
  try {
    await writeFile(join(outside, "secret.md"), "SECRET_SYMLINK_OUTSIDE_REPO", "utf8");
    await symlink(join(outside, "secret.md"), join(root, "secret-link.md"));

    const result = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "secret-link.md" },
      preserve: "important",
    });

    assert.equal(result.toolStatus, "error");
    assert.doesNotMatch(JSON.stringify(result), /SECRET_SYMLINK_OUTSIDE_REPO/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("repo traversal skips symlink directory cycles", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-symlink-cycle-"));
  try {
    await writeFile(join(root, "inside.md"), "cycle safe output router evidence", "utf8");
    await symlink(root, join(root, "loop"));

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "cycle safe output router evidence",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "inside.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repo and vault read failures return structured errors", async () => {
  await withFixtureRepo(async (root) => {
    const repoMissing = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "missing.md" },
      preserve: "important",
    });

    assert.equal(repoMissing.toolStatus, "error");
    assert.equal(repoMissing.routing.status, "failed");
  });

  await withTempVault(async (vault) => {
    const vaultMissing = await freeflowRetrieve({
      action: "retrieve",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "missing-session",
        outputId: "ffout_missing",
        stream: "stdout",
      },
      lineRange: { start: 1, end: 1 },
      preserve: "important",
    });

    assert.equal(vaultMissing.toolStatus, "error");
    assert.equal(vaultMissing.routing.status, "failed");
  });
});

test("repo query and locate support bounded top-k candidates", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-top-k-"));
  try {
    await writeFile(join(root, "first.md"), "# First\nshared output router target alpha", "utf8");
    await writeFile(join(root, "second.md"), "# Second\nshared output router target beta", "utf8");

    const query = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "shared output router target",
      topK: 2,
      preserve: "important",
    });

    assert.equal(query.toolStatus, "ok");
    assert.equal(query.evidence?.length, 2);
    assert.deepEqual(new Set(query.evidence.map((packet) => packet.path)), new Set(["first.md", "second.md"]));

    const locate = await freeflowRetrieve({
      action: "locate",
      source: { kind: "repo", root },
      query: "shared output router target",
      preserve: "important",
    });

    assert.equal(locate.toolStatus, "ok");
    assert.ok((locate.evidence?.length ?? 0) >= 2);
    assert.ok((locate.evidence?.length ?? 0) <= 5);
    assert.ok(locate.evidence.every((packet) => packet.excerpt.length <= 8_192));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repo scanner skips generated directories during broad retrieval", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-generated-dir-"));
  try {
    await mkdir(join(root, "sdk/python/src/openai_codex/generated"), { recursive: true });
    await mkdir(join(root, "codex-rs/protocol/src"), { recursive: true });
    await writeFile(
      join(root, "codex-rs/protocol/src/models.rs"),
      "pub enum SandboxPermissions { UseDefault, RequireEscalated, WithAdditionalPermissions }",
      "utf8",
    );
    await writeFile(
      join(root, "sdk/python/src/openai_codex/generated/v2_all.py"),
      `${"SandboxPermissions RequireEscalated WithAdditionalPermissions UseDefault generated client ".repeat(100)}`,
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "SandboxPermissions WithAdditionalPermissions RequireEscalated UseDefault",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.[0].path, "codex-rs/protocol/src/models.rs");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repo scanner prefers code symbol definitions over repeated usage decoys", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-symbol-definition-"));
  try {
    await mkdir(join(root, "codex-rs/protocol/src"), { recursive: true });
    await mkdir(join(root, "codex-rs/core/src/tools/runtimes/shell"), { recursive: true });
    await writeFile(
      join(root, "codex-rs/protocol/src/models.rs"),
      [
        "/// Controls the per-command sandbox override requested by a shell-like tool call.",
        "pub enum SandboxPermissions {",
        "    /// Run with the turn's configured sandbox policy unchanged.",
        "    UseDefault,",
        "    /// Request to run outside the sandbox.",
        "    RequireEscalated,",
        "    /// Request to stay in the sandbox while widening permissions for this command only.",
        "    WithAdditionalPermissions,",
        "}",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "codex-rs/core/src/tools/runtimes/shell/unix_escalation.rs"),
      `${"SandboxPermissions RequireEscalated WithAdditionalPermissions UseDefault unrelated runtime usage ".repeat(40)}`,
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "SandboxPermissions WithAdditionalPermissions RequireEscalated UseDefault",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.[0].path, "codex-rs/protocol/src/models.rs");
    assert.match(result.evidence?.[0].excerpt ?? "", /pub enum SandboxPermissions/);
    assert.match(result.evidence?.[0].excerpt ?? "", /WithAdditionalPermissions/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repo scanner uses path and source priors to avoid test decoys", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-source-prior-"));
  try {
    await mkdir(join(root, "codex-rs/core/src/config"), { recursive: true });
    await writeFile(
      join(root, "codex-rs/core/src/config/network_proxy_spec.rs"),
      [
        "pub struct NetworkProxySpec {",
        "    pub host: String,",
        "}",
        "impl NetworkProxySpec {",
        "    pub fn parse() {}",
        "}",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "codex-rs/core/src/config/network_proxy_spec_tests.rs"),
      `${"NetworkProxySpec config network proxy spec test expectation ".repeat(60)}`,
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "NetworkProxySpec config network proxy spec",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.[0].path, "codex-rs/core/src/config/network_proxy_spec.rs");
    assert.match(result.evidence?.[0].excerpt ?? "", /NetworkProxySpec/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repo scanner boosts explicit path intent for thin entrypoint modules", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-path-intent-"));
  try {
    await mkdir(join(root, "codex-rs/prompts/src"), { recursive: true });
    await mkdir(join(root, "codex-rs/core/src"), { recursive: true });
    await writeFile(
      join(root, "codex-rs/prompts/src/lib.rs"),
      [
        "mod apply_patch;",
        "",
        "pub use apply_patch::APPLY_PATCH_TOOL_INSTRUCTIONS;",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "codex-rs/core/src/apply_patch.rs"),
      `${"apply_patch prompt codex patch implementation details ".repeat(80)}`,
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "apply_patch prompt codex prompts lib",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.[0].path, "codex-rs/prompts/src/lib.rs");
    assert.match(result.evidence?.[0].excerpt ?? "", /APPLY_PATCH_TOOL_INSTRUCTIONS/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid repo topK returns a structured error", async () => {
  await withFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "output router skill",
      topK: 11,
      preserve: "important",
    });

    assert.equal(result.toolStatus, "error");
    assert.match(result.routing.reason, /topK/);
  });
});

test("retrieving repo files over cap returns bounded previews", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-repo-line-range-cap-"));
  try {
    const text = Array.from({ length: 5000 }, (_, index) => `repo over cap line ${index + 1}`).join("\n");
    await writeFile(join(root, "big.md"), text, "utf8");

    const result = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "big.md" },
      lineRange: { start: 1, end: 5000 },
      preserve: "full",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.evidence?.length, 2);
    assert.match(result.evidence[0].excerpt, /repo over cap line 1/);
    assert.match(result.evidence[1].excerpt, /repo over cap line 5000/);
    assert.doesNotMatch(JSON.stringify(result), /repo over cap line 2500/);
    assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") < Buffer.byteLength(text, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("querying repo files returns bounded evidence instead of a whole file", async () => {
  await withFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "output router skill tool choice",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.equal(result.routing.route, "retrieve");
    assert.equal(result.preserve, "important");
    assert.ok(result.decisionId.startsWith("ffdec_"));
    assert.ok(result.recovery?.how.includes("expand"));
    assert.equal(result.evidence?.length, 1);

    const [evidence] = result.evidence;
    assert.equal(evidence.source.kind, "repo");
    assert.equal(evidence.path, "router-notes.md");
    assert.match(evidence.excerpt, /output router skill teaches tool choice/);
    assert.ok(!evidence.excerpt.includes("filler line 140"));
    assert.ok(evidence.excerpt.length < 700);
  });
});

test("expanding repo evidence over cap returns bounded output", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-repo-expand-cap-"));
  try {
    await writeFile(
      join(root, "huge-line.md"),
      [
        "# Huge Line",
        `${"EXPAND_HUGE_MARKER repeated evidence ".repeat(6000)}EXPAND_TAIL_SENTINEL_SHOULD_NOT_APPEAR`,
      ].join("\n"),
      "utf8",
    );

    const queryResult = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "EXPAND_HUGE_MARKER",
      preserve: "important",
    });
    const [evidence] = queryResult.evidence;

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: { kind: "repo", root },
      evidence,
      expansion: "lines_30",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.evidence?.length, 1);
    assert.equal(expanded.evidence[0].window, "lines_30");
    assert.match(expanded.evidence[0].excerpt, /EXPAND_HUGE_MARKER/);
    assert.doesNotMatch(expanded.evidence[0].excerpt, /EXPAND_TAIL_SENTINEL_SHOULD_NOT_APPEAR/);
    assert.ok(Buffer.byteLength(expanded.evidence[0].excerpt, "utf8") <= 32 * 1024);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expanding repo evidence widens the same evidence packet", async () => {
  await withFixtureRepo(async (root) => {
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "output router skill tool choice",
      preserve: "important",
    });
    const [evidence] = queryResult.evidence;

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: { kind: "repo", root },
      evidence,
      expansion: "lines_30",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.routing.status, "routed");
    assert.equal(expanded.evidence?.length, 1);
    const [expandedEvidence] = expanded.evidence;
    assert.equal(expandedEvidence.id, evidence.id);
    assert.equal(expandedEvidence.path, evidence.path);
    assert.equal(expandedEvidence.window, "lines_30");
    assert.ok(expandedEvidence.excerpt.length > evidence.excerpt.length);
    assert.match(expandedEvidence.excerpt, /filler line 25/);
    assert.ok(!expandedEvidence.excerpt.includes("filler line 140"));
  });
});

test("expanding repo evidence to full over cap returns bounded chunks", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-repo-expand-full-cap-"));
  try {
    await writeFile(
      join(root, "huge-full-expand.md"),
      [
        "# Huge Full Expand",
        `${"EXPAND_FULL_HUGE_MARKER repeated evidence ".repeat(6000)}EXPAND_FULL_TAIL_SENTINEL_SHOULD_NOT_APPEAR`,
      ].join("\n"),
      "utf8",
    );
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "EXPAND_FULL_HUGE_MARKER",
      preserve: "important",
    });
    const [evidence] = queryResult.evidence;

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: { kind: "repo", root },
      evidence,
      expansion: "full",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.routing.status, "partial");
    assert.equal(expanded.evidence?.length, 2);
    const expandedText = expanded.evidence.map((packet) => packet.excerpt).join("\n");
    assert.match(expandedText, /EXPAND_FULL_HUGE_MARKER/);
    assert.doesNotMatch(expandedText, /EXPAND_FULL_TAIL_SENTINEL_SHOULD_NOT_APPEAR/);
    assert.ok(expanded.evidence.every((packet) => Buffer.byteLength(packet.excerpt, "utf8") <= 32_000));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserve full over cap keeps a huge final tail line recoverable", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-full-tail-line-cap-"));
  try {
    const lines = [
      ...Array.from({ length: 99 }, (_, index) => `ordinary line ${index + 1}`),
      `${"FULL_HUGE_FINAL_LINE_MARKER repeated evidence ".repeat(6000)}FULL_FINAL_TAIL_SENTINEL_SHOULD_NOT_APPEAR`,
    ];
    await writeFile(join(root, "tail-line.md"), lines.join("\n"), "utf8");

    const result = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "tail-line.md" },
      preserve: "full",
      maxFullBytes: 400,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.evidence?.length, 2);
    const tail = result.evidence.at(-1);
    assert.equal(tail.lines, "100-100");
    assert.match(tail.excerpt, /FULL_HUGE_FINAL_LINE_MARKER/);
    assert.doesNotMatch(tail.excerpt, /FULL_FINAL_TAIL_SENTINEL_SHOULD_NOT_APPEAR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expanding repo evidence with many short lines labels the bounded line window", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-repo-many-short-expand-"));
  try {
    await writeFile(
      join(root, "many-short.md"),
      Array.from({ length: 260 }, (_, index) => `repo short line ${index + 1}`).join("\n"),
      "utf8",
    );

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: { kind: "repo", root },
      evidence: {
        id: "ev_many_repo_lines",
        source: { kind: "repo", path: "many-short.md" },
        path: "many-short.md",
        lines: "1-200",
        excerpt: "repo short line 1",
        why: "fixture",
        window: "small",
        expandable: true,
      },
      expansion: "lines_30",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.evidence?.length, 1);
    assert.equal(expanded.evidence[0].lines, "1-120");
    assert.match(expanded.routing.reason, /1-120/);
    assert.match(expanded.evidence[0].why, /line cap/);
    assert.match(expanded.evidence[0].excerpt, /repo short line 120/);
    assert.doesNotMatch(expanded.evidence[0].excerpt, /repo short line 121/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserve full over cap with one huge line returns bounded valid chunks", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-full-one-line-cap-"));
  try {
    await writeFile(
      join(root, "one-line.md"),
      `${"FULL_HUGE_LINE_MARKER repeated evidence ".repeat(6000)}FULL_TAIL_SENTINEL_SHOULD_NOT_APPEAR`,
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "one-line.md" },
      preserve: "full",
      maxFullBytes: 400,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].lines, "1-1");
    assert.match(result.evidence[0].excerpt, /FULL_HUGE_LINE_MARKER/);
    assert.doesNotMatch(result.evidence[0].excerpt, /FULL_TAIL_SENTINEL_SHOULD_NOT_APPEAR/);
    assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") <= 32_000);
    assert.doesNotMatch(JSON.stringify(result), /2-1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preserve full over cap returns bounded previews instead of a summary", async () => {
  await withFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "router-notes.md" },
      preserve: "full",
      maxFullBytes: 400,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.preserve, "full");
    assert.equal(result.routing.status, "partial");
    assert.match(result.routing.reason, /exceeds cap/);
    assert.ok(result.recovery?.how.includes("explicit span"));
    assert.equal(result.evidence?.length, 2);

    const [head, tail] = result.evidence;
    assert.equal(head.window, "small");
    assert.equal(tail.window, "small");
    assert.match(head.excerpt, /# Router Notes/);
    assert.match(tail.excerpt, /filler line 140/);
    assert.ok(head.excerpt.length + tail.excerpt.length < 900);
  });
});

test("locating repo evidence with a huge line returns bounded preview", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-repo-locate-cap-"));
  try {
    await writeFile(
      join(root, "huge-locate.md"),
      `${"LOCATE_HUGE_MARKER repeated evidence ".repeat(6000)}LOCATE_TAIL_SENTINEL_SHOULD_NOT_APPEAR`,
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "locate",
      source: { kind: "repo", root },
      query: "LOCATE_HUGE_MARKER",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].window, "small");
    assert.match(result.evidence[0].excerpt, /LOCATE_HUGE_MARKER/);
    assert.doesNotMatch(result.evidence[0].excerpt, /LOCATE_TAIL_SENTINEL_SHOULD_NOT_APPEAR/);
    assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") <= 8_192);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("locating repo evidence returns candidate locations without broad evidence", async () => {
  await withFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "locate",
      source: { kind: "repo", root },
      query: "output router skill tool choice",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.match(result.routing.reason, /candidate location/);
    assert.equal(result.evidence?.length, 1);

    const [candidate] = result.evidence;
    assert.equal(candidate.path, "router-notes.md");
    assert.equal(candidate.window, "small");
    assert.match(candidate.lines, /^\d+-\d+$/);
    assert.ok(candidate.excerpt.length < 180);
    assert.ok(!candidate.excerpt.includes("filler line 1"));
    assert.ok(result.recovery?.how.includes("retrieve"));
  });
});

test("explaining a repo retrieval returns the prior route and recovery guidance", async () => {
  await withFixtureRepo(async (root) => {
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "output router skill tool choice",
      preserve: "important",
    });

    const explained = await freeflowRetrieve({
      action: "explain",
      source: { kind: "repo", root },
      decision: queryResult,
    });

    assert.equal(explained.toolStatus, "ok");
    assert.equal(explained.routing.status, "routed");
    assert.match(explained.routing.reason, new RegExp(queryResult.decisionId));
    assert.equal(explained.evidence?.length, 0);
    assert.ok(explained.recovery?.how.includes("expand"));
  });
});

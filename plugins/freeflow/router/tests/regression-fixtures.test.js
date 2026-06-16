import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../pi-extension/index.js";
import { createVault, freeflowRetrieve, freeflowRun, readOutputText } from "../dist/index.js";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const fixtureRoot = resolve(repoRoot, "plugins/freeflow/evals/fixtures/output-router");

async function fixtureText(name) {
  return readFile(join(fixtureRoot, name), "utf8");
}

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-regression-vault-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function resultContextBytes(result) {
  return Buffer.byteLength(JSON.stringify(result), "utf8");
}

function loadExtension() {
  const handlers = new Map();
  const tools = [];
  const pi = {
    registerTool(tool) {
      tools.push(tool);
    },
    registerCommand() {},
    on(event, handler) {
      handlers.set(event, handler);
    },
    appendEntry() {},
    sendUserMessage() {},
  };
  freeflowExtension(pi);
  return { handlers, tools };
}

function context(cwd) {
  return {
    cwd,
    sessionManager: { getEntries: () => [] },
    ui: { setStatus() {}, notify() {} },
  };
}

async function withSandboxPermissionsFixtureRepo(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-sandbox-fixture-"));
  try {
    const targetDir = join(root, "docs/codex-cli-agent-harness");
    await mkdir(targetDir, { recursive: true });
    await writeFile(
      join(targetDir, "2026-06-12-pass-3-sandboxing-and-permissions.md"),
      [
        "# Pass 3",
        "",
        "### Sandbox Permissions",
        "",
        "`SandboxPermissions` is a per-command request shape.",
        "",
        "Plain-language meaning:",
        "",
        "```text",
        "UseDefault:",
        "  Run with the turn's normal sandbox.",
        "",
        "RequireEscalated:",
        "  Request unsandboxed execution.",
        "",
        "WithAdditionalPermissions:",
        "  Stay sandboxed but widen permissions for this one command.",
        "```",
      ].join("\n"),
      "utf8",
    );

    await mkdir(join(root, "graphify-out"), { recursive: true });
    await writeFile(
      join(root, "graphify-out/graph.html"),
      [
        "<html><body>",
        `${"Sandbox Permissions SandboxPermissions Plain-language meaning ".repeat(5000)}GENERATED_GRAPH_DECOY_SENTINEL`,
        "</body></html>",
      ].join("\n"),
      "utf8",
    );

    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("regression fixture: Sandbox Permissions broad query ignores generated graph decoy", async () => {
  await withSandboxPermissionsFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "Sandbox Permissions SandboxPermissions Plain-language meaning",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
    assert.match(result.evidence[0].excerpt, /SandboxPermissions/);
    assert.doesNotMatch(result.evidence[0].excerpt, /GENERATED_GRAPH_DECOY_SENTINEL/);
    assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") <= 8_192);
  });
});

test("regression fixture: root-scoped query still ignores generated graph decoy", async () => {
  await withSandboxPermissionsFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root, path: "." },
      query: "Sandbox Permissions SandboxPermissions Plain-language meaning",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
    assert.doesNotMatch(result.evidence[0].excerpt, /GENERATED_GRAPH_DECOY_SENTINEL/);
  });
});

test("regression fixture: explicitly requested generated path remains searchable", async () => {
  await withSandboxPermissionsFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root, path: "graphify-out/graph.html" },
      query: "GENERATED_GRAPH_DECOY_SENTINEL",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "graphify-out/graph.html");
    assert.match(result.evidence[0].excerpt, /Sandbox Permissions/);
  });
});

test("regression fixture: huge single-line evidence is bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-huge-line-fixture-"));
  try {
    await writeFile(
      join(root, "huge-line.md"),
      [
        "# Huge Line Fixture",
        `${"UNIQUE_HUGE_LINE_MARKER repeated evidence ".repeat(6000)}TAIL_SENTINEL_SHOULD_BE_OUTSIDE_PREVIEW`,
      ].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "UNIQUE_HUGE_LINE_MARKER",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.match(result.evidence[0].excerpt, /UNIQUE_HUGE_LINE_MARKER/);
    assert.doesNotMatch(result.evidence[0].excerpt, /TAIL_SENTINEL_SHOULD_BE_OUTSIDE_PREVIEW/);
    assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") <= 8_192);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: lockfiles remain searchable in broad retrieval", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-lockfile-fixture-"));
  try {
    await writeFile(
      join(root, "package-lock.json"),
      [`{ "name": "fixture", "marker": "LOCKFILE_SEARCH_MARKER" }`, "x".repeat(1024 * 1024 + 1)].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "LOCKFILE_SEARCH_MARKER",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "package-lock.json");
    assert.match(result.evidence[0].excerpt, /LOCKFILE_SEARCH_MARKER/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: exact technical phrase beats repeated loose tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-exact-phrase-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      ["# Target", "", "`SandboxPermissions` is a per-command request shape."].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "decoy.md"),
      `SandboxPermissions per-command request shape `.repeat(800),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "SandboxPermissions is a per-command request shape",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].excerpt, /`SandboxPermissions` is a per-command request shape/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: multiline heading/body phrase beats repeated loose tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-multiline-phrase-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      [
        "# Target",
        "",
        "### Sandbox Permissions",
        "",
        "Plain-language meaning:",
        "",
        "UseDefault: run with the normal sandbox.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "decoy.md"),
      `Sandbox meaning Permissions Plain-language `.repeat(800),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "Sandbox Permissions Plain-language meaning",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].excerpt, /### Sandbox Permissions/);
    assert.match(result.evidence[0].excerpt, /Plain-language meaning/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: capped heading boost cannot beat exact phrase", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-heading-boost-fixture-"));
  try {
    await writeFile(join(root, "target.md"), "# Target\n\nadaptive compression vault recovery", "utf8");
    await writeFile(join(root, "heading-decoy.md"), `# ${"adaptive ".repeat(30000)}\n`, "utf8");

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "adaptive compression vault recovery",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: section chunk coverage beats repeated single-token decoy", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-section-chunk-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      [
        "# Target",
        "",
        "## Adaptive Compression",
        "",
        "Vault recovery remains exact for raw output.",
        "Parser confidence labels routed diagnostics.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(root, "decoy.md"), `adaptive `.repeat(900), "utf8");

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "adaptive compression vault recovery parser confidence",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].excerpt, /## Adaptive Compression/);
    assert.match(result.evidence[0].excerpt, /Vault recovery remains exact/);
    assert.match(result.evidence[0].excerpt, /Parser confidence labels/);
    assert.match(result.routing.reason, /BM25-style|coverage/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: large docs query returns bounded exact evidence", async () => {
  const raw = await fixtureText("large-router-manual.md");
  const result = await freeflowRetrieve({
    action: "query",
    source: { kind: "repo", root: fixtureRoot },
    query: "OUTPUT_ROUTER_SKILL_DECISION_ANCHOR safety net",
    preserve: "important",
  });

  assert.equal(result.toolStatus, "ok");
  assert.equal(result.routing.status, "routed");
  assert.equal(result.evidence?.length, 1);
  assert.match(result.evidence[0].excerpt, /OUTPUT_ROUTER_SKILL_DECISION_ANCHOR/);
  assert.doesNotMatch(result.evidence[0].excerpt, /TAIL_SENTINEL_DO_NOT_INCLUDE_IN_TARGETED_QUERY/);
  assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") < Buffer.byteLength(raw, "utf8") / 3);
});

test("regression fixture: preserve full over cap returns exact chunks instead of a summary", async () => {
  const raw = await fixtureText("large-router-manual.md");
  const result = await freeflowRetrieve({
    action: "retrieve",
    source: { kind: "repo", root: fixtureRoot, path: "large-router-manual.md" },
    preserve: "full",
    maxFullBytes: 400,
  });

  assert.equal(result.toolStatus, "ok");
  assert.equal(result.preserve, "full");
  assert.equal(result.routing.status, "partial");
  assert.match(result.routing.reason, /bounded edge previews instead of a summary/);
  assert.equal(result.evidence?.length, 2);
  assert.match(result.evidence[0].excerpt, /HEAD_SENTINEL_FULL_FIDELITY/);
  assert.match(result.evidence[1].excerpt, /TAIL_SENTINEL_DO_NOT_INCLUDE_IN_TARGETED_QUERY/);
  assert.ok(resultContextBytes(result) < Buffer.byteLength(raw, "utf8"));
});

test("regression fixture: noisy successful command is smaller than raw and recoverable", async () => {
  await withTempVault(async (vault) => {
    const stdout = await fixtureText("noisy-test-output.txt");
    const result = await freeflowRun(
      {
        command: "npm test -- --verbose",
        sessionId: "noisy-regression-session",
        vaultRoot: vault.root,
        thresholds: { largeOutputLines: 10, largeOutputBytes: 100_000 },
        preserve: "important",
      },
      {
        async run() {
          return { stdout, stderr: "", executionStatus: "success", exitCode: 0 };
        },
      },
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "success");
    assert.equal(result.routing.status, "partial");
    assert.ok(resultContextBytes(result) < Buffer.byteLength(stdout, "utf8"));
    assert.match(result.importantLines?.[0].excerpt ?? "", /router noisy fixture line 001/);
    assert.doesNotMatch(result.importantLines?.[0].excerpt ?? "", /NOISY_OUTPUT_TAIL_SENTINEL/);
    assert.equal(await readOutputText(vault, "noisy-regression-session", result.outputId, "stdout"), stdout);
  });
});

test("regression fixture: failed command keeps tool, execution, and routing status split", async () => {
  await withTempVault(async (vault) => {
    const stderr = await fixtureText("failed-command-output.txt");
    const result = await freeflowRun(
      {
        command: "npm test failing-fixture",
        sessionId: "failed-regression-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      {
        async run() {
          return { stdout: "", stderr, executionStatus: "failed", exitCode: 1 };
        },
      },
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.execution.exitCode, 1);
    assert.equal(result.routing.status, "routed");
    assert.equal(Object.hasOwn(result, "status"), false);
    assert.match(result.importantLines?.[0].excerpt ?? "", /AssertionError: expected false to equal true/);
    assert.equal(await readOutputText(vault, "failed-regression-session", result.outputId, "stderr"), stderr);
  });
});

test("regression fixture: verification output preserves exact completion evidence", async () => {
  await withTempVault(async (vault) => {
    const stdout = await fixtureText("verification-output.txt");
    const result = await freeflowRun(
      {
        command: "npm run verify",
        sessionId: "verification-regression-session",
        vaultRoot: vault.root,
        goal: "verification",
        preserve: "important",
      },
      {
        async run() {
          return { stdout, stderr: "", executionStatus: "failed", exitCode: 1 };
        },
      },
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.importantLines?.[0].excerpt, "Tests: 2 failed, 198 passed, 200 total");
    assert.equal(await readOutputText(vault, "verification-regression-session", result.outputId, "stdout"), stdout);
  });
});

test("regression fixture: Pi safety net labels native output and recovers exact raw tail", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-router-native-fixture-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          postToolRouting: "safety-net",
          largeOutputLines: 10,
          largeOutputBytes: 100_000,
          vaultRoot: join(cwd, "vault"),
        },
      }),
      "utf8",
    );

    const raw = await fixtureText("native-large-output.txt");
    const { handlers, tools } = loadExtension();
    const routed = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "read",
        toolCallId: "native-fixture-read",
        input: { path: "native-large-output.txt" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.match(routed.content[0].text, /Freeflow routed this native read result/);
    assert.match(routed.content[0].text, /outputId=ffout_/);
    assert.ok(Buffer.byteLength(routed.content[0].text, "utf8") < Buffer.byteLength(raw, "utf8"));
    const outputId = routed.content[0].text.match(/outputId=(ffout_[a-f0-9]+)/)?.[1];
    assert.ok(outputId);

    const retrieveTool = tools.find((tool) => tool.name === "freeflow_retrieve");
    const retrieved = await retrieveTool.execute(
      "recover-native-tail",
      {
        action: "retrieve",
        source: { kind: "vault", outputId, stream: "raw" },
        lineRange: { start: 38, end: 40 },
      },
      undefined,
      undefined,
      context(cwd),
    );
    const payload = JSON.parse(retrieved.content[0].text);
    assert.equal(payload.evidence[0].excerpt, "native output fixture line 038\nnative output fixture line 039\nNATIVE_RAW_TAIL_SENTINEL");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

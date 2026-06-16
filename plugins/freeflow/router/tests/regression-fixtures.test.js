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
  assert.match(result.routing.reason, /exact chunk metadata instead of a summary/);
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

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";

function state(root, workspace = true) {
  return resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        discovery: { enabled: true },
        workspace: { enabled: workspace, root, denyPaths: ["private"] },
      },
    },
    {},
    true,
  );
}

function runtime(root, workspace = true) {
  const current = state(root, workspace);
  return new ToolRuntime(
    () => current,
    {
      scope: () => ({ fence: "current" }),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
    },
    {
      read: async (input) => ({
        id: input.id,
        text: "captured",
        range: { startBytes: 0, endBytes: 8 },
        totalBytes: 8,
        coverage: "unspecified",
        scope: "tool-result-hook",
      }),
    },
  );
}

function ctx(cwd) {
  return { cwd, sessionManager: { getSessionId: () => "session" } };
}

test("stable facade searches, describes, and directly calls exact operation revisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-direct-"));
  try {
    await writeFile(join(root, "hello.txt"), "hello αβ world\nsecond line\n");
    const tools = runtime(root);
    const search = await tools.invokeTools(
      "call-search",
      { operation: "search", query: "workspace text", limit: 5 },
      undefined,
      ctx(root),
    );
    assert.equal(search.details.status, "searched");
    assert.ok(search.details.hits.some((hit) => hit.key.id === "project.readText"));

    const describe = await tools.invokeTools(
      "call-describe",
      {
        operation: "describe",
        operations: [
          { id: "project.readText", revision: "1" },
          { id: "result.read", revision: "1" },
        ],
      },
      undefined,
      ctx(root),
    );
    assert.equal(
      describe.details.operations.every((item) => item.available),
      true,
    );
    assert.equal(describe.details.operations[0].inputSchema.additionalProperties, false);

    const call = await tools.invokeTools(
      "call-read",
      {
        operation: "call",
        operationKey: { id: "project.readText", revision: "1" },
        input: { path: "hello.txt", offsetBytes: 0, maxBytes: 9 },
      },
      undefined,
      ctx(root),
    );
    const outcome = call.details.outcome;
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.value.text, "hello α");
    assert.equal(outcome.value.sha256.length, 64);
    assert.deepEqual(outcome.value.range, { startBytes: 0, endBytes: 8 });
    assert.equal(outcome.value.nextOffsetBytes, 8);

    const captured = await tools.invokeTools(
      "call-result",
      {
        operation: "call",
        operationKey: { id: "result.read", revision: "1" },
        input: { id: "result:fixture" },
      },
      undefined,
      ctx(root),
    );
    assert.equal(captured.details.outcome.status, "succeeded");
    assert.equal(captured.details.outcome.value.text, "captured");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace authorization denies traversal, absolute, denied, symlink-escape, and disabled roots before execute", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "freeflow-outside-"));
  try {
    await mkdir(join(root, "private"));
    await writeFile(join(root, "private", "secret.txt"), "secret");
    await writeFile(join(outside, "outside.txt"), "outside");
    await symlink(join(outside, "outside.txt"), join(root, "escape.txt"));
    const enabled = runtime(root);
    for (const path of ["../outside.txt", join(outside, "outside.txt"), "private/secret.txt", "escape.txt"]) {
      const response = await enabled.invokeTools(
        `call-${path}`,
        {
          operation: "call",
          operationKey: { id: "project.readText", revision: "1" },
          input: { path },
        },
        undefined,
        ctx(root),
      );
      assert.equal(response.details.outcome.status, "denied", path);
      assert.equal(response.details.outcome.bodyStarted, false, path);
    }

    const disabled = runtime(root, false);
    const response = await disabled.invokeTools(
      "call-disabled",
      {
        operation: "call",
        operationKey: { id: "project.readText", revision: "1" },
        input: { path: "private/secret.txt" },
      },
      undefined,
      ctx(root),
    );
    assert.equal(response.details.outcome.status, "denied");
    assert.equal(response.details.outcome.error.code, "workspace_disabled");
    assert.equal(response.details.outcome.bodyStarted, false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("invalid input is rejected before body while binary and oversized files fail after factual acquisition starts", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-workspace-data-"));
  try {
    await writeFile(join(root, "binary.txt"), Buffer.from([65, 0, 66]));
    await writeFile(join(root, "large.txt"), Buffer.alloc(4 * 1024 * 1024 + 1, 65));
    const tools = runtime(root);
    const malformed = await tools.invokeTools(
      "call-invalid",
      {
        operation: "call",
        operationKey: { id: "project.readText", revision: "1" },
        input: { path: "binary.txt", effect: "live-read" },
      },
      undefined,
      ctx(root),
    );
    assert.equal(malformed.details.outcome.status, "denied");
    assert.equal(malformed.details.outcome.bodyStarted, false);
    assert.equal(malformed.details.outcome.error.code, "invalid_input");

    for (const [path, code] of [
      ["binary.txt", "operation_failed"],
      ["large.txt", "operation_failed"],
    ]) {
      const response = await tools.invokeTools(
        `call-${path}`,
        {
          operation: "call",
          operationKey: { id: "project.readText", revision: "1" },
          input: { path },
        },
        undefined,
        ctx(root),
      );
      assert.equal(response.details.outcome.status, "failed");
      assert.equal(response.details.outcome.bodyStarted, true);
      assert.equal(response.details.outcome.error.code, code);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

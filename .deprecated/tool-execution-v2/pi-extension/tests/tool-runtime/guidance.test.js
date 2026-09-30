import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GuidanceRuntime } from "../../dist/tool-runtime/guidance.js";
import { SessionStoreRuntime } from "../../dist/tool-runtime/session-store/store.js";

const limits = {
  perArtifactBytes: 65536,
  perRunBytes: 262144,
  perSessionBytes: 524288,
  totalBytes: 1048576,
  maxReadBytes: 32768,
};
const sourceSkill = join(process.cwd(), "capabilities", "tool-execution", "SKILL.md");

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-guidance-"));
  const skillPath = join(root, "SKILL.md");
  const original = await readFile(sourceSkill, "utf8");
  await writeFile(skillPath, original);
  const sessionId = "session:guidance";
  const store = new SessionStoreRuntime(
    join(root, "store"),
    {
      schemaVersion: 2,
      storeId: "store:guidance",
      originSessionId: sessionId,
      host: { id: "pi", contract: "0.87.x" },
      createdBy: { package: "fixture", version: "1" },
      domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
    },
    limits,
  );
  const fence = await store.open();
  const branch = [];
  const ctx = {
    cwd: root,
    sessionManager: {
      getSessionId: () => sessionId,
      getBranch: () => branch,
    },
  };
  const create = () => new GuidanceRuntime(skillPath, () => ({ store, fence }));
  try {
    await run({ root, skillPath, original, store, fence, branch, ctx, create });
  } finally {
    await store.close(fence).catch(() => store.abandon());
    await rm(root, { recursive: true, force: true });
  }
}

function readOccurrence(skillPath, body, callId = "call:skill|fc_1") {
  return {
    toolName: "read",
    toolCallId: callId,
    input: { path: skillPath },
    content: [{ type: "text", text: body }],
    isError: false,
  };
}

async function introduce(runtime, branch, ctx, skillPath, body, callId = "call:skill|fc_1") {
  const read = readOccurrence(skillPath, body, callId);
  runtime.observeRead(read, ctx);
  const assistant = { role: "assistant", stopReason: "toolUse", content: [] };
  branch.push({ type: "message", id: "assistant:read", message: assistant });
  branch.push({ type: "message", id: "native:skill", message: { role: "toolResult", ...read } });
  await runtime.turnEnd({ message: assistant, toolResults: [read] }, ctx);
}

test("only a complete native read with the exact packaged skill body creates an acknowledged Guidance occurrence", async () => {
  await fixture(async ({ skillPath, original, store, branch, ctx, create }) => {
    const runtime = create();
    await runtime.refresh(ctx);
    const wrong = readOccurrence(skillPath, original, "call:wrong|fc_1");
    wrong.input.path = join(ctx.cwd, "other.md");
    runtime.observeRead(wrong, ctx);
    runtime.observeRead({ ...readOccurrence(skillPath, original.slice(0, -2)), details: { truncation: {} } }, ctx);
    await runtime.turnEnd({ toolResults: [wrong] }, ctx);
    assert.deepEqual(runtime.status(ctx), { state: "absent" });

    await introduce(runtime, branch, ctx, skillPath, original);
    const status = runtime.status(ctx);
    assert.equal(status.state, "introduced");
    assert.match(status.revision, /^sha256:[a-f0-9]{64}$/);
    const events = await store.replay("guidance", {
      sessionId: "session:guidance",
      branchAnchor: "root",
      nativeEntryIds: branch.map((entry) => entry.id),
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, "skill-introduced");
    assert.equal(events[0].nativeEntryId, "native:skill");
    assert.equal(events[0].payload.occurrenceId, status.occurrenceId);
    assert.equal(
      JSON.stringify(events).includes(original),
      false,
      "persist only hashes and identity, never the skill body",
    );
  });
});

test("unbound or unavailable Guidance store never claims a missing read or completed delivery", async () => {
  await fixture(async ({ skillPath, original, branch, ctx }) => {
    const runtime = new GuidanceRuntime(skillPath, () => undefined);
    await runtime.refresh(ctx);
    assert.deepEqual(runtime.status(ctx), { state: "unobserved" });
    await introduce(runtime, branch, ctx, skillPath, original);
    assert.deepEqual(runtime.status(ctx), { state: "unobserved" });
  });
});

test("a uniquely correlated completed local request delivers the exact occurrence; ambiguity and reload stay truthful", async () => {
  await fixture(async ({ skillPath, original, store, branch, ctx, create }) => {
    const runtime = create();
    await runtime.refresh(ctx);
    await introduce(runtime, branch, ctx, skillPath, original);
    const initial = runtime.status(ctx);
    const payload = { input: [{ type: "function_call_output", call_id: "call:skill", output: original }] };
    runtime.observePrepared(payload, ctx);
    runtime.observePrepared({ input: [{ ...payload.input[0], output: original.slice(1) }] }, ctx, true);
    const completed = { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] };
    branch.push({ type: "message", id: "assistant:first", message: completed });
    await runtime.turnEnd({ message: completed, toolResults: [] }, ctx);
    assert.equal(runtime.status(ctx).state, "introduced", "unqualified or changed payload is not delivery");

    runtime.observePrepared(payload, ctx, true);
    runtime.observePrepared(payload, ctx, true);
    branch.push({ type: "message", id: "assistant:ambiguous", message: completed });
    await runtime.turnEnd({ message: completed, toolResults: [] }, ctx);
    assert.equal(runtime.status(ctx).state, "introduced", "multiple prepared attempts cannot be assigned by guess");

    runtime.observePrepared(payload, ctx, true);
    branch.push({ type: "message", id: "assistant:delivered", message: completed });
    await runtime.turnEnd({ message: completed, toolResults: [] }, ctx);
    const delivered = runtime.status(ctx);
    assert.equal(delivered.state, "delivered");
    assert.equal(delivered.occurrenceId, initial.occurrenceId);
    assert.equal(delivered.boundary, "completed-local-request-observation");
    const events = await store.replay("guidance", {
      sessionId: "session:guidance",
      branchAnchor: "root",
      nativeEntryIds: branch.map((entry) => entry.id),
    });
    assert.equal(events.length, 2);
    assert.equal(events[1].nativeEntryId, "assistant:delivered");
    assert.match(events[1].payload.requestId, /^request:/);

    const restarted = create();
    await restarted.refresh(ctx);
    assert.deepEqual(restarted.status(ctx), delivered);
    branch.push({
      type: "context_edit",
      id: "edit:skill",
      targetId: "native:skill",
      replacement: { content: "changed" },
    });
    assert.deepEqual(restarted.status(ctx), { state: "absent" }, "an edited read cannot remain applicable guidance");
    branch.pop();
    assert.equal(restarted.status(ctx).state, "delivered");
    await writeFile(skillPath, `${original}\nChanged guidance.\n`);
    await restarted.refresh(ctx);
    assert.equal(restarted.status(ctx).state, "outdated");
    branch.splice(0, branch.length, ...branch.filter((entry) => entry.id !== "native:skill"));
    await restarted.refresh(ctx);
    assert.deepEqual(restarted.status(ctx), { state: "absent" }, "a sibling branch cannot inherit an absent read");
  });
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { ProgramHost } from "../../dist/tool-runtime/program/host.js";
import { QuickJSRunner } from "../../dist/tool-runtime/program/quickjs.js";

function capability(mode = "reduction") {
  return resolveToolExecutionConfig(
    { toolExecution: { enabled: true, programs: { mode, timeoutMs: 500, maxParallelReads: 4 } } },
    {},
    true,
  );
}

async function harness(
  reader = async (input) => ({
    id: input.id,
    text: String(input.id),
    range: { startBytes: 0, endBytes: String(input.id).length },
    totalBytes: String(input.id).length,
    coverage: "unspecified",
    scope: "tool-result-hook",
  }),
) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-program-"));
  const manager = SessionManager.create(root, join(root, "sessions"));
  manager.appendMessage({ role: "user", content: "program", timestamp: 1 });
  const state = capability();
  const tools = new ToolRuntime(
    () => state,
    {
      scope: () => ({ fence: "current" }),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
    },
    { read: reader },
  );
  const pi = { appendEntry: (type, data) => manager.appendCustomEntry(type, data) };
  const host = new ProgramHost(pi, tools, () => state);
  return { root, manager, tools, host, ctx: { cwd: root, sessionManager: manager } };
}

async function close(fixture) {
  await rm(fixture.root, { recursive: true, force: true });
}

const run = (host, ctx, request) =>
  host.run(
    "call-program",
    {
      description: "fixture program",
      operations: [],
      captures: [],
      input: null,
      timeoutMs: 1000,
      ...request,
    },
    undefined,
    ctx,
  );

test("QuickJS guest has no ambient Node capabilities and only emit reaches the native result", async () => {
  const f = await harness();
  try {
    const result = await run(f.host, f.ctx, {
      input: { value: 4 },
      code: `let random; try { Math.random(); random = "available"; } catch (error) { random = String(error.message); } emit({ environment: [typeof process, typeof require, typeof fetch, typeof Buffer, typeof console, typeof Deno, typeof Bun, typeof WebSocket, typeof XMLHttpRequest, typeof Date, typeof setTimeout, typeof setInterval], random, value: input.value + 1 }); return { hidden: true };`,
    });
    const envelope = result.details.freeflowRun;
    assert.equal(envelope.programStatus, "completed");
    assert.deepEqual(envelope.emitted, [
      {
        environment: Array(12).fill("undefined"),
        random: "Nondeterministic clock and random APIs are disabled.",
        value: 5,
      },
    ]);
    assert.deepEqual(envelope.calls, {
      submitted: 0,
      started: 0,
      succeeded: 0,
      denied: 0,
      failed: 0,
      cancelled: 0,
      unknown: 0,
    });
    assert.equal(JSON.stringify(result).includes("hidden"), false);
    assert.ok(f.manager.getBranch().some((entry) => entry.customType === "freeflow-tool-run-v1"));
  } finally {
    await close(f);
  }
});

test("QuickJS bridge ignores stale, duplicate, and foreign replies after exact promise delivery", async () => {
  const frames = [];
  let observeCall;
  const called = new Promise((resolve) => {
    observeCall = resolve;
  });
  const runner = new QuickJSRunner(
    {
      runId: "run:bridge",
      request: {
        code: `emit((await results.read("capture")).value);`,
        description: "bridge fixture",
        operations: [],
        captures: ["capture"],
        input: null,
        timeoutMs: 1000,
      },
      inputJson: "null",
      deadlineMs: performance.now() + 1000,
    },
    (frame) => {
      frames.push(frame);
      if (frame.type === "capture-read") observeCall(frame);
    },
  );
  const running = runner.run();
  const call = await called;
  const reply = {
    v: 1,
    type: "reply",
    runId: "run:bridge",
    seq: call.seq,
    outcomeJson: JSON.stringify({
      ok: true,
      value: { value: 42 },
      coverage: { kind: "complete-at-boundary", boundary: "fixture" },
      effectState: "completed",
    }),
  };
  runner.reply({ ...reply, runId: "run:foreign" });
  runner.reply({ ...reply, seq: 999 });
  runner.reply(reply);
  runner.reply(reply);
  const terminal = await running;
  assert.deepEqual(terminal, { type: "finished", detached: false });
  assert.deepEqual(
    frames.filter((frame) => frame.type === "emit").map((frame) => JSON.parse(frame.valueJson)),
    [42],
  );
});

test("captured reads cross the JSON bridge asynchronously and commit in submission order", async () => {
  let active = 0;
  let maximum = 0;
  const completed = [];
  const f = await harness(async (input) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, input.id === "slow" ? 30 : 5));
    completed.push(input.id);
    active -= 1;
    return {
      id: input.id,
      text: input.id,
      range: { startBytes: 0, endBytes: input.id.length },
      totalBytes: input.id.length,
      coverage: "unspecified",
      scope: "tool-result-hook",
    };
  });
  try {
    const result = await run(f.host, f.ctx, {
      captures: ["slow", "fast"],
      code: `const values = await Promise.all([results.read("slow"), results.read("fast")]); emit(values.map(value => value.text));`,
    });
    const envelope = result.details.freeflowRun;
    assert.equal(envelope.programStatus, "completed");
    assert.deepEqual(envelope.emitted, [["slow", "fast"]]);
    assert.deepEqual(completed, ["fast", "slow"], "bodies may overlap");
    assert.equal(maximum, 2);
    assert.deepEqual(envelope.calls, {
      submitted: 2,
      started: 2,
      succeeded: 2,
      denied: 0,
      failed: 0,
      cancelled: 0,
      unknown: 0,
    });
    const manifest = f.manager.getBranch().find((entry) => entry.customType === "freeflow-tool-run-v1").data;
    assert.deepEqual(
      manifest.outcomes.map((outcome) => outcome.seq),
      [1, 2],
      "commits remain ordered",
    );
  } finally {
    await close(f);
  }
});

test("nested guest promise chains settle and a rejected program promise fails explicitly", async () => {
  const f = await harness();
  try {
    const nested = await run(f.host, f.ctx, {
      captures: ["first", "second"],
      code: `const first = await Promise.resolve().then(() => results.read("first")); const second = await Promise.resolve(first).then(() => results.read("second")); emit([first.text, second.text]);`,
    });
    assert.equal(nested.details.freeflowRun.programStatus, "completed");
    assert.deepEqual(nested.details.freeflowRun.emitted, [["first", "second"]]);
    assert.equal(nested.details.freeflowRun.calls.submitted, 2);
    assert.equal(nested.details.freeflowRun.calls.succeeded, 2);

    const rejected = await run(f.host, f.ctx, {
      code: `await Promise.resolve().then(() => Promise.reject(new Error("PROGRAM_PROMISE_REJECTION")));`,
    });
    assert.equal(rejected.details.freeflowRun.programStatus, "failed");
    assert.match(rejected.details.freeflowRun.error.message, /PROGRAM_PROMISE_REJECTION/);
    assert.equal(rejected.details.freeflowRun.calls.submitted, 0);
  } finally {
    await close(f);
  }
});

test("caught child failure remains in host counts while the program may complete", async () => {
  const f = await harness(async () => {
    throw new Error("fixture read failed");
  });
  try {
    const result = await run(f.host, f.ctx, {
      captures: ["bad"],
      code: `try { await results.read("bad"); } catch (error) { emit({ caught: true, code: error.code }); }`,
    });
    const envelope = result.details.freeflowRun;
    assert.equal(envelope.programStatus, "completed");
    assert.deepEqual(envelope.emitted, [{ caught: true, code: "operation_failed" }]);
    assert.equal(envelope.calls.failed, 1);
    assert.equal(envelope.calls.succeeded, 0);
  } finally {
    await close(f);
  }
});

test("detached calls and emission overflow fail explicitly", async () => {
  for (const scenario of [
    { code: `results.read("slow"); emit("visible");`, captures: ["slow"], expected: "detached_calls" },
    { code: `emit("x".repeat(40000));`, captures: [], expected: "limit" },
  ]) {
    const f = await harness(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        id: input.id,
        text: input.id,
        range: { startBytes: 0, endBytes: input.id.length },
        totalBytes: input.id.length,
        coverage: "unspecified",
        scope: "tool-result-hook",
      };
    });
    try {
      const result = await run(f.host, f.ctx, scenario);
      assert.notEqual(result.details.freeflowRun.programStatus, "completed");
      assert.equal(result.details.freeflowRun.error.code, scenario.expected);
      assert.deepEqual(f.host.patchResult({ toolName: "freeflow_run", details: result.details }), { isError: true });
    } finally {
      await close(f);
    }
  }
});

test("mapLimit preserves order and bounds overlapping captured reads", async () => {
  let active = 0;
  let maximum = 0;
  const f = await harness(async (input) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return {
      id: input.id,
      text: input.id,
      range: { startBytes: 0, endBytes: input.id.length },
      totalBytes: input.id.length,
      coverage: "unspecified",
      scope: "tool-result-hook",
    };
  });
  try {
    const result = await run(f.host, f.ctx, {
      captures: ["a"],
      code: `const values = await mapLimit([3, 1, 2], 2, async value => { await results.read("a"); return value; }); emit(values);`,
    });
    assert.deepEqual(result.details.freeflowRun.emitted, [[3, 1, 2]]);
    assert.equal(maximum, 2);
  } finally {
    await close(f);
  }
});

test("post-start cancellation publishes one settled manifest", async () => {
  let started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  const f = await harness(async (input, signal) => {
    started();
    await new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("fixture cancelled")), { once: true });
    });
    return input;
  });
  try {
    const controller = new AbortController();
    const pending = f.host.run(
      "post-start-cancel",
      {
        code: `await results.read("slow"); emit("unreachable");`,
        description: "cancel an active captured read",
        operations: [],
        captures: ["slow"],
        input: null,
        timeoutMs: 1000,
      },
      controller.signal,
      f.ctx,
    );
    await startedPromise;
    controller.abort();
    const cancelled = await pending;
    assert.equal(cancelled.details.freeflowRun.programStatus, "cancelled");
    assert.equal(cancelled.details.freeflowRun.calls.started, 1);
    assert.equal(cancelled.details.freeflowRun.calls.cancelled, 1);
    const manifests = f.manager
      .getBranch()
      .filter(
        (entry) =>
          entry.customType === "freeflow-tool-run-v1" && entry.data.runId === cancelled.details.freeflowRun.runId,
      );
    assert.equal(manifests.length, 1);
    assert.equal(cancelled.details.freeflowRun.manifestRef, cancelled.details.freeflowRun.runId);
  } finally {
    await close(f);
  }
});

test("source and input limits reject before Worker execution", async () => {
  const f = await harness();
  try {
    await assert.rejects(
      () => run(f.host, f.ctx, { code: "x".repeat(64 * 1024 + 1) }),
      (error) => error.code === "source_limit",
    );
    await assert.rejects(
      () => run(f.host, f.ctx, { code: `emit("unreachable")`, input: "x".repeat(256 * 1024) }),
      (error) => error.code === "input_limit",
    );
    assert.equal(
      f.manager.getBranch().some((entry) => entry.customType === "freeflow-tool-run-v1"),
      false,
    );
  } finally {
    await close(f);
  }
});

test("frame, total-call, memory, stack, and pre-start cancellation limits are explicit", async () => {
  const f = await harness();
  try {
    const frame = await run(f.host, f.ctx, {
      captures: ["a"],
      code: `try { await results.read("a", { maxBytes: 1, padding: "x".repeat(5 * 1024 * 1024) }); } catch (error) { emit(error.code); }`,
    });
    assert.deepEqual(frame.details.freeflowRun.emitted, ["frame_limit"]);
    assert.equal(frame.details.freeflowRun.calls.submitted, 0);

    const emittedFrame = await run(f.host, f.ctx, {
      code: `emit("x".repeat(5 * 1024 * 1024));`,
    });
    assert.notEqual(emittedFrame.details.freeflowRun.programStatus, "completed");
    assert.match(emittedFrame.details.freeflowRun.error.message, /frame_limit/);

    const pendingCalls = await run(f.host, f.ctx, {
      captures: ["a"],
      code: `const calls = Array.from({ length: 33 }, () => results.read("a")); let code = "none"; try { await Promise.all(calls); } catch (error) { code = error.code; } emit(code);`,
    });
    assert.deepEqual(pendingCalls.details.freeflowRun.emitted, ["pending_limit"]);
    assert.equal(pendingCalls.details.freeflowRun.error.code, "detached_calls");
    assert.equal(pendingCalls.details.freeflowRun.calls.submitted, 32);

    const calls = await run(f.host, f.ctx, {
      captures: ["a"],
      timeoutMs: 5000,
      code: `let code = "none"; for (let i = 0; i < 257; i++) { try { await results.read("a"); } catch (error) { code = error.code; break; } } emit(code);`,
    });
    assert.deepEqual(calls.details.freeflowRun.emitted, ["call_limit"]);
    assert.equal(calls.details.freeflowRun.calls.submitted, 256);

    for (const code of [`"x".repeat(100000000)`, `(function recurse(){ return recurse(); })()`]) {
      const limited = await run(f.host, f.ctx, { code, timeoutMs: 1000 });
      assert.notEqual(limited.details.freeflowRun.programStatus, "completed");
      assert.match(limited.details.freeflowRun.error.message, /memory|stack|interrupted/i);
    }

    const controller = new AbortController();
    controller.abort();
    const cancelled = await f.host.run(
      "cancelled-call",
      { code: `emit("unreachable")`, description: "cancelled", operations: [], input: null, timeoutMs: 1000 },
      controller.signal,
      f.ctx,
    );
    assert.equal(cancelled.details.freeflowRun.programStatus, "cancelled");
    assert.equal(cancelled.details.freeflowRun.calls.started, 0);
  } finally {
    await close(f);
  }
});

test("modules, infinite loops, and live operations are denied at their owning boundaries", async () => {
  const f = await harness();
  try {
    const moduleResult = await run(f.host, f.ctx, {
      code: `try { await import("node:fs"); emit("bad"); } catch (error) { emit(String(error)); }`,
    });
    assert.match(moduleResult.details.freeflowRun.emitted[0], /Modules disabled/);

    const loopResult = await run(f.host, f.ctx, { code: `for (;;) {}`, timeoutMs: 100 });
    assert.notEqual(loopResult.details.freeflowRun.programStatus, "completed");
    assert.match(loopResult.details.freeflowRun.error.message, /interrupted|deadline/i);

    await assert.rejects(
      () =>
        run(f.host, f.ctx, {
          code: `emit("unreachable");`,
          operations: [{ id: "project.readText", revision: "1" }],
        }),
      /live_operations_unavailable/,
    );
  } finally {
    await close(f);
  }
});

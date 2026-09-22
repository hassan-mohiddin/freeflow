import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { OperationExecutionError } from "../../dist/tool-runtime/contracts.js";
import { EffectRuntime } from "../../dist/tool-runtime/effects.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { ProgramHost } from "../../dist/tool-runtime/program/host.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

function state(root, overrides = {}) {
  return resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        discovery: { enabled: true },
        programs: { mode: "adapters", timeoutMs: 2000, maxParallelReads: 4 },
        workspace: { enabled: true, write: true, root, denyPaths: ["private"] },
        ...overrides,
      },
    },
    {},
    true,
  );
}

async function harness(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-p4-"));
  const manager = SessionManager.create(root, join(root, "sessions"));
  manager.appendMessage({ role: "user", content: "p4", timestamp: 1 });
  const current = state(root, overrides);
  const pi = { appendEntry: (type, data) => manager.appendCustomEntry(type, data) };
  const effects = new EffectRuntime(pi);
  effects.recover({ sessionManager: manager });
  const tools = new ToolRuntime(
    () => current,
    {
      scope: () => ({ fence: "current" }),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
      admitProgram: () => ({ kind: "allowed" }),
    },
    {
      read: async (input) => ({
        id: input.id,
        text: String(input.id),
        range: { startBytes: 0, endBytes: String(input.id).length },
        totalBytes: String(input.id).length,
        coverage: "unspecified",
        scope: "tool-result-hook",
      }),
    },
    effects,
  );
  const ctx = { cwd: root, sessionManager: manager };
  return { root, manager, current, pi, effects, tools, ctx };
}

async function close(fixture) {
  await rm(fixture.root, { recursive: true, force: true });
}

const direct = (fixture, operationKey, input, signal) =>
  fixture.tools.invokeTools(
    `direct-${operationKey.id}`,
    { operation: "call", operationKey, input },
    signal,
    fixture.ctx,
  );

const program = (fixture, request, signal) =>
  new ProgramHost(fixture.pi, fixture.tools, () => fixture.current).run(
    "program-p4",
    {
      description: "p4 fixture program",
      captures: [],
      input: null,
      timeoutMs: 2000,
      ...request,
    },
    signal,
    fixture.ctx,
  );

test("literal search is deterministic, bounded, policy-scoped, and continuation detects changed source", async () => {
  const f = await harness();
  const outside = await mkdtemp(join(tmpdir(), "freeflow-p4-outside-"));
  try {
    await mkdir(join(f.root, "private"));
    await writeFile(join(f.root, "a.txt"), "needle first\nneedle second\n");
    await writeFile(join(f.root, "b.txt"), "NEEDLE third\n");
    await writeFile(join(f.root, "private", "secret.txt"), "needle secret\n");
    await writeFile(join(outside, "outside.txt"), "needle outside\n");
    await symlink(join(outside, "outside.txt"), join(f.root, "escape.txt"));

    const first = await direct(
      f,
      { id: "project.searchText", revision: "1" },
      { query: "needle", paths: ["."], caseSensitive: false, maxResults: 1 },
    );
    const outcome = first.details.outcome;
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.value.coverage, "limited");
    assert.deepEqual(
      outcome.value.matches.map((match) => match.path),
      ["a.txt"],
    );
    assert.equal(outcome.value.matches[0].range.startBytes, 0);
    assert.equal(JSON.stringify(outcome.value).includes("secret"), false);
    assert.equal(JSON.stringify(outcome.value).includes("outside"), false);

    await writeFile(join(f.root, outcome.value.next.path), "changed needle source\n");
    const resumed = await direct(
      f,
      { id: "project.searchText", revision: "1" },
      {
        query: "needle",
        paths: ["."],
        caseSensitive: false,
        maxResults: 10,
        cursor: outcome.value.next,
      },
    );
    assert.equal(resumed.details.outcome.status, "failed");
    assert.equal(resumed.details.outcome.error.code, "operation_failed");
    assert.match(resumed.details.outcome.error.message, /source_changed/);

    const denied = await direct(
      f,
      { id: "project.searchText", revision: "1" },
      { query: "needle", paths: ["private"] },
    );
    assert.equal(denied.details.outcome.status, "denied");
    assert.equal(denied.details.outcome.bodyStarted, false);
    assert.equal(denied.details.outcome.error.code, "path_denied");
  } finally {
    await close(f);
    await rm(outside, { recursive: true, force: true });
  }
});

test("exact replacement requires one current match and records acknowledged mutation facts", async () => {
  const f = await harness();
  try {
    const path = join(f.root, "target.txt");
    await writeFile(path, "before VALUE after\n");
    const before = await readFile(path);
    const changed = await direct(
      f,
      { id: "project.replaceExact", revision: "1" },
      { path: "target.txt", expectedSha256: hash(before), oldText: "VALUE", replacement: "$& replacement" },
    );
    const outcome = changed.details.outcome;
    assert.equal(outcome.status, "succeeded");
    assert.equal(outcome.effect, "mutation");
    assert.equal(outcome.effectState, "completed");
    assert.equal(outcome.value.applied, 1);
    assert.equal(await readFile(path, "utf8"), "before $& replacement after\n");
    assert.equal(outcome.value.afterSha256, hash(await readFile(path)));

    const events = f.manager.getEntries().filter((entry) => entry.customType === "freeflow-tool-effect-v1");
    assert.deepEqual(
      events.map((entry) => entry.data.event),
      ["started", "settled"],
    );
    assert.equal(events[0].data.effectId, events[1].data.effectId);

    const stale = await direct(
      f,
      { id: "project.replaceExact", revision: "1" },
      { path: "target.txt", expectedSha256: hash(before), oldText: "replacement", replacement: "no" },
    );
    assert.equal(stale.details.outcome.status, "failed");
    assert.equal(stale.details.outcome.effectState, "none");
    assert.match(stale.details.outcome.error.message, /source_changed/);

    await writeFile(path, "same same\n");
    const ambiguous = await direct(
      f,
      { id: "project.replaceExact", revision: "1" },
      { path: "target.txt", expectedSha256: hash(await readFile(path)), oldText: "same", replacement: "one" },
    );
    assert.equal(ambiguous.details.outcome.status, "failed");
    assert.equal(ambiguous.details.outcome.effectState, "none");
    assert.equal(await readFile(path, "utf8"), "same same\n");

    await writeFile(path, "aaa\n");
    const overlapping = await direct(
      f,
      { id: "project.replaceExact", revision: "1" },
      { path: "target.txt", expectedSha256: hash(await readFile(path)), oldText: "aa", replacement: "one" },
    );
    assert.equal(overlapping.details.outcome.status, "failed");
    assert.equal(overlapping.details.outcome.effectState, "none");
    assert.equal(await readFile(path, "utf8"), "aaa\n");
  } finally {
    await close(f);
  }
});

test("settlement uncertainty preserves the applied write and fences later live effects without replay", async () => {
  const f = await harness();
  try {
    const path = join(f.root, "uncertain.txt");
    await writeFile(path, "old\n");
    const originalAppend = f.pi.appendEntry;
    f.pi.appendEntry = (type, data) => {
      originalAppend(type, data);
      if (type === "freeflow-tool-effect-v1" && data.event === "settled") throw new Error("fixture uncertain append");
    };
    const result = await direct(
      f,
      { id: "project.replaceExact", revision: "1" },
      { path: "uncertain.txt", expectedSha256: hash(await readFile(path)), oldText: "old", replacement: "new" },
    );
    assert.equal(result.details.outcome.status, "unknown");
    assert.equal(result.details.outcome.effectState, "unknown");
    assert.equal(await readFile(path, "utf8"), "new\n");
    assert.equal(f.effects.status().unresolvedEffects, 1);

    const blocked = await direct(f, { id: "project.readText", revision: "1" }, { path: "uncertain.txt" });
    assert.equal(blocked.details.outcome.status, "denied");
    assert.equal(blocked.details.outcome.error.code, "unresolved_effect");
    assert.equal(await readFile(path, "utf8"), "new\n");

    f.pi.appendEntry = originalAppend;
    f.effects.reset();
    f.effects.recover(f.ctx);
    assert.equal(f.effects.status().unresolvedEffects, 0, "readback observes the settlement appended before failure");
  } finally {
    await close(f);
  }
});

test("mutation cancellation distinguishes before-body none from after-write completed", async () => {
  const f = await harness();
  try {
    f.tools.registry.register({
      key: { id: "fixture.cancelMutation", revision: "1" },
      description: "Controlled cancellation mutation.",
      keywords: ["fixture", "cancel", "mutation"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      outputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      effects: ["mutation"],
      effect: () => "mutation",
      concurrency: () => "exclusive",
      exposure: { discoverable: false, direct: true, programmatic: true },
      authorize: async () => ({ kind: "allowed" }),
      execute: async (_input, context) => {
        context.host.applied.push("write");
        context.host.controller.abort();
        throw new OperationExecutionError("cancelled", "cancelled after write", "completed");
      },
    });
    const scope = f.tools.createProgramScope("cancel-parent", f.ctx);
    const beforeController = new AbortController();
    const prepared = await f.tools.prepareProgrammatic(
      { id: "fixture.cancelMutation", revision: "1" },
      { value: 1 },
      scope,
      beforeController.signal,
      { ...f.ctx, applied: [], controller: beforeController },
    );
    assert.equal("call" in prepared, true);
    beforeController.abort();
    const before = await f.tools.executePrepared(prepared.call, beforeController.signal);
    assert.equal(before.status, "cancelled");
    assert.equal(before.effectState, "none");
    assert.equal(before.bodyStarted, false);

    const afterController = new AbortController();
    const applied = [];
    const after = await f.tools.executeProgrammatic(
      { id: "fixture.cancelMutation", revision: "1" },
      { value: 1 },
      f.tools.createProgramScope("cancel-after", f.ctx),
      afterController.signal,
      { ...f.ctx, applied, controller: afterController },
    );
    assert.deepEqual(applied, ["write"]);
    assert.equal(after.status, "cancelled");
    assert.equal(after.effectState, "completed");
    assert.equal(after.bodyStarted, true);
    assert.equal(f.effects.status().unresolvedEffects, 0);
  } finally {
    await close(f);
  }
});

test("session replacement after start acknowledgement prevents mutation body execution", async () => {
  const f = await harness();
  let bodies = 0;
  try {
    f.tools.registry.register({
      key: { id: "fixture.sessionMutation", revision: "1" },
      description: "Controlled session-fenced mutation.",
      keywords: ["fixture", "session", "mutation"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      outputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      effects: ["mutation"],
      effect: () => "mutation",
      concurrency: () => "exclusive",
      exposure: { discoverable: false, direct: true, programmatic: true },
      authorize: async () => ({ kind: "allowed" }),
      execute: async (input) => {
        bodies += 1;
        return { value: input, coverage: { kind: "complete-at-boundary", boundary: "fixture" } };
      },
    });
    const prepared = await f.tools.prepareProgrammatic(
      { id: "fixture.sessionMutation", revision: "1" },
      { value: 1 },
      f.tools.createProgramScope("session-parent", f.ctx),
      undefined,
      f.ctx,
    );
    assert.equal("call" in prepared, true);
    f.effects.reset();
    const outcome = await f.tools.executePrepared(prepared.call);
    assert.equal(outcome.status, "unknown");
    assert.equal(outcome.bodyStarted, false);
    assert.equal(outcome.error.code, "effect_settlement_uncertain");
    assert.equal(bodies, 0);
  } finally {
    await close(f);
  }
});

test("non-cooperative live mutation returns an unresolved-effect envelope instead of hanging", async () => {
  const f = await harness();
  try {
    f.tools.registry.register({
      key: { id: "fixture.hangingMutation", revision: "1" },
      description: "Controlled non-cooperative mutation.",
      keywords: ["fixture", "hanging", "mutation"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      outputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      effects: ["mutation"],
      effect: () => "mutation",
      concurrency: () => "exclusive",
      exposure: { discoverable: false, direct: true, programmatic: true },
      authorize: async () => ({ kind: "allowed" }),
      execute: async () => new Promise(() => {}),
    });
    const result = await program(f, {
      operations: [{ id: "fixture.hangingMutation", revision: "1" }],
      timeoutMs: 100,
      code: `await tools.invoke("fixture.hangingMutation", { value: 1 });`,
    });
    const envelope = result.details.freeflowRun;
    assert.equal(envelope.programStatus, "interrupted");
    assert.equal(envelope.effectsSettled, false);
    assert.equal(envelope.continuation, "reconcile-effects");
    assert.equal(envelope.calls.unknown, 1);
    assert.equal(envelope.error.code, "unresolved_effects");
    assert.equal(f.effects.status().unresolvedEffects, 1);
  } finally {
    await close(f);
  }
});

test("unsettled mutation start survives runtime reconstruction and fences live operations", async () => {
  const f = await harness();
  try {
    const path = join(f.root, "restart.txt");
    await writeFile(path, "old\n");
    const originalAppend = f.pi.appendEntry;
    f.pi.appendEntry = (type, data) => {
      if (type === "freeflow-tool-effect-v1" && data.event === "settled") throw new Error("settlement unavailable");
      originalAppend(type, data);
    };
    const result = await direct(
      f,
      { id: "project.replaceExact", revision: "1" },
      { path: "restart.txt", expectedSha256: hash(await readFile(path)), oldText: "old", replacement: "new" },
    );
    assert.equal(result.details.outcome.status, "unknown");
    assert.equal(await readFile(path, "utf8"), "new\n");

    f.manager.appendCustomEntry("freeflow-tool-effect-v1", {
      version: 1,
      event: "started",
      effectId: "effect:not-a-uuid",
      sessionId: f.manager.getSessionId(),
      parentCallId: "forged",
      operation: { id: "project.replaceExact", revision: "1" },
      effect: "mutation",
      inputSha256: "0".repeat(64),
      responsibility: { profile: "solo", control: "inactive" },
      extra: true,
    });
    const recovered = new EffectRuntime({ appendEntry: originalAppend });
    recovered.recover(f.ctx);
    assert.equal(recovered.status().unresolvedEffects, 1);
    assert.equal(recovered.admit(f.tools.createProgramScope("live", f.ctx), "live-read").kind, "denied");
    assert.equal(recovered.admit(f.tools.createProgramScope("capture", f.ctx), "captured-read").kind, "allowed");
  } finally {
    await close(f);
  }
});

test("adapter-mode program executes read-search-replace through the native envelope", async () => {
  const f = await harness();
  try {
    const path = join(f.root, "flow.txt");
    await writeFile(path, "alpha TARGET omega\n");
    const beforeSha256 = hash(await readFile(path));
    const result = await program(f, {
      operations: [
        { id: "project.readText", revision: "1" },
        { id: "project.searchText", revision: "1" },
        { id: "project.replaceExact", revision: "1" },
      ],
      input: { beforeSha256 },
      code: `const before = await tools.invoke("project.readText", { path: "flow.txt" }); const found = await tools.invoke("project.searchText", { query: "TARGET", paths: ["flow.txt"] }); const changed = await tools.invoke("project.replaceExact", { path: "flow.txt", expectedSha256: input.beforeSha256, oldText: "TARGET", replacement: "DONE" }); emit({ before: before.sha256, matches: found.matches.length, after: changed.afterSha256 });`,
    });
    const envelope = result.details.freeflowRun;
    assert.equal(envelope.programStatus, "completed");
    assert.equal(envelope.calls.succeeded, 3);
    assert.equal(envelope.effectsSettled, true);
    assert.equal(envelope.emitted[0].before, beforeSha256);
    assert.equal(envelope.emitted[0].matches, 1);
    assert.equal(await readFile(path, "utf8"), "alpha DONE omega\n");
    assert.equal(envelope.emitted[0].after, hash(await readFile(path)));
  } finally {
    await close(f);
  }
});

test("direct and program paths expose the same live-read value and effect facts", async () => {
  const f = await harness();
  try {
    await writeFile(join(f.root, "parity.txt"), "parity body\n");
    const directResult = await direct(f, { id: "project.readText", revision: "1" }, { path: "parity.txt" });
    const programResult = await program(f, {
      operations: [{ id: "project.readText", revision: "1" }],
      code: `emit(await tools.invoke("project.readText", { path: "parity.txt" }));`,
    });
    assert.equal(directResult.details.outcome.status, "succeeded");
    assert.equal(directResult.details.outcome.effect, "live-read");
    assert.equal(directResult.details.outcome.effectState, "completed");
    assert.deepEqual(programResult.details.freeflowRun.emitted, [directResult.details.outcome.value]);
    const manifest = f.manager.getBranch().findLast((entry) => entry.customType === "freeflow-tool-run-v1").data;
    assert.deepEqual(manifest.outcomes[0], {
      seq: 1,
      operation: { id: "project.readText", revision: "1" },
      status: "succeeded",
      effectState: "completed",
    });
  } finally {
    await close(f);
  }
});

test("scheduler overlaps reads but holds exclusive work through settlement before later reads", async () => {
  const f = await harness();
  const events = [];
  let observeReadsStarted;
  const readsStartedTogether = new Promise((resolve) => {
    observeReadsStarted = resolve;
  });
  let releaseReads;
  const readsReleased = new Promise((resolve) => {
    releaseReads = resolve;
  });
  let releaseSettlement;
  const settlementReleased = new Promise((resolve) => {
    releaseSettlement = resolve;
  });
  let readsStarted = 0;
  try {
    f.tools.registry.register({
      key: { id: "fixture.read", revision: "1" },
      description: "Controlled read fixture.",
      keywords: ["fixture", "read"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: objectSchema({ id: { type: "integer", minimum: 1, maximum: 3 } }),
      outputSchema: objectSchema({ id: { type: "integer", minimum: 1, maximum: 3 } }),
      effects: ["live-read"],
      effect: () => "live-read",
      concurrency: () => "read-parallel",
      exposure: { discoverable: false, direct: true, programmatic: true },
      authorize: async () => ({ kind: "allowed" }),
      execute: async (input) => {
        events.push(`read-${input.id}-start`);
        if (input.id < 3) {
          readsStarted += 1;
          if (readsStarted === 2) observeReadsStarted();
          await readsReleased;
        }
        events.push(`read-${input.id}-end`);
        return { value: { id: input.id }, coverage: { kind: "complete-at-boundary", boundary: "fixture" } };
      },
    });
    f.tools.registry.register({
      key: { id: "fixture.mutate", revision: "1" },
      description: "Controlled mutation fixture.",
      keywords: ["fixture", "mutation"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      outputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      effects: ["mutation"],
      effect: () => "mutation",
      concurrency: () => "exclusive",
      exposure: { discoverable: false, direct: true, programmatic: true },
      authorize: async () => ({ kind: "allowed" }),
      execute: async (input) => {
        events.push("mutation-body");
        return { value: { value: input.value }, coverage: { kind: "complete-at-boundary", boundary: "fixture" } };
      },
    });

    const originalSettle = f.effects.settle.bind(f.effects);
    f.effects.settle = async (ticket, outcome, host) => {
      if (outcome.effect === "mutation") {
        events.push("mutation-settle-wait");
        await settlementReleased;
        events.push("mutation-settle-release");
      }
      return originalSettle(ticket, outcome, host);
    };

    const pending = program(f, {
      operations: [
        { id: "fixture.read", revision: "1" },
        { id: "fixture.mutate", revision: "1" },
      ],
      code: `const first = tools.invoke("fixture.read", { id: 1 }); const second = tools.invoke("fixture.read", { id: 2 }); const mutation = tools.invoke("fixture.mutate", { value: 1 }); const last = tools.invoke("fixture.read", { id: 3 }); await Promise.all([first, second, mutation, last]); emit("done");`,
    });
    await readsStartedTogether;
    assert.equal(events.includes("mutation-body"), false);
    releaseReads();
    while (!events.includes("mutation-settle-wait")) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(events.includes("read-3-start"), false);
    releaseSettlement();
    const result = await pending;
    assert.equal(result.details.freeflowRun.programStatus, "completed");
    assert.ok(events.indexOf("mutation-body") > events.indexOf("read-2-end"));
    assert.ok(events.indexOf("read-3-start") > events.indexOf("mutation-settle-release"));
  } finally {
    releaseReads?.();
    releaseSettlement?.();
    await close(f);
  }
});

test("queued revoked operation is denied before its body while an earlier read drains", async () => {
  const f = await harness();
  let releaseRead;
  const readReleased = new Promise((resolve) => {
    releaseRead = resolve;
  });
  let observeRead;
  const readStarted = new Promise((resolve) => {
    observeRead = resolve;
  });
  let revokedCalls = 0;
  try {
    f.tools.registry.register({
      key: { id: "fixture.blockingRead", revision: "1" },
      description: "Controlled blocking read.",
      keywords: ["fixture", "read"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      outputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      effects: ["live-read"],
      effect: () => "live-read",
      concurrency: () => "read-parallel",
      exposure: { discoverable: false, direct: true, programmatic: true },
      authorize: async () => ({ kind: "allowed" }),
      execute: async (input) => {
        observeRead();
        await readReleased;
        return { value: input, coverage: { kind: "complete-at-boundary", boundary: "fixture" } };
      },
    });
    const registration = f.tools.registry.register({
      key: { id: "fixture.revoked", revision: "1" },
      description: "Controlled revocable operation.",
      keywords: ["fixture", "revoked"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      outputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      effects: ["mutation"],
      effect: () => "mutation",
      concurrency: () => "exclusive",
      exposure: { discoverable: false, direct: true, programmatic: true },
      authorize: async () => ({ kind: "allowed" }),
      execute: async (input) => {
        revokedCalls += 1;
        return { value: input, coverage: { kind: "complete-at-boundary", boundary: "fixture" } };
      },
    });
    const pending = program(f, {
      operations: [
        { id: "fixture.blockingRead", revision: "1" },
        { id: "fixture.revoked", revision: "1" },
      ],
      code: `const first = tools.invoke("fixture.blockingRead", { value: 1 }); const second = tools.invoke("fixture.revoked", { value: 1 }); await first; try { await second; } catch (error) { emit(error.code); }`,
    });
    await readStarted;
    registration.dispose();
    releaseRead();
    const result = await pending;
    assert.equal(result.details.freeflowRun.programStatus, "completed");
    assert.deepEqual(result.details.freeflowRun.emitted, ["operation_unavailable"]);
    assert.equal(revokedCalls, 0);
  } finally {
    releaseRead?.();
    await close(f);
  }
});

test("needs-model admission stops the guest and returns model-decision continuation", async () => {
  const f = await harness();
  try {
    f.tools.registry.register({
      key: { id: "fixture.context", revision: "1" },
      description: "Controlled context-required fixture.",
      keywords: ["fixture", "context"],
      owner: { adapterId: "fixture", adapterRevision: "1", executionWorld: "fixture" },
      inputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      outputSchema: objectSchema({ value: { type: "integer", minimum: 1, maximum: 1 } }),
      effects: ["live-read"],
      effect: () => "live-read",
      concurrency: () => "read-parallel",
      exposure: { discoverable: false, direct: true, programmatic: true },
      authorize: async () => ({ kind: "needs-model", context: { reason: "fixture approval" } }),
      execute: async () => assert.fail("needs-model operation body must not execute"),
    });
    const result = await program(f, {
      operations: [{ id: "fixture.context", revision: "1" }],
      code: `try { await tools.invoke("fixture.context", { value: 1 }); } catch {} emit("must-not-continue");`,
    });
    const envelope = result.details.freeflowRun;
    assert.equal(envelope.programStatus, "interrupted");
    assert.equal(envelope.continuation, "model-decision");
    assert.deepEqual(envelope.modelContext, { reason: "fixture approval" });
    assert.deepEqual(envelope.emitted, []);
    assert.equal(envelope.calls.started, 0);
    assert.equal(envelope.calls.denied, 1);
  } finally {
    await close(f);
  }
});

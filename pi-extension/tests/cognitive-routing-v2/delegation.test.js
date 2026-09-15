import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { resolveCognitiveRoutingState } from "../../dist/cognitive-routing-v2/config.js";
import { RoutingRuntime } from "../../dist/cognitive-routing-v2/runtime.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";
import { fixture } from "../fixtures/routing-native.js";

const coordinator = { provider: "openai", model: "gpt-4o", thinking: "off" };
const worker = { provider: "openai", model: "gpt-4.1-mini", thinking: "off" };
const alternateExecutor = { provider: "openai", model: "gpt-4.1", thinking: "off" };
const bothConfig = {
  enabled: true,
  delegation: "both",
  projection: true,
  profiles: { coordinator, helper: worker, executor: worker },
};
const helperConfig = {
  enabled: true,
  delegation: "helper",
  projection: true,
  profiles: { coordinator, helper: worker },
};

function registry(available = ["coordinator", "helper", "executor"]) {
  const models = {
    coordinator: { provider: "test", id: "coordinator", reasoning: true },
    helper: { provider: "test", id: "helper", reasoning: true },
    executor: { provider: "test", id: "executor", reasoning: true },
  };
  return {
    find(_provider, id) {
      return available.includes(id) ? models[id] : undefined;
    },
    async getApiKeyAndHeaders() {
      return { ok: true };
    },
    clampThinkingLevel(_model, level) {
      return level;
    },
  };
}

const profile = (model) => ({ provider: "test", model, thinking: "off" });

test("delegation modes validate only enabled worker presets and preserve the executor default", async () => {
  const legacy = await resolveCognitiveRoutingState(
    {
      cognitiveRouting: {
        enabled: true,
        profiles: {
          coordinator: profile("coordinator"),
          executor: profile("executor"),
          helper: profile("missing-unused-helper"),
        },
      },
    },
    {},
    { modelRegistry: registry() },
  );
  assert.equal(legacy.delegation, "executor");
  assert.equal(legacy.delegationSource, "default");
  assert.equal(legacy.effective, true, "an unavailable unused Helper preset does not block executor-only mode");

  const helperOnly = await resolveCognitiveRoutingState(
    {
      cognitiveRouting: {
        enabled: true,
        delegation: "helper",
        profiles: { coordinator: profile("coordinator"), helper: profile("helper") },
      },
    },
    {},
    { modelRegistry: registry() },
  );
  assert.equal(helperOnly.effective, true, "helper-only does not require Executor");

  const missingBoth = await resolveCognitiveRoutingState(
    {
      cognitiveRouting: {
        enabled: true,
        delegation: "both",
        profiles: { coordinator: profile("coordinator"), helper: profile("helper") },
      },
    },
    {},
    { modelRegistry: registry() },
  );
  assert.equal(missingBoth.effective, false);
  assert.equal(missingBoth.blockingReason.code, "profile_missing");
  assert.match(missingBoth.blockingReason.message, /executor/i);

  const personalMode = await resolveCognitiveRoutingState(
    {
      cognitiveRouting: {
        enabled: true,
        delegation: "executor",
        profiles: { coordinator: profile("coordinator"), executor: profile("executor") },
      },
    },
    {
      cognitiveRouting: {
        delegation: "helper",
        profiles: { helper: profile("helper") },
      },
    },
    { modelRegistry: registry() },
  );
  assert.equal(personalMode.effective, true);
  assert.equal(personalMode.delegation, "helper");
  assert.equal(personalMode.delegationSource, "personal");

  const malformedUnused = await resolveCognitiveRoutingState(
    {
      cognitiveRouting: {
        enabled: true,
        profiles: {
          coordinator: profile("coordinator"),
          executor: profile("executor"),
          helper: { provider: "test", model: "helper" },
        },
      },
    },
    {},
    { modelRegistry: registry() },
  );
  assert.equal(malformedUnused.configValid, false, "malformed unused presets remain invalid configuration");
});

test("a duplicate delegation operation cannot change its recorded worker", { timeout: 30000 }, async () => {
  const originalInvoke = RoutingRuntime.prototype.invoke;
  let checked = false;
  RoutingRuntime.prototype.invoke = async function (name, id, input, signal, ctx) {
    const result = await originalInvoke.call(this, name, id, input, signal, ctx);
    if (!checked && name === "freeflow_delegate" && input.worker === "helper") {
      checked = true;
      this.receipts.clear();
      const conflict = await originalInvoke.call(this, name, id, { ...input, worker: "executor" }, signal, ctx);
      assert.equal(conflict.details.code, "operation_conflict");
    }
    return result;
  };
  try {
    const result = await fixture(
      (n) =>
        n === 1
          ? [
              {
                name: "freeflow_delegate",
                args: { operation: "assign", worker: "helper", contract: "Keep the accepted Helper identity." },
              },
            ]
          : n === 2
            ? [
                {
                  name: "freeflow_return",
                  args: { operation: "submit", report: "Helper identity retained.", outcome: "completed" },
                },
              ]
            : n === 3
              ? [
                  {
                    name: "freeflow_unit",
                    args: { operation: "close", outcome: "accepted", assessment: "Worker identity is stable." },
                  },
                ]
              : [],
      true,
      undefined,
      true,
      { cognitiveRouting: bothConfig, maxRequests: 5 },
    );
    assert.equal(checked, true);
    assert.equal([...result.state.handoffs.values()].find((handoff) => handoff.kind === "delegate").to, "helper");
  } finally {
    RoutingRuntime.prototype.invoke = originalInvoke;
  }
});

test("both mode requires an explicit worker and shares Helper history with Executor", { timeout: 30000 }, async () => {
  let helperReadId;
  const result = await fixture(
    (n, body, manager) => {
      const wire = JSON.stringify(body);
      if (n === 1) return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Ambiguous worker." } }];
      if (n === 2) {
        assert.equal(replay(manager.getBranch()).assignments.size, 0, "ambiguous delegation appends no assignment");
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", worker: "helper", contract: "Read the marker for later implementation." },
          },
        ];
      }
      if (n === 3) {
        assert.equal(body.model, "gpt-4.1-mini");
        assert.equal(replay(manager.getBranch()).profile, "helper");
        return [{ name: "read", args: { path: "unselected.txt" } }];
      }
      if (n === 4) {
        const read = manager
          .getBranch()
          .filter((entry) => entry.message?.toolName === "read")
          .at(-1);
        helperReadId = read.id;
        assert.equal(read.message.isError, false);
        assert.match(wire, /UNSELECTED_PRIVATE_BODY_93/);
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Helper context gathered.", outcome: "completed" },
          },
        ];
      }
      if (n === 5) {
        assert.equal(body.model, "gpt-4o");
        assert.equal(replay(manager.getBranch()).profile, "coordinator");
        assert.doesNotMatch(
          wire,
          /UNSELECTED_PRIVATE_BODY_93/,
          "unselected Helper result stays out of Coordinator view",
        );
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", worker: "executor", contract: "Use the gathered marker and report." },
          },
        ];
      }
      if (n === 6) {
        assert.equal(body.model, "gpt-4.1-mini");
        assert.equal(replay(manager.getBranch()).profile, "executor");
        assert.match(wire, /UNSELECTED_PRIVATE_BODY_93/, "Executor inherits ordinary Helper history");
        assert.equal(
          manager.getBranch().filter((entry) => entry.message?.toolName === "read").length,
          1,
          "Executor does not rerun Helper's read",
        );
        return [
          {
            name: "freeflow_project",
            args: { operation: "add", refs: [`ctx:${helperReadId}`] },
          },
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Executor used shared context.", outcome: "completed" },
          },
        ];
      }
      if (n === 7) {
        assert.equal(body.model, "gpt-4o");
        assert.match(wire, /UNSELECTED_PRIVATE_BODY_93/);
        assert.match(wire, /producer: helper/);
        return [
          {
            name: "freeflow_unit",
            args: { operation: "close", outcome: "accepted", assessment: "Shared worker context observed." },
          },
        ];
      }
      return [];
    },
    true,
    undefined,
    true,
    { cognitiveRouting: bothConfig, maxRequests: 9 },
  );
  assert.equal(result.requests.length, 8);
  assert.equal(result.state.units.values().next().value.state, "closed");
  const delegates = [...result.state.handoffs.values()].filter((handoff) => handoff.kind === "delegate");
  assert.deepEqual(
    delegates.map((handoff) => handoff.to),
    ["helper", "executor"],
  );
});

test(
  "helper-only rejects Executor delegation and recovers through the recorded Helper",
  { timeout: 30000 },
  async () => {
    let assignmentId, baseReportId;
    const result = await fixture(
      (n, body, manager) => {
        if (n === 1)
          return [
            {
              name: "freeflow_delegate",
              args: { operation: "assign", worker: "executor", contract: "Disabled target." },
            },
          ];
        if (n === 2) {
          assert.equal(replay(manager.getBranch()).assignments.size, 0);
          return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return then recover." } }];
        }
        if (n === 3) {
          const state = replay(manager.getBranch());
          assignmentId = state.assignmentId;
          assert.equal(state.profile, "helper");
          return [
            {
              name: "freeflow_return",
              args: { operation: "submit", report: "Helper base report.", outcome: "completed" },
            },
          ];
        }
        if (n === 4) {
          const state = replay(manager.getBranch());
          baseReportId = state.assignments.get(assignmentId).returnHandoffId;
          return [
            {
              name: "freeflow_unit",
              args: { operation: "recover", request: "Read the approved recovery file.", paths: ["recovery.txt"] },
            },
          ];
        }
        if (n === 5) {
          assert.equal(replay(manager.getBranch()).profile, "helper");
          return [{ name: "read", args: { path: "recovery.txt" } }];
        }
        if (n === 6)
          return [
            {
              name: "freeflow_return",
              args: { operation: "supplement", report: "Helper recovery supplement.", outcome: "completed" },
            },
          ];
        if (n === 7) {
          const state = replay(manager.getBranch());
          assert.equal(state.assignmentId, assignmentId);
          assert.equal(state.assignments.get(assignmentId).returnHandoffId, baseReportId);
          assert.equal(state.handoffs.get(baseReportId).text, "Helper base report.");
          const completed = [...state.recoveries.values()].at(-1);
          assert.equal(completed.state, "completed");
          assert.equal(state.handoffs.get(completed.requestHandoffId).to, "helper");
          assert.equal(state.handoffs.get(completed.supplementHandoffId).from, "helper");
          return [
            {
              name: "freeflow_unit",
              args: { operation: "close", outcome: "accepted", assessment: "Helper recovery retained lineage." },
            },
          ];
        }
        return [];
      },
      true,
      undefined,
      true,
      { cognitiveRouting: helperConfig, maxRequests: 9 },
    );
    assert.equal(result.requests.length, 8);
  },
);

test("new input routes through Coordinator before the same Helper assignment resumes", { timeout: 30000 }, async () => {
  let assignmentId;
  const result = await fixture(
    (n, body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Keep the Helper task." } }];
      if (n === 2) {
        assignmentId = replay(manager.getBranch()).assignmentId;
        assert.equal(replay(manager.getBranch()).profile, "helper");
        return [];
      }
      if (n === 3) {
        const state = replay(manager.getBranch());
        assert.equal(body.model, "gpt-4o");
        assert.equal(state.profile, "coordinator");
        assert.equal(state.assignments.get(assignmentId).state, "outstanding");
        return [];
      }
      if (n === 4) {
        const state = replay(manager.getBranch());
        assert.equal(state.profile, "helper");
        assert.equal(state.assignmentId, assignmentId);
        assert.doesNotMatch(JSON.stringify(body), /New delivered user input requires Coordinator attention/);
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Helper resumed after Coordinator attention.", outcome: "completed" },
          },
        ];
      }
      return [];
    },
    true,
    async ({ session }) => {
      await session.prompt("Consider this new direction before continuing.");
      await session.waitForIdle();
      await session.prompt("/freeflow resume");
      await session.waitForIdle();
    },
    true,
    { cognitiveRouting: helperConfig, maxRequests: 6 },
  );
  assert.equal(result.requests.length, 5);
  assert.equal(result.state.assignments.get(assignmentId).state, "returned");
});

test("an accepted Helper assignment survives a later executor-only mode change", { timeout: 30000 }, async () => {
  let assignmentId;
  const result = await fixture(
    (n, body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Keep this Helper assignment." } }];
      if (n === 2) {
        assignmentId = replay(manager.getBranch()).assignmentId;
        assert.equal(replay(manager.getBranch()).profile, "helper");
        return [];
      }
      if (n === 3) {
        const state = replay(manager.getBranch());
        assert.equal(state.assignmentId, assignmentId);
        assert.equal(state.profile, "helper");
        assert.equal(body.model, "gpt-4.1-mini");
        assert.notEqual(body.model, alternateExecutor.model, "resume does not use the newly enabled Executor pair");
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Original Helper assignment resumed.", outcome: "completed" },
          },
        ];
      }
      if (n === 4)
        return [
          {
            name: "freeflow_unit",
            args: { operation: "close", outcome: "accepted", assessment: "Mode change did not retarget work." },
          },
        ];
      return [];
    },
    true,
    async ({ session, cwd }) => {
      await writeFile(
        join(cwd, ".freeflow/config.json"),
        JSON.stringify({
          cognitiveRouting: {
            enabled: true,
            delegation: "executor",
            projection: true,
            profiles: { coordinator, helper: worker, executor: alternateExecutor },
          },
        }),
      );
      await session.reload();
      await session.prompt("/freeflow resume");
      await session.waitForIdle();
    },
    true,
    { cognitiveRouting: helperConfig, maxRequests: 6 },
  );
  assert.equal(result.requests.length, 5);
  assert.equal(result.state.assignments.get(assignmentId).state, "returned");
});

test(
  "an outstanding Helper assignment fails closed when its preset becomes unavailable",
  { timeout: 30000 },
  async () => {
    let assignmentId, delegateHandoffId;
    const result = await fixture(
      (n, body, manager) => {
        if (n === 1)
          return [
            { name: "freeflow_delegate", args: { operation: "assign", contract: "Retain unavailable Helper work." } },
          ];
        if (n === 2) {
          const state = replay(manager.getBranch());
          assignmentId = state.assignmentId;
          delegateHandoffId = state.assignments.get(assignmentId).delegateHandoffId;
          assert.equal(state.profile, "helper");
          return [];
        }
        assert.fail(`blocked continuation unexpectedly reached the provider with ${body.model}`);
      },
      true,
      async ({ session, cwd, requests, notices }) => {
        await writeFile(
          join(cwd, ".freeflow/config.json"),
          JSON.stringify({
            cognitiveRouting: {
              enabled: true,
              delegation: "executor",
              projection: true,
              profiles: { coordinator, executor: alternateExecutor },
            },
          }),
        );
        await session.reload();
        const requestCount = requests.length;
        await session.prompt("/freeflow resume");
        await session.waitForIdle();
        assert.equal(requests.length, requestCount, "blocked resume makes no provider request");
        assert.equal(session.model.id, "gpt-4.1-mini", "no fallback setter applies the Executor pair");
        assert.match(JSON.stringify(notices), /profile_missing|helper/i);
      },
      true,
      { cognitiveRouting: helperConfig, maxRequests: 4 },
    );
    assert.equal(result.requests.length, 2);
    assert.equal(result.state.assignmentId, assignmentId);
    assert.equal(result.state.assignments.get(assignmentId).state, "outstanding");
    assert.equal(result.state.assignments.get(assignmentId).delegateHandoffId, delegateHandoffId);
    assert.equal(result.state.handoffs.get(delegateHandoffId).to, "helper");
    assert.equal(
      [...result.state.handoffs.values()].some((handoff) => handoff.kind === "return"),
      false,
    );
  },
);

test("compaction and explicit resume preserve a Helper assignment", { timeout: 30000 }, async () => {
  let assignmentId, basis;
  const result = await fixture(
    (n, body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Preserve Helper work." } }];
      if (n === 2) {
        const state = replay(manager.getBranch());
        assignmentId = state.assignmentId;
        basis = state.assignments.get(assignmentId).basisUserEntryId;
        return [{ name: "read", args: { path: "evidence.txt" } }];
      }
      if (n === 4) {
        const state = replay(manager.getBranch());
        assert.equal(state.profile, "helper");
        assert.equal(state.assignmentId, assignmentId);
        assert.equal(state.resumeBasis.get(assignmentId), basis);
        assert.doesNotMatch(JSON.stringify(body), /New delivered user input requires Coordinator attention/);
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Helper resumed after compaction.", outcome: "completed" },
          },
        ];
      }
      return [];
    },
    true,
    async ({ session, manager }) => {
      await session.compact();
      assert.equal(
        manager.buildSessionContext().messages.some((message) => message.role === "user"),
        false,
      );
      await session.reload();
      await session.prompt("/freeflow resume");
      await session.waitForIdle();
    },
    true,
    { cognitiveRouting: helperConfig, maxRequests: 6 },
  );
  assert.equal(result.requests.length, 5);
  assert.equal(result.state.assignments.get(assignmentId).state, "returned");
});

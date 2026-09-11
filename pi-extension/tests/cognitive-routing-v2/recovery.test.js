import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";

test(
  "resume after attention restores saved-return correction without reopening task work",
  { timeout: 30000 },
  async () => {
    let reportId;
    await fixture(
      (n, body, manager) => {
        if (n === 1)
          return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read and report." } }];
        if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
        if (n === 3)
          return [
            { name: "freeflow_project", args: { operation: "add", refs: ["ctx:missing"] } },
            {
              name: "freeflow_return",
              args: { operation: "submit", report: "ORIGINAL_SAVED_REPORT", outcome: "partial" },
            },
          ];
        if (n === 4) {
          reportId = replay(manager.getBranch()).pendingId;
          return [];
        }
        if (n === 5) {
          assert.equal(body.model, "gpt-4o");
          return [];
        }
        if (n === 6) {
          assert.equal(body.model, "gpt-4.1-mini");
          return [{ name: "read", args: { path: "unselected.txt" } }];
        }
        if (n === 7) {
          assert.equal(
            manager
              .getBranch()
              .filter((e) => e.message?.toolName === "read")
              .at(-1).message.isError,
            true,
          );
          return [
            {
              name: "freeflow_project",
              args: {
                operation: "remove",
                refs: ["ctx:missing"],
                reason: "Invalid reference; evidence gap remains disclosed.",
              },
            },
            { name: "freeflow_return", args: { operation: "retry" } },
          ];
        }
        assert.equal(body.model, "gpt-4o");
        assert.match(JSON.stringify(body), /ORIGINAL_SAVED_REPORT/);
        assert.match(JSON.stringify(body), /evidence gap remains disclosed/);
        const state = replay(manager.getBranch());
        assert.equal(state.assessment.handoffId, reportId);
        assert.equal(state.handoffs.get(reportId).reportRevision, 1);
        assert.equal(state.assessment.view, "active");
        return [];
      },
      true,
      async ({ session, requests }) => {
        await session.prompt("Explain the saved return's problem.");
        await session.waitForIdle();
        await session.prompt("/freeflow resume");
        await session.waitForIdle();
        assert.equal(requests.length, 8);
      },
    );
  },
);

const normal = (n) =>
  n === 1
    ? [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt and report." } }]
    : n === 2
      ? [{ name: "read", args: { path: "evidence.txt" } }]
      : n === 3
        ? [{ name: "freeflow_return", args: { operation: "submit", report: "Read completed.", outcome: "completed" } }]
        : [];

for (const cut of ["delegate-accepted", "executor-configured", "executor-call", "read-result", "return-accepted"]) {
  test(`native navigation reconciles valid ${cut} without replaying work`, { timeout: 30000 }, async () => {
    await fixture(normal, false, async ({ session, manager, requests }) => {
      const chosen = manager
        .getEntries()
        .find((e) =>
          cut === "executor-configured"
            ? e.data?.data?.type === "handoff-state" && e.data.data.state === "configured"
            : cut === "executor-call"
              ? e.message?.role === "assistant" && e.message.content?.some((b) => b.name === "read")
              : cut === "read-result"
                ? e.message?.toolName === "read"
                : e.data?.data?.type === cut,
        );
      const reads = manager.getEntries().filter((e) => e.message?.toolName === "read").length;
      await session.navigateTree(chosen.id, { summarize: false });
      const before = requests.length;
      await session.prompt("Explain the saved state at this point.");
      await session.waitForIdle();
      assert.equal(requests.length, before + 1);
      assert.equal(requests.at(-1).model, "gpt-4o");
      assert.equal(manager.getEntries().filter((e) => e.message?.toolName === "read").length, reads);
      assert.equal(replay(manager.getBranch()).profile, "coordinator");
    });
  });
}

test(
  "explicit resume continues the same assignment after Coordinator handles new input",
  { timeout: 30000 },
  async () => {
    let assignment, unit;
    await fixture(
      (n, body, manager) => {
        if (n <= 2) return normal(n);
        if (n === 3) {
          const s = replay(manager.getBranch());
          assignment = s.assignmentId;
          unit = s.unitId;
          return [];
        }
        if (n === 4) {
          assert.equal(body.model, "gpt-4o");
          return [];
        }
        if (n === 5) {
          assert.equal(body.model, "gpt-4.1-mini");
          const s = replay(manager.getBranch());
          assert.equal(s.assignmentId, assignment);
          assert.equal(s.unitId, unit);
          assert.equal(s.assignments.size, 1);
          assert.match(JSON.stringify(body), /Do not edit files/);
          assert.doesNotMatch(JSON.stringify(body), /New delivered user input requires Coordinator attention/);
          return [{ name: "read", args: { path: "unselected.txt" } }];
        }
        if (n === 6) {
          const read = manager
            .getBranch()
            .filter((e) => e.message?.toolName === "read")
            .at(-1);
          assert.equal(read.message.isError, false);
          return [
            {
              name: "freeflow_return",
              args: { operation: "submit", report: "Resumed read completed; no edits.", outcome: "completed" },
            },
          ];
        }
        assert.equal(body.model, "gpt-4o");
        return [];
      },
      false,
      async ({ session, manager, requests }) => {
        await session.prompt("Do not edit files. Explain the current partial result.");
        await session.waitForIdle();
        await session.prompt("/freeflow resume");
        await session.waitForIdle();
        assert.equal(requests.length, 7);
        assert.equal(replay(manager.getBranch()).assignments.get(assignment).state, "returned");
      },
    );
  },
);

test("current manual hold survives navigation and resume cannot release it", { timeout: 30000 }, async () => {
  await fixture(normal, false, async ({ session, manager, requests }) => {
    const old = manager.getEntries().find((e) => e.data?.data?.type === "delegate-accepted");
    await session.prompt("/freeflow profile executor");
    await session.navigateTree(old.id, { summarize: false });
    const before = requests.length;
    await session.prompt("/freeflow resume");
    assert.equal(requests.length, before);
    const s = replay(manager.getBranch());
    assert.equal(s.control, "manual");
    assert.equal(s.profile, "executor");
    assert.equal(session.model.id, "gpt-4.1-mini");
  });
});

test(
  "late steering keeps the captured Executor request coherent and blocks dependent task tools",
  { timeout: 30000 },
  async () => {
    let active;
    await fixture(
      async (n, body, manager) => {
        if (n === 1) return normal(n);
        if (n === 2) {
          await active.steer("Stop further reads and explain the current result.");
          return normal(n);
        }
        if (n === 3) {
          assert.equal(body.model, "gpt-4.1-mini");
          assert.match(JSON.stringify(body), /New delivered user input requires Coordinator attention/);
          assert.ok(!body.tools.some((t) => t.name === "freeflow_delegate"));
          assert.deepEqual(body.tools.find((t) => t.name === "freeflow_unit").parameters.properties.operation.enum, [
            "inspect",
          ]);
          return [{ name: "read", args: { path: "unselected.txt" } }];
        }
        if (n === 4) {
          assert.equal(
            manager
              .getBranch()
              .filter((e) => e.message?.toolName === "read")
              .at(-1).message.isError,
            true,
          );
          return [
            {
              name: "freeflow_return",
              args: { operation: "submit", report: "Stopped for the newer instruction.", outcome: "partial" },
            },
          ];
        }
        assert.equal(body.model, "gpt-4o");
        assert.ok(!body.tools.some((t) => t.name === "freeflow_return" || t.name === "freeflow_project"));
        assert.match(JSON.stringify(body), /Stop further reads/);
        return [];
      },
      false,
      undefined,
      true,
      {
        onSession: (session) => {
          active = session;
        },
      },
    );
  },
);

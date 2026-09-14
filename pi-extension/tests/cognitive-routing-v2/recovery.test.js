import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "../fixtures/routing-native.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";
import { RoutingRuntime } from "../../dist/cognitive-routing-v2/runtime.js";

test(
  "attached recovery reuses omitted evidence, gates exact native reads, and blocks post-supplement work",
  { timeout: 30000 },
  async () => {
    let assignmentId, baseReportId, baseReportRevision, omittedRef, supplementRef, recoveryRef, cwd;
    const originalInvoke = RoutingRuntime.prototype.invoke;
    const replayed = new Set();
    RoutingRuntime.prototype.invoke = async function (name, id, input, signal, ctx) {
      const intercepted =
        name === "freeflow_unit" && input.operation === "recover"
          ? { ...input, request: `${input.request} [accepted]` }
          : name === "freeflow_return" && input.operation === "supplement"
            ? { ...input, report: `${input.report} [accepted]` }
            : input;
      const first = await originalInvoke.call(this, name, id, intercepted, signal, ctx);
      const key = `${name}:${input.operation}`;
      if (
        ((name === "freeflow_unit" && input.operation === "recover") ||
          (name === "freeflow_return" && input.operation === "supplement")) &&
        !replayed.has(key)
      ) {
        replayed.add(key);
        this.receipts.clear();
        const repeated = await originalInvoke.call(this, name, id, intercepted, signal, ctx);
        assert.deepEqual(repeated, first, "same accepted operation returns the recorded receipt");
        this.receipts.clear();
        const changed = await originalInvoke.call(
          this,
          name,
          id,
          { ...intercepted, [input.operation === "recover" ? "request" : "report"]: "CHANGED_PAYLOAD" },
          signal,
          ctx,
        );
        assert.equal(changed.details.code, "operation_conflict");
      }
      return first;
    };
    try {
      await fixture(
        async (n, body, manager) => {
          if (n === 1)
            return [
              { name: "freeflow_delegate", args: { operation: "assign", contract: "Read two files and report." } },
            ];
          if (n === 2)
            return [
              { name: "read", args: { path: "evidence.txt" } },
              { name: "read", args: { path: "unselected.txt" } },
            ];
          if (n === 3) {
            const reads = manager.getBranch().filter((e) => e.message?.toolName === "read" && !e.message.isError);
            omittedRef = `ctx:${reads[1].id}`;
            return [
              { name: "freeflow_project", args: { operation: "add", refs: [`ctx:${reads[0].id}`] } },
              {
                name: "freeflow_return",
                args: { operation: "submit", report: "BASE_REPORT_UNCHANGED_41", outcome: "completed" },
              },
            ];
          }
          if (n === 4) {
            const state = replay(manager.getBranch());
            assignmentId = state.assignmentId;
            baseReportId = state.assignments.get(assignmentId).returnHandoffId;
            baseReportRevision = state.handoffs.get(baseReportId).reportRevision;
            const wire = JSON.stringify(body);
            assert.match(wire, /BASE_REPORT_UNCHANGED_41/);
            assert.match(wire, /EXACT_EVIDENCE_BODY_81/);
            assert.doesNotMatch(wire, /UNSELECTED_PRIVATE_BODY_93/);
            return [
              {
                name: "freeflow_unit",
                args: {
                  operation: "recover",
                  request: "Select the omitted result and read the approved third file only.",
                  paths: ["recovery.txt"],
                },
              },
            ];
          }
          if (n === 5) {
            assert.equal(body.model, "gpt-4.1-mini");
            assert.match(
              JSON.stringify(body),
              /Select the omitted result and read the approved third file only\. \[accepted\]/,
            );
            return [
              { name: "read", args: { path: "recovery.txt" } },
              { name: "read", args: { path: "@recovery.txt" } },
              { name: "read", args: { path: "evidence.txt" } },
              { name: "write", args: { path: "recovery-write.txt", content: "forbidden" } },
              { name: "bash", args: { command: "touch recovery-bash.txt" } },
            ];
          }
          if (n === 6) {
            const recent = manager
              .getBranch()
              .filter((e) => ["read", "write", "bash"].includes(e.message?.toolName))
              .slice(-5);
            const allowed = recent.find(
              (e) =>
                e.message.toolName === "read" &&
                !e.message.isError &&
                JSON.stringify(e.message).includes("FRESH_RECOVERY_BODY_57"),
            );
            assert.ok(allowed, "the exact approved native read executes");
            assert.equal(
              recent.filter((e) => e !== allowed).every((e) => e.message.isError),
              true,
            );
            await assert.rejects(access(join(cwd, "recovery-write.txt")));
            await assert.rejects(access(join(cwd, "recovery-bash.txt")));
            assert.equal(await readFile(join(cwd, "@recovery.txt"), "utf8"), "LITERAL_AT_FILE_BODY_68");
            assert.equal(
              recent.some((e) => JSON.stringify(e.message).includes("LITERAL_AT_FILE_BODY_68")),
              false,
              "Pi never reaches either @-transformed or literal resource for a rejected alias",
            );
            return [
              {
                name: "freeflow_project",
                args: { operation: "add", refs: [omittedRef, `ctx:${allowed.id}`, "ctx:missing"] },
              },
              {
                name: "freeflow_return",
                args: { operation: "supplement", report: "RECOVERY_SUPPLEMENT_73", outcome: "completed" },
              },
            ];
          }
          if (n === 7) return [{ name: "read", args: { path: "recovery.txt" } }];
          if (n === 8) {
            const postSupplement = manager
              .getBranch()
              .filter((e) => e.message?.toolName === "read")
              .at(-1);
            assert.equal(postSupplement.message.isError, true, "a saved supplement ends recovery read permission");
            return [
              {
                name: "freeflow_project",
                args: { operation: "remove", refs: ["ctx:missing"], reason: "Fixture removes the unresolved request." },
              },
              { name: "freeflow_return", args: { operation: "retry" } },
            ];
          }
          assert.equal(body.model, "gpt-4o");
          const wire = JSON.stringify(body);
          const state = replay(manager.getBranch());
          if (n === 14) {
            assert.equal(state.assessment.view, "suspended");
            assert.equal(state.assessment.suspensionReason, "user-attention");
            assert.doesNotMatch(wire, /EXACT_EVIDENCE_BODY_81/);
            assert.match(wire, /NEW_USER_ATTENTION_29/);
            return [{ name: "freeflow_unit", args: { operation: "assess" } }];
          }
          for (const value of [
            "BASE_REPORT_UNCHANGED_41",
            "RECOVERY_SUPPLEMENT_73 [accepted]",
            "EXACT_EVIDENCE_BODY_81",
            "UNSELECTED_PRIVATE_BODY_93",
            "FRESH_RECOVERY_BODY_57",
          ])
            assert.ok(wire.includes(value), `missing ${value}`);
          if (n === 15) {
            assert.equal(state.assessment.view, "active");
            return [];
          }
          assert.equal(state.assignmentId, assignmentId);
          assert.equal(state.assignments.get(assignmentId).state, "returned");
          assert.equal(state.assignments.get(assignmentId).returnHandoffId, baseReportId);
          assert.equal(state.handoffs.get(baseReportId).text, "BASE_REPORT_UNCHANGED_41");
          assert.equal(state.handoffs.get(baseReportId).outcome, "completed");
          assert.equal(state.handoffs.get(baseReportId).reportRevision, baseReportRevision);
          assert.equal(state.assessment.handoffId, baseReportId);
          assert.equal(state.assessment.view, "active");
          assert.equal(state.recoveryId, undefined);
          const completedRecovery = [...state.recoveries.values()].at(-1);
          assert.equal(completedRecovery.state, "completed");
          supplementRef = `supplement:${completedRecovery.id}:${completedRecovery.supplementRevision}`;
          recoveryRef = `recovery:${completedRecovery.id}`;
          assert.equal(
            state.selections.get(assignmentId).selected.includes(omittedRef),
            true,
            "the originally omitted result is selected",
          );
          for (const marker of ["EXACT_EVIDENCE_BODY_81", "UNSELECTED_PRIVATE_BODY_93"])
            assert.equal(
              manager
                .getBranch()
                .filter(
                  (e) =>
                    e.message?.toolName === "read" && !e.message.isError && JSON.stringify(e.message).includes(marker),
                ).length,
              1,
              `${marker} was not replayed`,
            );
          if (n === 9)
            return [{ name: "freeflow_unit", args: { operation: "inspect", view: "detail", ref: supplementRef } }];
          if (n === 10) {
            const detail = manager
              .getBranch()
              .filter((e) => e.message?.toolName === "freeflow_unit")
              .at(-1).message.details;
            assert.equal(detail.supplement, "RECOVERY_SUPPLEMENT_73 [accepted]");
            assert.equal(detail.report, "BASE_REPORT_UNCHANGED_41");
            assert.equal(detail.reportRef, `report:${baseReportId}:${baseReportRevision}`);
            return [{ name: "freeflow_unit", args: { operation: "inspect", view: "detail", ref: recoveryRef } }];
          }
          const detail = manager
            .getBranch()
            .filter((e) => e.message?.toolName === "freeflow_unit")
            .at(-1).message.details;
          assert.equal(detail.recovery.state, "completed");
          assert.equal(detail.supplementRef, supplementRef);
          return [];
        },
        true,
        async ({ session, manager, requests }) => {
          await session.prompt("/freeflow resume");
          await session.waitForIdle();
          assert.equal(requests.length, 12);
          await session.compact();
          assert.equal(
            manager.buildSessionContext().messages.some((message) => message.role === "user"),
            false,
          );
          await session.reload();
          await session.prompt("/freeflow resume");
          await session.waitForIdle();
          await session.prompt("NEW_USER_ATTENTION_29");
          await session.waitForIdle();
          assert.equal(requests.length, 15);
        },
        true,
        { beforePrompt: (fixtureState) => (cwd = fixtureState.cwd) },
      );
    } finally {
      RoutingRuntime.prototype.invoke = originalInvoke;
    }
  },
);

test(
  "partial recovery supplement delivers communication while evidence remains suspended",
  { timeout: 30000 },
  async () => {
    let baseReportId;
    await fixture((n, body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return a base report." } }];
      if (n === 2)
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "FALLBACK_BASE_REPORT_19", outcome: "completed" },
          },
        ];
      if (n === 3) {
        const state = replay(manager.getBranch());
        baseReportId = state.assignments.get(state.assignmentId).returnHandoffId;
        return [
          {
            name: "freeflow_unit",
            args: { operation: "recover", request: "Report unavailable evidence honestly." },
          },
        ];
      }
      if (n === 4)
        return [
          { name: "freeflow_project", args: { operation: "add", refs: ["ctx:missing"] } },
          {
            name: "freeflow_return",
            args: { operation: "supplement", report: "FALLBACK_SUPPLEMENT_23", outcome: "partial" },
          },
        ];
      assert.equal(body.model, "gpt-4o");
      const wire = JSON.stringify(body);
      assert.match(wire, /FALLBACK_BASE_REPORT_19/);
      assert.match(wire, /FALLBACK_SUPPLEMENT_23/);
      assert.match(wire, /source_unavailable|Exact source is unavailable/);
      const state = replay(manager.getBranch());
      assert.equal(state.assessment.handoffId, baseReportId);
      assert.equal(state.assessment.view, "suspended");
      assert.equal(state.assessment.suspensionReason, "delivery-gap");
      assert.equal(state.recoveryId, undefined);
      assert.equal([...state.recoveries.values()].at(-1).state, "completed");
      return [];
    });
  },
);

test(
  "recovery cancellation preserves the report and restores the same assessment explicitly",
  { timeout: 30000 },
  async () => {
    let baseReportId;
    await fixture(
      (n, _body, manager) => {
        if (n === 1)
          return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return a base report." } }];
        if (n === 2)
          return [
            { name: "freeflow_return", args: { operation: "submit", report: "CANCEL_BASE_31", outcome: "completed" } },
          ];
        if (n === 3) {
          const state = replay(manager.getBranch());
          baseReportId = state.assignments.get(state.assignmentId).returnHandoffId;
          return [{ name: "freeflow_unit", args: { operation: "recover", request: "Wait for cancellation." } }];
        }
        if (n === 4) return [];
        if (n === 5)
          return [{ name: "freeflow_unit", args: { operation: "cancel-recovery", reason: "No longer needed." } }];
        if (n === 6) {
          const state = replay(manager.getBranch());
          assert.equal(state.recoveryId, undefined);
          assert.equal([...state.recoveries.values()].at(-1).state, "cancelled");
          assert.equal(state.handoffs.get(baseReportId).text, "CANCEL_BASE_31");
          assert.equal(state.assessment.handoffId, baseReportId);
          assert.equal(state.assessment.view, "suspended");
          return [{ name: "freeflow_unit", args: { operation: "assess" } }];
        }
        assert.equal(replay(manager.getBranch()).assessment.view, "active");
        return [];
      },
      true,
      async ({ session }) => {
        await session.prompt("Cancel the evidence recovery without changing the report.");
        await session.waitForIdle();
      },
    );
  },
);

test(
  "fresh user recovery uses its own input basis without a changed-direction warning",
  { timeout: 30000 },
  async () => {
    await fixture(
      (n, body) => {
        if (n === 1) return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return once." } }];
        if (n === 2)
          return [{ name: "freeflow_return", args: { operation: "submit", report: "base", outcome: "completed" } }];
        if (n === 3) return [];
        if (n === 4)
          return [
            {
              name: "freeflow_unit",
              args: { operation: "recover", request: "Recover evidence for this assessment." },
            },
          ];
        if (n === 5) {
          const wire = JSON.stringify(body);
          assert.equal(body.model, "gpt-4.1-mini");
          assert.match(wire, /Recovery request: Recover evidence for this assessment\./);
          assert.doesNotMatch(wire, /Current input differs from the active Executor responsibility/);
          return [
            {
              name: "freeflow_return",
              args: { operation: "supplement", report: "fresh-basis supplement", outcome: "completed" },
            },
          ];
        }
        return [];
      },
      true,
      async ({ session }) => {
        await session.prompt("Please recover omitted evidence now.");
        await session.waitForIdle();
      },
    );
  },
);

test("assessment waits for recovery cancellation before resuming", { timeout: 30000 }, async () => {
  let selection;
  await fixture(
    (n, body, manager) => {
      if (n === 1) return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return once." } }];
      if (n === 2)
        return [{ name: "freeflow_return", args: { operation: "submit", report: "base", outcome: "completed" } }];
      if (n === 3) return [{ name: "freeflow_unit", args: { operation: "recover", request: "Recover later." } }];
      if (n === 4) {
        const state = replay(manager.getBranch());
        selection = structuredClone(state.selections.get(state.assignmentId));
        return [];
      }
      if (n === 5) {
        const wire = JSON.stringify(body);
        assert.match(
          wire,
          /Finish and deliver the recovery supplement or cancel recovery before using freeflow_unit assess/,
        );
        assert.doesNotMatch(wire, /Use freeflow_unit assess to restore the assessment/);
        return [{ name: "freeflow_unit", args: { operation: "assess" } }];
      }
      if (n === 6) {
        const state = replay(manager.getBranch());
        const result = manager
          .getBranch()
          .filter((entry) => entry.message?.toolName === "freeflow_unit")
          .at(-1).message;
        assert.equal(result.details.code, "recovery_outstanding");
        assert.equal(state.assessment.view, "suspended");
        assert.equal(state.assessment.suspensionReason, "user-attention");
        assert.equal(state.recoveries.get(state.recoveryId).state, "reading");
        assert.deepEqual(state.selections.get(state.assignmentId), selection);
        return [{ name: "freeflow_unit", args: { operation: "cancel-recovery", reason: "No longer needed." } }];
      }
      if (n === 7) {
        const state = replay(manager.getBranch());
        const wire = JSON.stringify(body);
        assert.equal(state.recoveryId, undefined);
        assert.equal(state.assessment.view, "suspended");
        assert.match(wire, /Use freeflow_unit assess to restore the assessment/);
        assert.doesNotMatch(wire, /Finish and deliver the recovery supplement or cancel recovery/);
        return [{ name: "freeflow_unit", args: { operation: "assess" } }];
      }
      const state = replay(manager.getBranch());
      assert.equal(state.assessment.view, "active");
      assert.equal(state.recoveryId, undefined);
      return [];
    },
    true,
    async ({ session }) => {
      await session.prompt("Assess before the open recovery is settled.");
      await session.waitForIdle();
    },
  );
});

test("cancelled unit closure atomically abandons attached recovery", { timeout: 30000 }, async () => {
  let baseReportId, selectionSnapshot;
  await fixture(
    (n, _body, manager) => {
      if (n === 1) return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return once." } }];
      if (n === 2)
        return [{ name: "freeflow_return", args: { operation: "submit", report: "close-base", outcome: "completed" } }];
      if (n === 3) {
        const state = replay(manager.getBranch());
        baseReportId = state.assignments.get(state.assignmentId).returnHandoffId;
        return [{ name: "freeflow_unit", args: { operation: "recover", request: "Recover later." } }];
      }
      if (n === 4) return [];
      if (n === 5) {
        selectionSnapshot = structuredClone([...replay(manager.getBranch()).selections]);
        return [
          {
            name: "freeflow_unit",
            args: { operation: "close", outcome: "cancelled", assessment: "Stop unit and recovery." },
          },
        ];
      }
      const state = replay(manager.getBranch());
      const recovery = [...state.recoveries.values()].at(-1);
      assert.equal(state.unitId, undefined);
      assert.equal(state.assignmentId, undefined);
      assert.equal(state.pendingId, undefined);
      assert.equal(state.recoveryId, undefined);
      assert.equal(recovery.state, "cancelled");
      assert.equal(recovery.cancellationReason, "Stop unit and recovery.");
      assert.equal(state.handoffs.get(baseReportId).text, "close-base");
      assert.deepEqual([...state.selections], selectionSnapshot);
      return [];
    },
    true,
    async ({ session }) => {
      await session.prompt("Cancel the unit and its recovery.");
      await session.waitForIdle();
    },
  );
});

test("projection-off recovery can read packaged instructions and resume assessment", { timeout: 30000 }, async () => {
  const packageRoot = process.cwd();
  await fixture(
    (n, body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return a base report." } }];
      if (n === 2)
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "NO_PROJECTION_BASE_43", outcome: "completed" },
          },
        ];
      if (n === 3)
        return [
          { name: "freeflow_unit", args: { operation: "recover", request: "Read the packaged Workflow method." } },
        ];
      if (n === 4)
        return [{ name: "read", args: { path: join(packageRoot, "skills/workflow/SKILL.md"), offset: 1, limit: 8 } }];
      if (n === 5) {
        const read = manager
          .getBranch()
          .filter((e) => e.message?.toolName === "read")
          .at(-1);
        assert.equal(read.message.isError, false);
        assert.match(JSON.stringify(read.message), /name: workflow|# Workflow/);
        return [
          {
            name: "freeflow_return",
            args: { operation: "supplement", report: "PACKAGED_METHOD_READ_47", outcome: "completed" },
          },
        ];
      }
      assert.equal(body.model, "gpt-4o");
      const state = replay(manager.getBranch());
      assert.equal(state.assessment.view, "active");
      assert.equal(state.recoveryId, undefined);
      assert.match(JSON.stringify(body), /NO_PROJECTION_BASE_43/);
      assert.match(JSON.stringify(body), /PACKAGED_METHOD_READ_47/);
      return [];
    },
    false,
    undefined,
    true,
  );
});

test(
  "new input during recovery blocks further reads and a supplement preserves user attention",
  { timeout: 30000 },
  async () => {
    let active, assignmentId, baseReportId;
    await fixture(
      async (n, body, manager) => {
        if (n === 1)
          return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return a base report." } }];
        if (n === 2)
          return [
            {
              name: "freeflow_return",
              args: { operation: "submit", report: "INTERRUPTED_RECOVERY_BASE_59", outcome: "completed" },
            },
          ];
        if (n === 3) {
          const state = replay(manager.getBranch());
          assignmentId = state.assignmentId;
          baseReportId = state.assignments.get(assignmentId).returnHandoffId;
          return [
            {
              name: "freeflow_unit",
              args: { operation: "recover", request: "Read only recovery.txt.", paths: ["recovery.txt"] },
            },
          ];
        }
        if (n === 4) {
          assert.equal(body.model, "gpt-4.1-mini");
          await active.steer("NEW_RECOVERY_ATTENTION_61");
          return [{ name: "read", args: { path: "recovery.txt" } }];
        }
        if (n === 5) {
          const state = replay(manager.getBranch());
          assert.equal(state.assessment.view, "suspended");
          assert.equal(state.assessment.suspensionReason, "user-attention");
          assert.match(JSON.stringify(body), /New delivered user input requires Coordinator attention/);
          return [{ name: "read", args: { path: "recovery.txt" } }];
        }
        if (n === 6) {
          const lastRead = manager
            .getBranch()
            .filter((entry) => entry.message?.toolName === "read")
            .at(-1);
          assert.equal(lastRead.message.isError, true, "new input revokes recovery-read permission");
          return [
            {
              name: "freeflow_return",
              args: { operation: "supplement", report: "INTERRUPTED_RECOVERY_SUPPLEMENT_67", outcome: "partial" },
            },
          ];
        }
        assert.equal(body.model, "gpt-4o");
        assert.match(JSON.stringify(body), /NEW_RECOVERY_ATTENTION_61/);
        assert.match(JSON.stringify(body), /INTERRUPTED_RECOVERY_SUPPLEMENT_67/);
        const state = replay(manager.getBranch());
        assert.equal(state.assignmentId, assignmentId);
        assert.equal(state.assignments.get(assignmentId).state, "returned");
        assert.equal(state.assignments.get(assignmentId).returnHandoffId, baseReportId);
        assert.equal(state.handoffs.get(baseReportId).text, "INTERRUPTED_RECOVERY_BASE_59");
        assert.equal(state.assessment.handoffId, baseReportId);
        assert.equal(state.assessment.view, "suspended");
        assert.equal(state.assessment.suspensionReason, "user-attention");
        assert.equal(state.recoveryId, undefined);
        assert.equal([...state.recoveries.values()].at(-1).state, "completed");
        return [];
      },
      true,
      undefined,
      true,
      { onSession: (session) => (active = session) },
    );
  },
);

test("manual hold and navigation preserve an unchanged recovery for explicit resume", { timeout: 30000 }, async () => {
  let assignmentId, baseReportId, recoveryId, requestHandoffId;
  await fixture(
    (n, body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Return a base report." } }];
      if (n === 2)
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "MANUAL_RECOVERY_BASE_71", outcome: "completed" },
          },
        ];
      if (n === 3) {
        const state = replay(manager.getBranch());
        assignmentId = state.assignmentId;
        baseReportId = state.assignments.get(assignmentId).returnHandoffId;
        return [{ name: "freeflow_unit", args: { operation: "recover", request: "Resume this lookup unchanged." } }];
      }
      if (n === 4) {
        const state = replay(manager.getBranch());
        recoveryId = state.recoveryId;
        requestHandoffId = state.recoveries.get(recoveryId).requestHandoffId;
        assert.equal(state.recoveries.get(recoveryId).state, "reading");
        return [];
      }
      if (n === 5) {
        const state = replay(manager.getBranch());
        assert.equal(body.model, "gpt-4.1-mini");
        assert.equal(state.recoveryId, recoveryId);
        assert.equal(state.recoveries.get(recoveryId).state, "reading");
        assert.equal(state.assignmentId, assignmentId);
        assert.equal(state.assignments.get(assignmentId).state, "returned");
        return [
          {
            name: "freeflow_return",
            args: { operation: "supplement", report: "MANUAL_RECOVERY_SUPPLEMENT_73", outcome: "completed" },
          },
        ];
      }
      const state = replay(manager.getBranch());
      assert.equal(body.model, "gpt-4o");
      assert.equal(state.control, "automatic");
      assert.equal(state.assignmentId, assignmentId);
      assert.equal(state.assignments.get(assignmentId).returnHandoffId, baseReportId);
      assert.equal(state.handoffs.get(baseReportId).text, "MANUAL_RECOVERY_BASE_71");
      assert.equal(state.assessment.handoffId, baseReportId);
      assert.equal(state.assessment.view, "active");
      assert.equal(state.recoveries.get(recoveryId).state, "completed");
      assert.equal(state.recoveries.size, 1);
      assert.equal(state.assignments.size, 1);
      return [];
    },
    true,
    async ({ session, manager, requests }) => {
      const reads = manager.getEntries().filter((entry) => entry.message?.toolName === "read").length;
      await session.prompt("/freeflow profile executor");
      const configured = manager
        .getEntries()
        .find(
          (entry) =>
            entry.data?.data?.type === "handoff-state" &&
            entry.data.data.handoffId === requestHandoffId &&
            entry.data.data.state === "configured",
        );
      await session.navigateTree(configured.id, { summarize: false });
      const before = requests.length;
      await session.prompt("/freeflow resume");
      assert.equal(requests.length, before, "resume cannot release a manual hold");
      let state = replay(manager.getBranch());
      assert.equal(state.control, "manual");
      assert.equal(state.profile, "executor");
      assert.equal(state.recoveryId, recoveryId);
      assert.equal(state.recoveries.get(recoveryId).state, "reading");
      await session.prompt("/freeflow profile auto");
      state = replay(manager.getBranch());
      assert.equal(state.control, "automatic");
      assert.equal(state.profile, "coordinator");
      await session.prompt("/freeflow resume");
      await session.waitForIdle();
      assert.equal(requests.length, before + 2);
      assert.equal(
        manager.getEntries().filter((entry) => entry.message?.toolName === "read").length,
        reads,
        "navigation and resume do not replay task reads",
      );
    },
  );
});

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

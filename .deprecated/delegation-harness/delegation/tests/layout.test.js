import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DELEGATION_LAYOUT_INTENT_KINDS,
  DELEGATION_LAYOUT_PRESETS,
  DELEGATION_LAYOUT_SLOTS,
  createDelegationStore,
  normalizeDelegationLayoutAllocation,
  normalizeDelegationLayoutIntent,
  planDelegationLayoutAllocation,
} from "../dist/index.js";

function layoutIntent(overrides = {}) {
  return normalizeDelegationLayoutIntent({
    taskId: "TASK-LAYOUT",
    assignmentId: "planning-parent-1",
    role: "planning-parent",
    preferredGroup: "planning",
    reusePolicy: "reuse_role_pane",
    callerWorkspaceRef: "workspace:2",
    ...overrides,
  });
}

test("layout contracts default to deterministic V1 no-focus placement intent", () => {
  assert.deepEqual(DELEGATION_LAYOUT_PRESETS, ["default-v1"]);
  assert.deepEqual(DELEGATION_LAYOUT_SLOTS, ["inline", "right-top", "right-bottom", "right-surface-overflow"]);
  assert.deepEqual(DELEGATION_LAYOUT_INTENT_KINDS, ["inline", "agent"]);

  const intent = layoutIntent();

  assert.equal(intent.preset, "default-v1");
  assert.equal(intent.preserveFocus, true);
  assert.equal(intent.callerWorkspaceRef, "workspace:2");
});

test("layout allocation records refs and prompt/report paths without invoking cmux", () => {
  const allocation = normalizeDelegationLayoutAllocation({
    allocationId: "layout-planning-parent-1",
    taskId: "TASK-LAYOUT",
    assignmentId: "planning-parent-1",
    role: "planning-parent",
    preset: "default-v1",
    slot: "right-top",
    workspaceRef: "workspace:2",
    paneRef: "pane:13",
    surfaceRef: "surface:21",
    created: true,
    reused: false,
    preserveFocus: true,
    promptPath: ".freeflow/delegation/tasks/TASK-LAYOUT/agents/planning-parent-1/packet.md",
    reportPath: ".freeflow/delegation/tasks/TASK-LAYOUT/agents/planning-parent-1/result.json",
    reasonCodes: ["route_planning_parent"],
  });

  assert.equal(allocation.surfaceRef, "surface:21");
  assert.equal(allocation.preserveFocus, true);
  assert.deepEqual(allocation.reasonCodes, ["route_planning_parent"]);
  assert.throws(
    () => normalizeDelegationLayoutAllocation({ ...allocation, created: true, reused: true }),
    /cannot be both created and reused/,
  );
});

test("inline layout allocation rejects pane and surface refs", () => {
  const inlineAllocation = {
    allocationId: "layout-inline-1",
    taskId: "TASK-LAYOUT",
    assignmentId: "inline-1",
    role: "orchestrator",
    preset: "default-v1",
    slot: "inline",
    workspaceRef: "workspace:2",
    created: false,
    reused: false,
    preserveFocus: true,
    reasonCodes: ["layout_inline_no_pane"],
  };

  assert.throws(
    () => normalizeDelegationLayoutAllocation({ ...inlineAllocation, paneRef: "pane:bad" }),
    /inline layout allocation must not include paneRef or surfaceRef/,
  );
  assert.throws(
    () => normalizeDelegationLayoutAllocation({ ...inlineAllocation, surfaceRef: "surface:bad" }),
    /inline layout allocation must not include paneRef or surfaceRef/,
  );
});

test("planning and execution parent intents map to right-top and preserve focus", () => {
  for (const role of ["planning-parent", "execution-parent"]) {
    const allocation = planDelegationLayoutAllocation({
      intent: layoutIntent({
        assignmentId: `${role}-1`,
        role,
        preferredGroup: role === "planning-parent" ? "planning" : "execution",
      }),
      refs: { workspaceRef: "workspace:ignored", paneRef: `pane:${role}`, surfaceRef: `surface:${role}` },
    });

    assert.equal(allocation.slot, "right-top");
    assert.equal(allocation.workspaceRef, "workspace:2");
    assert.equal(allocation.preserveFocus, true);
    assert.equal(allocation.created, true);
    assert.equal(allocation.reused, false);
    assert.ok(allocation.reasonCodes.includes("layout_parent_right_top"));
    assert.ok(allocation.reasonCodes.includes("preserve_focus_default"));
  }
});

test("worker reviewer and verifier intents map to right-bottom by default", () => {
  for (const role of ["worker", "reviewer", "verifier"]) {
    const allocation = planDelegationLayoutAllocation({
      intent: layoutIntent({
        assignmentId: `${role}-1`,
        role,
        preferredGroup: "review",
        reusePolicy: "new_surface",
      }),
      refs: { paneRef: `pane:${role}`, surfaceRef: `surface:${role}` },
    });

    assert.equal(allocation.slot, "right-bottom");
    assert.equal(allocation.created, true);
    assert.equal(allocation.reused, false);
    assert.ok(allocation.reasonCodes.includes("layout_secondary_child_right_bottom"));
  }
});

test("more than two read-only children overflow deterministically", () => {
  const first = planDelegationLayoutAllocation({
    intent: layoutIntent({
      assignmentId: "researcher-1",
      role: "researcher",
      preferredGroup: "scratch",
      reusePolicy: "new_surface",
    }),
  });
  const second = planDelegationLayoutAllocation({
    intent: layoutIntent({
      assignmentId: "reviewer-1",
      role: "reviewer",
      preferredGroup: "review",
      reusePolicy: "new_surface",
    }),
    existingAllocations: [first],
  });
  const third = planDelegationLayoutAllocation({
    intent: layoutIntent({
      assignmentId: "verifier-1",
      role: "verifier",
      preferredGroup: "review",
      reusePolicy: "new_surface",
    }),
    existingAllocations: [first, second],
  });
  const thirdAgain = planDelegationLayoutAllocation({
    intent: layoutIntent({
      assignmentId: "verifier-1",
      role: "verifier",
      preferredGroup: "review",
      reusePolicy: "new_surface",
    }),
    existingAllocations: [first, second],
  });

  assert.equal(first.slot, "right-bottom");
  assert.equal(second.slot, "right-bottom");
  assert.equal(third.slot, "right-surface-overflow");
  assert.equal(thirdAgain.allocationId, third.allocationId);
  assert.equal(thirdAgain.slot, "right-surface-overflow");
  assert.ok(third.reasonCodes.includes("layout_read_only_child_overflow"));
});

test("same assignment and role reuses existing allocation without marking created", () => {
  const intent = layoutIntent({ assignmentId: "planning-parent-reuse", role: "planning-parent" });
  const first = planDelegationLayoutAllocation({
    intent,
    refs: { paneRef: "pane:first", surfaceRef: "surface:first" },
  });
  const reused = planDelegationLayoutAllocation({ intent, existingAllocations: [first] });

  assert.equal(reused.allocationId, first.allocationId);
  assert.equal(reused.slot, first.slot);
  assert.equal(reused.created, false);
  assert.equal(reused.reused, true);
  assert.equal(reused.paneRef, "pane:first");
  assert.ok(reused.reasonCodes.includes("layout_reused_existing_assignment"));
});

test("inline intent maps to inline slot and omits pane and surface refs", () => {
  const allocation = planDelegationLayoutAllocation({
    intent: layoutIntent({
      assignmentId: "inline-route-1",
      role: "orchestrator",
      preferredGroup: "scratch",
      reusePolicy: "none",
      intentKind: "inline",
    }),
    refs: { workspaceRef: "workspace:current", paneRef: "pane:must-not-appear", surfaceRef: "surface:must-not-appear" },
  });

  assert.equal(allocation.slot, "inline");
  assert.equal(allocation.created, false);
  assert.equal(allocation.reused, false);
  assert.equal(Object.hasOwn(allocation, "paneRef"), false);
  assert.equal(Object.hasOwn(allocation, "surfaceRef"), false);
  assert.equal(allocation.preserveFocus, true);
  assert.ok(allocation.reasonCodes.includes("layout_inline_no_pane"));
});

test("allocation preserves canonical store prompt and report paths supplied by the intent", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-layout-paths-"));
  try {
    const store = createDelegationStore({ root, now: () => "2026-07-09T00:00:00.000Z" });
    const paths = store.pathsForAgent("TASK-LAYOUT", "worker-1");

    const allocation = planDelegationLayoutAllocation({
      intent: layoutIntent({
        assignmentId: "worker-1",
        role: "worker",
        preferredGroup: "execution",
        reusePolicy: "new_surface",
        promptPath: paths.taskPacketRaw,
        reportPath: paths.resultJson,
      }),
    });

    assert.equal(allocation.promptPath, paths.taskPacketRaw);
    assert.equal(allocation.reportPath, paths.resultJson);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("layout manager does not import cmux or contain focus-changing command verbs", async () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(resolve(testDir, "../src/layout.ts"), "utf8");

  assert.doesNotMatch(source, /from ["']\.\/cmux\.js["']/);
  assert.doesNotMatch(source, /cmux\s+(send|notify|focus|select|split|open)/);
  assert.doesNotMatch(source, /--focus\s+true/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  DELEGATION_LEASE_STATES,
  activeLeasesForAgent,
  authorizeDelegationLease,
  normalizeDelegationActiveLeaseView,
  normalizeDelegationLease,
} from "../dist/index.js";

test("lease contracts expose V1 states and normalize lease scopes", () => {
  assert.deepEqual(DELEGATION_LEASE_STATES, ["issued", "active", "exhausted", "expired", "revoked"]);

  const lease = normalizeDelegationLease({
    leaseId: "lease-worker",
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    state: "active",
    actions: ["read", "edit", "read"],
    writeScopes: ["delegation/src/**", "delegation/src/**"],
    allowedCommands: ["npm run test:delegation"],
    expires: "on_assignment_terminal",
  });

  assert.deepEqual(lease.actions, ["read", "edit"]);
  assert.deepEqual(lease.writeScopes, ["delegation/src/**"]);
  assert.equal(lease.state, "active");
});

test("lease authorization requires one matching active lease for scoped edits", () => {
  const base = {
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    cwd: "/repo",
    intent: { kind: "write", path: "/repo/src/index.ts", toolName: "edit" },
  };
  const matching = normalizeDelegationLease({
    leaseId: "lease-matching",
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    state: "active",
    actions: ["edit"],
    writeScopes: ["src/**"],
    allowedCommands: [],
    expires: "on_assignment_terminal",
  });

  assert.equal(authorizeDelegationLease({ ...base, activeLeases: [] }).allowed, false);
  const allowed = authorizeDelegationLease({ ...base, activeLeases: [matching] });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.authorizingLeaseId, "lease-matching");
  assert.equal(
    authorizeDelegationLease({
      ...base,
      intent: { kind: "write", path: "/repo/docs/spec.md" },
      activeLeases: [matching],
    }).allowed,
    false,
  );

  for (const wrong of [
    { ...matching, leaseId: "lease-wrong-task", taskId: "TASK-OTHER" },
    { ...matching, leaseId: "lease-wrong-agent", agentId: "worker-2" },
    { ...matching, leaseId: "lease-wrong-role", role: "integrator" },
  ]) {
    assert.equal(authorizeDelegationLease({ ...base, activeLeases: [wrong] }).allowed, false);
  }
});

test("lease authorization binds consequential authority to one assignment attempt", () => {
  const baseLease = normalizeDelegationLease({
    leaseId: "lease-current-attempt",
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    state: "active",
    actions: ["edit"],
    writeScopes: ["src/**"],
    allowedCommands: [],
    expires: "on_assignment_terminal",
    assignmentId: "worker-1",
    attemptId: "attempt-current",
  });
  const input = {
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    assignmentId: "worker-1",
    attemptId: "attempt-current",
    role: "worker",
    cwd: "/repo",
    intent: { kind: "write", path: "/repo/src/index.ts" },
  };

  assert.equal(authorizeDelegationLease({ ...input, activeLeases: [baseLease] }).allowed, true);
  assert.equal(
    authorizeDelegationLease({
      ...input,
      activeLeases: [{ ...baseLease, leaseId: "lease-old-attempt", attemptId: "attempt-old" }],
    }).allowed,
    false,
  );
  assert.equal(
    authorizeDelegationLease({
      ...input,
      activeLeases: [{ ...baseLease, leaseId: "lease-missing-attempt", attemptId: undefined }],
    }).allowed,
    false,
  );
  assert.equal(
    authorizeDelegationLease({
      ...input,
      activeLeases: [{ ...baseLease, leaseId: "lease-wrong-assignment", assignmentId: "worker-old" }],
    }).allowed,
    false,
  );
});

test("lease authorization never unions action with scope or command across leases", () => {
  const actionOnly = normalizeDelegationLease({
    leaseId: "lease-action",
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    state: "active",
    actions: ["edit", "run_allowlisted"],
    writeScopes: ["docs/**"],
    allowedCommands: ["npm test"],
    expires: "on_assignment_terminal",
  });
  const resourceOnly = normalizeDelegationLease({
    leaseId: "lease-resource",
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    state: "active",
    actions: ["read"],
    writeScopes: ["src/**"],
    allowedCommands: ["npm run build"],
    expires: "on_assignment_terminal",
  });
  const common = {
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    cwd: "/repo",
    activeLeases: [actionOnly, resourceOnly],
  };

  assert.equal(
    authorizeDelegationLease({ ...common, intent: { kind: "write", path: "/repo/src/index.ts" } }).allowed,
    false,
  );
  assert.equal(
    authorizeDelegationLease({ ...common, intent: { kind: "command", command: "npm run build" } }).allowed,
    false,
  );

  const commandLease = normalizeDelegationLease({
    ...resourceOnly,
    leaseId: "lease-command",
    actions: ["run_allowlisted"],
    allowedCommands: ["npm   run build"],
  });
  const allowed = authorizeDelegationLease({
    ...common,
    intent: { kind: "command", command: " npm run build " },
    activeLeases: [commandLease],
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.authorizingLeaseId, "lease-command");
});

test("lease authorization preserves planning-parent and read-only edit boundaries", () => {
  const broadPlanningLease = normalizeDelegationLease({
    leaseId: "lease-planning",
    taskId: "TASK-LEASE",
    agentId: "planning-1",
    role: "planning-parent",
    state: "active",
    actions: ["edit"],
    writeScopes: ["**"],
    allowedCommands: [],
    expires: "on_assignment_terminal",
  });
  assert.equal(
    authorizeDelegationLease({
      taskId: "TASK-LEASE",
      agentId: "planning-1",
      role: "planning-parent",
      cwd: "/repo",
      intent: { kind: "write", path: "/repo/src/runtime.ts" },
      activeLeases: [broadPlanningLease],
    }).allowed,
    false,
  );

  const reviewerLease = normalizeDelegationLease({
    ...broadPlanningLease,
    leaseId: "lease-reviewer-edit",
    agentId: "reviewer-1",
    role: "reviewer",
    writeScopes: ["docs/**"],
  });
  assert.equal(
    authorizeDelegationLease({
      taskId: "TASK-LEASE",
      agentId: "reviewer-1",
      role: "reviewer",
      cwd: "/repo",
      intent: { kind: "write", path: "/repo/docs/review.md" },
      activeLeases: [reviewerLease],
    }).allowed,
    false,
  );

  const broadExecutionLease = normalizeDelegationLease({
    ...broadPlanningLease,
    leaseId: "lease-execution-broad",
    agentId: "execution-1",
    role: "execution-parent",
  });
  const narrowExecutionLease = normalizeDelegationLease({
    ...broadExecutionLease,
    leaseId: "lease-execution-narrow",
    writeScopes: ["src/integration.ts"],
  });
  const executionInput = {
    taskId: "TASK-LEASE",
    agentId: "execution-1",
    role: "execution-parent",
    cwd: "/repo",
    intent: { kind: "write", path: "/repo/src/integration.ts" },
  };
  assert.equal(authorizeDelegationLease({ ...executionInput, activeLeases: [broadExecutionLease] }).allowed, false);
  assert.equal(authorizeDelegationLease({ ...executionInput, activeLeases: [narrowExecutionLease] }).allowed, true);
});

test("active lease view matches spec shape and returns active leases only", () => {
  const active = normalizeDelegationLease({
    leaseId: "lease-active",
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    state: "active",
    actions: ["edit"],
    writeScopes: ["delegation/src/**"],
    allowedCommands: [],
    expires: "on_assignment_terminal",
  });
  const exhausted = normalizeDelegationLease({
    leaseId: "lease-exhausted",
    taskId: "TASK-LEASE",
    agentId: "worker-1",
    role: "worker",
    state: "exhausted",
    actions: ["edit"],
    writeScopes: ["delegation/src/**"],
    allowedCommands: [],
    expires: "on_assignment_terminal",
  });

  const view = normalizeDelegationActiveLeaseView({
    version: 1,
    taskId: "TASK-LEASE",
    rebuiltFrom: { path: "leases.jsonl", eventCount: 2, lastEventId: "lease_evt_002" },
    generatedAt: "2026-07-09T00:00:00.000Z",
    leasesById: {
      "lease-active": active,
      "lease-exhausted": exhausted,
    },
    activeLeaseIdsByAgent: {
      "worker-1": ["lease-active"],
    },
  });

  assert.deepEqual(
    activeLeasesForAgent(view, "worker-1").map((lease) => lease.leaseId),
    ["lease-active"],
  );
  assert.throws(
    () => normalizeDelegationActiveLeaseView({ ...view, activeLeaseIdsByAgent: { "worker-1": ["missing-lease"] } }),
    /active lease id missing/,
  );
  assert.throws(
    () => normalizeDelegationActiveLeaseView({ ...view, activeLeaseIdsByAgent: { "worker-1": ["lease-exhausted"] } }),
    /active lease id is not active/,
  );
});

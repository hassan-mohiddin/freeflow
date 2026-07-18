import assert from "node:assert/strict";
import test from "node:test";

import {
  DELEGATION_ALERT_PRIORITIES,
  DELEGATION_ALERT_STATES,
  DELEGATION_ASSIGNMENT_STATES,
  DELEGATION_EXECUTION_AUTHORIZATION_EVENT_TYPES,
  DELEGATION_PANE_STATES,
  DELEGATION_ROUTE_APPLICATION_STATES,
  DELEGATION_ROUTE_ACTION_KINDS,
  DELEGATION_ROUTE_DECISION_KINDS,
  DELEGATION_ROLE_ASSESSMENT_STATUSES,
  DELEGATION_TASK_WORKFLOW_STATES,
  hasExecutionAuthorizationEvidence,
  normalizeDelegationRouteApplication,
  normalizeDelegationRouteDecision,
  normalizeDelegationRouteRequest,
  routeDelegationRequest,
} from "../dist/index.js";

const storedExecutionAuthorization = {
  schemaVersion: 1,
  executionId: "execution_auth",
  planningReportReadyEventId: "evt.plan.ready",
  planApprovedEventId: "evt.plan.approved",
  executionAuthorizedEventId: "evt.execution.authorized",
  taskState: "ready_for_execution",
  taskId: "TASK-ROUTE",
  executionMapPath: "/repo/.freeflow/delegation/tasks/TASK-ROUTE/execution-map.json",
  planArtifactPath: "docs/plans/plan.md",
  approvedBy: "user",
};

test("route contracts expose decision kinds and keep approved-plan hint non-authoritative", () => {
  assert.deepEqual(DELEGATION_ROUTE_DECISION_KINDS, ["inline_allowed", "route_required", "ask_user", "blocked"]);
  assert.ok(DELEGATION_ROUTE_ACTION_KINDS.includes("spawn"));

  const request = normalizeDelegationRouteRequest({
    taskId: "TASK-ROUTE",
    agentId: "orchestrator-1",
    role: "orchestrator",
    action: { kind: "implement", breadth: "broad" },
    hasApprovedPlan: true,
  });

  assert.equal(request.hasApprovedPlan, true);
  assert.equal(hasExecutionAuthorizationEvidence(request.executionAuthorization), false);
});

test("route engine sends orchestrator broad implementation to planning until stored execution authorization exists", () => {
  const decision = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "orchestrator-1",
    role: "orchestrator",
    action: { kind: "implement", breadth: "broad" },
    hasApprovedPlan: true,
    routeId: "route-orchestrator-broad-no-auth",
  });

  assert.equal(decision.kind, "route_required");
  assert.equal(decision.targetRole, "planning-parent");
  assert.equal(decision.routeId, "route-orchestrator-broad-no-auth");
  assert.ok(decision.reasonCodes.includes("stored_execution_authorization_missing"));
  assert.ok(decision.reasonCodes.includes("approved_plan_hint_ignored_without_stored_evidence"));
});

test("route engine sends orchestrator broad implementation to execution-parent with stored authorization", () => {
  const decision = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "orchestrator-1",
    role: "orchestrator",
    action: { kind: "implement", breadth: "broad" },
    executionAuthorization: storedExecutionAuthorization,
    routeId: "route-orchestrator-broad-auth",
  });

  assert.equal(decision.kind, "route_required");
  assert.equal(decision.targetRole, "execution-parent");
  assert.equal(decision.routeId, "route-orchestrator-broad-auth");
  assert.ok(decision.reasonCodes.includes("stored_execution_authorization_present"));
});

test("route engine routes planning-parent implementation only when stored authorization exists", () => {
  const withoutAuthorization = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "planning-parent-1",
    role: "planning-parent",
    action: { kind: "implement", breadth: "single_file" },
  });
  const withAuthorization = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "planning-parent-1",
    role: "planning-parent",
    action: { kind: "implement", breadth: "single_file" },
    executionAuthorization: storedExecutionAuthorization,
  });

  assert.equal(withoutAuthorization.kind, "blocked");
  assert.equal(withoutAuthorization.suggestedReroute, "orchestrator");
  assert.ok(withoutAuthorization.reasonCodes.includes("planning_parent_implementation_blocked"));
  assert.ok(withoutAuthorization.reasonCodes.includes("stored_execution_authorization_missing"));

  assert.equal(withAuthorization.kind, "route_required");
  assert.equal(withAuthorization.targetRole, "execution-parent");
  assert.ok(withAuthorization.reasonCodes.includes("planning_parent_implementation_requires_execution_parent"));
});

test("route engine sends execution-parent broad implementation to worker", () => {
  const broadDecision = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "execution-parent-1",
    role: "execution-parent",
    action: { kind: "implement", breadth: "broad" },
  });
  const multiFileDecision = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "execution-parent-1",
    role: "execution-parent",
    action: { kind: "implement", breadth: "multi_file" },
    targetFiles: ["delegation/src/routing.ts", "delegation/tests/routing.test.js"],
  });

  assert.equal(broadDecision.kind, "route_required");
  assert.equal(broadDecision.targetRole, "worker");
  assert.ok(broadDecision.reasonCodes.includes("execution_parent_broad_implementation_routes_worker"));

  assert.equal(multiFileDecision.kind, "route_required");
  assert.equal(multiFileDecision.targetRole, "worker");
});

test("route engine blocks leaf spawn intent", () => {
  for (const role of ["worker", "reviewer", "verifier", "researcher", "integrator"]) {
    const decision = routeDelegationRequest({
      taskId: "TASK-ROUTE",
      agentId: `${role}-1`,
      role,
      action: { kind: "spawn", breadth: "single_file" },
    });

    assert.equal(decision.kind, "blocked");
    assert.equal(decision.suggestedReroute, "execution-parent");
    assert.ok(decision.reasonCodes.includes("leaf_spawn_blocked"));
  }
});

test("route engine asks the user before unresolved user-owned decisions", () => {
  const decision = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "orchestrator-1",
    role: "orchestrator",
    action: { kind: "implement", breadth: "broad" },
    executionAuthorization: storedExecutionAuthorization,
    riskFlags: ["user_owned_decision"],
  });

  assert.equal(decision.kind, "ask_user");
  assert.ok(decision.question.includes("user-owned decision"));
  assert.ok(decision.reasonCodes.includes("user_owned_decision_unresolved"));
});

test("route engine allows tiny single-file reversible implementation inline with stable generated route id", () => {
  const request = {
    taskId: "TASK-ROUTE",
    agentId: "orchestrator-1",
    role: "orchestrator",
    action: { kind: "implement", breadth: "tiny" },
    targetFiles: ["delegation/src/routing.ts"],
  };
  const firstDecision = routeDelegationRequest(request);
  const secondDecision = routeDelegationRequest(request);

  assert.equal(firstDecision.kind, "inline_allowed");
  assert.equal(firstDecision.routeId, secondDecision.routeId);
  assert.match(firstDecision.routeId, /^route-[a-f0-9]{16}$/);
  assert.ok(firstDecision.reasonCodes.includes("tiny_single_file_inline_allowed"));
});

test("route engine canonicalizes unordered arrays before generating route ids", () => {
  const firstDecision = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "execution-parent-1",
    role: "execution-parent",
    action: { kind: "implement", breadth: "multi_file" },
    targetFiles: ["delegation/src/routing.ts", "delegation/tests/routing.test.js"],
    writeScopes: ["delegation/src/**", "delegation/tests/**"],
    riskFlags: ["security", "unknown"],
  });
  const secondDecision = routeDelegationRequest({
    taskId: "TASK-ROUTE",
    agentId: "execution-parent-1",
    role: "execution-parent",
    action: { kind: "implement", breadth: "multi_file" },
    targetFiles: ["delegation/tests/routing.test.js", "delegation/src/routing.ts"],
    writeScopes: ["delegation/tests/**", "delegation/src/**"],
    riskFlags: ["unknown", "security"],
  });

  assert.equal(firstDecision.routeId, secondDecision.routeId);
});

test("route engine refuses tiny inline implementation when security or unknown risk is present", () => {
  for (const riskFlag of ["security", "unknown"]) {
    const decision = routeDelegationRequest({
      taskId: "TASK-ROUTE",
      agentId: "orchestrator-1",
      role: "orchestrator",
      action: { kind: "implement", breadth: "tiny" },
      targetFiles: ["delegation/src/routing.ts"],
      riskFlags: [riskFlag],
    });

    assert.notEqual(decision.kind, "inline_allowed");
  }
});

test("route decision contract normalizes all public decision shapes", () => {
  assert.equal(
    normalizeDelegationRouteDecision({ kind: "inline_allowed", routeId: "route-inline", reasonCodes: ["tiny"] }).kind,
    "inline_allowed",
  );
  assert.equal(
    normalizeDelegationRouteDecision({
      kind: "route_required",
      routeId: "route-parent",
      targetRole: "planning-parent",
      reasonCodes: ["broad"],
    }).targetRole,
    "planning-parent",
  );
  assert.equal(
    normalizeDelegationRouteDecision({
      kind: "ask_user",
      routeId: "route-user",
      question: "Approve plan?",
      reasonCodes: ["decision"],
    }).question,
    "Approve plan?",
  );
  assert.equal(
    normalizeDelegationRouteDecision({
      kind: "blocked",
      routeId: "route-block",
      reason: "leaf cannot spawn",
      suggestedReroute: "execution-parent",
      reasonCodes: ["leaf_spawn"],
    }).suggestedReroute,
    "execution-parent",
  );
});

test("state vocabulary constants expose separated V1 lifecycle states", () => {
  assert.deepEqual(DELEGATION_TASK_WORKFLOW_STATES, [
    "created",
    "routing",
    "planning",
    "awaiting_user_approval",
    "ready_for_execution",
    "executing",
    "reviewing",
    "needs_parent_adjudication",
    "blocked",
    "completed",
    "failed",
    "cancelled",
  ]);
  assert.ok(DELEGATION_ASSIGNMENT_STATES.includes("result_malformed"));
  assert.ok(DELEGATION_PANE_STATES.includes("open_failed"));
  assert.deepEqual(DELEGATION_ROUTE_APPLICATION_STATES, [
    "pending",
    "applied",
    "already_applied",
    "failed",
    "cancelled",
  ]);
  assert.deepEqual(DELEGATION_ALERT_STATES, ["queued", "delivered", "seen", "acked", "resolved", "escalated"]);
  assert.deepEqual(DELEGATION_ALERT_PRIORITIES, ["P0", "P1", "P2", "P3"]);
});

test("route application contract normalizes idempotent application state", () => {
  const application = normalizeDelegationRouteApplication({
    applicationId: "apply-route-1",
    routeId: "route-1",
    taskId: "TASK-ROUTE",
    state: "already_applied",
    decisionKind: "route_required",
    layoutAllocationId: "layout-route-1",
    leaseIds: ["lease-1", "lease-1"],
    spawned: [],
    reused: ["planning-parent-1"],
    waitingFor: "PLANNING_REPORT",
  });

  assert.equal(application.state, "already_applied");
  assert.deepEqual(application.leaseIds, ["lease-1"]);
  assert.deepEqual(application.reused, ["planning-parent-1"]);
});

test("approval event constants preserve stored authorization chain and role assessments stay separate", () => {
  assert.deepEqual(DELEGATION_EXECUTION_AUTHORIZATION_EVENT_TYPES, [
    "planning_report.ready",
    "plan.approved",
    "execution.authorized",
  ]);
  assert.deepEqual(DELEGATION_ROLE_ASSESSMENT_STATUSES, [
    "pass",
    "pass_with_non_blocking",
    "fail",
    "blocked",
    "not_run",
    "accepted_not_run",
  ]);

  assert.equal(hasExecutionAuthorizationEvidence(storedExecutionAuthorization), true);
});

import {
  type DelegationExecutionAuthorizationEvidence,
  type DelegationRouteApplication,
  type DelegationRouteDecision,
  type DelegationRouteRequest,
} from "./types.js";
export declare const DELEGATION_TASK_WORKFLOW_STATES: readonly [
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
];
export declare const DELEGATION_ASSIGNMENT_STATES: readonly [
  "created",
  "assigned",
  "running",
  "waiting_for_parent",
  "attention_required",
  "result_malformed",
  "completed",
  "completed_with_risks",
  "blocked",
  "failed",
  "cancelled",
];
export declare const DELEGATION_PANE_STATES: readonly [
  "not_started",
  "opening",
  "active",
  "idle",
  "retained",
  "stale",
  "closing",
  "closed",
  "open_failed",
  "lost",
];
export declare const DELEGATION_ROUTE_APPLICATION_STATES: readonly [
  "pending",
  "applied",
  "already_applied",
  "failed",
  "cancelled",
];
export declare const DELEGATION_ALERT_STATES: readonly [
  "queued",
  "delivered",
  "seen",
  "acked",
  "resolved",
  "escalated",
];
export declare const DELEGATION_ALERT_PRIORITIES: readonly ["P0", "P1", "P2", "P3"];
export declare const DELEGATION_ROUTE_DECISION_KINDS: readonly [
  "inline_allowed",
  "route_required",
  "ask_user",
  "blocked",
];
export declare const DELEGATION_ROUTE_ACTION_KINDS: readonly [
  "plan",
  "implement",
  "research",
  "review",
  "verify",
  "fix",
  "spawn",
  "ask_user",
  "close",
];
export declare const DELEGATION_ROUTE_BREADTHS: readonly ["tiny", "single_file", "multi_file", "broad"];
export declare const DELEGATION_ROUTE_RISK_FLAGS: readonly [
  "user_owned_decision",
  "public_api",
  "security",
  "privacy",
  "data_loss",
  "irreversible",
  "unknown",
];
export declare const DELEGATION_EXECUTION_AUTHORIZATION_EVENT_TYPES: readonly [
  "planning_report.ready",
  "plan.approved",
  "execution.authorized",
];
export declare const DELEGATION_ROLE_ASSESSMENT_STATUSES: readonly [
  "pass",
  "pass_with_non_blocking",
  "fail",
  "blocked",
  "not_run",
  "accepted_not_run",
];
export declare function routeDelegationRequest(input: DelegationRouteRequest): DelegationRouteDecision;
export declare function normalizeDelegationRouteRequest(input: DelegationRouteRequest): DelegationRouteRequest;
export declare function normalizeDelegationRouteDecision(input: DelegationRouteDecision): DelegationRouteDecision;
export declare function normalizeDelegationRouteApplication(
  input: DelegationRouteApplication,
): DelegationRouteApplication;
export declare function hasExecutionAuthorizationEvidence(
  evidence: DelegationExecutionAuthorizationEvidence | undefined,
): boolean;
export declare function normalizeExecutionAuthorizationEvidence(
  input: DelegationExecutionAuthorizationEvidence,
): DelegationExecutionAuthorizationEvidence;
export declare function deriveDelegationInlineLease(
  input: DelegationRouteRequest,
  routeId?: string,
): import("./types.js").DelegationLease | undefined;

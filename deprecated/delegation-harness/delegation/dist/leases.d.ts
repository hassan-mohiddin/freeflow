import {
  type DelegationActiveLeaseView,
  type DelegationLease,
  type DelegationRole,
  type PolicyBlockCode,
  type PolicyIntent,
} from "./types.js";
export declare const DELEGATION_LEASE_STATES: readonly ["issued", "active", "exhausted", "expired", "revoked"];
export declare const DELEGATION_LEASE_ACTIONS: readonly [
  "read",
  "edit",
  "run_allowlisted",
  "route",
  "spawn",
  "review",
  "verify",
];
export declare const DELEGATION_LEASE_EXPIRIES: readonly ["on_assignment_terminal", "on_task_terminal"];
export declare function normalizeDelegationLease(input: DelegationLease): DelegationLease;
export declare function normalizeDelegationActiveLeaseView(input: DelegationActiveLeaseView): DelegationActiveLeaseView;
export declare function activeLeasesForAgent(view: DelegationActiveLeaseView, agentId: string): DelegationLease[];
export declare function findActiveLegacyAssignmentLease(input: {
  taskId: string;
  agentId: string;
  assignmentId: string;
  syntheticAttemptId: string;
  role: DelegationRole;
  activeLeases: readonly DelegationLease[];
}): DelegationLease | undefined;
export interface AuthorizeDelegationLeaseInput {
  taskId: string;
  agentId: string;
  assignmentId?: string;
  attemptId?: string;
  role: DelegationRole;
  intent: PolicyIntent;
  cwd?: string;
  activeLeases: readonly DelegationLease[];
}
export type DelegationLeaseAuthorization =
  | {
      allowed: true;
      status: "allowed";
      reason: string;
      authorizingLeaseId?: string;
    }
  | {
      allowed: false;
      status: "blocked";
      code: PolicyBlockCode;
      reason: string;
      suggestedReroute: "parent" | "orchestrator" | "execution-parent";
      request: {
        kind: "policy_block" | "capability_gap";
        detail: string;
      };
    };
/**
 * Dynamic policy layer for one already-statically-allowed intent.
 * Authority is intentionally atomic: one active lease must contain the action
 * and the matching scope or normalized command.
 */
export declare function authorizeDelegationLease(input: AuthorizeDelegationLeaseInput): DelegationLeaseAuthorization;
export declare function isBroadWriteScope(scope: string, cwd: string | undefined): boolean;

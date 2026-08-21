import {
  type DelegationActiveLeaseView,
  type DelegationLease,
  type DelegationLeaseAction,
  type DelegationLeaseExpiry,
  type DelegationLeaseState,
  type DelegationRole,
  type PolicyBlockCode,
  type PolicyIntent,
} from "./types.js";
import { validateSafeId } from "./paths.js";
import { isLikelyProductCodePath, isPathInsideScope, normalizeCommand } from "./policy.js";

export const DELEGATION_LEASE_STATES = [
  "issued",
  "active",
  "exhausted",
  "expired",
  "revoked",
] as const satisfies readonly DelegationLeaseState[];

export const DELEGATION_LEASE_ACTIONS = [
  "read",
  "edit",
  "run_allowlisted",
  "route",
  "spawn",
  "review",
  "verify",
] as const satisfies readonly DelegationLeaseAction[];

export const DELEGATION_LEASE_EXPIRIES = [
  "on_assignment_terminal",
  "on_task_terminal",
] as const satisfies readonly DelegationLeaseExpiry[];

const DELEGATION_ROLES = [
  "orchestrator",
  "planning-parent",
  "execution-parent",
  "researcher",
  "worker",
  "reviewer",
  "verifier",
  "integrator",
] as const satisfies readonly DelegationRole[];

export function normalizeDelegationLease(input: DelegationLease): DelegationLease {
  const normalized: DelegationLease = {
    leaseId: validateSafeId(input.leaseId, "lease id"),
    taskId: validateSafeId(input.taskId, "task id"),
    agentId: validateSafeId(input.agentId, "agent id"),
    role: oneOf(input.role, DELEGATION_ROLES, "delegation role"),
    state: oneOf(input.state, DELEGATION_LEASE_STATES, "lease state"),
    actions: uniqueOneOf(input.actions, DELEGATION_LEASE_ACTIONS, "lease action"),
    writeScopes: uniqueNonEmptyStrings(input.writeScopes, "write scope"),
    allowedCommands: uniqueNonEmptyStrings(input.allowedCommands, "allowed command"),
    expires: oneOf(input.expires, DELEGATION_LEASE_EXPIRIES, "lease expiry"),
  };

  if (input.maxFilesChanged !== undefined) {
    if (!Number.isInteger(input.maxFilesChanged) || input.maxFilesChanged < 1) {
      throw new Error("maxFilesChanged must be a positive integer");
    }
    normalized.maxFilesChanged = input.maxFilesChanged;
  }
  if (input.issuedAt !== undefined) {
    normalized.issuedAt = nonEmptyString(input.issuedAt, "issuedAt");
  }
  if (input.updatedAt !== undefined) {
    normalized.updatedAt = nonEmptyString(input.updatedAt, "updatedAt");
  }
  if (input.routeId !== undefined) {
    normalized.routeId = validateSafeId(input.routeId, "route id");
  }
  if (input.assignmentId !== undefined) {
    normalized.assignmentId = validateSafeId(input.assignmentId, "assignment id");
  }
  if (input.attemptId !== undefined) {
    normalized.attemptId = validateSafeId(input.attemptId, "attempt id");
  }

  return normalized;
}

export function normalizeDelegationActiveLeaseView(input: DelegationActiveLeaseView): DelegationActiveLeaseView {
  if (input.version !== 1) {
    throw new Error("active lease view version must be 1");
  }
  const taskId = validateSafeId(input.taskId, "task id");
  if (input.rebuiltFrom.path !== "leases.jsonl") {
    throw new Error("active lease view must rebuild from leases.jsonl");
  }
  if (!Number.isInteger(input.rebuiltFrom.eventCount) || input.rebuiltFrom.eventCount < 0) {
    throw new Error("active lease view eventCount must be a non-negative integer");
  }

  const leasesById: Record<string, DelegationLease> = {};
  for (const [leaseId, lease] of Object.entries(input.leasesById)) {
    const normalizedLeaseId = validateSafeId(leaseId, "lease id");
    const normalizedLease = normalizeDelegationLease(lease);
    if (normalizedLease.leaseId !== normalizedLeaseId) {
      throw new Error(`lease id mismatch for ${normalizedLeaseId}`);
    }
    if (normalizedLease.taskId !== taskId) {
      throw new Error(`lease task id mismatch for ${normalizedLeaseId}`);
    }
    leasesById[normalizedLeaseId] = normalizedLease;
  }

  const activeLeaseIdsByAgent: Record<string, string[]> = {};
  for (const [agentId, leaseIds] of Object.entries(input.activeLeaseIdsByAgent)) {
    const normalizedAgentId = validateSafeId(agentId, "agent id");
    const normalizedLeaseIds = leaseIds.map((leaseId, index) =>
      validateSafeId(leaseId, `active lease id ${index + 1}`),
    );
    for (const leaseId of normalizedLeaseIds) {
      const lease = leasesById[leaseId];
      if (lease === undefined) {
        throw new Error(`active lease id missing: ${leaseId}`);
      }
      if (lease.state !== "active") {
        throw new Error(`active lease id is not active: ${leaseId}`);
      }
      if (lease.agentId !== normalizedAgentId) {
        throw new Error(`active lease agent mismatch: ${leaseId}`);
      }
    }
    activeLeaseIdsByAgent[normalizedAgentId] = [...new Set(normalizedLeaseIds)];
  }

  return {
    version: 1,
    taskId,
    rebuiltFrom: {
      path: "leases.jsonl",
      eventCount: input.rebuiltFrom.eventCount,
      lastEventId: validateSafeId(input.rebuiltFrom.lastEventId, "last lease event id"),
    },
    generatedAt: nonEmptyString(input.generatedAt, "generatedAt"),
    leasesById,
    activeLeaseIdsByAgent,
  };
}

export function activeLeasesForAgent(view: DelegationActiveLeaseView, agentId: string): DelegationLease[] {
  const normalized = normalizeDelegationActiveLeaseView(view);
  const normalizedAgentId = validateSafeId(agentId, "agent id");
  const leaseIds = normalized.activeLeaseIdsByAgent[normalizedAgentId] ?? [];
  return leaseIds
    .map((leaseId) => normalized.leasesById[leaseId])
    .filter((lease): lease is DelegationLease => lease !== undefined && lease.state === "active");
}

export function findActiveLegacyAssignmentLease(input: {
  taskId: string;
  agentId: string;
  assignmentId: string;
  syntheticAttemptId: string;
  role: DelegationRole;
  activeLeases: readonly DelegationLease[];
}): DelegationLease | undefined {
  const taskId = validateSafeId(input.taskId, "task id");
  const agentId = validateSafeId(input.agentId, "agent id");
  const assignmentId = validateSafeId(input.assignmentId, "assignment id");
  const syntheticAttemptId = validateSafeId(input.syntheticAttemptId, "synthetic attempt id");
  return input.activeLeases
    .map((lease) => normalizeDelegationLease(lease))
    .filter(
      (lease) =>
        lease.state === "active" &&
        lease.taskId === taskId &&
        lease.agentId === agentId &&
        lease.role === input.role &&
        (lease.assignmentId === undefined || lease.assignmentId === assignmentId) &&
        (lease.attemptId === undefined || lease.attemptId === syntheticAttemptId),
    )
    .sort((left, right) => left.leaseId.localeCompare(right.leaseId))[0];
}

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
      request: { kind: "policy_block" | "capability_gap"; detail: string };
    };

/**
 * Dynamic policy layer for one already-statically-allowed intent.
 * Authority is intentionally atomic: one active lease must contain the action
 * and the matching scope or normalized command.
 */
export function authorizeDelegationLease(input: AuthorizeDelegationLeaseInput): DelegationLeaseAuthorization {
  const taskId = validateSafeId(input.taskId, "task id");
  const agentId = validateSafeId(input.agentId, "agent id");
  if ((input.assignmentId === undefined) !== (input.attemptId === undefined)) {
    return leaseBlock("malformed_intent", "lease authorization requires assignmentId and attemptId together", "parent");
  }
  const assignmentId =
    input.assignmentId === undefined ? undefined : validateSafeId(input.assignmentId, "assignment id");
  const attemptId = input.attemptId === undefined ? undefined : validateSafeId(input.attemptId, "attempt id");

  if (input.intent.kind !== "write" && input.intent.kind !== "command") {
    return {
      allowed: true,
      status: "allowed",
      reason: `${input.intent.kind} intent does not require a lease in Phase 5`,
    };
  }

  if (input.intent.kind === "write") {
    if (input.role === "researcher" || input.role === "reviewer" || input.role === "verifier") {
      return leaseBlock(
        "capability_gap",
        `${input.role} is read-only and cannot receive edit lease authority`,
        "parent",
      );
    }
    if (input.role === "planning-parent" && isLikelyProductCodePath(input.intent.path, input.cwd)) {
      return leaseBlock(
        "product_code_write_requires_scope",
        `planning-parent cannot edit product/runtime implementation: ${input.intent.path}`,
        "execution-parent",
      );
    }
  }

  const matchingIdentity = input.activeLeases
    .map((lease) => normalizeDelegationLease(lease))
    .filter(
      (lease) =>
        lease.state === "active" &&
        lease.taskId === taskId &&
        lease.agentId === agentId &&
        lease.role === input.role &&
        (assignmentId === undefined || (lease.assignmentId === assignmentId && lease.attemptId === attemptId)),
    )
    .sort((left, right) => left.leaseId.localeCompare(right.leaseId));

  if (input.intent.kind === "write") {
    for (const lease of matchingIdentity) {
      if (!lease.actions.includes("edit")) continue;
      for (const scope of lease.writeScopes) {
        if (requiresNarrowParentScope(input.role) && isBroadWriteScope(scope, input.cwd)) continue;
        if (isPathInsideScope(input.intent.path, scope, input.cwd)) {
          return {
            allowed: true,
            status: "allowed",
            authorizingLeaseId: lease.leaseId,
            reason: `write authorized by active lease ${lease.leaseId}`,
          };
        }
      }
    }
    return leaseBlock(
      "write_scope_violation",
      `no single active lease authorizes edit of ${input.intent.path} for ${taskId}/${agentId}/${input.role}`,
      input.role === "orchestrator" ? "orchestrator" : "parent",
    );
  }

  if (input.intent.kind !== "command") {
    return leaseBlock("malformed_intent", "lease authorization received an unsupported consequential intent", "parent");
  }
  const command = normalizeCommand(input.intent.command);
  for (const lease of matchingIdentity) {
    if (!lease.actions.includes("run_allowlisted")) continue;
    if (lease.allowedCommands.some((allowed) => normalizeCommand(allowed) === command)) {
      return {
        allowed: true,
        status: "allowed",
        authorizingLeaseId: lease.leaseId,
        reason: `command authorized by active lease ${lease.leaseId}`,
      };
    }
  }
  return leaseBlock(
    "command_not_allowed",
    `no single active lease authorizes exact command for ${taskId}/${agentId}/${input.role}: ${input.intent.command}`,
    input.role === "orchestrator" ? "orchestrator" : "parent",
  );
}

export function isBroadWriteScope(scope: string, cwd: string | undefined): boolean {
  const normalized = scope.replace(/\\/g, "/").replace(/\/+/g, "/").trim().replace(/\/$/, "");
  if (normalized === "" || normalized === "." || normalized === "./**" || normalized === "**" || normalized === "/") {
    return true;
  }
  if (cwd !== undefined) {
    const cwdNormalized = cwd.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
    const withoutGlob = normalized.endsWith("/**") ? normalized.slice(0, -3).replace(/\/$/, "") : normalized;
    return withoutGlob === cwdNormalized;
  }
  return false;
}

function requiresNarrowParentScope(role: DelegationRole): boolean {
  return role === "orchestrator" || role === "execution-parent" || role === "planning-parent";
}

function leaseBlock(
  code: PolicyBlockCode,
  reason: string,
  suggestedReroute: "parent" | "orchestrator" | "execution-parent",
): DelegationLeaseAuthorization {
  return {
    allowed: false,
    status: "blocked",
    code,
    reason,
    suggestedReroute,
    request: { kind: "policy_block", detail: "request a new narrow route/application lease from the parent" },
  };
}

function oneOf<const T extends string>(value: string, allowed: readonly T[], label: string): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`invalid ${label}: ${value}`);
}

function uniqueOneOf<const T extends string>(values: readonly string[], allowed: readonly T[], label: string): T[] {
  return [...new Set(values.map((value) => oneOf(value, allowed, label)))];
}

function nonEmptyString(value: string, label: string): string {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a non-empty string without surrounding whitespace`);
  }
  return value;
}

function uniqueNonEmptyStrings(values: readonly string[], label: string): string[] {
  return [...new Set(values.map((value, index) => nonEmptyString(value, `${label} ${index + 1}`)))];
}

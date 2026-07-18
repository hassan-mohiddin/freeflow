import { createHash } from "node:crypto";

import { validateSafeId } from "./paths.js";
import type {
  AgentManifest,
  AgentStatus,
  DelegationAttemptSource,
  DelegationAssignmentAttemptIdentity,
  ResolvedDelegationAssignmentAttemptIdentity,
} from "./types.js";

export const CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION = 1 as const;
export const CURRENT_DELEGATION_MANIFEST_SCHEMA_VERSION = 1 as const;
export const CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION = 1 as const;
export const CURRENT_DELEGATION_PROTOCOL_VERSION = 1 as const;

const ATTEMPT_SOURCES = [
  "routed",
  "routed_recovery",
  "direct_compat_adapter",
  "legacy_synthetic",
] as const satisfies readonly DelegationAttemptSource[];
const LEGACY_ACTIVE_STATES = new Set(["running", "waiting_for_parent", "attention", "attention_required"]);
const IDENTITY_FIELDS = [
  "schemaVersion",
  "identitySchemaVersion",
  "profileSchemaVersion",
  "protocolVersion",
  "assignmentId",
  "attemptId",
  "attemptSource",
] as const;

export interface ResolveAssignmentAttemptIdentityInput {
  manifest: Partial<AgentManifest> &
    Pick<
      AgentManifest,
      | "taskId"
      | "agentId"
      | "role"
      | "profile"
      | "createdAt"
      | "modelTaskPacketPath"
      | "resultRawPath"
      | "resultJsonPath"
    >;
  status: Pick<AgentStatus, "taskId" | "agentId" | "state">;
  environmentAttemptId?: string;
}

export function deriveRoutedAttemptId(routeId: string): string {
  return validateSafeId(`attempt-${validateSafeId(routeId, "route id")}`, "attempt id");
}

export function deriveRoutedRecoveryAttemptId(routeId: string): string {
  return validateSafeId(`attempt-recovery-${validateSafeId(routeId, "route id")}`, "recovery attempt id");
}

export function currentAssignmentAttemptIdentity(input: {
  taskId: string;
  agentId: string;
  attemptId: string;
  attemptSource: Exclude<DelegationAttemptSource, "legacy_synthetic">;
}): DelegationAssignmentAttemptIdentity {
  const agentId = validateSafeId(input.agentId, "agent id");
  validateSafeId(input.taskId, "task id");
  return {
    schemaVersion: CURRENT_DELEGATION_MANIFEST_SCHEMA_VERSION,
    identitySchemaVersion: CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
    profileSchemaVersion: CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
    protocolVersion: CURRENT_DELEGATION_PROTOCOL_VERSION,
    assignmentId: agentId,
    attemptId: validateSafeId(input.attemptId, "attempt id"),
    attemptSource: oneOf(
      input.attemptSource,
      ATTEMPT_SOURCES.filter((source) => source !== "legacy_synthetic"),
      "attempt source",
    ),
  };
}

export function resolveAssignmentAttemptIdentity(
  input: ResolveAssignmentAttemptIdentityInput,
): ResolvedDelegationAssignmentAttemptIdentity {
  validateManifestStatusIdentity(input.manifest, input.status);
  const presentIdentityFields = IDENTITY_FIELDS.filter((field) => input.manifest[field] !== undefined);
  if (presentIdentityFields.length === 0) {
    return resolveLegacySyntheticIdentity(input);
  }
  if (presentIdentityFields.length !== IDENTITY_FIELDS.length) {
    throw new Error(
      `partial assignment attempt identity: found ${presentIdentityFields.join(", ")}; expected ${IDENTITY_FIELDS.join(", ")}`,
    );
  }

  requireCurrentVersion(input.manifest.schemaVersion, CURRENT_DELEGATION_MANIFEST_SCHEMA_VERSION, "manifest schema");
  requireCurrentVersion(
    input.manifest.identitySchemaVersion,
    CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
    "identity schema",
  );
  requireCurrentVersion(
    input.manifest.profileSchemaVersion,
    CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
    "profile schema",
  );
  requireCurrentVersion(input.manifest.protocolVersion, CURRENT_DELEGATION_PROTOCOL_VERSION, "protocol");

  const assignmentId = validateSafeId(String(input.manifest.assignmentId), "assignment id");
  if (assignmentId !== input.manifest.agentId) {
    throw new Error(`assignment id ${assignmentId} does not match manifest agent id ${input.manifest.agentId}`);
  }
  const attemptId = validateSafeId(String(input.manifest.attemptId), "attempt id");
  const attemptSource = oneOf(input.manifest.attemptSource, ATTEMPT_SOURCES, "attempt source");
  if (attemptSource === "legacy_synthetic") {
    throw new Error("versioned manifests cannot claim legacy_synthetic attempt source");
  }
  validateEnvironmentAttempt(input.environmentAttemptId, attemptId);

  return {
    assignmentId,
    attemptId,
    kind: "versioned",
    finishOnly: false,
    schemaVersion: CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
    protocolVersion: CURRENT_DELEGATION_PROTOCOL_VERSION,
    profileSchemaVersion: CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
  };
}

function resolveLegacySyntheticIdentity(
  input: ResolveAssignmentAttemptIdentityInput,
): ResolvedDelegationAssignmentAttemptIdentity {
  const manifest = input.manifest;
  if (!LEGACY_ACTIVE_STATES.has(input.status.state)) {
    throw new Error(`synthetic legacy attempt requires an active legacy assignment; got ${input.status.state}`);
  }
  if (!nonEmptyOptional(manifest.surfaceRef) || !nonEmptyOptional(manifest.launchCommand)) {
    throw new Error("synthetic legacy attempt requires visible running evidence: surfaceRef and launchCommand");
  }
  const seed = JSON.stringify({
    taskId: validateSafeId(manifest.taskId, "task id"),
    agentId: validateSafeId(manifest.agentId, "agent id"),
    createdAt: nonEmptyString(manifest.createdAt, "createdAt"),
  });
  const attemptId = `legacy-attempt-${createHash("sha256").update(seed).digest("hex").slice(0, 20)}`;
  validateEnvironmentAttempt(input.environmentAttemptId, attemptId);
  return {
    assignmentId: manifest.agentId,
    attemptId,
    kind: "legacy_synthetic",
    finishOnly: true,
    schemaVersion: CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION,
    protocolVersion: CURRENT_DELEGATION_PROTOCOL_VERSION,
    profileSchemaVersion: CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION,
  };
}

function validateManifestStatusIdentity(
  manifest: ResolveAssignmentAttemptIdentityInput["manifest"],
  status: ResolveAssignmentAttemptIdentityInput["status"],
): void {
  const taskId = validateSafeId(manifest.taskId, "manifest task id");
  const agentId = validateSafeId(manifest.agentId, "manifest agent id");
  if (
    validateSafeId(status.taskId, "status task id") !== taskId ||
    validateSafeId(status.agentId, "status agent id") !== agentId
  ) {
    throw new Error("manifest/status assignment identity mismatch");
  }
}

function validateEnvironmentAttempt(environmentAttemptId: string | undefined, attemptId: string): void {
  if (environmentAttemptId === undefined) return;
  const normalized = validateSafeId(environmentAttemptId, "environment attempt id");
  if (normalized !== attemptId) {
    throw new Error(`environment attempt ${normalized} does not match manifest attempt ${attemptId}`);
  }
}

function requireCurrentVersion(actual: unknown, expected: number, label: string): void {
  if (!Number.isInteger(actual)) {
    throw new Error(`${label} version must be an integer`);
  }
  if (actual !== expected) {
    throw new Error(`${label} version ${String(actual)} is not supported; expected ${expected}`);
  }
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value === "string" && choices.includes(value as T)) return value as T;
  throw new Error(`${label} must be one of ${choices.join(", ")}`);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function nonEmptyOptional(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

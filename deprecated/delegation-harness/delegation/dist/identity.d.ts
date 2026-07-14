import type { AgentManifest, AgentStatus, DelegationAttemptSource, DelegationAssignmentAttemptIdentity, ResolvedDelegationAssignmentAttemptIdentity } from "./types.js";
export declare const CURRENT_DELEGATION_IDENTITY_SCHEMA_VERSION: 1;
export declare const CURRENT_DELEGATION_MANIFEST_SCHEMA_VERSION: 1;
export declare const CURRENT_DELEGATION_PROFILE_SCHEMA_VERSION: 1;
export declare const CURRENT_DELEGATION_PROTOCOL_VERSION: 1;
export interface ResolveAssignmentAttemptIdentityInput {
    manifest: Partial<AgentManifest> & Pick<AgentManifest, "taskId" | "agentId" | "role" | "profile" | "createdAt" | "modelTaskPacketPath" | "resultRawPath" | "resultJsonPath">;
    status: Pick<AgentStatus, "taskId" | "agentId" | "state">;
    environmentAttemptId?: string;
}
export declare function deriveRoutedAttemptId(routeId: string): string;
export declare function deriveRoutedRecoveryAttemptId(routeId: string): string;
export declare function currentAssignmentAttemptIdentity(input: {
    taskId: string;
    agentId: string;
    attemptId: string;
    attemptSource: Exclude<DelegationAttemptSource, "legacy_synthetic">;
}): DelegationAssignmentAttemptIdentity;
export declare function resolveAssignmentAttemptIdentity(input: ResolveAssignmentAttemptIdentityInput): ResolvedDelegationAssignmentAttemptIdentity;

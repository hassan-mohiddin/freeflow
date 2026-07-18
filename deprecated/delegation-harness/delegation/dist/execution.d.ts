import type { CommitCheckpointPolicyApproval, CommitCheckpointValidationInput, ExecutionDecision, ExecutionMapMetadata, WorkPackageMetadata, WorktreeMetadata } from "./types.js";
export declare function emptyExecutionMap(taskId: string, updatedAt: string): ExecutionMapMetadata;
export declare function normalizeWorkPackageMetadata(input: WorkPackageMetadata): WorkPackageMetadata;
export declare function normalizeExecutionMap(input: ExecutionMapMetadata, updatedAt?: string): ExecutionMapMetadata;
export declare function validateExecutionMap(input: ExecutionMapMetadata): ExecutionDecision;
export declare function validateOneWriterPerCheckout(packages: readonly WorkPackageMetadata[]): ExecutionDecision;
export declare function validateWorkPackageReady(input: {
    executionMap: ExecutionMapMetadata;
    packageId: string;
}): ExecutionDecision;
export declare function validateIntegrationOrder(input: {
    executionMap: ExecutionMapMetadata;
    packageId: string;
}): ExecutionDecision;
export declare function buildWorktreeBranchName(input: {
    taskId: string;
    packageId: string;
    prefix?: string;
}): string;
export declare function createWorktreeMetadata(input: {
    taskId: string;
    packageId: string;
    path: string;
    branchName?: string;
    baseBranch?: string;
    baseCommit?: string;
    cleanup?: "preserve" | "remove_after_integration";
}): WorktreeMetadata;
export declare function validateCommitCheckpoint(input: CommitCheckpointValidationInput): ExecutionDecision;
export declare function commitCheckpointApprovalFromDecision(decision: ExecutionDecision): CommitCheckpointPolicyApproval;
export declare function isPackageComplete(pkg: WorkPackageMetadata): boolean;
export declare function isWriterRole(role: string): boolean;

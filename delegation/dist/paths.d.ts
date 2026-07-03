export declare const DELEGATION_STORE_RELATIVE_PATH: string;
export interface DelegationTaskPaths {
    taskDir: string;
    taskJson: string;
    registryJson: string;
    eventsJsonl: string;
    parentAlertsJson: string;
    waitStateJson: string;
    decisionsMd: string;
    modelDir: string;
    agentsDir: string;
    planningReportRaw: string;
    planningReportJson: string;
    executionKickoffRaw: string;
    executionKickoffJson: string;
    executionReportRaw: string;
    executionReportJson: string;
}
export interface DelegationAgentPaths {
    agentDir: string;
    manifestJson: string;
    statusJson: string;
    eventsJsonl: string;
    modelDir: string;
    taskPacketRaw: string;
    resultRaw: string;
    resultJson: string;
    transcriptLog: string;
    screenLog: string;
    notesMd: string;
}
export declare function delegationRootForRepo(repoRoot: string): string;
export declare function validateSafeName(value: string, label?: string): string;
export declare function validateSafeId(value: string, label?: string): string;
/**
 * Low-level containment helper. It rejects absolute/traversal/separator escapes,
 * but it is not a safe-id validator; use validateSafeId/safeJoin for ids/names.
 */
export declare function resolveUnderRoot(root: string, ...segments: string[]): string;
export declare function safeJoin(root: string, ...segments: string[]): string;
export declare function taskPaths(root: string, taskId: string): DelegationTaskPaths;
export declare function agentPaths(root: string, taskId: string, agentId: string): DelegationAgentPaths;
export declare function safeModelFilePath(modelDir: string, fileName: string): string;
export declare function parentDirectory(path: string): string;

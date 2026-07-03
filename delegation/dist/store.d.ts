import type { AgentManifest, AgentStatus, DelegationEvent, DelegationIndex, DelegationProfile, DelegationRegistry, DelegationRole, DelegationState, DelegationTaskMetadata, DelegationWaitState, JsonValue, ParentAlert, ParentAlertEvidence, ParentAlertOutcome, ParentReportName, WaitScopeEntry } from "./types.js";
export interface DelegationStoreOptions {
    root?: string;
    repoRoot?: string;
    now?: () => string;
}
export interface InitTaskInput {
    taskId: string;
    goal?: string;
    parentTaskId?: string;
    state?: DelegationState;
    createdAt?: string;
}
export interface RegisterAgentInput {
    taskId: string;
    agentId: string;
    role: DelegationRole;
    profile?: DelegationProfile;
    parentAgentId?: string;
    cwd?: string;
    writeScope?: string;
    allowedCommands?: string[];
    state?: DelegationState;
    createdAt?: string;
    paneRef?: string;
    surfaceRef?: string;
    workspaceRef?: string;
    windowRef?: string;
    launchCommand?: string;
}
export interface AppendEventInput {
    type: string;
    state?: DelegationState;
    message?: string;
    data?: JsonValue;
    timestamp?: string;
    eventId?: string;
}
export interface QueueParentAlertInput {
    outcome: ParentAlertOutcome;
    state?: DelegationState;
    agentId?: string;
    parentAgentId?: string;
    status?: string;
    eventType?: string;
    sourceEventId?: string;
    message?: string;
    evidence?: ParentAlertEvidence;
    data?: JsonValue;
    dedupeKey?: string;
}
export interface ReadParentAlertsOptions {
    unreadOnly?: boolean;
    agentId?: string;
    parentAgentId?: string;
}
export interface AgentResultRecord {
    exists: boolean;
    rawPath: string;
    jsonPath: string;
    parsed?: unknown;
}
export interface TaskReportRecord {
    exists: boolean;
    rawPath: string;
    jsonPath: string;
    parsed?: unknown;
}
export declare class DelegationStore {
    readonly root: string;
    private readonly now;
    constructor(options?: DelegationStoreOptions);
    ensureStore(): Promise<DelegationIndex>;
    initTask(input: InitTaskInput): Promise<DelegationTaskMetadata>;
    readTask(taskId: string): Promise<DelegationTaskMetadata>;
    writeTask(task: DelegationTaskMetadata): Promise<void>;
    registerAgent(input: RegisterAgentInput): Promise<AgentManifest>;
    readRegistry(taskId: string): Promise<DelegationRegistry>;
    readAgentManifest(taskId: string, agentId: string): Promise<AgentManifest>;
    updateAgentManifest(taskId: string, agentId: string, patch: Partial<AgentManifest>): Promise<AgentManifest>;
    writeAgentStatus(taskId: string, agentId: string, status: Omit<AgentStatus, "taskId" | "agentId" | "updatedAt">): Promise<AgentStatus>;
    readAgentStatus(taskId: string, agentId: string): Promise<AgentStatus>;
    appendTaskEvent(taskId: string, input: AppendEventInput): Promise<DelegationEvent>;
    appendAgentEvent(taskId: string, agentId: string, input: AppendEventInput): Promise<DelegationEvent>;
    writeTaskModelText(taskId: string, fileName: string, text: string): Promise<string>;
    writeAgentModelText(taskId: string, agentId: string, fileName: string, text: string): Promise<string>;
    recordAgentResult(taskId: string, agentId: string, rawText: string, parsedResult: unknown): Promise<{
        rawPath: string;
        jsonPath: string;
    }>;
    appendAgentTextLog(taskId: string, agentId: string, logName: "screen" | "transcript", text: string): Promise<string>;
    recordTaskReport(taskId: string, reportName: ParentReportName, rawText: string, parsedReport: unknown): Promise<{
        rawPath: string;
        jsonPath: string;
    }>;
    readAgentResult(taskId: string, agentId: string): Promise<AgentResultRecord>;
    readTaskReport(taskId: string, reportName: ParentReportName): Promise<TaskReportRecord>;
    queueParentAlert(taskId: string, input: QueueParentAlertInput): Promise<{
        alert: ParentAlert;
        queued: boolean;
    }>;
    readParentAlerts(taskId: string, options?: ReadParentAlertsOptions): Promise<ParentAlert[]>;
    markParentAlertsRead(taskId: string, alertIds?: readonly string[]): Promise<ParentAlert[]>;
    incrementWaitScope(taskId: string, scopeKey: string): Promise<WaitScopeEntry>;
    resetWaitScope(taskId: string, scopeKey: string, status?: string): Promise<void>;
    readWaitState(taskId: string): Promise<DelegationWaitState>;
    pathsForTask(taskId: string): import("./paths.js").DelegationTaskPaths;
    pathsForAgent(taskId: string, agentId: string): import("./paths.js").DelegationAgentPaths;
    private readParentAlertQueue;
    private writeParentAlertQueue;
    private writeWaitState;
    private parentAgentIdFor;
    private indexPath;
    private buildEvent;
    private upsertIndexEntry;
    private upsertRegistryEntry;
    private updateRegistryState;
}
export declare function createDelegationStore(options: DelegationStoreOptions): DelegationStore;

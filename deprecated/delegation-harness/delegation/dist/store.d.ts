import { type DelegationTaskPaths } from "./paths.js";
import type { AgentManifest, AgentStatus, DelegationActiveLeaseView, DelegationAlertPriority, DelegationAttemptSource, DelegationEvent, DelegationExecutionAuthorizationEvidence, DelegationIndex, DelegationLayoutAllocation, DelegationLayoutPolicy, DelegationLayoutState, DelegationLease, DelegationLeaseEvent, DelegationLeaseState, DelegationProfile, DelegationRegistry, DelegationRetentionMode, DelegationRole, DelegationRouteApplication, DelegationRouteDecision, DelegationRouteDecisionRecord, DelegationRouteRequest, DelegationState, DelegationTaskMetadata, DelegationWaitState, DelegationWakeAttempt, DelegationWakeAttemptOutcome, ExecutionDecision, ExecutionMapMetadata, JsonValue, ParentAlert, ParentAlertEvidence, ParentAlertOutcome, ParentReportName, ResultStatus, WaitScopeEntry, WorkPackageMetadata } from "./types.js";
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
    attemptId?: string;
    attemptSource?: Exclude<DelegationAttemptSource, "legacy_synthetic">;
    profile?: DelegationProfile;
    parentAgentId?: string;
    cwd?: string;
    writeScope?: string | string[];
    allowedCommands?: string[];
    state?: DelegationState;
    createdAt?: string;
    paneRef?: string;
    surfaceRef?: string;
    workspaceRef?: string;
    windowRef?: string;
    launchCommand?: string;
    retention?: DelegationRetentionMode;
    layoutPolicy?: DelegationLayoutPolicy;
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
    escalatedFromAlertId?: string;
    escalationProof?: JsonValue;
    dedupeKey?: string;
    coalesceAcknowledged?: boolean;
}
export interface PlanningReportPublicationSource {
    transport: "delegate_record_report" | "delegate_finish" | "runtime_parser";
    agentId?: string;
    assignmentId?: string;
    attemptId?: string;
}
export interface PublishPlanningReportInput {
    rawText: string;
    source: PlanningReportPublicationSource;
}
export interface PlanningReportPublicationResult {
    status: "accepted" | "rejected";
    taskId: string;
    publicationId: string;
    reportStatus?: string;
    planArtifactPath?: string;
    contentHash: string;
    rawPath: string;
    jsonPath: string;
    eventId: string;
    commitState: "committed" | "committed_reconciled" | "committed_incomplete";
    planningReadyEventId?: string;
    recoveryReason?: string;
    errors?: Array<{
        lineNumber: number;
        message: string;
    }>;
}
export interface TerminalOutcomePublicationSource {
    transport: "delegate_finish" | "runtime_parser" | "delegate_record_report";
}
export interface PublishTerminalOutcomeInput {
    agentId: string;
    assignmentId: string;
    attemptId: string;
    role: DelegationRole;
    status: ResultStatus;
    rawText: string;
    source: TerminalOutcomePublicationSource;
    evidence: JsonValue;
}
export interface TerminalOutcomePublicationResult {
    status: "accepted" | "rejected";
    taskId: string;
    agentId: string;
    assignmentId: string;
    attemptId: string;
    contentHash: string;
    rawPath: string;
    jsonPath: string;
    claimPath?: string;
    outcomeId?: string;
    rejectionId?: string;
    reason?: string;
    commitState?: "committed" | "committed_reconciled" | "committed_incomplete";
    pendingEffects?: string[];
    recoveryReason?: string;
    agentState?: DelegationState;
    endedLeaseIds?: string[];
    eventId?: string;
    alert?: ParentAlert;
    wakeAttempt?: DelegationWakeAttempt;
    wakeAttemptError?: string;
}
export interface ReadParentAlertsOptions {
    unreadOnly?: boolean;
    agentId?: string;
    parentAgentId?: string;
}
export interface QueueParentAlertResult {
    alert: ParentAlert;
    queued: boolean;
    wakeAttempt?: DelegationWakeAttempt;
    wakeAttemptError?: string;
    escalation?: {
        alert: ParentAlert;
        queued: boolean;
        wakeAttempt?: DelegationWakeAttempt;
        wakeAttemptError?: string;
    };
}
export interface AgentResultRecord {
    exists: boolean;
    rawPath: string;
    jsonPath: string;
    parsed?: unknown;
    terminalOutcome?: {
        outcomeId: string;
        publicationStatus: "accepted_projected" | "accepted_pending_reconciliation";
        recoveryOperation: "publishTerminalOutcome";
        acceptedRawPath: string;
        acceptedJsonPath: string;
    };
}
export interface TaskReportRecord {
    exists: boolean;
    rawPath: string;
    jsonPath: string;
    parsed?: unknown;
}
export interface WorkPackageUpsertResult {
    decision: ExecutionDecision;
    package?: WorkPackageMetadata;
    executionMap?: ExecutionMapMetadata;
}
export interface RecordRouteApplicationResult {
    application: DelegationRouteApplication;
    recorded: boolean;
}
export interface AppendRouteDecisionOptions {
    request?: DelegationRouteRequest;
}
export interface PlanningReportReadyInput {
    eventId?: string;
    planArtifactPath: string;
}
export interface PlanApprovedInput {
    eventId?: string;
    planningReportReadyEventId: string;
    planArtifactPath: string;
    approvedBy: "user" | "orchestrator";
    constraints?: string[];
}
export interface ExecutionAuthorizedInput {
    eventId?: string;
    planningReportReadyEventId: string;
    planApprovedEventId: string;
    planArtifactPath: string;
    executionId?: string;
    executionMapPath?: string;
    schemaVersion?: number;
    constraints?: string[];
}
export interface ExecutionApprovalRequest {
    taskId: string;
    planningReportReadyEventId: string;
    planArtifactPath: string;
    executionMapPath: string;
}
export interface OwnerExecutionAuthorizationResult {
    approval: DelegationEvent;
    authorization: DelegationEvent;
    evidence: DelegationExecutionAuthorizationEvidence;
    commitState: "committed" | "committed_reconciled";
    recoveryReason?: string;
}
export interface AppendLeaseEventInput {
    eventId?: string;
    lease: DelegationLease;
    reason?: string;
    timestamp?: string;
}
export interface TransitionLeaseOptions {
    eventId?: string;
    reason?: string;
    timestamp?: string;
}
export interface EnsureActiveLeaseResult {
    lease: DelegationLease;
    changed: boolean;
    appendedEventIds: string[];
    view: DelegationActiveLeaseView;
}
export interface EndActiveAssignmentLeasesResult {
    leaseIds: string[];
    changed: boolean;
    view: DelegationActiveLeaseView;
}
export interface RecordWakeAttemptInput {
    attemptId: string;
    alertIds: string[];
    priority: DelegationAlertPriority;
    outcome: DelegationWakeAttemptOutcome;
    transport: string;
    parentAgentId?: string;
    message?: string;
    timestamp?: string;
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
    publishTerminalOutcome(taskId: string, input: PublishTerminalOutcomeInput): Promise<TerminalOutcomePublicationResult>;
    private reconcileTerminalOutcome;
    private projectAcceptedTerminalResult;
    private projectAcceptedTerminalStatus;
    private ensureTerminalEvent;
    appendAgentTextLog(taskId: string, agentId: string, logName: "screen" | "transcript", text: string): Promise<string>;
    publishPlanningReport(taskId: string, input: PublishPlanningReportInput): Promise<PlanningReportPublicationResult>;
    recordTaskReport(taskId: string, reportName: ParentReportName, rawText: string, parsedReport: unknown): Promise<{
        rawPath: string;
        jsonPath: string;
    }>;
    readAgentResult(taskId: string, agentId: string): Promise<AgentResultRecord>;
    readTaskReport(taskId: string, reportName: ParentReportName): Promise<TaskReportRecord>;
    queueParentAlert(taskId: string, input: QueueParentAlertInput): Promise<QueueParentAlertResult>;
    readParentAlerts(taskId: string, options?: ReadParentAlertsOptions): Promise<ParentAlert[]>;
    markParentAlertsRead(taskId: string, alertIds?: readonly string[]): Promise<ParentAlert[]>;
    incrementWaitScope(taskId: string, scopeKey: string): Promise<WaitScopeEntry>;
    resetWaitScope(taskId: string, scopeKey: string, status?: string): Promise<void>;
    readWaitState(taskId: string): Promise<DelegationWaitState>;
    readExecutionMap(taskId: string): Promise<ExecutionMapMetadata>;
    writeExecutionMap(taskId: string, executionMap: ExecutionMapMetadata): Promise<ExecutionMapMetadata>;
    upsertWorkPackage(taskId: string, workPackage: WorkPackageMetadata): Promise<WorkPackageUpsertResult>;
    appendRouteDecision(taskId: string, decision: DelegationRouteDecision, options?: AppendRouteDecisionOptions): Promise<DelegationRouteDecisionRecord>;
    readRouteDecisions(taskId: string): Promise<DelegationRouteDecisionRecord[]>;
    recordRouteApplication(input: DelegationRouteApplication): Promise<RecordRouteApplicationResult>;
    readRouteApplications(taskId: string): Promise<DelegationRouteApplication[]>;
    recordPlanningReportReady(taskId: string, input: PlanningReportReadyInput): Promise<DelegationEvent>;
    recordPlanApproved(taskId: string, input: PlanApprovedInput): Promise<DelegationEvent>;
    readExecutionApprovalRequest(taskId: string): Promise<ExecutionApprovalRequest>;
    approveAndAuthorizeExecution(taskId: string, expected: ExecutionApprovalRequest): Promise<OwnerExecutionAuthorizationResult>;
    private recordPlanApprovedLocked;
    recordExecutionAuthorized(taskId: string, input: ExecutionAuthorizedInput): Promise<DelegationEvent>;
    private recordExecutionAuthorizedLocked;
    readExecutionAuthorization(taskId: string): Promise<DelegationExecutionAuthorizationEvidence | undefined>;
    hasExecutionAuthorization(taskId: string): Promise<boolean>;
    appendLeaseEvent(taskId: string, input: AppendLeaseEventInput): Promise<DelegationLeaseEvent>;
    readLeaseEvents(taskId: string): Promise<DelegationLeaseEvent[]>;
    transitionLease(taskId: string, leaseId: string, state: DelegationLeaseState, options?: TransitionLeaseOptions): Promise<DelegationLeaseEvent>;
    ensureLeaseActive(taskId: string, input: DelegationLease, reason?: string): Promise<EnsureActiveLeaseResult>;
    endActiveAssignmentLeases(taskId: string, agentId: string, state: "exhausted" | "revoked", reason: string): Promise<EndActiveAssignmentLeasesResult>;
    rebuildActiveLeaseView(taskId: string): Promise<DelegationActiveLeaseView>;
    readActiveLeaseView(taskId: string): Promise<DelegationActiveLeaseView>;
    recordLayoutAllocation(allocation: DelegationLayoutAllocation): Promise<DelegationLayoutAllocation>;
    readLayoutState(taskId: string): Promise<DelegationLayoutState>;
    recordWakeAttempt(taskId: string, input: RecordWakeAttemptInput): Promise<DelegationWakeAttempt>;
    readWakeAttempts(taskId: string): Promise<DelegationWakeAttempt[]>;
    pathsForTask(taskId: string): DelegationTaskPaths;
    pathsForAgent(taskId: string, agentId: string): import("./paths.js").DelegationAgentPaths;
    private ensureParentAlertQueue;
    private queueParentAlertRecord;
    private recordQueuedWakeBestEffort;
    private maybeEscalateClosedParent;
    private withParentAlertLock;
    private projectTaskReadyAfterAuthorization;
    private assertDelegatedPlanningReportPublicationSource;
    private withLeaseLogLock;
    private withExecutionAuthorizationLock;
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
export declare function priorityForParentAlert(alert: Pick<ParentAlert, "outcome" | "state" | "status" | "eventType" | "data">): DelegationAlertPriority;

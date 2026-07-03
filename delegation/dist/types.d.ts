export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
    [key: string]: JsonValue;
}
export type DelegationRole = "orchestrator" | "planning-parent" | "execution-parent" | "researcher" | "worker" | "reviewer" | "verifier" | "integrator";
export type DelegationProfile = DelegationRole | "write-scoped" | "read-only" | "check-runner";
export type DelegationState = "created" | "starting" | "running" | "waiting_for_parent" | "attention" | "blocked" | "completed" | "failed" | "cancelled" | "closed";
export type ResultStatus = "completed" | "completed_with_risks" | "blocked" | "failed" | "cancelled";
export type ParentReportName = "planning-report" | "execution-kickoff" | "execution-report";
export type ParentAlertOutcome = "completed" | "completed_with_risks" | "blocked" | "failed" | "cancelled" | "attention" | "capability_gap";
export interface ParentAlertEvidence {
    rawPath?: string;
    jsonPath?: string;
    transcriptPath?: string;
    screenPath?: string;
    outputId?: string;
}
export interface ParentAlert {
    alertId: string;
    dedupeKey: string;
    taskId: string;
    outcome: ParentAlertOutcome;
    state: DelegationState;
    createdAt: string;
    updatedAt: string;
    agentId?: string;
    parentAgentId?: string;
    status?: string;
    eventType?: string;
    message?: string;
    evidence?: ParentAlertEvidence;
    data?: JsonValue;
    readAt?: string;
}
export interface ParentAlertQueue {
    version: 1;
    taskId: string;
    alerts: ParentAlert[];
    updatedAt: string;
}
export interface WaitScopeEntry {
    scopeKey: string;
    consecutiveWaits: number;
    updatedAt: string;
    lastStatus?: string;
}
export interface DelegationWaitState {
    version: 1;
    taskId: string;
    scopes: WaitScopeEntry[];
    updatedAt: string;
}
export type ProtocolBlockKind = "FFRESULT" | "PLANNING_REPORT" | "EXECUTION_KICKOFF" | "EXECUTION_REPORT";
export interface DelegationIndexTaskEntry {
    taskId: string;
    state: DelegationState;
    path: string;
    createdAt: string;
    updatedAt: string;
    goal?: string;
}
export interface DelegationIndex {
    version: 1;
    tasks: DelegationIndexTaskEntry[];
    updatedAt: string;
}
export interface DelegationTaskMetadata {
    taskId: string;
    state: DelegationState;
    createdAt: string;
    updatedAt: string;
    goal?: string;
    parentTaskId?: string;
}
export interface AgentRegistryEntry {
    agentId: string;
    role: DelegationRole;
    profile: DelegationProfile;
    state: DelegationState;
    manifestPath: string;
    statusPath: string;
    createdAt: string;
    updatedAt: string;
    parentAgentId?: string;
}
export interface DelegationRegistry {
    taskId: string;
    agents: AgentRegistryEntry[];
    updatedAt: string;
}
export interface AgentManifest {
    taskId: string;
    agentId: string;
    role: DelegationRole;
    profile: DelegationProfile;
    createdAt: string;
    updatedAt: string;
    modelTaskPacketPath: string;
    resultRawPath: string;
    resultJsonPath: string;
    parentAgentId?: string;
    cwd?: string;
    writeScope?: string;
    allowedCommands?: string[];
    paneRef?: string;
    surfaceRef?: string;
    workspaceRef?: string;
    windowRef?: string;
    launchCommand?: string;
}
export interface AgentStatus {
    taskId: string;
    agentId: string;
    state: DelegationState;
    updatedAt: string;
    message?: string;
    reason?: string;
}
export interface DelegationEvent {
    eventId: string;
    timestamp: string;
    taskId: string;
    type: string;
    scope: "task" | "agent";
    agentId?: string;
    state?: DelegationState;
    message?: string;
    data?: JsonValue;
}
export interface ProtocolRow {
    tag: string;
    fields: string[];
    lineNumber: number;
    raw: string;
}
export type ProtocolFieldMap = Record<string, string[][]>;
export interface ProtocolParseError {
    lineNumber: number;
    message: string;
    raw?: string;
    blockKind?: ProtocolBlockKind;
}
export interface ParsedProtocolBlock {
    kind: ProtocolBlockKind;
    rows: ProtocolRow[];
    fields: ProtocolFieldMap;
    rawText: string;
    startLine: number;
    endLine: number;
}
export interface ParsedKeyValueAttributes {
    [key: string]: string;
}
export interface ParsedBlocker {
    kind: string;
    message: string;
    attributes: ParsedKeyValueAttributes;
}
export interface ParsedCapabilityRequest {
    action: string;
    detail: string;
    attributes: ParsedKeyValueAttributes;
}
export interface ParsedFFResult extends ParsedProtocolBlock {
    kind: "FFRESULT";
    status: ResultStatus;
    summary?: string;
    evidence: ProtocolRow[];
    filesRead: string[];
    filesChanged: string[];
    toolsUsed: string[];
    checks: ProtocolRow[];
    blockers: ParsedBlocker[];
    requests: ParsedCapabilityRequest[];
    uncertainty?: string;
    recommendation?: string;
}
export interface ParsedParentReport extends ParsedProtocolBlock {
    kind: "PLANNING_REPORT" | "EXECUTION_KICKOFF" | "EXECUTION_REPORT";
    status?: string;
}
export interface ParsedProtocolSignal {
    kind: "FFSTATUS" | "FFATTENTION";
    lineNumber: number;
    raw: string;
    fields: string[];
    state?: string;
    message?: string;
    attributes: ParsedKeyValueAttributes;
}
export interface ProtocolParseResult {
    ok: boolean;
    rawText: string;
    results: ParsedFFResult[];
    planningReports: ParsedParentReport[];
    executionKickoffs: ParsedParentReport[];
    executionReports: ParsedParentReport[];
    statuses: ParsedProtocolSignal[];
    attentions: ParsedProtocolSignal[];
    errors: ProtocolParseError[];
}
export interface ParseProtocolOptions {
    requireResult?: boolean;
}
export type DelegationProfileKind = "orchestrator" | "parent" | "leaf";
export type DelegationCommandPolicy = "guarded" | "allowed-list" | "none";
export type DelegationPolicyReroute = "parent" | "orchestrator" | "verifier" | "execution-parent" | "planning-parent";
export interface DelegationDefaultPolicy {
    denySecretPaths: boolean;
    requireWriteScope: boolean;
    productCodeWritesRequireScope: boolean;
    commandPolicy: DelegationCommandPolicy;
    allowGitPush: boolean;
    allowCommits: boolean;
    allowPublishDeploy: boolean;
    allowDestructiveCommands: boolean;
    denyCredentialEnvDumping: boolean;
    suggestedReroute: DelegationPolicyReroute;
}
export interface DelegationProfileDefinition {
    profile: DelegationProfile;
    displayName: string;
    kind: DelegationProfileKind;
    allowedRoles: DelegationRole[];
    activeTools: string[];
    contextEmphasis: string[];
    defaultPolicy: DelegationDefaultPolicy;
    skills: {
        hardGated: false;
        note: string;
    };
}
export type PolicyIntentKind = "tool" | "read" | "write" | "command";
export interface ToolPolicyIntent {
    kind: "tool";
    toolName: string;
}
export interface PathPolicyIntent {
    kind: "read" | "write";
    path: string;
    toolName?: string;
}
export interface CommandPolicyIntent {
    kind: "command";
    command: string;
    toolName?: string;
}
export type PolicyIntent = ToolPolicyIntent | PathPolicyIntent | CommandPolicyIntent;
export interface DelegationTaskPolicy {
    cwd?: string;
    writeScopes?: string[];
    allowedCommands?: string[];
    allowGitPush?: boolean;
    explicitUserConfirmation?: boolean;
    allowCommits?: boolean;
    plannedCommit?: boolean;
    allowPublishDeploy?: boolean;
    allowDestructiveCommands?: boolean;
}
export type PolicyBlockCode = "unknown_role" | "unknown_profile" | "role_profile_mismatch" | "capability_gap" | "delegation_tool_for_leaf" | "secret_path" | "write_scope_violation" | "missing_write_scope" | "product_code_write_requires_scope" | "git_push_denied" | "unplanned_commit" | "destructive_command" | "credential_env_dump" | "publish_deploy_denied" | "command_not_allowed" | "malformed_intent";
export interface PolicyAllowDecision {
    allowed: true;
    status: "allowed";
    role: DelegationRole;
    profile: DelegationProfile;
    reason: string;
}
export interface PolicyBlockDecision {
    allowed: false;
    status: "blocked";
    code: PolicyBlockCode;
    reason: string;
    role?: DelegationRole;
    profile?: DelegationProfile;
    suggestedReroute?: DelegationPolicyReroute;
    request?: {
        kind: "capability_gap" | "policy_block";
        detail: string;
    };
}
export type PolicyDecision = PolicyAllowDecision | PolicyBlockDecision;
export interface EvaluatePolicyInput {
    role: DelegationRole;
    profile?: DelegationProfile;
    intent: PolicyIntent;
    taskPolicy?: DelegationTaskPolicy;
}
export interface TaskPacketSourcePointer {
    kind: string;
    path: string;
    note?: string;
}
export interface TaskPacketEvidencePointer {
    label: string;
    path?: string;
    outputId?: string;
    note?: string;
    lines?: string;
}
export interface CompileTaskPacketInput {
    taskId: string;
    agentId: string;
    parentAgentId?: string;
    role: DelegationRole;
    profile?: DelegationProfile;
    cwd: string;
    objective: string;
    sourcePointers?: TaskPacketSourcePointer[];
    inScope?: string[];
    outOfScope?: string[];
    tools?: string[];
    deny?: string[];
    policySummary?: string[];
    writeScope?: string | string[];
    allowedCommands?: string[];
    evidence?: TaskPacketEvidencePointer[];
    stopConditions?: string[];
    returnProtocol?: string[];
    returnFields?: string[];
    tracePath?: string;
    resultPath?: string;
}
export interface CompiledTaskPacket {
    text: string;
    role: DelegationRole;
    profile: DelegationProfile;
    tools: string[];
    writeScopes: string[];
    allowedCommands: string[];
}

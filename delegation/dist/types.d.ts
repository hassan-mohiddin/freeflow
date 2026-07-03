export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
    [key: string]: JsonValue;
}
export type DelegationRole = "orchestrator" | "planning-parent" | "execution-parent" | "researcher" | "worker" | "reviewer" | "verifier" | "integrator";
export type DelegationProfile = DelegationRole | "write-scoped" | "read-only" | "check-runner";
export type DelegationState = "created" | "starting" | "running" | "waiting_for_parent" | "attention" | "blocked" | "completed" | "failed" | "cancelled" | "closed";
export type ResultStatus = "completed" | "completed_with_risks" | "blocked" | "failed" | "cancelled";
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

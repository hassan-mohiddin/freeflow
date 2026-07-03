import type { AgentManifest, AgentStatus, DelegationEvent, DelegationIndex, DelegationProfile, DelegationRegistry, DelegationRole, DelegationState, DelegationTaskMetadata, JsonValue } from "./types.js";
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
    recordTaskReport(taskId: string, reportName: "planning-report" | "execution-kickoff" | "execution-report", rawText: string, parsedReport: unknown): Promise<{
        rawPath: string;
        jsonPath: string;
    }>;
    pathsForTask(taskId: string): import("./paths.js").DelegationTaskPaths;
    pathsForAgent(taskId: string, agentId: string): import("./paths.js").DelegationAgentPaths;
    private indexPath;
    private buildEvent;
    private upsertIndexEntry;
    private upsertRegistryEntry;
    private updateRegistryState;
}
export declare function createDelegationStore(options: DelegationStoreOptions): DelegationStore;

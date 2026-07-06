import type { CompiledTaskPacket, CompileTaskPacketInput, DelegationProfile, TaskPacketEvidencePointer, TaskPacketSourcePointer } from "./types.js";
export interface NormalizedTaskPacket {
    taskId: string;
    agentId: string;
    parentAgentId?: string;
    role: CompileTaskPacketInput["role"];
    profile: DelegationProfile;
    cwd: string;
    objective: string;
    tools: string[];
    writeScopes: string[];
    allowedCommands: string[];
    sourcePointers: TaskPacketSourcePointer[];
    inScope: string[];
    outOfScope: string[];
    deny: string[];
    policySummary: string[];
    evidence: TaskPacketEvidencePointer[];
    stopConditions: string[];
    returnProtocol: string[];
    returnFields: string[];
    tracePath: string;
    resultPath: string;
}
export declare function compileTaskPacket(input: CompileTaskPacketInput): CompiledTaskPacket;
export declare const compileFreeflowTaskPacket: typeof compileTaskPacket;
export declare function renderTaskPacketMarkdown(packet: NormalizedTaskPacket): string;
export declare function renderTaskPacketRows(input: CompileTaskPacketInput): string;

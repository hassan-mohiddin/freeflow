import type {
  CompiledTaskPacket,
  CompileTaskPacketInput,
  DelegationProfile,
  TaskPacketEvidencePointer,
  TaskPacketSourcePointer,
} from "./types.js";
export interface TaskPacketIdentity {
  taskId: string;
  agentId: string;
  assignmentId: string;
  attemptId: string;
  role: CompileTaskPacketInput["role"];
  profile: DelegationProfile;
  identitySchemaVersion: 1;
  profileSchemaVersion: 1;
  protocolVersion: 1;
}
export interface NormalizedTaskPacket {
  taskId: string;
  agentId: string;
  assignmentId: string;
  attemptId: string;
  identitySchemaVersion: 1;
  profileSchemaVersion: 1;
  protocolVersion: 1;
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
export declare function validateTaskPacketIdentity(
  text: string,
  expected: Partial<TaskPacketIdentity>,
): TaskPacketIdentity;
export declare function renderTaskPacketMarkdown(packet: NormalizedTaskPacket): string;
export declare function renderTaskPacketRows(input: CompileTaskPacketInput): string;

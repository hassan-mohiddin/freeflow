import type { ResponsibilitySnapshot } from "../tool-runtime/contracts.js";
export type { ResponsibilitySnapshot } from "../tool-runtime/contracts.js";

export type ObservationCoverage = "complete-at-boundary" | "partial" | "unknown";

export type UsageObservation = Readonly<{
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
  totalTokens?: number;
  cost?: Readonly<{
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  }>;
  source: "host-normalized" | "tool-reported";
}>;

type ObservationBase = Readonly<{
  version: 1;
  id: string;
  sessionId?: string;
  basisEntryId?: string;
  responsibility: ResponsibilitySnapshot;
  coverage: ObservationCoverage;
}>;

export type PreparedRequestObservation = ObservationBase &
  Readonly<{
    kind: "prepared-request";
    attemptId: string;
    provider?: string;
    model?: string;
    api?: string;
    requestedEffort?: string;
    payloadHash?: string;
    inputPrefixHash?: string;
    envelopeHash?: string;
    payloadBytes?: number;
    inputBytes?: number;
    instructionBytes?: number;
    toolSchemaBytes?: number;
  }>;

export type ResponseHeadersObservation = ObservationBase &
  Readonly<{
    kind: "response-headers";
    attemptId?: string;
    status: number;
    headerNames: readonly string[];
    headerBytes: number;
  }>;

export type AssistantCompletionObservation = ObservationBase &
  Readonly<{
    kind: "assistant-complete";
    attemptId?: string;
    assistantEntryId?: string;
    provider?: string;
    model?: string;
    responseModel?: string;
    api?: string;
    responseId?: string;
    providerThinkingLevel?: string;
    stopReason?: string;
    usage?: UsageObservation;
  }>;

export type ToolCompletionObservation = ObservationBase &
  Readonly<{
    kind: "tool-complete";
    toolEntryId?: string;
    toolCallId: string;
    toolName: string;
    isError: boolean;
    argumentBytes?: number;
    resultBytes?: number;
    programSourceBytes?: number;
    emittedBytes?: number;
    capturedBytes?: number;
    recoveredBytes?: number;
    runId?: string;
    operation?: string;
    programStatus?: string;
    effectState?: string;
    coverageBoundary?: string;
    childOperations?: readonly Readonly<{
      operation: string;
      status: string;
      effectState: string;
    }>[];
    usage?: UsageObservation;
  }>;

export type EfficiencyObservation =
  PreparedRequestObservation | ResponseHeadersObservation | AssistantCompletionObservation | ToolCompletionObservation;

export type EfficiencyReport = Readonly<{
  observations: number;
  attempts: number;
  preparedRequests: number;
  responses: number;
  assistantCompletions: number;
  successfulAssistants: number;
  failedAssistants: number;
  toolCompletions: number;
  incomplete: number;
  usage: Readonly<{
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    cacheWrite1h: number;
    totalTokens: number;
    observedRecords: number;
  }>;
  toolUsage: Readonly<{
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    cacheWrite1h: number;
    totalTokens: number;
    observedRecords: number;
  }>;
  cost: Readonly<{
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
    observedRecords: number;
  }>;
  toolCost: Readonly<{
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
    observedRecords: number;
  }>;
  tooling: Readonly<{
    argumentBytes: number;
    resultBytes: number;
    programSourceBytes: number;
    emittedBytes: number;
    capturedBytes: number;
    recoveredBytes: number;
    failed: number;
  }>;
  profiles: readonly Readonly<{ profile: string; observations: number; usageRecords: number }>[];
  assignments: readonly Readonly<{ assignmentId: string; observations: number }>[];
  runs: readonly Readonly<{
    runId: string;
    status?: string;
    toolCallId: string;
    resultBytes: number;
    emittedBytes: number;
  }>[];
  operations: readonly Readonly<{ operation: string; calls: number; failures: number; resultBytes: number }>[];
  groupingCoverage: "complete-at-boundary" | "limited";
}>;

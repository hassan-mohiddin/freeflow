export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Effect = "captured-read" | "live-read" | "mutation";
export type Concurrency = "read-parallel" | "exclusive";

export type ResponsibilitySnapshot = Readonly<{
  profile: "solo" | "coordinator" | "helper" | "executor" | "unknown";
  control: "inactive" | "manual" | "automatic" | "unknown";
  assignmentId?: string;
  executionId?: string;
  provider?: string;
  modelId?: string;
  thinking?: string;
}>;

export type OperationKey = Readonly<{ id: string; revision: string }>;

export type ToolScope = Readonly<{
  sessionId: string;
  cwd: string;
  parentCallId: string;
  catalogGeneration: string;
  responsibility: ResponsibilitySnapshot;
  routing: unknown;
}>;

export type Admission =
  | Readonly<{ kind: "allowed" }>
  | Readonly<{ kind: "denied"; code: string; message: string }>
  | Readonly<{ kind: "needs-model"; context: Json }>;

export type Coverage = Readonly<{
  kind: "complete-at-boundary" | "limited" | "unknown";
  boundary: string;
  continuation?: Json;
}>;

export type OperationValue<O extends Json = Json> = Readonly<{
  value: O;
  coverage: Coverage;
}>;

export type OperationContext = Readonly<{
  scope: ToolScope;
  signal?: AbortSignal;
  host?: unknown;
}>;

export class OperationExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly effectState: "none" | "completed" | "unknown" = "unknown",
  ) {
    super(`${code}: ${message}`);
    this.name = "OperationExecutionError";
  }
}

export interface Operation<I extends Json = Json, O extends Json = Json> {
  key: OperationKey;
  description: string;
  keywords?: readonly string[];
  owner: Readonly<{ adapterId: string; adapterRevision: string; executionWorld: string }>;
  inputSchema: Json;
  outputSchema: Json;
  effects: readonly Effect[];
  effect(input: I): Effect;
  concurrency(input: I): Concurrency;
  exposure: Readonly<{ discoverable: boolean; direct: boolean; programmatic: boolean }>;
  authorize(input: I, scope: ToolScope, signal?: AbortSignal): Promise<Admission>;
  execute(input: I, context: OperationContext): Promise<OperationValue<O>>;
}

export type EffectState = "none" | "completed" | "unknown";

export type CallOutcome = Readonly<{
  operation: OperationKey;
  catalogGeneration: string;
  status: "succeeded" | "denied" | "needs-model" | "failed" | "cancelled" | "unknown";
  effect?: Effect;
  effectState: EffectState;
  bodyStarted: boolean;
  value?: Json;
  coverage?: Coverage;
  error?: Readonly<{ code: string; message: string }>;
  context?: Json;
}>;

export type OperationDescriptor = Readonly<{
  key: OperationKey;
  description: string;
  keywords: readonly string[];
  owner: Operation<Json, Json>["owner"];
  inputSchema: Json;
  outputSchema: Json;
  effects: readonly Effect[];
  exposure: Operation<Json, Json>["exposure"];
  fingerprint: string;
}>;

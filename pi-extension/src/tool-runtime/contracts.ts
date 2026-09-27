import type { ArtifactId, OccurrenceId } from "../session-store/contracts.js";

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
    readonly result?: OperationValue,
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
  occurrenceId?: OccurrenceId;
  artifactRefs?: readonly ArtifactId[];
  artifactBytes?: number; // Acknowledged artifact payload bytes; excludes journal/manifest overhead.
  persistence?: Readonly<{ state: "sidecar-acknowledged" | "unavailable"; code?: string }>;
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

// V2 contracts are inactive until an explicit v2 operation is registered and presented.
// Keep Operation and OperationDescriptor unchanged for every existing revision.
export type OperationCategory = "result" | "project" | "process" | "code" | "vcs" | "resource" | "web" | "integration";
export type OperationGuidance = Readonly<{ useWhen: string; avoidWhen?: string; example?: Json }>;
export type CancellationContract = "settles" | "reconciles-unknown";

export type CanonicalOutcome<O extends Json = Json> = Readonly<{
  occurrenceId: OccurrenceId;
  operation: OperationKey;
  catalogGeneration: string;
  status: CallOutcome["status"];
  effect?: Effect;
  effectState: EffectState;
  bodyStarted: boolean;
  value?: O;
  coverage?: Coverage;
  artifactRefs: readonly ArtifactId[];
  error?: CallOutcome["error"];
  context?: Json;
}>;

export type PresentationPolicy = Readonly<{ maxBytes: number }>;
export type ModelPresentation = Readonly<{
  text: string;
  coverage: Coverage;
  artifactRefs: readonly ArtifactId[];
}>;
export type UiPresentation = Readonly<{ summary: string; detail?: string }>;
export type OperationPresenter<I extends Json = Json, O extends Json = Json> = Readonly<{
  model(input: I, outcome: CanonicalOutcome<O>, policy: PresentationPolicy): Promise<ModelPresentation>;
  ui?(input: I, outcome: CanonicalOutcome<O>): Promise<UiPresentation>;
}>;

export type PreparedExecution<O extends Json = Json> = Readonly<{
  run(signal?: AbortSignal): Promise<OperationValue<O>>;
  onSkip?(): OperationValue<O>;
  release(): void;
}>;

export interface OperationV2<I extends Json = Json, O extends Json = Json> extends Operation<I, O> {
  // Optional pre-effect planning; the kernel retains its resources through effect settlement.
  prepareExecution?(input: I, context: OperationContext): Promise<PreparedExecution<O>>;
  contractVersion: 2;
  category: OperationCategory;
  guidance: OperationGuidance;
  cancellation: CancellationContract;
  presenter: OperationPresenter<I, O>;
}

export type OperationDescriptorV2 = OperationDescriptor &
  Readonly<{
    contractVersion: 2;
    category: OperationCategory;
    guidance: OperationGuidance;
    cancellation: CancellationContract;
  }>;

// The optional never discriminator retains every v1 caller without changing its runtime descriptor.
export type OperationV1<I extends Json = Json, O extends Json = Json> = Operation<I, O> &
  Readonly<{ contractVersion?: never }>;
export type VersionedOperation = OperationV1 | OperationV2;
export type OperationDescriptorV1 = OperationDescriptor & Readonly<{ contractVersion?: never }>;
export type VersionedOperationDescriptor = OperationDescriptorV1 | OperationDescriptorV2;

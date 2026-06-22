export const PRESERVE_MODES = ["summary", "important", "full"] as const;
export type PreserveMode = (typeof PRESERVE_MODES)[number];

export const RETRIEVAL_ACTIONS = ["query", "locate", "retrieve", "expand", "explain"] as const;
export type RetrievalAction = (typeof RETRIEVAL_ACTIONS)[number];

export const TOOL_STATUSES = ["ok", "error"] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

export const EXECUTION_STATUSES = ["success", "failed", "timed_out", "cancelled"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const ROUTING_STATUSES = ["routed", "passed_through", "partial", "failed"] as const;
export type RoutingStatus = (typeof ROUTING_STATUSES)[number];

export const ROUTE_KINDS = ["retrieve", "run", "capture", "derive", "safety-net", "pass-through"] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

export const PRODUCER_KINDS = ["command", "native", "repo", "web", "fetch", "code_search", "mcp", "provider", "derive", "other"] as const;
export type ProducerKind = (typeof PRODUCER_KINDS)[number];

export const PERSISTENCE_STATUSES = ["vaulted", "redacted", "metadata_only", "not_persisted"] as const;
export type PersistenceStatus = (typeof PERSISTENCE_STATUSES)[number];

export const RECOVERABILITY_MODES = ["exact", "redacted", "metadata_only", "none"] as const;
export type RecoverabilityMode = (typeof RECOVERABILITY_MODES)[number];

export const ROUTER_FAILURE_KINDS = [
  "adapter_unavailable",
  "unsupported_producer",
  "mutating_producer_rejected",
  "producer_execution_failure",
  "partial_capture",
  "storage_failure",
  "redaction_failure",
  "derive_source_unavailable",
  "derive_validation_failure",
  "derive_execution_failure",
] as const;
export type RouterFailureKind = (typeof ROUTER_FAILURE_KINDS)[number];

export const FAILURE_EXECUTION_STATUSES = ["unavailable", "unsupported", "rejected", "failed", "partial"] as const;
export type FailureExecutionStatus = (typeof FAILURE_EXECUTION_STATUSES)[number];

export const EVIDENCE_WINDOWS = ["exact", "small", "lines_30", "lines_80", "section", "full"] as const;
export type EvidenceWindow = (typeof EVIDENCE_WINDOWS)[number];

export const OUTPUT_STREAMS = ["stdout", "stderr", "combined", "raw"] as const;
export type OutputStream = (typeof OUTPUT_STREAMS)[number];

export const POST_TOOL_ROUTING_MODES = ["off", "safety-net", "strict"] as const;
export type PostToolRoutingMode = (typeof POST_TOOL_ROUTING_MODES)[number];

export interface RepoSourceRef {
  kind: "repo";
  path: string;
}

export interface VaultSourceRef {
  kind: "vault";
  outputId: string;
  stream?: OutputStream;
}

export interface NativeToolSourceRef {
  kind: "native";
  tool: string;
  outputId: string;
}

export type SourceRef = RepoSourceRef | VaultSourceRef | NativeToolSourceRef;

export interface ProducerDescriptor {
  kind: ProducerKind;
  adapter?: string;
  name?: string;
  server?: string;
  tool?: string;
}

export interface EvidencePersistence {
  status: PersistenceStatus;
  recoverability: RecoverabilityMode;
  recoveryOutputId?: string;
  outputId?: string;
}

export interface EvidenceLineage {
  sourceRecordIds?: string[];
  sourceOutputIds?: string[];
  operation?: string;
  operationHash?: string;
}

export interface RouterFailure {
  kind: RouterFailureKind;
  message: string;
}

export interface ProducerExecutionFailure {
  status: FailureExecutionStatus;
  failureKind: RouterFailureKind;
  message: string;
}

export interface DeriveExecutionFailure {
  status: FailureExecutionStatus;
  failureKind: RouterFailureKind;
  message: string;
}

export interface EvidenceRecordIdentity {
  recordId: string;
  recoveryOutputId?: string;
  outputId?: string;
}

export interface EvidencePacket {
  id: string;
  source: SourceRef;
  excerpt: string;
  why: string;
  window: EvidenceWindow;
  expandable: boolean;
  path?: string;
  lines?: string;
}

export interface RecoveryHint {
  how: string;
  outputId?: string;
  evidenceId?: string;
}

export interface RoutingDecision {
  status: RoutingStatus;
  route: RouteKind;
  reason: string;
}

export interface CommandExecution {
  status: ExecutionStatus;
  exitCode: number | null;
  durationMs?: number;
}

export interface ImportantLine {
  stream: Exclude<OutputStream, "raw">;
  lines: string;
  excerpt: string;
}

export interface CommandParserReference {
  path: string;
  line?: number;
  column?: number;
  code?: string;
  severity?: "error" | "warning" | "info";
  message: string;
}

export interface CommandParserMetadata {
  name: string;
  confidence: number;
  fidelity: "exact" | "lossy";
  compressed: boolean;
  counts?: Record<string, number>;
  references?: CommandParserReference[];
}

export interface RoutedResultBase {
  toolStatus: ToolStatus;
  decisionId: string;
  preserve: PreserveMode;
  routing: RoutingDecision;
  recordId?: string;
  producer?: ProducerDescriptor;
  persistence?: EvidencePersistence;
  lineage?: EvidenceLineage;
  failure?: RouterFailure;
  producerExecution?: ProducerExecutionFailure;
  deriveExecution?: DeriveExecutionFailure;
  recovery?: RecoveryHint;
  evidence?: EvidencePacket[];
}

export interface RetrievalRoutedResult extends RoutedResultBase {
  source?: SourceRef;
}

export interface CommandRoutedResult extends RoutedResultBase {
  outputId: string;
  execution: CommandExecution;
  summary?: string;
  importantLines?: ImportantLine[];
  parser?: CommandParserMetadata;
}

export interface CaptureRoutedResult extends RoutedResultBase {
  outputId: string;
  summary?: string;
}

export interface DeriveRoutedResult extends RoutedResultBase {
  outputId: string;
  source: SourceRef;
  operation: Record<string, unknown>;
  summary?: string;
}

export interface FailureRoutedResult extends RoutedResultBase {
  outputId?: string;
}

export type RoutedResult = RetrievalRoutedResult | CommandRoutedResult | CaptureRoutedResult | DeriveRoutedResult | FailureRoutedResult;

export interface LineByteCounts {
  lines: number;
  bytes: number;
}

export interface CommandOutputPaths {
  meta: string;
  stdout: string;
  stderr: string;
  combined: string;
}

export interface OutputFingerprints {
  exactSha256: string;
  normalizedSha256: string;
  commandFingerprintSha256?: string;
}

export interface VaultRecordBase {
  outputId: string;
  recordId: string;
  objectId: string;
  createdAt: string;
  paths: {
    meta: string;
  };
  decisionIds: string[];
  producer: ProducerDescriptor;
  persistence: EvidencePersistence;
  lineage?: EvidenceLineage;
  contentHashSha256: string;
  fingerprints?: OutputFingerprints;
  retention?: VaultRetentionPolicy;
  expiresAt?: string;
}

export interface CommandOutputRecord extends VaultRecordBase {
  kind: "command";
  command: string | readonly string[];
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  paths: CommandOutputPaths;
  lineCounts: {
    stdout: number;
    stderr: number;
    combined: number;
  };
  byteCounts: {
    stdout: number;
    stderr: number;
    combined: number;
  };
  hashes: {
    stdoutSha256?: string;
    stderrSha256?: string;
    combinedSha256?: string;
  };
  fingerprints: OutputFingerprints & { commandFingerprintSha256: string };
  cwd?: string;
  durationMs?: number;
}

export interface TextOutputRecord extends VaultRecordBase {
  kind: "text";
  sourceKind: "native" | "mcp" | "fetch" | "derive" | "other";
  paths: {
    meta: string;
    raw: string;
  };
  lineCounts: {
    raw: number;
  };
  byteCounts: {
    raw: number;
  };
  hashes: {
    rawSha256?: string;
  };
  fingerprints: OutputFingerprints;
}

export interface RepoFileReferenceRecord extends VaultRecordBase {
  kind: "repo-file";
  path: string;
  paths: {
    meta: string;
  };
  hashSha256?: string;
}

export type VaultRecord = CommandOutputRecord | TextOutputRecord | RepoFileReferenceRecord;

export interface SessionIndexEntry {
  outputId: string;
  recordId?: string;
  objectId: string;
  kind: VaultRecord["kind"];
  createdAt: string;
  producer?: ProducerDescriptor;
  persistence?: EvidencePersistence;
  lineage?: EvidenceLineage;
  executionStatus?: ExecutionStatus;
  fingerprints?: OutputFingerprints;
}

export interface VaultSessionIndex {
  version: 1;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  outputs: string[];
  records: Record<string, SessionIndexEntry>;
  successful: string[];
  failed: string[];
  timedOut: string[];
  cancelled: string[];
}


export interface DecisionRecord {
  decisionId: string;
  createdAt: string;
  route: RouteKind;
  preserve: PreserveMode;
  reason: string;
  source?: SourceRef;
  outputId?: string;
  evidenceIds?: string[];
}

export interface RouterThresholds {
  largeOutputBytes: number;
  largeOutputLines: number;
}

export type VaultRetentionPolicy =
  | {
      strategy: "ttl";
      ttlDays: number;
    }
  | {
      strategy: "manual";
    };

export interface RouterVaultConfig {
  root: string;
  retention?: VaultRetentionPolicy;
}

export interface RouterHints {
  generatedPathGlobs?: string[];
  noisyCommandPatterns?: string[];
}

export interface RouterConfig {
  postToolRouting: PostToolRoutingMode;
  thresholds: RouterThresholds;
  vault: RouterVaultConfig;
  hints?: RouterHints;
}

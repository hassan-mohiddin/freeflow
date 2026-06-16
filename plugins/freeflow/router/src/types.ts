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

export const ROUTE_KINDS = ["retrieve", "run", "safety-net", "pass-through"] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

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

export interface RoutedResultBase {
  toolStatus: ToolStatus;
  decisionId: string;
  preserve: PreserveMode;
  routing: RoutingDecision;
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
}

export type RoutedResult = RetrievalRoutedResult | CommandRoutedResult;

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

export interface VaultRecordBase {
  outputId: string;
  objectId: string;
  createdAt: string;
  paths: {
    meta: string;
  };
  decisionIds: string[];
  contentHashSha256: string;
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
  cwd?: string;
  durationMs?: number;
}

export interface TextOutputRecord extends VaultRecordBase {
  kind: "text";
  sourceKind: "native" | "mcp" | "fetch" | "other";
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
  objectId: string;
  kind: VaultRecord["kind"];
  createdAt: string;
  executionStatus?: ExecutionStatus;
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

export declare const PRESERVE_MODES: readonly ["summary", "important", "full"];
export type PreserveMode = (typeof PRESERVE_MODES)[number];
export declare const RETRIEVAL_ACTIONS: readonly ["query", "locate", "retrieve", "expand", "explain"];
export type RetrievalAction = (typeof RETRIEVAL_ACTIONS)[number];
export declare const TOOL_STATUSES: readonly ["ok", "error"];
export type ToolStatus = (typeof TOOL_STATUSES)[number];
export declare const EXECUTION_STATUSES: readonly ["success", "failed", "timed_out", "cancelled"];
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export declare const ROUTING_STATUSES: readonly ["routed", "passed_through", "partial", "failed"];
export type RoutingStatus = (typeof ROUTING_STATUSES)[number];
export declare const ROUTE_KINDS: readonly ["retrieve", "run", "safety-net", "pass-through"];
export type RouteKind = (typeof ROUTE_KINDS)[number];
export declare const EVIDENCE_WINDOWS: readonly ["exact", "small", "lines_30", "lines_80", "section", "full"];
export type EvidenceWindow = (typeof EVIDENCE_WINDOWS)[number];
export declare const OUTPUT_STREAMS: readonly ["stdout", "stderr", "combined", "raw"];
export type OutputStream = (typeof OUTPUT_STREAMS)[number];
export declare const POST_TOOL_ROUTING_MODES: readonly ["off", "safety-net", "strict"];
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
export type VaultRetentionPolicy = {
    strategy: "ttl";
    ttlDays: number;
} | {
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

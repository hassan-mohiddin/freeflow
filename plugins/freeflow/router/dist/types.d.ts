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
export declare const ROUTE_KINDS: readonly ["retrieve", "run", "capture", "derive", "safety-net", "pass-through"];
export type RouteKind = (typeof ROUTE_KINDS)[number];
export declare const PRODUCER_KINDS: readonly ["command", "native", "repo", "web", "fetch", "code_search", "mcp", "provider", "derive", "other"];
export type ProducerKind = (typeof PRODUCER_KINDS)[number];
export declare const PERSISTENCE_STATUSES: readonly ["vaulted", "redacted", "metadata_only", "not_persisted"];
export type PersistenceStatus = (typeof PERSISTENCE_STATUSES)[number];
export declare const RECOVERABILITY_MODES: readonly ["exact", "redacted", "metadata_only", "none"];
export type RecoverabilityMode = (typeof RECOVERABILITY_MODES)[number];
export declare const ROUTER_FAILURE_KINDS: readonly ["adapter_unavailable", "unsupported_producer", "mutating_producer_rejected", "producer_execution_failure", "partial_capture", "storage_failure", "redaction_failure", "derive_source_unavailable", "derive_validation_failure", "derive_execution_failure"];
export type RouterFailureKind = (typeof ROUTER_FAILURE_KINDS)[number];
export declare const FAILURE_EXECUTION_STATUSES: readonly ["unavailable", "unsupported", "rejected", "failed", "partial"];
export type FailureExecutionStatus = (typeof FAILURE_EXECUTION_STATUSES)[number];
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
export interface FailureRoutedResult extends RoutedResultBase {
    outputId?: string;
}
export type RoutedResult = RetrievalRoutedResult | CommandRoutedResult | CaptureRoutedResult | FailureRoutedResult;
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
    fingerprints: OutputFingerprints & {
        commandFingerprintSha256: string;
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

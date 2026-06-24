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
export declare const ROUTE_KINDS: readonly ["retrieve", "run", "capture", "derive", "observed", "safety-net", "pass-through"];
export type RouteKind = (typeof ROUTE_KINDS)[number];
export declare const PRODUCER_KINDS: readonly ["command", "native", "repo", "web", "fetch", "code_search", "mcp", "provider", "derive", "other"];
export type ProducerKind = (typeof PRODUCER_KINDS)[number];
export declare const PERSISTENCE_STATUSES: readonly ["vaulted", "redacted", "metadata_only", "not_persisted"];
export type PersistenceStatus = (typeof PERSISTENCE_STATUSES)[number];
export declare const RECOVERABILITY_MODES: readonly ["exact", "redacted", "metadata_only", "none"];
export type RecoverabilityMode = (typeof RECOVERABILITY_MODES)[number];
export declare const ROUTER_FAILURE_KINDS: readonly ["adapter_unavailable", "unsupported_producer", "mutating_producer_rejected", "producer_execution_failure", "partial_capture", "storage_failure", "redaction_failure", "observed_routing_failure", "script_derive_disabled", "derive_source_unavailable", "derive_validation_failure", "derive_execution_failure"];
export type RouterFailureKind = (typeof ROUTER_FAILURE_KINDS)[number];
export declare const FAILURE_EXECUTION_STATUSES: readonly ["unavailable", "unsupported", "rejected", "failed", "partial"];
export type FailureExecutionStatus = (typeof FAILURE_EXECUTION_STATUSES)[number];
export declare const EVIDENCE_WINDOWS: readonly ["exact", "small", "lines_30", "lines_80", "section", "full"];
export type EvidenceWindow = (typeof EVIDENCE_WINDOWS)[number];
export declare const OUTPUT_STREAMS: readonly ["stdout", "stderr", "combined", "raw"];
export type OutputStream = (typeof OUTPUT_STREAMS)[number];
export declare const POST_TOOL_ROUTING_MODES: readonly ["off", "safety-net", "strict"];
export type PostToolRoutingMode = (typeof POST_TOOL_ROUTING_MODES)[number];
export declare const OUTPUT_ROUTER_PROFILES: readonly ["standard"];
export type OutputRouterProfile = (typeof OUTPUT_ROUTER_PROFILES)[number];
export declare const CAPTURE_FREEFLOW_MEDIATED_MODES: readonly ["raw"];
export type CaptureFreeflowMediatedMode = (typeof CAPTURE_FREEFLOW_MEDIATED_MODES)[number];
export declare const DIRECT_HOST_TOOL_CAPTURE_MODES: readonly ["off"];
export type DirectHostToolCaptureMode = (typeof DIRECT_HOST_TOOL_CAPTURE_MODES)[number];
export declare const PROVIDER_MODES: readonly ["discovery", "read-only"];
export type ProviderMode = (typeof PROVIDER_MODES)[number];
export declare const PROVIDER_CATEGORIES: readonly ["symbols", "references", "diagnostics", "graph", "architecture", "search"];
export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];
export declare const OBSERVED_ROUTING_FAILURE_MODES: readonly ["fail-open"];
export type ObservedRoutingFailureMode = (typeof OBSERVED_ROUTING_FAILURE_MODES)[number];
export declare const OBSERVED_ROUTING_PERSISTENCE_MODES: readonly ["exact", "metadata-only", "none"];
export type ObservedRoutingPersistenceMode = (typeof OBSERVED_ROUTING_PERSISTENCE_MODES)[number];
export declare const RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES: readonly ["redacted"];
export type ReservedObservedRoutingPersistenceMode = (typeof RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES)[number];
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
export interface ObservedHostDescriptor {
    name: string;
    toolName: string;
}
export declare const OBSERVED_PRODUCER_RISK_CLASSES: readonly ["read", "write", "unknown"];
export type ObservedProducerRiskClass = (typeof OBSERVED_PRODUCER_RISK_CLASSES)[number];
export declare const OBSERVED_PRODUCER_RISK_SOURCES: readonly ["configured", "mcp_annotation", "manifest", "heuristic", "unknown"];
export type ObservedProducerRiskSource = (typeof OBSERVED_PRODUCER_RISK_SOURCES)[number];
export interface ObservedProducerRisk {
    classification: ObservedProducerRiskClass;
    source: ObservedProducerRiskSource;
    reason: string;
}
export interface ObservedOutputNormalization {
    shape: "text" | "json" | "content_blocks" | "stdio" | "structured";
    mediaType?: string;
    byteCount: number;
    lineCount: number;
}
export interface ObservedRoutedResult extends RoutedResultBase {
    outputId?: string;
    host: ObservedHostDescriptor;
    normalized: ObservedOutputNormalization;
    risk?: ObservedProducerRisk;
    summary?: string;
    passthrough?: {
        text: string;
        reason: string;
    };
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
export type RoutedResult = RetrievalRoutedResult | CommandRoutedResult | CaptureRoutedResult | ObservedRoutedResult | DeriveRoutedResult | FailureRoutedResult;
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
    sourceKind: "native" | "mcp" | "web" | "fetch" | "code_search" | "derive" | "other";
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
export interface MetadataOutputRecord extends VaultRecordBase {
    kind: "metadata";
    sourceKind: TextOutputRecord["sourceKind"];
    paths: {
        meta: string;
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
    metadata?: Record<string, unknown>;
}
export type VaultRecord = CommandOutputRecord | TextOutputRecord | RepoFileReferenceRecord | MetadataOutputRecord;
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
    enabled: boolean;
    profile: OutputRouterProfile;
    postToolRouting: PostToolRoutingMode;
    thresholds: RouterThresholds;
    vault: RouterVaultConfig;
    hints?: RouterHints;
}
export interface CaptureConfig {
    freeflowMediated: CaptureFreeflowMediatedMode;
    directHostTools: DirectHostToolCaptureMode;
}
export interface ProviderEnablement {
    id: string;
    mode: ProviderMode;
    categories?: ProviderCategory[];
}
export interface ProvidersConfig {
    enabled: ProviderEnablement[];
}
export interface ObservedRoutingProducerConfig {
    enabled: boolean;
    persistence: ObservedRoutingPersistenceMode;
}
export interface ObservedRoutingMcpConfig {
    servers: Record<string, ObservedRoutingProducerConfig>;
}
export interface ObservedRoutingConfig {
    enabled: boolean;
    onRoutingFailure: ObservedRoutingFailureMode;
    mcp: ObservedRoutingMcpConfig;
    web: ObservedRoutingProducerConfig;
    fetch: ObservedRoutingProducerConfig;
    codeSearch: ObservedRoutingProducerConfig;
}
export type ScriptDeriveLanguage = "javascript" | "python" | "jq";
export type ScriptDeriveNetworkPolicy = "off";
export type ScriptDeriveSandboxMode = "auto";
export type ScriptDeriveRawScriptPersistence = "disabled";
export interface ScriptDeriveLimits {
    timeoutMs: number;
    maxInputBytes: number;
    maxOutputBytes: number;
}
export interface ScriptDeriveConfig {
    enabled: boolean;
    sandbox: ScriptDeriveSandboxMode;
    languages: ScriptDeriveLanguage[];
    network: ScriptDeriveNetworkPolicy;
    limits: ScriptDeriveLimits;
    rawScriptPersistence: ScriptDeriveRawScriptPersistence;
}
export interface FreeflowConfig {
    outputRouter: RouterConfig;
    capture: CaptureConfig;
    providers: ProvidersConfig;
    observedRouting: ObservedRoutingConfig;
    scriptDerive: ScriptDeriveConfig;
}

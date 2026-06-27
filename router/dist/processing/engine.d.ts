import { type ProcessingReducerSelection } from "./reducers.js";
import type { EvidenceLineage, EvidencePersistence, OutputStream, RecoveryHint, SourceRef, VaultRetentionPolicy } from "../config/types.js";
export declare const PROCESSING_ENGINE_IMPLEMENTATION = "processing-engine-skeleton-v1";
export interface ProcessingLimits {
    maxSourceBytes: number;
    maxVisibleBytes: number;
}
export interface ProcessingEngineOptions {
    sessionId?: string;
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    limits?: Partial<ProcessingLimits>;
}
export interface RepoFileProcessingSource {
    kind: "repo-file";
    root: string;
    path: string;
}
export interface VaultOutputProcessingSource {
    kind: "vault-output";
    sessionId: string;
    outputId: string;
    stream?: OutputStream;
    vaultRoot?: string;
}
export interface CapturedCommandOutputProcessingSource {
    kind: "command-output";
    stdout?: string;
    stderr?: string;
    combined?: string;
    stream?: Exclude<OutputStream, "raw">;
    outputId?: string;
}
export type ProcessingSourceInput = RepoFileProcessingSource | VaultOutputProcessingSource | CapturedCommandOutputProcessingSource;
export interface ProcessingSourceStats {
    bytes: number;
    lines: number;
    sha256: string;
}
export interface ProcessingSourceDescriptor {
    kind: ProcessingSourceInput["kind"];
    ref: SourceRef;
    displayPath: string;
    stream?: OutputStream;
}
export interface LoadedProcessingSource {
    status: "ok";
    source: ProcessingSourceDescriptor;
    text: string;
    stats: ProcessingSourceStats;
    lineage?: EvidenceLineage;
    persistence?: EvidencePersistence;
    recovery?: RecoveryHint;
}
export interface BlockedProcessingSource {
    status: "blocked";
    source: ProcessingSourceDescriptor;
    reason: string;
    policy: "repo_containment" | "source_limit";
    stats?: Pick<ProcessingSourceStats, "bytes">;
}
export interface UnavailableProcessingSource {
    status: "unavailable";
    source: ProcessingSourceDescriptor;
    reason: string;
}
export type ProcessingSourceLoadResult = LoadedProcessingSource | BlockedProcessingSource | UnavailableProcessingSource;
export interface ProcessingFact {
    name: string;
    value: string | number | boolean;
}
export type ReducerSelectionResult = ProcessingReducerSelection;
export interface ScriptPolicySelectionResult {
    status: "not_configured";
    reason: string;
}
export interface ProcessingResultBase {
    implementation: typeof PROCESSING_ENGINE_IMPLEMENTATION;
    source: ProcessingSourceDescriptor;
    visibleText: string;
    facts: ProcessingFact[];
    reducer: ReducerSelectionResult;
    script: ScriptPolicySelectionResult;
    lineage?: EvidenceLineage;
    persistence?: EvidencePersistence;
    recovery?: RecoveryHint;
}
export interface ProcessingOkResult extends ProcessingResultBase {
    status: "ok";
    stats: ProcessingSourceStats;
}
export interface ProcessingBlockedResult extends ProcessingResultBase {
    status: "blocked";
    reason: string;
    policy: BlockedProcessingSource["policy"];
}
export interface ProcessingUnavailableResult extends ProcessingResultBase {
    status: "unavailable";
    reason: string;
}
export type ProcessingResult = ProcessingOkResult | ProcessingBlockedResult | ProcessingUnavailableResult;
export declare function loadProcessingSource(source: ProcessingSourceInput, options?: ProcessingEngineOptions): Promise<ProcessingSourceLoadResult>;
export declare function processSource(source: ProcessingSourceInput, options?: ProcessingEngineOptions): Promise<ProcessingResult>;
export declare function isProcessingPathInsideRoot(root: string, absolutePath: string): boolean;

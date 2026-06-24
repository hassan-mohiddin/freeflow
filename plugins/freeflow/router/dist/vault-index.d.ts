import type { EvidencePersistence, OutputStream, ProducerDescriptor, VaultRecord } from "./types.js";
import type { VaultHandle } from "./vault.js";
export interface VaultIndexRecordMetadata {
    sessionId: string;
    stream?: OutputStream;
    hostToolName?: string;
    routingDecisionId?: string;
    summary?: string;
    tags?: readonly string[];
    extra?: Record<string, unknown>;
}
export interface VaultIndexQueryFilters {
    sessionId?: string;
    outputId?: string;
    recordKind?: VaultRecord["kind"];
    producerKind?: ProducerDescriptor["kind"];
    server?: string;
    tool?: string;
    hostToolName?: string;
    stream?: OutputStream;
    recoverability?: EvidencePersistence["recoverability"];
}
export interface VaultIndexQueryCaps {
    topK?: number;
    maxExcerptBytes?: number;
}
export interface VaultIndexMatch {
    entryId: string;
    outputId: string;
    recordId: string;
    sessionId: string;
    recordKind: VaultRecord["kind"];
    producer: ProducerDescriptor;
    stream?: OutputStream;
    recoverability: EvidencePersistence["recoverability"];
    chunkId: string;
    lineStart?: number;
    lineEnd?: number;
    excerpt: string;
    score: number;
    metadataOnly: boolean;
}
export interface VaultIndexQueryResult {
    query: string;
    matches: VaultIndexMatch[];
    totalIndexedEntries: number;
}
export interface VaultIndexRecordResult {
    indexed: boolean;
    outputId: string;
    entriesWritten: number;
    reason: string;
}
export interface VaultIndexDeleteExpiredOptions {
    now?: string;
    sessionId?: string;
}
export interface VaultIndexDeleteExpiredResult {
    removedEntries: number;
    remainingEntries: number;
}
export interface VaultIndexStatus {
    engine: string;
    root: string;
    available: boolean;
    degraded: boolean;
    stale: boolean;
    rebuildRecommended: boolean;
    entryCount: number;
    textEntryCount: number;
    metadataOnlyEntryCount: number;
    outputCount: number;
    lastIndexedAt?: string;
    lastError?: string;
}
export interface VaultIndexEngine {
    indexRecord(record: VaultRecord, text: string | undefined, metadata: VaultIndexRecordMetadata): Promise<VaultIndexRecordResult>;
    queryVault(query: string, filters?: VaultIndexQueryFilters, caps?: VaultIndexQueryCaps): Promise<VaultIndexQueryResult>;
    deleteExpired(options?: VaultIndexDeleteExpiredOptions): Promise<VaultIndexDeleteExpiredResult>;
    status(): Promise<VaultIndexStatus>;
}
interface LocalVaultIndexOptions {
    root: string;
    chunkLineCount?: number;
    chunkMaxBytes?: number;
    now?: () => string;
}
export declare function createLocalVaultIndex(vault: VaultHandle, options?: Partial<LocalVaultIndexOptions>): VaultIndexEngine;
export declare function recordVaultIndexFailure(vault: VaultHandle, error: unknown): Promise<void>;
export declare class LocalVaultIndex implements VaultIndexEngine {
    private readonly root;
    private readonly chunkLineCount;
    private readonly chunkMaxBytes;
    private readonly now;
    constructor(options: LocalVaultIndexOptions);
    indexRecord(record: VaultRecord, text: string | undefined, metadata: VaultIndexRecordMetadata): Promise<VaultIndexRecordResult>;
    queryVault(query: string, filters?: VaultIndexQueryFilters, caps?: VaultIndexQueryCaps): Promise<VaultIndexQueryResult>;
    deleteExpired(options?: VaultIndexDeleteExpiredOptions): Promise<VaultIndexDeleteExpiredResult>;
    recordFailure(error: unknown): Promise<void>;
    status(): Promise<VaultIndexStatus>;
    private entriesForRecord;
    private readState;
    private writeState;
    private statePath;
}
export {};

import { type VaultIndexQueryFilters } from "../vault/vault-index.js";
import type { EvidencePacket, EvidencePersistence, OutputStream, PreserveMode, ProducerDescriptor, RetrievalAction, RetrievalRoutedResult, VaultRecord } from "../config/types.js";
export interface RepoSearchSourceInput {
    kind: "repo";
    root: string;
    path?: string;
}
export interface VaultSearchSourceInput {
    kind: "vault";
    root: string;
    sessionId: string;
    outputId?: string;
    stream?: OutputStream;
    producerKind?: ProducerDescriptor["kind"];
    server?: string;
    tool?: string;
    hostToolName?: string;
    recordKind?: VaultRecord["kind"];
    recoverability?: EvidencePersistence["recoverability"];
}
export type SearchSourceInput = RepoSearchSourceInput | VaultSearchSourceInput;
export declare const FREEFLOW_SEARCH_ACTIONS: readonly ["query", "locate", "get", "retrieve", "expand", "explain", "transform"];
export type FreeflowSearchAction = (typeof FREEFLOW_SEARCH_ACTIONS)[number];
export declare function searchActionForRetrievalAction(action: RetrievalAction): FreeflowSearchAction;
export type RepoExpansion = "lines_30" | "lines_80" | "full";
export interface SearchLineRangeInput {
    start: number;
    end: number;
}
export interface FreeflowSearchOptions {
    action: RetrievalAction;
    source: SearchSourceInput;
    query?: string;
    preserve?: PreserveMode;
    evidence?: EvidencePacket;
    expansion?: RepoExpansion;
    maxFullBytes?: number;
    lineRange?: SearchLineRangeInput;
    topK?: number;
    decision?: RetrievalRoutedResult;
    generatedPathGlobs?: readonly string[];
    filters?: VaultIndexQueryFilters;
}
export declare function freeflowSearch(options: FreeflowSearchOptions): Promise<RetrievalRoutedResult>;

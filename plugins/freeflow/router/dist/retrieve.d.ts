import { type VaultIndexQueryFilters } from "./vault-index.js";
import type { EvidencePacket, EvidencePersistence, OutputStream, PreserveMode, ProducerDescriptor, RetrievalAction, RetrievalRoutedResult, VaultRecord } from "./types.js";
export interface RepoRetrieveSourceInput {
    kind: "repo";
    root: string;
    path?: string;
}
export interface VaultRetrieveSourceInput {
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
export type RetrieveSourceInput = RepoRetrieveSourceInput | VaultRetrieveSourceInput;
export type RepoExpansion = "lines_30" | "lines_80" | "full";
export interface RetrieveLineRangeInput {
    start: number;
    end: number;
}
export interface FreeflowRetrieveOptions {
    action: RetrievalAction;
    source: RetrieveSourceInput;
    query?: string;
    preserve?: PreserveMode;
    evidence?: EvidencePacket;
    expansion?: RepoExpansion;
    maxFullBytes?: number;
    lineRange?: RetrieveLineRangeInput;
    topK?: number;
    decision?: RetrievalRoutedResult;
    generatedPathGlobs?: readonly string[];
    filters?: VaultIndexQueryFilters;
}
export declare function freeflowRetrieve(options: FreeflowRetrieveOptions): Promise<RetrievalRoutedResult>;

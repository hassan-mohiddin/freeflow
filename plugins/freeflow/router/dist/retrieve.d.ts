import type { EvidencePacket, OutputStream, PreserveMode, RetrievalAction, RetrievalRoutedResult } from "./types.js";
export interface RepoRetrieveSourceInput {
    kind: "repo";
    root: string;
    path?: string;
}
export interface VaultRetrieveSourceInput {
    kind: "vault";
    root: string;
    sessionId: string;
    outputId: string;
    stream?: OutputStream;
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
}
export declare function freeflowRetrieve(options: FreeflowRetrieveOptions): Promise<RetrievalRoutedResult>;

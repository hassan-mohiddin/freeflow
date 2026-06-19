export interface EvidenceSearchLineRange {
    start: number;
    end: number;
}
export interface EvidenceSearchFile {
    path: string;
    lines: readonly string[];
}
export interface EvidenceSearchCandidate<TFile extends EvidenceSearchFile = EvidenceSearchFile> {
    file: TFile;
    lineIndex: number;
    score: number;
    reason: string;
    range?: EvidenceSearchLineRange;
    exactNormalizedPhrase?: string;
}
export interface SearchRepoEvidenceCandidatesOptions<TFile extends EvidenceSearchFile = EvidenceSearchFile> {
    files: readonly TFile[];
    query: string;
    topK: number;
    defaultContextLines?: number;
    queryCoverageMaxLines?: number;
}
export declare function searchRepoEvidenceCandidates<TFile extends EvidenceSearchFile>(options: SearchRepoEvidenceCandidatesOptions<TFile>): EvidenceSearchCandidate<TFile>[];
export declare function findBestLineForQuery(lines: readonly string[], query: string): number | null;

export interface RepoTextFileRef {
    path: string;
    absolutePath: string;
    sizeBytes: number;
}
export interface ResolvedRepoPath {
    root: string;
    absolutePath: string;
    relativePath: string;
}
export interface CollectRepoTextFileRefsOptions {
    root: string;
    requestedPath?: string;
    generatedPathGlobs?: readonly string[];
}
export declare function collectRepoTextFileRefs(options: CollectRepoTextFileRefsOptions): Promise<RepoTextFileRef[]>;
export declare function resolveRepoPath(root: string, requestedPath?: string): Promise<ResolvedRepoPath>;
export declare function matchesGeneratedPathGlob(path: string, pattern: string): boolean;

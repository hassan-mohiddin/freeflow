export interface LocalTextFileRef {
  root: string;
  path: string;
  absolutePath: string;
  sizeBytes: number;
}
export interface ResolvedLocalPath {
  root: string;
  absolutePath: string;
  relativePath: string;
}
export interface CollectLocalTextFileRefsOptions {
  root: string;
  requestedPath?: string;
  generatedPathGlobs?: readonly string[];
}
export declare function collectLocalTextFileRefs(options: CollectLocalTextFileRefsOptions): Promise<LocalTextFileRef[]>;
export declare function resolveLocalPath(root: string, requestedPath?: string): Promise<ResolvedLocalPath>;

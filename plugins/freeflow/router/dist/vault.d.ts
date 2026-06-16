import type { CommandOutputRecord, ExecutionStatus, OutputStream, RepoFileReferenceRecord, RouterVaultConfig, TextOutputRecord, VaultRecord, VaultRetentionPolicy, VaultSessionIndex } from "./types.js";
export interface VaultHandle {
    root: string;
    retention: VaultRetentionPolicy;
}
export interface CreateVaultOptions extends Partial<RouterVaultConfig> {
}
export interface StoreCommandOutputOptions {
    sessionId: string;
    command: string | readonly string[];
    stdout: string;
    stderr: string;
    executionStatus: ExecutionStatus;
    exitCode: number | null;
    combined?: string;
    cwd?: string;
    durationMs?: number;
    decisionIds?: string[];
    createdAt?: string;
}
export interface StoreTextOutputOptions {
    sessionId: string;
    raw: string;
    sourceKind: TextOutputRecord["sourceKind"];
    decisionIds?: string[];
    createdAt?: string;
}
export interface StoreRepoFileReferenceOptions {
    sessionId: string;
    path: string;
    hashSha256?: string;
    decisionIds?: string[];
    createdAt?: string;
}
export interface ReadOutputLinesOptions {
    sessionId: string;
    outputId: string;
    stream: OutputStream;
    startLine: number;
    endLine: number;
}
export declare function createVault(options?: CreateVaultOptions): VaultHandle;
export declare function resolveVaultRoot(root: string): string;
export declare function storeCommandOutput(vault: VaultHandle, options: StoreCommandOutputOptions): Promise<CommandOutputRecord>;
export declare function storeTextOutput(vault: VaultHandle, options: StoreTextOutputOptions): Promise<TextOutputRecord>;
export declare function storeRepoFileReference(vault: VaultHandle, options: StoreRepoFileReferenceOptions): Promise<RepoFileReferenceRecord>;
export declare function readVaultRecord(vault: VaultHandle, sessionId: string, outputId: string): Promise<VaultRecord>;
export declare function readOutputText(vault: VaultHandle, sessionId: string, outputId: string, stream: OutputStream): Promise<string>;
export declare function readOutputLines(vault: VaultHandle, options: ReadOutputLinesOptions): Promise<string>;
export declare function readSessionIndex(vault: VaultHandle, sessionId: string): Promise<VaultSessionIndex>;

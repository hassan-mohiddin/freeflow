import type { CaptureRoutedResult, FailureRoutedResult, PreserveMode, ProducerDescriptor, RouterThresholds, VaultRetentionPolicy } from "./types.js";
export interface CaptureInput {
    producer: ProducerDescriptor;
    args?: unknown;
    preserve?: PreserveMode;
}
export interface CaptureProducerContext {
    producer: ProducerDescriptor;
    args: unknown;
    signal?: AbortSignal;
}
export interface CaptureProducerResult {
    text: string;
    mediaType?: string;
    partial?: boolean;
}
export interface CaptureProducerAdapter {
    producer: ProducerDescriptor;
    readOnly: boolean;
    isAvailable?: () => boolean | Promise<boolean>;
    capture(context: CaptureProducerContext): Promise<CaptureProducerResult>;
}
export interface FreeflowCaptureOptions extends CaptureInput {
    sessionId: string;
    adapters: readonly CaptureProducerAdapter[];
    vaultRoot?: string;
    vaultRetention?: VaultRetentionPolicy;
    thresholds?: Partial<RouterThresholds>;
    signal?: AbortSignal;
}
export interface CaptureValidationIssue {
    path: string;
    message: string;
}
export type CaptureValidationResult = {
    ok: true;
    value: CaptureInput;
} | {
    ok: false;
    issues: CaptureValidationIssue[];
};
export declare function validateCaptureInput(value: unknown): CaptureValidationResult;
export declare function freeflowCapture(options: FreeflowCaptureOptions): Promise<CaptureRoutedResult | FailureRoutedResult>;

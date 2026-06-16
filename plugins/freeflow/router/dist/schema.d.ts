import { type CommandOutputRecord, type EvidencePacket, type PreserveMode, type RetrievalAction, type RoutedResult, type RouterConfig } from "./types.js";
export interface ValidationIssue {
    path: string;
    message: string;
}
export type ValidationResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    issues: ValidationIssue[];
};
export declare function validatePreserveMode(value: unknown): ValidationResult<PreserveMode>;
export declare function validateRetrievalAction(value: unknown): ValidationResult<RetrievalAction>;
export declare function validateEvidencePacket(value: unknown): ValidationResult<EvidencePacket>;
export declare function validateRoutedResult(value: unknown): ValidationResult<RoutedResult>;
export declare function validateRouterConfig(value: unknown): ValidationResult<RouterConfig>;
export declare function validateCommandOutputRecord(value: unknown): ValidationResult<CommandOutputRecord>;

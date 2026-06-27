import type { PostToolRoutingMode } from "./types.js";
export interface RouterContractIssue {
    path: string;
    message: string;
}
export declare function isValidPostToolRoutingMode(value: unknown): value is PostToolRoutingMode;
export declare function isNativeSafetyNetEnabled(value: unknown): boolean;
export declare function validatePositiveIntegerThreshold(value: unknown, path: string): RouterContractIssue[];
export declare function validateVaultRetentionPolicy(value: unknown, path: string): RouterContractIssue[];
export declare function validateNormalizedRouterHints(value: unknown, path: string): RouterContractIssue[];

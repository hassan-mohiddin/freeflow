import type { DelegationProfile, DelegationProfileDefinition, DelegationRole } from "./types.js";
export declare const DELEGATION_TOOL_NAMES: readonly ["delegate_task_init", "delegate_spawn", "delegate_status", "delegate_wait", "delegate_result", "delegate_send", "delegate_capture", "delegate_cancel", "delegate_close", "delegate_record_report"];
export declare const ROUTED_EVIDENCE_TOOL_NAMES: readonly ["freeflow_status", "freeflow_search", "freeflow_run"];
export declare const PARENT_TOOL_NAMES: readonly ["read", "bash", "edit", "write", "freeflow_status", "freeflow_search", "freeflow_run", "web_search", "fetch_content", "get_search_content", "mcp", "delegate_task_init", "delegate_spawn", "delegate_status", "delegate_wait", "delegate_result", "delegate_send", "delegate_capture", "delegate_cancel", "delegate_close", "delegate_record_report"];
export declare const WRITER_TOOL_NAMES: readonly ["read", "bash", "edit", "write", "freeflow_status", "freeflow_search", "freeflow_run"];
export declare const READ_ONLY_TOOL_NAMES: readonly ["read", "freeflow_status", "freeflow_search", "freeflow_run", "web_search", "fetch_content", "get_search_content", "mcp"];
export declare const CHECK_RUNNER_TOOL_NAMES: readonly ["read", "bash", "freeflow_status", "freeflow_search", "freeflow_run"];
export declare const PROFILE_REGISTRY: Record<DelegationProfile, DelegationProfileDefinition>;
export declare function listProfileDefinitions(): DelegationProfileDefinition[];
export declare function getProfileDefinition(profile: DelegationProfile): DelegationProfileDefinition;
export declare function resolveProfileForRole(role: DelegationRole, profile?: DelegationProfile): DelegationProfileDefinition;
export declare function isDelegationTool(toolName: string): boolean;
export declare function isLeafProfile(profile: DelegationProfile): boolean;
export declare function defaultDenySummaryForProfile(profile: DelegationProfile): string[];
export declare function defaultReturnProtocolForRole(role: DelegationRole): {
    returnProtocol: string[];
    returnFields: string[];
};
export declare function assertLeafProfilesDoNotIncludeDelegationTools(): void;

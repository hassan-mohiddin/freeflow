import type { DelegationProfile, DelegationProfileDefinition, DelegationRole } from "./types.js";
export declare const PARENT_CONTROL_TOOL_NAMES: readonly [
  "delegate_task_init",
  "delegate_route",
  "delegate_apply_route",
  "delegate_spawn",
  "delegate_send",
  "delegate_capture",
  "delegate_cancel",
  "delegate_close",
  "delegate_record_report",
  "delegate_update_execution_map",
];
export declare const ORCHESTRATOR_ONLY_TOOL_NAMES: readonly ["delegate_request_execution_authorization"];
export declare const CHILD_LIFECYCLE_TOOL_NAMES: readonly [
  "delegate_finish",
  "delegate_attention",
  "delegate_progress",
];
export declare const READ_RECOVERY_TOOL_NAMES: readonly [
  "delegate_status",
  "delegate_result",
  "delegate_inbox",
  "delegate_ack_alert",
  "delegate_ack_all",
  "delegate_user_attention",
];
export declare const DELEGATION_TOOL_NAMES: readonly [
  "delegate_task_init",
  "delegate_route",
  "delegate_apply_route",
  "delegate_spawn",
  "delegate_send",
  "delegate_capture",
  "delegate_cancel",
  "delegate_close",
  "delegate_record_report",
  "delegate_update_execution_map",
  "delegate_request_execution_authorization",
  "delegate_finish",
  "delegate_attention",
  "delegate_progress",
  "delegate_status",
  "delegate_result",
  "delegate_inbox",
  "delegate_ack_alert",
  "delegate_ack_all",
  "delegate_user_attention",
  "delegate_wait",
];
export declare const ROUTED_EVIDENCE_TOOL_NAMES: readonly ["freeflow_status", "freeflow_search", "freeflow_run"];
export declare const PARENT_TOOL_NAMES: readonly [
  "read",
  "bash",
  "edit",
  "write",
  "freeflow_status",
  "freeflow_search",
  "freeflow_run",
  "web_search",
  "fetch_content",
  "get_search_content",
  "mcp",
  ...(
    | "delegate_finish"
    | "delegate_task_init"
    | "delegate_route"
    | "delegate_apply_route"
    | "delegate_spawn"
    | "delegate_send"
    | "delegate_capture"
    | "delegate_cancel"
    | "delegate_close"
    | "delegate_record_report"
    | "delegate_update_execution_map"
    | "delegate_request_execution_authorization"
    | "delegate_attention"
    | "delegate_progress"
    | "delegate_status"
    | "delegate_result"
    | "delegate_inbox"
    | "delegate_ack_alert"
    | "delegate_ack_all"
    | "delegate_user_attention"
    | "delegate_wait"
  )[],
];
export declare const ORCHESTRATOR_TOOL_NAMES: readonly [
  "read",
  "bash",
  "edit",
  "write",
  "freeflow_status",
  "freeflow_search",
  "freeflow_run",
  "web_search",
  "fetch_content",
  "get_search_content",
  "mcp",
  ...(
    | "delegate_finish"
    | "delegate_task_init"
    | "delegate_route"
    | "delegate_apply_route"
    | "delegate_spawn"
    | "delegate_send"
    | "delegate_capture"
    | "delegate_cancel"
    | "delegate_close"
    | "delegate_record_report"
    | "delegate_update_execution_map"
    | "delegate_request_execution_authorization"
    | "delegate_attention"
    | "delegate_progress"
    | "delegate_status"
    | "delegate_result"
    | "delegate_inbox"
    | "delegate_ack_alert"
    | "delegate_ack_all"
    | "delegate_user_attention"
    | "delegate_wait"
  )[],
  "delegate_request_execution_authorization",
];
export declare const WRITER_TOOL_NAMES: readonly [
  "read",
  "bash",
  "edit",
  "write",
  "freeflow_status",
  "freeflow_search",
  "freeflow_run",
];
export declare const READ_ONLY_TOOL_NAMES: readonly [
  "read",
  "freeflow_status",
  "freeflow_search",
  "freeflow_run",
  "web_search",
  "fetch_content",
  "get_search_content",
  "mcp",
];
export declare const CHECK_RUNNER_TOOL_NAMES: readonly [
  "read",
  "bash",
  "freeflow_status",
  "freeflow_search",
  "freeflow_run",
];
export declare const PROFILE_REGISTRY: Record<DelegationProfile, DelegationProfileDefinition>;
export declare function listProfileDefinitions(): DelegationProfileDefinition[];
export declare function getProfileDefinition(profile: DelegationProfile): DelegationProfileDefinition;
export declare function resolveProfileForRole(
  role: DelegationRole,
  profile?: DelegationProfile,
): DelegationProfileDefinition;
export declare function isDelegationTool(toolName: string): boolean;
export declare function isParentControlDelegationTool(toolName: string): boolean;
export declare function isChildLifecycleDelegationTool(toolName: string): boolean;
export declare function isReadRecoveryDelegationTool(toolName: string): boolean;
export declare function isLeafProfile(profile: DelegationProfile): boolean;
export declare function defaultDenySummaryForProfile(profile: DelegationProfile): string[];
export declare function defaultReturnProtocolForRole(role: DelegationRole): {
  returnProtocol: string[];
  returnFields: string[];
};
export declare function returnProtocolForActiveTools(role: DelegationRole, activeTools: readonly string[]): string[];
export declare function assertLeafProfilesDoNotIncludeDelegationTools(): void;

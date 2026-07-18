export const PRESERVE_MODES = ["summary", "important", "full"];
export const RETRIEVAL_ACTIONS = ["query", "locate", "get", "retrieve", "expand", "explain"];
export const TOOL_STATUSES = ["ok", "error"];
export const EXECUTION_STATUSES = ["success", "failed", "timed_out", "cancelled"];
export const ROUTING_STATUSES = ["routed", "passed_through", "partial", "failed"];
export const ROUTE_KINDS = ["retrieve", "run", "transform", "batch", "observed", "safety-net", "pass-through"];
export const BATCH_STEP_KINDS = ["run", "search"];
export const PRODUCER_KINDS = ["command", "script", "native", "repo", "web", "fetch", "code_search", "mcp", "transform", "other"];
export const PERSISTENCE_STATUSES = ["vaulted", "redacted", "metadata_only", "not_persisted"];
export const RECOVERABILITY_MODES = ["exact", "redacted", "metadata_only", "none"];
export const ROUTER_FAILURE_KINDS = [
    "adapter_unavailable",
    "storage_failure",
    "observed_routing_failure",
    "script_transform_disabled",
    "transform_source_unavailable",
    "transform_validation_failure",
    "transform_execution_failure",
];
export const FAILURE_EXECUTION_STATUSES = ["unavailable", "unsupported", "rejected", "failed", "partial"];
export const EVIDENCE_WINDOWS = ["exact", "small", "lines_30", "lines_80", "section", "full"];
export const OUTPUT_STREAMS = ["stdout", "stderr", "combined", "raw"];
export const POST_TOOL_ROUTING_MODES = ["off", "safety-net", "strict"];
export const OUTPUT_ROUTER_PROFILES = ["standard"];
export const STORAGE_POLICY_MODES = ["store-everything", "hybrid-dedupe"];
export const OBSERVED_ROUTING_FAILURE_MODES = ["fail-open"];
export const OBSERVED_ROUTING_PERSISTENCE_MODES = ["exact", "metadata-only", "none"];
export const RESERVED_OBSERVED_ROUTING_PERSISTENCE_MODES = ["redacted"];
export const OBSERVED_PRODUCER_RISK_CLASSES = ["read", "write", "unknown"];
export const OBSERVED_PRODUCER_RISK_SOURCES = ["configured", "mcp_annotation", "manifest", "heuristic", "unknown"];

export const PRESERVE_MODES = ["summary", "important", "full"];
export const RETRIEVAL_ACTIONS = ["query", "locate", "retrieve", "expand", "explain"];
export const TOOL_STATUSES = ["ok", "error"];
export const EXECUTION_STATUSES = ["success", "failed", "timed_out", "cancelled"];
export const ROUTING_STATUSES = ["routed", "passed_through", "partial", "failed"];
export const ROUTE_KINDS = ["retrieve", "run", "capture", "derive", "safety-net", "pass-through"];
export const PRODUCER_KINDS = ["command", "native", "repo", "web", "fetch", "code_search", "mcp", "provider", "derive", "other"];
export const PERSISTENCE_STATUSES = ["vaulted", "redacted", "metadata_only", "not_persisted"];
export const RECOVERABILITY_MODES = ["exact", "redacted", "metadata_only", "none"];
export const ROUTER_FAILURE_KINDS = [
    "adapter_unavailable",
    "unsupported_producer",
    "mutating_producer_rejected",
    "producer_execution_failure",
    "partial_capture",
    "storage_failure",
    "redaction_failure",
    "derive_source_unavailable",
    "derive_validation_failure",
    "derive_execution_failure",
];
export const FAILURE_EXECUTION_STATUSES = ["unavailable", "unsupported", "rejected", "failed", "partial"];
export const EVIDENCE_WINDOWS = ["exact", "small", "lines_30", "lines_80", "section", "full"];
export const OUTPUT_STREAMS = ["stdout", "stderr", "combined", "raw"];
export const POST_TOOL_ROUTING_MODES = ["off", "safety-net", "strict"];
export const OUTPUT_ROUTER_PROFILES = ["standard"];
export const CAPTURE_FREEFLOW_MEDIATED_MODES = ["raw"];
export const DIRECT_HOST_TOOL_CAPTURE_MODES = ["off"];
export const PROVIDER_MODES = ["discovery", "read-only"];
export const PROVIDER_CATEGORIES = ["symbols", "references", "diagnostics", "graph", "architecture", "search"];

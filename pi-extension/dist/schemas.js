const STRING_SCHEMA = { type: "string" };
const PRESERVE_SCHEMA = { type: "string", enum: ["summary", "important", "full"] };
const SEARCH_ACTION_SCHEMA = {
    type: "string",
    enum: ["query", "locate", "get", "retrieve", "expand", "explain", "transform"],
};
const EXPANSION_SCHEMA = { type: "string", enum: ["lines_30", "lines_80", "full"] };
const STREAM_SCHEMA = { type: "string", enum: ["stdout", "stderr", "combined", "raw"] };
const RUN_FILTER_STREAM_SCHEMA = { type: "string", enum: ["stdout", "stderr", "combined"] };
const NON_EMPTY_STRING_SCHEMA = { type: "string", minLength: 1 };
const MAX_CONTEXT_LINES_SCHEMA = { type: "integer", minimum: 0, maximum: 20 };
const MAX_REGEX_MATCHES_SCHEMA = { type: "integer", minimum: 1, maximum: 1000 };
const MAX_GROUPS_SCHEMA = { type: "integer", minimum: 1, maximum: 1000 };
const MAX_LINES_PER_GROUP_SCHEMA = { type: "integer", minimum: 1, maximum: 1000 };
const MAX_DEDUPE_LINES_SCHEMA = { type: "integer", minimum: 1, maximum: 10000 };
const MAX_TOP_N_LIMIT_SCHEMA = { type: "integer", minimum: 1, maximum: 1000 };
const REGEX_FLAGS_SCHEMA = {
    type: "string",
    pattern: "^(?!.*([gimsu]).*\\1)[gimsu]*$",
    description: "Regex flags: g, i, m, s, or u, without duplicates. g is added internally for extraction.",
};
const JSON_POINTER_PATTERN = String.raw `^(?:|/(?:[^~/]|~[01])*(?:/(?:[^~/]|~[01])*)*)$`;
const JSON_PATH_PATTERN = String.raw `^\$(?:\.[A-Za-z_$][A-Za-z0-9_$-]*|\[(?:0|[1-9][0-9]*)\]|\["(?:[^"\\\u0000-\u001F]|\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4}))*"\])*$`;
const SCRIPT_LANGUAGE_SCHEMA = { type: "string", enum: ["javascript", "python", "jq"] };
const SCRIPT_LIMITS_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        timeoutMs: { type: "integer", minimum: 1, maximum: 30000 },
        maxInputBytes: { type: "integer", minimum: 1, maximum: 10485760 },
        maxOutputBytes: { type: "integer", minimum: 1, maximum: 1048576 },
    },
};
export const FREEFLOW_STATUS_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        action: {
            type: "string",
            enum: ["status", "doctor", "migration"],
            description: "Status view to render. migration is non-destructive and reports recommendations only.",
        },
    },
};
export const FREEFLOW_SEARCH_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        action: { ...SEARCH_ACTION_SCHEMA, description: "Search/retrieval action to perform, or transform to process a repo/vault source." },
        source: {
            type: "object",
            additionalProperties: false,
            properties: {
                kind: { type: "string", enum: ["repo", "vault"] },
                path: { ...STRING_SCHEMA, description: "Repo path for source.kind=repo." },
                outputId: { ...STRING_SCHEMA, description: "Vault output id for source.kind=vault. Optional for vault query/locate." },
                stream: { ...STREAM_SCHEMA, description: "Vault stream to read or filter." },
                producerKind: { type: "string", enum: ["command", "native", "repo", "web", "fetch", "code_search", "mcp", "provider", "derive", "other"], description: "Vault index producer-kind filter for source.kind=vault query/locate." },
                server: { ...STRING_SCHEMA, description: "Vault index MCP server filter for source.kind=vault query/locate." },
                tool: { ...STRING_SCHEMA, description: "Vault index MCP/tool filter for source.kind=vault query/locate." },
                hostToolName: { ...STRING_SCHEMA, description: "Vault index host-tool filter for source.kind=vault query/locate." },
                recordKind: { type: "string", enum: ["command", "text", "metadata", "repo-file"], description: "Vault record-kind filter for source.kind=vault query/locate." },
                recoverability: { type: "string", enum: ["exact", "redacted", "metadata_only", "none"], description: "Vault recoverability filter for source.kind=vault query/locate." },
            },
            required: ["kind"],
            description: "Source to search, retrieve, or transform. Repo root and vault session are supplied by Freeflow/Pi.",
        },
        query: { ...STRING_SCHEMA, description: "Text query for query/locate actions." },
        goal: { ...STRING_SCHEMA, description: "Goal for action=transform, such as log analysis, CSV summary, or test output processing." },
        script: {
            type: "object",
            additionalProperties: false,
            properties: {
                language: { ...SCRIPT_LANGUAGE_SCHEMA, description: "Processing script language." },
                code: { ...NON_EMPTY_STRING_SCHEMA, description: "Processing script code. Raw code is not persisted by default." },
                label: { ...NON_EMPTY_STRING_SCHEMA, description: "Optional script label." },
                alias: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$", description: "Input source alias exposed to the processing script." },
                policy: { type: "string", enum: ["sandboxed", "unsafe-unsandboxed"], description: "Script execution policy. unsafe-unsandboxed requires local-only opt-in and is visibly labeled." },
                limits: { ...SCRIPT_LIMITS_SCHEMA, description: "Script resource limits. They only tighten configured limits." },
            },
            required: ["language", "code"],
            description: "Optional programmable processing for action=transform. Sandboxed remains default; unsafe-unsandboxed requires .freeflow/local.json opt-in.",
        },
        operation: {
            type: "object",
            additionalProperties: false,
            properties: {
                kind: { type: "string", enum: ["regexFilter", "countMatches", "jsonExtract", "groupByRegex", "dedupe", "topN", "extractUrls", "extractCitations", "lineStats", "sizeStats", "script"], description: "Deterministic transform operation for action=transform over vaulted output, or sandboxed script transform." },
                pattern: { ...NON_EMPTY_STRING_SCHEMA, description: "Regex pattern for regexFilter, countMatches, groupByRegex, or regex-backed topN." },
                flags: REGEX_FLAGS_SCHEMA,
                pointer: { ...STRING_SCHEMA, pattern: JSON_POINTER_PATTERN, description: "JSON Pointer for jsonExtract." },
                path: { ...NON_EMPTY_STRING_SCHEMA, pattern: JSON_PATH_PATTERN, description: "JSON path for jsonExtract." },
                contextLines: MAX_CONTEXT_LINES_SCHEMA,
                maxMatches: MAX_REGEX_MATCHES_SCHEMA,
                group: NON_EMPTY_STRING_SCHEMA,
                maxGroups: MAX_GROUPS_SCHEMA,
                maxLinesPerGroup: MAX_LINES_PER_GROUP_SCHEMA,
                trim: { type: "boolean" },
                caseSensitive: { type: "boolean" },
                maxLines: MAX_DEDUPE_LINES_SCHEMA,
                limit: MAX_TOP_N_LIMIT_SCHEMA,
                sort: { type: "string", enum: ["text", "numeric"] },
                order: { type: "string", enum: ["asc", "desc"] },
                dedupe: { type: "boolean" },
                language: SCRIPT_LANGUAGE_SCHEMA,
                code: NON_EMPTY_STRING_SCHEMA,
                label: NON_EMPTY_STRING_SCHEMA,
            },
            required: ["kind"],
            description: "Optional deterministic transform operation for action=transform. Existing source raw output remains recoverable by lineage when available.",
        },
        sources: {
            type: "array",
            minItems: 1,
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    kind: { type: "string", enum: ["vault"] },
                    outputId: NON_EMPTY_STRING_SCHEMA,
                    stream: STREAM_SCHEMA,
                    alias: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" },
                },
                required: ["kind", "outputId", "alias"],
            },
            description: "Vault sources for action=transform operation.kind=script.",
        },
        limits: { ...SCRIPT_LIMITS_SCHEMA, description: "Processing or script transform resource limits." },
        filters: {
            type: "object",
            additionalProperties: false,
            properties: {
                producerKind: { type: "string", enum: ["command", "native", "repo", "web", "fetch", "code_search", "mcp", "provider", "derive", "other"] },
                server: STRING_SCHEMA,
                tool: STRING_SCHEMA,
                hostToolName: STRING_SCHEMA,
                stream: STREAM_SCHEMA,
                recordKind: { type: "string", enum: ["command", "text", "metadata", "repo-file"] },
                recoverability: { type: "string", enum: ["exact", "redacted", "metadata_only", "none"] },
            },
            description: "Vault index filters for source.kind=vault query/locate.",
        },
        preserve: { ...PRESERVE_SCHEMA, description: "Fidelity mode. Default: important." },
        evidence: {
            type: "object",
            additionalProperties: true,
            description: "Evidence packet from a previous freeflow_search result, used for expand.",
        },
        expansion: { ...EXPANSION_SCHEMA, description: "Expansion breadth for expand action." },
        maxFullBytes: { type: "number", description: "Cap for preserve=full before exact chunks are returned." },
        topK: { type: "number", description: "Number of ranked repo or vault candidates for query/locate. Defaults: query=1, locate=5; max 10." },
        lineRange: {
            type: "object",
            additionalProperties: false,
            properties: {
                start: { type: "number" },
                end: { type: "number" },
            },
            required: ["start", "end"],
            description: "Exact 1-based line range for vault retrieve.",
        },
        decision: {
            type: "object",
            additionalProperties: true,
            description: "Prior routed result to explain.",
        },
    },
    required: ["action"],
};
export const FREEFLOW_RUN_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        command: { ...STRING_SCHEMA, description: "Shell command to run through Pi's approved command runner." },
        cwd: { ...STRING_SCHEMA, description: "Working directory. Defaults to the current Pi cwd." },
        timeoutMs: { type: "number", description: "Optional timeout in milliseconds." },
        preserve: { ...PRESERVE_SCHEMA, description: "Fidelity mode. Default: important." },
        goal: { ...STRING_SCHEMA, description: "Goal such as verification, test, build, or search." },
        filters: {
            type: "object",
            additionalProperties: false,
            properties: {
                stream: { ...RUN_FILTER_STREAM_SCHEMA, description: "Output stream to filter. Defaults to Freeflow's selected routed stream." },
                include: { type: "array", items: NON_EMPTY_STRING_SCHEMA, description: "Regex patterns; keep lines matching any pattern." },
                exclude: { type: "array", items: NON_EMPTY_STRING_SCHEMA, description: "Regex patterns; drop lines matching any pattern after include filtering." },
                flags: REGEX_FLAGS_SCHEMA,
                head: { type: "integer", minimum: 1, description: "Keep the first N filtered lines." },
                tail: { type: "integer", minimum: 1, description: "Keep the last N filtered lines. With head, returns the union of both spans." },
                maxLines: { type: "integer", minimum: 1, description: "Maximum filtered lines to return." },
                maxBytes: { type: "integer", minimum: 1, description: "Maximum bytes of filtered evidence to return." },
            },
            description: "Declarative line filters applied after raw capture and before routed evidence is returned. Exact raw output remains recoverable.",
        },
        scriptFilter: {
            type: "object",
            additionalProperties: false,
            properties: {
                language: { ...SCRIPT_LANGUAGE_SCHEMA, description: "Sandboxed script language. Requires configured scriptDerive.enabled and a proof-backed adapter." },
                code: { ...NON_EMPTY_STRING_SCHEMA, description: "Script code. Raw code is not persisted by default." },
                label: { ...NON_EMPTY_STRING_SCHEMA, description: "Optional script filter label." },
                limits: { ...SCRIPT_LIMITS_SCHEMA, description: "Script resource limits. They only tighten configured scriptDerive defaults." },
            },
            required: ["language", "code"],
            description: "Sandboxed programmable filter over captured stdout/stderr/combined after raw command output is vaulted. No unsandboxed fallback is used.",
        },
    },
    required: ["command"],
};
export const FREEFLOW_BATCH_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        steps: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    id: { ...NON_EMPTY_STRING_SCHEMA, description: "Optional stable step id for matching results." },
                    kind: { type: "string", enum: ["run", "search"], description: "Freeflow-owned public operation kind. Steps are independent and run in parallel." },
                    input: { type: "object", additionalProperties: true, description: "Input for the selected Freeflow operation. Uses the same shape as freeflow_run or freeflow_search." },
                },
                required: ["kind", "input"],
            },
            description: "Independent Freeflow-owned steps to run in parallel. No sequencing or external tool orchestration in v1.",
        },
        queries: {
            type: "array",
            maxItems: 10,
            items: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 500 },
            description: "Optional independent query/fact requests to answer from completed child evidence handles.",
        },
        concurrency: { type: "integer", minimum: 1, maximum: 16, description: "Maximum number of independent steps to run at once. Default: 4." },
        preserve: { ...PRESERVE_SCHEMA, description: "Default fidelity mode for steps that do not set preserve." },
    },
    required: ["steps"],
};

const STRING_SCHEMA = { type: "string" };
const PRESERVE_SCHEMA = { type: "string", enum: ["summary", "important", "full"] };
const RETRIEVE_ACTION_SCHEMA = {
    type: "string",
    enum: ["query", "locate", "get", "retrieve", "expand", "explain"],
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
export const FREEFLOW_RETRIEVE_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        action: { ...RETRIEVE_ACTION_SCHEMA, description: "Retrieval action to perform." },
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
            description: "Source to retrieve from. Repo root and vault session are supplied by Freeflow/Pi.",
        },
        query: { ...STRING_SCHEMA, description: "Text query for query/locate actions." },
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
            description: "Evidence packet from a previous freeflow_retrieve result, used for expand.",
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
    required: ["action", "source"],
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
const DERIVE_SOURCE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        kind: { type: "string", enum: ["vault"] },
        outputId: { ...NON_EMPTY_STRING_SCHEMA, description: "Vault output id to derive from." },
        stream: { ...STREAM_SCHEMA, description: "Vault stream to read. Defaults by source record kind." },
    },
    required: ["kind", "outputId"],
    description: "Existing vaulted source evidence for deterministic derive operations.",
};
const SCRIPT_DERIVE_SOURCE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        kind: { type: "string", enum: ["vault"] },
        outputId: { ...NON_EMPTY_STRING_SCHEMA, description: "Vault output id to mount as script input." },
        stream: { ...STREAM_SCHEMA, description: "Vault stream to mount. Defaults by source record kind." },
        alias: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$", description: "Script input alias." },
    },
    required: ["kind", "outputId", "alias"],
    description: "Existing vaulted source evidence for operation.kind=script.",
};
const SCRIPT_DERIVE_LIMITS_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        timeoutMs: { type: "integer", minimum: 1, maximum: 30000 },
        maxInputBytes: { type: "integer", minimum: 1, maximum: 10485760 },
        maxOutputBytes: { type: "integer", minimum: 1, maximum: 1048576 },
    },
    description: "Script derive resource limits. They only tighten configured defaults.",
};
const DERIVE_OPERATION_KINDS = [
    "regexFilter",
    "countMatches",
    "jsonExtract",
    "groupByRegex",
    "dedupe",
    "topN",
    "extractUrls",
    "extractCitations",
    "lineStats",
    "sizeStats",
    "script",
];
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
                    kind: { type: "string", enum: ["run", "retrieve", "search", "derive", "transform"], description: "Freeflow-owned operation kind. Steps are independent and run in parallel." },
                    input: { type: "object", additionalProperties: true, description: "Input for the selected Freeflow operation. Uses the same shape as freeflow_run, freeflow_retrieve/search-compatible, or freeflow_derive/transform-compatible inputs." },
                },
                required: ["kind", "input"],
            },
            description: "Independent Freeflow-owned steps to run in parallel. No sequencing or external tool orchestration in v1.",
        },
        concurrency: { type: "integer", minimum: 1, maximum: 16, description: "Maximum number of independent steps to run at once. Default: 4." },
        preserve: { ...PRESERVE_SCHEMA, description: "Default fidelity mode for steps that do not set preserve." },
    },
    required: ["steps"],
};
export const FREEFLOW_DERIVE_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        source: DERIVE_SOURCE_SCHEMA,
        sources: {
            type: "array",
            minItems: 1,
            items: SCRIPT_DERIVE_SOURCE_SCHEMA,
            description: "Vault sources for operation.kind=script. Deterministic operations keep using source.",
        },
        operation: {
            type: "object",
            additionalProperties: false,
            properties: {
                kind: { type: "string", enum: DERIVE_OPERATION_KINDS, description: "Derive operation kind. script is disabled by default and requires a sandbox." },
                pattern: { ...NON_EMPTY_STRING_SCHEMA, description: "Regex pattern for regexFilter, countMatches, groupByRegex, or regex-backed topN. No arbitrary code is executed." },
                flags: REGEX_FLAGS_SCHEMA,
                pointer: {
                    ...STRING_SCHEMA,
                    pattern: JSON_POINTER_PATTERN,
                    description: "JSON Pointer for jsonExtract, such as /suite/failures/0/message. Empty string selects the full JSON document.",
                },
                path: {
                    ...NON_EMPTY_STRING_SCHEMA,
                    pattern: JSON_PATH_PATTERN,
                    description: "JSON path for jsonExtract, such as $.suite.stats.failed, $[0], or $[\"quoted.key\"].",
                },
                contextLines: { ...MAX_CONTEXT_LINES_SCHEMA, description: "Context lines around each regexFilter matching line." },
                maxMatches: { ...MAX_REGEX_MATCHES_SCHEMA, description: "Maximum matches for regexFilter, extractUrls, or extractCitations through Pi." },
                group: { ...NON_EMPTY_STRING_SCHEMA, description: "Capture group index or name for groupByRegex or topN. Numeric strings are treated as group indexes." },
                maxGroups: { ...MAX_GROUPS_SCHEMA, description: "Maximum groupByRegex groups returned." },
                maxLinesPerGroup: { ...MAX_LINES_PER_GROUP_SCHEMA, description: "Maximum sample lines per groupByRegex group." },
                trim: { type: "boolean", description: "Trim lines before dedupe comparison and return." },
                caseSensitive: { type: "boolean", description: "Whether dedupe comparison is case-sensitive. Default: true." },
                maxLines: { ...MAX_DEDUPE_LINES_SCHEMA, description: "Maximum unique dedupe lines returned." },
                limit: { ...MAX_TOP_N_LIMIT_SCHEMA, description: "Maximum topN lines returned." },
                sort: { type: "string", enum: ["text", "numeric"], description: "topN sort mode. Default: text." },
                order: { type: "string", enum: ["asc", "desc"], description: "topN sort order. Equal scores preserve source order." },
                dedupe: { type: "boolean", description: "Return each URL once for extractUrls." },
                language: { type: "string", enum: ["javascript", "python", "jq"], description: "Script derive language for operation.kind=script." },
                code: { ...NON_EMPTY_STRING_SCHEMA, description: "Script derive code for operation.kind=script. Raw code is not persisted by default." },
                label: { ...NON_EMPTY_STRING_SCHEMA, description: "Optional script derive label." },
            },
            required: ["kind"],
            description: "Operation to apply to existing evidence. Script operations are disabled by default and operation-specific constraints are validated by Freeflow before execution."
        },
        limits: SCRIPT_DERIVE_LIMITS_SCHEMA,
        preserve: { ...PRESERVE_SCHEMA, description: "Fidelity mode. Default: important." },
    },
    required: ["operation"],
};

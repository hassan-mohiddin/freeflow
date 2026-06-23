const STRING_SCHEMA = { type: "string" };
const PRESERVE_SCHEMA = { type: "string", enum: ["summary", "important", "full"] };
const RETRIEVE_ACTION_SCHEMA = {
  type: "string",
  enum: ["query", "locate", "retrieve", "expand", "explain"],
};
const EXPANSION_SCHEMA = { type: "string", enum: ["lines_30", "lines_80", "full"] };
const STREAM_SCHEMA = { type: "string", enum: ["stdout", "stderr", "combined", "raw"] };
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
const JSON_POINTER_PATTERN = String.raw`^(?:|/(?:[^~/]|~[01])*(?:/(?:[^~/]|~[01])*)*)$`;
const JSON_PATH_PATTERN = String.raw`^\$(?:\.[A-Za-z_$][A-Za-z0-9_$-]*|\[(?:0|[1-9][0-9]*)\]|\["(?:[^"\\\u0000-\u001F]|\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4}))*"\])*$`;

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
        outputId: { ...STRING_SCHEMA, description: "Vault output id for source.kind=vault." },
        stream: { ...STREAM_SCHEMA, description: "Vault stream to read." },
      },
      required: ["kind"],
      description: "Source to retrieve from. Repo root and vault session are supplied by Freeflow/Pi.",
    },
    query: { ...STRING_SCHEMA, description: "Text query for query/locate actions." },
    preserve: { ...PRESERVE_SCHEMA, description: "Fidelity mode. Default: important." },
    evidence: {
      type: "object",
      additionalProperties: true,
      description: "Evidence packet from a previous freeflow_retrieve result, used for expand.",
    },
    expansion: { ...EXPANSION_SCHEMA, description: "Expansion breadth for expand action." },
    maxFullBytes: { type: "number", description: "Cap for preserve=full before exact chunks are returned." },
    topK: { type: "number", description: "Number of ranked repo candidates for query/locate. Defaults: query=1, locate=5; max 10." },
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
  description: "Existing vaulted source evidence. Slice 5 supports vault sources only.",
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
];

export const FREEFLOW_DERIVE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    source: DERIVE_SOURCE_SCHEMA,
    operation: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: DERIVE_OPERATION_KINDS, description: "Deterministic derive operation kind." },
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
      },
      required: ["kind"],
      description: "Deterministic operation to apply to existing evidence. Operation-specific constraints are validated by Freeflow before execution.",
    },
    preserve: { ...PRESERVE_SCHEMA, description: "Fidelity mode. Default: important." },
  },
  required: ["source", "operation"],
};

export const FREEFLOW_CAPTURE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    producer: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["mcp"], description: "Producer kind. Currently exposes read-only MCP only." },
        server: { ...STRING_SCHEMA, description: "MCP server name. Currently supports serena." },
        tool: { ...STRING_SCHEMA, description: "MCP tool name. Use unprefixed Serena names such as get_symbols_overview." },
      },
      required: ["kind", "server", "tool"],
      description: "Read-only service/protocol producer to capture.",
    },
    args: {
      type: "object",
      additionalProperties: true,
      description: "Arguments passed to the read-only producer tool.",
    },
    preserve: { ...PRESERVE_SCHEMA, description: "Fidelity mode. Default: important." },
  },
  required: ["producer"],
};

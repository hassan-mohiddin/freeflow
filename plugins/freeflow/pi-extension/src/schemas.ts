const STRING_SCHEMA = { type: "string" };
const PRESERVE_SCHEMA = { type: "string", enum: ["summary", "important", "full"] };
const RETRIEVE_ACTION_SCHEMA = {
  type: "string",
  enum: ["query", "locate", "retrieve", "expand", "explain"],
};
const EXPANSION_SCHEMA = { type: "string", enum: ["lines_30", "lines_80", "full"] };
const STREAM_SCHEMA = { type: "string", enum: ["stdout", "stderr", "combined", "raw"] };
const NON_EMPTY_STRING_SCHEMA = { type: "string", minLength: 1 };
const NON_NEGATIVE_INTEGER_SCHEMA = { type: "integer", minimum: 0 };
const POSITIVE_INTEGER_SCHEMA = { type: "integer", minimum: 1 };
const MAX_CONTEXT_LINES_SCHEMA = { type: "integer", minimum: 0, maximum: 20 };
const MAX_REGEX_MATCHES_SCHEMA = { type: "integer", minimum: 1, maximum: 1000 };
const MAX_GROUPS_SCHEMA = { type: "integer", minimum: 1, maximum: 1000 };
const MAX_LINES_PER_GROUP_SCHEMA = { type: "integer", minimum: 1, maximum: 1000 };
const MAX_DEDUPE_LINES_SCHEMA = { type: "integer", minimum: 1, maximum: 10000 };
const MAX_TOP_N_LIMIT_SCHEMA = { type: "integer", minimum: 1, maximum: 1000 };
const MAX_EXTRACT_MATCHES_SCHEMA = { type: "integer", minimum: 1, maximum: 10000 };
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

const REGEX_OPERATION_PROPERTIES = {
  pattern: { ...NON_EMPTY_STRING_SCHEMA, description: "JavaScript regular expression pattern. No arbitrary code is executed." },
  flags: REGEX_FLAGS_SCHEMA,
};

export const FREEFLOW_DERIVE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    source: DERIVE_SOURCE_SCHEMA,
    operation: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { const: "regexFilter" },
            ...REGEX_OPERATION_PROPERTIES,
            contextLines: { ...MAX_CONTEXT_LINES_SCHEMA, description: "Context lines around each matching line." },
            maxMatches: { ...MAX_REGEX_MATCHES_SCHEMA, description: "Maximum regex matches to process." },
          },
          required: ["kind", "pattern"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { const: "countMatches" },
            ...REGEX_OPERATION_PROPERTIES,
          },
          required: ["kind", "pattern"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { const: "jsonExtract" },
            pointer: {
              ...STRING_SCHEMA,
              pattern: JSON_POINTER_PATTERN,
              description: "JSON Pointer such as /suite/failures/0/message. Empty string selects the full JSON document.",
            },
            path: {
              ...NON_EMPTY_STRING_SCHEMA,
              pattern: JSON_PATH_PATTERN,
              description: "Bounded JSON path subset such as $.suite.stats.failed, $[0], or $[\"quoted.key\"].",
            },
          },
          required: ["kind"],
          oneOf: [
            { required: ["pointer"], not: { required: ["path"] } },
            { required: ["path"], not: { required: ["pointer"] } },
          ],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { const: "groupByRegex" },
            ...REGEX_OPERATION_PROPERTIES,
            group: { anyOf: [NON_NEGATIVE_INTEGER_SCHEMA, NON_EMPTY_STRING_SCHEMA], description: "Capture group index or name. Default: 1." },
            maxGroups: { ...MAX_GROUPS_SCHEMA, description: "Maximum groups returned." },
            maxLinesPerGroup: { ...MAX_LINES_PER_GROUP_SCHEMA, description: "Maximum sample lines per group." },
          },
          required: ["kind", "pattern"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { const: "dedupe" },
            trim: { type: "boolean", description: "Trim lines before comparing and returning." },
            caseSensitive: { type: "boolean", description: "Whether line comparison is case-sensitive. Default: true." },
            maxLines: { ...MAX_DEDUPE_LINES_SCHEMA, description: "Maximum unique lines returned." },
          },
          required: ["kind"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { const: "topN" },
            limit: { ...MAX_TOP_N_LIMIT_SCHEMA, description: "Maximum lines returned." },
            ...REGEX_OPERATION_PROPERTIES,
            group: { anyOf: [NON_NEGATIVE_INTEGER_SCHEMA, NON_EMPTY_STRING_SCHEMA], description: "Capture group index or name used as score when pattern is present." },
            sort: { type: "string", enum: ["text", "numeric"], description: "Sort mode. Default: text." },
            order: { type: "string", enum: ["asc", "desc"], description: "Sort order. Equal scores preserve source order." },
          },
          required: ["kind", "limit"],
          allOf: [
            { anyOf: [{ not: { required: ["flags"] } }, { required: ["pattern"] }] },
            { anyOf: [{ not: { required: ["group"] } }, { required: ["pattern"] }] },
          ],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { const: "extractUrls" },
            dedupe: { type: "boolean", description: "Return each URL once." },
            maxMatches: { ...MAX_EXTRACT_MATCHES_SCHEMA, description: "Maximum URL matches to process." },
          },
          required: ["kind"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { const: "extractCitations" },
            maxMatches: { ...MAX_EXTRACT_MATCHES_SCHEMA, description: "Maximum citations returned." },
          },
          required: ["kind"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: { kind: { const: "lineStats" } },
          required: ["kind"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: { kind: { const: "sizeStats" } },
          required: ["kind"],
        },
      ],
      description: "Deterministic operation to apply to existing evidence.",
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

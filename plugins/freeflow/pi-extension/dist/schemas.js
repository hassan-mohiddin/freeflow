const STRING_SCHEMA = { type: "string" };
const PRESERVE_SCHEMA = { type: "string", enum: ["summary", "important", "full"] };
const RETRIEVE_ACTION_SCHEMA = {
    type: "string",
    enum: ["query", "locate", "retrieve", "expand", "explain"],
};
const EXPANSION_SCHEMA = { type: "string", enum: ["lines_30", "lines_80", "full"] };
const STREAM_SCHEMA = { type: "string", enum: ["stdout", "stderr", "combined", "raw"] };
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

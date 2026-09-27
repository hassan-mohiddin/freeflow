import { ToolProgressReporter } from "./progress.js";
import { renderToolRuntimeCall, renderToolRuntimeResult } from "./renderers.js";
export const DIRECT_TOOL_NAMES = ["freeflow_read", "freeflow_search", "freeflow_patch"];
const READ = { id: "project.readRanges", revision: "1" };
const PATHS = { id: "project.findPaths", revision: "1" };
const SEARCH = { id: "project.searchText", revision: "2" };
const PATCH = { id: "project.applyPatch", revision: "1" };
export function directOperation(name, input) {
  if (name === "freeflow_read") return { key: READ, input };
  if (name === "freeflow_patch") return { key: PATCH, input };
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("invalid_direct_input: Search requires a paths or text kind.");
  const { kind, ...parameters } = input;
  if (kind === "paths") return { key: PATHS, input: parameters };
  if (kind === "text") return { key: SEARCH, input: parameters };
  throw new Error("invalid_direct_input: Search kind must be paths or text.");
}
function inputSchema(runtime, key) {
  const descriptor = runtime.registry.describe(key);
  if (
    !descriptor?.available ||
    descriptor.contractVersion !== 2 ||
    descriptor.inputSchema === null ||
    typeof descriptor.inputSchema !== "object" ||
    Array.isArray(descriptor.inputSchema)
  )
    throw new Error(`v2_direct_unavailable: ${key.id}@${key.revision} is not registered.`);
  return structuredClone(descriptor.inputSchema);
}
function searchBranch(schema, kind) {
  return {
    ...schema,
    properties: { kind: { type: "string", enum: [kind] }, ...schema.properties },
    required: ["kind", ...schema.required],
  };
}
// Snapshot the exact registered revision schemas, not the mutable catalog generation.
export function directToolSchemas(runtime) {
  const paths = inputSchema(runtime, PATHS);
  const text = inputSchema(runtime, SEARCH);
  const pathBranch = searchBranch(paths, "paths");
  const textBranch = searchBranch(text, "text");
  return {
    freeflow_read: inputSchema(runtime, READ),
    freeflow_search: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...pathBranch.properties,
        ...textBranch.properties,
        kind: { type: "string", enum: ["paths", "text"] },
        query: text.properties.query,
      },
      required: ["kind"],
      oneOf: [pathBranch, textBranch],
    },
    freeflow_patch: inputSchema(runtime, PATCH),
  };
}
const descriptions = {
  freeflow_read:
    "Read up to four project files in one-based inclusive line ranges with optional expected SHA-256 revisions, a shared byte budget, and explicit unserved reasons. Use directly for focused reads; no catalog discovery required.",
  freeflow_search:
    "Find ignore-aware project paths (kind=paths) or contents (kind=text); text modes files/count/matches/context trade detail for size. Results identify coverage, continuation, backend and revisions; an empty limited result is not absence. Requires qualified PATH ripgrep.",
  freeflow_patch:
    "Plan or apply an update-only revision-bound Freeflow Patch v1. Supply every target revision; dryRun never writes. This is a mutation: load the Tool Execution method first, inspect partial/unknown file receipts, and never retry an unresolved effect blindly.",
};
// Call from an active host lifecycle event before a provider request, never during extension loading.
export function setDirectToolVisibility(pi, state, storeReady) {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function")
    throw new Error("v2_direct_unavailable: Active tool selection is unavailable.");
  const current = pi.getActiveTools();
  const ordinary = current.filter((name) => !DIRECT_TOOL_NAMES.includes(name));
  const next = storeReady && state()?.effective ? [...ordinary, ...DIRECT_TOOL_NAMES] : ordinary;
  if (JSON.stringify(current) !== JSON.stringify(next)) pi.setActiveTools(next);
}
export function registerDirectToolRuntimeTools(pi, state, runtime) {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function")
    throw new Error("v2_direct_unavailable: Active tool selection is unavailable.");
  const schemas = directToolSchemas(runtime);
  for (const name of DIRECT_TOOL_NAMES) {
    pi.registerTool({
      name,
      label: name.replace("freeflow_", "Freeflow "),
      description: descriptions[name],
      parameters: schemas[name],
      executionMode: "sequential",
      renderCall: (args, theme, context) => renderToolRuntimeCall(name, args, theme, context),
      renderResult: (result, options, theme, context) => renderToolRuntimeResult(name, result, options, theme, context),
      async execute(id, input, signal, update, ctx) {
        if (!state()?.effective) throw new Error(`${name} unavailable: Tool Execution is disabled.`);
        const progress = new ToolProgressReporter(update);
        try {
          progress.publish({ version: 1, tool: name, phase: "preparing", activity: `Admitting ${name}` }, true);
          return await runtime.invokeDirect(name, id, input, signal, ctx, progress);
        } finally {
          progress.flush();
          progress.close();
        }
      },
    });
  }
  // P5 owns calling setDirectToolVisibility after the session surface and store binding are known.
}

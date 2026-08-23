export { CONTEXT_REF_PREFIX, contextRefForEntry, entryIdFromContextRef } from "../freeflow-context/types.js";
export const CONTEXT_PROJECTION_ENTRY = "freeflow-context-projection";
export const CONTEXT_PROJECTION_VERSION = 1;
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function projectionCharacters(projection) {
  if (projection.mode === "full") return 0;
  return projection.retained?.length ?? 0;
}

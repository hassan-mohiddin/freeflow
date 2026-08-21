export const CONTEXT_PROJECTION_ENTRY = "freeflow-context-projection";
export const CONTEXT_REF_PREFIX = "ctx:";
export const CONTEXT_PROJECTION_VERSION = 1;
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function contextRefForEntry(entryId) {
  return `${CONTEXT_REF_PREFIX}${entryId}`;
}
export function entryIdFromContextRef(ref) {
  if (typeof ref !== "string" || !ref.startsWith(CONTEXT_REF_PREFIX)) return undefined;
  const entryId = ref.slice(CONTEXT_REF_PREFIX.length).trim();
  return entryId.length > 0 && !/[\r\n]/.test(entryId) ? entryId : undefined;
}
export function projectionCharacters(projection) {
  if (projection.mode === "full") return 0;
  return projection.retained?.length ?? 0;
}

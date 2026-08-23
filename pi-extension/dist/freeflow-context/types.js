export const CONTEXT_REF_PREFIX = "ctx:";
export function isFreeflowContextToolName(value) {
  return typeof value === "string" && value.trim() === "freeflow_context";
}
export function contextRefForEntry(entryId) {
  return `${CONTEXT_REF_PREFIX}${entryId}`;
}
export function entryIdFromContextRef(ref) {
  if (typeof ref !== "string" || !ref.startsWith(CONTEXT_REF_PREFIX)) return undefined;
  const entryId = ref.slice(CONTEXT_REF_PREFIX.length).trim();
  return entryId.length > 0 && !/[\r\n]/.test(entryId) ? entryId : undefined;
}

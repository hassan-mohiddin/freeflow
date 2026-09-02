import { entryIdFromContextRef, isContextControlToolName } from "./types.js";
function isFullyVisible(source, options) {
  if (options.contextControlEnabled === true) {
    return options.isSourceFullyProjected?.(source?.source.entryId ?? "") ?? true;
  }
  if (source?.kind !== "toolResult" || !options.contextVirtualizationEnabled) return true;
  return options.isSourceFullyProjected?.(source.source.entryId) ?? true;
}
function materializedRefs(entry) {
  const result = entry?.message?.details?.result ?? entry?.details?.result;
  if (!result || typeof result !== "object") return [];
  const refs = [];
  if (result.operation === "retrieve" && Array.isArray(result.items)) {
    refs.push(
      ...result.items.map((item) => entryIdFromContextRef(item?.ref)).filter((entryId) => entryId !== undefined),
    );
  }
  if (result.status === "recovered" && result.envelope?.source?.entryId) {
    refs.push(String(result.envelope.source.entryId));
  }
  if (result.status === "recovered-set" && Array.isArray(result.envelopes)) {
    refs.push(
      ...result.envelopes
        .map((envelope) => envelope?.source?.entryId)
        .filter((entryId) => typeof entryId === "string" && entryId.length > 0),
    );
  }
  return [...new Set(refs)];
}
export function buildContextVisibility(activeEntries, resolvedByEntryId, options) {
  const activeEntryIds = new Set();
  const visibleEntryIds = new Set();
  const visibleSourceIds = new Set();
  const materializedSourceIds = new Set();
  for (const entry of activeEntries) {
    if (typeof entry?.id !== "string") continue;
    activeEntryIds.add(entry.id);
    const source = resolvedByEntryId.get(entry.id);
    if (!isFullyVisible(source, options)) continue;
    visibleEntryIds.add(entry.id);
    if (source && source.kind !== "custom") visibleSourceIds.add(entry.id);
    if (source?.kind === "toolResult" && isContextControlToolName(source.message?.toolName)) {
      for (const entryId of materializedRefs(entry)) materializedSourceIds.add(entryId);
    }
  }
  return { activeEntryIds, visibleEntryIds, visibleSourceIds, materializedSourceIds };
}

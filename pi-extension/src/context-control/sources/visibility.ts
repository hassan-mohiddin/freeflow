import { entryIdFromContextRef, isContextControlToolName } from "./types.js";
import type { ContextVisibilityOptions, ContextVisibilitySnapshot, ResolvedContextEntry } from "./types.js";

export type { ContextVisibilityOptions, ContextVisibilitySnapshot } from "./types.js";

function isFullyVisible(source: ResolvedContextEntry | undefined, options: ContextVisibilityOptions): boolean {
  if (options.contextControlEnabled === true) {
    return options.isSourceFullyProjected?.(source?.source.entryId ?? "") ?? true;
  }
  if (source?.kind !== "toolResult" || !options.contextVirtualizationEnabled) return true;
  return options.isSourceFullyProjected?.(source.source.entryId) ?? true;
}

function materializedRefs(entry: any): string[] {
  const result = entry?.message?.details?.result ?? entry?.details?.result;
  if (!result || typeof result !== "object") return [];
  const refs: string[] = [];
  if (result.operation === "retrieve" && Array.isArray(result.items)) {
    refs.push(
      ...result.items
        .map((item: any) => entryIdFromContextRef(item?.ref))
        .filter((entryId: string | undefined): entryId is string => entryId !== undefined),
    );
  }
  if (result.status === "recovered" && result.envelope?.source?.entryId) {
    refs.push(String(result.envelope.source.entryId));
  }
  if (result.status === "recovered-set" && Array.isArray(result.envelopes)) {
    refs.push(
      ...result.envelopes
        .map((envelope: any) => envelope?.source?.entryId)
        .filter((entryId: unknown): entryId is string => typeof entryId === "string" && entryId.length > 0),
    );
  }
  return [...new Set(refs)];
}

export function buildContextVisibility(
  activeEntries: readonly any[],
  resolvedByEntryId: ReadonlyMap<string, ResolvedContextEntry>,
  options: ContextVisibilityOptions,
): ContextVisibilitySnapshot {
  const activeEntryIds = new Set<string>();
  const visibleEntryIds = new Set<string>();
  const visibleSourceIds = new Set<string>();
  const materializedSourceIds = new Set<string>();

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

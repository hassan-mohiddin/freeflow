import { ContextSourceResolver } from "./resolver.js";
import { buildContextVisibility } from "./visibility.js";
import { projectContextSource } from "./source-projector.js";
function messageKind(message) {
  if (message?.role === "user") return "user";
  if (message?.role === "assistant") return "assistant";
  if (message?.role === "toolResult") return "toolResult";
  if (message?.role === "summary" || typeof message?.summary === "string") return "summary";
  return undefined;
}
function toolCallIds(content) {
  if (!Array.isArray(content)) return [];
  return content
    .map((block) => (block && typeof block === "object" ? block : undefined))
    .filter((block) => block?.type === "toolCall" || block?.type === "tool_use")
    .map((block) => block.id)
    .filter((id) => typeof id === "string" && id.trim() !== "");
}
function normalizedText(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}
function projectedProviderText(message, kind) {
  const entry =
    kind === "summary"
      ? { id: "provider-message", summary: typeof message?.summary === "string" ? message.summary : undefined }
      : { id: "provider-message" };
  const source = {
    kind,
    entry,
    ...(message === undefined ? {} : { message }),
    source: {
      sessionId: "provider-message",
      entryId: "provider-message",
      ...(typeof message?.toolCallId === "string" ? { toolCallId: message.toolCallId } : {}),
      ...(typeof message?.toolName === "string" ? { toolName: message.toolName } : {}),
    },
  };
  const projected = projectContextSource(source, { includeContextControlResults: true });
  return projected.status === "eligible" ? projected.source.text : undefined;
}
export class ContextSourceRuntime {
  resolver;
  generation = 0;
  latestRequestSnapshot;
  constructor(ctx) {
    this.resolver = new ContextSourceResolver(ctx);
  }
  setContext(ctx) {
    this.resolver.setContext(ctx);
  }
  sessionId() {
    return this.resolver.sessionId();
  }
  branchLeafId() {
    return this.resolver.branchLeafId();
  }
  branchEntries() {
    return this.resolver.branchEntries();
  }
  resolveCurrent(ref) {
    return this.resolver.resolveCurrent(ref);
  }
  recordRequest(refs) {
    this.generation += 1;
    this.latestRequestSnapshot = {
      generation: this.generation,
      sessionId: this.sessionId(),
      branchLeafId: this.branchLeafId(),
      refs,
    };
    return this.latestRequestSnapshot;
  }
  clearRequest() {
    this.latestRequestSnapshot = undefined;
  }
  latestRequest() {
    return this.latestRequestSnapshot;
  }
  sourceForProviderMessage(message, snapshot) {
    const kind = messageKind(message);
    if (kind === undefined || kind === "custom") return undefined;
    const candidates = [...snapshot.entries.values()].filter((source) =>
      snapshot.activeEntryIds.has(source.source.source.entryId),
    );
    const kindCandidates = candidates.filter((source) => source.kind === kind);
    if (kindCandidates.length === 0) return undefined;
    if (kind === "toolResult") {
      if (typeof message?.toolCallId !== "string") return undefined;
      const matches = kindCandidates.filter((source) => source.source.source.toolCallId === message.toolCallId);
      return matches.length === 1 ? matches[0] : undefined;
    }
    if (kind === "assistant") {
      const ids = toolCallIds(message?.content);
      if (ids.length > 0) {
        const matches = kindCandidates.filter((source) => {
          const canonicalIds = toolCallIds(source.source.message?.content);
          return ids.every((id) => canonicalIds.includes(id));
        });
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) return undefined;
      }
    }
    const text = projectedProviderText(message, kind);
    if (text === undefined) return undefined;
    const matches = kindCandidates.filter((source) => normalizedText(source.text) === normalizedText(text));
    return matches.length === 1 ? matches[0] : undefined;
  }
  captureSnapshot(options) {
    const branchEntries = this.resolver.branchEntries();
    const activeEntries = this.resolver.activeContextEntriesStrict();
    const sessionId = this.sessionId();
    const resolvedByEntryId = this.resolver.resolvedEntriesById(branchEntries, sessionId);
    const visibility = buildContextVisibility(activeEntries, resolvedByEntryId, options);
    const entries = new Map();
    let skippedEntries = 0;
    for (let position = 0; position < branchEntries.length; position += 1) {
      const entry = branchEntries[position];
      if (typeof entry?.id !== "string") continue;
      const resolved = resolvedByEntryId.get(entry.id);
      if (!resolved) continue;
      const outcome = projectContextSource(
        { ...resolved, entry: { ...resolved.entry, position } },
        { includeContextControlResults: options.includeContextControlResults },
      );
      if (outcome.status === "eligible") entries.set(outcome.source.ref, outcome.source);
      else if (
        outcome.status === "invalid" &&
        !visibility.visibleSourceIds.has(entry.id) &&
        !visibility.materializedSourceIds.has(entry.id)
      ) {
        skippedEntries += 1;
      }
    }
    const generation = this.latestRequestSnapshot?.generation ?? ++this.generation;
    return {
      generation,
      sessionId,
      branchLeafId: this.branchLeafId(),
      activeEntryIds: visibility.activeEntryIds,
      visibleEntryIds: visibility.visibleEntryIds,
      visibleSourceIds: visibility.visibleSourceIds,
      materializedSourceIds: visibility.materializedSourceIds,
      skippedEntries,
      entries,
    };
  }
}

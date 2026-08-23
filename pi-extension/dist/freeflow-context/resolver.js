import { entryIdFromContextRef } from "./types.js";
export function isToolResultEntry(entry) {
  return entry?.type === "message" && entry?.message?.role === "toolResult";
}
export class ContextSourceResolver {
  ctx;
  constructor(ctx) {
    this.ctx = ctx;
  }
  setContext(ctx) {
    this.ctx = ctx;
  }
  sessionId() {
    const value = this.ctx?.sessionManager?.getSessionId?.() ?? this.ctx?.sessionId ?? this.ctx?.cwd ?? "current";
    return String(value);
  }
  branchLeafId() {
    try {
      return this.ctx?.sessionManager?.getLeafId?.();
    } catch {
      return undefined;
    }
  }
  branchEntries() {
    const entries = this.ctx?.sessionManager?.getBranch?.() ?? this.ctx?.sessionManager?.getEntries?.() ?? [];
    return Array.isArray(entries) ? entries : [];
  }
  activeContextEntries() {
    try {
      const entries = this.ctx?.sessionManager?.buildContextEntries?.() ?? this.branchEntries();
      return Array.isArray(entries) ? entries : [];
    } catch {
      return this.branchEntries();
    }
  }
  activeContextEntriesStrict() {
    const manager = this.ctx?.sessionManager;
    if (typeof manager?.buildContextEntries !== "function") return this.branchEntries();
    const entries = manager.buildContextEntries();
    if (!Array.isArray(entries)) throw new Error("active_context_entries_unavailable");
    return entries;
  }
  resolvedEntriesById(entries = this.branchEntries(), sessionId = this.sessionId()) {
    const result = new Map();
    for (const entry of entries) {
      const resolved = this.entryFromSessionEntry(entry, sessionId);
      if (resolved) result.set(resolved.source.entryId, resolved);
    }
    return result;
  }
  toolResultSources(entries = this.branchEntries(), sessionId = this.sessionId()) {
    const grouped = new Map();
    for (const entry of entries) {
      const source = this.sourceFromEntry(entry, sessionId);
      if (!source) continue;
      const group = grouped.get(source.source.toolCallId) ?? [];
      group.push(source);
      grouped.set(source.source.toolCallId, group);
    }
    const unique = new Map();
    for (const [toolCallId, sources] of grouped) {
      if (sources.length === 1) unique.set(toolCallId, sources[0]);
    }
    return unique;
  }
  sourcesByEntryId(entries = this.branchEntries(), sessionId = this.sessionId()) {
    const result = new Map();
    for (const source of this.toolResultSources(entries, sessionId).values()) {
      result.set(source.source.entryId, source);
    }
    return result;
  }
  activeToolResultIds() {
    const ids = new Set();
    for (const entry of this.activeContextEntries()) {
      if (isToolResultEntry(entry) && typeof entry.id === "string") ids.add(entry.id);
    }
    return ids;
  }
  resolveCurrent(ref) {
    const entryId = entryIdFromContextRef(ref);
    if (!entryId) return undefined;
    const entry = this.branchEntries().find((candidate) => candidate?.id === entryId);
    return entry ? this.entryFromSessionEntry(entry, this.sessionId()) : undefined;
  }
  sourceFromEntry(entry, sessionId) {
    const resolved = this.entryFromSessionEntry(entry, sessionId);
    return resolved?.kind === "toolResult" ? resolved : undefined;
  }
  entryFromSessionEntry(entry, sessionId) {
    if (!entry || typeof entry.id !== "string") return undefined;
    const kind = this.kindForEntry(entry);
    if (!kind) return undefined;
    const message = entry.message;
    const toolCallId =
      kind === "toolResult" && typeof message?.toolCallId === "string" ? message.toolCallId : undefined;
    return {
      kind,
      entry,
      ...(message ? { message } : {}),
      source: {
        sessionId,
        entryId: entry.id,
        ...(toolCallId ? { toolCallId } : {}),
        ...(typeof message?.toolName === "string" ? { toolName: message.toolName } : {}),
      },
    };
  }
  kindForEntry(entry) {
    if (entry.type === "custom") return "custom";
    if (entry.type === "compaction" || entry.type === "branch_summary") return "summary";
    if (entry.type !== "message") return undefined;
    if (entry.message?.role === "user") return "user";
    if (entry.message?.role === "assistant") return "assistant";
    if (entry.message?.role === "toolResult") return "toolResult";
    if (entry.message?.role === "custom") return "custom";
    if (entry.message?.role === "branchSummary" || entry.message?.role === "compactionSummary") return "summary";
    return undefined;
  }
}

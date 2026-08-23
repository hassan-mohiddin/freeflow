import { FreeflowContextRuntime } from "../freeflow-context/runtime.js";
import { contextRefForEntry, entryIdFromContextRef } from "../freeflow-context/types.js";
import { focusedWindow } from "./ranking.js";
import { searchConversationEntries } from "./search.js";
import { tokenize, unique } from "./passages.js";
const MAX_QUERY_CHARACTERS = 500;
const MAX_QUERY_TERMS = 32;
const MAX_TOOL_NAMES = 8;
const MAX_TOOL_NAME_CHARACTERS = 128;
const MAX_REF_CHARACTERS = 256;
const MAX_FOCUS_CHARACTERS = 500;
const MAX_RETRIEVE_REFS = 3;
const MAX_SOURCE_CHARACTERS = 8_000;
const MAX_TOTAL_RETRIEVED_CHARACTERS = 24_000;
const VALID_KINDS = new Set(["user", "assistant", "toolResult", "summary"]);
function normalizedTerms(value) {
  return unique(tokenize(value));
}
function failure(operation, reason, message) {
  return {
    status: "rejected",
    operation,
    reason: reason.slice(0, 64),
    ...(message ? { message: message.slice(0, 500) } : {}),
  };
}
function unavailable(operation, reason = "conversation_history_unavailable") {
  return { status: "unavailable", operation, reason: reason.slice(0, 64) };
}
function sourceMetadata(source) {
  return {
    ref: source.ref,
    kind: source.kind,
    ...(source.toolNames
      ? {
          toolNames: source.toolNames.slice(0, MAX_TOOL_NAMES),
          ...(source.toolNames.length > MAX_TOOL_NAMES ? { toolNamesTruncated: true } : {}),
        }
      : {}),
    ...(source.isError === undefined ? {} : { isError: source.isError }),
    timestamp: source.timestamp.slice(0, 64),
  };
}
export class ConversationHistoryRuntime {
  ctx;
  freeflowContext;
  isSourceFullyProjected;
  snapshot;
  available = true;
  unavailableReason;
  constructor(ctx, isSourceFullyProjected = () => true, freeflowContext = new FreeflowContextRuntime(ctx)) {
    this.ctx = ctx;
    this.isSourceFullyProjected = isSourceFullyProjected;
    this.freeflowContext = freeflowContext;
  }
  setContext(ctx) {
    this.ctx = ctx;
    this.freeflowContext.setContext(ctx);
  }
  capture(contextVirtualizationEnabled = false) {
    try {
      this.freeflowContext.setContext(this.ctx);
      this.snapshot = this.freeflowContext.captureSnapshot({
        contextVirtualizationEnabled,
        isSourceFullyProjected: this.isSourceFullyProjected,
      });
      this.available = true;
      this.unavailableReason = undefined;
      return true;
    } catch (error) {
      this.snapshot = undefined;
      this.available = false;
      this.unavailableReason = error instanceof Error ? error.message : String(error);
      return false;
    }
  }
  async search(params) {
    if (!this.available || !this.snapshot) return unavailable("search", this.unavailableReason);
    const validation = this.validateSearch(params);
    if (validation) return validation;
    const query = params.query.trim();
    const hidden = [...this.snapshot.entries.values()].filter(
      (entry) =>
        !this.snapshot?.visibleSourceIds.has(entry.source.source.entryId) &&
        !this.snapshot?.materializedSourceIds.has(entry.source.source.entryId),
    );
    if (hidden.length === 0) {
      if (this.snapshot.skippedEntries === 0) return failure("search", "no_hidden_conversation_history");
      return {
        status: "ok",
        operation: "search",
        query,
        coverage: "partial",
        skippedEntries: this.snapshot.skippedEntries,
        returned: 0,
        truncated: false,
        hits: [],
      };
    }
    const result = searchConversationEntries(hidden, {
      query,
      kinds: params.kinds,
      toolNames: Array.isArray(params.toolNames)
        ? params.toolNames.map((name) => (typeof name === "string" ? name.trim() : ""))
        : undefined,
      limit: params.limit,
    });
    return {
      status: "ok",
      operation: "search",
      query,
      coverage: this.snapshot.skippedEntries > 0 ? "partial" : "complete",
      ...(this.snapshot.skippedEntries > 0 ? { skippedEntries: this.snapshot.skippedEntries } : {}),
      returned: result.returned,
      truncated: result.truncated,
      hits: result.hits,
    };
  }
  async retrieve(params) {
    if (!this.available || !this.snapshot) return unavailable("retrieve", this.unavailableReason);
    const refs = params.refs;
    if (!Array.isArray(refs) || refs.length < 1 || refs.length > MAX_RETRIEVE_REFS) {
      return failure("retrieve", "refs_count_invalid");
    }
    if (refs.some((ref) => typeof ref !== "string" || ref.length > MAX_REF_CHARACTERS)) {
      return failure("retrieve", "ref_invalid");
    }
    const canonicalRefs = refs.map((ref) => {
      const entryId = entryIdFromContextRef(ref);
      return entryId ? contextRefForEntry(entryId) : undefined;
    });
    if (canonicalRefs.some((ref) => ref === undefined)) return failure("retrieve", "ref_invalid");
    const uniqueRefs = canonicalRefs;
    if (new Set(uniqueRefs).size !== uniqueRefs.length) return failure("retrieve", "duplicate_ref");
    const focus = params.focus;
    if (
      focus !== undefined &&
      (typeof focus !== "string" || focus.trim().length === 0 || focus.length > MAX_FOCUS_CHARACTERS)
    ) {
      return failure("retrieve", "focus_invalid");
    }
    const items = [];
    let total = 0;
    for (const ref of uniqueRefs) {
      const entryId = entryIdFromContextRef(ref);
      const source = entryId ? this.snapshot.entries.get(contextRefForEntry(entryId)) : undefined;
      if (!source) return failure("retrieve", "reference_unresolved");
      if (this.snapshot.visibleSourceIds.has(entryId) || this.snapshot.materializedSourceIds.has(entryId)) {
        return failure("retrieve", "source_visible");
      }
      const sourceCharacters = source.text.length;
      let content = source.text;
      let completeness = "complete";
      if (sourceCharacters > MAX_SOURCE_CHARACTERS) {
        if (typeof focus !== "string") return failure("retrieve", "focus_required_for_oversized_source");
        const focused = focusedWindow(source.text, focus.trim(), MAX_SOURCE_CHARACTERS);
        if (focused === undefined) return failure("retrieve", "focus_no_match");
        content = focused;
        completeness = "partial";
      }
      if (total + content.length > MAX_TOTAL_RETRIEVED_CHARACTERS)
        return failure("retrieve", "retrieval_budget_exceeded");
      total += content.length;
      items.push({
        ...sourceMetadata(source),
        content,
        completeness,
        sourceCharacters,
        returnedCharacters: content.length,
      });
    }
    return { status: "ok", operation: "retrieve", items };
  }
  validateSearch(params) {
    if (typeof params.query !== "string" || params.query.trim().length === 0)
      return failure("search", "query_required");
    if (params.query.length > MAX_QUERY_CHARACTERS) return failure("search", "query_too_long");
    if (normalizedTerms(params.query).length > MAX_QUERY_TERMS) return failure("search", "query_terms_too_many");
    if (params.kinds !== undefined) {
      if (!Array.isArray(params.kinds) || params.kinds.length < 1 || params.kinds.length > 4)
        return failure("search", "kinds_invalid");
      if (
        new Set(params.kinds).size !== params.kinds.length ||
        params.kinds.some((kind) => typeof kind !== "string" || !VALID_KINDS.has(kind))
      ) {
        return failure("search", "kinds_invalid");
      }
    }
    if (params.toolNames !== undefined) {
      if (!Array.isArray(params.toolNames) || params.toolNames.length < 1 || params.toolNames.length > MAX_TOOL_NAMES)
        return failure("search", "tool_names_invalid");
      const normalizedNames = params.toolNames.map((name) => (typeof name === "string" ? name.trim() : ""));
      if (
        params.toolNames.some((name) => typeof name !== "string") ||
        new Set(normalizedNames.map((name) => name.toLocaleLowerCase())).size !== normalizedNames.length ||
        normalizedNames.some((name) => name.length === 0 || name.length > MAX_TOOL_NAME_CHARACTERS)
      ) {
        return failure("search", "tool_names_invalid");
      }
    }
    if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 20)) {
      return failure("search", "limit_invalid");
    }
    return undefined;
  }
}

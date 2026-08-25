import {
  CONTEXT_PROJECTION_ENTRY,
  CONTEXT_PROJECTION_VERSION,
  contextRefForEntry,
  entryIdFromContextRef,
} from "./types.js";
import { FreeflowContextRuntime } from "../freeflow-context/runtime.js";
import { contentCharacters, projectToolResultMessage, projectedCharacters } from "./projector.js";
import { replayProjectionEntries } from "./state.js";
function cloneSource(source) {
  return { ...source };
}
function sourceProjection(state) {
  if (!state || state.mode === "full") return { mode: "full" };
  return state.retained === undefined ? { mode: "archived" } : { mode: "archived", retained: state.retained };
}
function safeJsonEqual(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}
function isDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}
export class ContextVirtualizationRuntime {
  pi;
  freeflowContext;
  ctx;
  sessionId = "current";
  branchLeafId;
  projectionState = new Map();
  available = true;
  unavailableReason;
  mutationQueue = Promise.resolve();
  constructor(pi, ctx, freeflowContext = new FreeflowContextRuntime(ctx)) {
    this.pi = pi;
    this.ctx = ctx;
    this.freeflowContext = freeflowContext;
  }
  setContext(ctx) {
    this.ctx = ctx;
    this.freeflowContext.setContext(ctx);
  }
  async recover(ctx = this.ctx, options = {}) {
    this.ctx = ctx;
    this.freeflowContext.setContext(ctx);
    try {
      this.sessionId = this.freeflowContext.sessionId();
      this.branchLeafId = this.freeflowContext.branchLeafId();
      this.projectionState = replayProjectionEntries(this.freeflowContext.branchEntries(), this.sessionId);
      if (!options.preserveRequest) this.freeflowContext.clearRequest();
      this.available = true;
      this.unavailableReason = undefined;
      return true;
    } catch (error) {
      this.available = false;
      this.unavailableReason = error instanceof Error ? error.message : String(error);
      this.freeflowContext.clearRequest();
      return false;
    }
  }
  isAvailable() {
    return this.available;
  }
  isSourceFullyProjected(entryId) {
    if (!this.available) return true;
    const projection = this.projectionState.get(entryId);
    return !projection || projection.mode === "full";
  }
  async project(messages, enabled) {
    if (!enabled) {
      this.freeflowContext.clearRequest();
      return { messages, changed: false, available: true };
    }
    if (!(await this.recover(this.ctx))) {
      return { messages, changed: false, available: false };
    }
    const sourcesByToolCallId = this.freeflowContext.resolver.toolResultSources();
    const refs = new Map();
    let changed = false;
    const projected = messages.map((message) => {
      if (message?.role !== "toolResult" || typeof message.toolCallId !== "string") return message;
      const source = sourcesByToolCallId.get(message.toolCallId);
      if (!source) return message;
      const ref = contextRefForEntry(source.source.entryId);
      refs.set(ref, source);
      const state = this.projectionState.get(source.source.entryId);
      const projection = sourceProjection(state);
      const nextMessage = projectToolResultMessage(message, source.source, projection);
      if (!safeJsonEqual(nextMessage.content, message.content)) changed = true;
      return nextMessage;
    });
    const request = this.freeflowContext.recordRequest(refs);
    return {
      messages: changed ? projected : messages,
      changed,
      available: true,
      generation: request.generation,
    };
  }
  async archive(targets) {
    try {
      return await this.enqueue(() => this.archiveNow(targets));
    } catch (error) {
      return this.rejected("archive", `persistence_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async restore(refs, actor = "model") {
    try {
      return await this.enqueue(() => this.restoreNow(refs, actor));
    } catch (error) {
      return this.rejected("restore", `persistence_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async reset() {
    try {
      return await this.enqueue(async () => {
        if (!this.available) return this.unavailable("reset");
        const journal = {
          version: CONTEXT_PROJECTION_VERSION,
          actor: "user",
          reset: "all",
        };
        await this.persist(journal);
        this.projectionState.clear();
        return {
          status: "ok",
          operation: "reset",
          changed: ["all"],
          message: "All context projection decisions were reset on the active branch.",
        };
      });
    } catch (error) {
      return this.rejected("reset", `persistence_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async status(limit = 50) {
    if (!this.available) {
      return {
        available: false,
        unavailableReason: this.unavailableReason,
        sessionId: this.sessionId,
        branchLeafId: this.branchLeafId,
        counts: { full: 0, archived: 0, retained: 0 },
        originalCharacters: 0,
        projectedCharacters: 0,
        historyOnly: 0,
        unresolved: 0,
        items: [],
      };
    }
    if (!(await this.recover(this.ctx, { preserveRequest: true }))) {
      return this.status(limit);
    }
    const branchSources = this.freeflowContext.resolver.sourcesByEntryId();
    const activeIds = this.freeflowContext.resolver.activeToolResultIds();
    const items = [];
    for (const source of branchSources.values()) {
      const state = this.projectionState.get(source.source.entryId);
      const projection = sourceProjection(state);
      items.push(this.listItem(source, projection, activeIds.has(source.source.entryId) ? "active" : "history-only"));
    }
    for (const state of this.projectionState.values()) {
      if (branchSources.has(state.source.entryId)) continue;
      const projection = sourceProjection(state);
      items.push({
        ref: contextRefForEntry(state.source.entryId),
        entryId: state.source.entryId,
        toolCallId: state.source.toolCallId,
        toolName: state.source.toolName,
        mode: projection.mode,
        ...(projection.mode === "archived" && projection.retained !== undefined
          ? { retained: projection.retained }
          : {}),
        originalCharacters: 0,
        projectedCharacters: projection.mode === "archived" ? contentCharacters(projection.retained ?? "") : 0,
        availability: "unresolved",
      });
    }
    const counts = { full: 0, archived: 0, retained: 0 };
    let originalCharacters = 0;
    let projectedCharactersTotal = 0;
    let historyOnly = 0;
    let unresolved = 0;
    for (const item of items) {
      if (item.mode === "full") counts.full += 1;
      else {
        counts.archived += 1;
        if (item.retained !== undefined) counts.retained += 1;
      }
      originalCharacters += item.originalCharacters;
      projectedCharactersTotal += item.projectedCharacters;
      if (item.availability === "history-only") historyOnly += 1;
      if (item.availability === "unresolved") unresolved += 1;
    }
    return {
      available: true,
      sessionId: this.sessionId,
      branchLeafId: this.branchLeafId,
      counts,
      originalCharacters,
      projectedCharacters: projectedCharactersTotal,
      historyOnly,
      unresolved,
      items: items.slice(-Math.max(1, limit)),
    };
  }
  async archiveNow(targets) {
    if (!this.available) return this.unavailable("archive");
    if (!Array.isArray(targets) || targets.length === 0) {
      return this.rejected("archive", "targets_required");
    }
    const normalizedRefs = targets.map((target) =>
      target && typeof target === "object" ? entryIdFromContextRef(target.ref) : undefined,
    );
    const duplicate = isDuplicate(
      normalizedRefs.flatMap((ref) => (ref === undefined ? [] : [contextRefForEntry(ref)])),
    );
    if (duplicate) return this.rejected("archive", `duplicate_reference:${duplicate}`);
    const latestRequest = this.freeflowContext.latestRequest();
    if (!latestRequest) return this.rejected("archive", "no_consumed_context_request");
    const changes = [];
    const retainedMeaning = {};
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      if (!target || typeof target !== "object") return this.rejected("archive", `target_${index}_must_be_object`);
      const ref = normalizedRefs[index];
      if (!ref) return this.rejected("archive", `target_${index}_invalid_reference`);
      const normalizedRef = contextRefForEntry(ref);
      const source = latestRequest.refs.get(normalizedRef);
      if (!source) return this.rejected("archive", `target_not_in_consumed_context:${normalizedRef}`);
      const retainedValue = target.retained;
      if (retainedValue !== undefined && (typeof retainedValue !== "string" || retainedValue.trim() === "")) {
        return this.rejected("archive", `target_${index}_retained_must_be_non_empty`);
      }
      const retained = typeof retainedValue === "string" ? retainedValue.trim() : undefined;
      changes.push({
        source: cloneSource(source.source),
        projection: retained === undefined ? { mode: "archived" } : { mode: "archived", retained },
      });
      if (retained !== undefined) retainedMeaning[normalizedRef] = retained;
    }
    await this.persist({ version: CONTEXT_PROJECTION_VERSION, actor: "model", changes });
    for (const change of changes) {
      this.projectionState.set(change.source.entryId, {
        source: cloneSource(change.source),
        ...change.projection,
      });
    }
    return {
      status: "ok",
      operation: "archive",
      changed: changes.map((change) => contextRefForEntry(change.source.entryId)),
      message: `Archived ${changes.length} tool result${changes.length === 1 ? "" : "s"} from future context projections.`,
      ...(Object.keys(retainedMeaning).length > 0 ? { retained: retainedMeaning } : {}),
    };
  }
  async restoreNow(refs, actor) {
    if (!this.available) return this.unavailable("restore");
    if (!Array.isArray(refs) || refs.length === 0) return this.rejected("restore", "refs_required");
    const normalizedRefs = refs.map((ref) => entryIdFromContextRef(ref));
    const duplicate = isDuplicate(
      normalizedRefs.flatMap((ref) => (ref === undefined ? [] : [contextRefForEntry(ref)])),
    );
    if (duplicate) return this.rejected("restore", `duplicate_reference:${duplicate}`);
    const changes = [];
    const availability = {};
    const activeIds = this.freeflowContext.resolver.activeToolResultIds();
    const latestRequest = this.freeflowContext.latestRequest();
    for (let index = 0; index < refs.length; index += 1) {
      const ref = normalizedRefs[index];
      if (!ref) return this.rejected("restore", `ref_${index}_invalid_reference`);
      const normalizedRef = contextRefForEntry(ref);
      const current = this.projectionState.get(ref);
      if (!current) return this.rejected("restore", `reference_not_archived:${normalizedRef}`);
      if (actor === "model" && !latestRequest?.refs.has(normalizedRef)) {
        return this.rejected("restore", `target_not_in_consumed_context:${normalizedRef}`);
      }
      changes.push({ source: cloneSource(current.source), projection: { mode: "full" } });
      let availabilityValue;
      if (latestRequest?.refs.has(normalizedRef) || activeIds.has(current.source.entryId)) {
        availabilityValue = "active";
      } else {
        availabilityValue = "history-only";
      }
      availability[normalizedRef] = availabilityValue;
    }
    await this.persist({ version: CONTEXT_PROJECTION_VERSION, actor, changes });
    for (const change of changes) {
      this.projectionState.set(change.source.entryId, {
        source: cloneSource(change.source),
        mode: "full",
      });
    }
    return {
      status: "ok",
      operation: "restore",
      changed: changes.map((change) => contextRefForEntry(change.source.entryId)),
      availability,
      message: `Restored ${changes.length} projection${changes.length === 1 ? "" : "s"} to full content.`,
    };
  }
  listItem(source, projection, availability) {
    const item = {
      ref: contextRefForEntry(source.source.entryId),
      entryId: source.source.entryId,
      toolCallId: source.source.toolCallId,
      toolName: source.source.toolName,
      mode: projection.mode,
      originalCharacters: contentCharacters(source.message?.content),
      projectedCharacters: projectedCharacters(source.source, source.message, projection),
      availability,
    };
    if (projection.mode === "archived" && projection.retained !== undefined) {
      item.retained = projection.retained;
    }
    return item;
  }
  rejected(operation, message) {
    return { status: "rejected", operation, changed: [], message };
  }
  unavailable(operation) {
    return {
      status: "unavailable",
      operation,
      changed: [],
      message: this.unavailableReason ?? "context_virtualization_unavailable",
    };
  }
  persist(journal) {
    let append;
    if (typeof this.pi?.appendEntryDurable === "function") {
      append = this.pi.appendEntryDurable;
    } else if (typeof this.pi?.appendEntry === "function") {
      append = this.pi.appendEntry;
    }
    if (!append) throw new Error("The Pi host does not expose a session entry persistence method.");
    const result = append.call(this.pi, CONTEXT_PROJECTION_ENTRY, journal);
    if (result && typeof result.then === "function") return result;
  }
  enqueue(task) {
    const run = this.mutationQueue.then(task);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

import { buildContextVisibility } from "./visibility.js";
import { ContextSourceResolver } from "./resolver.js";
import { projectContextSource } from "./source-projector.js";
export class FreeflowContextRuntime {
  resolver;
  ctx;
  generation = 0;
  latestRequestSnapshot;
  constructor(ctx) {
    this.ctx = ctx;
    this.resolver = new ContextSourceResolver(ctx);
  }
  setContext(ctx) {
    this.ctx = ctx;
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
      const outcome = projectContextSource({ ...resolved, entry: { ...resolved.entry, position } });
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
      visibleEntryIds: visibility.visibleEntryIds,
      visibleSourceIds: visibility.visibleSourceIds,
      materializedSourceIds: visibility.materializedSourceIds,
      skippedEntries,
      entries,
    };
  }
}

import { buildContextVisibility } from "./visibility.js";
import { ContextSourceResolver } from "./resolver.js";
import { projectContextSource } from "./source-projector.js";
import type {
  ContextRequestSnapshot,
  FreeflowContextSnapshot,
  ProjectedContextSource,
  ResolvedContextSource,
} from "./types.js";

export class FreeflowContextRuntime {
  readonly resolver: ContextSourceResolver;
  private ctx: any;
  private generation = 0;
  private latestRequestSnapshot: ContextRequestSnapshot | undefined;

  constructor(ctx: any) {
    this.ctx = ctx;
    this.resolver = new ContextSourceResolver(ctx);
  }

  setContext(ctx: any): void {
    this.ctx = ctx;
    this.resolver.setContext(ctx);
  }

  sessionId(): string {
    return this.resolver.sessionId();
  }

  branchLeafId(): string | null | undefined {
    return this.resolver.branchLeafId();
  }

  branchEntries(): any[] {
    return this.resolver.branchEntries();
  }

  resolveCurrent(ref: unknown) {
    return this.resolver.resolveCurrent(ref);
  }

  recordRequest(refs: Map<string, ResolvedContextSource>): ContextRequestSnapshot {
    this.generation += 1;
    this.latestRequestSnapshot = {
      generation: this.generation,
      sessionId: this.sessionId(),
      branchLeafId: this.branchLeafId(),
      refs,
    };
    return this.latestRequestSnapshot;
  }

  clearRequest(): void {
    this.latestRequestSnapshot = undefined;
  }

  latestRequest(): ContextRequestSnapshot | undefined {
    return this.latestRequestSnapshot;
  }

  captureSnapshot(options: {
    contextVirtualizationEnabled: boolean;
    isSourceFullyProjected?: (entryId: string) => boolean;
  }): FreeflowContextSnapshot {
    const branchEntries = this.resolver.branchEntries();
    const activeEntries = this.resolver.activeContextEntriesStrict();
    const sessionId = this.sessionId();
    const resolvedByEntryId = this.resolver.resolvedEntriesById(branchEntries, sessionId);
    const visibility = buildContextVisibility(activeEntries, resolvedByEntryId, options);
    const entries = new Map<string, ProjectedContextSource>();
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

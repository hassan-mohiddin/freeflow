import type { ContextControlRecoveryScope } from "../core/config.js";
import type { ContextControlCatalog } from "../core/source-registry.js";
import type { ContextControlSource, ContextControlSourceSnapshot, LifecycleAnalysis } from "../core/types.js";
import {
  buildScopeCatalog,
  type ScopeCatalog,
  type ScopeCatalogLineageLink,
  type ScopeCatalogSession,
  type ScopeCatalogSourceRecord,
} from "../recovery/scope-catalog.js";

export type RuntimeCatalogSnapshot = {
  catalog: ScopeCatalog;
  sources: ReadonlyMap<string, ContextControlSource>;
};

function maxTierForScope(scope: ContextControlRecoveryScope) {
  if (scope === "active-branch") return "active-branch" as const;
  if (scope === "current-session") return "current-session" as const;
  return "cross-session" as const;
}

function hiddenRefs(
  sources: readonly ContextControlSource[],
  projections: ReadonlyMap<string, { state: string }>,
  includeVisible: boolean,
): ReadonlySet<string> {
  return new Set(
    sources
      .filter(
        (source) =>
          includeVisible ||
          !source.activeContext ||
          (projections.get(source.ref)?.state !== undefined && projections.get(source.ref)?.state !== "full"),
      )
      .map((source) => source.ref),
  );
}

function temporalForSource(
  source: ContextControlSource,
  analysis: LifecycleAnalysis | undefined,
  currentSessionId: string,
  activeBranchId: string,
): readonly ("current" | "historical" | "before-change" | "after-change")[] {
  const rules = (analysis?.candidates ?? [])
    .filter((candidate) => candidate.sourceRef === source.ref)
    .map((candidate) => candidate.rule);
  if (source.identity.sessionId !== currentSessionId || source.branchId !== activeBranchId) return ["historical"];
  if (rules.includes("mutation-receipt")) return ["after-change"];
  if (
    rules.includes("resolved-failure") ||
    rules.includes("stale-same-path-read") ||
    rules.includes("superseded-observation")
  ) {
    return ["historical", "before-change"];
  }
  return source.temporal ?? ["current"];
}

function sourceRecord(
  source: ContextControlSource,
  analysis: LifecycleAnalysis | undefined,
  currentSessionId: string,
  activeBranchId: string,
): ScopeCatalogSourceRecord {
  const category = source.category ?? "ordinary";
  const privacy = source.privacy ?? (category === "ordinary" ? "allowed" : "unknown");
  const integrity = source.integrity ?? "unknown";
  const freshness = source.freshness ?? "unknown";
  return {
    ref: source.ref,
    identity: { ...source.identity },
    branchId: source.branchId,
    kind: "toolResult",
    toolName: source.toolName,
    ...(source.path === undefined ? {} : { locator: source.path }),
    role: source.role,
    temporal: temporalForSource(source, analysis, currentSessionId, activeBranchId),
    contentHash: source.contentHash,
    characters: source.characters,
    completeness: source.completeness ?? "unknown",
    producedAt: source.producedAt ?? "unknown",
    sequence: source.sequence,
    consumed: source.consumed,
    consumptionEvidence: source.consumptionEvidence ?? (source.consumed ? "confirmed" : "unconfirmed"),
    unmatched: source.metadataIssues.includes("unmatched-tool-call"),
    metadataComplete: source.metadataComplete,
    metadataIssues: source.metadataIssues,
    commandKind: source.commandKind,
    facts: { category, privacy, integrity, freshness },
    ...(source.provenance === undefined ? {} : { provenance: source.provenance }),
    ...(source.isError === undefined ? {} : { isError: source.isError }),
  };
}

function sessionDescriptors(
  current: ContextControlSourceSnapshot,
  catalog: ContextControlCatalog,
  projectId: string,
): readonly ScopeCatalogSession[] {
  const bySession = new Map<string, Set<string>>();
  const add = (source: ContextControlSource) => {
    const branches = bySession.get(source.identity.sessionId) ?? new Set<string>();
    branches.add(source.branchId);
    bySession.set(source.identity.sessionId, branches);
  };
  for (const source of catalog.sources) add(source);
  return Object.freeze(
    catalog.sessions.map((session) => ({
      sessionId: session.sessionId,
      projectId: session.repositoryId ?? projectId,
      privacy: "allowed" as const,
      integrity: "valid" as const,
      branches: Object.freeze(
        [
          ...(bySession.get(session.sessionId) ??
            new Set([session.current ? current.branchId : `${session.sessionId}:root`])),
        ].map((branchId) => ({ branchId, verified: true })),
      ),
    })),
  );
}

function lineageLinks(): readonly ScopeCatalogLineageLink[] {
  return Object.freeze([]);
}

export function buildRuntimeScopeCatalog(
  snapshot: ContextControlSourceSnapshot,
  catalog: ContextControlCatalog,
  scope: ContextControlRecoveryScope,
  projections: ReadonlyMap<string, { state: string }>,
  analysis: LifecycleAnalysis | undefined,
  projectId: string | undefined,
  includeVisible = false,
): RuntimeCatalogSnapshot | undefined {
  if (projectId === undefined || projectId.trim() === "") return undefined;
  const currentSources = catalog.sources;
  const records = currentSources.map((source) => sourceRecord(source, analysis, snapshot.sessionId, snapshot.branchId));
  const sessions = sessionDescriptors(snapshot, catalog, projectId);
  const enabledSessionIds = catalog.sessions.filter((session) => !session.current).map((session) => session.sessionId);
  const built = buildScopeCatalog(records, {
    currentSessionId: snapshot.sessionId,
    activeBranchId: snapshot.branchId,
    projectId,
    maxTier: maxTierForScope(scope),
    hiddenRefs: hiddenRefs(currentSources, projections, includeVisible),
    sessions,
    lineageLinks: lineageLinks(),
    enabledSessionIds,
  });
  const sources = new Map(currentSources.map((source) => [source.ref, source]));
  return { catalog: built, sources };
}

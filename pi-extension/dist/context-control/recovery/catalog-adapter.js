import { buildScopeCatalog } from "./scope-catalog.js";
function maxTierForScope(scope) {
  if (scope === "active-branch") return "active-branch";
  if (scope === "current-session") return "current-session";
  return "cross-session";
}
function hiddenRefs(sources, projections) {
  return new Set(
    sources
      .filter(
        (source) =>
          !source.activeContext ||
          (projections.get(source.ref)?.state !== undefined && projections.get(source.ref)?.state !== "full"),
      )
      .map((source) => source.ref),
  );
}
function temporalForSource(source, analysis, currentSessionId) {
  const rules = (analysis?.candidates ?? [])
    .filter((candidate) => candidate.sourceRef === source.ref)
    .map((candidate) => candidate.rule);
  if (source.identity.sessionId !== currentSessionId) return ["historical"];
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
function sourceRecord(source, analysis, currentSessionId) {
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
    temporal: temporalForSource(source, analysis, currentSessionId),
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
function sessionDescriptors(current, catalog, projectId) {
  const bySession = new Map();
  const add = (source) => {
    const branches = bySession.get(source.identity.sessionId) ?? new Set();
    branches.add(source.branchId);
    bySession.set(source.identity.sessionId, branches);
  };
  for (const source of catalog.sources) add(source);
  return Object.freeze(
    catalog.sessions.map((session) => ({
      sessionId: session.sessionId,
      projectId: session.repositoryId ?? projectId,
      privacy: "allowed",
      integrity: "valid",
      branches: Object.freeze(
        [
          ...(bySession.get(session.sessionId) ??
            new Set([session.current ? current.branchId : `${session.sessionId}:root`])),
        ].map((branchId) => ({ branchId, verified: true })),
      ),
    })),
  );
}
function lineageLinks() {
  return Object.freeze([]);
}
export function buildRuntimeScopeCatalog(snapshot, catalog, scope, projections, analysis, projectId) {
  if (projectId === undefined || projectId.trim() === "") return undefined;
  const currentSources = catalog.sources;
  const records = currentSources.map((source) => sourceRecord(source, analysis, snapshot.sessionId));
  const sessions = sessionDescriptors(snapshot, catalog, projectId);
  const enabledSessionIds = catalog.sessions.filter((session) => !session.current).map((session) => session.sessionId);
  const built = buildScopeCatalog(records, {
    currentSessionId: snapshot.sessionId,
    activeBranchId: snapshot.branchId,
    projectId,
    maxTier: maxTierForScope(scope),
    hiddenRefs: hiddenRefs(currentSources, projections),
    sessions,
    lineageLinks: lineageLinks(),
    enabledSessionIds,
  });
  const sources = new Map(currentSources.map((source) => [source.ref, source]));
  return { catalog: built, sources };
}

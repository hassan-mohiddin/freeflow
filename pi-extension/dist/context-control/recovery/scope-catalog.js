import { stableJson } from "../core/stable-json.js";
export const SCOPE_CATALOG_VERSION = "0.1";
export const EVIDENCE_SCOPE_TIERS = ["active-branch", "current-session", "lineage", "cross-session"];
export const SCOPE_CATALOG_RELATIONS = [
  "active-branch",
  "sibling-branch",
  "verified-fork",
  "verified-clone",
  "verified-lineage",
  "cross-session",
];
export const SCOPE_CATALOG_LINEAGE_RELATIONS = ["fork", "clone"];
export const SCOPE_CATALOG_SOURCE_CATEGORIES = [
  "ordinary",
  "thinking",
  "tool-details",
  "usage",
  "image-base64",
  "administrative",
  "context-control",
];
export const SCOPE_CATALOG_COMMAND_KINDS = ["broad-search", "observation", "verification", "other"];
export const SCOPE_CATALOG_PRIVACY_VALUES = ["allowed", "denied", "unknown"];
export const SCOPE_CATALOG_INTEGRITY_VALUES = ["valid", "invalid", "unknown"];
export const SCOPE_CATALOG_FRESHNESS_VALUES = ["current", "stale", "unknown"];
export class ScopeCatalogError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ScopeCatalogError";
  }
}
const TIER_RANK = Object.freeze({
  "active-branch": 0,
  "current-session": 1,
  lineage: 2,
  "cross-session": 3,
});
const TEMPORAL_ORDER = ["current", "historical", "before-change", "after-change"];
const SOURCE_RECORD_FIELDS = new Set([
  "ref",
  "identity",
  "branchId",
  "kind",
  "toolName",
  "locator",
  "role",
  "temporal",
  "contentHash",
  "characters",
  "completeness",
  "producedAt",
  "sequence",
  "consumed",
  "consumptionEvidence",
  "unmatched",
  "metadataComplete",
  "metadataIssues",
  "commandKind",
  "facts",
  "provenance",
  "isError",
]);
const VALID_ROLES = ["source-content", "verification-output", "observation", "mutation-receipt"];
const VALID_COMPLETENESS = ["complete", "partial", "unknown"];
const VALID_CONSUMPTION_EVIDENCE = new Set(["confirmed", "inferred", "unconfirmed"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
function requiredText(value, field, max = 512) {
  if (typeof value !== "string" || value.trim() === "")
    throw new ScopeCatalogError("invalid-option", `${field} must be a non-empty string`);
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length > max) throw new ScopeCatalogError("invalid-option", `${field} exceeds its length limit`);
  return normalized;
}
function enumValue(value, values, field) {
  if (typeof value !== "string" || !values.includes(value))
    throw new ScopeCatalogError("invalid-option", `${field} is invalid`);
  return value;
}
function idList(value, field) {
  if (value === undefined) return Object.freeze([]);
  const values = [...value];
  const normalized = values.map((item) => requiredText(item, field, 512));
  if (new Set(normalized).size !== normalized.length)
    throw new ScopeCatalogError("invalid-option", `${field} must not contain duplicates`);
  return Object.freeze([...normalized].sort((left, right) => left.localeCompare(right)));
}
function cloneIdentity(identity) {
  return Object.freeze({ ...identity });
}
function identityValid(identity) {
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) return false;
  const value = identity;
  return (
    typeof value.sessionId === "string" &&
    value.sessionId.trim() !== "" &&
    typeof value.entryId === "string" &&
    value.entryId.trim() !== "" &&
    (value.toolCallId === undefined || (typeof value.toolCallId === "string" && value.toolCallId.trim() !== ""))
  );
}
function validProvenance(value) {
  return (
    typeof value.rule === "string" &&
    value.rule.trim() !== "" &&
    SCOPE_CATALOG_COMMAND_KINDS.includes(value.commandKind) &&
    Number.isSafeInteger(value.sourceTurn) &&
    value.sourceTurn >= 0 &&
    (value.replacement === undefined || identityValid(value.replacement))
  );
}
function cloneProvenance(value) {
  return Object.freeze({
    rule: value.rule,
    commandKind: value.commandKind,
    sourceTurn: value.sourceTurn,
    ...(value.replacement === undefined ? {} : { replacement: cloneIdentity(value.replacement) }),
  });
}
function scopeTierAllowed(maxTier, tier) {
  return TIER_RANK[tier] <= TIER_RANK[maxTier];
}
function sessionMap(sessions) {
  if (!Array.isArray(sessions)) throw new ScopeCatalogError("invalid-option", "sessions must be an array");
  const result = new Map();
  for (const session of sessions) {
    const sessionId = requiredText(session.sessionId, "session.sessionId");
    const projectId = requiredText(session.projectId, "session.projectId");
    const privacy = enumValue(session.privacy, SCOPE_CATALOG_PRIVACY_VALUES, "session.privacy");
    const integrity = enumValue(session.integrity, SCOPE_CATALOG_INTEGRITY_VALUES, "session.integrity");
    if (!Array.isArray(session.branches) || session.branches.length === 0)
      throw new ScopeCatalogError("invalid-session", `Session ${sessionId} must declare at least one branch`);
    if (result.has(sessionId))
      throw new ScopeCatalogError("duplicate-session", `Session ${sessionId} is declared more than once`);
    const branches = [];
    const seenBranches = new Set();
    for (const branch of session.branches) {
      const branchId = requiredText(branch.branchId, "session.branchId");
      if (typeof branch.verified !== "boolean")
        throw new ScopeCatalogError("invalid-branch", `Branch ${branchId} verification is invalid`);
      if (seenBranches.has(branchId))
        throw new ScopeCatalogError(
          "duplicate-branch",
          `Branch ${branchId} is declared more than once in session ${sessionId}`,
        );
      seenBranches.add(branchId);
      branches.push(Object.freeze({ branchId, verified: branch.verified }));
    }
    result.set(
      sessionId,
      Object.freeze({ sessionId, projectId, privacy, integrity, branches: Object.freeze(branches) }),
    );
  }
  return result;
}
function linkList(links, sessions) {
  if (!Array.isArray(links)) throw new ScopeCatalogError("invalid-lineage", "lineageLinks must be an array");
  const result = [];
  const seen = new Set();
  for (const link of links) {
    const fromSessionId = requiredText(link.fromSessionId, "lineage.fromSessionId");
    const toSessionId = requiredText(link.toSessionId, "lineage.toSessionId");
    if (fromSessionId === toSessionId)
      throw new ScopeCatalogError("invalid-lineage", "lineage links must connect distinct sessions");
    if (!sessions.has(fromSessionId) || !sessions.has(toSessionId))
      throw new ScopeCatalogError("unknown-lineage-session", "lineage links must reference declared sessions");
    const relation = enumValue(link.relation, SCOPE_CATALOG_LINEAGE_RELATIONS, "lineage.relation");
    const projectId = requiredText(link.projectId, "lineage.projectId");
    const privacy = enumValue(link.privacy, SCOPE_CATALOG_PRIVACY_VALUES, "lineage.privacy");
    const integrity = enumValue(link.integrity, SCOPE_CATALOG_INTEGRITY_VALUES, "lineage.integrity");
    if (typeof link.verified !== "boolean")
      throw new ScopeCatalogError("invalid-lineage", "lineage.verified must be boolean");
    const key = stableJson({ fromSessionId, toSessionId, relation });
    const reverseKey = stableJson({ fromSessionId: toSessionId, toSessionId: fromSessionId, relation });
    if (seen.has(key) || seen.has(reverseKey))
      throw new ScopeCatalogError("duplicate-lineage", "duplicate lineage relationship");
    seen.add(key);
    result.push(
      Object.freeze({ fromSessionId, toSessionId, relation, projectId, verified: link.verified, privacy, integrity }),
    );
  }
  return Object.freeze([...result].sort((left, right) => stableJson(left).localeCompare(stableJson(right))));
}
function lineageRelation(fromSessionId, toSessionId, links, sessions, projectId) {
  if (fromSessionId === toSessionId) return undefined;
  const queue = [{ sessionId: fromSessionId, relations: [] }];
  const visited = new Set([fromSessionId]);
  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = links
      .filter((link) => link.fromSessionId === current.sessionId || link.toSessionId === current.sessionId)
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    for (const link of neighbors) {
      if (!link.verified || link.projectId !== projectId || link.privacy !== "allowed" || link.integrity !== "valid")
        continue;
      const nextSessionId = link.fromSessionId === current.sessionId ? link.toSessionId : link.fromSessionId;
      const nextSession = sessions.get(nextSessionId);
      if (
        nextSession === undefined ||
        nextSession.projectId !== projectId ||
        nextSession.privacy !== "allowed" ||
        nextSession.integrity !== "valid"
      )
        continue;
      const relations = [...current.relations, link.relation];
      if (nextSessionId === toSessionId) {
        const allFork = relations.every((relation) => relation === "fork");
        const allClone = relations.every((relation) => relation === "clone");
        return allFork ? "verified-fork" : allClone ? "verified-clone" : "verified-lineage";
      }
      if (!visited.has(nextSessionId)) {
        visited.add(nextSessionId);
        queue.push({ sessionId: nextSessionId, relations });
      }
    }
  }
  return undefined;
}
function sourceBranchId(source) {
  return typeof source.branchId === "string" && source.branchId.trim() !== ""
    ? source.branchId.normalize("NFKC").trim()
    : undefined;
}
function scopeDecision(source, policy, sessions, links) {
  if (!identityValid(source.identity)) return { status: "excluded", reason: "incomplete-metadata" };
  const sessionId = source.identity.sessionId;
  const session = sessions.get(sessionId);
  if (session === undefined) return { status: "excluded", reason: "unknown-session" };
  if (session.projectId !== policy.projectId) return { status: "excluded", reason: "project-mismatch" };
  if (session.privacy !== "allowed") return { status: "excluded", reason: "privacy" };
  if (session.integrity !== "valid") return { status: "excluded", reason: "integrity" };
  const branchId = sourceBranchId(source);
  if (branchId === undefined) return { status: "excluded", reason: "unknown-branch" };
  const branch = session.branches.find((item) => item.branchId === branchId);
  if (branch === undefined) return { status: "excluded", reason: "unknown-branch" };
  if (!branch.verified) return { status: "excluded", reason: "unverified-branch" };
  if (policy.branchIds.length > 0 && !policy.branchIds.includes(branchId))
    return { status: "excluded", reason: "branch-filter" };
  if (sessionId === policy.currentSessionId) {
    if (branchId === policy.activeBranchId)
      return { status: "eligible", tier: "active-branch", relation: "active-branch", branchId };
    if (!scopeTierAllowed(policy.maxTier, "current-session"))
      return { status: "excluded", reason: "outside-active-branch" };
    return { status: "eligible", tier: "current-session", relation: "sibling-branch", branchId };
  }
  if (!scopeTierAllowed(policy.maxTier, "current-session"))
    return { status: "excluded", reason: "outside-current-session" };
  const relation = lineageRelation(policy.currentSessionId, sessionId, links, sessions, policy.projectId);
  if (relation !== undefined && scopeTierAllowed(policy.maxTier, "lineage"))
    return { status: "eligible", tier: "lineage", relation, branchId };
  if (!scopeTierAllowed(policy.maxTier, "lineage")) return { status: "excluded", reason: "outside-current-session" };
  if (relation === undefined && !scopeTierAllowed(policy.maxTier, "cross-session"))
    return { status: "excluded", reason: "lineage-not-verified" };
  if (!scopeTierAllowed(policy.maxTier, "cross-session")) return { status: "excluded", reason: "outside-lineage" };
  if (policy.enabledSessionIds.includes(sessionId))
    return { status: "eligible", tier: "cross-session", relation: "cross-session", branchId };
  return { status: "excluded", reason: "cross-session-not-enabled" };
}
function invalidSourceShape(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) return "source record must be an object";
  for (const key of Object.keys(source))
    if (!SOURCE_RECORD_FIELDS.has(key)) return `source record contains unknown field: ${key}`;
  return undefined;
}
function sourceExclusion(source, policy, options, sessions, links) {
  const shapeError = invalidSourceShape(source);
  if (shapeError !== undefined) throw new ScopeCatalogError("unknown-source-field", shapeError);
  const scope = scopeDecision(source, policy, sessions, links);
  if (scope.status === "excluded") return scope.reason;
  if (!options.hiddenRefs.has(source.ref)) return "visible";
  if (source.kind !== "toolResult") return "unsupported-kind";
  if (source.unmatched) return "unmatched";
  if (
    !identityValid(source.identity) ||
    source.metadataComplete !== true ||
    !Array.isArray(source.metadataIssues) ||
    source.metadataIssues.length > 0 ||
    typeof source.toolName !== "string" ||
    source.toolName.trim() === "" ||
    (source.locator !== undefined && (typeof source.locator !== "string" || source.locator.trim() === "")) ||
    source.role === undefined ||
    !VALID_ROLES.includes(source.role) ||
    source.temporal === undefined ||
    !Array.isArray(source.temporal) ||
    source.temporal.length === 0 ||
    source.temporal.some((value) => !TEMPORAL_ORDER.includes(value))
  )
    return "incomplete-metadata";
  if (
    !Number.isSafeInteger(source.sequence) ||
    source.sequence < 0 ||
    !Number.isSafeInteger(source.characters) ||
    source.characters < 0 ||
    !VALID_COMPLETENESS.includes(source.completeness) ||
    typeof source.producedAt !== "string" ||
    source.producedAt.trim() === "" ||
    source.producedAt === "unknown"
  )
    return "incomplete-metadata";
  if (!source.consumed) return "unconsumed";
  if (source.consumptionEvidence !== "confirmed") return "unconfirmed-consumption";
  if (source.characters === 0) return "empty-source";
  if (source.facts === null || typeof source.facts !== "object" || Array.isArray(source.facts))
    return "facts-unavailable";
  if (
    !SCOPE_CATALOG_SOURCE_CATEGORIES.includes(source.facts.category) ||
    !SCOPE_CATALOG_PRIVACY_VALUES.includes(source.facts.privacy) ||
    !SCOPE_CATALOG_INTEGRITY_VALUES.includes(source.facts.integrity) ||
    !SCOPE_CATALOG_FRESHNESS_VALUES.includes(source.facts.freshness)
  )
    return "facts-unavailable";
  if (source.facts.category !== "ordinary") return "excluded-source-category";
  if (source.facts.privacy !== "allowed") return "privacy";
  if (source.facts.freshness === "stale") return "stale";
  if (source.facts.freshness !== "current") return "staleness-unknown";
  if (
    source.facts.integrity !== "valid" ||
    typeof source.contentHash !== "string" ||
    !HASH_PATTERN.test(source.contentHash)
  )
    return "integrity";
  if (
    !SCOPE_CATALOG_COMMAND_KINDS.includes(source.commandKind) ||
    !VALID_CONSUMPTION_EVIDENCE.has(source.consumptionEvidence)
  )
    return "incomplete-metadata";
  if (
    source.provenance !== undefined &&
    (!Array.isArray(source.provenance) || source.provenance.some((item) => !validProvenance(item)))
  )
    return "invalid-provenance";
  return undefined;
}
function temporalFor(values) {
  return Object.freeze(TEMPORAL_ORDER.filter((value) => values.includes(value)));
}
function sourceCandidate(source, decision, policy) {
  const identity = cloneIdentity(source.identity);
  const toolName = source.toolName.normalize("NFKC").trim();
  const locator = source.locator === undefined ? undefined : source.locator.normalize("NFKC").trim();
  const provenance =
    source.provenance === undefined ? undefined : Object.freeze(source.provenance.map(cloneProvenance));
  const output = Object.freeze({
    ref: source.ref,
    identity,
    sessionId: source.identity.sessionId,
    branchId: decision.branchId,
    projectId: policy.projectId,
    tier: decision.tier,
    relation: decision.relation,
    visibility: "hidden",
    toolName,
    ...(locator === undefined ? {} : { locator }),
    role: source.role,
    temporal: temporalFor(source.temporal),
    contentHash: source.contentHash,
    characters: source.characters,
    completeness: source.completeness,
    producedAt: source.producedAt,
    freshness: "current",
    privacy: "allowed",
    integrity: "valid",
    sequence: source.sequence,
    ...(provenance === undefined ? {} : { provenance }),
    ...(source.isError === undefined ? {} : { isError: source.isError }),
  });
  return {
    ...output,
    record: source,
    canonicalKey: stableJson({ identity: stableJson(source.identity), contentHash: source.contentHash }),
  };
}
function tierCompare(left, right) {
  return (
    TIER_RANK[left.tier] - TIER_RANK[right.tier] || left.sequence - right.sequence || left.ref.localeCompare(right.ref)
  );
}
function canGroupLineage(left, right, links, sessions, projectId) {
  if (
    left.contentHash !== right.contentHash ||
    left.toolName !== right.toolName ||
    left.locator !== right.locator ||
    left.completeness !== right.completeness
  )
    return false;
  return lineageRelation(left.sessionId, right.sessionId, links, sessions, projectId) !== undefined;
}
function groupedCandidates(candidates, links, sessions, projectId) {
  const groups = [];
  for (const candidate of candidates) {
    const group = groups.find((items) =>
      items.some(
        (existing) =>
          existing.canonicalKey === candidate.canonicalKey ||
          canGroupLineage(existing, candidate, links, sessions, projectId),
      ),
    );
    if (group === undefined) groups.push([candidate]);
    else group.push(candidate);
  }
  return groups
    .map((group) => {
      const ordered = [...group].sort(tierCompare);
      const representative = Object.freeze(
        Object.fromEntries(Object.entries(ordered[0]).filter(([key]) => key !== "record" && key !== "canonicalKey")),
      );
      const refs = Object.freeze([...group].map((item) => item.ref).sort((left, right) => left.localeCompare(right)));
      const canonical = group.every((item) => item.canonicalKey === ordered[0].canonicalKey);
      return Object.freeze({
        ...representative,
        ...(group.length <= 1
          ? {}
          : {
              equivalence: canonical ? "canonical" : "lineage-equivalent",
              equivalentRefs: refs,
            }),
      });
    })
    .sort(tierCompare);
}
export function buildScopeCatalog(records, options) {
  if (!Array.isArray(records)) throw new ScopeCatalogError("invalid-option", "source records must be an array");
  const currentSessionId = requiredText(options.currentSessionId, "currentSessionId");
  const activeBranchId = requiredText(options.activeBranchId, "activeBranchId");
  const projectId = requiredText(options.projectId, "projectId");
  const maxTier = enumValue(options.maxTier, EVIDENCE_SCOPE_TIERS, "maxTier");
  if (options.hiddenRefs === null || typeof options.hiddenRefs?.has !== "function")
    throw new ScopeCatalogError("invalid-option", "hiddenRefs must be a Set-like value");
  const enabledSessionIds = idList(options.enabledSessionIds, "enabledSessionIds");
  const branchIds = idList(options.branchIds, "branchIds");
  const sessions = sessionMap(options.sessions);
  const currentSession = sessions.get(currentSessionId);
  if (currentSession === undefined)
    throw new ScopeCatalogError("unknown-current-session", `Current session is not declared: ${currentSessionId}`);
  if (currentSession.projectId !== projectId)
    throw new ScopeCatalogError("project-mismatch", "Current session project does not match the catalog project");
  const links = linkList(options.lineageLinks, sessions);
  const policy = Object.freeze({
    currentSessionId,
    activeBranchId,
    projectId,
    maxTier,
    enabledSessionIds,
    branchIds,
  });
  const candidates = [];
  const excluded = [];
  const seenRefs = new Set();
  for (const source of records) {
    if (source === null || typeof source !== "object" || Array.isArray(source))
      throw new ScopeCatalogError("invalid-source", "source record must be an object");
    if (typeof source.ref !== "string" || source.ref.trim() === "")
      throw new ScopeCatalogError("invalid-source", "source ref must be a non-empty string");
    if (seenRefs.has(source.ref))
      throw new ScopeCatalogError("duplicate-source", `Source ${source.ref} is declared more than once`);
    seenRefs.add(source.ref);
    const reason = sourceExclusion(source, policy, options, sessions, links);
    if (reason !== undefined) {
      excluded.push(Object.freeze({ ref: source.ref, reason }));
      continue;
    }
    const scope = scopeDecision(source, policy, sessions, links);
    if (scope.status !== "eligible") {
      excluded.push(Object.freeze({ ref: source.ref, reason: scope.reason }));
      continue;
    }
    candidates.push(sourceCandidate(source, scope, policy));
  }
  return Object.freeze({
    version: SCOPE_CATALOG_VERSION,
    policy,
    sources: Object.freeze(groupedCandidates(candidates, links, sessions, projectId)),
    excluded: Object.freeze(excluded),
  });
}

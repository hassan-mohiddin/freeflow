import { PI_SESSION_MODEL_STATE_ENTRY, parsePiSessionModelStateCommit } from "./pi-session-control.js";
const COGNITIVE_ROUTING_INTENT_ENTRY = "freeflow-cognitive-routing-intent";
const COGNITIVE_ROUTING_CONTROL_ENTRY = "freeflow-cognitive-routing-control";
const UNKNOWN = "unknown";
function isRecord(value) {
  return Boolean(value && typeof value === "object");
}
function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function nullableString(value) {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}
function profileName(value) {
  return value === "standard" || value === "reasoning" ? value : undefined;
}
function pairFrom(value) {
  if (!isRecord(value)) return undefined;
  const provider = stringValue(value.provider);
  const modelId = stringValue(value.modelId ?? value.id);
  const thinkingLevel = stringValue(value.thinkingLevel);
  if (!provider || !modelId || !thinkingLevel) return undefined;
  return { provider, modelId, thinkingLevel };
}
function pairFromEntry(entry) {
  return pairFrom({
    provider: entry.provider,
    modelId: entry.modelId,
    thinkingLevel: entry.thinkingLevel,
  });
}
function pairsEqual(left, right) {
  return (
    left?.provider === right?.provider &&
    left?.modelId === right?.modelId &&
    left?.thinkingLevel === right?.thinkingLevel
  );
}
function validTimestamp(value) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}
function metadataFor(entry, position) {
  const raw = isRecord(entry) ? entry : {};
  const knownId = stringValue(raw.id);
  const parentId = stringValue(raw.parentId);
  const timestamp = validTimestamp(raw.timestamp);
  const id = knownId ?? `${UNKNOWN}:${position}`;
  return {
    raw,
    position,
    id,
    ...(parentId ? { parentId } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...(knownId ? { branchAnchor: knownId } : {}),
  };
}
function sourceFrom(value) {
  return value === "user" || value === "agent" || value === "system" ? value : "unknown";
}
function versionFrom(value) {
  return value === 1 || value === 2 ? value : undefined;
}
function parseIntent(value) {
  if (!isRecord(value)) return undefined;
  const version = versionFrom(value.version);
  const kind =
    value.kind === "activation" || value.kind === "profile" || value.kind === "closing" ? value.kind : undefined;
  const phase = value.phase === "prepared" || value.phase === "abandoned" ? value.phase : undefined;
  const epoch = stringValue(value.epoch);
  const correlationId = stringValue(value.correlationId);
  const target = pairFrom(value.target);
  const returnTarget = pairFrom(value.returnTarget);
  if (!version || !kind || !phase || !target || !returnTarget || !epoch || !correlationId) return undefined;
  const reason = stringValue(value.reason);
  const resumeReason = stringValue(value.resumeReason);
  const branchId = nullableString(value.branchId);
  const mechanism = stringValue(value.mechanism);
  const decisionCorrelationId = stringValue(value.decisionCorrelationId);
  const fromPair = pairFrom(value.fromPair);
  const profile = profileName(value.profile);
  const resumeProfile = profileName(value.resumeProfile);
  const fromProfile = profileName(value.fromProfile);
  return {
    version,
    kind,
    phase,
    control: value.control === "manual" ? "manual" : "automatic",
    source: sourceFrom(value.source),
    ...(reason ? { reason } : {}),
    ...(branchId === undefined ? {} : { branchId }),
    epoch,
    correlationId,
    ...(profile ? { profile } : {}),
    ...(resumeProfile ? { resumeProfile } : {}),
    ...(value.resumeControl === "automatic" || value.resumeControl === "manual"
      ? { resumeControl: value.resumeControl }
      : {}),
    ...(resumeReason ? { resumeReason } : {}),
    target,
    returnTarget,
    ...(mechanism ? { mechanism } : {}),
    ...(decisionCorrelationId ? { decisionCorrelationId } : {}),
    ...(fromPair ? { fromPair } : {}),
    ...(fromProfile ? { fromProfile } : {}),
  };
}
function parseControl(value) {
  if (!isRecord(value)) return undefined;
  const version = versionFrom(value.version);
  if (!version || value.control !== "automatic") return undefined;
  const reason = stringValue(value.reason);
  const branchId = nullableString(value.branchId);
  const epoch = stringValue(value.epoch);
  const mechanism = stringValue(value.mechanism);
  return {
    version,
    control: "automatic",
    source: value.source === "user" ? "user" : "unknown",
    ...(reason ? { reason } : {}),
    ...(branchId === undefined ? {} : { branchId }),
    ...(epoch ? { epoch } : {}),
    ...(mechanism ? { mechanism } : {}),
  };
}
function eventBase(id, metadata) {
  return {
    id,
    ...(metadata.timestamp ? { timestamp: metadata.timestamp } : {}),
    jsonlPosition: metadata.position,
    entryId: metadata.id,
    ...(metadata.parentId ? { parentId: metadata.parentId } : {}),
    ...(metadata.branchAnchor ? { branchAnchor: metadata.branchAnchor } : {}),
  };
}
function profileForPair(pair, options) {
  if (!pair) return undefined;
  if (options.profileForPair) return options.profileForPair(pair);
  for (const profile of ["standard", "reasoning"]) {
    if (pairsEqual(pair, options.profilePairs?.[profile])) return profile;
  }
  return undefined;
}
function intentClassification(intent) {
  if (intent.kind === "profile")
    return intent.source === "user" || intent.source === "agent" ? "semantic-switch" : "lifecycle-replay";
  if (intent.kind === "closing") return "return-target-restore";
  return ["reload-restore", "recovery", "session-tree", "session-compact"].includes(intent.mechanism ?? "")
    ? "lifecycle-replay"
    : "initialization";
}
function lifecycleDecisionSource(intent, semanticSources) {
  if (intent.kind === "profile" && (intent.source === "user" || intent.source === "agent")) return intent.source;
  if (intent.decisionCorrelationId && semanticSources.get(intent.decisionCorrelationId)) {
    return semanticSources.get(intent.decisionCorrelationId);
  }
  if (intent.kind === "profile" || intent.source === "unknown") return "unknown";
  return "none";
}
function metadataIntegrity(intent, semanticSources) {
  if (intent.version === 1) return { integrity: "unknown" };
  if (!intent.mechanism) return { integrity: "anomaly", anomalyReason: "mechanism_missing" };
  if (!intent.fromPair) return { integrity: "anomaly", anomalyReason: "from_pair_missing" };
  if (intent.kind === "profile") {
    if (!intent.decisionCorrelationId) return { integrity: "anomaly", anomalyReason: "decision_correlation_missing" };
    if (intent.source === "user" || intent.source === "agent") {
      if (intent.decisionCorrelationId !== intent.correlationId) {
        return { integrity: "anomaly", anomalyReason: "semantic_decision_correlation_mismatch" };
      }
    } else if (!semanticSources.has(intent.decisionCorrelationId)) {
      return { integrity: "anomaly", anomalyReason: "lifecycle_decision_unresolved" };
    }
  }
  return { integrity: "valid" };
}
function intentEvent(
  record,
  representative,
  host,
  options,
  semanticSources,
  outcome,
  integrity,
  changed,
  anomalyReason,
) {
  const intent = record.prepared.intent;
  const metadata = metadataIntegrity(intent, semanticSources);
  const effectiveIntegrity = metadata.integrity === "anomaly" ? "anomaly" : integrity;
  const classification = intentClassification(intent);
  const from = intent.fromProfile ?? profileForPair(intent.fromPair, options);
  const to = intent.profile ?? profileForPair(intent.target, options);
  return {
    ...eventBase(`intent:${record.prepared.metadata.id}`, representative),
    classification,
    decisionSource: lifecycleDecisionSource(intent, semanticSources),
    ...(intent.mechanism ? { mechanism: intent.mechanism } : {}),
    outcome,
    changed,
    integrity: effectiveIntegrity,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(intent.control ? { control: intent.control } : {}),
    ...(intent.reason ? { reason: intent.reason } : {}),
    epoch: intent.epoch,
    correlationId: intent.correlationId,
    ...(intent.decisionCorrelationId ? { decisionCorrelationId: intent.decisionCorrelationId } : {}),
    ...(host?.hostOrigin === undefined ? {} : { hostOrigin: host.hostOrigin }),
    ...(anomalyReason || metadata.anomalyReason ? { anomalyReason: anomalyReason ?? metadata.anomalyReason } : {}),
    representativePosition: representative.position,
  };
}
function controlEvent(metadata, control) {
  const integrity = control.version === 1 ? "unknown" : control.mechanism ? "valid" : "anomaly";
  const anomalyReason = control.version === 2 && !control.mechanism ? "mechanism_missing" : undefined;
  return {
    ...eventBase(`control:${metadata.id}`, metadata),
    classification: "control-only",
    decisionSource: control.source,
    ...(control.mechanism ? { mechanism: control.mechanism } : {}),
    outcome: "completed",
    changed: false,
    integrity,
    control: "automatic",
    ...(control.reason ? { reason: control.reason } : {}),
    ...(control.epoch ? { epoch: control.epoch } : {}),
    ...(anomalyReason ? { anomalyReason } : {}),
    representativePosition: metadata.position,
  };
}
function hostEvent(host, integrity, anomalyReason) {
  return {
    ...eventBase(`host:${host.metadata.id}`, host.metadata),
    classification: "external-host-change",
    decisionSource: "none",
    outcome: "external",
    changed: "unknown",
    integrity,
    ...(host.correlationId ? { correlationId: host.correlationId } : {}),
    ...(host.hostOrigin === undefined ? {} : { hostOrigin: host.hostOrigin }),
    ...(anomalyReason ? { anomalyReason } : {}),
    representativePosition: host.metadata.position,
  };
}
function activeEntryIds(entries) {
  return new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry, index) => metadataFor(entry, index).id)
      .filter((id) => !id.startsWith(`${UNKNOWN}:`)),
  );
}
function normalizeLimit(limit) {
  if (!Number.isInteger(limit)) return 20;
  return Math.max(1, Math.min(100, limit));
}
function currentState(current) {
  return {
    control: current?.control === "automatic" || current?.control === "manual" ? current.control : "unavailable",
    profile: current?.profile === "standard" || current?.profile === "reasoning" ? current.profile : "unavailable",
  };
}
export function projectCognitiveRoutingHistory(entries, options = {}) {
  const intentRecords = new Map();
  const controls = [];
  const hosts = [];
  const semanticSources = new Map();
  entries.forEach((entry, position) => {
    const metadata = metadataFor(entry, position);
    if (!isRecord(entry)) return;
    if (entry.type === "custom" && entry.customType === COGNITIVE_ROUTING_INTENT_ENTRY) {
      const parsed = parseIntent(entry.data);
      if (!parsed) return;
      if (parsed.phase === "abandoned") {
        const existing = intentRecords.get(parsed.correlationId);
        if (existing) existing.abandonment = { metadata, intent: parsed };
        return;
      }
      const existing = intentRecords.get(parsed.correlationId);
      if (existing) {
        existing.conflict = true;
      } else {
        intentRecords.set(parsed.correlationId, { prepared: { metadata, intent: parsed }, conflict: false });
        if (parsed.kind === "profile" && (parsed.source === "user" || parsed.source === "agent")) {
          semanticSources.set(parsed.correlationId, parsed.source);
        }
      }
      return;
    }
    if (entry.type === "custom" && entry.customType === COGNITIVE_ROUTING_CONTROL_ENTRY) {
      const parsed = parseControl(entry.data);
      if (parsed) controls.push({ metadata, control: parsed });
      return;
    }
    if (entry.type === "custom" && entry.customType === PI_SESSION_MODEL_STATE_ENTRY) {
      const parsed = parsePiSessionModelStateCommit(entry.data);
      if (!parsed || parsed.phase !== "committed" || parsed.status !== "applied") return;
      hosts.push({
        metadata,
        pair: parsed.target,
        correlationId: parsed.correlationId,
        hostOrigin: parsed.origin,
      });
      return;
    }
    if (entry.type === "model_state_change") {
      const correlationId = stringValue(entry.correlationId);
      hosts.push({
        metadata,
        pair: pairFromEntry(entry),
        ...(correlationId ? { correlationId } : {}),
        ...(entry.origin === undefined
          ? entry.hostOrigin === undefined
            ? {}
            : { hostOrigin: entry.hostOrigin }
          : { hostOrigin: entry.origin }),
      });
    }
  });
  const usedHostPositions = new Set();
  const events = [];
  const activeEpochs = new Set();
  let completedClosing = false;
  for (const record of intentRecords.values()) {
    const intent = record.prepared.intent;
    const correlatedHosts = hosts.filter((host) => host.correlationId === intent.correlationId);
    const matchingHosts = correlatedHosts.filter((host) => pairsEqual(host.pair, intent.target));
    correlatedHosts.forEach((host) => usedHostPositions.add(host.metadata.position));
    const metadata = metadataIntegrity(intent, semanticSources);
    if (intent.kind === "closing" && matchingHosts.length > 0) completedClosing = true;
    if (record.abandonment) {
      events.push(
        intentEvent(
          record,
          record.abandonment.metadata,
          undefined,
          options,
          semanticSources,
          "abandoned",
          record.conflict ? "anomaly" : metadata.integrity,
          "unknown",
          record.conflict ? "duplicate_intent" : metadata.anomalyReason,
        ),
      );
      continue;
    }
    if (intent.kind !== "closing") activeEpochs.add(intent.epoch);
    if (matchingHosts.length > 0) {
      const representative = matchingHosts.at(-1);
      const changed = intent.fromPair ? !pairsEqual(intent.fromPair, representative.pair) : "unknown";
      const duplicateReason = record.conflict
        ? "duplicate_intent"
        : correlatedHosts.length > 1
          ? "conflicting_host_results"
          : undefined;
      events.push(
        intentEvent(
          record,
          representative.metadata,
          representative,
          options,
          semanticSources,
          "completed",
          duplicateReason ? "anomaly" : changed === "unknown" ? "unknown" : metadata.integrity,
          changed,
          duplicateReason,
        ),
      );
      continue;
    }
    events.push(
      intentEvent(
        record,
        record.prepared.metadata,
        undefined,
        options,
        semanticSources,
        "unresolved",
        record.conflict || correlatedHosts.length > 0 || metadata.integrity === "anomaly" ? "anomaly" : "unknown",
        "unknown",
        record.conflict
          ? "duplicate_intent"
          : correlatedHosts.length > 0
            ? "host_target_mismatch"
            : metadata.anomalyReason,
      ),
    );
  }
  for (const item of controls) events.push(controlEvent(item.metadata, item.control));
  const routingOwnsHost = activeEpochs.size > 0 && !completedClosing;
  for (const host of hosts) {
    if (usedHostPositions.has(host.metadata.position)) continue;
    events.push(
      hostEvent(
        host,
        host.correlationId || routingOwnsHost ? "anomaly" : "valid",
        host.correlationId ? "correlation_unresolved" : routingOwnsHost ? "host_change_during_routing" : undefined,
      ),
    );
  }
  const scope = options.scope ?? "session";
  const activeIds = activeEntryIds(options.branchEntries);
  const scoped = events.filter((event) => scope !== "active-branch" || activeIds.has(event.entryId));
  const summary = {
    ...(scoped
      .filter((event) => event.classification === "semantic-switch")
      .sort((left, right) => left.representativePosition - right.representativePosition)
      .at(-1)?.id
      ? {
          latestSemanticEventId: scoped
            .filter((event) => event.classification === "semantic-switch")
            .sort((left, right) => left.representativePosition - right.representativePosition)
            .at(-1)?.id,
        }
      : {}),
    ...(scoped
      .filter((event) => event.outcome === "completed" && event.classification !== "control-only")
      .sort((left, right) => left.representativePosition - right.representativePosition)
      .at(-1)?.id
      ? {
          latestCompletedEventId: scoped
            .filter((event) => event.outcome === "completed" && event.classification !== "control-only")
            .sort((left, right) => left.representativePosition - right.representativePosition)
            .at(-1)?.id,
        }
      : {}),
    unresolvedCount: scoped.filter((event) => event.outcome === "unresolved").length,
    anomalyCount: scoped.filter((event) => event.integrity === "anomaly").length,
  };
  const visible = (options.anomaliesOnly ? scoped.filter((event) => event.integrity === "anomaly") : scoped)
    .sort((left, right) => right.representativePosition - left.representativePosition)
    .slice(0, normalizeLimit(options.limit))
    .map(({ representativePosition: _representativePosition, ...event }) => event);
  return { current: currentState(options.current), summary, events: visible };
}
export function readCognitiveRoutingHistory(context, options = {}) {
  let entries = [];
  let branchEntries = [];
  try {
    entries = context?.sessionManager?.getEntries?.() ?? [];
    branchEntries = context?.sessionManager?.getBranch?.() ?? entries;
  } catch {
    entries = [];
    branchEntries = [];
  }
  return projectCognitiveRoutingHistory(entries, { ...options, branchEntries });
}

import { COGNITIVE_ROUTING_DIAGNOSTIC_ENTRY } from "./diagnostics.js";
import type {
  CognitiveRoutingDiagnostic,
  CognitiveRoutingDiagnosticModelState,
  CognitiveRoutingDiagnosticStage,
} from "./diagnostics.js";
import { PI_SESSION_MODEL_STATE_ENTRY, parsePiSessionModelStateCommit } from "./pi-session-control.js";
import type { CognitiveRoutingProfileName } from "./types.js";

const COGNITIVE_ROUTING_INTENT_ENTRY = "freeflow-cognitive-routing-intent";
const COGNITIVE_ROUTING_CONTROL_ENTRY = "freeflow-cognitive-routing-control";
const UNKNOWN = "unknown";

export type CognitiveRoutingHistoryScope = "session" | "active-branch";
export type CognitiveRoutingHistoryClassification =
  | "semantic-switch"
  | "lifecycle-replay"
  | "initialization"
  | "return-target-restore"
  | "control-only"
  | "external-host-change";
export type CognitiveRoutingHistoryDecisionSource = "user" | "agent" | "none" | "unknown";
export type CognitiveRoutingHistoryOutcome = "completed" | "unresolved" | "abandoned" | "external";
export type CognitiveRoutingHistoryIntegrity = "valid" | "unknown" | "anomaly";

export type CognitiveRoutingHistoryPair = {
  provider: string;
  modelId: string;
  thinkingLevel: string;
};

export type CognitiveRoutingHistoryCurrent = {
  control: "automatic" | "manual" | "unavailable";
  profile: CognitiveRoutingProfileName | "unavailable";
};

export type CognitiveRoutingHistoryEvent = {
  id: string;
  timestamp?: string;
  jsonlPosition: number;
  entryId: string;
  parentId?: string;
  branchAnchor?: string;
  classification: CognitiveRoutingHistoryClassification;
  decisionSource: CognitiveRoutingHistoryDecisionSource;
  mechanism?: string;
  outcome: CognitiveRoutingHistoryOutcome;
  changed: boolean | "unknown";
  integrity: CognitiveRoutingHistoryIntegrity;
  from?: CognitiveRoutingProfileName;
  to?: CognitiveRoutingProfileName;
  control?: "automatic" | "manual";
  reason?: string;
  epoch?: string;
  correlationId?: string;
  decisionCorrelationId?: string;
  hostOrigin?: unknown;
  anomalyReason?: string;
};

export type CognitiveRoutingProjectionDiagnostic = CognitiveRoutingDiagnostic & {
  id: string;
  timestamp?: string;
  jsonlPosition: number;
  entryId: string;
  parentId?: string;
  branchAnchor?: string;
};

export type CognitiveRoutingProjectionHealth = {
  scope: CognitiveRoutingHistoryScope;
  status: "available" | "unavailable";
  reason?: string;
  summary: {
    scope: CognitiveRoutingHistoryScope;
    diagnosticCount: number;
    invalidCount: number;
    latestDiagnosticId?: string;
  };
  diagnostics: CognitiveRoutingProjectionDiagnostic[];
};

export type CognitiveRoutingHistoryResult = {
  status: "available" | "unavailable";
  scope: CognitiveRoutingHistoryScope;
  reason?: string;
  current: CognitiveRoutingHistoryCurrent;
  summary: {
    scope: CognitiveRoutingHistoryScope;
    latestSemanticEventId?: string;
    latestCompletedEventId?: string;
    unresolvedCount: number;
    anomalyCount: number;
  };
  events: CognitiveRoutingHistoryEvent[];
  projection: CognitiveRoutingProjectionHealth;
};

export type CognitiveRoutingHistoryOptions = {
  branchEntries?: readonly unknown[];
  scope?: CognitiveRoutingHistoryScope;
  anomaliesOnly?: boolean;
  limit?: number;
  current?: CognitiveRoutingHistoryCurrent;
  profilePairs?: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingHistoryPair>>;
  profileForPair?: (pair: CognitiveRoutingHistoryPair) => CognitiveRoutingProfileName | undefined;
};

export type CognitiveRoutingHistoryContext = {
  sessionManager?: {
    getEntries?: () => readonly unknown[];
    getBranch?: () => readonly unknown[];
  };
};

type EntryRecord = Record<string, unknown>;
type HistoryVersion = 1 | 2;
type IntentSource = "system" | "user" | "agent" | "unknown";

type ParsedIntent = {
  version: HistoryVersion;
  kind: "activation" | "profile" | "closing";
  phase: "prepared" | "abandoned";
  control: "automatic" | "manual";
  source: IntentSource;
  reason?: string;
  branchId?: string | null;
  epoch: string;
  correlationId: string;
  profile?: CognitiveRoutingProfileName;
  resumeProfile?: CognitiveRoutingProfileName;
  resumeControl?: "automatic" | "manual";
  resumeReason?: string;
  target: CognitiveRoutingHistoryPair;
  returnTarget: CognitiveRoutingHistoryPair;
  mechanism?: string;
  decisionCorrelationId?: string;
  fromPair?: CognitiveRoutingHistoryPair;
  fromProfile?: CognitiveRoutingProfileName;
};

type ParsedControl = {
  version: HistoryVersion;
  control: "automatic";
  source: "user" | "unknown";
  reason?: string;
  branchId?: string | null;
  epoch?: string;
  mechanism?: string;
};

type EntryMetadata = {
  raw: EntryRecord;
  position: number;
  id: string;
  parentId?: string;
  timestamp?: string;
  branchAnchor?: string;
};

type HostRecord = {
  metadata: EntryMetadata;
  pair?: CognitiveRoutingHistoryPair;
  correlationId?: string;
  hostOrigin?: unknown;
};

type ProjectionDiagnosticParse = CognitiveRoutingProjectionDiagnostic | "invalid";

type ProjectionDiagnosticCollection = {
  diagnostics: CognitiveRoutingProjectionDiagnostic[];
  invalidCount: number;
};

type IntentRecord = {
  prepared: { metadata: EntryMetadata; intent: ParsedIntent };
  abandonment?: { metadata: EntryMetadata; intent: ParsedIntent };
  conflict: boolean;
};

type InternalEvent = CognitiveRoutingHistoryEvent & {
  representativePosition: number;
};

function isRecord(value: unknown): value is EntryRecord {
  return Boolean(value && typeof value === "object");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function profileName(value: unknown): CognitiveRoutingProfileName | undefined {
  return value === "standard" || value === "reasoning" ? value : undefined;
}

function pairFrom(value: unknown): CognitiveRoutingHistoryPair | undefined {
  if (!isRecord(value)) return undefined;
  const provider = stringValue(value.provider);
  const modelId = stringValue(value.modelId ?? value.id);
  const thinkingLevel = stringValue(value.thinkingLevel);
  if (!provider || !modelId || !thinkingLevel) return undefined;
  return { provider, modelId, thinkingLevel };
}

function pairFromEntry(entry: EntryRecord): CognitiveRoutingHistoryPair | undefined {
  return pairFrom({
    provider: entry.provider,
    modelId: entry.modelId,
    thinkingLevel: entry.thinkingLevel,
  });
}

function pairsEqual(
  left: CognitiveRoutingHistoryPair | undefined,
  right: CognitiveRoutingHistoryPair | undefined,
): boolean {
  return (
    left?.provider === right?.provider &&
    left?.modelId === right?.modelId &&
    left?.thinkingLevel === right?.thinkingLevel
  );
}

function validTimestamp(value: unknown): string | undefined {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function metadataFor(entry: unknown, position: number): EntryMetadata {
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

function sourceFrom(value: unknown): IntentSource {
  return value === "user" || value === "agent" || value === "system" ? value : "unknown";
}

function versionFrom(value: unknown): HistoryVersion | undefined {
  return value === 1 || value === 2 ? value : undefined;
}

function parseIntent(value: unknown): ParsedIntent | undefined {
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

function parseControl(value: unknown): ParsedControl | undefined {
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

function eventBase(
  id: string,
  metadata: EntryMetadata,
): Omit<CognitiveRoutingHistoryEvent, "classification" | "decisionSource" | "outcome" | "changed" | "integrity"> {
  return {
    id,
    ...(metadata.timestamp ? { timestamp: metadata.timestamp } : {}),
    jsonlPosition: metadata.position,
    entryId: metadata.id,
    ...(metadata.parentId ? { parentId: metadata.parentId } : {}),
    ...(metadata.branchAnchor ? { branchAnchor: metadata.branchAnchor } : {}),
  };
}

function profileForPair(pair: CognitiveRoutingHistoryPair | undefined, options: CognitiveRoutingHistoryOptions) {
  if (!pair) return undefined;
  if (options.profileForPair) return options.profileForPair(pair);
  for (const profile of ["standard", "reasoning"] as const) {
    if (pairsEqual(pair, options.profilePairs?.[profile])) return profile;
  }
  return undefined;
}

function intentClassification(intent: ParsedIntent): CognitiveRoutingHistoryClassification {
  if (intent.kind === "profile")
    return intent.source === "user" || intent.source === "agent" ? "semantic-switch" : "lifecycle-replay";
  if (intent.kind === "closing") return "return-target-restore";
  return ["reload-restore", "recovery", "session-tree", "session-compact"].includes(intent.mechanism ?? "")
    ? "lifecycle-replay"
    : "initialization";
}

function lifecycleDecisionSource(
  intent: ParsedIntent,
  semanticSources: ReadonlyMap<string, "user" | "agent">,
): CognitiveRoutingHistoryDecisionSource {
  if (intent.kind === "profile" && (intent.source === "user" || intent.source === "agent")) return intent.source;
  if (intent.decisionCorrelationId && semanticSources.get(intent.decisionCorrelationId)) {
    return semanticSources.get(intent.decisionCorrelationId) as "user" | "agent";
  }
  if (intent.kind === "profile" || intent.source === "unknown") return "unknown";
  return "none";
}

function metadataIntegrity(
  intent: ParsedIntent,
  semanticSources: ReadonlyMap<string, "user" | "agent">,
): { integrity: CognitiveRoutingHistoryIntegrity; anomalyReason?: string } {
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
  record: IntentRecord,
  representative: EntryMetadata,
  host: HostRecord | undefined,
  options: CognitiveRoutingHistoryOptions,
  semanticSources: ReadonlyMap<string, "user" | "agent">,
  outcome: CognitiveRoutingHistoryOutcome,
  integrity: CognitiveRoutingHistoryIntegrity,
  changed: boolean | "unknown",
  anomalyReason?: string,
): InternalEvent {
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

function controlEvent(metadata: EntryMetadata, control: ParsedControl): InternalEvent {
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

function hostEvent(
  host: HostRecord,
  integrity: CognitiveRoutingHistoryIntegrity,
  anomalyReason: string | undefined,
): InternalEvent {
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

function activeEntryIds(entries: readonly unknown[] | undefined): Set<string> {
  return new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry, index) => metadataFor(entry, index).id)
      .filter((id) => !id.startsWith(`${UNKNOWN}:`)),
  );
}

function projectionDiagnosticFor(entry: unknown, position: number): ProjectionDiagnosticParse | undefined {
  if (!isRecord(entry) || entry.type !== "custom" || entry.customType !== COGNITIVE_ROUTING_DIAGNOSTIC_ENTRY) {
    return undefined;
  }
  const data = entry.data;
  if (!isRecord(data)) return "invalid";
  const stage = data.stage;
  const modelState = data.modelState;
  const code = stringValue(data.code);
  const message = typeof data.message === "string" && data.message.length > 0 ? data.message : undefined;
  if (
    data.version !== 1 ||
    data.kind !== "projection-failure" ||
    !code ||
    !message ||
    (stage !== "selection_validation" &&
      stage !== "context_assembly" &&
      stage !== "baseline_persistence" &&
      stage !== "attribution" &&
      stage !== "transition") ||
    (modelState !== "unchanged" && modelState !== "changed" && modelState !== "unknown")
  ) {
    return "invalid";
  }
  if (data.position !== undefined && (!Number.isInteger(data.position) || (data.position as number) < 0)) {
    return "invalid";
  }
  const metadata = metadataFor(entry, position);
  const diagnostic: CognitiveRoutingProjectionDiagnostic = {
    version: 1,
    kind: "projection-failure",
    code,
    stage: stage as CognitiveRoutingDiagnosticStage,
    message,
    modelState: modelState as CognitiveRoutingDiagnosticModelState,
    id: `projection:${metadata.id}`,
    jsonlPosition: position,
    entryId: metadata.id,
    ...(metadata.timestamp ? { timestamp: metadata.timestamp } : {}),
    ...(metadata.parentId ? { parentId: metadata.parentId } : {}),
    ...(metadata.branchAnchor ? { branchAnchor: metadata.branchAnchor } : {}),
    ...(stringValue(data.operationId) ? { operationId: stringValue(data.operationId) } : {}),
    ...(stringValue(data.ref) ? { ref: stringValue(data.ref) } : {}),
    ...(stringValue(data.role) ? { role: stringValue(data.role) } : {}),
    ...(stringValue(data.customType) ? { customType: stringValue(data.customType) } : {}),
    ...(data.position === undefined ? {} : { position: data.position as number }),
  };
  return diagnostic;
}

function collectProjectionDiagnostics(
  entries: readonly { entry: unknown; position: number }[],
): ProjectionDiagnosticCollection {
  const diagnostics: CognitiveRoutingProjectionDiagnostic[] = [];
  let invalidCount = 0;
  for (const { entry, position } of entries) {
    const parsed = projectionDiagnosticFor(entry, position);
    if (parsed === "invalid") invalidCount += 1;
    else if (parsed) diagnostics.push(parsed);
  }
  return { diagnostics, invalidCount };
}

function projectionHealth(
  scope: CognitiveRoutingHistoryScope,
  collection: ProjectionDiagnosticCollection,
  options: CognitiveRoutingHistoryOptions,
): CognitiveRoutingProjectionHealth {
  const diagnostics = [...collection.diagnostics].sort((left, right) => right.jsonlPosition - left.jsonlPosition);
  const reason = collection.invalidCount > 0 ? "projection_diagnostic_invalid" : undefined;
  return {
    scope,
    status: reason ? "unavailable" : "available",
    ...(reason ? { reason } : {}),
    summary: {
      scope,
      diagnosticCount: collection.diagnostics.length,
      invalidCount: collection.invalidCount,
      ...(diagnostics[0]?.id ? { latestDiagnosticId: diagnostics[0].id } : {}),
    },
    diagnostics: diagnostics.slice(0, normalizeLimit(options.limit)),
  };
}

function unavailableHistory(options: CognitiveRoutingHistoryOptions, reason: string): CognitiveRoutingHistoryResult {
  const scope = options.scope ?? "session";
  return {
    status: "unavailable",
    scope,
    reason,
    current: currentState(options.current),
    summary: { scope, unresolvedCount: 0, anomalyCount: 0 },
    events: [],
    projection: {
      scope,
      status: "unavailable",
      reason,
      summary: { scope, diagnosticCount: 0, invalidCount: 0 },
      diagnostics: [],
    },
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isInteger(limit)) return 20;
  return Math.max(1, Math.min(100, limit as number));
}

function currentState(current: CognitiveRoutingHistoryCurrent | undefined): CognitiveRoutingHistoryCurrent {
  return {
    control: current?.control === "automatic" || current?.control === "manual" ? current.control : "unavailable",
    profile: current?.profile === "standard" || current?.profile === "reasoning" ? current.profile : "unavailable",
  };
}

export function projectCognitiveRoutingHistory(
  entries: readonly unknown[],
  options: CognitiveRoutingHistoryOptions = {},
): CognitiveRoutingHistoryResult {
  const scope = options.scope ?? "session";
  const sourceEntries = Array.isArray(entries) ? entries : [];
  const activeIds = scope === "active-branch" ? activeEntryIds(options.branchEntries ?? sourceEntries) : undefined;
  const scopedEntries = sourceEntries.flatMap((entry, position) => {
    if (activeIds && !activeIds.has(metadataFor(entry, position).id)) return [];
    return [{ entry, position }];
  });
  const projectionDiagnostics = collectProjectionDiagnostics(scopedEntries);
  const intentRecords = new Map<string, IntentRecord>();
  const controls: Array<{ metadata: EntryMetadata; control: ParsedControl }> = [];
  const hosts: HostRecord[] = [];
  const semanticSources = new Map<string, "user" | "agent">();

  for (const { entry, position } of scopedEntries) {
    const metadata = metadataFor(entry, position);
    if (!isRecord(entry)) continue;
    if (entry.type === "custom" && entry.customType === COGNITIVE_ROUTING_INTENT_ENTRY) {
      const parsed = parseIntent(entry.data);
      if (!parsed) continue;
      if (parsed.phase === "abandoned") {
        const existing = intentRecords.get(parsed.correlationId);
        if (existing) existing.abandonment = { metadata, intent: parsed };
        continue;
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
      continue;
    }
    if (entry.type === "custom" && entry.customType === COGNITIVE_ROUTING_CONTROL_ENTRY) {
      const parsed = parseControl(entry.data);
      if (parsed) controls.push({ metadata, control: parsed });
      continue;
    }
    if (entry.type === "custom" && entry.customType === PI_SESSION_MODEL_STATE_ENTRY) {
      const parsed = parsePiSessionModelStateCommit(entry.data);
      if (!parsed || parsed.phase !== "committed" || parsed.status !== "applied") continue;
      hosts.push({
        metadata,
        pair: parsed.target,
        correlationId: parsed.correlationId,
        hostOrigin: parsed.origin,
      });
      continue;
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
  }

  const usedHostPositions = new Set<number>();
  const events: InternalEvent[] = [];
  const closingPositionsByEpoch = new Map<string, number[]>();
  const nonClosingStartsByEpoch = new Map<string, number[]>();

  for (const record of intentRecords.values()) {
    const intent = record.prepared.intent;
    const correlatedHosts = hosts.filter((host) => host.correlationId === intent.correlationId);
    const matchingHosts = correlatedHosts.filter((host) => pairsEqual(host.pair, intent.target));
    correlatedHosts.forEach((host) => usedHostPositions.add(host.metadata.position));
    if (record.abandonment) continue;
    if (intent.kind === "closing") {
      if (matchingHosts.length > 0) {
        const positions = closingPositionsByEpoch.get(intent.epoch) ?? [];
        positions.push(...matchingHosts.map((host) => host.metadata.position));
        closingPositionsByEpoch.set(intent.epoch, positions);
      }
    } else {
      const starts = nonClosingStartsByEpoch.get(intent.epoch) ?? [];
      starts.push(record.prepared.metadata.position);
      nonClosingStartsByEpoch.set(intent.epoch, starts);
    }
  }

  const routingOwnsHostAt = (position: number): boolean => {
    for (const [epoch, starts] of nonClosingStartsByEpoch) {
      const startsBeforeHost = starts.filter((start) => start <= position);
      if (startsBeforeHost.length === 0) continue;
      const latestStart = Math.max(...startsBeforeHost);
      const closed = (closingPositionsByEpoch.get(epoch) ?? []).some(
        (closingPosition) => closingPosition >= latestStart && closingPosition <= position,
      );
      if (!closed) return true;
    }
    return false;
  };

  for (const record of intentRecords.values()) {
    const intent = record.prepared.intent;
    const correlatedHosts = hosts.filter((host) => host.correlationId === intent.correlationId);
    const matchingHosts = correlatedHosts.filter((host) => pairsEqual(host.pair, intent.target));
    const metadata = metadataIntegrity(intent, semanticSources);

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

    if (matchingHosts.length > 0) {
      const representative = matchingHosts.at(-1) as HostRecord;
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

  for (const host of hosts) {
    if (usedHostPositions.has(host.metadata.position)) continue;
    const ownsHost = routingOwnsHostAt(host.metadata.position);
    events.push(
      hostEvent(
        host,
        host.correlationId || ownsHost ? "anomaly" : "valid",
        host.correlationId ? "correlation_unresolved" : ownsHost ? "host_change_during_routing" : undefined,
      ),
    );
  }

  const visibleEvents = options.anomaliesOnly ? events.filter((event) => event.integrity === "anomaly") : events;
  const visible = [...visibleEvents]
    .sort((left, right) => right.representativePosition - left.representativePosition)
    .slice(0, normalizeLimit(options.limit));
  const summary = {
    scope,
    ...(events
      .filter((event) => event.classification === "semantic-switch")
      .sort((left, right) => left.representativePosition - right.representativePosition)
      .at(-1)?.id
      ? {
          latestSemanticEventId: events
            .filter((event) => event.classification === "semantic-switch")
            .sort((left, right) => left.representativePosition - right.representativePosition)
            .at(-1)?.id,
        }
      : {}),
    ...(events
      .filter((event) => event.outcome === "completed" && event.classification !== "control-only")
      .sort((left, right) => left.representativePosition - right.representativePosition)
      .at(-1)?.id
      ? {
          latestCompletedEventId: events
            .filter((event) => event.outcome === "completed" && event.classification !== "control-only")
            .sort((left, right) => left.representativePosition - right.representativePosition)
            .at(-1)?.id,
        }
      : {}),
    unresolvedCount: events.filter((event) => event.outcome === "unresolved").length,
    anomalyCount: events.filter((event) => event.integrity === "anomaly").length,
  };
  return {
    status: "available",
    scope,
    current: currentState(options.current),
    summary,
    events: visible.map(({ representativePosition: _representativePosition, ...event }) => event),
    projection: projectionHealth(scope, projectionDiagnostics, options),
  };
}

export function readCognitiveRoutingHistory(
  context: CognitiveRoutingHistoryContext | undefined,
  options: CognitiveRoutingHistoryOptions = {},
): CognitiveRoutingHistoryResult {
  const manager = context?.sessionManager;
  if (!manager || typeof manager.getEntries !== "function") {
    return unavailableHistory(options, "session_entries_unavailable");
  }

  let entries: readonly unknown[];
  try {
    const value = manager.getEntries();
    if (!Array.isArray(value)) return unavailableHistory(options, "session_entries_unavailable");
    entries = value;
  } catch {
    return unavailableHistory(options, "session_read_failed");
  }

  let branchEntries: readonly unknown[] | undefined = options.branchEntries;
  if (options.scope === "active-branch") {
    if (typeof manager.getBranch !== "function") return unavailableHistory(options, "active_branch_unavailable");
    try {
      const value = manager.getBranch();
      if (!Array.isArray(value)) return unavailableHistory(options, "active_branch_unavailable");
      branchEntries = value;
    } catch {
      return unavailableHistory(options, "active_branch_read_failed");
    }
  } else if (typeof manager.getBranch === "function") {
    try {
      const value = manager.getBranch();
      if (Array.isArray(value)) branchEntries = value;
    } catch {
      // Session-wide history remains readable when the optional branch view is unavailable.
    }
  }

  return projectCognitiveRoutingHistory(entries, { ...options, ...(branchEntries ? { branchEntries } : {}) });
}

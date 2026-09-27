const DOMAINS = ["execution", "routing", "context", "guidance", "accounting", "runtime"];
function record(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function keys(value, required, optional = []) {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key)) &&
    optional.every((key) => !Object.hasOwn(value, key) || value[key] !== undefined)
  );
}
export function isStoreIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value);
}
const id = isStoreIdentifier;
function label(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096;
}
function digest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function domain(value) {
  return DOMAINS.includes(value);
}
function sourceIdentity(value, seen, depth) {
  if (!record(value) || depth > 16 || seen.has(value)) return false;
  seen.add(value);
  const valid =
    keys(value, ["occurrenceId", "domain", "sessionId", "branchAnchor"], ["nativeEntryId", "origin", "contentHash"]) &&
    id(value.occurrenceId) &&
    domain(value.domain) &&
    id(value.sessionId) &&
    id(value.branchAnchor) &&
    (value.nativeEntryId === undefined || id(value.nativeEntryId)) &&
    (value.contentHash === undefined || digest(value.contentHash)) &&
    (value.origin === undefined || sourceIdentity(value.origin, seen, depth + 1));
  seen.delete(value);
  return valid;
}
export function isSourceIdentity(value) {
  return sourceIdentity(value, new Set(), 0);
}
export function isStoreManifest(value) {
  if (
    !record(value) ||
    !keys(value, ["schemaVersion", "storeId", "originSessionId", "host", "createdBy", "domains"]) ||
    value.schemaVersion !== 2 ||
    !id(value.storeId) ||
    !id(value.originSessionId) ||
    !record(value.host) ||
    !keys(value.host, ["id", "contract"]) ||
    value.host.id !== "pi" ||
    value.host.contract !== "0.87.x" ||
    !record(value.createdBy) ||
    !keys(value.createdBy, ["package", "version"]) ||
    !label(value.createdBy.package) ||
    !label(value.createdBy.version) ||
    !record(value.domains)
  )
    return false;
  return Object.entries(value.domains).every(
    ([name, domainValue]) =>
      domain(name) &&
      record(domainValue) &&
      keys(domainValue, ["schema"]) &&
      Number.isSafeInteger(domainValue.schema) &&
      domainValue.schema > 0,
  );
}
export function isArtifactDescriptor(value) {
  if (
    !record(value) ||
    !keys(
      value,
      ["version", "id", "occurrenceId", "domain", "mediaType", "bytes", "sha256", "coverage", "origin", "retention"],
      ["encoding", "segment", "sourceObservation"],
    )
  )
    return false;
  if (
    value.version !== 1 ||
    !id(value.id) ||
    !id(value.occurrenceId) ||
    !domain(value.domain) ||
    !label(value.mediaType) ||
    !count(value.bytes) ||
    !digest(value.sha256) ||
    (value.encoding !== undefined && value.encoding !== "utf-8")
  )
    return false;
  if (value.segment !== undefined) {
    const segment = value.segment;
    if (
      !record(segment) ||
      !keys(segment, ["kind", "sourceRange"]) ||
      !["complete", "head", "tail"].includes(segment.kind) ||
      !record(segment.sourceRange) ||
      !keys(segment.sourceRange, ["startBytes", "endBytes", "totalObservedBytes"])
    )
      return false;
    const { startBytes, endBytes, totalObservedBytes } = segment.sourceRange;
    if (
      !count(startBytes) ||
      !count(endBytes) ||
      !count(totalObservedBytes) ||
      startBytes > endBytes ||
      endBytes > totalObservedBytes ||
      endBytes - startBytes !== value.bytes ||
      (segment.kind === "complete" && (startBytes !== 0 || endBytes !== totalObservedBytes)) ||
      (segment.kind === "head" && startBytes !== 0) ||
      (segment.kind === "tail" && endBytes !== totalObservedBytes)
    )
      return false;
  }
  if (
    value.sourceObservation !== undefined &&
    (!record(value.sourceObservation) ||
      !keys(value.sourceObservation, ["observedBytes", "observedSha256"]) ||
      !count(value.sourceObservation.observedBytes) ||
      !digest(value.sourceObservation.observedSha256) ||
      value.sourceObservation.observedBytes < value.bytes ||
      (record(value.segment) &&
        record(value.segment.sourceRange) &&
        value.sourceObservation.observedBytes !== value.segment.sourceRange.totalObservedBytes))
  )
    return false;
  if (
    !record(value.coverage) ||
    !keys(value.coverage, ["capture", "boundary"], ["detail"]) ||
    !["complete-at-boundary", "limited", "unknown"].includes(value.coverage.capture) ||
    !label(value.coverage.boundary) ||
    (value.coverage.detail !== undefined && !label(value.coverage.detail))
  )
    return false;
  if (
    !record(value.origin) ||
    !keys(
      value.origin,
      ["producer"],
      ["requestedByExecutionId", "nativeEntryId", "toolCallId", "operation", "source"],
    ) ||
    !label(value.origin.producer) ||
    ["requestedByExecutionId", "nativeEntryId", "toolCallId"].some(
      (key) => value.origin[key] !== undefined && !id(value.origin[key]),
    ) ||
    (value.origin.source !== undefined && !isSourceIdentity(value.origin.source))
  )
    return false;
  if (
    value.origin.operation !== undefined &&
    (!record(value.origin.operation) ||
      !keys(value.origin.operation, ["id", "revision"]) ||
      !id(value.origin.operation.id) ||
      !id(value.origin.operation.revision))
  )
    return false;
  return (
    record(value.retention) &&
    keys(value.retention, ["class"], ["expiresAt"]) &&
    ["session", "task", "explicit"].includes(value.retention.class) &&
    (value.retention.expiresAt === undefined || label(value.retention.expiresAt))
  );
}
function json(value, seen, depth) {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (!Array.isArray(value) && !record(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.length <= 100_000 &&
      Object.keys(value).length === value.length &&
      Array.from({ length: value.length }, (_, index) => index).every(
        (index) => Object.hasOwn(value, index) && json(value[index], seen, depth + 1),
      )
    : Object.keys(value).length <= 100_000 &&
      Object.keys(value).every((key) => {
        const property = Object.getOwnPropertyDescriptor(value, key);
        return property && "value" in property && json(property.value, seen, depth + 1);
      });
  seen.delete(value);
  return valid;
}
export function isStoreEvent(value) {
  if (
    !record(value) ||
    !keys(
      value,
      [
        "version",
        "id",
        "domain",
        "kind",
        "operationId",
        "recordedSessionId",
        "branchAnchor",
        "payload",
        "artifactRefs",
        "payloadHash",
      ],
      ["nativeEntryId"],
    )
  )
    return false;
  return (
    value.version === 1 &&
    id(value.id) &&
    domain(value.domain) &&
    id(value.kind) &&
    id(value.operationId) &&
    id(value.recordedSessionId) &&
    id(value.branchAnchor) &&
    (!Object.hasOwn(value, "nativeEntryId") || id(value.nativeEntryId)) &&
    json(value.payload, new Set(), 0) &&
    Array.isArray(value.artifactRefs) &&
    json(value.artifactRefs, new Set(), 0) &&
    value.artifactRefs.every(id) &&
    new Set(value.artifactRefs).size === value.artifactRefs.length &&
    digest(value.payloadHash)
  );
}

import { sourceIdentityKey } from "../core/source-registry.js";
export const CARRY_FORWARD_SCOPES = ["source", "activity", "artifact"];
export const CARRY_FORWARD_OWNERS = ["model", "artifact", "user"];
export const CARRY_FORWARD_STATES = ["active", "superseded", "retired"];
export class CarryForwardError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "CarryForwardError";
  }
}
const OWNER_RANK = Object.freeze({ model: 0, artifact: 1, user: 2 });
const SCOPE_RANK = Object.freeze({ source: 0, activity: 1, artifact: 2 });
function validText(value, max) {
  return typeof value === "string" && value.trim() !== "" && value.length <= max;
}
function cloneIdentity(value) {
  return Object.freeze({ ...value });
}
function cloneProvenance(value) {
  return Object.freeze({
    rule: value.rule,
    source: cloneIdentity(value.source),
    ...(value.replacement === undefined ? {} : { replacement: cloneIdentity(value.replacement) }),
  });
}
function cloneRecord(value) {
  return Object.freeze({
    ...value,
    meaning: value.meaning.trim().replace(/\s+/gu, " "),
    sources: Object.freeze(value.sources.map(cloneIdentity)),
    ...(value.provenance === undefined ? {} : { provenance: Object.freeze(value.provenance.map(cloneProvenance)) }),
  });
}
function preference(left, right) {
  return OWNER_RANK[left.owner] - OWNER_RANK[right.owner] || SCOPE_RANK[left.scope] - SCOPE_RANK[right.scope];
}
function sameMeaning(left, right) {
  return left.meaning.trim().replace(/\s+/gu, " ") === right.meaning.trim().replace(/\s+/gu, " ");
}
export class CarryForwardRegistry {
  sourceExists;
  records = new Map();
  changes = [];
  constructor(sourceExists) {
    this.sourceExists = sourceExists;
  }
  register(input) {
    const record = this.validateActive(input);
    if (this.records.has(record.id))
      throw new CarryForwardError("duplicate-id", `Carry-forward record already exists: ${record.id}`);
    const duplicates = [...this.records.values()].filter(
      (item) => item.state === "active" && sameMeaning(item, record),
    );
    if (duplicates.some((item) => preference(record, item) <= 0)) {
      throw new CarryForwardError("duplicate-active-meaning", "An equal or stronger active meaning already exists");
    }
    const stored = cloneRecord(record);
    for (const duplicate of duplicates) {
      this.records.set(duplicate.id, cloneRecord({ ...duplicate, state: "superseded", supersededBy: stored.id }));
      this.changes.push({
        recordId: duplicate.id,
        supersededBy: stored.id,
        checkpointId: stored.checkpointId,
        reason: OWNER_RANK[record.owner] > OWNER_RANK[duplicate.owner] ? "owner-precedence" : "broader-scope",
      });
    }
    this.records.set(stored.id, stored);
    return cloneRecord(stored);
  }
  supersede(recordId, replacement, checkpointId) {
    const current = this.records.get(recordId);
    if (current === undefined || current.state !== "active")
      throw new CarryForwardError("not-active", "Carry-forward record is not active");
    if (!validText(checkpointId, 256)) throw new CarryForwardError("invalid-checkpoint", "Checkpoint is invalid");
    const next = this.validateActive(replacement);
    if (next.id === recordId || this.records.has(next.id))
      throw new CarryForwardError("duplicate-id", "Replacement ID already exists");
    if (
      [...this.records.values()].some(
        (item) => item.state === "active" && item.id !== recordId && sameMeaning(item, next),
      )
    ) {
      throw new CarryForwardError("duplicate-active-meaning", "Replacement duplicates another active meaning");
    }
    const stored = cloneRecord(next);
    this.records.set(recordId, cloneRecord({ ...current, state: "superseded", supersededBy: stored.id }));
    this.records.set(stored.id, stored);
    this.changes.push({ recordId, supersededBy: stored.id, checkpointId, reason: "explicit-supersede" });
    return cloneRecord(stored);
  }
  retire(recordId, checkpointId) {
    const current = this.records.get(recordId);
    if (current === undefined || current.state !== "active")
      throw new CarryForwardError("not-active", "Carry-forward record is not active");
    if (!validText(checkpointId, 256)) throw new CarryForwardError("invalid-checkpoint", "Checkpoint is invalid");
    const retired = cloneRecord({ ...current, state: "retired" });
    this.records.set(recordId, retired);
    this.changes.push({ recordId, checkpointId, reason: "explicit-retire" });
    return cloneRecord(retired);
  }
  get(recordId) {
    const value = this.records.get(recordId);
    return value === undefined ? undefined : cloneRecord(value);
  }
  use(recordId, purpose) {
    const value = this.records.get(recordId);
    if (purpose === "working_state") {
      if (value === undefined) return { status: "unavailable", recordId, reason: "missing" };
      if (value.state !== "active") return { status: "unavailable", recordId, reason: "inactive" };
      return { status: "available", recordId, record: cloneRecord(value) };
    }
    if (value === undefined) return { status: "unavailable", recordId, purpose, reason: "missing" };
    if (value.state !== "active") return { status: "unavailable", recordId, purpose, reason: "inactive" };
    return {
      status: "exact-evidence-required",
      recordId,
      purpose,
      sources: Object.freeze(value.sources.map(cloneIdentity)),
    };
  }
  clear() {
    this.records.clear();
    this.changes.length = 0;
  }
  active() {
    return Object.freeze(
      [...this.records.values()]
        .filter((record) => record.state === "active")
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneRecord),
    );
  }
  changesView() {
    return Object.freeze(this.changes.map((change) => Object.freeze({ ...change })));
  }
  validateActive(input) {
    if (!validText(input.id, 256)) throw new CarryForwardError("invalid-id", "Carry-forward ID is invalid");
    if (!validText(input.meaning, 8192))
      throw new CarryForwardError("invalid-meaning", "Carry-forward meaning is invalid");
    if (!CARRY_FORWARD_SCOPES.includes(input.scope) || !CARRY_FORWARD_OWNERS.includes(input.owner)) {
      throw new CarryForwardError("invalid-classification", "Carry-forward scope or owner is invalid");
    }
    if (input.state !== "active" || input.supersededBy !== undefined) {
      throw new CarryForwardError("inactive-record", "Only active carry-forward records may be registered");
    }
    if (!validText(input.checkpointId, 256)) throw new CarryForwardError("invalid-checkpoint", "Checkpoint is invalid");
    if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 128) {
      throw new CarryForwardError("invalid-sources", "Carry-forward sources are invalid");
    }
    if (input.scope === "source" && input.sources.length !== 1) {
      throw new CarryForwardError("source-scope", "Source-scoped carry-forward requires exactly one source");
    }
    const identities = input.sources.map((source) => sourceIdentityKey(source));
    if (new Set(identities).size !== identities.length || input.sources.some((source) => !this.sourceExists(source))) {
      throw new CarryForwardError("unknown-source", "Carry-forward references an unknown or duplicate source");
    }
    if (input.provenance !== undefined) {
      if (!Array.isArray(input.provenance) || input.provenance.length > 32)
        throw new CarryForwardError("invalid-provenance", "Carry-forward provenance is invalid");
      for (const provenance of input.provenance) {
        if (!validText(provenance.rule, 256) || !this.sourceExists(provenance.source))
          throw new CarryForwardError("invalid-provenance", "Carry-forward provenance is invalid");
        if (provenance.replacement !== undefined && !this.sourceExists(provenance.replacement))
          throw new CarryForwardError("invalid-provenance", "Carry-forward replacement is invalid");
      }
    }
    return input;
  }
}

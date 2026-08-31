import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { sha256Text, stableJson } from "../core/stable-json.js";
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const GENESIS_HASH = "0".repeat(64);
const STATES = ["full", "retained", "reference"];
const POLICIES = ["disabled", "shadow", "automatic", "approval"];
const CARRY_FORWARD_SCOPES = ["source", "activity", "artifact"];
const CARRY_FORWARD_OWNERS = ["model", "artifact", "user"];
const DRAFT_FIELDS = new Set([
  "version",
  "kind",
  "sessionId",
  "branchId",
  "checkpointId",
  "policy",
  "changes",
  "pinRefs",
  "unpinRefs",
  "pinSnapshots",
  "proposalDisposition",
  "transactionId",
  "previousHash",
  "recordHash",
  "sequence",
]);
const CHANGE_FIELDS = new Set([
  "sourceRef",
  "identity",
  "from",
  "to",
  "sourceHash",
  "generation",
  "checkpointId",
  "rule",
  "retainedMeaning",
  "carryForward",
  "pinned",
]);
const PIN_SNAPSHOT_FIELDS = new Set(["ref", "priorState", "priorSourceHash", "priorRetainedMeaning"]);
const PROPOSAL_DISPOSITION_FIELDS = new Set(["fingerprint", "disposition"]);
function cloneIdentity(identity) {
  return { ...identity };
}
function cloneChange(change) {
  return {
    ...change,
    identity: cloneIdentity(change.identity),
    ...(change.carryForward === undefined ? {} : { carryForward: { ...change.carryForward } }),
  };
}
function clonePinSnapshot(snapshot) {
  return { ...snapshot };
}
function cloneProposalDisposition(disposition) {
  return { ...disposition };
}
function cloneEntry(entry) {
  return {
    ...entry,
    changes: Object.freeze(entry.changes.map(cloneChange)),
    ...(entry.pinRefs === undefined ? {} : { pinRefs: Object.freeze([...entry.pinRefs]) }),
    ...(entry.unpinRefs === undefined ? {} : { unpinRefs: Object.freeze([...entry.unpinRefs]) }),
    ...(entry.pinSnapshots === undefined
      ? {}
      : { pinSnapshots: Object.freeze(entry.pinSnapshots.map(clonePinSnapshot)) }),
    ...(entry.proposalDisposition === undefined
      ? {}
      : { proposalDisposition: cloneProposalDisposition(entry.proposalDisposition) }),
  };
}
function validText(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function validIdentity(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const identity = value;
  if (Object.keys(identity).some((key) => !["sessionId", "entryId", "toolCallId", "toolName"].includes(key)))
    return false;
  return (
    validText(identity.sessionId, 256) &&
    validText(identity.entryId, 256) &&
    (identity.toolCallId === undefined || validText(identity.toolCallId, 256)) &&
    (identity.toolName === undefined || validText(identity.toolName, 128))
  );
}
function validCarryForward(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const descriptor = value;
  return (
    Object.keys(descriptor).every((key) => ["id", "scope", "owner"].includes(key)) &&
    validText(descriptor.id, 256) &&
    typeof descriptor.scope === "string" &&
    CARRY_FORWARD_SCOPES.includes(descriptor.scope) &&
    typeof descriptor.owner === "string" &&
    CARRY_FORWARD_OWNERS.includes(descriptor.owner)
  );
}
function validPinSnapshot(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value;
  return (
    !Object.keys(snapshot).some((key) => !PIN_SNAPSHOT_FIELDS.has(key)) &&
    validText(snapshot.ref, 512) &&
    (snapshot.priorState === undefined || STATES.includes(snapshot.priorState)) &&
    (snapshot.priorSourceHash === undefined ||
      (typeof snapshot.priorSourceHash === "string" && HASH_PATTERN.test(snapshot.priorSourceHash))) &&
    (snapshot.priorRetainedMeaning === undefined || validText(snapshot.priorRetainedMeaning, 4096))
  );
}
function validProposalDisposition(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const disposition = value;
  return (
    !Object.keys(disposition).some((key) => !PROPOSAL_DISPOSITION_FIELDS.has(key)) &&
    typeof disposition.fingerprint === "string" &&
    HASH_PATTERN.test(disposition.fingerprint) &&
    disposition.disposition === "rejected"
  );
}
function validChange(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const change = value;
  return (
    !Object.keys(change).some((key) => !CHANGE_FIELDS.has(key)) &&
    validText(change.sourceRef, 512) &&
    validIdentity(change.identity) &&
    typeof change.from === "string" &&
    STATES.includes(change.from) &&
    typeof change.to === "string" &&
    STATES.includes(change.to) &&
    (change.from !== change.to || change.retainedMeaning !== undefined) &&
    typeof change.sourceHash === "string" &&
    HASH_PATTERN.test(change.sourceHash) &&
    Number.isSafeInteger(change.generation) &&
    Number(change.generation) > 0 &&
    validText(change.checkpointId, 256) &&
    validText(change.rule, 256) &&
    (change.retainedMeaning === undefined || validText(change.retainedMeaning, 4096)) &&
    (change.carryForward === undefined ||
      (validCarryForward(change.carryForward) && change.retainedMeaning !== undefined)) &&
    (change.pinned === undefined || typeof change.pinned === "boolean")
  );
}
function validateDraft(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContextControlJournalError("definitive", "invalid journal draft");
  }
  if (Object.keys(value).some((key) => !DRAFT_FIELDS.has(key))) {
    throw new ContextControlJournalError("definitive", "journal draft contains an unknown field");
  }
  if (value.version !== 1 || !["batch", "reset", "pin", "disposition"].includes(value.kind)) {
    throw new ContextControlJournalError("definitive", "invalid journal draft version or kind");
  }
  if (
    !validText(value.sessionId, 256) ||
    !validText(value.branchId, 256) ||
    !validText(value.checkpointId, 256) ||
    !validText(value.policy, 32) ||
    !POLICIES.includes(value.policy)
  ) {
    throw new ContextControlJournalError("definitive", "invalid journal draft metadata");
  }
  if (
    !Array.isArray(value.changes) ||
    (value.kind === "batch" ? value.changes.length === 0 : value.changes.length !== 0) ||
    value.changes.some((change) => !validChange(change))
  ) {
    throw new ContextControlJournalError("definitive", "invalid journal draft changes");
  }
  if (value.kind === "disposition" && !validProposalDisposition(value.proposalDisposition)) {
    throw new ContextControlJournalError("definitive", "invalid proposal disposition");
  }
  if (value.kind !== "disposition" && value.proposalDisposition !== undefined) {
    throw new ContextControlJournalError("definitive", "proposal disposition requires disposition journal kind");
  }
  const pinRefs = value.pinRefs ?? [];
  const unpinRefs = value.unpinRefs ?? [];
  const pinSnapshots = value.pinSnapshots ?? [];
  if (!Array.isArray(pinRefs) || !Array.isArray(unpinRefs) || !Array.isArray(pinSnapshots)) {
    throw new ContextControlJournalError("definitive", "invalid journal pin references");
  }
  if (value.kind === "pin" && pinRefs.length + unpinRefs.length === 0) {
    throw new ContextControlJournalError("definitive", "pin journal requires references");
  }
  if (value.kind !== "pin" && (pinRefs.length > 0 || unpinRefs.length > 0 || pinSnapshots.length > 0)) {
    throw new ContextControlJournalError("definitive", "pin references require pin journal kind");
  }
  if (pinRefs.length > 0 && unpinRefs.length > 0) {
    throw new ContextControlJournalError("definitive", "pin journal cannot pin and unpin together");
  }
  if (pinSnapshots.some((snapshot) => !validPinSnapshot(snapshot))) {
    throw new ContextControlJournalError("definitive", "invalid pin snapshots");
  }
  const pinSnapshotRefs = new Set(pinSnapshots.map((snapshot) => snapshot.ref));
  const operationRefs = new Set([...pinRefs, ...unpinRefs]);
  if (
    pinSnapshotRefs.size !== pinSnapshots.length ||
    [...operationRefs].some((ref) => !pinSnapshotRefs.has(ref)) ||
    [...pinRefs, ...unpinRefs].some((ref) => !validText(ref, 512)) ||
    new Set(pinRefs).size !== pinRefs.length ||
    new Set(unpinRefs).size !== unpinRefs.length ||
    pinRefs.some((ref) => unpinRefs.includes(ref))
  ) {
    throw new ContextControlJournalError("definitive", "invalid or duplicate journal pin references");
  }
  if (value.transactionId !== undefined && !validText(value.transactionId, 128)) {
    throw new ContextControlJournalError("definitive", "invalid journal transaction ID");
  }
  if (
    value.previousHash !== undefined &&
    value.previousHash !== GENESIS_HASH &&
    !HASH_PATTERN.test(value.previousHash)
  ) {
    throw new ContextControlJournalError("definitive", "invalid journal previous hash");
  }
  if (value.recordHash !== undefined && !HASH_PATTERN.test(value.recordHash)) {
    throw new ContextControlJournalError("definitive", "invalid journal record hash");
  }
  const refs = new Set();
  for (const change of value.changes) {
    if (refs.has(change.sourceRef)) throw new ContextControlJournalError("definitive", "duplicate journal source");
    refs.add(change.sourceRef);
    if (change.identity.sessionId !== value.sessionId) {
      throw new ContextControlJournalError("definitive", "journal source session mismatch");
    }
  }
}
function hashEntry(entry) {
  const { recordHash: _recordHash, ...withoutHash } = entry;
  void _recordHash;
  return sha256Text(stableJson(withoutHash));
}
function validateEntry(value, previous) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value;
  if (!Number.isSafeInteger(entry.sequence) || entry.sequence <= 0) return false;
  if (entry.previousHash !== (previous?.recordHash ?? GENESIS_HASH)) return false;
  if (typeof entry.recordHash !== "string" || !HASH_PATTERN.test(entry.recordHash)) return false;
  try {
    validateDraft(entry);
    return hashEntry(entry) === entry.recordHash;
  } catch {
    return false;
  }
}
export class ContextControlJournalError extends Error {
  certainty;
  constructor(certainty, message) {
    super(message);
    this.certainty = certainty;
    this.name = "ContextControlJournalError";
  }
}
export class MemoryContextControlJournal {
  entries = [];
  async purge() {
    this.entries.length = 0;
  }
  read(sessionId) {
    return Object.freeze(this.entries.filter((entry) => entry.sessionId === sessionId).map(cloneEntry));
  }
  async append(draft) {
    validateDraft(draft);
    if (draft.transactionId !== undefined) {
      const existing = this.entries.find((entry) => entry.transactionId === draft.transactionId);
      if (existing !== undefined) return cloneEntry(existing);
    }
    const sequence = (this.entries.at(-1)?.sequence ?? 0) + 1;
    const entryWithoutHash = {
      ...draft,
      sequence,
      previousHash: this.entries.at(-1)?.recordHash ?? GENESIS_HASH,
      transactionId: draft.transactionId ?? `cc-tx-${sequence}-${randomUUID()}`,
      changes: Object.freeze(draft.changes.map(cloneChange)),
      ...(draft.pinSnapshots === undefined
        ? {}
        : { pinSnapshots: Object.freeze(draft.pinSnapshots.map(clonePinSnapshot)) }),
    };
    const entry = {
      ...entryWithoutHash,
      recordHash: hashEntry(entryWithoutHash),
    };
    this.entries.push(entry);
    return cloneEntry(entry);
  }
}
export class FileContextControlJournal {
  path;
  queue = Promise.resolve();
  lockToken;
  constructor(path) {
    this.path = path;
  }
  async acquire() {
    if (this.lockToken !== undefined) return;
    const lockPath = `${this.path}.lock`;
    const token = randomUUID();
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify({ pid: process.pid, token })}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.lockToken = token;
    } catch (error) {
      const message =
        error && typeof error === "object" && "code" in error && error.code === "EEXIST"
          ? "sidecar-lock-unavailable"
          : error instanceof Error
            ? error.message
            : String(error);
      throw new ContextControlJournalError("uncertain", message);
    }
  }
  async release() {
    if (this.lockToken === undefined) return;
    const lockPath = `${this.path}.lock`;
    try {
      const lock = JSON.parse(await readFile(lockPath, "utf8"));
      if (lock.token !== this.lockToken) return;
      await rm(lockPath, { force: true });
    } finally {
      this.lockToken = undefined;
    }
  }
  read(sessionId) {
    return Object.freeze(
      this.readAll()
        .filter((entry) => entry.sessionId === sessionId)
        .map(cloneEntry),
    );
  }
  async purge() {
    await this.queue;
    await this.acquire();
    try {
      await rm(this.path, { force: true });
    } finally {
      try {
        await this.release();
      } catch {
        // Preserve a successful sidecar removal even if lock cleanup is already gone.
      }
    }
  }
  append(draft) {
    const result = this.queue.then(
      () => this.appendNow(draft),
      () => this.appendNow(draft),
    );
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async appendNow(draft) {
    validateDraft(draft);
    await this.acquire();
    const existing = this.readAll();
    if (draft.transactionId !== undefined) {
      const previous = existing.find((entry) => entry.transactionId === draft.transactionId);
      if (previous !== undefined) return cloneEntry(previous);
    }
    const sequence = (existing.at(-1)?.sequence ?? 0) + 1;
    const entryWithoutHash = {
      ...draft,
      sequence,
      previousHash: existing.at(-1)?.recordHash ?? GENESIS_HASH,
      transactionId: draft.transactionId ?? `cc-tx-${sequence}-${randomUUID()}`,
      changes: Object.freeze(draft.changes.map(cloneChange)),
      ...(draft.pinSnapshots === undefined
        ? {}
        : { pinSnapshots: Object.freeze(draft.pinSnapshots.map(clonePinSnapshot)) }),
    };
    const entry = {
      ...entryWithoutHash,
      recordHash: hashEntry(entryWithoutHash),
    };
    const line = `${stableJson(entry)}\n`;
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const handle = await open(this.path, "a", 0o600);
      try {
        await handle.writeFile(line, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      const acknowledged = this.readAll().find((item) => item.sequence === sequence);
      if (acknowledged === undefined || stableJson(acknowledged) !== stableJson(entry)) {
        throw new ContextControlJournalError("uncertain", "journal acknowledgement mismatch");
      }
      return cloneEntry(acknowledged);
    } catch (error) {
      if (error instanceof ContextControlJournalError) throw error;
      throw new ContextControlJournalError("uncertain", error instanceof Error ? error.message : String(error));
    }
  }
  readAll() {
    let text;
    try {
      text = readFileSync(this.path, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
      throw new ContextControlJournalError("uncertain", error instanceof Error ? error.message : String(error));
    }
    const entries = [];
    for (const line of text.split(/\r?\n/u).filter(Boolean)) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new ContextControlJournalError("uncertain", "journal contains malformed JSON");
      }
      const previous = entries.at(-1);
      if (!validateEntry(parsed, previous)) {
        throw new ContextControlJournalError("uncertain", "journal contains invalid or non-monotonic chained entry");
      }
      entries.push(parsed);
    }
    return entries;
  }
}

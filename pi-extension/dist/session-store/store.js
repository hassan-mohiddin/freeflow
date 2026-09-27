import { CommittedJournal, JournalError } from "./journal.js";
import { ensureManifest, readManifest } from "./manifest.js";
import { ArtifactStore, physicalStoreBytes, validateArtifactLimits } from "./artifacts.js";
import { isStoreIdentifier, isStoreManifest } from "./contracts.js";
// Event-only store for P1.1. Artifact publication and the complete SessionStore facade arrive in P1.2.
export class JournalEventStore {
  journal;
  constructor(root, storeId, sessionId, branchAnchor, maxReplayBytes) {
    this.journal = new CommittedJournal(root, storeId, sessionId, branchAnchor, maxReplayBytes);
  }
  acquireWriter() {
    return this.journal.acquireWriter();
  }
  releaseWriter(fence) {
    return this.journal.releaseWriter(fence);
  }
  abandonWriter() {
    return this.journal.abandonWriter();
  }
  refreshBranch(fence, nextBranchAnchor) {
    return this.journal.refreshBranch(fence, nextBranchAnchor);
  }
  recover() {
    return this.journal.recover();
  }
  assertWriter(fence) {
    return this.journal.assertWriter(fence);
  }
  estimateFrameBytes(event) {
    return this.journal.estimateFrameBytes(event);
  }
  estimateCheckpointBytes(event) {
    return this.journal.estimateCheckpointBytes(event);
  }
  async appendEvent(event, fence) {
    const entry = await this.journal.append(event, fence);
    return { sequence: entry.sequence, event: entry.event };
  }
  entries() {
    return this.journal.currentEntries();
  }
  findEvent(id) {
    return this.journal.findEvent(id);
  }
  async replay(domain, ancestry) {
    if (
      !isStoreIdentifier(ancestry.sessionId) ||
      ancestry.sessionId !== this.journal.sessionId ||
      !isStoreIdentifier(ancestry.branchAnchor) ||
      !Array.isArray(ancestry.nativeEntryIds) ||
      ancestry.nativeEntryIds.some((id) => !isStoreIdentifier(id)) ||
      new Set(ancestry.nativeEntryIds).size !== ancestry.nativeEntryIds.length ||
      (ancestry.branchAnchor !== "root" && !ancestry.nativeEntryIds.includes(ancestry.branchAnchor)) ||
      (ancestry.nativeOccurrences !== undefined &&
        (!Array.isArray(ancestry.nativeOccurrences) ||
          ancestry.nativeOccurrences.some(
            (owner) =>
              !owner ||
              typeof owner !== "object" ||
              Object.keys(owner).length !== 2 ||
              !isStoreIdentifier(owner.occurrenceId) ||
              !isStoreIdentifier(owner.entryId) ||
              !ancestry.nativeEntryIds.includes(owner.entryId),
          )))
    )
      throw new JournalError("ancestry_invalid", "Replay ancestry does not identify this session.");
    const nativeIds = new Set(ancestry.nativeEntryIds);
    const reachable = new Set([...nativeIds, ancestry.branchAnchor, "root"]);
    const owners = new Map();
    for (const owner of ancestry.nativeOccurrences ?? []) {
      if (owners.has(owner.occurrenceId))
        throw new JournalError("ancestry_invalid", "Native occurrence has ambiguous owners.");
      owners.set(owner.occurrenceId, owner.entryId);
    }
    return this.journal
      .currentEntries()
      .map((entry) => entry.event)
      .filter((event) => {
        if (event.domain !== domain) return false;
        if (event.nativeEntryId) return nativeIds.has(event.nativeEntryId);
        // New execution publications are pending until a verified native result or minimal anchor
        // carries the same occurrence. The write-time leaf is only a fence, not their owner.
        if (
          event.domain === "execution" &&
          ["operation-outcome", "artifact-published", "native-capture"].includes(event.kind)
        ) {
          const occurrence = event.payload?.occurrenceId;
          return isStoreIdentifier(occurrence) && owners.has(occurrence);
        }
        return reachable.has(event.branchAnchor);
      });
  }
  async readAllGuidance() {
    return this.journal
      .currentEntries()
      .map((entry) => entry.event)
      .filter((event) => event.domain === "guidance");
  }
  quarantineTail(fence) {
    return this.journal.quarantineTail(fence);
  }
  status() {
    return this.journal.status();
  }
}
// P1.2 composition is inactive until a caller explicitly opens an injected origin store.
export class SessionStoreRuntime {
  root;
  manifest;
  limits;
  events;
  artifacts;
  queue = Promise.resolve();
  issue;
  constructor(root, manifest, limits) {
    this.root = root;
    this.manifest = manifest;
    this.limits = limits;
    if (
      !isStoreManifest(manifest) ||
      manifest.domains.execution?.schema !== 1 ||
      manifest.domains.guidance?.schema !== 1
    )
      throw new JournalError("manifest_invalid", "Execution and Guidance schemas are required.");
    validateArtifactLimits(limits);
    this.events = new JournalEventStore(root, manifest.storeId, manifest.originSessionId, "root");
  }
  async open() {
    const fence = await this.events.acquireWriter();
    try {
      const recovered = await this.events.recover();
      await ensureManifest(this.root, this.manifest, recovered);
      const artifacts = new ArtifactStore(this.events, this.root, this.manifest, this.limits);
      await artifacts.initialize();
      if ((await physicalStoreBytes(this.root)) > this.limits.totalBytes)
        throw new JournalError("store_quota", "Existing origin store exceeds its injected total-byte limit.");
      this.artifacts = artifacts;
      return fence;
    } catch (error) {
      try {
        await this.events.releaseWriter(fence);
      } catch {
        await this.events.abandonWriter();
      }
      throw error;
    }
  }
  async openReadOnly() {
    await this.events.recover();
    const found = await readManifest(this.root);
    if (!found) throw new JournalError("origin_unavailable", "Origin store manifest is missing.");
    if (found.storeId !== this.manifest.storeId || found.originSessionId !== this.manifest.originSessionId)
      throw new JournalError("manifest_identity", "Origin store identity differs from the admitted descriptor.");
    for (const domain of ["execution", "guidance"])
      if (found.domains[domain]?.schema !== this.manifest.domains[domain]?.schema)
        throw new JournalError("manifest_version", "Origin store domain schema is unsupported.");
    const artifacts = new ArtifactStore(this.events, this.root, found, this.limits);
    await artifacts.initialize(false); // A read-only fork must not recreate a missing origin namespace.
    this.artifacts = artifacts;
  }
  close(fence) {
    return this.serial(() => this.events.releaseWriter(fence));
  }
  abandon() {
    return this.serial(() => this.events.abandonWriter());
  }
  refreshBranch(fence, branchAnchor) {
    return this.serial(() => this.events.refreshBranch(fence, branchAnchor));
  }
  quarantineTail(fence) {
    return this.serial(() => this.events.quarantineTail(fence));
  }
  requireArtifacts() {
    if (!this.artifacts) throw new JournalError("store_unavailable", "Origin store is not open.");
    return this.artifacts;
  }
  serial(work) {
    const pending = this.queue.then(work, work);
    this.queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  assertWritable(fence) {
    this.requireArtifacts();
    return this.events.assertWriter(fence);
  }
  publishArtifact(input, fence) {
    return this.serial(() => this.requireArtifacts().publish(input, fence));
  }
  readArtifact(id, range, access) {
    return this.requireArtifacts().read(id, range, access);
  }
  appendEvent(event, fence) {
    return this.serial(async () => {
      if (event.domain !== "execution" && event.domain !== "guidance")
        throw new JournalError("domain_unavailable", "This tranche writes only Execution and Guidance events.");
      await this.events.assertWriter(fence);
      await this.requireArtifacts().assertPublishedRefs(event.artifactRefs, fence);
      const expectedBytes = this.events.estimateFrameBytes(event) + 2 * this.events.estimateCheckpointBytes(event);
      const duplicate = this.events.findEvent(event.id) !== undefined;
      if (!duplicate && (await physicalStoreBytes(this.root)) + expectedBytes > this.limits.totalBytes) {
        this.issue = "store_quota";
        throw new JournalError("store_quota", "Event append exceeds the injected total-store limit.");
      }
      const acknowledged = await this.events.appendEvent(event, fence);
      if (this.issue === "store_quota") this.issue = undefined;
      return acknowledged;
    });
  }
  replay(domain, ancestry) {
    this.requireArtifacts();
    return this.events.replay(domain, ancestry);
  }
  // Load once at session binding; Guidance filters native ancestry from memory on tree/compaction.
  replayGuidanceForSession(sessionId) {
    this.requireArtifacts();
    if (sessionId !== this.manifest.originSessionId)
      throw new JournalError("ancestry_invalid", "Guidance session identity differs from the origin store.");
    return this.events.readAllGuidance();
  }
  status() {
    const base = this.events.status();
    const issue = this.artifacts?.statusIssue() ?? this.issue;
    if (base.state !== "ready" || !issue) return base;
    if (issue === "artifact_orphan") return { state: "orphaned", reason: issue };
    if (["artifact_missing", "artifact_changed", "artifact_invalid"].includes(issue))
      return { state: "corrupt", reason: issue };
    return { ...base, reason: issue };
  }
}

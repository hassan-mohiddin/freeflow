import { CommittedJournal, JournalError, type JournalEntry, type JournalRecovery } from "./journal.js";
import { ensureManifest, readManifest } from "./manifest.js";
import { ArtifactStore, physicalStoreBytes, validateArtifactLimits, type ArtifactLimits } from "./artifacts.js";
import {
  isStoreIdentifier,
  isStoreManifest,
  type AcknowledgedEvent,
  type AccessSnapshot,
  type AncestrySnapshot,
  type ArtifactId,
  type ArtifactInput,
  type ByteRange,
  type PublishedArtifact,
  type SessionStore,
  type StoreDomain,
  type StoreEvent,
  type StoreFence,
  type StoreManifest,
  type StoreStatus,
  type VerifiedRange,
} from "./contracts.js";

// Event-only store for P1.1. Artifact publication and the complete SessionStore facade arrive in P1.2.
export class JournalEventStore {
  private readonly journal: CommittedJournal;

  constructor(root: string, storeId: string, sessionId: string, branchAnchor: string, maxReplayBytes?: number) {
    this.journal = new CommittedJournal(root, storeId, sessionId, branchAnchor, maxReplayBytes);
  }

  acquireWriter(): Promise<StoreFence> {
    return this.journal.acquireWriter();
  }

  releaseWriter(fence: StoreFence): Promise<void> {
    return this.journal.releaseWriter(fence);
  }

  abandonWriter(): Promise<void> {
    return this.journal.abandonWriter();
  }

  refreshBranch(fence: StoreFence, nextBranchAnchor: string): Promise<StoreFence> {
    return this.journal.refreshBranch(fence, nextBranchAnchor);
  }

  recover(): Promise<JournalRecovery> {
    return this.journal.recover();
  }

  assertWriter(fence: StoreFence): Promise<void> {
    return this.journal.assertWriter(fence);
  }

  estimateFrameBytes(event: StoreEvent): number {
    return this.journal.estimateFrameBytes(event);
  }

  estimateCheckpointBytes(event: StoreEvent): number {
    return this.journal.estimateCheckpointBytes(event);
  }

  async appendEvent<D extends StoreDomain>(event: StoreEvent<D>, fence: StoreFence): Promise<AcknowledgedEvent<D>> {
    const entry = await this.journal.append(event, fence);
    return { sequence: entry.sequence, event: entry.event as StoreEvent<D> };
  }

  entries(): readonly JournalEntry[] {
    return this.journal.currentEntries();
  }

  findEvent(id: string): JournalEntry | undefined {
    return this.journal.findEvent(id);
  }

  async replay<D extends StoreDomain>(domain: D, ancestry: AncestrySnapshot): Promise<readonly StoreEvent<D>[]> {
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
    const owners = new Map<string, string>();
    for (const owner of ancestry.nativeOccurrences ?? []) {
      if (owners.has(owner.occurrenceId))
        throw new JournalError("ancestry_invalid", "Native occurrence has ambiguous owners.");
      owners.set(owner.occurrenceId, owner.entryId);
    }
    return this.journal
      .currentEntries()
      .map((entry) => entry.event)
      .filter((event): event is StoreEvent<D> => {
        if (event.domain !== domain) return false;
        if (event.nativeEntryId) return nativeIds.has(event.nativeEntryId);
        // New execution publications are pending until a verified native result or minimal anchor
        // carries the same occurrence. The write-time leaf is only a fence, not their owner.
        if (
          event.domain === "execution" &&
          ["operation-outcome", "artifact-published", "native-capture"].includes(event.kind)
        ) {
          const occurrence = (event.payload as { occurrenceId?: unknown })?.occurrenceId;
          return isStoreIdentifier(occurrence) && owners.has(occurrence);
        }
        return reachable.has(event.branchAnchor);
      });
  }

  async readAllGuidance(): Promise<readonly StoreEvent<"guidance">[]> {
    return this.journal
      .currentEntries()
      .map((entry) => entry.event)
      .filter((event): event is StoreEvent<"guidance"> => event.domain === "guidance");
  }

  quarantineTail(fence: StoreFence): Promise<{ bytes: number; sha256: string } | undefined> {
    return this.journal.quarantineTail(fence);
  }

  status() {
    return this.journal.status();
  }
}

// P1.2 composition is inactive until a caller explicitly opens an injected origin store.
export class SessionStoreRuntime implements SessionStore {
  private readonly events: JournalEventStore;
  private artifacts?: ArtifactStore;
  private queue: Promise<void> = Promise.resolve();
  private issue?: string;

  constructor(
    private readonly root: string,
    private readonly manifest: StoreManifest,
    private readonly limits: ArtifactLimits,
  ) {
    if (
      !isStoreManifest(manifest) ||
      manifest.domains.execution?.schema !== 1 ||
      manifest.domains.guidance?.schema !== 1
    )
      throw new JournalError("manifest_invalid", "Execution and Guidance schemas are required.");
    validateArtifactLimits(limits);
    this.events = new JournalEventStore(root, manifest.storeId, manifest.originSessionId, "root");
  }

  async open(): Promise<StoreFence> {
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

  async openReadOnly(): Promise<void> {
    await this.events.recover();
    const found = await readManifest(this.root);
    if (!found) throw new JournalError("origin_unavailable", "Origin store manifest is missing.");
    if (found.storeId !== this.manifest.storeId || found.originSessionId !== this.manifest.originSessionId)
      throw new JournalError("manifest_identity", "Origin store identity differs from the admitted descriptor.");
    for (const domain of ["execution", "guidance"] as const)
      if (found.domains[domain]?.schema !== this.manifest.domains[domain]?.schema)
        throw new JournalError("manifest_version", "Origin store domain schema is unsupported.");
    const artifacts = new ArtifactStore(this.events, this.root, found, this.limits);
    await artifacts.initialize(false); // A read-only fork must not recreate a missing origin namespace.
    this.artifacts = artifacts;
  }

  close(fence: StoreFence): Promise<void> {
    return this.serial(() => this.events.releaseWriter(fence));
  }
  abandon(): Promise<void> {
    return this.serial(() => this.events.abandonWriter());
  }
  refreshBranch(fence: StoreFence, branchAnchor: string): Promise<StoreFence> {
    return this.serial(() => this.events.refreshBranch(fence, branchAnchor));
  }
  quarantineTail(fence: StoreFence): Promise<{ bytes: number; sha256: string } | undefined> {
    return this.serial(() => this.events.quarantineTail(fence));
  }

  private requireArtifacts(): ArtifactStore {
    if (!this.artifacts) throw new JournalError("store_unavailable", "Origin store is not open.");
    return this.artifacts;
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(work, work);
    this.queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }

  assertWritable(fence: StoreFence): Promise<void> {
    this.requireArtifacts();
    return this.events.assertWriter(fence);
  }

  publishArtifact(input: ArtifactInput, fence: StoreFence): Promise<PublishedArtifact> {
    return this.serial(() => this.requireArtifacts().publish(input, fence));
  }
  readArtifact(id: ArtifactId, range: ByteRange, access: AccessSnapshot): Promise<VerifiedRange> {
    return this.requireArtifacts().read(id, range, access);
  }
  appendEvent<D extends StoreDomain>(event: StoreEvent<D>, fence: StoreFence): Promise<AcknowledgedEvent<D>> {
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
  replay<D extends StoreDomain>(domain: D, ancestry: AncestrySnapshot): Promise<readonly StoreEvent<D>[]> {
    this.requireArtifacts();
    return this.events.replay(domain, ancestry);
  }
  // Load once at session binding; Guidance filters native ancestry from memory on tree/compaction.
  replayGuidanceForSession(sessionId: string): Promise<readonly StoreEvent<"guidance">[]> {
    this.requireArtifacts();
    if (sessionId !== this.manifest.originSessionId)
      throw new JournalError("ancestry_invalid", "Guidance session identity differs from the origin store.");
    return this.events.readAllGuidance();
  }
  status(): StoreStatus {
    const base = this.events.status();
    const issue = this.artifacts?.statusIssue() ?? this.issue;
    if (base.state !== "ready" || !issue) return base;
    if (issue === "artifact_orphan") return { state: "orphaned", reason: issue };
    if (["artifact_missing", "artifact_changed", "artifact_invalid"].includes(issue))
      return { state: "corrupt", reason: issue };
    return { ...base, reason: issue };
  }
}

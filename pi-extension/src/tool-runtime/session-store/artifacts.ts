import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

import {
  isArtifactDescriptor,
  type AccessSnapshot,
  type ArtifactDescriptor,
  type ArtifactId,
  type ArtifactInput,
  type ByteRange,
  type PublishedArtifact,
  type StoreFence,
  type StoreManifest,
  type VerifiedRange,
} from "./contracts.js";
import { canonicalStoreJson, JournalError, storeDigest } from "./journal.js";
import type { JournalEventStore } from "./store.js";

const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
const artifactName = (id: string): string | undefined =>
  /^artifact:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    ? `${id.slice("artifact:".length)}.bin`
    : undefined;
const runKey = (descriptor: ArtifactDescriptor): string | undefined =>
  descriptor.origin.requestedByExecutionId ?? descriptor.origin.toolCallId;

export type ArtifactLimits = Readonly<{
  perArtifactBytes: number;
  perRunBytes: number;
  perSessionBytes: number;
  totalBytes: number; // All files in this origin store, including journal, manifest, artifacts, and orphans.
  maxReadBytes: number;
}>;

export async function physicalStoreBytes(root: string): Promise<number> {
  let total = 0;
  const visit = async (directory: string, depth: number): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const value = await lstat(path);
      if (value.isSymbolicLink()) throw new JournalError("store_namespace", "Store contains a symbolic link.");
      if (value.isDirectory()) {
        if (depth !== 0 || !["artifacts", "orphans"].includes(name))
          throw new JournalError("store_namespace", "Store contains an unexpected directory.");
        await visit(path, depth + 1);
      } else if (value.isFile()) {
        total += value.size;
        if (!Number.isSafeInteger(total)) throw new JournalError("store_quota", "Store size exceeds safe accounting.");
      } else throw new JournalError("store_namespace", "Store contains an unsupported entry.");
    }
  };
  await visit(root, 0);
  return total;
}

export function validateArtifactLimits(limits: ArtifactLimits): void {
  if (
    [limits.perArtifactBytes, limits.perRunBytes, limits.perSessionBytes, limits.totalBytes, limits.maxReadBytes].some(
      (value) => !Number.isSafeInteger(value) || value < 1,
    )
  )
    throw new JournalError("artifact_limits", "Injected artifact limits must be positive safe integers.");
}

export class ArtifactStore {
  private readonly root: string;
  private queue: Promise<void> = Promise.resolve();
  private issue?: string;
  private orphaned = false;

  constructor(
    private readonly journal: JournalEventStore,
    private readonly storeRoot: string,
    private readonly manifest: StoreManifest,
    private readonly limits: ArtifactLimits,
  ) {
    validateArtifactLimits(limits);
    this.root = join(storeRoot, "artifacts");
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(work, work);
    this.queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }

  private async directory(create = false): Promise<void> {
    if (create) await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root).catch(() => undefined);
    if (!info || info.isSymbolicLink() || !info.isDirectory())
      throw new JournalError("artifact_namespace", "Artifact namespace is unavailable or invalid.");
  }

  async initialize(create = true): Promise<void> {
    await this.directory(create);
    const accepted = new Set<string>();
    for (const entry of this.journal.entries()) {
      if (entry.event.kind !== "artifact-published") continue;
      const descriptor = entry.event.payload;
      if (
        !isArtifactDescriptor(descriptor) ||
        !artifactName(descriptor.id) ||
        descriptor.domain !== entry.event.domain ||
        entry.event.artifactRefs.length !== 1 ||
        entry.event.artifactRefs[0] !== descriptor.id ||
        accepted.has(descriptor.id)
      )
        throw new JournalError("artifact_descriptor", "Acknowledged artifact identity is invalid or ambiguous.");
      accepted.add(descriptor.id);
    }
    const acceptedNames = new Set([...accepted].map((id) => artifactName(id)));
    const names = await readdir(this.root);
    for (const name of names) {
      const value = await lstat(join(this.root, name));
      if (!value.isFile() || value.isSymbolicLink())
        throw new JournalError("artifact_namespace", "Artifact namespace contains an unsafe entry.");
      if (!acceptedNames.has(name)) this.orphaned = true;
    }
    if ([...acceptedNames].some((name) => !name || !names.includes(name))) this.issue = "artifact_missing";
  }

  private async syncDirectory(): Promise<void> {
    const file = await open(this.root, constants.O_RDONLY | noFollow);
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  }

  private async usage(): Promise<{ total: number; physical: number; byRun: Map<string, number> }> {
    await this.directory();
    let total = 0;
    for (const name of await readdir(this.root)) {
      const value = await lstat(join(this.root, name));
      if (!value.isFile() || value.isSymbolicLink())
        throw new JournalError("artifact_namespace", "Artifact namespace contains an unsafe entry.");
      total += value.size; // Unacknowledged and pending bytes still consume quota.
      if (!Number.isSafeInteger(total))
        throw new JournalError("artifact_quota", "Artifact usage exceeds supported accounting.");
    }
    const byRun = new Map<string, number>();
    for (const entry of this.journal.entries()) {
      if (entry.event.kind !== "artifact-published") continue;
      const descriptor = entry.event.payload;
      if (!isArtifactDescriptor(descriptor))
        throw new JournalError("artifact_descriptor", "Acknowledged artifact descriptor is invalid.");
      const run = runKey(descriptor);
      if (run) byRun.set(run, (byRun.get(run) ?? 0) + descriptor.bytes);
    }
    return { total, physical: await physicalStoreBytes(this.storeRoot), byRun };
  }

  private async verified(descriptor: ArtifactDescriptor, range?: ByteRange): Promise<Buffer> {
    const name = artifactName(descriptor.id);
    if (!name) throw new JournalError("artifact_invalid", "Artifact identity is invalid.");
    await this.directory();
    const path = join(this.root, name);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let existed = false;
    try {
      const named = await lstat(path, { bigint: true });
      existed = true;
      if (!named.isFile() || named.isSymbolicLink())
        throw new JournalError("artifact_invalid", "Artifact is not a regular file.");
      file = await open(path, constants.O_RDONLY | noFollow);
      const before = await file.stat({ bigint: true });
      if (!before.isFile() || before.size !== BigInt(descriptor.bytes))
        throw new JournalError("artifact_changed", "Artifact size differs from its descriptor.");
      const requested = range ?? { startBytes: 0, endBytes: descriptor.bytes };
      const selected = Buffer.alloc(requested.endBytes - requested.startBytes);
      const hash = createHash("sha256");
      let offset = 0;
      while (offset < descriptor.bytes) {
        const chunk = Buffer.alloc(Math.min(64 * 1024, descriptor.bytes - offset));
        const { bytesRead } = await file.read(chunk, 0, chunk.length, offset);
        if (!bytesRead) throw new JournalError("artifact_changed", "Artifact ended before its declared size.");
        hash.update(chunk.subarray(0, bytesRead));
        const start = Math.max(offset, requested.startBytes);
        const end = Math.min(offset + bytesRead, requested.endBytes);
        if (start < end) chunk.copy(selected, start - requested.startBytes, start - offset, end - offset);
        offset += bytesRead;
      }
      const after = await file.stat({ bigint: true });
      const current = await lstat(path, { bigint: true });
      const sig = (info: typeof before) => [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":");
      if (
        sig(named) !== sig(before) ||
        sig(before) !== sig(after) ||
        sig(after) !== sig(current) ||
        hash.digest("hex") !== descriptor.sha256
      )
        throw new JournalError("artifact_changed", "Artifact bytes or identity changed during readback.");
      return selected;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT")
        throw new JournalError(existed ? "artifact_changed" : "artifact_missing", "Artifact is unavailable.");
      if (error instanceof JournalError) throw error;
      throw new JournalError("artifact_read_failed", "Artifact could not be read safely.");
    } finally {
      await file?.close();
    }
  }

  async publish(input: ArtifactInput, fence: StoreFence): Promise<PublishedArtifact> {
    return this.serial(async () => {
      await this.journal.assertWriter(fence);
      if (fence.storeId !== this.manifest.storeId || fence.sessionId !== this.manifest.originSessionId)
        throw new JournalError("artifact_fence", "Store origin changed before publication.");
      const bytes = Buffer.from(input.content); // Freeze caller-owned bytes before validation and publication.
      const id: ArtifactId = `artifact:${randomUUID()}`;
      const descriptor: ArtifactDescriptor = {
        ...input.descriptor,
        version: 1,
        id,
        bytes: bytes.length,
        sha256: storeDigest(bytes),
      };
      if (
        input.descriptor.version !== 1 ||
        !isArtifactDescriptor(descriptor) ||
        !["execution", "guidance"].includes(descriptor.domain) ||
        descriptor.retention.class !== "session" ||
        descriptor.retention.expiresAt !== undefined ||
        (descriptor.origin.source?.sessionId !== undefined && descriptor.origin.source.sessionId !== fence.sessionId) ||
        (descriptor.domain === "execution" && !runKey(descriptor)) ||
        bytes.length === 0 ||
        bytes.length > this.limits.perArtifactBytes
      )
        throw new JournalError("artifact_invalid", "Artifact descriptor, retention, origin, or byte limit is invalid.");
      const event = {
        version: 1 as const,
        id: `event:${randomUUID()}`,
        domain: descriptor.domain,
        kind: "artifact-published",
        operationId: "store.publishArtifact",
        recordedSessionId: fence.sessionId,
        branchAnchor: fence.branchAnchor,
        payload: descriptor as any,
        artifactRefs: [id],
        payloadHash: storeDigest(canonicalStoreJson(descriptor)),
      };
      const usage = await this.usage();
      const run = runKey(descriptor);
      if (
        usage.total + bytes.length > this.limits.perSessionBytes ||
        (run && (usage.byRun.get(run) ?? 0) + bytes.length > this.limits.perRunBytes)
      ) {
        this.issue = "artifact_quota";
        throw new JournalError("artifact_quota", "Artifact publication exceeds an injected run/session quota.");
      }
      // The pending and final names briefly coexist; reserve both plus the descriptor frame.
      if (
        usage.physical +
          2 * bytes.length +
          this.journal.estimateFrameBytes(event) +
          2 * this.journal.estimateCheckpointBytes(event) >
        this.limits.totalBytes
      ) {
        this.issue = "store_quota";
        throw new JournalError("store_quota", "Artifact publication exceeds the injected total-store limit.");
      }
      const name = artifactName(id)!;
      const pending = join(this.root, `.pending-${randomUUID()}.bin`);
      const final = join(this.root, name);
      let file: Awaited<ReturnType<typeof open>> | undefined;
      let fileCreated = false;
      try {
        file = await open(pending, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600);
        fileCreated = true;
        await file.writeFile(bytes);
        await file.sync();
        await file.close();
        file = undefined;
        // Hard-link publication cannot replace another artifact, even if a path appears after reservation.
        await link(pending, final);
        await unlink(pending);
        await this.syncDirectory();
        const verified = await this.verified(descriptor);
        if (!verified.equals(bytes))
          throw new JournalError("artifact_changed", "Artifact readback differs from submitted bytes.");
        // Publication is not accepted until the descriptor event survives journal/head readback.
        await this.journal.appendEvent(event, fence);
        if (["artifact_quota", "store_quota"].includes(this.issue ?? "")) this.issue = undefined;
        return { descriptor };
      } catch (error) {
        if (fileCreated) this.orphaned = true;
        throw error;
      } finally {
        await file?.close();
      }
    });
  }

  async read(id: ArtifactId, range: ByteRange, access: AccessSnapshot): Promise<VerifiedRange> {
    if ((access.originSessionId ?? access.ancestry.sessionId) !== this.manifest.originSessionId)
      throw new JournalError("origin_unavailable", "This reader is not bound to the artifact origin store.");
    if (!access.grantedArtifactIds.includes(id))
      throw new JournalError("artifact_denied", "Artifact access is not granted.");
    const inheritedAncestry = { ...access.ancestry, sessionId: this.manifest.originSessionId };
    const events = await Promise.all(
      ["execution", "guidance"].map((domain) =>
        this.journal.replay(domain as "execution" | "guidance", inheritedAncestry),
      ),
    );
    const matches = events
      .flat()
      .filter(
        (event) =>
          event.kind === "artifact-published" &&
          event.payload &&
          typeof event.payload === "object" &&
          !Array.isArray(event.payload) &&
          (event.payload as any).id === id,
      );
    if (
      matches.length !== 1 ||
      !isArtifactDescriptor(matches[0].payload) ||
      matches[0].artifactRefs.length !== 1 ||
      matches[0].artifactRefs[0] !== id ||
      matches[0].domain !== matches[0].payload.domain
    )
      throw new JournalError("artifact_unavailable", "Artifact descriptor is missing or ambiguous on ancestry.");
    const descriptor = matches[0].payload;
    if (
      !Number.isSafeInteger(range.startBytes) ||
      !Number.isSafeInteger(range.endBytes) ||
      range.startBytes < 0 ||
      range.endBytes < range.startBytes ||
      range.endBytes > descriptor.bytes ||
      range.endBytes - range.startBytes > this.limits.maxReadBytes
    )
      throw new JournalError("artifact_range", "Requested artifact range is invalid or oversized.");
    let body: Buffer;
    try {
      body = await this.verified(descriptor, range);
    } catch (error) {
      if (
        error instanceof JournalError &&
        ["artifact_missing", "artifact_changed", "artifact_invalid"].includes(error.code)
      )
        this.issue = error.code;
      throw error;
    }
    return { descriptor, range: { ...range }, bytes: body, sha256: storeDigest(body) };
  }

  async assertPublishedRefs(refs: readonly ArtifactId[], fence: StoreFence): Promise<void> {
    const events = this.journal
      .entries()
      .filter((entry) => entry.event.kind === "artifact-published")
      .map((entry) => entry.event);
    for (const ref of refs) {
      const descriptors = events.filter(
        (event) =>
          event.payload &&
          typeof event.payload === "object" &&
          !Array.isArray(event.payload) &&
          (event.payload as any).id === ref,
      );
      if (
        descriptors.length !== 1 ||
        !isArtifactDescriptor(descriptors[0].payload) ||
        descriptors[0].recordedSessionId !== fence.sessionId ||
        !["root", fence.branchAnchor].includes(descriptors[0].branchAnchor)
      )
        throw new JournalError("artifact_unavailable", "Event references an unacknowledged artifact.");
      await this.verified(descriptors[0].payload, { startBytes: 0, endBytes: 0 });
    }
  }

  statusIssue(): string | undefined {
    return this.orphaned ? "artifact_orphan" : this.issue;
  }
}

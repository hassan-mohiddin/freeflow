import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { TextDecoder } from "node:util";

import { isStoreEvent, isStoreIdentifier, type StoreEvent, type StoreFence } from "./contracts.js";

const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
const DEFAULT_MAX_REPLAY_BYTES = 32 * 1024 * 1024;
const MAX_HEAD_BYTES = 4096;
const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

// Called only on validated event JSON or internally constructed frame/head/lease values.
function canonical(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`)
    .join(",")}}`;
}

export { canonical as canonicalStoreJson, digest as storeDigest };

export class JournalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "JournalError";
  }
}

type HeadPosition = Readonly<{ sequence: number; endOffset: number; lastFrameSha256: string }>;
type CheckpointRef = Readonly<HeadPosition & { slot: 0 | 1; sha256: string }>;
type Head =
  Readonly<{ version: 1 } & HeadPosition> | Readonly<{ version: 2; checkpoint: CheckpointRef } & HeadPosition>;
export type JournalEntry = Readonly<{ sequence: number; event: StoreEvent }>;
export type JournalRecovery = Readonly<{
  entries: readonly JournalEntry[];
  committedBytes: number;
  trailingBytes: number;
  head?: Head;
}>;
type CommittedView = Readonly<{
  entries: JournalEntry[];
  ids: Map<string, JournalEntry>;
  head: Head;
  lastFrameStart: number;
  trailingBytes: number;
}>;
const CHECKPOINT_EVERY = 128;

function validPosition(value: Record<string, unknown>): boolean {
  return (
    Number.isSafeInteger(value.sequence) &&
    (value.sequence as number) >= 0 &&
    Number.isSafeInteger(value.endOffset) &&
    (value.endOffset as number) >= 0 &&
    ((value.sequence === 0 && value.endOffset === 0 && value.lastFrameSha256 === digest("")) ||
      ((value.sequence as number) > 0 &&
        (value.endOffset as number) > 0 &&
        typeof value.lastFrameSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(value.lastFrameSha256)))
  );
}

function validHead(value: unknown): value is Head {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const head = value as Record<string, unknown>;
  if (!validPosition(head)) return false;
  if (head.version === 1)
    return (
      Object.keys(head).length === 4 &&
      ["version", "sequence", "endOffset", "lastFrameSha256"].every((key) => Object.hasOwn(head, key))
    );
  if (
    head.version !== 2 ||
    Object.keys(head).length !== 5 ||
    !head.checkpoint ||
    typeof head.checkpoint !== "object" ||
    Array.isArray(head.checkpoint)
  )
    return false;
  const ref = head.checkpoint as Record<string, unknown>;
  return (
    Object.keys(ref).length === 5 &&
    ["slot", "sequence", "endOffset", "lastFrameSha256", "sha256"].every((key) => Object.hasOwn(ref, key)) &&
    (ref.slot === 0 || ref.slot === 1) &&
    validPosition(ref) &&
    ref.sequence !== 0 &&
    (ref.sequence as number) <= (head.sequence as number) &&
    (ref.endOffset as number) <= (head.endOffset as number) &&
    typeof ref.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(ref.sha256) &&
    ((ref.sequence as number) < (head.sequence as number) ||
      (ref.endOffset === head.endOffset && ref.lastFrameSha256 === head.lastFrameSha256))
  );
}

function parseJson(text: string, code: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new JournalError(code, "Stored journal JSON is invalid.");
  }
}

function decode(bytes: Uint8Array, code: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new JournalError(code, "Stored journal UTF-8 is invalid.");
  }
}

function freezeStoreValue<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeStoreValue(child);
    Object.freeze(value);
  }
  return value;
}

async function readRegular(path: string, maximum: number, missing: string): Promise<Buffer | undefined> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  let existed = false;
  try {
    const named = await lstat(path, { bigint: true });
    existed = true;
    if (!named.isFile() || named.isSymbolicLink())
      throw new JournalError("read_failed", "Journal file is not a regular file.");
    file = await open(path, constants.O_RDONLY | noFollow);
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximum))
      throw new JournalError("read_limit", "Journal file is not a bounded regular file.");
    const bytes = await file.readFile();
    const after = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    const signature = (value: typeof before) =>
      [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(":");
    if (
      signature(named) !== signature(before) ||
      signature(before) !== signature(after) ||
      signature(after) !== signature(current) ||
      bytes.length !== Number(before.size)
    )
      throw new JournalError("source_changed", "Journal file changed during readback.");
    return bytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      if (existed) throw new JournalError("source_changed", "Journal file disappeared during readback.");
      if (missing === "optional") return undefined;
      throw new JournalError(missing, "Committed journal file is missing.");
    }
    if (error instanceof JournalError) throw error;
    throw new JournalError("read_failed", "Journal file could not be read safely.");
  } finally {
    await file?.close();
  }
}

export class CommittedJournal {
  readonly root: string;
  private readonly logPath: string;
  private readonly headPath: string;
  private readonly leasePath: string;
  private lease?: Awaited<ReturnType<typeof open>>;
  private leaseId?: string;
  private branchAnchor: string;
  private fault?: string;
  private observed: "unchecked" | "ready" | "orphaned" | "corrupt" = "unchecked";
  private view?: CommittedView;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    root: string,
    readonly storeId: string,
    readonly sessionId: string,
    branchAnchor: string,
    private readonly maxReplayBytes = DEFAULT_MAX_REPLAY_BYTES,
  ) {
    if (
      !isStoreIdentifier(storeId) ||
      !isStoreIdentifier(sessionId) ||
      !isStoreIdentifier(branchAnchor) ||
      !Number.isSafeInteger(maxReplayBytes) ||
      maxReplayBytes < 1
    )
      throw new JournalError("journal_identity", "Journal identity or replay limit is invalid.");
    this.root = resolve(root);
    this.logPath = join(this.root, "events.log");
    this.headPath = join(this.root, "head.json");
    this.leasePath = join(this.root, ".writer-lease");
    this.branchAnchor = branchAnchor;
  }

  private async directory(create = false): Promise<boolean> {
    let created = false;
    if (create) {
      try {
        created = (await mkdir(this.root, { recursive: true, mode: 0o700 })) !== undefined;
      } catch {
        throw new JournalError("namespace_unavailable", "Journal namespace cannot be created.");
      }
    }
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(this.root);
    } catch {
      throw new JournalError("namespace_missing", "Journal namespace is unavailable.");
    }
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new JournalError("namespace_invalid", "Journal namespace is not a real directory.");
    return created;
  }

  private async syncDirectory(): Promise<void> {
    const handle = await open(this.root, constants.O_RDONLY | noFollow);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async acquireWriter(): Promise<StoreFence> {
    if (this.lease) throw new JournalError("writer_busy", "Journal already has a writer.");
    // mkdir reports whether this call created the namespace; a preflight existence check would race another writer.
    const fresh = await this.directory(true);
    if (!fresh && !(await this.readHead()))
      throw new JournalError("head_missing", "Existing journal namespace has no committed head.");
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(this.leasePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "EEXIST")
        throw new JournalError("writer_busy", "A writer lease already exists; stale ownership is not reclaimed.");
      throw new JournalError("writer_unavailable", "Writer lease could not be created.");
    }
    const leaseId = randomUUID();
    try {
      await handle.writeFile(canonical({ leaseId, pid: process.pid }));
      await handle.sync();
      await this.syncDirectory();
      if (fresh) await this.publishHead({ version: 1, sequence: 0, endOffset: 0, lastFrameSha256: digest("") });
    } catch {
      await handle.close();
      // A failed lease publication leaves a possibly visible file. Never delete an uncertain lease.
      throw new JournalError("writer_uncertain", "Writer lease publication is uncertain.");
    }
    this.lease = handle;
    this.leaseId = leaseId;
    return Object.freeze({
      storeId: this.storeId,
      sessionId: this.sessionId,
      branchAnchor: this.branchAnchor,
      leaseId,
    });
  }

  private async requireWriter(fence: StoreFence): Promise<void> {
    if (!this.lease || !this.leaseId || this.fault)
      throw new JournalError(this.fault ?? "writer_required", "Journal writer is unavailable.");
    if (
      fence.storeId !== this.storeId ||
      fence.sessionId !== this.sessionId ||
      fence.branchAnchor !== this.branchAnchor ||
      fence.leaseId !== this.leaseId
    )
      throw new JournalError("fence_changed", "Session or branch writer fence changed.");
    const before = await this.lease.stat();
    const current = await lstat(this.leasePath).catch(() => undefined);
    if (!current || !current.isFile() || before.dev !== current.dev || before.ino !== current.ino)
      throw new JournalError("writer_uncertain", "Writer lease no longer names the owned file.");
    const bytes = await readRegular(this.leasePath, MAX_HEAD_BYTES, "writer_uncertain");
    const value = bytes ? parseJson(decode(bytes, "writer_uncertain"), "writer_uncertain") : undefined;
    if (!value || typeof value !== "object" || (value as any).leaseId !== this.leaseId)
      throw new JournalError("writer_uncertain", "Writer lease identity changed.");
  }

  private async checkedView(): Promise<CommittedView> {
    // An uncheckpointed journal keeps its original strict whole-prefix check.
    if (!this.view || this.view.head.version === 1) await this.recover();
    const state = this.view!;
    const head = await this.readHead();
    if (!head || canonical(head) !== canonical(state.head))
      throw new JournalError("head_mismatch", "Committed head changed outside this writer.");
    const { bytes, size } = await this.readLog(state.head.endOffset, this.maxReplayBytes, state.head.sequence === 0);
    if (size !== state.head.endOffset || bytes.length || state.trailingBytes)
      throw new JournalError("tail_repair_required", "Uncommitted tail blocks publication.");
    if (head.version === 2 && head.sequence > head.checkpoint.sequence) {
      const last = await this.readLog(state.lastFrameStart, this.maxReplayBytes, false);
      if (digest(last.bytes.subarray(0, head.endOffset - state.lastFrameStart)) !== head.lastFrameSha256)
        throw new JournalError("head_mismatch", "Committed tail's last frame differs from head.");
    }
    return state;
  }

  async assertWriter(fence: StoreFence): Promise<void> {
    await this.requireWriter(fence);
    await this.checkedView();
  }

  // Branch applicability is native-session state. Lease and head are rechecked before the next write.
  refreshBranch(fence: StoreFence, nextBranchAnchor: string): Promise<StoreFence> {
    return this.serial(async () => {
      if (
        !isStoreIdentifier(nextBranchAnchor) ||
        !this.leaseId ||
        this.fault ||
        fence.storeId !== this.storeId ||
        fence.sessionId !== this.sessionId ||
        fence.branchAnchor !== this.branchAnchor ||
        fence.leaseId !== this.leaseId
      )
        throw new JournalError("fence_changed", "Branch writer fence changed.");
      this.branchAnchor = nextBranchAnchor;
      return Object.freeze({ ...fence, branchAnchor: nextBranchAnchor });
    });
  }

  currentEntries(): readonly JournalEntry[] {
    if (!this.view || this.observed !== "ready")
      throw new JournalError("recovery_required", "Journal has no ready in-memory view.");
    return this.view.entries.slice();
  }

  findEvent(id: string): JournalEntry | undefined {
    return this.view?.ids.get(id);
  }

  // Close a local handle after uncertainty without claiming or deleting the on-disk lease.
  async abandonWriter(): Promise<void> {
    await this.serial(async () => {
      await this.lease?.close();
      this.lease = undefined;
      this.leaseId = undefined;
      this.fault = "writer_abandoned";
    });
  }

  async releaseWriter(fence: StoreFence): Promise<void> {
    await this.serial(async () => {
      await this.requireWriter(fence);
      const owned = await this.lease!.stat();
      const current = await lstat(this.leasePath);
      if (owned.dev !== current.dev || owned.ino !== current.ino)
        throw new JournalError("writer_uncertain", "Writer lease changed before release.");
      await this.lease!.close();
      this.lease = undefined;
      this.leaseId = undefined;
      await unlink(this.leasePath);
      await this.syncDirectory();
    });
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(work, work);
    this.queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }

  private async readHead(): Promise<Head | undefined> {
    const bytes = await readRegular(this.headPath, MAX_HEAD_BYTES, "optional");
    if (!bytes) return undefined;
    const value = parseJson(decode(bytes, "head_corrupt"), "head_corrupt");
    if (!validHead(value)) throw new JournalError("head_corrupt", "Committed journal head is invalid.");
    return value;
  }

  private async readLog(
    start: number,
    maximum: number,
    allowMissing: boolean,
  ): Promise<{ bytes: Buffer; size: number }> {
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let existed = false;
    try {
      const named = await lstat(this.logPath, { bigint: true });
      existed = true;
      if (!named.isFile() || named.isSymbolicLink() || named.size > BigInt(Number.MAX_SAFE_INTEGER))
        throw new JournalError("read_failed", "Journal log is not a bounded regular file.");
      file = await open(this.logPath, constants.O_RDONLY | noFollow);
      const before = await file.stat({ bigint: true });
      const size = Number(before.size);
      if (!before.isFile() || size < start || size - start > maximum)
        throw new JournalError("read_limit", "Journal tail exceeds its configured bound.");
      const bytes = Buffer.alloc(size - start);
      let read = 0;
      while (read < bytes.length) {
        const part = await file.read(bytes, read, bytes.length - read, start + read);
        if (!part.bytesRead) throw new JournalError("source_changed", "Journal log ended during readback.");
        read += part.bytesRead;
      }
      const after = await file.stat({ bigint: true });
      const current = await lstat(this.logPath, { bigint: true });
      const signature = (value: typeof before) =>
        [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(":");
      if (
        signature(named) !== signature(before) ||
        signature(before) !== signature(after) ||
        signature(after) !== signature(current)
      )
        throw new JournalError("source_changed", "Journal log changed during readback.");
      return { bytes, size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        if (existed) throw new JournalError("source_changed", "Journal log disappeared during readback.");
        if (allowMissing && start === 0) return { bytes: Buffer.alloc(0), size: 0 };
        throw new JournalError("committed_prefix_missing", "Committed journal log is missing.");
      }
      if (error instanceof JournalError) throw error;
      throw new JournalError("read_failed", "Journal log could not be read safely.");
    } finally {
      await file?.close();
    }
  }

  private appendParsed(
    raw: Buffer,
    startOffset: number,
    endOffset: number,
    entries: JournalEntry[],
    seen: Map<string, JournalEntry>,
  ): { lastFrameStart: number; lastFrameSha256: string } {
    let offset = 0;
    let lastFrameStart = startOffset;
    let lastFrameSha256 = "";
    while (startOffset + offset < endOffset) {
      const end = raw.indexOf(10, offset);
      if (end < 0 || startOffset + end >= endOffset)
        throw new JournalError("committed_prefix_corrupt", "A committed frame is incomplete.");
      const line = decode(raw.subarray(offset, end), "committed_prefix_corrupt");
      const framed = raw.subarray(offset, end + 1);
      const frame = parseJson(line, "committed_prefix_corrupt") as Record<string, unknown>;
      if (
        !frame ||
        typeof frame !== "object" ||
        Array.isArray(frame) ||
        Object.keys(frame).length !== 4 ||
        !["sequence", "bytes", "bodySha256", "body"].every((key) => Object.hasOwn(frame, key)) ||
        frame.sequence !== entries.length + 1 ||
        !Number.isSafeInteger(frame.bytes) ||
        typeof frame.body !== "string" ||
        typeof frame.bodySha256 !== "string" ||
        Buffer.byteLength(frame.body) !== frame.bytes ||
        digest(frame.body) !== frame.bodySha256
      )
        throw new JournalError("committed_prefix_corrupt", "Committed frame failed integrity or ordering.");
      const event = parseJson(frame.body, "committed_prefix_corrupt");
      if (
        !isStoreEvent(event) ||
        digest(canonical(event.payload)) !== event.payloadHash ||
        canonical(event) !== frame.body ||
        event.recordedSessionId !== this.sessionId
      )
        throw new JournalError("committed_prefix_corrupt", "Committed event failed structure or payload integrity.");
      const previous = seen.get(event.id);
      if (previous && canonical(previous.event) !== frame.body)
        throw new JournalError("event_conflict", "Committed event ID has conflicting values.");
      const entry = Object.freeze({ sequence: frame.sequence as number, event: freezeStoreValue(event) });
      entries.push(entry);
      seen.set(event.id, previous ?? entry);
      lastFrameStart = startOffset + offset;
      lastFrameSha256 = digest(framed);
      offset = end + 1;
    }
    if (startOffset + offset !== endOffset)
      throw new JournalError("committed_prefix_corrupt", "Committed frame boundary differs from head.");
    return { lastFrameStart, lastFrameSha256 };
  }

  private async readCheckpoint(
    ref: CheckpointRef,
  ): Promise<{ entries: JournalEntry[]; seen: Map<string, JournalEntry> }> {
    const bytes = await readRegular(
      join(this.root, `.checkpoint-${ref.slot}.json`),
      this.maxReplayBytes,
      "checkpoint_missing",
    );
    if (!bytes || digest(bytes) !== ref.sha256)
      throw new JournalError("checkpoint_corrupt", "Active checkpoint hash differs from head.");
    const value = parseJson(decode(bytes, "checkpoint_corrupt"), "checkpoint_corrupt") as Record<string, unknown>;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 5 ||
      value.version !== 1 ||
      value.storeId !== this.storeId ||
      value.sessionId !== this.sessionId ||
      !Array.isArray(value.entries) ||
      value.entries.length !== ref.sequence ||
      !value.position ||
      typeof value.position !== "object" ||
      Array.isArray(value.position)
    )
      throw new JournalError("checkpoint_corrupt", "Active checkpoint identity or shape is invalid.");
    const position = value.position as Record<string, unknown>;
    if (
      Object.keys(position).length !== 3 ||
      !validPosition(position) ||
      position.sequence !== ref.sequence ||
      position.endOffset !== ref.endOffset ||
      position.lastFrameSha256 !== ref.lastFrameSha256
    )
      throw new JournalError("checkpoint_corrupt", "Checkpoint position differs from head.");
    const entries: JournalEntry[] = [];
    const seen = new Map<string, JournalEntry>();
    for (const raw of value.entries) {
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        Object.keys(raw).length !== 2 ||
        raw.sequence !== entries.length + 1 ||
        !isStoreEvent(raw.event) ||
        raw.event.recordedSessionId !== this.sessionId ||
        digest(canonical(raw.event.payload)) !== raw.event.payloadHash
      )
        throw new JournalError("checkpoint_corrupt", "Checkpoint event failed identity or integrity.");
      const prior = seen.get(raw.event.id);
      if (prior && canonical(prior.event) !== canonical(raw.event))
        throw new JournalError("checkpoint_corrupt", "Checkpoint event IDs conflict.");
      const entry = Object.freeze({ sequence: raw.sequence as number, event: freezeStoreValue(raw.event) });
      entries.push(entry);
      seen.set(raw.event.id, prior ?? entry);
    }
    return { entries, seen };
  }

  async recover(): Promise<JournalRecovery> {
    try {
      await this.directory();
      const head = await this.readHead();
      if (!head) throw new JournalError("head_missing", "Journal namespace has no committed head.");
      const checkpoint = head.version === 2 ? await this.readCheckpoint(head.checkpoint) : undefined;
      const entries = checkpoint?.entries ?? [];
      const seen = checkpoint?.seen ?? new Map<string, JournalEntry>();
      const base = head.version === 2 ? head.checkpoint.endOffset : 0;
      const { bytes: raw, size } = await this.readLog(base, this.maxReplayBytes, head.sequence === 0);
      if (size < head.endOffset || (head.endOffset > base && raw[head.endOffset - base - 1] !== 0x0a))
        throw new JournalError("committed_prefix_missing", "Committed journal tail is missing or incomplete.");
      const parsed = this.appendParsed(raw, base, head.endOffset, entries, seen);
      const lastFrameSha256 =
        head.endOffset > base
          ? parsed.lastFrameSha256
          : head.version === 2
            ? head.checkpoint.lastFrameSha256
            : digest("");
      if (entries.length !== head.sequence || lastFrameSha256 !== head.lastFrameSha256)
        throw new JournalError("head_mismatch", "Committed head differs from its active checkpoint and journal tail.");
      const trailingBytes = size - head.endOffset;
      this.view = { entries, ids: seen, head, lastFrameStart: parsed.lastFrameStart, trailingBytes };
      this.observed = trailingBytes ? "orphaned" : "ready";
      return { entries: entries.slice(), committedBytes: head.endOffset, trailingBytes, head };
    } catch (error) {
      this.view = undefined;
      this.observed = "corrupt";
      throw error;
    }
  }

  private frame(sequence: number, event: StoreEvent): { line: string; sha256: string } {
    const body = canonical(event);
    const line = `${canonical({ sequence, bytes: Buffer.byteLength(body), bodySha256: digest(body), body })}\n`;
    return { line, sha256: digest(line) };
  }

  estimateFrameBytes(event: StoreEvent): number {
    if (!isStoreEvent(event) || digest(canonical(event.payload)) !== event.payloadHash)
      throw new JournalError("event_invalid", "Cannot reserve bytes for an invalid event.");
    // Head publication briefly keeps both old and new heads, including the v2 checkpoint reference.
    return Buffer.byteLength(this.frame(Number.MAX_SAFE_INTEGER, event).line) + 768;
  }

  estimateCheckpointBytes(event: StoreEvent): number {
    if (!this.view || this.observed !== "ready")
      throw new JournalError("recovery_required", "Cannot reserve a checkpoint before recovery.");
    if (this.view.ids.has(event.id)) return 0;
    const checkpointAt = this.view.head.version === 2 ? this.view.head.checkpoint.sequence : 0;
    if (this.view.head.sequence + 1 - checkpointAt < CHECKPOINT_EVERY) return 0;
    const position = {
      sequence: Number.MAX_SAFE_INTEGER,
      endOffset: Number.MAX_SAFE_INTEGER,
      lastFrameSha256: "f".repeat(64),
    };
    const bytes = Buffer.byteLength(
      canonical({
        version: 1,
        storeId: this.storeId,
        sessionId: this.sessionId,
        position,
        entries: [...this.view.entries, { sequence: this.view.head.sequence + 1, event }],
      }),
    );
    if (bytes > this.maxReplayBytes)
      throw new JournalError("checkpoint_limit", "Current domain view exceeds the bounded checkpoint limit.");
    return bytes;
  }

  private async publishHead(head: Head): Promise<void> {
    const path = join(this.root, `.head-${randomUUID()}`);
    const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600);
    try {
      await file.writeFile(canonical(head));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(path, this.headPath);
    await this.syncDirectory();
  }

  private async publishCheckpoint(state: CommittedView): Promise<void> {
    const slot: 0 | 1 = state.head.version === 2 && state.head.checkpoint.slot === 0 ? 1 : 0;
    const position = {
      sequence: state.head.sequence,
      endOffset: state.head.endOffset,
      lastFrameSha256: state.head.lastFrameSha256,
    };
    const bytes = Buffer.from(
      canonical({
        version: 1,
        storeId: this.storeId,
        sessionId: this.sessionId,
        position,
        entries: state.entries,
      }),
    );
    if (bytes.length > this.maxReplayBytes)
      throw new JournalError("checkpoint_limit", "Current domain view exceeds the bounded checkpoint limit.");
    const destination = join(this.root, `.checkpoint-${slot}.json`);
    const pending = join(this.root, `.checkpoint-${randomUUID()}.tmp`);
    const file = await open(pending, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    // Rotate only a superseded rebuildable cache slot. The journal and artifacts are never removed.
    await rename(pending, destination);
    await this.syncDirectory();
    const verified = await readRegular(destination, this.maxReplayBytes, "checkpoint_missing");
    if (!verified || !verified.equals(bytes))
      throw new JournalError("checkpoint_corrupt", "Checkpoint readback differs from accepted state.");
    const checkpoint: CheckpointRef = { ...position, slot, sha256: digest(verified) };
    const head: Head = { version: 2, ...position, checkpoint };
    await this.publishHead(head);
    if (canonical(await this.readHead()) !== canonical(head))
      throw new JournalError("head_mismatch", "Checkpoint head readback failed.");
    this.view = { ...state, head };
  }

  async append(event: StoreEvent, fence: StoreFence): Promise<JournalEntry> {
    return this.serial(async () => {
      await this.requireWriter(fence);
      if (
        !isStoreEvent(event) ||
        event.recordedSessionId !== this.sessionId ||
        event.branchAnchor !== fence.branchAnchor ||
        digest(canonical(event.payload)) !== event.payloadHash
      )
        throw new JournalError("event_invalid", "Event identity, branch, or payload hash is invalid.");
      const state = await this.checkedView();
      const previous = state.ids.get(event.id);
      if (previous) {
        if (canonical(previous.event) !== canonical(event))
          throw new JournalError("event_conflict", "Event ID changed meaning.");
        return previous;
      }
      const sequence = state.head.sequence + 1;
      const frame = this.frame(sequence, event);
      const bytes = Buffer.from(frame.line);
      const head: Head =
        state.head.version === 2
          ? {
              version: 2,
              sequence,
              endOffset: state.head.endOffset + bytes.length,
              lastFrameSha256: frame.sha256,
              checkpoint: state.head.checkpoint,
            }
          : { version: 1, sequence, endOffset: state.head.endOffset + bytes.length, lastFrameSha256: frame.sha256 };
      try {
        const file = await open(
          this.logPath,
          constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | noFollow,
          0o600,
        );
        try {
          let written = 0;
          while (written < bytes.length) {
            const part = await file.write(bytes, written, bytes.length - written);
            if (!part.bytesWritten) throw new JournalError("append_uncertain", "Journal write made no progress.");
            written += part.bytesWritten;
          }
          await file.sync();
          const info = await file.stat();
          const named = await lstat(this.logPath);
          if (
            !info.isFile() ||
            !named.isFile() ||
            info.dev !== named.dev ||
            info.ino !== named.ino ||
            info.size !== head.endOffset
          )
            throw new JournalError("source_changed", "Journal grew outside this append.");
          await this.publishHead(head);
        } finally {
          await file.close();
        }
        const readback = await this.readHead();
        const committed = await this.readLog(state.head.endOffset, this.maxReplayBytes, false);
        if (
          canonical(readback) !== canonical(head) ||
          committed.size !== head.endOffset ||
          !committed.bytes.equals(bytes)
        )
          throw new JournalError("event_unacknowledged", "Committed readback does not establish this frame.");
        const acceptedEvent = freezeStoreValue(parseJson(canonical(event), "event_invalid") as StoreEvent);
        const last = Object.freeze({ sequence, event: acceptedEvent });
        state.ids.set(event.id, last);
        state.entries.push(last);
        this.view = {
          entries: state.entries,
          ids: state.ids,
          head,
          lastFrameStart: state.head.endOffset,
          trailingBytes: 0,
        };
        this.observed = "ready";
        const checkpointAt = head.version === 2 ? head.checkpoint.sequence : 0;
        if (sequence - checkpointAt >= CHECKPOINT_EVERY) {
          try {
            await this.publishCheckpoint(this.view);
          } catch {
            // The event is already acknowledged. Do not erase its effect or attempt another append.
            this.fault = "checkpoint_uncertain";
          }
        }
        return last;
      } catch (error) {
        // A frame or head may have advanced. Never infer acknowledgment or retry within this instance.
        this.fault = "append_uncertain";
        throw error;
      }
    });
  }

  async quarantineTail(fence: StoreFence): Promise<{ bytes: number; sha256: string } | undefined> {
    return this.serial(async () => {
      await this.requireWriter(fence);
      const state = await this.recover();
      if (!state.trailingBytes) return undefined;
      const { bytes: tail, size } = await this.readLog(state.committedBytes, this.maxReplayBytes, false);
      const sha256 = digest(tail);
      const dir = join(this.root, "orphans");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const info = await lstat(dir);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new JournalError("orphan_unavailable", "Orphan namespace is invalid.");
      const orphan = await open(
        join(dir, `tail-${randomUUID()}.bin`),
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow,
        0o600,
      );
      try {
        await orphan.writeFile(tail);
        await orphan.sync();
      } finally {
        await orphan.close();
      }
      const directory = await open(dir, constants.O_RDONLY | noFollow);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      const file = await open(this.logPath, constants.O_RDWR | noFollow);
      try {
        const before = await file.stat();
        if (!before.isFile() || before.size !== size)
          throw new JournalError("source_changed", "Journal changed before tail quarantine.");
        await file.truncate(state.committedBytes);
        await file.sync();
      } catch (error) {
        this.fault = "tail_uncertain";
        throw error;
      } finally {
        await file.close();
      }
      try {
        await this.syncDirectory();
        await this.recover();
      } catch (error) {
        this.fault = "tail_uncertain";
        throw error;
      }
      return { bytes: tail.length, sha256 };
    });
  }

  status(): { state: "ready" | "unavailable" | "corrupt" | "orphaned"; reason?: string } {
    if (this.fault) return { state: "unavailable", reason: this.fault };
    if (this.observed === "corrupt") return { state: "corrupt", reason: "committed_recovery_failed" };
    if (this.observed === "orphaned") return { state: "orphaned", reason: "tail_repair_required" };
    return this.lease && this.observed === "ready"
      ? { state: "ready" }
      : { state: "unavailable", reason: this.lease ? "recovery_required" : "writer_required" };
  }
}

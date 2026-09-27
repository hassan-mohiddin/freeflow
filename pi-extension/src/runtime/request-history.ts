import { createHash, randomUUID } from "node:crypto";
import type { CacheMonitor } from "../efficiency/cache-monitor.js";
import { persistedBranchMatches } from "../session-sources/read-only-session.js";
import { projectedEntryId } from "../session-sources/sources.js";

const ENTRY = "freeflow-request-history-v1";
const TRANSIENT = new Set([
  "freeflow-runtime-state",
  "freeflow-cognitive-routing-runtime-state",
  "freeflow-routing-v2-state",
  "freeflow-routing-attention",
  "freeflow-routing-budget",
  "freeflow-routing-communication",
]);
// Situational notices describe a condition, not standing state; once absent, the next occurrence is new.
const SITUATIONAL = new Set(["freeflow-routing-attention"]);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fingerprint(message: any): string {
  const { usage: _usage, timestamp: _timestamp, details: _details, ...body } = message;
  return hash(body);
}
interface Injection {
  at: number;
  message: any;
}
interface Frame {
  version: 1;
  id: string;
  basis: string | null;
  view: string;
  generation: string;
  length: number;
  prefix: string;
  parent: string | null;
  states: Record<string, string>;
  retained: string[];
  additions: Injection[];
}
function owned(message: any): boolean {
  return message?.role === "custom" && TRANSIENT.has(message.customType);
}
function parse(value: any): Frame {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    typeof value.view !== "string" ||
    typeof value.generation !== "string" ||
    !(value.basis === null || typeof value.basis === "string") ||
    !Number.isSafeInteger(value.length) ||
    value.length < 0 ||
    !/^[a-f0-9]{64}$/.test(value.prefix) ||
    !(value.parent === null || typeof value.parent === "string") ||
    !value.states ||
    typeof value.states !== "object" ||
    Array.isArray(value.states) ||
    !Object.entries(value.states).every(
      ([key, val]) => TRANSIENT.has(key) && typeof val === "string" && /^[a-f0-9]{64}$/.test(val),
    ) ||
    !Array.isArray(value.retained) ||
    !value.retained.every((x: any) => typeof x === "string") ||
    !Array.isArray(value.additions) ||
    !value.additions.every(
      (x: any) => Number.isSafeInteger(x.at) && x.at >= 0 && x.at <= value.length && owned(x.message),
    )
  )
    throw new Error("Invalid Freeflow context history");
  return value;
}

/** Preserve only Freeflow-generated occurrences. Native content remains owned by Pi and its projectors. */
export class RequestHistory {
  private acknowledged = new Map<string, string>();
  // Pi reuses immutable native entry objects across requests. A replacement object with the
  // same ID must be validated again; a known entry need not be rehashed and reparsed.
  private validatedFrames = new Map<string, { entry: any; hash: string; frame: Frame }>();
  private prefixCache?: { identities: string[]; values: string[] };
  private branchCache?: {
    first: any;
    last: any;
    length: number;
    leaf: string | null;
    generation: string;
    ids: Set<string>;
    frames: Frame[];
    byId: Map<string, Frame>;
  };
  private frameHash = (entry: any): string => {
    const cached = this.validatedFrames.get(entry.id);
    return cached?.entry === entry ? cached.hash : hash(entry);
  };
  // Unedited native entries are immutable, so their fingerprints are computed once per session.
  private fingerprints = new Map<string, string>();
  private fingerprintOf = (message: any): string => {
    const id = projectedEntryId(message);
    if (id === undefined) return fingerprint(message);
    let value = this.fingerprints.get(id);
    if (value === undefined) this.fingerprints.set(id, (value = fingerprint(message)));
    return value;
  };
  private prefixes(messages: any[]): string[] {
    const previous = this.prefixCache;
    const identities: string[] = [];
    const values = [hash([])];
    let samePrefix = true;
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const entryId = projectedEntryId(message);
      // Host-edited/generated messages lack an unedited entry identity and must be hashed anew.
      const body = entryId === undefined ? fingerprint(message) : undefined;
      const identity = entryId === undefined ? `body:${body}` : `entry:${entryId}`;
      identities.push(identity);
      samePrefix = samePrefix && previous?.identities[i] === identity;
      values.push(samePrefix ? previous!.values[i + 1]! : hash([values[i], body ?? this.fingerprintOf(message)]));
    }
    this.prefixCache = { identities, values };
    return values;
  }
  private identity?: string;
  private fault = false;
  private serial: Promise<unknown> = Promise.resolve();
  private revision = 0;
  constructor(
    private readonly pi: any,
    private readonly monitor?: CacheMonitor,
  ) {}
  reset() {
    this.revision++;
    this.acknowledged.clear();
    this.validatedFrames.clear();
    this.prefixCache = undefined;
    this.branchCache = undefined;
    this.fingerprints.clear();
    this.identity = undefined;
    this.fault = false;
  }
  async assemble(messages: any[], view: string, ctx: any, notice?: (messages: any[]) => any): Promise<any[]> {
    const revision = this.revision;
    const operation = this.serial.then(async () => {
      if (revision !== this.revision) return messages;
      try {
        return await this.prepare(messages, view, ctx, revision, notice);
      } catch {
        this.monitor?.set("context-replay", "Freeflow context replay unavailable · current view retained");
        // Keep the already-qualified projected view on failure, never raw hidden history.
        return messages;
      }
    });
    this.serial = operation.catch(() => {});
    return operation;
  }
  private async prepare(
    messages: any[],
    view: string,
    ctx: any,
    revision: number,
    notice?: (messages: any[]) => any,
  ): Promise<any[]> {
    const reader = ctx.sessionManager;
    if (!reader?.getBranch || !reader.getLeafId || !reader.getSessionId || !this.pi.appendEntry) return messages;
    const identity = `${reader.getSessionId()}:${reader.getSessionFile?.() ?? "memory"}`;
    if (this.identity !== identity) {
      this.acknowledged.clear();
      this.validatedFrames.clear();
      this.prefixCache = undefined;
      this.branchCache = undefined;
      this.fingerprints.clear();
      this.fault = false;
      this.identity = identity;
    }
    if (this.fault) throw new Error("Uncertain Freeflow context append");
    const branch = reader.getBranch(),
      leaf = reader.getLeafId();
    const cachedBranch = this.branchCache;
    // Pi appends immutable native entry objects. A sibling/edited branch breaks this exact prefix.
    const extendsCache =
      !!cachedBranch &&
      cachedBranch.length <= branch.length &&
      (cachedBranch.length === 0 ||
        (branch[0] === cachedBranch.first && branch[cachedBranch.length - 1] === cachedBranch.last));
    const start = extendsCache ? cachedBranch.length : 0;
    let parent: string | null = extendsCache ? cachedBranch.leaf : null;
    let generation = extendsCache ? cachedBranch.generation : "root";
    const ids = extendsCache ? cachedBranch.ids : new Set<string>();
    const newIds = new Set<string>();
    for (let i = start; i < branch.length; i++) {
      const entry = branch[i];
      if (entry.parentId !== parent || ids.has(entry.id) || newIds.has(entry.id))
        throw new Error("Invalid context ancestry");
      parent = entry.id;
      newIds.add(entry.id);
      if (entry.type === "compaction" || entry.type === "branch_summary") generation = entry.id;
    }
    if (parent !== leaf) throw new Error("Context leaf changed");
    const newEntries = branch.slice(start).filter((e: any) => e.type === "custom" && e.customType === ENTRY);
    if (
      newEntries.some((e: any) => this.acknowledged.get(e.id) !== this.frameHash(e)) &&
      reader.getSessionFile?.() &&
      branch.some((e: any) => e.message?.role === "assistant")
    ) {
      if (!(await persistedBranchMatches(reader, leaf, branch))) throw new Error("Context history readback differs");
    }
    if (revision !== this.revision || reader.getLeafId() !== leaf) throw new Error("Context changed while preparing");
    const frames: Frame[] = extendsCache ? (newEntries.length ? [...cachedBranch.frames] : cachedBranch.frames) : [];
    const byId = extendsCache
      ? newEntries.length
        ? new Map(cachedBranch.byId)
        : cachedBranch.byId
      : new Map<string, Frame>();
    for (const entry of newEntries) {
      const cached = this.validatedFrames.get(entry.id);
      const same = cached?.entry === entry;
      const frame = same ? cached.frame : parse(entry.data);
      if (
        (frame.basis !== entry.parentId &&
          !(reader.getHeader?.()?.parentSession && !ids.has(frame.basis) && !newIds.has(frame.basis))) ||
        byId.has(frame.id)
      )
        throw new Error("Context frame anchor differs");
      const previous = frame.parent ? byId.get(frame.parent) : undefined;
      if (frame.parent && (!previous || previous.generation !== frame.generation || previous.length > frame.length))
        throw new Error("Context frame parent missing");
      frames.push(frame);
      byId.set(frame.id, frame);
      const entryHash = same ? cached.hash : hash(entry);
      this.acknowledged.set(entry.id, entryHash);
      if (!same) this.validatedFrames.set(entry.id, { entry, hash: entryHash, frame });
    }
    for (const id of newIds) ids.add(id);
    this.branchCache = {
      first: branch[0],
      last: branch.at(-1),
      length: branch.length,
      leaf,
      generation,
      ids,
      frames,
      byId,
    };
    const base = messages.filter((m) => !owned(m));
    const current = messages
      .filter(owned)
      .filter((message) => !notice || message.customType !== "freeflow-routing-budget");
    const hashes = this.prefixes(base);
    const candidates = frames.filter((f) => f.generation === generation && hashes[f.length] === f.prefix);
    const prior = candidates.reduce<Frame | undefined>(
      (best, f) => (!best || f.length >= best.length ? f : best),
      undefined,
    );
    const states = { ...prior?.states },
      additions: Injection[] = [];
    const seenRetained = new Set(prior?.retained ?? []);
    for (const message of current) {
      const signature = fingerprint(message),
        kind = message.customType;
      if (kind === "freeflow-routing-communication" ? seenRetained.has(signature) : states[kind] === signature)
        continue;
      additions.push({ at: base.length, message: structuredClone(message) });
      if (kind === "freeflow-routing-communication") seenRetained.add(signature);
      else states[kind] = signature;
    }
    const present = new Set(current.map((message) => message.customType));
    let cleared = false;
    for (const kind of SITUATIONAL)
      if (states[kind] && !present.has(kind)) {
        delete states[kind];
        cleared = true;
      }
    const injections: Injection[] = [];
    const chain: Frame[] = [];
    for (let cursor = prior; cursor; cursor = cursor.parent ? byId.get(cursor.parent) : undefined)
      chain.unshift(cursor);
    for (const frame of chain) injections.push(...frame.additions);
    injections.push(...additions);
    const result: any[] = [];
    let next = 0;
    for (let i = 0; i <= base.length; i++) {
      while (injections[next]?.at === i) result.push(structuredClone(injections[next++].message));
      if (i < base.length) result.push(base[i]);
    }
    if (next !== injections.length) throw new Error("Context anchor ordering differs");
    if (notice) {
      const warning = notice(result);
      if (warning || states["freeflow-routing-budget"]) {
        const message = warning ?? {
          role: "custom",
          customType: "freeflow-routing-budget",
          display: false,
          content: "Routing budget warning cleared for the current request.",
          timestamp: 0,
        };
        const signature = fingerprint(message);
        if (states[message.customType] !== signature) {
          states[message.customType] = signature;
          additions.push({ at: base.length, message });
          result.push(message);
        }
      }
    }
    // A frame that only advances the length adds no injection its parent lacks and matches no
    // branch its parent does not, so frames are written only when generated state changes.
    if (!prior || additions.length || cleared) {
      const frame: Frame = {
        version: 1,
        id: randomUUID(),
        basis: leaf,
        view,
        generation,
        length: base.length,
        prefix: hashes.at(-1)!,
        parent: prior?.id ?? null,
        states,
        retained: [...seenRetained],
        additions,
      };
      try {
        this.pi.appendEntry(ENTRY, frame);
        const entry = reader.getBranch().find((e: any) => e.customType === ENTRY && e.data?.id === frame.id);
        if (!entry || entry.parentId !== leaf || JSON.stringify(entry.data) !== JSON.stringify(frame))
          throw new Error("Context append not acknowledged");
        const entryHash = hash(entry);
        this.acknowledged.set(entry.id, entryHash);
        this.validatedFrames.set(entry.id, { entry, hash: entryHash, frame });
      } catch (error) {
        this.fault = true;
        throw error;
      }
    }
    this.monitor?.set("context-replay", undefined);
    return result;
  }
}

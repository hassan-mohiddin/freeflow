import { createHash, randomUUID } from "node:crypto";
import { activeReadOnlySessionBranch, readOnlySessionSnapshot } from "../session-sources/read-only-session.js";
const ENTRY = "freeflow-request-history-v1";
const TRANSIENT = new Set([
  "freeflow-runtime-state",
  "freeflow-cognitive-routing-runtime-state",
  "freeflow-routing-v2-state",
  "freeflow-routing-budget",
  "freeflow-routing-communication",
]);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fingerprint(message) {
  const { usage: _usage, timestamp: _timestamp, details: _details, ...body } = message;
  return hash(body);
}
function prefixes(messages) {
  const result = [hash([])];
  for (const message of messages) result.push(hash([result.at(-1), fingerprint(message)]));
  return result;
}
function owned(message) {
  return message?.role === "custom" && TRANSIENT.has(message.customType);
}
function parse(value) {
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
    !value.retained.every((x) => typeof x === "string") ||
    !Array.isArray(value.additions) ||
    !value.additions.every((x) => Number.isSafeInteger(x.at) && x.at >= 0 && x.at <= value.length && owned(x.message))
  )
    throw new Error("Invalid Freeflow context history");
  return value;
}
/** Preserve only Freeflow-generated occurrences. Native content remains owned by Pi and its projectors. */
export class RequestHistory {
  pi;
  acknowledged = new Map();
  identity;
  fault = false;
  serial = Promise.resolve();
  revision = 0;
  constructor(pi) {
    this.pi = pi;
  }
  reset() {
    this.revision++;
    this.acknowledged.clear();
    this.identity = undefined;
    this.fault = false;
  }
  async assemble(messages, view, ctx, notice) {
    const revision = this.revision;
    const operation = this.serial.then(async () => {
      if (revision !== this.revision) return messages;
      try {
        return await this.prepare(messages, view, ctx, revision, notice);
      } catch {
        try {
          ctx.ui?.setStatus?.("freeflow-cache", "Freeflow context replay unavailable · current view retained");
        } catch {}
        // Keep the already-qualified projected view on failure, never raw hidden history.
        return messages;
      }
    });
    this.serial = operation.catch(() => {});
    return operation;
  }
  async prepare(messages, view, ctx, revision, notice) {
    const reader = ctx.sessionManager;
    if (!reader?.getBranch || !reader.getLeafId || !reader.getSessionId || !this.pi.appendEntry) return messages;
    const identity = `${reader.getSessionId()}:${reader.getSessionFile?.() ?? "memory"}`;
    if (this.identity !== identity) {
      this.acknowledged.clear();
      this.fault = false;
      this.identity = identity;
    }
    if (this.fault) throw new Error("Uncertain Freeflow context append");
    const branch = reader.getBranch(),
      leaf = reader.getLeafId();
    let parent = null,
      generation = "root";
    const ids = new Set();
    for (const entry of branch) {
      if (entry.parentId !== parent || ids.has(entry.id)) throw new Error("Invalid context ancestry");
      parent = entry.id;
      ids.add(entry.id);
      if (entry.type === "compaction" || entry.type === "branch_summary") generation = entry.id;
    }
    if (parent !== leaf) throw new Error("Context leaf changed");
    const entries = branch.filter((e) => e.type === "custom" && e.customType === ENTRY);
    if (
      entries.some((e) => this.acknowledged.get(e.id) !== hash(e)) &&
      reader.getSessionFile?.() &&
      branch.some((e) => e.message?.role === "assistant")
    ) {
      const snapshot = await readOnlySessionSnapshot(reader.getSessionFile());
      if (
        snapshot.sessionId !== reader.getSessionId() ||
        JSON.stringify(activeReadOnlySessionBranch(snapshot, leaf)) !== JSON.stringify(branch)
      )
        throw new Error("Context history readback differs");
    }
    if (revision !== this.revision || reader.getLeafId() !== leaf) throw new Error("Context changed while preparing");
    const frames = [],
      byId = new Map();
    for (const entry of entries) {
      const frame = parse(entry.data);
      if (
        (frame.basis !== entry.parentId && !(reader.getHeader?.()?.parentSession && !ids.has(frame.basis))) ||
        byId.has(frame.id)
      )
        throw new Error("Context frame anchor differs");
      const previous = frame.parent ? byId.get(frame.parent) : undefined;
      if (frame.parent && (!previous || previous.generation !== frame.generation || previous.length > frame.length))
        throw new Error("Context frame parent missing");
      frames.push(frame);
      byId.set(frame.id, frame);
      this.acknowledged.set(entry.id, hash(entry));
    }
    const base = messages.filter((m) => !owned(m));
    const current = messages
      .filter(owned)
      .filter((message) => !notice || message.customType !== "freeflow-routing-budget");
    const hashes = prefixes(base);
    const candidates = frames.filter((f) => f.generation === generation && hashes[f.length] === f.prefix);
    const prior = candidates.reduce((best, f) => (!best || f.length >= best.length ? f : best), undefined);
    const states = { ...prior?.states },
      additions = [];
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
    const injections = [];
    const chain = [];
    for (let cursor = prior; cursor; cursor = cursor.parent ? byId.get(cursor.parent) : undefined)
      chain.unshift(cursor);
    for (const frame of chain) injections.push(...frame.additions);
    injections.push(...additions);
    const result = [];
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
    if (!prior || prior.length !== base.length || additions.length) {
      const frame = {
        version: 1,
        id: randomUUID(),
        basis: leaf,
        view,
        generation,
        length: base.length,
        prefix: hashes.at(-1),
        parent: prior?.id ?? null,
        states,
        retained: [...seenRetained],
        additions,
      };
      try {
        this.pi.appendEntry(ENTRY, frame);
        const entry = reader.getBranch().find((e) => e.customType === ENTRY && e.data?.id === frame.id);
        if (!entry || entry.parentId !== leaf || JSON.stringify(entry.data) !== JSON.stringify(frame))
          throw new Error("Context append not acknowledged");
        this.acknowledged.set(entry.id, hash(entry));
      } catch (error) {
        this.fault = true;
        throw error;
      }
    }
    try {
      ctx.ui?.setStatus?.("freeflow-cache", undefined);
    } catch {}
    return result;
  }
}

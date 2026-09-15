import { createHash, randomUUID } from "node:crypto";
export const ENTRY_TYPE = "freeflow-astra-effort-v1";
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
export const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const effort = (x) => EFFORTS.includes(x);
const identity = (x) => typeof x === "string" && x.length > 0 && x.length <= 1024;
export function parseAttempt(value) {
  if (
    !value ||
    value.version !== 1 ||
    !identity(value.id) ||
    !(value.basis === null || identity(value.basis)) ||
    !identity(value.key) ||
    !identity(value.generation) ||
    !digest(value.envelope) ||
    !digest(value.inputHash) ||
    !effort(value.baseline) ||
    !effort(value.effective) ||
    !(value.parent === null || identity(value.parent)) ||
    !Number.isSafeInteger(value.length) ||
    value.length < 0 ||
    (value.update !== undefined &&
      (!value.update ||
        !Number.isSafeInteger(value.update.at) ||
        value.update.at < 0 ||
        value.update.at > value.length ||
        !digest(value.update.prefixHash) ||
        !effort(value.update.effort))) ||
    Object.keys(value).some(
      (k) =>
        ![
          "version",
          "id",
          "basis",
          "key",
          "generation",
          "envelope",
          "baseline",
          "effective",
          "parent",
          "length",
          "inputHash",
          "update",
        ].includes(k),
    )
  )
    throw new Error("Invalid Astra effort history");
  return value;
}
// Hash complete serialized items, including opaque reasoning; never persist their bodies.
export function prefixHashes(input) {
  const result = [hash([])];
  for (const item of input) result.push(hash([result.at(-1), item]));
  return result;
}
export function envelopeHash(payload) {
  const { input: _input, prompt_cache_key: _key, max_output_tokens: _max, stream: _stream, ...rest } = payload;
  const { effort: _effort, ...reasoning } = rest.reasoning;
  return hash({ ...rest, reasoning });
}
export function assemble(payload, key, generation, basis, records) {
  const hashes = prefixHashes(payload.input),
    envelope = envelopeHash(payload);
  const applicable = records.filter((r) => r.key === key && r.generation === generation);
  const compatible = applicable.filter((r) => r.envelope === envelope && hashes[r.length] === r.inputHash);
  const prior = compatible.reduce((best, r) => (!best || r.length >= best.length ? r : best), undefined);
  const baseline = prior?.baseline ?? applicable[0]?.baseline ?? payload.reasoning.effort;
  const desired = payload.reasoning.effort;
  const byId = new Map(records.map((r) => [r.id, r]));
  const updates = [];
  const seen = new Set();
  let cursor = prior;
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error("Cyclic Astra history");
    seen.add(cursor.id);
    if (cursor.update) {
      if (hashes[cursor.update.at] !== cursor.update.prefixHash) throw new Error("Astra anchor changed");
      updates.unshift(cursor.update);
    }
    if (cursor.parent === null) break;
    const parent = byId.get(cursor.parent);
    if (!parent || parent.key !== key || parent.generation !== generation || parent.baseline !== baseline)
      throw new Error("Astra history parent unavailable");
    cursor = parent;
  }
  let update;
  if (desired !== (prior?.effective ?? baseline)) {
    // Only insert before a new user item. Within a tool loop, append after all completed exchanges.
    const last = payload.input.length - 1;
    const at = payload.input[last]?.role === "user" && last >= (prior?.length ?? 0) ? last : payload.input.length;
    update = { at, prefixHash: hashes[at], effort: desired };
    if (updates.at(-1)?.at === at) throw new Error("Adjacent Astra effort updates");
    updates.push(update);
  }
  if (updates.some((u, i) => i > 0 && u.at <= updates[i - 1].at)) throw new Error("Invalid Astra update order");
  const output = structuredClone(payload);
  output.input = [];
  let nextUpdate = 0;
  for (let i = 0; i <= payload.input.length; i++) {
    if (updates[nextUpdate]?.at === i) {
      output.input.push({ type: "configuration_update", reasoning: { effort: updates[nextUpdate++].effort } });
    }
    if (i < payload.input.length) output.input.push(structuredClone(payload.input[i]));
  }
  output.reasoning.effort = baseline;
  const identical = prior?.length === payload.input.length && prior.effective === desired;
  const record = identical
    ? undefined
    : {
        version: 1,
        id: randomUUID(),
        basis,
        key,
        generation,
        envelope,
        baseline,
        effective: desired,
        parent: prior?.id ?? null,
        length: payload.input.length,
        inputHash: hashes.at(-1),
        ...(update ? { update } : {}),
      };
  return { payload: output, record, baseline, effective: desired, rebased: !prior && applicable.length > 0 };
}

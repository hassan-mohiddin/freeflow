import { compileSchema, freezeJson, jsonDigest } from "./schema.js";
export class RegistryError extends Error {
  code;
  hint;
  constructor(code, message, hint) {
    super(`${code}: ${message}`);
    this.code = code;
    this.hint = hint;
    this.name = "RegistryError";
  }
}
function keyOf(key) {
  return JSON.stringify([key.id, key.revision]);
}
function v2(operation) {
  return "contractVersion" in operation;
}
function operationFingerprint(operation, input, output) {
  const fields = {
    key: operation.key,
    description: operation.description,
    keywords: [...(operation.keywords ?? [])],
    owner: operation.owner,
    inputSchema: input.schema,
    outputSchema: output.schema,
    effects: [...operation.effects],
    exposure: operation.exposure,
  };
  if (v2(operation)) {
    fields.contractVersion = operation.contractVersion;
    fields.category = operation.category;
    fields.guidance = operation.guidance;
    fields.cancellation = operation.cancellation;
  }
  return jsonDigest(fields);
}
function descriptorFor(operation, input, output) {
  const base = {
    key: Object.freeze({ ...operation.key }),
    description: operation.description,
    keywords: Object.freeze([...(operation.keywords ?? [])]),
    owner: Object.freeze({ ...operation.owner }),
    inputSchema: input.schema,
    outputSchema: output.schema,
    effects: Object.freeze([...operation.effects]),
    exposure: Object.freeze({ ...operation.exposure }),
    fingerprint: operationFingerprint(operation, input, output),
  };
  if (!v2(operation)) return Object.freeze(base);
  return Object.freeze({
    ...base,
    contractVersion: 2,
    category: operation.category,
    guidance: operation.guidance,
    cancellation: operation.cancellation,
  });
}
function validateIdentity(operation) {
  if (!/^[a-z][a-zA-Z0-9._-]{0,127}$/.test(operation.key.id))
    throw new RegistryError("operation_identity", "Operation ID is invalid.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(operation.key.revision))
    throw new RegistryError("operation_identity", "Operation revision is invalid.");
  if (!operation.description.trim() || operation.description.length > 1000)
    throw new RegistryError("operation_descriptor", "Operation description is invalid.");
  if (
    !operation.owner.adapterId ||
    !operation.owner.adapterRevision ||
    !operation.owner.executionWorld ||
    operation.effects.length < 1 ||
    operation.effects.some((effect) => !["captured-read", "live-read", "mutation"].includes(effect))
  )
    throw new RegistryError("operation_descriptor", "Operation owner/effects are invalid.");
  if (
    v2(operation) &&
    (operation.contractVersion !== 2 ||
      !["result", "project", "process", "code", "vcs", "resource", "web", "integration"].includes(operation.category) ||
      typeof operation.guidance?.useWhen !== "string" ||
      !operation.guidance.useWhen.trim() ||
      operation.guidance.useWhen.length > 1000 ||
      Object.getPrototypeOf(operation.guidance) !== Object.prototype ||
      Object.keys(operation.guidance).some((key) => !["useWhen", "avoidWhen", "example"].includes(key)) ||
      (operation.guidance.avoidWhen !== undefined &&
        (typeof operation.guidance.avoidWhen !== "string" ||
          !operation.guidance.avoidWhen.trim() ||
          operation.guidance.avoidWhen.length > 1000)) ||
      !["settles", "reconciles-unknown"].includes(operation.cancellation) ||
      typeof operation.presenter?.model !== "function" ||
      (operation.presenter.ui !== undefined && typeof operation.presenter.ui !== "function"))
  )
    throw new RegistryError("operation_descriptor", "Operation v2 metadata is invalid.");
}
export class OperationRegistry {
  entries = new Map();
  generationRevision = 0;
  prepare(operation) {
    validateIdentity(operation);
    const input = compileSchema(operation.inputSchema);
    const output = compileSchema(operation.outputSchema);
    const stored = Object.freeze({
      ...operation,
      key: Object.freeze({ ...operation.key }),
      keywords: Object.freeze([...(operation.keywords ?? [])]),
      owner: Object.freeze({ ...operation.owner }),
      inputSchema: input.schema,
      outputSchema: output.schema,
      effects: Object.freeze([...operation.effects]),
      exposure: Object.freeze({ ...operation.exposure }),
      ...(v2(operation)
        ? {
            guidance: Object.freeze({
              ...operation.guidance,
              ...(operation.guidance.example !== undefined ? { example: freezeJson(operation.guidance.example) } : {}),
            }),
            presenter: Object.freeze({ ...operation.presenter }),
          }
        : {}),
    });
    const descriptor = descriptorFor(stored, input, output);
    return { key: keyOf(stored.key), entry: { operation: stored, descriptor, input, output, active: true } };
  }
  checkPrepared(prepared, allowCompatibleV2 = false) {
    const keys = new Set();
    const ids = new Set();
    for (const candidate of prepared) {
      const operation = candidate.entry.operation;
      if (keys.has(candidate.key))
        throw new RegistryError("operation_duplicate", "Operation bundle repeats a key/revision.", operation.key);
      if (ids.has(operation.key.id))
        throw new RegistryError("operation_revision_active", "Operation bundle repeats an active ID.", operation.key);
      keys.add(candidate.key);
      ids.add(operation.key.id);
      const previous = this.entries.get(candidate.key);
      if (previous) {
        if (
          previous.descriptor.fingerprint !== candidate.entry.descriptor.fingerprint ||
          previous.operation.authorize !== candidate.entry.operation.authorize ||
          previous.operation.execute !== candidate.entry.operation.execute ||
          previous.operation.effect !== candidate.entry.operation.effect ||
          previous.operation.concurrency !== candidate.entry.operation.concurrency ||
          (v2(previous.operation) &&
            v2(candidate.entry.operation) &&
            (previous.operation.presenter.model !== candidate.entry.operation.presenter.model ||
              previous.operation.presenter.ui !== candidate.entry.operation.presenter.ui ||
              previous.operation.prepareExecution !== candidate.entry.operation.prepareExecution))
        )
          throw new RegistryError("operation_conflict", "Operation key/revision changed meaning.", operation.key);
        if (previous.active)
          throw new RegistryError(
            "operation_duplicate",
            "Operation key/revision is already registered.",
            operation.key,
          );
        candidate.entry = previous;
      }
      if (
        [...this.entries.values()].some(
          (existing) => existing.active && existing.operation.key.id === operation.key.id,
        ) &&
        !(allowCompatibleV2 && v2(operation))
      )
        throw new RegistryError(
          "operation_revision_active",
          "Dispose the active operation revision before registering its replacement.",
          this.current(operation.key.id)?.key,
        );
    }
  }
  validateMany(operations) {
    if (!operations.length) throw new RegistryError("operation_bundle_empty", "Operation bundle is empty.");
    this.checkPrepared(operations.map((operation) => this.prepare(operation)));
  }
  registerBundle(operations, allowCompatibleV2 = false) {
    const prepared = operations.map((operation) => this.prepare(operation));
    if (!prepared.length) throw new RegistryError("operation_bundle_empty", "Operation bundle is empty.");
    this.checkPrepared(prepared, allowCompatibleV2);
    for (const candidate of prepared) {
      candidate.entry.active = true;
      this.entries.set(candidate.key, candidate.entry);
    }
    this.generationRevision += 1;
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        let changed = false;
        for (const candidate of prepared) {
          if (candidate.entry.active) {
            candidate.entry.active = false;
            changed = true;
          }
        }
        if (changed) this.generationRevision += 1;
      },
    };
  }
  registerMany(operations) {
    return this.registerBundle(operations);
  }
  register(operation) {
    return this.registerMany([operation]);
  }
  // Versioned migration path: coexistence is explicit; ordinary legacy registration remains one-active-ID.
  registerCompatibleRevision(operation) {
    return this.registerBundle([operation], true);
  }
  activeDescriptors() {
    return [...this.entries.values()]
      .filter((entry) => entry.active)
      .map((entry) => entry.descriptor)
      .sort((a, b) => keyOf(a.key).localeCompare(keyOf(b.key)));
  }
  snapshot() {
    const descriptors = this.activeDescriptors();
    const generation = jsonDigest({
      revision: this.generationRevision,
      descriptors: descriptors.map((descriptor) => descriptor.fingerprint),
    });
    return Object.freeze({ generation, descriptors: Object.freeze([...descriptors]) });
  }
  isCurrent(resolved, generation) {
    const entry = this.entries.get(keyOf(resolved.operation.key));
    return (
      entry?.active === true &&
      entry.operation === resolved.operation &&
      generation === resolved.generation &&
      this.snapshot().generation === generation
    );
  }
  resolve(key) {
    const entry = this.entries.get(keyOf(key));
    if (!entry?.active) {
      const hint = [...this.entries.values()].find(
        (candidate) => candidate.active && candidate.operation.key.id === key.id,
      )?.operation.key;
      throw new RegistryError("operation_unavailable", "Exact operation revision is unavailable.", hint);
    }
    return Object.freeze({
      operation: entry.operation,
      descriptor: entry.descriptor,
      input: entry.input,
      output: entry.output,
      generation: this.snapshot().generation,
    });
  }
  describe(key) {
    const entry = this.entries.get(keyOf(key));
    return entry ? Object.freeze({ ...entry.descriptor, available: entry.active }) : undefined;
  }
  current(id) {
    return this.activeDescriptors().find((descriptor) => descriptor.key.id === id);
  }
  search(query, limit) {
    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9._-]+/)
      .filter(Boolean)
      .slice(0, 16);
    return this.activeDescriptors()
      .filter((descriptor) => descriptor.exposure.discoverable)
      .map((descriptor) => {
        const haystack = [descriptor.key.id, descriptor.description, ...descriptor.keywords, ...descriptor.effects]
          .join(" ")
          .toLowerCase();
        const score = terms.reduce(
          (total, term) => total + (descriptor.key.id.toLowerCase() === term ? 20 : haystack.includes(term) ? 1 : 0),
          0,
        );
        return { descriptor, score };
      })
      .filter((candidate) => terms.length === 0 || candidate.score > 0)
      .sort((a, b) => b.score - a.score || keyOf(a.descriptor.key).localeCompare(keyOf(b.descriptor.key)))
      .slice(0, limit)
      .map((candidate) => candidate.descriptor);
  }
}

import type { Json, Operation, OperationDescriptor, OperationKey } from "./contracts.js";
import { compileSchema, jsonDigest, type CompiledSchema } from "./schema.js";

export class RegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: OperationKey,
  ) {
    super(`${code}: ${message}`);
    this.name = "RegistryError";
  }
}

export type RegisteredOperation = Readonly<{
  operation: Operation<Json, Json>;
  descriptor: OperationDescriptor;
  input: CompiledSchema;
  output: CompiledSchema;
  generation: string;
}>;

export type CatalogSnapshot = Readonly<{
  generation: string;
  descriptors: readonly OperationDescriptor[];
}>;

type Entry = {
  operation: Operation<Json, Json>;
  descriptor: OperationDescriptor;
  input: CompiledSchema;
  output: CompiledSchema;
  active: boolean;
};

function keyOf(key: OperationKey): string {
  return JSON.stringify([key.id, key.revision]);
}

function operationFingerprint(operation: Operation<Json, Json>, input: CompiledSchema, output: CompiledSchema): string {
  return jsonDigest({
    key: operation.key,
    description: operation.description,
    keywords: [...(operation.keywords ?? [])],
    owner: operation.owner,
    inputSchema: input.schema,
    outputSchema: output.schema,
    effects: [...operation.effects],
    exposure: operation.exposure,
  } as Json);
}

function descriptorFor(
  operation: Operation<Json, Json>,
  input: CompiledSchema,
  output: CompiledSchema,
): OperationDescriptor {
  return Object.freeze({
    key: Object.freeze({ ...operation.key }),
    description: operation.description,
    keywords: Object.freeze([...(operation.keywords ?? [])]),
    owner: Object.freeze({ ...operation.owner }),
    inputSchema: input.schema,
    outputSchema: output.schema,
    effects: Object.freeze([...operation.effects]),
    exposure: Object.freeze({ ...operation.exposure }),
    fingerprint: operationFingerprint(operation, input, output),
  });
}

function validateIdentity(operation: Operation<Json, Json>): void {
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
}

export class OperationRegistry {
  private readonly entries = new Map<string, Entry>();
  private generationRevision = 0;

  private prepare(operation: Operation<Json, Json>): { key: string; entry: Entry } {
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
    }) as Operation<Json, Json>;
    const descriptor = descriptorFor(stored, input, output);
    return { key: keyOf(stored.key), entry: { operation: stored, descriptor, input, output, active: true } };
  }

  private checkPrepared(prepared: { key: string; entry: Entry }[]): void {
    const keys = new Set<string>();
    const ids = new Set<string>();
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
          previous.operation.concurrency !== candidate.entry.operation.concurrency
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
        [...this.entries.values()].some((existing) => existing.active && existing.operation.key.id === operation.key.id)
      )
        throw new RegistryError(
          "operation_revision_active",
          "Dispose the active operation revision before registering its replacement.",
          this.current(operation.key.id)?.key,
        );
    }
  }

  validateMany(operations: readonly Operation<Json, Json>[]): void {
    if (!operations.length) throw new RegistryError("operation_bundle_empty", "Operation bundle is empty.");
    this.checkPrepared(operations.map((operation) => this.prepare(operation)));
  }

  registerMany(operations: readonly Operation<Json, Json>[]): { dispose(): void } {
    const prepared = operations.map((operation) => this.prepare(operation));
    if (!prepared.length) throw new RegistryError("operation_bundle_empty", "Operation bundle is empty.");
    this.checkPrepared(prepared);
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

  register(operation: Operation<Json, Json>): { dispose(): void } {
    return this.registerMany([operation]);
  }

  private activeDescriptors(): OperationDescriptor[] {
    return [...this.entries.values()]
      .filter((entry) => entry.active)
      .map((entry) => entry.descriptor)
      .sort((a, b) => keyOf(a.key).localeCompare(keyOf(b.key)));
  }

  snapshot(): CatalogSnapshot {
    const descriptors = this.activeDescriptors();
    const generation = jsonDigest({
      revision: this.generationRevision,
      descriptors: descriptors.map((descriptor) => descriptor.fingerprint),
    } as Json);
    return Object.freeze({ generation, descriptors: Object.freeze([...descriptors]) });
  }

  resolve(key: OperationKey): RegisteredOperation {
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

  describe(key: OperationKey): (OperationDescriptor & { available: boolean }) | undefined {
    const entry = this.entries.get(keyOf(key));
    return entry ? Object.freeze({ ...entry.descriptor, available: entry.active }) : undefined;
  }

  current(id: string): OperationDescriptor | undefined {
    return this.activeDescriptors().find((descriptor) => descriptor.key.id === id);
  }

  search(query: string, limit: number): OperationDescriptor[] {
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

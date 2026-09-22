import { randomUUID } from "node:crypto";
import { RegistryError } from "../registry.js";
function exact(value, required) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key))
  );
}
function identity(value, maximum) {
  return typeof value === "string" && /^[a-z][a-zA-Z0-9._-]*$/.test(value) && value.length <= maximum;
}
function boundedOutputSchema(schema, depth = 0) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || depth > 16) return false;
  if (schema.type === "string") return Number.isSafeInteger(schema.maxLength) && schema.maxLength >= 0;
  if (schema.type === "array")
    return (
      Number.isSafeInteger(schema.maxItems) && schema.maxItems >= 0 && boundedOutputSchema(schema.items, depth + 1)
    );
  if (schema.type === "object")
    return (
      schema.additionalProperties === false &&
      schema.properties &&
      typeof schema.properties === "object" &&
      !Array.isArray(schema.properties) &&
      Object.values(schema.properties).every((child) => boundedOutputSchema(child, depth + 1))
    );
  return ["number", "integer", "boolean", "null"].includes(schema.type);
}
function snapshotBundle(bundle) {
  const operations = bundle.operations.map((operation) =>
    Object.freeze({
      ...operation,
      key: Object.freeze({ ...operation.key }),
      keywords: Object.freeze([...(operation.keywords ?? [])]),
      owner: Object.freeze({ ...operation.owner }),
      inputSchema: structuredClone(operation.inputSchema),
      outputSchema: structuredClone(operation.outputSchema),
      effects: Object.freeze([...operation.effects]),
      exposure: Object.freeze({ ...operation.exposure }),
    }),
  );
  return Object.freeze({
    protocol: 1,
    id: bundle.id,
    revision: bundle.revision,
    executionWorld: bundle.executionWorld,
    policy: Object.freeze({ ...bundle.policy }),
    operations: Object.freeze(operations),
    dispose: () => bundle.dispose(),
  });
}
export class CooperatingAdapterRuntime {
  registry;
  state;
  bundles = new Map();
  failures = [];
  constructor(registry, state) {
    this.registry = registry;
    this.state = state;
  }
  fail(code, message) {
    this.failures.push({ code, message: message.slice(0, 1000) });
    if (this.failures.length > 16) this.failures.shift();
    return Object.freeze({ accepted: false, active: false, code, message, dispose() {} });
  }
  validate(bundle) {
    if (
      !exact(bundle, ["protocol", "id", "revision", "executionWorld", "policy", "operations", "dispose"]) ||
      bundle.protocol !== 1 ||
      !identity(bundle.id, 128) ||
      typeof bundle.revision !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(bundle.revision) ||
      typeof bundle.executionWorld !== "string" ||
      !bundle.executionWorld ||
      bundle.executionWorld.length > 256 ||
      typeof bundle.dispose !== "function" ||
      !exact(bundle.policy, ["authorization", "cancellation", "settlement"]) ||
      bundle.policy.authorization !== "per-call" ||
      bundle.policy.cancellation !== "abort-signal" ||
      bundle.policy.settlement !== "effect-aware" ||
      !Array.isArray(bundle.operations) ||
      bundle.operations.length < 1 ||
      bundle.operations.length > 512
    )
      throw new RegistryError("adapter_invalid", "Cooperating adapter bundle is invalid.");
    for (const operation of bundle.operations) {
      if (
        operation.owner?.adapterId !== bundle.id ||
        operation.owner?.adapterRevision !== bundle.revision ||
        operation.owner?.executionWorld !== bundle.executionWorld ||
        operation.key?.id.startsWith("freeflow") ||
        typeof operation.authorize !== "function" ||
        typeof operation.execute !== "function" ||
        typeof operation.effect !== "function" ||
        typeof operation.concurrency !== "function" ||
        !boundedOutputSchema(operation.outputSchema)
      )
        throw new RegistryError("adapter_conformance", "Cooperating adapter operation is non-conforming.");
    }
    const stored = snapshotBundle(bundle);
    this.registry.validateMany(stored.operations);
    return stored;
  }
  allowed(id) {
    const current = this.state();
    return current?.effective === true && current.adapters.effective && current.adapters.allow.includes(id);
  }
  activate(stored) {
    if (stored.registration || !this.allowed(stored.bundle.id)) return;
    stored.registration = this.registry.registerMany(stored.bundle.operations);
  }
  register(bundle) {
    if (this.bundles.has(bundle?.id)) return this.fail("adapter_duplicate", "Adapter ID is already registered.");
    let accepted;
    try {
      accepted = this.validate(bundle);
    } catch (error) {
      return this.fail(
        error instanceof RegistryError ? error.code : "adapter_invalid",
        error instanceof Error ? error.message : String(error),
      );
    }
    const stored = { bundle: accepted };
    this.bundles.set(accepted.id, stored);
    try {
      this.activate(stored);
    } catch (error) {
      this.bundles.delete(accepted.id);
      return this.fail(
        error instanceof RegistryError ? error.code : "adapter_activation",
        error instanceof Error ? error.message : String(error),
      );
    }
    let disposed = false;
    return Object.freeze({
      accepted: true,
      active: stored.registration !== undefined,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        stored.registration?.dispose();
        stored.registration = undefined;
        this.bundles.delete(accepted.id);
        try {
          accepted.dispose();
        } catch {}
      },
    });
  }
  refresh() {
    for (const stored of this.bundles.values()) {
      if (!this.allowed(stored.bundle.id)) {
        stored.registration?.dispose();
        stored.registration = undefined;
        continue;
      }
      if (!stored.registration) {
        try {
          this.activate(stored);
        } catch (error) {
          this.fail(
            error instanceof RegistryError ? error.code : "adapter_activation",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  }
  status() {
    return {
      allowed: Object.freeze([...(this.state()?.adapters.allow ?? [])]),
      announced: Object.freeze(
        [...this.bundles.values()]
          .map(({ bundle, registration }) =>
            Object.freeze({
              id: bundle.id,
              revision: bundle.revision,
              executionWorld: bundle.executionWorld,
              active: registration !== undefined,
            }),
          )
          .sort((left, right) => left.id.localeCompare(right.id)),
      ),
      failures: Object.freeze(this.failures.map((failure) => Object.freeze({ ...failure }))),
    };
  }
}
const ENDPOINT = Symbol.for("@hassangameryt/freeflow/cooperating-adapter-v1");
export function publishCooperatingAdapterEndpoint(runtime) {
  const generation = randomUUID();
  const endpoint = Object.freeze({
    generation,
    register: (bundle) => {
      const result = runtime.register(bundle);
      return Object.freeze({ ...result, endpointGeneration: generation });
    },
  });
  globalThis[ENDPOINT] = endpoint;
  return {
    dispose() {
      if (globalThis[ENDPOINT] === endpoint) delete globalThis[ENDPOINT];
    },
  };
}
export function registerCooperatingAdapter(bundle) {
  const endpoint = globalThis[ENDPOINT];
  return endpoint
    ? endpoint.register(bundle)
    : Object.freeze({
        accepted: false,
        active: false,
        code: "adapter_endpoint_unavailable",
        message: "Freeflow cooperating-adapter endpoint is unavailable.",
        dispose() {},
      });
}

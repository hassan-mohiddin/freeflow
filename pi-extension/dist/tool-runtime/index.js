import { AdmissionController } from "./admission.js";
import { createCapturedReadOperation } from "./adapters/captured.js";
import { createArtifactReadOperation } from "./adapters/artifact.js";
import { createReadTextOperation } from "./adapters/read-text.js";
import { createReadRangesOperation } from "./adapters/read-ranges.js";
import { createFindPathsOperation } from "./adapters/find-paths.js";
import { createReplaceExactOperation } from "./adapters/replace-exact.js";
import { createApplyPatchOperation } from "./adapters/apply-patch.js";
import { createSearchTextOperation } from "./adapters/search-text.js";
import { createSearchTextV2Operation } from "./adapters/search-text-v2.js";
import { WorkspaceCoordinator } from "./adapters/workspace.js";
import { CooperatingAdapterRuntime } from "./adapters/protocol.js";
import { DiscoveryIndex } from "./discovery/index.js";
import { boundedProgramBinding } from "./bindings.js";
import { directOperation, DIRECT_TOOL_NAMES } from "./direct-tools.js";
import { OperationKernel } from "./kernel.js";
import { OperationRegistry } from "./registry.js";
import { canonicalJson, freezeJson } from "./schema.js";
import { presentV2 } from "./presentation/v2.js";
import { isStoreIdentifier } from "../session-store/contracts.js";
function jsonResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
}
function descriptorJson(descriptor, available = true) {
  return {
    key: { ...descriptor.key },
    description: descriptor.description,
    keywords: [...descriptor.keywords],
    owner: { ...descriptor.owner },
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    effects: [...descriptor.effects],
    exposure: { ...descriptor.exposure },
    fingerprint: descriptor.fingerprint,
    available,
  };
}
export class ToolRuntime {
  state;
  routing;
  v2Factories;
  presentationPolicy;
  v2Ready;
  registry = new OperationRegistry();
  kernel;
  adapters;
  discovery = new DiscoveryIndex();
  v2Session;
  constructor(
    state,
    routing,
    resultReader,
    effects,
    v2Factories,
    recorder,
    presentationPolicy = { maxBytes: 8192 },
    v2ResultReader,
    v2Ready = () => true,
  ) {
    this.state = state;
    this.routing = routing;
    this.v2Factories = v2Factories;
    this.presentationPolicy = presentationPolicy;
    this.v2Ready = v2Ready;
    const routingAdmission = {
      admit: (routing, effect, operation, scope) => this.routing.admit(routing, effect, operation, scope),
    };
    this.kernel = new OperationKernel(
      this.registry,
      new AdmissionController(state, routingAdmission),
      effects,
      recorder,
    );
    const workspace = new WorkspaceCoordinator();
    this.registry.register(createCapturedReadOperation(resultReader));
    if (recorder && v2ResultReader)
      this.registry.registerCompatibleRevision(createArtifactReadOperation(v2ResultReader));
    this.registry.register(createReadTextOperation(state));
    if (recorder) this.registry.register(createReadRangesOperation(state));
    this.registry.register(createSearchTextOperation(state));
    if (recorder) {
      this.registry.register(createFindPathsOperation(state));
      this.registry.registerCompatibleRevision(createSearchTextV2Operation(state));
    }
    this.registry.register(createReplaceExactOperation(state, workspace));
    if (recorder) this.registry.register(createApplyPatchOperation(state, workspace));
    this.adapters = new CooperatingAdapterRuntime(this.registry, state);
  }
  // Inactive until the host explicitly binds a session. Never reuse a store under a new branch fence.
  bindV2Session(identity) {
    if (!this.v2Factories) throw new Error("v2_unavailable: No v2 construction factories are configured.");
    if (!isStoreIdentifier(identity.sessionId) || !isStoreIdentifier(identity.branchAnchor))
      throw new Error("v2_identity: Session identity is invalid.");
    const existing = this.v2Session;
    if (existing) {
      if (
        existing.identity.sessionId !== identity.sessionId ||
        existing.identity.branchAnchor !== identity.branchAnchor
      )
        throw new Error("v2_binding_changed: A different session or branch needs a new store binding.");
      return existing;
    }
    const boundIdentity = Object.freeze({ sessionId: identity.sessionId, branchAnchor: identity.branchAnchor });
    const session = Object.freeze({ identity: boundIdentity, store: this.v2Factories.store(boundIdentity) });
    this.v2Session = session;
    return session;
  }
  requireV2Session(identity) {
    if (!this.v2Session || !this.v2Factories) throw new Error("v2_unavailable: No v2 session is bound.");
    if (
      this.v2Session.identity.sessionId !== identity.sessionId ||
      this.v2Session.identity.branchAnchor !== identity.branchAnchor
    )
      throw new Error("v2_binding_changed: A different session or branch needs a new store binding.");
    return this.v2Factories;
  }
  v2Presenter(identity, operation) {
    return this.requireV2Session(identity).presenter(operation);
  }
  v2OccurrenceId(identity) {
    return this.requireV2Session(identity).occurrenceId();
  }
  registerAdapter(bundle) {
    return this.adapters.register(bundle);
  }
  refreshAdapters() {
    this.adapters.refresh();
  }
  status() {
    const snapshot = this.registry.snapshot();
    return { catalog: this.discovery.status(snapshot), adapters: this.adapters.status() };
  }
  operationAvailable(key) {
    const descriptor = this.registry.describe(key);
    return descriptor?.available === true && (descriptor.contractVersion !== 2 || this.v2Ready());
  }
  createProgramScope(parentCallId, ctx) {
    const sessionId = ctx?.sessionManager?.getSessionId?.();
    if (typeof sessionId !== "string" || !sessionId || typeof ctx?.cwd !== "string") {
      throw new Error("tool_scope_unavailable: Native session scope is unavailable.");
    }
    return Object.freeze({
      sessionId,
      cwd: ctx.cwd,
      parentCallId,
      catalogGeneration: this.registry.snapshot().generation,
      responsibility: Object.freeze(structuredClone(this.routing.responsibility())),
      routing: this.routing.scope(ctx),
    });
  }
  admitProgram(scope) {
    return this.routing.admitProgram?.(scope.routing, scope) ?? { kind: "allowed" };
  }
  async invokeTools(parentCallId, input, signal, ctx, progress) {
    const current = this.state();
    if (!current?.effective) throw new Error("tool_execution_disabled: Tool Execution is disabled.");
    if (input.operation === "search") {
      if (!current.discovery.effective) throw new Error("discovery_disabled: Operation discovery is disabled.");
      progress?.publish({
        version: 1,
        tool: "freeflow_tools",
        phase: "running",
        activity: "Searching operation catalog",
      });
      const snapshot = this.registry.snapshot();
      return jsonResult({
        status: "searched",
        generation: snapshot.generation,
        hits: this.discovery
          .search(snapshot, input.query, snapshot.descriptors.length)
          .filter((descriptor) => this.operationAvailable(descriptor.key))
          .slice(0, input.limit ?? 5)
          .map((descriptor) => ({
            key: { ...descriptor.key },
            description: descriptor.description,
            effects: [...descriptor.effects],
            invocation: {
              direct: descriptor.exposure.direct,
              programmatic: descriptor.exposure.programmatic,
            },
          })),
      });
    }
    if (input.operation === "describe") {
      if (!current.discovery.effective) throw new Error("discovery_disabled: Operation discovery is disabled.");
      progress?.publish({
        version: 1,
        tool: "freeflow_tools",
        phase: "running",
        activity: "Loading operation contracts",
      });
      const snapshot = this.registry.snapshot();
      const value = {
        status: "described",
        generation: snapshot.generation,
        operations: input.operations.map((key) => {
          const descriptor = this.registry.describe(key);
          return descriptor
            ? {
                ...descriptorJson(descriptor, this.operationAvailable(key)),
                ...(descriptor.exposure.programmatic
                  ? {
                      programBinding: this.operationAvailable(key)
                        ? boundedProgramBinding(descriptor)
                        : { state: "unavailable", reason: "operation_unavailable" },
                    }
                  : {}),
              }
            : {
                key: { ...key },
                available: false,
                error: "operation_unavailable",
                hint: this.registry.current(key.id)?.key,
              };
        }),
      };
      if (Buffer.byteLength(canonicalJson(value), "utf8") > 512 * 1024)
        throw new Error("describe_limit: Complete operation descriptions exceed the response limit.");
      return jsonResult(value);
    }
    if (input.operation !== "call") throw new Error("invalid_operation: Unknown freeflow_tools operation.");
    return this.invokeRegistered(
      "freeflow_tools",
      parentCallId,
      input.operationKey,
      input.input,
      signal,
      ctx,
      progress,
    );
  }
  async invokeDirect(name, parentCallId, input, signal, ctx, progress) {
    if (!this.state()?.effective) throw new Error("tool_execution_disabled: Tool Execution is disabled.");
    const selected = directOperation(name, freezeJson(input));
    return this.invokeRegistered(name, parentCallId, selected.key, selected.input, signal, ctx, progress);
  }
  async invokeRegistered(tool, parentCallId, key, input, signal, ctx, progress) {
    let presenter;
    let presentationInput = null;
    try {
      const selected = this.registry.resolve(key);
      if (selected.operation.contractVersion === 2) {
        presenter = selected.operation;
        const parsed = selected.input.validate(input);
        if (parsed.ok) presentationInput = parsed.value;
      }
    } catch {
      /* Kernel returns the authoritative unavailable-revision outcome. */
    }
    if (
      presenter &&
      (!Number.isSafeInteger(this.presentationPolicy.maxBytes) || this.presentationPolicy.maxBytes < 256)
    )
      throw new Error("v2_presentation_policy: Bounded model-view policy is unavailable.");
    const scope = this.createProgramScope(parentCallId, ctx);
    progress?.publish({
      version: 1,
      tool,
      phase: "running",
      activity: `Executing ${key.id}`,
      current: { operation: key, status: "running" },
    });
    const outcome = await this.kernel.execute(key, input, scope, "direct", signal, ctx);
    progress?.publish(
      {
        version: 1,
        tool,
        phase: "settling",
        activity: `Settled ${key.id}`,
        current: {
          operation: key,
          status: outcome.status,
          ...(outcome.effect ? { effect: outcome.effect } : {}),
          effectState: outcome.effectState,
        },
      },
      true,
    );
    return presenter
      ? await presentV2(presenter, presentationInput, outcome, this.presentationPolicy)
      : jsonResult({ status: "called", outcome: outcome });
  }
  classifyProgrammatic(key, input, scope) {
    return this.kernel.classify(key, input, scope);
  }
  prepareProgrammatic(key, input, scope, signal, host) {
    return this.kernel.prepare(key, input, scope, "programmatic", signal, host);
  }
  executePrepared(call, signal) {
    return this.kernel.executePrepared(call, signal);
  }
  executeProgrammatic(key, input, scope, signal, host) {
    return this.kernel.execute(key, input, scope, "programmatic", signal, host);
  }
  patchResult(event) {
    const outcome = event?.details?.outcome;
    return (event?.toolName === "freeflow_tools" || DIRECT_TOOL_NAMES.includes(event?.toolName)) &&
      event?.details?.status === "called" &&
      ["failed", "cancelled", "unknown"].includes(outcome?.status)
      ? { isError: true }
      : undefined;
  }
}

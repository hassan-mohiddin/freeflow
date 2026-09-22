import { AdmissionController } from "./admission.js";
import { createCapturedReadOperation } from "./adapters/captured.js";
import { createReadTextOperation } from "./adapters/read-text.js";
import { createReplaceExactOperation } from "./adapters/replace-exact.js";
import { createSearchTextOperation } from "./adapters/search-text.js";
import { WorkspaceCoordinator } from "./adapters/workspace.js";
import { CooperatingAdapterRuntime } from "./adapters/protocol.js";
import { DiscoveryIndex } from "./discovery/index.js";
import { OperationKernel } from "./kernel.js";
import { OperationRegistry } from "./registry.js";
import { canonicalJson } from "./schema.js";
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
  registry = new OperationRegistry();
  kernel;
  adapters;
  discovery = new DiscoveryIndex();
  constructor(state, routing, resultReader, effects) {
    this.state = state;
    this.routing = routing;
    const routingAdmission = {
      admit: (routing, effect, operation, scope) => this.routing.admit(routing, effect, operation, scope),
    };
    this.kernel = new OperationKernel(this.registry, new AdmissionController(state, routingAdmission), effects);
    const workspace = new WorkspaceCoordinator();
    this.registry.register(createCapturedReadOperation(resultReader));
    this.registry.register(createReadTextOperation(state));
    this.registry.register(createSearchTextOperation(state));
    this.registry.register(createReplaceExactOperation(state, workspace));
    this.adapters = new CooperatingAdapterRuntime(this.registry, state);
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
  async invokeTools(parentCallId, input, signal, ctx) {
    const current = this.state();
    if (!current?.effective) throw new Error("tool_execution_disabled: Tool Execution is disabled.");
    if (input.operation === "search") {
      if (!current.discovery.effective) throw new Error("discovery_disabled: Operation discovery is disabled.");
      const snapshot = this.registry.snapshot();
      return jsonResult({
        status: "searched",
        generation: snapshot.generation,
        hits: this.discovery.search(snapshot, input.query, input.limit ?? 5).map((descriptor) => ({
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
      const snapshot = this.registry.snapshot();
      const value = {
        status: "described",
        generation: snapshot.generation,
        operations: input.operations.map((key) => {
          const descriptor = this.registry.describe(key);
          return descriptor
            ? descriptorJson(descriptor, descriptor.available)
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
    const scope = this.createProgramScope(parentCallId, ctx);
    const outcome = await this.kernel.execute(input.operationKey, input.input, scope, "direct", signal, ctx);
    return jsonResult({ status: "called", outcome: outcome });
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
    return event?.toolName === "freeflow_tools" &&
      event?.details?.status === "called" &&
      ["failed", "cancelled", "unknown"].includes(outcome?.status)
      ? { isError: true }
      : undefined;
  }
}

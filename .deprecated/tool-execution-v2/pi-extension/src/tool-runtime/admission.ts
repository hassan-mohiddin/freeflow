import type { ToolExecutionState } from "./config.js";
import type { Admission, Concurrency, Effect, Json, OperationKey, ToolScope } from "./contracts.js";
import type { RegisteredOperation } from "./registry.js";
import { canonicalJson, freezeJson } from "./schema.js";

export interface RoutingAdmissionPort {
  admit(routing: unknown, effect: Effect, operation: OperationKey, scope: ToolScope): Admission;
}

export class AdmissionController {
  constructor(
    private readonly state: () => ToolExecutionState | undefined,
    private readonly routing: RoutingAdmissionPort,
  ) {}

  private core(
    resolved: RegisteredOperation,
    scope: ToolScope,
    source: "direct" | "programmatic",
    effect: Effect,
    concurrency: Concurrency,
    signal?: AbortSignal,
  ): Admission {
    const state = this.state();
    if (!state?.effective)
      return { kind: "denied", code: "tool_execution_disabled", message: "Tool Execution is disabled." };
    if (signal?.aborted) return { kind: "denied", code: "cancelled", message: "Operation was cancelled." };
    const operation = resolved.operation;
    if (
      (source === "direct" && !operation.exposure.direct) ||
      (source === "programmatic" && !operation.exposure.programmatic)
    )
      return {
        kind: "denied",
        code: "operation_not_exposed",
        message: "Operation is unavailable through this invocation form.",
      };
    if (!operation.effects.includes(effect) || !["read-parallel", "exclusive"].includes(concurrency))
      return { kind: "denied", code: "operation_classification", message: "Operation classification is invalid." };
    if (effect === "mutation" && concurrency !== "exclusive")
      return { kind: "denied", code: "operation_classification", message: "Mutations must be exclusive." };
    return this.routing.admit(scope.routing, effect, operation.key, scope);
  }

  async admit(
    resolved: RegisteredOperation,
    input: Json,
    scope: ToolScope,
    source: "direct" | "programmatic",
    effect: Effect,
    concurrency: Concurrency,
    signal?: AbortSignal,
  ): Promise<Admission> {
    const routed = this.core(resolved, scope, source, effect, concurrency, signal);
    if (routed.kind !== "allowed") return routed;
    try {
      const result = await resolved.operation.authorize(input, scope, signal);
      if (result?.kind === "allowed" && Object.keys(result).length === 1) return { kind: "allowed" };
      if (
        result?.kind === "denied" &&
        Object.keys(result).every((key) => ["kind", "code", "message"].includes(key)) &&
        typeof result.code === "string" &&
        result.code.length > 0 &&
        result.code.length <= 256 &&
        typeof result.message === "string" &&
        result.message.length > 0 &&
        result.message.length <= 2000
      )
        return { kind: "denied", code: result.code, message: result.message };
      if (
        result?.kind === "needs-model" &&
        Object.keys(result).every((key) => ["kind", "context"].includes(key)) &&
        Object.hasOwn(result, "context")
      ) {
        const context = freezeJson(result.context);
        return Buffer.byteLength(canonicalJson(context), "utf8") <= 32 * 1024
          ? { kind: "needs-model", context }
          : { kind: "denied", code: "adapter_authorization", message: "Adapter model context exceeds limit." };
      }
      return { kind: "denied", code: "adapter_authorization", message: "Adapter authorization is invalid." };
    } catch {
      return { kind: "denied", code: "adapter_authorization", message: "Adapter authorization failed." };
    }
  }

  recheck(
    resolved: RegisteredOperation,
    scope: ToolScope,
    source: "direct" | "programmatic",
    effect: Effect,
    concurrency: Concurrency,
    signal?: AbortSignal,
  ): Admission {
    return this.core(resolved, scope, source, effect, concurrency, signal);
  }
}

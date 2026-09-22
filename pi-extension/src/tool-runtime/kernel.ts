import { AdmissionController } from "./admission.js";
import type { CallOutcome, Concurrency, Coverage, Effect, Json, OperationKey, ToolScope } from "./contracts.js";
import { OperationExecutionError } from "./contracts.js";
import type { EffectJournalPort, EffectTicket } from "./effects.js";
import { EffectJournalError } from "./effects.js";
import { OperationRegistry, RegistryError, type RegisteredOperation } from "./registry.js";
import { freezeJson } from "./schema.js";

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000);
}

function validCoverage(value: unknown): value is Coverage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as any;
  if (!["complete-at-boundary", "limited", "unknown"].includes(candidate.kind)) return false;
  if (typeof candidate.boundary !== "string" || !candidate.boundary || candidate.boundary.length > 1000) return false;
  if (candidate.continuation !== undefined) {
    try {
      freezeJson(candidate.continuation);
    } catch {
      return false;
    }
  }
  return Object.keys(candidate).every((key) => ["kind", "boundary", "continuation"].includes(key));
}

function denied(
  key: OperationKey,
  catalogGeneration: string,
  code: string,
  message: string,
  extra: Partial<CallOutcome> = {},
): CallOutcome {
  return {
    operation: { ...key },
    catalogGeneration,
    status: "denied",
    effectState: "none",
    bodyStarted: false,
    error: { code, message },
    ...extra,
  };
}

const NO_EFFECTS: EffectJournalPort = {
  admit: () => ({ kind: "allowed" }),
  recheck: () => ({ kind: "allowed" }),
  async start() {
    return undefined;
  },
  async settle() {},
};

export type ClassifiedCall = Readonly<{
  key: OperationKey;
  input: Json;
  effect: Effect;
  concurrency: Concurrency;
  resolved: RegisteredOperation;
}>;

export type PreparedCall = ClassifiedCall &
  Readonly<{
    scope: ToolScope;
    source: "direct" | "programmatic";
    ticket?: EffectTicket;
    host?: unknown;
  }>;

export type ClassificationResult =
  Readonly<{ ok: true; call: ClassifiedCall }> | Readonly<{ ok: false; outcome: CallOutcome }>;

export type PreparationResult =
  Readonly<{ ok: true; call: PreparedCall }> | Readonly<{ ok: false; outcome: CallOutcome }>;

export class OperationKernel {
  constructor(
    private readonly registry: OperationRegistry,
    private readonly admission: AdmissionController,
    private readonly effects: EffectJournalPort = NO_EFFECTS,
  ) {}

  classify(key: OperationKey, input: unknown, scope: ToolScope): ClassificationResult {
    const generation = this.registry.snapshot().generation;
    let resolved: RegisteredOperation;
    try {
      resolved = this.registry.resolve(key);
    } catch (error) {
      return {
        ok: false,
        outcome: denied(
          key,
          generation,
          error instanceof RegistryError ? error.code : "operation_unavailable",
          error instanceof RegistryError && error.hint
            ? `${boundedError(error)} Current descriptor: ${error.hint.id}@${error.hint.revision}.`
            : boundedError(error),
        ),
      };
    }
    if (scope.catalogGeneration !== resolved.generation)
      return {
        ok: false,
        outcome: denied(key, resolved.generation, "catalog_changed", "Catalog changed before operation admission."),
      };
    const parsed = resolved.input.validate(input);
    if ("error" in parsed)
      return {
        ok: false,
        outcome: denied(key, resolved.generation, "invalid_input", parsed.error),
      };
    let effect: Effect;
    let concurrency: Concurrency;
    try {
      effect = resolved.operation.effect(parsed.value);
      concurrency = resolved.operation.concurrency(parsed.value);
    } catch (error) {
      return {
        ok: false,
        outcome: denied(key, resolved.generation, "operation_classification", boundedError(error)),
      };
    }
    if (
      !resolved.operation.effects.includes(effect) ||
      !["read-parallel", "exclusive"].includes(concurrency) ||
      (effect === "mutation" && concurrency !== "exclusive")
    )
      return {
        ok: false,
        outcome: denied(key, resolved.generation, "operation_classification", "Operation classification is invalid."),
      };
    return {
      ok: true,
      call: Object.freeze({
        key: Object.freeze({ ...key }),
        input: parsed.value,
        effect,
        concurrency,
        resolved,
      }),
    };
  }

  async prepare(
    key: OperationKey,
    input: unknown,
    scope: ToolScope,
    source: "direct" | "programmatic",
    signal?: AbortSignal,
    host?: unknown,
  ): Promise<PreparationResult> {
    const classified = this.classify(key, input, scope);
    if ("outcome" in classified) return { ok: false, outcome: classified.outcome };
    const { resolved, effect, concurrency } = classified.call;
    const fenced = this.effects.admit(scope, effect);
    if (fenced.kind !== "allowed") {
      const outcome: CallOutcome =
        fenced.kind === "needs-model"
          ? {
              operation: { ...key },
              catalogGeneration: resolved.generation,
              status: "needs-model",
              effect,
              effectState: "none",
              bodyStarted: false,
              error: { code: "needs_model", message: "Operation requires a model decision." },
              context: freezeJson(fenced.context),
            }
          : denied(key, resolved.generation, fenced.code, fenced.message, { effect });
      return { ok: false, outcome };
    }
    const admitted = await this.admission.admit(
      resolved,
      classified.call.input,
      scope,
      source,
      effect,
      concurrency,
      signal,
    );
    if (admitted.kind !== "allowed") {
      const outcome: CallOutcome =
        admitted.kind === "needs-model"
          ? {
              operation: { ...key },
              catalogGeneration: resolved.generation,
              status: "needs-model",
              effect,
              effectState: "none",
              bodyStarted: false,
              error: { code: "needs_model", message: "Operation requires a model decision." },
              context: freezeJson(admitted.context),
            }
          : denied(key, resolved.generation, admitted.code, admitted.message, {
              effect,
              ...(admitted.code === "cancelled" ? { status: "cancelled" as const } : {}),
            });
      return { ok: false, outcome };
    }
    if (signal?.aborted)
      return {
        ok: false,
        outcome: denied(key, resolved.generation, "cancelled", "Operation was cancelled before execution.", {
          status: "cancelled",
          effect,
        }),
      };
    const current = this.admission.recheck(resolved, scope, source, effect, concurrency, signal);
    if (current.kind !== "allowed") {
      const outcome: CallOutcome =
        current.kind === "needs-model"
          ? {
              operation: { ...key },
              catalogGeneration: resolved.generation,
              status: "needs-model",
              effect,
              effectState: "none",
              bodyStarted: false,
              error: { code: "needs_model", message: "Operation requires a model decision." },
              context: freezeJson(current.context),
            }
          : denied(key, resolved.generation, current.code, current.message, {
              effect,
              ...(current.code === "cancelled" ? { status: "cancelled" as const } : {}),
            });
      return { ok: false, outcome };
    }
    try {
      const ticket = await this.effects.start(scope, key, effect, classified.call.input, host);
      return {
        ok: true,
        call: Object.freeze({ ...classified.call, scope, source, ...(ticket ? { ticket } : {}), host }),
      };
    } catch (error) {
      return {
        ok: false,
        outcome: {
          operation: { ...key },
          catalogGeneration: resolved.generation,
          status: error instanceof EffectJournalError ? "unknown" : "failed",
          effect,
          effectState: error instanceof EffectJournalError ? "unknown" : "none",
          bodyStarted: false,
          error: {
            code: error instanceof EffectJournalError ? error.code : "effect_start_failed",
            message: boundedError(error),
          },
        },
      };
    }
  }

  private async acknowledged(call: PreparedCall, outcome: CallOutcome): Promise<CallOutcome> {
    try {
      await this.effects.settle(call.ticket, outcome, call.host);
      return outcome;
    } catch (error) {
      return {
        operation: { ...call.key },
        catalogGeneration: call.resolved.generation,
        status: "unknown",
        effect: call.effect,
        effectState: "unknown",
        bodyStarted: outcome.bodyStarted,
        error: { code: "effect_settlement_uncertain", message: boundedError(error) },
      };
    }
  }

  async executePrepared(call: PreparedCall, signal?: AbortSignal): Promise<CallOutcome> {
    if (signal?.aborted)
      return this.acknowledged(call, {
        operation: { ...call.key },
        catalogGeneration: call.resolved.generation,
        status: "cancelled",
        effect: call.effect,
        effectState: "none",
        bodyStarted: false,
        error: { code: "cancelled", message: "Operation was cancelled before execution." },
      });
    const effectCurrent = this.effects.recheck(call.scope, call.effect, call.ticket);
    const routingCurrent = this.admission.recheck(
      call.resolved,
      call.scope,
      call.source,
      call.effect,
      call.concurrency,
      signal,
    );
    const current = effectCurrent.kind === "allowed" ? routingCurrent : effectCurrent;
    if (current.kind !== "allowed")
      return this.acknowledged(call, {
        operation: { ...call.key },
        catalogGeneration: call.resolved.generation,
        status: current.kind === "needs-model" ? "needs-model" : current.code === "cancelled" ? "cancelled" : "denied",
        effect: call.effect,
        effectState: "none",
        bodyStarted: false,
        error:
          current.kind === "needs-model"
            ? { code: "needs_model", message: "Operation requires a model decision." }
            : { code: current.code, message: current.message },
        ...(current.kind === "needs-model" ? { context: freezeJson(current.context) } : {}),
      });
    let result: { value: Json; coverage: Coverage };
    try {
      result = await call.resolved.operation.execute(call.input, { scope: call.scope, signal, host: call.host });
    } catch (error) {
      const explicit = error instanceof OperationExecutionError;
      const effectState = explicit ? error.effectState : call.effect === "mutation" ? "unknown" : "none";
      const cancelled = signal?.aborted || (explicit && error.code === "cancelled");
      const outcome: CallOutcome = {
        operation: { ...call.key },
        catalogGeneration: call.resolved.generation,
        status: effectState === "unknown" ? "unknown" : cancelled ? "cancelled" : "failed",
        effect: call.effect,
        effectState,
        bodyStarted: true,
        error: {
          code: explicit ? error.code : cancelled ? "cancelled" : "operation_failed",
          message: boundedError(error),
        },
      };
      return this.acknowledged(call, outcome);
    }
    const output = call.resolved.output.validate(result?.value);
    if (!output.ok || !validCoverage(result?.coverage))
      return this.acknowledged(call, {
        operation: { ...call.key },
        catalogGeneration: call.resolved.generation,
        status: "failed",
        effect: call.effect,
        effectState: "completed",
        bodyStarted: true,
        error: {
          code: "invalid_output",
          message: "error" in output ? output.error : "Operation coverage is invalid.",
        },
      });
    const coverage: Coverage = Object.freeze({
      kind: result.coverage.kind,
      boundary: result.coverage.boundary,
      ...(result.coverage.continuation !== undefined ? { continuation: freezeJson(result.coverage.continuation) } : {}),
    });
    return this.acknowledged(call, {
      operation: { ...call.key },
      catalogGeneration: call.resolved.generation,
      status: "succeeded",
      effect: call.effect,
      effectState: "completed",
      bodyStarted: true,
      value: output.value,
      coverage,
    });
  }

  async execute(
    key: OperationKey,
    input: unknown,
    scope: ToolScope,
    source: "direct" | "programmatic",
    signal?: AbortSignal,
    host?: unknown,
  ): Promise<CallOutcome> {
    const prepared = await this.prepare(key, input, scope, source, signal, host);
    if ("outcome" in prepared) return prepared.outcome;
    return this.executePrepared(prepared.call, signal);
  }
}

import { OperationExecutionError } from "./contracts.js";
import { EffectJournalError } from "./effects.js";
import { RegistryError } from "./registry.js";
import { freezeJson } from "./schema.js";
function boundedError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000);
}
function validCoverage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value;
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
function denied(key, catalogGeneration, code, message, extra = {}) {
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
const NO_EFFECTS = {
  admit: () => ({ kind: "allowed" }),
  recheck: () => ({ kind: "allowed" }),
  async start() {
    return undefined;
  },
  async settle() {},
};
export class OperationKernel {
  registry;
  admission;
  effects;
  recorder;
  constructor(registry, admission, effects = NO_EFFECTS, recorder) {
    this.registry = registry;
    this.admission = admission;
    this.effects = effects;
    this.recorder = recorder;
  }
  classify(key, input, scope) {
    const generation = this.registry.snapshot().generation;
    let resolved;
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
    let effect;
    let concurrency;
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
  async prepare(key, input, scope, source, signal, host) {
    const classified = this.classify(key, input, scope);
    let v2Snapshot;
    let callScope = scope;
    if (this.recorder) {
      let candidate;
      try {
        candidate = "call" in classified ? classified.call.resolved : this.registry.resolve(key);
      } catch {
        /* An unavailable key is not an established v2 operation. */
      }
      if (candidate?.operation.contractVersion === 2) {
        try {
          callScope = Object.freeze({
            ...scope,
            responsibility: Object.freeze(structuredClone(scope.responsibility)),
            routing: Object.freeze(structuredClone(scope.routing)),
          });
          v2Snapshot = await this.recorder.begin(
            key,
            callScope,
            "call" in classified ? classified.call.input : undefined,
            host,
            candidate.generation,
          );
        } catch (error) {
          return {
            ok: false,
            outcome: denied(key, scope.catalogGeneration, "v2_store_unavailable", boundedError(error)),
          };
        }
      }
    }
    const fail = async (outcome) => ({
      ok: false,
      outcome: v2Snapshot ? await this.recorder.finish(v2Snapshot, outcome) : outcome,
    });
    if ("outcome" in classified) return fail(classified.outcome);
    const { resolved, effect, concurrency } = classified.call;
    const fenced = this.effects.admit(callScope, effect);
    if (fenced.kind !== "allowed") {
      const outcome =
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
      return fail(outcome);
    }
    const admitted = await this.admission.admit(
      resolved,
      classified.call.input,
      callScope,
      source,
      effect,
      concurrency,
      signal,
    );
    if (admitted.kind !== "allowed") {
      const outcome =
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
              ...(admitted.code === "cancelled" ? { status: "cancelled" } : {}),
            });
      return fail(outcome);
    }
    if (signal?.aborted)
      return fail(
        denied(key, resolved.generation, "cancelled", "Operation was cancelled before execution.", {
          status: "cancelled",
          effect,
        }),
      );
    if (!this.registry.isCurrent(resolved, callScope.catalogGeneration))
      return fail(
        denied(key, resolved.generation, "catalog_changed", "Operation was revoked before admission.", {
          effect,
        }),
      );
    const current = this.admission.recheck(resolved, callScope, source, effect, concurrency, signal);
    if (current.kind !== "allowed") {
      const outcome =
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
              ...(current.code === "cancelled" ? { status: "cancelled" } : {}),
            });
      return fail(outcome);
    }
    let execution;
    if (resolved.operation.contractVersion === 2 && resolved.operation.prepareExecution) {
      try {
        execution = await resolved.operation.prepareExecution(classified.call.input, {
          scope: callScope,
          signal,
          host,
        });
      } catch (error) {
        const code =
          error instanceof Error && "code" in error && typeof error.code === "string"
            ? error.code
            : "operation_preflight_failed";
        return fail({
          operation: { ...key },
          catalogGeneration: resolved.generation,
          status: code === "cancelled" ? "cancelled" : "failed",
          effect,
          effectState: "none",
          bodyStarted: false,
          error: { code, message: boundedError(error) },
        });
      }
    }
    // Recheck after any asynchronous plan/lock wait, immediately before starting the effect.
    let last;
    let registered;
    try {
      const effectAdmission = this.effects.recheck(callScope, effect);
      last =
        effectAdmission.kind === "allowed"
          ? this.admission.recheck(resolved, callScope, source, effect, concurrency, signal)
          : effectAdmission;
      registered = this.registry.isCurrent(resolved, callScope.catalogGeneration);
    } catch (error) {
      execution?.release();
      return fail(denied(key, resolved.generation, "admission_recheck_failed", boundedError(error), { effect }));
    }
    if (last.kind !== "allowed" || !registered) {
      execution?.release();
      const decision =
        last.kind === "allowed"
          ? { kind: "denied", code: "catalog_changed", message: "Operation was revoked before effect start." }
          : last;
      return fail(
        decision.kind === "needs-model"
          ? {
              operation: { ...key },
              catalogGeneration: resolved.generation,
              status: "needs-model",
              effect,
              effectState: "none",
              bodyStarted: false,
              error: { code: "needs_model", message: "Operation requires a model decision." },
              context: freezeJson(decision.context),
            }
          : denied(key, resolved.generation, decision.code, decision.message, {
              effect,
              ...(decision.code === "cancelled" ? { status: "cancelled" } : {}),
            }),
      );
    }
    try {
      const ticket = await this.effects.start(callScope, key, effect, classified.call.input, host);
      return {
        ok: true,
        call: Object.freeze({
          ...classified.call,
          scope: callScope,
          source,
          ...(ticket ? { ticket } : {}),
          ...(execution ? { execution } : {}),
          host,
          ...(v2Snapshot ? { v2Snapshot } : {}),
        }),
      };
    } catch (error) {
      execution?.release();
      // A v2 mutation start may have reached native session memory before an arbitrary host append error.
      const uncertain = error instanceof EffectJournalError || (execution !== undefined && effect === "mutation");
      return fail({
        operation: { ...key },
        catalogGeneration: resolved.generation,
        status: uncertain ? "unknown" : "failed",
        effect,
        effectState: uncertain ? "unknown" : "none",
        bodyStarted: false,
        error: {
          code: error instanceof EffectJournalError ? error.code : "effect_start_failed",
          message: boundedError(error),
        },
      });
    }
  }
  async acknowledged(call, outcome) {
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
        ...(outcome.value !== undefined ? { value: outcome.value } : {}),
        ...(outcome.coverage ? { coverage: outcome.coverage } : {}),
        error: { code: "effect_settlement_uncertain", message: boundedError(error) },
      };
    }
  }
  skippedReceipt(call) {
    try {
      const receipt = call.execution?.onSkip?.();
      if (!receipt || !validCoverage(receipt.coverage)) return {};
      const valid = call.resolved.output.validate(receipt.value);
      return valid.ok ? { value: valid.value, coverage: receipt.coverage } : {};
    } catch {
      return {};
    }
  }
  async executePreparedCore(call, signal) {
    if (signal?.aborted)
      return this.acknowledged(call, {
        operation: { ...call.key },
        catalogGeneration: call.resolved.generation,
        status: "cancelled",
        effect: call.effect,
        effectState: "none",
        bodyStarted: false,
        ...this.skippedReceipt(call),
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
        ...this.skippedReceipt(call),
        error:
          current.kind === "needs-model"
            ? { code: "needs_model", message: "Operation requires a model decision." }
            : { code: current.code, message: current.message },
        ...(current.kind === "needs-model" ? { context: freezeJson(current.context) } : {}),
      });
    if (!this.registry.isCurrent(call.resolved, call.scope.catalogGeneration))
      return this.acknowledged(
        call,
        denied(call.key, call.resolved.generation, "catalog_changed", "Operation was revoked before body start.", {
          effect: call.effect,
          ...this.skippedReceipt(call),
        }),
      );
    let result;
    try {
      result = call.execution
        ? await call.execution.run(signal)
        : await call.resolved.operation.execute(call.input, { scope: call.scope, signal, host: call.host });
    } catch (error) {
      const explicit = error instanceof OperationExecutionError;
      const reported = explicit ? error.result : undefined;
      const validated = reported ? call.resolved.output.validate(reported.value) : undefined;
      const receiptValid = validated?.ok === true && validCoverage(reported?.coverage);
      const effectState =
        reported && !receiptValid && call.effect === "mutation"
          ? "unknown"
          : explicit
            ? error.effectState
            : call.effect === "mutation"
              ? "unknown"
              : "none";
      const cancelled = signal?.aborted || (explicit && error.code === "cancelled");
      const outcome = {
        operation: { ...call.key },
        catalogGeneration: call.resolved.generation,
        status: effectState === "unknown" ? "unknown" : cancelled ? "cancelled" : "failed",
        effect: call.effect,
        effectState,
        bodyStarted: true,
        error: {
          code:
            reported && !receiptValid
              ? "invalid_failure_receipt"
              : explicit
                ? error.code
                : cancelled
                  ? "cancelled"
                  : "operation_failed",
          message: boundedError(error),
        },
        ...(receiptValid ? { value: validated.value, coverage: reported.coverage } : {}),
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
    const coverage = Object.freeze({
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
  async executePrepared(call, signal) {
    try {
      const outcome = await this.executePreparedCore(call, signal);
      return call.v2Snapshot && this.recorder ? await this.recorder.finish(call.v2Snapshot, outcome) : outcome;
    } finally {
      call.execution?.release();
    }
  }
  async execute(key, input, scope, source, signal, host) {
    const prepared = await this.prepare(key, input, scope, source, signal, host);
    if ("outcome" in prepared) return prepared.outcome;
    return this.executePrepared(prepared.call, signal);
  }
}

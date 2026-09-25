import { randomUUID } from "node:crypto";

import type { Admission, CallOutcome, Effect, Json, OperationKey, ToolScope } from "./contracts.js";
import { canonicalJson, jsonDigest } from "./schema.js";
import { activeReadOnlySessionBranch, readOnlySessionSnapshot } from "../session-sources/read-only-session.js";

export const EFFECT_ENTRY = "freeflow-tool-effect-v1";

type EffectStart = Readonly<{
  version: 1;
  event: "started";
  effectId: string;
  sessionId: string;
  parentCallId: string;
  operation: OperationKey;
  effect: "mutation";
  inputSha256: string;
  responsibility: ToolScope["responsibility"];
}>;

type EffectSettled = Readonly<{
  version: 1;
  event: "settled";
  effectId: string;
  sessionId: string;
  status: CallOutcome["status"];
  effectState: CallOutcome["effectState"];
  errorCode?: string;
}>;

type EffectEvent = EffectStart | EffectSettled;

export type EffectTicket = Readonly<{ effectId: string; sessionId: string; generation: number }>;

export interface EffectJournalPort {
  admit(scope: ToolScope, effect: Effect): Admission;
  recheck(scope: ToolScope, effect: Effect, ticket?: EffectTicket): Admission;
  start(
    scope: ToolScope,
    operation: OperationKey,
    effect: Effect,
    input: Json,
    host: unknown,
  ): Promise<EffectTicket | undefined>;
  settle(ticket: EffectTicket | undefined, outcome: CallOutcome, host: unknown): Promise<void>;
}

export class EffectJournalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "EffectJournalError";
  }
}

function entries(host: any): any[] {
  const manager = host?.sessionManager;
  const values = manager?.getBranch?.() ?? manager?.getEntries?.();
  return Array.isArray(values) ? values : [];
}

function exact(value: any, required: readonly string[], optional: readonly string[] = []): boolean {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  );
}

function isKey(value: any): value is OperationKey {
  return (
    exact(value, ["id", "revision"]) &&
    /^[a-z][a-zA-Z0-9._-]{0,127}$/.test(value.id) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.revision)
  );
}

function isResponsibility(value: any): value is ToolScope["responsibility"] {
  return (
    exact(value, ["profile", "control"], ["assignmentId", "executionId", "provider", "modelId", "thinking"]) &&
    ["solo", "coordinator", "helper", "executor", "unknown"].includes(value.profile) &&
    ["inactive", "manual", "automatic", "unknown"].includes(value.control) &&
    ["assignmentId", "executionId", "provider", "modelId", "thinking"].every(
      (key) => value[key] === undefined || (typeof value[key] === "string" && value[key].length <= 512),
    )
  );
}

function isStart(value: any): value is EffectStart {
  return (
    exact(value, [
      "version",
      "event",
      "effectId",
      "sessionId",
      "parentCallId",
      "operation",
      "effect",
      "inputSha256",
      "responsibility",
    ]) &&
    value.version === 1 &&
    value.event === "started" &&
    typeof value.effectId === "string" &&
    /^effect:[0-9a-f-]{36}$/.test(value.effectId) &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= 512 &&
    typeof value.parentCallId === "string" &&
    value.parentCallId.length > 0 &&
    value.parentCallId.length <= 512 &&
    isKey(value.operation) &&
    value.effect === "mutation" &&
    /^[a-f0-9]{64}$/.test(value.inputSha256) &&
    isResponsibility(value.responsibility)
  );
}

function isSettled(value: any): value is EffectSettled {
  return (
    exact(value, ["version", "event", "effectId", "sessionId", "status", "effectState"], ["errorCode"]) &&
    value.version === 1 &&
    value.event === "settled" &&
    typeof value.effectId === "string" &&
    /^effect:[0-9a-f-]{36}$/.test(value.effectId) &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= 512 &&
    ["succeeded", "denied", "needs-model", "failed", "cancelled", "unknown"].includes(value.status) &&
    ["none", "completed", "unknown"].includes(value.effectState) &&
    (value.errorCode === undefined || (typeof value.errorCode === "string" && value.errorCode.length <= 256))
  );
}

function events(host: unknown): EffectEvent[] {
  return entries(host)
    .filter((entry) => entry?.type === "custom" && entry.customType === EFFECT_ENTRY)
    .map((entry) => entry.data)
    .filter((value) => isStart(value) || isSettled(value));
}

export class EffectRuntime implements EffectJournalPort {
  private readonly unresolved = new Map<string, EffectStart>();
  private generation = 0;
  private activeSessionId: string | undefined;

  constructor(private readonly pi: any) {}

  reset(): void {
    this.generation += 1;
    this.activeSessionId = undefined;
    this.unresolved.clear();
  }

  async recover(host: unknown): Promise<void> {
    const manager = (host as any)?.sessionManager;
    const sessionId = manager?.getSessionId?.();
    const generation = this.generation;
    this.activeSessionId = sessionId;
    const branch = entries(host);
    const all = events(host);
    const starts = all.filter((event): event is EffectStart => event.event === "started");
    const unresolved = new Map(starts.map((event) => [event.effectId, event]));
    const hasClaimedSettlement = starts.some((start) =>
      all.some((event) => event.event === "settled" && event.effectId === start.effectId),
    );

    // Pi may update session memory before its append reaches disk. A settlement in
    // that same memory is not evidence that a failed append was acknowledged.
    if (hasClaimedSettlement) {
      try {
        const path = manager?.getSessionFile?.();
        const leafId = manager?.getLeafId?.();
        if (!path || typeof leafId !== "string") throw new Error("Effect snapshot is unavailable.");
        const snapshot = await readOnlySessionSnapshot(path);
        if (snapshot.sessionId !== sessionId) throw new Error("Effect session identity changed.");
        const persisted = activeReadOnlySessionBranch(snapshot, leafId);
        if (
          persisted.length !== branch.length ||
          persisted.some(
            (entry, index) =>
              entry.id !== branch[index]?.id ||
              (entry.type === "custom" &&
                entry.customType === EFFECT_ENTRY &&
                canonicalJson(entry.data as Json) !== canonicalJson(branch[index]?.data as Json)),
          )
        )
          throw new Error("Effect ancestry differs from persisted snapshot.");
        const onDisk = persisted
          .filter((entry) => entry.type === "custom" && entry.customType === EFFECT_ENTRY)
          .map((entry) => entry.data)
          .filter((value): value is EffectEvent => isStart(value) || isSettled(value));
        for (const start of starts) {
          if (
            !onDisk.some(
              (event) =>
                event.event === "started" &&
                event.effectId === start.effectId &&
                canonicalJson(event as unknown as Json) === canonicalJson(start as unknown as Json),
            )
          )
            continue;
          const matching = onDisk.filter(
            (event): event is EffectSettled =>
              event.event === "settled" && event.effectId === start.effectId && event.sessionId === start.sessionId,
          );
          if (matching.length === 1 && matching[0]!.effectState !== "unknown") unresolved.delete(start.effectId);
        }
      } catch {
        // No qualified persisted readback: all observed starts remain fenced.
      }
    }
    if (this.generation !== generation || this.activeSessionId !== sessionId) return;
    // Do not erase a new start admitted while the persisted snapshot was read.
    for (const [id, event] of this.unresolved)
      if (!starts.some((start) => start.effectId === id)) unresolved.set(id, event);
    this.unresolved.clear();
    for (const [id, event] of unresolved) this.unresolved.set(id, event);
  }

  admit(scope: ToolScope, effect: Effect): Admission {
    return this.recheck(scope, effect);
  }

  recheck(scope: ToolScope, effect: Effect, ticket?: EffectTicket): Admission {
    if (
      scope.sessionId !== this.activeSessionId ||
      (ticket && (ticket.sessionId !== this.activeSessionId || ticket.generation !== this.generation))
    )
      return {
        kind: "denied",
        code: "effect_session_changed",
        message: "Effect persistence target changed before execution.",
      };
    const unresolved = [...this.unresolved.keys()].filter((effectId) => effectId !== ticket?.effectId);
    if (effect !== "captured-read" && unresolved.length > 0)
      return {
        kind: "denied",
        code: "unresolved_effect",
        message: "Live Tool Execution is fenced until an unresolved mutation is reconciled.",
      };
    return { kind: "allowed" };
  }

  private append(event: EffectEvent, host: unknown, generation = this.generation): void {
    const sessionId = (host as any)?.sessionManager?.getSessionId?.();
    if (generation !== this.generation || sessionId !== event.sessionId || sessionId !== this.activeSessionId)
      throw new EffectJournalError(
        "effect_session_changed",
        "Effect persistence target changed before acknowledgement.",
      );
    if (typeof this.pi.appendEntry !== "function")
      throw new EffectJournalError("effect_journal_unavailable", "Native effect persistence is unavailable.");
    this.pi.appendEntry(EFFECT_ENTRY, event);
    const matches = events(host).filter(
      (candidate) => candidate.effectId === event.effectId && candidate.event === event.event,
    );
    if (
      matches.length !== 1 ||
      canonicalJson(matches[0] as unknown as Json) !== canonicalJson(event as unknown as Json)
    )
      throw new EffectJournalError("effect_journal_uncertain", "Native effect persistence could not be acknowledged.");
  }

  async start(
    scope: ToolScope,
    operation: OperationKey,
    effect: Effect,
    input: Json,
    host: unknown,
  ): Promise<EffectTicket | undefined> {
    if (effect !== "mutation") return undefined;
    const event: EffectStart = Object.freeze({
      version: 1,
      event: "started",
      effectId: `effect:${randomUUID()}`,
      sessionId: scope.sessionId,
      parentCallId: scope.parentCallId,
      operation: Object.freeze({ ...operation }),
      effect,
      inputSha256: jsonDigest(input),
      responsibility: Object.freeze(structuredClone(scope.responsibility)),
    });
    this.unresolved.set(event.effectId, event);
    this.append(event, host);
    return Object.freeze({ effectId: event.effectId, sessionId: event.sessionId, generation: this.generation });
  }

  async settle(ticket: EffectTicket | undefined, outcome: CallOutcome, host: unknown): Promise<void> {
    if (!ticket) return;
    const event: EffectSettled = Object.freeze({
      version: 1,
      event: "settled",
      effectId: ticket.effectId,
      sessionId: ticket.sessionId,
      status: outcome.status,
      effectState: outcome.effectState,
      ...(outcome.error ? { errorCode: outcome.error.code } : {}),
    });
    this.append(event, host, ticket.generation);
    if (outcome.effectState !== "unknown") this.unresolved.delete(ticket.effectId);
  }

  status(): {
    unresolvedEffects: number;
    effects: readonly { effectId: string; operation: OperationKey; parentCallId: string }[];
  } {
    return {
      unresolvedEffects: this.unresolved.size,
      effects: Object.freeze(
        [...this.unresolved.values()].slice(0, 16).map((event) =>
          Object.freeze({
            effectId: event.effectId,
            operation: Object.freeze({ ...event.operation }),
            parentCallId: event.parentCallId,
          }),
        ),
      ),
    };
  }
}

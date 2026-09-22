import { randomUUID } from "node:crypto";
import { canonicalJson, jsonDigest } from "./schema.js";
export const EFFECT_ENTRY = "freeflow-tool-effect-v1";
export class EffectJournalError extends Error {
  code;
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "EffectJournalError";
  }
}
function entries(host) {
  const manager = host?.sessionManager;
  const values = manager?.getBranch?.() ?? manager?.getEntries?.();
  return Array.isArray(values) ? values : [];
}
function exact(value, required, optional = []) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  );
}
function isKey(value) {
  return (
    exact(value, ["id", "revision"]) &&
    /^[a-z][a-zA-Z0-9._-]{0,127}$/.test(value.id) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.revision)
  );
}
function isResponsibility(value) {
  return (
    exact(value, ["profile", "control"], ["assignmentId", "executionId", "provider", "modelId", "thinking"]) &&
    ["solo", "coordinator", "helper", "executor", "unknown"].includes(value.profile) &&
    ["inactive", "manual", "automatic", "unknown"].includes(value.control) &&
    ["assignmentId", "executionId", "provider", "modelId", "thinking"].every(
      (key) => value[key] === undefined || (typeof value[key] === "string" && value[key].length <= 512),
    )
  );
}
function isStart(value) {
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
function isSettled(value) {
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
function events(host) {
  return entries(host)
    .filter((entry) => entry?.type === "custom" && entry.customType === EFFECT_ENTRY)
    .map((entry) => entry.data)
    .filter((value) => isStart(value) || isSettled(value));
}
export class EffectRuntime {
  pi;
  unresolved = new Map();
  generation = 0;
  activeSessionId;
  constructor(pi) {
    this.pi = pi;
  }
  reset() {
    this.generation += 1;
    this.activeSessionId = undefined;
    this.unresolved.clear();
  }
  recover(host) {
    this.activeSessionId = host?.sessionManager?.getSessionId?.();
    this.unresolved.clear();
    const all = events(host);
    const settlements = all.filter((event) => event.event === "settled");
    for (const event of all) {
      if (event.event !== "started") continue;
      const matching = settlements.filter(
        (settlement) => settlement.effectId === event.effectId && settlement.sessionId === event.sessionId,
      );
      if (matching.length !== 1 || matching[0].effectState === "unknown") this.unresolved.set(event.effectId, event);
    }
  }
  admit(scope, effect) {
    return this.recheck(scope, effect);
  }
  recheck(scope, effect, ticket) {
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
  append(event, host, generation = this.generation) {
    const sessionId = host?.sessionManager?.getSessionId?.();
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
    if (matches.length !== 1 || canonicalJson(matches[0]) !== canonicalJson(event))
      throw new EffectJournalError("effect_journal_uncertain", "Native effect persistence could not be acknowledged.");
  }
  async start(scope, operation, effect, input, host) {
    if (effect !== "mutation") return undefined;
    const event = Object.freeze({
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
  async settle(ticket, outcome, host) {
    if (!ticket) return;
    const event = Object.freeze({
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
  status() {
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

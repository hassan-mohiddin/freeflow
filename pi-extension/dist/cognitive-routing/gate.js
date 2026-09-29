import { existsSync, realpathSync } from "node:fs";
import { relative, resolve as resolvePath } from "node:path";
import { ROUTING_RECOVERY_HINT } from "./session.js";
export { ROUTING_RECOVERY_HINT };
import { bodyHash } from "./sources.js";
import { initialState } from "./state.js";
import { RoutingError, isWorkerProfile, requireCondition as check, ROUTING_TOOLS } from "./types.js";
/**
 * What routing allows while a profile runs, and what it tells the tool runtime: which ordinary tools a worker may
 * still call, which recovery reads an assessment permits, handoff batching rules, and the operation, admission, and
 * observation scopes other packages attach to their work.
 */
export class ToolGate {
  session;
  packageRoots;
  constructor(session, packageRoots) {
    this.session = session;
    this.packageRoots = packageRoots;
  }
  observationScope() {
    let state;
    try {
      state = this.session.stateData();
    } catch {
      state = initialState();
    }
    const pair = this.session.observed();
    const profile = state.profile ?? "solo";
    const control =
      state.control === "manual" || state.control === "automatic" || state.control === "inactive"
        ? state.control
        : "unknown";
    return {
      profile,
      control,
      ...(state.assignmentId ? { assignmentId: state.assignmentId } : {}),
      ...(this.session.turn?.id ? { executionId: this.session.turn.id } : {}),
      ...(pair ? { provider: pair.provider, modelId: pair.modelId, thinking: pair.thinking } : {}),
    };
  }
  operationScope(ctx = this.session.ctx) {
    let state;
    try {
      state = this.session.stateData();
    } catch {
      state = initialState();
    }
    const sessionId = ctx?.sessionManager?.getSessionId?.();
    return {
      token: this.session.token,
      revision: this.session.revision,
      ...(typeof sessionId === "string" ? { sessionId } : {}),
      supported: this.session.supported(),
      control: state.control,
      ...(state.profile ? { profile: state.profile } : {}),
      ...(state.assignmentId ? { assignmentId: state.assignmentId } : {}),
      ...(this.session.turn?.id ? { turnId: this.session.turn.id } : {}),
      ...(this.session.turn ? { basisUserEntryId: this.session.turn.basisUserEntryId } : {}),
    };
  }
  admitOperation(scope, effect, _operation, ctx = this.session.ctx) {
    try {
      const state = this.session.stateData();
      if (state.recoveryId && effect !== "captured-read")
        return {
          kind: "denied",
          code: "recovery_live_operation",
          message: "Live operations are unavailable during attached evidence recovery.",
        };
      const current = this.operationScope(ctx);
      const same =
        current.token === scope.token &&
        current.revision === scope.revision &&
        current.sessionId === scope.sessionId &&
        current.supported === scope.supported &&
        current.control === scope.control &&
        current.profile === scope.profile &&
        current.assignmentId === scope.assignmentId &&
        current.turnId === scope.turnId &&
        current.basisUserEntryId === scope.basisUserEntryId;
      return same
        ? { kind: "allowed" }
        : {
            kind: "denied",
            code: "routing_scope_changed",
            message: "Routing responsibility changed before operation execution.",
          };
    } catch {
      return { kind: "denied", code: "routing_unavailable", message: "Routing admission is unavailable." };
    }
  }
  admitProgram(scope, ctx = this.session.ctx) {
    try {
      if (this.session.stateData().recoveryId)
        return {
          kind: "denied",
          code: "recovery_program_unavailable",
          message: "Programs are unavailable during attached evidence recovery.",
        };
      return this.admitOperation(scope, "captured-read", { id: "freeflow_run", revision: "1" }, ctx);
    } catch {
      return { kind: "denied", code: "routing_unavailable", message: "Routing admission is unavailable." };
    }
  }
  resultReadAccess(id) {
    try {
      const state = this.session.stateData();
      const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
      if (recovery?.state !== "reading") return { recovery: false };
      const grant = (recovery.results ?? []).find((candidate) => candidate.id === id);
      return { recovery: true, ...(grant ? { sha256: grant.sha256 } : {}) };
    } catch {
      return { recovery: false };
    }
  }
  handoffOperation(name, input) {
    if (name === "freeflow_delegate") return true;
    if (name === "freeflow_return") return ["submit", "supplement", "retry"].includes(input?.operation);
    return name === "freeflow_unit" && input?.operation === "recover";
  }
  stableRecoveryPath(path) {
    return (
      !path.startsWith("@") &&
      path !== "~" &&
      !path.startsWith("~/") &&
      !path.startsWith("file://") &&
      !/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/u.test(path) &&
      !(process.platform === "win32" && /^\/(?:mnt\/|cygdrive\/)?[a-z](?:\/|$)/i.test(path))
    );
  }
  canonicalRecoveryPath(path) {
    check(this.stableRecoveryPath(path), "recovery_path_unsupported", `Recovery path spelling is unsupported: ${path}`);
    const requested = resolvePath(this.session.ctx.cwd, path);
    check(existsSync(requested), "recovery_path_unavailable", `Recovery path is unavailable: ${path}`);
    try {
      return realpathSync(requested);
    } catch {
      throw new RoutingError("recovery_path_unavailable", `Recovery path is unavailable: ${path}`);
    }
  }
  packagedInstruction(path) {
    return this.packageRoots.some((root) => {
      const inside = relative(root, path);
      if (!inside || inside.startsWith("..") || resolvePath(root, inside) !== path) return false;
      return (
        /^(?:skills|capabilities)\/[^/]+\/SKILL\.md$/.test(inside) ||
        /^(?:skills|capabilities)\/[^/]+\/references\/[^/]+\.md$/.test(inside)
      );
    });
  }
  recoveryReadAllowed(state, name, input) {
    if (!state.recoveryId) return false;
    const recovery = state.recoveries.get(state.recoveryId);
    if (!recovery || recovery.state !== "reading") return false;
    if (name === "freeflow_result" && typeof input?.id === "string") {
      return (recovery.results ?? []).some((grant) => grant.id === input.id);
    }
    if (name !== "read" || typeof input?.path !== "string" || !this.stableRecoveryPath(input.path)) return false;
    try {
      const path = this.canonicalRecoveryPath(input.path);
      return recovery.paths.includes(path) || this.packagedInstruction(path);
    } catch {
      return false;
    }
  }
  batch(callId, name) {
    check(this.session.turn?.message, "batch_unavailable");
    const matches = this.session.ctx.sessionManager
      .getBranch()
      .filter(
        (e) =>
          !this.session.turn.before.has(e.id) &&
          e.type === "message" &&
          e.message?.role === "assistant" &&
          e.message.content?.some((b) => b.type === "toolCall" && b.id === callId),
      );
    check(matches.length === 1, "batch_source_changed");
    const fingerprint = bodyHash(matches[0].message);
    check(
      !this.session.turn.sourceFingerprint || this.session.turn.sourceFingerprint === fingerprint,
      "batch_source_changed",
    );
    // Later message_end handlers may legitimately replace the message. The first
    // preflight freezes the actually persisted batch before any of its tools act.
    this.session.turn.sourceFingerprint = fingerprint;
    this.session.turn.message = structuredClone(matches[0].message);
    const calls = (this.session.turn.message.content ?? []).filter((b) => b.type === "toolCall");
    const handoffs = calls.filter((b) => this.handoffOperation(b.name, b.arguments));
    check(
      !handoffs.length ||
        (handoffs.length === 1 &&
          this.handoffOperation(calls.at(-1)?.name, calls.at(-1)?.arguments) &&
          calls.every((b) => this.handoffOperation(b.name, b.arguments) || b.name === "freeflow_project")),
      "invalid_handoff_batch",
      "A handoff must be last and cannot accompany ordinary task tools.",
    );
    check(
      calls.some((b) => b.id === callId && b.name === name),
      "call_not_in_batch",
    );
  }
  preflight(event, ctx) {
    this.session.ctx = ctx;
    const name = event.toolName,
      isRouting = ROUTING_TOOLS.includes(name);
    if (!this.session.supported()) return isRouting ? { block: true, reason: "Routing is unavailable." } : undefined;
    try {
      const state = this.session.stateData();
      if (state.control === "manual")
        return isRouting && name !== "freeflow_unit" ? { block: true, reason: "Manual control is active." } : undefined;
      if (state.control !== "automatic")
        return isRouting ? { block: true, reason: "Automatic routing is inactive." } : undefined;
      this.batch(event.toolCallId, name);
      check(!this.session.error && !this.session.store?.blocked, "routing_blocked");
      this.session.openTurn();
      if (isWorkerProfile(this.session.turn?.profile) && !isRouting) {
        const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
        const worker = a ? this.session.assignedWorker(state, a.id) : undefined;
        const ordinary =
          a?.state === "outstanding" &&
          this.session.turn.basisUserEntryId === this.session.taskBasis(state, a.id) &&
          state.profile === worker &&
          this.session.turn.profile === worker;
        const recovery =
          a?.state === "returned" &&
          this.session.turn.basisUserEntryId === this.session.workerBasis(state, a.id) &&
          state.profile === worker &&
          this.session.turn.profile === worker &&
          this.recoveryReadAllowed(state, name, event.input);
        check(ordinary || recovery, "worker_task_phase_ended");
      }
      return undefined;
    } catch (error) {
      return { block: true, reason: error instanceof Error ? error.message : String(error) };
    }
  }
}

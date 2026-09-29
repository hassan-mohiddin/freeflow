import { randomUUID } from "node:crypto";
import { estimateRequest } from "./budget.js";
import type { ModelControl } from "./model-control.js";
import { prepareView, type PreparedView } from "./projection.js";
import { annotateSources } from "./provenance.js";
import { ROUTING_SCHEMAS } from "./schemas.js";
import { ROUTING_RECOVERY_HINT, RoutingSession } from "./session.js";
import { Sources, deliveredSelection } from "./sources.js";
import {
  ROUTING_ATTENTION_MESSAGE,
  ROUTING_ENTRY,
  ROUTING_MESSAGE,
  ROUTING_TOOLS,
  emptySelection,
  isWorkerProfile,
  requireCondition as check,
  samePair,
  type Execution,
  type NativeEntry,
  type Profile,
  type State,
} from "./types.js";

/**
 * Builds each routed request: finds the last delivered user input, opens the execution for the prepared profile,
 * prepares that profile's view with its Runtime State message and admitted evidence, and records newly exposed
 * worker sources. Requests outside automatic routing get source annotations only.
 */
export class ContextAssembler {
  constructor(
    readonly session: RoutingSession,
    private readonly pi: any,
    private readonly models: ModelControl,
  ) {}
  lastDeliveredUser(sources: Sources, messages: any[]): string | null {
    const delivered = new Set(
      sources.associate(messages).flatMap((x) => (x.source?.message.role === "user" ? [x.source.entry.id] : [])),
    );
    // Compaction may remove every user message from the active view. Retain
    // observed delivery on this ancestry; a stored but undelivered user entry
    // must not advance the basis, and absence must not manufacture new input.
    for (const execution of this.session.stateData().executions.values())
      if (execution.basisUserEntryId) delivered.add(execution.basisUserEntryId);
    for (let i = sources.entries.length - 1; i >= 0; i--) {
      const entry = sources.entries[i];
      if (entry.message?.role === "user" && delivered.has(entry.id)) return entry.id;
    }
    return null;
  }
  runtimeMessage(state: State, attention = false): any {
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    const h = state.pendingId
      ? state.handoffs.get(state.pendingId)
      : state.assessment
        ? state.handoffs.get(state.assessment.handoffId)
        : undefined;
    const selection = a ? (state.selections.get(a.id) ?? emptySelection()) : emptySelection();
    const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
    const unit = state.unitId ? state.units.get(state.unitId) : undefined;
    const unitNumber = unit ? [...state.units.keys()].indexOf(unit.id) + 1 : undefined;
    const assignmentNumber = unit && a ? unit.assignmentIds.indexOf(a.id) + 1 : undefined;
    const worker = a ? state.handoffs.get(a.delegateHandoffId)?.to : undefined;
    const prepared = state.assessment?.reservation?.selectionRevision;
    // Only material, decision-bearing fields: every change appends a new copy to request history.
    // Control, delegation and projection belong to the Freeflow Runtime State; ids are available through inspection.
    const evidence = a
      ? [
          `Evidence: revision ${selection.revision}; selected ${selection.selected.join(", ") || "none"}`,
          selection.unresolved.length
            ? `unresolved ${selection.unresolved.map((p) => `${p.ref} (${p.code})`).join(", ")}`
            : "",
          selection.withdrawals.length ? `withdrawn ${selection.withdrawals.length}` : "",
          prepared !== undefined && prepared !== selection.revision ? `prepared revision ${prepared}` : "",
        ]
          .filter(Boolean)
          .join("; ")
      : "";
    const content = [
      "# Cognitive Routing Runtime State",
      `Profile: ${state.profile ?? "unresolved"}`,
      `Unit: ${unit ? `U${unitNumber}` : "none"}`,
      `Assignment: ${a ? `A${assignmentNumber} (${worker ?? "unknown"}, ${a.state})` : "none"}`,
      `Handoff: ${h ? `${h.kind} ${h.state}` : "none"}`,
      state.assessment ? `Assessment: ${state.assessment.view}` : "",
      recovery
        ? `Recovery: ${recovery.state}; parent report revision ${recovery.baseReportRevision}; allowed paths ${JSON.stringify(recovery.paths)}; allowed results ${JSON.stringify((recovery.results ?? []).map((grant) => grant.id))}`
        : "",
      recovery?.state === "reading"
        ? `Recovery request: ${recovery.request}\nOnly exact allowed read paths, granted captured results, evidence selection, and recovery return controls are permitted; ordinary task work remains ended.`
        : "",
      evidence,
      this.session.error ? `Blocked: ${this.session.error}` : "",
      this.session.projectionError ? `Evidence limitation: ${this.session.projectionError}` : "",
      attention
        ? recovery
          ? `Assessment paused for attention; ordinary admitted history remains. ${selection.selected.length} sources remain selected. Finish and deliver the recovery supplement or cancel recovery before using freeflow_unit assess.`
          : `Assessment paused for attention; ordinary admitted history remains. ${selection.selected.length} sources remain selected. Use freeflow_unit assess to restore the assessment.`
        : "",
      a?.state === "returned" && recovery?.state !== "reading"
        ? "Worker ordinary task work has ended. Only supported handoff correction is permitted."
        : "",
      isWorkerProfile(this.session.turn?.profile) &&
      a &&
      this.session.turn.basisUserEntryId !== this.session.workerBasis(state, a.id)
        ? `Current input differs from the active ${this.session.turn.profile} responsibility. Account for it; changed direction requires Coordinator attention.`
        : "",
      ...(state.assessment?.problems ?? []).map((p) => `${p.code}: ${p.detail}`),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      role: "custom",
      customType: ROUTING_MESSAGE,
      content,
      display: false,
      timestamp: 0,
      details: { routingInstance: this.session.token },
    };
  }
  evidenceFacts(state: State) {
    const selection = state.assignmentId
      ? (state.selections.get(state.assignmentId) ?? emptySelection())
      : emptySelection();
    const sources = this.session.sources(state);
    return {
      revision: selection.revision,
      selected: selection.selected
        .filter((ref) => deliveredSelection(sources, ref))
        .map((ref) => {
          const entry = this.session.ctx?.sessionManager.getEntry?.(ref.slice(4));
          const locator = sources.locator(ref);
          return {
            ref,
            kind: entry?.message?.role ?? "unknown",
            toolName: entry?.message?.toolName,
            producer: state.authors.get(entry?.id)?.profile ?? "common",
            assignment: state.authors.get(entry?.id)?.assignmentId,
            ...(locator ? { locator } : {}),
          };
        }),
      unresolved: selection.unresolved,
      withdrawals: selection.withdrawals,
      preparedRevision: state.assessment?.reservation?.selectionRevision,
      limitations: state.assessment?.problems ?? [],
    };
  }
  private admissionCache?: {
    state: State;
    leaf: string | null;
    admissions: Map<string, number>;
    resumedAt?: number;
  };
  /**
   * Source rank at which each currently selected ref was first admitted, derived from native selection events,
   * and the rank at which the current assessment last resumed from an attention suspension.
   */
  admissions(state: State): { admissions: Map<string, number>; resumedAt?: number } {
    const reader = this.session.ctx.sessionManager,
      leaf = reader.getLeafId?.() ?? null;
    const cache = this.admissionCache;
    if (cache && cache.state === state && cache.leaf === leaf) return cache;
    const admissions = new Map<string, number>();
    let rank = 0,
      resumedAt: number | undefined;
    for (const entry of reader.getBranch() as NativeEntry[]) {
      if (["message", "custom_message", "compaction", "branch_summary"].includes(entry.type)) rank++;
      else if (entry.type === "custom" && entry.customType === ROUTING_ENTRY) {
        const data = (entry as any).data?.data;
        if (data?.type === "assessment-resumed" && data.handoffId === state.assessment?.handoffId) resumedAt = rank;
        if (data?.type !== "selection-changed") continue;
        const current = state.selections.get(data.assignmentId)?.selected ?? [];
        for (const ref of data.selection?.selected ?? [])
          if (current.includes(ref) && !admissions.has(ref)) admissions.set(ref, rank);
      }
    }
    this.admissionCache = { state, leaf, admissions, resumedAt };
    return this.admissionCache;
  }
  prepared(profile: Profile, input: any[], handoffId?: string, restoring = false): PreparedView {
    const state = this.session.stateData(),
      model = this.models.model(profile);
    return prepareView({
      ...(({ admissions, resumedAt }) => ({ admissions, resumedAt }))(this.admissions(state)),
      messages: input,
      sources: this.session.sources(state),
      state,
      view: profile,
      projection: this.session.projectionEnabled,
      model,
      pair: this.session.profilePair(profile),
      systemPrompt: this.session.ctx.getSystemPrompt?.() ?? "",
      tools: (this.pi.getAllTools?.() ?? [])
        .filter((tool: any) => this.pi.getActiveTools?.().includes(tool.name))
        .map((tool: any) =>
          ROUTING_TOOLS.includes(tool.name) ? { ...tool, parameters: ROUTING_SCHEMAS[tool.name] } : tool,
        ),
      runtimeMessage: this.runtimeMessage(
        state,
        profile === "coordinator" && state.assessment?.view === "suspended" && !restoring && !handoffId,
      ),
      instance: this.session.token,
      preparingReturn: handoffId,
      restoring,
    });
  }
  budgetNotice(messages: any[], ctx: any): any | undefined {
    if (!this.session.supported()) return;
    const tools = (this.pi.getAllTools?.() ?? []).filter((tool: any) => this.pi.getActiveTools?.().includes(tool.name));
    const estimate = estimateRequest(ctx.getSystemPrompt?.() ?? "", tools, messages, ctx.model);
    if (!estimate.warnings.length) return;
    return {
      role: "custom",
      customType: "freeflow-routing-budget",
      display: false,
      content: estimate.warnings.map((warning) => warning.detail).join("\n"),
      timestamp: 0,
    };
  }
  private ordinaryContext(input: any[]): any[] {
    try {
      const sources = this.session.sources(),
        associated = sources.associate(input);
      const mapped = new Map(associated.filter((item) => item.source).map((item) => [item.message, item.source!]));
      return annotateSources(
        input,
        mapped,
        new Set([...mapped.values()].map((source) => source.ref)),
        sources,
        this.session.token,
      );
    } catch {
      return input;
    }
  }
  async context(ctx: any, incoming: any[]): Promise<any[]> {
    this.session.ctx = ctx;
    const input = incoming.filter(
      (m) =>
        !(
          m?.details?.routingInstance === this.session.token &&
          [ROUTING_MESSAGE, ROUTING_ATTENTION_MESSAGE, "freeflow-routing-v2-refs"].includes(m.customType)
        ),
    );
    this.session.messages = input;
    if (!this.session.supported() || !this.session.store) return this.ordinaryContext(input);
    try {
      const state = this.session.stateData();
      if (state.control !== "automatic") return this.ordinaryContext(input);
      check(
        !this.session.error && !this.session.store.blocked && state.profile,
        "routing_blocked",
        this.session.error ?? this.session.store.blocked,
      );
      this.session.announced = undefined;
      check(samePair(this.session.observed(), this.session.profilePair(state.profile!)), "prepared_pair_mismatch");
      const sources = this.session.sources(state),
        user = this.lastDeliveredUser(sources, input);
      if (state.assessment && user && user !== state.assessment.basisUserEntryId)
        this.session.append(
          {
            type: "assessment-suspended",
            handoffId: state.assessment.handoffId,
            reason: "user-attention",
            basisUserEntryId: user,
            problems: [],
          },
          JSON.stringify(["attention", state.assessment.handoffId, user]),
        );
      // New input reaching an already prepared worker request cannot be rerouted by changing only the live model.
      const outstanding = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
      const worker = outstanding ? this.session.assignedWorker(state, outstanding.id) : undefined;
      const interrupted =
        isWorkerProfile(state.profile) &&
        (state.profile !== worker ||
          user !== (outstanding ? this.session.workerBasis(state, outstanding.id) : undefined));
      if (!this.session.turn || this.session.turn.bound) {
        this.session.receipts.clear();
        const execution: Execution = {
          id: randomUUID(),
          profile: state.profile!,
          assignmentId: state.assignmentId,
          recoveryId: state.recoveryId,
          basisUserEntryId: user,
          pair: this.session.observed()!,
          resultEntryIds: [],
        };
        const before = new Set((ctx.sessionManager.getBranch() as NativeEntry[]).map((e) => e.id));
        this.session.turn = {
          id: execution.id,
          profile: execution.profile,
          assignmentId: execution.assignmentId,
          recoveryId: execution.recoveryId,
          basisUserEntryId: user,
          before,
          pair: execution.pair,
        };
        this.session.openTurn();
      }
      let prepared = this.prepared(state.profile!, input);
      if (!prepared.ready && state.profile === "coordinator" && this.session.stateData().assessment) {
        const assessment = this.session.stateData().assessment!;
        this.session.append({
          type: "assessment-suspended",
          handoffId: assessment.handoffId,
          reason: "delivery-gap",
          basisUserEntryId: user,
          problems: prepared.problems,
        });
        this.session.projectionError = prepared.problems.map((p) => p.code).join(", ");
        prepared = this.prepared("coordinator", input);
      }
      check(prepared.ready, "context_unavailable", prepared.problems.map((p) => p.detail).join("; "));
      const known = this.session.stateData().exposure;
      const added = prepared.fullSources.filter((s) => known.get(s.ref) !== s.hash);
      if (isWorkerProfile(this.session.turn.profile))
        for (let i = 0; i < added.length; i += 128)
          this.session.append({
            type: "sources-exposed",
            executionId: this.session.turn.id,
            view: this.session.turn.profile,
            sources: added.slice(i, i + 128).map((s) => ({ ref: s.ref, bodyHash: s.hash })),
          });
      if (interrupted)
        prepared.messages.push({
          role: "custom",
          customType: ROUTING_ATTENTION_MESSAGE,
          display: false,
          timestamp: 0,
          details: { routingInstance: this.session.token },
          content:
            "New delivered user input requires Coordinator attention. Do not run ordinary task tools; return the current partial result.",
        });
      return prepared.messages;
    } catch (error) {
      this.session.mark(error);
      this.session.announceBlock(ctx);
      ctx.abort?.();
      // Do not send an accidental full worker history on a projection failure.
      return [
        {
          role: "custom",
          customType: ROUTING_MESSAGE,
          content: `Automatic request blocked: ${this.session.error}. ${ROUTING_RECOVERY_HINT}`,
          display: false,
          timestamp: 0,
          details: { routingInstance: this.session.token, routingRequestBlocked: true },
        },
      ];
    }
  }
}

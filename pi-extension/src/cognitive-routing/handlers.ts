import { randomUUID } from "node:crypto";
import type { ContextAssembler } from "./assembler.js";
import type { ToolGate } from "./gate.js";
import type { ModelControl } from "./model-control.js";
import { changeSelection, representationProblems } from "./projection.js";
import { RoutingSession } from "./session.js";
import { bodyHash, isTaskEvidence, type Source } from "./sources.js";
import type { RoutingStatus } from "./status.js";
import {
  RoutingError,
  canonical,
  emptySelection,
  idFor,
  isWorkerProfile,
  requireCondition as check,
  type EffectFencePort,
  type Handoff,
  type NativeEntry,
  type Recovery,
  type ResultGrant,
  type ResultGrantPort,
  type WorkerProfile,
} from "./types.js";
import { cachedBranch } from "../host/branch.js";
/**
 * Runs the routing tools (freeflow_delegate, freeflow_return, freeflow_project, freeflow_unit) one at a time on the
 * session's queue. Each accepted call is recorded once under its operation id, so a repeated call returns the saved
 * result instead of acting again; a refused call returns a blocked result that names what to reconcile.
 */
export class ToolHandlers {
  constructor(
    readonly session: RoutingSession,
    private readonly models: ModelControl,
    private readonly gate: ToolGate,
    private readonly assembler: ContextAssembler,
    private readonly status: RoutingStatus,
  ) {}
  private resultGrants?: ResultGrantPort;
  private effectFence?: EffectFencePort;
  setResultGrantPort(port: ResultGrantPort): void {
    this.resultGrants = port;
  }
  setEffectFencePort(port: EffectFencePort): void {
    this.effectFence = port;
  }
  private callOperation(callId: string, name: string): string {
    check(this.session.turn && this.session.store, "execution_missing");
    this.gate.batch(callId, name);
    return JSON.stringify([this.session.store.reader.getSessionId(), this.session.turn.id, callId, name]);
  }
  result(value: any): any {
    return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
  }
  async invoke(name: string, callId: string, input: any, signal: AbortSignal | undefined, ctx: any): Promise<any> {
    return this.session.enqueue(async () => {
      this.session.ctx = ctx;
      try {
        check(!signal?.aborted, "cancelled");
        if (name === "freeflow_unit" && input.operation === "inspect") {
          check(this.session.supported(), "routing_unavailable");
          return this.result(this.inspectUnit(input));
        }
        const state = this.session.stateData();
        const expected =
          name === "freeflow_delegate" || name === "freeflow_unit" ? "coordinator" : this.session.assignedWorker(state);
        this.session.assertAvailable(expected);
        const op = this.callOperation(callId, name);
        const cached = this.session.receipts.get(op);
        if (cached) {
          check(cached.input === canonical(input), "operation_conflict");
          return this.result(structuredClone(cached.value));
        }
        const value =
          name === "freeflow_delegate"
            ? this.delegate(input, callId, op)
            : name === "freeflow_return"
              ? this.returnReport(input, callId, op)
              : name === "freeflow_project"
                ? this.project(input, op)
                : name === "freeflow_unit"
                  ? await this.unit(input, callId, op)
                  : undefined;
        if (value !== undefined) {
          this.session.receipts.set(op, { input: canonical(input), value: structuredClone(value) });
          return this.result(value);
        }
        throw new RoutingError("unknown_tool", name);
      } catch (error) {
        return this.result({
          status: "blocked",
          code: error instanceof RoutingError ? error.code : "operation_failed",
          message: error instanceof Error ? error.message : String(error),
          problems: error instanceof RoutingError ? error.problems : [],
          observed: this.session.observed(),
          expectedProfile:
            name === "freeflow_unit" && input.operation === "inspect"
              ? undefined
              : name === "freeflow_delegate" || name === "freeflow_unit"
                ? "coordinator"
                : (() => {
                    try {
                      return this.session.assignedWorker(this.session.stateData());
                    } catch {
                      return undefined;
                    }
                  })(),
          recoveryAction:
            error instanceof RoutingError &&
            [
              "cursor_expired",
              "invalid_cursor",
              "work_ref_required",
              "invalid_work_ref",
              "work_unavailable",
              "invalid_inspection",
            ].includes(error.code)
              ? "Inspect again without a cursor and use a returned work ref. Lookup recovery does not require a new assignment."
              : "Preserve saved work. Use freeflow_unit inspect; reconcile current input/control before retrying the named operation.",
        });
      }
    });
  }
  private duplicate(op: string): any {
    return [...this.session.stateData().events.values()].find(
      (e) =>
        e.operationId === op &&
        [
          "delegate-accepted",
          "return-accepted",
          "recovery-request-accepted",
          "recovery-supplement-accepted",
          "recovery-cancelled",
          "handoff-retry-requested",
        ].includes(e.data.type),
    );
  }
  private delegate(input: any, callId: string, op: string) {
    const prior = this.duplicate(op);
    if (prior) {
      check(
        prior.data.type === "delegate-accepted" &&
          prior.data.assignment.contract === input.contract &&
          (input.worker === undefined || prior.data.handoff.to === input.worker),
        "operation_conflict",
      );
      return { status: "accepted", handoff: prior.data.handoff.id, unchanged: true };
    }
    const state = this.session.stateData();
    const enabled = this.session.enabledWorkers();
    let worker: WorkerProfile;
    if (input.worker === undefined) {
      check(enabled.length === 1, "worker_required", "Delegation mode 'both' requires choosing helper or executor.");
      worker = enabled[0]!;
    } else {
      check(isWorkerProfile(input.worker), "invalid_worker");
      worker = input.worker;
    }
    check(enabled.includes(worker), "worker_disabled", `${worker} is not enabled by delegation mode.`);
    const unit = state.unitId
      ? state.units.get(state.unitId)!
      : { id: randomUUID(), objective: input.contract, state: "open" as const, assignmentIds: [] };
    const old = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    if (input.operation === "replace")
      check(old?.state === "outstanding" && !this.models.applying, "no_quiescent_assignment");
    else
      check(
        input.operation === "assign" && old?.state !== "outstanding" && !state.pendingId && !state.recoveryId,
        "assignment_outstanding",
      );
    const assignmentId = randomUUID(),
      id = randomUUID();
    const assignment = {
      id: assignmentId,
      unitId: unit.id,
      contract: input.contract,
      state: "outstanding" as const,
      delegateHandoffId: id,
      basisUserEntryId: this.session.turn!.basisUserEntryId,
    };
    const h: Handoff = {
      id,
      kind: "delegate",
      assignmentId,
      text: input.contract,
      from: "coordinator",
      to: worker,
      executionId: this.session.turn!.id,
      toolCallId: callId,
      basisUserEntryId: this.session.turn!.basisUserEntryId,
      state: "pending",
      reportRevision: 0,
      limitations: [],
    };
    this.session.append(
      {
        type: "delegate-accepted",
        unit: { ...unit, assignmentIds: [...unit.assignmentIds, assignmentId] },
        assignment,
        handoff: h,
        ...(input.operation === "replace"
          ? {
              replacement: {
                assignmentId: old!.id,
                reason: input.reason,
                ...(state.pendingId ? { supersededHandoffId: state.pendingId } : {}),
              },
            }
          : {}),
      },
      op,
    );
    return {
      status: "accepted",
      unit: unit.id,
      assignment: assignmentId,
      worker,
      handoff: id,
      transition: "pending",
      createdUnit: !state.unitId,
      ...(old && input.operation === "replace"
        ? {
            replacedAssignment: old.id,
            continuity:
              "Prior effects and evidence remain on native history. Reconcile uncertain effects before dependent work.",
          }
        : {}),
    };
  }
  private returnReport(input: any, callId: string, op: string) {
    const state = this.session.stateData(),
      a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(a, "assignment_missing");
    const worker = this.session.assignedWorker(state, a.id);
    const recovery = state.recoveryId ? state.recoveries.get(state.recoveryId) : undefined;
    const original = a.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
    const supplement = recovery?.supplementHandoffId ? state.handoffs.get(recovery.supplementHandoffId) : undefined;
    const retryingSupplement = input.operation === "retry" && recovery?.state === "returning";
    const saved = retryingSupplement || input.operation === "supplement" ? supplement : original;
    const selection = state.selections.get(a.id) ?? emptySelection();
    const duplicate = this.duplicate(op);
    if (duplicate) {
      if (input.operation === "retry") check(duplicate.data.type === "handoff-retry-requested", "operation_conflict");
      else {
        const expected = input.operation === "supplement" ? "recovery-supplement-accepted" : "return-accepted";
        check(
          duplicate.data.type === expected &&
            duplicate.data.handoff.text === input.report &&
            duplicate.data.handoff.outcome === input.outcome &&
            canonical(duplicate.data.handoff.limitations) === canonical(input.limitations ?? []),
          "operation_conflict",
        );
      }
      const handoff = duplicate.data.handoffId ?? duplicate.data.handoff.id;
      return { ...this.returnReadiness(handoff), unchanged: true };
    }
    if (input.operation === "retry") {
      check(saved && ["blocked", "pending"].includes(saved.state), "saved_return_missing");
      this.session.append(
        {
          type: "handoff-retry-requested",
          handoffId: saved.id,
          attemptId: randomUUID(),
          executionId: this.session.turn!.id,
          toolCallId: callId,
          reportRevision: saved.reportRevision,
          selectionRevision: selection.revision,
        },
        op,
      );
      return {
        ...this.returnReadiness(saved.id),
        reportUnchanged: true,
        supplementUnchanged: saved.kind === "recovery-return",
      };
    }
    if (input.operation === "supplement") {
      check(
        recovery &&
          ["reading", "returning"].includes(recovery.state) &&
          (!supplement || ["pending", "blocked"].includes(supplement.state)),
        "recovery_not_returnable",
      );
      const h: Handoff = {
        id: supplement?.id ?? randomUUID(),
        kind: "recovery-return",
        assignmentId: a.id,
        text: input.report,
        from: worker,
        to: "coordinator",
        executionId: this.session.turn!.id,
        toolCallId: callId,
        basisUserEntryId: this.session.turn!.basisUserEntryId,
        state: "pending",
        reportRevision: (supplement?.reportRevision ?? 0) + 1,
        outcome: input.outcome,
        limitations: input.limitations ?? [],
      };
      this.session.append({ type: "recovery-supplement-accepted", recoveryId: recovery.id, handoff: h }, op);
      return this.returnReadiness(h.id);
    }
    check(input.operation === "submit", "invalid_return_operation");
    check(
      input.outcome !== "completed" || !this.effectFence?.status().unresolvedEffects,
      "unresolved_effect",
      "A clean completed return is unavailable while a live effect requires reconciliation.",
    );
    check(
      a.state === "outstanding" ||
        (a.state === "returned" && original && ["pending", "blocked"].includes(original.state)),
      "assignment_task_ended",
    );
    const h: Handoff = {
      id: original?.id ?? randomUUID(),
      kind: "return",
      assignmentId: a.id,
      text: input.report,
      from: worker,
      to: "coordinator",
      executionId: this.session.turn!.id,
      toolCallId: callId,
      basisUserEntryId: this.session.turn!.basisUserEntryId,
      state: "pending",
      reportRevision: (original?.reportRevision ?? 0) + 1,
      outcome: input.outcome,
      limitations: input.limitations ?? [],
    };
    this.session.append({ type: "return-accepted", handoff: h }, op);
    return this.returnReadiness(h.id);
  }
  private returnReadiness(id: string) {
    const state = this.session.stateData();
    const h = state.handoffs.get(id)!;
    const prepared = this.assembler.prepared("coordinator", this.session.messages, id);
    const isSupplement = h.kind === "recovery-return";
    const recovery = isSupplement
      ? [...state.recoveries.values()].find((candidate) => candidate.supplementHandoffId === h.id)
      : undefined;
    return {
      status: "accepted",
      reportSaved: !isSupplement,
      supplementSaved: isSupplement,
      handoff: id,
      ...(recovery ? { recovery: recovery.id } : {}),
      ...(isSupplement ? { supplementRevision: h.reportRevision } : { reportRevision: h.reportRevision }),
      assignmentRef: `assignment:${h.assignmentId}`,
      ...(isSupplement
        ? { supplementRef: `supplement:${recovery?.id ?? "unknown"}:${h.reportRevision}` }
        : { reportRef: `report:${h.id}:${h.reportRevision}` }),
      producer: h.from,
      outcome: h.outcome,
      limitations: h.limitations,
      ready: prepared.ready,
      transition: prepared.ready ? "pending" : "blocked",
      problems: prepared.problems,
      warnings: prepared.warnings,
      stage: "completed-input preparation",
      finalExchangePending: true,
      provisional:
        "The finalized handoff exchange, target configuration and budget are revalidated at turn_end; this is not delivery evidence.",
      // The text is already in the call arguments; the hash identifies it without a second copy.
      ...(isSupplement ? { supplementSha256: bodyHash(h.text) } : { reportSha256: bodyHash(h.text) }),
      evidence: this.assembler.evidenceFacts(state),
    };
  }
  private project(input: any, op: string) {
    check(this.session.projectionEnabled, "projection_disabled");
    const state = this.session.stateData(),
      a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(a, "assignment_missing");
    const sources = this.session.sources(state);
    sources.associate(this.session.messages);
    const selection = state.selections.get(a.id) ?? emptySelection();
    let next = selection;
    if (input.operation !== "inspect") {
      check(["add", "remove"].includes(input.operation), "invalid_projection_operation");
      next = changeSelection(selection, input, sources, state);
      if (next !== selection)
        this.session.append({ type: "selection-changed", assignmentId: a.id, selection: next }, op);
    }
    const prepared = this.assembler.prepared("coordinator", this.session.messages, a.returnHandoffId);
    const scope = input.scope ?? "assignment";
    let page: any;
    if (input.operation === "inspect") {
      const model = this.models.model("coordinator");
      const checksFor = (s: Source) => {
        const eligibility = sources.selectionProblem(s.ref, state);
        const limitations = [
          ...(eligibility ? [eligibility] : []),
          ...representationProblems(s, model),
          ...sources.exchange(s).problems,
        ];
        return { eligible: !eligibility, targetReady: !limitations.length, limitations };
      };
      const rows = () =>
        [...sources.byRef.values()]
          .filter(
            (s) =>
              isWorkerProfile(s.producer) &&
              (isTaskEvidence(s) || (scope === "selected" && next.selected.includes(s.ref))) &&
              (scope === "selected"
                ? next.selected.includes(s.ref)
                : scope === "assignment"
                  ? s.assignmentId === a.id
                  : scope === "active"
                    ? s.active
                    : true),
          )
          .map((s) => {
            const locator = sources.locator(s.ref);
            return {
              ref: s.ref,
              kind: s.message.role,
              producer: s.producer,
              assignment: s.assignmentId,
              toolName: s.message.toolName,
              ...(locator ? { locator } : {}),
              active: s.active,
              selected: next.selected.includes(s.ref),
              retainedSelection: next.selected.includes(s.ref) && !isTaskEvidence(s),
              ...checksFor(s),
            };
          })
          // Discovery offers usable candidates. Saved selections must remain
          // inspectable even when a later source or target check fails.
          .filter((row) => scope === "selected" || row.targetReady);
      page = this.page(
        `evidence:${scope}`,
        rows,
        input.cursor,
        30,
        scope === "assignment" || scope === "selected" ? a.id : undefined,
        scope === "active",
        (rows) => ({
          scopeCounts: {
            candidates: rows.length,
            eligible: rows.filter((r: any) => r.eligible).length,
            targetReady: rows.filter((r: any) => r.targetReady).length,
          },
          otherAssignments: [...sources.byRef.values()].filter(
            (s) =>
              isWorkerProfile(s.producer) && s.assignmentId !== a.id && isTaskEvidence(s) && checksFor(s).targetReady,
          ).length,
        }),
      );
    }
    return {
      status: input.operation === "inspect" || next === selection ? "unchanged" : "saved",
      ...(page
        ? {
            scope,
            count: page.count,
            returned: page.items.length,
            candidates: page.items,
            nextCursor: page.nextCursor,
            ...page.summary,
            pageCounts: {
              candidates: page.items.length,
              eligible: page.items.filter((r: any) => r.eligible).length,
              targetReady: page.items.filter((r: any) => r.targetReady).length,
            },
            countsBasis:
              "Inspection snapshot; page counts describe returned candidates, scope counts describe all candidates in this scope.",
            historyHint: page.summary.otherAssignments
              ? "Previously exposed task evidence exists in other assignments; inspect scope history when needed."
              : undefined,
          }
        : {}),
      revision: next.revision,
      selected: next.selected,
      selectedCount: next.selected.length,
      unresolved: next.unresolved,
      ready: !next.unresolved.length && prepared.ready,
      problems: prepared.problems,
      warnings: prepared.warnings,
      evidence: this.assembler.evidenceFacts(this.session.stateData()),
      items: (input.refs ? [...new Set<string>(input.refs)] : []).map((ref) => ({
        ref,
        status: next.unresolved.some((p) => p.ref === ref)
          ? "rejected"
          : input.operation === "remove"
            ? selection.selected.includes(ref)
              ? "removed"
              : selection.unresolved.some((p) => p.ref === ref)
                ? "withdrawn"
                : "unchanged"
            : selection.selected.includes(ref)
              ? "already_selected"
              : "added",
      })),
      estimate: { tokens: prepared.estimatedTokens, method: prepared.estimateMethod },
    };
  }
  async unit(input: any, callId: string, op: string) {
    const state = this.session.stateData();
    const prior = [...state.events.values()].find((e) => e.operationId === op);
    if (prior) {
      if (input.operation === "recover") {
        check(
          prior.data.type === "recovery-request-accepted" &&
            prior.data.recovery.request === input.request &&
            canonical(prior.data.recovery.requestedPaths) === canonical([...new Set<string>(input.paths ?? [])]) &&
            canonical(prior.data.recovery.requestedResults ?? []) === canonical(input.results ?? []),
          "operation_conflict",
        );
        const { recovery, handoff } = prior.data;
        return {
          status: "accepted",
          unchanged: true,
          recovery: recovery.id,
          handoff: handoff.id,
          assignmentRef: `assignment:${recovery.assignmentId}`,
          reportRef: `report:${recovery.assessmentHandoffId}:${recovery.baseReportRevision}`,
          paths: recovery.paths,
          results: recovery.results ?? [],
          transition: handoff.state,
        };
      }
      if (input.operation === "cancel-recovery") {
        check(prior.data.type === "recovery-cancelled" && prior.data.reason === input.reason, "operation_conflict");
        return {
          status: "cancelled",
          unchanged: true,
          recovery: prior.data.recoveryId,
          reason: prior.data.reason,
          assessment: state.assessment?.handoffId,
        };
      }
      check(
        (input.operation === "assess" && prior.data.type === "assessment-resumed") ||
          (input.operation === "close" &&
            prior.data.type === "unit-closed" &&
            prior.data.outcome === input.outcome &&
            prior.data.assessment === input.assessment),
        "operation_conflict",
      );
      return { status: "unchanged", operation: input.operation };
    }
    if (input.operation === "recover") {
      const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
      const base = a?.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
      check(
        state.unitId &&
          a?.state === "returned" &&
          base?.kind === "return" &&
          base.state === "configured" &&
          state.assessment?.handoffId === base.id &&
          !state.pendingId &&
          !state.recoveryId &&
          !this.models.applying,
        "recovery_not_available",
      );
      const worker = this.session.assignedWorker(state, a.id);
      const id = randomUUID(),
        handoffId = randomUUID();
      const paths = [
        ...new Set<string>((input.paths ?? []).map((path: string) => this.gate.canonicalRecoveryPath(path))),
      ];
      const requestedResults = [...(input.results ?? [])] as string[];
      check(new Set(requestedResults).size === requestedResults.length, "duplicate_result_grant");
      const results: ResultGrant[] = [];
      for (const resultId of requestedResults) {
        // A context ref is evidence the worker selects, not a captured result the Coordinator grants.
        check(
          !idFor(resultId),
          "result_unavailable",
          `${resultId} is a context ref, not a captured result id: name it in the request instead, and the worker selects it as evidence with freeflow_project.`,
        );
        const grant = await this.resultGrants?.resolve(resultId, this.session.ctx);
        check(grant?.id === resultId, "result_unavailable", `Captured result is unavailable: ${resultId}`);
        results.push(grant);
      }
      const recovery: Recovery = {
        id,
        assignmentId: a.id,
        assessmentHandoffId: base.id,
        baseReportRevision: base.reportRevision,
        request: input.request,
        requestedPaths: [...new Set<string>(input.paths ?? [])],
        paths,
        requestedResults,
        results,
        state: "requested",
        requestHandoffId: handoffId,
        supplementRevision: 0,
      };
      const handoff: Handoff = {
        id: handoffId,
        kind: "recovery-request",
        assignmentId: a.id,
        text: input.request,
        from: "coordinator",
        to: worker,
        executionId: this.session.turn!.id,
        toolCallId: callId,
        basisUserEntryId: this.session.turn!.basisUserEntryId,
        state: "pending",
        reportRevision: 0,
        limitations: [],
      };
      this.session.append({ type: "recovery-request-accepted", recovery, handoff }, op);
      return {
        status: "accepted",
        recovery: id,
        handoff: handoffId,
        assignmentRef: `assignment:${a.id}`,
        reportRef: `report:${base.id}:${base.reportRevision}`,
        paths,
        results,
        transition: "pending",
      };
    }
    if (input.operation === "cancel-recovery") {
      check(state.recoveryId && !this.models.applying, "recovery_not_cancellable");
      check(
        ![...state.executions.values()].some(
          (execution) =>
            execution.recoveryId === state.recoveryId &&
            isWorkerProfile(execution.profile) &&
            !execution.assistantEntryId &&
            !execution.interrupted,
        ),
        "recovery_not_cancellable",
      );
      this.session.append({ type: "recovery-cancelled", recoveryId: state.recoveryId, reason: input.reason }, op);
      return {
        status: "cancelled",
        recovery: state.recoveryId,
        reason: input.reason,
        assessment: state.assessment?.handoffId,
      };
    }
    if (input.operation === "assess") {
      check(state.assessment, "assessment_missing");
      check(!state.recoveryId, "recovery_outstanding");
      if (state.assessment.view === "active") return { status: "unchanged", ready: true };
      const prepared = this.assembler.prepared("coordinator", this.session.messages, state.assessment.handoffId, true);
      if (!prepared.ready) return { status: "suspended", ready: false, problems: prepared.problems };
      if (this.session.projectionEnabled) check(prepared.reservation, "reservation_missing");
      this.session.append(
        {
          type: "assessment-resumed",
          handoffId: state.assessment.handoffId,
          basisUserEntryId: this.session.turn!.basisUserEntryId,
          ...(prepared.reservation ? { reservation: prepared.reservation } : {}),
        },
        op,
      );
      this.session.projectionError = undefined;
      return {
        status: "resumed",
        ready: true,
        stage: "prepared assessment; next request revalidated",
        evidence: this.assembler.evidenceFacts(this.session.stateData()),
      };
    }
    check(input.operation === "close" && state.unitId, "unit_missing");
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    check(!this.models.applying, "not_quiescent");
    check(
      input.outcome !== "accepted" || !this.effectFence?.status().unresolvedEffects,
      "unresolved_effect",
      "Accepted closure is unavailable while a live effect requires reconciliation.",
    );
    if (state.recoveryId) {
      check(input.outcome !== "accepted", "unfinished_work");
      check(
        ![...state.executions.values()].some(
          (execution) =>
            execution.recoveryId === state.recoveryId &&
            isWorkerProfile(execution.profile) &&
            !execution.assistantEntryId &&
            !execution.interrupted,
        ),
        "not_quiescent",
      );
    }
    this.session.append(
      {
        type: "unit-closed",
        unitId: state.unitId,
        outcome: input.outcome,
        assessment: input.assessment,
        ...(a?.state === "outstanding" && input.outcome !== "accepted" ? { supersededAssignmentId: a.id } : {}),
      },
      op,
    );
    return { status: "closed", unit: state.unitId, outcome: input.outcome, assessment: input.assessment };
  }
  private page(
    scope: string,
    rows: any[] | (() => any[]),
    cursor?: string,
    size = 30,
    assignment?: string,
    active = false,
    summarize?: (rows: any[]) => any,
  ): any {
    const branch = cachedBranch(this.session.ctx.sessionManager) as NativeEntry[];
    const compaction = branch.filter((e) => e.type === "compaction").at(-1)?.id;
    let key: string,
      offset = 0;
    if (cursor) {
      const match = /^([a-f0-9-]+):([0-9]+)$/.exec(cursor);
      check(match, "invalid_cursor", "Use the returned cursor unchanged.");
      key = match[1];
      offset = Number(match[2]);
      const page = this.session.pages.get(key);
      check(
        page &&
          page.scope === scope &&
          page.assignment === assignment &&
          (!page.basis || branch.some((e) => e.id === page.basis)) &&
          (!active || page.compaction === compaction),
        "cursor_expired",
        "History or scope changed. Inspect again without a cursor.",
      );
      check(
        Number.isSafeInteger(offset) && offset >= 0 && offset < page.rows.length && offset % page.size === 0,
        "invalid_cursor",
      );
    } else {
      key = randomUUID();
      if (this.session.pages.size >= 8) this.session.pages.delete(this.session.pages.keys().next().value!);
      const items = typeof rows === "function" ? rows() : rows;
      this.session.pages.set(key, {
        scope,
        basis: branch.at(-1)?.id ?? null,
        assignment,
        compaction,
        rows: items,
        size,
        summary: summarize?.(items),
      });
    }
    const page = this.session.pages.get(key)!;
    return {
      scope,
      count: page.rows.length,
      offset,
      summary: page.summary,
      items: page.rows.slice(offset, offset + page.size),
      nextCursor: offset + page.size < page.rows.length ? `${key}:${offset + page.size}` : undefined,
    };
  }
  inspectUnit(input: any): any {
    const state = this.session.stateData(),
      view = input.view ?? "current";
    check(view === "detail" || !input.ref, "invalid_inspection", "A work ref belongs to view detail.");
    check(
      view === "history" || (!input.cursor && !input.limit),
      "invalid_inspection",
      "Pagination belongs to view history.",
    );
    if (view === "current")
      return {
        ...this.status.detail(),
        status: "inspected",
        view,
        currentRef: state.assignmentId ? `assignment:${state.assignmentId}` : undefined,
      };
    if (view === "history") {
      const numbers = new Map([...state.units.keys()].map((id, i) => [id, i + 1]));
      const rows = () =>
        [...state.assignments.values()].reverse().map((a) => {
          const u = state.units.get(a.unitId),
            h = a.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
          const delegate = state.handoffs.get(a.delegateHandoffId);
          return {
            ref: `assignment:${a.id}`,
            unitRef: `unit:${a.unitId}`,
            unitNumber: numbers.get(a.unitId),
            assignmentNumber: (u?.assignmentIds.indexOf(a.id) ?? 0) + 1,
            state: a.state,
            unitState: u?.state,
            disposition: u?.disposition,
            summary: a.contract.slice(0, 160),
            reportAvailable: !!h,
            outcome: h?.outcome,
            from: delegate?.from,
            to: delegate?.to,
          };
        });
      const page = this.page("work-history", rows, input.cursor, input.limit ?? 20);
      return {
        status: "inspected",
        view,
        history: page.items,
        count: page.count,
        returned: page.items.length,
        nextCursor: page.nextCursor,
      };
    }
    check(
      view === "detail" && typeof input.ref === "string",
      "work_ref_required",
      "Use a ref returned by history inspection.",
    );
    check(
      /^(?:(?:unit|assignment|recovery):[^:\s]+|(?:report|supplement):[^:\s]+:[1-9][0-9]*)$/.test(input.ref),
      "invalid_work_ref",
      "Use assignment, report, recovery, or supplement refs returned by a receipt or inspection, unchanged. A bare handoff ID is not a work ref.",
    );
    if (input.ref.startsWith("unit:")) {
      const u = state.units.get(input.ref.slice(5));
      check(u, "work_unavailable", "Unit is not on current ancestry.");
      return {
        status: "inspected",
        view,
        ref: input.ref,
        unit: {
          id: u.id,
          state: u.state,
          objective: u.objective,
          disposition: u.disposition,
          assessment: u.assessment,
        },
        assignmentCount: u.assignmentIds.length,
        assignmentRefs: u.assignmentIds.slice(0, 30).map((id) => `assignment:${id}`),
        remaining: Math.max(0, u.assignmentIds.length - 30),
        historyHint: "Use paginated history inspection for all assignment refs.",
        historical: true,
      };
    }
    if (input.ref.startsWith("recovery:")) {
      const recovery = state.recoveries.get(input.ref.slice(9));
      check(recovery, "work_unavailable", "Recovery is not on current ancestry.");
      const request = state.handoffs.get(recovery.requestHandoffId);
      const supplement = recovery.supplementHandoffId ? state.handoffs.get(recovery.supplementHandoffId) : undefined;
      return {
        status: "inspected",
        view,
        ref: input.ref,
        historical: recovery.id !== state.recoveryId,
        recovery: {
          id: recovery.id,
          state: recovery.state,
          assignmentId: recovery.assignmentId,
          assessmentHandoffId: recovery.assessmentHandoffId,
          baseReportRevision: recovery.baseReportRevision,
          request: recovery.request,
          paths: recovery.paths,
          results: recovery.results ?? [],
          requestHandoffState: request?.state,
          supplementRevision: recovery.supplementRevision,
          cancellationReason: recovery.cancellationReason,
        },
        supplementRef: supplement ? `supplement:${recovery.id}:${supplement.reportRevision}` : undefined,
        sourceBoundary: "Saved recovery on current ancestry; historical content grants no current permission.",
      };
    }
    if (input.ref.startsWith("supplement:")) {
      const match = /^supplement:([^:]+):([0-9]+)$/.exec(input.ref);
      check(match, "work_unavailable", "Use a supplement ref returned by a receipt or recovery inspection.");
      const recovery = state.recoveries.get(match[1]);
      let supplement: Handoff | undefined;
      for (const event of state.events.values())
        if (
          event.data.type === "recovery-supplement-accepted" &&
          event.data.recoveryId === match[1] &&
          event.data.handoff.reportRevision === Number(match[2])
        )
          supplement = event.data.handoff;
      check(recovery && supplement, "work_unavailable", "Supplement revision is not on current ancestry.");
      const base = state.handoffs.get(recovery.assessmentHandoffId);
      return {
        status: "inspected",
        view,
        ref: input.ref,
        historical: true,
        recoveryRef: `recovery:${recovery.id}`,
        assignment: { id: recovery.assignmentId, state: state.assignments.get(recovery.assignmentId)?.state },
        reportRef: `report:${recovery.assessmentHandoffId}:${recovery.baseReportRevision}`,
        report: base?.text,
        supplement: supplement.text,
        supplementRevision: supplement.reportRevision,
        outcome: supplement.outcome,
        limitations: supplement.limitations,
        sourceBoundary:
          "Saved supplement revision and original report linkage on current ancestry; historical content grants no current permission.",
      };
    }
    let savedRevision: Handoff | undefined;
    if (input.ref.startsWith("report:")) {
      const match = /^report:([^:]+):([0-9]+)$/.exec(input.ref);
      check(match, "work_unavailable", "Use a report ref returned by detail inspection.");
      for (const event of state.events.values())
        if (
          event.data.type === "return-accepted" &&
          event.data.handoff.id === match[1] &&
          event.data.handoff.reportRevision === Number(match[2])
        )
          savedRevision = event.data.handoff;
      check(savedRevision, "work_unavailable", "Report revision is not on current ancestry.");
    }
    const a = savedRevision
      ? state.assignments.get(savedRevision.assignmentId)
      : input.ref.startsWith("assignment:")
        ? state.assignments.get(input.ref.slice(11))
        : undefined;
    check(a, "work_unavailable", "Assignment is not on current ancestry.");
    const latest = a.returnHandoffId ? state.handoffs.get(a.returnHandoffId) : undefined;
    const h = savedRevision ?? latest;
    return {
      status: "inspected",
      view,
      ref: input.ref,
      historical: a.id !== state.assignmentId || a.state !== "outstanding",
      assignment: { id: a.id, unitId: a.unitId, state: a.state },
      contract: a.contract,
      report: h?.text,
      reportRevision: h?.reportRevision,
      latestReportRevision: latest?.reportRevision,
      reportRef: h ? `report:${h.id}:${h.reportRevision}` : undefined,
      previousReportRef: h && h.reportRevision > 1 ? `report:${h.id}:${h.reportRevision - 1}` : undefined,
      outcome: h?.outcome,
      limitations: h?.limitations,
      handoff: h?.id,
      currentSelection: state.selections.get(a.id) ?? emptySelection(),
      sourceBoundary:
        "Accepted report revision on current ancestry; assignment/selection show current recorded state. Historical content grants no current permission.",
    };
  }
}

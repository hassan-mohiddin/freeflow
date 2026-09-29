import {
  PROFILES,
  ROUTING_ENTRY,
  canonical,
  eventKey,
  eventValue,
  isWorkerProfile,
  requireCondition as check,
} from "./types.js";
import { parseRoutingEvent } from "./event-schema.js";
export function initialState() {
  return {
    control: "inactive",
    units: new Map(),
    assignments: new Map(),
    handoffs: new Map(),
    recoveries: new Map(),
    executions: new Map(),
    selections: new Map(),
    reservations: new Map(),
    attempts: new Map(),
    exposure: new Map(),
    authors: new Map(),
    resumeBasis: new Map(),
    profileOverrides: new Map(),
    events: new Map(),
    eventIds: new Map(),
  };
}
function applyEvent(state, event, owned = false) {
  const e = parseRoutingEvent(event),
    key = eventKey(e),
    value = eventValue(e);
  const previous = state.events.get(key),
    priorId = state.eventIds.get(e.eventId);
  check(!priorId || priorId === value, "event_identity_conflict");
  if (previous) {
    check(eventValue(previous) === value, "operation_conflict");
    return state;
  }
  const s = owned
      ? state
      : {
          ...state,
          units: new Map([...state.units].map(([k, v]) => [k, { ...v }])),
          assignments: new Map([...state.assignments].map(([k, v]) => [k, { ...v }])),
          handoffs: new Map([...state.handoffs].map(([k, v]) => [k, { ...v }])),
          recoveries: new Map(
            [...state.recoveries].map(([k, v]) => [
              k,
              {
                ...v,
                paths: [...v.paths],
                requestedResults: [...(v.requestedResults ?? [])],
                results: (v.results ?? []).map((grant) => ({ ...grant })),
              },
            ]),
          ),
          executions: new Map([...state.executions].map(([k, v]) => [k, { ...v }])),
          selections: new Map(state.selections),
          reservations: new Map(state.reservations),
          attempts: new Map(state.attempts),
          exposure: new Map(state.exposure),
          authors: new Map(state.authors),
          resumeBasis: new Map(state.resumeBasis),
          profileOverrides: new Map(state.profileOverrides),
          events: new Map(state.events),
          eventIds: new Map(state.eventIds),
          assessment: state.assessment ? { ...state.assessment } : undefined,
        },
    d = e.data;
  const assignment = () => (s.assignmentId ? s.assignments.get(s.assignmentId) : undefined);
  const assignmentWorker = () => {
    const a = assignment();
    const h = a ? s.handoffs.get(a.delegateHandoffId) : undefined;
    check(h?.kind === "delegate" && h.assignmentId === a?.id && isWorkerProfile(h.to), "assignment_worker_missing");
    return h.to;
  };
  const pending = () => (s.pendingId ? s.handoffs.get(s.pendingId) : undefined);
  const isPending = () => pending() && ["pending", "blocked"].includes(pending().state);
  const currentReturn = (id) => {
    const h = s.handoffs.get(id);
    check(
      h && ["return", "recovery-return"].includes(h.kind) && h.assignmentId === s.assignmentId,
      "not_current_return",
    );
    return h;
  };
  switch (d.type) {
    case "execution-interrupted": {
      const x = s.executions.get(d.executionId);
      check(x && !x.assistantEntryId, "execution_not_unbound");
      x.interrupted = d.reason;
      break;
    }
    case "assignment-resumed": {
      const a = assignment();
      check(
        s.control === "automatic" && a?.id === d.assignmentId && a.state === "outstanding" && !isPending(),
        "assignment_not_resumable",
      );
      s.resumeBasis.set(a.id, d.basisUserEntryId);
      break;
    }
    case "control":
      s.control = d.control;
      s.profile = d.profile;
      break;
    case "profile-overrides":
      for (const profile of PROFILES) {
        if (!Object.hasOwn(d.overrides, profile)) continue;
        const override = d.overrides[profile];
        if (override === null) s.profileOverrides.delete(profile);
        else s.profileOverrides.set(profile, override);
      }
      break;
    case "delegation-override":
      s.delegationOverride = d.delegation ?? undefined;
      break;
    case "execution-opened":
      check(!s.executions.has(d.execution.id), "duplicate_execution");
      s.executions.set(d.execution.id, d.execution);
      break;
    case "execution-bound": {
      const x = s.executions.get(d.executionId);
      check(x, "execution_missing");
      if (x.assistantEntryId)
        check(
          x.assistantEntryId === d.assistantEntryId &&
            canonical(x.resultEntryIds) === canonical(d.resultEntryIds) &&
            x.outcome === d.outcome,
          "binding_conflict",
        );
      x.assistantEntryId = d.assistantEntryId;
      x.resultEntryIds = d.resultEntryIds;
      x.outcome = d.outcome;
      for (const id of [d.assistantEntryId, ...d.resultEntryIds]) {
        const prev = s.authors.get(id);
        check(!prev || prev.executionId === x.id, "source_authorship_conflict");
        s.authors.set(id, { profile: x.profile, executionId: x.id, assignmentId: x.assignmentId });
      }
      break;
    }
    case "delegate-accepted": {
      check(s.control === "automatic" && s.profile === "coordinator", "wrong_control");
      const a = assignment(),
        h = d.handoff,
        u = s.unitId ? s.units.get(s.unitId) : undefined;
      check(!s.assignments.has(d.assignment.id) && !s.handoffs.has(h.id), "reused_work_identity");
      check(
        h.kind === "delegate" &&
          h.from === "coordinator" &&
          isWorkerProfile(h.to) &&
          h.state === "pending" &&
          h.text === d.assignment.contract &&
          h.assignmentId === d.assignment.id &&
          d.assignment.delegateHandoffId === h.id &&
          d.assignment.unitId === d.unit.id,
        "delegate_identity_mismatch",
      );
      if (u) check(u.state === "open" && u.id === d.unit.id && u.objective === d.unit.objective, "unit_conflict");
      else check(!s.units.has(d.unit.id), "closed_unit_reused");
      check(
        canonical(d.unit.assignmentIds) === canonical([...(u?.assignmentIds ?? []), d.assignment.id]),
        "assignment_order",
      );
      if (d.replacement) {
        check(a?.state === "outstanding" && a.id === d.replacement.assignmentId && u, "no_replaceable_assignment");
        check(
          ![...s.executions.values()].some(
            (x) => x.assignmentId === a.id && isWorkerProfile(x.profile) && !x.assistantEntryId && !x.interrupted,
          ),
          "unresolved_worker_execution",
        );
        check(
          !isPending() || (pending().kind === "delegate" && d.replacement.supersededHandoffId === pending().id),
          "handoff_pending",
        );
        a.state = "superseded";
        s.handoffs.get(a.delegateHandoffId).state = "superseded";
      } else check(a?.state !== "outstanding" && !isPending(), "assignment_outstanding");
      s.units.set(d.unit.id, d.unit);
      s.unitId = d.unit.id;
      s.assignments.set(d.assignment.id, d.assignment);
      s.assignmentId = d.assignment.id;
      s.handoffs.set(h.id, h);
      s.pendingId = h.id;
      s.assessment = undefined;
      break;
    }
    case "return-accepted": {
      check(s.control === "automatic" && s.profile === assignmentWorker(), "wrong_control");
      const a = assignment(),
        h = d.handoff;
      check(
        a &&
          h.assignmentId === a.id &&
          h.kind === "return" &&
          h.from === assignmentWorker() &&
          h.to === "coordinator" &&
          h.state === "pending",
        "return_identity_mismatch",
      );
      const previousReturn = a.returnHandoffId ? s.handoffs.get(a.returnHandoffId) : undefined;
      if (a.state === "outstanding")
        check(!isPending() && !s.handoffs.has(h.id) && h.reportRevision === 1, "handoff_pending");
      else
        check(
          a.state === "returned" &&
            previousReturn &&
            previousReturn.id === h.id &&
            ["pending", "blocked"].includes(previousReturn.state) &&
            h.reportRevision === previousReturn.reportRevision + 1,
          "invalid_report_revision",
        );
      a.state = "returned";
      a.returnHandoffId = h.id;
      s.handoffs.set(h.id, h);
      s.pendingId = h.id;
      s.assessment = {
        handoffId: h.id,
        assignmentId: a.id,
        view: "active",
        basisUserEntryId: h.basisUserEntryId,
        problems: [],
      };
      break;
    }
    case "recovery-request-accepted": {
      const a = assignment(),
        base = s.handoffs.get(d.recovery.assessmentHandoffId),
        h = d.handoff;
      check(
        s.control === "automatic" &&
          s.profile === "coordinator" &&
          a?.state === "returned" &&
          d.recovery.assignmentId === a.id &&
          d.recovery.state === "requested" &&
          d.recovery.supplementRevision === 0 &&
          d.recovery.supplementHandoffId === undefined &&
          d.recovery.cancellationReason === undefined &&
          s.assessment?.handoffId === base?.id &&
          base?.kind === "return" &&
          a.returnHandoffId === base.id &&
          base.state === "configured" &&
          base.reportRevision === d.recovery.baseReportRevision &&
          !s.recoveryId &&
          !isPending() &&
          h.kind === "recovery-request" &&
          h.assignmentId === a.id &&
          h.from === "coordinator" &&
          h.to === assignmentWorker() &&
          h.state === "pending" &&
          !s.handoffs.has(h.id) &&
          !s.recoveries.has(d.recovery.id),
        "recovery_not_available",
      );
      s.recoveries.set(d.recovery.id, {
        ...d.recovery,
        requestedResults: [...(d.recovery.requestedResults ?? [])],
        results: (d.recovery.results ?? []).map((grant) => ({ ...grant })),
      });
      s.recoveryId = d.recovery.id;
      s.handoffs.set(h.id, h);
      s.pendingId = h.id;
      s.assessment.view = "suspended";
      s.assessment.suspensionReason = "recovery";
      s.assessment.basisUserEntryId = h.basisUserEntryId;
      s.assessment.problems = [];
      break;
    }
    case "recovery-supplement-accepted": {
      const a = assignment(),
        r = s.recoveries.get(d.recoveryId),
        h = d.handoff,
        previous = r?.supplementHandoffId ? s.handoffs.get(r.supplementHandoffId) : undefined;
      check(
        s.control === "automatic" &&
          s.profile === assignmentWorker() &&
          a?.state === "returned" &&
          r?.id === s.recoveryId &&
          r.assignmentId === a.id &&
          s.assessment?.handoffId === r.assessmentHandoffId &&
          s.handoffs.get(r.assessmentHandoffId)?.reportRevision === r.baseReportRevision &&
          ["reading", "returning"].includes(r.state) &&
          h.kind === "recovery-return" &&
          h.assignmentId === a.id &&
          h.from === assignmentWorker() &&
          h.to === "coordinator" &&
          h.state === "pending" &&
          (!previous ? !s.handoffs.has(h.id) : ["pending", "blocked"].includes(previous.state) && previous.id === h.id),
        "recovery_not_returnable",
      );
      const expectedRevision = (previous?.reportRevision ?? 0) + 1;
      check(h.reportRevision === expectedRevision, "invalid_report_revision");
      r.state = "returning";
      r.supplementHandoffId = h.id;
      r.supplementRevision = h.reportRevision;
      s.handoffs.set(h.id, h);
      s.pendingId = h.id;
      break;
    }
    case "recovery-cancelled": {
      const r = s.recoveries.get(d.recoveryId);
      check(
        s.control === "automatic" &&
          s.profile === "coordinator" &&
          r?.id === s.recoveryId &&
          ["requested", "reading", "returning"].includes(r.state),
        "recovery_not_cancellable",
      );
      const p = pending();
      if (p) {
        check([r.requestHandoffId, r.supplementHandoffId].includes(p.id), "handoff_pending");
        p.state = "superseded";
        s.pendingId = undefined;
      }
      r.state = "cancelled";
      r.cancellationReason = d.reason;
      s.recoveryId = undefined;
      break;
    }
    case "handoff-retry-requested": {
      const h = currentReturn(d.handoffId);
      check(
        s.control === "automatic" &&
          s.profile === assignmentWorker() &&
          ["blocked", "pending"].includes(h.state) &&
          h.reportRevision === d.reportRevision &&
          (s.selections.get(h.assignmentId)?.revision ?? 0) === d.selectionRevision,
        "invalid_return_retry",
      );
      s.attempts.set(h.id, {
        executionId: d.executionId,
        reportRevision: d.reportRevision,
        selectionRevision: d.selectionRevision,
      });
      h.state = "pending";
      break;
    }
    case "handoff-prepared": {
      const h = currentReturn(d.handoffId);
      check(["pending", "blocked"].includes(h.state), "handoff_terminal");
      check(d.reservation.selectionRevision === (s.selections.get(h.assignmentId)?.revision ?? 0), "stale_selection");
      s.reservations.set(h.id, d.reservation);
      if (s.assessment?.handoffId === h.id) s.assessment.reservation = d.reservation;
      if (h.kind === "recovery-return") {
        const recovery = [...s.recoveries.values()].find((candidate) => candidate.supplementHandoffId === h.id);
        if (recovery && s.assessment?.handoffId === recovery.assessmentHandoffId)
          s.assessment.reservation = d.reservation;
      }
      break;
    }
    case "handoff-state": {
      const h = s.handoffs.get(d.handoffId);
      check(h && s.pendingId === h.id && ["pending", "blocked"].includes(h.state), "handoff_terminal");
      h.state = d.state;
      h.reason = d.reason;
      if (d.state === "configured") {
        check(d.observedPair, "configuration_unobserved");
        s.profile = h.to;
        s.pendingId = undefined;
        const r = s.recoveryId ? s.recoveries.get(s.recoveryId) : undefined;
        if (r && h.id === r.requestHandoffId) r.state = "reading";
        if (r && h.id === r.supplementHandoffId) {
          r.state = "completed";
          s.recoveryId = undefined;
        }
      }
      if (d.state === "superseded") s.pendingId = undefined;
      break;
    }
    case "selection-changed": {
      const a = assignment();
      check(
        a?.id === d.assignmentId &&
          s.control === "automatic" &&
          s.profile === assignmentWorker() &&
          (a.state === "outstanding" ||
            (a.state === "returned" &&
              (isPending() || (s.recoveryId !== undefined && s.recoveries.get(s.recoveryId)?.state === "reading")))),
        "selection_wrong_phase",
      );
      check(d.selection.revision === (s.selections.get(a.id)?.revision ?? 0) + 1, "selection_revision");
      s.selections.set(a.id, d.selection);
      break;
    }
    case "assessment-suspended": {
      check(s.assessment?.handoffId === d.handoffId, "assessment_missing");
      s.assessment.view = "suspended";
      s.assessment.suspensionReason = d.reason;
      s.assessment.basisUserEntryId = d.basisUserEntryId;
      s.assessment.problems = d.problems;
      break;
    }
    case "assessment-resumed": {
      check(s.control === "automatic" && s.profile === "coordinator", "wrong_control");
      check(!s.recoveryId, "recovery_outstanding");
      check(s.assessment?.handoffId === d.handoffId, "assessment_missing");
      check(s.assessment.view === "suspended", "assessment_not_suspended");
      if (d.reservation)
        check(
          d.reservation.selectionRevision === (s.selections.get(s.assessment.assignmentId)?.revision ?? 0),
          "stale_selection",
        );
      s.assessment.view = "active";
      s.assessment.suspensionReason = undefined;
      s.assessment.basisUserEntryId = d.basisUserEntryId;
      if (d.reservation) {
        s.assessment.reservation = d.reservation;
        s.reservations.set(d.handoffId, d.reservation);
      }
      s.assessment.problems = [];
      break;
    }
    case "unit-closed": {
      const u = s.units.get(d.unitId),
        a = assignment();
      check(
        s.control === "automatic" && s.profile === "coordinator" && u?.id === s.unitId && u.state === "open",
        "unit_not_open",
      );
      if (d.outcome === "accepted")
        check(a?.state !== "outstanding" && !isPending() && !s.recoveryId, "unfinished_work");
      const recovery = s.recoveryId ? s.recoveries.get(s.recoveryId) : undefined;
      if (recovery) {
        check(
          d.outcome !== "accepted" && ["requested", "reading", "returning"].includes(recovery.state),
          "unfinished_work",
        );
        const transfer = pending();
        if (transfer) {
          check([recovery.requestHandoffId, recovery.supplementHandoffId].includes(transfer.id), "handoff_pending");
          transfer.state = "superseded";
          s.pendingId = undefined;
        }
        recovery.state = "cancelled";
        recovery.cancellationReason = d.assessment;
        s.recoveryId = undefined;
      }
      if (a?.state === "outstanding") {
        check(d.supersededAssignmentId === a.id && d.outcome !== "accepted", "supersession_required");
        a.state = "superseded";
      }
      if (pending()) pending().state = "superseded";
      u.state = "closed";
      u.disposition = d.outcome;
      u.assessment = d.assessment;
      s.unitId = undefined;
      s.assignmentId = undefined;
      s.pendingId = undefined;
      s.assessment = undefined;
      break;
    }
    case "request-observed": {
      const x = s.executions.get(d.executionId);
      check(x && x.profile === d.profile, "request_execution_missing");
      if (d.handoffId) check(s.handoffs.has(d.handoffId), "request_handoff_missing");
      break;
    }
    case "sources-exposed": {
      const x = s.executions.get(d.executionId);
      check(x && x.profile === d.view, "exposure_execution_missing");
      if (isWorkerProfile(d.view)) for (const source of d.sources) s.exposure.set(source.ref, source.bodyHash);
      break;
    }
  }
  s.events.set(key, e);
  s.eventIds.set(e.eventId, value);
  return s;
}
export function reduce(state, event) {
  return applyEvent(state, event);
}
export function replay(entries) {
  let state = initialState();
  for (const entry of entries)
    if (entry.type === "custom" && entry.customType === ROUTING_ENTRY)
      state = applyEvent(state, parseRoutingEvent(entry.data), true);
  return state;
}

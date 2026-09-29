import { initialState } from "./state.js";
/**
 * What routing reports about itself: the summary behind Freeflow's status line and the Runtime State sent with each
 * request (whether routing is active or blocked and why, the running profile, control mode, a switch waiting for the
 * next prompt, preset warnings), and the detailed view with unit, assignment, handoff, recovery, and recent events
 * used by unit status and diagnostics.
 */
export class RoutingStatus {
  session;
  models;
  constructor(session, models) {
    this.session = session;
    this.models = models;
  }
  state() {
    let state;
    try {
      state = this.session.stateData();
    } catch {
      state = initialState();
    }
    const blocked = this.session.error ?? this.session.store?.blocked;
    return {
      effective: this.session.supported() && state.control !== "inactive" && !blocked,
      activeProfile: state.profile,
      delegation: this.session.delegation(state),
      controlMode: state.control === "manual" ? `manual-${state.profile}` : state.control,
      runtimeStatus: blocked
        ? "blocked"
        : this.session.supported() && state.control !== "inactive"
          ? "active"
          : "inactive",
      runtimeReason:
        blocked ?? (this.session.suppressed ? "startup_selection" : this.session.capability?.blockingReason.message),
      projectionFailure: this.session.projectionError,
      ...((pending) => (pending ? { pendingPair: `${pending.modelId}/${pending.thinking}` } : {}))(
        this.models.pending(),
      ),
      ...(this.models.heldMismatch(state) ? { pairMismatch: true } : {}),
      ...((warnings) => (warnings.length ? { presetWarnings: warnings } : {}))(this.models.presetWarnings(state)),
    };
  }
  detail(limit = 0) {
    const state = this.session.stateData();
    const unit = state.unitId ? state.units.get(state.unitId) : undefined;
    const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
    return {
      ...this.state(),
      unit: unit ? { id: unit.id, state: unit.state, assignments: unit.assignmentIds.length } : null,
      assignment: a ? { id: a.id, state: a.state, worker: this.session.assignedWorker(state, a.id) } : null,
      pendingHandoff: state.pendingId ?? null,
      recovery: state.recoveryId
        ? (() => {
            const recovery = state.recoveries.get(state.recoveryId);
            return recovery
              ? {
                  id: recovery.id,
                  state: recovery.state,
                  assignmentId: recovery.assignmentId,
                  assessmentHandoffId: recovery.assessmentHandoffId,
                  paths: recovery.paths,
                  results: recovery.results ?? [],
                  supplementRevision: recovery.supplementRevision,
                }
              : null;
          })()
        : null,
      assessment: state.assessment
        ? { handoffId: state.assessment.handoffId, view: state.assessment.view, problems: state.assessment.problems }
        : null,
      ...(limit
        ? {
            history: [...state.events.values()]
              .slice(-Math.min(100, Math.max(1, limit)))
              .map((e) => ({ event: e.eventId, type: e.data.type, operation: e.operationId })),
          }
        : {}),
    };
  }
}

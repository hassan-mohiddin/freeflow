import { ROUTING_TOOLS } from "./runtime.js";
import { ROUTING_SCHEMAS, matches } from "./schemas.js";
export { ROUTING_SCHEMAS } from "./schemas.js";
import { renderRoutingCall, renderRoutingResult } from "./render.js";
const descriptions = {
  freeflow_delegate:
    "Save a supported assignment contract and request enabled worker execution. Explicit replace supersedes a quiescent outstanding assignment in the same unit.",
  freeflow_return:
    "Save or revise the actual assignment report, save an attached recovery supplement, or retry the current saved return without resubmitting text. Returning does not accept or close the unit.",
  freeflow_unit:
    "Inspect current responsibility, paginated work history, or exact saved communication. Coordinator can restore an assessment, request or cancel attached evidence recovery, or close a unit without clearing history.",
  freeflow_project:
    "Inspect current selection and scoped candidates when needed, then add or remove exposed worker task-evidence refs. Strict shapes: inspect uses operation plus optional scope/cursor; add uses operation plus eligible refs only; remove uses operation plus currently selected or unresolved refs plus required reason. Reason is remove-only. #text refs select exact visible assistant text; plain refs retain whole-native meaning.",
};
const guidance = {
  freeflow_delegate: [
    "freeflow_delegate is Coordinator-only under Automatic control. Put the contract in the input. Choose worker when both Helper and Executor are enabled; the sole worker is inferred otherwise. Use replace only for explicit same-unit replacement; do not supply IDs.",
  ],
  freeflow_return: [
    "freeflow_return submit saves/revises the assignment report; supplement saves separate recovery communication; retry completes the current unchanged saved return without text. Stop ordinary task or recovery-read work after its communication is saved. Keep the handoff last; do not batch it with new task tools.",
  ],
  freeflow_unit: [
    "freeflow_unit inspect defaults to current state; view history returns work refs and detail reads saved communication. Coordinator recover requests bounded evidence work against the current returned assessment; cancel-recovery ends only that recovery; assess restores a suspended evidence obligation; close changes work status without clearing communication or completing a Working Record task.",
  ],
  freeflow_project: [
    "Use exactly one shape: inspect {operation, scope?, cursor?}; add {operation, refs} with no reason; remove {operation, refs, reason}. Reason is required only for remove and invalid for add/inspect. Add exact eligible visible refs directly when identity and eligibility are clear; inspect when identity, eligibility, representation or selection state is unclear. Never add refs marked not offered for new evidence selection. For remove, use currently selected or unresolved refs; a non-selectable ref may be named only to clear its unresolved request and requires a reason. Use an offered #text ref only when visible assistant text is the intended evidence. Plain refs retain whole-native meaning. Select actual result bodies for execution claims, not merely calls. Correct or explicitly withdraw unresolved items with a limitation. Known previously exposed bodies resolve automatically; target-representation gaps are not successful delivery.",
  ],
};
export function registerRoutingTools(pi, runtime) {
  for (const name of ROUTING_TOOLS) {
    const definition = {
      name,
      label: name.replace("freeflow_", "Routing "),
      description: descriptions[name],
      parameters: ROUTING_SCHEMAS[name],
      executionMode: "sequential",
      promptGuidelines: guidance[name],
      renderCall: (args, _theme, context) => renderRoutingCall(name, args, context),
      renderResult: (result, options, _theme, context) => renderRoutingResult(result, options, name, context),
      async execute(id, input, signal, _update, ctx) {
        if (!matches(input, ROUTING_SCHEMAS[name]))
          throw new Error("Invalid routing arguments; no operation accepted.");
        return runtime.invoke(name, id, input, signal, ctx);
      },
    };
    pi.registerTool(definition);
  }
}
export function applyRoutingToolVisibility(pi, _runtime, _available = true) {
  if (!pi.getActiveTools || !pi.setActiveTools) return;
  const current = pi.getActiveTools();
  const ordinary = current.filter(
    (name) =>
      !ROUTING_TOOLS.includes(name) &&
      name !== "freeflow_switch_profile" &&
      name !== "freeflow_cognitive_routing_history",
  );
  const next = [...ordinary, ...ROUTING_TOOLS];
  if (JSON.stringify(next) !== JSON.stringify(current)) pi.setActiveTools(next);
}

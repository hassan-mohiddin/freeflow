import { ROUTING_TOOLS } from "./types.js";
import { ROUTING_SCHEMAS, explainRoutingArguments, matches } from "./schemas.js";
export { ROUTING_SCHEMAS } from "./schemas.js";
import { renderRoutingCall, renderRoutingResult } from "./render.js";
/** What Pi shows for each tool, as the other Freeflow tools name theirs. */
const ROUTING_LABELS = {
  delegate_work: "Delegate",
  return_work: "Return",
  routing_unit: "Routing unit",
  select_evidence: "Evidence",
};
const descriptions = {
  delegate_work:
    "Save a supported assignment contract and request enabled worker execution. Explicit replace supersedes a quiescent outstanding assignment in the same unit.",
  return_work:
    "Save or revise the actual assignment report, save an attached recovery supplement, or retry the current saved return without resubmitting text. Returning does not accept or close the unit.",
  routing_unit:
    "Inspect current responsibility, paginated work history, or exact saved communication. Coordinator can restore an assessment, request or cancel attached evidence recovery, or close a unit without clearing history.",
  select_evidence:
    "Inspect current selection and scoped candidates when needed, then add or remove exposed worker task-evidence refs. Strict shapes: inspect uses operation plus optional scope/cursor; add uses operation plus eligible refs only; remove uses operation plus currently selected or unresolved refs plus required reason. Reason is remove-only. Only tool results are evidence; put anything you would say in the report.",
};
const guidance = {
  delegate_work: [
    "delegate_work is Coordinator-only under Automatic control. Put the contract in the input. Choose worker when both Helper and Executor are enabled; the sole worker is inferred otherwise. Use replace only for explicit same-unit replacement; do not supply IDs.",
  ],
  return_work: [
    "return_work submit saves/revises the assignment report; supplement saves separate recovery communication; retry completes the current unchanged saved return without text. Stop ordinary task or recovery-read work after its communication is saved. Keep the handoff last; do not batch it with new task tools.",
  ],
  routing_unit: [
    "routing_unit inspect defaults to current state; view history returns work refs and detail reads saved communication. Coordinator recover requests bounded evidence work against the current returned assessment; cancel-recovery ends only that recovery; assess restores a suspended evidence obligation; close changes work status without clearing communication or completing a Working Record task.",
  ],
  select_evidence: [
    "Use exactly one shape: inspect {operation, scope?, cursor?}; add {operation, refs} with no reason; remove {operation, refs, reason}. Reason is required only for remove and invalid for add/inspect. Add exact eligible visible refs directly when identity and eligibility are clear; inspect when identity, eligibility, representation or selection state is unclear. Never add refs marked not offered for new evidence selection. For remove, use currently selected or unresolved refs; a non-selectable ref may be named only to clear its unresolved request and requires a reason. Only tool results are evidence: select the result bodies behind your claims, not calls or your own messages, and say everything else in the report. Correct or explicitly withdraw unresolved items with a limitation. Known previously exposed bodies resolve automatically; target-representation gaps are not successful delivery.",
  ],
};
export function registerRoutingTools(pi, runtime) {
  for (const name of ROUTING_TOOLS) {
    const definition = {
      name,
      label: ROUTING_LABELS[name],
      description: descriptions[name],
      parameters: ROUTING_SCHEMAS[name],
      // Handoffs and evidence selection are assistant-issued boundaries: codemode scripts must not call them.
      exposure: "model-only",
      // Declared only while routing is effective: hidden until applyRoutingToolVisibility adds them, like Freeflow's
      // other tools, so no loadout before Freeflow's first update carries them (Pi 1.4.0 activates tools by default).
      defaultActive: false,
      executionMode: "sequential",
      promptGuidelines: guidance[name],
      renderCall: (args, _theme, context) => renderRoutingCall(name, args, context),
      renderResult: (result, options, _theme, context) => renderRoutingResult(result, options, name, context),
      async execute(id, input, signal, _update, ctx) {
        if (!matches(input, ROUTING_SCHEMAS[name])) throw new Error(explainRoutingArguments(name, input));
        return runtime.invoke(name, id, input, signal, ctx);
      },
    };
    pi.registerTool(definition);
  }
}
export function applyRoutingToolVisibility(pi, _runtime, available = true) {
  if (!pi.getActiveTools || !pi.setActiveTools) return;
  const current = pi.getActiveTools();
  // Declared only while routing is effective (Task 003 D-002); turning it on or off costs one cache write (D-001).
  // Missing routing tools are appended and present ones keep their place, so tools another extension adds later
  // (tool_search, for one) are never reordered around them.
  const kept = current.filter(
    (name) =>
      name !== "freeflow_switch_profile" &&
      name !== "freeflow_cognitive_routing_history" &&
      (available || !ROUTING_TOOLS.includes(name)),
  );
  const next = available ? [...kept, ...ROUTING_TOOLS.filter((name) => !kept.includes(name))] : kept;
  if (JSON.stringify(next) !== JSON.stringify(current)) pi.setActiveTools(next);
}

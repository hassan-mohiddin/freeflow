import { ROUTING_TOOLS } from "./runtime.js";
import { ROUTING_SCHEMAS, matches, schemaForProfile } from "./schemas.js";
export { ROUTING_SCHEMAS } from "./schemas.js";
import { renderRoutingCall, renderRoutingResult } from "./render.js";
const descriptions = {
  freeflow_delegate:
    "Save a supported assignment contract and request Executor execution. Explicit replace supersedes a quiescent outstanding assignment in the same unit.",
  freeflow_return:
    "Save or revise the actual assignment report, save an attached recovery supplement, or retry the current saved return without resubmitting text. Returning does not accept or close the unit.",
  freeflow_unit:
    "Inspect current responsibility, paginated work history, or exact saved communication. Coordinator can restore an assessment, request or cancel attached evidence recovery, or close a unit without clearing history.",
  freeflow_project:
    "Inspect current selection and scoped candidates when needed, then add or remove exposed Executor task-evidence refs. Strict shapes: inspect uses operation plus optional scope/cursor; add uses operation plus eligible refs only; remove uses operation plus currently selected or unresolved refs plus required reason. Reason is remove-only. #text refs select exact visible assistant text; plain refs retain whole-native meaning.",
};
const guidance = {
  freeflow_delegate: [
    "freeflow_delegate is Coordinator-only under Automatic control. Put the contract in the input. Use replace only for explicit same-unit replacement; do not supply IDs.",
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
const unitDefinitions = new WeakMap();
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
    if (name === "freeflow_unit") unitDefinitions.set(pi, { definition });
  }
}
export function applyRoutingToolVisibility(pi, runtime, available) {
  if (!pi.getActiveTools || !pi.setActiveTools) return;
  const current = new Set(pi.getActiveTools());
  const state = runtime.state();
  const unit = unitDefinitions.get(pi);
  const coordinator = state.effective && state.controlMode === "automatic" && state.activeProfile === "coordinator";
  const signature = coordinator ? "coordinator" : "inspection";
  if (unit && unit.signature !== signature) {
    pi.registerTool({
      ...unit.definition,
      description: coordinator
        ? unit.definition.description
        : "Inspect current routing responsibility, work history, or exact saved contract/report detail. This profile cannot assess or close units.",
      promptGuidelines: coordinator
        ? unit.definition.promptGuidelines
        : [
            "freeflow_unit inspect reads current state, view history lists work refs, and view detail with ref reads historical communication. Historical content is not current permission.",
          ],
      parameters: schemaForProfile("freeflow_unit", coordinator),
    });
    unit.signature = signature;
  }
  for (const name of ROUTING_TOOLS) {
    const enabled =
      available &&
      (name === "freeflow_unit" ||
        (state.effective &&
          state.controlMode === "automatic" &&
          (name === "freeflow_delegate"
            ? state.activeProfile === "coordinator"
            : state.activeProfile === "executor"))) &&
      (name !== "freeflow_project" || runtime.projectionEnabled);
    if (enabled) current.add(name);
    else current.delete(name);
  }
  // Retired experimental tools must never remain available beside the replacement.
  current.delete("freeflow_switch_profile");
  current.delete("freeflow_cognitive_routing_history");
  const next = [...current];
  if (JSON.stringify(next) !== JSON.stringify(pi.getActiveTools())) pi.setActiveTools(next);
}

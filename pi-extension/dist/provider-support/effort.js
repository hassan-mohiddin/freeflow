import { effortHistoryRoute } from "./openai/adapter.js";
/**
 * Whether changing effort on this route keeps its prompt cache. Freeflow's effort history keeps it on qualified
 * GPT-6 routes; Pi keeps it natively on Claude models that take per-message effort, where a request-level
 * effort change would otherwise invalidate every cached message.
 */
export function keepsCacheAcrossEffort(model) {
  if (effortHistoryRoute(model) !== undefined) return true;
  return model?.api === "anthropic-messages" && model.compat?.supportsMidConvoEffort === true;
}

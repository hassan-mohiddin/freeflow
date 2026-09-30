import { effortHistoryRoute } from "./openai/adapter.js";
import { isChatGPTSignIn } from "./routes.js";

/**
 * Whether changing effort on this route keeps its prompt cache. Freeflow's effort history keeps it on qualified
 * GPT-6 routes; Pi keeps it natively on Claude models that take per-message effort, where a request-level
 * effort change would otherwise invalidate every cached message.
 */
export function keepsCacheAcrossEffort(model: any, ctx?: any): boolean {
  // Sign in with ChatGPT rejects effort-history items, and a plain effort change rereads the context (live, S-006).
  if (isChatGPTSignIn(model, ctx)) return false;
  if (effortHistoryRoute(model) !== undefined) return true;
  return model?.api === "anthropic-messages" && model.compat?.supportsMidConvoEffort === true;
}

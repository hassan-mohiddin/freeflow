import { readFile } from "node:fs/promises";
/**
 * Freeflow's prompt files and the fixed system section built from them. The section never changes with feature state
 * so it stays cached; the Runtime State tells the model what is active.
 */
let runtimeContextCache = null;
export function isPromptAvailable(value) {
  return typeof value === "string" && value.trim().length > 0;
}
export function hasUsableMandatoryPrompts(freeflowContext) {
  return (
    isPromptAvailable(freeflowContext?.corePrompt) && isPromptAvailable(freeflowContext?.interactionContractPrompt)
  );
}
async function readPromptFile(url) {
  try {
    const prompt = await readFile(url, "utf8");
    return isPromptAvailable(prompt) ? prompt.trim() : null;
  } catch {
    return null;
  }
}
async function loadRuntimeContext(capabilityState = undefined) {
  const freeflowEnabled = capabilityState?.enabled === true;
  const cognitiveRoutingEnabled = capabilityState?.cognitiveRouting?.effective === true;
  const [corePrompt, interactionContractPrompt, workingMethodPrompt, cognitiveRoutingPrompt, toolExecutionPrompt] =
    await Promise.all([
      freeflowEnabled
        ? readPromptFile(new URL("../../../runtime/prompts/core.md", import.meta.url))
        : Promise.resolve(null),
      freeflowEnabled
        ? readPromptFile(new URL("../../../runtime/prompts/interaction-contract.md", import.meta.url))
        : Promise.resolve(null),
      freeflowEnabled
        ? readPromptFile(new URL("../../../runtime/prompts/working-method.md", import.meta.url))
        : Promise.resolve(null),
      cognitiveRoutingEnabled
        ? readPromptFile(new URL("../../../runtime/prompts/cognitive-routing.md", import.meta.url))
        : Promise.resolve(null),
      capabilityState?.toolExecution?.effective === true
        ? readPromptFile(new URL("../../../runtime/prompts/tool-execution.md", import.meta.url))
        : Promise.resolve(null),
    ]);
  return { corePrompt, interactionContractPrompt, workingMethodPrompt, cognitiveRoutingPrompt, toolExecutionPrompt };
}
function runtimeContextCacheSatisfies(capabilityState) {
  if (!runtimeContextCache) return false;
  const expected = {
    corePrompt: capabilityState?.enabled === true,
    interactionContractPrompt: capabilityState?.enabled === true,
    cognitiveRoutingPrompt: capabilityState?.cognitiveRouting?.effective === true,
  };
  return Object.entries(expected).every(([key, required]) => !required || isPromptAvailable(runtimeContextCache[key]));
}
export async function refreshRuntimeContext(capabilityState = undefined) {
  runtimeContextCache = await loadRuntimeContext(capabilityState);
  return runtimeContextCache;
}
export async function getRuntimeContext(capabilityState = undefined) {
  if (runtimeContextCacheSatisfies(capabilityState)) {
    return runtimeContextCache;
  }
  return refreshRuntimeContext(capabilityState);
}
export function stableRuntimeContext(context) {
  const sections = [
    ["Freeflow core", context?.corePrompt],
    ["Freeflow core", context?.interactionContractPrompt],
    ["Working Method", context?.workingMethodPrompt],
    ["Cognitive Routing", context?.cognitiveRoutingPrompt],
  ];
  return [
    "# Freeflow availability contract",
    "Freeflow keeps a fixed reference catalog of its instructions, skills, and tools to preserve prompt caching. Presence in this catalog does not mean a feature is active or an operation is permitted.",
    "Apply the following guidance and Freeflow skills only when the latest extension-generated Freeflow Runtime State marks the corresponding feature active. When Freeflow is inactive, unavailable, or not configured, its core and capability guidance is dormant; do not bootstrap or follow it merely because it is listed. Explicit user instructions retain their normal authority.",
    "For Cognitive Routing, follow the latest control/profile/responsibility snapshots on this branch. Earlier snapshots and notices are historical; they grant no current permission. Tool permissions are checked by the runtime, even though all definitions remain visible. Never call a disabled operation.",
    "Messages that start with `[Freeflow notice, not from the user]` come from Freeflow, not the user. They report facts and harness steps; they are not the user's instructions.",
    ...sections
      .filter(([, text]) => isPromptAvailable(text))
      .map(([feature, text]) => `## Reference guidance: ${feature}\n\n${text.trim()}`),
  ].join("\n\n");
}

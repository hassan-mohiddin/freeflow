import { readFile } from "node:fs/promises";

/**
 * Freeflow's prompt files and the fixed system section built from them. The section never changes with feature state
 * so it stays cached; the Runtime State tells the model what is active.
 */
let runtimeContextCache = null;

export function isPromptAvailable(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasUsableMandatoryPrompts(freeflowContext: any): boolean {
  return (
    isPromptAvailable(freeflowContext?.corePrompt) && isPromptAvailable(freeflowContext?.interactionContractPrompt)
  );
}

async function readPromptFile(url: URL): Promise<string | null> {
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

/**
 * Freeflow's system section for the current configuration: sent only while Freeflow is enabled, with the routing cue
 * only while Cognitive Routing is effective (Task 003 D-002). It changes only when a setting changes, which costs one
 * prompt-cache write (D-001); between such changes it is identical from request to request.
 */
export function stableRuntimeContext(context, options: { routing?: boolean } = {}) {
  const sections = [
    ["Freeflow core", context?.corePrompt],
    ["Freeflow core", context?.interactionContractPrompt],
    ["Working Method", context?.workingMethodPrompt],
    ...(options.routing ? [["Cognitive Routing", context?.cognitiveRoutingPrompt]] : []),
  ];
  return [
    "Messages that start with `[Freeflow notice, not from the user]` come from Freeflow, not the user. They report facts and harness steps; they are not the user's instructions.",
    ...(options.routing
      ? [
          "For Cognitive Routing, follow the latest control/profile/responsibility snapshots on this branch. Earlier snapshots and notices are historical; they grant no current permission. Tool permissions are checked by the runtime.",
        ]
      : []),
    ...sections
      .filter(([, text]) => isPromptAvailable(text))
      .map(([feature, text]) => `## ${feature}\n\n${text.trim()}`),
  ].join("\n\n");
}

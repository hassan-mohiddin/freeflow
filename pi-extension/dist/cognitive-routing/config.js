import { COGNITIVE_ROUTING_KEYS, validateCognitiveRoutingConfig } from "../host/config-validation.js";
import { PROFILES, canonical, workersForDelegation } from "./types.js";
export const supportsCognitiveRoutingModelRegistry = (host) =>
  typeof host?.modelRegistry?.find === "function" && typeof host?.modelRegistry?.getApiKeyAndHeaders === "function";
export const pairFromProfile = (profile) => ({
  provider: profile.provider,
  modelId: profile.model,
  thinking: profile.thinking,
});
export { COGNITIVE_ROUTING_KEYS };
/** A routing layer, checked by the shared validator so Pi and the other hosts agree on what is valid. */
function parseLayer(raw) {
  if (raw === undefined) return {};
  const error = validateCognitiveRoutingConfig(raw);
  if (error) throw new Error(error);
  return raw;
}
export async function resolveCognitiveRoutingState(repository, personal, ctx, session) {
  const state = {
    configured: repository?.cognitiveRouting !== undefined || personal?.cognitiveRouting !== undefined,
    configValid: true,
    enabled: false,
    effective: false,
    enabledSource: "default",
    delegation: "executor",
    delegationSource: "default",
    // Projection is on by default with routing (user, 2026-10-02): it is where routing's Coordinator saving comes from.
    projection: true,
    projectionSource: "default",
    profiles: {},
    profileSources: {},
    blockingReason: { code: "disabled", message: "Cognitive Routing is disabled." },
  };
  try {
    for (const [source, raw] of [
      ["repository", repository?.cognitiveRouting],
      ["personal", personal?.cognitiveRouting],
      // A session overrides only switches (enabled, projection), never profiles.
      ["session", session?.cognitiveRouting],
    ]) {
      const layer = parseLayer(raw);
      if (layer.enabled !== undefined) {
        state.enabled = layer.enabled;
        state.enabledSource = source;
      }
      if (layer.delegation !== undefined) {
        state.delegation = layer.delegation;
        state.delegationSource = source;
      }
      if (layer.projection !== undefined) {
        state.projection = layer.projection;
        state.projectionSource = source;
      }
      for (const profile of PROFILES)
        if (layer.profiles?.[profile]) {
          state.profiles[profile] = layer.profiles[profile];
          state.profileSources[profile] = source;
        }
    }
  } catch (error) {
    return {
      ...state,
      configValid: false,
      blockingReason: { code: "config_invalid", message: error instanceof Error ? error.message : String(error) },
    };
  }
  if (!state.enabled) return state;
  if (!supportsCognitiveRoutingModelRegistry(ctx))
    return {
      ...state,
      blockingReason: { code: "host_unsupported", message: "Required public Pi model registry is unavailable." },
    };
  const requiredProfiles = ["coordinator", ...workersForDelegation(state.delegation)];
  for (const name of requiredProfiles) {
    const profile = state.profiles[name];
    if (!profile)
      return { ...state, blockingReason: { code: "profile_missing", message: `Configure the ${name} profile.` } };
    const model = ctx.modelRegistry.find(profile.provider, profile.model);
    if (!model)
      return { ...state, blockingReason: { code: "profile_unavailable", message: `Model unavailable for ${name}.` } };
    const clamp = ctx.modelRegistry.clampThinkingLevel?.bind(ctx.modelRegistry);
    const supported = !model.reasoning
      ? profile.thinking === "off"
      : clamp
        ? clamp(model, profile.thinking) === profile.thinking
        : model.thinkingLevelMap?.[profile.thinking] !== null &&
          (!["xhigh", "max"].includes(profile.thinking) || model.thinkingLevelMap?.[profile.thinking] !== undefined);
    if (!supported)
      return {
        ...state,
        blockingReason: { code: "profile_clamped", message: `Requested ${name} effort is not supported exactly.` },
      };
    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth?.ok)
        return {
          ...state,
          blockingReason: { code: "profile_unauthenticated", message: `Authentication unavailable for ${name}.` },
        };
    } catch {
      return {
        ...state,
        blockingReason: { code: "profile_unauthenticated", message: `Authentication resolution failed for ${name}.` },
      };
    }
  }
  for (const worker of workersForDelegation(state.delegation))
    if (canonical(state.profiles.coordinator) === canonical(state.profiles[worker]))
      return {
        ...state,
        blockingReason: {
          code: "profiles_identical",
          message: `Configure distinct Coordinator and ${worker} model/effort pairs.`,
        },
      };
  return { ...state, effective: true, blockingReason: { code: "", message: "" } };
}

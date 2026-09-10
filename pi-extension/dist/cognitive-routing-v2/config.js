import { EFFORTS, PROFILES, canonical, isObject } from "./types.js";
export const supportsCognitiveRoutingModelRegistry = (host) =>
  typeof host?.modelRegistry?.find === "function" && typeof host?.modelRegistry?.getApiKeyAndHeaders === "function";
export const pairFromProfile = (profile) => ({
  provider: profile.provider,
  modelId: profile.model,
  thinking: profile.thinking,
});
function parseLayer(raw) {
  if (raw === undefined) return {};
  if (!isObject(raw) || Object.keys(raw).some((k) => !["enabled", "projection", "profiles"].includes(k)))
    throw new Error(
      "Routing requires the new enabled/projection/profiles schema; experimental legacy configuration is not migrated.",
    );
  for (const key of ["enabled", "projection"])
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") throw new Error(`${key} must be boolean.`);
  if (raw.profiles !== undefined) {
    if (!isObject(raw.profiles) || Object.keys(raw.profiles).some((k) => !PROFILES.includes(k)))
      throw new Error("Profiles must be coordinator/executor.");
    for (const p of Object.values(raw.profiles)) {
      if (
        !isObject(p) ||
        Object.keys(p).some((k) => !["provider", "model", "thinking"].includes(k)) ||
        typeof p.provider !== "string" ||
        !p.provider.trim() ||
        typeof p.model !== "string" ||
        !p.model.trim() ||
        !EFFORTS.includes(p.thinking)
      )
        throw new Error("Each profile requires provider, model, and supported thinking.");
    }
  }
  return raw;
}
export async function resolveCognitiveRoutingState(repository, personal, ctx) {
  const state = {
    configured: repository?.cognitiveRouting !== undefined || personal?.cognitiveRouting !== undefined,
    configValid: true,
    enabled: false,
    effective: false,
    enabledSource: "default",
    projection: false,
    projectionSource: "default",
    profiles: {},
    profileSources: {},
    blockingReason: { code: "disabled", message: "Cognitive Routing is disabled." },
  };
  try {
    for (const [source, raw] of [
      ["repository", repository?.cognitiveRouting],
      ["personal", personal?.cognitiveRouting],
    ]) {
      const layer = parseLayer(raw);
      if (layer.enabled !== undefined) {
        state.enabled = layer.enabled;
        state.enabledSource = source;
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
  for (const name of PROFILES) {
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
  if (canonical(state.profiles.coordinator) === canonical(state.profiles.executor))
    return {
      ...state,
      blockingReason: { code: "profiles_identical", message: "Configure distinct effective model/effort pairs." },
    };
  return { ...state, effective: true, blockingReason: { code: "", message: "" } };
}

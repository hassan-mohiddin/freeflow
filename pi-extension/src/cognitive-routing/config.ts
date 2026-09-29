import {
  DELEGATION_MODES,
  EFFORTS,
  PROFILES,
  canonical,
  isObject,
  workersForDelegation,
  type DelegationMode,
  type Effort,
  type Pair,
  type Profile,
} from "./types.js";
export type CognitiveRoutingProfileName = Profile;
export type CognitiveRoutingThinkingLevel = Effort;
export type CognitiveRoutingDelegationMode = DelegationMode;
export interface CognitiveRoutingProfile {
  provider: string;
  model: string;
  thinking: Effort;
}
export interface CognitiveRoutingCapabilityState {
  configured: boolean;
  configValid: boolean;
  enabled: boolean;
  effective: boolean;
  enabledSource: string;
  delegation: DelegationMode;
  delegationSource: string;
  projection: boolean;
  projectionSource: string;
  profiles: Partial<Record<Profile, CognitiveRoutingProfile>>;
  profileSources: Partial<Record<Profile, string>>;
  blockingReason: { code: string; message: string };
}
export const supportsCognitiveRoutingModelRegistry = (host: any) =>
  typeof host?.modelRegistry?.find === "function" && typeof host?.modelRegistry?.getApiKeyAndHeaders === "function";
export const pairFromProfile = (profile: CognitiveRoutingProfile): Pair => ({
  provider: profile.provider,
  modelId: profile.model,
  thinking: profile.thinking,
});
function parseLayer(raw: any): any {
  if (raw === undefined) return {};
  if (
    !isObject(raw) ||
    Object.keys(raw).some((key) => !["enabled", "delegation", "projection", "profiles"].includes(key))
  )
    throw new Error(
      "Routing requires the enabled/delegation/projection/profiles schema; experimental legacy configuration is not migrated.",
    );
  for (const key of ["enabled", "projection"])
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") throw new Error(`${key} must be boolean.`);
  if (raw.delegation !== undefined && !DELEGATION_MODES.includes(raw.delegation))
    throw new Error("delegation must be executor, helper, or both.");
  if (raw.profiles !== undefined) {
    if (!isObject(raw.profiles) || Object.keys(raw.profiles).some((key) => !PROFILES.includes(key as Profile)))
      throw new Error("Profiles must be coordinator, helper, or executor.");
    for (const profile of Object.values(raw.profiles) as any[]) {
      if (
        !isObject(profile) ||
        Object.keys(profile).some((key) => !["provider", "model", "thinking"].includes(key)) ||
        typeof profile.provider !== "string" ||
        !profile.provider.trim() ||
        typeof profile.model !== "string" ||
        !profile.model.trim() ||
        !EFFORTS.includes(profile.thinking)
      )
        throw new Error("Each profile requires provider, model, and supported thinking.");
    }
  }
  return raw;
}
export async function resolveCognitiveRoutingState(
  repository: any,
  personal: any,
  ctx: any,
): Promise<CognitiveRoutingCapabilityState> {
  const state: CognitiveRoutingCapabilityState = {
    configured: repository?.cognitiveRouting !== undefined || personal?.cognitiveRouting !== undefined,
    configValid: true,
    enabled: false,
    effective: false,
    enabledSource: "default",
    delegation: "executor",
    delegationSource: "default",
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
    ] as const) {
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
  const requiredProfiles: Profile[] = ["coordinator", ...workersForDelegation(state.delegation)];
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

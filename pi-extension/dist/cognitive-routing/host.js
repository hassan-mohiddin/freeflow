import { COGNITIVE_ROUTING_PROFILE_NAMES } from "./types.js";
const THINKING_LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const THINKING_LEVELS = new Set(THINKING_LEVEL_ORDER);
function modelRegistry(host) {
  if (!host || typeof host !== "object") return undefined;
  const hostRecord = host;
  const candidateValue = hostRecord.modelRegistry ?? hostRecord;
  if (!candidateValue || typeof candidateValue !== "object") return undefined;
  const candidate = candidateValue;
  if (
    typeof candidate.find !== "function" ||
    typeof candidate.getApiKeyAndHeaders !== "function" ||
    typeof candidate.clampThinkingLevel !== "function"
  ) {
    return undefined;
  }
  return candidate;
}
function blocking(code, message, profile) {
  return { code, message, ...(profile ? { profile } : {}) };
}
function modelIdentity(model) {
  if (!model || typeof model !== "object") return undefined;
  const provider = "provider" in model ? model.provider : undefined;
  const id = "id" in model ? model.id : undefined;
  return typeof provider === "string" && typeof id === "string" ? `${provider}/${id}` : undefined;
}
function isWeakened(requested, effective) {
  const requestedIndex = THINKING_LEVEL_ORDER.indexOf(requested);
  const effectiveIndex = THINKING_LEVEL_ORDER.indexOf(effective);
  return effectiveIndex >= 0 && requestedIndex >= 0 && effectiveIndex < requestedIndex;
}
export async function preflightCognitiveRoutingProfiles(config, host) {
  const registry = modelRegistry(host);
  if (!registry) {
    return {
      effective: false,
      resolvedProfiles: {},
      blockingReason: blocking("host_unsupported", "Pi does not expose the required Cognitive Routing host controls"),
    };
  }
  const resolvedProfiles = {};
  const resolvedIdentities = {};
  for (const name of COGNITIVE_ROUTING_PROFILE_NAMES) {
    const profile = config.profiles[name];
    if (!profile) {
      return {
        effective: false,
        resolvedProfiles,
        blockingReason: blocking("profile_missing", `Cognitive Routing profile is missing: ${name}`, name),
      };
    }
    const model = registry.find(profile.provider, profile.model);
    if (!model) {
      return {
        effective: false,
        resolvedProfiles,
        blockingReason: blocking(
          "profile_unavailable",
          `Cognitive Routing profile is unavailable: ${profile.provider}/${profile.model}`,
          name,
        ),
      };
    }
    let auth;
    try {
      auth = await registry.getApiKeyAndHeaders(model);
    } catch (error) {
      auth = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (!auth.ok) {
      return {
        effective: false,
        resolvedProfiles,
        blockingReason: blocking(
          "profile_unauthenticated",
          `Cognitive Routing profile is not authenticated: ${profile.provider}/${profile.model}${auth.error ? ` (${auth.error})` : ""}`,
          name,
        ),
      };
    }
    const effectiveThinkingLevel = registry.clampThinkingLevel(model, profile.thinkingLevel);
    if (!THINKING_LEVELS.has(effectiveThinkingLevel)) {
      return {
        effective: false,
        resolvedProfiles,
        blockingReason: blocking(
          "host_unsupported",
          `Pi returned an invalid effective thinking level for ${profile.provider}/${profile.model}`,
          name,
        ),
      };
    }
    if (isWeakened(profile.thinkingLevel, effectiveThinkingLevel)) {
      return {
        effective: false,
        resolvedProfiles,
        blockingReason: blocking(
          "profile_clamped",
          `Cognitive Routing profile is weakened by thinking-level clamping: ${profile.provider}/${profile.model}`,
          name,
        ),
      };
    }
    resolvedProfiles[name] = {
      ...profile,
      effectiveThinkingLevel,
    };
    resolvedIdentities[name] = modelIdentity(model);
  }
  const standard = resolvedProfiles.standard;
  const reasoning = resolvedProfiles.reasoning;
  if (
    standard &&
    reasoning &&
    resolvedIdentities.standard === resolvedIdentities.reasoning &&
    standard.effectiveThinkingLevel === reasoning.effectiveThinkingLevel
  ) {
    return {
      effective: false,
      resolvedProfiles,
      blockingReason: blocking("profiles_identical", "Cognitive Routing profiles resolve to the same effective pair"),
    };
  }
  return { effective: true, resolvedProfiles };
}

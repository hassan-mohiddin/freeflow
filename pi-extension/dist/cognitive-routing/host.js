import { COGNITIVE_ROUTING_PROFILE_NAMES } from "./types.js";
const THINKING_LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const THINKING_LEVELS = new Set(THINKING_LEVEL_ORDER);
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isFunction(value) {
  return typeof value === "function";
}
function parseThinkingLevelMap(value) {
  if (!isRecord(value)) return undefined;
  const map = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) map[key] = null;
    else if (entry === undefined) map[key] = undefined;
    else if (typeof entry === "string") map[key] = entry;
  }
  return map;
}
function parseModel(value) {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.id !== "string") return undefined;
  const thinkingLevelMap = parseThinkingLevelMap(value.thinkingLevelMap);
  return {
    ...value,
    provider: value.provider,
    id: value.id,
    reasoning: typeof value.reasoning === "boolean" ? value.reasoning : undefined,
    ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
  };
}
function modelRegistry(host) {
  if (!isRecord(host)) return undefined;
  const candidateValue = host.modelRegistry ?? host;
  if (!isRecord(candidateValue)) return undefined;
  const candidate = candidateValue;
  if (!isFunction(candidate.find) || !isFunction(candidate.getApiKeyAndHeaders)) return undefined;
  const find = candidate.find;
  const getApiKeyAndHeaders = candidate.getApiKeyAndHeaders;
  const clamp = isFunction(candidate.clampThinkingLevel) ? candidate.clampThinkingLevel : undefined;
  return {
    find: (provider, modelId) => parseModel(find.call(candidate, provider, modelId)),
    getApiKeyAndHeaders: (model) => getApiKeyAndHeaders.call(candidate, model),
    ...(clamp
      ? {
          clampThinkingLevel: (model, level) => clamp.call(candidate, model, level),
        }
      : {}),
  };
}
export function supportsCognitiveRoutingModelRegistry(host) {
  return modelRegistry(host) !== undefined;
}
function supportedThinkingLevels(model) {
  if (!model.reasoning) return ["off"];
  return THINKING_LEVEL_ORDER.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}
function clampThinkingLevel(model, requested) {
  const availableLevels = supportedThinkingLevels(model);
  if (availableLevels.includes(requested)) return requested;
  const requestedIndex = THINKING_LEVEL_ORDER.indexOf(requested);
  if (requestedIndex < 0) return availableLevels[0] ?? "off";
  for (let index = requestedIndex; index < THINKING_LEVEL_ORDER.length; index += 1) {
    const candidate = THINKING_LEVEL_ORDER[index];
    if (availableLevels.includes(candidate)) return candidate;
  }
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    const candidate = THINKING_LEVEL_ORDER[index];
    if (availableLevels.includes(candidate)) return candidate;
  }
  return availableLevels[0] ?? "off";
}
function resolveEffectiveThinkingLevel(registry, model, requested) {
  if (registry.clampThinkingLevel) return registry.clampThinkingLevel(model, requested);
  return clampThinkingLevel(model, requested);
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
    const effectiveThinkingLevel = resolveEffectiveThinkingLevel(registry, model, profile.thinkingLevel);
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

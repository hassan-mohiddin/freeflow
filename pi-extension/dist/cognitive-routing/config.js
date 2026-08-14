import { COGNITIVE_ROUTING_PROFILE_NAMES } from "./types.js";
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const PROFILE_NAME_SET = new Set(COGNITIVE_ROUTING_PROFILE_NAMES);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invalid(source, code, message, profile) {
  return { code, message, ...(profile ? { profile } : {}), source };
}
function parseProfile(value, source, name) {
  if (!isRecord(value)) {
    return { error: invalid(source, "invalid_profile", `${source} ${name} profile must be an object`, name) };
  }
  const allowedKeys = new Set(["provider", "model", "thinkingLevel"]);
  const unsupportedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unsupportedKey) {
    return {
      error: invalid(
        source,
        "unsupported_key",
        `${source} ${name} profile contains unsupported key: ${unsupportedKey}`,
        name,
      ),
    };
  }
  if (typeof value.provider !== "string" || value.provider.trim() === "") {
    return { error: invalid(source, "invalid_profile", `${source} ${name} profile requires provider`, name) };
  }
  if (typeof value.model !== "string" || value.model.trim() === "") {
    return { error: invalid(source, "invalid_profile", `${source} ${name} profile requires model`, name) };
  }
  if (typeof value.thinkingLevel !== "string" || !THINKING_LEVELS.has(value.thinkingLevel)) {
    return {
      error: invalid(source, "invalid_profile", `${source} ${name} profile requires a valid thinkingLevel`, name),
    };
  }
  return {
    profile: {
      provider: value.provider,
      model: value.model,
      thinkingLevel: value.thinkingLevel,
    },
  };
}
function parseLayer(value, source) {
  if (value === undefined) {
    return { present: false, valid: true, profiles: {} };
  }
  if (!isRecord(value)) {
    return {
      present: true,
      valid: false,
      profiles: {},
      error: invalid(source, "invalid_block", `${source} cognitiveRouting must be an object`),
    };
  }
  const allowedKeys = new Set(["enabled", "profiles"]);
  const unsupportedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unsupportedKey) {
    return {
      present: true,
      valid: false,
      profiles: {},
      error: invalid(
        source,
        "unsupported_key",
        `${source} cognitiveRouting contains unsupported key: ${unsupportedKey}`,
      ),
    };
  }
  let enabled;
  if (Object.hasOwn(value, "enabled")) {
    if (typeof value.enabled !== "boolean") {
      return {
        present: true,
        valid: false,
        profiles: {},
        error: invalid(source, "invalid_enabled", `${source} cognitiveRouting.enabled must be a boolean`),
      };
    }
    enabled = value.enabled;
  }
  const profiles = {};
  if (Object.hasOwn(value, "profiles")) {
    if (!isRecord(value.profiles)) {
      return {
        present: true,
        valid: false,
        profiles: {},
        error: invalid(source, "invalid_profiles", `${source} cognitiveRouting.profiles must be an object`),
      };
    }
    const unsupportedProfile = Object.keys(value.profiles).find((key) => !PROFILE_NAME_SET.has(key));
    if (unsupportedProfile) {
      return {
        present: true,
        valid: false,
        profiles: {},
        error: invalid(
          source,
          "unsupported_key",
          `${source} cognitiveRouting.profiles contains unsupported profile: ${unsupportedProfile}`,
        ),
      };
    }
    for (const name of COGNITIVE_ROUTING_PROFILE_NAMES) {
      if (!Object.hasOwn(value.profiles, name)) continue;
      const parsed = parseProfile(value.profiles[name], source, name);
      if (parsed.error) {
        return { present: true, valid: false, enabled, profiles: {}, error: parsed.error };
      }
      profiles[name] = parsed.profile;
    }
  }
  return { present: true, valid: true, enabled, profiles };
}
export function resolveCognitiveRoutingConfig(repositoryConfig, personalConfig) {
  const repositoryValue = isRecord(repositoryConfig) ? repositoryConfig.cognitiveRouting : undefined;
  const personalValue = isRecord(personalConfig) ? personalConfig.cognitiveRouting : undefined;
  const repository = parseLayer(repositoryValue, "repository");
  const personal = parseLayer(personalValue, "personal");
  const configured = repository.present || personal.present;
  const profiles = {};
  const profileSources = {};
  for (const name of COGNITIVE_ROUTING_PROFILE_NAMES) {
    if (repository.profiles[name]) {
      profiles[name] = repository.profiles[name];
      profileSources[name] = "repository";
    }
    if (personal.profiles[name]) {
      profiles[name] = personal.profiles[name];
      profileSources[name] = "personal";
    }
  }
  const enabled = personal.enabled ?? repository.enabled ?? false;
  let enabledSource = "default";
  if (repository.enabled !== undefined) enabledSource = "repository";
  if (personal.enabled !== undefined) enabledSource = "personal";
  const error = repository.error ?? personal.error;
  return {
    configured,
    valid: repository.valid && personal.valid,
    enabled,
    enabledSource,
    profiles,
    profileSources,
    ...(error ? { error } : {}),
  };
}

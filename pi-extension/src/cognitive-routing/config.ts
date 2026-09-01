import {
  COGNITIVE_ROUTING_PROFILE_NAMES,
  COGNITIVE_ROUTING_SESSION_START_CONTROLS,
  DEFAULT_COGNITIVE_ROUTING_SESSION_START,
  type CognitiveRoutingConfigError,
  type CognitiveRoutingConfigResolution,
  type CognitiveRoutingConfigSource,
  type CognitiveRoutingProfile,
  type CognitiveRoutingProfileName,
  type CognitiveRoutingSessionStart,
  type CognitiveRoutingSessionStartControl,
  type CognitiveRoutingThinkingLevel,
} from "./types.js";

const THINKING_LEVELS = new Set<CognitiveRoutingThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const PROFILE_NAME_SET = new Set<string>(COGNITIVE_ROUTING_PROFILE_NAMES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(
  source: "repository" | "personal",
  code: CognitiveRoutingConfigError["code"],
  message: string,
  profile?: CognitiveRoutingProfileName,
): CognitiveRoutingConfigError {
  return { code, message, ...(profile ? { profile } : {}), source };
}

function parseProfile(
  value: unknown,
  source: "repository" | "personal",
  name: CognitiveRoutingProfileName,
): { profile?: CognitiveRoutingProfile; error?: CognitiveRoutingConfigError } {
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
  if (
    typeof value.thinkingLevel !== "string" ||
    !THINKING_LEVELS.has(value.thinkingLevel as CognitiveRoutingThinkingLevel)
  ) {
    return {
      error: invalid(source, "invalid_profile", `${source} ${name} profile requires a valid thinkingLevel`, name),
    };
  }

  return {
    profile: {
      provider: value.provider,
      model: value.model,
      thinkingLevel: value.thinkingLevel as CognitiveRoutingThinkingLevel,
    },
  };
}

interface ParsedLayer {
  present: boolean;
  valid: boolean;
  enabled?: boolean;
  profiles: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingProfile>>;
  sessionStart: Partial<CognitiveRoutingSessionStart>;
  error?: CognitiveRoutingConfigError;
}

function parseSessionStart(
  value: unknown,
  source: "repository" | "personal",
): { sessionStart?: Partial<CognitiveRoutingSessionStart>; error?: CognitiveRoutingConfigError } {
  if (!isRecord(value)) {
    return {
      error: invalid(source, "invalid_session_start", `${source} cognitiveRouting.sessionStart must be an object`),
    };
  }

  const allowedKeys = new Set(["control", "profile"]);
  const unsupportedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unsupportedKey) {
    return {
      error: invalid(
        source,
        "unsupported_key",
        `${source} cognitiveRouting.sessionStart contains unsupported key: ${unsupportedKey}`,
      ),
    };
  }

  let control: CognitiveRoutingSessionStartControl | undefined;
  if (Object.hasOwn(value, "control")) {
    if (
      typeof value.control !== "string" ||
      !COGNITIVE_ROUTING_SESSION_START_CONTROLS.includes(value.control as CognitiveRoutingSessionStartControl)
    ) {
      return {
        error: invalid(
          source,
          "invalid_session_start",
          `${source} cognitiveRouting.sessionStart.control must be automatic or manual`,
        ),
      };
    }
    control = value.control as CognitiveRoutingSessionStartControl;
  }

  let profile: CognitiveRoutingProfileName | undefined;
  if (Object.hasOwn(value, "profile")) {
    if (typeof value.profile !== "string" || !PROFILE_NAME_SET.has(value.profile)) {
      return {
        error: invalid(
          source,
          "invalid_session_start",
          `${source} cognitiveRouting.sessionStart.profile must be standard or reasoning`,
        ),
      };
    }
    profile = value.profile as CognitiveRoutingProfileName;
  }

  return { sessionStart: { ...(control ? { control } : {}), ...(profile ? { profile } : {}) } };
}

function parseLayer(value: unknown, source: "repository" | "personal"): ParsedLayer {
  if (value === undefined) {
    return { present: false, valid: true, profiles: {}, sessionStart: {} };
  }
  if (!isRecord(value)) {
    return {
      present: true,
      valid: false,
      profiles: {},
      sessionStart: {},
      error: invalid(source, "invalid_block", `${source} cognitiveRouting must be an object`),
    };
  }

  const allowedKeys = new Set(["enabled", "profiles", "sessionStart"]);
  const unsupportedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unsupportedKey) {
    return {
      present: true,
      valid: false,
      profiles: {},
      sessionStart: {},
      error: invalid(
        source,
        "unsupported_key",
        `${source} cognitiveRouting contains unsupported key: ${unsupportedKey}`,
      ),
    };
  }

  let enabled: boolean | undefined;
  if (Object.hasOwn(value, "enabled")) {
    if (typeof value.enabled !== "boolean") {
      return {
        present: true,
        valid: false,
        profiles: {},
        sessionStart: {},
        error: invalid(source, "invalid_enabled", `${source} cognitiveRouting.enabled must be a boolean`),
      };
    }
    enabled = value.enabled;
  }

  let sessionStart: Partial<CognitiveRoutingSessionStart> = {};
  if (Object.hasOwn(value, "sessionStart")) {
    const parsed = parseSessionStart(value.sessionStart, source);
    if (parsed.error)
      return { present: true, valid: false, enabled, profiles: {}, sessionStart: {}, error: parsed.error };
    sessionStart = parsed.sessionStart ?? {};
  }

  const profiles: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingProfile>> = {};
  if (Object.hasOwn(value, "profiles")) {
    if (!isRecord(value.profiles)) {
      return {
        present: true,
        valid: false,
        profiles: {},
        sessionStart: {},
        error: invalid(source, "invalid_profiles", `${source} cognitiveRouting.profiles must be an object`),
      };
    }

    const unsupportedProfile = Object.keys(value.profiles).find((key) => !PROFILE_NAME_SET.has(key));
    if (unsupportedProfile) {
      return {
        present: true,
        valid: false,
        profiles: {},
        sessionStart: {},
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
        return { present: true, valid: false, enabled, profiles: {}, sessionStart: {}, error: parsed.error };
      }
      profiles[name] = parsed.profile;
    }
  }

  return { present: true, valid: true, enabled, profiles, sessionStart };
}

export function resolveCognitiveRoutingConfig(
  repositoryConfig: unknown,
  personalConfig: unknown,
): CognitiveRoutingConfigResolution {
  const repositoryValue = isRecord(repositoryConfig) ? repositoryConfig.cognitiveRouting : undefined;
  const personalValue = isRecord(personalConfig) ? personalConfig.cognitiveRouting : undefined;
  const repository = parseLayer(repositoryValue, "repository");
  const personal = parseLayer(personalValue, "personal");
  const configured = repository.present || personal.present;

  const profiles: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingProfile>> = {};
  const profileSources: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingConfigSource>> = {};
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
  let enabledSource: CognitiveRoutingConfigSource = "default";
  if (repository.enabled !== undefined) enabledSource = "repository";
  if (personal.enabled !== undefined) enabledSource = "personal";

  const sessionStartControl =
    personal.sessionStart.control ?? repository.sessionStart.control ?? DEFAULT_COGNITIVE_ROUTING_SESSION_START.control;
  const configuredSessionStartProfile =
    personal.sessionStart.profile ?? repository.sessionStart.profile ?? DEFAULT_COGNITIVE_ROUTING_SESSION_START.profile;
  const sessionStart: CognitiveRoutingSessionStart = {
    control: sessionStartControl,
    profile: sessionStartControl === "automatic" ? "reasoning" : configuredSessionStartProfile,
  };
  let sessionStartControlSource: CognitiveRoutingConfigSource = "default";
  if (repository.sessionStart.control !== undefined) sessionStartControlSource = "repository";
  if (personal.sessionStart.control !== undefined) sessionStartControlSource = "personal";
  let sessionStartProfileSource: CognitiveRoutingConfigSource = "default";
  if (sessionStartControl === "manual") {
    if (repository.sessionStart.profile !== undefined) sessionStartProfileSource = "repository";
    if (personal.sessionStart.profile !== undefined) sessionStartProfileSource = "personal";
  }
  const sessionStartSources = {
    control: sessionStartControlSource,
    profile: sessionStartProfileSource,
  };
  const error = repository.error ?? personal.error;

  return {
    configured,
    valid: repository.valid && personal.valid,
    enabled,
    enabledSource,
    profiles,
    profileSources,
    sessionStart,
    sessionStartSources,
    ...(error ? { error } : {}),
  };
}

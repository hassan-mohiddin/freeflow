import {
  COGNITIVE_ROUTING_PROFILE_NAMES,
  type CognitiveRoutingBlockingReason,
  type CognitiveRoutingConfigResolution,
  type CognitiveRoutingProfileName,
  type CognitiveRoutingResolvedProfile,
  type CognitiveRoutingThinkingLevel,
} from "./types.js";

const THINKING_LEVEL_ORDER: CognitiveRoutingThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
const THINKING_LEVELS = new Set(THINKING_LEVEL_ORDER);

type CognitiveRoutingModel = {
  [key: string]: unknown;
  provider: string;
  id: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null | undefined>;
};

type AnyFunction = (...args: any[]) => any;

interface ModelRegistryHost {
  find(provider: string, modelId: string): CognitiveRoutingModel | undefined;
  getApiKeyAndHeaders(model: CognitiveRoutingModel): Promise<{ ok: boolean; error?: string }>;
  clampThinkingLevel?: (
    model: CognitiveRoutingModel,
    level: CognitiveRoutingThinkingLevel,
  ) => CognitiveRoutingThinkingLevel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFunction(value: unknown): value is AnyFunction {
  return typeof value === "function";
}

function parseThinkingLevelMap(value: unknown): Record<string, string | null | undefined> | undefined {
  if (!isRecord(value)) return undefined;
  const map: Record<string, string | null | undefined> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) map[key] = null;
    else if (entry === undefined) map[key] = undefined;
    else if (typeof entry === "string") map[key] = entry;
  }
  return map;
}

function parseModel(value: unknown): CognitiveRoutingModel | undefined {
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

function modelRegistry(host: unknown): ModelRegistryHost | undefined {
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
          clampThinkingLevel: (model, level) => clamp.call(candidate, model, level) as CognitiveRoutingThinkingLevel,
        }
      : {}),
  };
}

export function supportsCognitiveRoutingModelRegistry(host: unknown): boolean {
  return modelRegistry(host) !== undefined;
}

function supportedThinkingLevels(model: CognitiveRoutingModel): CognitiveRoutingThinkingLevel[] {
  if (!model.reasoning) return ["off"];

  return THINKING_LEVEL_ORDER.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}

function clampThinkingLevel(
  model: CognitiveRoutingModel,
  requested: CognitiveRoutingThinkingLevel,
): CognitiveRoutingThinkingLevel {
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

function resolveEffectiveThinkingLevel(
  registry: ModelRegistryHost,
  model: CognitiveRoutingModel,
  requested: CognitiveRoutingThinkingLevel,
): CognitiveRoutingThinkingLevel {
  if (registry.clampThinkingLevel) return registry.clampThinkingLevel(model, requested);
  return clampThinkingLevel(model, requested);
}

function blocking(
  code: CognitiveRoutingBlockingReason["code"],
  message: string,
  profile?: CognitiveRoutingProfileName,
): CognitiveRoutingBlockingReason {
  return { code, message, ...(profile ? { profile } : {}) };
}

function modelIdentity(model: unknown): string | undefined {
  if (!model || typeof model !== "object") return undefined;
  const provider = "provider" in model ? model.provider : undefined;
  const id = "id" in model ? model.id : undefined;
  return typeof provider === "string" && typeof id === "string" ? `${provider}/${id}` : undefined;
}

function isWeakened(requested: CognitiveRoutingThinkingLevel, effective: CognitiveRoutingThinkingLevel): boolean {
  const requestedIndex = THINKING_LEVEL_ORDER.indexOf(requested);
  const effectiveIndex = THINKING_LEVEL_ORDER.indexOf(effective);
  return effectiveIndex >= 0 && requestedIndex >= 0 && effectiveIndex < requestedIndex;
}

export interface CognitiveRoutingPreflightResult {
  effective: boolean;
  resolvedProfiles: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingResolvedProfile>>;
  blockingReason?: CognitiveRoutingBlockingReason;
}

export async function preflightCognitiveRoutingProfiles(
  config: CognitiveRoutingConfigResolution,
  host: unknown,
): Promise<CognitiveRoutingPreflightResult> {
  const registry = modelRegistry(host);
  if (!registry) {
    return {
      effective: false,
      resolvedProfiles: {},
      blockingReason: blocking("host_unsupported", "Pi does not expose the required Cognitive Routing host controls"),
    };
  }

  const resolvedProfiles: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingResolvedProfile>> = {};
  const resolvedIdentities: Partial<Record<CognitiveRoutingProfileName, string>> = {};
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
    let auth: { ok: boolean; error?: string };
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

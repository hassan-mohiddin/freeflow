import { resolveCognitiveRoutingConfig } from "./config.js";
import { preflightCognitiveRoutingProfiles } from "./host.js";
import type {
  CognitiveRoutingBlockingReason,
  CognitiveRoutingCapabilityState,
  CognitiveRoutingConfigResolution,
} from "./types.js";

function blockingReason(code: CognitiveRoutingBlockingReason["code"], message: string): CognitiveRoutingBlockingReason {
  return { code, message };
}

function baseState(config: CognitiveRoutingConfigResolution): CognitiveRoutingCapabilityState {
  return {
    configured: config.configured,
    configValid: config.valid,
    enabled: config.enabled,
    effective: false,
    enabledSource: config.enabledSource,
    profiles: config.profiles,
    profileSources: config.profileSources,
    sessionStart: config.sessionStart,
    sessionStartSources: config.sessionStartSources,
    resolvedProfiles: {},
    blockingReason: blockingReason("disabled", "Cognitive Routing is disabled"),
  };
}

export async function resolveCognitiveRoutingState(
  repositoryConfig: unknown,
  personalConfig: unknown,
  host: unknown,
): Promise<CognitiveRoutingCapabilityState> {
  const config = resolveCognitiveRoutingConfig(repositoryConfig, personalConfig);
  const state = baseState(config);

  if (!config.valid) {
    return {
      ...state,
      blockingReason: blockingReason(
        "config_invalid",
        config.error?.message ?? "Cognitive Routing configuration is invalid",
      ),
    };
  }
  if (!config.enabled) {
    return state;
  }

  const preflight = await preflightCognitiveRoutingProfiles(config, host);
  return {
    ...state,
    effective: preflight.effective,
    resolvedProfiles: preflight.resolvedProfiles,
    blockingReason: preflight.blockingReason ?? blockingReason("disabled", "Cognitive Routing is not effective"),
  };
}

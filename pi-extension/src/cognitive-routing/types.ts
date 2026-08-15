export const COGNITIVE_ROUTING_PROFILE_NAMES = ["standard", "reasoning"] as const;

export type CognitiveRoutingProfileName = (typeof COGNITIVE_ROUTING_PROFILE_NAMES)[number];
export type CognitiveRoutingThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type CognitiveRoutingConfigSource = "default" | "repository" | "personal";

export interface CognitiveRoutingProfile {
  provider: string;
  model: string;
  thinkingLevel: CognitiveRoutingThinkingLevel;
}

export interface CognitiveRoutingConfigError {
  code: "invalid_block" | "invalid_enabled" | "invalid_profiles" | "invalid_profile" | "unsupported_key";
  message: string;
  profile?: CognitiveRoutingProfileName;
  source: "repository" | "personal";
}

export interface CognitiveRoutingConfigResolution {
  configured: boolean;
  valid: boolean;
  enabled: boolean;
  enabledSource: CognitiveRoutingConfigSource;
  profiles: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingProfile>>;
  profileSources: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingConfigSource>>;
  error?: CognitiveRoutingConfigError;
}

export type CognitiveRoutingBlockCode =
  | "disabled"
  | "config_invalid"
  | "host_unsupported"
  | "profile_missing"
  | "profile_unavailable"
  | "profile_unauthenticated"
  | "profile_clamped"
  | "profiles_identical"
  | "runtime_disabled";

export interface CognitiveRoutingBlockingReason {
  code: CognitiveRoutingBlockCode;
  message: string;
  profile?: CognitiveRoutingProfileName;
}

export interface CognitiveRoutingResolvedProfile extends CognitiveRoutingProfile {
  effectiveThinkingLevel: CognitiveRoutingThinkingLevel;
}

export interface CognitiveRoutingCapabilityState {
  configured: boolean;
  configValid: boolean;
  enabled: boolean;
  effective: boolean;
  enabledSource: CognitiveRoutingConfigSource;
  profiles: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingProfile>>;
  profileSources: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingConfigSource>>;
  resolvedProfiles: Partial<Record<CognitiveRoutingProfileName, CognitiveRoutingResolvedProfile>>;
  blockingReason: CognitiveRoutingBlockingReason;
}

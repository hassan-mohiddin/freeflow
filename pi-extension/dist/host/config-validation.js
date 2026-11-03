import { validateCompactionConfig } from "../compaction/config.js";
import { DELEGATION_MODES, EFFORTS, PROFILES } from "../cognitive-routing/types.js";
import { INBOUND_POLICIES, validateMessagingConfig } from "../messaging/config.js";
import { validateToolExecutionConfig } from "../tool-execution/config.js";
import { FREEFLOW_MODEL_SKILL_NAMES } from "./catalog.js";
/**
 * Whether a Freeflow config file is valid: one answer for Pi and for the session-start hooks of the other hosts, which
 * import the built file. Also how the settings every host reads, `prompts`, `review` and `skills`, layer. Keep this module and its
 * imports free of Pi packages; the hooks run in plain Node.
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** The runtime prompts Freeflow delivers on every host, each on unless a config turns it off. */
export const RUNTIME_PROMPTS = ["core", "interactionContract", "workingMethod"];
/** The keys `prompts` accepts: a master switch for all three, and one switch per prompt. */
export const PROMPTS_KEYS = ["enabled", ...RUNTIME_PROMPTS];
/**
 * A section's master switch (`prompts.enabled`, `skills.enabled`, `events.enabled`) for two valid layers; on unless a
 * config turns it off.
 */
export function sectionEnabled(repository, local, section) {
  const layer = (config) => (isRecord(config?.[section]) ? config[section] : {});
  return (layer(local).enabled ?? layer(repository).enabled ?? true) === true;
}
function validatePromptsConfig(value) {
  if (!isRecord(value)) return "prompts must be an object";
  const unknown = Object.keys(value).find((key) => !PROMPTS_KEYS.includes(key));
  if (unknown) return `prompts has unsupported key: ${unknown}`;
  for (const key of PROMPTS_KEYS)
    if (value[key] !== undefined && typeof value[key] !== "boolean") return `prompts.${key} must be a boolean`;
  return null;
}
/**
 * The prompts Freeflow delivers for two valid config layers: the personal layer overrides the repository's, and the
 * master switch off turns all three off.
 */
export function selectedRuntimePrompts(repository, local) {
  const layer = (config) => (isRecord(config?.prompts) ? config.prompts : {});
  const [shared, personal] = [layer(repository), layer(local)];
  const master = sectionEnabled(repository, local, "prompts");
  const selection = {};
  for (const key of RUNTIME_PROMPTS) selection[key] = master && (personal[key] ?? shared[key] ?? true) === true;
  return selection;
}
/**
 * The skills a user can turn off. Setup Freeflow always stays, so a user can repair a configuration; the capability
 * skills follow their capability's switch. On Pi an off skill is not loaded; other hosts load plugin skills themselves,
 * so there the Runtime State only tells the agent not to use it.
 */
export const SWITCHABLE_SKILLS = FREEFLOW_MODEL_SKILL_NAMES.filter((name) => name !== "setup-freeflow").sort();
/** The keys `skills` accepts: a master switch for every switchable skill, and one switch per skill. */
export const SKILLS_KEYS = ["enabled", ...SWITCHABLE_SKILLS];
function validateSkillsConfig(value) {
  if (!isRecord(value)) return "skills must be an object";
  const unknown = Object.keys(value).find((key) => !SKILLS_KEYS.includes(key));
  if (unknown) return `skills has unsupported key: ${unknown}; use ${SKILLS_KEYS.join(", ")}`;
  for (const [key, on] of Object.entries(value)) if (typeof on !== "boolean") return `skills.${key} must be a boolean`;
  return null;
}
/**
 * The skills turned off for two valid config layers: the personal layer overrides the repository's, skill by skill,
 * and the master switch off turns every switchable skill off.
 */
export function skillsOff(repository, local) {
  const layer = (config) => (isRecord(config?.skills) ? config.skills : {});
  const [shared, personal] = [layer(repository), layer(local)];
  if (!sectionEnabled(repository, local, "skills")) return [...SWITCHABLE_SKILLS];
  return SWITCHABLE_SKILLS.filter((name) => (personal[name] ?? shared[name] ?? true) === false);
}
/** The Runtime State line for skills the user turned off; none while every skill is on. */
export function skillsStateLine(off) {
  return off?.length ? `Skills off: ${off.map((name) => `\`${name}\``).join(", ")}; do not open or follow them.` : null;
}
/**
 * The event log (SPEC-006, P5): whether a Freeflow driver (Claude Code's mod, the Pi extension) writes what happens in
 * the session's loop to `<FREEFLOW_HOME>/events/<session>.jsonl`. On unless a config turns it off.
 */
export const EVENTS_KEYS = ["enabled"];
function validateEventsConfig(value) {
  if (!isRecord(value)) return "events must be an object";
  const unknown = Object.keys(value).find((key) => !EVENTS_KEYS.includes(key));
  if (unknown) return `events has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "events.enabled must be a boolean";
  return null;
}
/**
 * How Review Work reviews finished work. Without the key it runs `auto`, its own risk gate; `off` and `always` are the
 * user's choice for every task, and `model` names the model a reviewer runs on. `auto` is accepted so a personal file
 * can return a shared `off` or `always` to the default.
 */
export const REVIEW_MODES = ["auto", "off", "always"];
export const REVIEW_KEYS = ["mode", "model"];
function validateReviewConfig(value) {
  if (!isRecord(value)) return "review must be an object";
  const unknown = Object.keys(value).find((key) => !REVIEW_KEYS.includes(key));
  if (unknown) return `review has unsupported key: ${unknown}`;
  if (value.mode !== undefined && !REVIEW_MODES.includes(value.mode))
    return `review.mode must be one of ${REVIEW_MODES.join(", ")}`;
  // The model is shown to the agent in the Runtime State, so it must fit on one line in a code span.
  if (
    value.model !== undefined &&
    (typeof value.model !== "string" || !value.model.trim() || /[\p{Cc}`]/u.test(value.model))
  )
    return "review.model must be a non-empty model name on one line";
  return null;
}
/** Review settings for two valid config layers: the personal layer overrides the repository's, field by field. */
export function resolveReviewSettings(repository, local) {
  const layer = (config) => (isRecord(config?.review) ? config.review : {});
  const [shared, personal] = [layer(repository), layer(local)];
  const mode = personal.mode ?? shared.mode ?? "auto";
  const model = personal.model ?? shared.model;
  return model === undefined ? { mode } : { mode, model };
}
/** The Runtime State line for the user's review choice; none for the default, `auto` with no model. */
export function reviewStateLine(review) {
  if (!review || (review.mode === "auto" && review.model === undefined)) return null;
  return `Review: \`${review.mode}\`${review.model === undefined ? "" : `, reviewer model \`${review.model}\``}`;
}
/** The keys `cognitiveRouting` accepts; the settings test checks each has a /freeflow settings row. */
export const COGNITIVE_ROUTING_KEYS = ["enabled", "delegation", "projection", "profiles"];
/**
 * Whether a `cognitiveRouting` section is valid, with the messages Pi's routing gives (cognitive-routing/config.ts
 * throws them): one check for Pi and for the hooks, which before checked nothing here.
 */
export function validateCognitiveRoutingConfig(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !COGNITIVE_ROUTING_KEYS.includes(key)))
    return "Routing requires the enabled/delegation/projection/profiles schema; experimental legacy configuration is not migrated.";
  for (const key of ["enabled", "projection"])
    if (value[key] !== undefined && typeof value[key] !== "boolean") return `${key} must be boolean.`;
  if (value.delegation !== undefined && !DELEGATION_MODES.includes(value.delegation))
    return "delegation must be executor, helper, or both.";
  if (value.profiles !== undefined) {
    if (!isRecord(value.profiles) || Object.keys(value.profiles).some((key) => !PROFILES.includes(key)))
      return "Profiles must be coordinator, helper, or executor.";
    for (const profile of Object.values(value.profiles))
      if (
        !isRecord(profile) ||
        Object.keys(profile).some((key) => !["provider", "model", "thinking"].includes(key)) ||
        typeof profile.provider !== "string" ||
        !profile.provider.trim() ||
        typeof profile.model !== "string" ||
        !profile.model.trim() ||
        !EFFORTS.includes(profile.thinking)
      )
        return "Each profile requires provider, model, and supported thinking.";
  }
  return null;
}
const PROMPT_LABELS = {
  core: "Core prompt",
  interactionContract: "Interaction Contract",
  workingMethod: "Working Method",
};
/**
 * Every setting Freeflow acts on, once: the validators' keys, Pi's Session keys, the defaults a repository write drops,
 * the settings script and the settings test read this table. The settings doc and Pi's screen each have a row per key,
 * which the settings test checks.
 */
export const SETTINGS = [
  { key: "enabled", label: "Freeflow", values: "boolean", default: true, hosts: "all", session: true },
  { key: "prompts.enabled", label: "Runtime prompts", values: "boolean", default: true, hosts: "all", session: true },
  ...RUNTIME_PROMPTS.map((prompt) => ({
    key: `prompts.${prompt}`,
    label: PROMPT_LABELS[prompt],
    values: "boolean",
    default: true,
    hosts: "all",
    session: true,
  })),
  { key: "skills.enabled", label: "Skills", values: "boolean", default: true, hosts: "all", session: true },
  ...SWITCHABLE_SKILLS.map((skill) => ({
    key: `skills.${skill}`,
    label: `Skill ${skill}`,
    values: "boolean",
    default: true,
    hosts: "all",
    session: true,
  })),
  { key: "events.enabled", label: "Event log", values: "boolean", default: true, hosts: "all", session: true },
  { key: "review.mode", label: "Review", values: REVIEW_MODES, default: "auto", hosts: "all", session: true },
  { key: "review.model", label: "Reviewer model", values: "name", default: null, hosts: "all", session: true },
  {
    key: "toolExecution.enabled",
    label: "Tool Execution",
    values: "boolean",
    default: true,
    hosts: "pi",
    session: true,
  },
  {
    key: "toolExecution.guidanceNotices",
    label: "Guidance notices",
    values: "boolean",
    default: true,
    hosts: "pi",
    session: true,
  },
  { key: "compaction.enabled", label: "Compaction", values: "boolean", default: true, hosts: "pi", session: true },
  { key: "messaging.enabled", label: "Messaging", values: "boolean", default: false, hosts: "pi", session: true },
  {
    key: "messaging.inbound",
    label: "Ask before delivering",
    values: INBOUND_POLICIES,
    default: "accept",
    hosts: "pi",
    session: true,
  },
  {
    key: "cognitiveRouting.enabled",
    label: "Cognitive Routing",
    values: "boolean",
    default: false,
    hosts: "pi",
    session: true,
  },
  {
    key: "cognitiveRouting.projection",
    label: "Context projection",
    values: "boolean",
    default: true,
    hosts: "pi",
    session: true,
  },
  {
    key: "cognitiveRouting.delegation",
    label: "Delegation",
    values: DELEGATION_MODES,
    default: "executor",
    hosts: "pi",
    session: false,
  },
  ...PROFILES.map((profile) => ({
    key: `cognitiveRouting.profiles.${profile}`,
    label: `${profile[0].toUpperCase()}${profile.slice(1)} preset`,
    values: "profile",
    default: null,
    hosts: "pi",
    session: false,
  })),
];
/** The table's row for a dotted key, or undefined. */
export function settingSpec(key) {
  return SETTINGS.find((spec) => spec.key === key);
}
/** Whether `value` is one `spec` accepts; a profile is checked by the routing validator, not here. */
export function validSettingValue(spec, value) {
  if (spec.values === "boolean") return typeof value === "boolean";
  if (spec.values === "name") return typeof value === "string" && value.trim() !== "" && !/[\p{Cc}`]/u.test(value);
  if (spec.values === "profile") return false;
  return spec.values.includes(value);
}
/** The schema version a file may name as `"v"`; nothing writes it yet, so an older Freeflow still reads the file. */
export const CONFIG_VERSION = 1;
function validateVersion(value) {
  return value.v === undefined || value.v === CONFIG_VERSION ? null : `v must be ${CONFIG_VERSION}`;
}
function removedContextConfigError(value, filePath) {
  const removedKeys = ["contextVirtualization", "conversationHistory"].filter((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
  return removedKeys.length > 0
    ? `Removed Freeflow context setting(s) in ${filePath}: ${removedKeys.join(", ")}. Delete those keys before using Freeflow.`
    : null;
}
function validateCoreConfigFields(value) {
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return "enabled must be a boolean";
  }
  return null;
}
/** The top-level keys Freeflow acts on; the settings test checks that every key under them has a settings row. */
export const CONFIG_SECTIONS = [
  "enabled",
  "cognitiveRouting",
  "toolExecution",
  "compaction",
  "messaging",
  "prompts",
  "review",
  "skills",
  "events",
];
// outputRouter, observedRouting, scriptTransform and taskMemory belong to retired features; they are accepted and
// ignored so existing configs keep loading, and /freeflow status says Task Memory is gone (P6).
const RETIRED_SECTIONS = ["outputRouter", "observedRouting", "scriptTransform", "taskMemory"];
export function validateRepositoryConfig(value) {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }
  const removedContextError = removedContextConfigError(value, ".freeflow/config.json");
  if (removedContextError) return removedContextError;
  const allowedKeys = new Set(["v", ...CONFIG_SECTIONS, ...RETIRED_SECTIONS]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `unsupported top-level config key: ${key}`;
    }
  }
  const coreError = validateCoreConfigFields(value) ?? validateVersion(value);
  if (coreError) return coreError;
  if (value.cognitiveRouting !== undefined) {
    const error = validateCognitiveRoutingConfig(value.cognitiveRouting);
    if (error) return error;
  }
  for (const key of ["outputRouter", "observedRouting", "scriptTransform"]) {
    if (value[key] !== undefined && !isRecord(value[key])) {
      return `${key} must be an object`;
    }
  }
  if (value.toolExecution !== undefined) {
    const error = validateToolExecutionConfig(value.toolExecution);
    if (error) return error;
  }
  if (value.prompts !== undefined) {
    const error = validatePromptsConfig(value.prompts);
    if (error) return error;
  }
  if (value.compaction !== undefined) {
    const error = validateCompactionConfig(value.compaction);
    if (error) return error;
  }
  if (value.messaging !== undefined) {
    const error = validateMessagingConfig(value.messaging);
    if (error) return error;
  }
  if (value.skills !== undefined) {
    const error = validateSkillsConfig(value.skills);
    if (error) return error;
  }
  if (value.events !== undefined) {
    const error = validateEventsConfig(value.events);
    if (error) return error;
  }
  if (value.review !== undefined) return validateReviewConfig(value.review);
  return null;
}
export function validateLocalConfig(value) {
  if (!isRecord(value)) {
    return "local config must be a JSON object";
  }
  const removedContextError = removedContextConfigError(value, ".freeflow/local.json");
  if (removedContextError) return removedContextError;
  // processing and taskMemory belong to retired features; they are accepted and ignored so existing local configs keep
  // loading.
  const allowedKeys = new Set([
    "v",
    "enabled",
    "processing",
    "cognitiveRouting",
    "toolExecution",
    "compaction",
    "taskMemory",
    "messaging",
    "prompts",
    "review",
    "skills",
    "events",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `unsupported top-level local config key: ${key}`;
    }
  }
  const coreError = validateCoreConfigFields(value) ?? validateVersion(value);
  if (coreError) return coreError;
  if (value.cognitiveRouting !== undefined) {
    const error = validateCognitiveRoutingConfig(value.cognitiveRouting);
    if (error) return error;
  }
  if (value.toolExecution !== undefined) {
    const error = validateToolExecutionConfig(value.toolExecution);
    if (error) return error;
  }
  if (value.prompts !== undefined) {
    const error = validatePromptsConfig(value.prompts);
    if (error) return error;
  }
  if (value.compaction !== undefined) {
    const error = validateCompactionConfig(value.compaction);
    if (error) return error;
  }
  if (value.messaging !== undefined) {
    const error = validateMessagingConfig(value.messaging);
    if (error) return error;
  }
  if (value.skills !== undefined) {
    const error = validateSkillsConfig(value.skills);
    if (error) return error;
  }
  if (value.events !== undefined) {
    const error = validateEventsConfig(value.events);
    if (error) return error;
  }
  if (value.review !== undefined) return validateReviewConfig(value.review);
  return null;
}

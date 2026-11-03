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

function isRecord(value: unknown): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A parsed config file: JSON whose shape the validators below check. */
export type ConfigObject = Record<string, any>;

/** The runtime prompts Freeflow delivers on every host, each on unless a config turns it off. */
export const RUNTIME_PROMPTS = ["core", "interactionContract", "workingMethod"] as const;
export type RuntimePromptSelection = Record<(typeof RUNTIME_PROMPTS)[number], boolean>;
/** The keys `prompts` accepts: a master switch for all three, and one switch per prompt. */
export const PROMPTS_KEYS = ["enabled", ...RUNTIME_PROMPTS] as const;

/**
 * A section's master switch (`prompts.enabled`, `skills.enabled`, `events.enabled`) for two valid layers; on unless a
 * config turns it off.
 */
export function sectionEnabled(repository: unknown, local: unknown, section: "prompts" | "skills" | "events"): boolean {
  const layer = (config: any) => (isRecord(config?.[section]) ? config[section] : {});
  return (layer(local).enabled ?? layer(repository).enabled ?? true) === true;
}

function validatePromptsConfig(value: unknown) {
  if (!isRecord(value)) return "prompts must be an object";
  const unknown = Object.keys(value).find((key) => !(PROMPTS_KEYS as readonly string[]).includes(key));
  if (unknown) return `prompts has unsupported key: ${unknown}`;
  for (const key of PROMPTS_KEYS)
    if (value[key] !== undefined && typeof value[key] !== "boolean") return `prompts.${key} must be a boolean`;
  return null;
}

/**
 * The prompts Freeflow delivers for two valid config layers: the personal layer overrides the repository's, and the
 * master switch off turns all three off.
 */
export function selectedRuntimePrompts(repository: unknown, local: unknown): RuntimePromptSelection {
  const layer = (config: any) => (isRecord(config?.prompts) ? config.prompts : {});
  const [shared, personal] = [layer(repository), layer(local)];
  const master = sectionEnabled(repository, local, "prompts");
  const selection = {} as RuntimePromptSelection;
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

function validateSkillsConfig(value: unknown) {
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
export function skillsOff(repository: unknown, local: unknown): string[] {
  const layer = (config: any) => (isRecord(config?.skills) ? config.skills : {});
  const [shared, personal] = [layer(repository), layer(local)];
  if (!sectionEnabled(repository, local, "skills")) return [...SWITCHABLE_SKILLS];
  return SWITCHABLE_SKILLS.filter((name) => (personal[name] ?? shared[name] ?? true) === false);
}

/** The Runtime State line for skills the user turned off; none while every skill is on. */
export function skillsStateLine(off: readonly string[] | undefined): string | null {
  return off?.length ? `Skills off: ${off.map((name) => `\`${name}\``).join(", ")}; do not open or follow them.` : null;
}

/**
 * The event log (SPEC-006, P5): whether a Freeflow driver (Claude Code's mod, the Pi extension) writes what happens in
 * the session's loop to `<FREEFLOW_HOME>/events/<session>.jsonl`. On unless a config turns it off.
 */
export const EVENTS_KEYS = ["enabled"] as const;

function validateEventsConfig(value: unknown) {
  if (!isRecord(value)) return "events must be an object";
  const unknown = Object.keys(value).find((key) => !(EVENTS_KEYS as readonly string[]).includes(key));
  if (unknown) return `events has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "events.enabled must be a boolean";
  return null;
}

/**
 * How Review Work reviews finished work (SPEC-007). `unit` says when a review runs: at every pull request by default,
 * at a push, a commit or an agreement's Return, or `manual` (proposed with its plan and cost, run after a yes). `model`
 * is the reviewer's model, `auto` choosing the cheapest capable one; `rounds` caps Review 1, 2, 3. `depth` holds the
 * project's rules for how deep a review goes; it is Repository scope only, read from the base commit by
 * `review-plan.mjs`, so a change never supplies the policy that reviews it.
 */
export const REVIEW_UNITS = ["pr", "push", "commit", "agreement", "manual"] as const;
export const REVIEW_ROUNDS = [1, 2, 3] as const;
export const REVIEW_DEPTHS = ["quick", "standard", "deep"] as const;
export const REVIEW_TIERS = ["standard", "security"] as const;
/** The built-in triggers `review-plan.mjs` evaluates (skills/review-work/scripts/lib/triggers.mjs). */
export const REVIEW_BUILTINS = ["security", "data", "ci", "public interface"] as const;
export type ReviewSettings = {
  unit: (typeof REVIEW_UNITS)[number];
  model: string;
  rounds: (typeof REVIEW_ROUNDS)[number];
};
export const REVIEW_KEYS = ["unit", "model", "rounds", "depth"] as const;
export const REVIEW_DEFAULTS: ReviewSettings = { unit: "pr", model: "auto", rounds: 3 };

const DEPTH_KEYS = ["default", "rules", "builtins"];
const RULE_KEYS = ["paths", "linesOver", "trigger", "depth", "tier", "humans"];
const oneOf = (values: readonly unknown[]) => values.map(String).join(", ");

function validateReviewRule(rule: unknown, at: string) {
  if (!isRecord(rule)) return `${at} must be an object`;
  const unknown = Object.keys(rule).find((key) => !RULE_KEYS.includes(key));
  if (unknown) return `${at} has unsupported key: ${unknown}`;
  const matchers = ["paths", "linesOver", "trigger"].filter((key) => rule[key] !== undefined);
  if (matchers.length !== 1) return `${at} must match by exactly one of paths, linesOver or trigger`;
  if (
    rule.paths !== undefined &&
    (!Array.isArray(rule.paths) ||
      rule.paths.length === 0 ||
      rule.paths.some((path) => typeof path !== "string" || !path.trim()))
  )
    return `${at}.paths must be a non-empty list of path globs`;
  if (rule.linesOver !== undefined && !(Number.isInteger(rule.linesOver) && (rule.linesOver as number) >= 0))
    return `${at}.linesOver must be a whole number of changed lines`;
  if (rule.trigger !== undefined && !(REVIEW_BUILTINS as readonly unknown[]).includes(rule.trigger))
    return `${at}.trigger must be one of ${oneOf(REVIEW_BUILTINS)}`;
  if (!(REVIEW_DEPTHS as readonly unknown[]).includes(rule.depth))
    return `${at}.depth must be one of ${oneOf(REVIEW_DEPTHS)}`;
  if (rule.tier !== undefined && !(REVIEW_TIERS as readonly unknown[]).includes(rule.tier))
    return `${at}.tier must be one of ${oneOf(REVIEW_TIERS)}`;
  if (rule.humans !== undefined && !(Number.isInteger(rule.humans) && (rule.humans as number) >= 0))
    return `${at}.humans must be a whole number`;
  return null;
}

/** The repository's depth rules, `review.depth`; null when valid, else the key and the reason. */
export function validateReviewDepth(value: unknown) {
  if (!isRecord(value)) return "review.depth must be an object";
  const unknown = Object.keys(value).find((key) => !DEPTH_KEYS.includes(key));
  if (unknown) return `review.depth has unsupported key: ${unknown}`;
  if (value.default !== undefined && !(REVIEW_DEPTHS as readonly unknown[]).includes(value.default))
    return `review.depth.default must be one of ${oneOf(REVIEW_DEPTHS)}`;
  if (value.rules !== undefined) {
    if (!Array.isArray(value.rules)) return "review.depth.rules must be a list";
    for (const [index, rule] of value.rules.entries()) {
      const error = validateReviewRule(rule, `review.depth.rules[${index}]`);
      if (error) return error;
    }
  }
  if (value.builtins !== undefined) {
    if (!isRecord(value.builtins)) return "review.depth.builtins must be an object";
    for (const [name, depth] of Object.entries(value.builtins)) {
      if (!(REVIEW_BUILTINS as readonly string[]).includes(name))
        return `review.depth.builtins has unknown trigger: ${name}; the built-ins are ${oneOf(REVIEW_BUILTINS)}`;
      if (![...REVIEW_DEPTHS, "off"].includes(depth as string))
        return `review.depth.builtins.${name} must be one of ${oneOf([...REVIEW_DEPTHS, "off"])}`;
    }
  }
  return null;
}

/**
 * The `review` block in one scope. `depth` is accepted only in the repository's file; `review.mode`, replaced by
 * `review.unit` with no migration (nothing using it was released), is refused with a message naming its replacement.
 */
export function validateReviewConfig(value: unknown, scope: "repository" | "personal" = "repository") {
  if (!isRecord(value)) return "review must be an object";
  if (value.mode !== undefined)
    return `review.mode is replaced by review.unit (${oneOf(REVIEW_UNITS)}): a review runs at every unit, and "manual" proposes it and waits for a yes`;
  const unknown = Object.keys(value).find((key) => !(REVIEW_KEYS as readonly string[]).includes(key));
  if (unknown) return `review has unsupported key: ${unknown}`;
  if (value.unit !== undefined && !(REVIEW_UNITS as readonly unknown[]).includes(value.unit))
    return `review.unit must be one of ${oneOf(REVIEW_UNITS)}`;
  // The model is shown to the agent in the Runtime State, so it must fit on one line in a code span.
  if (
    value.model !== undefined &&
    (typeof value.model !== "string" || !value.model.trim() || /[\p{Cc}`]/u.test(value.model))
  )
    return "review.model must be auto or a non-empty model name on one line";
  if (value.rounds !== undefined && !(REVIEW_ROUNDS as readonly unknown[]).includes(value.rounds))
    return `review.rounds must be one of ${oneOf(REVIEW_ROUNDS)}`;
  if (value.depth !== undefined) {
    if (scope !== "repository")
      return "review.depth is Repository scope only: review-plan reads it from .freeflow/config.json at the base commit, so a change never supplies the policy that reviews it";
    return validateReviewDepth(value.depth);
  }
  return null;
}

/** Review settings for two valid config layers: the personal layer overrides the repository's, field by field. */
export function resolveReviewSettings(repository: unknown, local: unknown): ReviewSettings {
  const layer = (config: any) => (isRecord(config?.review) ? config.review : {});
  const [shared, personal] = [layer(repository), layer(local)];
  return {
    unit: personal.unit ?? shared.unit ?? REVIEW_DEFAULTS.unit,
    model: personal.model ?? shared.model ?? REVIEW_DEFAULTS.model,
    rounds: personal.rounds ?? shared.rounds ?? REVIEW_DEFAULTS.rounds,
  };
}

/** The Runtime State line for the user's review choice; none for the defaults (unit `pr`, model `auto`, 3 rounds). */
export function reviewStateLine(review: Partial<ReviewSettings> | undefined): string | null {
  const unit = review?.unit ?? REVIEW_DEFAULTS.unit;
  const model = review?.model ?? REVIEW_DEFAULTS.model;
  const rounds = review?.rounds ?? REVIEW_DEFAULTS.rounds;
  if (unit === REVIEW_DEFAULTS.unit && model === REVIEW_DEFAULTS.model && rounds === REVIEW_DEFAULTS.rounds)
    return null;
  return `Review: unit \`${unit}\`, model \`${model}\`${rounds === REVIEW_DEFAULTS.rounds ? "" : `, up to Review ${rounds}`}`;
}

/** The keys `cognitiveRouting` accepts; the settings test checks each has a /freeflow settings row. */
export const COGNITIVE_ROUTING_KEYS = ["enabled", "delegation", "projection", "profiles"] as const;

/**
 * Whether a `cognitiveRouting` section is valid, with the messages Pi's routing gives (cognitive-routing/config.ts
 * throws them): one check for Pi and for the hooks, which before checked nothing here.
 */
export function validateCognitiveRoutingConfig(value: unknown): string | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !(COGNITIVE_ROUTING_KEYS as readonly string[]).includes(key))
  )
    return "Routing requires the enabled/delegation/projection/profiles schema; experimental legacy configuration is not migrated.";
  for (const key of ["enabled", "projection"])
    if (value[key] !== undefined && typeof value[key] !== "boolean") return `${key} must be boolean.`;
  if (value.delegation !== undefined && !(DELEGATION_MODES as readonly unknown[]).includes(value.delegation))
    return "delegation must be executor, helper, or both.";
  if (value.profiles !== undefined) {
    if (
      !isRecord(value.profiles) ||
      Object.keys(value.profiles).some((key) => !(PROFILES as readonly string[]).includes(key))
    )
      return "Profiles must be coordinator, helper, or executor.";
    for (const profile of Object.values(value.profiles) as any[])
      if (
        !isRecord(profile) ||
        Object.keys(profile).some((key) => !["provider", "model", "thinking"].includes(key)) ||
        typeof profile.provider !== "string" ||
        !profile.provider.trim() ||
        typeof profile.model !== "string" ||
        !profile.model.trim() ||
        !(EFFORTS as readonly unknown[]).includes(profile.thinking)
      )
        return "Each profile requires provider, model, and supported thinking.";
  }
  return null;
}

/** Where a setting can live: the repository's file, the personal file, or the running session. */
export type SettingScope = "repository" | "personal" | "session";
export type SettingValue = boolean | string | number;
/**
 * One setting Freeflow acts on. `values` is `boolean`, a list of choices, `name` (one line of text, such as a model) or
 * `profile` (a routing profile object, set only on Pi's screen); `default` is `null` when unset means none; `hosts` is
 * `all` when every host acts on it and `pi` when only Pi does; `session` says whether the Session scope holds it as a key
 * (routing's delegation and profiles have their own session controller on Pi).
 */
export type SettingSpec = {
  key: string;
  label: string;
  /** `policy` is an object edited in the file (review.depth), with no row on a screen or in the settings script. */
  values: "boolean" | "name" | "profile" | "policy" | readonly string[] | readonly number[];
  default: SettingValue | null;
  hosts: "all" | "pi";
  session: boolean;
};

const PROMPT_LABELS: Record<(typeof RUNTIME_PROMPTS)[number], string> = {
  core: "Core prompt",
  interactionContract: "Interaction Contract",
  workingMethod: "Working Method",
};

/**
 * Every setting Freeflow acts on, once: the validators' keys, Pi's Session keys, the defaults a repository write drops,
 * the settings script and the settings test read this table. The settings doc and Pi's screen each have a row per key,
 * which the settings test checks.
 */
export const SETTINGS: readonly SettingSpec[] = [
  { key: "enabled", label: "Freeflow", values: "boolean", default: true, hosts: "all", session: true },
  { key: "prompts.enabled", label: "Runtime prompts", values: "boolean", default: true, hosts: "all", session: true },
  ...RUNTIME_PROMPTS.map((prompt) => ({
    key: `prompts.${prompt}`,
    label: PROMPT_LABELS[prompt],
    values: "boolean" as const,
    default: true,
    hosts: "all" as const,
    session: true,
  })),
  { key: "skills.enabled", label: "Skills", values: "boolean", default: true, hosts: "all", session: true },
  ...SWITCHABLE_SKILLS.map((skill) => ({
    key: `skills.${skill}`,
    label: `Skill ${skill}`,
    values: "boolean" as const,
    default: true,
    hosts: "all" as const,
    session: true,
  })),
  { key: "events.enabled", label: "Event log", values: "boolean", default: true, hosts: "all", session: true },
  { key: "review.unit", label: "Review unit", values: REVIEW_UNITS, default: "pr", hosts: "all", session: true },
  { key: "review.model", label: "Reviewer model", values: "name", default: "auto", hosts: "all", session: true },
  { key: "review.rounds", label: "Review rounds", values: REVIEW_ROUNDS, default: 3, hosts: "all", session: true },
  { key: "review.depth", label: "Review depth rules", values: "policy", default: null, hosts: "all", session: false },
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
    label: `${profile[0]!.toUpperCase()}${profile.slice(1)} preset`,
    values: "profile" as const,
    default: null,
    hosts: "pi" as const,
    session: false,
  })),
];

/** The table's row for a dotted key, or undefined. */
export function settingSpec(key: string): SettingSpec | undefined {
  return SETTINGS.find((spec) => spec.key === key);
}

/** Whether `value` is one `spec` accepts; a profile is checked by the routing validator, not here. */
export function validSettingValue(spec: SettingSpec, value: unknown): value is SettingValue {
  if (spec.values === "boolean") return typeof value === "boolean";
  if (spec.values === "name") return typeof value === "string" && value.trim() !== "" && !/[\p{Cc}`]/u.test(value);
  if (spec.values === "profile" || spec.values === "policy") return false;
  return (spec.values as readonly unknown[]).includes(value);
}

/** The schema version a file may name as `"v"`; nothing writes it yet, so an older Freeflow still reads the file. */
export const CONFIG_VERSION = 1;

function validateVersion(value: ConfigObject) {
  return value.v === undefined || value.v === CONFIG_VERSION ? null : `v must be ${CONFIG_VERSION}`;
}

function removedContextConfigError(value: ConfigObject, filePath: string) {
  const removedKeys = ["contextVirtualization", "conversationHistory"].filter((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
  return removedKeys.length > 0
    ? `Removed Freeflow context setting(s) in ${filePath}: ${removedKeys.join(", ")}. Delete those keys before using Freeflow.`
    : null;
}

function validateCoreConfigFields(value: ConfigObject) {
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
] as const;

// outputRouter, observedRouting, scriptTransform and taskMemory belong to retired features; they are accepted and
// ignored so existing configs keep loading, and /freeflow status says Task Memory is gone (P6).
const RETIRED_SECTIONS = ["outputRouter", "observedRouting", "scriptTransform", "taskMemory"];

export function validateRepositoryConfig(value: unknown): string | null {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }

  const removedContextError = removedContextConfigError(value, ".freeflow/config.json");
  if (removedContextError) return removedContextError;

  const allowedKeys = new Set<string>(["v", ...CONFIG_SECTIONS, ...RETIRED_SECTIONS]);
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
  if (value.review !== undefined) return validateReviewConfig(value.review, "repository");

  return null;
}

export function validateLocalConfig(value: unknown): string | null {
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
  if (value.review !== undefined) return validateReviewConfig(value.review, "personal");
  return null;
}

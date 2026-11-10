import { validateCompactionConfig } from "../compaction/config.js";
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
 * Freeflow's pane and status line on Claude Code (SPEC-015): whether the mod keeps them, each on unless a config turns
 * it off. Only Claude Code's mod acts on them; Pi's footer already shows the held task.
 */
export const PANE_KEYS = ["enabled", "statusLine"];
function validatePaneConfig(value) {
  if (!isRecord(value)) return "pane must be an object";
  const unknown = Object.keys(value).find((key) => !PANE_KEYS.includes(key));
  if (unknown) return `pane has unsupported key: ${unknown}`;
  for (const key of PANE_KEYS)
    if (value[key] !== undefined && typeof value[key] !== "boolean") return `pane.${key} must be a boolean`;
  return null;
}
/**
 * The gates (SPEC-008 4.5): each of the four is `off`, `warn` (the default: the agent reads a warning, the event log
 * counts it) or `block` (a refusal, or for delivery a question where someone can answer), on every host with a Freeflow
 * driver. Track Work's `lib/gates5.mjs` decides; the drivers read these values.
 */
export const GATE_KEYS = ["agreement", "slice", "delivery", "delegation"];
export const GATE_MODES = ["off", "warn", "block"];
function validateGatesConfig(value) {
  if (!isRecord(value)) return "gates must be an object";
  const unknown = Object.keys(value).find((key) => !GATE_KEYS.includes(key));
  if (unknown) return `gates has unsupported key: ${unknown}`;
  for (const key of GATE_KEYS)
    if (value[key] !== undefined && !GATE_MODES.includes(value[key]))
      return `gates.${key} must be one of ${GATE_MODES.join(", ")}`;
  return null;
}
/** Each gate's mode for two valid config layers: the personal layer overrides the repository's, gate by gate. */
export function resolveGateSettings(repository, local) {
  const layer = (config) => (isRecord(config?.gates) ? config.gates : {});
  const [shared, personal] = [layer(repository), layer(local)];
  return Object.fromEntries(GATE_KEYS.map((key) => [key, personal[key] ?? shared[key] ?? "warn"]));
}
/**
 * Delegation across sessions (SPEC-009 4.7): how long a claim on paths lasts, in hours (`claimHours`, one of a few
 * choices, default 4), and whether a delegation the coordinator waits on wakes its idle session when it comes back
 * (`wakeOnReturn`, on by default). Every driver reads them; Track Work's claim takes the hours from the driver.
 */
export const DELEGATION_KEYS = ["claimHours", "wakeOnReturn"];
export const CLAIM_HOURS = ["1", "2", "4", "8", "24"];
function validateDelegationConfig(value) {
  if (!isRecord(value)) return "delegation must be an object";
  const unknown = Object.keys(value).find((key) => !DELEGATION_KEYS.includes(key));
  if (unknown) return `delegation has unsupported key: ${unknown}`;
  if (value.claimHours !== undefined && !CLAIM_HOURS.includes(value.claimHours))
    return `delegation.claimHours must be one of ${CLAIM_HOURS.join(", ")}`;
  if (value.wakeOnReturn !== undefined && typeof value.wakeOnReturn !== "boolean")
    return "delegation.wakeOnReturn must be a boolean";
  return null;
}
/** Delegation's settings for two valid config layers: the personal layer overrides the repository's, key by key. */
export function resolveDelegationSettings(repository, local) {
  const layer = (config) => (isRecord(config?.delegation) ? config.delegation : {});
  const [shared, personal] = [layer(repository), layer(local)];
  return {
    claimHours: personal.claimHours ?? shared.claimHours ?? "4",
    wakeOnReturn: personal.wakeOnReturn ?? shared.wakeOnReturn ?? true,
  };
}
/**
 * How Review Work reviews finished work (SPEC-007). `unit` says when a review runs: at every pull request by default,
 * at a push, a commit or an agreement's Return, or `manual` (proposed with its plan and cost, run after a yes). `model`
 * is the reviewer's model, `auto` choosing the cheapest capable one; `rounds` caps Review 1, 2, 3. `depth` holds the
 * project's rules for how deep a review goes; it is Repository scope only, read from the base commit by
 * `review-plan.mjs`, so a change never supplies the policy that reviews it.
 */
export const REVIEW_UNITS = ["pr", "push", "commit", "agreement", "manual"];
export const REVIEW_ROUNDS = [1, 2, 3];
export const REVIEW_DEPTHS = ["quick", "standard", "deep"];
export const REVIEW_TIERS = ["standard", "security"];
/** The built-in triggers `review-plan.mjs` evaluates (skills/review-work/scripts/lib/triggers.mjs). */
export const REVIEW_BUILTINS = ["security", "data", "ci", "public interface"];
export const REVIEW_KEYS = ["unit", "model", "rounds", "depth"];
export const REVIEW_DEFAULTS = { unit: "pr", model: "auto", rounds: 3 };
const DEPTH_KEYS = ["default", "rules", "builtins"];
const RULE_KEYS = ["paths", "linesOver", "trigger", "depth", "tier", "humans"];
const oneOf = (values) => values.map(String).join(", ");
function validateReviewRule(rule, at) {
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
  if (rule.linesOver !== undefined && !(Number.isInteger(rule.linesOver) && rule.linesOver >= 0))
    return `${at}.linesOver must be a whole number of changed lines`;
  if (rule.trigger !== undefined && !REVIEW_BUILTINS.includes(rule.trigger))
    return `${at}.trigger must be one of ${oneOf(REVIEW_BUILTINS)}`;
  if (!REVIEW_DEPTHS.includes(rule.depth)) return `${at}.depth must be one of ${oneOf(REVIEW_DEPTHS)}`;
  if (rule.tier !== undefined && !REVIEW_TIERS.includes(rule.tier))
    return `${at}.tier must be one of ${oneOf(REVIEW_TIERS)}`;
  if (rule.humans !== undefined && !(Number.isInteger(rule.humans) && rule.humans >= 0))
    return `${at}.humans must be a whole number`;
  return null;
}
/** The repository's depth rules, `review.depth`; null when valid, else the key and the reason. */
export function validateReviewDepth(value) {
  if (!isRecord(value)) return "review.depth must be an object";
  const unknown = Object.keys(value).find((key) => !DEPTH_KEYS.includes(key));
  if (unknown) return `review.depth has unsupported key: ${unknown}`;
  if (value.default !== undefined && !REVIEW_DEPTHS.includes(value.default))
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
      if (!REVIEW_BUILTINS.includes(name))
        return `review.depth.builtins has unknown trigger: ${name}; the built-ins are ${oneOf(REVIEW_BUILTINS)}`;
      if (![...REVIEW_DEPTHS, "off"].includes(depth))
        return `review.depth.builtins.${name} must be one of ${oneOf([...REVIEW_DEPTHS, "off"])}`;
    }
  }
  return null;
}
/**
 * The `review` block in one scope. `depth` is accepted only in the repository's file; `review.mode`, replaced by
 * `review.unit` with no migration (nothing using it was released), is refused with a message naming its replacement.
 */
export function validateReviewConfig(value, scope = "repository") {
  if (!isRecord(value)) return "review must be an object";
  if (value.mode !== undefined)
    return `review.mode is replaced by review.unit (${oneOf(REVIEW_UNITS)}): a review runs at every unit, and "manual" proposes it and waits for a yes`;
  const unknown = Object.keys(value).find((key) => !REVIEW_KEYS.includes(key));
  if (unknown) return `review has unsupported key: ${unknown}`;
  if (value.unit !== undefined && !REVIEW_UNITS.includes(value.unit))
    return `review.unit must be one of ${oneOf(REVIEW_UNITS)}`;
  // The model is shown to the agent in the Runtime State, so it must fit on one line in a code span.
  if (
    value.model !== undefined &&
    (typeof value.model !== "string" || !value.model.trim() || /[\p{Cc}`]/u.test(value.model))
  )
    return "review.model must be auto or a non-empty model name on one line";
  if (value.rounds !== undefined && !REVIEW_ROUNDS.includes(value.rounds))
    return `review.rounds must be one of ${oneOf(REVIEW_ROUNDS)}`;
  if (value.depth !== undefined) {
    if (scope !== "repository")
      return "review.depth is Repository scope only: review-plan reads it from .freeflow/config.json at the base commit, so a change never supplies the policy that reviews it";
    return validateReviewDepth(value.depth);
  }
  return null;
}
/** Review settings for two valid config layers: the personal layer overrides the repository's, field by field. */
export function resolveReviewSettings(repository, local) {
  const layer = (config) => (isRecord(config?.review) ? config.review : {});
  const [shared, personal] = [layer(repository), layer(local)];
  return {
    unit: personal.unit ?? shared.unit ?? REVIEW_DEFAULTS.unit,
    model: personal.model ?? shared.model ?? REVIEW_DEFAULTS.model,
    rounds: personal.rounds ?? shared.rounds ?? REVIEW_DEFAULTS.rounds,
  };
}
/**
 * The cost governor (SPEC-014, section 2.3), on Claude Code: `mode` warn (the default) only notifies at a cap, stop
 * also asks the agent to stop at the next safe point, checkpoint and ask the user; `cap` replaces the governor's own
 * caps with one number, a percent of the seven-day window on a subscription or dollars of the task's cost elsewhere.
 */
export const GOVERNOR_MODES = ["warn", "stop"];
export const GOVERNOR_KEYS = ["mode", "cap"];
function validateGovernorConfig(value) {
  if (!isRecord(value)) return "governor must be an object";
  const unknown = Object.keys(value).find((key) => !GOVERNOR_KEYS.includes(key));
  if (unknown) return `governor has unsupported key: ${unknown}`;
  if (value.mode !== undefined && !GOVERNOR_MODES.includes(value.mode))
    return `governor.mode must be one of ${GOVERNOR_MODES.join(", ")}`;
  if (value.cap !== undefined && !positiveNumber(value.cap)) return "governor.cap must be a number above 0";
  return null;
}
const positiveNumber = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
/** The Runtime State line for the user's review choice; none for the defaults (unit `pr`, model `auto`, 3 rounds). */
export function reviewStateLine(review) {
  const unit = review?.unit ?? REVIEW_DEFAULTS.unit;
  const model = review?.model ?? REVIEW_DEFAULTS.model;
  const rounds = review?.rounds ?? REVIEW_DEFAULTS.rounds;
  if (unit === REVIEW_DEFAULTS.unit && model === REVIEW_DEFAULTS.model && rounds === REVIEW_DEFAULTS.rounds)
    return null;
  return `Review: unit \`${unit}\`, model \`${model}\`${rounds === REVIEW_DEFAULTS.rounds ? "" : `, up to Review ${rounds}`}`;
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
  // The gates (SPEC-008 4.5).
  { key: "gates.agreement", label: "Agreement gate", values: GATE_MODES, default: "warn", hosts: "all", session: true },
  { key: "gates.slice", label: "Slice gate", values: GATE_MODES, default: "warn", hosts: "all", session: true },
  { key: "gates.delivery", label: "Delivery gate", values: GATE_MODES, default: "warn", hosts: "all", session: true },
  {
    key: "gates.delegation",
    label: "Delegation gate",
    values: GATE_MODES,
    default: "warn",
    hosts: "all",
    session: true,
  },
  // Delegation across sessions (SPEC-009 4.7).
  {
    key: "delegation.claimHours",
    label: "Claim hours",
    values: CLAIM_HOURS,
    default: "4",
    hosts: "all",
    session: true,
  },
  {
    key: "delegation.wakeOnReturn",
    label: "Wake on return",
    values: "boolean",
    default: true,
    hosts: "all",
    session: true,
  },
  { key: "review.unit", label: "Review unit", values: REVIEW_UNITS, default: "pr", hosts: "all", session: true },
  { key: "review.model", label: "Reviewer model", values: "name", default: "auto", hosts: "all", session: true },
  { key: "review.rounds", label: "Review rounds", values: REVIEW_ROUNDS, default: 3, hosts: "all", session: true },
  { key: "review.depth", label: "Review depth rules", values: "policy", default: null, hosts: "all", session: false },
  {
    key: "governor.mode",
    label: "Cost governor",
    values: GOVERNOR_MODES,
    default: "warn",
    hosts: "claude-code",
    session: true,
  },
  { key: "governor.cap", label: "Cost cap", values: "number", default: null, hosts: "claude-code", session: true },
  { key: "pane.enabled", label: "Pane", values: "boolean", default: true, hosts: "claude-code", session: true },
  {
    key: "pane.statusLine",
    label: "Status line",
    values: "boolean",
    default: true,
    hosts: "claude-code",
    session: true,
  },
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
];
/** The table's row for a dotted key, or undefined. */
export function settingSpec(key) {
  return SETTINGS.find((spec) => spec.key === key);
}
/** Whether `value` is one `spec` accepts. */
export function validSettingValue(spec, value) {
  if (spec.values === "boolean") return typeof value === "boolean";
  if (spec.values === "name") return typeof value === "string" && value.trim() !== "" && !/[\p{Cc}`]/u.test(value);
  if (spec.values === "number") return positiveNumber(value);
  if (spec.values === "policy") return false;
  return spec.values.includes(value);
}
/** The schema version a file may name as `"v"`; nothing writes it yet, so an older Freeflow still reads the file. */
export const CONFIG_VERSION = 1;
function validateVersion(value) {
  return value.v === undefined || value.v === CONFIG_VERSION ? null : `v must be ${CONFIG_VERSION}`;
}
// Freeflow's removed context settings: refused by name in a file, and ignored (with the same reason) by the sanitizer.
const REMOVED_CONTEXT_KEYS = ["contextVirtualization", "conversationHistory"];
function removedContextConfigError(value, filePath) {
  const removedKeys = REMOVED_CONTEXT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  return removedKeys.length > 0
    ? `Removed Freeflow context setting(s) in ${filePath}: ${removedKeys.join(", ")}. Delete those keys before using Freeflow.`
    : null;
}
// Removed features whose key is refused, saying what to do, rather than accepted and ignored as RETIRED_SECTIONS are.
const REMOVED_FEATURES = { cognitiveRouting: "Cognitive Routing" };
function removedFeatureError(key, filePath) {
  const feature = REMOVED_FEATURES[key];
  return feature ? `${feature} was removed from Freeflow: delete the ${key} key from ${filePath}.` : null;
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
  "toolExecution",
  "compaction",
  "messaging",
  "prompts",
  "review",
  "skills",
  "events",
  "gates",
  "delegation",
  "governor",
  "pane",
];
// outputRouter, observedRouting, scriptTransform and taskMemory belong to retired features; they are accepted and
// ignored so existing configs keep loading, and /freeflow status says Task Memory is gone (P6).
const RETIRED_SECTIONS = ["outputRouter", "observedRouting", "scriptTransform", "taskMemory"];
// The personal file's top-level keys. processing and taskMemory belong to retired features; they are accepted and
// ignored so existing local configs keep loading.
const LOCAL_KEYS = [
  "v",
  "enabled",
  "processing",
  "toolExecution",
  "compaction",
  "taskMemory",
  "messaging",
  "prompts",
  "review",
  "skills",
  "events",
  "gates",
  "delegation",
  "governor",
  "pane",
];
export function validateRepositoryConfig(value) {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }
  const removedContextError = removedContextConfigError(value, ".freeflow/config.json");
  if (removedContextError) return removedContextError;
  const allowedKeys = new Set(["v", ...CONFIG_SECTIONS, ...RETIRED_SECTIONS]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return removedFeatureError(key, ".freeflow/config.json") ?? `unsupported top-level config key: ${key}`;
    }
  }
  const coreError = validateCoreConfigFields(value) ?? validateVersion(value);
  if (coreError) return coreError;
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
  if (value.gates !== undefined) {
    const error = validateGatesConfig(value.gates);
    if (error) return error;
  }
  if (value.delegation !== undefined) {
    const error = validateDelegationConfig(value.delegation);
    if (error) return error;
  }
  if (value.pane !== undefined) {
    const error = validatePaneConfig(value.pane);
    if (error) return error;
  }
  if (value.governor !== undefined) {
    const error = validateGovernorConfig(value.governor);
    if (error) return error;
  }
  if (value.review !== undefined) return validateReviewConfig(value.review, "repository");
  return null;
}
export function validateLocalConfig(value) {
  if (!isRecord(value)) {
    return "local config must be a JSON object";
  }
  const removedContextError = removedContextConfigError(value, ".freeflow/local.json");
  if (removedContextError) return removedContextError;
  const allowedKeys = new Set(LOCAL_KEYS);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return removedFeatureError(key, ".freeflow/local.json") ?? `unsupported top-level local config key: ${key}`;
    }
  }
  const coreError = validateCoreConfigFields(value) ?? validateVersion(value);
  if (coreError) return coreError;
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
  if (value.gates !== undefined) {
    const error = validateGatesConfig(value.gates);
    if (error) return error;
  }
  if (value.delegation !== undefined) {
    const error = validateDelegationConfig(value.delegation);
    if (error) return error;
  }
  if (value.pane !== undefined) {
    const error = validatePaneConfig(value.pane);
    if (error) return error;
  }
  if (value.governor !== undefined) {
    const error = validateGovernorConfig(value.governor);
    if (error) return error;
  }
  if (value.review !== undefined) return validateReviewConfig(value.review, "personal");
  return null;
}
/** The validator of each top-level section, for one scope; a section's leaves are checked one by one. */
function sectionValidator(section, scope) {
  switch (section) {
    case "toolExecution":
      return validateToolExecutionConfig;
    case "compaction":
      return validateCompactionConfig;
    case "messaging":
      return validateMessagingConfig;
    case "prompts":
      return validatePromptsConfig;
    case "skills":
      return validateSkillsConfig;
    case "events":
      return validateEventsConfig;
    case "gates":
      return validateGatesConfig;
    case "delegation":
      return validateDelegationConfig;
    case "pane":
      return validatePaneConfig;
    case "governor":
      return validateGovernorConfig;
    case "review":
      return (value) => validateReviewConfig(value, scope);
    default:
      return null;
  }
}
/**
 * One section of a config file, checked leaf by leaf: a leaf its validator refuses is ignored and named; a section
 * that is still invalid without those leaves is ignored whole and named.
 */
function sanitizeSection(section, value, validate) {
  const whole = validate(value);
  if (whole === null) return { value, ignored: [] };
  if (!isRecord(value)) return { ignored: [{ key: section, reason: whole }] };
  const kept = {};
  const ignored = [];
  for (const [leaf, leafValue] of Object.entries(value)) {
    const reason = validate({ [leaf]: leafValue });
    if (reason === null) kept[leaf] = leafValue;
    else ignored.push({ key: `${section}.${leaf}`, reason });
  }
  const left = validate(kept);
  if (left !== null) return { ignored: [{ key: section, reason: left }] };
  return { value: kept, ignored };
}
/**
 * The settings a config file keeps, and the ones it ignores, for one scope. A key unknown to the scope, a removed
 * key, and a value wrong for a known key are ignored and named; what is left is valid. Used by every host and by
 * settings.mjs, so one file gives one answer everywhere.
 */
export function sanitizeConfigFile(value, scope) {
  if (!isRecord(value)) return { config: {}, ignored: [{ key: null, reason: "the file must hold a JSON object" }] };
  const allowed = new Set(scope === "repository" ? ["v", ...CONFIG_SECTIONS, ...RETIRED_SECTIONS] : LOCAL_KEYS);
  const config = {};
  const ignored = [];
  for (const [key, entry] of Object.entries(value)) {
    if (REMOVED_CONTEXT_KEYS.includes(key)) {
      ignored.push({ key, reason: `removed Freeflow context setting: delete this key` });
    } else if (REMOVED_FEATURES[key]) {
      ignored.push({ key, reason: `${REMOVED_FEATURES[key]} was removed from Freeflow` });
    } else if (!allowed.has(key)) {
      ignored.push({ key, reason: "unsupported key" });
    } else if (key === "v") {
      if (entry === undefined || entry === CONFIG_VERSION) config.v = entry;
      else ignored.push({ key, reason: `v must be ${CONFIG_VERSION}` });
    } else if (key === "enabled") {
      if (typeof entry === "boolean") config.enabled = entry;
      else ignored.push({ key, reason: "enabled must be a boolean" });
    } else if (RETIRED_SECTIONS.includes(key) || key === "processing") {
      config[key] = entry;
    } else {
      const validate = sectionValidator(key, scope);
      if (!validate) {
        config[key] = entry;
        continue;
      }
      const section = sanitizeSection(key, entry, validate);
      if (section.value !== undefined) config[key] = section.value;
      ignored.push(...section.ignored);
    }
  }
  return { config, ignored };
}
/** The Runtime State line for ignored settings, or null when none. Every host shows this one line. */
export function ignoredStateLine(ignored) {
  if (ignored.length === 0) return null;
  const items = ignored.map(
    (item) => `${item.file ? `${item.file} ` : ""}${item.key ?? "(whole file)"}: ${item.reason}`,
  );
  return `Settings ignored: ${items.join("; ")}. Run \`settings.mjs doctor\` to see the fix.`;
}

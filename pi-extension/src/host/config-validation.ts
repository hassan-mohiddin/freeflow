import { validateCompactionConfig } from "../compaction/config.js";
import { INBOUND_POLICIES, validateMessagingConfig } from "../messaging/config.js";
import { validateToolExecutionConfig } from "../tool-execution/config.js";
import { FREEFLOW_MODEL_SKILL_NAMES } from "./catalog.js";

/**
 * Whether a Freeflow config file is valid: one answer for Pi and for the session-start hooks of the other hosts, which
 * import the built file. Also how the settings every host reads, `prompts` and `skills`, layer. Keep this module and its
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
 * Freeflow's pane and status line on Claude Code (SPEC-015): whether the mod keeps them, each on unless a config turns
 * it off. Only Claude Code's mod acts on them; Pi's footer already shows the held task.
 */
export const PANE_KEYS = ["enabled", "statusLine"] as const;

function validatePaneConfig(value: unknown) {
  if (!isRecord(value)) return "pane must be an object";
  const unknown = Object.keys(value).find((key) => !(PANE_KEYS as readonly string[]).includes(key));
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
export const GATE_KEYS = ["agreement", "slice", "delivery", "delegation"] as const;
export const GATE_MODES = ["off", "warn", "block"] as const;
export type GateSettings = Record<(typeof GATE_KEYS)[number], (typeof GATE_MODES)[number]>;

function validateGatesConfig(value: unknown) {
  if (!isRecord(value)) return "gates must be an object";
  const unknown = Object.keys(value).find((key) => !(GATE_KEYS as readonly string[]).includes(key));
  if (unknown) return `gates has unsupported key: ${unknown}`;
  for (const key of GATE_KEYS)
    if (value[key] !== undefined && !(GATE_MODES as readonly unknown[]).includes(value[key]))
      return `gates.${key} must be one of ${GATE_MODES.join(", ")}`;
  return null;
}

/** Each gate's mode for two valid config layers: the personal layer overrides the repository's, gate by gate. */
export function resolveGateSettings(repository: unknown, local: unknown): GateSettings {
  const layer = (config: any) => (isRecord(config?.gates) ? config.gates : {});
  const [shared, personal] = [layer(repository), layer(local)];
  return Object.fromEntries(GATE_KEYS.map((key) => [key, personal[key] ?? shared[key] ?? "warn"])) as GateSettings;
}

/**
 * Delegation across sessions (SPEC-009 4.7): how long a claim on paths lasts, in hours (`claimHours`, one of a few
 * choices, default 4), and whether a delegation the coordinator waits on wakes its idle session when it comes back
 * (`wakeOnReturn`, on by default). Every driver reads them; Track Work's claim takes the hours from the driver.
 */
export const DELEGATION_KEYS = ["claimHours", "wakeOnReturn"] as const;
export const CLAIM_HOURS = ["1", "2", "4", "8", "24"] as const;
export type DelegationSettings = { claimHours: (typeof CLAIM_HOURS)[number]; wakeOnReturn: boolean };

function validateDelegationConfig(value: unknown) {
  if (!isRecord(value)) return "delegation must be an object";
  const unknown = Object.keys(value).find((key) => !(DELEGATION_KEYS as readonly string[]).includes(key));
  if (unknown) return `delegation has unsupported key: ${unknown}`;
  if (value.claimHours !== undefined && !(CLAIM_HOURS as readonly unknown[]).includes(value.claimHours))
    return `delegation.claimHours must be one of ${CLAIM_HOURS.join(", ")}`;
  if (value.wakeOnReturn !== undefined && typeof value.wakeOnReturn !== "boolean")
    return "delegation.wakeOnReturn must be a boolean";
  return null;
}

/** Delegation's settings for two valid config layers: the personal layer overrides the repository's, key by key. */
export function resolveDelegationSettings(repository: unknown, local: unknown): DelegationSettings {
  const layer = (config: any) => (isRecord(config?.delegation) ? config.delegation : {});
  const [shared, personal] = [layer(repository), layer(local)];
  return {
    claimHours: personal.claimHours ?? shared.claimHours ?? "4",
    wakeOnReturn: personal.wakeOnReturn ?? shared.wakeOnReturn ?? true,
  };
}

/**
 * The cost governor (SPEC-014, section 2.3), on Claude Code: `mode` warn (the default) only notifies at a cap, stop
 * also asks the agent to stop at the next safe point, checkpoint and ask the user; `cap` replaces the governor's own
 * caps with one number, a percent of the seven-day window on a subscription or dollars of the task's cost elsewhere.
 */
export const GOVERNOR_MODES = ["warn", "stop"] as const;
export const GOVERNOR_KEYS = ["mode", "cap"] as const;

function validateGovernorConfig(value: unknown) {
  if (!isRecord(value)) return "governor must be an object";
  const unknown = Object.keys(value).find((key) => !(GOVERNOR_KEYS as readonly string[]).includes(key));
  if (unknown) return `governor has unsupported key: ${unknown}`;
  if (value.mode !== undefined && !(GOVERNOR_MODES as readonly unknown[]).includes(value.mode))
    return `governor.mode must be one of ${GOVERNOR_MODES.join(", ")}`;
  if (value.cap !== undefined && !positiveNumber(value.cap)) return "governor.cap must be a number above 0";
  return null;
}

const positiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Where a setting can live: the repository's file, the personal file, or the running session. */
export type SettingScope = "repository" | "personal" | "session";
export type SettingValue = boolean | string | number;
/**
 * One setting Freeflow acts on. `values` is `boolean`, a list of choices or `number` (above 0); `default` is `null`
 * when unset means none; `hosts` is `all` when every host acts on it, `pi` when
 * only Pi does and `claude-code` when only Claude Code's mod does; `session` says whether the Session scope holds it as
 * a key.
 */
export type SettingSpec = {
  key: string;
  label: string;
  values: "boolean" | "number" | readonly string[];
  default: SettingValue | null;
  hosts: "all" | "pi" | "claude-code";
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
export function settingSpec(key: string): SettingSpec | undefined {
  return SETTINGS.find((spec) => spec.key === key);
}

/** Whether `value` is one `spec` accepts. */
export function validSettingValue(spec: SettingSpec, value: unknown): value is SettingValue {
  if (spec.values === "boolean") return typeof value === "boolean";
  if (spec.values === "number") return positiveNumber(value);
  return (spec.values as readonly unknown[]).includes(value);
}

/** The schema version a file may name as `"v"`; nothing writes it yet, so an older Freeflow still reads the file. */
export const CONFIG_VERSION = 1;

function validateVersion(value: ConfigObject) {
  return value.v === undefined || value.v === CONFIG_VERSION ? null : `v must be ${CONFIG_VERSION}`;
}

// Freeflow's removed context settings: refused by name in a file, and ignored (with the same reason) by the sanitizer.
const REMOVED_CONTEXT_KEYS = ["contextVirtualization", "conversationHistory"];

function removedContextConfigError(value: ConfigObject, filePath: string) {
  const removedKeys = REMOVED_CONTEXT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  return removedKeys.length > 0
    ? `Removed Freeflow context setting(s) in ${filePath}: ${removedKeys.join(", ")}. Delete those keys before using Freeflow.`
    : null;
}

// Removed settings sections: accepted so the file still loads, never acted on, and each key in them named as ignored
// with the reason, so the Runtime State and settings.mjs doctor say what replaced it (a removed key never makes config
// fail, #164).
const REMOVED_SECTIONS: Record<string, string> = {
  review:
    'removed: review has no settings (a "Review at:" line in the project\'s Review Rules or in rules/review.md in the Freeflow home says when a review runs)',
};

/** Why a dotted key is ignored when its section was removed (`review.depth`), or null; the Session scope's check. */
export function removedSettingReason(key: string): string | null {
  return REMOVED_SECTIONS[key.split(".")[0]!] ?? null;
}

/** A removed section's keys as ignored settings: each key it holds, or the section itself when it holds none. */
function removedSectionIgnored(section: string, value: unknown): IgnoredSetting[] {
  const reason = REMOVED_SECTIONS[section]!;
  const keys = isRecord(value) ? Object.keys(value) : [];
  return keys.length ? keys.map((key) => ({ key: `${section}.${key}`, reason })) : [{ key: section, reason }];
}

// Removed features whose key is refused, saying what to do, rather than accepted and ignored as RETIRED_SECTIONS are.
const REMOVED_FEATURES: Record<string, string> = { cognitiveRouting: "Cognitive Routing" };

function removedFeatureError(key: string, filePath: string) {
  const feature = REMOVED_FEATURES[key];
  return feature ? `${feature} was removed from Freeflow: delete the ${key} key from ${filePath}.` : null;
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
  "toolExecution",
  "compaction",
  "messaging",
  "prompts",
  "skills",
  "events",
  "gates",
  "delegation",
  "governor",
  "pane",
] as const;

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
  "skills",
  "events",
  "gates",
  "delegation",
  "governor",
  "pane",
] as const;

export function validateRepositoryConfig(value: unknown): string | null {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }

  const removedContextError = removedContextConfigError(value, ".freeflow/config.json");
  if (removedContextError) return removedContextError;

  const allowedKeys = new Set<string>(["v", ...CONFIG_SECTIONS, ...RETIRED_SECTIONS, ...Object.keys(REMOVED_SECTIONS)]);
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
  return null;
}

export function validateLocalConfig(value: unknown): string | null {
  if (!isRecord(value)) {
    return "local config must be a JSON object";
  }

  const removedContextError = removedContextConfigError(value, ".freeflow/local.json");
  if (removedContextError) return removedContextError;

  const allowedKeys = new Set<string>([...LOCAL_KEYS, ...Object.keys(REMOVED_SECTIONS)]);
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
  return null;
}

/**
 * A setting a config layer ignores, and why: the key (dotted, or null for the whole file) and the reason. Every host
 * keeps the default for an ignored key, or the value the next scope gives it, and says so (SPEC-016, D-045).
 */
export type IgnoredSetting = { key: string | null; reason: string };

/** The validator of each top-level section, for one scope; a section's leaves are checked one by one. */
function sectionValidator(
  section: string,
  scope: "repository" | "personal",
): ((value: unknown) => string | null) | null {
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
    default:
      return null;
  }
}

/**
 * One section of a config file, checked leaf by leaf: a leaf its validator refuses is ignored and named; a section
 * that is still invalid without those leaves is ignored whole and named.
 */
function sanitizeSection(
  section: string,
  value: unknown,
  validate: (value: unknown) => string | null,
): { value?: unknown; ignored: IgnoredSetting[] } {
  const whole = validate(value);
  if (whole === null) return { value, ignored: [] };
  if (!isRecord(value)) return { ignored: [{ key: section, reason: whole }] };
  const kept: ConfigObject = {};
  const ignored: IgnoredSetting[] = [];
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
export function sanitizeConfigFile(
  value: unknown,
  scope: "repository" | "personal",
): { config: ConfigObject; ignored: IgnoredSetting[] } {
  if (!isRecord(value)) return { config: {}, ignored: [{ key: null, reason: "the file must hold a JSON object" }] };
  const allowed = new Set<string>(scope === "repository" ? ["v", ...CONFIG_SECTIONS, ...RETIRED_SECTIONS] : LOCAL_KEYS);
  const config: ConfigObject = {};
  const ignored: IgnoredSetting[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (REMOVED_CONTEXT_KEYS.includes(key)) {
      ignored.push({ key, reason: `removed Freeflow context setting: delete this key` });
    } else if (REMOVED_FEATURES[key]) {
      ignored.push({ key, reason: `${REMOVED_FEATURES[key]} was removed from Freeflow` });
    } else if (REMOVED_SECTIONS[key]) {
      ignored.push(...removedSectionIgnored(key, entry));
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
export function ignoredStateLine(
  ignored: readonly { file?: string; key: string | null; reason: string }[],
): string | null {
  if (ignored.length === 0) return null;
  const items = ignored.map(
    (item) => `${item.file ? `${item.file} ` : ""}${item.key ?? "(whole file)"}: ${item.reason}`,
  );
  return `Settings ignored: ${items.join("; ")}. Run \`settings.mjs doctor\` to see the fix.`;
}

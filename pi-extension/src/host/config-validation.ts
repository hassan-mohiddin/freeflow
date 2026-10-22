import { validateCompactionConfig } from "../compaction/config.js";
import { validateTaskMemoryConfig } from "../task-memory/config.js";
import { validateMessagingConfig } from "../messaging/config.js";
import { validateToolExecutionConfig } from "../tool-execution/config.js";

/**
 * Whether a Freeflow config file is valid: one answer for Pi and for the session-start hooks of the other hosts, which
 * import the built file. Also how the settings every host reads, `prompts` and `review`, layer. Keep this module and its
 * imports free of Pi packages; the hooks run in plain Node.
 */

function isRecord(value: unknown): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A parsed config file: JSON whose shape the validators below check. */
export type ConfigObject = Record<string, any>;

/** The runtime prompts a hook host delivers, each on unless a config turns it off. Pi always delivers all of them. */
export const RUNTIME_PROMPTS = ["core", "interactionContract", "workingMethod"] as const;
export type RuntimePromptSelection = Record<(typeof RUNTIME_PROMPTS)[number], boolean>;

function validatePromptsConfig(value: unknown) {
  if (!isRecord(value)) return "prompts must be an object";
  const unknown = Object.keys(value).find((key) => !(RUNTIME_PROMPTS as readonly string[]).includes(key));
  if (unknown) return `prompts has unsupported key: ${unknown}`;
  for (const key of RUNTIME_PROMPTS)
    if (value[key] !== undefined && typeof value[key] !== "boolean") return `prompts.${key} must be a boolean`;
  return null;
}

/** The prompts a hook host delivers for two valid config layers: the personal layer overrides the repository's. */
export function selectedRuntimePrompts(repository: unknown, local: unknown): RuntimePromptSelection {
  const layer = (config: any) => (isRecord(config?.prompts) ? config.prompts : {});
  const [shared, personal] = [layer(repository), layer(local)];
  const selection = {} as RuntimePromptSelection;
  for (const key of RUNTIME_PROMPTS) selection[key] = (personal[key] ?? shared[key] ?? true) === true;
  return selection;
}

/**
 * How Review Work reviews finished work. Without the key it runs `auto`, its own risk gate; `off` and `always` are the
 * user's choice for every task, and `model` names the model a reviewer runs on. `auto` is accepted so a personal file
 * can return a shared `off` or `always` to the default.
 */
export const REVIEW_MODES = ["auto", "off", "always"] as const;
export type ReviewSettings = { mode: (typeof REVIEW_MODES)[number]; model?: string };
export const REVIEW_KEYS = ["mode", "model"] as const;

function validateReviewConfig(value: unknown) {
  if (!isRecord(value)) return "review must be an object";
  const unknown = Object.keys(value).find((key) => !(REVIEW_KEYS as readonly string[]).includes(key));
  if (unknown) return `review has unsupported key: ${unknown}`;
  if (value.mode !== undefined && !(REVIEW_MODES as readonly unknown[]).includes(value.mode))
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
export function resolveReviewSettings(repository: unknown, local: unknown): ReviewSettings {
  const layer = (config: any) => (isRecord(config?.review) ? config.review : {});
  const [shared, personal] = [layer(repository), layer(local)];
  const mode = personal.mode ?? shared.mode ?? "auto";
  const model = personal.model ?? shared.model;
  return model === undefined ? { mode } : { mode, model };
}

/** The Runtime State line for the user's review choice; none for the default, `auto` with no model. */
export function reviewStateLine(review: ReviewSettings | undefined): string | null {
  if (!review || (review.mode === "auto" && review.model === undefined)) return null;
  return `Review: \`${review.mode}\`${review.model === undefined ? "" : `, reviewer model \`${review.model}\``}`;
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
  "taskMemory",
  "messaging",
  "prompts",
  "review",
] as const;

// outputRouter, observedRouting, and scriptTransform belong to retired features; they are accepted and ignored so
// existing configs keep loading.
const RETIRED_SECTIONS = ["outputRouter", "observedRouting", "scriptTransform"];

export function validateRepositoryConfig(value: unknown): string | null {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }

  const removedContextError = removedContextConfigError(value, ".freeflow/config.json");
  if (removedContextError) return removedContextError;

  const allowedKeys = new Set<string>([...CONFIG_SECTIONS, ...RETIRED_SECTIONS]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `unsupported top-level config key: ${key}`;
    }
  }

  const coreError = validateCoreConfigFields(value);
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
  if (value.taskMemory !== undefined) {
    const error = validateTaskMemoryConfig(value.taskMemory);
    if (error) return error;
  }
  if (value.messaging !== undefined) {
    const error = validateMessagingConfig(value.messaging);
    if (error) return error;
  }
  if (value.review !== undefined) return validateReviewConfig(value.review);

  return null;
}

export function validateLocalConfig(value: unknown): string | null {
  if (!isRecord(value)) {
    return "local config must be a JSON object";
  }

  const removedContextError = removedContextConfigError(value, ".freeflow/local.json");
  if (removedContextError) return removedContextError;

  // processing belongs to a retired feature; it is accepted and ignored so existing local configs keep loading.
  const allowedKeys = new Set([
    "enabled",
    "processing",
    "cognitiveRouting",
    "toolExecution",
    "compaction",
    "taskMemory",
    "messaging",
    "prompts",
    "review",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `unsupported top-level local config key: ${key}`;
    }
  }

  const coreError = validateCoreConfigFields(value);
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
  if (value.taskMemory !== undefined) {
    const error = validateTaskMemoryConfig(value.taskMemory);
    if (error) return error;
  }
  if (value.messaging !== undefined) {
    const error = validateMessagingConfig(value.messaging);
    if (error) return error;
  }
  if (value.review !== undefined) return validateReviewConfig(value.review);
  return null;
}

import { validateCompactionConfig } from "../compaction/config.js";
import { validateTaskMemoryConfig } from "../task-memory/config.js";
import { validateMessagingConfig } from "../messaging/config.js";
import { validateToolExecutionConfig } from "../tool-execution/config.js";

/**
 * Whether a Freeflow config file is valid: one answer for Pi and for the session-start hooks of the other hosts, which
 * import the built file. Keep this module and its imports free of Pi packages; the hooks run in plain Node.
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

export function validateRepositoryConfig(value: unknown): string | null {
  if (!isRecord(value)) {
    return "config must be a JSON object";
  }

  const removedContextError = removedContextConfigError(value, ".freeflow/config.json");
  if (removedContextError) return removedContextError;

  // outputRouter, observedRouting, and scriptTransform belong to retired features; they are accepted and ignored so
  // existing configs keep loading.
  const allowedKeys = new Set([
    "enabled",
    "outputRouter",
    "observedRouting",
    "scriptTransform",
    "cognitiveRouting",
    "toolExecution",
    "compaction",
    "taskMemory",
    "messaging",
    "prompts",
  ]);
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
  if (value.messaging !== undefined) return validateMessagingConfig(value.messaging);
  return null;
}

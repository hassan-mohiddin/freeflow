import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  DEFAULT_OBSERVED_ROUTING_CONFIG,
  DEFAULT_OUTPUT_ROUTER_ENABLED,
  DEFAULT_POST_TOOL_ROUTING,
  DEFAULT_ROUTER_THRESHOLDS,
  DEFAULT_SCRIPT_TRANSFORM_CONFIG,
  DEFAULT_STORAGE_POLICY,
  DEFAULT_VAULT_RETENTION,
  DEFAULT_VAULT_ROOT,
  normalizeFreeflowConfig,
} from "../../router/dist/index.js";
import {
  handleModeCommand,
  readCapabilityState,
  readFreeflowConfig,
  readFreeflowConfigLayers,
  readFreeflowLocalConfig,
  readModeState,
  VALID_MODES,
} from "./runtime-context.js";
import {
  PiSettingsComponent,
  type SettingsCommitResult,
  type SettingsEntry,
  type SettingsSessionResult,
} from "./settings-tui.js";

const POST_TOOL_ROUTING_VALUES = ["off", "safety-net", "strict"] as const;
const STORAGE_POLICY_VALUES = ["hybrid-dedupe", "store-everything"] as const;
const OBSERVED_PERSISTENCE_VALUES = ["none", "metadata-only", "exact"] as const;
const SCRIPT_LANGUAGES = ["javascript", "python", "jq"] as const;
const DEFAULT_FREEFLOW_ENABLED = true;
const DEFAULT_INTERACTION_CONTRACT_ENABLED = true;
const DEFAULT_SKILLS_ENABLED = true;
const MODE_VALUES = ["conversation", "workflow", "strict-workflow"];
const MODE_LABELS = {
  default: "Use configured default",
  conversation: "conversation",
  workflow: "workflow",
  "strict-workflow": "strict-workflow",
};
const MODE_DESCRIPTIONS = {
  conversation: "Discussion and read-only inspection",
  workflow: "Adaptive workflow for consequential work",
  "strict-workflow": "Stronger decision and evidence pressure for high-risk work",
};
const LOCAL_INHERIT = "inherit";
const execFileAsync = promisify(execFile);

type ConfigScope = "local" | "repository";
type ConfigSource = "local" | "repository" | "builtin";

type SettingKind = "boolean" | "enum" | "integer" | "string" | "list" | "json" | "group";

type SettingsItem = {
  id: string;
  label: string;
  description: string;
  path?: string[];
  kind: SettingKind;
  value: unknown;
  defaultValue?: unknown;
  values?: string[];
  valueLabels?: Record<string, string>;
  valueDescriptions?: Record<string, string>;
  inactive?: boolean;
  displaySuffix?: string;
  children?: SettingsItem[];
  parse?: (text: string) => unknown;
  format?: (value: unknown) => string;
  configScope?: ConfigScope;
  configValues?: Record<string, unknown>;
  effectiveValue?: unknown;
  effectiveSource?: ConfigSource;
  inheritedValue?: unknown;
  inheritedSource?: ConfigSource;
  localOverrideValue?: unknown;
};

type OpenSettingsOptions = {
  title: string;
  items: SettingsItem[];
  ctx: any;
  onChange: (item: SettingsItem, value: unknown) => Promise<SettingsCommitResult>;
  initialChoice?: SettingsItem;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error(`Could not clone settings value: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getPath(source: unknown, path: string[]): unknown {
  let current = source;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown) {
  let current: Record<string, unknown> = target;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (!isRecord(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[path[path.length - 1]!] = value;
}

function deletePath(target: Record<string, unknown>, path: string[]) {
  let current: unknown = target;
  const parents: Array<{ object: Record<string, unknown>; key: string }> = [];
  for (const key of path.slice(0, -1)) {
    if (!isRecord(current)) return;
    parents.push({ object: current, key });
    current = current[key];
  }
  if (!isRecord(current)) return;
  delete current[path[path.length - 1]!];

  for (let index = parents.length - 1; index >= 0; index--) {
    const { object, key } = parents[index]!;
    const child = object[key];
    if (isRecord(child) && Object.keys(child).length === 0) {
      delete object[key];
    }
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEmptyValue(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function setConfigValue(config: Record<string, unknown>, item: SettingsItem, value: unknown) {
  if (!item.path?.length) {
    throw new Error(`${item.label} is a settings group, not a writable setting.`);
  }
  if (item.defaultValue !== undefined && valuesEqual(value, item.defaultValue)) {
    deletePath(config, item.path);
    return;
  }
  if (isEmptyValue(value)) {
    deletePath(config, item.path);
    return;
  }
  setPath(config, item.path, value);
}

function parseStringList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(text: string): number {
  const value = Number(text.trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Expected a positive integer.");
  }
  return value;
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Expected valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  return parsed;
}

function formatList(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

function formatJson(value: unknown): string {
  return JSON.stringify(isRecord(value) ? value : {});
}

function booleanValue(value: unknown): string {
  return value === true ? "enabled" : "disabled";
}

function normalizedSettingsConfig(rawConfig: Record<string, unknown>) {
  const rawRouter = isRecord(rawConfig.outputRouter) ? rawConfig.outputRouter : {};
  const normalized = normalizeFreeflowConfig({
    ...rawConfig,
    outputRouter: { ...rawRouter, enabled: true },
  });
  return normalized.config;
}

function rawValue(rawConfig: Record<string, unknown>, path: string[], fallback: unknown): unknown {
  const value = getPath(rawConfig, path);
  return value === undefined ? fallback : value;
}

function outputRouterItems(rawConfig: Record<string, unknown>, freeflowInactive = false): SettingsItem[] {
  const effective = normalizedSettingsConfig(rawConfig);
  const routerEnabled = normalizeFreeflowConfig(rawConfig).config.outputRouter.enabled;
  const router = effective.outputRouter;
  const scriptTransform = effective.scriptTransform;
  const observedRouting = effective.observedRouting;
  const inactive = freeflowInactive || !routerEnabled;

  return [
    {
      id: "outputRouter.enabled",
      label: "Output Router",
      description: "Master switch for Freeflow routed evidence tools and router runtime guidance.",
      path: ["outputRouter", "enabled"],
      kind: "boolean",
      value: routerEnabled,
      defaultValue: DEFAULT_OUTPUT_ROUTER_ENABLED,
      inactive: freeflowInactive,
    },
    {
      id: "outputRouter.postToolRouting",
      label: "Native safety net",
      description:
        "Post-process large/noisy native read/bash output. safety-net can replace oversized native output with vaulted routed evidence; strict is stronger.",
      path: ["outputRouter", "postToolRouting"],
      kind: "enum",
      value: router.postToolRouting,
      values: [...POST_TOOL_ROUTING_VALUES],
      valueDescriptions: {
        off: "Leave native tool output unchanged",
        "safety-net": "Route oversized or noisy native output",
        strict: "Apply stronger native output routing",
      },
      defaultValue: DEFAULT_POST_TOOL_ROUTING,
      inactive,
    },
    {
      id: "outputRouter.storagePolicy",
      label: "Storage policy",
      description: "Vault storage behavior for exactness-sensitive and noisy output.",
      path: ["outputRouter", "storagePolicy"],
      kind: "enum",
      value: router.storagePolicy,
      values: [...STORAGE_POLICY_VALUES],
      defaultValue: DEFAULT_STORAGE_POLICY,
      inactive,
    },
    {
      id: "outputRouter.thresholds.largeOutputBytes",
      label: "Large output bytes",
      description: "Byte threshold for treating command/tool output as large.",
      path: ["outputRouter", "thresholds", "largeOutputBytes"],
      kind: "integer",
      value: router.thresholds.largeOutputBytes,
      defaultValue: DEFAULT_ROUTER_THRESHOLDS.largeOutputBytes,
      parse: parsePositiveInteger,
      inactive,
    },
    {
      id: "outputRouter.thresholds.largeOutputLines",
      label: "Large output lines",
      description: "Line threshold for treating command/tool output as large.",
      path: ["outputRouter", "thresholds", "largeOutputLines"],
      kind: "integer",
      value: router.thresholds.largeOutputLines,
      defaultValue: DEFAULT_ROUTER_THRESHOLDS.largeOutputLines,
      parse: parsePositiveInteger,
      inactive,
    },
    {
      id: "outputRouter.vault.root",
      label: "Vault root",
      description: "Root directory for recoverable routed output.",
      path: ["outputRouter", "vault", "root"],
      kind: "string",
      value: router.vault.root,
      defaultValue: DEFAULT_VAULT_ROOT,
      inactive,
    },
    {
      id: "outputRouter.vault.retention.ttlDays",
      label: "Vault retention days",
      description: "TTL retention for vaulted output. Set a positive integer; default is 7 days.",
      path: ["outputRouter", "vault", "retention", "ttlDays"],
      kind: "integer",
      value:
        router.vault.retention?.strategy === "ttl" ? router.vault.retention.ttlDays : DEFAULT_VAULT_RETENTION.ttlDays,
      defaultValue: DEFAULT_VAULT_RETENTION.ttlDays,
      parse: parsePositiveInteger,
      inactive,
    },
    {
      id: "outputRouter.generatedPaths",
      label: "Generated paths",
      description:
        "Comma-separated globs for generated repo paths that should be treated as noisy or lower-priority evidence.",
      path: ["outputRouter", "hints", "generatedPathGlobs"],
      kind: "list",
      value: rawValue(
        rawConfig,
        ["outputRouter", "hints", "generatedPathGlobs"],
        rawValue(rawConfig, ["outputRouter", "generatedPaths"], router.hints?.generatedPathGlobs ?? []),
      ),
      format: formatList,
      parse: parseStringList,
      inactive,
    },
    {
      id: "outputRouter.noisyCommandHints",
      label: "Noisy command hints",
      description: "Comma-separated command patterns that are likely to produce noisy output.",
      path: ["outputRouter", "hints", "noisyCommandPatterns"],
      kind: "list",
      value: rawValue(
        rawConfig,
        ["outputRouter", "hints", "noisyCommandPatterns"],
        rawValue(rawConfig, ["outputRouter", "noisyCommandHints"], router.hints?.noisyCommandPatterns ?? []),
      ),
      format: formatList,
      parse: parseStringList,
      inactive,
    },
    {
      id: "outputRouter.scriptTransform.enabled",
      label: "Script transform",
      description:
        "Enable sandboxed script transforms/producers. Requires proof-backed adapters; no unsandboxed fallback.",
      path: ["outputRouter", "scriptTransform", "enabled"],
      kind: "boolean",
      value: scriptTransform.enabled,
      defaultValue: DEFAULT_SCRIPT_TRANSFORM_CONFIG.enabled,
      inactive,
    },
    {
      id: "outputRouter.scriptTransform.languages",
      label: "Script languages",
      description: "Comma-separated sandbox languages to allow: javascript, python, jq.",
      path: ["outputRouter", "scriptTransform", "languages"],
      kind: "list",
      value: scriptTransform.languages,
      defaultValue: DEFAULT_SCRIPT_TRANSFORM_CONFIG.languages,
      format: formatList,
      parse: (text) => parseStringList(text).filter((value) => (SCRIPT_LANGUAGES as readonly string[]).includes(value)),
      inactive,
    },
    {
      id: "outputRouter.scriptTransform.limits.timeoutMs",
      label: "Script timeout ms",
      description: "Maximum sandboxed script execution time.",
      path: ["outputRouter", "scriptTransform", "limits", "timeoutMs"],
      kind: "integer",
      value: scriptTransform.limits.timeoutMs,
      defaultValue: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.timeoutMs,
      parse: parsePositiveInteger,
      inactive,
    },
    {
      id: "outputRouter.scriptTransform.limits.maxInputBytes",
      label: "Script max input bytes",
      description: "Maximum input size for sandboxed scripts.",
      path: ["outputRouter", "scriptTransform", "limits", "maxInputBytes"],
      kind: "integer",
      value: scriptTransform.limits.maxInputBytes,
      defaultValue: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.maxInputBytes,
      parse: parsePositiveInteger,
      inactive,
    },
    {
      id: "outputRouter.scriptTransform.limits.maxOutputBytes",
      label: "Script max output bytes",
      description: "Maximum output size for sandboxed scripts.",
      path: ["outputRouter", "scriptTransform", "limits", "maxOutputBytes"],
      kind: "integer",
      value: scriptTransform.limits.maxOutputBytes,
      defaultValue: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.maxOutputBytes,
      parse: parsePositiveInteger,
      inactive,
    },
    {
      id: "outputRouter.observedRouting.enabled",
      label: "Observed routing",
      description: "Route configured host tool results after they run, e.g. MCP/web/fetch/code-search output.",
      path: ["outputRouter", "observedRouting", "enabled"],
      kind: "boolean",
      value: observedRouting.enabled,
      defaultValue: DEFAULT_OBSERVED_ROUTING_CONFIG.enabled,
      inactive,
    },
    ...observedProducerItems("web", "Web search", observedRouting.web, inactive),
    ...observedProducerItems("fetch", "Fetch content", observedRouting.fetch, inactive),
    ...observedProducerItems("codeSearch", "Code search", observedRouting.codeSearch, inactive),
    {
      id: "outputRouter.observedRouting.mcp.servers",
      label: "MCP servers JSON",
      description: 'JSON object keyed by MCP server id. Example: {"github":{"enabled":true,"persistence":"exact"}}',
      path: ["outputRouter", "observedRouting", "mcp", "servers"],
      kind: "json",
      value: observedRouting.mcp?.servers ?? {},
      defaultValue: DEFAULT_OBSERVED_ROUTING_CONFIG.mcp.servers,
      format: formatJson,
      parse: parseJsonObject,
      inactive,
    },
  ];
}

function observedProducerItems(
  id: "web" | "fetch" | "codeSearch",
  label: string,
  value: any,
  inactive: boolean,
): SettingsItem[] {
  return [
    {
      id: `outputRouter.observedRouting.${id}.enabled`,
      label: `${label} observed`,
      description: `Enable observed routing for ${label.toLowerCase()} output.`,
      path: ["outputRouter", "observedRouting", id, "enabled"],
      kind: "boolean",
      value: value?.enabled === true,
      defaultValue: false,
      inactive,
    },
    {
      id: `outputRouter.observedRouting.${id}.persistence`,
      label: `${label} persistence`,
      description: "Persistence mode for this observed producer: none, metadata-only, or exact.",
      path: ["outputRouter", "observedRouting", id, "persistence"],
      kind: "enum",
      value: value?.persistence ?? "none",
      values: [...OBSERVED_PERSISTENCE_VALUES],
      valueDescriptions: {
        none: "Do not persist observed output",
        "metadata-only": "Persist metadata without raw output",
        exact: "Persist exact recoverable output",
      },
      defaultValue: value?.enabled === true ? undefined : "none",
      inactive,
    },
  ];
}

function configValueForChoice(item: SettingsItem, value: unknown): unknown {
  const key = String(value);
  if (item.configValues && Object.hasOwn(item.configValues, key)) {
    return item.configValues[key];
  }
  return value;
}

function effectiveItemValue(item: SettingsItem): unknown {
  return item.effectiveValue !== undefined ? item.effectiveValue : item.value;
}

function formatCoreValue(value: unknown): string {
  return typeof value === "boolean" ? booleanValue(value) : String(value ?? "");
}

function coreDisplaySuffix(item: SettingsItem, inactive = false): string {
  const source = item.effectiveSource ?? "builtin";
  const parts =
    item.configScope === "repository" && source === "local"
      ? [`effective ${formatCoreValue(effectiveItemValue(item))}`, source]
      : [source];
  if (inactive) parts.push("inactive");
  return `(${parts.join(" · ")})`;
}

function updateScopedItemState(item: SettingsItem, value: unknown) {
  if (!item.configScope) return;
  const configValue = configValueForChoice(item, value);
  if (item.configScope === "local") {
    item.effectiveValue = configValue === undefined ? item.inheritedValue : configValue;
    item.effectiveSource = configValue === undefined ? (item.inheritedSource ?? "builtin") : "local";
    return;
  }
  if (item.localOverrideValue !== undefined) {
    item.effectiveValue = item.localOverrideValue;
    item.effectiveSource = "local";
    return;
  }
  item.effectiveValue = configValue;
  item.effectiveSource =
    item.defaultValue !== undefined && valuesEqual(configValue, item.defaultValue) ? "builtin" : "repository";
}

type ScopedBooleanItemOptions = {
  scope: ConfigScope;
  rawConfig: Record<string, unknown>;
  localConfig: Record<string, unknown>;
  id: string;
  label: string;
  description: string;
  path: string[];
  effectiveValue: boolean;
  effectiveSource: ConfigSource;
  defaultValue: boolean;
};

function createScopedBooleanItem(options: ScopedBooleanItemOptions): SettingsItem {
  const repositoryValue = getPath(options.rawConfig, options.path);
  const inheritedValue = typeof repositoryValue === "boolean" ? repositoryValue : options.defaultValue;
  const inheritedSource: ConfigSource = typeof repositoryValue === "boolean" ? "repository" : "builtin";
  const localValue = getPath(options.localConfig, options.path);
  let item: SettingsItem;
  if (options.scope === "local") {
    const selectedValue = typeof localValue === "boolean" ? String(localValue) : LOCAL_INHERIT;
    item = {
      id: options.id,
      label: options.label,
      description: `${options.description} Choose inherit to use the repository value; use /freeflow settings repo to edit shared defaults.`,
      path: options.path,
      kind: "enum",
      value: selectedValue,
      values: [LOCAL_INHERIT, "true", "false"],
      valueLabels: {
        inherit: "Inherit repository",
        true: "enabled",
        false: "disabled",
      },
      valueDescriptions: {
        inherit: `Use ${formatCoreValue(inheritedValue)} from ${inheritedSource}.`,
        true: "Set a personal enabled override.",
        false: "Set a personal disabled override.",
      },
      format: (value) => {
        if (value === LOCAL_INHERIT) return LOCAL_INHERIT;
        return booleanValue(value === "true");
      },
      configScope: "local",
      configValues: {
        inherit: undefined,
        true: true,
        false: false,
      },
      effectiveValue: options.effectiveValue,
      effectiveSource: options.effectiveSource,
      inheritedValue,
      inheritedSource,
    };
  } else {
    item = {
      id: options.id,
      label: options.label,
      description: `${options.description} This edits shared .freeflow/config.json.`,
      path: options.path,
      kind: "boolean",
      value: inheritedValue,
      defaultValue: options.defaultValue,
      configScope: "repository",
      effectiveValue: options.effectiveValue,
      effectiveSource: options.effectiveSource,
      localOverrideValue: typeof localValue === "boolean" ? localValue : undefined,
    };
  }
  item.displaySuffix = coreDisplaySuffix(item);
  return item;
}

type ScopedDefaultModeItemOptions = {
  scope: ConfigScope;
  repositoryDefaultMode: string;
  repositoryDefaultSource: ConfigSource;
  localDefaultMode?: string;
  effectiveValue: string;
  effectiveSource: ConfigSource;
};

function createScopedDefaultModeItem(options: ScopedDefaultModeItemOptions): SettingsItem {
  let item: SettingsItem;
  if (options.scope === "local") {
    item = {
      id: "freeflow.defaultMode",
      label: "Default mode",
      description:
        "Personal default mode for this checkout. Choose inherit to use the repository default; use /freeflow settings repo to edit shared defaults.",
      path: ["defaultMode"],
      kind: "enum",
      value: options.localDefaultMode ?? LOCAL_INHERIT,
      values: [LOCAL_INHERIT, ...MODE_VALUES],
      valueLabels: {
        inherit: "Inherit repository",
        ...MODE_LABELS,
      },
      valueDescriptions: {
        inherit: `Use ${options.repositoryDefaultMode} from ${options.repositoryDefaultSource}.`,
        ...MODE_DESCRIPTIONS,
      },
      format: (value) => String(value),
      configScope: "local",
      configValues: { inherit: undefined },
      effectiveValue: options.effectiveValue,
      effectiveSource: options.effectiveSource,
      inheritedValue: options.repositoryDefaultMode,
      inheritedSource: options.repositoryDefaultSource,
    };
  } else {
    item = {
      id: "freeflow.defaultMode",
      label: "Default mode",
      description:
        "Shared repository default Freeflow mode used when Skills are enabled. This edits .freeflow/config.json.",
      path: ["defaultMode"],
      kind: "enum",
      value: options.repositoryDefaultMode,
      values: MODE_VALUES,
      valueLabels: MODE_LABELS,
      valueDescriptions: MODE_DESCRIPTIONS,
      configScope: "repository",
      effectiveValue: options.effectiveValue,
      effectiveSource: options.effectiveSource,
      localOverrideValue: options.localDefaultMode,
    };
  }
  item.displaySuffix = coreDisplaySuffix(item);
  return item;
}

function sessionModeDisplaySuffix(
  sessionMode: string,
  defaultMode: string,
  defaultSource: ConfigSource,
  inactive: boolean,
): string | undefined {
  if (sessionMode !== "default") return undefined;
  const inactiveSuffix = inactive ? " · inactive" : "";
  return `(${defaultMode} · ${defaultSource}${inactiveSuffix})`;
}

function validModeOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && VALID_MODES.has(value) ? value : undefined;
}

function resolveSettingsCoreView(
  rawConfig: Record<string, unknown>,
  layers?: Awaited<ReturnType<typeof readFreeflowConfigLayers>>,
) {
  const localConfig = layers?.local.valid && isRecord(layers.local.parsed) ? layers.local.parsed : {};
  const repositorySkillsValue = getPath(rawConfig, ["skills"]);
  const repositorySkills = isRecord(repositorySkillsValue) ? repositorySkillsValue : {};
  const fallbackCore = {
    enabled: getPath(rawConfig, ["enabled"]) !== false,
    interactionContract: getPath(rawConfig, ["interactionContract"]) !== false,
    skills: { enabled: getPath(repositorySkills, ["enabled"]) !== false },
    defaultMode: validModeOrUndefined(rawConfig.defaultMode) ?? "workflow",
  };
  const fallbackSources = {
    enabled: typeof getPath(rawConfig, ["enabled"]) === "boolean" ? "repository" : "builtin",
    interactionContract: typeof getPath(rawConfig, ["interactionContract"]) === "boolean" ? "repository" : "builtin",
    skillsEnabled: typeof getPath(repositorySkills, ["enabled"]) === "boolean" ? "repository" : "builtin",
    defaultMode: validModeOrUndefined(rawConfig.defaultMode) !== undefined ? "repository" : "builtin",
  } as const;
  return {
    localConfig,
    core: layers?.coreConfig ?? fallbackCore,
    sources: (layers?.sources ?? fallbackSources) as {
      enabled: ConfigSource;
      interactionContract: ConfigSource;
      skillsEnabled: ConfigSource;
      defaultMode: ConfigSource;
    },
  };
}

function groupEnabled(items: SettingsItem[], id: string): boolean {
  return items.find((item) => item.id === id)?.value === true;
}

function freeflowItems(
  rawConfig: Record<string, unknown>,
  modeState?: Awaited<ReturnType<typeof readModeState>>,
  options: {
    scope?: ConfigScope;
    layers?: Awaited<ReturnType<typeof readFreeflowConfigLayers>>;
  } = {},
): SettingsItem[] {
  const scope = options.scope ?? "repository";
  const layers = options.layers;
  const { localConfig, core, sources } = resolveSettingsCoreView(rawConfig, layers);

  const freeflowItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.enabled",
    label: "Freeflow",
    description: "Master switch for the Interaction Contract and Freeflow skills in this checkout.",
    path: ["enabled"],
    effectiveValue: core.enabled,
    effectiveSource: sources.enabled,
    defaultValue: DEFAULT_FREEFLOW_ENABLED,
  });
  const interactionItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.interactionContract",
    label: "Interaction Contract",
    description: "Apply Freeflow's compact turn-interpretation and collaboration guidance.",
    path: ["interactionContract"],
    effectiveValue: core.interactionContract,
    effectiveSource: sources.interactionContract,
    defaultValue: DEFAULT_INTERACTION_CONTRACT_ENABLED,
  });
  const skillsItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.skills.enabled",
    label: "Skills",
    description: "Expose Freeflow skills and load Workflow once on the first turn.",
    path: ["skills", "enabled"],
    effectiveValue: core.skills.enabled,
    effectiveSource: sources.skillsEnabled,
    defaultValue: DEFAULT_SKILLS_ENABLED,
  });

  const repositoryModeValue = validModeOrUndefined(rawConfig.defaultMode);
  const repositoryDefaultMode = repositoryModeValue ?? "workflow";
  const repositoryDefaultSource: ConfigSource = repositoryModeValue ? "repository" : "builtin";
  const localDefaultMode = validModeOrUndefined(localConfig.defaultMode);
  const defaultModeItem = createScopedDefaultModeItem({
    scope,
    repositoryDefaultMode,
    repositoryDefaultSource,
    localDefaultMode,
    effectiveValue: core.defaultMode,
    effectiveSource: sources.defaultMode,
  });

  const freeflowInactive = !core.enabled;
  const skillsEnabled = core.skills.enabled;
  interactionItem.inactive = freeflowInactive;
  skillsItem.inactive = freeflowInactive;
  defaultModeItem.inactive = freeflowInactive;
  defaultModeItem.displaySuffix = coreDisplaySuffix(defaultModeItem, freeflowInactive || !skillsEnabled);
  const sessionMode = modeState?.currentMode ?? "default";
  const sessionModeItem: SettingsItem = {
    id: "freeflow.sessionMode",
    label: "Session mode",
    description:
      "Temporary mode override for this Pi session. Use configured default clears the override without changing either config file.",
    kind: "enum",
    value: sessionMode,
    values: ["default", ...MODE_VALUES],
    valueLabels: {
      ...MODE_LABELS,
      default: "Use configured default",
    },
    valueDescriptions: {
      default: `${core.defaultMode} from ${sources.defaultMode}`,
      ...MODE_DESCRIPTIONS,
    },
    inactive: freeflowInactive || !skillsEnabled,
    displaySuffix: sessionModeDisplaySuffix(
      sessionMode,
      core.defaultMode,
      sources.defaultMode,
      freeflowInactive || !skillsEnabled,
    ),
  };

  const routerItems = outputRouterItems(rawConfig, freeflowInactive);
  const routerEnabled = groupEnabled(routerItems, "outputRouter.enabled");

  return [
    freeflowItem,
    interactionItem,
    skillsItem,
    sessionModeItem,
    defaultModeItem,
    {
      id: "outputRouter.group",
      label: "Output Router",
      description:
        "Shared repository settings for routed evidence tools, native output safety net, vault storage, script transforms, and observed tool routing.",
      kind: "group",
      value: routerEnabled,
      inactive: freeflowInactive,
      displaySuffix: "(repository)",
      children: routerItems,
    },
  ];
}

function migrateLegacyRouterConfig(config: Record<string, unknown>) {
  const outputRouter = isRecord(config.outputRouter) ? config.outputRouter : undefined;
  if (!outputRouter) return;
  if (config.scriptTransform !== undefined && outputRouter.scriptTransform === undefined) {
    outputRouter.scriptTransform = config.scriptTransform;
    delete config.scriptTransform;
  }
  if (config.observedRouting !== undefined && outputRouter.observedRouting === undefined) {
    outputRouter.observedRouting = config.observedRouting;
    delete config.observedRouting;
  }

  const thresholds = isRecord(outputRouter.thresholds) ? outputRouter.thresholds : {};
  if (outputRouter.largeOutputBytes !== undefined && thresholds.largeOutputBytes === undefined) {
    thresholds.largeOutputBytes = outputRouter.largeOutputBytes;
    outputRouter.thresholds = thresholds;
    delete outputRouter.largeOutputBytes;
  }
  if (outputRouter.largeOutputLines !== undefined && thresholds.largeOutputLines === undefined) {
    thresholds.largeOutputLines = outputRouter.largeOutputLines;
    outputRouter.thresholds = thresholds;
    delete outputRouter.largeOutputLines;
  }

  const vault = isRecord(outputRouter.vault) ? outputRouter.vault : {};
  if (outputRouter.vaultRoot !== undefined && vault.root === undefined) {
    vault.root = outputRouter.vaultRoot;
    outputRouter.vault = vault;
    delete outputRouter.vaultRoot;
  }
  if (outputRouter.vaultRetentionDays !== undefined && !isRecord(vault.retention)) {
    vault.retention = {
      strategy: "ttl",
      ttlDays: outputRouter.vaultRetentionDays,
    };
    outputRouter.vault = vault;
    delete outputRouter.vaultRetentionDays;
  }

  const hints = isRecord(outputRouter.hints) ? outputRouter.hints : {};
  if (outputRouter.generatedPaths !== undefined && hints.generatedPathGlobs === undefined) {
    hints.generatedPathGlobs = outputRouter.generatedPaths;
    outputRouter.hints = hints;
    delete outputRouter.generatedPaths;
  }
  if (outputRouter.noisyCommandHints !== undefined && hints.noisyCommandPatterns === undefined) {
    hints.noisyCommandPatterns = outputRouter.noisyCommandHints;
    outputRouter.hints = hints;
    delete outputRouter.noisyCommandHints;
  }
}

function pruneKnownDefaults(config: Record<string, unknown>) {
  const defaultPaths: Array<{ path: string[]; value: unknown }> = [
    { path: ["enabled"], value: DEFAULT_FREEFLOW_ENABLED },
    {
      path: ["interactionContract"],
      value: DEFAULT_INTERACTION_CONTRACT_ENABLED,
    },
    { path: ["skills", "enabled"], value: DEFAULT_SKILLS_ENABLED },
    { path: ["outputRouter", "enabled"], value: DEFAULT_OUTPUT_ROUTER_ENABLED },
    {
      path: ["outputRouter", "postToolRouting"],
      value: DEFAULT_POST_TOOL_ROUTING,
    },
    { path: ["outputRouter", "storagePolicy"], value: DEFAULT_STORAGE_POLICY },
    {
      path: ["outputRouter", "thresholds", "largeOutputBytes"],
      value: DEFAULT_ROUTER_THRESHOLDS.largeOutputBytes,
    },
    {
      path: ["outputRouter", "thresholds", "largeOutputLines"],
      value: DEFAULT_ROUTER_THRESHOLDS.largeOutputLines,
    },
    { path: ["outputRouter", "vault", "root"], value: DEFAULT_VAULT_ROOT },
    {
      path: ["outputRouter", "vault", "retention", "ttlDays"],
      value: DEFAULT_VAULT_RETENTION.ttlDays,
    },
    {
      path: ["outputRouter", "scriptTransform", "enabled"],
      value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.enabled,
    },
    {
      path: ["outputRouter", "scriptTransform", "sandbox"],
      value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.sandbox,
    },
    {
      path: ["outputRouter", "scriptTransform", "languages"],
      value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.languages,
    },
    {
      path: ["outputRouter", "scriptTransform", "network"],
      value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.network,
    },
    {
      path: ["outputRouter", "scriptTransform", "rawScriptPersistence"],
      value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.rawScriptPersistence,
    },
    {
      path: ["outputRouter", "scriptTransform", "limits", "timeoutMs"],
      value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.timeoutMs,
    },
    {
      path: ["outputRouter", "scriptTransform", "limits", "maxInputBytes"],
      value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.maxInputBytes,
    },
    {
      path: ["outputRouter", "scriptTransform", "limits", "maxOutputBytes"],
      value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.maxOutputBytes,
    },
    {
      path: ["outputRouter", "observedRouting", "enabled"],
      value: DEFAULT_OBSERVED_ROUTING_CONFIG.enabled,
    },
    {
      path: ["outputRouter", "observedRouting", "onRoutingFailure"],
      value: DEFAULT_OBSERVED_ROUTING_CONFIG.onRoutingFailure,
    },
    {
      path: ["outputRouter", "observedRouting", "mcp", "servers"],
      value: DEFAULT_OBSERVED_ROUTING_CONFIG.mcp.servers,
    },
    {
      path: ["outputRouter", "observedRouting", "web", "enabled"],
      value: DEFAULT_OBSERVED_ROUTING_CONFIG.web.enabled,
    },
    {
      path: ["outputRouter", "observedRouting", "fetch", "enabled"],
      value: DEFAULT_OBSERVED_ROUTING_CONFIG.fetch.enabled,
    },
    {
      path: ["outputRouter", "observedRouting", "codeSearch", "enabled"],
      value: DEFAULT_OBSERVED_ROUTING_CONFIG.codeSearch.enabled,
    },
  ];

  for (const item of defaultPaths) {
    if (valuesEqual(getPath(config, item.path), item.value)) {
      deletePath(config, item.path);
    }
  }

  for (const producer of ["web", "fetch", "codeSearch"]) {
    const enabledPath = ["outputRouter", "observedRouting", producer, "enabled"];
    const persistencePath = ["outputRouter", "observedRouting", producer, "persistence"];
    if (getPath(config, enabledPath) !== true && getPath(config, persistencePath) === "none") {
      deletePath(config, persistencePath);
    }
  }

  const servers = getPath(config, ["outputRouter", "observedRouting", "mcp", "servers"]);
  if (isRecord(servers) && Object.keys(servers).length === 0) {
    deletePath(config, ["outputRouter", "observedRouting", "mcp", "servers"]);
  }
}

async function ensureLocalConfigIgnored(cwd: string) {
  let gitPath: string;
  try {
    const result = await execFileAsync("git", ["-C", cwd, "rev-parse", "--git-path", "info/exclude"]);
    gitPath = result.stdout.trim();
  } catch {
    return;
  }

  const tracked = await execFileAsync("git", ["-C", cwd, "ls-files", "--", ".freeflow/local.json"]);
  if (tracked.stdout.trim()) {
    throw new Error(
      ".freeflow/local.json is tracked by git; remove it from the index before writing personal overrides.",
    );
  }

  try {
    await execFileAsync("git", ["-C", cwd, "check-ignore", "-q", "--", ".freeflow/local.json"]);
    return;
  } catch {
    // Add a local exclude when the repository does not already ignore the file.
  }

  const excludePath = isAbsolute(gitPath) ? gitPath : resolve(cwd, gitPath);
  let existing = "";
  try {
    existing = await readFile(excludePath, "utf8");
  } catch {
    // The git metadata path may not exist yet in a minimal repository.
  }
  const rule = ".freeflow/local.json";
  if (existing.split(/\r?\n/).includes(rule)) return;
  await mkdir(dirname(excludePath), { recursive: true });
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(excludePath, `${prefix}${rule}\n`, "utf8");
}

async function updateConfig(
  cwd: string,
  item: SettingsItem,
  value: unknown,
  scope: ConfigScope = item.configScope ?? "repository",
) {
  if (scope === "local") {
    if (!item.path?.length) {
      throw new Error(`${item.label} is a settings group, not a writable setting.`);
    }
    const current = await readFreeflowLocalConfig(cwd);
    const next = cloneJson(current) as Record<string, unknown>;
    const configValue = configValueForChoice(item, value);
    const previousValue = getPath(current, item.path);
    if (configValue === undefined || isEmptyValue(configValue)) {
      if (previousValue === undefined) return;
      deletePath(next, item.path);
    } else {
      setPath(next, item.path, configValue);
    }
    const path = join(cwd, ".freeflow/local.json");
    await ensureLocalConfigIgnored(cwd);
    if (Object.keys(next).length === 0) {
      await rm(path, { force: true });
      return;
    }
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return;
  }

  const current = await readFreeflowConfig(cwd);
  const next = cloneJson(current) as Record<string, unknown>;
  setConfigValue(next, item, value);
  migrateLegacyRouterConfig(next);
  pruneKnownDefaults(next);
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await writeFile(join(cwd, ".freeflow/config.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function valueForDisplay(item: SettingsItem): string {
  let value: string;
  if (item.configScope === "local") {
    value = formatCoreValue(effectiveItemValue(item));
  } else if (item.kind === "boolean") {
    value = booleanValue(item.value);
  } else if (item.kind === "group") {
    const status = typeof item.value === "boolean" ? booleanValue(item.value) : String(item.value ?? "");
    const count = item.children?.length ?? 0;
    value = count > 0 ? `${status} (${count})` : status;
  } else if (item.format) {
    value = item.format(item.value);
  } else {
    value = String(item.value ?? "");
  }
  return item.displaySuffix ? `${value} ${item.displaySuffix}` : value;
}

function walkSettingsItems(items: SettingsItem[], visitor: (item: SettingsItem) => void) {
  for (const item of items) {
    visitor(item);
    if (item.children) walkSettingsItems(item.children, visitor);
  }
}

function findSettingsItem(items: SettingsItem[], id: string): SettingsItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children ? findSettingsItem(item.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

function refreshSettingsDerivedState(items: SettingsItem[]) {
  const freeflowItem = findSettingsItem(items, "freeflow.enabled");
  const freeflowInactive = freeflowItem ? effectiveItemValue(freeflowItem) !== true : false;
  const skillsItem = findSettingsItem(items, "freeflow.skills.enabled");
  const skillsEnabled = skillsItem ? effectiveItemValue(skillsItem) === true : true;
  const routerEnabled = findSettingsItem(items, "outputRouter.enabled")?.value === true;
  const sessionModeItem = findSettingsItem(items, "freeflow.sessionMode");
  const defaultModeItem = findSettingsItem(items, "freeflow.defaultMode");
  const routerGroup = findSettingsItem(items, "outputRouter.group");

  if (sessionModeItem) {
    const defaultMode = String(defaultModeItem ? effectiveItemValue(defaultModeItem) : "workflow");
    const defaultSource = defaultModeItem?.effectiveSource ?? "builtin";
    sessionModeItem.inactive = freeflowInactive || !skillsEnabled;
    sessionModeItem.displaySuffix = sessionModeDisplaySuffix(
      String(sessionModeItem.value),
      defaultMode,
      defaultSource,
      freeflowInactive || !skillsEnabled,
    );
    sessionModeItem.valueDescriptions = {
      default: `${defaultMode} from ${defaultSource}`,
      ...MODE_DESCRIPTIONS,
    };
  }

  if (routerGroup) {
    routerGroup.value = routerEnabled;
    routerGroup.inactive = freeflowInactive;
  }

  walkSettingsItems(items, (candidate) => {
    if (candidate.configScope) {
      const inactive = candidate.id === "freeflow.enabled" ? false : freeflowInactive;
      const displayInactive = candidate.id === "freeflow.defaultMode" ? freeflowInactive || !skillsEnabled : inactive;
      candidate.inactive = inactive;
      candidate.displaySuffix = coreDisplaySuffix(candidate, displayInactive);
    } else if (candidate.id === "freeflow.sessionMode") {
      candidate.inactive = freeflowInactive || !skillsEnabled;
    } else if (candidate.id === "outputRouter.group") {
      candidate.inactive = freeflowInactive;
    } else if (candidate.id === "outputRouter.enabled") {
      candidate.inactive = freeflowInactive;
    } else if (candidate.id.startsWith("outputRouter.")) {
      candidate.inactive = freeflowInactive || !routerEnabled;
    } else {
      candidate.inactive = freeflowInactive;
    }
  });
}

function settingsChoices(item: SettingsItem) {
  if (item.kind === "boolean") {
    return [
      { key: "true", value: true, label: "enabled", description: "Enable this setting." },
      { key: "false", value: false, label: "disabled", description: "Disable this setting." },
    ];
  }
  if (item.kind !== "enum") return undefined;
  return (item.values ?? []).map((value) => ({
    key: value,
    value,
    label: item.valueLabels?.[value] ?? value,
    description: item.valueDescriptions?.[value],
  }));
}

function settingsEntries(
  items: SettingsItem[],
  rootItems: SettingsItem[],
  onChange: OpenSettingsOptions["onChange"],
): SettingsEntry[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    currentValue: () => valueForDisplay(item),
    inactive: () => item.inactive === true,
    currentChoiceKey: () => String(item.value),
    choices: settingsChoices(item),
    children: item.children ? () => settingsEntries(item.children!, rootItems, onChange) : undefined,
    edit:
      !item.children && !["boolean", "enum", "group"].includes(item.kind)
        ? {
            initialValue: () => valueForDisplay(item),
            parse: (text: string) => (item.parse ? item.parse(text) : text),
          }
        : undefined,
    commit:
      item.kind === "group"
        ? undefined
        : async (value: unknown) => {
            if (valuesEqual(item.value, value)) return { changed: false, reloadRequired: false };
            const outcome = await onChange(item, value);
            if (outcome.changed) {
              updateScopedItemState(item, value);
              item.value = value;
              refreshSettingsDerivedState(rootItems);
            }
            return outcome;
          },
  }));
}

async function openSettings(options: OpenSettingsOptions): Promise<SettingsSessionResult> {
  if (typeof options.ctx?.ui?.custom !== "function") {
    options.ctx?.ui?.notify?.(
      `${options.title} requires Pi TUI mode. Use the status command for a compact summary.`,
      "warning",
    );
    return { changed: false, configChanged: false, failed: false };
  }

  const entries = settingsEntries(options.items, options.items, options.onChange);
  const initialChoice = options.initialChoice
    ? entries.find((entry) => entry.id === options.initialChoice?.id)
    : undefined;
  let component: PiSettingsComponent | undefined;
  await options.ctx.ui.custom((tui: any, theme: any, _keybindings: unknown, done: (value?: undefined) => void) => {
    component = new PiSettingsComponent({
      title: options.title,
      entries,
      initialChoice,
      theme: theme ?? {},
      requestRender: () => tui.requestRender(),
      notify: (message, level) => options.ctx?.ui?.notify?.(message, level),
      done,
    });
    return component;
  });

  await component?.waitForWrites();
  return component?.sessionResult() ?? { changed: false, configChanged: false, failed: false };
}

function outputRouterStatusText(rawConfig: Record<string, unknown>): string {
  const settingsConfig = normalizedSettingsConfig(rawConfig);
  const actual = normalizeFreeflowConfig(rawConfig).config;
  const freeflowEnabled = rawConfig.enabled !== false;
  const router = actual.outputRouter;
  const configured = settingsConfig;
  const generatedPaths = router.hints?.generatedPathGlobs?.length ?? 0;
  const noisyHints = router.hints?.noisyCommandPatterns?.length ?? 0;
  return [
    `Output Router: ${freeflowEnabled && router.enabled ? "enabled" : "disabled"}${freeflowEnabled ? "" : " (inactive: Freeflow off)"}`,
    `script transform: ${freeflowEnabled && configured.scriptTransform.enabled ? "enabled" : "disabled"}${freeflowEnabled && router.enabled ? "" : " (inactive)"}`,
    `observed routing: ${freeflowEnabled && configured.observedRouting.enabled ? "enabled" : "disabled"}${freeflowEnabled && router.enabled ? "" : " (inactive)"}`,
    `native safety net: ${freeflowEnabled ? router.postToolRouting : "off"}`,
    `storage: ${router.storagePolicy}`,
    `generated paths: ${generatedPaths}`,
    `noisy command hints: ${noisyHints}`,
  ].join("; ");
}

function freeflowStatusText(state: Awaited<ReturnType<typeof readCapabilityState>>): string {
  if (!state.configured) {
    return state.configExists
      ? `Freeflow: inactive (invalid config: ${state.parseError ?? "unknown parse error"}); run /setup-freeflow or fix .freeflow/config.json`
      : "Freeflow: inactive (repo not set up); run /setup-freeflow";
  }
  return [
    `Freeflow: ${state.enabled ? "enabled" : "disabled"}`,
    `interaction contract: ${state.interactionContract.effective ? "enabled" : "disabled"}`,
    `skills: ${state.skills.effective ? "enabled" : "disabled (workflow modes inactive)"}`,
    `output router: ${state.outputRouter.enabled ? "enabled" : "disabled"}`,
  ].join("; ");
}

const NON_TUI_SETTINGS_GUIDANCE =
  "Freeflow settings require Pi TUI mode. Use /freeflow status to inspect current state; supported non-TUI changes are /freeflow enable, /freeflow disable, and /freeflow mode <conversation|workflow|strict-workflow|reset>.";
const NON_TUI_MODE_GUIDANCE =
  "Freeflow mode selector requires Pi TUI mode. Use /freeflow mode conversation, /freeflow mode workflow, /freeflow mode strict-workflow, or /freeflow mode reset.";

function nonTuiGuidance(ctx: any, message: string) {
  if (ctx?.hasUI === false) throw new Error(message);
  ctx?.ui?.notify?.(message, "warning");
  return { changed: false, reloaded: false, error: "tui_required" };
}

async function finalizeSettingsSession(
  session: SettingsSessionResult,
  ctx: any,
  afterChange: (changed: boolean) => Promise<void> | void,
  savedMessage: string,
  reloadWarning = "Run /reload for Freeflow changes to fully apply.",
) {
  if (!session.configChanged) return false;

  await afterChange(true);
  if (session.failed) return false;

  ctx.ui.notify(savedMessage, "info");
  if (typeof ctx.reload !== "function") {
    ctx.ui.notify(reloadWarning, "warning");
    return false;
  }

  await ctx.reload();
  return true;
}

function actionIsMutation(action: string): boolean {
  return action === "" || action === "settings" || ["enable", "on", "true", "disable", "off", "false"].includes(action);
}

async function maybeBlockLayerMutation(action: string, ctx: any, layerName: string) {
  if (!actionIsMutation(action)) return false;
  const state = await readCapabilityState(ctx.cwd);
  if (!state.configured) {
    ctx.ui.notify(
      `Freeflow is installed but this repo is not set up. Run /setup-freeflow before configuring ${layerName}.`,
      "warning",
    );
    return true;
  }
  if (!state.enabled) {
    ctx.ui.notify(
      `Freeflow is disabled for this repo. Use /freeflow enable before configuring ${layerName}.`,
      "warning",
    );
    return true;
  }
  return false;
}

export async function handleFreeflowCommand(
  args: string | undefined,
  ctx: any,
  afterChange: (changed: boolean) => Promise<void> | void,
  pi: any,
) {
  const input = (args ?? "settings").trim().toLowerCase() || "settings";
  const [action, ...rest] = input.split(/\s+/);
  const actionValue = rest.join(" ");
  const nonTui = ctx?.mode && ctx.mode !== "tui";
  if (nonTui && action === "mode" && !actionValue) {
    return nonTuiGuidance(ctx, NON_TUI_MODE_GUIDANCE);
  }
  const settingsSelector =
    action === "settings" &&
    (!actionValue || ["local", "personal", "repo", "repository", "shared"].includes(actionValue));
  if (nonTui && settingsSelector) {
    return nonTuiGuidance(ctx, NON_TUI_SETTINGS_GUIDANCE);
  }

  const [layers, state, modeState] = await Promise.all([
    readFreeflowConfigLayers(ctx.cwd),
    readCapabilityState(ctx.cwd),
    readModeState(ctx.cwd),
  ]);
  const configState = layers.repository;
  const raw = configState.valid ? configState.parsed : {};

  if (action === "status") {
    ctx.ui.notify(freeflowStatusText(state), "info");
    return { changed: false, reloaded: false };
  }

  if (!configState.valid) {
    ctx.ui.notify(freeflowStatusText(state), "warning");
    return { changed: false, reloaded: false, error: "not_configured" };
  }
  if (layers.local.exists && !layers.local.valid) {
    ctx.ui.notify(
      `.freeflow/local.json is invalid; repair or remove it before changing Freeflow settings. ${layers.local.parseError ?? ""}`.trim(),
      "warning",
    );
    return { changed: false, reloaded: false, error: "invalid_local_config" };
  }

  if (action === "mode") {
    if (actionValue) {
      const result = await handleModeCommand(actionValue, ctx, pi);
      return { changed: result.changed, reloaded: false, error: result.error };
    }
    if (!state.enabled || !state.skills.effective) {
      const result = await handleModeCommand(undefined, ctx, pi);
      return { changed: false, reloaded: false, error: result.error };
    }
    if (typeof ctx?.ui?.custom !== "function") {
      const result = await handleModeCommand(undefined, ctx, pi);
      return { changed: false, reloaded: false, error: result.error };
    }

    const item = freeflowItems(raw, modeState, {
      scope: "local",
      layers,
    }).find((candidate) => candidate.id === "freeflow.sessionMode")!;
    const session = await openSettings({
      title: "Freeflow Mode",
      items: [item],
      initialChoice: item,
      ctx,
      onChange: async (_item, value) => {
        const result = await handleModeCommand(String(value), ctx, pi);
        return { changed: result.changed, reloadRequired: false };
      },
    });
    return { changed: session.changed, reloaded: false, error: session.failed ? "write_failed" : undefined };
  }

  if (["enable", "on", "true", "disable", "off", "false"].includes(action)) {
    const enabled = ["enable", "on", "true"].includes(action);
    const item = freeflowItems(raw, modeState, {
      scope: "repository",
      layers,
    }).find((candidate) => candidate.id === "freeflow.enabled")!;
    await updateConfig(ctx.cwd, item, enabled, "repository");
    await afterChange(true);
    ctx.ui.notify(`Freeflow ${enabled ? "enabled" : "disabled"}. Reloading Freeflow runtime...`, "info");
    if (typeof ctx.reload === "function") {
      await ctx.reload();
      return { changed: true, reloaded: true };
    }
    ctx.ui.notify("Run /reload for Freeflow changes to fully apply.", "warning");
    return { changed: true, reloaded: false };
  }

  if (action && action !== "settings") {
    ctx.ui.notify(
      "Usage: /freeflow, /freeflow settings [local|repo], /freeflow status, /freeflow mode [conversation|workflow|strict-workflow|reset], /freeflow enable, or /freeflow disable",
      "warning",
    );
    return { changed: false, reloaded: false, error: "invalid_action" };
  }

  let settingsScope: ConfigScope = "local";
  if (["repo", "repository", "shared"].includes(actionValue)) {
    settingsScope = "repository";
  } else if (actionValue && !["local", "personal"].includes(actionValue)) {
    ctx.ui.notify("Usage: /freeflow settings, /freeflow settings local, or /freeflow settings repo", "warning");
    return { changed: false, reloaded: false, error: "invalid_scope" };
  }
  const session = await openSettings({
    title:
      settingsScope === "local"
        ? "Freeflow Settings · Personal overrides"
        : "Freeflow Repository Settings · modifies .freeflow/config.json",
    items: freeflowItems(raw, modeState, { scope: settingsScope, layers }),
    ctx,
    onChange: async (item, value) => {
      if (item.id === "freeflow.sessionMode") {
        const result = await handleModeCommand(String(value), ctx, pi);
        return { changed: result.changed, reloadRequired: false };
      }
      await updateConfig(ctx.cwd, item, value, item.configScope ?? "repository");
      return { changed: true, reloadRequired: true };
    },
  });

  const savedTarget = settingsScope === "local" ? "personal overrides" : "repository settings";
  const reloaded = await finalizeSettingsSession(
    session,
    ctx,
    afterChange,
    `Freeflow ${savedTarget} saved. Reloading Freeflow runtime...`,
  );
  return { changed: session.changed, reloaded, error: session.failed ? "write_failed" : undefined };
}

export async function handleOutputRouterCommand(
  args: string | undefined,
  ctx: any,
  afterChange: (changed: boolean) => Promise<void> | void,
) {
  const action = (args ?? "").trim().toLowerCase();
  const raw = await readFreeflowConfig(ctx.cwd);

  if (await maybeBlockLayerMutation(action, ctx, "Output Router")) {
    return { changed: false, reloaded: false, error: "freeflow_inactive" };
  }

  if (action === "status") {
    const state = await readCapabilityState(ctx.cwd);
    const prefix = !state.configured || !state.enabled ? `${freeflowStatusText(state)}; ` : "";
    ctx.ui.notify(`${prefix}${outputRouterStatusText(raw)}`, !state.configured || !state.enabled ? "warning" : "info");
    return { changed: false, reloaded: false };
  }

  if (["enable", "on", "true", "disable", "off", "false"].includes(action)) {
    const enabled = ["enable", "on", "true"].includes(action);
    const item = outputRouterItems(raw).find((candidate) => candidate.id === "outputRouter.enabled")!;
    await updateConfig(ctx.cwd, item, enabled);
    await afterChange(true);
    ctx.ui.notify(`Output Router ${enabled ? "enabled" : "disabled"}. Reloading Freeflow runtime...`, "info");
    if (typeof ctx.reload === "function") {
      await ctx.reload();
      return { changed: true, reloaded: true };
    }
    ctx.ui.notify("Run /reload for Output Router changes to fully apply.", "warning");
    return { changed: true, reloaded: false };
  }

  if (action && action !== "settings") {
    ctx.ui.notify("Usage: /output-router, /output-router settings, or /output-router status", "warning");
    return { changed: false, reloaded: false, error: "invalid_action" };
  }

  const session = await openSettings({
    title: "Output Router Settings",
    items: outputRouterItems(raw),
    ctx,
    onChange: async (item, value) => {
      await updateConfig(ctx.cwd, item, value);
      return { changed: true, reloadRequired: true };
    },
  });

  const reloaded = await finalizeSettingsSession(
    session,
    ctx,
    afterChange,
    "Output Router settings saved. Reloading Freeflow runtime...",
    "Run /reload for Output Router changes to fully apply.",
  );
  return { changed: session.changed, reloaded, error: session.failed ? "write_failed" : undefined };
}

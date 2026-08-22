import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  handleModeCommand,
  readCapabilityState,
  readFreeflowConfig,
  readFreeflowConfigLayers,
  readFreeflowLocalConfig,
  readModeState,
  resetSessionOverrides,
  setSessionCoreOverride,
  VALID_MODES,
} from "../runtime/runtime-context.js";
import {
  PiSettingsComponent,
  type SettingsCommitResult,
  type SettingsEntry,
  type SettingsSessionResult,
  type SettingsWizard,
  type SettingsWizardStep,
} from "./settings-tui.js";
import { isPiFlowHost } from "../runtime/runtime-identity.js";
import type {
  CognitiveRoutingCapabilityState,
  CognitiveRoutingProfile,
  CognitiveRoutingProfileName,
  CognitiveRoutingThinkingLevel,
} from "../cognitive-routing/types.js";

const DEFAULT_FREEFLOW_ENABLED = true;
const DEFAULT_INTERACTION_CONTRACT_ENABLED = true;
const DEFAULT_SKILLS_ENABLED = true;
const DEFAULT_CONTEXT_VIRTUALIZATION_ENABLED = false;
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

type ConfigScope = "session" | "local" | "repository";
type ConfigSource = "session" | "local" | "repository" | "builtin";

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
  wizard?: () => SettingsWizard;
  parse?: (text: string) => unknown;
  format?: (value: unknown) => string;
  configScope?: ConfigScope;
  configValues?: Record<string, unknown>;
  effectiveValue?: unknown;
  effectiveSource?: ConfigSource;
  inheritedValue?: unknown;
  inheritedSource?: ConfigSource;
  localOverrideValue?: unknown;
  transient?: boolean;
};

type CognitiveRoutingSettingsController = {
  state(): { effective: boolean; controlMode: string; activeProfile?: string };
  setManualProfile(profile: "standard" | "reasoning"): Promise<{ status: string; reason?: string }>;
  setAutomaticControl(): Promise<{ status: string; reason?: string }>;
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

function booleanValue(value: unknown): string {
  return value === true ? "enabled" : "disabled";
}

function configValueForChoice(item: SettingsItem, value: unknown): unknown {
  const key = String(value);
  if (item.configValues && Object.hasOwn(item.configValues, key)) {
    return item.configValues[key];
  }
  return value;
}

function effectiveItemValue(item: SettingsItem): unknown {
  return item.effectiveValue === undefined ? item.value : item.effectiveValue;
}

function formatCoreValue(value: unknown): string {
  if (typeof value === "boolean") return booleanValue(value);
  if (isRecord(value) && typeof value.provider === "string" && typeof value.model === "string") {
    const effort = typeof value.thinkingLevel === "string" ? ` · ${value.thinkingLevel}` : "";
    return `${value.provider}/${value.model}${effort}`;
  }
  return String(value ?? "");
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
  if (item.configScope === "session" || item.configScope === "local") {
    item.effectiveValue = configValue === undefined ? item.inheritedValue : configValue;
    item.effectiveSource = configValue === undefined ? (item.inheritedSource ?? "builtin") : item.configScope;
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
    contextVirtualization: getPath(rawConfig, ["contextVirtualization"]) === true,
    skills: { enabled: getPath(repositorySkills, ["enabled"]) !== false },
    defaultMode: validModeOrUndefined(rawConfig.defaultMode) ?? "workflow",
  };
  const fallbackSources = {
    enabled: typeof getPath(rawConfig, ["enabled"]) === "boolean" ? "repository" : "builtin",
    interactionContract: typeof getPath(rawConfig, ["interactionContract"]) === "boolean" ? "repository" : "builtin",
    contextVirtualization:
      typeof getPath(rawConfig, ["contextVirtualization"]) === "boolean" ? "repository" : "builtin",
    skillsEnabled: typeof getPath(repositorySkills, ["enabled"]) === "boolean" ? "repository" : "builtin",
    defaultMode: validModeOrUndefined(rawConfig.defaultMode) === undefined ? "builtin" : "repository",
  } as const;
  return {
    localConfig,
    core: layers?.coreConfig ?? fallbackCore,
    sources: (layers?.sources ?? fallbackSources) as {
      enabled: ConfigSource;
      interactionContract: ConfigSource;
      contextVirtualization: ConfigSource;
      skillsEnabled: ConfigSource;
      defaultMode: ConfigSource;
    },
  };
}

function createSessionBooleanItem(options: {
  id: string;
  label: string;
  description: string;
  key: "enabled" | "interactionContract" | "skillsEnabled" | "contextVirtualization";
  inheritedValue: boolean;
  inheritedSource: ConfigSource;
  effectiveValue: boolean;
  effectiveSource: ConfigSource;
  sessionOverrides: Record<string, boolean>;
}): SettingsItem {
  const override = options.sessionOverrides[options.key];
  const item: SettingsItem = {
    id: options.id,
    label: options.label,
    description: options.description,
    kind: "enum",
    value: typeof override === "boolean" ? String(override) : LOCAL_INHERIT,
    values: [LOCAL_INHERIT, "true", "false"],
    valueLabels: {
      inherit: "Inherit configured value",
      true: "Enabled for this session",
      false: "Disabled for this session",
    },
    valueDescriptions: {
      inherit: `Use ${formatCoreValue(options.inheritedValue)} from ${options.inheritedSource}.`,
      true: "Temporarily enable this setting for the current Pi session.",
      false: "Temporarily disable this setting for the current Pi session.",
    },
    format: (value) => {
      if (value === LOCAL_INHERIT) return LOCAL_INHERIT;
      return booleanValue(value === "true");
    },
    configScope: "session",
    configValues: {
      inherit: undefined,
      true: true,
      false: false,
    },
    effectiveValue: options.effectiveValue,
    effectiveSource: options.effectiveSource,
    inheritedValue: options.inheritedValue,
    inheritedSource: options.inheritedSource,
  };
  item.displaySuffix = coreDisplaySuffix(item);
  return item;
}

function sessionFreeflowItems(
  state: Awaited<ReturnType<typeof readCapabilityState>>,
  modeState: Awaited<ReturnType<typeof readModeState>>,
  cognitiveRoutingController?: CognitiveRoutingSettingsController,
): SettingsItem[] {
  const sessionOverrides = state.sessionOverrides as Record<string, boolean>;
  const configured = state.configuredCoreConfig;
  const configuredSources = state.configuredSources as {
    enabled: ConfigSource;
    interactionContract: ConfigSource;
    contextVirtualization: ConfigSource;
    skillsEnabled: ConfigSource;
  };
  const effectiveSources = state.configSources as {
    enabled: ConfigSource;
    interactionContract: ConfigSource;
    contextVirtualization: ConfigSource;
    skillsEnabled: ConfigSource;
  };

  const freeflowItem = createSessionBooleanItem({
    id: "freeflow.enabled",
    label: "Freeflow",
    description: "Temporary master override for this Pi session.",
    key: "enabled",
    inheritedValue: configured.enabled,
    inheritedSource: configuredSources.enabled,
    effectiveValue: state.enabled,
    effectiveSource: effectiveSources.enabled,
    sessionOverrides,
  });
  const interactionItem = createSessionBooleanItem({
    id: "freeflow.interactionContract",
    label: "Interaction Contract",
    description: "Temporary Interaction Contract override for this Pi session.",
    key: "interactionContract",
    inheritedValue: configured.interactionContract,
    inheritedSource: configuredSources.interactionContract,
    effectiveValue: state.interactionContract.enabled,
    effectiveSource: effectiveSources.interactionContract,
    sessionOverrides,
  });
  const skillsItem = createSessionBooleanItem({
    id: "freeflow.skills.enabled",
    label: "Skills",
    description: "Temporary Freeflow Skills override for this Pi session.",
    key: "skillsEnabled",
    inheritedValue: configured.skills.enabled,
    inheritedSource: configuredSources.skillsEnabled,
    effectiveValue: state.skills.enabled,
    effectiveSource: effectiveSources.skillsEnabled,
    sessionOverrides,
  });
  const contextVirtualizationItem = createSessionBooleanItem({
    id: "freeflow.contextVirtualization",
    label: "Context Virtualization",
    description: "Temporary Context Virtualization override for this Pi session.",
    key: "contextVirtualization",
    inheritedValue: configured.contextVirtualization,
    inheritedSource: configuredSources.contextVirtualization,
    effectiveValue: state.contextVirtualization.enabled,
    effectiveSource: effectiveSources.contextVirtualization,
    sessionOverrides,
  });

  const freeflowInactive = !state.enabled;
  const skillsEnabled = state.skills.enabled;
  interactionItem.inactive = freeflowInactive;
  skillsItem.inactive = freeflowInactive;
  contextVirtualizationItem.inactive = freeflowInactive;

  const sessionMode = modeState.currentMode ?? "default";
  const sessionModeItem: SettingsItem = {
    id: "freeflow.sessionMode",
    label: "Mode",
    description: "Temporary mode override for this Pi session.",
    kind: "enum",
    value: sessionMode,
    values: ["default", ...MODE_VALUES],
    valueLabels: {
      ...MODE_LABELS,
      default: "Use configured default",
    },
    valueDescriptions: {
      default: `${modeState.defaultMode} from ${modeState.defaultModeSource}`,
      ...MODE_DESCRIPTIONS,
    },
    inactive: freeflowInactive || !skillsEnabled,
    displaySuffix: sessionModeDisplaySuffix(
      sessionMode,
      modeState.defaultMode,
      modeState.defaultModeSource,
      freeflowInactive || !skillsEnabled,
    ),
    inheritedValue: modeState.defaultMode,
    inheritedSource: modeState.defaultModeSource,
  };

  const cognitiveRoutingState = cognitiveRoutingController?.state();
  const cognitiveRoutingProfile =
    cognitiveRoutingState?.controlMode === "manual-standard"
      ? "standard"
      : cognitiveRoutingState?.controlMode === "manual-reasoning"
        ? "reasoning"
        : "auto";
  const cognitiveRoutingItem: SettingsItem | undefined = state.cognitiveRouting
    ? {
        id: "freeflow.cognitiveRouting.profile",
        label: "Cognitive Routing",
        description: "Hold a profile manually or release the hold for automatic model control.",
        kind: "enum",
        value: cognitiveRoutingProfile,
        values: ["auto", "standard", "reasoning"],
        valueLabels: {
          auto: "automatic",
          standard: "manual · standard",
          reasoning: "manual · reasoning",
        },
        valueDescriptions: {
          auto: "Release the manual hold without forcing a model transition.",
          standard: "Hold the standard profile until /freeflow profile auto.",
          reasoning: "Hold the reasoning profile until /freeflow profile auto.",
        },
        inactive: !state.cognitiveRouting.effective || cognitiveRoutingController === undefined,
        displaySuffix: cognitiveRoutingState?.effective ? cognitiveRoutingProfile : "unavailable",
      }
    : undefined;

  return [
    freeflowItem,
    interactionItem,
    skillsItem,
    sessionModeItem,
    ...(cognitiveRoutingItem ? [cognitiveRoutingItem] : []),
    {
      id: "freeflow.session.reset",
      label: "Reset session overrides",
      description:
        "Clear Freeflow, Interaction Contract, Skills, Context Virtualization, and mode overrides for this Pi session.",
      kind: "enum",
      value: "available",
      values: ["reset"],
      valueLabels: { reset: "Reset all session overrides" },
      valueDescriptions: { reset: "Return every session setting to its configured value." },
      format: () => "available",
      transient: true,
    },
    contextVirtualizationItem,
  ];
}

const COGNITIVE_ROUTING_THINKING_LEVELS: CognitiveRoutingThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const COGNITIVE_ROUTING_EFFORT_DESCRIPTIONS: Record<CognitiveRoutingThinkingLevel, string> = {
  off: "No reasoning",
  minimal: "Very brief reasoning",
  low: "Light reasoning",
  medium: "Moderate reasoning",
  high: "Deep reasoning",
  xhigh: "Extra-high reasoning",
  max: "Maximum reasoning",
};

type CognitiveRoutingModelOption = {
  key: string;
  provider: string;
  model: string;
  label: string;
  description: string;
  thinkingLevels: CognitiveRoutingThinkingLevel[];
};

function cognitiveRoutingModelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function isCognitiveRoutingProfile(value: unknown): value is CognitiveRoutingProfile {
  return (
    isRecord(value) &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    typeof value.thinkingLevel === "string" &&
    COGNITIVE_ROUTING_THINKING_LEVELS.includes(value.thinkingLevel as CognitiveRoutingThinkingLevel)
  );
}

function cognitiveRoutingThinkingLevels(model: any, registry: any): CognitiveRoutingThinkingLevel[] {
  if (typeof registry?.clampThinkingLevel !== "function") {
    return model?.reasoning === true ? [...COGNITIVE_ROUTING_THINKING_LEVELS] : ["off"];
  }
  return COGNITIVE_ROUTING_THINKING_LEVELS.filter((level) => {
    try {
      return registry.clampThinkingLevel(model, level) === level;
    } catch {
      return false;
    }
  });
}

function cognitiveRoutingModelOptions(ctx: any): CognitiveRoutingModelOption[] {
  const registry = ctx?.modelRegistry;
  if (typeof registry?.getAvailable !== "function") return [];
  let models: any[];
  try {
    models = registry.getAvailable();
  } catch {
    return [];
  }
  if (!Array.isArray(models)) return [];

  return models
    .filter((model) => typeof model?.provider === "string" && typeof model?.id === "string")
    .map((model) => {
      const thinkingLevels = cognitiveRoutingThinkingLevels(model, registry);
      const provider = model.provider as string;
      const modelId = model.id as string;
      const key = cognitiveRoutingModelKey(provider, modelId);
      const displayName = typeof model.name === "string" && model.name !== modelId ? model.name : undefined;
      return {
        key,
        provider,
        model: modelId,
        label: key,
        description: displayName ? `${displayName} · ${thinkingLevels.join(", ")}` : thinkingLevels.join(", "),
        thinkingLevels,
      };
    })
    .filter((model) => model.thinkingLevels.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function cognitiveRoutingProfileDisplay(value: unknown): string {
  return isCognitiveRoutingProfile(value) ? formatCoreValue(value) : "not configured";
}

function cognitiveRoutingSettingsSource(source: unknown): ConfigSource {
  if (source === "repository") return "repository";
  if (source === "personal" || source === "local") return "local";
  return "builtin";
}

function cognitiveRoutingProfileDisplaySuffix(source: unknown, scope: ConfigScope): string | undefined {
  if (!source) return undefined;
  if (source === "personal" && scope === "repository") return "(effective personal)";
  return `(${source})`;
}

function cognitiveRoutingConfirmStep(summary: string): SettingsWizardStep {
  return {
    title: "Confirm preset",
    choices: [
      {
        key: "__save__",
        value: "save",
        label: `Save ${summary}`,
        description: "Write the complete profile atomically.",
      },
      { key: "__cancel__", value: "cancel", label: "Cancel", description: "Leave the previous preset unchanged." },
    ],
    selectedKey: "__save__",
  };
}

function createCognitiveRoutingProfileWizard(
  currentValue: unknown,
  models: CognitiveRoutingModelOption[],
  allowInherit: boolean,
): SettingsWizard {
  const currentProfile = isCognitiveRoutingProfile(currentValue) ? currentValue : undefined;
  const currentModelKey = currentProfile
    ? cognitiveRoutingModelKey(currentProfile.provider, currentProfile.model)
    : undefined;
  const firstChoices = [
    ...(allowInherit
      ? [
          {
            key: LOCAL_INHERIT,
            value: LOCAL_INHERIT,
            label: "Inherit repository preset",
            description: "Remove the personal override without changing the repository preset.",
          },
        ]
      : []),
    ...models.map((model) => ({
      key: model.key,
      value: model,
      label: model.label,
      description: model.description,
    })),
  ];
  if (firstChoices.length === 0) {
    firstChoices.push({
      key: "__cancel__",
      value: "cancel",
      label: "No authenticated models available",
      description: "Authenticate a provider before configuring this preset.",
    });
  }

  return {
    firstStep: () => ({
      title: "Choose model",
      choices: firstChoices,
      selectedKey:
        currentValue === LOCAL_INHERIT
          ? LOCAL_INHERIT
          : firstChoices.some((choice) => choice.key === currentModelKey)
            ? currentModelKey
            : firstChoices[0]?.key,
    }),
    nextStep: (selectedValues) => {
      if (selectedValues.length === 1) {
        const selected = selectedValues[0];
        if (selected === LOCAL_INHERIT) {
          return cognitiveRoutingConfirmStep("inherit repository preset");
        }
        const model = selected as CognitiveRoutingModelOption;
        if (!model?.key || model.thinkingLevels.length === 0) return undefined;
        const currentEffort =
          currentProfile && currentModelKey === model.key ? currentProfile.thinkingLevel : undefined;
        return {
          title: `Choose effort · ${model.label}`,
          choices: model.thinkingLevels.map((level) => ({
            key: level,
            value: level,
            label: level,
            description: COGNITIVE_ROUTING_EFFORT_DESCRIPTIONS[level],
          })),
          selectedKey:
            currentEffort && model.thinkingLevels.includes(currentEffort) ? currentEffort : model.thinkingLevels[0],
        };
      }
      if (selectedValues.length === 2) {
        const model = selectedValues[0] as CognitiveRoutingModelOption;
        const effort = selectedValues[1] as CognitiveRoutingThinkingLevel;
        return cognitiveRoutingConfirmStep(`${model.label} · ${effort}`);
      }
      return undefined;
    },
    valueFromSelections: (selectedValues) => {
      if (selectedValues[0] === LOCAL_INHERIT) return undefined;
      const model = selectedValues[0] as CognitiveRoutingModelOption;
      return {
        provider: model.provider,
        model: model.model,
        thinkingLevel: selectedValues[1] as CognitiveRoutingThinkingLevel,
      } satisfies CognitiveRoutingProfile;
    },
  };
}

function cognitiveRoutingProfileItem(options: {
  name: CognitiveRoutingProfileName;
  scope: ConfigScope;
  rawConfig: Record<string, unknown>;
  localConfig: Record<string, unknown>;
  capabilityState: CognitiveRoutingCapabilityState | undefined;
  ctx: any;
}): SettingsItem {
  const path = ["cognitiveRouting", "profiles", options.name];
  const repositoryProfile = getPath(options.rawConfig, path);
  const localProfile = getPath(options.localConfig, path);
  const effectiveProfile = options.capabilityState?.profiles?.[options.name] ?? repositoryProfile;
  const localValue = isCognitiveRoutingProfile(localProfile) ? localProfile : LOCAL_INHERIT;
  const value = options.scope === "local" ? localValue : repositoryProfile;
  const source =
    options.capabilityState?.profileSources?.[options.name] ??
    (isCognitiveRoutingProfile(repositoryProfile) ? "repository" : undefined);
  const models = cognitiveRoutingModelOptions(options.ctx);
  const inactive = options.scope === "local" && models.length === 0 && localValue !== LOCAL_INHERIT;

  return {
    id: `freeflow.cognitiveRouting.${options.name}`,
    label: `${options.name.charAt(0).toUpperCase()}${options.name.slice(1)} preset`,
    description:
      "Choose an authenticated available model and one effort supported by that model. Confirming writes the complete preset; cancel leaves it unchanged.",
    path,
    kind: "string",
    value,
    format: cognitiveRoutingProfileDisplay,
    configScope: options.scope,
    effectiveValue: effectiveProfile,
    effectiveSource: cognitiveRoutingSettingsSource(source),
    inheritedValue: repositoryProfile,
    inheritedSource: "repository",
    inactive,
    displaySuffix: cognitiveRoutingProfileDisplaySuffix(source, options.scope),
    wizard: () => createCognitiveRoutingProfileWizard(value, models, options.scope === "local"),
  };
}

function freeflowItems(
  rawConfig: Record<string, unknown>,
  modeState?: Awaited<ReturnType<typeof readModeState>>,
  options: {
    scope?: ConfigScope;
    layers?: Awaited<ReturnType<typeof readFreeflowConfigLayers>>;
    cognitiveRouting?: CognitiveRoutingCapabilityState;
    ctx?: any;
    hostInfo?: unknown;
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
  const contextVirtualizationItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.contextVirtualization",
    label: "Context Virtualization",
    description: "Let the model archive consumed tool results from future context while preserving session history.",
    path: ["contextVirtualization"],
    effectiveValue: core.contextVirtualization,
    effectiveSource: sources.contextVirtualization,
    defaultValue: DEFAULT_CONTEXT_VIRTUALIZATION_ENABLED,
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
  contextVirtualizationItem.inactive = freeflowInactive;
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

  const cognitiveRoutingState = options.cognitiveRouting;
  const cognitiveRoutingRuntimeDisabled = !isPiFlowHost(options.hostInfo);
  const cognitiveRoutingGroup = (() => {
    const cognitiveRoutingEnabledItem = createScopedBooleanItem({
      scope,
      rawConfig,
      localConfig,
      id: "freeflow.cognitiveRouting.enabled",
      label: "Enabled",
      description: cognitiveRoutingRuntimeDisabled
        ? "Configured for PiFlow, but disabled in normal Pi."
        : "Allow Cognitive Routing to own the session model lease and switch the configured profiles.",
      path: ["cognitiveRouting", "enabled"],
      effectiveValue: cognitiveRoutingState?.enabled ?? false,
      effectiveSource: cognitiveRoutingSettingsSource(cognitiveRoutingState?.enabledSource),
      defaultValue: false,
    });
    cognitiveRoutingEnabledItem.inactive = freeflowInactive || cognitiveRoutingRuntimeDisabled;

    const cognitiveRoutingProfiles = ["standard", "reasoning"].map((name) =>
      cognitiveRoutingProfileItem({
        name: name as CognitiveRoutingProfileName,
        scope,
        rawConfig,
        localConfig,
        capabilityState: cognitiveRoutingState,
        ctx: options.ctx,
      }),
    );
    for (const item of cognitiveRoutingProfiles) {
      item.inactive ||= freeflowInactive || cognitiveRoutingRuntimeDisabled;
    }
    const cognitiveRoutingStatus = cognitiveRoutingRuntimeDisabled
      ? "disabled · PiFlow only"
      : cognitiveRoutingState
        ? cognitiveRoutingState.effective
          ? "active"
          : cognitiveRoutingState.blockingReason?.code === "profile_missing"
            ? "not configured"
            : (cognitiveRoutingState.blockingReason?.code ?? "inactive")
        : "unavailable";
    return {
      id: "freeflow.cognitiveRouting",
      label: "Cognitive Routing",
      description: cognitiveRoutingRuntimeDisabled
        ? "Cognitive Routing configuration is visible for inspection but can only run in PiFlow."
        : "Configure the automatic standard/reasoning profiles and choose whether Freeflow may manage model state for this repository.",
      kind: "group" as const,
      value: cognitiveRoutingRuntimeDisabled ? false : (cognitiveRoutingState?.enabled ?? false),
      inactive: freeflowInactive,
      displaySuffix: cognitiveRoutingStatus,
      children: [cognitiveRoutingEnabledItem, ...cognitiveRoutingProfiles],
    } satisfies SettingsItem;
  })();

  return [
    freeflowItem,
    interactionItem,
    skillsItem,
    sessionModeItem,
    defaultModeItem,
    ...(cognitiveRoutingGroup ? [cognitiveRoutingGroup] : []),
    contextVirtualizationItem,
  ];
}

function pruneKnownDefaults(config: Record<string, unknown>) {
  const defaultPaths: Array<{ path: string[]; value: unknown }> = [
    { path: ["enabled"], value: DEFAULT_FREEFLOW_ENABLED },
    { path: ["interactionContract"], value: DEFAULT_INTERACTION_CONTRACT_ENABLED },
    { path: ["skills", "enabled"], value: DEFAULT_SKILLS_ENABLED },
  ];

  for (const item of defaultPaths) {
    if (valuesEqual(getPath(config, item.path), item.value)) {
      deletePath(config, item.path);
    }
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
  pruneKnownDefaults(next);
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await writeFile(join(cwd, ".freeflow/config.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function isCognitiveRoutingProfileItem(item: SettingsItem): boolean {
  return item.id === "freeflow.cognitiveRouting.standard" || item.id === "freeflow.cognitiveRouting.reasoning";
}

function valueForDisplay(item: SettingsItem): string {
  let value: string;
  if (isCognitiveRoutingProfileItem(item) && item.format) {
    value = item.format(effectiveItemValue(item));
  } else if (item.configScope === "local" || item.configScope === "session") {
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
  const sessionModeItem = findSettingsItem(items, "freeflow.sessionMode");
  const defaultModeItem = findSettingsItem(items, "freeflow.defaultMode");
  const cognitiveRoutingGroup = findSettingsItem(items, "freeflow.cognitiveRouting");
  const cognitiveRoutingEnabledItem = findSettingsItem(items, "freeflow.cognitiveRouting.enabled");
  const cognitiveRoutingProfiles = [
    findSettingsItem(items, "freeflow.cognitiveRouting.standard"),
    findSettingsItem(items, "freeflow.cognitiveRouting.reasoning"),
  ];

  if (sessionModeItem) {
    const defaultMode = String(
      defaultModeItem ? effectiveItemValue(defaultModeItem) : (sessionModeItem.inheritedValue ?? "workflow"),
    );
    const defaultSource = defaultModeItem?.effectiveSource ?? sessionModeItem.inheritedSource ?? "builtin";
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

  if (cognitiveRoutingGroup && cognitiveRoutingEnabledItem) {
    const enabled = effectiveItemValue(cognitiveRoutingEnabledItem) === true;
    const profilesConfigured = cognitiveRoutingProfiles.every((item) =>
      item ? isCognitiveRoutingProfile(effectiveItemValue(item)) : false,
    );
    cognitiveRoutingGroup.value = enabled;
    cognitiveRoutingGroup.displaySuffix = enabled
      ? profilesConfigured
        ? cognitiveRoutingGroup.displaySuffix === "active"
          ? "active"
          : "configured"
        : "not configured"
      : "disabled";
    cognitiveRoutingGroup.inactive = freeflowInactive;
  }

  walkSettingsItems(items, (candidate) => {
    if (candidate.id === "freeflow.session.reset") {
      candidate.inactive = false;
    } else if (candidate.configScope) {
      const inactive = candidate.id === "freeflow.enabled" ? false : freeflowInactive;
      const displayInactive = candidate.id === "freeflow.defaultMode" ? freeflowInactive || !skillsEnabled : inactive;
      candidate.inactive = inactive;
      candidate.displaySuffix = coreDisplaySuffix(candidate, displayInactive);
    } else if (candidate.id === "freeflow.sessionMode") {
      candidate.inactive = freeflowInactive || !skillsEnabled;
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

function resetSessionItemState(items: SettingsItem[]) {
  walkSettingsItems(items, (item) => {
    if (item.configScope === "session") {
      item.value = LOCAL_INHERIT;
      item.effectiveValue = item.inheritedValue;
      item.effectiveSource = item.inheritedSource ?? "builtin";
    } else if (item.id === "freeflow.sessionMode") {
      item.value = "default";
    }
  });
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
    wizard: item.wizard ? () => item.wizard!() : undefined,
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
              if (item.id === "freeflow.session.reset") {
                resetSessionItemState(rootItems);
              } else if (!item.transient) {
                item.value = value;
              }
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

function freeflowStatusText(
  state: Awaited<ReturnType<typeof readCapabilityState>>,
  cognitiveRoutingController?: CognitiveRoutingSettingsController,
): string {
  if (!state.configured) {
    return state.configExists
      ? `Freeflow: inactive (invalid config: ${state.parseError ?? "unknown parse error"}); run /setup-freeflow or fix .freeflow/config.json`
      : "Freeflow: inactive (repo not set up); run /setup-freeflow";
  }
  const sessionSuffix = (source: ConfigSource) => (source === "session" ? " (session override)" : "");
  const routingState = cognitiveRoutingController?.state();
  const cognitiveRouting = state.cognitiveRouting;
  const cognitiveRoutingStatus = cognitiveRouting
    ? cognitiveRouting.blockingReason?.code === "runtime_disabled"
      ? "disabled (PiFlow only)"
      : cognitiveRouting.effective
        ? routingState?.effective
          ? `active (${routingState.activeProfile ?? "unknown"}, ${routingState.controlMode})`
          : "effective (inactive)"
        : cognitiveRouting.enabled
          ? `blocked (${cognitiveRouting.blockingReason.code})`
          : "disabled"
    : undefined;
  return [
    `Freeflow: ${state.enabled ? "enabled" : "disabled"}${sessionSuffix(state.configSources.enabled as ConfigSource)}`,
    `interaction contract: ${state.interactionContract.effective ? "enabled" : "disabled"}${sessionSuffix(
      state.configSources.interactionContract as ConfigSource,
    )}`,
    `skills: ${state.skills.effective ? "enabled" : "disabled (workflow modes inactive)"}${sessionSuffix(
      state.configSources.skillsEnabled as ConfigSource,
    )}`,
    `context virtualization: ${state.contextVirtualization?.effective ? "enabled" : "disabled"}${sessionSuffix(
      state.configSources.contextVirtualization as ConfigSource,
    )}`,
    ...(cognitiveRoutingStatus ? [`cognitive routing: ${cognitiveRoutingStatus}`] : []),
  ].join("; ");
}

const NON_TUI_SETTINGS_GUIDANCE =
  "Freeflow settings require Pi TUI mode. Use /freeflow status to inspect current state; supported non-TUI changes are /freeflow enable, /freeflow disable, and /freeflow mode <conversation|workflow|strict-workflow|reset>.";
const NON_TUI_MODE_GUIDANCE =
  "Freeflow mode selector requires Pi TUI mode. Use /freeflow mode conversation, /freeflow mode workflow, /freeflow mode strict-workflow, or /freeflow mode reset.";

function ensureSettingsIdle(ctx: any): boolean {
  if (typeof ctx?.isIdle !== "function" || ctx.isIdle()) return true;
  ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
  return false;
}

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

async function finalizeSessionSettings(
  session: SettingsSessionResult,
  ctx: any,
  afterChange: (changed: boolean) => Promise<void> | void,
) {
  if (!session.changed) return false;

  await afterChange(true);
  if (session.failed) return false;
  if (!session.configChanged) {
    ctx.ui.notify("Freeflow session overrides updated.", "info");
    return false;
  }

  ctx.ui.notify("Freeflow session overrides updated. Reloading skills and resources...", "info");
  if (typeof ctx.reload !== "function") {
    ctx.ui.notify("Run /reload for Freeflow session overrides to fully apply.", "warning");
    return false;
  }

  await ctx.reload();
  return true;
}

export async function handleFreeflowCommand(
  args: string | undefined,
  ctx: any,
  afterChange: (changed: boolean) => Promise<void> | void,
  pi: any,
  cognitiveRoutingController?: CognitiveRoutingSettingsController,
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
    (!actionValue || ["session", "local", "personal", "repo", "repository", "shared"].includes(actionValue));
  if (nonTui && settingsSelector) {
    return nonTuiGuidance(ctx, NON_TUI_SETTINGS_GUIDANCE);
  }

  const [layers, state, modeState] = await Promise.all([
    readFreeflowConfigLayers(ctx.cwd),
    readCapabilityState(ctx.cwd, ctx, pi?.host),
    readModeState(ctx.cwd),
  ]);
  const configState = layers.repository;
  const raw = configState.valid ? configState.parsed : {};

  if (action === "status") {
    ctx.ui.notify(freeflowStatusText(state, cognitiveRoutingController), "info");
    return { changed: false, reloaded: false };
  }

  if (!configState.valid) {
    ctx.ui.notify(freeflowStatusText(state, cognitiveRoutingController), "warning");
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
    if (!ensureSettingsIdle(ctx)) return { changed: false, reloaded: false, error: "busy" };
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
      cognitiveRouting: state.cognitiveRouting as CognitiveRoutingCapabilityState,
      ctx,
      hostInfo: pi?.host,
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
    if (!ensureSettingsIdle(ctx)) return { changed: false, reloaded: false, error: "busy" };
    const enabled = ["enable", "on", "true"].includes(action);
    const item = freeflowItems(raw, modeState, {
      scope: "repository",
      layers,
      cognitiveRouting: state.cognitiveRouting as CognitiveRoutingCapabilityState,
      ctx,
      hostInfo: pi?.host,
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
  if (actionValue === "session") {
    settingsScope = "session";
  } else if (["repo", "repository", "shared"].includes(actionValue)) {
    settingsScope = "repository";
  } else if (actionValue && !["local", "personal"].includes(actionValue)) {
    ctx.ui.notify(
      "Usage: /freeflow settings, /freeflow settings session, /freeflow settings local, or /freeflow settings repo",
      "warning",
    );
    return { changed: false, reloaded: false, error: "invalid_scope" };
  }

  if (!ensureSettingsIdle(ctx)) return { changed: false, reloaded: false, error: "busy" };

  const items =
    settingsScope === "session"
      ? sessionFreeflowItems(state, modeState, cognitiveRoutingController)
      : freeflowItems(raw, modeState, {
          scope: settingsScope,
          layers,
          cognitiveRouting: state.cognitiveRouting as CognitiveRoutingCapabilityState,
          ctx,
          hostInfo: pi?.host,
        });
  const session = await openSettings({
    title:
      settingsScope === "session"
        ? "Freeflow Settings · Session overrides"
        : settingsScope === "local"
          ? "Freeflow Settings · Personal overrides"
          : "Freeflow Repository Settings · modifies .freeflow/config.json",
    items,
    ctx,
    onChange: async (item, value) => {
      if (!ensureSettingsIdle(ctx)) return { changed: false, reloadRequired: false };
      if (!isPiFlowHost(pi?.host) && item.id.startsWith("freeflow.cognitiveRouting.")) {
        ctx.ui.notify("Cognitive Routing is available only in PiFlow.", "warning");
        return { changed: false, reloadRequired: false };
      }
      if (item.id === "freeflow.sessionMode") {
        const result = await handleModeCommand(String(value), ctx, pi);
        return { changed: result.changed, reloadRequired: false };
      }
      if (item.id === "freeflow.cognitiveRouting.profile") {
        if (!cognitiveRoutingController) {
          ctx.ui.notify("Cognitive Routing is unavailable for this session.", "warning");
          return { changed: false, reloadRequired: false };
        }
        const result =
          value === "auto"
            ? await cognitiveRoutingController.setAutomaticControl()
            : await cognitiveRoutingController.setManualProfile(value as "standard" | "reasoning");
        if ((result.status !== "automatic" && result.status !== "active") || result.reason) {
          ctx.ui.notify(
            `Cognitive Routing settings could not be applied: ${result.reason ?? result.status}.`,
            "warning",
          );
          return { changed: false, reloadRequired: false };
        }
        await afterChange(false);
        return { changed: true, reloadRequired: false };
      }
      if (item.id === "freeflow.session.reset") {
        const result = await resetSessionOverrides(ctx, pi);
        return { changed: result.changed, reloadRequired: result.reloadRequired };
      }
      if (item.configScope === "session") {
        const keyById = {
          "freeflow.enabled": "enabled",
          "freeflow.interactionContract": "interactionContract",
          "freeflow.skills.enabled": "skillsEnabled",
          "freeflow.contextVirtualization": "contextVirtualization",
        } as const;
        const key = keyById[item.id as keyof typeof keyById];
        const override = value === LOCAL_INHERIT ? null : value === "true";
        const result = await setSessionCoreOverride(key, override, ctx, pi);
        return { changed: result.changed, reloadRequired: result.reloadRequired === true };
      }
      await updateConfig(ctx.cwd, item, value, item.configScope ?? "repository");
      return { changed: true, reloadRequired: true };
    },
  });

  if (settingsScope === "session") {
    const reloaded = await finalizeSessionSettings(session, ctx, afterChange);
    return { changed: session.changed, reloaded, error: session.failed ? "write_failed" : undefined };
  }

  const savedTarget = settingsScope === "local" ? "personal overrides" : "repository settings";
  const reloaded = await finalizeSettingsSession(
    session,
    ctx,
    afterChange,
    `Freeflow ${savedTarget} saved. Reloading Freeflow runtime...`,
  );
  return { changed: session.changed, reloaded, error: session.failed ? "write_failed" : undefined };
}

import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  readCapabilityState,
  readFreeflowConfig,
  readFreeflowConfigLayers,
  readFreeflowLocalConfig,
  resetSessionOverrides,
  setSessionCoreOverride,
} from "../runtime/runtime-context.js";
import { PiSettingsComponent } from "./settings-tui.js";
import { supportsPiSessionModelStateApi } from "../cognitive-routing/pi-session-control.js";
import { isPiFlowHost } from "../runtime/runtime-identity.js";
const DEFAULT_FREEFLOW_ENABLED = true;
const DEFAULT_CONTEXT_VIRTUALIZATION_ENABLED = false;
const DEFAULT_CONVERSATION_HISTORY_ENABLED = false;
const LOCAL_INHERIT = "inherit";
const execFileAsync = promisify(execFile);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cloneJson(value) {
  if (value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error(`Could not clone settings value: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function getPath(source, path) {
  let current = source;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}
function setPath(target, path, value) {
  let current = target;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (!isRecord(next)) {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}
function deletePath(target, path) {
  let current = target;
  const parents = [];
  for (const key of path.slice(0, -1)) {
    if (!isRecord(current)) return;
    parents.push({ object: current, key });
    current = current[key];
  }
  if (!isRecord(current)) return;
  delete current[path[path.length - 1]];
  for (let index = parents.length - 1; index >= 0; index--) {
    const { object, key } = parents[index];
    const child = object[key];
    if (isRecord(child) && Object.keys(child).length === 0) {
      delete object[key];
    }
  }
}
function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function isEmptyValue(value) {
  return Array.isArray(value) && value.length === 0;
}
function setConfigValue(config, item, value) {
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
function booleanValue(value) {
  return value === true ? "enabled" : "disabled";
}
function configValueForChoice(item, value) {
  const key = String(value);
  if (item.configValues && Object.hasOwn(item.configValues, key)) {
    return item.configValues[key];
  }
  return value;
}
function effectiveItemValue(item) {
  return item.effectiveValue === undefined ? item.value : item.effectiveValue;
}
function formatCoreValue(value) {
  if (typeof value === "boolean") return booleanValue(value);
  if (isRecord(value) && typeof value.provider === "string" && typeof value.model === "string") {
    const effort = typeof value.thinkingLevel === "string" ? ` · ${value.thinkingLevel}` : "";
    return `${value.provider}/${value.model}${effort}`;
  }
  return String(value ?? "");
}
function coreDisplaySuffix(item, inactive = false) {
  const source = item.effectiveSource ?? "builtin";
  const parts =
    item.configScope === "repository" && source === "local"
      ? [`effective ${formatCoreValue(effectiveItemValue(item))}`, source]
      : [source];
  if (inactive) parts.push("inactive");
  return `(${parts.join(" · ")})`;
}
function updateScopedItemState(item, value) {
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
function createScopedBooleanItem(options) {
  const repositoryValue = getPath(options.rawConfig, options.path);
  const inheritedValue = typeof repositoryValue === "boolean" ? repositoryValue : options.defaultValue;
  const inheritedSource = typeof repositoryValue === "boolean" ? "repository" : "builtin";
  const localValue = getPath(options.localConfig, options.path);
  let item;
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
function resolveSettingsCoreView(rawConfig, layers) {
  const localConfig = layers?.local.valid && isRecord(layers.local.parsed) ? layers.local.parsed : {};
  const fallbackCore = {
    enabled: getPath(rawConfig, ["enabled"]) !== false,
    contextVirtualization: getPath(rawConfig, ["contextVirtualization"]) === true,
    conversationHistory: getPath(rawConfig, ["conversationHistory"]) === true,
  };
  const fallbackSources = {
    enabled: typeof getPath(rawConfig, ["enabled"]) === "boolean" ? "repository" : "builtin",
    contextVirtualization:
      typeof getPath(rawConfig, ["contextVirtualization"]) === "boolean" ? "repository" : "builtin",
    conversationHistory: typeof getPath(rawConfig, ["conversationHistory"]) === "boolean" ? "repository" : "builtin",
  };
  return {
    localConfig,
    core: layers?.coreConfig ?? fallbackCore,
    sources: layers?.sources ?? fallbackSources,
  };
}
function createSessionBooleanItem(options) {
  const override = options.sessionOverrides[options.key];
  const item = {
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
function sessionFreeflowItems(state, cognitiveRoutingController) {
  const sessionOverrides = state.sessionOverrides;
  const configured = state.configuredCoreConfig;
  const configuredSources = state.configuredSources;
  const effectiveSources = state.configSources;
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
  const conversationHistoryItem = createSessionBooleanItem({
    id: "freeflow.conversationHistory",
    label: "Conversation History",
    description: "Temporary Conversation History override for this Pi session.",
    key: "conversationHistory",
    inheritedValue: configured.conversationHistory,
    inheritedSource: configuredSources.conversationHistory,
    effectiveValue: state.conversationHistory.enabled,
    effectiveSource: effectiveSources.conversationHistory,
    sessionOverrides,
  });
  const freeflowInactive = !state.enabled;
  contextVirtualizationItem.inactive = freeflowInactive;
  conversationHistoryItem.inactive = freeflowInactive;
  const cognitiveRoutingState = cognitiveRoutingController?.state();
  const cognitiveRoutingProfile =
    cognitiveRoutingState?.controlMode === "manual-standard"
      ? "standard"
      : cognitiveRoutingState?.controlMode === "manual-reasoning"
        ? "reasoning"
        : "auto";
  const cognitiveRoutingItem = state.cognitiveRouting
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
        inactive: freeflowInactive || !state.cognitiveRouting.effective || cognitiveRoutingController === undefined,
        runtimeInactive: state.cognitiveRouting.blockingReason?.code === "runtime_disabled",
        displaySuffix: cognitiveRoutingState?.effective ? cognitiveRoutingProfile : "unavailable",
      }
    : undefined;
  return [
    freeflowItem,
    ...(cognitiveRoutingItem ? [cognitiveRoutingItem] : []),
    {
      id: "freeflow.session.reset",
      label: "Reset session overrides",
      description: "Clear Freeflow, Context Virtualization, and Conversation History overrides for this Pi session.",
      kind: "enum",
      value: "available",
      values: ["reset"],
      valueLabels: { reset: "Reset all session overrides" },
      valueDescriptions: { reset: "Return every session setting to its configured value." },
      format: () => "available",
      transient: true,
    },
    {
      id: "freeflow.context",
      label: "Freeflow Context",
      description: "Choose which context projection and conversation-history operations are available to the model.",
      kind: "group",
      value: contextVirtualizationItem.effectiveValue === true || conversationHistoryItem.effectiveValue === true,
      displaySuffix: `${[contextVirtualizationItem, conversationHistoryItem].filter((item) => item.effectiveValue === true).length}/2 enabled`,
      children: [contextVirtualizationItem, conversationHistoryItem],
    },
  ];
}
const COGNITIVE_ROUTING_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const COGNITIVE_ROUTING_EFFORT_DESCRIPTIONS = {
  off: "No reasoning",
  minimal: "Very brief reasoning",
  low: "Light reasoning",
  medium: "Moderate reasoning",
  high: "Deep reasoning",
  xhigh: "Extra-high reasoning",
  max: "Maximum reasoning",
};
function cognitiveRoutingModelKey(provider, model) {
  return `${provider}/${model}`;
}
function isCognitiveRoutingProfile(value) {
  return (
    isRecord(value) &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    typeof value.thinkingLevel === "string" &&
    COGNITIVE_ROUTING_THINKING_LEVELS.includes(value.thinkingLevel)
  );
}
function cognitiveRoutingThinkingLevels(model, registry) {
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
function cognitiveRoutingModelOptions(ctx) {
  const registry = ctx?.modelRegistry;
  if (typeof registry?.getAvailable !== "function") return [];
  let models;
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
      const provider = model.provider;
      const modelId = model.id;
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
function cognitiveRoutingProfileDisplay(value) {
  return isCognitiveRoutingProfile(value) ? formatCoreValue(value) : "not configured";
}
function cognitiveRoutingSettingsSource(source) {
  if (source === "repository") return "repository";
  if (source === "personal" || source === "local") return "local";
  return "builtin";
}
function cognitiveRoutingProfileDisplaySuffix(source, scope) {
  if (!source) return undefined;
  if (source === "personal" && scope === "repository") return "(effective personal)";
  return `(${source})`;
}
function cognitiveRoutingConfirmStep(summary) {
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
function createCognitiveRoutingProfileWizard(currentValue, models, allowInherit) {
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
        const model = selected;
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
        const model = selectedValues[0];
        const effort = selectedValues[1];
        return cognitiveRoutingConfirmStep(`${model.label} · ${effort}`);
      }
      return undefined;
    },
    valueFromSelections: (selectedValues) => {
      if (selectedValues[0] === LOCAL_INHERIT) return undefined;
      const model = selectedValues[0];
      return {
        provider: model.provider,
        model: model.model,
        thinkingLevel: selectedValues[1],
      };
    },
  };
}
function cognitiveRoutingProfileItem(options) {
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
function cognitiveRoutingSessionStartItem(options) {
  const path = ["cognitiveRouting", "sessionStart", options.setting];
  const defaultValue = options.setting === "control" ? "automatic" : "reasoning";
  const values = options.setting === "control" ? ["automatic", "manual"] : ["standard", "reasoning"];
  const labels = Object.fromEntries(values.map((value) => [value, value]));
  const descriptions =
    options.setting === "control"
      ? {
          automatic: "Start the new session in Reasoning; automatic delegation may use Standard during execution.",
          manual: "Hold the selected profile for the new session until the user changes it.",
        }
      : {
          standard: "Start a new manual session with the configured Standard preset.",
          reasoning: "Start a new manual session with the configured Reasoning preset.",
        };
  const repositoryValue = getPath(options.rawConfig, path);
  const localValue = getPath(options.localConfig, path);
  const isValidValue = (value) => values.includes(value);
  const repositorySetting = isValidValue(repositoryValue) ? repositoryValue : undefined;
  const localSetting = isValidValue(localValue) ? localValue : undefined;
  const inheritedValue = repositorySetting ?? defaultValue;
  const inheritedSource = repositorySetting ? "repository" : "builtin";
  const configuredSource =
    options.capabilityState?.sessionStartSources?.[options.setting] ?? (repositorySetting ? "repository" : undefined);
  const effectiveSessionStartControl =
    options.capabilityState?.sessionStart?.control ??
    getPath(options.localConfig, ["cognitiveRouting", "sessionStart", "control"]) ??
    getPath(options.rawConfig, ["cognitiveRouting", "sessionStart", "control"]) ??
    "automatic";
  const effectiveValue =
    options.setting === "profile" && effectiveSessionStartControl === "automatic"
      ? "reasoning"
      : (options.capabilityState?.sessionStart?.[options.setting] ?? inheritedValue);
  const effectiveSource = cognitiveRoutingSettingsSource(configuredSource);
  const label = options.setting === "control" ? "Session start control" : "Manual session-start profile";
  const description =
    options.setting === "control"
      ? "Choose automatic or manual control for new sessions only; changing this does not alter the active session."
      : "Choose the profile for manual session starts; automatic sessions always start in Reasoning.";
  const item =
    options.scope === "local"
      ? {
          id: `freeflow.cognitiveRouting.sessionStart.${options.setting}`,
          label,
          description: `${description} Choose inherit to use the repository value; use /freeflow settings repo to edit shared defaults.`,
          path,
          kind: "enum",
          value: localSetting ?? LOCAL_INHERIT,
          values: [LOCAL_INHERIT, ...values],
          valueLabels: { inherit: "Inherit repository", ...labels },
          valueDescriptions: {
            inherit: `Use ${inheritedValue} from ${inheritedSource}.`,
            ...descriptions,
          },
          format: (value) => String(value),
          configScope: "local",
          configValues: { inherit: undefined },
          effectiveValue,
          effectiveSource,
          inheritedValue,
          inheritedSource,
        }
      : {
          id: `freeflow.cognitiveRouting.sessionStart.${options.setting}`,
          label,
          description: `${description} This edits shared .freeflow/config.json.`,
          path,
          kind: "enum",
          value: inheritedValue,
          values,
          valueLabels: labels,
          valueDescriptions: descriptions,
          format: (value) => String(value),
          defaultValue,
          configScope: "repository",
          effectiveValue,
          effectiveSource,
          localOverrideValue: localSetting,
        };
  item.displaySuffix = coreDisplaySuffix(item);
  return item;
}
function isCognitiveRoutingRuntimeAvailable(pi) {
  return isPiFlowHost(pi?.host) || supportsPiSessionModelStateApi(pi);
}
function freeflowItems(rawConfig, options = {}) {
  const scope = options.scope ?? "repository";
  const layers = options.layers;
  const { localConfig, core, sources } = resolveSettingsCoreView(rawConfig, layers);
  const freeflowItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.enabled",
    label: "Freeflow",
    description: "Master switch for Freeflow's core guidance, skills, and optional capabilities in this checkout.",
    path: ["enabled"],
    effectiveValue: core.enabled,
    effectiveSource: sources.enabled,
    defaultValue: DEFAULT_FREEFLOW_ENABLED,
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
  const conversationHistoryItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.conversationHistory",
    label: "Conversation History",
    description: "Let the model search and retrieve hidden conversation history on the active branch.",
    path: ["conversationHistory"],
    effectiveValue: core.conversationHistory,
    effectiveSource: sources.conversationHistory,
    defaultValue: DEFAULT_CONVERSATION_HISTORY_ENABLED,
  });
  const freeflowInactive = !core.enabled;
  contextVirtualizationItem.inactive = freeflowInactive;
  conversationHistoryItem.inactive = freeflowInactive;
  const cognitiveRoutingState = options.cognitiveRouting;
  const cognitiveRoutingRuntimeDisabled = options.runtimeAvailable !== true;
  const cognitiveRoutingGroup = (() => {
    const cognitiveRoutingEnabledItem = createScopedBooleanItem({
      scope,
      rawConfig,
      localConfig,
      id: "freeflow.cognitiveRouting.enabled",
      label: "Enabled",
      description: cognitiveRoutingRuntimeDisabled
        ? "Requires a host model-state control API; configuration is read-only on this host."
        : "Allow Cognitive Routing to own the session model lease and switch the configured profiles.",
      path: ["cognitiveRouting", "enabled"],
      effectiveValue: cognitiveRoutingState?.enabled ?? false,
      effectiveSource: cognitiveRoutingSettingsSource(cognitiveRoutingState?.enabledSource),
      defaultValue: false,
    });
    cognitiveRoutingEnabledItem.inactive = freeflowInactive || cognitiveRoutingRuntimeDisabled;
    cognitiveRoutingEnabledItem.runtimeInactive = cognitiveRoutingRuntimeDisabled;
    const cognitiveRoutingProfiles = ["standard", "reasoning"].map((name) =>
      cognitiveRoutingProfileItem({
        name: name,
        scope,
        rawConfig,
        localConfig,
        capabilityState: cognitiveRoutingState,
        ctx: options.ctx,
      }),
    );
    const cognitiveRoutingSessionStart = ["control", "profile"].map((setting) =>
      cognitiveRoutingSessionStartItem({
        setting,
        scope,
        rawConfig,
        localConfig,
        capabilityState: cognitiveRoutingState,
      }),
    );
    for (const item of [...cognitiveRoutingProfiles, ...cognitiveRoutingSessionStart]) {
      item.inactive ||= freeflowInactive || cognitiveRoutingRuntimeDisabled;
      item.runtimeInactive = cognitiveRoutingRuntimeDisabled;
    }
    const cognitiveRoutingStatus = cognitiveRoutingRuntimeDisabled
      ? "unavailable · host unsupported"
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
        ? "Cognitive Routing configuration is visible for inspection but requires a host model-state control API."
        : "Configure the Standard and Reasoning profiles and choose whether Freeflow may manage model state for this repository.",
      kind: "group",
      value: cognitiveRoutingRuntimeDisabled ? false : (cognitiveRoutingState?.enabled ?? false),
      inactive: freeflowInactive,
      displaySuffix: cognitiveRoutingStatus,
      children: [cognitiveRoutingEnabledItem, ...cognitiveRoutingProfiles, ...cognitiveRoutingSessionStart],
    };
  })();
  return [
    freeflowItem,
    ...(cognitiveRoutingGroup ? [cognitiveRoutingGroup] : []),
    {
      id: "freeflow.context",
      label: "Freeflow Context",
      description: "Choose which context projection and conversation-history operations are available to the model.",
      kind: "group",
      value: contextVirtualizationItem.effectiveValue === true || conversationHistoryItem.effectiveValue === true,
      displaySuffix: `${[contextVirtualizationItem, conversationHistoryItem].filter((item) => item.effectiveValue === true).length}/2 enabled`,
      children: [contextVirtualizationItem, conversationHistoryItem],
    },
  ];
}
function pruneKnownDefaults(config) {
  const defaultPaths = [
    { path: ["enabled"], value: DEFAULT_FREEFLOW_ENABLED },
    { path: ["contextVirtualization"], value: DEFAULT_CONTEXT_VIRTUALIZATION_ENABLED },
    { path: ["conversationHistory"], value: DEFAULT_CONVERSATION_HISTORY_ENABLED },
  ];
  for (const item of defaultPaths) {
    if (valuesEqual(getPath(config, item.path), item.value)) {
      deletePath(config, item.path);
    }
  }
}
async function ensureLocalConfigIgnored(cwd) {
  let gitPath;
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
async function updateConfig(cwd, item, value, scope = item.configScope ?? "repository") {
  if (scope === "local") {
    if (!item.path?.length) {
      throw new Error(`${item.label} is a settings group, not a writable setting.`);
    }
    const current = await readFreeflowLocalConfig(cwd);
    const next = cloneJson(current);
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
  const next = cloneJson(current);
  setConfigValue(next, item, value);
  pruneKnownDefaults(next);
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await writeFile(join(cwd, ".freeflow/config.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
function isCognitiveRoutingProfileItem(item) {
  return item.id === "freeflow.cognitiveRouting.standard" || item.id === "freeflow.cognitiveRouting.reasoning";
}
function valueForDisplay(item) {
  let value;
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
function walkSettingsItems(items, visitor) {
  for (const item of items) {
    visitor(item);
    if (item.children) walkSettingsItems(item.children, visitor);
  }
}
function findSettingsItem(items, id) {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children ? findSettingsItem(item.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}
function refreshSettingsDerivedState(items) {
  const freeflowItem = findSettingsItem(items, "freeflow.enabled");
  const freeflowInactive = freeflowItem ? effectiveItemValue(freeflowItem) !== true : false;
  const cognitiveRoutingGroup = findSettingsItem(items, "freeflow.cognitiveRouting");
  const cognitiveRoutingEnabledItem = findSettingsItem(items, "freeflow.cognitiveRouting.enabled");
  const cognitiveRoutingProfiles = [
    findSettingsItem(items, "freeflow.cognitiveRouting.standard"),
    findSettingsItem(items, "freeflow.cognitiveRouting.reasoning"),
  ];
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
  const contextGroup = findSettingsItem(items, "freeflow.context");
  if (contextGroup?.children?.length) {
    const enabledCount = contextGroup.children.filter((item) => effectiveItemValue(item) === true).length;
    contextGroup.value = enabledCount > 0;
    contextGroup.displaySuffix = `${enabledCount}/${contextGroup.children.length} enabled`;
  }
  walkSettingsItems(items, (candidate) => {
    if (candidate.id === "freeflow.session.reset") {
      candidate.inactive = false;
    } else if (candidate.configScope) {
      const inactive =
        candidate.id === "freeflow.enabled" ? false : candidate.runtimeInactive === true || freeflowInactive;
      candidate.inactive = inactive;
      candidate.displaySuffix = coreDisplaySuffix(candidate, inactive);
    } else {
      candidate.inactive = candidate.runtimeInactive === true || freeflowInactive;
    }
  });
}
function settingsChoices(item) {
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
function resetSessionItemState(items) {
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
function settingsEntries(items, rootItems, onChange) {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    currentValue: () => valueForDisplay(item),
    inactive: () => item.inactive === true,
    currentChoiceKey: () => String(item.value),
    choices: settingsChoices(item),
    children: item.children ? () => settingsEntries(item.children, rootItems, onChange) : undefined,
    wizard: item.wizard ? () => item.wizard() : undefined,
    edit:
      !item.children && !["boolean", "enum", "group"].includes(item.kind)
        ? {
            initialValue: () => valueForDisplay(item),
            parse: (text) => (item.parse ? item.parse(text) : text),
          }
        : undefined,
    commit:
      item.kind === "group"
        ? undefined
        : async (value) => {
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
async function openSettings(options) {
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
  let component;
  await options.ctx.ui.custom((tui, theme, _keybindings, done) => {
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
function freeflowStatusText(state, cognitiveRoutingController) {
  if (!state.configured) {
    return state.configExists
      ? `Freeflow: inactive (invalid config: ${state.parseError ?? "unknown parse error"}); run /setup-freeflow or fix .freeflow/config.json`
      : "Freeflow: inactive (repo not set up); run /setup-freeflow";
  }
  const sessionSuffix = (source) => (source === "session" ? " (session override)" : "");
  const routingState = cognitiveRoutingController?.state();
  const cognitiveRouting = state.cognitiveRouting;
  const cognitiveRoutingStatus = cognitiveRouting
    ? cognitiveRouting.blockingReason?.code === "runtime_disabled"
      ? "unavailable (host unsupported)"
      : cognitiveRouting.effective
        ? routingState?.effective
          ? `active (${routingState.activeProfile ?? "unknown"}, ${routingState.controlMode})`
          : "effective (inactive)"
        : cognitiveRouting.enabled
          ? `blocked (${cognitiveRouting.blockingReason.code})`
          : "disabled"
    : undefined;
  const contextEnabled = state.contextVirtualization?.effective || state.conversationHistory?.effective;
  return [
    `Freeflow: ${state.enabled ? "enabled" : "disabled"}${sessionSuffix(state.configSources.enabled)}`,
    `context: ${contextEnabled ? "enabled" : "disabled"} (virtualization ${state.contextVirtualization?.effective ? "enabled" : "disabled"}, history ${state.conversationHistory?.effective ? "enabled" : "disabled"})`,
    ...(cognitiveRoutingStatus ? [`cognitive routing: ${cognitiveRoutingStatus}`] : []),
  ].join("; ");
}
const NON_TUI_SETTINGS_GUIDANCE =
  "Freeflow settings require Pi TUI mode. Use /freeflow status to inspect current state; supported non-TUI changes are /freeflow enable and /freeflow disable.";
function ensureSettingsIdle(ctx) {
  if (typeof ctx?.isIdle !== "function" || ctx.isIdle()) return true;
  ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
  return false;
}
function nonTuiGuidance(ctx, message) {
  if (ctx?.hasUI === false) throw new Error(message);
  ctx?.ui?.notify?.(message, "warning");
  return { changed: false, reloaded: false, error: "tui_required" };
}
async function finalizeSettingsSession(
  session,
  ctx,
  afterChange,
  savedMessage,
  reloadWarning = "Run /reload for Freeflow changes to fully apply.",
  afterChangeOptions = {},
) {
  if (!session.configChanged) return false;
  await afterChange(true, afterChangeOptions);
  if (session.failed) return false;
  ctx.ui.notify(savedMessage, "info");
  if (typeof ctx.reload !== "function") {
    ctx.ui.notify(reloadWarning, "warning");
    return false;
  }
  await ctx.reload();
  return true;
}
async function finalizeSessionSettings(session, ctx, afterChange) {
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
export async function handleFreeflowCommand(args, ctx, afterChange, pi, cognitiveRoutingController) {
  const input = (args ?? "settings").trim().toLowerCase() || "settings";
  const [action, ...rest] = input.split(/\s+/);
  const actionValue = rest.join(" ");
  const nonTui = ctx?.mode && ctx.mode !== "tui";
  const settingsSelector =
    action === "settings" &&
    (!actionValue || ["session", "local", "personal", "repo", "repository", "shared"].includes(actionValue));
  if (nonTui && settingsSelector) {
    return nonTuiGuidance(ctx, NON_TUI_SETTINGS_GUIDANCE);
  }
  const [layers, state] = await Promise.all([
    readFreeflowConfigLayers(ctx.cwd),
    readCapabilityState(ctx.cwd, ctx, pi?.host),
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
  if (["enable", "on", "true", "disable", "off", "false"].includes(action)) {
    if (!ensureSettingsIdle(ctx)) return { changed: false, reloaded: false, error: "busy" };
    const enabled = ["enable", "on", "true"].includes(action);
    const item = freeflowItems(raw, {
      scope: "repository",
      layers,
      cognitiveRouting: state.cognitiveRouting,
      ctx,
      runtimeAvailable: isCognitiveRoutingRuntimeAvailable(pi),
    }).find((candidate) => candidate.id === "freeflow.enabled");
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
      "Usage: /freeflow, /freeflow settings [local|repo], /freeflow status, /freeflow enable, or /freeflow disable",
      "warning",
    );
    return { changed: false, reloaded: false, error: "invalid_action" };
  }
  let settingsScope = "local";
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
  let reconcileCognitiveRouting = settingsScope === "session";
  const items =
    settingsScope === "session"
      ? sessionFreeflowItems(state, cognitiveRoutingController)
      : freeflowItems(raw, {
          scope: settingsScope,
          layers,
          cognitiveRouting: state.cognitiveRouting,
          ctx,
          runtimeAvailable: isCognitiveRoutingRuntimeAvailable(pi),
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
      if (!isCognitiveRoutingRuntimeAvailable(pi) && item.id.startsWith("freeflow.cognitiveRouting.")) {
        ctx.ui.notify("Cognitive Routing is unavailable because this host lacks model-state controls.", "warning");
        return { changed: false, reloadRequired: false };
      }
      if (item.id === "freeflow.cognitiveRouting.profile") {
        if (!cognitiveRoutingController) {
          ctx.ui.notify("Cognitive Routing is unavailable for this session.", "warning");
          return { changed: false, reloadRequired: false };
        }
        const result =
          value === "auto"
            ? await cognitiveRoutingController.setAutomaticControl("profile-settings")
            : await cognitiveRoutingController.setManualProfile(value, "profile-settings");
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
          "freeflow.contextVirtualization": "contextVirtualization",
          "freeflow.conversationHistory": "conversationHistory",
        };
        const key = keyById[item.id];
        const override = value === LOCAL_INHERIT ? null : value === "true";
        const result = await setSessionCoreOverride(key, override, ctx, pi);
        return { changed: result.changed, reloadRequired: result.reloadRequired === true };
      }
      await updateConfig(ctx.cwd, item, value, item.configScope ?? "repository");
      if (!item.id.startsWith("freeflow.cognitiveRouting.sessionStart.")) {
        reconcileCognitiveRouting = true;
      }
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
    "Run /reload for Freeflow changes to fully apply.",
    { reconcileCognitiveRouting },
  );
  return { changed: session.changed, reloaded, error: session.failed ? "write_failed" : undefined };
}

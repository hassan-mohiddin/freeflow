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
import { isPiFlowHost } from "../runtime/runtime-identity.js";
import { isWorkerProfile, workersForDelegation } from "../cognitive-routing-v2/types.js";
import { DEFAULT_TOOL_EXECUTION_CONFIG } from "../tool-runtime/config.js";
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
  if (value === undefined || (item.defaultValue !== undefined && valuesEqual(value, item.defaultValue))) {
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
    const effort = typeof value.thinking === "string" ? ` · ${value.thinking}` : "";
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
  const selectedValue = configValueForChoice(item, value);
  const configValue = selectedValue === undefined || isEmptyValue(selectedValue) ? undefined : selectedValue;
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
function createScopedToolItem(options) {
  const repositoryRaw = getPath(options.rawConfig, options.path);
  const repositoryValue = options.accept(repositoryRaw) ? repositoryRaw : options.defaultValue;
  const inheritedSource = options.accept(repositoryRaw) ? "repository" : "builtin";
  const localRaw = getPath(options.localConfig, options.path);
  const hasLocalOverride = options.accept(localRaw);
  const localValue = hasLocalOverride ? localRaw : undefined;
  const format = options.format ?? ((value) => String(value ?? ""));
  const editFormat = options.editFormat ?? format;
  let item;
  if (options.scope === "local") {
    if (options.kind === "enum") {
      const values = options.values ?? [];
      item = {
        id: options.id,
        label: options.label,
        description: `${options.description} Choose inherit to use the repository value; use /freeflow settings repo to edit shared defaults.`,
        path: options.path,
        kind: "enum",
        value: hasLocalOverride ? String(localValue) : LOCAL_INHERIT,
        values: [LOCAL_INHERIT, ...values],
        valueLabels: { inherit: "Inherit repository", ...(options.valueLabels ?? {}) },
        valueDescriptions: {
          inherit: `Use ${format(repositoryValue)} from ${inheritedSource}.`,
          ...(options.valueDescriptions ?? {}),
        },
        configScope: "local",
        configValues: Object.fromEntries([[LOCAL_INHERIT, undefined], ...values.map((value) => [value, value])]),
        effectiveValue: options.effectiveValue,
        effectiveSource: hasLocalOverride ? "local" : inheritedSource,
        inheritedValue: repositoryValue,
        inheritedSource,
      };
    } else {
      item = {
        id: options.id,
        label: options.label,
        description: `${options.description} Leave the editor blank to inherit the repository value.`,
        path: options.path,
        kind: options.kind,
        value: localValue,
        parse: (text) => (text.trim() === "" ? undefined : (options.parse?.(text) ?? text)),
        format,
        editInitialValue: () => (hasLocalOverride ? editFormat(localValue) : ""),
        configScope: "local",
        effectiveValue: options.effectiveValue,
        effectiveSource: hasLocalOverride ? "local" : inheritedSource,
        inheritedValue: repositoryValue,
        inheritedSource,
      };
    }
  } else {
    item = {
      id: options.id,
      label: options.label,
      description: `${options.description} This edits shared .freeflow/config.json.`,
      path: options.path,
      kind: options.kind,
      value: repositoryValue,
      defaultValue: options.defaultValue,
      values: options.values,
      valueLabels: options.valueLabels,
      valueDescriptions: options.valueDescriptions,
      parse: options.parse,
      format,
      editInitialValue: () => editFormat(repositoryValue),
      configScope: "repository",
      effectiveValue: options.effectiveValue,
      effectiveSource: hasLocalOverride ? "local" : inheritedSource,
      localOverrideValue: localValue,
    };
  }
  item.displaySuffix = coreDisplaySuffix(item);
  return item;
}
function boundedInteger(label, minimum, maximum, fallback) {
  return (text) => {
    if (text.trim() === "") return fallback;
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
  };
}
function stringList(label, maximum, pattern) {
  return (text) => {
    if (text.trim() === "") return [];
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`${label} must be a JSON array of strings`);
    }
    if (
      !Array.isArray(value) ||
      value.length > maximum ||
      new Set(value).size !== value.length ||
      !value.every(
        (item) =>
          typeof item === "string" && item.length > 0 && item.length <= 4096 && (!pattern || pattern.test(item)),
      )
    ) {
      throw new Error(`${label} must contain at most ${maximum} unique valid strings`);
    }
    return value;
  };
}
function createScopedDelegationItem(options) {
  const path = ["cognitiveRouting", "delegation"];
  const repositoryValue = getPath(options.rawConfig, path);
  const inheritedValue = ["executor", "helper", "both"].includes(repositoryValue) ? repositoryValue : "executor";
  const inheritedSource = repositoryValue === undefined ? "builtin" : "repository";
  const localValue = getPath(options.localConfig, path);
  const descriptions = {
    executor: "Coordinator delegates assignments to Executor.",
    helper: "Coordinator delegates supporting assignments to Helper and keeps production implementation.",
    both: "Coordinator chooses Helper or Executor for each assignment.",
  };
  const item =
    options.scope === "local"
      ? {
          id: "freeflow.cognitiveRouting.delegation",
          label: "Delegation method",
          description:
            "Choose enabled workers for automatic routing. Inherit uses the repository value; this setting does not rank model presets.",
          path,
          kind: "enum",
          value: ["executor", "helper", "both"].includes(localValue) ? localValue : LOCAL_INHERIT,
          values: [LOCAL_INHERIT, "executor", "helper", "both"],
          valueLabels: {
            inherit: "Inherit repository",
            executor: "Executor only",
            helper: "Helper only",
            both: "Helper and Executor",
          },
          valueDescriptions: {
            inherit: `Use ${inheritedValue} from ${inheritedSource}.`,
            ...descriptions,
          },
          configScope: "local",
          configValues: { inherit: undefined, executor: "executor", helper: "helper", both: "both" },
          effectiveValue: options.effectiveValue,
          effectiveSource: options.effectiveSource,
          inheritedValue,
          inheritedSource,
        }
      : {
          id: "freeflow.cognitiveRouting.delegation",
          label: "Delegation method",
          description: "Choose enabled workers for automatic routing. This edits shared .freeflow/config.json.",
          path,
          kind: "enum",
          value: inheritedValue,
          values: ["executor", "helper", "both"],
          valueLabels: {
            executor: "Executor only",
            helper: "Helper only",
            both: "Helper and Executor",
          },
          valueDescriptions: descriptions,
          defaultValue: "executor",
          configScope: "repository",
          effectiveValue: options.effectiveValue,
          effectiveSource: options.effectiveSource,
          localOverrideValue: ["executor", "helper", "both"].includes(localValue) ? localValue : undefined,
        };
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
function sessionFreeflowItems(state, cognitiveRoutingController, ctx) {
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
  const delegation = state.cognitiveRouting?.delegation ?? "executor";
  const heldProfile = cognitiveRoutingState?.controlMode.startsWith("manual-")
    ? cognitiveRoutingState.activeProfile
    : undefined;
  const availableProfiles = ["coordinator", ...workersForDelegation(delegation)];
  if (heldProfile === "coordinator" || isWorkerProfile(heldProfile)) availableProfiles.push(heldProfile);
  const manualProfiles = [...new Set(availableProfiles)];
  const cognitiveRoutingProfile = heldProfile && manualProfiles.includes(heldProfile) ? heldProfile : "auto";
  const cognitiveRoutingItem = state.cognitiveRouting
    ? {
        id: "freeflow.cognitiveRouting.profile",
        label: "Cognitive Routing",
        description: "Hold an enabled profile manually or release the hold for automatic model control.",
        kind: "enum",
        value: cognitiveRoutingProfile,
        values: ["auto", ...manualProfiles],
        valueLabels: Object.fromEntries([
          ["auto", "automatic"],
          ...manualProfiles.map((profile) => [profile, `manual · ${profile}`]),
        ]),
        valueDescriptions: Object.fromEntries([
          ["auto", "Release the manual hold and return to Coordinator reconciliation."],
          ...manualProfiles.map((profile) => [profile, `Hold the ${profile} profile until /freeflow profile auto.`]),
        ]),
        inactive: freeflowInactive || !state.cognitiveRouting.effective || cognitiveRoutingController === undefined,
        runtimeInactive: state.cognitiveRouting.blockingReason?.code === "runtime_disabled",
        displaySuffix: cognitiveRoutingState?.effective ? cognitiveRoutingProfile : "unavailable",
      }
    : undefined;
  const sessionProfiles = cognitiveRoutingController?.sessionProfileOverrides();
  const profileItems =
    state.cognitiveRouting && cognitiveRoutingController
      ? manualProfiles.map((name) =>
          cognitiveRoutingProfileItem({
            name,
            scope: "session",
            rawConfig: {},
            localConfig: {},
            capabilityState: state.cognitiveRouting,
            ctx,
            sessionProfiles,
          }),
        )
      : [];
  const cognitiveRoutingPresets = profileItems.length
    ? {
        id: "freeflow.cognitiveRouting.presets",
        label: "Cognitive Routing presets",
        description: "Temporarily choose complete model/effort pairs for profiles enabled in this Pi session.",
        kind: "group",
        value: profileItems.some((item) => item.value !== LOCAL_INHERIT && item.value !== undefined),
        displaySuffix: `${profileItems.filter((item) => item.value !== LOCAL_INHERIT && item.value !== undefined).length}/${profileItems.length} session overrides`,
        inactive: freeflowInactive || !state.cognitiveRouting?.effective || cognitiveRoutingController === undefined,
        children: profileItems,
      }
    : undefined;
  return [
    freeflowItem,
    ...(cognitiveRoutingItem ? [cognitiveRoutingItem] : []),
    ...(cognitiveRoutingPresets ? [cognitiveRoutingPresets] : []),
    {
      id: "freeflow.session.reset",
      label: "Reset session overrides",
      description:
        "Clear Freeflow, Context Virtualization, Conversation History, and routing profile overrides for this Pi session.",
      kind: "enum",
      value: "available",
      values: ["reset"],
      valueLabels: { reset: "Reset all session overrides" },
      valueDescriptions: { reset: "Return every session setting and routing preset to its configured value." },
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
    typeof value.thinking === "string" &&
    COGNITIVE_ROUTING_THINKING_LEVELS.includes(value.thinking)
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
  if (source === "session") return "session";
  if (source === "repository") return "repository";
  if (source === "personal" || source === "local") return "local";
  return "builtin";
}
function cognitiveRoutingProfileDisplaySuffix(source, scope) {
  if (!source) return undefined;
  if (source === "session") return "(session override)";
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
function createCognitiveRoutingProfileWizard(
  currentValue,
  models,
  allowInherit,
  inheritChoice = {
    label: "Inherit repository preset",
    description: "Remove the personal override without changing the repository preset.",
    summary: "inherit repository preset",
  },
) {
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
            label: inheritChoice.label,
            description: inheritChoice.description,
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
          return cognitiveRoutingConfirmStep(inheritChoice.summary);
        }
        const model = selected;
        if (!model?.key || model.thinkingLevels.length === 0) return undefined;
        const currentEffort = currentProfile && currentModelKey === model.key ? currentProfile.thinking : undefined;
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
        thinking: selectedValues[1],
      };
    },
  };
}
function cognitiveRoutingProfileItem(options) {
  const path = ["cognitiveRouting", "profiles", options.name];
  const repositoryProfile = getPath(options.rawConfig, path);
  const localProfile = getPath(options.localConfig, path);
  const configuredProfile = options.capabilityState?.profiles?.[options.name] ?? repositoryProfile;
  const sessionPair = options.sessionProfiles?.[options.name];
  const sessionProfile = sessionPair
    ? { provider: sessionPair.provider, model: sessionPair.modelId, thinking: sessionPair.thinking }
    : undefined;
  const effectiveProfile = sessionProfile ?? configuredProfile;
  const localValue = isCognitiveRoutingProfile(localProfile) ? localProfile : LOCAL_INHERIT;
  const value =
    options.scope === "session"
      ? (sessionProfile ?? LOCAL_INHERIT)
      : options.scope === "local"
        ? localValue
        : repositoryProfile;
  const configuredSource =
    options.capabilityState?.profileSources?.[options.name] ??
    (isCognitiveRoutingProfile(repositoryProfile) ? "repository" : undefined);
  const source = options.scope === "session" ? (sessionProfile ? "session" : configuredSource) : configuredSource;
  const models = cognitiveRoutingModelOptions(options.ctx);
  const inactive = options.scope !== "repository" && models.length === 0 && value !== LOCAL_INHERIT;
  const inheritChoice =
    options.scope === "session"
      ? {
          label: "Inherit configured preset",
          description: "Remove the session override without changing local or repository configuration.",
          summary: "inherit configured preset",
        }
      : undefined;
  return {
    id: `freeflow.cognitiveRouting.${options.name}`,
    label: `${options.name.charAt(0).toUpperCase()}${options.name.slice(1)} preset`,
    description:
      options.scope === "session"
        ? "Temporarily choose the model and effort for this profile in the current Pi session only."
        : "Choose an authenticated available model and one effort supported by that model. Confirming writes the complete preset; cancel leaves it unchanged.",
    path,
    kind: "string",
    value,
    format: (current) => {
      const inherits = current === LOCAL_INHERIT || (options.scope === "session" && current === undefined);
      return inherits
        ? options.scope === "session"
          ? "inherit configured preset"
          : "inherit repository preset"
        : cognitiveRoutingProfileDisplay(current);
    },
    configScope: options.scope,
    effectiveValue: effectiveProfile,
    effectiveSource: cognitiveRoutingSettingsSource(source),
    inheritedValue: options.scope === "session" ? configuredProfile : repositoryProfile,
    inheritedSource: cognitiveRoutingSettingsSource(configuredSource ?? "builtin"),
    inactive,
    displaySuffix: cognitiveRoutingProfileDisplaySuffix(source, options.scope),
    wizard: () => createCognitiveRoutingProfileWizard(value, models, options.scope !== "repository", inheritChoice),
  };
}
function isCognitiveRoutingRuntimeAvailable(pi) {
  return (
    !isPiFlowHost(pi?.host) &&
    typeof pi?.appendEntry === "function" &&
    typeof pi?.setModel === "function" &&
    typeof pi?.setThinkingLevel === "function"
  );
}
function freeflowItems(rawConfig, options = {}) {
  const scope = options.scope === "local" ? "local" : "repository";
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
        : "Allow Cognitive Routing to manage explicit assignments and request native profile transitions.",
      path: ["cognitiveRouting", "enabled"],
      effectiveValue: cognitiveRoutingState?.enabled ?? false,
      effectiveSource: cognitiveRoutingSettingsSource(cognitiveRoutingState?.enabledSource),
      defaultValue: false,
    });
    cognitiveRoutingEnabledItem.inactive = freeflowInactive || cognitiveRoutingRuntimeDisabled;
    cognitiveRoutingEnabledItem.runtimeInactive = cognitiveRoutingRuntimeDisabled;
    const cognitiveRoutingDelegationItem = createScopedDelegationItem({
      scope,
      rawConfig,
      localConfig,
      effectiveValue: cognitiveRoutingState?.delegation ?? "executor",
      effectiveSource: cognitiveRoutingSettingsSource(cognitiveRoutingState?.delegationSource),
    });
    cognitiveRoutingDelegationItem.inactive = freeflowInactive || cognitiveRoutingRuntimeDisabled;
    cognitiveRoutingDelegationItem.runtimeInactive = cognitiveRoutingRuntimeDisabled;
    const cognitiveRoutingProjectionItem = createScopedBooleanItem({
      scope,
      rawConfig,
      localConfig,
      id: "freeflow.cognitiveRouting.projection",
      label: "Context projection",
      description:
        "Select worker evidence for Coordinator; disable projection to keep ordinary Pi context in all enabled profiles.",
      path: ["cognitiveRouting", "projection"],
      effectiveValue: cognitiveRoutingState?.projection ?? false,
      effectiveSource: cognitiveRoutingSettingsSource(cognitiveRoutingState?.projectionSource),
      defaultValue: false,
    });
    cognitiveRoutingProjectionItem.inactive = freeflowInactive || cognitiveRoutingRuntimeDisabled;
    cognitiveRoutingProjectionItem.runtimeInactive = cognitiveRoutingRuntimeDisabled;
    const cognitiveRoutingProfiles = ["coordinator", "helper", "executor"].map((name) =>
      cognitiveRoutingProfileItem({
        name: name,
        scope,
        rawConfig,
        localConfig,
        capabilityState: cognitiveRoutingState,
        ctx: options.ctx,
      }),
    );
    for (const item of cognitiveRoutingProfiles) {
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
        : "Configure Coordinator, Helper, and Executor profiles plus the workers available for delegation.",
      kind: "group",
      value: cognitiveRoutingRuntimeDisabled ? false : (cognitiveRoutingState?.enabled ?? false),
      inactive: freeflowInactive,
      displaySuffix: cognitiveRoutingStatus,
      children: [
        cognitiveRoutingEnabledItem,
        cognitiveRoutingDelegationItem,
        ...cognitiveRoutingProfiles,
        cognitiveRoutingProjectionItem,
      ],
    };
  })();
  const toolExecutionState = options.toolExecution;
  const toolSource = (path) => {
    if (getPath(localConfig, path) !== undefined) return "local";
    if (getPath(rawConfig, path) !== undefined) return "repository";
    return "builtin";
  };
  const toolExecutionEnabledItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.enabled",
    label: "Enabled",
    description:
      "Enable the Tool Execution capability. Disabling it denies captured reads but does not erase retained files.",
    path: ["toolExecution", "enabled"],
    effectiveValue: toolExecutionState?.enabled ?? false,
    effectiveSource: toolSource(["toolExecution", "enabled"]),
    defaultValue: false,
  });
  const captureEnabledItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.capture.enabled",
    label: "Capture new Bash text results",
    description:
      "Opt in to qualified bounded Bash-text capture. Disabling new capture retains sidecar files and permits existing verified reads while Tool Execution remains enabled.",
    path: ["toolExecution", "capture", "enabled"],
    effectiveValue: toolExecutionState?.capture.enabled ?? false,
    effectiveSource: toolSource(["toolExecution", "capture", "enabled"]),
    defaultValue: false,
  });
  const captureInlineItem = createScopedToolItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.capture.maxInlineBytes",
    label: "Inline result budget (bytes)",
    description: "Maximum bounded native result presentation before exact recovery is required.",
    path: ["toolExecution", "capture", "maxInlineBytes"],
    kind: "integer",
    effectiveValue: toolExecutionState?.capture.maxInlineBytes ?? DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxInlineBytes,
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxInlineBytes,
    accept: (value) => Number.isSafeInteger(value) && Number(value) >= 256 && Number(value) <= 1_048_576,
    parse: boundedInteger("Inline result budget", 256, 1_048_576, DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxInlineBytes),
  });
  const captureStoredItem = createScopedToolItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.capture.maxStoredBytes",
    label: "Maximum captured result (bytes)",
    description: "Maximum immutable sidecar size accepted for a single captured result.",
    path: ["toolExecution", "capture", "maxStoredBytes"],
    kind: "integer",
    effectiveValue: toolExecutionState?.capture.maxStoredBytes ?? DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxStoredBytes,
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxStoredBytes,
    accept: (value) => Number.isSafeInteger(value) && Number(value) >= 4_194_304 && Number(value) <= 4_294_967_296,
    parse: boundedInteger(
      "Maximum captured result",
      4_194_304,
      4_294_967_296,
      DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxStoredBytes,
    ),
  });
  const captureGroup = {
    id: "freeflow.toolExecution.capture",
    label: "Capture and recovery",
    description: "Configure bounded native Bash capture and immutable exact recovery limits.",
    kind: "group",
    value: toolExecutionState?.capture.enabled ?? false,
    displaySuffix: toolExecutionState?.capture.effective
      ? `active · ${toolExecutionState.capture.maxInlineBytes} inline bytes`
      : "inactive",
    children: [captureEnabledItem, captureInlineItem, captureStoredItem],
  };
  const programModes = ["off", "reduction", "adapters"];
  const programModeItem = createScopedToolItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.programs.mode",
    label: "Program mode",
    description: "Choose off, captured-data-only reduction, or adapters mode for declared revisioned live operations.",
    path: ["toolExecution", "programs", "mode"],
    kind: "enum",
    effectiveValue: toolExecutionState?.programs.mode ?? DEFAULT_TOOL_EXECUTION_CONFIG.programs.mode,
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.programs.mode,
    accept: (value) => programModes.includes(value),
    values: programModes,
    valueLabels: { off: "Off", reduction: "Captured data only", adapters: "Live adapters" },
    valueDescriptions: {
      off: "Disable freeflow_run.",
      reduction: "Allow only explicitly granted captured-result reads.",
      adapters: "Also allow declared live operations after routing, policy, and effect checks.",
    },
  });
  const programTimeoutItem = createScopedToolItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.programs.timeoutMs",
    label: "Program timeout (ms)",
    description: "Default wall-clock deadline for a bounded QuickJS program.",
    path: ["toolExecution", "programs", "timeoutMs"],
    kind: "integer",
    effectiveValue: toolExecutionState?.programs.timeoutMs ?? DEFAULT_TOOL_EXECUTION_CONFIG.programs.timeoutMs,
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.programs.timeoutMs,
    accept: (value) => Number.isSafeInteger(value) && Number(value) >= 100 && Number(value) <= 120_000,
    parse: boundedInteger("Program timeout", 100, 120_000, DEFAULT_TOOL_EXECUTION_CONFIG.programs.timeoutMs),
  });
  const parallelReadsItem = createScopedToolItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.programs.maxParallelReads",
    label: "Parallel program reads",
    description: "Maximum independent read operations a program may overlap.",
    path: ["toolExecution", "programs", "maxParallelReads"],
    kind: "integer",
    effectiveValue:
      toolExecutionState?.programs.maxParallelReads ?? DEFAULT_TOOL_EXECUTION_CONFIG.programs.maxParallelReads,
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.programs.maxParallelReads,
    accept: (value) => Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 32,
    parse: boundedInteger("Parallel program reads", 1, 32, DEFAULT_TOOL_EXECUTION_CONFIG.programs.maxParallelReads),
  });
  const programsGroup = {
    id: "freeflow.toolExecution.programs",
    label: "Programs",
    description: "Configure restricted QuickJS execution and read concurrency.",
    kind: "group",
    value: (toolExecutionState?.programs.mode ?? "off") !== "off",
    displaySuffix: toolExecutionState?.programs.effective
      ? `${toolExecutionState.programs.mode} · ${toolExecutionState.programs.timeoutMs} ms`
      : "off",
    children: [programModeItem, programTimeoutItem, parallelReadsItem],
  };
  const workspaceEnabledItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.workspace.enabled",
    label: "Local workspace reads",
    description:
      "Allow typed read-only operations inside the configured local workspace root. Custom or remote native read semantics are not inherited.",
    path: ["toolExecution", "workspace", "enabled"],
    effectiveValue: toolExecutionState?.workspace.enabled ?? false,
    effectiveSource: toolSource(["toolExecution", "workspace", "enabled"]),
    defaultValue: false,
  });
  const workspaceWriteItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.workspace.write",
    label: "Exact workspace replacement",
    description:
      "Allow one hash-guarded exact replacement inside the configured workspace. This does not enable arbitrary writes or deletion.",
    path: ["toolExecution", "workspace", "write"],
    effectiveValue: toolExecutionState?.workspace.write ?? false,
    effectiveSource: toolSource(["toolExecution", "workspace", "write"]),
    defaultValue: false,
  });
  const workspaceRootItem = createScopedToolItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.workspace.root",
    label: "Workspace root",
    description: "Optional local execution root. Blank uses the activated repository root.",
    path: ["toolExecution", "workspace", "root"],
    kind: "string",
    effectiveValue: toolExecutionState?.workspace.root ?? "",
    defaultValue: "",
    accept: (value) => typeof value === "string" && value.length > 0,
    parse: (text) => text.trim(),
    format: (value) => (typeof value === "string" && value ? value : "activated repository root"),
    editFormat: (value) => (typeof value === "string" ? value : ""),
  });
  const denyPathsItem = createScopedToolItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.workspace.denyPaths",
    label: "Denied workspace paths",
    description: "JSON array of denied relative path prefixes. .git is always denied.",
    path: ["toolExecution", "workspace", "denyPaths"],
    kind: "list",
    effectiveValue: toolExecutionState?.workspace.denyPaths ?? DEFAULT_TOOL_EXECUTION_CONFIG.workspace.denyPaths,
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.workspace.denyPaths,
    accept: (value) =>
      Array.isArray(value) &&
      value.length <= 128 &&
      new Set(value).size === value.length &&
      value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 4096),
    parse: stringList("Denied workspace paths", 128),
    format: (value) => JSON.stringify(Array.isArray(value) ? value : []),
  });
  const workspaceGroup = {
    id: "freeflow.toolExecution.workspace",
    label: "Workspace",
    description: "Configure bounded local reads, exact replacement, root, and denied paths.",
    kind: "group",
    value: toolExecutionState?.workspace.enabled ?? false,
    displaySuffix: toolExecutionState?.workspace.effective
      ? `reads active · writes ${toolExecutionState.workspace.write ? "enabled" : "disabled"}`
      : "inactive",
    children: [workspaceEnabledItem, workspaceWriteItem, workspaceRootItem, denyPathsItem],
  };
  const discoveryEnabledItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.discovery.enabled",
    label: "Operation discovery",
    description: "Allow bounded search and complete description of the configured revisioned operation catalog.",
    path: ["toolExecution", "discovery", "enabled"],
    effectiveValue: toolExecutionState?.discovery.enabled ?? false,
    effectiveSource: toolSource(["toolExecution", "discovery", "enabled"]),
    defaultValue: false,
  });
  const adapterAllowItem = createScopedToolItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.adapters.allow",
    label: "Allowed cooperating adapters",
    description: "JSON array of trusted announced adapter IDs permitted to activate.",
    path: ["toolExecution", "adapters", "allow"],
    kind: "list",
    effectiveValue: toolExecutionState?.adapters.allow ?? DEFAULT_TOOL_EXECUTION_CONFIG.adapters.allow,
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.adapters.allow,
    accept: (value) =>
      Array.isArray(value) &&
      value.length <= 64 &&
      new Set(value).size === value.length &&
      value.every((item) => typeof item === "string" && /^[a-z][a-zA-Z0-9._-]{0,127}$/.test(item)),
    parse: stringList("Allowed cooperating adapters", 64, /^[a-z][a-zA-Z0-9._-]{0,127}$/),
    format: (value) => JSON.stringify(Array.isArray(value) ? value : []),
  });
  const adaptersGroup = {
    id: "freeflow.toolExecution.adapters",
    label: "Cooperating adapters",
    description: "Allow only trusted in-process adapter IDs that are also announced by loaded extensions.",
    kind: "group",
    value: (toolExecutionState?.adapters.allow.length ?? 0) > 0,
    displaySuffix: `${toolExecutionState?.adapters.allow.length ?? 0} allowed`,
    children: [adapterAllowItem],
  };
  const accountingEnabledItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.accounting.enabled",
    label: "Accounting observations",
    description:
      "Record bounded request, response-header, assistant-usage, and tool-usage facts without prompt bodies.",
    path: ["toolExecution", "accounting", "enabled"],
    effectiveValue: toolExecutionState?.accounting.enabled ?? false,
    effectiveSource: toolSource(["toolExecution", "accounting", "enabled"]),
    defaultValue: false,
  });
  const toolExecutionPresetItem = {
    id: "freeflow.toolExecution.preset",
    label: "Configuration preset",
    description: `Atomically configure the ${scope === "local" ? "personal override" : "shared repository"} for off, read-only local, or all local built-ins. Existing limits, roots, denied paths, and adapter allowlists are preserved.`,
    kind: "enum",
    value: "available",
    values: ["off", "read-only", "full-local"],
    valueLabels: {
      off: "Off",
      "read-only": "Read-only local",
      "full-local": "All local built-ins",
    },
    valueDescriptions: {
      off: "Disable Tool Execution while retaining its detailed settings.",
      "read-only":
        "Enable capture, discovery, accounting, live read programs, and workspace reads; keep replacement disabled.",
      "full-local": "Enable the read-only preset plus hash-guarded exact workspace replacement.",
    },
    format: () => "choose preset",
    transient: true,
  };
  const toolExecutionItems = [
    toolExecutionEnabledItem,
    toolExecutionPresetItem,
    captureGroup,
    programsGroup,
    workspaceGroup,
    discoveryEnabledItem,
    adaptersGroup,
    accountingEnabledItem,
  ];
  walkSettingsItems(toolExecutionItems, (item) => {
    item.inactive = freeflowInactive;
  });
  const toolExecutionGroup = {
    id: "freeflow.toolExecution",
    label: "Tool Execution",
    description:
      "Configure stable execution facades, verified result capture/recovery, restricted programs, local operations, cooperating adapters, streaming progress, and bounded accounting.",
    kind: "group",
    value: toolExecutionState?.enabled ?? false,
    inactive: freeflowInactive,
    displaySuffix: toolExecutionState?.effective
      ? `capture ${toolExecutionState.capture.effective ? "active" : "inactive"} · programs ${toolExecutionState.programs.mode} · workspace ${toolExecutionState.workspace.effective ? (toolExecutionState.workspace.write ? "read/write" : "read-only") : "inactive"} · discovery ${toolExecutionState.discovery.effective ? "active" : "inactive"} · adapters ${toolExecutionState.adapters.allow.length} allowed · accounting ${toolExecutionState.accounting.effective ? "active" : "inactive"}`
      : toolExecutionState?.enabled
        ? "inactive"
        : "disabled",
    children: toolExecutionItems,
  };
  return [
    freeflowItem,
    ...(cognitiveRoutingGroup ? [cognitiveRoutingGroup] : []),
    toolExecutionGroup,
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
    { path: ["cognitiveRouting", "delegation"], value: "executor" },
    { path: ["toolExecution", "enabled"], value: DEFAULT_TOOL_EXECUTION_CONFIG.enabled },
    { path: ["toolExecution", "capture", "enabled"], value: DEFAULT_TOOL_EXECUTION_CONFIG.capture.enabled },
    {
      path: ["toolExecution", "capture", "maxInlineBytes"],
      value: DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxInlineBytes,
    },
    {
      path: ["toolExecution", "capture", "maxStoredBytes"],
      value: DEFAULT_TOOL_EXECUTION_CONFIG.capture.maxStoredBytes,
    },
    { path: ["toolExecution", "programs", "mode"], value: DEFAULT_TOOL_EXECUTION_CONFIG.programs.mode },
    { path: ["toolExecution", "programs", "timeoutMs"], value: DEFAULT_TOOL_EXECUTION_CONFIG.programs.timeoutMs },
    {
      path: ["toolExecution", "programs", "maxParallelReads"],
      value: DEFAULT_TOOL_EXECUTION_CONFIG.programs.maxParallelReads,
    },
    { path: ["toolExecution", "workspace", "enabled"], value: DEFAULT_TOOL_EXECUTION_CONFIG.workspace.enabled },
    { path: ["toolExecution", "workspace", "write"], value: DEFAULT_TOOL_EXECUTION_CONFIG.workspace.write },
    { path: ["toolExecution", "workspace", "denyPaths"], value: DEFAULT_TOOL_EXECUTION_CONFIG.workspace.denyPaths },
    { path: ["toolExecution", "adapters", "allow"], value: DEFAULT_TOOL_EXECUTION_CONFIG.adapters.allow },
    { path: ["toolExecution", "discovery", "enabled"], value: DEFAULT_TOOL_EXECUTION_CONFIG.discovery.enabled },
    { path: ["toolExecution", "accounting", "enabled"], value: DEFAULT_TOOL_EXECUTION_CONFIG.accounting.enabled },
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
function applyToolExecutionPreset(config, preset) {
  setPath(config, ["toolExecution", "enabled"], preset !== "off");
  if (preset === "off") return;
  setPath(config, ["toolExecution", "capture", "enabled"], true);
  setPath(config, ["toolExecution", "programs", "mode"], "adapters");
  setPath(config, ["toolExecution", "workspace", "enabled"], true);
  setPath(config, ["toolExecution", "workspace", "write"], preset === "full-local");
  setPath(config, ["toolExecution", "discovery", "enabled"], true);
  setPath(config, ["toolExecution", "accounting", "enabled"], true);
}
async function updateToolExecutionPreset(cwd, scope, preset) {
  const current = scope === "local" ? await readFreeflowLocalConfig(cwd) : await readFreeflowConfig(cwd);
  const next = cloneJson(current);
  applyToolExecutionPreset(next, preset);
  if (scope === "repository") pruneKnownDefaults(next);
  if (valuesEqual(current, next)) return false;
  if (scope === "local") {
    await ensureLocalConfigIgnored(cwd);
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await writeFile(join(cwd, ".freeflow/local.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } else {
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await writeFile(join(cwd, ".freeflow/config.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
  return true;
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
  return ["coordinator", "helper", "executor"].some((profile) => item.id === `freeflow.cognitiveRouting.${profile}`);
}
function valueForDisplay(item) {
  let value;
  if (isCognitiveRoutingProfileItem(item) && item.format) {
    value = item.format(effectiveItemValue(item));
  } else if ((item.configScope === "local" || item.configScope === "session") && item.format && item.kind !== "enum") {
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
  const cognitiveRoutingDelegationItem = findSettingsItem(items, "freeflow.cognitiveRouting.delegation");
  const delegation = cognitiveRoutingDelegationItem ? effectiveItemValue(cognitiveRoutingDelegationItem) : "executor";
  const cognitiveRoutingProfiles = ["coordinator", ...workersForDelegation(delegation)].map((profile) =>
    findSettingsItem(items, `freeflow.cognitiveRouting.${profile}`),
  );
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
  const toolExecutionGroup = findSettingsItem(items, "freeflow.toolExecution");
  const toolExecutionEnabled = findSettingsItem(items, "freeflow.toolExecution.enabled");
  const captureGroup = findSettingsItem(items, "freeflow.toolExecution.capture");
  const captureEnabled = findSettingsItem(items, "freeflow.toolExecution.capture.enabled");
  const captureInline = findSettingsItem(items, "freeflow.toolExecution.capture.maxInlineBytes");
  const programsGroup = findSettingsItem(items, "freeflow.toolExecution.programs");
  const programMode = findSettingsItem(items, "freeflow.toolExecution.programs.mode");
  const programTimeout = findSettingsItem(items, "freeflow.toolExecution.programs.timeoutMs");
  const workspaceGroup = findSettingsItem(items, "freeflow.toolExecution.workspace");
  const workspaceEnabled = findSettingsItem(items, "freeflow.toolExecution.workspace.enabled");
  const workspaceWrite = findSettingsItem(items, "freeflow.toolExecution.workspace.write");
  const discoveryEnabled = findSettingsItem(items, "freeflow.toolExecution.discovery.enabled");
  const adaptersGroup = findSettingsItem(items, "freeflow.toolExecution.adapters");
  const adaptersAllow = findSettingsItem(items, "freeflow.toolExecution.adapters.allow");
  const accountingEnabled = findSettingsItem(items, "freeflow.toolExecution.accounting.enabled");
  if (captureGroup && captureEnabled) {
    captureGroup.value = effectiveItemValue(captureEnabled) === true;
    captureGroup.displaySuffix = captureGroup.value
      ? `active · ${effectiveItemValue(captureInline)} inline bytes`
      : "inactive";
  }
  if (programsGroup && programMode) {
    const mode = String(effectiveItemValue(programMode) ?? "off");
    programsGroup.value = mode !== "off";
    programsGroup.displaySuffix = `${mode}${mode === "off" ? "" : ` · ${effectiveItemValue(programTimeout)} ms`}`;
  }
  if (workspaceGroup && workspaceEnabled) {
    workspaceGroup.value = effectiveItemValue(workspaceEnabled) === true;
    workspaceGroup.displaySuffix = workspaceGroup.value
      ? `reads active · writes ${effectiveItemValue(workspaceWrite) === true ? "enabled" : "disabled"}`
      : "inactive";
  }
  if (adaptersGroup && adaptersAllow) {
    const allowed = effectiveItemValue(adaptersAllow);
    const count = Array.isArray(allowed) ? allowed.length : 0;
    adaptersGroup.value = count > 0;
    adaptersGroup.displaySuffix = `${count} allowed`;
  }
  if (toolExecutionGroup && toolExecutionEnabled) {
    const enabled = !freeflowInactive && effectiveItemValue(toolExecutionEnabled) === true;
    const mode = String(effectiveItemValue(programMode) ?? "off");
    const adapters = effectiveItemValue(adaptersAllow);
    toolExecutionGroup.value = effectiveItemValue(toolExecutionEnabled) === true;
    toolExecutionGroup.displaySuffix = enabled
      ? `capture ${effectiveItemValue(captureEnabled) === true ? "active" : "inactive"} · programs ${mode} · workspace ${effectiveItemValue(workspaceEnabled) === true ? (effectiveItemValue(workspaceWrite) === true ? "read/write" : "read-only") : "inactive"} · discovery ${effectiveItemValue(discoveryEnabled) === true ? "active" : "inactive"} · adapters ${Array.isArray(adapters) ? adapters.length : 0} allowed · accounting ${effectiveItemValue(accountingEnabled) === true ? "active" : "inactive"}`
      : effectiveItemValue(toolExecutionEnabled) === true
        ? "inactive"
        : "disabled";
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
function reflectToolExecutionPreset(items, preset, scope) {
  const setBoolean = (id, value) => {
    const item = findSettingsItem(items, id);
    if (!item) return;
    const selected = scope === "local" ? String(value) : value;
    item.value = selected;
    updateScopedItemState(item, selected);
  };
  setBoolean("freeflow.toolExecution.enabled", preset !== "off");
  if (preset === "off") return;
  setBoolean("freeflow.toolExecution.capture.enabled", true);
  setBoolean("freeflow.toolExecution.workspace.enabled", true);
  setBoolean("freeflow.toolExecution.workspace.write", preset === "full-local");
  setBoolean("freeflow.toolExecution.discovery.enabled", true);
  setBoolean("freeflow.toolExecution.accounting.enabled", true);
  const mode = findSettingsItem(items, "freeflow.toolExecution.programs.mode");
  if (mode) {
    mode.value = "adapters";
    updateScopedItemState(mode, "adapters");
  }
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
            initialValue: () => item.editInitialValue?.() ?? valueForDisplay(item),
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
function freeflowStatusText(state, cognitiveRoutingController, toolExecutionRuntime) {
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
  const toolIssue =
    toolExecutionRuntime?.lastFailure ??
    toolExecutionRuntime?.failures?.at(-1) ??
    toolExecutionRuntime?.adapters?.failures?.at(-1);
  return [
    `Freeflow: ${state.enabled ? "enabled" : "disabled"}${sessionSuffix(state.configSources.enabled)}`,
    `context: ${contextEnabled ? "enabled" : "disabled"} (virtualization ${state.contextVirtualization?.effective ? "enabled" : "disabled"}, history ${state.conversationHistory?.effective ? "enabled" : "disabled"})`,
    ...(cognitiveRoutingStatus ? [`cognitive routing: ${cognitiveRoutingStatus}`] : []),
    `tool execution: ${state.toolExecution?.effective ? "enabled" : "disabled"} (capture ${state.toolExecution?.capture?.effective ? "enabled" : "disabled"}, verified reader ${state.toolExecution?.effective ? "enabled" : "disabled"}, workspace ${state.toolExecution?.workspace?.effective ? (state.toolExecution.workspace.write ? "read/write" : "read-only") : "disabled"}, programs ${state.toolExecution?.programs?.mode ?? "off"}, live effects ${toolExecutionRuntime?.unresolvedEffects ? `fenced (${toolExecutionRuntime.unresolvedEffects})` : "settled"}, discovery ${state.toolExecution?.discovery?.effective ? "enabled" : "disabled"}, catalog ${toolExecutionRuntime?.catalog?.operations ?? 0} operations/${toolExecutionRuntime?.catalog?.metadataBytes ?? 0} bytes, adapters ${toolExecutionRuntime?.adapters?.announced?.filter((adapter) => adapter.active).length ?? 0} active/${toolExecutionRuntime?.adapters?.allowed?.length ?? 0} allowed, accounting ${state.toolExecution?.accounting?.effective ? "enabled" : "disabled"}; native Bash is built in, custom tools require adapters; captured files are retained until explicit deletion${toolIssue?.code ? `; latest ${toolExecutionRuntime?.lastFailure ? "program" : toolExecutionRuntime?.failures?.length ? "capture" : "adapter"} issue ${toolIssue.code}${toolIssue.message ? `: ${toolIssue.message}` : ""}` : ""})`,
    ...(toolExecutionRuntime?.queued ? [`capture publications queued: ${toolExecutionRuntime.queued}`] : []),
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
export async function handleFreeflowCommand(
  args,
  ctx,
  afterChange,
  pi,
  cognitiveRoutingController,
  toolExecutionRuntime,
) {
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
    ctx.ui.notify(freeflowStatusText(state, cognitiveRoutingController, toolExecutionRuntime?.status()), "info");
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
      toolExecution: state.toolExecution,
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
      ? sessionFreeflowItems(state, cognitiveRoutingController, ctx)
      : freeflowItems(raw, {
          scope: settingsScope,
          layers,
          cognitiveRouting: state.cognitiveRouting,
          toolExecution: state.toolExecution,
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
        const routingResult = cognitiveRoutingController
          ? await cognitiveRoutingController.resetSessionProfileOverrides("Reset session overrides")
          : { status: "unchanged" };
        if (routingResult.status === "blocked" || routingResult.reason) {
          ctx.ui.notify(
            `Cognitive Routing session presets could not be reset: ${routingResult.reason ?? routingResult.status}.`,
            "warning",
          );
          return { changed: false, reloadRequired: false };
        }
        try {
          const result = await resetSessionOverrides(ctx, pi);
          return {
            changed: result.changed || routingResult.status !== "unchanged",
            reloadRequired: result.reloadRequired,
          };
        } catch (error) {
          ctx.ui.notify(
            `Routing presets were reset, but core/context session overrides could not be reset: ${error instanceof Error ? error.message : String(error)}`,
            "warning",
          );
          return {
            changed: routingResult.status !== "unchanged",
            reloadRequired: false,
          };
        }
      }
      if (item.configScope === "session" && isCognitiveRoutingProfileItem(item)) {
        if (!cognitiveRoutingController) {
          ctx.ui.notify("Cognitive Routing is unavailable for this session.", "warning");
          return { changed: false, reloadRequired: false };
        }
        const profile = item.id.split(".").at(-1);
        const override =
          value === undefined || value === LOCAL_INHERIT
            ? null
            : {
                provider: value.provider,
                modelId: value.model,
                thinking: value.thinking,
              };
        const result = await cognitiveRoutingController.setSessionProfileOverride(
          profile,
          override,
          "Session profile settings",
        );
        if (result.status === "blocked" || result.reason) {
          ctx.ui.notify(
            `Cognitive Routing session preset could not be applied: ${result.reason ?? result.status}.`,
            "warning",
          );
          return { changed: false, reloadRequired: false };
        }
        await afterChange(false);
        return { changed: result.status !== "unchanged", reloadRequired: false };
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
      if (item.id === "freeflow.toolExecution.preset") {
        if (!["off", "read-only", "full-local"].includes(value)) {
          throw new Error("Unknown Tool Execution preset.");
        }
        if (value === "full-local") {
          if (typeof ctx.ui?.confirm !== "function") {
            ctx.ui?.notify?.("Enabling all local built-ins requires confirmation in Pi TUI mode.", "warning");
            return { changed: false, reloadRequired: false };
          }
          const confirmed = await ctx.ui.confirm(
            "Enable all local Tool Execution built-ins?",
            "This enables adapters-mode programs, local workspace reads, and hash-guarded project.replaceExact@1 mutations. It does not enable arbitrary writes or deletion.",
          );
          if (!confirmed) return { changed: false, reloadRequired: false };
        }
        const targetScope = settingsScope === "local" ? "local" : "repository";
        const changed = await updateToolExecutionPreset(ctx.cwd, targetScope, value);
        if (changed) reflectToolExecutionPreset(items, value, targetScope);
        return { changed, reloadRequired: changed };
      }
      const configuredValue = configValueForChoice(item, value);
      if (item.id === "freeflow.toolExecution.workspace.write" && configuredValue === true) {
        if (typeof ctx.ui?.confirm !== "function") {
          ctx.ui?.notify?.("Enabling workspace replacement requires confirmation in Pi TUI mode.", "warning");
          return { changed: false, reloadRequired: false };
        }
        const confirmed = await ctx.ui.confirm(
          "Enable exact workspace replacement?",
          "This permits hash-guarded project.replaceExact@1 mutations inside the configured workspace. It does not enable arbitrary writes or deletion.",
        );
        if (!confirmed) return { changed: false, reloadRequired: false };
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

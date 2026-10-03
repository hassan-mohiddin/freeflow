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
} from "../config.js";
import { freeflowStatusText } from "../status.js";
import { PiSettingsComponent } from "./settings-view.js";
import { workersForDelegation } from "../../cognitive-routing/types.js";
import { DEFAULT_TOOL_EXECUTION_CONFIG } from "../../tool-execution/config.js";
import { DEFAULT_COMPACTION_CARRY, DEFAULT_COMPACTION_ENABLED } from "../../compaction/config.js";
/*
 * The /freeflow command and the settings model it edits: every Freeflow setting with its repository, personal, and
 * session scopes, the routing profile wizard, config file writes, and reload after saving. settings-view.ts draws the
 * screen; this module decides what is on it.
 */
const DEFAULT_FREEFLOW_ENABLED = true;
const LOCAL_INHERIT = "inherit";
/** How a value's source reads in the settings screen. */
const SOURCE_LABELS = {
  builtin: "default",
  local: "personal",
  repository: "repository",
  session: "session",
};
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
      description: `${options.description} Inherit uses the repository value.`,
      path: options.path,
      kind: "enum",
      value: selectedValue,
      values: [LOCAL_INHERIT, "true", "false"],
      valueLabels: { inherit: "inherit", true: "enabled", false: "disabled" },
      valueDescriptions: {
        inherit: `Use ${formatCoreValue(inheritedValue)} from ${SOURCE_LABELS[inheritedSource]}.`,
        true: "Enabled for you in this checkout.",
        false: "Disabled for you in this checkout.",
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
      description: options.description,
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
          label: "Delegation",
          description:
            "Choose enabled workers for automatic routing. Inherit uses the repository value; this setting does not rank model presets.",
          path,
          kind: "enum",
          value: ["executor", "helper", "both"].includes(localValue) ? localValue : LOCAL_INHERIT,
          values: [LOCAL_INHERIT, "executor", "helper", "both"],
          valueLabels: {
            inherit: "inherit",
            executor: "Executor only",
            helper: "Helper only",
            both: "Helper and Executor",
          },
          valueDescriptions: {
            inherit: `Use ${inheritedValue} from ${SOURCE_LABELS[inheritedSource]}.`,
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
          label: "Delegation",
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
  const fallbackCore = { enabled: getPath(rawConfig, ["enabled"]) !== false };
  const fallbackSources = {
    enabled: typeof getPath(rawConfig, ["enabled"]) === "boolean" ? "repository" : "builtin",
  };
  return {
    localConfig,
    core: layers?.coreConfig ?? fallbackCore,
    sources: layers?.sources ?? fallbackSources,
  };
}
function createSessionBooleanItem(options) {
  const override = options.sessionOverrides[options.key];
  return {
    id: options.id,
    label: options.label,
    description: `${options.description} Inherit uses the personal or repository value.`,
    path: options.key.split("."),
    kind: "enum",
    value: typeof override === "boolean" ? String(override) : LOCAL_INHERIT,
    values: [LOCAL_INHERIT, "true", "false"],
    valueLabels: { inherit: "inherit", true: "enabled", false: "disabled" },
    valueDescriptions: {
      inherit: `Use ${formatCoreValue(options.inheritedValue)} from ${SOURCE_LABELS[options.inheritedSource]}.`,
      true: "Enabled for this Pi session only.",
      false: "Disabled for this Pi session only.",
    },
    configScope: "session",
    configValues: { inherit: undefined, true: true, false: false },
    effectiveValue: options.effectiveValue,
    effectiveSource: typeof override === "boolean" ? "session" : options.inheritedSource,
    inheritedValue: options.inheritedValue,
    inheritedSource: options.inheritedSource,
  };
}
/** A setting's configured value and source without session overrides: personal, then repository, then the default. */
function configuredSetting(rawConfig, localConfig, path, defaultValue) {
  const local = getPath(localConfig, path);
  if (typeof local === "boolean") return { value: local, source: "local" };
  const repository = getPath(rawConfig, path);
  if (typeof repository === "boolean") return { value: repository, source: "repository" };
  return { value: defaultValue, source: "builtin" };
}
function sectionItem(id, label, description, status, children) {
  return { id, label, description, kind: "group", value: true, displaySuffix: status, children };
}
function capabilityStatus(state) {
  return state?.effective ? "active" : state?.enabled ? "inactive" : "disabled";
}
function sessionFreeflowItems(state, cognitiveRoutingController, ctx, rawConfig, localConfig) {
  const sessionOverrides = state.sessionOverrides;
  const configured = state.configuredCoreConfig;
  const configuredSources = state.configuredSources;
  const freeflowInactive = !state.enabled;
  const sessionSwitch = (id, label, description, key, effective, fallback) => {
    const inherited = configuredSetting(rawConfig, localConfig, key.split("."), fallback);
    const item = createSessionBooleanItem({
      id,
      label,
      description,
      key,
      inheritedValue: inherited.value,
      inheritedSource: inherited.source,
      effectiveValue: effective,
      sessionOverrides,
    });
    item.inactive = freeflowInactive;
    return item;
  };
  const freeflowItem = createSessionBooleanItem({
    id: "freeflow.enabled",
    label: "Freeflow",
    description: "Master switch for Freeflow in this Pi session.",
    key: "enabled",
    inheritedValue: configured.enabled,
    inheritedSource: configuredSources.enabled,
    effectiveValue: state.enabled,
    sessionOverrides,
  });
  const routing = state.cognitiveRouting;
  const routingUnavailable = cognitiveRoutingController === undefined;
  const cognitiveRoutingState = cognitiveRoutingController?.state();
  const manualProfiles = ["coordinator", "helper", "executor"];
  const heldProfile = cognitiveRoutingState?.controlMode.startsWith("manual-")
    ? cognitiveRoutingState.activeProfile
    : undefined;
  const control = heldProfile && manualProfiles.includes(heldProfile) ? heldProfile : "auto";
  const routingInactive = freeflowInactive || !routing?.effective || routingUnavailable;
  const routingItems = [];
  if (routing) {
    const enabledItem = sessionSwitch(
      "freeflow.cognitiveRouting.enabled",
      "Enabled",
      "Use Cognitive Routing in this session.",
      "cognitiveRouting.enabled",
      routing.enabled,
      false,
    );
    enabledItem.inactive = freeflowInactive || routingUnavailable;
    const projectionItem = sessionSwitch(
      "freeflow.cognitiveRouting.projection",
      "Context projection",
      "Show Coordinator the worker evidence selected for it instead of the whole history.",
      "cognitiveRouting.projection",
      routing.projection,
      false,
    );
    projectionItem.inactive = routingInactive;
    const delegationOverride = cognitiveRoutingController?.sessionDelegationOverride() ?? LOCAL_INHERIT;
    const delegation = cognitiveRoutingState?.delegation ?? routing.delegation;
    routingItems.push(
      enabledItem,
      {
        id: "freeflow.cognitiveRouting.profile",
        label: "Control",
        description: "Automatic routing, or hold one profile until you release it.",
        kind: "enum",
        value: control,
        values: ["auto", ...manualProfiles],
        valueLabels: Object.fromEntries([
          ["auto", "automatic"],
          ...manualProfiles.map((profile) => [profile, `hold ${profile}`]),
        ]),
        valueDescriptions: Object.fromEntries([
          ["auto", "Release any hold; Coordinator places the work."],
          ...manualProfiles.map((profile) => [
            profile,
            `Hold ${profile} when delegation enables it; release with /freeflow profile auto.`,
          ]),
        ]),
        inactive: routingInactive,
        runtimeInactive: routing.blockingReason?.code === "runtime_disabled",
      },
      {
        id: "freeflow.cognitiveRouting.delegation",
        label: "Delegation",
        description: "Which workers Coordinator may use in this session.",
        kind: "enum",
        value: delegationOverride,
        values: [LOCAL_INHERIT, "executor", "helper", "both"],
        valueLabels: {
          inherit: "inherit",
          executor: "Executor only",
          helper: "Helper only",
          both: "Helper and Executor",
        },
        valueDescriptions: {
          inherit: `Use ${routing.delegation} from ${SOURCE_LABELS[cognitiveRoutingSettingsSource(routing.delegationSource)]}.`,
          executor: "Coordinator delegates assignments to Executor.",
          helper: "Coordinator delegates supporting assignments to Helper and keeps production implementation.",
          both: "Coordinator chooses Helper or Executor for each assignment.",
        },
        configScope: "session",
        effectiveValue: delegation,
        effectiveSource:
          delegationOverride === LOCAL_INHERIT ? cognitiveRoutingSettingsSource(routing.delegationSource) : "session",
        inheritedValue: routing.delegation,
        inheritedSource: cognitiveRoutingSettingsSource(routing.delegationSource),
        inactive: routingInactive,
      },
      projectionItem,
    );
    if (cognitiveRoutingController) {
      const sessionProfiles = cognitiveRoutingController.sessionProfileOverrides();
      for (const name of manualProfiles) {
        const item = cognitiveRoutingProfileItem({
          name,
          scope: "session",
          rawConfig: {},
          localConfig: {},
          capabilityState: routing,
          ctx,
          sessionProfiles,
        });
        item.inactive ||= routingInactive;
        routingItems.push(item);
      }
    }
  }
  const toolItem = sessionSwitch(
    "freeflow.toolExecution.enabled",
    "Enabled",
    "Use Tool Execution in this session.",
    "toolExecution.enabled",
    state.toolExecution?.enabled ?? false,
    DEFAULT_TOOL_EXECUTION_CONFIG.enabled,
  );
  const compactionItem = sessionSwitch(
    "freeflow.compaction.enabled",
    "Enabled",
    "Use Freeflow compaction in this session.",
    "compaction.enabled",
    state.compaction?.enabled ?? DEFAULT_COMPACTION_ENABLED,
    DEFAULT_COMPACTION_ENABLED,
  );
  const carryItem = sessionSwitch(
    "freeflow.compaction.carry",
    "Context reuse",
    "Let the agent carry selected files and tool results into the next cycle.",
    "compaction.carry",
    state.compaction?.carry ?? DEFAULT_COMPACTION_CARRY,
    DEFAULT_COMPACTION_CARRY,
  );
  const items = [
    freeflowItem,
    ...(routing
      ? [
          sectionItem(
            "freeflow.cognitiveRouting",
            "Cognitive Routing",
            "Routing for this session.",
            routingUnavailable
              ? "unavailable"
              : cognitiveRoutingState?.effective
                ? `active · ${control === "auto" ? "automatic" : `hold ${control}`}`
                : capabilityStatus(routing),
            routingItems,
          ),
        ]
      : []),
    sectionItem(
      "freeflow.toolExecution",
      "Tool Execution",
      "Tool Execution for this session.",
      capabilityStatus(state.toolExecution),
      [toolItem],
    ),
    sectionItem(
      "freeflow.compaction",
      "Compaction",
      "Compaction for this session.",
      capabilityStatus(state.compaction),
      [compactionItem, carryItem],
    ),
    sectionItem("freeflow.session", "Session", "Session overrides.", "", [
      {
        id: "freeflow.session.reset",
        label: "Reset overrides",
        description:
          "Clear every session override above, so the session follows personal and repository settings again.",
        kind: "enum",
        value: "available",
        values: ["reset"],
        valueLabels: { reset: "Reset all session overrides" },
        valueDescriptions: {
          reset: "Return every session setting, delegation, and routing preset to its configured value.",
        },
        // Counted when shown, so it follows changes made on this screen.
        format: () => {
          let count = 0;
          walkSettingsItems(items, (candidate) => {
            if (
              candidate.configScope === "session" &&
              candidate.value !== LOCAL_INHERIT &&
              candidate.value !== undefined
            )
              count += 1;
          });
          return count ? `${count} active` : "none active";
        },
        transient: true,
      },
    ]),
  ];
  return items;
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
      ? (sessionProfile ?? (configuredProfile ? LOCAL_INHERIT : undefined))
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
          ? configuredProfile
            ? "inherit configured preset"
            : "not configured"
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
    wizard: () =>
      createCognitiveRoutingProfileWizard(
        value,
        models,
        options.scope !== "repository" && (options.scope !== "session" || configuredProfile !== undefined),
        inheritChoice,
      ),
  };
}
function isCognitiveRoutingRuntimeAvailable(pi) {
  return (
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
  const freeflowInactive = !core.enabled;
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
    description: "Enable the Tool Execution capability.",
    path: ["toolExecution", "enabled"],
    effectiveValue: toolExecutionState?.enabled ?? false,
    effectiveSource: toolSource(["toolExecution", "enabled"]),
    defaultValue: false,
  });
  const toolExecutionItems = [toolExecutionEnabledItem];
  walkSettingsItems(toolExecutionItems, (item) => {
    item.inactive = freeflowInactive;
  });
  const toolExecutionGroup = {
    id: "freeflow.toolExecution",
    label: "Tool Execution",
    description: "Configure Freeflow's execution layer around Pi's tools.",
    kind: "group",
    value: toolExecutionState?.enabled ?? false,
    inactive: freeflowInactive,
    displaySuffix: toolExecutionState?.effective ? "active" : toolExecutionState?.enabled ? "inactive" : "disabled",
    children: toolExecutionItems,
  };
  const compactionState = options.compaction;
  const compactionEnabledItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.compaction.enabled",
    label: "Enabled",
    description: "Warn before Pi's compaction limit and let the agent compact itself and recover in the same run.",
    path: ["compaction", "enabled"],
    effectiveValue: compactionState?.enabled ?? DEFAULT_COMPACTION_ENABLED,
    effectiveSource: toolSource(["compaction", "enabled"]),
    defaultValue: DEFAULT_COMPACTION_ENABLED,
  });
  const compactionCarryItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.compaction.carry",
    label: "Context reuse",
    description: "Let the agent carry selected files and tool results into the next cycle.",
    path: ["compaction", "carry"],
    effectiveValue: compactionState?.carry ?? DEFAULT_COMPACTION_CARRY,
    effectiveSource: toolSource(["compaction", "carry"]),
    defaultValue: DEFAULT_COMPACTION_CARRY,
  });
  const compactionItems = [compactionEnabledItem, compactionCarryItem];
  walkSettingsItems(compactionItems, (item) => {
    item.inactive = freeflowInactive;
  });
  const compactionGroup = {
    id: "freeflow.compaction",
    label: "Compaction",
    description: "Configure Freeflow compaction; Pi's own compaction stays as the fallback.",
    kind: "group",
    value: compactionState?.enabled ?? DEFAULT_COMPACTION_ENABLED,
    inactive: freeflowInactive,
    displaySuffix: compactionState?.effective ? "active" : compactionState?.enabled ? "inactive" : "disabled",
    children: compactionItems,
  };
  return [freeflowItem, ...(cognitiveRoutingGroup ? [cognitiveRoutingGroup] : []), toolExecutionGroup, compactionGroup];
}
function pruneKnownDefaults(config) {
  const defaultPaths = [
    { path: ["enabled"], value: DEFAULT_FREEFLOW_ENABLED },
    { path: ["cognitiveRouting", "delegation"], value: "executor" },
    { path: ["toolExecution", "enabled"], value: DEFAULT_TOOL_EXECUTION_CONFIG.enabled },
    { path: ["compaction", "enabled"], value: DEFAULT_COMPACTION_ENABLED },
    { path: ["compaction", "carry"], value: DEFAULT_COMPACTION_CARRY },
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
  return ["coordinator", "helper", "executor"].some((profile) => item.id === `freeflow.cognitiveRouting.${profile}`);
}
/** A value as the settings screen shows it, e.g. "enabled · personal" or "inherit → enabled (repository)". */
function formatSettingValue(item, value) {
  if (isCognitiveRoutingProfileItem(item)) return cognitiveRoutingProfileDisplay(value);
  if (typeof value === "boolean") return booleanValue(value);
  const key = String(value ?? "");
  return item.valueLabels?.[key] && key !== LOCAL_INHERIT ? item.valueLabels[key] : formatCoreValue(value);
}
function displayValue(item) {
  if (item.kind === "group") return item.displaySuffix ?? "";
  if (item.transient && item.format) return item.format(item.value);
  if (item.id === "freeflow.cognitiveRouting.profile")
    return item.valueLabels?.[String(item.value)] ?? String(item.value);
  if (item.configScope === "local" || item.configScope === "session") {
    const inherits = item.value === LOCAL_INHERIT || item.value === undefined;
    if (inherits) {
      if (item.inheritedValue === undefined) return "not configured";
      return `inherit → ${formatSettingValue(item, item.inheritedValue)} (${SOURCE_LABELS[item.inheritedSource ?? "builtin"]})`;
    }
    return `${formatSettingValue(item, effectiveItemValue(item))} · ${SOURCE_LABELS[item.configScope]}`;
  }
  const value = item.value === undefined && isCognitiveRoutingProfileItem(item) ? undefined : item.value;
  const shown = formatSettingValue(item, value);
  if (item.localOverrideValue !== undefined && !valuesEqual(item.localOverrideValue, item.value))
    return `${shown} · personal override: ${formatSettingValue(item, item.localOverrideValue)}`;
  return item.effectiveSource === "builtin" && item.defaultValue !== undefined ? `${shown} · default` : shown;
}
/** Small choices change in place; holding a profile switches models and a reset clears everything, so those ask. */
const PICKED_CHOICES = new Set(["freeflow.cognitiveRouting.profile", "freeflow.session.reset"]);
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
  if (toolExecutionGroup && toolExecutionEnabled) {
    const enabled = !freeflowInactive && effectiveItemValue(toolExecutionEnabled) === true;
    toolExecutionGroup.value = effectiveItemValue(toolExecutionEnabled) === true;
    toolExecutionGroup.displaySuffix = enabled
      ? "active"
      : effectiveItemValue(toolExecutionEnabled) === true
        ? "inactive"
        : "disabled";
  }
  const compactionGroup = findSettingsItem(items, "freeflow.compaction");
  const compactionEnabled = findSettingsItem(items, "freeflow.compaction.enabled");
  if (compactionGroup && compactionEnabled) {
    const on = effectiveItemValue(compactionEnabled) === true;
    compactionGroup.value = on;
    compactionGroup.displaySuffix = on && !freeflowInactive ? "active" : on ? "inactive" : "disabled";
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
      { key: "true", value: true, label: "enabled" },
      { key: "false", value: false, label: "disabled" },
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
  return items.flatMap((item) => {
    if (item.kind === "group" && item.children) {
      const section = {
        id: item.id,
        label: item.label,
        description: item.description,
        section: true,
        currentValue: () => displayValue(item),
        inactive: () => item.inactive === true,
      };
      return [section, ...settingsEntries(item.children, rootItems, onChange)];
    }
    const choices = settingsChoices(item);
    return [
      {
        id: item.id,
        label: item.label,
        description: item.description,
        currentValue: () => displayValue(item),
        inactive: () => item.inactive === true,
        currentChoiceKey: () => String(item.value),
        choices,
        cycle: Boolean(choices?.length) && !PICKED_CHOICES.has(item.id),
        wizard: item.wizard ? () => item.wizard() : undefined,
        edit:
          !["boolean", "enum", "group"].includes(item.kind) && !item.wizard
            ? {
                initialValue: () => item.editInitialValue?.() ?? displayValue(item),
                parse: (text) => (item.parse ? item.parse(text) : text),
              }
            : undefined,
        commit: async (value) => {
          if (valuesEqual(item.value, value)) return { changed: false, reloadRequired: false };
          const outcome = await onChange(item, value);
          if (outcome.changed) {
            updateScopedItemState(item, value);
            if (item.id === "freeflow.session.reset") resetSessionItemState(rootItems);
            else if (!item.transient) item.value = value;
            refreshSettingsDerivedState(rootItems);
          }
          return outcome;
        },
      },
    ];
  });
}
async function openSettings(options) {
  if (typeof options.ctx?.ui?.custom !== "function") {
    options.ctx?.ui?.notify?.(
      `${options.title} requires Pi TUI mode. Use the status command for a compact summary.`,
      "warning",
    );
    return { changed: false, configChanged: false, failed: false };
  }
  let component;
  await options.ctx.ui.custom((tui, theme, _keybindings, done) => {
    component = new PiSettingsComponent({
      title: options.title,
      scopes: options.scopes,
      initialScope: options.initialScope,
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
/** Where each scope's values live and whom they affect, shown under the tabs. */
const SCOPES = [
  {
    id: "session",
    label: "Session",
    summary: "This Pi session only, not saved to a file. Overrides personal and repository values.",
  },
  {
    id: "local",
    label: "Personal",
    summary: ".freeflow/local.json: only you, in this checkout. Overrides the repository.",
  },
  {
    id: "repository",
    label: "Repository",
    summary: ".freeflow/config.json: shared with everyone who uses this repository.",
  },
];
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
export async function handleFreeflowCommand(args, ctx, afterChange, pi, cognitiveRoutingController, diagnostics) {
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
  const [layers, state] = await Promise.all([readFreeflowConfigLayers(ctx.cwd), readCapabilityState(ctx.cwd, ctx)]);
  const configState = layers.repository;
  const raw = configState.valid ? configState.parsed : {};
  if (action === "status") {
    ctx.ui.notify(freeflowStatusText(state, cognitiveRoutingController, diagnostics?.status()), "info");
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
      compaction: state.compaction,
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
  let initialScope = "local";
  if (actionValue === "session") {
    initialScope = "session";
  } else if (["repo", "repository", "shared"].includes(actionValue)) {
    initialScope = "repository";
  } else if (actionValue && !["local", "personal"].includes(actionValue)) {
    ctx.ui.notify(
      "Usage: /freeflow settings, /freeflow settings session, /freeflow settings local, or /freeflow settings repo",
      "warning",
    );
    return { changed: false, reloaded: false, error: "invalid_scope" };
  }
  if (!ensureSettingsIdle(ctx)) return { changed: false, reloaded: false, error: "busy" };
  // Each scope is read fresh when shown, so a change in one scope shows up in the others' inherited values.
  const touched = new Set();
  const loadItems = async (scope) => {
    const [layersNow, stateNow] = await Promise.all([
      readFreeflowConfigLayers(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx),
    ]);
    const rawNow = layersNow.repository.valid ? layersNow.repository.parsed : {};
    if (scope === "session") {
      const localNow = layersNow.local.valid && isRecord(layersNow.local.parsed) ? layersNow.local.parsed : {};
      return sessionFreeflowItems(stateNow, cognitiveRoutingController, ctx, rawNow, localNow);
    }
    return freeflowItems(rawNow, {
      scope,
      layers: layersNow,
      cognitiveRouting: stateNow.cognitiveRouting,
      toolExecution: stateNow.toolExecution,
      compaction: stateNow.compaction,
      ctx,
      runtimeAvailable: isCognitiveRoutingRuntimeAvailable(pi),
    });
  };
  const scopes = SCOPES.map((scope) => ({
    ...scope,
    load: async () => {
      const items = await loadItems(scope.id);
      return settingsEntries(items, items, async (item, value) => {
        const outcome = await changeSetting(scope.id, item, value);
        if (outcome.changed) touched.add(scope.id);
        return outcome;
      });
    },
  }));
  const changeSetting = async (settingsScope, item, value) => {
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
        ctx.ui.notify(`Cognitive Routing settings could not be applied: ${result.reason ?? result.status}.`, "warning");
        return { changed: false, reloadRequired: false };
      }
      await afterChange(false);
      return { changed: true, reloadRequired: false };
    }
    if (settingsScope === "session" && item.id === "freeflow.cognitiveRouting.delegation") {
      if (!cognitiveRoutingController) return { changed: false, reloadRequired: false };
      const result = await cognitiveRoutingController.setSessionDelegationOverride(
        value === LOCAL_INHERIT ? null : value,
        "Session delegation settings",
      );
      if (result.status === "blocked" || result.reason) {
        ctx.ui.notify(
          `Cognitive Routing delegation mode could not be applied: ${result.reason ?? result.status}.`,
          "warning",
        );
        return { changed: false, reloadRequired: false };
      }
      await afterChange(false);
      return { changed: result.status !== "unchanged", reloadRequired: false };
    }
    if (item.id === "freeflow.session.reset") {
      const previousDelegation = cognitiveRoutingController?.sessionDelegationOverride() ?? null;
      const delegationResult = cognitiveRoutingController
        ? await cognitiveRoutingController.setSessionDelegationOverride(null, "Reset session delegation mode")
        : { status: "unchanged" };
      if (delegationResult.status === "blocked" || delegationResult.reason) {
        ctx.ui.notify(
          `Cognitive Routing session mode could not be reset: ${delegationResult.reason ?? delegationResult.status}.`,
          "warning",
        );
        return { changed: false, reloadRequired: false };
      }
      const routingResult = cognitiveRoutingController
        ? await cognitiveRoutingController.resetSessionProfileOverrides("Reset session overrides")
        : { status: "unchanged" };
      if (routingResult.status === "blocked" || routingResult.reason) {
        if (delegationResult.status !== "unchanged") {
          const restored = await cognitiveRoutingController.setSessionDelegationOverride(
            previousDelegation,
            "Session reset failed; prior delegation mode retained",
          );
          if (restored.status === "blocked" || restored.reason) {
            await afterChange(false);
            ctx.ui.notify(
              `Session mode was reset but could not be restored: ${restored.reason ?? restored.status}. Reopen settings to see the current mode.`,
              "warning",
            );
          }
        }
        ctx.ui.notify(
          `Cognitive Routing session presets could not be reset: ${routingResult.reason ?? routingResult.status}.`,
          "warning",
        );
        return { changed: false, reloadRequired: false };
      }
      try {
        const result = await resetSessionOverrides(ctx, pi);
        return {
          changed: result.changed || routingResult.status !== "unchanged" || delegationResult.status !== "unchanged",
          reloadRequired: result.reloadRequired,
        };
      } catch (error) {
        ctx.ui.notify(
          `Routing presets were reset, but core/context session overrides could not be reset: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
        return {
          changed: routingResult.status !== "unchanged" || delegationResult.status !== "unchanged",
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
      const key = item.path.join(".");
      const override = value === LOCAL_INHERIT ? null : value === "true";
      const result = await setSessionCoreOverride(key, override, ctx, pi);
      return { changed: result.changed, reloadRequired: result.reloadRequired === true };
    }
    await updateConfig(ctx.cwd, item, value, item.configScope ?? "repository");
    return { changed: true, reloadRequired: true };
  };
  // The first scope opens loaded; the others load when Tab reaches them.
  const first = scopes.find((scope) => scope.id === initialScope);
  const firstEntries = await first.load();
  let preloaded = true;
  const firstLoad = first.load;
  first.load = () => {
    if (!preloaded) return firstLoad();
    preloaded = false;
    return firstEntries;
  };
  const session = await openSettings({ title: "Freeflow settings", scopes, initialScope, ctx });
  // A file write reloads Freeflow; session-only changes reload only when they switch a capability.
  if (touched.has("local") || touched.has("repository")) {
    const reloaded = await finalizeSettingsSession(
      session,
      ctx,
      afterChange,
      "Freeflow settings saved. Reloading Freeflow runtime...",
      "Run /reload for Freeflow changes to fully apply.",
      { reconcileCognitiveRouting: true },
    );
    return { changed: session.changed, reloaded, error: session.failed ? "write_failed" : undefined };
  }
  const reloaded = await finalizeSessionSettings(session, ctx, afterChange);
  return { changed: session.changed, reloaded, error: session.failed ? "write_failed" : undefined };
}

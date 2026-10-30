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
  type SessionCoreKey,
} from "../config.js";
import {
  REVIEW_MODES,
  RUNTIME_PROMPTS,
  SWITCHABLE_SKILLS,
  resolveReviewSettings,
  sectionEnabled,
} from "../config-validation.js";
import { freeflowStatusText } from "../status.js";
import {
  PiSettingsComponent,
  type SettingsCommitResult,
  type SettingsEntry,
  type SettingsScope,
  type SettingsSessionResult,
  type SettingsWizard,
  type SettingsWizardStep,
} from "./settings-view.js";
import type {
  CognitiveRoutingCapabilityState,
  CognitiveRoutingDelegationMode,
  CognitiveRoutingProfile,
  CognitiveRoutingProfileName,
  CognitiveRoutingThinkingLevel,
} from "../../cognitive-routing/config.js";
import { workersForDelegation } from "../../cognitive-routing/types.js";
import { DEFAULT_TOOL_EXECUTION_CONFIG, type ToolExecutionState } from "../../tool-execution/config.js";
import { DEFAULT_COMPACTION_CARRY, DEFAULT_COMPACTION_ENABLED, type CompactionState } from "../../compaction/config.js";
import {
  AUTO_APPROVE_GROUPS,
  DEFAULT_TASK_MEMORY_ENABLED,
  type AutoApproveGroup,
  type TaskMemoryState,
} from "../../task-memory/config.js";
import {
  DEFAULT_INBOUND_POLICY,
  DEFAULT_MESSAGING_ENABLED,
  INBOUND_POLICIES,
  type MessagingState,
} from "../../messaging/config.js";

/*
 * The /freeflow command and the settings model it edits: every Freeflow setting with its repository, personal, and
 * session scopes, the routing profile wizard, config file writes, and reload after saving. settings-view.ts draws the
 * screen; this module decides what is on it.
 */
const DEFAULT_FREEFLOW_ENABLED = true;
const LOCAL_INHERIT = "inherit";
/** How a value's source reads in the settings screen. */
const SOURCE_LABELS: Record<ConfigSource, string> = {
  builtin: "default",
  local: "personal",
  repository: "repository",
  session: "session",
};
const execFileAsync = promisify(execFile);

type ConfigScope = "session" | "local" | "repository";
type ConfigSource = "session" | "local" | "repository" | "builtin";

type SettingKind = "boolean" | "enum" | "integer" | "string" | "list" | "json" | "group";
type SettingsValue = boolean | number | string | null | SettingsValue[] | { [key: string]: SettingsValue };

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
  runtimeInactive?: boolean;
  /** A group shown as one row that opens its settings on a screen of their own, as the routing presets do. */
  nested?: boolean;
  /** The section's own row, as a capability's `.enabled` switch is, for a section without one (Review). */
  heading?: boolean;
  /** Repository tab: the repository file does not set this, so its value is Freeflow's default. */
  repositoryUnset?: boolean;
  displaySuffix?: string;
  children?: SettingsItem[];
  wizard?: () => SettingsWizard;
  parse?: (text: string) => unknown;
  format?: (value: unknown) => string;
  editInitialValue?: () => string;
  configScope?: ConfigScope;
  configValues?: Record<string, unknown>;
  effectiveValue?: unknown;
  effectiveSource?: ConfigSource;
  inheritedValue?: unknown;
  inheritedSource?: ConfigSource;
  localOverrideValue?: unknown;
  transient?: boolean;
};

type SessionRoutingPair = {
  provider: string;
  modelId: string;
  thinking: CognitiveRoutingThinkingLevel;
};

type CognitiveRoutingSettingsController = {
  state(): {
    effective: boolean;
    controlMode: string;
    activeProfile?: string;
    delegation: CognitiveRoutingDelegationMode;
    presetWarnings?: readonly string[];
  };
  sessionProfileOverrides(): Partial<Record<CognitiveRoutingProfileName, SessionRoutingPair>>;
  sessionDelegationOverride(): CognitiveRoutingDelegationMode | undefined;
  setManualProfile(
    profile: CognitiveRoutingProfileName,
    mechanism?: string,
  ): Promise<{ status: string; reason?: string }>;
  setAutomaticControl(mechanism?: string): Promise<{ status: string; reason?: string }>;
  setSessionProfileOverride(
    profile: CognitiveRoutingProfileName,
    override: SessionRoutingPair | null,
    mechanism?: string,
  ): Promise<{ status: string; reason?: string }>;
  resetSessionProfileOverrides(mechanism?: string): Promise<{ status: string; reason?: string }>;
  setSessionDelegationOverride(
    override: CognitiveRoutingDelegationMode | null,
    mechanism?: string,
  ): Promise<{ status: string; reason?: string }>;
};

type AfterChangeOptions = {
  reconcileCognitiveRouting?: boolean;
};

type AfterChange = (changed: boolean, options?: AfterChangeOptions) => Promise<void> | void;

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

function getPath(source: unknown, path: string[]): SettingsValue | undefined {
  let current: unknown = source;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key] as SettingsValue | undefined;
  }
  return current as SettingsValue | undefined;
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

/** What choosing inherit means, for the help line: "Follow the default (on)." */
function inheritText(value: unknown, source: string): string {
  return source === "default" ? `Inherit Freeflow's default (${value}).` : `Inherit the ${source} setting (${value}).`;
}

function booleanValue(value: unknown): string {
  return value === true ? "on" : "off";
}

function configValueForChoice(item: SettingsItem, value: unknown): SettingsValue | undefined {
  const key = String(value);
  if (item.configValues && Object.hasOwn(item.configValues, key)) {
    return item.configValues[key] as SettingsValue | undefined;
  }
  return value as SettingsValue | undefined;
}

function effectiveItemValue(item: SettingsItem): SettingsValue | undefined {
  return (item.effectiveValue === undefined ? item.value : item.effectiveValue) as SettingsValue | undefined;
}

function formatCoreValue(value: unknown): string {
  if (typeof value === "boolean") return booleanValue(value);
  if (isRecord(value) && typeof value.provider === "string" && typeof value.model === "string") {
    const effort = typeof value.thinking === "string" ? ` · ${value.thinking}` : "";
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
      description: options.description,
      path: options.path,
      kind: "enum",
      value: selectedValue,
      values: [LOCAL_INHERIT, "true", "false"],
      valueLabels: { inherit: "inherit", true: "on", false: "off" },
      valueDescriptions: {
        inherit: inheritText(formatCoreValue(inheritedValue), SOURCE_LABELS[inheritedSource]),
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
      repositoryUnset: typeof repositoryValue !== "boolean",
      effectiveValue: options.effectiveValue,
      effectiveSource: options.effectiveSource,
      localOverrideValue: typeof localValue === "boolean" ? localValue : undefined,
    };
  }
  item.displaySuffix = coreDisplaySuffix(item);
  return item;
}

/** A choice among fixed values, in the Personal or Repository scope; Personal can inherit the repository's value. */
function createScopedChoiceItem(options: {
  scope: Exclude<ConfigScope, "session">;
  rawConfig: Record<string, unknown>;
  localConfig: Record<string, unknown>;
  id: string;
  label: string;
  description: string;
  path: string[];
  values: readonly string[];
  valueLabels: Record<string, string>;
  valueDescriptions: Record<string, string>;
  defaultValue: string;
  effectiveValue: string;
  effectiveSource: ConfigSource;
}): SettingsItem {
  const repositoryValue = getPath(options.rawConfig, options.path);
  const inheritedValue = options.values.includes(repositoryValue as string)
    ? (repositoryValue as string)
    : options.defaultValue;
  const inheritedSource: ConfigSource = repositoryValue === undefined ? "builtin" : "repository";
  const localValue = getPath(options.localConfig, options.path);
  const common = {
    id: options.id,
    label: options.label,
    path: options.path,
    kind: "enum" as const,
    effectiveValue: options.effectiveValue,
    effectiveSource: options.effectiveSource,
  };
  return options.scope === "local"
    ? {
        ...common,
        description: options.description,
        value: options.values.includes(localValue as string) ? localValue : LOCAL_INHERIT,
        values: [LOCAL_INHERIT, ...options.values],
        valueLabels: { inherit: "inherit", ...options.valueLabels },
        valueDescriptions: {
          inherit: inheritText(options.valueLabels[inheritedValue] ?? inheritedValue, SOURCE_LABELS[inheritedSource]),
          ...options.valueDescriptions,
        },
        configScope: "local",
        configValues: Object.fromEntries([["inherit", undefined], ...options.values.map((value) => [value, value])]),
        inheritedValue,
        inheritedSource,
      }
    : {
        ...common,
        description: `${options.description} This edits shared .freeflow/config.json.`,
        value: inheritedValue,
        values: [...options.values],
        valueLabels: options.valueLabels,
        valueDescriptions: options.valueDescriptions,
        defaultValue: options.defaultValue,
        configScope: "repository",
        repositoryUnset: repositoryValue === undefined,
        localOverrideValue: options.values.includes(localValue as string) ? localValue : undefined,
      };
}

function createScopedDelegationItem(options: {
  scope: Exclude<ConfigScope, "session">;
  rawConfig: Record<string, unknown>;
  localConfig: Record<string, unknown>;
  effectiveValue: CognitiveRoutingDelegationMode;
  effectiveSource: ConfigSource;
}): SettingsItem {
  const path = ["cognitiveRouting", "delegation"];
  const repositoryValue = getPath(options.rawConfig, path);
  const inheritedValue: CognitiveRoutingDelegationMode = ["executor", "helper", "both"].includes(
    repositoryValue as string,
  )
    ? (repositoryValue as CognitiveRoutingDelegationMode)
    : "executor";
  const inheritedSource: ConfigSource = repositoryValue === undefined ? "builtin" : "repository";
  const localValue = getPath(options.localConfig, path);
  const descriptions = {
    executor: "Coordinator delegates assignments to Executor.",
    helper: "Coordinator delegates supporting assignments to Helper and keeps production implementation.",
    both: "Coordinator chooses Helper or Executor for each assignment.",
  };
  const item: SettingsItem =
    options.scope === "local"
      ? {
          id: "freeflow.cognitiveRouting.delegation",
          label: "Delegation",
          description: "Choose enabled workers for automatic routing; this setting does not rank model presets.",
          path,
          kind: "enum",
          value: ["executor", "helper", "both"].includes(localValue as string) ? localValue : LOCAL_INHERIT,
          values: [LOCAL_INHERIT, "executor", "helper", "both"],
          valueLabels: {
            inherit: "inherit",
            executor: "Executor only",
            helper: "Helper only",
            both: "Helper and Executor",
          },
          valueDescriptions: {
            inherit: inheritText(inheritedValue, SOURCE_LABELS[inheritedSource]),
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
          repositoryUnset: repositoryValue === undefined,
          effectiveValue: options.effectiveValue,
          effectiveSource: options.effectiveSource,
          localOverrideValue: ["executor", "helper", "both"].includes(localValue as string) ? localValue : undefined,
        };
  item.displaySuffix = coreDisplaySuffix(item);
  return item;
}

function resolveSettingsCoreView(
  rawConfig: Record<string, unknown>,
  layers?: Awaited<ReturnType<typeof readFreeflowConfigLayers>>,
) {
  const localConfig = layers?.local.valid && isRecord(layers.local.parsed) ? layers.local.parsed : {};
  const fallbackCore = { enabled: getPath(rawConfig, ["enabled"]) !== false };
  const fallbackSources = {
    enabled: typeof getPath(rawConfig, ["enabled"]) === "boolean" ? "repository" : "builtin",
  } as const;
  return {
    localConfig,
    core: layers?.coreConfig ?? fallbackCore,
    sources: (layers?.sources ?? fallbackSources) as { enabled: ConfigSource },
  };
}

function createSessionBooleanItem(options: {
  id: string;
  label: string;
  description: string;
  key: SessionCoreKey;
  inheritedValue: boolean;
  inheritedSource: ConfigSource;
  effectiveValue: boolean;
  sessionOverrides: Partial<Record<SessionCoreKey, boolean>>;
}): SettingsItem {
  const override = options.sessionOverrides[options.key];
  return {
    id: options.id,
    label: options.label,
    description: options.description,
    path: options.key.split("."),
    kind: "enum",
    value: typeof override === "boolean" ? String(override) : LOCAL_INHERIT,
    values: [LOCAL_INHERIT, "true", "false"],
    valueLabels: { inherit: "inherit", true: "on", false: "off" },
    valueDescriptions: {
      inherit: inheritText(formatCoreValue(options.inheritedValue), SOURCE_LABELS[options.inheritedSource]),
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

const AUTO_APPROVE_LABELS: Record<AutoApproveGroup, [string, string]> = {
  attach: ["Attach", "attaching a record, and making a held record writable"],
  create: ["Create", "creating a task or a child task"],
  env: ["Directories", "changing a task's directories"],
  fanout: ["Fan-out", "a child task with its own Git worktree and branch"],
  projects: ["Projects", "creating or linking a project, and importing a record into one"],
};
const INBOUND_LABELS = { accept: "never", project: "outside the project", hold: "every message", refuse: "refuse all" };
const INBOUND_DESCRIPTIONS = {
  accept: "Deliver every message to the agent.",
  project: "Deliver messages from sessions in this repository's Task Memory project; ask you about the rest.",
  hold: "Ask you before delivering any message.",
  refuse: "Refuse every message.",
};
const REVIEW_DESCRIPTIONS = {
  auto: "Review Work's risk check decides.",
  off: "Never on its own; for a risky change the agent proposes a review, with its reason and cost, and waits for you.",
  always: "Review every finished task.",
};

/** A choice among fixed values in the Session scope; inherit follows the personal and repository settings. */
function createSessionChoiceItem(options: {
  id: string;
  label: string;
  description: string;
  key: SessionCoreKey;
  values: readonly string[];
  valueLabels: Record<string, string>;
  valueDescriptions: Record<string, string>;
  inheritedValue: string;
  inheritedSource: ConfigSource;
  effectiveValue: string;
  sessionOverrides: Partial<Record<SessionCoreKey, unknown>>;
}): SettingsItem {
  const override = options.sessionOverrides[options.key];
  const set = typeof override === "string" && options.values.includes(override);
  return {
    id: options.id,
    label: options.label,
    description: options.description,
    path: options.key.split("."),
    kind: "enum",
    value: set ? override : LOCAL_INHERIT,
    values: [LOCAL_INHERIT, ...options.values],
    valueLabels: { inherit: "inherit", ...options.valueLabels },
    valueDescriptions: {
      inherit: inheritText(
        options.valueLabels[options.inheritedValue] ?? options.inheritedValue,
        SOURCE_LABELS[options.inheritedSource],
      ),
      ...options.valueDescriptions,
    },
    configScope: "session",
    configValues: Object.fromEntries([["inherit", undefined], ...options.values.map((value) => [value, value])]),
    effectiveValue: options.effectiveValue,
    effectiveSource: set ? "session" : options.inheritedSource,
    inheritedValue: options.inheritedValue,
    inheritedSource: options.inheritedSource,
  };
}

/** A setting's configured value and source without session overrides: personal, then repository, then the default. */
function configuredSetting<T extends boolean | string>(
  rawConfig: Record<string, unknown>,
  localConfig: Record<string, unknown>,
  path: string[],
  defaultValue: T,
): { value: T; source: ConfigSource } {
  const local = getPath(localConfig, path);
  if (typeof local === typeof defaultValue) return { value: local as T, source: "local" };
  const repository = getPath(rawConfig, path);
  if (typeof repository === typeof defaultValue) return { value: repository as T, source: "repository" };
  return { value: defaultValue, source: "builtin" };
}

const PROMPT_LABELS: Record<(typeof RUNTIME_PROMPTS)[number], [string, string]> = {
  core: ["Core", "How Freeflow works: the cycle, what authorizes work, and where it stops."],
  interactionContract: ["Interaction Contract", "How the agent talks with you: questions, reports and stopping."],
  workingMethod: ["Working Method", "How the agent works: small output, named decisions, diagnosing before fixing."],
};

/** A skill's name as the screen shows it: discuss-work as Discuss Work. */
function skillLabel(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** One row that opens a list of switches on a screen of its own, as Auto-approve does. */
function nestedGroup(id: string, label: string, description: string, children: SettingsItem[]): SettingsItem {
  return { id, label, description, kind: "group", nested: true, value: true, children };
}

/** Sections from everyday to experimental (Task 005): Freeflow, then the capabilities, then session tools. */
const SECTION_ORDER = [
  "freeflow.enabled",
  "freeflow.prompts",
  "freeflow.skills",
  "freeflow.compaction",
  "freeflow.toolExecution",
  "freeflow.taskMemory",
  "freeflow.messaging",
  "freeflow.cognitiveRouting",
  "freeflow.review",
  "freeflow.session",
];

function inSectionOrder(items: SettingsItem[]): SettingsItem[] {
  const rank = (item: SettingsItem) => {
    const at = SECTION_ORDER.indexOf(item.id);
    return at < 0 ? SECTION_ORDER.length : at;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

function sectionItem(id: string, label: string, description: string, status: string, children: SettingsItem[]) {
  return { id, label, description, kind: "group", value: true, displaySuffix: status, children } satisfies SettingsItem;
}

function capabilityStatus(state: { enabled?: boolean; effective?: boolean } | undefined): string {
  return state?.effective ? "active" : state?.enabled ? "inactive" : "disabled";
}

function sessionFreeflowItems(
  state: Awaited<ReturnType<typeof readCapabilityState>>,
  cognitiveRoutingController: CognitiveRoutingSettingsController | undefined,
  ctx: any,
  rawConfig: Record<string, unknown>,
  localConfig: Record<string, unknown>,
): SettingsItem[] {
  const sessionOverrides = state.sessionOverrides as Partial<Record<SessionCoreKey, any>>;
  const configured = state.configuredCoreConfig;
  const configuredSources = state.configuredSources as { enabled: ConfigSource };
  const freeflowInactive = !state.enabled;
  const sessionSwitch = (
    id: string,
    label: string,
    description: string,
    key: SessionCoreKey,
    effective: boolean,
    fallback: boolean,
  ) => {
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
  const manualProfiles: CognitiveRoutingProfileName[] = ["coordinator", "helper", "executor"];
  const heldProfile = cognitiveRoutingState?.controlMode.startsWith("manual-")
    ? cognitiveRoutingState.activeProfile
    : undefined;
  const control =
    heldProfile && manualProfiles.includes(heldProfile as CognitiveRoutingProfileName) ? heldProfile : "auto";
  const routingInactive = freeflowInactive || !routing?.effective || routingUnavailable;
  const routingItems: SettingsItem[] = [];
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
    enabledItem.runtimeInactive = routingUnavailable;
    const projectionItem = sessionSwitch(
      "freeflow.cognitiveRouting.projection",
      "Context projection",
      "Show Coordinator the worker evidence selected for it instead of the whole history.",
      "cognitiveRouting.projection",
      routing.projection,
      true,
    );
    // Delegation, projection and the presets can be set while routing is not running: setting a missing preset is how
    // it starts. Only Control needs routing running, since holding a profile switches the model at once.
    projectionItem.inactive = freeflowInactive || routingUnavailable;
    projectionItem.runtimeInactive = routingUnavailable;
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
        // Holding a profile switches the model at once, so it needs routing running, not only configured.
        runtimeInactive: routingInactive,
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
          inherit: inheritText(
            routing.delegation,
            SOURCE_LABELS[cognitiveRoutingSettingsSource(routing.delegationSource)],
          ),
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
        inactive: freeflowInactive || routingUnavailable,
        runtimeInactive: routingUnavailable,
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
          capabilityState: routing as CognitiveRoutingCapabilityState,
          ctx,
          sessionProfiles,
        });
        item.inactive ||= freeflowInactive || routingUnavailable;
        item.runtimeInactive ||= routingUnavailable;
        routingItems.push(item);
      }
    }
  }

  const toolItem = sessionSwitch(
    "freeflow.toolExecution.enabled",
    "Enabled",
    "Use Tool Execution in this session.",
    "toolExecution.enabled",
    state.toolExecution?.enabled ?? DEFAULT_TOOL_EXECUTION_CONFIG.enabled,
    DEFAULT_TOOL_EXECUTION_CONFIG.enabled,
  );
  const noticesItem = sessionSwitch(
    "freeflow.toolExecution.guidanceNotices",
    "Guidance notices",
    "Add a skill's key lines to the result of the tool call that needs them, in this session.",
    "toolExecution.guidanceNotices",
    state.toolExecution?.guidanceNotices ?? DEFAULT_TOOL_EXECUTION_CONFIG.guidanceNotices,
    DEFAULT_TOOL_EXECUTION_CONFIG.guidanceNotices,
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
    "Carry the cycle's newest tool results into the next cycle with the task's bundle.",
    "compaction.carry",
    state.compaction?.carry ?? DEFAULT_COMPACTION_CARRY,
    DEFAULT_COMPACTION_CARRY,
  );
  const autoApproveItems = (Object.keys(AUTO_APPROVE_GROUPS) as AutoApproveGroup[]).map((group) =>
    sessionSwitch(
      `freeflow.taskMemory.autoApprove.${group}`,
      AUTO_APPROVE_LABELS[group][0],
      `Let the agent do this without asking you first, in this session: ${AUTO_APPROVE_LABELS[group][1]}.`,
      `taskMemory.autoApprove.${group}`,
      state.taskMemory?.autoApprove?.[group] ?? false,
      false,
    ),
  );
  const inboundInherited = configuredSetting(rawConfig, localConfig, ["messaging", "inbound"], DEFAULT_INBOUND_POLICY);
  const inboundItem = createSessionChoiceItem({
    id: "freeflow.messaging.inbound",
    label: "Ask before delivering",
    description: "Whether a message from another session waits for you to accept it, in this session.",
    key: "messaging.inbound",
    values: INBOUND_POLICIES,
    valueLabels: INBOUND_LABELS,
    valueDescriptions: INBOUND_DESCRIPTIONS,
    inheritedValue: inboundInherited.value,
    inheritedSource: inboundInherited.source,
    effectiveValue: state.messaging?.inbound ?? DEFAULT_INBOUND_POLICY,
    sessionOverrides,
  });
  inboundItem.inactive = freeflowInactive;
  const reviewInherited = configuredSetting(rawConfig, localConfig, ["review", "mode"], "auto");
  const reviewModeItem = createSessionChoiceItem({
    id: "freeflow.review.mode",
    label: "Independent review",
    description: "When finished work is reviewed by a separate reviewer, in this session.",
    key: "review.mode",
    values: REVIEW_MODES,
    valueLabels: { auto: "auto", off: "off", always: "always" },
    valueDescriptions: REVIEW_DESCRIPTIONS,
    inheritedValue: reviewInherited.value,
    inheritedSource: reviewInherited.source,
    effectiveValue: state.review?.mode ?? "auto",
    sessionOverrides,
  });
  reviewModeItem.inactive = freeflowInactive;
  reviewModeItem.heading = true;
  const reviewModelItem = reviewerModelItem({
    scope: "session",
    rawConfig,
    localConfig,
    effectiveValue: state.review?.model,
    effectiveSource: typeof sessionOverrides["review.model"] === "string" ? "session" : "builtin",
    ctx,
    sessionValue: typeof sessionOverrides["review.model"] === "string" ? sessionOverrides["review.model"] : undefined,
  });
  reviewModelItem.inactive = freeflowInactive;
  const promptsMaster = sessionSwitch(
    "freeflow.prompts.enabled",
    "Enabled",
    "Add Freeflow's runtime prompts in this session. Off leaves all three out; Freeflow stays on.",
    "prompts.enabled",
    state.promptsEnabled ?? true,
    true,
  );
  const skillsMaster = sessionSwitch(
    "freeflow.skills.enabled",
    "Enabled",
    "Give the agent Freeflow's skills in this session. Off turns every skill but Setup Freeflow off.",
    "skills.enabled",
    state.skills?.enabled ?? true,
    true,
  );
  const promptItems = RUNTIME_PROMPTS.map((prompt) =>
    sessionSwitch(
      `freeflow.prompts.${prompt}`,
      PROMPT_LABELS[prompt][0],
      `${PROMPT_LABELS[prompt][1]} In this session.`,
      `prompts.${prompt}`,
      configuredSetting(rawConfig, localConfig, ["prompts", prompt], true).value,
      true,
    ),
  );
  const skillItems = SWITCHABLE_SKILLS.map((skill) =>
    sessionSwitch(
      `freeflow.skills.${skill}`,
      skillLabel(skill),
      `Give the agent ${skill} in this session.`,
      `skills.${skill}`,
      configuredSetting(rawConfig, localConfig, ["skills", skill], true).value,
      true,
    ),
  );

  const taskMemoryItem = sessionSwitch(
    "freeflow.taskMemory.enabled",
    "Enabled",
    "Use task memory in this session.",
    "taskMemory.enabled",
    state.taskMemory?.enabled ?? DEFAULT_TASK_MEMORY_ENABLED,
    DEFAULT_TASK_MEMORY_ENABLED,
  );
  const messagingItem = sessionSwitch(
    "freeflow.messaging.enabled",
    "Enabled",
    "Exchange messages with other Pi sessions on this machine.",
    "messaging.enabled",
    state.messaging?.enabled ?? DEFAULT_MESSAGING_ENABLED,
    DEFAULT_MESSAGING_ENABLED,
  );

  const items: SettingsItem[] = [
    freeflowItem,
    sectionItem("freeflow.prompts", "Runtime prompts", "Runtime prompts for this session.", "", [
      promptsMaster,
      nestedGroup("freeflow.prompts.each", "Each prompt", "One switch per prompt, in this session.", promptItems),
    ]),
    sectionItem("freeflow.skills", "Skills", "Skills for this session; Setup Freeflow always stays.", "", [
      skillsMaster,
      nestedGroup("freeflow.skills.each", "Each skill", "One switch per skill, in this session.", skillItems),
    ]),
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
      [toolItem, noticesItem],
    ),
    sectionItem(
      "freeflow.compaction",
      "Compaction",
      "Compaction for this session.",
      capabilityStatus(state.compaction),
      [compactionItem, carryItem],
    ),
    sectionItem(
      "freeflow.taskMemory",
      "Task Memory",
      "Task memory for this session.",
      capabilityStatus(state.taskMemory),
      [
        taskMemoryItem,
        nestedGroup(
          "freeflow.taskMemory.autoApprove",
          "Auto-approve",
          "Task memory actions the agent may take without asking you first, in this session. Enter opens the five switches; Esc returns.",
          autoApproveItems,
        ),
      ],
    ),
    sectionItem("freeflow.messaging", "Messaging", "Messaging for this session.", capabilityStatus(state.messaging), [
      messagingItem,
      inboundItem,
    ]),
    sectionItem("freeflow.review", "Review", "Review Work for this session.", "", [reviewModeItem, reviewModelItem]),
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
  return inSectionOrder(items);
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
    typeof value.thinking === "string" &&
    COGNITIVE_ROUTING_THINKING_LEVELS.includes(value.thinking as CognitiveRoutingThinkingLevel)
  );
}

/**
 * The thinking levels a model supports, by Pi's own rule (pi-ai's getSupportedThinkingLevels): a model without
 * reasoning has only off; a level its thinkingLevelMap maps to null is unsupported; xhigh and max need a mapping.
 * Pi's model registry has no such method, so the rule reads the model's data directly.
 */
function cognitiveRoutingThinkingLevels(model: any): CognitiveRoutingThinkingLevel[] {
  if (model?.reasoning !== true) return ["off"];
  return COGNITIVE_ROUTING_THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    return level === "xhigh" || level === "max" ? mapped !== undefined : true;
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
      const thinkingLevels = cognitiveRoutingThinkingLevels(model);
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
  if (source === "session") return "session";
  if (source === "repository") return "repository";
  if (source === "personal" || source === "local") return "local";
  return "builtin";
}

function cognitiveRoutingProfileDisplaySuffix(source: unknown, scope: ConfigScope): string | undefined {
  if (!source) return undefined;
  if (source === "session") return "(session override)";
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

/**
 * The reviewer model: Freeflow passes the name on as written (Review Work), so the picker offers this host's
 * authenticated models by `provider/id`, keeps a name set elsewhere, and clears the setting with None or inherit.
 */
function reviewerModelItem(options: {
  scope: ConfigScope;
  rawConfig: Record<string, unknown>;
  localConfig: Record<string, unknown>;
  effectiveValue: string | undefined;
  effectiveSource: ConfigSource;
  ctx: any;
  sessionValue?: string;
}): SettingsItem {
  const path = ["review", "model"];
  const name = (value: unknown) => (typeof value === "string" ? value : undefined);
  const repositoryModel = name(getPath(options.rawConfig, path));
  const configuredModel = name(getPath(options.localConfig, path)) ?? repositoryModel;
  const session = options.scope === "session";
  const local = options.scope === "local";
  const value = session ? options.sessionValue : local ? name(getPath(options.localConfig, path)) : repositoryModel;
  const inherited = session ? configuredModel : repositoryModel;
  const clear = session
    ? { label: "Inherit configured setting", description: "Remove this session's reviewer model." }
    : local
      ? { label: "Inherit repository setting", description: "Remove your personal reviewer model." }
      : { label: "None", description: "Review Work chooses the reviewer's model." };
  const models = cognitiveRoutingModelOptions(options.ctx).map((model) => model.key);
  const names = value && !models.includes(value) ? [value, ...models] : models;
  return {
    id: "freeflow.review.model",
    label: "Reviewer model",
    description: session
      ? "The model a reviewer runs on, in this Pi session only."
      : local
        ? "The model a reviewer runs on, for you in this checkout."
        : "The model a reviewer runs on, where the host lets the agent choose one. This edits shared .freeflow/config.json.",
    path,
    kind: "string",
    value,
    format: (current) => (typeof current === "string" ? current : "none"),
    configScope: options.scope,
    effectiveValue: options.effectiveValue,
    effectiveSource: options.effectiveSource,
    inheritedValue: session || local ? inherited : undefined,
    inheritedSource:
      session && name(getPath(options.localConfig, path))
        ? "local"
        : (session || local) && repositoryModel
          ? "repository"
          : "builtin",
    wizard: () => ({
      firstStep: () => ({
        title: "Choose reviewer model",
        choices: [
          { key: LOCAL_INHERIT, value: LOCAL_INHERIT, label: clear.label, description: clear.description },
          ...names.map((key) => ({
            key,
            value: key,
            label: key,
            description: models.includes(key) ? "" : "Set in the file; not an authenticated model here.",
          })),
        ],
        selectedKey: value ?? LOCAL_INHERIT,
      }),
      nextStep: () => undefined,
      valueFromSelections: (selected) => (selected[0] === LOCAL_INHERIT ? undefined : selected[0]),
    }),
  };
}

function createCognitiveRoutingProfileWizard(
  currentValue: unknown,
  models: CognitiveRoutingModelOption[],
  allowInherit: boolean,
  inheritChoice: { label: string; description: string; summary: string } = {
    label: "Inherit repository preset",
    description: "Remove the personal override without changing the repository preset.",
    summary: "inherit repository preset",
  },
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
        const model = selected as CognitiveRoutingModelOption;
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
        thinking: selectedValues[1] as CognitiveRoutingThinkingLevel,
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
  sessionProfiles?: Partial<Record<CognitiveRoutingProfileName, SessionRoutingPair>>;
}): SettingsItem {
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

function isCognitiveRoutingRuntimeAvailable(pi: any): boolean {
  return (
    typeof pi?.appendEntry === "function" &&
    typeof pi?.setModel === "function" &&
    typeof pi?.setThinkingLevel === "function"
  );
}

function freeflowItems(
  rawConfig: Record<string, unknown>,
  options: {
    scope?: ConfigScope;
    layers?: Awaited<ReturnType<typeof readFreeflowConfigLayers>>;
    cognitiveRouting?: CognitiveRoutingCapabilityState;
    toolExecution?: ToolExecutionState;
    compaction?: CompactionState;
    taskMemory?: TaskMemoryState;
    messaging?: MessagingState;
    ctx?: any;
    runtimeAvailable?: boolean;
  } = {},
): SettingsItem[] {
  const scope: Exclude<ConfigScope, "session"> = options.scope === "local" ? "local" : "repository";
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
      // On by default with routing, as cognitive-routing/config.ts resolves it.
      effectiveValue: cognitiveRoutingState?.projection ?? true,
      effectiveSource: cognitiveRoutingSettingsSource(cognitiveRoutingState?.projectionSource),
      defaultValue: true,
    });
    cognitiveRoutingProjectionItem.inactive = freeflowInactive || cognitiveRoutingRuntimeDisabled;
    cognitiveRoutingProjectionItem.runtimeInactive = cognitiveRoutingRuntimeDisabled;

    const cognitiveRoutingProfiles = ["coordinator", "helper", "executor"].map((name) =>
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
      kind: "group" as const,
      value: cognitiveRoutingRuntimeDisabled ? false : (cognitiveRoutingState?.enabled ?? false),
      inactive: freeflowInactive,
      displaySuffix: cognitiveRoutingStatus,
      children: [
        cognitiveRoutingEnabledItem,
        cognitiveRoutingDelegationItem,
        ...cognitiveRoutingProfiles,
        cognitiveRoutingProjectionItem,
      ],
    } satisfies SettingsItem;
  })();

  const toolExecutionState = options.toolExecution;
  const toolSource = (path: string[]): ConfigSource => {
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
    effectiveValue: toolExecutionState?.enabled ?? DEFAULT_TOOL_EXECUTION_CONFIG.enabled,
    effectiveSource: toolSource(["toolExecution", "enabled"]),
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.enabled,
  });

  const guidanceNoticesItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.toolExecution.guidanceNotices",
    label: "Guidance notices",
    description:
      "Add a skill's key lines to the result of the tool call that needs them, such as a commit or a failing test.",
    path: ["toolExecution", "guidanceNotices"],
    effectiveValue: toolExecutionState?.guidanceNotices ?? DEFAULT_TOOL_EXECUTION_CONFIG.guidanceNotices,
    effectiveSource: toolSource(["toolExecution", "guidanceNotices"]),
    defaultValue: DEFAULT_TOOL_EXECUTION_CONFIG.guidanceNotices,
  });

  const toolExecutionItems = [toolExecutionEnabledItem, guidanceNoticesItem];
  walkSettingsItems(toolExecutionItems, (item) => {
    item.inactive = freeflowInactive;
  });
  const toolExecutionGroup: SettingsItem = {
    id: "freeflow.toolExecution",
    label: "Tool Execution",
    description: "Configure Freeflow's execution layer around Pi's tools.",
    kind: "group",
    value: toolExecutionState?.enabled ?? DEFAULT_TOOL_EXECUTION_CONFIG.enabled,
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
    description: "Carry the cycle's newest tool results into the next cycle with the task's bundle.",
    path: ["compaction", "carry"],
    effectiveValue: compactionState?.carry ?? DEFAULT_COMPACTION_CARRY,
    effectiveSource: toolSource(["compaction", "carry"]),
    defaultValue: DEFAULT_COMPACTION_CARRY,
  });
  const compactionItems = [compactionEnabledItem, compactionCarryItem];
  walkSettingsItems(compactionItems, (item) => {
    item.inactive = freeflowInactive;
  });
  const compactionGroup: SettingsItem = {
    id: "freeflow.compaction",
    label: "Compaction",
    description: "Configure Freeflow compaction; Pi's own compaction stays as the fallback.",
    kind: "group",
    value: compactionState?.enabled ?? DEFAULT_COMPACTION_ENABLED,
    inactive: freeflowInactive,
    displaySuffix: compactionState?.effective ? "active" : compactionState?.enabled ? "inactive" : "disabled",
    children: compactionItems,
  };

  const taskMemoryState = options.taskMemory;
  const taskMemoryEnabledItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.taskMemory.enabled",
    label: "Enabled",
    description:
      "A preview: attach Working Records to the session, deliver the focused record after compaction, and refuse record writes to records not attached.",
    path: ["taskMemory", "enabled"],
    effectiveValue: taskMemoryState?.enabled ?? DEFAULT_TASK_MEMORY_ENABLED,
    effectiveSource: toolSource(["taskMemory", "enabled"]),
    defaultValue: DEFAULT_TASK_MEMORY_ENABLED,
  });
  taskMemoryEnabledItem.inactive = freeflowInactive;
  // Which proposals skip the confirmation dialog (Task 004 D-002).
  const approveLabels = AUTO_APPROVE_LABELS;
  const approveItems = (Object.keys(AUTO_APPROVE_GROUPS) as AutoApproveGroup[]).map((group) => {
    const item = createScopedBooleanItem({
      scope,
      rawConfig,
      localConfig,
      id: `freeflow.taskMemory.autoApprove.${group}`,
      label: approveLabels[group][0],
      description: `Let the agent do this without asking you first: ${approveLabels[group][1]}. Off asks every time.`,
      path: ["taskMemory", "autoApprove", group],
      effectiveValue: taskMemoryState?.autoApprove?.[group] ?? false,
      effectiveSource: toolSource(["taskMemory", "autoApprove", group]),
      defaultValue: false,
    });
    item.inactive = freeflowInactive;
    return item;
  });
  const taskMemoryGroup: SettingsItem = {
    id: "freeflow.taskMemory",
    label: "Task Memory",
    description: "Configure task memory: Working Records the session knows, delivers and guards.",
    kind: "group",
    value: taskMemoryState?.enabled ?? DEFAULT_TASK_MEMORY_ENABLED,
    inactive: freeflowInactive,
    displaySuffix: taskMemoryState?.effective ? "active" : taskMemoryState?.enabled ? "inactive" : "disabled",
    children: [
      taskMemoryEnabledItem,
      {
        id: "freeflow.taskMemory.autoApprove",
        label: "Auto-approve",
        description:
          "Task memory actions the agent may take without asking you first. Enter opens the five switches; Esc returns.",
        kind: "group",
        nested: true,
        value: true,
        children: approveItems,
      },
    ],
  };

  const messagingState = options.messaging;
  const messagingEnabledItem = createScopedBooleanItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.messaging.enabled",
    label: "Enabled",
    description:
      "A preview: list this session for other Pi sessions on this machine and let the agent exchange messages with them.",
    path: ["messaging", "enabled"],
    effectiveValue: messagingState?.enabled ?? DEFAULT_MESSAGING_ENABLED,
    effectiveSource: toolSource(["messaging", "enabled"]),
    defaultValue: DEFAULT_MESSAGING_ENABLED,
  });
  messagingEnabledItem.inactive = freeflowInactive;
  // Messages are delivered unless the user asks to approve them (Task 002 D-008).
  const messagingInboundItem = createScopedChoiceItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.messaging.inbound",
    label: "Ask before delivering",
    description: "Whether a message from another session waits for you to accept it.",
    path: ["messaging", "inbound"],
    values: INBOUND_POLICIES,
    valueLabels: INBOUND_LABELS,
    valueDescriptions: INBOUND_DESCRIPTIONS,
    defaultValue: DEFAULT_INBOUND_POLICY,
    effectiveValue: messagingState?.inbound ?? DEFAULT_INBOUND_POLICY,
    effectiveSource: toolSource(["messaging", "inbound"]),
  });
  messagingInboundItem.inactive = freeflowInactive;
  const messagingGroup: SettingsItem = {
    id: "freeflow.messaging",
    label: "Messaging",
    description: "Configure messaging between Pi sessions on this machine.",
    kind: "group",
    value: messagingState?.enabled ?? DEFAULT_MESSAGING_ENABLED,
    inactive: freeflowInactive,
    displaySuffix: messagingState?.effective ? "active" : messagingState?.enabled ? "inactive" : "disabled",
    children: [messagingEnabledItem, messagingInboundItem],
  };

  // The runtime prompts and skills, on every host (config-validation.ts).
  // Each a section whose row is its master switch, with one row opening a switch per item.
  const masterItem = (section: "prompts" | "skills", label: string, description: string) =>
    createScopedBooleanItem({
      scope,
      rawConfig,
      localConfig,
      id: `freeflow.${section}.enabled`,
      label,
      description,
      path: [section, "enabled"],
      effectiveValue: sectionEnabled(rawConfig, localConfig, section),
      effectiveSource: toolSource([section, "enabled"]),
      defaultValue: true,
    });
  const eachPrompt = nestedGroup(
    "freeflow.prompts.each",
    "Each prompt",
    "One switch per prompt. Enter opens them; Esc returns.",
    RUNTIME_PROMPTS.map((prompt) =>
      createScopedBooleanItem({
        scope,
        rawConfig,
        localConfig,
        id: `freeflow.prompts.${prompt}`,
        label: PROMPT_LABELS[prompt][0],
        description: PROMPT_LABELS[prompt][1],
        path: ["prompts", prompt],
        effectiveValue: configuredSetting(rawConfig, localConfig, ["prompts", prompt], true).value,
        effectiveSource: toolSource(["prompts", prompt]),
        defaultValue: true,
      }),
    ),
  );
  const promptsGroup: SettingsItem = {
    id: "freeflow.prompts",
    label: "Runtime prompts",
    description: "The prompts Freeflow adds to every session: Core, the Interaction Contract and the Working Method.",
    kind: "group",
    value: true,
    displaySuffix: "",
    children: [
      masterItem("prompts", "Enabled", "Add Freeflow's runtime prompts. Off leaves all three out; Freeflow stays on."),
      eachPrompt,
    ],
  };
  const eachSkill = nestedGroup(
    "freeflow.skills.each",
    "Each skill",
    "One switch per skill. Enter opens them; Esc returns.",
    SWITCHABLE_SKILLS.map((skill) =>
      createScopedBooleanItem({
        scope,
        rawConfig,
        localConfig,
        id: `freeflow.skills.${skill}`,
        label: skillLabel(skill),
        description: `Give the agent ${skill}. Off, Pi does not load it and its command refuses; other hosts load it themselves, so there the agent is told not to use it.`,
        path: ["skills", skill],
        effectiveValue: configuredSetting(rawConfig, localConfig, ["skills", skill], true).value,
        effectiveSource: toolSource(["skills", skill]),
        defaultValue: true,
      }),
    ),
  );
  const skillsGroup: SettingsItem = {
    id: "freeflow.skills",
    label: "Skills",
    description: "The skills Freeflow gives the agent; Setup Freeflow always stays.",
    kind: "group",
    value: true,
    displaySuffix: "",
    children: [
      masterItem(
        "skills",
        "Enabled",
        "Give the agent Freeflow's skills. Off turns every skill but Setup Freeflow off.",
      ),
      eachSkill,
    ],
  };
  walkSettingsItems([promptsGroup, skillsGroup], (item) => {
    item.inactive = freeflowInactive;
  });

  // Review Work's choice on every host (config-validation.ts).
  const review = resolveReviewSettings(rawConfig, localConfig);
  const reviewModeItem = createScopedChoiceItem({
    scope,
    rawConfig,
    localConfig,
    id: "freeflow.review.mode",
    label: "Independent review",
    description: "When finished work is reviewed by a separate reviewer; the agent's own self-review always runs.",
    path: ["review", "mode"],
    values: REVIEW_MODES,
    valueLabels: { auto: "auto", off: "off", always: "always" },
    valueDescriptions: REVIEW_DESCRIPTIONS,
    defaultValue: "auto",
    effectiveValue: review.mode,
    effectiveSource: toolSource(["review", "mode"]),
  });
  reviewModeItem.inactive = freeflowInactive;
  reviewModeItem.heading = true;
  const reviewModelItem = reviewerModelItem({
    scope,
    rawConfig,
    localConfig,
    effectiveValue: review.model,
    effectiveSource: toolSource(["review", "model"]),
    ctx: options.ctx,
  });
  reviewModelItem.inactive = freeflowInactive;
  const reviewGroup: SettingsItem = {
    id: "freeflow.review",
    label: "Review",
    description: "Configure Review Work's independent review, on every host that reads these files.",
    kind: "group",
    value: true,
    inactive: freeflowInactive,
    displaySuffix: "",
    children: [reviewModeItem, reviewModelItem],
  };

  return inSectionOrder([
    freeflowItem,
    ...(cognitiveRoutingGroup ? [cognitiveRoutingGroup] : []),
    toolExecutionGroup,
    compactionGroup,
    taskMemoryGroup,
    messagingGroup,
    reviewGroup,
    promptsGroup,
    skillsGroup,
  ]);
}

function pruneKnownDefaults(config: Record<string, unknown>) {
  const defaultPaths: Array<{ path: string[]; value: unknown }> = [
    { path: ["enabled"], value: DEFAULT_FREEFLOW_ENABLED },
    { path: ["cognitiveRouting", "delegation"], value: "executor" },
    { path: ["toolExecution", "enabled"], value: DEFAULT_TOOL_EXECUTION_CONFIG.enabled },
    { path: ["toolExecution", "guidanceNotices"], value: DEFAULT_TOOL_EXECUTION_CONFIG.guidanceNotices },
    { path: ["compaction", "enabled"], value: DEFAULT_COMPACTION_ENABLED },
    { path: ["compaction", "carry"], value: DEFAULT_COMPACTION_CARRY },
    { path: ["taskMemory", "enabled"], value: DEFAULT_TASK_MEMORY_ENABLED },
    ...(Object.keys(AUTO_APPROVE_GROUPS) as AutoApproveGroup[]).map((group) => ({
      path: ["taskMemory", "autoApprove", group],
      value: false,
    })),
    { path: ["messaging", "enabled"], value: DEFAULT_MESSAGING_ENABLED },
    { path: ["messaging", "inbound"], value: DEFAULT_INBOUND_POLICY },
    { path: ["prompts", "enabled"], value: true },
    ...RUNTIME_PROMPTS.map((prompt) => ({ path: ["prompts", prompt], value: true })),
    { path: ["skills", "enabled"], value: true },
    ...SWITCHABLE_SKILLS.map((skill) => ({ path: ["skills", skill], value: true })),
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
  return ["coordinator", "helper", "executor"].some((profile) => item.id === `freeflow.cognitiveRouting.${profile}`);
}

/** A value as the settings screen shows it, e.g. "enabled · personal" or "inherit → enabled (repository)". */
function formatSettingValue(item: SettingsItem, value: unknown): string {
  if (isCognitiveRoutingProfileItem(item)) return cognitiveRoutingProfileDisplay(value);
  if (typeof value === "boolean") return booleanValue(value);
  const key = String(value ?? "");
  return item.valueLabels?.[key] && key !== LOCAL_INHERIT ? item.valueLabels[key]! : formatCoreValue(value);
}

/** A value as the settings screen shows it: the value, then in brackets where it comes from when not set here. */
/**
 * A value as the settings screen shows it: the value, and "(inherited)" when the tab being viewed does not set it
 * (Task 005 D-002). Where an inherited value comes from is the help line's `origin`, not the list's.
 */
type ValueParts = { value: string; note?: string; tone?: "on" | "off"; origin?: string };

const ORIGINS: Record<ConfigSource, string> = {
  builtin: "Inherited: not set in any file, so Freeflow's default applies.",
  repository: "Inherited from the repository's .freeflow/config.json.",
  local: "Inherited from your .freeflow/local.json.",
  session: "Inherited from this session.",
};

function displayParts(item: SettingsItem): ValueParts {
  const tone = (value: unknown): Pick<ValueParts, "tone"> =>
    value === true ? { tone: "on" } : value === false ? { tone: "off" } : {};
  if (item.kind === "group") return { value: item.displaySuffix ?? "" };
  if (item.transient && item.format) return { value: item.format(item.value) };
  if (item.id === "freeflow.cognitiveRouting.profile")
    return { value: item.valueLabels?.[String(item.value)] ?? String(item.value) };
  if (item.configScope === "local" || item.configScope === "session") {
    const inherits = item.value === LOCAL_INHERIT || item.value === undefined;
    if (inherits) {
      if (item.inheritedValue === undefined) return { value: "not configured" };
      return {
        value: formatSettingValue(item, item.inheritedValue),
        note: "inherited",
        origin: ORIGINS[item.inheritedSource ?? "builtin"],
        ...tone(item.inheritedValue),
      };
    }
    // The value this tab sets, not the effective one: a session override or a switch above it does not change it.
    const value =
      item.configValues && String(item.value) in item.configValues ? item.configValues[String(item.value)] : item.value;
    return { value: formatSettingValue(item, value), ...tone(value) };
  }
  const value = item.value === undefined && isCognitiveRoutingProfileItem(item) ? undefined : item.value;
  const shown = { value: formatSettingValue(item, value), ...tone(value) };
  const unset = item.repositoryUnset ?? (item.effectiveSource === "builtin" && item.defaultValue !== undefined);
  const notes = [
    ...(unset ? ["inherited"] : []),
    ...(item.localOverrideValue !== undefined && !valuesEqual(item.localOverrideValue, item.value)
      ? [`personal: ${formatSettingValue(item, item.localOverrideValue)}`]
      : []),
  ];
  return {
    ...shown,
    ...(notes.length ? { note: notes.join(" · ") } : {}),
    ...(unset ? { origin: "Inherited: not set in .freeflow/config.json, so Freeflow's default applies." } : {}),
  };
}

function joinParts(parts: ValueParts): string {
  return parts.note ? `${parts.value} (${parts.note})` : parts.value;
}

function displayValue(item: SettingsItem): string {
  return joinParts(displayParts(item));
}

/** Small choices change in place; holding a profile switches models and a reset clears everything, so those ask. */
const PICKED_CHOICES = new Set(["freeflow.cognitiveRouting.profile", "freeflow.session.reset"]);

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
  const cognitiveRoutingGroup = findSettingsItem(items, "freeflow.cognitiveRouting");
  const cognitiveRoutingEnabledItem = findSettingsItem(items, "freeflow.cognitiveRouting.enabled");
  const cognitiveRoutingDelegationItem = findSettingsItem(items, "freeflow.cognitiveRouting.delegation");
  const delegation = (
    cognitiveRoutingDelegationItem ? effectiveItemValue(cognitiveRoutingDelegationItem) : "executor"
  ) as CognitiveRoutingDelegationMode;
  const cognitiveRoutingProfiles = ["coordinator", ...workersForDelegation(delegation)].map((profile) =>
    findSettingsItem(items, `freeflow.cognitiveRouting.${profile}`),
  );

  if (cognitiveRoutingGroup && cognitiveRoutingEnabledItem) {
    const enabled = effectiveItemValue(cognitiveRoutingEnabledItem) === true;
    const profilesConfigured = cognitiveRoutingProfiles.every((item) =>
      item ? isCognitiveRoutingProfile(effectiveItemValue(item)) : false,
    );
    cognitiveRoutingGroup.value = enabled;
    // A status the runtime reported (active with its control mode, a blocking reason, host unsupported) stays until
    // the switch goes off; only the configuration statuses are worked out again here.
    const current = cognitiveRoutingGroup.displaySuffix ?? "";
    if (!enabled) cognitiveRoutingGroup.displaySuffix = "disabled";
    else if (["", "disabled", "configured", "not configured"].includes(current))
      cognitiveRoutingGroup.displaySuffix = profilesConfigured ? "configured" : "not configured";
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

  const taskMemoryGroup = findSettingsItem(items, "freeflow.taskMemory");
  const taskMemoryEnabled = findSettingsItem(items, "freeflow.taskMemory.enabled");
  if (taskMemoryGroup && taskMemoryEnabled) {
    const on = effectiveItemValue(taskMemoryEnabled) === true;
    taskMemoryGroup.value = on;
    taskMemoryGroup.displaySuffix = on && !freeflowInactive ? "active" : on ? "inactive" : "disabled";
  }

  const messagingGroup = findSettingsItem(items, "freeflow.messaging");
  const messagingEnabled = findSettingsItem(items, "freeflow.messaging.enabled");
  if (messagingGroup && messagingEnabled) {
    const on = effectiveItemValue(messagingEnabled) === true;
    messagingGroup.value = on;
    messagingGroup.displaySuffix = on && !freeflowInactive ? "active" : on ? "inactive" : "disabled";
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

function settingsChoices(item: SettingsItem) {
  if (item.kind === "boolean") {
    return [
      { key: "true", value: true, label: "on" },
      { key: "false", value: false, label: "off" },
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
  onChange: (item: SettingsItem, value: unknown) => Promise<SettingsCommitResult>,
  depth = 0,
  lockedBy?: () => string | undefined,
): SettingsEntry[] {
  // Freeflow's own switch locks everything else on the screen while it is off.
  if (depth === 0 && !lockedBy) {
    const master = rootItems.find((candidate) => candidate.id === "freeflow.enabled");
    const off = () =>
      master && effectiveItemValue(master) === false ? "Takes effect when Freeflow is on." : undefined;
    return items.flatMap((item) =>
      settingsEntries([item], rootItems, onChange, 0, item === master ? () => undefined : off),
    );
  }
  return items.flatMap((item): SettingsEntry[] => {
    if (item.kind === "group" && item.children && item.nested) {
      // One row; Enter opens its settings on a screen of their own. Its value names the ones that are on.
      const children = item.children;
      const parts = () => {
        const isOn = (child: SettingsItem) => displayParts(child).tone === "on";
        const on = children.filter(isOn).map((child) => child.label.toLowerCase());
        const off = children.filter((child) => !isOn(child)).map((child) => child.label.toLowerCase());
        // Name the shorter side: what is on, or what is off when most are on.
        return on.length === 0
          ? { value: "none", tone: "off" as const }
          : off.length === 0
            ? { value: "all", tone: "on" as const }
            : off.length < on.length
              ? { value: `all but ${off.join(", ")}` }
              : { value: on.join(", ") };
      };
      return [
        {
          id: item.id,
          label: item.label,
          description: item.description,
          depth,
          parts,
          currentValue: () => parts().value,
          inactive: () => false,
          ...(lockedBy ? { dormant: lockedBy } : {}),
          children: () => settingsEntries(children, rootItems, onChange, 0, lockedBy),
        },
      ];
    }
    if (item.kind === "group" && item.children) {
      // A capability's own switch is its section's row; while it is off, the section's other settings are locked.
      const toggle = item.children.find((child) => child.id === `${item.id}.enabled` || child.heading);
      if (toggle) {
        const header = settingEntry(toggle, rootItems, onChange, depth, lockedBy);
        // The section's status adds what the switch alone does not say: not active, unavailable, the routing control.
        const parts = () => {
          const shown = displayParts(toggle);
          const status = item.displaySuffix ?? "";
          const extra =
            status === "inactive"
              ? shown.tone === "on"
                ? "not active"
                : ""
              : ["", "active", "disabled", "configured"].includes(status)
                ? ""
                : status.replace(/^active · /, "");
          return extra ? { ...shown, note: shown.note ? `${shown.note} · ${extra}` : extra } : shown;
        };
        const off = () =>
          lockedBy?.() ?? (effectiveItemValue(toggle) === false ? `Takes effect when ${item.label} is on.` : undefined);
        return [
          { ...header, label: item.label, heading: true, parts, currentValue: () => joinParts(parts()) },
          ...settingsEntries(
            item.children.filter((child) => child !== toggle),
            rootItems,
            onChange,
            depth + 1,
            off,
          ),
        ];
      }
      const section: SettingsEntry = {
        id: item.id,
        label: item.label,
        description: item.description,
        section: true,
        depth,
        currentValue: () => displayValue(item),
        inactive: () => item.inactive === true,
      };
      return [section, ...settingsEntries(item.children, rootItems, onChange, depth + 1, lockedBy)];
    }
    return [settingEntry(item, rootItems, onChange, depth, lockedBy)];
  });
}

function settingEntry(
  item: SettingsItem,
  rootItems: SettingsItem[],
  onChange: (item: SettingsItem, value: unknown) => Promise<SettingsCommitResult>,
  depth: number,
  lockedBy?: () => string | undefined,
): SettingsEntry {
  const choices = settingsChoices(item);
  return {
    id: item.id,
    label: item.label,
    description: item.description,
    depth,
    parts: () => displayParts(item),
    currentValue: () => displayValue(item),
    // A setting under an off switch stays changeable, so it can be set up before the switch is turned on; only what
    // the host cannot do (runtimeInactive), or what acts at once, blocks it.
    inactive: () => item.runtimeInactive === true || (item.inactive === true && lockedBy?.() === undefined),
    ...(lockedBy ? { dormant: lockedBy } : {}),
    currentChoiceKey: () => String(item.value),
    choices,
    cycle: Boolean(choices?.length) && !PICKED_CHOICES.has(item.id),
    wizard: item.wizard ? () => item.wizard!() : undefined,
    edit:
      !["boolean", "enum", "group"].includes(item.kind) && !item.wizard
        ? {
            initialValue: () => item.editInitialValue?.() ?? displayValue(item),
            parse: (text: string) => (item.parse ? item.parse(text) : text),
          }
        : undefined,
    commit: async (value: unknown) => {
      if (valuesEqual(item.value, value)) return { changed: false, reloadRequired: false };
      const outcome = await onChange(item, value);
      if (outcome.changed) {
        updateScopedItemState(item, value);
        // The repository file now sets it, unless the value was its default, which setConfigValue leaves out of the file.
        if (item.configScope === "repository")
          item.repositoryUnset =
            value === undefined ||
            isEmptyValue(value) ||
            (item.defaultValue !== undefined && valuesEqual(value, item.defaultValue));
        if (item.id === "freeflow.session.reset") resetSessionItemState(rootItems);
        else if (!item.transient) item.value = value;
        refreshSettingsDerivedState(rootItems);
      }
      return outcome;
    },
  };
}

async function openSettings(options: {
  title: string;
  scopes: SettingsScope[];
  initialScope: string;
  ctx: any;
}): Promise<SettingsSessionResult> {
  if (typeof options.ctx?.ui?.custom !== "function") {
    options.ctx?.ui?.notify?.(
      `${options.title} requires Pi TUI mode. Use the status command for a compact summary.`,
      "warning",
    );
    return { changed: false, configChanged: false, failed: false };
  }
  let component: PiSettingsComponent | undefined;
  await options.ctx.ui.custom((tui: any, theme: any, _keybindings: unknown, done: (value?: undefined) => void) => {
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
const SCOPES: Array<{ id: ConfigScope; label: string; summary: string }> = [
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
  afterChange: AfterChange,
  savedMessage: string,
  reloadWarning = "Run /reload for Freeflow changes to fully apply.",
  afterChangeOptions: AfterChangeOptions = {},
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

async function finalizeSessionSettings(session: SettingsSessionResult, ctx: any, afterChange: AfterChange) {
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
  afterChange: AfterChange,
  pi: any,
  cognitiveRoutingController?: CognitiveRoutingSettingsController,
  diagnostics?: { status(): { cacheHealth?: readonly string[]; backgroundRunning?: number; compaction?: string } },
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
      cognitiveRouting: state.cognitiveRouting as CognitiveRoutingCapabilityState,
      toolExecution: state.toolExecution,
      compaction: state.compaction,
      taskMemory: state.taskMemory,
      messaging: state.messaging,
      ctx,
      runtimeAvailable: isCognitiveRoutingRuntimeAvailable(pi),
    }).find((candidate) => candidate.id === "freeflow.enabled")!;
    await updateConfig(ctx.cwd, item, enabled, "repository");
    await afterChange(true);
    // The command writes the repository file; a personal file or a session override still wins over it.
    const after = await readCapabilityState(ctx.cwd, ctx);
    const winner = after?.configSources?.enabled;
    if (after?.enabled !== enabled && (winner === "local" || winner === "session")) {
      ctx.ui.notify(
        `The repository now ${enabled ? "enables" : "disables"} Freeflow, but ${winner === "session" ? "this session's override" : "your .freeflow/local.json"} still turns it ${enabled ? "off" : "on"}. Change it in /freeflow settings.`,
        "warning",
      );
      return { changed: true, reloaded: false };
    }
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

  let initialScope: ConfigScope = "local";
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
  const touched = new Set<ConfigScope>();
  const loadItems = async (scope: ConfigScope): Promise<SettingsItem[]> => {
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
      cognitiveRouting: stateNow.cognitiveRouting as CognitiveRoutingCapabilityState,
      toolExecution: stateNow.toolExecution,
      compaction: stateNow.compaction,
      taskMemory: stateNow.taskMemory,
      messaging: stateNow.messaging,
      ctx,
      runtimeAvailable: isCognitiveRoutingRuntimeAvailable(pi),
    });
  };
  const scopes: SettingsScope[] = SCOPES.map((scope) => ({
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
  const changeSetting = async (
    settingsScope: ConfigScope,
    item: SettingsItem,
    value: unknown,
  ): Promise<SettingsCommitResult> => {
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
          : await cognitiveRoutingController.setManualProfile(value as CognitiveRoutingProfileName, "profile-settings");
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
        value === LOCAL_INHERIT ? null : (value as CognitiveRoutingDelegationMode),
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
          const restored = await cognitiveRoutingController!.setSessionDelegationOverride(
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
          `Routing presets were reset, but core/context session overrides could not be reset: ${
            error instanceof Error ? error.message : String(error)
          }`,
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
      const profile = item.id.split(".").at(-1) as CognitiveRoutingProfileName;
      const override =
        value === undefined || value === LOCAL_INHERIT
          ? null
          : {
              provider: (value as CognitiveRoutingProfile).provider,
              modelId: (value as CognitiveRoutingProfile).model,
              thinking: (value as CognitiveRoutingProfile).thinking,
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
      const key = item.path!.join(".") as SessionCoreKey;
      const override =
        value === LOCAL_INHERIT || value === undefined
          ? null
          : value === "true"
            ? true
            : value === "false"
              ? false
              : (value as string);
      const result = await setSessionCoreOverride(key, override, ctx, pi);
      return { changed: result.changed, reloadRequired: result.reloadRequired === true };
    }
    await updateConfig(ctx.cwd, item, value, item.configScope ?? "repository");
    return { changed: true, reloadRequired: true };
  };

  // The first scope opens loaded; the others load when Tab reaches them.
  const first = scopes.find((scope) => scope.id === initialScope)!;
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

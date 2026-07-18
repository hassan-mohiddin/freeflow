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
const POST_TOOL_ROUTING_VALUES = ["off", "safety-net", "strict"];
const STORAGE_POLICY_VALUES = ["hybrid-dedupe", "store-everything"];
const OBSERVED_PERSISTENCE_VALUES = ["none", "metadata-only", "exact"];
const SCRIPT_LANGUAGES = ["javascript", "python", "jq"];
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
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cloneJson(value) {
	if (value === undefined) return value;
	try {
		return JSON.parse(JSON.stringify(value));
	} catch (error) {
		throw new Error(
			`Could not clone settings value: ${error instanceof Error ? error.message : String(error)}`,
		);
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
		throw new Error(
			`${item.label} is a settings group, not a writable setting.`,
		);
	}
	if (
		item.defaultValue !== undefined &&
		valuesEqual(value, item.defaultValue)
	) {
		deletePath(config, item.path);
		return;
	}
	if (isEmptyValue(value)) {
		deletePath(config, item.path);
		return;
	}
	setPath(config, item.path, value);
}
function parseStringList(text) {
	return text
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}
function parsePositiveInteger(text) {
	const value = Number(text.trim());
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error("Expected a positive integer.");
	}
	return value;
}
function parseJsonObject(text) {
	const trimmed = text.trim();
	if (!trimmed) return {};
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch (error) {
		throw new Error(
			`Expected valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (!isRecord(parsed)) {
		throw new Error("Expected a JSON object.");
	}
	return parsed;
}
function formatList(value) {
	return Array.isArray(value) ? value.join(", ") : "";
}
function formatJson(value) {
	return JSON.stringify(isRecord(value) ? value : {});
}
function booleanValue(value) {
	return value === true ? "enabled" : "disabled";
}
function normalizedSettingsConfig(rawConfig) {
	const rawRouter = isRecord(rawConfig.outputRouter)
		? rawConfig.outputRouter
		: {};
	const normalized = normalizeFreeflowConfig({
		...rawConfig,
		outputRouter: { ...rawRouter, enabled: true },
	});
	return normalized.config;
}
function rawValue(rawConfig, path, fallback) {
	const value = getPath(rawConfig, path);
	return value === undefined ? fallback : value;
}
function outputRouterItems(rawConfig, freeflowInactive = false) {
	const effective = normalizedSettingsConfig(rawConfig);
	const routerEnabled =
		normalizeFreeflowConfig(rawConfig).config.outputRouter.enabled;
	const router = effective.outputRouter;
	const scriptTransform = effective.scriptTransform;
	const observedRouting = effective.observedRouting;
	const inactive = freeflowInactive || !routerEnabled;
	return [
		{
			id: "outputRouter.enabled",
			label: "Output Router",
			description:
				"Master switch for Freeflow routed evidence tools and router runtime guidance.",
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
			description:
				"Vault storage behavior for exactness-sensitive and noisy output.",
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
			description:
				"TTL retention for vaulted output. Set a positive integer; default is 7 days.",
			path: ["outputRouter", "vault", "retention", "ttlDays"],
			kind: "integer",
			value:
				router.vault.retention?.strategy === "ttl"
					? router.vault.retention.ttlDays
					: DEFAULT_VAULT_RETENTION.ttlDays,
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
				rawValue(
					rawConfig,
					["outputRouter", "generatedPaths"],
					router.hints?.generatedPathGlobs ?? [],
				),
			),
			format: formatList,
			parse: parseStringList,
			inactive,
		},
		{
			id: "outputRouter.noisyCommandHints",
			label: "Noisy command hints",
			description:
				"Comma-separated command patterns that are likely to produce noisy output.",
			path: ["outputRouter", "hints", "noisyCommandPatterns"],
			kind: "list",
			value: rawValue(
				rawConfig,
				["outputRouter", "hints", "noisyCommandPatterns"],
				rawValue(
					rawConfig,
					["outputRouter", "noisyCommandHints"],
					router.hints?.noisyCommandPatterns ?? [],
				),
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
			description:
				"Comma-separated sandbox languages to allow: javascript, python, jq.",
			path: ["outputRouter", "scriptTransform", "languages"],
			kind: "list",
			value: scriptTransform.languages,
			defaultValue: DEFAULT_SCRIPT_TRANSFORM_CONFIG.languages,
			format: formatList,
			parse: (text) =>
				parseStringList(text).filter((value) =>
					SCRIPT_LANGUAGES.includes(value),
				),
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
			description:
				"Route configured host tool results after they run, e.g. MCP/web/fetch/code-search output.",
			path: ["outputRouter", "observedRouting", "enabled"],
			kind: "boolean",
			value: observedRouting.enabled,
			defaultValue: DEFAULT_OBSERVED_ROUTING_CONFIG.enabled,
			inactive,
		},
		...observedProducerItems(
			"web",
			"Web search",
			observedRouting.web,
			inactive,
		),
		...observedProducerItems(
			"fetch",
			"Fetch content",
			observedRouting.fetch,
			inactive,
		),
		...observedProducerItems(
			"codeSearch",
			"Code search",
			observedRouting.codeSearch,
			inactive,
		),
		{
			id: "outputRouter.observedRouting.mcp.servers",
			label: "MCP servers JSON",
			description:
				'JSON object keyed by MCP server id. Example: {"github":{"enabled":true,"persistence":"exact"}}',
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
function observedProducerItems(id, label, value, inactive) {
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
			description:
				"Persistence mode for this observed producer: none, metadata-only, or exact.",
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
function delegationHarnessItems(rawConfig, freeflowInactive = false) {
	const configEnabled =
		getPath(rawConfig, ["delegationHarness", "enabled"]) === true;
	return [
		{
			id: "delegationHarness.enabled",
			label: "Delegation Harness",
			description:
				"Master switch for the Freeflow cmux delegation harness tools, hooks, and runtime guidance.",
			path: ["delegationHarness", "enabled"],
			kind: "boolean",
			value: configEnabled,
			defaultValue: false,
			inactive: freeflowInactive,
		},
	];
}
function configValueForChoice(item, value) {
	const key = String(value);
	if (item.configValues && Object.hasOwn(item.configValues, key)) {
		return item.configValues[key];
	}
	return value;
}
function effectiveItemValue(item) {
	return item.effectiveValue !== undefined ? item.effectiveValue : item.value;
}
function formatCoreValue(value) {
	return typeof value === "boolean" ? booleanValue(value) : String(value ?? "");
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
	if (item.configScope === "local") {
		item.effectiveValue =
			configValue === undefined ? item.inheritedValue : configValue;
		item.effectiveSource =
			configValue === undefined ? (item.inheritedSource ?? "builtin") : "local";
		return;
	}
	if (item.localOverrideValue !== undefined) {
		item.effectiveValue = item.localOverrideValue;
		item.effectiveSource = "local";
		return;
	}
	item.effectiveValue = configValue;
	item.effectiveSource =
		item.defaultValue !== undefined &&
		valuesEqual(configValue, item.defaultValue)
			? "builtin"
			: "repository";
}
function createScopedBooleanItem(options) {
	const repositoryValue = getPath(options.rawConfig, options.path);
	const inheritedValue =
		typeof repositoryValue === "boolean"
			? repositoryValue
			: options.defaultValue;
	const inheritedSource =
		typeof repositoryValue === "boolean" ? "repository" : "builtin";
	const localValue = getPath(options.localConfig, options.path);
	let item;
	if (options.scope === "local") {
		const selectedValue =
			typeof localValue === "boolean" ? String(localValue) : LOCAL_INHERIT;
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
			localOverrideValue:
				typeof localValue === "boolean" ? localValue : undefined,
		};
	}
	item.displaySuffix = coreDisplaySuffix(item);
	return item;
}
function createScopedDefaultModeItem(options) {
	let item;
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
	sessionMode,
	defaultMode,
	defaultSource,
	inactive,
) {
	if (sessionMode !== "default") return undefined;
	const inactiveSuffix = inactive ? " · inactive" : "";
	return `(${defaultMode} · ${defaultSource}${inactiveSuffix})`;
}
function validModeOrUndefined(value) {
	return typeof value === "string" && VALID_MODES.has(value)
		? value
		: undefined;
}
function resolveSettingsCoreView(rawConfig, layers) {
	const localConfig =
		layers?.local.valid && isRecord(layers.local.parsed)
			? layers.local.parsed
			: {};
	const repositorySkillsValue = getPath(rawConfig, ["skills"]);
	const repositorySkills = isRecord(repositorySkillsValue)
		? repositorySkillsValue
		: {};
	const fallbackCore = {
		enabled: getPath(rawConfig, ["enabled"]) !== false,
		interactionContract: getPath(rawConfig, ["interactionContract"]) !== false,
		skills: { enabled: getPath(repositorySkills, ["enabled"]) !== false },
		defaultMode: validModeOrUndefined(rawConfig.defaultMode) ?? "workflow",
	};
	const fallbackSources = {
		enabled:
			typeof getPath(rawConfig, ["enabled"]) === "boolean"
				? "repository"
				: "builtin",
		interactionContract:
			typeof getPath(rawConfig, ["interactionContract"]) === "boolean"
				? "repository"
				: "builtin",
		skillsEnabled:
			typeof getPath(repositorySkills, ["enabled"]) === "boolean"
				? "repository"
				: "builtin",
		defaultMode:
			validModeOrUndefined(rawConfig.defaultMode) !== undefined
				? "repository"
				: "builtin",
	};
	return {
		localConfig,
		core: layers?.coreConfig ?? fallbackCore,
		sources: layers?.sources ?? fallbackSources,
	};
}
function groupEnabled(items, id) {
	return items.find((item) => item.id === id)?.value === true;
}
function freeflowItems(rawConfig, modeState, options = {}) {
	const scope = options.scope ?? "repository";
	const layers = options.layers;
	const { localConfig, core, sources } = resolveSettingsCoreView(
		rawConfig,
		layers,
	);
	const freeflowItem = createScopedBooleanItem({
		scope,
		rawConfig,
		localConfig,
		id: "freeflow.enabled",
		label: "Freeflow",
		description:
			"Master switch for the Interaction Contract and Freeflow skills in this checkout.",
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
		description:
			"Apply Freeflow's compact turn-interpretation and collaboration guidance.",
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
		description:
			"Expose Freeflow skills and load Workflow once on the first turn.",
		path: ["skills", "enabled"],
		effectiveValue: core.skills.enabled,
		effectiveSource: sources.skillsEnabled,
		defaultValue: DEFAULT_SKILLS_ENABLED,
	});
	const repositoryModeValue = validModeOrUndefined(rawConfig.defaultMode);
	const repositoryDefaultMode = repositoryModeValue ?? "workflow";
	const repositoryDefaultSource = repositoryModeValue
		? "repository"
		: "builtin";
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
	defaultModeItem.displaySuffix = coreDisplaySuffix(
		defaultModeItem,
		freeflowInactive || !skillsEnabled,
	);
	const sessionMode = modeState?.currentMode ?? "default";
	const sessionModeItem = {
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
	const delegationItems = delegationHarnessItems(rawConfig, freeflowInactive);
	const delegationEnabled = groupEnabled(
		delegationItems,
		"delegationHarness.enabled",
	);
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
		{
			id: "delegationHarness.group",
			label: "Delegation Harness",
			description:
				"Shared repository settings for the Freeflow cmux delegation harness tools, hooks, and runtime guidance.",
			kind: "group",
			value: delegationEnabled,
			inactive: freeflowInactive,
			displaySuffix: "(repository)",
			children: delegationItems,
		},
	];
}
function migrateLegacyRouterConfig(config) {
	const outputRouter = isRecord(config.outputRouter)
		? config.outputRouter
		: undefined;
	if (!outputRouter) return;
	if (
		config.scriptTransform !== undefined &&
		outputRouter.scriptTransform === undefined
	) {
		outputRouter.scriptTransform = config.scriptTransform;
		delete config.scriptTransform;
	}
	if (
		config.observedRouting !== undefined &&
		outputRouter.observedRouting === undefined
	) {
		outputRouter.observedRouting = config.observedRouting;
		delete config.observedRouting;
	}
	const thresholds = isRecord(outputRouter.thresholds)
		? outputRouter.thresholds
		: {};
	if (
		outputRouter.largeOutputBytes !== undefined &&
		thresholds.largeOutputBytes === undefined
	) {
		thresholds.largeOutputBytes = outputRouter.largeOutputBytes;
		outputRouter.thresholds = thresholds;
		delete outputRouter.largeOutputBytes;
	}
	if (
		outputRouter.largeOutputLines !== undefined &&
		thresholds.largeOutputLines === undefined
	) {
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
	if (
		outputRouter.vaultRetentionDays !== undefined &&
		!isRecord(vault.retention)
	) {
		vault.retention = {
			strategy: "ttl",
			ttlDays: outputRouter.vaultRetentionDays,
		};
		outputRouter.vault = vault;
		delete outputRouter.vaultRetentionDays;
	}
	const hints = isRecord(outputRouter.hints) ? outputRouter.hints : {};
	if (
		outputRouter.generatedPaths !== undefined &&
		hints.generatedPathGlobs === undefined
	) {
		hints.generatedPathGlobs = outputRouter.generatedPaths;
		outputRouter.hints = hints;
		delete outputRouter.generatedPaths;
	}
	if (
		outputRouter.noisyCommandHints !== undefined &&
		hints.noisyCommandPatterns === undefined
	) {
		hints.noisyCommandPatterns = outputRouter.noisyCommandHints;
		outputRouter.hints = hints;
		delete outputRouter.noisyCommandHints;
	}
}
function pruneKnownDefaults(config) {
	const defaultPaths = [
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
		{ path: ["delegationHarness", "enabled"], value: false },
	];
	for (const item of defaultPaths) {
		if (valuesEqual(getPath(config, item.path), item.value)) {
			deletePath(config, item.path);
		}
	}
	for (const producer of ["web", "fetch", "codeSearch"]) {
		const enabledPath = [
			"outputRouter",
			"observedRouting",
			producer,
			"enabled",
		];
		const persistencePath = [
			"outputRouter",
			"observedRouting",
			producer,
			"persistence",
		];
		if (
			getPath(config, enabledPath) !== true &&
			getPath(config, persistencePath) === "none"
		) {
			deletePath(config, persistencePath);
		}
	}
	const servers = getPath(config, [
		"outputRouter",
		"observedRouting",
		"mcp",
		"servers",
	]);
	if (isRecord(servers) && Object.keys(servers).length === 0) {
		deletePath(config, ["outputRouter", "observedRouting", "mcp", "servers"]);
	}
}
async function ensureLocalConfigIgnored(cwd) {
	let gitPath;
	try {
		const result = await execFileAsync("git", [
			"-C",
			cwd,
			"rev-parse",
			"--git-path",
			"info/exclude",
		]);
		gitPath = result.stdout.trim();
	} catch {
		return;
	}
	const tracked = await execFileAsync("git", [
		"-C",
		cwd,
		"ls-files",
		"--",
		".freeflow/local.json",
	]);
	if (tracked.stdout.trim()) {
		throw new Error(
			".freeflow/local.json is tracked by git; remove it from the index before writing personal overrides.",
		);
	}
	try {
		await execFileAsync("git", [
			"-C",
			cwd,
			"check-ignore",
			"-q",
			"--",
			".freeflow/local.json",
		]);
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
	cwd,
	item,
	value,
	scope = item.configScope ?? "repository",
) {
	if (scope === "local") {
		if (!item.path?.length) {
			throw new Error(
				`${item.label} is a settings group, not a writable setting.`,
			);
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
	migrateLegacyRouterConfig(next);
	pruneKnownDefaults(next);
	await mkdir(join(cwd, ".freeflow"), { recursive: true });
	await writeFile(
		join(cwd, ".freeflow/config.json"),
		`${JSON.stringify(next, null, 2)}\n`,
		"utf8",
	);
}
function valueForDisplay(item) {
	let value;
	if (item.configScope === "local") {
		value = formatCoreValue(effectiveItemValue(item));
	} else if (item.kind === "boolean") {
		value = booleanValue(item.value);
	} else if (item.kind === "group") {
		const status =
			typeof item.value === "boolean"
				? booleanValue(item.value)
				: String(item.value ?? "");
		const count = item.children?.length ?? 0;
		value = count > 0 ? `${status} (${count})` : status;
	} else if (item.format) {
		value = item.format(item.value);
	} else {
		value = String(item.value ?? "");
	}
	return item.displaySuffix ? `${value} ${item.displaySuffix}` : value;
}
function nextEnumValue(item) {
	if (item.kind === "boolean") {
		return item.value === true ? false : true;
	}
	const values = item.values ?? [];
	const current = String(item.value ?? values[0] ?? "");
	const index = values.indexOf(current);
	return values[(index + 1) % values.length] ?? current;
}
function truncate(text, width) {
	if (width <= 0) return "";
	if (text.length <= width) return text;
	return `${text.slice(0, Math.max(0, width - 1))}…`;
}
function isUp(data) {
	return data === "\u001b[A" || data === "\u001bOA";
}
function isDown(data) {
	return data === "\u001b[B" || data === "\u001bOB";
}
function isEnter(data) {
	return data === "\r" || data === "\n";
}
function isEscape(data) {
	return data === "\u001b" || data === "\u0003";
}
function isBackspace(data) {
	return data === "\u007f" || data === "\b";
}
function matchesKeybinding(keybindings, data, keybinding, fallback) {
	try {
		if (keybindings?.matches?.(data, keybinding)) return true;
	} catch {
		// Fall through to raw escape fallback for tests and older Pi builds.
	}
	return fallback(data);
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
		const child = item.children
			? findSettingsItem(item.children, id)
			: undefined;
		if (child) return child;
	}
	return undefined;
}
class FreeflowSettingsComponent {
	options;
	done;
	requestRender;
	theme;
	keybindings;
	frames;
	editItem = null;
	editBuffer = "";
	message = "";
	changed = false;
	successfulWrites = 0;
	pending = Promise.resolve();
	constructor(options, done, requestRender, theme, keybindings) {
		this.options = options;
		this.done = done;
		this.requestRender = requestRender;
		this.theme = theme;
		this.keybindings = keybindings;
		const initialChoice = options.initialChoice;
		this.frames = initialChoice
			? [
					{
						title: options.title,
						items: [],
						selected: Math.max(
							0,
							initialChoice.values?.indexOf(String(initialChoice.value)) ?? 0,
						),
						search: "",
						choiceFor: initialChoice,
					},
				]
			: [
					{
						title: options.title,
						items: options.items,
						selected: 0,
						search: "",
					},
				];
	}
	render(width) {
		const lines = [];
		const frame = this.currentFrame();
		const title = this.frames.map((candidate) => candidate.title).join(" › ");
		const titleText =
			this.theme.fg?.("accent", this.theme.bold?.(title) ?? title) ?? title;
		lines.push(this.border(width));
		lines.push(titleText);
		if (frame.choiceFor) {
			return this.renderChoiceFrame(lines, frame, width);
		}
		const items = this.displayItems(frame);
		const hint =
			this.frames.length > 1
				? "  Type to search · Enter/Space to change/open · Esc back"
				: "  Type to search · Enter/Space to change/open · Esc save & close";
		this.clampSelection(frame, items.length);
		lines.push(this.searchLine(frame, width));
		lines.push("");
		if (frame.items.length === 0) {
			lines.push(
				this.theme.fg?.("dim", "  No settings available") ??
					"  No settings available",
			);
			lines.push(this.border(width));
			return lines;
		}
		if (items.length === 0) {
			lines.push(
				this.theme.fg?.("dim", "  No matching settings") ??
					"  No matching settings",
			);
			lines.push("");
			lines.push(truncate(this.theme.fg?.("dim", hint) ?? hint, width));
			lines.push(this.border(width));
			return lines;
		}
		const maxLabel = Math.min(
			34,
			Math.max(...frame.items.map((item) => item.label.length), 12),
		);
		const visible = Math.min(items.length, 18);
		const start = Math.max(
			0,
			Math.min(
				frame.selected - Math.floor(visible / 2),
				Math.max(0, items.length - visible),
			),
		);
		const end = Math.min(items.length, start + visible);
		for (let index = start; index < end; index++) {
			const item = items[index];
			const selected = index === frame.selected;
			const prefix = selected ? "› " : "  ";
			const label = item.label.padEnd(maxLabel);
			const value =
				this.editItem?.id === item.id
					? `[${this.editBuffer}]`
					: valueForDisplay(item);
			const groupMarker = item.children?.length ? " ›" : "";
			const inactive = item.inactive ? " inactive" : "";
			const line = truncate(
				`${prefix}${label}  ${value}${groupMarker}${inactive}`,
				width,
			);
			lines.push(this.styleLine(line, item, selected));
		}
		if (items.length > visible) {
			lines.push(truncate(`  (${frame.selected + 1}/${items.length})`, width));
		}
		const selectedItem = items[frame.selected];
		if (selectedItem) {
			lines.push("");
			lines.push(
				...wrapPlain(selectedItem.description, Math.max(20, width - 2)).map(
					(line) => truncate(`  ${line}`, width),
				),
			);
		}
		if (this.message) {
			lines.push("");
			lines.push(truncate(`  ${this.message}`, width));
		}
		lines.push("");
		lines.push(truncate(this.theme.fg?.("dim", hint) ?? hint, width));
		lines.push(this.border(width));
		return lines;
	}
	invalidate() {}
	handleInput(data) {
		if (this.editItem) {
			this.handleEditInput(data);
			this.requestRender();
			return;
		}
		const frame = this.currentFrame();
		if (frame.choiceFor) {
			this.handleChoiceInput(data, frame);
			this.requestRender();
			return;
		}
		const items = this.displayItems(frame);
		this.clampSelection(frame, items.length);
		if (
			this.matches(data, "tui.editor.deleteCharBackward", isBackspace) &&
			frame.search
		) {
			frame.search = frame.search.slice(0, -1);
			frame.selected = 0;
		} else if (this.isSearchInput(data)) {
			frame.search += data;
			frame.selected = 0;
			this.message = "";
		} else if (this.matches(data, "tui.select.up", isUp)) {
			if (items.length > 0)
				frame.selected =
					frame.selected === 0 ? items.length - 1 : frame.selected - 1;
		} else if (this.matches(data, "tui.select.down", isDown)) {
			if (items.length > 0)
				frame.selected =
					frame.selected === items.length - 1 ? 0 : frame.selected + 1;
		} else if (
			this.matches(data, "tui.select.confirm", isEnter) ||
			data === " "
		) {
			this.activateSelected();
		} else if (this.matches(data, "tui.select.cancel", isEscape)) {
			if (this.frames.length > 1) {
				this.frames.pop();
				this.message = "";
			} else {
				this.close();
				return;
			}
		}
		this.requestRender();
	}
	async waitForWrites() {
		await this.pending;
		return this.successfulWrites > 0;
	}
	currentFrame() {
		return this.frames[this.frames.length - 1];
	}
	matches(data, keybinding, fallback) {
		return matchesKeybinding(this.keybindings, data, keybinding, fallback);
	}
	border(width) {
		return (
			this.theme.fg?.("border", "─".repeat(Math.max(1, width))) ??
			"─".repeat(Math.max(1, width))
		);
	}
	searchLine(frame, width) {
		const cursor = this.theme.fg?.("accent", "█") ?? "█";
		return truncate(`> ${frame.search}${cursor}`, width);
	}
	renderChoiceFrame(lines, frame, width) {
		const item = frame.choiceFor;
		const values = item.values ?? [];
		this.clampSelection(frame, values.length);
		lines.push("");
		lines.push(
			...wrapPlain(item.description, Math.max(20, width - 2)).map((line) =>
				truncate(`  ${line}`, width),
			),
		);
		lines.push("");
		const labels = values.map((value) => item.valueLabels?.[value] ?? value);
		const maxLabel = Math.min(
			34,
			Math.max(...labels.map((label) => label.length), 12),
		);
		for (let index = 0; index < values.length; index++) {
			const value = values[index];
			const selected = index === frame.selected;
			const prefix = selected ? "› " : "  ";
			const label = labels[index].padEnd(maxLabel);
			const description = item.valueDescriptions?.[value] ?? "";
			const line = truncate(`${prefix}${label}  ${description}`, width);
			lines.push(selected ? (this.theme.fg?.("accent", line) ?? line) : line);
		}
		lines.push("");
		lines.push(
			truncate(
				this.theme.fg?.("dim", "  Enter to select · Esc to go back") ??
					"  Enter to select · Esc to go back",
				width,
			),
		);
		lines.push(this.border(width));
		return lines;
	}
	handleChoiceInput(data, frame) {
		const values = frame.choiceFor?.values ?? [];
		if (this.matches(data, "tui.select.up", isUp)) {
			if (values.length > 0)
				frame.selected =
					frame.selected === 0 ? values.length - 1 : frame.selected - 1;
			return;
		}
		if (this.matches(data, "tui.select.down", isDown)) {
			if (values.length > 0)
				frame.selected =
					frame.selected === values.length - 1 ? 0 : frame.selected + 1;
			return;
		}
		if (this.matches(data, "tui.select.confirm", isEnter) || data === " ") {
			const value = values[frame.selected];
			if (value !== undefined && frame.choiceFor) {
				const item = frame.choiceFor;
				this.applyValue(item, value);
				if (this.frames.length > 1) {
					this.frames.pop();
				} else {
					this.close();
				}
			}
			return;
		}
		if (this.matches(data, "tui.select.cancel", isEscape)) {
			if (this.frames.length > 1) {
				this.frames.pop();
			} else {
				this.close();
			}
		}
	}
	displayItems(frame) {
		const query = frame.search.trim().toLowerCase();
		if (!query) return frame.items;
		return frame.items.filter((item) => {
			return [item.label, item.description, valueForDisplay(item)].some(
				(text) => text.toLowerCase().includes(query),
			);
		});
	}
	clampSelection(frame, itemCount) {
		frame.selected = Math.max(
			0,
			Math.min(frame.selected, Math.max(0, itemCount - 1)),
		);
	}
	isSearchInput(data) {
		return data.length === 1 && data > " " && data !== "\u007f";
	}
	styleLine(line, item, selected) {
		if (item.inactive) return this.theme.fg?.("dim", line) ?? line;
		if (selected) return this.theme.fg?.("accent", line) ?? line;
		return line;
	}
	activateSelected() {
		const frame = this.currentFrame();
		const item = this.displayItems(frame)[frame.selected];
		if (!item) return;
		this.message = "";
		if (item.inactive) {
			this.message = `${item.label} is inactive. Enable its parent Freeflow setting first.`;
			return;
		}
		if (item.children?.length) {
			this.frames.push({
				title: item.label,
				items: item.children,
				selected: 0,
				search: "",
			});
			return;
		}
		if (item.kind === "boolean") {
			this.applyValue(item, nextEnumValue(item));
			return;
		}
		if (item.kind === "enum") {
			if ((item.values?.length ?? 0) >= 3) {
				this.frames.push({
					title: item.label,
					items: [],
					selected: Math.max(0, item.values?.indexOf(String(item.value)) ?? 0),
					search: "",
					choiceFor: item,
				});
			} else {
				this.applyValue(item, nextEnumValue(item));
			}
			return;
		}
		this.editItem = item;
		this.editBuffer = valueForDisplay(item);
	}
	handleEditInput(data) {
		if (!this.editItem) return;
		if (this.matches(data, "tui.select.cancel", isEscape)) {
			this.editItem = null;
			this.editBuffer = "";
			this.message = "Edit cancelled.";
			return;
		}
		if (
			this.matches(data, "tui.input.submit", isEnter) ||
			this.matches(data, "tui.select.confirm", isEnter)
		) {
			const item = this.editItem;
			try {
				const parsed = item.parse
					? item.parse(this.editBuffer)
					: this.editBuffer;
				this.editItem = null;
				this.editBuffer = "";
				this.applyValue(item, parsed);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.message = `Invalid value: ${message}`;
			}
			return;
		}
		if (this.matches(data, "tui.editor.deleteCharBackward", isBackspace)) {
			this.editBuffer = this.editBuffer.slice(0, -1);
			return;
		}
		if (data.length === 1 && data >= " ") {
			this.editBuffer += data;
		}
	}
	applyValue(item, value) {
		updateScopedItemState(item, value);
		item.value = value;
		this.refreshDerivedState();
		this.changed = true;
		this.message = `${item.label} = ${valueForDisplay(item)}`;
		this.pending = this.pending
			.then(async () => {
				await this.options.onChange(item, value);
				this.successfulWrites += 1;
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				this.message = `Write failed: ${message}`;
				this.options.ctx?.ui?.notify?.(this.message, "error");
			});
	}
	refreshDerivedState() {
		const freeflowItem = findSettingsItem(
			this.options.items,
			"freeflow.enabled",
		);
		const freeflowInactive = freeflowItem
			? effectiveItemValue(freeflowItem) !== true
			: false;
		const skillsItem = findSettingsItem(
			this.options.items,
			"freeflow.skills.enabled",
		);
		const skillsEnabled = skillsItem
			? effectiveItemValue(skillsItem) === true
			: true;
		const routerEnabled =
			findSettingsItem(this.options.items, "outputRouter.enabled")?.value ===
			true;
		const delegationEnabled =
			findSettingsItem(this.options.items, "delegationHarness.enabled")
				?.value === true;
		const sessionModeItem = findSettingsItem(
			this.options.items,
			"freeflow.sessionMode",
		);
		const defaultModeItem = findSettingsItem(
			this.options.items,
			"freeflow.defaultMode",
		);
		const routerGroup = findSettingsItem(
			this.options.items,
			"outputRouter.group",
		);
		const delegationGroup = findSettingsItem(
			this.options.items,
			"delegationHarness.group",
		);
		if (sessionModeItem) {
			const defaultMode = String(
				defaultModeItem ? effectiveItemValue(defaultModeItem) : "workflow",
			);
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
		if (delegationGroup) {
			delegationGroup.value = delegationEnabled;
			delegationGroup.inactive = freeflowInactive;
		}
		walkSettingsItems(this.options.items, (candidate) => {
			if (candidate.configScope) {
				const inactive =
					candidate.id === "freeflow.enabled" ? false : freeflowInactive;
				const displayInactive =
					candidate.id === "freeflow.defaultMode"
						? freeflowInactive || !skillsEnabled
						: inactive;
				candidate.inactive = inactive;
				candidate.displaySuffix = coreDisplaySuffix(candidate, displayInactive);
			} else if (candidate.id === "freeflow.sessionMode") {
				candidate.inactive = freeflowInactive || !skillsEnabled;
			} else if (
				candidate.id === "outputRouter.group" ||
				candidate.id === "delegationHarness.group"
			) {
				candidate.inactive = freeflowInactive;
			} else if (
				candidate.id === "outputRouter.enabled" ||
				candidate.id === "delegationHarness.enabled"
			) {
				candidate.inactive = freeflowInactive;
			} else if (candidate.id.startsWith("outputRouter.")) {
				candidate.inactive = freeflowInactive || !routerEnabled;
			} else {
				candidate.inactive = freeflowInactive;
			}
		});
	}
	close() {
		this.done(this.changed);
	}
}
function wrapPlain(text, width) {
	const words = text.split(/\s+/).filter(Boolean);
	const lines = [];
	let current = "";
	for (const word of words) {
		if (!current) {
			current = word;
		} else if (`${current} ${word}`.length <= width) {
			current = `${current} ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines.length ? lines : [""];
}
async function openSettings(options) {
	if (typeof options.ctx?.ui?.custom !== "function") {
		options.ctx?.ui?.notify?.(
			`${options.title} requires Pi TUI mode. Use the status command for a compact summary.`,
			"warning",
		);
		return false;
	}
	let component;
	const changed = await options.ctx.ui.custom(
		(tui, theme, keybindings, done) => {
			component = new FreeflowSettingsComponent(
				options,
				done,
				() => tui.requestRender(),
				theme ?? {},
				keybindings,
			);
			return component;
		},
	);
	const wroteSuccessfully = (await component?.waitForWrites()) ?? false;
	const effectiveChanged = changed === true && wroteSuccessfully;
	await options.onClose?.(effectiveChanged);
	return effectiveChanged;
}
function outputRouterStatusText(rawConfig) {
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
function freeflowStatusText(state) {
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
		`delegation harness: ${state.delegationHarness.enabled ? "enabled" : "disabled"}`,
	].join("; ");
}
function delegationHarnessStatusText(state) {
	if (!state.configured) {
		return state.configExists
			? `Delegation Harness: inactive (invalid Freeflow config: ${state.parseError ?? "unknown parse error"})`
			: "Delegation Harness: inactive (repo not set up; run /setup-freeflow)";
	}
	const details =
		state.delegationHarness.envEnabled && !state.delegationHarness.configEnabled
			? " (enabled by FREEFLOW_DELEGATION_HARNESS_ENABLED)"
			: "";
	const inactive = !state.enabled ? " (inactive: Freeflow off)" : "";
	return `Delegation Harness: ${state.delegationHarness.enabled ? "enabled" : "disabled"}${details}${inactive}`;
}
function actionIsMutation(action) {
	return (
		action === "" ||
		action === "settings" ||
		["enable", "on", "true", "disable", "off", "false"].includes(action)
	);
}
async function maybeBlockLayerMutation(action, ctx, layerName) {
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
export async function handleFreeflowCommand(args, ctx, afterChange, pi) {
	const input = (args ?? "settings").trim().toLowerCase() || "settings";
	const [action, ...rest] = input.split(/\s+/);
	const actionValue = rest.join(" ");
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
		}).find((candidate) => candidate.id === "freeflow.sessionMode");
		let modeChanged = false;
		const changed = await openSettings({
			title: "Freeflow Mode",
			items: [item],
			initialChoice: item,
			ctx,
			onChange: async (_item, value) => {
				const result = await handleModeCommand(String(value), ctx, pi);
				modeChanged ||= result.changed;
			},
		});
		return { changed: changed && modeChanged, reloaded: false };
	}
	if (["enable", "on", "true", "disable", "off", "false"].includes(action)) {
		const enabled = ["enable", "on", "true"].includes(action);
		const item = freeflowItems(raw, modeState, {
			scope: "repository",
			layers,
		}).find((candidate) => candidate.id === "freeflow.enabled");
		await updateConfig(ctx.cwd, item, enabled, "repository");
		await afterChange(true);
		ctx.ui.notify(
			`Freeflow ${enabled ? "enabled" : "disabled"}. Reloading Freeflow runtime...`,
			"info",
		);
		if (typeof ctx.reload === "function") {
			await ctx.reload();
			return { changed: true, reloaded: true };
		}
		ctx.ui.notify(
			"Run /reload for Freeflow changes to fully apply.",
			"warning",
		);
		return { changed: true, reloaded: false };
	}
	if (action && action !== "settings") {
		ctx.ui.notify(
			"Usage: /freeflow, /freeflow settings [local|repo], /freeflow status, /freeflow mode [conversation|workflow|strict-workflow|reset], /freeflow enable, or /freeflow disable",
			"warning",
		);
		return { changed: false, reloaded: false, error: "invalid_action" };
	}
	let settingsScope = "local";
	if (["repo", "repository", "shared"].includes(actionValue)) {
		settingsScope = "repository";
	} else if (actionValue && !["local", "personal"].includes(actionValue)) {
		ctx.ui.notify(
			"Usage: /freeflow settings, /freeflow settings local, or /freeflow settings repo",
			"warning",
		);
		return { changed: false, reloaded: false, error: "invalid_scope" };
	}
	let configChanged = false;
	const changed = await openSettings({
		title:
			settingsScope === "local"
				? "Freeflow Settings · Personal overrides"
				: "Freeflow Repository Settings · modifies .freeflow/config.json",
		items: freeflowItems(raw, modeState, { scope: settingsScope, layers }),
		ctx,
		onChange: async (item, value) => {
			if (item.id === "freeflow.sessionMode") {
				await handleModeCommand(String(value), ctx, pi);
				return;
			}
			configChanged = true;
			await updateConfig(
				ctx.cwd,
				item,
				value,
				item.configScope ?? "repository",
			);
		},
		onClose: async (settingsChanged) => {
			if (!settingsChanged) return;
			if (!configChanged) return;
			await afterChange(true);
			ctx.ui.notify(
				`Freeflow ${
					settingsScope === "local"
						? "personal overrides"
						: "repository settings"
				} saved. Reloading Freeflow runtime...`,
				"info",
			);
			if (typeof ctx.reload === "function") {
				await ctx.reload();
			} else {
				ctx.ui.notify(
					"Run /reload for Freeflow changes to fully apply.",
					"warning",
				);
			}
		},
	});
	return {
		changed,
		reloaded: configChanged && typeof ctx.reload === "function",
	};
}
export async function handleOutputRouterCommand(args, ctx, afterChange) {
	const action = (args ?? "").trim().toLowerCase();
	const raw = await readFreeflowConfig(ctx.cwd);
	if (await maybeBlockLayerMutation(action, ctx, "Output Router")) {
		return { changed: false, reloaded: false, error: "freeflow_inactive" };
	}
	if (action === "status") {
		const state = await readCapabilityState(ctx.cwd);
		const prefix =
			!state.configured || !state.enabled
				? `${freeflowStatusText(state)}; `
				: "";
		ctx.ui.notify(
			`${prefix}${outputRouterStatusText(raw)}`,
			!state.configured || !state.enabled ? "warning" : "info",
		);
		return { changed: false, reloaded: false };
	}
	if (["enable", "on", "true", "disable", "off", "false"].includes(action)) {
		const enabled = ["enable", "on", "true"].includes(action);
		const item = outputRouterItems(raw).find(
			(candidate) => candidate.id === "outputRouter.enabled",
		);
		await updateConfig(ctx.cwd, item, enabled);
		await afterChange(true);
		ctx.ui.notify(
			`Output Router ${enabled ? "enabled" : "disabled"}. Reloading Freeflow runtime...`,
			"info",
		);
		if (typeof ctx.reload === "function") {
			await ctx.reload();
			return { changed: true, reloaded: true };
		}
		ctx.ui.notify(
			"Run /reload for Output Router changes to fully apply.",
			"warning",
		);
		return { changed: true, reloaded: false };
	}
	if (action && action !== "settings") {
		ctx.ui.notify(
			"Usage: /output-router, /output-router settings, or /output-router status",
			"warning",
		);
		return { changed: false, reloaded: false, error: "invalid_action" };
	}
	const changed = await openSettings({
		title: "Output Router Settings",
		items: outputRouterItems(raw),
		ctx,
		onChange: (item, value) => updateConfig(ctx.cwd, item, value),
		onClose: async (settingsChanged) => {
			if (!settingsChanged) return;
			await afterChange(true);
			ctx.ui.notify(
				"Output Router settings saved. Reloading Freeflow runtime...",
				"info",
			);
			if (typeof ctx.reload === "function") {
				await ctx.reload();
			} else {
				ctx.ui.notify(
					"Run /reload for Output Router changes to fully apply.",
					"warning",
				);
			}
		},
	});
	return { changed, reloaded: changed && typeof ctx.reload === "function" };
}
export async function handleDelegationHarnessCommand(args, ctx, afterChange) {
	const action = (args ?? "").trim().toLowerCase();
	const raw = await readFreeflowConfig(ctx.cwd);
	if (await maybeBlockLayerMutation(action, ctx, "Delegation Harness")) {
		return { changed: false, reloaded: false, error: "freeflow_inactive" };
	}
	if (action === "status") {
		const state = await readCapabilityState(ctx.cwd);
		ctx.ui.notify(delegationHarnessStatusText(state), "info");
		return { changed: false, reloaded: false };
	}
	if (["enable", "on", "true", "disable", "off", "false"].includes(action)) {
		const enabled = ["enable", "on", "true"].includes(action);
		const item = delegationHarnessItems(raw)[0];
		await updateConfig(ctx.cwd, item, enabled);
		await afterChange(true);
		ctx.ui.notify(
			`Delegation Harness ${enabled ? "enabled" : "disabled"}. Reloading Freeflow runtime...`,
			"info",
		);
		if (typeof ctx.reload === "function") {
			await ctx.reload();
			return { changed: true, reloaded: true };
		}
		ctx.ui.notify(
			"Run /reload for Delegation Harness changes to fully apply.",
			"warning",
		);
		return { changed: true, reloaded: false };
	}
	if (action && action !== "settings") {
		ctx.ui.notify(
			"Usage: /delegation-harness, /delegation-harness settings, or /delegation-harness status",
			"warning",
		);
		return { changed: false, reloaded: false, error: "invalid_action" };
	}
	const changed = await openSettings({
		title: "Delegation Harness Settings",
		items: delegationHarnessItems(raw),
		ctx,
		onChange: (item, value) => updateConfig(ctx.cwd, item, value),
		onClose: async (settingsChanged) => {
			if (!settingsChanged) return;
			await afterChange(true);
			ctx.ui.notify(
				"Delegation Harness settings saved. Reloading Freeflow runtime...",
				"info",
			);
			if (typeof ctx.reload === "function") {
				await ctx.reload();
			} else {
				ctx.ui.notify(
					"Run /reload for Delegation Harness changes to fully apply.",
					"warning",
				);
			}
		},
	});
	return { changed, reloaded: changed && typeof ctx.reload === "function" };
}

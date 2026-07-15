import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
	readFreeflowConfigState,
	readModeState,
	VALID_MODES,
} from "./runtime-context.js";

const POST_TOOL_ROUTING_VALUES = ["off", "safety-net", "strict"] as const;
const STORAGE_POLICY_VALUES = ["hybrid-dedupe", "store-everything"] as const;
const OBSERVED_PERSISTENCE_VALUES = ["none", "metadata-only", "exact"] as const;
const SCRIPT_LANGUAGES = ["javascript", "python", "jq"] as const;
const DEFAULT_FREEFLOW_ENABLED = true;
const DEFAULT_INTERACTION_CONTRACT_ENABLED = true;
const DEFAULT_SKILLS_ENABLED = true;
const MODE_VALUES = ["conversation", "workflow", "strict-workflow"];
const MODE_LABELS = {
	default: "Use repo default",
	conversation: "conversation",
	workflow: "workflow",
	"strict-workflow": "strict-workflow",
};
const MODE_DESCRIPTIONS = {
	conversation: "Discussion without workflow pressure",
	workflow: "Default for consequential work",
	"strict-workflow": "Stronger gates for high-risk work",
};

type SettingKind =
	| "boolean"
	| "enum"
	| "integer"
	| "string"
	| "list"
	| "json"
	| "group";

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
};

type OpenSettingsOptions = {
	title: string;
	items: SettingsItem[];
	ctx: any;
	onChange: (item: SettingsItem, value: unknown) => Promise<void>;
	onClose?: (changed: boolean) => Promise<void> | void;
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
		throw new Error(
			`Could not clone settings value: ${error instanceof Error ? error.message : String(error)}`,
		);
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

function setPath(
	target: Record<string, unknown>,
	path: string[],
	value: unknown,
) {
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

function setConfigValue(
	config: Record<string, unknown>,
	item: SettingsItem,
	value: unknown,
) {
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
		throw new Error(
			`Expected valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
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
	const rawRouter = isRecord(rawConfig.outputRouter)
		? rawConfig.outputRouter
		: {};
	const normalized = normalizeFreeflowConfig({
		...rawConfig,
		outputRouter: { ...rawRouter, enabled: true },
	});
	return normalized.config;
}

function rawValue(
	rawConfig: Record<string, unknown>,
	path: string[],
	fallback: unknown,
): unknown {
	const value = getPath(rawConfig, path);
	return value === undefined ? fallback : value;
}

function outputRouterItems(
	rawConfig: Record<string, unknown>,
	freeflowInactive = false,
): SettingsItem[] {
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
					(SCRIPT_LANGUAGES as readonly string[]).includes(value),
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

function delegationHarnessItems(
	rawConfig: Record<string, unknown>,
	freeflowInactive = false,
): SettingsItem[] {
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

function freeflowItems(
	rawConfig: Record<string, unknown>,
	modeState?: Awaited<ReturnType<typeof readModeState>>,
): SettingsItem[] {
	const freeflowEnabled = getPath(rawConfig, ["enabled"]) !== false;
	const freeflowInactive = !freeflowEnabled;
	const interactionContractEnabled =
		getPath(rawConfig, ["interactionContract"]) !== false;
	const skillsConfig = getPath(rawConfig, ["skills"]);
	const skillsEnabled =
		!isRecord(skillsConfig) || skillsConfig.enabled !== false;
	const rawDefaultMode = rawConfig.defaultMode;
	const defaultMode =
		typeof rawDefaultMode === "string" && VALID_MODES.has(rawDefaultMode)
			? rawDefaultMode
			: "workflow";
	const sessionMode = modeState?.currentMode ?? "default";
	const routerItems = outputRouterItems(rawConfig, freeflowInactive);
	const routerEnabled =
		routerItems.find((item) => item.id === "outputRouter.enabled")?.value ===
		true;
	const delegationItems = delegationHarnessItems(rawConfig, freeflowInactive);
	const delegationEnabled =
		delegationItems.find((item) => item.id === "delegationHarness.enabled")
			?.value === true;

	return [
		{
			id: "freeflow.enabled",
			label: "Freeflow",
			description:
				"Master switch for the Interaction Contract, Freeflow skills, output routing, delegation, and observed/native routing in this repo.",
			path: ["enabled"],
			kind: "boolean",
			value: freeflowEnabled,
			defaultValue: DEFAULT_FREEFLOW_ENABLED,
		},
		{
			id: "freeflow.interactionContract",
			label: "Interaction Contract",
			description:
				"Apply Freeflow's compact turn-interpretation and collaboration guidance.",
			path: ["interactionContract"],
			kind: "boolean",
			value: interactionContractEnabled,
			defaultValue: DEFAULT_INTERACTION_CONTRACT_ENABLED,
			inactive: freeflowInactive,
		},
		{
			id: "freeflow.skills.enabled",
			label: "Skills",
			description:
				"Expose Freeflow skills and load Workflow once on the first turn.",
			path: ["skills", "enabled"],
			kind: "boolean",
			value: skillsEnabled,
			defaultValue: DEFAULT_SKILLS_ENABLED,
			inactive: freeflowInactive,
		},
		{
			id: "freeflow.sessionMode",
			label: "Session mode",
			description:
				"Temporary mode override for this Pi session. Use repo default clears the override without changing config.json.",
			kind: "enum",
			value: sessionMode,
			values: ["default", ...MODE_VALUES],
			valueLabels: MODE_LABELS,
			valueDescriptions: {
				default: defaultMode,
				...MODE_DESCRIPTIONS,
			},
			inactive: freeflowInactive || !skillsEnabled,
			displaySuffix: sessionMode === "default" ? `(${defaultMode})` : undefined,
		},
		{
			id: "freeflow.defaultMode",
			label: "Default mode",
			description:
				"Repo default Freeflow mode used when Skills are enabled; inactive while Skills are disabled.",
			path: ["defaultMode"],
			kind: "enum",
			value: defaultMode,
			values: MODE_VALUES,
			valueLabels: MODE_LABELS,
			valueDescriptions: MODE_DESCRIPTIONS,
			inactive: freeflowInactive,
			displaySuffix:
				!freeflowInactive && !skillsEnabled ? "(inactive)" : undefined,
		},
		{
			id: "outputRouter.group",
			label: "Output Router",
			description:
				"Open grouped settings for routed evidence tools, native output safety net, vault storage, script transforms, and observed tool routing.",
			kind: "group",
			value: routerEnabled,
			inactive: freeflowInactive,
			children: routerItems,
		},
		{
			id: "delegationHarness.group",
			label: "Delegation Harness",
			description:
				"Open grouped settings for the Freeflow cmux delegation harness tools, hooks, and runtime guidance.",
			kind: "group",
			value: delegationEnabled,
			inactive: freeflowInactive,
			children: delegationItems,
		},
	];
}

function migrateLegacyRouterConfig(config: Record<string, unknown>) {
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

async function updateConfig(cwd: string, item: SettingsItem, value: unknown) {
	const current = await readFreeflowConfig(cwd);
	const next = cloneJson(current) as Record<string, unknown>;
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

function valueForDisplay(item: SettingsItem): string {
	let value: string;
	if (item.kind === "boolean") {
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

function nextEnumValue(item: SettingsItem): unknown {
	if (item.kind === "boolean") {
		return item.value === true ? false : true;
	}
	const values = item.values ?? [];
	const current = String(item.value ?? values[0] ?? "");
	const index = values.indexOf(current);
	return values[(index + 1) % values.length] ?? current;
}

function truncate(text: string, width: number): string {
	if (width <= 0) return "";
	if (text.length <= width) return text;
	return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function isUp(data: string): boolean {
	return data === "\u001b[A" || data === "\u001bOA";
}

function isDown(data: string): boolean {
	return data === "\u001b[B" || data === "\u001bOB";
}

function isEnter(data: string): boolean {
	return data === "\r" || data === "\n";
}

function isEscape(data: string): boolean {
	return data === "\u001b" || data === "\u0003";
}

function isBackspace(data: string): boolean {
	return data === "\u007f" || data === "\b";
}

type Keybindings = {
	matches?: (data: string, keybinding: string) => boolean;
};

function matchesKeybinding(
	keybindings: Keybindings | undefined,
	data: string,
	keybinding: string,
	fallback: (data: string) => boolean,
): boolean {
	try {
		if (keybindings?.matches?.(data, keybinding)) return true;
	} catch {
		// Fall through to raw escape fallback for tests and older Pi builds.
	}
	return fallback(data);
}

type SettingsFrame = {
	title: string;
	items: SettingsItem[];
	selected: number;
	search: string;
	choiceFor?: SettingsItem;
};

function walkSettingsItems(
	items: SettingsItem[],
	visitor: (item: SettingsItem) => void,
) {
	for (const item of items) {
		visitor(item);
		if (item.children) walkSettingsItems(item.children, visitor);
	}
}

function findSettingsItem(
	items: SettingsItem[],
	id: string,
): SettingsItem | undefined {
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
	private readonly frames: SettingsFrame[];
	private editItem: SettingsItem | null = null;
	private editBuffer = "";
	private message = "";
	private changed = false;
	private pending = Promise.resolve();

	constructor(
		private readonly options: OpenSettingsOptions,
		private readonly done: (changed: boolean) => void,
		private readonly requestRender: () => void,
		private readonly theme: any,
		private readonly keybindings?: Keybindings,
	) {
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

	render(width: number): string[] {
		const lines: string[] = [];
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
			const item = items[index]!;
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

	handleInput(data: string) {
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
	}

	private currentFrame(): SettingsFrame {
		return this.frames[this.frames.length - 1]!;
	}

	private matches(
		data: string,
		keybinding: string,
		fallback: (data: string) => boolean,
	): boolean {
		return matchesKeybinding(this.keybindings, data, keybinding, fallback);
	}

	private border(width: number): string {
		return (
			this.theme.fg?.("border", "─".repeat(Math.max(1, width))) ??
			"─".repeat(Math.max(1, width))
		);
	}

	private searchLine(frame: SettingsFrame, width: number): string {
		const cursor = this.theme.fg?.("accent", "█") ?? "█";
		return truncate(`> ${frame.search}${cursor}`, width);
	}

	private renderChoiceFrame(
		lines: string[],
		frame: SettingsFrame,
		width: number,
	): string[] {
		const item = frame.choiceFor!;
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
			const value = values[index]!;
			const selected = index === frame.selected;
			const prefix = selected ? "› " : "  ";
			const label = labels[index]!.padEnd(maxLabel);
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

	private handleChoiceInput(data: string, frame: SettingsFrame) {
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

	private displayItems(frame: SettingsFrame): SettingsItem[] {
		const query = frame.search.trim().toLowerCase();
		if (!query) return frame.items;
		return frame.items.filter((item) => {
			return [item.label, item.description, valueForDisplay(item)].some(
				(text) => text.toLowerCase().includes(query),
			);
		});
	}

	private clampSelection(frame: SettingsFrame, itemCount: number) {
		frame.selected = Math.max(
			0,
			Math.min(frame.selected, Math.max(0, itemCount - 1)),
		);
	}

	private isSearchInput(data: string): boolean {
		return data.length === 1 && data > " " && data !== "\u007f";
	}

	private styleLine(
		line: string,
		item: SettingsItem,
		selected: boolean,
	): string {
		if (item.inactive) return this.theme.fg?.("dim", line) ?? line;
		if (selected) return this.theme.fg?.("accent", line) ?? line;
		return line;
	}

	private activateSelected() {
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

	private handleEditInput(data: string) {
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

	private applyValue(item: SettingsItem, value: unknown) {
		item.value = value;
		this.refreshDerivedState();
		this.changed = true;
		this.message = `${item.label} = ${valueForDisplay(item)}`;
		this.pending = this.pending
			.then(() => this.options.onChange(item, value))
			.catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				this.message = `Write failed: ${message}`;
			});
	}

	private refreshDerivedState() {
		const freeflowItem = findSettingsItem(
			this.options.items,
			"freeflow.enabled",
		);
		const freeflowInactive = freeflowItem ? freeflowItem.value !== true : false;
		const skillsEnabled =
			findSettingsItem(this.options.items, "freeflow.skills.enabled")?.value ===
			true;
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

		if (defaultModeItem) {
			defaultModeItem.displaySuffix =
				!freeflowInactive && !skillsEnabled ? "(inactive)" : undefined;
		}
		if (sessionModeItem) {
			const defaultMode = String(defaultModeItem?.value ?? "workflow");
			sessionModeItem.inactive = freeflowInactive || !skillsEnabled;
			sessionModeItem.displaySuffix =
				sessionModeItem.value === "default" ? `(${defaultMode})` : undefined;
			sessionModeItem.valueDescriptions = {
				default: defaultMode,
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
			if (candidate.id === "freeflow.enabled") {
				candidate.inactive = false;
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

	private close() {
		this.done(this.changed);
	}
}

function wrapPlain(text: string, width: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
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

async function openSettings(options: OpenSettingsOptions): Promise<boolean> {
	if (typeof options.ctx?.ui?.custom !== "function") {
		options.ctx?.ui?.notify?.(
			`${options.title} requires Pi TUI mode. Use the status command for a compact summary.`,
			"warning",
		);
		return false;
	}

	let component: FreeflowSettingsComponent | undefined;
	const changed = await options.ctx.ui.custom(
		(
			tui: any,
			theme: any,
			keybindings: Keybindings,
			done: (changed: boolean) => void,
		) => {
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

	await component?.waitForWrites();
	await options.onClose?.(changed === true);
	return changed === true;
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

function freeflowStatusText(
	state: Awaited<ReturnType<typeof readCapabilityState>>,
): string {
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

function delegationHarnessStatusText(
	state: Awaited<ReturnType<typeof readCapabilityState>>,
): string {
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

function actionIsMutation(action: string): boolean {
	return (
		action === "" ||
		action === "settings" ||
		["enable", "on", "true", "disable", "off", "false"].includes(action)
	);
}

async function maybeBlockLayerMutation(
	action: string,
	ctx: any,
	layerName: string,
) {
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
	const configState = await readFreeflowConfigState(ctx.cwd);
	const raw = configState.valid ? await readFreeflowConfig(ctx.cwd) : {};
	const [state, modeState] = await Promise.all([
		readCapabilityState(ctx.cwd),
		readModeState(ctx.cwd),
	]);

	if (action === "status") {
		ctx.ui.notify(freeflowStatusText(state), "info");
		return { changed: false, reloaded: false };
	}

	if (!configState.valid) {
		ctx.ui.notify(freeflowStatusText(state), "warning");
		return { changed: false, reloaded: false, error: "not_configured" };
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

		const item = freeflowItems(raw, modeState).find(
			(candidate) => candidate.id === "freeflow.sessionMode",
		)!;
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
		const item = freeflowItems(raw, modeState).find(
			(candidate) => candidate.id === "freeflow.enabled",
		)!;
		await updateConfig(ctx.cwd, item, enabled);
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
			"Usage: /freeflow, /freeflow settings, /freeflow status, /freeflow mode [conversation|workflow|strict-workflow|reset], /freeflow enable, or /freeflow disable",
			"warning",
		);
		return { changed: false, reloaded: false, error: "invalid_action" };
	}

	let configChanged = false;
	const changed = await openSettings({
		title: "Freeflow Settings",
		items: freeflowItems(raw, modeState),
		ctx,
		onChange: async (item, value) => {
			if (item.id === "freeflow.sessionMode") {
				await handleModeCommand(String(value), ctx, pi);
				return;
			}
			configChanged = true;
			await updateConfig(ctx.cwd, item, value);
		},
		onClose: async (settingsChanged) => {
			if (!settingsChanged) return;
			if (!configChanged) return;
			await afterChange(true);
			ctx.ui.notify(
				"Freeflow settings saved. Reloading Freeflow runtime...",
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
		)!;
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

export async function handleDelegationHarnessCommand(
	args: string | undefined,
	ctx: any,
	afterChange: (changed: boolean) => Promise<void> | void,
) {
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
		const item = delegationHarnessItems(raw)[0]!;
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

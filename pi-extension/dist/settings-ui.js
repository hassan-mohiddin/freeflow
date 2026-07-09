import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_OBSERVED_ROUTING_CONFIG, DEFAULT_OUTPUT_ROUTER_ENABLED, DEFAULT_POST_TOOL_ROUTING, DEFAULT_ROUTER_THRESHOLDS, DEFAULT_SCRIPT_TRANSFORM_CONFIG, DEFAULT_STORAGE_POLICY, DEFAULT_VAULT_RETENTION, DEFAULT_VAULT_ROOT, normalizeFreeflowConfig, } from "../../router/dist/index.js";
import { readFreeflowConfig, readCapabilityState } from "./runtime-context.js";
const BOOLEAN_VALUES = ["enabled", "disabled"];
const POST_TOOL_ROUTING_VALUES = ["off", "safety-net", "strict"];
const STORAGE_POLICY_VALUES = ["hybrid-dedupe", "store-everything"];
const OBSERVED_PERSISTENCE_VALUES = ["none", "metadata-only", "exact"];
const SCRIPT_LANGUAGES = ["javascript", "python", "jq"];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cloneJson(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
function getPath(source, path) {
    let current = source;
    for (const key of path) {
        if (!isRecord(current))
            return undefined;
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
        if (!isRecord(current))
            return;
        parents.push({ object: current, key });
        current = current[key];
    }
    if (!isRecord(current))
        return;
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
function parseStringList(text) {
    return text.split(",").map((item) => item.trim()).filter(Boolean);
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
    if (!trimmed)
        return {};
    const parsed = JSON.parse(trimmed);
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
function booleanFromUi(value) {
    return value === "enabled";
}
function normalizedSettingsConfig(rawConfig) {
    const rawRouter = isRecord(rawConfig.outputRouter) ? rawConfig.outputRouter : {};
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
function outputRouterItems(rawConfig) {
    const effective = normalizedSettingsConfig(rawConfig);
    const routerEnabled = normalizeFreeflowConfig(rawConfig).config.outputRouter.enabled;
    const router = effective.outputRouter;
    const scriptTransform = effective.scriptTransform;
    const observedRouting = effective.observedRouting;
    const inactive = !routerEnabled;
    return [
        {
            id: "outputRouter.enabled",
            label: "Output Router",
            description: "Master switch for Freeflow routed evidence tools and router runtime guidance.",
            path: ["outputRouter", "enabled"],
            kind: "boolean",
            value: routerEnabled,
            defaultValue: DEFAULT_OUTPUT_ROUTER_ENABLED,
        },
        {
            id: "outputRouter.postToolRouting",
            label: "Native safety net",
            description: "Post-process large/noisy native read/bash output. safety-net can replace oversized native output with vaulted routed evidence; strict is stronger.",
            path: ["outputRouter", "postToolRouting"],
            kind: "enum",
            value: router.postToolRouting,
            values: [...POST_TOOL_ROUTING_VALUES],
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
            value: router.vault.retention?.strategy === "ttl" ? router.vault.retention.ttlDays : DEFAULT_VAULT_RETENTION.ttlDays,
            defaultValue: DEFAULT_VAULT_RETENTION.ttlDays,
            parse: parsePositiveInteger,
            inactive,
        },
        {
            id: "outputRouter.generatedPaths",
            label: "Generated paths",
            description: "Comma-separated globs for generated repo paths that should be treated as noisy or lower-priority evidence.",
            path: ["outputRouter", "hints", "generatedPathGlobs"],
            kind: "list",
            value: rawValue(rawConfig, ["outputRouter", "hints", "generatedPathGlobs"], rawValue(rawConfig, ["outputRouter", "generatedPaths"], router.hints?.generatedPathGlobs ?? [])),
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
            value: rawValue(rawConfig, ["outputRouter", "hints", "noisyCommandPatterns"], rawValue(rawConfig, ["outputRouter", "noisyCommandHints"], router.hints?.noisyCommandPatterns ?? [])),
            format: formatList,
            parse: parseStringList,
            inactive,
        },
        {
            id: "outputRouter.scriptTransform.enabled",
            label: "Script transform",
            description: "Enable sandboxed script transforms/producers. Requires proof-backed adapters; no unsandboxed fallback.",
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
            parse: (text) => parseStringList(text).filter((value) => SCRIPT_LANGUAGES.includes(value)),
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
            description: "JSON object keyed by MCP server id. Example: {\"github\":{\"enabled\":true,\"persistence\":\"exact\"}}",
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
            description: "Persistence mode for this observed producer: none, metadata-only, or exact.",
            path: ["outputRouter", "observedRouting", id, "persistence"],
            kind: "enum",
            value: value?.persistence ?? "none",
            values: [...OBSERVED_PERSISTENCE_VALUES],
            defaultValue: value?.enabled === true ? undefined : "none",
            inactive,
        },
    ];
}
function delegationHarnessItems(rawConfig) {
    const configEnabled = getPath(rawConfig, ["delegationHarness", "enabled"]) === true;
    return [
        {
            id: "delegationHarness.enabled",
            label: "Delegation Harness",
            description: "Master switch for the Freeflow cmux delegation harness tools, hooks, and runtime guidance.",
            path: ["delegationHarness", "enabled"],
            kind: "boolean",
            value: configEnabled,
            defaultValue: false,
        },
    ];
}
function migrateLegacyRouterConfig(config) {
    const outputRouter = isRecord(config.outputRouter) ? config.outputRouter : undefined;
    if (!outputRouter)
        return;
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
        vault.retention = { strategy: "ttl", ttlDays: outputRouter.vaultRetentionDays };
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
function pruneKnownDefaults(config) {
    const defaultPaths = [
        { path: ["outputRouter", "enabled"], value: DEFAULT_OUTPUT_ROUTER_ENABLED },
        { path: ["outputRouter", "postToolRouting"], value: DEFAULT_POST_TOOL_ROUTING },
        { path: ["outputRouter", "storagePolicy"], value: DEFAULT_STORAGE_POLICY },
        { path: ["outputRouter", "thresholds", "largeOutputBytes"], value: DEFAULT_ROUTER_THRESHOLDS.largeOutputBytes },
        { path: ["outputRouter", "thresholds", "largeOutputLines"], value: DEFAULT_ROUTER_THRESHOLDS.largeOutputLines },
        { path: ["outputRouter", "vault", "root"], value: DEFAULT_VAULT_ROOT },
        { path: ["outputRouter", "vault", "retention", "ttlDays"], value: DEFAULT_VAULT_RETENTION.ttlDays },
        { path: ["outputRouter", "scriptTransform", "enabled"], value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.enabled },
        { path: ["outputRouter", "scriptTransform", "sandbox"], value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.sandbox },
        { path: ["outputRouter", "scriptTransform", "languages"], value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.languages },
        { path: ["outputRouter", "scriptTransform", "network"], value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.network },
        { path: ["outputRouter", "scriptTransform", "rawScriptPersistence"], value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.rawScriptPersistence },
        { path: ["outputRouter", "scriptTransform", "limits", "timeoutMs"], value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.timeoutMs },
        { path: ["outputRouter", "scriptTransform", "limits", "maxInputBytes"], value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.maxInputBytes },
        { path: ["outputRouter", "scriptTransform", "limits", "maxOutputBytes"], value: DEFAULT_SCRIPT_TRANSFORM_CONFIG.limits.maxOutputBytes },
        { path: ["outputRouter", "observedRouting", "enabled"], value: DEFAULT_OBSERVED_ROUTING_CONFIG.enabled },
        { path: ["outputRouter", "observedRouting", "onRoutingFailure"], value: DEFAULT_OBSERVED_ROUTING_CONFIG.onRoutingFailure },
        { path: ["outputRouter", "observedRouting", "mcp", "servers"], value: DEFAULT_OBSERVED_ROUTING_CONFIG.mcp.servers },
        { path: ["outputRouter", "observedRouting", "web", "enabled"], value: DEFAULT_OBSERVED_ROUTING_CONFIG.web.enabled },
        { path: ["outputRouter", "observedRouting", "fetch", "enabled"], value: DEFAULT_OBSERVED_ROUTING_CONFIG.fetch.enabled },
        { path: ["outputRouter", "observedRouting", "codeSearch", "enabled"], value: DEFAULT_OBSERVED_ROUTING_CONFIG.codeSearch.enabled },
        { path: ["delegationHarness", "enabled"], value: false },
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
async function updateConfig(cwd, item, value) {
    const current = await readFreeflowConfig(cwd);
    const next = cloneJson(current);
    setConfigValue(next, item, value);
    migrateLegacyRouterConfig(next);
    pruneKnownDefaults(next);
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await writeFile(join(cwd, ".freeflow/config.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
function valueForDisplay(item) {
    if (item.kind === "boolean")
        return booleanValue(item.value);
    if (item.format)
        return item.format(item.value);
    return String(item.value ?? "");
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
    if (width <= 0)
        return "";
    if (text.length <= width)
        return text;
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
class FreeflowSettingsComponent {
    options;
    done;
    requestRender;
    theme;
    selected = 0;
    editItem = null;
    editBuffer = "";
    message = "";
    changed = false;
    pending = Promise.resolve();
    constructor(options, done, requestRender, theme) {
        this.options = options;
        this.done = done;
        this.requestRender = requestRender;
        this.theme = theme;
    }
    render(width) {
        const lines = [];
        lines.push(this.theme.fg?.("accent", this.theme.bold?.(this.options.title) ?? this.options.title) ?? this.options.title);
        lines.push(truncate("↑↓ navigate • Enter/Space change • Esc save & close", width));
        lines.push("");
        const items = this.options.items;
        const maxLabel = Math.min(34, Math.max(...items.map((item) => item.label.length), 12));
        const visible = Math.min(items.length, 18);
        const start = Math.max(0, Math.min(this.selected - Math.floor(visible / 2), Math.max(0, items.length - visible)));
        const end = Math.min(items.length, start + visible);
        for (let index = start; index < end; index++) {
            const item = items[index];
            const selected = index === this.selected;
            const prefix = selected ? "› " : "  ";
            const label = item.label.padEnd(maxLabel);
            const value = this.editItem?.id === item.id ? `[${this.editBuffer}]` : valueForDisplay(item);
            const inactive = item.inactive ? " inactive" : "";
            const line = `${prefix}${label}  ${value}${inactive}`;
            lines.push(truncate(selected ? this.theme.fg?.("accent", line) ?? line : line, width));
        }
        if (items.length > visible) {
            lines.push(truncate(`  (${this.selected + 1}/${items.length})`, width));
        }
        const selectedItem = items[this.selected];
        if (selectedItem) {
            lines.push("");
            lines.push(...wrapPlain(selectedItem.description, Math.max(20, width - 2)).map((line) => truncate(`  ${line}`, width)));
        }
        if (this.message) {
            lines.push("");
            lines.push(truncate(`  ${this.message}`, width));
        }
        return lines.map((line) => truncate(line, width));
    }
    invalidate() { }
    handleInput(data) {
        if (this.editItem) {
            this.handleEditInput(data);
            this.requestRender();
            return;
        }
        if (isUp(data)) {
            this.selected = this.selected === 0 ? this.options.items.length - 1 : this.selected - 1;
        }
        else if (isDown(data)) {
            this.selected = this.selected === this.options.items.length - 1 ? 0 : this.selected + 1;
        }
        else if (isEnter(data) || data === " ") {
            this.activateSelected();
        }
        else if (isEscape(data)) {
            this.close();
            return;
        }
        this.requestRender();
    }
    async waitForWrites() {
        await this.pending;
    }
    activateSelected() {
        const item = this.options.items[this.selected];
        if (!item)
            return;
        this.message = "";
        if (item.kind === "boolean" || item.kind === "enum") {
            this.applyValue(item, nextEnumValue(item));
            return;
        }
        this.editItem = item;
        this.editBuffer = valueForDisplay(item);
    }
    handleEditInput(data) {
        if (!this.editItem)
            return;
        if (isEscape(data)) {
            this.editItem = null;
            this.editBuffer = "";
            this.message = "Edit cancelled.";
            return;
        }
        if (isEnter(data)) {
            const item = this.editItem;
            try {
                const parsed = item.parse ? item.parse(this.editBuffer) : this.editBuffer;
                this.editItem = null;
                this.editBuffer = "";
                this.applyValue(item, parsed);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.message = `Invalid value: ${message}`;
            }
            return;
        }
        if (isBackspace(data)) {
            this.editBuffer = this.editBuffer.slice(0, -1);
            return;
        }
        if (data.length === 1 && data >= " ") {
            this.editBuffer += data;
        }
    }
    applyValue(item, value) {
        item.value = value;
        if (item.id === "outputRouter.enabled") {
            const inactive = value !== true;
            for (const candidate of this.options.items) {
                if (candidate.id !== "outputRouter.enabled")
                    candidate.inactive = inactive;
            }
        }
        this.changed = true;
        this.message = `${item.label} = ${valueForDisplay(item)}`;
        this.pending = this.pending.then(() => this.options.onChange(item, value)).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            this.message = `Write failed: ${message}`;
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
        }
        else if (`${current} ${word}`.length <= width) {
            current = `${current} ${word}`;
        }
        else {
            lines.push(current);
            current = word;
        }
    }
    if (current)
        lines.push(current);
    return lines.length ? lines : [""];
}
async function openSettings(options) {
    if (typeof options.ctx?.ui?.custom !== "function") {
        options.ctx?.ui?.notify?.(`${options.title} requires Pi TUI mode. Use the status command for a compact summary.`, "warning");
        return false;
    }
    let component;
    const changed = await options.ctx.ui.custom((tui, theme, _keybindings, done) => {
        component = new FreeflowSettingsComponent(options, done, () => tui.requestRender(), theme ?? {});
        return component;
    });
    await component?.waitForWrites();
    await options.onClose?.(changed === true);
    return changed === true;
}
function outputRouterStatusText(rawConfig) {
    const settingsConfig = normalizedSettingsConfig(rawConfig);
    const actual = normalizeFreeflowConfig(rawConfig).config;
    const router = actual.outputRouter;
    const configured = settingsConfig;
    const generatedPaths = router.hints?.generatedPathGlobs?.length ?? 0;
    const noisyHints = router.hints?.noisyCommandPatterns?.length ?? 0;
    return [
        `Output Router: ${router.enabled ? "enabled" : "disabled"}`,
        `script transform: ${configured.scriptTransform.enabled ? "enabled" : "disabled"}${router.enabled ? "" : " (inactive)"}`,
        `observed routing: ${configured.observedRouting.enabled ? "enabled" : "disabled"}${router.enabled ? "" : " (inactive)"}`,
        `native safety net: ${router.postToolRouting}`,
        `storage: ${router.storagePolicy}`,
        `generated paths: ${generatedPaths}`,
        `noisy command hints: ${noisyHints}`,
    ].join("; ");
}
function delegationHarnessStatusText(state) {
    const details = state.delegationHarness.envEnabled && !state.delegationHarness.configEnabled
        ? " (enabled by FREEFLOW_DELEGATION_HARNESS_ENABLED)"
        : "";
    return `Delegation Harness: ${state.delegationHarness.enabled ? "enabled" : "disabled"}${details}`;
}
export async function handleOutputRouterCommand(args, ctx, afterChange) {
    const action = (args ?? "").trim().toLowerCase();
    const raw = await readFreeflowConfig(ctx.cwd);
    if (action === "status") {
        ctx.ui.notify(outputRouterStatusText(raw), "info");
        return { changed: false, reloaded: false };
    }
    if (["enable", "on", "true", "disable", "off", "false"].includes(action)) {
        const enabled = ["enable", "on", "true"].includes(action);
        const item = outputRouterItems(raw).find((candidate) => candidate.id === "outputRouter.enabled");
        await updateConfig(ctx.cwd, item, enabled);
        ctx.ui.notify(`Output Router ${enabled ? "enabled" : "disabled"}. Reloading Freeflow runtime...`, "info");
        if (typeof ctx.reload === "function") {
            await ctx.reload();
            return { changed: true, reloaded: true };
        }
        await afterChange(true);
        ctx.ui.notify("Run /reload for Output Router changes to fully apply.", "warning");
        return { changed: true, reloaded: false };
    }
    if (action && action !== "settings") {
        ctx.ui.notify("Usage: /output-router, /output-router settings, or /output-router status", "warning");
        return { changed: false, reloaded: false, error: "invalid_action" };
    }
    const changed = await openSettings({
        title: "Output Router Settings",
        items: outputRouterItems(raw),
        ctx,
        onChange: (item, value) => updateConfig(ctx.cwd, item, value),
        onClose: async (settingsChanged) => {
            if (!settingsChanged)
                return;
            ctx.ui.notify("Output Router settings saved. Reloading Freeflow runtime...", "info");
            if (typeof ctx.reload === "function") {
                await ctx.reload();
            }
            else {
                await afterChange(true);
                ctx.ui.notify("Run /reload for Output Router changes to fully apply.", "warning");
            }
        },
    });
    return { changed, reloaded: changed && typeof ctx.reload === "function" };
}
export async function handleDelegationHarnessCommand(args, ctx, afterChange) {
    const action = (args ?? "").trim().toLowerCase();
    const raw = await readFreeflowConfig(ctx.cwd);
    if (action === "status") {
        const state = await readCapabilityState(ctx.cwd);
        ctx.ui.notify(delegationHarnessStatusText(state), "info");
        return { changed: false, reloaded: false };
    }
    if (["enable", "on", "true", "disable", "off", "false"].includes(action)) {
        const enabled = ["enable", "on", "true"].includes(action);
        const item = delegationHarnessItems(raw)[0];
        await updateConfig(ctx.cwd, item, enabled);
        ctx.ui.notify(`Delegation Harness ${enabled ? "enabled" : "disabled"}. Reloading Freeflow runtime...`, "info");
        if (typeof ctx.reload === "function") {
            await ctx.reload();
            return { changed: true, reloaded: true };
        }
        await afterChange(true);
        ctx.ui.notify("Run /reload for Delegation Harness changes to fully apply.", "warning");
        return { changed: true, reloaded: false };
    }
    if (action && action !== "settings") {
        ctx.ui.notify("Usage: /delegation-harness, /delegation-harness settings, or /delegation-harness status", "warning");
        return { changed: false, reloaded: false, error: "invalid_action" };
    }
    const changed = await openSettings({
        title: "Delegation Harness Settings",
        items: delegationHarnessItems(raw),
        ctx,
        onChange: (item, value) => updateConfig(ctx.cwd, item, value),
        onClose: async (settingsChanged) => {
            if (!settingsChanged)
                return;
            ctx.ui.notify("Delegation Harness settings saved. Reloading Freeflow runtime...", "info");
            if (typeof ctx.reload === "function") {
                await ctx.reload();
            }
            else {
                await afterChange(true);
                ctx.ui.notify("Run /reload for Delegation Harness changes to fully apply.", "warning");
            }
        },
    });
    return { changed, reloaded: changed && typeof ctx.reload === "function" };
}

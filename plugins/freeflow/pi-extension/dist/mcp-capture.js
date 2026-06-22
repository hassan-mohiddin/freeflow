import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { validateCaptureInput } from "../../router/dist/index.js";
import { truncateText } from "./utils.js";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const MCP_BRIDGE_REQUEST_TIMEOUT_MS = 30_000;
const MCP_BRIDGE_MAX_STDERR_BYTES = 16_384;
const MCP_SAFE_ENV_KEYS = process.platform === "win32"
    ? [
        "APPDATA",
        "HOMEDRIVE",
        "HOMEPATH",
        "LOCALAPPDATA",
        "PATH",
        "PROCESSOR_ARCHITECTURE",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "USERNAME",
        "USERPROFILE",
        "PROGRAMFILES",
    ]
    : ["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"];
const SERENA_MCP_SERVER = "serena";
const SERENA_TOOL_PREFIX = "serena_";
const SERENA_READ_ONLY_MCP_TOOLS = new Set([
    "find_declaration",
    "find_implementations",
    "find_referencing_symbols",
    "find_symbol",
    "get_diagnostics_for_file",
    "get_diagnostics_for_symbol",
    "get_symbols_overview",
]);
const SERENA_MUTATING_OR_SIDE_EFFECT_MCP_TOOLS = new Set([
    "delete_memory",
    "edit_memory",
    "insert_after_symbol",
    "insert_before_symbol",
    "onboarding",
    "open_dashboard",
    "rename_memory",
    "rename_symbol",
    "replace_content",
    "replace_symbol_body",
    "safe_delete_symbol",
    "write_memory",
]);
export function normalizeCaptureParams(params) {
    const validation = validateCaptureInput(params);
    if (!validation.ok) {
        const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        throw new Error(`Invalid freeflow_capture input. ${message}`);
    }
    const producer = { ...validation.value.producer };
    if (producer.kind === "mcp" && producer.server === SERENA_MCP_SERVER && producer.tool?.startsWith(SERENA_TOOL_PREFIX)) {
        producer.tool = producer.tool.slice(SERENA_TOOL_PREFIX.length);
    }
    return {
        ...validation.value,
        producer,
    };
}
export function createPiCaptureAdapters(ctx, signal) {
    const readOnlyAdapters = Array.from(SERENA_READ_ONLY_MCP_TOOLS, (tool) => ({
        producer: { kind: "mcp", server: SERENA_MCP_SERVER, tool },
        readOnly: true,
        async isAvailable() {
            return Boolean(await loadMcpServerConfig(SERENA_MCP_SERVER, ctx.cwd));
        },
        async capture(context) {
            const serverConfig = await loadMcpServerConfig(SERENA_MCP_SERVER, ctx.cwd);
            if (!serverConfig) {
                throw new Error(`MCP server ${SERENA_MCP_SERVER} is not configured for Pi.`);
            }
            const toolName = normalizeMcpToolName(context.producer);
            if (!SERENA_READ_ONLY_MCP_TOOLS.has(toolName)) {
                throw new Error(`Serena MCP tool ${toolName} is not enabled for read-only Freeflow capture.`);
            }
            const text = await callMcpStdioTool({
                serverName: SERENA_MCP_SERVER,
                serverConfig,
                toolName,
                args: context.args,
                cwd: ctx.cwd,
                signal,
            });
            return { text, mediaType: "text/plain" };
        },
    }));
    const mutatingAdapters = Array.from(SERENA_MUTATING_OR_SIDE_EFFECT_MCP_TOOLS, (tool) => ({
        producer: { kind: "mcp", server: SERENA_MCP_SERVER, tool },
        readOnly: false,
        async capture() {
            throw new Error(`Serena MCP tool ${tool} is not read-only.`);
        },
    }));
    return [...readOnlyAdapters, ...mutatingAdapters];
}
function normalizeMcpToolName(producer) {
    const tool = producer?.tool;
    if (typeof tool !== "string" || tool.length === 0) {
        throw new Error("MCP producer.tool is required.");
    }
    if (producer.server === SERENA_MCP_SERVER && tool.startsWith(SERENA_TOOL_PREFIX)) {
        return tool.slice(SERENA_TOOL_PREFIX.length);
    }
    return tool;
}
function getMcpConfigPaths(cwd) {
    return [
        join(homedir(), ".config", "mcp", "mcp.json"),
        join(homedir(), ".pi", "agent", "mcp.json"),
        resolve(cwd, ".mcp.json"),
        resolve(cwd, ".pi", "mcp.json"),
    ];
}
async function loadMcpServerConfig(serverName, cwd) {
    let found = null;
    for (const configPath of getMcpConfigPaths(cwd)) {
        try {
            const raw = JSON.parse(await readFile(configPath, "utf8"));
            const servers = raw?.mcpServers ?? raw?.["mcp-servers"] ?? {};
            if (servers && typeof servers === "object" && !Array.isArray(servers) && servers[serverName]) {
                found = servers[serverName];
            }
        }
        catch {
            // Missing or invalid MCP configs are ignored here; pi-mcp-adapter owns user-facing setup diagnostics.
        }
    }
    return found;
}
async function callMcpStdioTool({ serverName, serverConfig, toolName, args, cwd, signal }) {
    if (serverConfig.type !== undefined && serverConfig.type !== "stdio") {
        throw new Error(`MCP server ${serverName} is configured with unsupported transport type ${serverConfig.type}; Freeflow capture supports stdio MCP only.`);
    }
    if (typeof serverConfig.command !== "string" || serverConfig.command.length === 0) {
        throw new Error(`MCP server ${serverName} has no stdio command configured.`);
    }
    const requestArgs = mcpToolArguments(args);
    const child = spawn(serverConfig.command, Array.isArray(serverConfig.args) ? serverConfig.args : [], {
        cwd,
        env: mcpServerEnv(serverConfig),
        stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let stdoutBuffer = Buffer.alloc(0);
    let nextId = 1;
    const pending = new Map();
    let closed = false;
    const failPending = (error) => {
        for (const entry of pending.values()) {
            clearTimeout(entry.timeout);
            entry.reject(error);
        }
        pending.clear();
    };
    child.stderr.on("data", (chunk) => {
        stderr = truncateStderr(stderr + chunk.toString("utf8"));
    });
    child.stdout.on("data", (chunk) => {
        stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
        try {
            const parsed = parseMcpMessages(stdoutBuffer);
            stdoutBuffer = parsed.rest;
            for (const message of parsed.messages) {
                handleMcpMessage(message, pending, child);
            }
        }
        catch (error) {
            failPending(error instanceof Error ? error : new Error(String(error)));
        }
    });
    child.on("error", (error) => {
        failPending(new Error(`Failed to start MCP server ${serverName}: ${error.message}`));
    });
    child.on("close", (code, signalName) => {
        closed = true;
        if (pending.size > 0) {
            failPending(new Error(`MCP server ${serverName} closed before responding (code=${code ?? "null"}, signal=${signalName ?? "null"}).${stderr ? ` stderr: ${truncateText(stderr, 500)}` : ""}`));
        }
    });
    let abortHandler;
    if (signal) {
        abortHandler = () => {
            failPending(new Error(`MCP call to ${serverName}/${toolName} was cancelled.`));
            child.kill("SIGTERM");
        };
        signal.addEventListener("abort", abortHandler, { once: true });
    }
    const request = (method, params) => {
        if (closed) {
            return Promise.reject(new Error(`MCP server ${serverName} is already closed.`));
        }
        const id = nextId++;
        const message = { jsonrpc: "2.0", id, method, params };
        return new Promise((resolvePromise, rejectPromise) => {
            const timeout = setTimeout(() => {
                pending.delete(id);
                rejectPromise(new Error(`MCP request ${method} to ${serverName} timed out after ${MCP_BRIDGE_REQUEST_TIMEOUT_MS}ms.${stderr ? ` stderr: ${truncateText(stderr, 500)}` : ""}`));
                child.kill("SIGTERM");
            }, MCP_BRIDGE_REQUEST_TIMEOUT_MS);
            pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timeout });
            writeMcpMessage(child, message);
        });
    };
    try {
        await request("initialize", {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "freeflow-capture", version: "0.2.0" },
        });
        writeMcpMessage(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
        const listed = await request("tools/list", {});
        const tools = Array.isArray(listed?.tools) ? listed.tools : [];
        if (!tools.some((tool) => tool?.name === toolName)) {
            throw new Error(`MCP server ${serverName} does not expose tool ${toolName}.`);
        }
        const result = await request("tools/call", { name: toolName, arguments: requestArgs });
        return stringifyMcpToolResult(result);
    }
    finally {
        if (abortHandler) {
            signal.removeEventListener("abort", abortHandler);
        }
        if (!child.killed) {
            child.kill("SIGTERM");
        }
    }
}
function mcpToolArguments(args) {
    if (args === undefined) {
        return {};
    }
    if (args && typeof args === "object" && !Array.isArray(args)) {
        return args;
    }
    throw new Error("MCP tool arguments must be an object.");
}
function mcpServerEnv(serverConfig) {
    const env = {};
    for (const key of MCP_SAFE_ENV_KEYS) {
        const value = process.env[key];
        if (typeof value === "string" && !value.startsWith("()")) {
            env[key] = value;
        }
    }
    if (!serverConfig.env || typeof serverConfig.env !== "object" || Array.isArray(serverConfig.env)) {
        return env;
    }
    for (const [key, value] of Object.entries(serverConfig.env)) {
        if (typeof value === "string") {
            env[key] = value.replace(/\$\{([^}]+)\}/g, (_match, name) => process.env[name] ?? "");
        }
    }
    return env;
}
function parseMcpMessages(buffer) {
    const messages = [];
    let rest = buffer;
    while (rest.length > 0) {
        const newlineIndex = rest.indexOf("\n");
        if (newlineIndex === -1) {
            break;
        }
        const line = rest.slice(0, newlineIndex).toString("utf8").replace(/\r$/, "");
        rest = rest.slice(newlineIndex + 1);
        if (line.trim().length === 0) {
            continue;
        }
        messages.push(JSON.parse(line));
    }
    return { messages, rest };
}
function handleMcpMessage(message, pending, child) {
    if (message && Object.prototype.hasOwnProperty.call(message, "id") && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(entry.timeout);
        if (message.error) {
            const err = message.error;
            entry.reject(new Error(`MCP error ${err.code ?? "unknown"}: ${err.message ?? "unknown error"}`));
        }
        else {
            entry.resolve(message.result);
        }
        return;
    }
    if (message && Object.prototype.hasOwnProperty.call(message, "id") && message.method) {
        writeMcpMessage(child, {
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: `Freeflow capture MCP bridge does not implement client method ${message.method}.` },
        });
    }
}
function writeMcpMessage(child, message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
}
function stringifyMcpToolResult(result) {
    const parts = [];
    if (Array.isArray(result?.content)) {
        for (const part of result.content) {
            if (part?.type === "text" && typeof part.text === "string") {
                parts.push(part.text);
            }
            else {
                parts.push(JSON.stringify(part));
            }
        }
    }
    if (parts.length === 0 && result?.structuredContent !== undefined) {
        parts.push(JSON.stringify(result.structuredContent, null, 2));
    }
    if (parts.length === 0) {
        parts.push(JSON.stringify(result, null, 2));
    }
    return parts.join("\n");
}
function truncateStderr(text) {
    if (Buffer.byteLength(text, "utf8") <= MCP_BRIDGE_MAX_STDERR_BYTES) {
        return text;
    }
    return text.slice(-MCP_BRIDGE_MAX_STDERR_BYTES);
}

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
function getMcpConfigPaths(cwd) {
    return [
        join(homedir(), ".config", "mcp", "mcp.json"),
        join(homedir(), ".pi", "agent", "mcp.json"),
        resolve(cwd, ".mcp.json"),
        resolve(cwd, ".pi", "mcp.json"),
    ];
}
export async function isMcpServerConfigured(serverName, cwd) {
    return Boolean(await loadMcpServerConfig(serverName, cwd));
}
export async function loadMcpServerConfig(serverName, cwd) {
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

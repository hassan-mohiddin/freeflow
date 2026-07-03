import { extractTextContent, formatStatus, shortenMiddle, textComponent, themeBold, themeFg, truncateText, } from "../utils.js";
export function renderDelegationCall(toolName, args, theme) {
    const title = themeFg(theme, "toolTitle", themeBold(theme, toolName));
    const parts = [title];
    if (args?.role)
        parts.push(themeFg(theme, "accent", args.role));
    if (args?.taskId)
        parts.push(themeFg(theme, "muted", String(args.taskId)));
    if (args?.agentId)
        parts.push(themeFg(theme, "dim", String(args.agentId)));
    if (toolName === "delegate_spawn")
        parts.push(themeFg(theme, "warning", "preflight"));
    if (toolName === "delegate_send" && args?.kind)
        parts.push(themeFg(theme, "muted", args.kind));
    return textComponent(parts.join(" "));
}
export function renderDelegationResult(toolName, result, { expanded } = {}, theme) {
    const payload = result?.details?.result;
    if (!payload) {
        return textComponent(truncateText(extractTextContent(result?.content) ?? "No delegation result details available.", 220));
    }
    const status = payload.status ?? payload.toolStatus ?? "unknown";
    const failed = payload.toolStatus === "error" || status === "error" || status === "DELEGATION_UNAVAILABLE";
    const icon = failed ? "✗" : status === "running" || status === "sent" || status === "captured" || status === "closed" || status === "created" ? "✓" : "!";
    const handle = [payload.taskId ? `task ${payload.taskId}` : undefined, payload.agentId ? `agent ${payload.agentId}` : undefined, payload.cmux?.surfaceRef ? `surface ${payload.cmux.surfaceRef}` : undefined].filter(Boolean).join(" • ");
    const lines = [
        `${themeFg(theme, failed ? "warning" : "success", icon)} ${themeFg(theme, "toolTitle", toolName)} ${formatStatus(theme, status)}${handle ? themeFg(theme, "dim", ` • ${handle}`) : ""}`,
    ];
    if (payload.reason) {
        lines.push(themeFg(theme, failed ? "warning" : "muted", truncateText(payload.reason, 180)));
    }
    else if (payload.actionTaken) {
        lines.push(themeFg(theme, "muted", truncateText(String(payload.actionTaken), 180)));
    }
    if (payload.delivery?.fileBacked) {
        lines.push(themeFg(theme, "accent", `file-backed delivery: ${shortenMiddle(payload.delivery.packetPath ?? "packet", 100)}`));
    }
    if (payload.snapshot?.screenPath) {
        lines.push(themeFg(theme, "accent", `screen snapshot saved: ${shortenMiddle(payload.snapshot.screenPath, 100)}`));
    }
    if (payload.code === "not_implemented_until_P4" || status === "lifecycle_pending") {
        lines.push(themeFg(theme, "warning", "lifecycle pending until P4; no pane action was attempted"));
    }
    if (!expanded) {
        lines.push(themeFg(theme, "dim", "ctrl+o to expand delegation details and evidence pointers"));
        return textComponent(lines.join("\n"));
    }
    lines.push("", themeFg(theme, "toolTitle", "Delegation"));
    pushField(lines, theme, "operation", payload.operation);
    pushField(lines, theme, "status", status);
    pushField(lines, theme, "code", payload.code);
    pushField(lines, theme, "task", payload.taskId);
    pushField(lines, theme, "agent", payload.agentId);
    pushField(lines, theme, "role/profile", [payload.role, payload.profile].filter(Boolean).join(" / "));
    pushField(lines, theme, "action taken", payload.actionTaken);
    if (payload.cmux) {
        lines.push("", themeFg(theme, "toolTitle", "cmux"));
        pushField(lines, theme, "window", payload.cmux.windowRef);
        pushField(lines, theme, "workspace", payload.cmux.workspaceRef);
        pushField(lines, theme, "pane", payload.cmux.paneRef);
        pushField(lines, theme, "surface", payload.cmux.surfaceRef);
    }
    if (payload.policy) {
        lines.push("", themeFg(theme, "toolTitle", "Scope and policy"));
        pushField(lines, theme, "write scope", listText(payload.policy.writeScope));
        pushField(lines, theme, "allowed commands", listText(payload.policy.allowedCommands));
        pushField(lines, theme, "tools", listText(payload.policy.tools));
    }
    if (payload.delivery) {
        lines.push("", themeFg(theme, "toolTitle", "Delivery"));
        pushField(lines, theme, "kind", payload.delivery.kind);
        pushField(lines, theme, "file-backed", String(Boolean(payload.delivery.fileBacked)));
        pushField(lines, theme, "packet", payload.delivery.packetPath);
        if (payload.delivery.instruction) {
            pushField(lines, theme, "instruction", truncateText(payload.delivery.instruction, 220));
        }
    }
    if (payload.snapshot) {
        lines.push("", themeFg(theme, "toolTitle", "Capture"));
        pushField(lines, theme, "screen", payload.snapshot.screenPath);
        pushField(lines, theme, "captured at", payload.snapshot.capturedAt);
        pushField(lines, theme, "lines", payload.snapshot.capturedLines !== undefined ? `${payload.snapshot.capturedLines} captured / ${payload.snapshot.linesRequested} requested` : undefined);
        pushField(lines, theme, "bytes", payload.snapshot.bytes);
        lines.push(`  ${themeFg(theme, "dim", "raw screen is stored in screen.log; normal renderer does not dump it")}`);
    }
    if (payload.preflight) {
        lines.push("", themeFg(theme, payload.preflight.ok ? "toolTitle" : "warning", payload.preflight.ok ? "Preflight" : "Delegation unavailable"));
        pushField(lines, theme, "status", payload.preflight.status);
        pushField(lines, theme, "reason", payload.preflight.reason);
        pushField(lines, theme, "action taken", payload.preflight.actionTaken);
        if (Array.isArray(payload.preflight.checks)) {
            for (const check of payload.preflight.checks) {
                lines.push(`  ${themeFg(theme, check.status === "ok" ? "accent" : "warning", check.name)} ${themeFg(theme, "muted", check.status)} — ${truncateText(check.message, 160)}`);
            }
        }
        if (Array.isArray(payload.preflight.safeRoutes)) {
            lines.push(`  ${themeFg(theme, "muted", "safe routes:")} ${payload.preflight.safeRoutes.join(", ")}`);
        }
    }
    if (payload.safeRoutes && !payload.preflight) {
        lines.push("", themeFg(theme, "toolTitle", "Safe routes"));
        for (const route of payload.safeRoutes) {
            lines.push(`  ${themeFg(theme, "accent", route)}`);
        }
    }
    if (payload.paths) {
        lines.push("", themeFg(theme, "toolTitle", "Evidence paths"));
        for (const [key, value] of Object.entries(payload.paths)) {
            if (typeof value === "string") {
                lines.push(`  ${themeFg(theme, "muted", `${key}:`)} ${themeFg(theme, "accent", shortenMiddle(value, 120))}`);
            }
        }
    }
    if (payload.task || payload.agentStatus || payload.registry) {
        lines.push("", themeFg(theme, "toolTitle", "Stored state"));
        if (payload.task)
            pushField(lines, theme, "task state", `${payload.task.state}${payload.task.goal ? ` — ${payload.task.goal}` : ""}`);
        if (payload.agentStatus)
            pushField(lines, theme, "agent state", `${payload.agentStatus.state}${payload.agentStatus.message ? ` — ${payload.agentStatus.message}` : ""}`);
        if (payload.registry?.agents)
            pushField(lines, theme, "agents", payload.registry.agents.map((agent) => `${agent.agentId}:${agent.state}`).join(", "));
    }
    if (payload.unreadParentAlerts) {
        lines.push("", themeFg(theme, "toolTitle", "Deferred lifecycle"));
        pushField(lines, theme, "alerts", `${payload.unreadParentAlerts.status} (${payload.unreadParentAlerts.code})`);
    }
    lines.push("", themeFg(theme, "dim", "No raw transcript or full screen dump is rendered here; use evidence paths for recovery."));
    return textComponent(lines.join("\n"));
}
function pushField(lines, theme, label, value) {
    if (value === undefined || value === null || String(value).length === 0) {
        return;
    }
    lines.push(`  ${themeFg(theme, "muted", `${label}:`)} ${themeFg(theme, "accent", truncateText(String(value), 220))}`);
}
function listText(value) {
    if (!Array.isArray(value)) {
        return typeof value === "string" ? value : undefined;
    }
    return value.length > 0 ? value.join(", ") : "none";
}

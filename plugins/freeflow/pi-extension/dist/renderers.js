import { extractTextContent, formatStatus, oneLine, shortenMiddle, splitLines, statusIcon, textComponent, themeBold, themeFg, truncateText, } from "./utils.js";
export function commandLabel(command) {
    if (Array.isArray(command)) {
        return truncateText(command.join(" "), 120);
    }
    return truncateText(command ?? "...", 120);
}
export function captureProducerLabel(producer) {
    if (!producer || typeof producer !== "object") {
        return "producer";
    }
    if (producer.kind === "mcp") {
        const server = producer.server ? `${producer.server}` : "mcp";
        const tool = producer.tool ? `/${producer.tool}` : "";
        return `${server}${tool}`;
    }
    return [producer.kind, producer.adapter, producer.name, producer.server, producer.tool].filter(Boolean).join(":") || "producer";
}
function retrieveSourceLabel(source) {
    if (!source || source.kind === "repo") {
        return `repo ${shortenMiddle(source?.path ?? ".", 80)}`;
    }
    if (source.kind === "vault") {
        const stream = source.stream ? `:${source.stream}` : "";
        return `vault ${shortenMiddle(source.outputId ?? "...", 48)}${stream}`;
    }
    return oneLine(source.kind ?? "source");
}
function evidenceLabel(evidence) {
    if (!evidence) {
        return "no evidence";
    }
    const source = evidence.source;
    const path = evidence.path ?? (source?.kind === "repo" ? source.path : source?.kind === "vault" ? source.outputId : "evidence");
    const lines = evidence.lines ? `:${evidence.lines}` : "";
    return `${shortenMiddle(path, 90)}${lines}`;
}
function excerptLines(theme, excerpt, indent = "  ", maxLines = 8) {
    const lines = splitLines(String(excerpt ?? ""));
    const shown = lines.slice(0, maxLines).map((line) => `${indent}${themeFg(theme, "toolOutput", truncateText(line, 140))}`);
    const omitted = lines.length - shown.length;
    if (omitted > 0) {
        shown.push(`${indent}${themeFg(theme, "dim", `… ${omitted} more line(s)`)}`);
    }
    return shown;
}
function routeSummaryLine(theme, result) {
    const route = result?.routing?.status ?? "unknown";
    const preserve = result?.preserve ? ` • preserve: ${result.preserve}` : "";
    return `${themeFg(theme, "muted", "routing:")} ${formatStatus(theme, route)}${themeFg(theme, "dim", preserve)}`;
}
function routerResultFromToolResult(result) {
    return result?.details?.result;
}
function fallbackResultText(result) {
    const text = extractTextContent(result?.content);
    return text ? truncateText(text, 200) : "No Freeflow result details available.";
}
export function renderFreeflowRetrieveCall(args, theme) {
    const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_retrieve"));
    const action = themeFg(theme, "muted", args?.action ?? "query");
    const source = themeFg(theme, "accent", retrieveSourceLabel(args?.source));
    const query = args?.query ? ` ${themeFg(theme, "dim", `\"${truncateText(args.query, 70)}\"`)}` : "";
    return textComponent(`${title} ${action} ${source}${query}`);
}
export function renderFreeflowRunCall(args, theme) {
    const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_run"));
    const command = themeFg(theme, "accent", `$ ${commandLabel(args?.command)}`);
    const extras = [];
    if (args?.preserve) {
        extras.push(`preserve=${args.preserve}`);
    }
    if (args?.timeoutMs !== undefined) {
        extras.push(`timeout=${args.timeoutMs}ms`);
    }
    const suffix = extras.length > 0 ? ` ${themeFg(theme, "dim", `(${extras.join(", ")})`)}` : "";
    return textComponent(`${title} ${command}${suffix}`);
}
export function renderFreeflowCaptureCall(args, theme) {
    const title = themeFg(theme, "toolTitle", themeBold(theme, "freeflow_capture"));
    const producer = themeFg(theme, "accent", captureProducerLabel(args?.producer));
    const preserve = args?.preserve ? ` ${themeFg(theme, "dim", `(preserve=${args.preserve})`)}` : "";
    return textComponent(`${title} ${producer}${preserve}`);
}
export function renderFreeflowRetrieveResult(result, { expanded } = {}, theme) {
    const routed = routerResultFromToolResult(result);
    if (!routed) {
        return textComponent(fallbackResultText(result));
    }
    const evidence = Array.isArray(routed.evidence) ? routed.evidence : [];
    const firstEvidence = evidence[0];
    const icon = statusIcon(routed.toolStatus);
    const lines = [
        `${themeFg(theme, "success", icon)} ${themeFg(theme, "toolTitle", "freeflow_retrieve")} ${themeFg(theme, "muted", `${evidence.length} evidence packet(s)`)} • ${routeSummaryLine(theme, routed)}`,
    ];
    if (firstEvidence) {
        lines.push(`${themeFg(theme, "accent", evidenceLabel(firstEvidence))}${firstEvidence.expandable ? themeFg(theme, "dim", " • expandable") : ""}`);
    }
    else {
        lines.push(themeFg(theme, "warning", truncateText(routed.routing?.reason ?? "No matching evidence returned.", 140)));
    }
    if (!expanded) {
        lines.push(themeFg(theme, "dim", "ctrl+o to expand evidence and recovery details"));
        return textComponent(lines.join("\n"));
    }
    lines.push("", themeFg(theme, "toolTitle", "Routing"));
    lines.push(`  ${themeFg(theme, "muted", "toolStatus:")} ${formatStatus(theme, routed.toolStatus)}`);
    lines.push(`  ${themeFg(theme, "muted", "routing.status:")} ${formatStatus(theme, routed.routing?.status)}`);
    lines.push(`  ${themeFg(theme, "muted", "route:")} ${routed.routing?.route ?? "retrieve"}`);
    if (routed.routing?.reason) {
        lines.push(`  ${themeFg(theme, "muted", "reason:")} ${truncateText(routed.routing.reason, 160)}`);
    }
    lines.push("", themeFg(theme, "toolTitle", "Evidence"));
    if (evidence.length === 0) {
        lines.push(`  ${themeFg(theme, "dim", "No evidence packets returned.")}`);
    }
    else {
        evidence.forEach((packet, index) => {
            lines.push(`  ${themeFg(theme, "accent", `#${index + 1} ${evidenceLabel(packet)}`)} ${themeFg(theme, "dim", `window=${packet.window}`)}`);
            if (packet.why) {
                lines.push(`    ${themeFg(theme, "muted", "why:")} ${truncateText(packet.why, 160)}`);
            }
            lines.push(...excerptLines(theme, packet.excerpt, "    ", 8));
        });
    }
    if (routed.recovery?.how) {
        lines.push("", themeFg(theme, "toolTitle", "Recovery"));
        lines.push(`  ${truncateText(routed.recovery.how, 180)}`);
        if (routed.recovery.outputId) {
            lines.push(`  ${themeFg(theme, "muted", "outputId:")} ${themeFg(theme, "accent", routed.recovery.outputId)}`);
        }
        if (routed.recovery.evidenceId) {
            lines.push(`  ${themeFg(theme, "muted", "evidenceId:")} ${themeFg(theme, "accent", routed.recovery.evidenceId)}`);
        }
    }
    return textComponent(lines.join("\n"));
}
export function renderFreeflowRunResult(result, { expanded } = {}, theme, context = {}) {
    const routed = routerResultFromToolResult(result);
    if (!routed) {
        return textComponent(fallbackResultText(result));
    }
    const executionStatus = routed.execution?.status ?? routed.toolStatus;
    const outputId = routed.outputId || routed.recovery?.outputId;
    const icon = statusIcon(executionStatus);
    const importantLines = Array.isArray(routed.importantLines) ? routed.importantLines : [];
    const lines = [
        `${themeFg(theme, executionStatus === "failed" ? "error" : "success", icon)} ${themeFg(theme, "toolTitle", "freeflow_run")} ${themeFg(theme, "muted", "execution:")} ${formatStatus(theme, executionStatus)} • ${routeSummaryLine(theme, routed)}`,
    ];
    const statusParts = [];
    if (routed.execution?.exitCode !== undefined && routed.execution?.exitCode !== null) {
        statusParts.push(`exit ${routed.execution.exitCode}`);
    }
    if (routed.execution?.durationMs !== undefined) {
        statusParts.push(`${routed.execution.durationMs}ms`);
    }
    if (outputId) {
        statusParts.push(`outputId ${outputId}`);
    }
    if (routed.parser?.name) {
        statusParts.push(`parser ${routed.parser.name} ${Number(routed.parser.confidence ?? 0).toFixed(2)}`);
    }
    if (statusParts.length > 0) {
        lines.push(themeFg(theme, "accent", statusParts.join(" • ")));
    }
    if (routed.summary) {
        lines.push(themeFg(theme, "muted", truncateText(routed.summary, 140)));
    }
    lines.push(themeFg(theme, "dim", `${importantLines.length} important span(s) • raw output recoverable from vault`));
    if (!expanded) {
        lines.push(themeFg(theme, "dim", "ctrl+o to expand status, evidence, and vault recovery"));
        return textComponent(lines.join("\n"));
    }
    lines.push("", themeFg(theme, "toolTitle", "Command"));
    lines.push(`  ${themeFg(theme, "accent", `$ ${commandLabel(context.args?.command)}`)}`);
    lines.push("", themeFg(theme, "toolTitle", "Status"));
    lines.push(`  ${themeFg(theme, "muted", "toolStatus:")} ${formatStatus(theme, routed.toolStatus)}`);
    lines.push(`  ${themeFg(theme, "muted", "execution.status:")} ${formatStatus(theme, routed.execution?.status)}`);
    lines.push(`  ${themeFg(theme, "muted", "routing.status:")} ${formatStatus(theme, routed.routing?.status)}`);
    if (routed.execution?.exitCode !== undefined) {
        lines.push(`  ${themeFg(theme, "muted", "exitCode:")} ${routed.execution.exitCode}`);
    }
    if (routed.execution?.durationMs !== undefined) {
        lines.push(`  ${themeFg(theme, "muted", "durationMs:")} ${routed.execution.durationMs}`);
    }
    if (routed.routing?.reason || routed.summary) {
        lines.push("", themeFg(theme, "toolTitle", "Routing"));
        if (routed.summary) {
            lines.push(`  ${themeFg(theme, "muted", "summary:")} ${truncateText(routed.summary, 160)}`);
        }
        if (routed.routing?.reason) {
            lines.push(`  ${themeFg(theme, "muted", "reason:")} ${truncateText(routed.routing.reason, 180)}`);
        }
    }
    if (routed.parser?.name) {
        lines.push("", themeFg(theme, "toolTitle", "Parser"));
        lines.push(`  ${themeFg(theme, "muted", "name:")} ${routed.parser.name}`);
        lines.push(`  ${themeFg(theme, "muted", "confidence:")} ${Number(routed.parser.confidence ?? 0).toFixed(2)}`);
        lines.push(`  ${themeFg(theme, "muted", "fidelity:")} ${routed.parser.fidelity ?? "exact"}`);
        lines.push(`  ${themeFg(theme, "muted", "compressed:")} ${String(Boolean(routed.parser.compressed))}`);
        if (routed.parser.counts && Object.keys(routed.parser.counts).length > 0) {
            lines.push(`  ${themeFg(theme, "muted", "counts:")} ${truncateText(JSON.stringify(routed.parser.counts), 160)}`);
        }
        if (Array.isArray(routed.parser.references) && routed.parser.references.length > 0) {
            const refs = routed.parser.references.slice(0, 3).map((ref) => `${ref.path}${ref.line ? `:${ref.line}${ref.column ? `:${ref.column}` : ""}` : ""}${ref.code ? ` ${ref.code}` : ""}`);
            lines.push(`  ${themeFg(theme, "muted", "references:")} ${truncateText(refs.join(", "), 180)}`);
        }
    }
    lines.push("", themeFg(theme, "toolTitle", "Evidence"));
    if (importantLines.length === 0) {
        lines.push(`  ${themeFg(theme, "dim", "No important lines selected.")}`);
    }
    else {
        importantLines.forEach((line, index) => {
            lines.push(`  ${themeFg(theme, "accent", `#${index + 1} ${line.stream} lines ${line.lines}`)}`);
            lines.push(...excerptLines(theme, line.excerpt, "    ", 8));
        });
    }
    if (routed.recovery?.how || outputId) {
        lines.push("", themeFg(theme, "toolTitle", "Vault recovery"));
        if (outputId) {
            lines.push(`  ${themeFg(theme, "muted", "outputId:")} ${themeFg(theme, "accent", outputId)}`);
        }
        if (routed.recovery?.how) {
            lines.push(`  ${truncateText(routed.recovery.how, 180)}`);
        }
    }
    return textComponent(lines.join("\n"));
}
export function renderFreeflowCaptureResult(result, { expanded } = {}, theme) {
    const routed = routerResultFromToolResult(result);
    if (!routed) {
        return textComponent(fallbackResultText(result));
    }
    const outputId = routed.outputId || routed.recovery?.outputId;
    const failed = routed.failure || routed.toolStatus === "error" || routed.routing?.status === "failed";
    const icon = failed ? "✗" : statusIcon(routed.toolStatus);
    const evidence = Array.isArray(routed.evidence) ? routed.evidence : [];
    const lines = [
        `${themeFg(theme, failed ? "error" : "success", icon)} ${themeFg(theme, "toolTitle", "freeflow_capture")} ${themeFg(theme, "accent", captureProducerLabel(routed.producer))} • ${routeSummaryLine(theme, routed)}`,
    ];
    const statusParts = [];
    if (outputId) {
        statusParts.push(`outputId ${outputId}`);
    }
    if (routed.recordId) {
        statusParts.push(`recordId ${routed.recordId}`);
    }
    if (routed.persistence?.status) {
        statusParts.push(`persistence ${routed.persistence.status}/${routed.persistence.recoverability}`);
    }
    if (statusParts.length > 0) {
        lines.push(themeFg(theme, "accent", statusParts.join(" • ")));
    }
    if (routed.failure?.message) {
        lines.push(themeFg(theme, "warning", `${routed.failure.kind}: ${truncateText(routed.failure.message, 140)}`));
    }
    else if (routed.summary) {
        lines.push(themeFg(theme, "muted", truncateText(routed.summary, 140)));
    }
    lines.push(themeFg(theme, "dim", `${evidence.length} evidence packet(s)${outputId ? " • raw capture recoverable from vault" : ""}`));
    if (!expanded) {
        lines.push(themeFg(theme, "dim", "ctrl+o to expand producer, evidence, and recovery details"));
        return textComponent(lines.join("\n"));
    }
    lines.push("", themeFg(theme, "toolTitle", "Status"));
    lines.push(`  ${themeFg(theme, "muted", "toolStatus:")} ${formatStatus(theme, routed.toolStatus)}`);
    if (routed.producerExecution?.status) {
        lines.push(`  ${themeFg(theme, "muted", "producerExecution.status:")} ${formatStatus(theme, routed.producerExecution.status)}`);
    }
    lines.push(`  ${themeFg(theme, "muted", "routing.status:")} ${formatStatus(theme, routed.routing?.status)}`);
    if (routed.persistence?.status) {
        lines.push(`  ${themeFg(theme, "muted", "persistence:")} ${routed.persistence.status} / ${routed.persistence.recoverability}`);
    }
    if (routed.routing?.reason) {
        lines.push(`  ${themeFg(theme, "muted", "reason:")} ${truncateText(routed.routing.reason, 180)}`);
    }
    lines.push("", themeFg(theme, "toolTitle", "Evidence"));
    if (evidence.length === 0) {
        lines.push(`  ${themeFg(theme, "dim", "No evidence packets returned.")}`);
    }
    else {
        evidence.forEach((packet, index) => {
            lines.push(`  ${themeFg(theme, "accent", `#${index + 1} ${evidenceLabel(packet)}`)} ${themeFg(theme, "dim", `window=${packet.window}`)}`);
            if (packet.why) {
                lines.push(`    ${themeFg(theme, "muted", "why:")} ${truncateText(packet.why, 160)}`);
            }
            lines.push(...excerptLines(theme, packet.excerpt, "    ", 8));
        });
    }
    if (routed.recovery?.how || outputId) {
        lines.push("", themeFg(theme, "toolTitle", "Recovery"));
        if (outputId) {
            lines.push(`  ${themeFg(theme, "muted", "outputId:")} ${themeFg(theme, "accent", outputId)}`);
        }
        if (routed.recovery?.how) {
            lines.push(`  ${truncateText(routed.recovery.how, 180)}`);
        }
    }
    return textComponent(lines.join("\n"));
}

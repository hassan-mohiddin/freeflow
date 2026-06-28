export function renderProcessingResult(input) {
    const lines = input.status === "ok" ? renderOkLines(input) : renderFailureLines(input);
    return truncateVisible(lines.join("\n"), input.maxVisibleBytes, requiredVisiblePrefix(input));
}
export function classifyProcessingRecovery(input) {
    if (input.resultWillBePersisted) {
        return "exact-result";
    }
    if (input.persistence?.recoverability === "exact") {
        return "exact-result";
    }
    if (input.persistence?.recoverability === "metadata_only") {
        return "metadata-only";
    }
    if (input.recovery?.outputId) {
        return "exact-source";
    }
    if (input.recovery?.how) {
        return "hint-only";
    }
    return "none";
}
function requiredVisiblePrefix(input) {
    return input.script && "policy" in input.script && input.script.policy === "unsafe-unsandboxed"
        ? processingScriptPolicyLine(input.script)
        : "";
}
function renderOkLines(input) {
    const recoveryClass = recoveryClassForInput(input);
    const scriptLines = scriptOutputLines(input.script);
    const visibleFacts = scriptLines.length > 0 ? scriptLines : visibleFactLines(input.facts, input.reducer);
    const policyLine = processingScriptPolicyLine(input.script);
    const unsafeScriptRequested = input.script && "policy" in input.script && input.script.policy === "unsafe-unsandboxed";
    const lines = unsafeScriptRequested && policyLine
        ? [policyLine, ...(visibleFacts.length > 0 ? visibleFacts : [`status: ${input.status}`])]
        : (visibleFacts.length > 0 ? visibleFacts : [`status: ${input.status}`]);
    lines.push(`source: ${sourcePointer(input.source, input.stats)}`);
    lines.push(`recovery: ${recoveryClass}`);
    if (!unsafeScriptRequested && policyLine) {
        lines.push(policyLine);
    }
    if (input.reducer?.status === "selected") {
        lines.push(`reducer: ${input.reducer.selected.name}@${input.reducer.selected.version} confidence=${input.reducer.selected.confidence.toFixed(2)}`);
    }
    return lines;
}
function renderFailureLines(input) {
    const lines = [`status: ${input.status}`];
    if (input.failure?.policy) {
        lines.push(`policy: ${input.failure.policy}`);
    }
    if (input.failure?.reason) {
        lines.push(`reason: ${oneLine(input.failure.reason, 240)}`);
    }
    lines.push(`source: ${sourcePointer(input.source, input.stats)}`);
    lines.push(`recovery: ${recoveryClassForInput(input)}`);
    return lines;
}
function recoveryClassForInput(input) {
    if (input.recoveryClass !== undefined) {
        return input.recoveryClass;
    }
    return classifyProcessingRecovery({
        ...(input.recovery !== undefined ? { recovery: input.recovery } : {}),
        ...(input.persistence !== undefined ? { persistence: input.persistence } : {}),
    });
}
function processingScriptPolicyLine(script) {
    if (script?.status === "executed" && script.policy === "unsafe-unsandboxed") {
        return `script: ${script.language} unsafe/unsandboxed local-yolo`;
    }
    if (script?.status === "executed") {
        return `script: ${script.language} sandboxed adapter=${script.adapterId}`;
    }
    if (script?.status === "rejected") {
        return `script: rejected unsafe/unsandboxed; no execution`;
    }
    if (script?.status === "unavailable") {
        return script.policy === "unsafe-unsandboxed"
            ? "script: unsafe/unsandboxed unavailable; no execution"
            : "script: unavailable; reducer fallback; no host fallback";
    }
    if (script?.status === "failed") {
        return script.policy === "unsafe-unsandboxed"
            ? "script: failed unsafe/unsandboxed; detail omitted"
            : "script: failed; no host fallback";
    }
    return "";
}
function scriptOutputLines(script) {
    if (script?.status !== "executed") {
        return [];
    }
    const lines = script.outputText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length > 0) {
        return lines;
    }
    return [`script.stdoutBytes: ${script.stdoutBytes}`];
}
function visibleFactLines(facts, reducer) {
    const sourceFactsHidden = reducer?.status === "selected";
    const lines = [];
    const statusFacts = [];
    for (const fact of facts) {
        if (sourceFactsHidden && fact.name.startsWith("source.")) {
            continue;
        }
        if (fact.name.startsWith("status.")) {
            statusFacts.push([fact.name.slice("status.".length), fact.value]);
            continue;
        }
        lines.push(`${fact.name}: ${fact.value}`);
    }
    if (statusFacts.length > 0) {
        lines.push(`status: ${statusFacts.map(([status, value]) => `${status}:${value}`).join(", ")}`);
    }
    return lines;
}
function sourcePointer(source, stats) {
    const base = sourceRefLabel(source.ref, source.displayPath, source.stream);
    if (!stats) {
        return base;
    }
    return `${base} (${formatBytes(stats.bytes)}, ${stats.lines} lines)`;
}
function sourceRefLabel(source, displayPath, stream) {
    if (source.kind === "repo") {
        return `repo ${shortenMiddle(source.path || displayPath, 90)}`;
    }
    if (source.kind === "vault") {
        const selectedStream = stream ?? source.stream;
        return `vault ${shortenMiddle(source.outputId, 48)}${selectedStream ? `:${selectedStream}` : ""}`;
    }
    return `${source.tool} ${shortenMiddle(source.outputId || displayPath, 64)}${stream ? `:${stream}` : ""}`;
}
function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    if (bytes < 1024 * 1024) {
        return `${round(bytes / 1024)}KB`;
    }
    return `${round(bytes / (1024 * 1024))}MB`;
}
function round(value) {
    return Math.round(value * 10) / 10;
}
function oneLine(text, maxChars) {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars - 1)}…`;
}
function shortenMiddle(text, maxChars) {
    if (text.length <= maxChars) {
        return text;
    }
    const keep = Math.max(4, Math.floor((maxChars - 1) / 2));
    return `${text.slice(0, keep)}…${text.slice(text.length - keep)}`;
}
function truncateVisible(text, maxBytes, requiredPrefix = "") {
    if (byteLength(text) <= maxBytes) {
        return text;
    }
    const marker = "\n… [truncated]";
    if (requiredPrefix && text.startsWith(requiredPrefix)) {
        const remainder = text.slice(requiredPrefix.length).replace(/^\n/, "");
        const minimum = `${requiredPrefix}${marker}`;
        if (byteLength(minimum) >= maxBytes) {
            return minimum;
        }
        const available = maxBytes - byteLength(requiredPrefix) - byteLength(marker) - 1;
        let end = Math.max(0, Math.min(remainder.length, available));
        while (end > 0 && byteLength(remainder.slice(0, end)) > available) {
            end -= 1;
        }
        const body = remainder.slice(0, end);
        return body ? `${requiredPrefix}\n${body}${marker}` : minimum;
    }
    let end = Math.min(text.length, maxBytes);
    while (end > 0 && byteLength(text.slice(0, end)) > maxBytes) {
        end -= 1;
    }
    return `${text.slice(0, end)}${marker}`;
}
function byteLength(text) {
    return Buffer.byteLength(text, "utf8");
}

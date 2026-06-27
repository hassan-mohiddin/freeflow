import { byteLength, countLines } from "../evidence/evidence.js";
import { selectProcessingReducer } from "../processing/reducers.js";
export function selectRunReducerRoute(options) {
    if (options.preserve === "full") {
        return { status: "not_selected", reason: "preserve=full requires exact command output routing." };
    }
    if (options.executionStatus !== "success") {
        return { status: "not_selected", reason: "command did not succeed; preserve parser-selected failure evidence." };
    }
    if (options.hasFilters) {
        return { status: "not_selected", reason: "declarative filters already define the routed command output." };
    }
    if (options.hasScriptFilter) {
        return { status: "not_selected", reason: "scriptFilter already defines the routed command output." };
    }
    const source = reducerSourceText(options.stdout, options.stderr, options.combined);
    if (source === undefined) {
        return { status: "not_selected", reason: "mixed stdout/stderr success output stays near-raw to avoid hiding warnings." };
    }
    const selection = selectProcessingReducer({ text: source.text });
    if (selection.status !== "selected") {
        return { status: "not_selected", reason: selection.reason };
    }
    const goalText = (options.goal ?? "").toLowerCase();
    const commandTextValue = commandText(options.command).toLowerCase();
    const outputIsLarge = byteLength(source.text) > options.thresholds.largeOutputBytes || countLines(source.text) > options.thresholds.largeOutputLines;
    const intentAllowsReducer = reducerIntentAllowsSelection(goalText, commandTextValue, selection.result.name);
    const largeOutputAllowsReducer = outputIsLarge && reducerLargeOutputAllowsSelection(goalText, selection.result);
    if (!largeOutputAllowsReducer && !intentAllowsReducer) {
        return {
            status: "not_selected",
            reason: `Reducer ${selection.result.name}@${selection.result.version} matched, but neither output size nor reducer-oriented goal/command intent allowed automatic reduction.`,
        };
    }
    return {
        status: "selected",
        result: selection.result,
        sourceStream: source.stream,
        reason: `Selected ${selection.result.name}@${selection.result.version} reducer for successful command output (confidence=${selection.result.confidence.toFixed(2)}; ${largeOutputAllowsReducer ? "large output" : "goal/command intent"}).`,
    };
}
export function reducerImportantLines(route) {
    return [{
            stream: route.sourceStream,
            lines: lineRangeForText(route.result.visibleText),
            excerpt: route.result.visibleText,
        }];
}
export function parserWithReducer(parser, route) {
    return {
        ...parser,
        name: `${parser.name}+reducer:${route.result.name}`,
        confidence: Math.max(parser.confidence, route.result.confidence),
        fidelity: "exact",
        compressed: true,
        counts: {
            ...(parser.counts ?? {}),
            reducerFacts: route.result.facts.length,
        },
    };
}
function reducerSourceText(stdout, stderr, combined) {
    if (stdout.length > 0 && stderr.length === 0) {
        return { stream: "stdout", text: stdout };
    }
    if (stderr.length > 0 && stdout.length === 0) {
        return { stream: "stderr", text: stderr };
    }
    if (stdout.length === 0 && stderr.length === 0 && combined.length > 0) {
        return { stream: "combined", text: combined };
    }
    return undefined;
}
function reducerIntentAllowsSelection(goalText, commandTextValue, reducerName) {
    switch (reducerName) {
        case "test-output":
            return /\b(test|tests|vitest|jest|pytest)\b/.test(goalText);
        case "diagnostics":
            return /\b(typecheck|type-check|tsc|lint|eslint|diagnostic)\b/.test(goalText);
        case "build-output":
            return /\b(build|compile|bundle|next)\b/.test(goalText);
        case "access-log":
            return /\b(log|logs|access|nginx|apache)\b/.test(goalText);
        case "table":
            return /\b(csv|json|table|analytics)\b/.test(goalText);
        case "mcp-tools":
            return /\b(mcp|tools?|schema|signatures?)\b/.test(goalText);
        case "browser-snapshot":
            return /\b(browser|snapshot|playwright|accessibility|dom)\b/.test(goalText);
        case "git-log":
            return /\b(git\s+log|commits?|history|changelog)\b/.test(goalText) || /\bgit\s+log\b/.test(commandTextValue);
        default:
            return false;
    }
}
function reducerLargeOutputAllowsSelection(goalText, result) {
    if (result.name === "table" && result.details.kind === "table" && result.details.format === "json") {
        return /\b(json|csv|table|analytics)\b/.test(goalText);
    }
    return true;
}
function lineRangeForText(text) {
    const lines = Math.max(1, countLines(text));
    return `1-${lines}`;
}
function commandText(command) {
    return typeof command === "string" ? command : command.join(" ");
}

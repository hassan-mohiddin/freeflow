import { createHash } from "node:crypto";
export function stableHash(value) {
    return createHash("sha256").update(value).digest("hex");
}
export function getRouterSessionId(ctx) {
    return ctx.sessionManager?.getSessionId?.() ?? `pi_${stableHash(ctx.cwd).slice(0, 16)}`;
}
export function routedToolText(result) {
    return JSON.stringify(result, null, 2);
}
export function textComponent(text) {
    return {
        render(width = 120) {
            const maxWidth = Number.isFinite(width) ? Math.max(1, width) : 120;
            return String(text).split("\n").map((line) => truncateAnsiToWidth(line, maxWidth));
        },
        invalidate() { },
    };
}
function truncateAnsiToWidth(input, width) {
    const text = String(input);
    let output = "";
    let visible = 0;
    for (let index = 0; index < text.length;) {
        const ansi = readAnsiSequence(text, index);
        if (ansi) {
            output += ansi.sequence;
            index = ansi.end;
            continue;
        }
        if (visible >= width - 1) {
            output += "…";
            return output;
        }
        const codePoint = text.codePointAt(index);
        const character = String.fromCodePoint(codePoint);
        output += character;
        visible += 1;
        index += character.length;
    }
    return output;
}
function readAnsiSequence(text, index) {
    if (text.charCodeAt(index) !== 0x1b) {
        return null;
    }
    const next = text[index + 1];
    if (next === "[") {
        let end = index + 2;
        while (end < text.length && !/[\x40-\x7e]/.test(text[end])) {
            end += 1;
        }
        return { sequence: text.slice(index, Math.min(end + 1, text.length)), end: Math.min(end + 1, text.length) };
    }
    if (next === "]") {
        const bellEnd = text.indexOf("\x07", index + 2);
        const stEnd = text.indexOf("\x1b\\", index + 2);
        const candidates = [bellEnd, stEnd === -1 ? -1 : stEnd + 1].filter((value) => value !== -1);
        const end = candidates.length > 0 ? Math.min(...candidates) + 1 : text.length;
        return { sequence: text.slice(index, end), end };
    }
    return { sequence: text.slice(index, Math.min(index + 2, text.length)), end: Math.min(index + 2, text.length) };
}
export function themeFg(theme, color, text) {
    return typeof theme?.fg === "function" ? theme.fg(color, text) : text;
}
export function themeBold(theme, text) {
    return typeof theme?.bold === "function" ? theme.bold(text) : text;
}
export function formatStatus(theme, status) {
    const text = String(status ?? "unknown");
    if (text === "ok" || text === "success" || text === "routed" || text === "passed_through") {
        return themeFg(theme, "success", text);
    }
    if (text === "error" || text === "failed") {
        return themeFg(theme, "error", text);
    }
    return themeFg(theme, "warning", text);
}
export function statusIcon(status) {
    if (status === "success" || status === "ok") {
        return "✓";
    }
    if (status === "failed" || status === "error") {
        return "✗";
    }
    return "!";
}
export function oneLine(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}
export function truncateText(value, maxLength = 120) {
    const text = oneLine(value);
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}
export function shortenMiddle(value, maxLength = 80) {
    const text = oneLine(value);
    if (text.length <= maxLength) {
        return text;
    }
    if (maxLength <= 5) {
        return text.slice(0, maxLength);
    }
    const keep = maxLength - 1;
    const head = Math.ceil(keep * 0.45);
    const tail = Math.floor(keep * 0.55);
    return `${text.slice(0, head)}…${text.slice(-tail)}`;
}
export function byteLength(text) {
    return Buffer.byteLength(text, "utf8");
}
export function splitLines(text) {
    if (text.length === 0) {
        return [];
    }
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}
export function extractTextContent(content) {
    if (!Array.isArray(content) || content.length === 0) {
        return null;
    }
    if (!content.every((part) => part?.type === "text" && typeof part.text === "string")) {
        return null;
    }
    return content.map((part) => part.text).join("\n");
}

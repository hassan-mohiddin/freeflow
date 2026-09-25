import { isFreeflowContextToolName } from "./types.js";
import type { ProjectedContextSource, ResolvedContextEntry, SourceProjectionOutcome } from "./types.js";

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const value = block as Record<string, unknown>;
    if (value.type === "text" && typeof value.text === "string") {
      parts.push(value.text);
    } else if (value.type === "image" && typeof value.mimeType === "string") {
      parts.push(`[image:${value.mimeType}]`);
    }
  }
  return parts.join("\n");
}

function timestampFor(source: ResolvedContextEntry): string {
  const value = source.entry?.timestamp ?? source.message?.timestamp;
  const timestamp = typeof value === "string" || typeof value === "number" ? new Date(value) : new Date(0);
  return Number.isNaN(timestamp.getTime()) ? new Date(0).toISOString() : timestamp.toISOString();
}

function invalid(reason: string): SourceProjectionOutcome {
  return { status: "invalid", reason };
}

function toolCallParts(
  content: unknown,
): { status: "ok"; text: string; names: string[] } | { status: "invalid"; reason: string } {
  if (!Array.isArray(content)) return { status: "ok", text: "", names: [] };
  const parts: string[] = [];
  const names: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const value = block as Record<string, unknown>;
    if (value.type !== "toolCall" && value.type !== "tool_use") continue;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!name) return { status: "invalid", reason: "tool_name_missing" };
    if (name === "freeflow_context") continue;
    if (name.length > 128) return { status: "invalid", reason: "tool_name_too_long" };
    const args = value.arguments ?? value.input;
    let renderedArgs = "";
    if (args !== undefined) {
      try {
        const serialized = JSON.stringify(args);
        if (serialized === undefined) return { status: "invalid", reason: "tool_arguments_unserializable" };
        renderedArgs = `\n${serialized}`;
      } catch {
        return { status: "invalid", reason: "tool_arguments_unserializable" };
      }
    }
    names.push(name);
    parts.push(`Tool call: ${name}${renderedArgs}`);
  }
  return { status: "ok", text: parts.join("\n"), names };
}

export function projectContextSource(source: ResolvedContextEntry): SourceProjectionOutcome {
  if (!source.entry || !source.source.entryId) return invalid("source_id_missing");
  if (source.source.entryId.length > 256) return invalid("source_id_too_long");
  if (source.kind === "custom") return { status: "excluded", reason: "custom_source" };

  const message = source.message;
  let text = "";
  let toolNames: string[] = [];
  let isError: boolean | undefined;

  if (source.kind === "summary") {
    text = typeof source.entry.summary === "string" ? source.entry.summary : textFromContent(message?.content);
  } else if (source.kind === "toolResult") {
    if (isFreeflowContextToolName(message?.toolName)) {
      return { status: "excluded", reason: "freeflow_context_source" };
    }
    if (typeof message?.toolName !== "string" || message.toolName.trim().length === 0) {
      return invalid("tool_name_missing");
    }
    const toolName = message.toolName.trim();
    if (toolName.length > 128) return invalid("tool_name_too_long");
    text = textFromContent(message.content);
    toolNames = [toolName];
    if (typeof message.isError === "boolean") isError = message.isError;
  } else if (source.kind === "assistant") {
    const calls = toolCallParts(message?.content);
    if (calls.status === "invalid") return invalid(calls.reason);
    text = [textFromContent(message?.content), calls.text].filter(Boolean).join("\n");
    toolNames = calls.names;
  } else if (source.kind === "user") {
    text = textFromContent(message?.content);
  }

  if (!text.trim()) return { status: "excluded", reason: "empty_source" };
  const projected: ProjectedContextSource = {
    ref: `ctx:${source.source.entryId}`,
    kind: source.kind,
    text,
    timestamp: timestampFor(source).slice(0, 64),
    position: typeof source.entry.position === "number" ? source.entry.position : 0,
    ...(toolNames.length > 0 ? { toolNames: [...new Set(toolNames)] } : {}),
    ...(isError === undefined ? {} : { isError }),
    source,
  };
  return { status: "eligible", source: projected };
}

import { contextRefForEntry } from "../sources/types.js";
export function contentCharacters(content) {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((total, part) => {
    if (part?.type === "text" && typeof part.text === "string") return total + part.text.length;
    if (part?.type === "image") return total + 16;
    return total;
  }, 0);
}
export function contextMarker(source) {
  return {
    type: "text",
    text: `[context-ref: ${contextRefForEntry(source.entryId)}]`,
  };
}
export function archiveContent(source, retained) {
  const marker = `[context archived: ${contextRefForEntry(source.entryId)}]`;
  if (!retained) return marker;
  return `${marker}\n\n<retained-context>\n${retained}\n</retained-context>`;
}
export function fullContent(source, content = []) {
  return [...content, contextMarker(source)];
}
export function projectedContent(source, content, projection) {
  if (projection.mode === "archived") {
    return [{ type: "text", text: archiveContent(source, projection.retained) }];
  }
  return fullContent(source, Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }]);
}
function contentBlocks(message) {
  if (Array.isArray(message?.content)) return [...message.content];
  if (typeof message?.content === "string") return [{ type: "text", text: message.content }];
  return [];
}
function assistantToolCalls(content) {
  return content.filter((block) => {
    if (!block || typeof block !== "object") return false;
    const type = block.type;
    return type === "toolCall" || type === "tool_use";
  });
}
function projectedMessageContent(message, source, projection) {
  const original = contentBlocks(message);
  if (projection.mode === "full") return fullContent(source.source, original);
  const structural = source.kind === "assistant" ? assistantToolCalls(original) : [];
  return [...structural, { type: "text", text: archiveContent(source.source, projection.retained) }];
}
function projectedSummary(message, source, projection) {
  const value = typeof message?.summary === "string" ? message.summary : "";
  if (projection.mode === "archived") return archiveContent(source.source, projection.retained);
  return `${value}\n\n${contextMarker(source.source).text}`.trim();
}
export function projectResolvedMessage(message, source, projection) {
  const output = { ...message };
  if (source.kind === "summary" && typeof message?.summary === "string" && message?.content === undefined) {
    output.summary = projectedSummary(message, source, projection);
    return output;
  }
  output.content = projectedMessageContent(message, source, projection);
  return output;
}
export function projectToolResultMessage(message, source, projection) {
  const resolved = {
    kind: "toolResult",
    entry: { id: source.entryId },
    message,
    source,
  };
  return projectResolvedMessage(message, resolved, projection);
}
export function projectedCharacters(source, message, projection) {
  return contentCharacters(projectedContent(source, message?.content, projection));
}
export function sourceReference(source) {
  return contextRefForEntry(source.entryId);
}

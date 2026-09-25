import { CONTEXT_REF_PREFIX, contextRefForEntry, type ContextProjection, type ContextSourceIdentity } from "./types.js";

export function contentCharacters(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((total, part) => {
    if (part?.type === "text" && typeof part.text === "string") return total + part.text.length;
    if (part?.type === "image") return total + 16;
    return total;
  }, 0);
}

export function contextMarker(source: ContextSourceIdentity): { type: "text"; text: string } {
  return {
    type: "text",
    text: `[context-ref: ${contextRefForEntry(source.entryId)}]`,
  };
}

export function archiveContent(source: ContextSourceIdentity, retained?: string): string {
  const marker = `[context archived: ${contextRefForEntry(source.entryId)}]`;
  if (!retained) return marker;
  return `${marker}\n\n<retained-context>\n${retained}\n</retained-context>`;
}

export function fullContent(source: ContextSourceIdentity, content: unknown[] = []): any[] {
  return [...content, contextMarker(source)];
}

export function projectedContent(
  source: ContextSourceIdentity,
  content: unknown,
  projection: ContextProjection,
): any[] {
  if (projection.mode === "archived") {
    return [{ type: "text", text: archiveContent(source, projection.retained) }];
  }
  return fullContent(source, Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }]);
}

export function projectToolResultMessage(
  message: any,
  source: ContextSourceIdentity,
  projection: ContextProjection,
): any {
  return {
    ...message,
    content: projectedContent(source, message.content, projection),
  };
}

export function projectedCharacters(
  source: ContextSourceIdentity,
  message: any,
  projection: ContextProjection,
): number {
  return contentCharacters(projectedContent(source, message?.content, projection));
}

export function sourceReference(source: ContextSourceIdentity): string {
  return `${CONTEXT_REF_PREFIX}${source.entryId}`;
}

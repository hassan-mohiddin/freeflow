import { isWorkerProfile } from "../cognitive-routing-v2/types.js";
import { isTaskEvidence, textRef, type Sources, type Source } from "./sources.js";

export function annotateSources(
  messages: any[],
  renderedSources: Map<any, Source>,
  full: Set<string>,
  sources: Sources,
  instance: string,
): any[] {
  const annotated: any[] = [];
  for (let i = 0; i < messages.length;) {
    const group = [messages[i++]];
    while (i < messages.length && messages[i].role === "toolResult") group.push(messages[i++]);
    const rows = group.flatMap((message) => {
      const s = renderedSources.get(message);
      // Only observed routing attribution is informative; unattributed rows would repeat "unknown" on
      // every exchange, and omitting them keeps the prefix identical whether routing is on or off.
      if (!s || s.producer === "common") return [];
      const representation = full.has(s.ref) ? "full" : "structural only; omitted result bodies are not evidence";
      const selection =
        isWorkerProfile(s.producer) && isTaskEvidence(s) && full.has(s.ref)
          ? "task evidence; selection checks apply"
          : "not offered for new evidence selection";
      return [
        `${s.ref} | producer: ${s.producer} | ${s.original ? "assistant-text" : s.message.role}${s.message.toolName ? ` | ${s.message.toolName}` : ""}${s.assignmentId ? ` | assignment: ${s.assignmentId}` : ""} | ${representation} | ${selection}${!s.original && full.has(s.ref) && sources.byRef.has(textRef(s.ref)) ? ` | visible text: ${textRef(s.ref)}` : ""}`,
      ];
    });
    annotated.push(...group);
    if (rows.length)
      annotated.push({
        role: "custom",
        customType: "freeflow-routing-v2-refs",
        display: false,
        content: `Source provenance for the preceding message/exchange:\n${rows.join("\n")}`,
        details: { routingInstance: instance },
        timestamp: 0,
      });
  }
  return annotated;
}

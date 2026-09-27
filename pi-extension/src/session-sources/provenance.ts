import { isWorkerProfile } from "../cognitive-routing-v2/types.js";
import { isTaskEvidence, textRef, type Sources, type Source } from "./sources.js";

/**
 * Follow each exchange with a note naming its attributed sources. With `mergeWorkerRuns`, consecutive
 * exchanges from one worker assignment share a single note after the run. Use it only for a view that
 * never sees a run still growing, or the note would move on every appended exchange.
 */
export function annotateSources(
  messages: any[],
  renderedSources: Map<any, Source>,
  full: Set<string>,
  sources: Sources,
  instance: string,
  mergeWorkerRuns = false,
): any[] {
  const annotated: any[] = [];
  let pending: { key?: string; rows: string[]; exchanges: number } | undefined;
  const flush = () => {
    if (pending?.rows.length)
      annotated.push({
        role: "custom",
        customType: "freeflow-routing-v2-refs",
        display: false,
        content: `Source provenance for the preceding ${pending.exchanges > 1 ? "worker run" : "message/exchange"}:\n${pending.rows.join("\n")}`,
        details: { routingInstance: instance },
        timestamp: 0,
      });
    pending = undefined;
  };
  for (let i = 0; i < messages.length;) {
    const group = [messages[i++]];
    while (i < messages.length && messages[i].role === "toolResult") group.push(messages[i++]);
    const attributed: Source[] = [];
    const rows = group.flatMap((message) => {
      const s = renderedSources.get(message);
      // Only observed routing attribution is informative; unattributed rows would repeat "unknown" on
      // every exchange, and omitting them keeps the prefix identical whether routing is on or off.
      if (!s || s.producer === "common") return [];
      attributed.push(s);
      const representation = full.has(s.ref) ? "full" : "structural only; omitted result bodies are not evidence";
      const selection =
        isWorkerProfile(s.producer) && isTaskEvidence(s) && full.has(s.ref)
          ? "task evidence; selection checks apply"
          : "not offered for new evidence selection";
      return [
        `${s.ref} | producer: ${s.producer} | ${s.original ? "assistant-text" : s.message.role}${s.message.toolName ? ` | ${s.message.toolName}` : ""}${s.assignmentId ? ` | assignment: ${s.assignmentId}` : ""} | ${representation} | ${selection}${!s.original && full.has(s.ref) && sources.byRef.has(textRef(s.ref)) ? ` | visible text: ${textRef(s.ref)}` : ""}`,
      ];
    });
    const keys = new Set(attributed.map((s) => `${s.producer}\u0000${s.assignmentId ?? ""}`));
    const key =
      mergeWorkerRuns && attributed.length && keys.size === 1 && attributed.every((s) => isWorkerProfile(s.producer))
        ? [...keys][0]
        : undefined;
    if (key !== undefined && pending?.key === key) {
      annotated.push(...group);
      pending.rows.push(...rows);
      pending.exchanges++;
      continue;
    }
    flush();
    annotated.push(...group);
    pending = { key, rows, exchanges: 1 };
    if (key === undefined) flush();
  }
  flush();
  return annotated;
}

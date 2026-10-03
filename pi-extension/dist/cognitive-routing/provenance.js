import { isWorkerProfile } from "./types.js";
import { tagDerived } from "../host/projection-tags.js";
import { isTaskEvidence } from "./sources.js";
/**
 * Follow each exchange with a note naming its attributed sources. With `mergeWorkerRuns`, consecutive
 * exchanges from one worker assignment share a single note after the run. Use it only for a view that
 * never sees a run still growing, or the note would move on every appended exchange.
 */
export function annotateSources(
  messages,
  renderedSources,
  full,
  sources,
  instance,
  mergeWorkerRuns = false,
  /** Notes kept across requests by content, so an unchanged note keeps one identity and is fingerprinted once. */
  notes,
) {
  const annotated = [];
  let pending;
  const flush = () => {
    if (pending?.rows.length) {
      const content = `Source provenance for the preceding ${pending.exchanges > 1 ? "worker run" : "message/exchange"}:\n${pending.rows.join("\n")}`;
      const key = `${instance}\u0000${content}`;
      let note = notes?.get(key);
      if (!note) {
        note = {
          role: "custom",
          customType: "freeflow-routing-v2-refs",
          display: false,
          content,
          details: { routingInstance: instance },
          timestamp: 0,
        };
        if (notes) {
          tagDerived(note, `refs:${key}`);
          notes.set(key, note);
        }
      }
      annotated.push(note);
    }
    pending = undefined;
  };
  for (let i = 0; i < messages.length;) {
    const group = [messages[i++]];
    while (i < messages.length && messages[i].role === "toolResult") group.push(messages[i++]);
    const attributed = [];
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
        `${s.ref} | producer: ${s.producer} | ${s.message.role}${s.message.toolName ? ` | ${s.message.toolName}` : ""}${s.assignmentId ? ` | assignment: ${s.assignmentId}` : ""} | ${representation} | ${selection}`,
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

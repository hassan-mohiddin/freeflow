import { createHash } from "node:crypto";
import { sessionEntryToContextMessages } from "@earendil-works/pi-coding-agent";
import {
  canonical,
  idFor,
  refFor,
  type NativeEntry,
  type State,
  type View,
  type Problem,
} from "../cognitive-routing-v2/types.js";

export interface Source {
  ref: string;
  entry: NativeEntry;
  message: any;
  hash: string;
  producer: View | "common";
  executionId?: string;
  assignmentId?: string;
  active: boolean;
}
export interface Associated {
  message: any;
  source?: Source;
}
export const bodyHash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export class Sources {
  readonly byRef = new Map<string, Source>();
  private readonly byBody = new Map<string, Source[]>();
  constructor(
    readonly entries: readonly NativeEntry[],
    state: State,
  ) {
    for (const entry of entries) {
      const messages = sessionEntryToContextMessages(entry as any) as any[];
      // A materialized compaction tail is common context, not an invented original occurrence.
      if (messages.length !== 1 || ["compaction", "branch_summary"].includes(entry.type)) continue;
      const message = messages[0];
      if (!message) continue;
      const author = state.authors.get(entry.id);
      const source: Source = {
        ref: refFor(entry.id),
        entry,
        message,
        hash: bodyHash(message),
        producer: author?.profile ?? "common",
        executionId: author?.executionId,
        assignmentId: author?.assignmentId,
        active: false,
      };
      this.byRef.set(source.ref, source);
      const candidates = this.byBody.get(source.hash) ?? [];
      candidates.push(source);
      this.byBody.set(source.hash, candidates);
    }
  }
  associate(messages: readonly any[]): Associated[] {
    const used = new Set<string>();
    return messages.map((message) => {
      const candidates = (this.byBody.get(bodyHash(message)) ?? []).filter((source) => !used.has(source.ref));
      if (candidates.length !== 1) return { message };
      const source = candidates[0];
      used.add(source.ref);
      source.active = true;
      return { message, source };
    });
  }
  eligible(ref: string, state: State): Problem | undefined {
    const source = this.byRef.get(ref);
    if (!idFor(ref) || !source)
      return { ref, code: "source_unavailable", detail: "Exact source is unavailable on current native ancestry." };
    if (source.producer !== "executor")
      return { ref, code: "source_origin", detail: "Selection requires observed Executor attribution." };
    if (state.exposure.get(ref) !== source.hash)
      return {
        ref,
        code: "source_unexposed",
        detail: "The captured body has not been fully exposed to Executor on this ancestry.",
      };
    return undefined;
  }
  exchange(source: Source): { sources: Source[]; problems: Problem[] } {
    const problems: Problem[] = [];
    let assistant = source;
    if (source.message.role === "toolResult") {
      const position = this.entries.findIndex((e) => e.id === source.entry.id);
      const preceding = this.entries
        .slice(0, position)
        .map((e) => this.byRef.get(refFor(e.id)))
        .filter((s) => s?.message.role === "assistant");
      const owner = preceding.at(-1);
      const candidates = owner?.message.content?.some(
        (b: any) => b.type === "toolCall" && b.id === source.message.toolCallId && b.name === source.message.toolName,
      )
        ? [owner]
        : [];
      if (candidates.length !== 1)
        return {
          sources: [],
          problems: [
            { ref: source.ref, code: "ambiguous_exchange", detail: "Result has no unique native assistant call." },
          ],
        };
      assistant = candidates[0];
    }
    if (assistant.message.role !== "assistant") return { sources: [source], problems };
    const calls = (assistant.message.content ?? []).filter((b: any) => b.type === "toolCall");
    const group = [assistant];
    const start = this.entries.findIndex((e) => e.id === assistant.entry.id);
    let end = this.entries.findIndex((e, i) => i > start && this.byRef.get(refFor(e.id))?.message.role === "assistant");
    if (end < 0) end = this.entries.length;
    const window = this.entries.slice(start + 1, end).flatMap((e) => {
      const s = this.byRef.get(refFor(e.id));
      return s ? [s] : [];
    });
    if (new Set(calls.map((c: any) => c.id)).size !== calls.length)
      problems.push({
        ref: assistant.ref,
        code: "duplicate_call_id",
        detail: "One native assistant exchange repeats a tool-call identity.",
      });
    for (const call of calls) {
      const results = window.filter(
        (s) => s.message.role === "toolResult" && s.message.toolCallId === call.id && s.message.toolName === call.name,
      );
      if (results.length !== 1)
        problems.push({
          ref: assistant.ref,
          code: "incomplete_exchange",
          detail: `Native call ${call.id} does not have exactly one captured result.`,
        });
      else group.push(results[0]);
    }
    return { sources: group, problems };
  }
  ordered(sources: Iterable<Source>): Source[] {
    const ids = new Set([...sources].map((s) => s.ref));
    return this.entries.flatMap((entry) => {
      const source = this.byRef.get(refFor(entry.id));
      return source && ids.has(source.ref) ? [source] : [];
    });
  }
}

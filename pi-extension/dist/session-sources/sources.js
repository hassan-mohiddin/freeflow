import { createHash } from "node:crypto";
import { sessionEntryToContextMessages } from "@earendil-works/pi-coding-agent";
import { canonical, idFor, refFor } from "../cognitive-routing-v2/types.js";
export const bodyHash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
export class Sources {
  byRef = new Map();
  ambiguous = new Set();
  byBody = new Map();
  entries = [];
  activeIds;
  constructor(entries, state, activeIds) {
    this.refresh(entries, state, activeIds);
  }
  refresh(entries, state, activeIds) {
    const prefix = this.entries.length <= entries.length && this.entries.every((e, i) => e === entries[i]);
    const start = prefix ? this.entries.length : 0;
    if (!prefix) {
      this.byRef.clear();
      this.byBody.clear();
    }
    this.activeIds = activeIds;
    for (const entry of entries.slice(start)) {
      const messages = sessionEntryToContextMessages(entry);
      // A materialized compaction tail is common context, not an invented original occurrence.
      if (messages.length !== 1 || ["compaction", "branch_summary"].includes(entry.type)) continue;
      const message = messages[0];
      if (!message) continue;
      const author = state.authors.get(entry.id);
      const source = {
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
    // Binding can arrive after the source message. Refresh attribution without
    // reconverting or rehashing the already-indexed captured bodies.
    for (const source of this.byRef.values()) {
      const author = state.authors.get(source.entry.id);
      source.producer = author?.profile ?? "common";
      source.executionId = author?.executionId;
      source.assignmentId = author?.assignmentId;
    }
    this.entries = [...entries];
  }
  associate(messages) {
    this.ambiguous.clear();
    for (const source of this.byRef.values()) source.active = false;
    const used = new Set();
    const hashes = messages.map(bodyHash);
    const remaining = new Map();
    for (const hash of hashes) remaining.set(hash, (remaining.get(hash) ?? 0) + 1);
    return messages.map((message, index) => {
      const hash = hashes[index];
      const count = remaining.get(hash);
      remaining.set(hash, count - 1);
      const candidates = (this.byBody.get(hash) ?? []).filter(
        (source) => !used.has(source.ref) && (!this.activeIds || this.activeIds.has(source.entry.id)),
      );
      const exact = candidates.find((source) => source.message === message);
      // Equal bodies are different occurrences. Match an entire repeated sequence in
      // native order; a partial sequence without native identity remains ambiguous.
      const source = exact ?? (candidates.length === 1 || candidates.length === count ? candidates[0] : undefined);
      if (!source) {
        for (const candidate of candidates) this.ambiguous.add(candidate.ref);
        return { message };
      }
      used.add(source.ref);
      source.active = true;
      return { message, source };
    });
  }
  eligible(ref, state) {
    const source = this.byRef.get(ref);
    if (!idFor(ref) || !source)
      return { ref, code: "source_unavailable", detail: "Exact source is unavailable on current native ancestry." };
    if (bodyHash(source.message) !== source.hash)
      return {
        ref,
        code: "source_changed",
        detail: "The canonical body changed since source association; evidence must be reconciled.",
      };
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
  exchange(source) {
    const problems = [];
    let assistant = source;
    if (source.message.role === "toolResult") {
      const position = this.entries.findIndex((e) => e.id === source.entry.id);
      const preceding = this.entries
        .slice(0, position)
        .map((e) => this.byRef.get(refFor(e.id)))
        .filter((s) => s?.message.role === "assistant");
      const owner = preceding.at(-1);
      const candidates = owner?.message.content?.some(
        (b) => b.type === "toolCall" && b.id === source.message.toolCallId && b.name === source.message.toolName,
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
    const calls = (assistant.message.content ?? []).filter((b) => b.type === "toolCall");
    const group = [assistant];
    const start = this.entries.findIndex((e) => e.id === assistant.entry.id);
    let end = this.entries.findIndex((e, i) => i > start && this.byRef.get(refFor(e.id))?.message.role === "assistant");
    if (end < 0) end = this.entries.length;
    const window = this.entries.slice(start + 1, end).flatMap((e) => {
      const s = this.byRef.get(refFor(e.id));
      return s ? [s] : [];
    });
    if (new Set(calls.map((c) => c.id)).size !== calls.length)
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
  ordered(sources) {
    const ids = new Set([...sources].map((s) => s.ref));
    return this.entries.flatMap((entry) => {
      const source = this.byRef.get(refFor(entry.id));
      return source && ids.has(source.ref) ? [source] : [];
    });
  }
}

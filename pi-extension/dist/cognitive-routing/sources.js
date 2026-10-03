import { createHash } from "node:crypto";
import { sessionEntryToContextMessages } from "@earendil-works/pi-coding-agent";
import { canonical, idFor, isWorkerProfile, refFor } from "./types.js";
import { isHostEdited, isProjected, projectedEntryId } from "../host/projection-tags.js";
export const bodyHash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
/** Define a memoized hash so history is hashed only when a consumer needs it. */
function lazyHash(target, compute) {
  let value;
  return Object.defineProperty(target, "hash", {
    enumerable: true,
    get: () => (value ??= compute()),
  });
}
const routingTools = new Set(["freeflow_delegate", "freeflow_return", "freeflow_project", "freeflow_unit"]);
// Discovery, new selections, and delivery share this policy: evidence is what tools produced. What a worker
// says belongs in its report, so its assistant messages are never evidence.
export function isTaskEvidence(source) {
  return source.message.role === "toolResult" && !routingTools.has(source.message.toolName);
}
/** Saved selections keep their delivery, except assistant messages (whole or `#text`), which are never evidence. */
export function deliveredSelection(sources, ref) {
  return !ref.endsWith("#text") && sources.byRef.get(ref)?.message.role !== "assistant";
}
const callKey = (id, name) => JSON.stringify([id, name]);
const locatorLimit = 160;
function normalizeLabel(value) {
  if (typeof value !== "string") return undefined;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return undefined;
  if (clean.length <= locatorLimit) return { label: clean, truncated: false };
  return { label: `${clean.slice(0, locatorLimit - 3)}...`, truncated: true };
}
function locatorForCall(assistant, call, locatorProvider) {
  if (typeof assistant.ref !== "string" || typeof call.id !== "string" || typeof call.name !== "string")
    return undefined;
  const locator = { callRef: assistant.ref, toolCallId: call.id };
  const details = locatorProvider?.(assistant, call);
  const label = normalizeLabel(details?.label);
  return label ? { ...locator, ...label, truncated: details?.truncated === true || label.truncated } : locator;
}
export class Sources {
  byRef = new Map();
  ambiguous = new Set();
  byBody = new Map();
  // Sources not yet placed in byBody; the content index is only needed for unprojected association.
  unindexed = [];
  exchanges = new Map();
  owners = new Map();
  tail;
  associated;
  entries = [];
  ranks;
  nonWorker;
  activeIds;
  locatorProvider;
  constructor(entries, state, activeIds, locatorProvider) {
    this.locatorProvider = locatorProvider;
    this.refresh(entries, state, activeIds);
  }
  refresh(entries, state, activeIds) {
    const prefix = this.entries.length <= entries.length && this.entries.every((e, i) => e === entries[i]);
    const start = prefix ? this.entries.length : 0;
    this.associated = undefined;
    this.ranks = undefined;
    this.nonWorker = undefined;
    if (!prefix) {
      this.byRef.clear();
      this.byBody.clear();
      this.unindexed = [];
      this.exchanges.clear();
      this.owners.clear();
      this.tail = undefined;
    }
    this.activeIds = activeIds;
    for (const entry of entries.slice(start)) {
      const messages = sessionEntryToContextMessages(entry);
      if (messages.length !== 1 || ["compaction", "branch_summary"].includes(entry.type)) continue;
      const message = messages[0];
      if (!message) continue;
      const source = lazyHash({ ref: refFor(entry.id), entry, message, producer: "common", active: false }, () =>
        bodyHash(message),
      );
      if (message.role === "toolResult" && message.toolName === "freeflow_return") {
        for (const block of message.content ?? [])
          if (block.type === "text") {
            try {
              const receipt = JSON.parse(block.text);
              if (
                // Current receipts carry a text hash; older receipts carried the text itself.
                ((receipt.reportSaved &&
                  (typeof receipt.report === "string" || typeof receipt.reportSha256 === "string")) ||
                  (receipt.supplementSaved &&
                    (typeof receipt.supplement === "string" || typeof receipt.supplementSha256 === "string"))) &&
                typeof receipt.handoff === "string"
              )
                source.reportHandoff = receipt.handoff;
            } catch {}
          }
      }
      this.byRef.set(source.ref, source);
      this.unindexed.push(source);
      if (message.role === "assistant") {
        this.tail = { assistant: source, results: new Map() };
        this.exchanges.set(source.ref, this.tail);
      } else if (message.role === "toolResult" && this.tail) {
        const key = callKey(message.toolCallId, message.toolName);
        const results = this.tail.results.get(key) ?? [];
        results.push(source);
        this.tail.results.set(key, results);
        this.owners.set(source.ref, this.tail);
      }
    }
    for (const source of this.byRef.values()) {
      const author = state.authors.get(source.entry.id);
      source.producer = author?.profile ?? "common";
      source.executionId = author?.executionId;
      source.assignmentId = author?.assignmentId;
    }
    this.entries = [...entries];
  }
  /** Each entry's position in `entries`; computed once per refresh rather than per request. */
  get rank() {
    return (this.ranks ??= new Map(this.entries.map((entry, index) => [entry.id, index])));
  }
  /** For each position in `entries` (and one past the end), how many earlier entries no worker produced. */
  get nonWorkerBefore() {
    if (!this.nonWorker) {
      const counts = [0];
      for (const entry of this.entries) {
        const producer = this.byRef.get(`ctx:${entry.id}`)?.producer ?? "common";
        counts.push(counts.at(-1) + (isWorkerProfile(producer) ? 0 : 1));
      }
      this.nonWorker = counts;
    }
    return this.nonWorker;
  }
  bodyIndex() {
    for (const source of this.unindexed) {
      const candidates = this.byBody.get(source.hash) ?? [];
      candidates.push(source);
      this.byBody.set(source.hash, candidates);
    }
    this.unindexed = [];
    return this.byBody;
  }
  associate(messages) {
    if (
      this.associated &&
      messages.length === this.associated.messages.length &&
      messages.every((m, i) => m === this.associated.messages[i])
    )
      return this.associated.items;
    this.ambiguous.clear();
    for (const source of this.byRef.values()) source.active = false;
    const projected = messages.some(isProjected);
    // After an aligned projection, only host-edited messages can match a source by content: the others are
    // tagged, sourceless (summaries, multi-message entries), or generated after the projection.
    const contentOnly = (message) => !projected || isHostEdited(message);
    const direct = messages.map((message) => {
      const id = projectedEntryId(message);
      const source = id === undefined ? undefined : this.byRef.get(refFor(id));
      return source && (!this.activeIds || this.activeIds.has(source.entry.id)) ? source : undefined;
    });
    const used = new Set(direct.flatMap((source) => (source ? [source.ref] : []))),
      hashes = messages.map((message, index) =>
        direct[index] || !contentOnly(message) ? undefined : bodyHash(message),
      ),
      remaining = new Map();
    for (const hash of hashes) if (hash) remaining.set(hash, (remaining.get(hash) ?? 0) + 1);
    const items = messages.map((message, index) => {
      if (direct[index]) {
        const source = direct[index];
        source.active = true;
        return { message, source };
      }
      if (hashes[index] === undefined) return { message };
      const hash = hashes[index],
        count = remaining.get(hash);
      remaining.set(hash, count - 1);
      const candidates = (this.bodyIndex().get(hash) ?? []).filter(
        (s) => !used.has(s.ref) && (!this.activeIds || this.activeIds.has(s.entry.id)),
      );
      const exact = candidates.find((s) => s.message === message);
      const source = exact ?? (candidates.length === 1 || candidates.length === count ? candidates[0] : undefined);
      if (!source) {
        for (const candidate of candidates) this.ambiguous.add(candidate.ref);
        return { message };
      }
      used.add(source.ref);
      source.active = true;
      return { message, source };
    });
    this.associated = { messages: [...messages], items };
    return items;
  }
  eligible(ref, state) {
    const source = this.byRef.get(ref);
    if (!idFor(ref) || !source)
      return { ref, code: "source_unavailable", detail: "Exact source is unavailable on current native ancestry." };
    if (bodyHash(source.message) !== source.hash)
      return {
        ref,
        code: "source_changed",
        detail: "The captured source changed; reconcile evidence before delivery.",
      };
    if (!isWorkerProfile(source.producer))
      return { ref, code: "source_origin", detail: "Selection requires observed worker attribution." };
    if (state.exposure.get(source.ref) !== source.hash)
      return {
        ref,
        code: "source_unexposed",
        detail: "The captured body has not been fully exposed to a worker on this ancestry.",
      };
    return undefined;
  }
  selectionProblem(ref, state) {
    const problem = this.eligible(ref, state);
    if (problem) return problem;
    const source = this.byRef.get(ref);
    if (!isTaskEvidence(source))
      return source.message.role === "assistant"
        ? {
            ref,
            code: "assistant_message",
            detail:
              "Assistant messages are not task evidence; say it in the report and select the tool results it rests on.",
          }
        : {
            ref,
            code: "routing_source",
            detail: "Routing control receipts are not task evidence; saved communication is delivered separately.",
          };
    return undefined;
  }
  exchange(source) {
    if (!["assistant", "toolResult"].includes(source.message.role)) return { sources: [source], problems: [] };
    const group = source.message.role === "assistant" ? this.exchanges.get(source.ref) : this.owners.get(source.ref);
    const calls = group?.assistant.message.content?.filter((b) => b.type === "toolCall") ?? [];
    if (
      !group ||
      (source.message.role === "toolResult" &&
        !calls.some((c) => c.id === source.message.toolCallId && c.name === source.message.toolName))
    )
      return {
        sources: [],
        problems: [
          { ref: source.ref, code: "ambiguous_exchange", detail: "Result has no unique native assistant call." },
        ],
      };
    const sources = [group.assistant],
      problems = [];
    if (new Set(calls.map((c) => c.id)).size !== calls.length)
      problems.push({
        ref: group.assistant.ref,
        code: "duplicate_call_id",
        detail: "One native assistant exchange repeats a tool-call identity.",
      });
    for (const call of calls) {
      const results = group.results.get(callKey(call.id, call.name)) ?? [];
      if (results.length !== 1)
        problems.push({
          ref: group.assistant.ref,
          code: "incomplete_exchange",
          detail: `Native call ${call.id} does not have exactly one captured result.`,
        });
      else sources.push(results[0]);
    }
    return { sources, problems };
  }
  locator(ref) {
    const source = this.byRef.get(ref);
    if (!source || source.message.role !== "toolResult") return undefined;
    const group = this.owners.get(source.ref);
    if (!group) return undefined;
    const calls = group.assistant.message.content?.filter((b) => b.type === "toolCall") ?? [];
    const matches = calls.filter(
      (call) => call.id === source.message.toolCallId && call.name === source.message.toolName,
    );
    return matches.length === 1 ? locatorForCall(group.assistant, matches[0], this.locatorProvider) : undefined;
  }
  ordered(sources) {
    const ids = new Set([...sources].map((s) => s.ref));
    return this.entries.flatMap((entry) => {
      const source = this.byRef.get(refFor(entry.id));
      return source && ids.has(source.ref) ? [source] : [];
    });
  }
}

import { createHash } from "node:crypto";
import { sessionEntryToContextMessages } from "@earendil-works/pi-coding-agent";
import {
  canonical,
  idFor,
  isWorkerProfile,
  refFor,
  type NativeEntry,
  type State,
  type View,
  type Problem,
} from "./types.js";
import { isHostEdited, isProjected, projectedEntryId } from "../host/projection-tags.js";

export interface EvidenceLocator {
  callRef: string;
  toolCallId: string;
  label?: string;
  truncated?: boolean;
}
export interface Source {
  ref: string;
  entry: NativeEntry;
  message: any;
  hash: string;
  producer: View | "common";
  executionId?: string;
  assignmentId?: string;
  active: boolean;
  reportHandoff?: string;
}
export interface NativeToolCall {
  id: string;
  name: string;
  arguments?: unknown;
}
export type EvidenceLocatorProvider = (
  assistant: Source,
  call: NativeToolCall,
) => Pick<EvidenceLocator, "label" | "truncated"> | undefined;
export interface Associated {
  message: any;
  source?: Source;
}
export const bodyHash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
/** Define a memoized hash so history is hashed only when a consumer needs it. */
function lazyHash<T extends object>(target: T, compute: () => string): T & { hash: string } {
  let value: string | undefined;
  return Object.defineProperty(target, "hash", {
    enumerable: true,
    get: () => (value ??= compute()),
  }) as T & { hash: string };
}
const routingTools = new Set(["freeflow_delegate", "freeflow_return", "freeflow_project", "freeflow_unit"]);
// Discovery, new selections, and delivery share this policy: evidence is what tools produced. What a worker
// says belongs in its report, so its assistant messages are never evidence.
export function isTaskEvidence(source: Source): boolean {
  return source.message.role === "toolResult" && !routingTools.has(source.message.toolName);
}
/** Saved selections keep their delivery, except assistant messages (whole or `#text`), which are never evidence. */
export function deliveredSelection(sources: Sources, ref: string): boolean {
  return !ref.endsWith("#text") && sources.byRef.get(ref)?.message.role !== "assistant";
}
interface Exchange {
  assistant: Source;
  results: Map<string, Source[]>;
}
const callKey = (id: string, name: string) => JSON.stringify([id, name]);
const locatorLimit = 160;

function normalizeLabel(value: unknown): Pick<EvidenceLocator, "label" | "truncated"> | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return undefined;
  if (clean.length <= locatorLimit) return { label: clean, truncated: false };
  return { label: `${clean.slice(0, locatorLimit - 3)}...`, truncated: true };
}

function locatorForCall(
  assistant: Source,
  call: NativeToolCall,
  locatorProvider?: EvidenceLocatorProvider,
): EvidenceLocator | undefined {
  if (typeof assistant.ref !== "string" || typeof call.id !== "string" || typeof call.name !== "string")
    return undefined;
  const locator: EvidenceLocator = { callRef: assistant.ref, toolCallId: call.id };
  const details = locatorProvider?.(assistant, call);
  const label = normalizeLabel(details?.label);
  return label ? { ...locator, ...label, truncated: details?.truncated === true || label.truncated } : locator;
}

export class Sources {
  readonly byRef = new Map<string, Source>();
  readonly ambiguous = new Set<string>();
  private readonly byBody = new Map<string, Source[]>();
  // Sources not yet placed in byBody; the content index is only needed for unprojected association.
  private unindexed: Source[] = [];
  private readonly exchanges = new Map<string, Exchange>();
  private readonly owners = new Map<string, Exchange>();
  private tail?: Exchange;
  private associated?: { messages: readonly any[]; items: Associated[] };
  entries: readonly NativeEntry[] = [];
  private activeIds?: ReadonlySet<string>;
  private readonly locatorProvider?: EvidenceLocatorProvider;
  constructor(
    entries: readonly NativeEntry[],
    state: State,
    activeIds?: ReadonlySet<string>,
    locatorProvider?: EvidenceLocatorProvider,
  ) {
    this.locatorProvider = locatorProvider;
    this.refresh(entries, state, activeIds);
  }
  refresh(entries: readonly NativeEntry[], state: State, activeIds?: ReadonlySet<string>): void {
    const prefix = this.entries.length <= entries.length && this.entries.every((e, i) => e === entries[i]);
    const start = prefix ? this.entries.length : 0;
    this.associated = undefined;
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
      const messages = sessionEntryToContextMessages(entry as any) as any[];
      if (messages.length !== 1 || ["compaction", "branch_summary"].includes(entry.type)) continue;
      const message = messages[0];
      if (!message) continue;
      const source: Source = lazyHash(
        { ref: refFor(entry.id), entry, message, producer: "common" as Source["producer"], active: false } as Omit<
          Source,
          "hash"
        >,
        () => bodyHash(message),
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
  private bodyIndex(): Map<string, Source[]> {
    for (const source of this.unindexed) {
      const candidates = this.byBody.get(source.hash) ?? [];
      candidates.push(source);
      this.byBody.set(source.hash, candidates);
    }
    this.unindexed = [];
    return this.byBody;
  }
  associate(messages: readonly any[]): Associated[] {
    if (
      this.associated &&
      messages.length === this.associated.messages.length &&
      messages.every((m, i) => m === this.associated!.messages[i])
    )
      return this.associated.items;
    this.ambiguous.clear();
    for (const source of this.byRef.values()) source.active = false;
    const projected = messages.some(isProjected);
    // After an aligned projection, only host-edited messages can match a source by content: the others are
    // tagged, sourceless (summaries, multi-message entries), or generated after the projection.
    const contentOnly = (message: any) => !projected || isHostEdited(message);
    const direct = messages.map((message) => {
      const id = projectedEntryId(message);
      const source = id === undefined ? undefined : this.byRef.get(refFor(id));
      return source && (!this.activeIds || this.activeIds.has(source.entry.id)) ? source : undefined;
    });
    const used = new Set<string>(direct.flatMap((source) => (source ? [source.ref] : []))),
      hashes = messages.map((message, index) =>
        direct[index] || !contentOnly(message) ? undefined : bodyHash(message),
      ),
      remaining = new Map<string, number>();
    for (const hash of hashes) if (hash) remaining.set(hash, (remaining.get(hash) ?? 0) + 1);
    const items = messages.map((message, index) => {
      if (direct[index]) {
        const source = direct[index]!;
        source.active = true;
        return { message, source };
      }
      if (hashes[index] === undefined) return { message };
      const hash = hashes[index]!,
        count = remaining.get(hash)!;
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
  eligible(ref: string, state: State): Problem | undefined {
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
  selectionProblem(ref: string, state: State): Problem | undefined {
    const problem = this.eligible(ref, state);
    if (problem) return problem;
    const source = this.byRef.get(ref)!;
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
  exchange(source: Source): { sources: Source[]; problems: Problem[] } {
    if (!["assistant", "toolResult"].includes(source.message.role)) return { sources: [source], problems: [] };
    const group = source.message.role === "assistant" ? this.exchanges.get(source.ref) : this.owners.get(source.ref);
    const calls = group?.assistant.message.content?.filter((b: any) => b.type === "toolCall") ?? [];
    if (
      !group ||
      (source.message.role === "toolResult" &&
        !calls.some((c: any) => c.id === source.message.toolCallId && c.name === source.message.toolName))
    )
      return {
        sources: [],
        problems: [
          { ref: source.ref, code: "ambiguous_exchange", detail: "Result has no unique native assistant call." },
        ],
      };
    const sources = [group.assistant],
      problems: Problem[] = [];
    if (new Set(calls.map((c: any) => c.id)).size !== calls.length)
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
  locator(ref: string): EvidenceLocator | undefined {
    const source = this.byRef.get(ref);
    if (!source || source.message.role !== "toolResult") return undefined;
    const group = this.owners.get(source.ref);
    if (!group) return undefined;
    const calls = group.assistant.message.content?.filter((b: any) => b.type === "toolCall") ?? [];
    const matches = calls.filter(
      (call: any) => call.id === source.message.toolCallId && call.name === source.message.toolName,
    );
    return matches.length === 1 ? locatorForCall(group.assistant, matches[0], this.locatorProvider) : undefined;
  }
  ordered(sources: Iterable<Source>): Source[] {
    const ids = new Set([...sources].map((s) => s.ref));
    return this.entries.flatMap((entry) => {
      const source = this.byRef.get(refFor(entry.id));
      return source && ids.has(source.ref) ? [source] : [];
    });
  }
}

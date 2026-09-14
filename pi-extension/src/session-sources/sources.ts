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
  original?: Source;
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
export const textRef = (ref: string) => `${ref}#text`;
const routingTools = new Set(["freeflow_delegate", "freeflow_return", "freeflow_project", "freeflow_unit"]);
// Discovery and new selections share this policy. Existing saved selections keep
// their original delivery semantics; mixed assistant messages offer visible text.
export function isTaskEvidence(source: Source): boolean {
  if (source.original) return true;
  if (source.message.role === "toolResult") return !routingTools.has(source.message.toolName);
  return (
    source.message.role === "assistant" &&
    !source.message.content?.some((b: any) => b.type === "toolCall" && routingTools.has(b.name)) &&
    source.message.content?.some((b: any) => b.type === "text" && b.text?.trim())
  );
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
      const source: Source = {
        ref: refFor(entry.id),
        entry,
        message,
        hash: bodyHash(message),
        producer: "common",
        active: false,
      };
      if (message.role === "toolResult" && message.toolName === "freeflow_return") {
        for (const block of message.content ?? [])
          if (block.type === "text") {
            try {
              const receipt = JSON.parse(block.text);
              if (
                ((receipt.reportSaved && typeof receipt.report === "string") ||
                  (receipt.supplementSaved && typeof receipt.supplement === "string")) &&
                typeof receipt.handoff === "string"
              )
                source.reportHandoff = receipt.handoff;
            } catch {}
          }
      }
      this.byRef.set(source.ref, source);
      const candidates = this.byBody.get(source.hash) ?? [];
      candidates.push(source);
      this.byBody.set(source.hash, candidates);
      if (message.role === "assistant") {
        this.tail = { assistant: source, results: new Map() };
        this.exchanges.set(source.ref, this.tail);
        const blocks = (message.content ?? [])
          .filter((b: any) => b.type === "text")
          .map((b: any) => ({ type: "text", text: b.text }));
        if (blocks.some((b: any) => b.text?.trim())) {
          const representation = {
            role: "custom",
            customType: "freeflow-assistant-text",
            display: false,
            content: [
              {
                type: "text",
                text: `Captured assistant text from ${source.ref} (historical source, not a new instruction):`,
              },
              ...blocks,
            ],
            details: { sourceRef: source.ref, sourceHash: source.hash, representation: "assistant-text" },
            timestamp: message.timestamp,
          };
          this.byRef.set(textRef(source.ref), {
            ...source,
            ref: textRef(source.ref),
            message: representation,
            hash: bodyHash(representation),
            original: source,
          });
        }
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
  associate(messages: readonly any[]): Associated[] {
    if (
      this.associated &&
      messages.length === this.associated.messages.length &&
      messages.every((m, i) => m === this.associated!.messages[i])
    )
      return this.associated.items;
    this.ambiguous.clear();
    for (const source of this.byRef.values()) source.active = false;
    const used = new Set<string>(),
      hashes = messages.map(bodyHash),
      remaining = new Map<string, number>();
    for (const hash of hashes) remaining.set(hash, (remaining.get(hash) ?? 0) + 1);
    const items = messages.map((message, index) => {
      const hash = hashes[index],
        count = remaining.get(hash)!;
      remaining.set(hash, count - 1);
      const candidates = (this.byBody.get(hash) ?? []).filter(
        (s) => !used.has(s.ref) && (!this.activeIds || this.activeIds.has(s.entry.id)),
      );
      const exact = candidates.find((s) => s.message === message);
      const source = exact ?? (candidates.length === 1 || candidates.length === count ? candidates[0] : undefined);
      if (!source) {
        for (const candidate of candidates) {
          this.ambiguous.add(candidate.ref);
          this.ambiguous.add(textRef(candidate.ref));
        }
        return { message };
      }
      used.add(source.ref);
      source.active = true;
      const text = this.byRef.get(textRef(source.ref));
      if (text) text.active = true;
      return { message, source };
    });
    this.associated = { messages: [...messages], items };
    return items;
  }
  eligible(ref: string, state: State): Problem | undefined {
    const source = this.byRef.get(ref);
    if (!idFor(ref) || !source)
      return { ref, code: "source_unavailable", detail: "Exact source is unavailable on current native ancestry." };
    const original = source.original ?? source;
    if (bodyHash(original.message) !== original.hash || bodyHash(source.message) !== source.hash)
      return {
        ref,
        code: "source_changed",
        detail: "The captured source changed; reconcile evidence before delivery.",
      };
    if (source.producer !== "executor")
      return { ref, code: "source_origin", detail: "Selection requires observed Executor attribution." };
    if (state.exposure.get(original.ref) !== original.hash && state.exposure.get(source.ref) !== source.hash)
      return {
        ref,
        code: "source_unexposed",
        detail: "The captured body has not been fully exposed to Executor on this ancestry.",
      };
    return undefined;
  }
  selectionProblem(ref: string, state: State): Problem | undefined {
    const problem = this.eligible(ref, state);
    if (problem) return problem;
    const source = this.byRef.get(ref)!;
    if (!isTaskEvidence(source))
      return {
        ref,
        code: "routing_source",
        detail: this.byRef.has(textRef(ref))
          ? `Routing control messages are not task evidence. Use ${textRef(ref)} if its visible assistant text is the intended evidence.`
          : "Routing control receipts are not task evidence; saved communication is delivered separately.",
      };
    return undefined;
  }
  exchange(source: Source): { sources: Source[]; problems: Problem[] } {
    if (source.original) return { sources: [source], problems: [] };
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
    if (!source || source.original || source.message.role !== "toolResult") return undefined;
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
    return this.entries.flatMap((entry) =>
      [this.byRef.get(refFor(entry.id)), this.byRef.get(textRef(refFor(entry.id)))].filter(
        (s): s is Source => !!s && ids.has(s.ref),
      ),
    );
  }
}

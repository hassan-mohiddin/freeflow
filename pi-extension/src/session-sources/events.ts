import { randomUUID } from "node:crypto";
import { activeReadOnlySessionBranch, readOnlySessionSnapshot } from "./read-only-session.js";
import {
  ROUTING_ENTRY,
  RoutingError,
  canonical,
  eventKey,
  eventValue,
  requireCondition as check,
  type EventData,
  type NativeEntry,
  type RoutingEvent,
} from "../cognitive-routing-v2/types.js";
import { parseRoutingEvent, reduce, replay } from "../cognitive-routing-v2/state.js";

export interface SessionReader {
  getSessionId(): string;
  getSessionFile(): string | undefined;
  getBranch(): readonly NativeEntry[];
  getEntries(): readonly NativeEntry[];
  getLeafId(): string | null;
}
export class EventStore {
  private observed = new Map<string, { value: string; eventId: string; entryId: string }>();
  private attempted = new Map<string, RoutingEvent>();
  private fault?: string;
  private ready = false;
  private cachedEntries: readonly NativeEntry[] = [];
  private cachedState = replay([]);
  constructor(
    private readonly pi: { appendEntry(type: string, data: unknown): void },
    readonly reader: SessionReader,
  ) {}
  get blocked(): string | undefined {
    return this.fault ?? (!this.ready ? "acknowledgment_unclassified" : undefined);
  }
  state() {
    const entries = this.reader.getBranch();
    const prefix =
      this.cachedEntries.length <= entries.length && this.cachedEntries.every((entry, i) => entry === entries[i]);
    if (!prefix) {
      this.cachedState = replay(entries);
    } else {
      let state = this.cachedState;
      for (const entry of entries.slice(this.cachedEntries.length))
        if (entry.type === "custom" && entry.customType === ROUTING_ENTRY)
          state = reduce(state, parseRoutingEvent(entry.data));
      this.cachedState = state;
    }
    this.cachedEntries = [...entries];
    return this.cachedState;
  }
  block(reason: string): void {
    this.fault = reason;
    this.ready = false;
  }
  make(data: EventData, operationId: string = randomUUID(), stepId: string = data.type): RoutingEvent {
    return parseRoutingEvent({
      version: 2,
      eventId: randomUUID(),
      operationId,
      stepId,
      recordedSessionId: this.reader.getSessionId(),
      data,
    });
  }
  async reconcile(): Promise<void> {
    const acknowledged = this.ready && !this.fault;
    this.ready = false;
    const branch = this.reader.getBranch();
    const live = branch.filter((e) => e.type === "custom" && e.customType === ROUTING_ENTRY);
    try {
      const ids = new Set<string>();
      let parent: string | null = null;
      for (const entry of branch) {
        check(
          typeof entry.id === "string" && !ids.has(entry.id) && entry.parentId === parent,
          "invalid_native_ancestry",
        );
        ids.add(entry.id);
        parent = entry.id;
      }
      check(parent === this.reader.getLeafId(), "invalid_native_ancestry");
      if (
        acknowledged &&
        live.every((entry) => {
          const event = parseRoutingEvent(entry.data);
          const receipt = this.observed.get(eventKey(event));
          return (
            receipt?.entryId === entry.id && receipt.eventId === event.eventId && receipt.value === eventValue(event)
          );
        })
      ) {
        this.ready = true;
        return;
      }
      if (!live.length && !this.attempted.size) {
        this.observed.clear();
        this.fault = undefined;
        this.ready = true;
        return;
      }
      const path = this.reader.getSessionFile();
      check(path, "persisted_snapshot_unavailable", "Existing or uncertain routing state needs a persisted snapshot.");
      const snapshot = await readOnlySessionSnapshot(path);
      check(snapshot.sessionId === this.reader.getSessionId(), "session_identity_changed");
      const persistedBranch = activeReadOnlySessionBranch(snapshot, this.reader.getLeafId());
      check(
        canonical(persistedBranch) === canonical(branch),
        "snapshot_ancestry_mismatch",
        "Live branch is not the complete persisted ancestry for its claimed leaf.",
      );
      replay(persistedBranch as NativeEntry[]);
      const disk = new Map(persistedBranch.map((e) => [e.id, e]));
      const known = new Map<string, { value: string; eventId: string; entryId: string }>();
      // Compare the live selected ancestry, not whichever branch was last written on disk.
      for (const entry of branch) {
        const captured = disk.get(entry.id);
        check(
          captured && canonical(captured) === canonical(entry),
          "snapshot_divergence",
          "Live ancestry is not fully established by the fresh persisted snapshot; reconcile the session before retrying.",
        );
        if (entry.type === "custom" && entry.customType === ROUTING_ENTRY) {
          const event = parseRoutingEvent(entry.data);
          known.set(eventKey(event), { value: eventValue(event), eventId: event.eventId, entryId: entry.id });
        }
      }
      for (const [key, event] of this.attempted)
        check(
          known.get(key)?.value === eventValue(event) && known.get(key)?.eventId === event.eventId,
          "append_acknowledgment_uncertain",
          "The attempted routing event is not established by persisted readback.",
        );
      this.observed = known;
      this.attempted.clear();
      this.fault = undefined;
      this.ready = true;
      this.cachedEntries = [];
      this.cachedState = replay([]);
    } catch (error) {
      this.block(error instanceof RoutingError ? error.code : "snapshot_unavailable");
      throw error;
    }
  }
  append(event: RoutingEvent): RoutingEvent {
    const value = parseRoutingEvent(event),
      key = eventKey(value),
      body = eventValue(value);
    if (this.blocked) throw new RoutingError("acknowledgment_uncertain", this.blocked);
    const prior = this.state().events.get(key);
    if (prior) {
      check(eventValue(prior) === body, "operation_conflict");
      const occurrence = this.reader
        .getBranch()
        .find(
          (entry) =>
            entry.type === "custom" &&
            entry.customType === ROUTING_ENTRY &&
            (entry.data as any)?.eventId === prior.eventId,
        );
      if (
        this.observed.get(key)?.value !== body ||
        this.observed.get(key)?.eventId !== prior.eventId ||
        this.observed.get(key)?.entryId !== occurrence?.id
      ) {
        this.block("prior_acknowledgment_unclassified");
        throw new RoutingError("acknowledgment_uncertain", this.blocked!);
      }
      return prior;
    }
    // Validate the whole state transition before mutating Pi's session memory.
    reduce(this.state(), value);
    this.attempted.set(key, value);
    try {
      this.pi.appendEntry(ROUTING_ENTRY, value);
      const found = this.reader
        .getBranch()
        .find(
          (e) => e.type === "custom" && e.customType === ROUTING_ENTRY && (e.data as any)?.eventId === value.eventId,
        );
      check(found && eventValue(parseRoutingEvent(found.data)) === body, "append_not_observed");
      this.observed.set(key, { value: body, eventId: value.eventId, entryId: found.id });
      this.attempted.delete(key);
      return value;
    } catch (error) {
      this.block("append_acknowledgment_uncertain");
      throw new RoutingError(
        "acknowledgment_uncertain",
        error instanceof Error ? error.message : "Pi append/readback did not acknowledge the event.",
      );
    }
  }
}

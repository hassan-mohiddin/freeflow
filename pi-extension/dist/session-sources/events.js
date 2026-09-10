import { randomUUID } from "node:crypto";
import { activeReadOnlySessionBranch, readOnlySessionSnapshot } from "./read-only-session.js";
import {
  ROUTING_ENTRY,
  RoutingError,
  canonical,
  eventKey,
  eventValue,
  requireCondition as check,
} from "../cognitive-routing-v2/types.js";
import { parseRoutingEvent, reduce, replay } from "../cognitive-routing-v2/state.js";
export class EventStore {
  pi;
  reader;
  observed = new Map();
  attempted = new Map();
  fault;
  ready = false;
  constructor(pi, reader) {
    this.pi = pi;
    this.reader = reader;
  }
  get blocked() {
    return this.fault ?? (!this.ready ? "acknowledgment_unclassified" : undefined);
  }
  state() {
    return replay(this.reader.getBranch());
  }
  block(reason) {
    this.fault = reason;
    this.ready = false;
  }
  make(data, operationId = randomUUID(), stepId = data.type) {
    return parseRoutingEvent({
      version: 2,
      eventId: randomUUID(),
      operationId,
      stepId,
      recordedSessionId: this.reader.getSessionId(),
      data,
    });
  }
  async reconcile() {
    this.ready = false;
    const branch = this.reader.getBranch();
    const live = branch.filter((e) => e.type === "custom" && e.customType === ROUTING_ENTRY);
    try {
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
      replay(persistedBranch);
      const disk = new Map(persistedBranch.map((e) => [e.id, e]));
      const known = new Map();
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
    } catch (error) {
      this.block(error instanceof RoutingError ? error.code : "snapshot_unavailable");
      throw error;
    }
  }
  append(event) {
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
            entry.type === "custom" && entry.customType === ROUTING_ENTRY && entry.data?.eventId === prior.eventId,
        );
      if (
        this.observed.get(key)?.value !== body ||
        this.observed.get(key)?.eventId !== prior.eventId ||
        this.observed.get(key)?.entryId !== occurrence?.id
      ) {
        this.block("prior_acknowledgment_unclassified");
        throw new RoutingError("acknowledgment_uncertain", this.blocked);
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
        .find((e) => e.type === "custom" && e.customType === ROUTING_ENTRY && e.data?.eventId === value.eventId);
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

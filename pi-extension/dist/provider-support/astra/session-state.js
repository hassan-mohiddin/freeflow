import { activeReadOnlySessionBranch, readOnlySessionSnapshot } from "../../session-sources/read-only-session.js";
import { ENTRY_TYPE, parseAttempt } from "./history.js";
export class SessionState {
  pi;
  reader;
  acknowledged = new Map();
  fault;
  constructor(pi, reader) {
    this.pi = pi;
    this.reader = reader;
  }
  branch() {
    const entries = this.reader.getBranch();
    let parent = null;
    const seen = new Set();
    for (const entry of entries) {
      if (!entry.id || seen.has(entry.id) || entry.parentId !== parent)
        throw new Error("Invalid Astra session ancestry");
      seen.add(entry.id);
      parent = entry.id;
    }
    if (parent !== this.reader.getLeafId()) throw new Error("Astra session leaf changed");
    return entries;
  }
  async records() {
    if (this.fault) throw new Error(this.fault);
    const branch = this.branch();
    const entries = branch.filter((e) => e.type === "custom" && e.customType === ENTRY_TYPE);
    const records = entries.map((e) => {
      const record = parseAttempt(e.data);
      if (
        record.basis !== e.parentId &&
        !(this.reader.getHeader?.()?.parentSession && !branch.some((entry) => entry.id === record.basis))
      )
        throw new Error("Astra attempt anchor mismatch");
      return record;
    });
    if (new Set(records.map((r) => r.id)).size !== records.length) throw new Error("Duplicate Astra attempt");
    const parents = new Map();
    for (const record of records) {
      const parent = record.parent === null ? undefined : parents.get(record.parent);
      if (
        record.parent !== null &&
        (!parent ||
          parent.key !== record.key ||
          parent.generation !== record.generation ||
          parent.envelope !== record.envelope ||
          parent.baseline !== record.baseline ||
          parent.length > record.length)
      )
        throw new Error("Invalid Astra history parent");
      const expected = record.update?.effort ?? parent?.effective ?? record.baseline;
      if (record.effective !== expected || (record.update && record.update.at < (parent?.length ?? 0)))
        throw new Error("Invalid Astra effective effort");
      parents.set(record.id, record);
    }
    const unknown = entries.some((e) => this.acknowledged.get(e.id) !== JSON.stringify(e));
    const file = this.reader.getSessionFile();
    if (unknown && file && branch.some((e) => e.type === "message" && e.message?.role === "assistant")) {
      const sessionId = this.reader.getSessionId(),
        leaf = this.reader.getLeafId();
      const snapshot = await readOnlySessionSnapshot(file);
      const persisted = activeReadOnlySessionBranch(snapshot, leaf);
      if (
        snapshot.sessionId !== sessionId ||
        this.reader.getLeafId() !== leaf ||
        JSON.stringify(persisted) !== JSON.stringify(branch)
      )
        throw new Error("Astra persisted ancestry differs");
    }
    for (const entry of entries) this.acknowledged.set(entry.id, JSON.stringify(entry));
    return records;
  }
  generation() {
    let generation = "root",
      model;
    for (const entry of this.branch()) {
      if (entry.type === "compaction" || entry.type === "branch_summary") generation = entry.id;
      if (entry.type === "model_change") {
        const next = `${entry.provider}/${entry.modelId}`;
        if (model !== next) generation = entry.id;
        model = next;
      }
    }
    return generation;
  }
  append(record) {
    try {
      if (this.reader.getLeafId() !== record.basis) throw new Error("Astra request ancestry changed");
      this.pi.appendEntry(ENTRY_TYPE, record);
      const entry = this.branch().find(
        (e) => e.type === "custom" && e.customType === ENTRY_TYPE && e.data?.id === record.id,
      );
      if (!entry || entry.parentId !== record.basis || JSON.stringify(entry.data) !== JSON.stringify(record))
        throw new Error("Astra append not acknowledged");
      this.acknowledged.set(entry.id, JSON.stringify(entry));
    } catch (error) {
      this.fault = "Astra append uncertain; native effort retained until session recovery";
      throw error;
    }
  }
}

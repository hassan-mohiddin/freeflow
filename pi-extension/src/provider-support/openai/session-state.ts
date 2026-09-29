import { persistedBranchMatches } from "../../host/read-only-session.js";
import { ENTRY_TYPE, parseAttempt, type Attempt } from "./history.js";

export class SessionState {
  private acknowledged = new Map<string, string>();
  private fault?: string;
  constructor(
    private readonly pi: any,
    private readonly reader: any,
  ) {}
  private branch(): any[] {
    const entries = this.reader.getBranch();
    let parent: string | null = null;
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!entry.id || seen.has(entry.id) || entry.parentId !== parent)
        throw new Error("Invalid OpenAI effort session ancestry");
      seen.add(entry.id);
      parent = entry.id;
    }
    if (parent !== this.reader.getLeafId()) throw new Error("OpenAI effort session leaf changed");
    return entries;
  }
  async records(): Promise<Attempt[]> {
    if (this.fault) throw new Error(this.fault);
    const branch = this.branch();
    // Model visits and branch summaries preserve compatible history; compaction does not. A branch summary
    // follows its branch point, leaving the path before it unchanged. Records written while branch summaries
    // still started a generation carry that earlier boundary and stay readable.
    const boundaries = new Map<string, string>(),
      earlier = new Map<string, string>();
    let epoch = "root",
      earlierEpoch = "root";
    for (const entry of branch) {
      if (entry.type === "compaction") epoch = entry.id;
      if (entry.type === "compaction" || entry.type === "branch_summary") earlierEpoch = entry.id;
      boundaries.set(entry.id, epoch);
      earlier.set(entry.id, earlierEpoch);
    }
    const entries = branch.filter((e) => e.type === "custom" && e.customType === ENTRY_TYPE);
    const records = entries.map((e) => {
      const record = parseAttempt(e.data);
      if (
        record.basis !== e.parentId &&
        !(this.reader.getHeader?.()?.parentSession && !branch.some((entry) => entry.id === record.basis))
      )
        throw new Error("OpenAI effort attempt anchor mismatch");
      if (record.generation !== boundaries.get(e.id) && record.generation !== earlier.get(e.id))
        throw new Error("OpenAI effort history generation unavailable");
      return record;
    });
    if (new Set(records.map((r) => r.id)).size !== records.length) throw new Error("Duplicate OpenAI effort attempt");
    const parents = new Map<string, Attempt>();
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
        throw new Error("Invalid OpenAI effort history parent");
      const expected = record.update?.effort ?? parent?.effective ?? record.baseline;
      if (record.effective !== expected || (record.update && record.update.at < (parent?.length ?? 0)))
        throw new Error("Invalid OpenAI effective effort");
      parents.set(record.id, record);
    }
    const unknown = entries.some((e) => this.acknowledged.get(e.id) !== JSON.stringify(e));
    const file = this.reader.getSessionFile();
    if (unknown && file && branch.some((e) => e.type === "message" && e.message?.role === "assistant")) {
      const leaf = this.reader.getLeafId();
      if (!(await persistedBranchMatches(this.reader, leaf, branch)) || this.reader.getLeafId() !== leaf)
        throw new Error("OpenAI effort persisted ancestry differs");
    }
    for (const entry of entries) this.acknowledged.set(entry.id, JSON.stringify(entry));
    return records;
  }
  generation(): string {
    let generation = "root";
    for (const entry of this.branch()) {
      if (entry.type === "compaction") generation = entry.id;
    }
    return generation;
  }
  append(record: Attempt): void {
    try {
      if (this.reader.getLeafId() !== record.basis) throw new Error("OpenAI effort request ancestry changed");
      this.pi.appendEntry(ENTRY_TYPE, record);
      const entry = this.branch().find(
        (e) => e.type === "custom" && e.customType === ENTRY_TYPE && e.data?.id === record.id,
      );
      if (!entry || entry.parentId !== record.basis || JSON.stringify(entry.data) !== JSON.stringify(record))
        throw new Error("OpenAI effort append not acknowledged");
      this.acknowledged.set(entry.id, JSON.stringify(entry));
    } catch (error) {
      this.fault = "OpenAI effort append uncertain; native effort retained until session recovery";
      throw error;
    }
  }
}

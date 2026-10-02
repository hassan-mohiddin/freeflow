import { createHash } from "node:crypto";
import {
  carryBudget,
  carryProblem,
  estimateTokens,
  latestUserMessages,
  readCarriedFile,
  renderCarried,
  SUMMARY_LIMIT_TOKENS,
  type CarriedFile,
  type CarryFile,
} from "./carry.js";
import { cycleFiles, cycleStart, harnessPart, nextCycle, recentWorkingRecord } from "./harness.js";

/**
 * Freeflow compaction's agent path. The agent asks to compact with freeflow_compact once compaction is due (a
 * Freeflow notice, or the user's /freeflow compact). At the end of that turn Freeflow writes Pi's compaction entry,
 * keeping nothing raw, followed by the carried context and a recovery message, and asks Pi to continue the same run.
 * Pi fires no compaction events for this, so the caller runs Freeflow's post-compaction resets before the next
 * request (takeCompacted).
 */

export const CARRIED_TYPE = "freeflow-carried-context";
export const RECOVERY_TYPE = "freeflow-compaction-recovery";

export type ArmReason = "notice" | "command";

export interface CompactionHost {
  effective(): boolean;
  /** The routing profile running now, when Cognitive Routing is active. */
  routingProfile(): string | undefined;
  background(): readonly { id: string; label: string; outputPath: string }[];
}

export interface Compacted {
  /** Files carried into the new cycle, as given; the model holds their current content. */
  carriedFiles: string[];
}

const ABNORMAL_STOPS = new Set(["error", "aborted", "length"]);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export class CompactionController {
  private armed?: ArmReason;
  private pending?: { summary: string; carry: CarryFile[] };
  private compacted?: Compacted;

  constructor(private readonly host: CompactionHost) {}

  /** Session start or shutdown: nothing is due, scheduled or waiting to reset. */
  reset(): void {
    this.armed = undefined;
    this.pending = undefined;
    this.compacted = undefined;
  }

  /** Compaction is due: a notice was sent, or the user ran /freeflow compact. */
  arm(reason: ArmReason): void {
    this.armed = reason;
  }

  isArmed(): boolean {
    return this.armed !== undefined;
  }

  /** Check a freeflow_compact call and schedule it for the end of this turn; throws with the reason it is refused. */
  async request(params: any, ctx: any): Promise<string> {
    if (!this.host.effective()) throw new Error("Freeflow compaction is turned off.");
    if (!this.armed)
      throw new Error(
        "Compaction is not due. Freeflow says when it is; the user can also ask for it with /freeflow compact.",
      );
    const summary = typeof params?.summary === "string" ? params.summary.trim() : "";
    if (!summary) throw new Error("Write the summary before compacting: summary must not be empty.");
    const summaryTokens = estimateTokens(summary);
    if (summaryTokens > SUMMARY_LIMIT_TOKENS)
      throw new Error(
        `The summary is about ${summaryTokens} tokens; the limit is ${SUMMARY_LIMIT_TOKENS}. Shorten it by about ${summaryTokens - SUMMARY_LIMIT_TOKENS} tokens and call freeflow_compact again.`,
      );
    const carry: CarryFile[] = params?.carry === undefined ? [] : params.carry;
    if (!Array.isArray(carry)) throw new Error("carry must be a list of { file, lines? } items.");
    const problems = carry.map(carryProblem).filter(Boolean);
    if (problems.length) throw new Error(`Fix the carry list: ${problems.join("; ")}.`);
    const files = await Promise.all(carry.map((item) => readCarriedFile(item, ctx.cwd)));
    const unreadable = files.filter((file) => "error" in file) as { path: string; error: string }[];
    if (unreadable.length)
      throw new Error(
        `These files cannot be carried: ${unreadable.map((file) => `${file.path} (${file.error})`).join(", ")}. Remove or correct them.`,
      );
    const carriedTokens = files.reduce((sum, file) => sum + ("text" in file ? estimateTokens(file.text) : 0), 0);
    const budget = carryBudget(ctx.model?.contextWindow);
    if (carriedTokens > budget)
      throw new Error(
        `The carried files are about ${carriedTokens} tokens; the budget is ${budget}. Drop or narrow about ${carriedTokens - budget} tokens (line ranges help) and re-read the rest during recovery.`,
      );
    this.pending = { summary, carry };
    return `Compaction will happen at the end of this turn: about ${carriedTokens} tokens of files carried. The run then continues from the summary, the carried context and a recovery message.`;
  }

  /** At turn end, the entries that compact the session, or undefined when nothing is scheduled. */
  async turnEnd(event: any, ctx: any): Promise<{ entries: any[]; continue: true } | undefined> {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending || !this.host.effective()) return undefined;
    // A turn that failed or was cut off may not have finished preparing; compaction stays due.
    if (ABNORMAL_STOPS.has(event?.message?.stopReason)) return undefined;

    const branch: any[] = ctx.sessionManager?.getBranch?.() ?? [];
    const cycle = nextCycle(branch);
    const recordPath = await recentWorkingRecord(ctx.cwd, cycleStart(branch));
    const files = await Promise.all(pending.carry.map((item) => readCarriedFile(item, ctx.cwd)));
    const previous = previousCarried(branch);
    const summary = `${pending.summary}\n\n${harnessPart({
      cycle,
      recordPath,
      routingProfile: this.host.routingProfile(),
      background: this.host.background(),
      files: cycleFiles(branch),
    })}`;
    const carriedText = renderCarried(cycle, latestUserMessages(branch), files);
    const recovery = recordPath
      ? `Compaction finished; cycle ${cycle} starts here. Recover before continuing: read the Working Record at ${recordPath} first, check the carried context, re-read whatever else you need, then continue the interrupted work.`
      : `Compaction finished; cycle ${cycle} starts here. There is no Working Record for this work, so recover from the summary above and the carried context: re-read the sources the summary lists, then continue the interrupted work.`;

    this.armed = undefined;
    this.compacted = { carriedFiles: files.filter((file) => "text" in file).map((file) => file.path) };
    return {
      entries: [
        {
          type: "compaction",
          summary,
          firstKeptEntryId: null,
          details: {
            freeflow: {
              version: 1,
              cycle,
              carried: files.map((file) => carriedRecord(file, cycle, previous)),
              files: cycleFiles(branch),
              ...(recordPath ? { recordPath } : {}),
            },
          },
        },
        { type: "custom_message", customType: CARRIED_TYPE, content: carriedText, display: false },
        { type: "custom_message", customType: RECOVERY_TYPE, content: recovery, display: true },
      ],
      continue: true,
    };
  }

  /** The compaction written at the last turn end, once; the caller then runs the post-compaction resets. */
  takeCompacted(): Compacted | undefined {
    const compacted = this.compacted;
    this.compacted = undefined;
    return compacted;
  }
}

/** Files the previous Freeflow compaction carried, with the cycle each was first carried in. */
function previousCarried(branch: readonly any[]): Map<string, number> {
  const latest = [...branch].reverse().find((entry) => entry?.type === "compaction" && entry.details?.freeflow);
  const carried = new Map<string, number>();
  for (const item of latest?.details?.freeflow?.carried ?? [])
    if (item?.kind === "file" && typeof item.path === "string") carried.set(item.path, item.firstCycle);
  return carried;
}

function carriedRecord(file: CarriedFile, cycle: number, previous: Map<string, number>) {
  return {
    kind: "file",
    path: file.path,
    ...("lines" in file && file.lines ? { lines: file.lines } : {}),
    firstCycle: previous.get(file.path) ?? cycle,
    ...("text" in file ? { bodyHash: hash(file.text) } : { error: file.error }),
  };
}

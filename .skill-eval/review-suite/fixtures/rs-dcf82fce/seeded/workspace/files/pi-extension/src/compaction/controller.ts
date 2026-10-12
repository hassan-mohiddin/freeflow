import { createHash } from "node:crypto";
import {
  carryBudget,
  carryProblem,
  estimateTokens,
  isCarryResult,
  latestUserMessages,
  readCarriedFile,
  renderCarried,
  SUMMARY_LIMIT_TOKENS,
  type CarriedFile,
  type CarryFile,
  type CarryItem,
} from "./carry.js";
import { cycleFiles, harnessPart, nextCycle, previousFileLists, sessionFileLists } from "./harness.js";
import { renderIndex, resolveResult, resultIndex, type Result } from "./results.js";
import type { Thresholds } from "./thresholds.js";

/**
 * Freeflow compaction's agent path. After each turn Freeflow measures the context and, once per cycle each, says
 * compaction is due (the warning, with the result index) and then to compact now. The agent asks to compact with
 * freeflow_compact once compaction is due. At the end of that turn Freeflow writes Pi's compaction entry, keeping
 * nothing raw, followed by the carried context and a recovery message, and asks Pi to continue the same run. Pi fires
 * no compaction events for this, so the caller runs Freeflow's post-compaction resets before the next request
 * (takeCompacted).
 */

export const CARRIED_TYPE = "freeflow-carried-context";
export const RECOVERY_TYPE = "freeflow-compaction-recovery";
/** What /freeflow compact sends as the user's message; a list of results may follow it. */
export const USER_REQUEST =
  "Compact now: read the compaction skill, prepare the next cycle, and call freeflow_compact.";

export interface CompactionHost {
  effective(): boolean;
  /** The routing profile running now, when Cognitive Routing is active. */
  routingProfile(): string | undefined;
  /** The routing assignment in progress, when Cognitive Routing is active and a worker holds one. */
  routingAssignment(): string | undefined;
  background(): readonly { id: string; label: string; outputPath: string }[];
  /** Context size that the next request receiving the full history would carry, and the thresholds to judge it. */
  measure(ctx: any): { tokens: number; thresholds: Thresholds } | undefined;
  /** Prefix that marks a harness message as not written by the user. */
  noticePrefix: string;
  /** The Coordinator is running under projection: its view leaves out what workers did, so it delegates compaction. */
  coordinatorUnderProjection(): boolean;
  /** Context reuse: the agent may carry selected files and tool results into the next cycle. */
  carryEnabled(): boolean;
  /**
   * Cognitive Routing is on, so the agent's context already names each tool result by routing's source ref; Freeflow
   * then inserts no list, and carries results by those refs.
   */
  nativeRefs(): boolean;
  /** A routing source ref's tool result, or undefined when it names no carryable result. */
  resolveRef(ref: string): { tool: string; text: string } | undefined;
  /** Pi's own summarizer over Pi's preparation, with extra instructions; throws on failure. */
  summarize(preparation: any, instructions: string, signal: AbortSignal | undefined, ctx: any): Promise<any>;
}

export interface Compacted {
  /** Files carried into the new cycle, as given; the model holds their current content. */
  carriedFiles: string[];
}

export type Notice = { level: "warning" | "compactNow"; text: string };

const ABNORMAL_STOPS = new Set(["error", "aborted", "length"]);
/** Pi checks its own threshold only after a run ends, so within a run "compact now" repeats as context keeps growing. */
const COMPACT_NOW_REPEAT = 10_000;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const branchOf = (ctx: any): any[] => ctx.sessionManager?.getBranch?.() ?? [];
const cycleOf = (branch: readonly any[]) => nextCycle(branch) - 1;

export class CompactionController {
  /** The user ran /freeflow compact in this cycle. */
  private requested?: number;
  /** Notices sent in the current cycle. */
  private sent: { cycle: number; warning: boolean; compactNowAt?: number } = { cycle: 0, warning: false };
  private pending?: { summary: string; carry: CarryItem[] };
  private compacted?: Compacted;

  constructor(private readonly host: CompactionHost) {}

  /** Session start or shutdown: nothing is due, scheduled or waiting to reset. */
  reset(): void {
    this.requested = undefined;
    this.sent = { cycle: 0, warning: false };
    this.pending = undefined;
    this.compacted = undefined;
  }

  /** The user's /freeflow compact: compaction is due now, in this cycle. */
  requestByUser(ctx: any): void {
    this.requested = cycleOf(branchOf(ctx));
  }

  /** Due when the user asked in this cycle, or the context has reached the warning point. */
  isDue(ctx: any): boolean {
    if (this.requested === cycleOf(branchOf(ctx))) return true;
    const measured = this.host.measure(ctx);
    return measured !== undefined && measured.tokens >= measured.thresholds.warning;
  }

  /** The compaction part of /freeflow status: the cycle, context against each point, and the last compaction. */
  statusText(ctx: any): string | undefined {
    if (!this.host.effective()) return undefined;
    const branch = branchOf(ctx);
    const k = (tokens: number) => `${Math.round(tokens / 1000)}k`;
    const parts = [`cycle ${cycleOf(branch)}`];
    const measured = this.host.measure(ctx);
    if (measured) {
      const { tokens, thresholds } = measured;
      parts.push(
        `context about ${k(tokens)} of ${k(thresholds.window)} (warning ${k(thresholds.warning)}, compact now ${k(thresholds.compactNow)}, Pi compacts at ${k(thresholds.trigger)})`,
      );
    }
    const index = branch.map((entry) => entry?.type).lastIndexOf("compaction");
    if (index >= 0) {
      const freeflow = branch[index].details?.freeflow;
      const carried = branch
        .slice(index + 1)
        .find((entry) => entry?.type === "custom_message" && entry.customType === CARRIED_TYPE);
      const kind = !freeflow ? "Pi" : freeflow.fallback ? "Pi with Freeflow's additions" : "Freeflow";
      parts.push(
        `last compaction: ${kind}${carried ? `, carried about ${k(estimateTokens(String(carried.content ?? "")))}` : ""}`,
      );
    }
    return parts.join(", ");
  }

  /**
   * The result list for this cycle, or "" when none is needed: context reuse is off, or routing's refs already name
   * every result in the agent's context.
   */
  indexText(ctx: any): string {
    if (!this.host.carryEnabled() || this.host.nativeRefs()) return "";
    return renderIndex(resultIndex(branchOf(ctx)));
  }

  /** The carry budget for this context: from the window, capped by the room before the warning. */
  private budget(ctx: any): number {
    return carryBudget(ctx.model?.contextWindow, this.host.measure(ctx)?.thresholds.warning);
  }

  /** How the notices tell the agent what it may carry. */
  private carryText(ctx: any): string {
    if (!this.host.carryEnabled())
      return "context reuse is off, so carry nothing; the user's latest messages are carried for you";
    const how = this.host.nativeRefs()
      ? "files by path, tool results by their routing ref such as ctx:1a2b3c4d"
      : "files by path, tool results by id below";
    return `choose what to carry (budget ${this.budget(ctx)} tokens: ${how})`;
  }

  /**
   * After a turn: the notice to deliver. The warning comes once per cycle; "compact now" comes when the context
   * crosses its point and again each time it grows another COMPACT_NOW_REPEAT tokens.
   */
  observe(ctx: any): Notice | undefined {
    if (!this.host.effective()) return undefined;
    const branch = branchOf(ctx);
    const cycle = cycleOf(branch);
    if (this.sent.cycle !== cycle) this.sent = { cycle, warning: false };
    const measured = this.host.measure(ctx);
    if (!measured) return undefined;
    const { tokens: measuredTokens, thresholds } = measured;
    // A list inserted with the notice is context too, so it moves the point earlier by its own size.
    const listTokens = this.sent.warning ? 0 : estimateTokens(this.indexText(ctx));
    const tokens = measuredTokens + listTokens;
    const level = tokens >= thresholds.compactNow ? "compactNow" : tokens >= thresholds.warning ? "warning" : undefined;
    if (!level) return undefined;
    if (level === "warning" && this.sent.warning) return undefined;
    const repeat = level === "compactNow" && this.sent.compactNowAt !== undefined;
    if (repeat && tokens < this.sent.compactNowAt! + COMPACT_NOW_REPEAT) return undefined;
    const withList = !this.sent.warning || (level === "compactNow" && !repeat);
    this.sent.warning = true;
    if (level === "compactNow") this.sent.compactNowAt = tokens;
    return { level, text: this.noticeText(level, tokens, thresholds, ctx, withList) };
  }

  private noticeText(
    level: Notice["level"],
    tokens: number,
    thresholds: Thresholds,
    ctx: any,
    withList = true,
  ): string {
    const prefix = this.host.noticePrefix;
    const { window, trigger } = thresholds;
    if (this.host.coordinatorUnderProjection())
      return `${prefix} ${level === "compactNow" ? "Compact now" : "Compaction is due"}: the full history is about ${tokens} of ${window} tokens, and Pi compacts on its own at about ${trigger}. Your view leaves out what workers did, so do not compact yourself: delegate an assignment asking the worker to read the compaction skill, compact with freeflow_compact, and then return with freeflow_return; then continue.`;
    const index = withList ? this.indexText(ctx) : "";
    const list = index ? `\n\n${index}` : "";
    if (level === "compactNow")
      return `${prefix} Compact now: context is at about ${tokens} of ${window} tokens. Pi compacts on its own past about ${trigger} once this run ends, or when a request overflows the model's window. Finish preparing and call freeflow_compact; if Pi compacts first, its own summary replaces yours.${list}`;
    return `${prefix} Compaction is due: context is at about ${tokens} of ${window} tokens, and Pi compacts on its own past about ${trigger} once this run ends. Read the compaction skill and prepare now: update the Working Record, ${this.carryText(ctx)}, write the summary, then call freeflow_compact. A "compact now" notice follows near Pi's limit.${list}`;
  }

  /** Check a freeflow_compact call and schedule it for the end of this turn; throws with the reason it is refused. */
  async request(params: any, ctx: any): Promise<string> {
    if (!this.host.effective()) throw new Error("Freeflow compaction is turned off.");
    if (this.host.coordinatorUnderProjection())
      throw new Error(
        "Your view leaves out what workers did, so do not compact yourself: delegate an assignment asking the worker to read the compaction skill, compact with freeflow_compact, and then return with freeflow_return.",
      );
    if (!this.isDue(ctx)) throw new Error(notDueText(branchOf(ctx)));
    const summary = typeof params?.summary === "string" ? params.summary.trim() : "";
    if (!summary) throw new Error("Write the summary before compacting: summary must not be empty.");
    const summaryTokens = estimateTokens(summary);
    if (summaryTokens > SUMMARY_LIMIT_TOKENS)
      throw new Error(
        `The summary is about ${summaryTokens} tokens; the limit is ${SUMMARY_LIMIT_TOKENS}. Shorten it by about ${summaryTokens - SUMMARY_LIMIT_TOKENS} tokens and call freeflow_compact again.`,
      );
    const carry: CarryItem[] = params?.carry === undefined ? [] : params.carry;
    if (!Array.isArray(carry)) throw new Error("carry must be a list of { file, lines? } or { result } items.");
    if (carry.length && !this.host.carryEnabled())
      throw new Error(
        "Context reuse is off: call freeflow_compact without carry. The user's latest messages are carried for you.",
      );
    const problems = carry.map(carryProblem).filter(Boolean);
    if (problems.length) throw new Error(`Fix the carry list: ${problems.join("; ")}.`);
    const { files, results, missing } = await this.read(carry, ctx);
    const unreadable = files.filter((file) => "error" in file) as { path: string; error: string }[];
    if (unreadable.length || missing.length)
      throw new Error(
        `These cannot be carried: ${[
          ...unreadable.map((file) => `${file.path} (${file.error})`),
          ...missing.map(
            (id) =>
              `${id} (${this.host.nativeRefs() ? "no routing ref of a carryable tool result" : "no such result"})`,
          ),
        ].join(", ")}. Remove or correct them.`,
      );
    const carriedTokens =
      files.reduce((sum, file) => sum + ("text" in file ? estimateTokens(file.text) : 0), 0) +
      results.reduce((sum, result) => sum + result.tokens, 0);
    const budget = this.budget(ctx);
    if (carriedTokens > budget)
      throw new Error(
        `The carried items are about ${carriedTokens} tokens; the budget is ${budget}. Drop or narrow about ${carriedTokens - budget} tokens (line ranges help) and re-read the rest during recovery.`,
      );
    this.pending = { summary, carry };
    return `Compaction will happen at the end of this turn: about ${carriedTokens} tokens carried. The run then continues from the summary, the carried context and a recovery message.`;
  }

  private async read(carry: readonly CarryItem[], ctx: any) {
    const branch = branchOf(ctx);
    const files = await Promise.all(
      carry.filter((item) => !isCarryResult(item)).map((item) => readCarriedFile(item as CarryFile, ctx.cwd)),
    );
    const ids = carry.filter(isCarryResult).map((item) => item.result);
    const resolve = (id: string): Result | undefined => {
      if (!this.host.nativeRefs()) return resolveResult(branch, id);
      const source = this.host.resolveRef(id);
      return source && { id, tool: source.tool, label: id, tokens: estimateTokens(source.text), text: source.text };
    };
    const results = ids.map(resolve).filter(Boolean) as Result[];
    const missing = ids.filter((id) => !results.some((result) => result.id === id));
    return { files, results, missing };
  }

  /** At turn end, the entries that compact the session, or undefined when nothing is scheduled. */
  async turnEnd(event: any, ctx: any): Promise<{ entries: any[]; continue: true } | undefined> {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending || !this.host.effective()) return undefined;
    // A turn that failed or was cut off may not have finished preparing; compaction stays due.
    if (ABNORMAL_STOPS.has(event?.message?.stopReason)) return undefined;

    const branch = branchOf(ctx);
    const cycle = nextCycle(branch);
    const requestedBy = this.requested === cycleOf(branch) ? "user" : "notice";
    const { files, results } = await this.read(pending.carry, ctx);
    const previous = previousCarried(branch);
    const summary = `${pending.summary}\n\n${harnessPart({
      cycle,
      requestedBy,
      routingProfile: this.host.routingProfile(),
      background: this.host.background(),
      files: sessionFileLists(branch),
    })}`;
    const userMessages = latestUserMessages(branch, (message) => message.startsWith(USER_REQUEST));
    const carriedText = renderCarried(this.host.noticePrefix, cycle, userMessages, files, results);
    const recovery = `${this.host.noticePrefix} ${recoveryText(cycle, "The carried context is above. ")} ${AFTER_REQUESTED}`;

    this.requested = undefined;
    this.compacted = { carriedFiles: files.filter((file) => "text" in file).map((file) => file.path) };
    return {
      entries: [
        {
          type: "compaction",
          summary,
          firstKeptEntryId: null,
          details: {
            // Pi's own details shape, so later compactions (Pi's or Freeflow's) carry the lists forward.
            ...sessionFileLists(branch),
            freeflow: {
              version: 1,
              cycle,
              carried: [
                ...files.map((file) => fileRecord(file, cycle, previous)),
                ...results.map((result) => resultRecord(result, cycle, previous)),
              ],
              files: cycleFiles(branch),
              requestedBy,
              ...(this.host.routingProfile() ? { profile: this.host.routingProfile() } : {}),
              ...(this.host.routingAssignment() ? { assignment: this.host.routingAssignment() } : {}),
            },
          },
        },
        { type: "custom_message", customType: CARRIED_TYPE, content: carriedText, display: false },
        { type: "custom_message", customType: RECOVERY_TYPE, content: recovery, display: true },
      ],
      continue: true,
    };
  }

  /**
   * Pi is compacting on its own (its threshold, an overflow, or /compact). Freeflow keeps Pi's summarizer and kept
   * tail, adds its summary instructions, and appends its own state with recovery steps. A scheduled Freeflow
   * compaction is dropped: Pi's compaction replaces it. Returns undefined, so Pi compacts as usual, when compaction
   * is off or anything fails; it never cancels Pi's compaction.
   */
  async fallback(event: any, ctx: any): Promise<{ compaction: any } | undefined> {
    this.pending = undefined;
    if (!this.host.effective()) return undefined;
    try {
      const branch = branchOf(ctx);
      const cycle = nextCycle(branch);
      const instructions = [FALLBACK_INSTRUCTIONS, event.customInstructions].filter(Boolean).join("\n\n");
      // Pi merges the previous compaction's file lists only when Pi wrote it; add them back for Freeflow's.
      const previousFiles = previousFileLists(branch);
      const fileOps = event.preparation?.fileOps;
      if (fileOps?.read && fileOps?.edited) {
        for (const path of previousFiles.readFiles) fileOps.read.add(path);
        for (const path of previousFiles.modifiedFiles) fileOps.edited.add(path);
      }
      const result = await this.host.summarize(event.preparation, instructions, event.signal, ctx);
      if (!result?.summary) return undefined;
      const summary = `${result.summary}\n\n${harnessPart({
        cycle,
        routingProfile: this.host.routingProfile(),
        background: this.host.background(),
        files: { readFiles: [], modifiedFiles: [] },
        includeFiles: false,
        recovery: `${recoveryText(cycle)} ${AFTER_PI}`,
      })}`;
      this.requested = undefined;
      return {
        compaction: {
          ...result,
          summary,
          details: {
            ...(result.details ?? {}),
            freeflow: { version: 1, cycle, fallback: true, carried: [] },
          },
        },
      };
    } catch {
      // Pi's own compaction is the fallback's fallback.
      return undefined;
    }
  }

  /** The compaction written at the last turn end, once; the caller then runs the post-compaction resets. */
  takeCompacted(): Compacted | undefined {
    const compacted = this.compacted;
    this.compacted = undefined;
    return compacted;
  }
}

/** Freeflow's additions to Pi's own summarizer, written for a reader that summarizes someone else's conversation. */
const FALLBACK_INSTRUCTIONS = [
  "Write state, not a story: what is true now, each item marked as settled, tentative, superseded, or unverified.",
  "Keep exact paths, identifiers, commands, error text, numbers, and the user's words where wording matters; never paraphrase a decision or a constraint.",
  "Never record a requested, reported, or expected result as observed. Name partial or uncommitted changes, unverified results, running commands, and obligations with what triggers each.",
  "Say what the user has authorized and what still needs asking.",
  "If the conversation uses a Working Record (.freeflow/tasks/*/record.md), name its path and do not restate what it holds; keep what it does not hold.",
].join(" ");

/**
 * How to recover. Freeflow never names a Working Record here: it cannot tell which record belongs to this work, and
 * pointing at the wrong one sends recovery into another task. The summary names the record when there is one.
 */
function recoveryText(cycle: number, carried = ""): string {
  return `Compaction finished; cycle ${cycle} starts here. Recover before you continue: if the summary names a Working Record for this work, recover it as Track Work says; otherwise the summary is your record for this cycle, so re-read its Recovery sources. Reconcile with the live state your next step depends on, and verify work the summary calls done instead of redoing it. ${carried}Then continue the work the compaction interrupted.`;
}

/** The agent path: the compaction was the request, and it is done. */
const AFTER_REQUESTED =
  "This compaction completes the request for it: do not call freeflow_compact again in this cycle. If compacting was all you were asked to do, report that it is done (a worker returns its assignment with freeflow_return).";
/** Pi compacted on its own, so a Freeflow compaction being prepared is no longer needed. */
const AFTER_PI = "Compaction is no longer due: do not call freeflow_compact.";

/** Why freeflow_compact is refused when compaction is not due, and where to go next if a compaction began this cycle. */
function notDueText(branch: readonly any[]): string {
  const latest = [...branch].reverse().find((entry) => entry?.type === "compaction");
  const next =
    "Continue the work; if this is a routing assignment that only asked for compaction, return it with freeflow_return.";
  if (!latest)
    return "Compaction is not due. Freeflow says when it is; the user can also ask for it with /freeflow compact.";
  if (latest.details?.freeflow && !latest.details.freeflow.fallback)
    return `Compaction is not due: this cycle began with a compaction, and that compaction completed any compaction your request or assignment asked for. ${next}`;
  return `Compaction is not due: this cycle began with Pi's own compaction, so the compaction you were preparing is no longer needed. ${next}`;
}

/** What the previous Freeflow compaction carried (file paths and result ids), with the cycle each was first carried. */
function previousCarried(branch: readonly any[]): Map<string, number> {
  const latest = [...branch].reverse().find((entry) => entry?.type === "compaction" && entry.details?.freeflow);
  const carried = new Map<string, number>();
  for (const item of latest?.details?.freeflow?.carried ?? []) {
    const key = item?.kind === "file" ? item.path : item?.kind === "result" ? item.ref : undefined;
    if (typeof key === "string") carried.set(`${item.kind}:${key}`, item.firstCycle);
  }
  return carried;
}

function fileRecord(file: CarriedFile, cycle: number, previous: Map<string, number>) {
  return {
    kind: "file",
    path: file.path,
    ...("lines" in file && file.lines ? { lines: file.lines } : {}),
    firstCycle: previous.get(`file:${file.path}`) ?? cycle,
    ...("text" in file ? { bodyHash: hash(file.text) } : { error: file.error }),
  };
}

function resultRecord(result: Result, cycle: number, previous: Map<string, number>) {
  return {
    kind: "result",
    ref: result.id,
    tool: result.tool,
    firstCycle: previous.get(`result:${result.id}`) ?? cycle,
    bodyHash: hash(result.text),
  };
}

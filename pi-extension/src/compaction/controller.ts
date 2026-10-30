import { rm } from "node:fs/promises";
import { skillsRead } from "../tool-execution/skill-reads.js";
import { currentCycle, harnessPart, nextCycle, previousFileLists, sessionFileLists } from "./harness.js";
import { ROWS_AT, type Thresholds } from "./thresholds.js";
import { cachedBranch } from "../host/branch.js";
import type { Ran, StoreState } from "../store/layer.js";

/**
 * Freeflow compaction on Pi, on Track Work's bundle (task-004's Spec, section 9; P1, P5, P63). As the context grows,
 * one row each at 50, 60 and 70% of the window, then one soft notice a compaction cycle: keep working to a safe point,
 * checkpoint with --compact, end the turn. When a run that asked so ends, and the checkpoint is done (P68), Freeflow
 * writes Pi's compaction entry with the task's bundle (or the session summary's) as its summary, keeping nothing
 * raw, and Pi continues the run. Pi's own compaction stays the fallback, with the bundle after its summary (P16).
 */

export const RECOVERY_TYPE = "freeflow-compaction-recovery";
/** What /freeflow compact asks for, in a Freeflow notice. */
export const USER_REQUEST =
  "The user ran /freeflow compact: checkpoint now as Track Work says, with --compact, then end your turn; Freeflow then compacts the session with the record in place of the conversation and continues.";

export interface CompactionStore {
  /** The session's state in the store, as last read (never read on the way to a request). */
  current(): StoreState | undefined;
  /** Session status, read now. */
  refresh(): Promise<StoreState | undefined>;
  /** Run end: the state read again when this run touched the store, else undefined. */
  runEnded(): Promise<StoreState | undefined>;
  bundle(options: { fallback?: boolean; recent: boolean }): Promise<Ran>;
  answered(): Promise<void>;
  /** How the agent runs Track Work's script, for the notice. */
  command(): string;
}

export interface CompactionHost {
  effective(): boolean;
  /** The routing profile running now, when Cognitive Routing is active. */
  routingProfile(): string | undefined;
  /** The routing assignment in progress, when Cognitive Routing is active and a worker holds one. */
  routingAssignment(): string | undefined;
  background(): readonly { id: string; label: string; outputPath: string }[];
  /** Context size that the next request receiving the full history would carry, and the thresholds to judge it. */
  measure(ctx: any, turn?: TurnEnd): { tokens: number; thresholds: Thresholds } | undefined;
  /** Freeflow's notice tag around a notice's text (freeflowNotice in host/inbound.ts). */
  notice(text: string): string;
  /** The Coordinator is running under projection: its view leaves out what workers did, so it delegates the checkpoint. */
  coordinatorUnderProjection(): boolean;
  /** Context reuse: the bundle carries this compaction cycle's newest tool results (Pi's compaction.carry). */
  carryEnabled(): boolean;
  /** Pi's own summarizer over Pi's preparation, with extra instructions; throws on failure. */
  summarize(preparation: any, instructions: string, signal: AbortSignal | undefined, ctx: any): Promise<any>;
  store: CompactionStore;
}

export interface Compacted {
  /** Files carried into the new cycle, whose content the model holds. */
  carriedFiles: string[];
}

export type Notice = { level: "row" | "notice"; text: string };
/** The turn that just ended, as Pi's turn_end reports it: its assistant message and tool results. */
export type TurnEnd = { message?: any; toolResults?: readonly any[] };

const branchOf = (ctx: any): readonly any[] => cachedBranch(ctx.sessionManager);
/** A turn that failed or was cut off compacts nothing: the request waits for the next run's end. */
const ABNORMAL_STOPS = new Set(["error", "aborted", "length"]);
const cycleOf = (branch: readonly any[]) => nextCycle(branch) - 1;
const k = (tokens: number) => `${Math.round(tokens / 1000)}k`;
const share = (tokens: number, window: number) =>
  `${Math.round((100 * tokens) / window)}% of its window (${tokens} of ${window} tokens)`;
/** What a safe point is: where stopping loses nothing that is not written down. */
const SAFE_POINT =
  "a finished step whose result you know (a check run and read, a set of edits complete, a report written), not mid-edit or with a command still running";

export class CompactionController {
  /** What this cycle has shown: the highest row, and when its one notice came. */
  private sent: { cycle: number; row: number; noticeAt?: number } = { cycle: 0, row: 0 };
  /** When this session started, the start of its first cycle. */
  private startedAt = Date.now();
  private compacted?: Compacted;

  constructor(private readonly host: CompactionHost) {}

  /** Session start or shutdown: nothing shown, nothing waiting to reset. */
  reset(): void {
    this.sent = { cycle: 0, row: 0 };
    this.startedAt = Date.now();
    this.compacted = undefined;
  }

  /** The compaction part of /freeflow status: the cycle, context against the notice and Pi's own point, the last compaction. */
  statusText(ctx: any): string | undefined {
    if (!this.host.effective()) return undefined;
    const branch = branchOf(ctx);
    const parts = [`cycle ${cycleOf(branch)}`];
    const measured = this.host.measure(ctx);
    if (measured) {
      const { tokens, thresholds } = measured;
      parts.push(
        `context about ${k(tokens)} of ${k(thresholds.window)} (notice ${k(thresholds.notice)}, Pi compacts at ${k(thresholds.trigger)})`,
      );
    }
    const latest = [...branch].reverse().find((entry) => entry?.type === "compaction");
    if (latest) {
      const freeflow = latest.details?.freeflow;
      parts.push(
        `last compaction: ${!freeflow ? "Pi" : freeflow.fallback ? "Pi with Freeflow's additions" : "Freeflow's, with the bundle"}`,
      );
    }
    return parts.join(", ");
  }

  /** After a turn: a row as the context crosses 50, 60 and 70%, or the cycle's one notice; never both, never again. */
  observe(ctx: any, turn?: TurnEnd): Notice | undefined {
    if (!this.host.effective()) return undefined;
    const cycle = cycleOf(branchOf(ctx));
    if (this.sent.cycle !== cycle) this.sent = { cycle, row: 0 };
    if (this.sent.noticeAt !== undefined) return undefined;
    const measured = this.host.measure(ctx, turn);
    if (!measured) return undefined;
    const { tokens, thresholds } = measured;
    if (tokens < thresholds.notice) {
      const row = ROWS_AT.filter((at) => tokens >= at * thresholds.window).at(-1);
      if (!row || row <= this.sent.row) return undefined;
      this.sent.row = row;
      return {
        level: "row",
        text: this.host.notice(
          `Compaction cycle ${cycle}: the context is at ${share(tokens, thresholds.window)}; the checkpoint notice comes at about ${thresholds.notice} tokens.`,
        ),
      };
    }
    this.sent.noticeAt = Date.now();
    return { level: "notice", text: this.host.notice(this.noticeText(cycle, tokens, thresholds)) };
  }

  private noticeText(cycle: number, tokens: number, thresholds: Thresholds): string {
    const head = `Compaction cycle ${cycle}: the context is at ${share(tokens, thresholds.window)}, and Pi compacts on its own at about ${thresholds.trigger} tokens.`;
    if (this.host.coordinatorUnderProjection())
      return `${head} Your view leaves out what workers did, so do not checkpoint yourself: at a safe point (after the current assessment, or before the next assignment), delegate an assignment asking the worker to checkpoint as Track Work says, with --compact, and return with return_work; Freeflow compacts when the run ends.`;
    const command = this.host.store.command();
    const task = this.host.store.current()?.task;
    const checkpoint = task
      ? `At that point, checkpoint ${task.id}: rewrite its Current Context, adjust the rest of Current Work and Future Work, save as blocks any discussion in this cycle that shaped the work (discussion list, discussion save; skip it when there was none), then run ${command} checkpoint --record ${task.id} --compact --input - with In flight's lines.`
      : `If this session holds a task, checkpoint it as Track Work says, with --compact; if it holds none, write its summary with ${command} checkpoint --session --compact --input - (Goal, Settled, Open, Agreement, In flight, Read when, Next action).`;
    return `${head} Keep working until a safe point: ${SAFE_POINT}. If your work ends within a step or two, finish it first. ${checkpoint} Then end your turn: Freeflow compacts the session with the record in place of the conversation, and the run continues. This is the only notice this compaction cycle; if Pi compacts before the checkpoint, the record as of its last checkpoint follows Pi's summary.`;
  }

  /**
   * Whether the checkpoint this cycle asked for is done: the record's State as of, or the summary's time, is later
   * than the cycle's notice, or than its start when no notice came (T12, P68).
   */
  private checkpointDone(state: StoreState, branch: readonly any[]): boolean {
    const asOf = state.store && state.task ? state.task.stateAsOf : state.summary?.asOf;
    if (!asOf) return false;
    const latest = [...branch].reverse().find((entry) => entry?.type === "compaction");
    const cycleStart = latest?.timestamp ? Date.parse(latest.timestamp) : this.startedAt;
    const since =
      this.sent.cycle === cycleOf(branch) && this.sent.noticeAt !== undefined ? this.sent.noticeAt : cycleStart;
    return Date.parse(asOf) > since;
  }

  /**
   * A run is ending: its last turn, with no tool calls, has ended. After a run that touched the store, the state is read
   * again and synced; when checkpoint --compact waits and the checkpoint is done, the entries that compact the session
   * with the bundle, and a continuation. A turn that failed or was cut off compacts nothing.
   */
  async settle(event: any, ctx: any): Promise<{ entries: any[]; continue: true } | undefined> {
    const state = await this.host.store.runEnded();
    if (!this.host.effective() || !state?.compact || state.compact.done) return undefined;
    if (ABNORMAL_STOPS.has(event?.message?.stopReason)) return undefined;
    const branch = branchOf(ctx);
    if (!this.checkpointDone(state, branch)) return undefined;
    const made = await this.host.store.bundle({ recent: this.host.carryEnabled() });
    if (made.code !== 0) {
      const [error] = made.stderr
        .replace(/^Error: /, "")
        .trim()
        .split("\n");
      return {
        entries: [
          {
            type: "custom_message",
            customType: RECOVERY_TYPE,
            content: this.host.notice(
              `Freeflow could not make the bundle, so it did not compact: ${error}. Mend what the error names, then checkpoint with --compact again.`,
            ),
            display: true,
          },
        ],
        continue: true,
      };
    }
    const cycle = nextCycle(branch);
    await this.host.store.answered();
    if (!state.task && state.summary?.path) await rm(state.summary.path, { force: true }).catch(() => {});
    this.compacted = { carriedFiles: [] };
    return {
      entries: [
        {
          type: "compaction",
          summary: `${made.stdout.trimEnd()}\n\n${this.harness(branch, ctx, cycle, "notice")}`,
          firstKeptEntryId: null,
          details: {
            // Pi's own details shape, so later compactions (Pi's or Freeflow's) carry the file lists forward.
            ...sessionFileLists(branch),
            freeflow: this.details(cycle, { bundle: state.task ? "task" : "session" }),
          },
        },
        {
          type: "custom_message",
          customType: RECOVERY_TYPE,
          content: this.host.notice(
            `Freeflow compacted the session after your checkpoint: compaction cycle ${cycle} starts here, and the conversation is now the ${state.task ? `bundle of ${state.task.id}` : "session summary's bundle"}. Continue from In flight and the Next action.`,
          ),
          display: true,
        },
      ],
      continue: true,
    };
  }

  private details(cycle: number, extra: Record<string, unknown>) {
    return {
      version: 2,
      cycle,
      ...extra,
      ...(this.host.routingProfile() ? { profile: this.host.routingProfile() } : {}),
      ...(this.host.routingAssignment() ? { assignment: this.host.routingAssignment() } : {}),
    };
  }

  private harness(branch: readonly any[], ctx: any, cycle: number, requestedBy?: "notice") {
    return harnessPart({
      cycle,
      ...(requestedBy ? { requestedBy } : {}),
      routingProfile: this.host.routingProfile(),
      background: this.host.background(),
      skills: skillsRead(currentCycle(branch), ctx.cwd),
      files: { readFiles: [], modifiedFiles: [] },
      includeFiles: false,
    });
  }

  /**
   * Pi is compacting on its own (its threshold, an overflow, or /compact). With the checkpoint done, the bundle is the
   * summary and Pi's kept tail stays; otherwise Pi's summarizer runs, told what the record holds, and the bundle as of
   * the last checkpoint follows its summary with the user's messages since (P16). Returns undefined, so Pi compacts as
   * usual, when compaction is off or anything fails; it never cancels Pi's compaction.
   */
  async fallback(event: any, ctx: any): Promise<{ compaction: any } | undefined> {
    if (!this.host.effective()) return undefined;
    try {
      const branch = branchOf(ctx);
      const cycle = nextCycle(branch);
      const state = await this.host.store.refresh();
      const recent = this.host.carryEnabled();
      if (state && (state.task || state.summary) && this.checkpointDone(state, branch)) {
        const made = await this.host.store.bundle({ recent });
        if (made.code === 0) {
          await this.host.store.answered();
          if (!state.task && state.summary?.path) await rm(state.summary.path, { force: true }).catch(() => {});
          return {
            compaction: {
              summary: `${made.stdout.trimEnd()}\n\n${this.harness(branch, ctx, cycle)}`,
              firstKeptEntryId: event.preparation.firstKeptEntryId,
              tokensBefore: event.preparation.tokensBefore,
              details: {
                ...sessionFileLists(branch),
                freeflow: this.details(cycle, { bundle: state.task ? "task" : "session" }),
              },
            },
          };
        }
      }
      const task = state?.store ? state.task : undefined;
      const note = task
        ? `Freeflow: the task's Working Record (${task.id}) holds the work up to its last checkpoint, ${task.stateAsOf}; keep in the summary what happened after that.`
        : FALLBACK_INSTRUCTIONS;
      const instructions = [note, event.customInstructions].filter(Boolean).join("\n\n");
      // Pi merges the previous compaction's file lists only when Pi wrote it; add them back for Freeflow's.
      const previousFiles = previousFileLists(branch);
      const fileOps = event.preparation?.fileOps;
      if (fileOps?.read && fileOps?.edited) {
        for (const path of previousFiles.readFiles) fileOps.read.add(path);
        for (const path of previousFiles.modifiedFiles) fileOps.edited.add(path);
      }
      const result = await this.host.summarize(event.preparation, instructions, event.signal, ctx);
      if (!result?.summary) return undefined;
      const after = task ? await this.host.store.bundle({ fallback: true, recent }) : undefined;
      const summary = [
        result.summary,
        this.harness(branch, ctx, cycle),
        after?.code === 0 ? after.stdout.trimEnd() : task ? FALLBACK_RECOVERY(task.id, this.host.store.command()) : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        compaction: {
          ...result,
          summary,
          details: { ...(result.details ?? {}), freeflow: this.details(cycle, { fallback: true }) },
        },
      };
    } catch {
      // Pi's own compaction is the fallback's fallback.
      return undefined;
    }
  }

  /** The compaction written at the last run end, once; the caller then runs the post-compaction resets. */
  takeCompacted(): Compacted | undefined {
    const compacted = this.compacted;
    this.compacted = undefined;
    return compacted;
  }
}

/**
 * Freeflow's additions to Pi's own summarizer for a session with no task, written for a reader that summarizes
 * someone else's conversation.
 */
const FALLBACK_INSTRUCTIONS = [
  "Write state, not a story: what is true now, each item marked as settled, tentative, superseded, or unverified.",
  "Keep exact paths, identifiers, commands, error text, numbers, and the user's words where wording matters; never paraphrase a decision or a constraint.",
  "Never record a requested, reported, or expected result as observed. Name partial or uncommitted changes, unverified results, running commands, and obligations with what triggers each.",
  "Say what the user has authorized and what still needs asking.",
].join(" ");

/** Where the next cycle recovers when the bundle could not be made after Pi's summary. */
const FALLBACK_RECOVERY = (task: string, command: string) =>
  `Freeflow could not add ${task}'s bundle after this summary: recover it with ${command} view recover --record ${task} and read what it lists.`;

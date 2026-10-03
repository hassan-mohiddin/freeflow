import { createHash } from "node:crypto";
import { resolveToolPath } from "../tool-execution/file-state.js";
import {
  carryBudget,
  carryProblem,
  estimateTokens,
  isCarryResult,
  latestUserMessages,
  readCarriedFile,
  renderCarried,
  renderCarriedForCoordinator,
  renderListed,
  SUMMARY_LIMIT_TOKENS,
} from "./carry.js";
import { cycleFiles, harnessPart, nextCycle, previousFileLists, sessionFileLists } from "./harness.js";
import { renderIndex, resolveResult, resultIndex, scopeResults } from "./results.js";
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
const ABNORMAL_STOPS = new Set(["error", "aborted", "length"]);
/** The most results the carried context lists by ref; the newest are listed. */
const MAX_LISTED = 60;
/** Pi checks its own threshold only after a run ends, so within a run "compact now" repeats as context keeps growing. */
const COMPACT_NOW_REPEAT = 10_000;
const hash = (text) => createHash("sha256").update(text).digest("hex");
const branchOf = (ctx) => ctx.sessionManager?.getBranch?.() ?? [];
const cycleOf = (branch) => nextCycle(branch) - 1;
export class CompactionController {
  host;
  /** The user ran /freeflow compact in this cycle. */
  requested;
  /** Notices sent in the current cycle. */
  sent = { cycle: 0, warning: false };
  pending;
  compacted;
  constructor(host) {
    this.host = host;
  }
  /** Session start or shutdown: nothing is due, scheduled or waiting to reset. */
  reset() {
    this.requested = undefined;
    this.sent = { cycle: 0, warning: false };
    this.pending = undefined;
    this.compacted = undefined;
  }
  /** The user's /freeflow compact: compaction is due now, in this cycle. */
  requestByUser(ctx) {
    this.requested = cycleOf(branchOf(ctx));
  }
  /** Due when the user asked in this cycle, or the context has reached the warning point. */
  isDue(ctx) {
    if (this.requested === cycleOf(branchOf(ctx))) return true;
    const measured = this.host.measure(ctx);
    return measured !== undefined && measured.tokens >= measured.thresholds.warning;
  }
  /** The compaction part of /freeflow status: the cycle, context against each point, and the last compaction. */
  statusText(ctx) {
    if (!this.host.effective()) return undefined;
    const branch = branchOf(ctx);
    const k = (tokens) => `${Math.round(tokens / 1000)}k`;
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
  indexText(ctx) {
    if (!this.host.carryEnabled() || this.host.nativeRefs()) return "";
    return renderIndex(resultIndex(branchOf(ctx)));
  }
  /** The carry budget for this context: from the window, capped by the room before the warning. */
  budget(ctx) {
    return carryBudget(ctx.model?.contextWindow, this.host.measure(ctx)?.thresholds.warning);
  }
  /** How the notices tell the agent what it may carry. */
  carryText(ctx) {
    if (!this.host.carryEnabled())
      return "context reuse is off, so carry nothing; the user's latest messages are carried for you";
    const how = this.host.nativeRefs()
      ? "tool results by their routing ref such as ctx:1a2b3c4d, files by path"
      : "tool results by id below, files by path";
    return `pick older work you will need (budget ${this.budget(ctx)} tokens; Freeflow adds your newest results itself; ${how})`;
  }
  /**
   * After a turn: the notice to deliver. The warning comes once per cycle; "compact now" comes when the context
   * crosses its point and again each time it grows another COMPACT_NOW_REPEAT tokens.
   */
  observe(ctx) {
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
    if (repeat && tokens < this.sent.compactNowAt + COMPACT_NOW_REPEAT) return undefined;
    const withList = !this.sent.warning || (level === "compactNow" && !repeat);
    this.sent.warning = true;
    if (level === "compactNow") this.sent.compactNowAt = tokens;
    return { level, text: this.noticeText(level, tokens, thresholds, ctx, withList) };
  }
  noticeText(level, tokens, thresholds, ctx, withList = true) {
    const prefix = this.host.noticePrefix;
    const { window, trigger } = thresholds;
    if (this.host.coordinatorUnderProjection())
      return `${prefix} ${level === "compactNow" ? "Compact now" : "Compaction is due soon"}: the full history is about ${tokens} of ${window} tokens, and Pi compacts on its own past about ${trigger} once this run ends. Your view leaves out what workers did, so do not compact yourself: ${level === "compactNow" ? "now" : "at a safe point (after the current assessment, or before the next assignment)"}, delegate an assignment asking the worker to read the compaction skill, compact with freeflow_compact, and then return with freeflow_return; then continue.`;
    const index = withList ? this.indexText(ctx) : "";
    const list = index ? `\n\n${index}` : "";
    // A worker's return hands the same history to the Coordinator and the next assignment, so it ends no growth.
    const worker = this.host.routingAssignment() !== undefined;
    if (level === "compactNow")
      return `${prefix} Compact now: context is at about ${tokens} of ${window} tokens. Pi compacts on its own past about ${trigger} once this run ends, or when a request overflows the model's window. The end of your current step is the safe point: write down any partial state, then prepare and call freeflow_compact; ${worker ? "compact before you return, since the next assignment continues this history; " : ""}if Pi compacts first, its own summary replaces yours.${list}`;
    const end = worker
      ? "If you are at one now, compact now. A return does not end this history: the Coordinator and the next assignment continue it, so compact before you return, not after."
      : "If you are at one now, compact now; if your work ends within a step or two with a final answer, finish it instead.";
    return `${prefix} Compaction is due soon: context is at about ${tokens} of ${window} tokens, and Pi compacts on its own past about ${trigger} once this run ends. Keep working until a safe point: a finished step whose result you know (a check read, an edit set complete, a report written), not mid-edit or with a command running. ${end} At the safe point, read the compaction skill, update the Working Record, ${this.carryText(ctx)}, write the summary, and call freeflow_compact. A "compact now" notice follows near Pi's limit.${list}`;
  }
  /** Check a freeflow_compact call and schedule it for the end of this turn; throws with the reason it is refused. */
  async request(params, ctx) {
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
    const carry = params?.carry === undefined ? [] : params.carry;
    if (!Array.isArray(carry)) throw new Error("carry must be a list of { file, lines? } or { result } items.");
    if (carry.length && !this.host.carryEnabled())
      throw new Error(
        "Context reuse is off: call freeflow_compact without carry. The user's latest messages are carried for you.",
      );
    const problems = carry.map(carryProblem).filter(Boolean);
    if (problems.length) throw new Error(`Fix the carry list: ${problems.join("; ")}.`);
    const { files, results, missing } = await this.read(carry, ctx);
    const unreadable = files.filter((file) => "error" in file);
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
  /**
   * Under Cognitive Routing, the current assignment's results by ref for Pi's own compaction, which copies nothing
   * itself: without it a worker cannot tell its earlier results are still stored and re-reads them.
   */
  assignmentList(branch) {
    const assignment = this.host.nativeRefs() ? this.host.assignmentResults() : undefined;
    if (!assignment) return "";
    const listed = scopeResults(branch, assignment)
      .slice(0, MAX_LISTED)
      .map((result) => ({ ...result, selected: assignment.selected.has(result.id) }));
    return renderListed(
      listed,
      "assignment",
      "Results",
      "Pi kept the most recent as they were; all are still stored: select one as evidence by its ref, or read it again if you need its content.",
    );
  }
  /**
   * The automatic part of carry and the list of what stays behind. After the agent's picks, the newest results of the
   * work in progress (the current assignment under Cognitive Routing, otherwise this cycle) fill the rest of the
   * budget; the others are listed by ref so the agent knows what exists. With context reuse off nothing is copied, and
   * only routing keeps the list, which it needs for evidence selection.
   */
  fill(branch, ctx, files, picked) {
    const assignment = this.host.nativeRefs() ? this.host.assignmentResults() : undefined;
    const carryOn = this.host.carryEnabled();
    if (!carryOn && !assignment) return { automatic: [], listed: [] };
    // A file the agent carries fresh makes any earlier read of it stale: those reads are neither copied nor listed.
    const freshFiles = new Set(files.map((file) => resolveToolPath(file.path, ctx.cwd)));
    const scope = scopeResults(branch, assignment).filter(
      (result) => !(result.tool === "read" && result.path && freshFiles.has(resolveToolPath(result.path, ctx.cwd))),
    );
    const pickedIds = new Set(picked.map((result) => result.id));
    let room = carryOn
      ? this.budget(ctx) -
        files.reduce((sum, file) => sum + ("text" in file ? estimateTokens(file.text) : 0), 0) -
        picked.reduce((sum, result) => sum + result.tokens, 0)
      : 0;
    const automatic = [];
    for (const result of scope) {
      if (pickedIds.has(result.id) || result.tokens > room) continue;
      automatic.push(result);
      room -= result.tokens;
    }
    const carried = new Set([...pickedIds, ...automatic.map((result) => result.id)]);
    const listed = scope
      .filter((result) => !carried.has(result.id))
      .slice(0, MAX_LISTED)
      .map((result) => ({ ...result, selected: assignment?.selected.has(result.id) === true }));
    return { automatic, listed };
  }
  async read(carry, ctx) {
    const branch = branchOf(ctx);
    const files = await Promise.all(
      carry.filter((item) => !isCarryResult(item)).map((item) => readCarriedFile(item, ctx.cwd)),
    );
    const ids = carry.filter(isCarryResult).map((item) => item.result);
    const resolve = (id) => {
      if (!this.host.nativeRefs()) return resolveResult(branch, id);
      const source = this.host.resolveRef(id);
      return source && { id, tool: source.tool, label: id, tokens: estimateTokens(source.text), text: source.text };
    };
    const results = ids.map(resolve).filter(Boolean);
    const missing = ids.filter((id) => !results.some((result) => result.id === id));
    return { files, results, missing };
  }
  /** At turn end, the entries that compact the session, or undefined when nothing is scheduled. */
  async turnEnd(event, ctx) {
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
    const { automatic, listed } = this.fill(branch, ctx, files, results);
    const carriedText = renderCarried(this.host.noticePrefix, cycle, userMessages, files, [...results, ...automatic], {
      listed,
      scope: this.host.nativeRefs() && this.host.assignmentResults() ? "assignment" : "cycle",
    });
    const recovery = `${this.host.noticePrefix} ${recoveryText(cycle, "The carried context is above: its files were read at compaction, so do not read them or its results again unless something has changed them since. ")} ${AFTER_REQUESTED}`;
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
                ...automatic.map((result) => ({ ...resultRecord(result, cycle, previous), automatic: true })),
              ],
              files: cycleFiles(branch),
              requestedBy,
              ...(this.host.routingProfile() ? { profile: this.host.routingProfile() } : {}),
              ...(this.host.routingAssignment() ? { assignment: this.host.routingAssignment() } : {}),
            },
          },
        },
        {
          type: "custom_message",
          customType: CARRIED_TYPE,
          content: carriedText,
          display: false,
          // Under Cognitive Routing the Coordinator's projected view shows this version instead of the copies.
          ...(this.host.nativeRefs()
            ? {
                details: {
                  coordinatorContent: renderCarriedForCoordinator(this.host.noticePrefix, cycle, userMessages, files, [
                    ...results,
                    ...automatic,
                  ]),
                },
              }
            : {}),
        },
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
  async fallback(event, ctx) {
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
        listed: this.assignmentList(branch),
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
  takeCompacted() {
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
function recoveryText(cycle, carried = "") {
  return `Compaction finished; cycle ${cycle} starts here. Recover before you continue: if the summary names a Working Record for this work, recover it as Track Work says; otherwise the summary is your record for this cycle, so re-read its Recovery sources. Reconcile with the live state your next step depends on, and verify work the summary calls done instead of redoing it. ${carried}This compaction is done, so do not re-read the compaction skill or its summary format. Then continue the work the compaction interrupted.`;
}
/** The agent path: the compaction was the request, and it is done. */
const AFTER_REQUESTED =
  "This compaction completes the request for it: do not call freeflow_compact again in this cycle. If compacting was all you were asked to do, report that it is done (a worker returns its assignment with freeflow_return).";
/** Pi compacted on its own, so a Freeflow compaction being prepared is no longer needed. */
const AFTER_PI = "Compaction is no longer due: do not call freeflow_compact.";
/** Why freeflow_compact is refused when compaction is not due, and where to go next if a compaction began this cycle. */
function notDueText(branch) {
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
function previousCarried(branch) {
  const latest = [...branch].reverse().find((entry) => entry?.type === "compaction" && entry.details?.freeflow);
  const carried = new Map();
  for (const item of latest?.details?.freeflow?.carried ?? []) {
    const key = item?.kind === "file" ? item.path : item?.kind === "result" ? item.ref : undefined;
    if (typeof key === "string") carried.set(`${item.kind}:${key}`, item.firstCycle);
  }
  return carried;
}
function fileRecord(file, cycle, previous) {
  return {
    kind: "file",
    path: file.path,
    ...("lines" in file && file.lines ? { lines: file.lines } : {}),
    firstCycle: previous.get(`file:${file.path}`) ?? cycle,
    ...("text" in file ? { bodyHash: hash(file.text) } : { error: file.error }),
  };
}
function resultRecord(result, cycle, previous) {
  return {
    kind: "result",
    ref: result.id,
    tool: result.tool,
    firstCycle: previous.get(`result:${result.id}`) ?? cycle,
    bodyHash: hash(result.text),
  };
}

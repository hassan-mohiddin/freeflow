// Freeflow's Claude Code layer: a hooks module Claude Code runs on its own events (the task-004 Spec's section 11).
// It decides when Track Work's script runs and delivers what the script prints; what happens to a task's memory is
// the script's. It acts only where the Freeflow store exists (session status says so): elsewhere every hook passes
// its event on unchanged.

const SCRIPT = "skills/track-work/scripts/working-record.mjs";
const NOTICE_AT = 0.75; // of the window, one notice a cycle (P50)
const THRESHOLD_LEAD = 0.1; // and at least a tenth of the window before Claude's own threshold (T13)
const ROWS_AT = [0.5, 0.6, 0.7]; // of the window, one row each a cycle below the notice point, showing the context (P80)
const DELEGATION = /\bD-\d{3,}(?:\.\d+)?\b/; // the delegation an Agent call's prompt names (T7)
const FILE_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Glob", "Grep"]);
const STORE_REASON = "Freeflow's store, which holds the task memory the agent keeps";
const CONTINUE =
  "Freeflow compacted the session after your checkpoint: the conversation is now your task's bundle. Continue from In flight and the Next action.";

// What the mod keeps between events. A cycle runs from the session's start or a compaction to the next compaction;
// its notice is the time of its one checkpoint notice (T12), its number is counted in the store (T27), and row is the
// highest share of the window a row has shown in it (P80). A module reload starts it over, reading the number again.
/** @type {{ startedAt: number, notice: number | null, number: number | null, row: number }} */
let cycle = { startedAt: Date.now(), notice: null, number: null, row: 0 };
/** @type {number | null} the window the conversation compacts against, read once a cycle */
let contextWindow = null;
/** @type {number | null} where Claude's own compaction starts in it; null with automatic compaction off */
let threshold = null;
/** @type {Map<string, { delegation: string, noticed: boolean }> | null} agent ID -> its delegation, and whether its cycle had its notice; the delegations are kept in the store's sessions/ folder too */
let workers = null;
/** @type {string | null | undefined} where the store really is; null where there is none, undefined until read */
let storeRoot = undefined;
/** @type {{ session: string, cwd: string } | null} a session that started with no store, until a turn ends with one */
let awaitingStore = null;
/** Whether a /compact this mod asked for is still queued, so a turn end does not ask for a second one. */
let compactQueued = false;
/** @type {Map<string, number>} how many of a request's /compact runs were dropped, by the request's time */
const droppedRuns = new Map();
/** Dropped runs after which the mod stops trying and says so. */
const MAX_COMPACT_TRIES = 3;
/** Turns the main loop started this session, so the prompt after a compaction goes only when no other turn did. */
let mainTurns = 0;
/** How long after its /compact the mod waits for input queued meanwhile to start a turn, before it prompts (F35). */
const CONTINUE_AFTER_MS = 2_000;

/**
 * Runs Track Work's script for this session (or the one ending), as its commands run in the session's shell.
 * @param {any} $
 * @param {string[]} args
 * @param {{ session?: string, stdin?: string, timeoutMs?: number }} [options]
 */
async function script($, args, { session, stdin, timeoutMs = 60_000 } = {}) {
  const id = session ?? (await $.session.id());
  return $.process.run(["node", `${$.plugin.root}/${SCRIPT}`, ...args], {
    env: { CLAUDE_CODE_SESSION_ID: id },
    ...(stdin === undefined ? {} : { stdin }),
    timeoutMs,
  });
}

/**
 * This session's state in the store, or null where there is no store or it cannot be read.
 * @param {any} $
 * @param {{ session?: string, timeoutMs?: number }} [options]
 */
async function status($, options) {
  const state = await sessionStatus($, options);
  return state?.store ? state : null;
}

/**
 * Session status as the script prints it, a store or not, or null where it cannot be read.
 * @param {any} $
 * @param {{ session?: string, timeoutMs?: number }} [options]
 */
async function sessionStatus($, options) {
  const run = await script($, ["session", "status"], options);
  if (run.exitCode !== 0) return null;
  try {
    return JSON.parse(run.stdout);
  } catch {
    return null;
  }
}

/**
 * What keeps the session from a working store, for the agent to relay or fix (P94); empty when nothing does.
 * @param {any} state session status
 */
const missingText = (state) =>
  (state?.missing ?? []).map(
    (/** @type {{ what: string, fix: string, by: string }} */ part) =>
      `- Missing: ${part.what}. Fix (${part.by === "user" ? "the user" : "the agent"}): ${part.fix}.`,
  );

/** @param {string} path */
const separatorOf = (path) => (path.includes("\\") && !path.includes("/") ? "\\" : "/");

/**
 * Where the store really is, from session status the first time; null where there is none.
 * @param {any} $
 * @param {any} [state] session status, when the caller has it
 */
async function storeRootOf($, state) {
  if (state !== undefined || storeRoot === undefined) {
    const known = state === undefined ? await status($) : state;
    storeRoot = known
      ? ((await $.fs.stat(known.home, { resolve: true }).catch(() => undefined))?.realPath ?? null)
      : null;
  }
  return storeRoot;
}

/**
 * Where a tool's path really lands, or undefined: an absolute path's own real path, or for one not there yet (a Write
 * makes the folders it needs) its nearest existing folder's real path plus the names below it. A spelling it cannot
 * place lands nowhere: a relative path, or a "." or ".." among the names not there yet.
 * @param {any} $
 * @param {unknown} path
 */
async function placed($, path) {
  if (typeof path !== "string" || !/^(\/|[A-Za-z]:[\\/])/.test(path)) return undefined;
  const missing = [];
  let at = path;
  for (;;) {
    const stat = await $.fs.stat(at, { resolve: true }).catch(() => undefined);
    if (stat?.realPath) {
      const root = stat.realPath.replace(/[\\/]$/, "");
      return missing.length ? [root, ...missing.reverse()].join(separatorOf(stat.realPath)) : stat.realPath;
    }
    const cut = Math.max(at.lastIndexOf("/"), at.lastIndexOf("\\"));
    const name = at.slice(cut + 1);
    if (cut <= 0 || name === "" || name === "." || name === "..") return undefined;
    missing.push(name);
    at = at.slice(0, cut);
  }
}

/**
 * Reads the window the conversation compacts against, from the session itself: the model's, or the smaller one
 * Claude's compaction is set to (CLAUDE_CODE_AUTO_COMPACT_WINDOW); and where Claude's own compaction starts in it.
 * The window is the session's for the scripts too (T11).
 * @param {any} $
 */
async function readWindow($) {
  const { context } = await $.session.usage({ breakdown: "summary" });
  const size = context.breakdown?.rawMaxTokens || context.window;
  threshold = context.breakdown?.autoCompactThreshold ?? null;
  if (size && size !== contextWindow) await $.env.set("FREEFLOW_CONTEXT_WINDOW", String(size));
  contextWindow = size || null;
}

/** A new cycle: no notice or row yet, and the window read again; its number as given, null to read it from the store. */
async function newCycle($, number = cycle.number) {
  cycle = { startedAt: await $.clock.now(), notice: null, number, row: 0 };
  contextWindow = null;
}

/** Where the store counts this session's cycles: a resumed session keeps its count, a new one starts at 1. */
const cyclePath = (state) => `${state.home}/sessions/${state.session}/cycle.json`;

/** This cycle's number, read from the store the first time. */
async function cycleNumber($, state) {
  if (cycle.number === null) {
    const kept = await $.fs.read(cyclePath(state)).catch(() => "null");
    let number = 1;
    try {
      number = Number(JSON.parse(kept).cycle) || 1;
    } catch {
      // none kept yet, or unreadable: the count starts again at 1
    }
    cycle.number ??= number;
  }
  return cycle.number;
}

/** A compaction of the main conversation: the next cycle, its number counted in the store where there is one. */
async function nextCycle($, state) {
  const number = state ? (await cycleNumber($, state)) + 1 : null;
  if (state) await $.fs.write(cyclePath(state), `${JSON.stringify({ cycle: number })}\n`);
  await newCycle($, number);
}

/**
 * Where the notice comes, in tokens: 75% of the window, or a tenth of it before Claude's threshold if lower.
 * @param {number} size
 */
const noticePoint = (size) => Math.min(NOTICE_AT * size, threshold ? threshold - THRESHOLD_LEAD * size : Infinity);

/** What a safe point is: where stopping loses nothing that is not written down (Pi's "compaction is due soon"). */
const SAFE_POINT =
  "a finished step whose result you know (a check run and read, a set of edits complete, a report written), not mid-edit or with a command still running";

const share = (context) =>
  `${Math.round((100 * context.tokens) / context.window)}% of its window (${context.tokens} of ${context.window} tokens)`;

function noticeText($, context, state, number) {
  const command = `node ${$.plugin.root}/${SCRIPT}`;
  const limit = threshold ? `; Claude Code compacts on its own at about ${Math.round(threshold)} tokens` : "";
  const checkpoint = state.task
    ? `At that point, checkpoint ${state.task.id}: rewrite ${state.task.id}'s Current Context, adjust the rest of Current Work and Future Work, save as blocks any discussion in this cycle that shaped the work (discussion list, discussion save; skip it when there was none), then run ${command} checkpoint --record ${state.task.id} --compact --input - with In flight's lines.`
    : `This session holds no task: at that point, write its summary with ${command} checkpoint --session --compact --input - (Goal, Settled, Open, Agreement, In flight, Read when, Next action).`;
  return `Freeflow, compaction cycle ${number}: the context is at ${share(context)}${limit}. Keep working until a safe point: ${SAFE_POINT}. If your work ends within a step or two, finish it first. ${checkpoint} Then end your turn: on that request, Freeflow compacts the session with the record in place of the conversation, and starts the next turn where it can. This is the only notice this compaction cycle; if Claude Code compacts before the checkpoint, the record as of its last checkpoint follows Claude's summary.`;
}

/**
 * @param {any} $
 * @param {string} text
 */
async function appendRow($, text) {
  await $.session.append({ message: { type: "user", content: [{ type: "text", text }] } });
}

/** After each request of the main conversation: below the notice point, a row at the highest of ROWS_AT the context
 * has crossed, once each a cycle (P80, T28); at it, the cycle's one checkpoint notice, appended so a long turn has it
 * (P50, T13). Appending leaves what the model already received, and the prompt cache, as it was. */
async function watchMain($) {
  if (cycle.notice !== null) return;
  const current = cycle;
  const { tokens } = (await $.session.usage()).context;
  if (!tokens) return;
  if (contextWindow === null) await readWindow($);
  if (!contextWindow) return;
  const point = noticePoint(contextWindow);
  const context = { tokens, window: contextWindow };
  if (tokens < point) {
    const row = ROWS_AT.filter((at) => tokens >= at * contextWindow).at(-1);
    if (!row || row <= cycle.row) return;
    // Taken before the store is asked, so a session with none asks once a row.
    cycle.row = row;
    const state = await status($);
    if (cycle !== current || cycle.notice !== null || !state) return;
    const number = await cycleNumber($, state);
    await appendRow(
      $,
      `Freeflow, compaction cycle ${number}: the context is at ${share(context)}; the checkpoint notice comes at about ${Math.round(point)} tokens.`,
    );
    return;
  }
  const state = await status($);
  // A compaction that came meanwhile started a new cycle, which this request's figures no longer describe; a notice
  // another request made meanwhile is the cycle's one.
  if (cycle !== current || cycle.notice !== null) return;
  if (!state) return;
  cycle.notice = await $.clock.now();
  const number = await cycleNumber($, state);
  await appendRow($, noticeText($, context, state, number));
}

/** The workers this session started, by agent ID: read once from the store's sessions/ folder after a reload. */
async function workerMap($, state) {
  if (workers) return workers;
  workers = new Map();
  const path = state && `${state.home}/sessions/${state.session}/delegations.json`;
  if (path && (await $.fs.exists(path))) {
    for (const [agentId, delegation] of Object.entries(JSON.parse(await $.fs.read(path))))
      workers.set(agentId, { delegation, noticed: false });
  }
  return workers;
}

/** After each request of a worker: once a cycle, near the threshold, in the session's window, a message to rewrite its
 * progress.md at a safe point (T7). Its context is its request's usage. */
async function noticeWorker($, step, response) {
  const worker = (await workerMap($, null)).get(step.agentId);
  if (!worker || worker.noticed || !response.usage) return;
  const { input_tokens, cache_read_input_tokens, cache_creation_input_tokens } = response.usage;
  const tokens = input_tokens + (cache_read_input_tokens ?? 0) + (cache_creation_input_tokens ?? 0);
  if (contextWindow === null) await readWindow($);
  const size = contextWindow;
  if (!size || tokens < noticePoint(size)) return;
  worker.noticed = true;
  await $.session.send({
    to: { agentId: step.agentId },
    text: `Freeflow: your context is at ${Math.round((100 * tokens) / size)}% of its window and compaction is near. At your next safe point, rewrite ${worker.delegation}'s progress.md (Done, Half done, Didn't work, Next), so a compaction loses nothing, then go on.`,
  });
}

/** Whether the checkpoint this cycle asked for is done: the record's State as of, or the summary's time, is later
 * than the cycle's last notice, or than its start when no notice came (T12, P68). */
function checkpointDone(state) {
  const asOf = state.task ? state.task.stateAsOf : state.summary?.asOf;
  return Boolean(asOf) && Date.parse(asOf) > (cycle.notice ?? cycle.startedAt);
}

/** @param {string} text */
const ownMessages = (text) => ({
  messages: [
    { role: /** @type {const} */ ("user"), text, toolUses: [] },
    { role: /** @type {const} */ ("assistant"), text: "Recovered from Freeflow's bundle.", toolUses: [] },
  ],
});

/**
 * Claude's compaction with one message added after its summary: the bundle, or what stands in for it.
 * @param {any} compacted
 * @param {string} text
 */
const withMessage = (compacted, text) =>
  compacted.skip
    ? compacted
    : {
        ...compacted,
        messages: [...compacted.messages, { role: /** @type {const} */ ("user"), text, toolUses: [] }],
      };

/**
 * What stands in for a bundle the script could not make (a record left invalid mid-edit, say): the error, and where
 * the next cycle recovers once it is mended.
 * @param {any} $
 * @param {any} state
 * @param {{ stderr: string }} made
 */
function unmade($, state, made) {
  const [error] = made.stderr
    .replace(/^Error: /, "")
    .trim()
    .split("\n");
  return state.task
    ? `Freeflow could not make ${state.task.id}'s bundle: ${error.replace(/\.$/, "")}. Its record, last checkpointed at ${state.task.stateAsOf}, is ${state.task.record}: mend what the error names, then run node ${$.plugin.root}/${SCRIPT} view recover --record ${state.task.id} and read what it lists.`
    : `Freeflow could not make this session's bundle: ${error.replace(/\.$/, "")}. Its summary is ${state.summary.path}: read it.`;
}

/** Freeflow's compaction (P63, T14): the bundle as the whole conversation, with no summarizer request. */
async function ownCompaction($, e, next, state) {
  const made = await script(
    $,
    state.task ? ["view", "bundle", "--record", state.task.record] : ["view", "bundle", "--session"],
  );
  if (made.exitCode !== 0) return withMessage(await next(e), unmade($, state, made));
  // The bundle replaces the conversation: a checkpoint --compact waiting for this is answered, whoever compacted.
  if (state.compact && !state.compact.done) await answered($, state.compact);
  if (!state.task)
    await $.process.run([
      "node",
      "-e",
      "require('node:fs').rmSync(process.argv[1], { force: true })",
      state.summary.path,
    ]);
  return ownMessages(made.stdout);
}

/** A compaction before the checkpoint (P16): Claude's, told what the record holds, then the bundle as of the last
 * checkpoint with the user's messages since and the transcript's path, as one message after its summary (T14). */
async function fallbackCompaction($, e, next, state) {
  const note = `Freeflow: the task's Working Record (${state.task.id}) holds the work up to its last checkpoint, ${state.task.stateAsOf}; keep in the summary what happened after that.`;
  const compacted = await next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${note}` : note });
  if (compacted.skip) return compacted;
  const made = await script($, ["view", "bundle", "--record", state.task.record, "--fallback"]);
  return withMessage(compacted, made.exitCode === 0 ? made.stdout : unmade($, state, made));
}

/** A worker's compaction: its summary names its delegation and how it recovers. */
async function workerCompaction($, e, next) {
  const state = await status($);
  const worker = (await workerMap($, state)).get(e.agentId);
  if (!state?.task || !worker) return next(e);
  // Its compaction starts the worker's next cycle, with a notice of its own.
  worker.noticed = false;
  const note = `Freeflow: this agent is the worker for delegation ${worker.delegation}. Say so in the summary, and that after the compaction it recovers with node ${$.plugin.root}/${SCRIPT} view recover --record ${state.task.id} --delegation ${worker.delegation}, then continues from its progress.md.`;
  return next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${note}` : note });
}

/**
 * Marks a checkpoint --compact request answered, once the bundle has replaced the conversation.
 * @param {any} $
 * @param {any} request
 */
async function answered($, request) {
  await $.fs.write(request.path, JSON.stringify({ ...request, path: undefined, done: true }, null, 2));
}

/**
 * After a turn that ended with checkpoint --compact: compact between turns, then a prompt to go on (P51, P102).
 * @param {any} $
 * @param {any} request
 */
async function compactAndContinue($, request) {
  let dropped = null;
  try {
    // /compact, run as the person would: a plugin's own $.session.compact() passes none of its own hooks, so the
    // engine's summary would stand in for the bundle. The engine runs it once the session is idle, and drops it
    // past a Stop, as when queued input starts the next turn first and that turn is interrupted.
    const { text } = await $.command.run({ command: "compact" });
    if (/^Not compacted/.test(text ?? "")) dropped = (text ?? "").split("\n")[0];
    else {
      await newCycle($);
      // Input queued meanwhile, a notification or the person's own prompt, starts its turn first, and that turn goes
      // on from the bundle; a prompt submitted now would wait behind it and arrive out of date (F35).
      const turns = mainTurns;
      $.clock.after(CONTINUE_AFTER_MS, async () => {
        if (mainTurns === turns) await $.prompt.submit({ text: CONTINUE });
      });
    }
  } catch (error) {
    dropped = error instanceof Error ? error.message : String(error);
    $.ui.log(`Freeflow: ${dropped}`);
  } finally {
    compactQueued = false;
  }
  if (dropped === null) return;
  // The request stays waiting, and the next turn end tries again; the agent and the user see that it did not run.
  const tries = (droppedRuns.get(request.requestedAt) ?? 0) + 1;
  droppedRuns.set(request.requestedAt, tries);
  if (tries < MAX_COMPACT_TRIES) {
    await appendRow(
      $,
      `Freeflow: the compaction your checkpoint asked for did not run (${dropped}); it tries again when the next turn ends.`,
    );
    return;
  }
  await answered($, request);
  await appendRow(
    $,
    `Freeflow: the compaction your checkpoint asked for did not run (${dropped}), ${tries} times; it stops trying. Checkpoint with --compact again, or run /compact.`,
  );
}

/**
 * What a session does once it has a store: the transcript for the script, a pull, and the menu, which also remembers
 * where a task's repositories are.
 * @param {any} $
 * @param {any} state session status, with a store
 * @param {string} session
 * @param {string} cwd the session's folder
 */
async function storeArrived($, state, session, cwd) {
  // The session's transcript, which Track Work's script reads to measure what a Slice uses (Spec section 12).
  if (state.transcript) await $.env.set("FREEFLOW_TRANSCRIPT", state.transcript);
  await script($, ["store", "sync", "--pull"], { session });
  // The session's folder, its siblings and Freeflow's own checkout, where a task's repositories may be (P96).
  const parent = cwd.slice(0, cwd.lastIndexOf(separatorOf(cwd))) || cwd;
  const scan = [cwd, parent, $.plugin.root].join(separatorOf(cwd) === "\\" ? ";" : ":");
  // The menu, then the rules every task follows, so a session has them before it takes a task (Spec section 4).
  return script($, ["task", "here", "--cwd", cwd, "--scan", scan, "--rules"], { session });
}

async function turnEnded($, e) {
  const state = await status($);
  if (!state) return;
  if (awaitingStore) {
    // A store attached after the session started, as a repository added to a running cloud session is: what session
    // start does with a store, done now, so its transcript, sync, repositories and permission are not lost.
    const { session, cwd } = awaitingStore;
    awaitingStore = null;
    await storeRootOf($, state);
    await storeArrived($, state, session, cwd);
  }
  if (state.changed) await script($, ["store", "sync"]);
  // Only the agent's own request compacts (P102): checkpoint --compact, after a turn that ended, until the bundle
  // replaces the conversation; one /compact queued at a time.
  const request = state.compact;
  if (e.reason !== "answer" || !request || request.done || compactQueued || !checkpointDone(state)) return;
  compactQueued = true;
  $.clock.after(0, () => compactAndContinue($, request));
}

/** @param {import("claude-code").On} on */
export function register(on) {
  // Session start, /clear and resume: pull the store, give the scripts the window, and give the agent the menu, which
  // says which task this session holds (Spec section 4).
  on("classic.SessionStart", async ($, e, next) => {
    const result = await next(e);
    if (e.source === "compact") return result;
    await newCycle($, null);
    workers = null;
    await readWindow($);
    const found = await sessionStatus($, { session: e.session_id });
    const state = found?.store ? found : null;
    await storeRootOf($, state);
    const missing = missingText(found);
    awaitingStore = state ? null : { session: e.session_id, cwd: e.cwd };
    if (!state)
      return missing.length
        ? {
            ...result,
            additionalContext: [
              ...(result.additionalContext ?? []),
              `Freeflow task memory: the store is not ready.\n${missing.join("\n")}`,
            ],
          }
        : result;
    const menu = await storeArrived($, state, e.session_id, e.cwd);
    if (menu.exitCode !== 0) return result;
    const text = [menu.stdout.trimEnd(), ...missing].join("\n");
    return {
      ...result,
      additionalContext: [...(result.additionalContext ?? []), `Freeflow task memory:\n${text}\n`],
    };
  });

  on("turn.start", ($, e, next) => {
    if (e.agentId === undefined) mainTurns += 1;
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    const response = yield* next(e);
    try {
      if (e.agentId === undefined) await watchMain($);
      else await noticeWorker($, e, response);
    } catch (error) {
      $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    }
    return response;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (e.agentId !== undefined) return result;
    try {
      await turnEnded($, e);
    } catch (error) {
      $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    }
    return result;
  });

  // The store holds the task memory the agent keeps, so a file tool on a path that really lands inside it runs where
  // the mode would ask, as in a working directory with edits allowed; any deny, a rule's or a hook's, still stands.
  on("tool.check", async ($, e, next) => {
    const verdict = await next(e);
    if (verdict.decision !== "ask" || !FILE_TOOLS.has(e.tool)) return verdict;
    const input = /** @type {Record<string, unknown>} */ (e.input ?? {});
    const root = await storeRootOf($);
    if (!root) return verdict;
    const real = await placed($, input.file_path ?? input.notebook_path ?? input.path);
    const inside = real !== undefined && (real === root || real.startsWith(root + separatorOf(root)));
    return inside ? { decision: /** @type {const} */ ("allow"), reason: STORE_REASON } : verdict;
  });

  on("session.compact", async ($, e, next) => {
    if (e.trigger === "precompute") return next(e);
    if (e.agentId !== undefined) return workerCompaction($, e, next);
    const state = await status($);
    const result =
      !state || (!state.task && !state.summary)
        ? await next(e)
        : checkpointDone(state)
          ? await ownCompaction($, e, next, state)
          : state.task
            ? await fallbackCompaction($, e, next, state)
            : await next(e);
    // Every compaction of the main conversation starts the next cycle, Claude's own without a task included.
    if (!result.skip) await nextCycle($, state);
    return result;
  });

  // A worker's start: which delegation it is, from its prompt (T7), kept for its notices, compaction and hand-back.
  on("agent.spawn", async ($, e, next) => {
    const result = await next(e);
    const delegation = DELEGATION.exec(e.prompt ?? "")?.[0];
    if (!result.agentId || !delegation) return result;
    const state = await status($);
    const map = await workerMap($, state);
    map.set(result.agentId, { delegation, noticed: false });
    if (state)
      await $.fs.write(
        `${state.home}/sessions/${state.session}/delegations.json`,
        JSON.stringify(Object.fromEntries([...map].map(([agentId, worker]) => [agentId, worker.delegation])), null, 2),
      );
    return result;
  });

  // A worker hands back: its return is checked, and once it is told what is missing.
  on("classic.SubagentStop", async ($, e, next) => {
    const result = await next(e);
    if (e.stop_hook_active || result.block) return result;
    const state = await status($);
    const worker = (await workerMap($, state)).get(e.agent_id);
    if (!state?.task || !worker) return result;
    const checked = await script($, [
      "delegate",
      "check-return",
      "--record",
      state.task.record,
      "--id",
      worker.delegation,
    ]);
    if (checked.exitCode === 0 || !/return is not ready/.test(checked.stderr)) return result;
    return {
      ...result,
      block: `Freeflow: ${checked.stderr.replace(/^Error: /, "").trim()} Write return.md as your brief says, then hand back.`,
    };
  });

  // The session ends: release its hold and push, within the short time an exit allows.
  on("session.end", async ($, e, next) => {
    try {
      const options = { session: e.sessionId, timeoutMs: Math.min(60_000, Math.max(1, next.budget.remainingMs - 500)) };
      const state = await status($, options);
      if (state?.task) await script($, ["task", "release"], options);
      else if (state?.changed) await script($, ["store", "sync"], options);
    } catch (error) {
      $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    }
    return next(e);
  });
}

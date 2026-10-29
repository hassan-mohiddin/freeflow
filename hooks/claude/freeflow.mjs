// Freeflow's Claude Code layer: a hooks module Claude Code runs on its own events (the task-004 Spec's section 11).
// It decides when Track Work's script runs and delivers what the script prints; what happens to a task's memory is
// the script's. It acts only where the Freeflow store exists (session status says so): elsewhere every hook passes
// its event on unchanged.

const SCRIPT = "skills/track-work/scripts/working-record.mjs";
const FIRST_NOTICE = 0.75; // of the window (P50)
const NOTICE_STEP = 0.05; // then every 5% of it
const THRESHOLD_LEAD = 0.1; // and the first comes at least a tenth of the window before Claude's own threshold (T13)
const DELEGATION = /\bD-\d{3,}(?:\.\d+)?\b/; // the delegation an Agent call's prompt names (T7)
const CONTINUE =
  "Freeflow compacted the session after your checkpoint: the conversation is now your task's bundle. Continue from In flight and the Next action.";

// What the mod keeps between events. A cycle runs from the session's start or a compaction to the next compaction;
// its notice is the time of the last checkpoint notice in it (T12). A module reload starts both over.
/** @type {{ startedAt: number, notice: number | null, nextNotice: number | null }} */
let cycle = { startedAt: Date.now(), notice: null, nextNotice: null };
/** @type {number | null} the window the conversation compacts against, read once a cycle */
let contextWindow = null;
/** @type {number | null} where Claude's own compaction starts in it; null with automatic compaction off */
let threshold = null;
/** @type {Map<string, { delegation: string, nextNotice: number | null }> | null} agent ID -> its delegation, kept in the store's sessions/ folder too */
let workers = null;

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
  const run = await script($, ["session", "status"], options);
  if (run.exitCode !== 0) return null;
  try {
    const state = JSON.parse(run.stdout);
    return state.store ? state : null;
  } catch {
    return null;
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

/** A new cycle, after the session's start or a compaction: no notice yet, and the window read again. */
async function newCycle($) {
  cycle = { startedAt: await $.clock.now(), notice: null, nextNotice: null };
  contextWindow = null;
}

/**
 * Where the first notice comes, in tokens: 75% of the window, or a tenth of it before Claude's threshold if lower.
 * @param {number} size
 */
const firstNotice = (size) => Math.min(FIRST_NOTICE * size, threshold ? threshold - THRESHOLD_LEAD * size : Infinity);

function noticeText($, context, state) {
  const command = `node ${$.plugin.root}/${SCRIPT}`;
  const checkpoint = state.task
    ? `Checkpoint now: rewrite ${state.task.id}'s Current Context, adjust the rest of Current Work and Future Work, save as blocks any discussion that shaped the work (discussion list, discussion save), then run ${command} checkpoint --record ${state.task.id} --input - with In flight's lines.`
    : `This session holds no task: write its summary now with ${command} checkpoint --session --input - (Goal, Settled, Open, Agreement, In flight, Read when, Next action).`;
  return `Freeflow: the context is at ${Math.round((100 * context.tokens) / context.window)}% of its window (${context.tokens} of ${context.window} tokens), and compaction is near. ${checkpoint} Then end your turn: Freeflow compacts the session with the record in place of the conversation, and starts the next turn where it can.`;
}

/** After each request of the main conversation: the checkpoint notice, appended so a long turn has it (P50, T13). */
async function noticeMain($) {
  const current = cycle;
  const { tokens } = (await $.session.usage()).context;
  if (!tokens) return;
  if (contextWindow === null) await readWindow($);
  if (!contextWindow) return;
  if (cycle.nextNotice === null) cycle.nextNotice = firstNotice(contextWindow);
  if (tokens < cycle.nextNotice) return;
  while (cycle.nextNotice <= tokens) cycle.nextNotice += NOTICE_STEP * contextWindow;
  const state = await status($);
  // A compaction that came meanwhile started a new cycle, which this request's figures no longer describe.
  if (cycle !== current) return;
  // The notice repeats only while the checkpoint it asked for has not come: once it has, a later one would undo it.
  if (!state || (cycle.notice !== null && checkpointDone(state))) return;
  cycle.notice = await $.clock.now();
  await $.session.append({
    message: {
      type: "user",
      content: [{ type: "text", text: noticeText($, { tokens, window: contextWindow }, state) }],
    },
  });
}

/** The workers this session started, by agent ID: read once from the store's sessions/ folder after a reload. */
async function workerMap($, state) {
  if (workers) return workers;
  workers = new Map();
  const path = state && `${state.home}/sessions/${state.session}/delegations.json`;
  if (path && (await $.fs.exists(path))) {
    for (const [agentId, delegation] of Object.entries(JSON.parse(await $.fs.read(path))))
      workers.set(agentId, { delegation, nextNotice: null });
  }
  return workers;
}

/** After each request of a worker: near the threshold, in the session's window, a message to rewrite its progress.md
 * (T7). Its context is its request's usage. */
async function noticeWorker($, step, response) {
  const worker = (await workerMap($, null)).get(step.agentId);
  if (!worker || !response.usage) return;
  const { input_tokens, cache_read_input_tokens, cache_creation_input_tokens } = response.usage;
  const tokens = input_tokens + (cache_read_input_tokens ?? 0) + (cache_creation_input_tokens ?? 0);
  if (contextWindow === null) await readWindow($);
  const size = contextWindow;
  if (!size) return;
  if (worker.nextNotice === null) worker.nextNotice = firstNotice(size);
  if (tokens < worker.nextNotice) return;
  while (worker.nextNotice <= tokens) worker.nextNotice += NOTICE_STEP * size;
  await $.session.send({
    to: { agentId: step.agentId },
    text: `Freeflow: your context is at ${Math.round((100 * tokens) / size)}% of its window and compaction is near. Rewrite ${worker.delegation}'s progress.md now (Done, Half done, Didn't work, Next), so a compaction loses nothing, then go on.`,
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
  const note = `Freeflow: this agent is the worker for delegation ${worker.delegation}. Say so in the summary, and that after the compaction it recovers with node ${$.plugin.root}/${SCRIPT} view recover --record ${state.task.id} --delegation ${worker.delegation}, then continues from its progress.md.`;
  return next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${note}` : note });
}

/** After a turn that ended a checkpoint the notice asked for: compact between turns, then a prompt to go on (P51). */
async function compactAndContinue($) {
  try {
    // /compact, run as the person would: a plugin's own $.session.compact() passes none of its own hooks, so the
    // engine's summary would stand in for the bundle. A new cycle starts either way, so no turn end compacts twice.
    const { text } = await $.command.run({ command: "compact" });
    await newCycle($);
    if (!/^Not compacted/.test(text ?? "")) await $.prompt.submit({ text: CONTINUE });
  } catch (error) {
    // Refused where the engine cannot compact between turns (a headless session): the next compaction installs it.
    $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function turnEnded($, e) {
  const state = await status($);
  if (!state) return;
  if (state.changed) await script($, ["store", "sync"]);
  if (e.reason === "answer" && cycle.notice !== null && checkpointDone(state))
    $.clock.after(0, () => compactAndContinue($));
}

/** @param {import("claude-code").On} on */
export function register(on) {
  // Session start, /clear and resume: pull the store, give the scripts the window, and give the agent the menu, which
  // says which task this session holds (Spec section 4).
  on("classic.SessionStart", async ($, e, next) => {
    const result = await next(e);
    if (e.source === "compact") return result;
    await newCycle($);
    workers = null;
    await readWindow($);
    if (!(await status($, { session: e.session_id }))) return result;
    await script($, ["store", "sync", "--pull"], { session: e.session_id });
    const menu = await script($, ["task", "here", "--cwd", e.cwd], { session: e.session_id });
    if (menu.exitCode !== 0) return result;
    return {
      ...result,
      additionalContext: [...(result.additionalContext ?? []), `Freeflow task memory:\n${menu.stdout}`],
    };
  });

  on("turn.step", async function* ($, e, next) {
    const response = yield* next(e);
    try {
      if (e.agentId === undefined) await noticeMain($);
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

  on("session.compact", async ($, e, next) => {
    if (e.trigger === "precompute") return next(e);
    if (e.agentId !== undefined) return workerCompaction($, e, next);
    const state = await status($);
    if (!state || (!state.task && !state.summary)) return next(e);
    const done = checkpointDone(state);
    const result = done
      ? await ownCompaction($, e, next, state)
      : state.task
        ? await fallbackCompaction($, e, next, state)
        : await next(e);
    if (!result.skip) await newCycle($);
    return result;
  });

  // A worker's start: which delegation it is, from its prompt (T7), kept for its notices, compaction and hand-back.
  on("agent.spawn", async ($, e, next) => {
    const result = await next(e);
    const delegation = DELEGATION.exec(e.prompt ?? "")?.[0];
    if (!result.agentId || !delegation) return result;
    const state = await status($);
    const map = await workerMap($, state);
    map.set(result.agentId, { delegation, nextNotice: null });
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

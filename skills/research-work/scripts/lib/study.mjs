// A study's binding records: the plan's lock, the run ledger and the deviation log, all beside the study plan.
//
// - The lock (`<plan>.lock.json`) holds the plan's hash, who locked it and when, and each later amendment. The hash
//   leaves out the plan's "## Amendments" section, so recording an amendment there does not change it; any other
//   change does, and `check` refuses the plan until the change is recorded as an amendment. Each entry keeps the
//   plan's hypotheses and planned runs. An amendment after study runs exist records every hypothesis it adds or
//   changes, and none of those can be confirmatory from then on; and a planned count it cuts still binds the check,
//   so the shortfall needs a cleared deviation.
// - The run ledger (`runs.jsonl`) gets one receipt per command run through `study.mjs run`. A non-zero exit is data:
//   the receipt records it and the analysis decides what it means. A command that could not start is recorded too.
// - The deviation log (`deviations.jsonl`) records each departure from the plan and, in a later line, who cleared it.
//   An uncleared deviation holds the analysis.
// Both ledgers are hash-chained: each line carries the sha256 of the line before it (`prev_sha256`, null on the
// first), so an edited, removed or reordered line breaks the chain, and `check` reports where.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, appendFileSync, constants, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { parseMarkdown, planHypotheses, plannedRuns, validate } from "./formats.mjs";

export const TAIL_BYTES = 2048;

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** The plan's hash: sha256 over its text with the "## Amendments" section left out and line endings made plain. */
export function planHash(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept = [];
  let inAmendments = false;
  for (const line of lines) {
    if (line.startsWith("## ")) inAmendments = line.slice(3).trim() === "Amendments";
    if (!inAmendments) kept.push(line);
  }
  return sha256(kept.join("\n"));
}

export const lockPath = (planPath) => join(dirname(planPath), `${basename(planPath, ".md")}.lock.json`);
export const runLedgerPath = (planPath) => join(dirname(planPath), "runs.jsonl");
export const deviationLogPath = (planPath) => join(dirname(planPath), "deviations.jsonl");

const hypothesesOf = (text) => Object.fromEntries(planHypotheses(text));

/** Hypotheses an amendment added or changed after study runs existed: none can be confirmatory from then on. */
export const demotedHypotheses = (lock) =>
  new Set((lock?.entries ?? []).flatMap((entry) => entry.changed_after_runs ?? []));

export function readLock(planPath) {
  const path = lockPath(planPath);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

/** The hashes the lock accepts: the locked one and every amendment's, latest last. */
export const lockedHashes = (lock) => (lock?.entries ?? []).map((entry) => entry.sha256);

/** Whether the plan as it is now is the locked or last amended one. */
export function lockState(planPath) {
  const lock = readLock(planPath);
  const current = planHash(readFileSync(planPath, "utf8"));
  if (!lock) return { locked: false, current, reason: "no lock file; run study.mjs lock" };
  const latest = lock.entries.at(-1).sha256;
  if (latest !== current)
    return {
      locked: false,
      current,
      latest,
      reason: "the plan changed since it was locked or last amended; record the change with study.mjs amend",
    };
  return { locked: true, current, latest, lock };
}

const now = () => new Date().toISOString();

const git = (folder, args) => {
  const result = spawnSync("git", ["-C", folder, ...args], { encoding: "utf8" });
  return { ok: result.status === 0, out: (result.stdout ?? "").trim() };
};

/**
 * Where the plan stands in git, so the lock can name a commit that holds it: the commit and the plan's path when the
 * plan is tracked and committed as it is, otherwise the reason it is not anchored. A lock with no anchor still
 * works; it only cannot show that the plan was not locked again with a rewritten lock file.
 */
export function gitAnchor(planPath) {
  const folder = dirname(resolve(planPath));
  const root = git(folder, ["rev-parse", "--show-toplevel"]);
  if (!root.ok) return { reason: "the plan is not in a git repository" };
  const path = relative(root.out, resolve(planPath));
  if (!git(root.out, ["ls-files", "--error-unmatch", "--", path]).ok)
    return { reason: "git does not track the plan (a task folder is usually ignored)" };
  if (!git(root.out, ["diff", "--quiet", "HEAD", "--", path]).ok)
    return { reason: "the plan has changes not committed; commit it before locking to anchor the lock" };
  return { commit: git(root.out, ["rev-parse", "HEAD"]).out, path };
}

/** Problems with a lock entry's git anchor: its commit must be in HEAD's history and hold the plan it hashed. */
export function anchorProblems(planPath, entry, label) {
  if (!entry.git?.commit) return [];
  const folder = dirname(resolve(planPath));
  const root = git(folder, ["rev-parse", "--show-toplevel"]);
  if (!root.ok)
    return [`${label}: anchored at ${entry.git.commit.slice(0, 12)}, but the plan is no longer in a git repository`];
  if (!git(root.out, ["merge-base", "--is-ancestor", entry.git.commit, "HEAD"]).ok)
    return [
      `${label}: its commit ${entry.git.commit.slice(0, 12)} is not in HEAD's history; the lock may have been rewritten`,
    ];
  const shown = git(root.out, ["show", `${entry.git.commit}:${entry.git.path}`]);
  if (!shown.ok || planHash(shown.out + "\n") !== entry.sha256)
    return [`${label}: the plan at commit ${entry.git.commit.slice(0, 12)} does not have the hash the lock records`];
  return [];
}

/** Lock a valid plan. Refuses a plan that does not validate, and a plan already locked. */
export function lockPlan(planPath, { by, at = now() }) {
  if (!by) throw new Error("lock needs --by: who locked the plan");
  const text = readFileSync(planPath, "utf8");
  const { problems } = validate("study-plan", text);
  if (problems.length > 0) throw new Error(`the plan does not validate:\n  ${problems.join("\n  ")}`);
  if (existsSync(lockPath(planPath)))
    throw new Error(`${lockPath(planPath)} exists; a plan is locked once, and later changes are amendments`);
  const lock = {
    plan: basename(planPath),
    entries: [
      {
        kind: "lock",
        sha256: planHash(text),
        by,
        at,
        hypotheses: hypothesesOf(text),
        runs: plannedRuns(text),
        git: gitAnchor(planPath),
      },
    ],
  };
  writeFileSync(lockPath(planPath), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

/**
 * Record a change to a locked plan: the new hash goes in the lock, and a dated line naming who made it and why goes
 * in the plan's "## Amendments" section.
 */
export function amendPlan(planPath, { by, reason, at = now() }) {
  if (!by || !reason) throw new Error("amend needs --by and --reason");
  const lock = readLock(planPath);
  if (!lock) throw new Error("the plan is not locked; lock it first");
  let text = readFileSync(planPath, "utf8");
  const { problems } = validate("study-plan", text);
  if (problems.length > 0) throw new Error(`the amended plan does not validate:\n  ${problems.join("\n  ")}`);
  const hash = planHash(text);
  if (hash === lock.entries.at(-1).sha256) throw new Error("the plan has not changed since it was locked or amended");
  const previous = lock.entries.at(-1).hypotheses ?? {};
  const current = hypothesesOf(text);
  // Any hypothesis added, removed or changed: a new or promoted confirmatory hypothesis was chosen after the data
  // as surely as a changed one.
  const changed = [...new Set([...Object.keys(previous), ...Object.keys(current)])].filter(
    (id) => JSON.stringify(previous[id]) !== JSON.stringify(current[id]),
  );
  const hashes = new Set(lockedHashes(lock));
  const studyRuns = readLedger(runLedgerPath(planPath)).filter(
    (receipt) => receipt.plan_locked && hashes.has(receipt.plan_sha256),
  ).length;
  lock.entries.push({
    kind: "amendment",
    sha256: hash,
    by,
    at,
    reason,
    hypotheses: current,
    runs: plannedRuns(text),
    after_runs: studyRuns,
    changed_after_runs: studyRuns > 0 ? changed : [],
    // Anchored before the Amendments line is written: that section is outside the hash, so the commit still holds it.
    git: gitAnchor(planPath),
  });
  const line = `- ${at.slice(0, 10)}, by ${by}: ${reason} (plan ${hash.slice(0, 12)})`;
  const parsed = parseMarkdown(text);
  const body = (parsed.sections.get("Amendments") ?? []).join("\n").trim();
  text = text.replace(/^## Amendments[ \t]*\n[\s\S]*?(?=^## |(?![\s\S]))/m, (section) =>
    body === "none" || body === "" ? `## Amendments\n\n${line}\n\n` : `${section.replace(/\s*$/, "")}\n${line}\n\n`,
  );
  writeFileSync(planPath, text.replace(/\n+$/, "\n"));
  writeFileSync(lockPath(planPath), `${JSON.stringify(lock, null, 2)}\n`);
  return lock.entries.at(-1);
}

/** Append one record to a ledger, chained to the line before it. */
function appendChained(path, record) {
  const lines = existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
    : [];
  const chained = { ...record, prev_sha256: lines.length === 0 ? null : sha256(lines.at(-1)) };
  appendFileSync(path, `${JSON.stringify(chained)}\n`);
  return chained;
}

/** Where a ledger's hash chain breaks: the 1-based line numbers whose prev_sha256 does not match the line before. */
export function chainBreaks(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const breaks = [];
  lines.forEach((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      breaks.push(index + 1);
      return;
    }
    const expected = index === 0 ? null : sha256(lines[index - 1]);
    if (record.prev_sha256 !== expected) breaks.push(index + 1);
  });
  return breaks;
}

export function readLedger(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

const nextId = (records, prefix) => `${prefix}${records.filter((record) => record.id?.startsWith(prefix)).length + 1}`;

/** The sha256 of a file's bytes, or null when it is not a readable file. */
export function fileHash(path) {
  try {
    return statSync(path).isFile() ? sha256(readFileSync(path)) : null;
  } catch {
    return null;
  }
}

/** The program a command runs: its path as given when it names one, otherwise the first match on PATH. */
export function resolveProgram(program, cwd) {
  if (program.includes("/")) {
    const path = isAbsolute(program) ? program : resolve(cwd, program);
    return existsSync(path) ? path : null;
  }
  for (const folder of (process.env.PATH ?? "").split(delimiter)) {
    const path = join(folder, program);
    try {
      accessSync(path, constants.X_OK);
      if (statSync(path).isFile()) return path;
    } catch {
      // not here
    }
  }
  return null;
}

const tail = (buffer) => (buffer ?? Buffer.alloc(0)).subarray(-TAIL_BYTES).toString("utf8");

/**
 * Run one command and append its receipt to a run ledger. Inputs are hashed before the run and outputs after it;
 * paths are recorded relative to `folder`. `fields` come first in the receipt: a study's unit, arm, trial and plan
 * hash, or nothing for a paper's own runs. A non-zero exit is data; a command that could not start is recorded too.
 */
/** A path as a receipt records it: relative to the ledger's folder, so a study folder can move as a whole. */
export function receiptPath(folder, absolute) {
  return relative(folder, absolute) || ".";
}

export function recordRun(
  ledgerPath,
  folder,
  argv,
  { inputs = [], outputs = [], cwd = process.cwd(), fields = {} } = {},
) {
  if (argv.length === 0) throw new Error("run needs a command after --");
  const rel = (path) => receiptPath(folder, resolve(cwd, path));
  const receipt = {
    kind: "run",
    id: nextId(readLedger(ledgerPath), "R"),
    ...fields,
    argv,
    cwd: rel("."),
    program: null,
    inputs: inputs.map((path) => ({ path: rel(path), sha256: fileHash(resolve(cwd, path)) })),
    started_at: now(),
  };
  const program = resolveProgram(argv[0], cwd);
  receipt.program = program ? { path: program, sha256: fileHash(program) } : { path: null, sha256: null };
  const started = process.hrtime.bigint();
  const result = spawnSync(argv[0], argv.slice(1), { cwd, stdio: ["inherit", "pipe", "pipe"], maxBuffer: 1 << 30 });
  receipt.duration_ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
  receipt.finished_at = now();
  receipt.exit_code = result.status;
  receipt.signal = result.signal;
  receipt.error = result.error ? result.error.message : null;
  receipt.stdout_tail = tail(result.stdout);
  receipt.stderr_tail = tail(result.stderr);
  receipt.outputs = outputs.map((path) => ({ path: rel(path), sha256: fileHash(resolve(cwd, path)) }));
  return { receipt: appendChained(ledgerPath, receipt), stdout: result.stdout, stderr: result.stderr };
}

/**
 * Run one command of the study and append its receipt to the run ledger. The receipt names the plan hash and whether
 * that hash was locked when the command ran, so runs before the lock (pilots) stay apart from the study's runs.
 */
export function runStep(planPath, argv, { inputs = [], outputs = [], unit, arm, trial, cwd = process.cwd() } = {}) {
  if (argv.length === 0) throw new Error("run needs a command after --");
  const state = lockState(planPath);
  return recordRun(runLedgerPath(planPath), dirname(resolve(planPath)), argv, {
    inputs,
    outputs,
    cwd,
    fields: {
      unit: unit ?? null,
      arm: arm ?? null,
      trial: trial === undefined ? null : Number(trial),
      split:
        plannedRuns(readFileSync(planPath, "utf8")).find((run) => run.unit === unit && run.arm === arm)?.split ?? null,
      plan_sha256: state.current,
      plan_locked: state.locked,
    },
  });
}

/** Log a departure from the plan. It holds the analysis until someone clears it. */
export function addDeviation(planPath, { what, unit, arm, by, at = now() }) {
  if (!what) throw new Error("a deviation needs --what: what departed from the plan");
  if (!by) throw new Error("a deviation needs --by: who logged it");
  const path = deviationLogPath(planPath);
  const records = readLedger(path);
  return appendChained(path, {
    kind: "deviation",
    id: nextId(records, "D"),
    what,
    unit: unit ?? null,
    arm: arm ?? null,
    by,
    at,
  });
}

/** Clear a logged deviation, naming who cleared it. */
export function clearDeviation(planPath, id, { by, at = now() }) {
  if (!by) throw new Error("clear needs --by: who cleared the deviation");
  const path = deviationLogPath(planPath);
  const records = readLedger(path);
  if (!records.some((record) => record.kind === "deviation" && record.id === id))
    throw new Error(`no deviation ${id} in ${path}`);
  if (records.some((record) => record.kind === "clearance" && record.id === id))
    throw new Error(`${id} is already cleared`);
  return appendChained(path, { kind: "clearance", id, by, at });
}

/** Each deviation with the clearance that cleared it, or null. */
export function deviations(planPath) {
  const records = readLedger(deviationLogPath(planPath));
  const clearances = new Map(
    records.filter((record) => record.kind === "clearance").map((record) => [record.id, record]),
  );
  return records
    .filter((record) => record.kind === "deviation")
    .map((record) => ({ ...record, cleared: clearances.get(record.id) ?? null }));
}

/**
 * Planned runs against the receipts made under a locked plan hash: per unit and arm, the trials planned, the
 * receipts, how many exited non-zero or could not start, and the cleared deviations that cover a shortfall.
 */
/**
 * The runs the check requires: the plan's planned runs, raised to the count in force when the first study run was
 * made, so an amendment after the data cannot lower what must have run.
 */
function requiredRuns(planPath, lock, studyReceipts) {
  const current = plannedRuns(readFileSync(planPath, "utf8"));
  const first = studyReceipts[0];
  const inForce = first ? (lock?.entries.find((entry) => entry.sha256 === first.plan_sha256)?.runs ?? []) : [];
  const key = (run) => `${run.unit}\u0000${run.arm}`;
  const required = new Map(current.map((run) => [key(run), { ...run }]));
  for (const run of inForce) {
    const existing = required.get(key(run));
    if (!existing) required.set(key(run), { ...run });
    else existing.trials = Math.max(existing.trials, run.trials);
  }
  return [...required.values()];
}

export function manifest(planPath) {
  const lock = readLock(planPath);
  const hashes = new Set(lockedHashes(lock));
  const receipts = readLedger(runLedgerPath(planPath));
  const studyReceipts = receipts.filter((receipt) => receipt.plan_locked && hashes.has(receipt.plan_sha256));
  const logged = deviations(planPath);
  const rows = requiredRuns(planPath, lock, studyReceipts).map((planned) => {
    const mine = studyReceipts.filter((receipt) => receipt.unit === planned.unit && receipt.arm === planned.arm);
    const started = mine.filter((receipt) => receipt.exit_code !== null || receipt.signal !== null);
    const trialsRun = new Set(
      started
        .map((receipt) => receipt.trial)
        .filter((trial) => Number.isInteger(trial) && trial >= 1 && trial <= planned.trials),
    );
    const covering = logged.filter(
      (deviation) =>
        deviation.cleared &&
        deviation.unit === planned.unit &&
        (deviation.arm === null || deviation.arm === planned.arm),
    );
    return {
      ...planned,
      ran: started.length,
      missingTrials: Array.from({ length: planned.trials }, (_, index) => index + 1).filter(
        (trial) => !trialsRun.has(trial),
      ),
      nonzero: mine.filter((receipt) => receipt.exit_code !== 0 && receipt.exit_code !== null).length,
      notStarted: mine.filter((receipt) => receipt.exit_code === null && receipt.signal === null).length,
      deviations: covering.map((deviation) => deviation.id),
    };
  });
  const planned = new Set(rows.map((row) => `${row.unit}\u0000${row.arm}`));
  const unplanned = studyReceipts.filter(
    (receipt) => receipt.unit !== null && !planned.has(`${receipt.unit}\u0000${receipt.arm}`),
  );
  return {
    rows,
    // A paper's own receipt (paper.mjs run) carries no plan fields and is neither a pilot nor a study run.
    beforeLock: receipts.filter((receipt) => "plan_locked" in receipt && !receipt.plan_locked).length,
    otherPlan: receipts.filter((receipt) => receipt.plan_locked && !hashes.has(receipt.plan_sha256)).length,
    unplanned: unplanned.map((receipt) => receipt.id),
  };
}

/**
 * Outputs whose file no longer matches the last receipt that recorded it: a result edited by hand, or overwritten by
 * a command that ran without a receipt. A file a later receipt rewrote is checked against that later receipt.
 */
export function changedOutputs(planPath) {
  const folder = dirname(resolve(planPath));
  const last = new Map();
  for (const receipt of readLedger(runLedgerPath(planPath)))
    for (const output of receipt.outputs ?? []) last.set(output.path, { receipt: receipt.id, sha256: output.sha256 });
  return [...last.entries()]
    .filter(([path, recorded]) => recorded.sha256 !== null && fileHash(resolve(folder, path)) !== recorded.sha256)
    .map(([path, recorded]) => ({ path, receipt: recorded.receipt }));
}

/**
 * Whether the analysis may run: the plan validates and is locked as it stands, no deviation is uncleared, and every
 * planned trial has a receipt or a cleared deviation covering its unit.
 */
export function checkStudy(planPath) {
  const problems = [];
  const text = readFileSync(planPath, "utf8");
  for (const problem of validate("study-plan", text).problems) problems.push(`plan: ${problem}`);
  const state = lockState(planPath);
  if (!state.locked) problems.push(`plan: ${state.reason}`);
  for (const deviation of deviations(planPath)) {
    if (!deviation.cleared) problems.push(`deviation ${deviation.id} is not cleared: ${deviation.what}`);
  }
  const view = manifest(planPath);
  for (const row of view.rows) {
    if (row.missingTrials.length > 0 && row.deviations.length === 0)
      problems.push(
        `${row.unit} / ${row.arm}: trial(s) ${row.missingTrials.join(", ")} of ${row.trials} planned have no receipt under the locked plan, and no cleared deviation covers them`,
      );
  }
  for (const id of view.unplanned) problems.push(`${id} ran a unit and arm the plan does not list`);
  // A held-out unit is sealed until the lock: a run before it counts against the unit whatever split the plan gave
  // it at the time, so a unit cannot be used as tuning and then declared held-out.
  const heldOut = new Set(
    plannedRuns(text)
      .filter((run) => run.split === "held-out")
      .map((run) => `${run.unit}\u0000${run.arm}`),
  );
  for (const receipt of readLedger(runLedgerPath(planPath)))
    if (!receipt.plan_locked && (receipt.split === "held-out" || heldOut.has(`${receipt.unit}\u0000${receipt.arm}`)))
      problems.push(
        `${receipt.id} ran held-out unit ${receipt.unit} / ${receipt.arm} before the plan was locked; held-out items are run only under the lock`,
      );
  for (const changed of changedOutputs(planPath))
    problems.push(
      `${changed.path} changed after ${changed.receipt} wrote it; rewrite a result only through a new receipt, or give it a new name`,
    );
  const notes = [];
  (state.lock ?? readLock(planPath))?.entries.forEach((entry, index) => {
    const label = index === 0 ? "lock" : `amendment ${index}`;
    problems.push(...anchorProblems(planPath, entry, label));
    if (!entry.git?.commit)
      notes.push(`${label} is not anchored in git: ${entry.git?.reason ?? "it was made before anchors were recorded"}`);
  });
  // Plans written before these sections existed stay valid; a study-rigor plan without them is noted, not refused.
  const sections = parseMarkdown(text);
  if (sections.header.Rigor !== "check") {
    if (!sections.sections.has("Analysis variants"))
      notes.push('the plan lists no analysis variants (add "## Analysis variants", or "none", in an amendment)');
    if (!sections.sections.has("Models in the method"))
      notes.push(
        'the plan declares no models in the method (add "## Models in the method", or "none", in an amendment)',
      );
  }
  for (const [name, path] of [
    ["run ledger", runLedgerPath(planPath)],
    ["deviation log", deviationLogPath(planPath)],
  ]) {
    for (const line of chainBreaks(path))
      problems.push(`${name}: the hash chain breaks at line ${line}; a line was edited, removed or reordered`);
  }
  return { ok: problems.length === 0, problems, notes, state, manifest: view };
}

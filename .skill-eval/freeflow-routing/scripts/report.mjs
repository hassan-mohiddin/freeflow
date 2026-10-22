#!/usr/bin/env node
// Reads one or more freeflow-routing results and reports, per skill: how often its own requests opened it (hit rate,
// and on the first turn), how often its near misses opened it anyway (false-trigger rate), and what was opened instead
// when it was missed. With two results (before and after), it prints them side by side.
//
//   node .skill-eval/freeflow-routing/scripts/report.mjs <result> [<result>] [--results <dir>] [--cases] [--json]
//
// A result is a result ID under <dir> (default .skill-eval/runs), or a path to a result or aggregate folder. An
// aggregate's trials are all read. A skill counts as opened when the run read its SKILL.md: with `read`, or with a bash
// command that names the file (cat, sed, head). Runs that did not complete, and runs held for transcript flags no one
// has cleared, are left out and counted.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { unclearedFlags } from "../../../skills/evaluate-behavior/scripts/lib/scan.mjs";
import { CASES, SKILLS } from "./cases.mjs";

const SKILL_FILE = /\/skills\/([a-z0-9-]+)\/SKILL\.md\b/g;
const ARM = "freeflow";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function isDirectory(target) {
  return (await stat(target).catch(() => null))?.isDirectory() === true;
}

/** Every trial folder of a result: the result itself, or each trial an aggregate lists. */
async function trialDirectories(result, resultsDirectory) {
  const direct = (await isDirectory(result)) ? path.resolve(result) : path.join(resultsDirectory, result);
  const aggregate = await readJson(path.join(direct, "aggregate.json"));
  if (aggregate === null) return [direct];
  return aggregate.trials.map((trial) => path.join(path.dirname(direct), trial.id));
}

/** The tool calls of a stored run, each with its turn: every turn of a conversation, or the run's own activity. */
function toolCalls(run) {
  if (Array.isArray(run.turns)) {
    return run.turns.flatMap((turn) => (turn.toolActivity ?? []).map((call) => ({ ...call, turn: turn.turn })));
  }
  return (run.toolActivity ?? []).map((call) => ({ ...call, turn: 1 }));
}

/** Skills whose SKILL.md a run read, each with the first turn it was read on. */
export function openedSkills(run) {
  const opened = new Map();
  for (const call of toolCalls(run)) {
    if (call.completed !== true || call.isError === true) continue;
    const text = call.toolName === "read" ? call.args?.path : call.toolName === "bash" ? call.args?.command : undefined;
    if (typeof text !== "string") continue;
    for (const [, skill] of text.matchAll(SKILL_FILE)) {
      if (!opened.has(skill) || opened.get(skill) > call.turn) opened.set(skill, call.turn);
    }
  }
  return opened;
}

/** Every usable run of every case in the results, as { case, opened, trial }, plus what was left out. */
export async function collect(results, resultsDirectory) {
  const runs = [];
  const skipped = [];
  for (const result of results) {
    for (const trial of await trialDirectories(result, resultsDirectory)) {
      for (const entry of CASES) {
        const directory = path.join(trial, "groups", entry.id, ARM);
        const run = await readJson(path.join(directory, "run.json"));
        if (run === null) continue;
        if (run.state !== "complete") {
          skipped.push({ case: entry.id, trial, reason: run.state });
          continue;
        }
        const flags = await unclearedFlags(run, directory);
        if (flags.length > 0) {
          skipped.push({ case: entry.id, trial, reason: `held: ${flags.join(", ")}` });
          continue;
        }
        runs.push({ case: entry, opened: openedSkills(run), trial });
      }
    }
  }
  return { runs, skipped };
}

const share = (count, total) => (total === 0 ? null : { count, total, rate: count / total });

/** The per-skill measures over a set of runs. */
export function summarize(runs) {
  const skills = {};
  for (const skill of SKILLS) {
    const own = runs.filter((run) => run.case.hit === skill);
    const hits = own.filter((run) => run.case.expect.some((expected) => run.opened.has(expected)));
    const firstTurn = own.filter((run) => run.case.expect.some((expected) => run.opened.get(expected) === 1));
    const itself = own.filter((run) => run.opened.has(skill));
    const near = runs.filter((run) => run.case.not.includes(skill));
    const instead = {};
    for (const run of own) {
      if (run.case.expect.some((expected) => run.opened.has(expected))) continue;
      const others = [...run.opened.keys()];
      for (const other of others.length > 0 ? others : ["(none)"]) instead[other] = (instead[other] ?? 0) + 1;
    }
    // Opened where nothing named it: neither expected nor a near miss of it.
    const elsewhere = runs.filter(
      (run) => run.case.hit !== skill && !run.case.expect.includes(skill) && !run.case.not.includes(skill),
    );
    skills[skill] = {
      hit: share(hits.length, own.length),
      hitFirstTurn: share(firstTurn.length, own.length),
      opensItself: share(itself.length, own.length),
      falseTrigger: share(near.filter((run) => run.opened.has(skill)).length, near.length),
      openedElsewhere: share(elsewhere.filter((run) => run.opened.has(skill)).length, elsewhere.length),
      instead: Object.fromEntries(Object.entries(instead).sort(([, a], [, b]) => b - a)),
    };
  }
  const all = runs.length;
  return {
    runs: all,
    skills,
    overall: {
      hit: share(
        runs.filter((run) => run.case.hit !== null && run.case.expect.some((skill) => run.opened.has(skill))).length,
        runs.filter((run) => run.case.hit !== null).length,
      ),
      falseTrigger: share(
        runs.reduce((total, run) => total + run.case.not.filter((skill) => run.opened.has(skill)).length, 0),
        runs.reduce((total, run) => total + run.case.not.length, 0),
      ),
      opensPerRun: all === 0 ? null : runs.reduce((total, run) => total + run.opened.size, 0) / all,
    },
  };
}

const percent = (value) => (value === null ? "   -" : `${String(Math.round(value.rate * 100)).padStart(3)}%`);
const fraction = (value) => (value === null ? "-" : `${value.count}/${value.total}`);

// One column group per result: the hit rate and its count, the first-turn hit rate, how often the skill itself opened
// on its requests (differs from hit only where other skills count as the route, as for Workflow), the false-trigger
// rate and its count, and the skills opened instead on a miss.
const COLUMNS = ["hit", "n", "1st", "self", "false", "n"];
const WIDTHS = [4, 5, 4, 4, 5, 4];

function columns(values) {
  return values.map((value, index) => String(value).padStart(WIDTHS[index])).join(" ");
}

function table(labels, summaries) {
  const lines = [];
  lines.push(
    ["skill".padEnd(18), ...labels.map((label) => `${columns(COLUMNS)}  instead (${label})`.padEnd(64))]
      .join(" | ")
      .trimEnd(),
  );
  for (const skill of SKILLS) {
    const row = [skill.padEnd(18)];
    for (const summary of summaries) {
      const entry = summary.skills[skill];
      const instead = Object.entries(entry.instead)
        .slice(0, 3)
        .map(([name, count]) => `${name}×${count}`)
        .join(", ");
      row.push(
        `${columns([
          percent(entry.hit).trim(),
          fraction(entry.hit),
          percent(entry.hitFirstTurn).trim(),
          percent(entry.opensItself).trim(),
          percent(entry.falseTrigger).trim(),
          fraction(entry.falseTrigger),
        ])}  ${instead}`.padEnd(64),
      );
    }
    lines.push(row.join(" | ").trimEnd());
  }
  for (const [index, summary] of summaries.entries()) {
    lines.push(
      `${labels[index]}: ${summary.runs} runs; hit ${percent(summary.overall.hit).trim()} (${fraction(summary.overall.hit)}), false triggers ${percent(summary.overall.falseTrigger).trim()} (${fraction(summary.overall.falseTrigger)}), ${summary.overall.opensPerRun?.toFixed(2) ?? "-"} skills opened per run`,
    );
  }
  return lines.join("\n");
}

function caseLines(label, runs) {
  return runs.map((run) => {
    const opened = [...run.opened.entries()].map(([skill, turn]) => `${skill}@${turn}`).join(" ") || "(none)";
    const ok = run.case.hit === null || run.case.expect.some((skill) => run.opened.has(skill));
    const wrong = run.case.not.filter((skill) => run.opened.has(skill));
    return `${label} ${run.case.id.padEnd(22)} ${ok && wrong.length === 0 ? "ok  " : "MISS"} opened: ${opened}${wrong.length > 0 ? `; near miss opened: ${wrong.join(", ")}` : ""}`;
  });
}

async function main(argv) {
  const results = [];
  let resultsDirectory = path.join(process.cwd(), ".skill-eval", "runs");
  let json = false;
  let cases = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--results") resultsDirectory = path.resolve(argv[++index]);
    else if (argv[index] === "--json") json = true;
    else if (argv[index] === "--cases") cases = true;
    else results.push(argv[index]);
  }
  if (results.length === 0) {
    process.stderr.write("usage: report.mjs <result> [<result>] [--results <dir>] [--cases] [--json]\n");
    return 2;
  }
  const labels = results.length === 2 ? ["before", "after"] : results.map((_, index) => `r${index + 1}`);
  const collected = [];
  for (const result of results) collected.push(await collect([result], resultsDirectory));
  const summaries = collected.map(({ runs }) => summarize(runs));
  if (json) {
    const output = summaries.map((summary, index) => ({
      label: labels[index],
      result: results[index],
      ...summary,
      skipped: collected[index].skipped,
      cases: collected[index].runs.map((run) => ({
        case: run.case.id,
        trial: path.basename(run.trial),
        opened: Object.fromEntries(run.opened),
      })),
    }));
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  }
  const lines = [table(labels, summaries)];
  for (const [index, { skipped }] of collected.entries()) {
    if (skipped.length > 0) {
      lines.push(
        `${labels[index]}: left out ${skipped.length}: ${skipped.map((entry) => `${entry.case} (${entry.reason})`).join("; ")}`,
      );
    }
  }
  if (cases) for (const [index, { runs }] of collected.entries()) lines.push(...caseLines(labels[index], runs));
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));

#!/usr/bin/env node
// Reads one or more freeflow-routing results and reports, per skill: how often its own requests opened it (hit rate,
// and on the first turn), how often its near misses opened it anyway (false-trigger rate), and what was opened instead
// when it was missed; and, for cases that name the references and scripts their moment calls for, how often each was
// used. With two results (before and after), it prints them side by side, once per skill the suite
// measures (the base's 25) and once per skill of the merged build (v0.9.0's 11, each with the skills merged into it).
// A near miss counts only an open on the first turn: the simulated user's "go" on the second turn can ask for the
// work the near miss left out.
//
//   node .skill-eval/freeflow-routing/scripts/report.mjs <result> [<result>] [--results <dir>] [--cases] [--json]
//
// A result is a result ID under <dir> (default .skill-eval/runs), or a path to a result or aggregate folder. An
// aggregate's trials are all read. A skill counts as opened when the run read its SKILL.md: with `read`, or with a bash
// command that names the file (cat, sed, head). A reference counts as used the same way; a script when a bash command
// runs it with node. Runs that did not complete, and runs held for transcript flags no one has cleared, are left out
// and counted.
//
// Each run is measured on its own build: the skills Freeflow shipped are read from the package the evaluator built
// for the group (resources/freeflow/<n>/package/skills). On a build without a measured skill, its owner counts in its
// place (cases.mjs, routeCase): commit-work's requests count as routed when Deliver Work opens, and its near misses
// become Deliver Work's where that is still a different skill from the request's own route.
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { unclearedFlags } from "../../../skills/evaluate-behavior/scripts/lib/scan.mjs";
import { CASES, MOVED_PARTS, OWNERS, SKILLS, ownerOf, routeCase } from "./cases.mjs";

const SKILL_FILE = /\/skills\/([a-z0-9-]+)\/SKILL\.md\b/g;
const PART_FILE = /\bskills\/([a-z0-9-]+\/(?:SKILL\.md|references\/[a-z0-9-]+\.md|scripts\/[a-z0-9-]+\.mjs))\b/g;
const SEGMENT = /;|&&|\|\||\||\n/;
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

/** The skills a group's Freeflow build shipped, from the package the evaluator built; null when none is readable. */
export async function buildSkills(groupDirectory) {
  const builds = path.join(groupDirectory, "resources", "freeflow");
  let skills = null;
  for (const build of await readdir(builds).catch(() => [])) {
    const folder = path.join(builds, build, "package", "skills");
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => null);
    if (entries === null) continue;
    skills ??= new Set();
    for (const entry of entries) {
      if (entry.isDirectory() && (await stat(path.join(folder, entry.name, "SKILL.md")).catch(() => null))) {
        skills.add(entry.name);
      }
    }
  }
  return skills;
}

/**
 * References and scripts a run used, each with the first turn: a reference read with `read` or named in a bash command,
 * a script named in a bash command segment that runs node. A file that moved counts as the file that holds it now.
 */
export function usedParts(run) {
  const used = new Map();
  const note = (part, turn) => {
    const current = MOVED_PARTS[part] ?? part;
    if (current.endsWith("/SKILL.md")) return;
    if (!used.has(current) || used.get(current) > turn) used.set(current, turn);
  };
  for (const call of toolCalls(run)) {
    if (call.completed !== true || call.isError === true) continue;
    if (call.toolName === "read" && typeof call.args?.path === "string") {
      for (const [, part] of call.args.path.matchAll(PART_FILE)) if (!part.includes("/scripts/")) note(part, call.turn);
    } else if (call.toolName === "bash" && typeof call.args?.command === "string") {
      for (const segment of call.args.command.split(SEGMENT)) {
        for (const [, part] of segment.matchAll(PART_FILE)) {
          if (!part.includes("/scripts/") || /\bnode\b/.test(segment)) note(part, call.turn);
        }
      }
    }
  }
  return used;
}

/** One run as its build measures it: the case routed for the build's skills (the base's when unknown). */
export function measuredRun(entry, opened, present) {
  return { case: routeCase(entry, present ?? new Set(SKILLS)), opened, unknownBuild: present === null };
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
        const present = await buildSkills(path.join(trial, "groups", entry.id));
        runs.push({ ...measuredRun(entry, openedSkills(run), present), used: usedParts(run), trial });
      }
    }
  }
  return { runs, skipped };
}

/** Whether a run opened a near-miss skill on its first turn, the turn its request alone decides. */
const nearOpened = (run, skill) => run.opened.get(skill) === 1;

const share = (count, total) => (total === 0 ? null : { count, total, rate: count / total });

/** The measures of one row: its requests (`own`), the skill whose opening is "itself", and its near-miss checks. */
function row(own, itself, near) {
  const hit = (run) => run.case.expect.some((expected) => run.opened.has(expected));
  const instead = {};
  for (const run of own) {
    if (hit(run)) continue;
    const others = [...run.opened.keys()];
    for (const other of others.length > 0 ? others : ["(none)"]) instead[other] = (instead[other] ?? 0) + 1;
  }
  return {
    hit: share(own.filter(hit).length, own.length),
    hitFirstTurn: share(
      own.filter((run) => run.case.expect.some((expected) => run.opened.get(expected) === 1)).length,
      own.length,
    ),
    opensItself: share(own.filter((run) => run.opened.has(itself)).length, own.length),
    falseTrigger: share(near.filter((check) => nearOpened(check.run, check.target)).length, near.length),
    instead: Object.fromEntries(Object.entries(instead).sort(([, a], [, b]) => b - a)),
  };
}

/**
 * The measures over a set of runs: per measured skill (`skills`), per skill of the merged build (`owners`: the
 * requests and near misses of every skill merged into it, on either build), and overall. A request whose skill has
 * no owner on its build (`owned` false) counts toward no hit rate; `unowned` counts them.
 */
export function summarize(runs) {
  const counted = runs.filter((run) => run.case.hit !== null && run.case.owned);
  const checks = runs.flatMap((run) => run.case.checks.map((check) => ({ ...check, run })));
  const skills = {};
  for (const skill of SKILLS) {
    // Opened where nothing named it: neither its request, expected, nor a near-miss target.
    const elsewhere = runs.filter(
      (run) =>
        run.case.hit !== skill &&
        !run.case.expect.includes(skill) &&
        !run.case.checks.some((check) => check.target === skill),
    );
    skills[skill] = {
      ...row(
        counted.filter((run) => run.case.hit === skill),
        skill,
        checks.filter((check) => check.skill === skill),
      ),
      openedElsewhere: share(elsewhere.filter((run) => run.opened.has(skill)).length, elsewhere.length),
      unowned: runs.filter((run) => run.case.hit === skill && !run.case.owned).length,
    };
  }
  const owners = {};
  for (const owner of OWNERS) {
    owners[owner] = {
      merged: SKILLS.filter((skill) => ownerOf(skill) === owner && skill !== owner),
      ...row(
        counted.filter((run) => ownerOf(run.case.hit) === owner),
        owner,
        checks.filter((check) => check.family === owner),
      ),
    };
  }
  const parts = {};
  for (const part of [...new Set(runs.flatMap((run) => run.case.parts ?? []))].sort()) {
    const own = runs.filter((run) => run.case.parts?.includes(part));
    parts[part] = share(own.filter((run) => run.used.has(part)).length, own.length);
  }
  const pairs = runs.flatMap((run) => (run.case.parts ?? []).map((part) => run.used.has(part)));
  const usedKind = (kind) => runs.filter((run) => [...run.used.keys()].some((part) => part.includes(kind))).length;
  const all = runs.length;
  return {
    runs: all,
    skills,
    owners,
    parts,
    overall: {
      hit: share(
        counted.filter((run) => run.case.expect.some((skill) => run.opened.has(skill))).length,
        counted.length,
      ),
      falseTrigger: share(checks.filter((check) => nearOpened(check.run, check.target)).length, checks.length),
      opensPerRun: all === 0 ? null : runs.reduce((total, run) => total + run.opened.size, 0) / all,
      unowned: runs.filter((run) => run.case.hit !== null && !run.case.owned).length,
      droppedChecks: runs.reduce((total, run) => total + run.case.dropped.length, 0),
      unknownBuild: runs.filter((run) => run.unknownBuild).length,
      parts: share(pairs.filter(Boolean).length, pairs.length),
      runsReadingAReference: usedKind("/references/"),
      runsRunningAScript: usedKind("/scripts/"),
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

function table(labels, summaries, section, names, heading) {
  const lines = [];
  lines.push(
    [heading.padEnd(18), ...labels.map((label) => `${columns(COLUMNS)}  instead (${label})`.padEnd(64))]
      .join(" | ")
      .trimEnd(),
  );
  for (const skill of names) {
    const row = [skill.padEnd(18)];
    for (const summary of summaries) {
      const entry = summary[section][skill];
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
  return lines.join("\n");
}

/** One row per reference or script a case names: its share of those cases that used it, per result. */
function partsTable(labels, summaries) {
  const parts = [...new Set(summaries.flatMap((summary) => Object.keys(summary.parts)))].sort();
  const lines = [["part".padEnd(56), ...labels.map((label) => `used (${label})`.padEnd(16))].join(" | ").trimEnd()];
  for (const part of parts) {
    const row = [part.padEnd(56)];
    for (const summary of summaries) {
      const entry = summary.parts[part] ?? null;
      row.push(`${percent(entry)} ${fraction(entry).padStart(5)}`.padEnd(16));
    }
    lines.push(row.join(" | ").trimEnd());
  }
  return lines.join("\n");
}

function overallLines(labels, summaries) {
  return summaries.map((summary, index) => {
    const { overall } = summary;
    const notes = [
      overall.unowned > 0 ? `${overall.unowned} requests with no owner on this build` : null,
      overall.droppedChecks > 0 ? `${overall.droppedChecks} near-miss checks dropped for this build` : null,
      overall.unknownBuild > 0 ? `${overall.unknownBuild} runs whose build was unreadable, measured as the base` : null,
    ].filter(Boolean);
    return `${labels[index]}: ${summary.runs} runs; hit ${percent(overall.hit).trim()} (${fraction(overall.hit)}), false triggers ${percent(overall.falseTrigger).trim()} (${fraction(overall.falseTrigger)}), ${overall.opensPerRun?.toFixed(2) ?? "-"} skills opened per run; parts used ${percent(overall.parts).trim()} (${fraction(overall.parts)}); ${overall.runsReadingAReference} runs read a reference, ${overall.runsRunningAScript} ran a script${notes.length > 0 ? `; ${notes.join("; ")}` : ""}`;
  });
}

function caseLines(label, runs) {
  return runs.map((run) => {
    const opened = [...run.opened.entries()].map(([skill, turn]) => `${skill}@${turn}`).join(" ") || "(none)";
    const ok = run.case.hit === null || !run.case.owned || run.case.expect.some((skill) => run.opened.has(skill));
    const wrong = run.case.checks.map((check) => check.target).filter((skill) => nearOpened(run, skill));
    const missing = (run.case.parts ?? []).filter((part) => !run.used.has(part));
    return `${label} ${run.case.id.padEnd(22)} ${ok && wrong.length === 0 ? "ok  " : "MISS"} opened: ${opened}${wrong.length > 0 ? `; near miss opened: ${wrong.join(", ")}` : ""}${missing.length > 0 ? `; parts not used: ${missing.join(", ")}` : ""}`;
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
        expect: run.case.expect,
        nearMisses: run.case.checks.map((check) => check.target),
        dropped: run.case.dropped,
        used: Object.fromEntries(run.used),
      })),
    }));
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  }
  const lines = [
    table(labels, summaries, "skills", SKILLS, "skill"),
    "",
    table(labels, summaries, "owners", OWNERS, "owner (merged)"),
    ...OWNERS.filter((owner) => summaries[0].owners[owner].merged.length > 0).map(
      (owner) => `  ${owner} takes ${summaries[0].owners[owner].merged.join(", ")}`,
    ),
    "",
    partsTable(labels, summaries),
    "",
    ...overallLines(labels, summaries),
  ];
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

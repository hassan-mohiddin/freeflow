#!/usr/bin/env node
// The contributor gate (SPEC-002 B1): Freeflow developing Freeflow. It maps the paths a change touches to the
// regression suites that cover them (.skill-eval/gate.json), runs those suites through the evaluator with reuse
// and a pilot, and reports each as pass, regressed or undecided, with its cost.
//
// NOT part of `npm run check` or CI: it calls real models, needs the contributor's credentials, and costs money.
// Run it by hand: npm run eval:gate -- --base <ref> [--dry-run-plan] [--jobs <n>] [--max-cost <total>]
// Exit codes: 0 nothing regressed, 1 a suite regressed, 2 a refusal or infrastructure failure (and nothing
// regressed). See gate.md beside this file.

import { execFile, spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { armNames } from "../../skills/evaluate-behavior/scripts/lib/arms.mjs";
import { decide, validateDecision } from "../../skills/evaluate-behavior/scripts/lib/decision.mjs";
import { loadDefinition } from "../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { installedHostVersion } from "../../skills/evaluate-behavior/scripts/lib/identity.mjs";
import { baseProcessEnvironment } from "../../skills/evaluate-behavior/scripts/lib/pi.mjs";
import { readIndex, reuseKey } from "../../skills/evaluate-behavior/scripts/lib/reuse.mjs";
import { applySourceOverrides } from "../../skills/evaluate-behavior/scripts/lib/source-override.mjs";
import { aggregateGroups } from "../../skills/evaluate-behavior/scripts/lib/trials.mjs";

const execFileAsync = promisify(execFile);
const EVALUATOR = fileURLToPath(new URL("../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const DECLARATION = ".skill-eval/gate.json";
const PILOT_GROUPS = 3;
const ENTRY_FIELDS = new Set(["paths", "suite", "trials", "decision", "arms"]);
const SIDES = new Set(["base", "head"]);

export class GateRefusal extends Error {}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A glob over repository-relative paths: `**` crosses directories, `*` and `?` stay within one. */
export function globPattern(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*" && glob[index + 1] === "*") {
      const slash = glob[index + 2] === "/";
      pattern += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (character === "*") pattern += "[^/]*";
    else if (character === "?") pattern += "[^/]";
    else pattern += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

/** Reads and validates the gate's declaration. */
export async function loadGate(root, file = DECLARATION) {
  let gate;
  try {
    gate = JSON.parse(await readFile(path.resolve(root, file), "utf8"));
  } catch (error) {
    throw new GateRefusal(`cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const fail = (message) => {
    throw new GateRefusal(`${file}: ${message}`);
  };
  if (!isPlainObject(gate) || gate.schema_version !== 1) fail("schema_version must be 1");
  if (!isPlainObject(gate.model) || typeof gate.model.model !== "string") {
    fail("model must be { model, thinking? }");
  }
  if (!Array.isArray(gate.entries) || gate.entries.length === 0) fail("entries must be a non-empty array");
  for (const [index, entry] of gate.entries.entries()) {
    const label = `entries[${index}]`;
    if (!isPlainObject(entry)) fail(`${label} must be an object`);
    for (const key of Object.keys(entry)) if (!ENTRY_FIELDS.has(key)) fail(`${label} has unsupported field ${key}`);
    if (!Array.isArray(entry.paths) || entry.paths.length === 0 || entry.paths.some((p) => typeof p !== "string")) {
      fail(`${label}.paths must be a non-empty array of globs`);
    }
    if (typeof entry.suite !== "string") fail(`${label}.suite must be a suite path`);
    if (!Number.isInteger(entry.trials) || entry.trials < 1) fail(`${label}.trials must be a positive integer`);
    if (Object.hasOwn(entry, "decision") && entry.decision !== "none") {
      const rule = validateDecision(entry.decision, (message) => fail(`${label}.decision: ${message}`));
      // An override is applied to the aggregate afterwards, so it cannot schedule trials.
      if (rule.trials !== undefined) fail(`${label}.decision: an override cannot declare trials`);
      entry.decision = rule;
    }
    // Which arms take the base commit and which the current one, for every Git source ref they declare.
    if (Object.hasOwn(entry, "arms")) {
      const sides = isPlainObject(entry.arms) ? Object.values(entry.arms) : [];
      if (sides.length === 0 || sides.some((side) => !SIDES.has(side))) {
        fail(`${label}.arms must map arm names to "base" or "head"`);
      }
    }
  }
  return gate;
}

/** The entries whose globs match any changed path, each with the paths it matched; and the paths no entry covers. */
export function matchEntries(entries, changed) {
  const matched = [];
  const covered = new Set();
  for (const entry of entries) {
    const patterns = entry.paths.map(globPattern);
    const paths = changed.filter((file) => patterns.some((pattern) => pattern.test(file)));
    for (const file of paths) covered.add(file);
    if (paths.length > 0) matched.push({ ...entry, matched: paths });
  }
  return { matched, uncovered: changed.filter((file) => !covered.has(file)) };
}

export async function changedPaths(root, base) {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: root });
    return stdout.split("\n").filter(Boolean);
  } catch (error) {
    throw new GateRefusal(`cannot diff ${base}...HEAD: ${error?.stderr?.trim() || error.message}`);
  }
}

/**
 * What one matched suite will run: its groups, arms, trials and models, and how many subjects the results
 * index could already supply. An arm with no model is refused: the gate's default model would apply, but the
 * evaluator takes models only from definitions, so the suite must declare it.
 */
export async function planSuite(root, entry, gate, { hostVersion, index, commits = null }) {
  const suite = await loadDefinition(path.resolve(root, entry.suite), { root });
  if (suite.kind !== "suite") throw new GateRefusal(`${entry.suite} is not a suite`);
  // Base and head take the place of the arms' declared Git refs, as the evaluator's --source will.
  const sources = sourcesFor(entry, commits);
  try {
    applySourceOverrides({ groups: suite.groups.map((group) => ({ group })) }, sources);
  } catch (error) {
    throw new GateRefusal(`${entry.suite}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const schedule = suite.decision?.trials ?? null;
  const trials = schedule?.initial ?? entry.trials;
  const models = new Set();
  const missing = [];
  let subjects = 0;
  let reusable = 0;
  let judgeCalls = 0;
  const absent = new Set();
  for (const group of suite.groups) {
    for (const arm of armNames(group)) {
      const model = group.variants[arm].model;
      if (!model?.model) missing.push(`${group.id}/${arm}`);
      else models.add(`${model.model}${model.thinking ? ` (${model.thinking})` : ""}`);
      subjects += trials;
      // A rubric is judged after the run: one call per judge, run and trial.
      if (Array.isArray(group.rubric)) judgeCalls += trials * Math.max(1, group.judges?.length ?? 0);
      // An overridden arm reads its skills and context from that commit; say which it lacks before anything runs.
      const variant = group.variants[arm];
      if (sources?.[arm] !== undefined && variant.source?.kind === "git") {
        for (const entry of [...(variant.skills ?? []), ...(variant.context ?? [])]) {
          if (!(await existsAt(root, sources[arm], entry)))
            absent.add(`${arm} lacks ${entry} at ${sources[arm].slice(0, 12)}`);
        }
      }
      if (hostVersion !== null) {
        const key = await reuseKey({ group, arm, root, hostVersion }).catch(() => null);
        reusable += Math.min(trials, index.get(key)?.length ?? 0);
      }
    }
  }
  if (missing.length > 0) {
    const fallback = `${gate.model.model}${gate.model.thinking ? ` (${gate.model.thinking})` : ""}`;
    throw new GateRefusal(
      `${entry.suite}: arms without a model (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}); declare the gate's default ${fallback} in the suite's configuration`,
    );
  }
  const defaultModel = `${gate.model.model}${gate.model.thinking ? ` (${gate.model.thinking})` : ""}`;
  return {
    suite: entry.suite,
    groups: suite.groups.length,
    trials,
    adaptiveMax: schedule !== null && schedule.max > schedule.initial ? schedule.max : null,
    trialsNote:
      schedule !== null && schedule.initial !== entry.trials ? "the suite's decision schedule sets trials" : null,
    subjects,
    judgeCalls,
    absent: [...absent],
    reusable: hostVersion === null ? null : reusable,
    models: [...models],
    // The suite's own configuration keeps precedence; a different model is shown, not changed.
    otherModels: [...models].filter((model) => model !== defaultModel),
    decision:
      entry.decision === "none"
        ? "none"
        : entry.decision !== undefined
          ? "override"
          : suite.decision
            ? "suite"
            : "comparisons",
    schedule,
    sources,
  };
}

async function existsAt(root, commit, file) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}:${file}`], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

/** The `--source` overrides an entry's `arms` ask for: each arm's side resolved to the base or head commit. */
export function sourcesFor(entry, commits) {
  if (entry.arms === undefined || commits === null) return null;
  return Object.fromEntries(Object.entries(entry.arms).map(([arm, side]) => [arm, commits[side]]));
}

/** The base ref and HEAD as commit SHAs, which is what `--source` takes. */
export async function resolveCommits(root, base) {
  const commit = async (ref) => {
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], {
        cwd: root,
      });
      return stdout.trim();
    } catch {
      throw new GateRefusal(`cannot resolve ${ref} to a commit`);
    }
  };
  return { base: await commit(base), head: await commit("HEAD") };
}

export function formatPlan(plans, { uncovered }) {
  const lines = [];
  for (const plan of plans) {
    const range = plan.adaptiveMax === null ? "" : ` to ${(plan.subjects / plan.trials) * plan.adaptiveMax}`;
    const reuse = plan.reusable === null ? "unknown (no host version)" : `up to ${plan.reusable}`;
    lines.push(
      `Suite ${plan.suite}: ${plan.groups} groups, ${plan.trials} trials, ${plan.subjects}${range} subjects; reuse ${reuse}; models ${plan.models.join(", ")}; verdict from ${plan.decision}`,
    );
    if (plan.judgeCalls > 0) lines.push(`  judging: ${plan.judgeCalls} judge calls after the run (review --rubric)`);
    for (const note of plan.absent ?? []) lines.push(`  warning: ${note}; that arm's runs will be invalid`);
    if (plan.trialsNote) lines.push(`  note: ${plan.trialsNote}`);
    if (plan.sources) {
      const arms = Object.entries(plan.sources).map(([arm, commit]) => `${arm}=${commit.slice(0, 12)}`);
      lines.push(`  sources: ${arms.join(", ")}`);
    }
    if (plan.otherModels.length > 0)
      lines.push(`  note: the suite's own model ${plan.otherModels.join(", ")} keeps precedence`);
  }
  if (uncovered.length > 0) {
    const shown = uncovered.slice(0, 10).join(", ");
    const more = uncovered.length > 10 ? ` and ${uncovered.length - 10} more` : "";
    lines.push(`Not covered by any suite (${uncovered.length}): ${shown}${more}`);
  }
  return lines;
}

/**
 * One suite's verdict from its aggregate. With a decision (the suite's, or the entry's override): "worse" is
 * regressed, "beats" or "no-difference-shown" is pass, and a claim that reached no class is undecided. Without
 * one: a comparison whose non-reference arm passed fewer times than the reference is regressed; every
 * comparison fully graded with each other arm passing at least as often is pass; anything else is undecided.
 */
export function suiteVerdict(aggregate, override = undefined) {
  if (override !== "none" && (override !== undefined || aggregate.decision !== undefined)) {
    const decision = override === undefined ? aggregate.decision : decide(override, aggregate.groups ?? []);
    // A dry run or an aggregate with no complete trial reaches no claim, whichever rule reads it.
    const supported = aggregate.claim?.class !== "none";
    const detail = `${decision.verdict}: better ${decision.better}, worse ${decision.worse}, ties ${decision.ties}, p ${Number(decision.p.toPrecision(4))}`;
    if (!supported)
      return {
        verdict: "undecided",
        detail: `${detail}; claim none (${aggregate.claim?.reason ?? "no complete trial"})`,
      };
    if (decision.verdict === "worse") return { verdict: "regressed", detail };
    return { verdict: "pass", detail };
  }
  const regressions = [];
  let unresolved = 0;
  let compared = 0;
  for (const group of aggregate.groups ?? []) {
    for (const comparison of group.comparisons ?? []) {
      const reference = comparison.reference ?? "baseline";
      const arms = comparison.arms ?? { baseline: comparison.baseline, candidate: comparison.candidate };
      const base = arms[reference];
      for (const [arm, counts] of Object.entries(arms)) {
        if (arm === reference || !counts || !base) continue;
        compared += 1;
        if (counts.pass < base.pass)
          regressions.push(`${group.id}/${comparison.id}: ${arm} ${counts.pass} < ${reference} ${base.pass}`);
        else if (counts.unavailable > 0 || base.unavailable > 0) unresolved += 1;
      }
    }
    // Judged yes/no dimensions read like comparisons: another arm judged yes fewer times than the reference.
    const reference = group.comparisons?.[0]?.reference ?? "baseline";
    const judgedArms = group.judged?.arms ?? {};
    for (const [dimension, base] of Object.entries(judgedArms[reference] ?? {})) {
      if (typeof base?.yes !== "number") continue;
      for (const [arm, dimensions] of Object.entries(judgedArms)) {
        const counts = dimensions?.[dimension];
        if (arm === reference || typeof counts?.yes !== "number") continue;
        compared += 1;
        if (counts.yes < base.yes) {
          regressions.push(`${group.id}/judged ${dimension}: ${arm} ${counts.yes} < ${reference} ${base.yes}`);
        } else if (counts.notJudged > 0 || base.notJudged > 0 || counts.unknown > 0 || base.unknown > 0) {
          unresolved += 1;
        }
      }
    }
  }
  if (regressions.length > 0) return { verdict: "regressed", detail: regressions.join("; ") };
  // A suite of one-arm groups measures one setup: there is nothing to regress against, so report its pass^k.
  const groups = aggregate.groups ?? [];
  if (compared === 0 && groups.length > 0 && groups.every((group) => Object.keys(group.runStates ?? {}).length === 1)) {
    const checks = groups.flatMap((group) => group.checks ?? []);
    const held = checks.filter((check) => check.passAll === true).length;
    return { verdict: "measured", detail: `one-arm suite: ${held} of ${checks.length} checks passed in every trial` };
  }
  if (compared === 0) return { verdict: "undecided", detail: "no comparison to read" };
  if (unresolved > 0) return { verdict: "undecided", detail: `${unresolved} comparisons with unavailable outcomes` };
  return { verdict: "pass", detail: `${compared} comparisons, none passed less often` };
}

/** What the gate's own run spent: every trial run's host-reported cost, except runs reused from the index. */
export async function aggregateCost(aggregate, runsDirectory) {
  let cost = 0;
  for (const trial of aggregate.trials ?? []) {
    const directory = path.join(runsDirectory, trial.id);
    const summary = JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8").catch(() => "{}"));
    for (const group of summary.groups ?? []) {
      for (const arm of Object.keys(group.variants ?? {})) {
        if (group.reused?.[arm]) continue;
        const run = JSON.parse(
          await readFile(path.join(directory, "groups", group.id, arm, "run.json"), "utf8").catch(() => "{}"),
        );
        cost += run.usage?.cost?.total ?? 0;
      }
    }
  }
  return Number(cost.toFixed(10));
}

function runEvaluator(root, args, { onOutput } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [EVALUATOR, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      onOutput?.(String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (error) => resolve({ code: null, stdout, stderr: `${stderr}${error.message}` }));
  });
}

/** Runs one matched suite and reads its aggregate into a report line. */
export async function runSuite(root, entry, plan, { jobs = null, maxCost = null, onOutput } = {}) {
  const args = ["run", entry.suite, "--yes", "--reuse", "--pilot", String(PILOT_GROUPS)];
  if (plan.schedule === null) args.push("--trials", String(entry.trials));
  for (const [arm, commit] of Object.entries(plan.sources ?? {})) args.push("--source", `${arm}=${commit}`);
  if (jobs !== null) args.push("--jobs", String(jobs));
  if (maxCost !== null) args.push("--max-cost", String(maxCost));
  const outcome = await runEvaluator(root, args, { onOutput });
  const aggregatePath = outcome.stdout.match(/^Aggregate: .+\nPath: (.+)$/m)?.[1];
  // One trial without a decision is an ordinary result, not an aggregate: count it the way an aggregate would.
  // The last result printed is the run itself; a passed pilot's result is printed before it.
  const singlePath = [...outcome.stdout.matchAll(/^Result: .+\nPath: (.+)$/gm)].at(-1)?.[1];
  const pilotStopped = /^Pilot: .+ stopped the run$/m.test(outcome.stdout);
  if (aggregatePath === undefined && !pilotStopped && singlePath !== undefined) {
    const summary = JSON.parse(await readFile(path.join(singlePath, "summary.json"), "utf8"));
    const single = { id: summary.id, path: singlePath, state: summary.state, summary };
    const aggregate = {
      id: summary.id,
      state: summary.state,
      trials: [{ id: summary.id, state: summary.state }],
      groups: await aggregateGroups([single]),
      claim: { class: summary.dryRun ? "none" : "rate-on-suite", k: 1 },
    };
    return readAggregate(entry, aggregate, path.dirname(singlePath));
  }
  if (aggregatePath === undefined) {
    const pilot = outcome.stdout.match(/^Pilot: .+ stopped the run\n((?: {2}- .+\n?)*)/m);
    const reason = pilot
      ? `stopped by the pilot: ${pilot[1]
          .split("\n")
          .filter(Boolean)
          .map((line) => line.replace(/^\s*- /, ""))
          .join("; ")}`
      : outcome.stderr.trim() || `the evaluator exited ${outcome.code}`;
    return { suite: entry.suite, verdict: "infrastructure", detail: reason, aggregate: null, cost: null };
  }
  let aggregate = JSON.parse(await readFile(path.join(aggregatePath, "aggregate.json"), "utf8"));
  // Groups with a rubric are judged after the run (their judges come from the group); judging rebuilds the
  // aggregate with the judged section the verdict reads.
  if ((aggregate.groups ?? []).some((group) => group.judged !== undefined)) {
    const judged = await runEvaluator(root, ["review", aggregatePath, "--rubric"], { onOutput });
    if (judged.code !== 0) {
      return {
        suite: entry.suite,
        verdict: "infrastructure",
        detail: `judging failed: ${judged.stderr.trim() || judged.stdout.trim().split("\n").at(-1) || `exit ${judged.code}`}`,
        aggregate: aggregate.id,
        cost: await aggregateCost(aggregate, path.dirname(aggregatePath)),
      };
    }
    aggregate = JSON.parse(await readFile(path.join(aggregatePath, "aggregate.json"), "utf8"));
  }
  return readAggregate(entry, aggregate, path.dirname(aggregatePath));
}

/** A suite's report from its aggregate: verdict, cost and reuse, or infrastructure when runs failed. */
async function readAggregate(entry, aggregate, runsDirectory) {
  const cost = await aggregateCost(aggregate, runsDirectory);
  const failedRuns = (aggregate.groups ?? []).flatMap((group) =>
    Object.entries(group.runStates ?? {}).flatMap(([arm, states]) =>
      ["infrastructure-failed", "invalid", "cancelled"]
        .filter((state) => states[state])
        .map((state) => `${group.id}/${arm} ${state}`),
    ),
  );
  const { verdict, detail } = suiteVerdict(aggregate, entry.decision);
  // A regression stands on the runs that completed; anything else with failed runs cannot vouch for the suite.
  if (verdict !== "regressed" && (failedRuns.length > 0 || aggregate.state === "cancelled")) {
    return {
      suite: entry.suite,
      verdict: "infrastructure",
      detail: `aggregate ${aggregate.state}: ${failedRuns.slice(0, 5).join(", ") || "cancelled"}`,
      aggregate: aggregate.id,
      cost,
    };
  }
  return { suite: entry.suite, verdict, detail, aggregate: aggregate.id, cost, reused: aggregate.reused?.length ?? 0 };
}

export function exitCode(reports) {
  if (reports.some((report) => report.verdict === "regressed")) return 1;
  if (reports.some((report) => report.verdict === "infrastructure")) return 2;
  return 0;
}

function parseArguments(argv) {
  const options = { base: null, dryRunPlan: false, jobs: null, maxCost: null, gate: DECLARATION };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (option === "--dry-run-plan") {
      options.dryRunPlan = true;
      continue;
    }
    if (!["--base", "--jobs", "--max-cost", "--gate"].includes(option))
      throw new GateRefusal(`unknown option ${option}`);
    if (value === undefined || value.startsWith("--")) throw new GateRefusal(`${option} requires a value`);
    index += 1;
    if (option === "--base") options.base = value;
    if (option === "--gate") options.gate = value;
    if (option === "--jobs") {
      if (!/^\d+$/.test(value) || Number(value) < 1) throw new GateRefusal("--jobs must be a positive integer");
      options.jobs = Number(value);
    }
    if (option === "--max-cost") {
      if (!(Number(value) > 0)) throw new GateRefusal("--max-cost must be a positive number");
      options.maxCost = Number(value);
    }
  }
  if (options.base === null) throw new GateRefusal("--base <ref> is required");
  return options;
}

export async function main(argv, { root = process.cwd(), write = (text) => process.stdout.write(text) } = {}) {
  try {
    const options = parseArguments(argv);
    const canonicalRoot = await realpath(root);
    const gate = await loadGate(canonicalRoot, options.gate);
    const changed = await changedPaths(canonicalRoot, options.base);
    const { matched, uncovered } = matchEntries(gate.entries, changed);
    if (matched.length === 0) {
      write(`No suite covers the ${changed.length} changed paths since ${options.base}.\n`);
      return 0;
    }
    const hostVersion = await installedHostVersion("pi", baseProcessEnvironment()).catch(() => null);
    const index = await readIndex(path.join(canonicalRoot, ".skill-eval", "runs"));
    const plans = [];
    const commits = matched.some((entry) => entry.arms !== undefined)
      ? await resolveCommits(canonicalRoot, options.base)
      : null;
    for (const entry of matched) {
      plans.push(await planSuite(canonicalRoot, entry, gate, { hostVersion, index, commits }));
    }
    write(`Gate since ${options.base}: ${changed.length} changed paths, ${matched.length} suites\n`);
    for (const line of formatPlan(plans, { uncovered })) write(`${line}\n`);
    if (options.dryRunPlan) return 0;

    const reports = [];
    let spent = 0;
    for (const [index, entry] of matched.entries()) {
      const remaining = options.maxCost === null ? null : Number((options.maxCost - spent).toFixed(10));
      if (remaining !== null && remaining <= 0) {
        reports.push({
          suite: entry.suite,
          verdict: "undecided",
          detail: "not run: --max-cost spent",
          aggregate: null,
          cost: 0,
        });
        continue;
      }
      const report = await runSuite(canonicalRoot, entry, plans[index], { jobs: options.jobs, maxCost: remaining });
      spent += report.cost ?? 0;
      reports.push(report);
    }
    for (const report of reports) {
      const cost = report.cost === null ? "-" : String(report.cost);
      const reused = report.reused ? `, ${report.reused} reused` : "";
      write(
        `${report.verdict.toUpperCase()} ${report.suite} (aggregate ${report.aggregate ?? "-"}, cost ${cost}${reused}): ${report.detail}\n`,
      );
    }
    return exitCode(reports);
  } catch (error) {
    write(`Gate refused: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}

// `skill-eval clear`: a person's decision that a transcript-scan flag does not taint a run. The clearance is
// recorded beside the run in `clearances.json`, with the reason; the run's own files never change. Every aggregate
// that lists the run's result is then rebuilt, so the run counts again once none of its flags is left uncleared.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { clearFlags, unclearedFlags } from "./scan.mjs";
import { rebuildAggregate } from "./trials.mjs";
import { resolveResult } from "./view.mjs";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Clears flags of one run and rebuilds the aggregates that list its result.
 *
 * @param {string} target a result ID or directory (a trial, never an aggregate)
 * @param {{ group?: string | null, variant?: string | null, flags: string[] | "all", reason: string, root?: string, results?: string | null }} options
 */
export async function clearRun(
  target,
  { group = null, variant = null, flags, reason, root = process.cwd(), results = null },
) {
  const directory = await resolveResult(target, root, results);
  if (await stat(path.join(directory, "aggregate.json")).catch(() => null)) {
    throw new Error(
      "clear names one trial's result, not an aggregate; view the aggregate to see which trial holds the run",
    );
  }
  const summary = await readJson(path.join(directory, "summary.json"));
  if (summary === null) throw new Error(`not a readable result: ${directory}`);
  const groups = summary.groups ?? [];
  const position = group !== null && /^\d+$/.test(group) ? Number(group) : null;
  const selected =
    group === null
      ? groups
      : groups.filter((entry) => (position === null ? entry.id === group : entry.position === position));
  if (selected.length !== 1) {
    throw new Error(
      group === null ? "the result has several groups; name one with --group" : `no group ${group} in the result`,
    );
  }
  const [chosen] = selected;
  const arms = Object.keys(chosen.variants ?? {});
  const arm = variant ?? (arms.length === 1 ? arms[0] : null);
  if (arm === null || !arms.includes(arm)) {
    throw new Error(
      variant === null ? `name the arm with --variant: ${arms.join(", ")}` : `no arm ${arm} in group ${chosen.id}`,
    );
  }
  const armDirectory = path.join(directory, "groups", chosen.id, arm);
  const run = await readJson(path.join(armDirectory, "run.json"));
  if (run === null) throw new Error(`the run of ${chosen.id} ${arm} is unreadable`);
  const cleared = await clearFlags(armDirectory, run, flags, reason);
  const remaining = await unclearedFlags(run, armDirectory);

  // Every aggregate stored beside the result that lists it as a trial counts the run anew.
  const runsDirectory = path.dirname(directory);
  const rebuilt = [];
  for (const entry of await readdir(runsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const aggregate = await readJson(path.join(runsDirectory, entry.name, "aggregate.json"));
    if (aggregate?.kind !== "aggregate" || !(aggregate.trials ?? []).some((trial) => trial.id === summary.id)) continue;
    await rebuildAggregate(path.join(runsDirectory, entry.name), { root, results: runsDirectory });
    rebuilt.push(entry.name);
  }
  return { result: summary.id, group: chosen.id, arm, cleared, remaining, rebuilt };
}

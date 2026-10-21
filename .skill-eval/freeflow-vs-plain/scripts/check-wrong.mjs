#!/usr/bin/env node
// Grades each hand-made wrong answer in wrong/manifest.json as if it were the reference solution, with no model:
// the group's hidden tests must fail on it in every arm, with exactly the listed required tests failing, and each
// listed behaviour marker must grade as listed. Run from the
// repository root with TMPDIR under $HOME on Colima: node .skill-eval/freeflow-vs-plain/scripts/check-wrong.mjs
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { checkGroupReference } from "../../../skills/evaluate-behavior/scripts/lib/reference.mjs";

const suite = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(suite, "..", "..");
const { answers } = JSON.parse(readFileSync(join(suite, "wrong", "manifest.json"), "utf8"));
const only = process.argv.slice(2);
let problems = 0;

for (const entry of answers.filter((answer) => only.length === 0 || only.includes(answer.task))) {
  const group = await loadDefinition(join(suite, "groups", `${entry.task}.json`), { root });
  group.reference_solution = { files: relative(root, join(suite, "wrong", entry.task, entry.answer)) };
  const result = await checkGroupReference(group, { root });
  const lines = [];
  for (const arm of result.arms ?? []) {
    const hidden = arm.checks.find((check) => check.id === `${arm.arm}-hidden-tests`);
    const failing = (hidden?.observed?.tests?.required ?? [])
      .filter((test) => test.state !== "pass")
      .map((test) => test.name.replace(/^fvp: /, ""));
    const expected = [...entry.fails].sort();
    const ok = hidden?.state === "fail" && JSON.stringify([...failing].sort()) === JSON.stringify(expected);
    if (!ok) problems += 1;
    for (const [marker, state] of Object.entries(entry.markers ?? {})) {
      const check = arm.checks.find((candidate) => candidate.id === `${arm.arm}-${marker}`);
      const as = check?.state === state;
      if (!as) problems += 1;
      lines.push(`  ${arm.arm}: ${marker} ${check?.state ?? "missing"}${as ? "" : `  <-- expected ${state}`}`);
    }
    lines.push(
      `  ${arm.arm}: hidden-tests ${hidden?.state ?? "missing"}; failing: ${failing.join("; ") || "none"}${ok ? "" : "  <-- not as listed"}`,
    );
  }
  if ((result.arms ?? []).length === 0) {
    problems += 1;
    lines.push(`  ${result.state}: ${result.reason}`);
  }
  process.stdout.write(`${entry.task}/${entry.answer}: ${result.state}\n${lines.join("\n")}\n`);
}
if (problems > 0) {
  process.stderr.write(`${problems} wrong answers did not fail as listed\n`);
  process.exitCode = 1;
}

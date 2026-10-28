// Rechecking other people's numbers: GRIM, GRIMMER, DEBIT and p recomputed from a reported statistic, against exact
// closed forms and hand-derived cases, and the Recheck Table whose Status only the computation may write.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { skeleton, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";
import { pFromStatistic, recheck } from "../../../skills/research-work/scripts/lib/recheck.mjs";
import { chiSquareSurvival, fSurvival } from "../../../skills/research-work/scripts/lib/stats.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("the tail probabilities match their closed forms and the textbook critical values", () => {
  for (const x of [0.5, 3, 5.991465, 12]) close(chiSquareSurvival(x, 2), Math.exp(-x / 2));
  for (const [x, d2] of [
    [3.12, 57],
    [1, 4],
    [10, 30],
  ])
    close(fSurvival(x, 2, d2), (1 + (2 * x) / d2) ** (-d2 / 2));
  // t with 1 df is Cauchy; with 2 df its two-tailed p is 1 - |t| / sqrt(2 + t²).
  close(pFromStatistic({ test: "t", value: 3, df1: 1 }), 1 - (2 / Math.PI) * Math.atan(3));
  close(pFromStatistic({ test: "t", value: 1.5, df1: 2 }), 1 - 1.5 / Math.sqrt(2 + 1.5 ** 2));
  close(pFromStatistic({ test: "z", value: 1.959964 }), 0.05, 1e-6);
  close(pFromStatistic({ test: "chi2", value: 3.841459, df1: 1 }), 0.05, 1e-6);
  close(pFromStatistic({ test: "t", value: 2.048407, df1: 28 }), 0.05, 1e-6);
  close(pFromStatistic({ test: "F", value: 2.048407 ** 2, df1: 1, df2: 28 }), 0.05, 1e-6);
  // r with df 28 at the tabled critical value .3610 converts to t of about 2.0484.
  close(pFromStatistic({ test: "r", value: 0.361, df1: 28 }), 0.05, 2e-4);
  close(pFromStatistic({ test: "t", value: 2.048407, df1: 28, tails: 1 }), 0.025, 1e-6);
});

test("a reported p is compared with the range the rounded statistic allows", () => {
  assert.equal(recheck("p", "t(28) = 2.05, p = .05").status, "consistent");
  assert.equal(recheck("p", "t(28) = 2.20, p < .05").status, "consistent");
  assert.equal(recheck("p", "χ2(2, N = 120) = 5.99, p = .050").status, "consistent");
  assert.equal(recheck("p", "F(1, 28) = 4.20, p = .05").status, "consistent");
  assert.equal(recheck("p", "z = 1.96, p = .05").status, "consistent");
  assert.equal(recheck("p", "t(37) = −4.93, p < .001").status, "consistent");
  // p = .000 stands for a p below .0005.
  assert.equal(recheck("p", "t(37) = 4.93, p = .000").status, "consistent");
  const off = recheck("p", "t(28) = 2.20, p = .046");
  assert.equal(off.status, "mismatch");
  assert.match(off.detail, /t\(28\) = 2\.20 gives p = \.03/);
  // Significant as reported, not significant as computed: the conclusion changes.
  assert.equal(recheck("p", "t(28) = 1.50, p = .03").status, "decision error");
  assert.equal(recheck("p", "t(28) = 2.50, p = .20").status, "decision error");
  // Said to be one-tailed: half the two-tailed p.
  assert.equal(recheck("p", "t(28) = 1.80, p = .041, one-tailed").status, "consistent");
  const twoTailed = recheck("p", "t(28) = 1.80, p = .041");
  assert.equal(twoTailed.status, "decision error");
  assert.match(twoTailed.detail, /one-tailed/);
  assert.equal(recheck("p", "r(28) = .40, p = .03").status, "consistent");
  assert.equal(recheck("p", "t(28) = 0.50, ns").status, "consistent");
  assert.deepEqual(recheck("p", "the effect was large"), {
    status: "not computable",
    reason: "not read",
    detail: "no statistic of the forms t(df), F(df1, df2), χ2(df), r(df) or z with a p value",
  });
  assert.equal(recheck("p", "t = 2.20, p = .04").reason, "missing input");
});

test("GRIM: a mean must be a whole total divided by n, and large samples are not checked", () => {
  // 28 people: 145/28 = 5.179 and 146/28 = 5.214, so 5.19 is impossible and 5.18 and 5.21 are possible.
  assert.equal(recheck("grim", "M = 5.19, N = 28").status, "mismatch");
  assert.equal(recheck("grim", "M = 5.18, N = 28").status, "consistent");
  assert.equal(recheck("grim", "M = 5.21, n = 28").status, "consistent");
  // A tie rounds either way: 5/8 = 0.625 is reported as 0.62 or 0.63.
  assert.equal(recheck("grim", "M = 0.62, N = 8").status, "consistent");
  assert.equal(recheck("grim", "M = 0.63, N = 8").status, "consistent");
  // Three items each scored in whole numbers: totals move in steps of 1/84.
  assert.equal(recheck("grim", "M = 5.19, N = 28, items = 3").status, "consistent");
  assert.deepEqual(
    { ...recheck("grim", "M = 5.19, N = 120") },
    {
      status: "not computable",
      reason: "n too large",
      detail: "n × items = 120 is not below 10^2, so every mean of 2 decimals is possible",
    },
  );
  assert.equal(recheck("grim", "M = 5.19").reason, "missing input");
  // A percentage is the mean of 0 and 1 values: 57.4% of 62 is 35.6 people, and neither 35 nor 36 gives it.
  assert.equal(recheck("grim", "M = 57.4%, N = 62").status, "mismatch");
  assert.equal(recheck("grim", "M = 58.1%, N = 62").status, "consistent");
});

test("GRIMMER: the SD must come from a whole sum of squares of the right parity", () => {
  // Data 1, 2, 3, 4, 5: M = 3, SD = sqrt(2.5) = 1.58.
  assert.equal(recheck("grimmer", "M = 3.00, SD = 1.58, N = 5").status, "consistent");
  // n = 5, total 15: SD 1.60 needs a sum of squares of 55.24, and only whole numbers near it with T's parity work.
  assert.equal(recheck("grimmer", "M = 3.00, SD = 1.60, N = 5").status, "mismatch");
  assert.equal(recheck("grimmer", "M = 5.19, SD = 1.20, N = 28").status, "mismatch");
  assert.match(recheck("grimmer", "M = 5.19, SD = 1.20, N = 28").detail, /mean/);
  assert.equal(recheck("grimmer", "M = 5.19, SD = 1.20, N = 28, items = 3").reason, "not a single item");
});

test("DEBIT: a proportion's SD follows from the proportion and n", () => {
  // 3 of 10: sample SD sqrt(0.21 × 10 / 9) = 0.483.
  assert.equal(recheck("debit", "M = 0.30, SD = 0.48, N = 10").status, "consistent");
  assert.equal(recheck("debit", "M = 0.30, SD = 0.52, N = 10").status, "mismatch");
  // The population SD, sqrt(0.21) = 0.458, matches with a note.
  const population = recheck("debit", "M = 0.30, SD = 0.46, N = 10");
  assert.equal(population.status, "consistent");
  assert.match(population.detail, /population SD/);
  assert.equal(recheck("debit", "M = 1.30, SD = 0.46, N = 10").reason, "not binary");
});

/** A Recheck Table with the given rows (ID, Source, Where, Check, Reported, Status). */
function table(rows) {
  return skeleton("recheck", { title: "Smith 2019", owner: "O" }).replace(
    /\| N1 \|.*\|\n/,
    rows.map((row) => `| ${row.join(" | ")} |`).join("\n") + "\n",
  );
}

test("a Recheck Table's Status is written by the computation, and a hand-written status is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "research-recheck-"));
  const path = join(dir, "recheck.md");
  writeFileSync(
    path,
    table([
      ["N1", "S1", "Table 2", "grim", "M = 5.19, N = 28", "-"],
      ["N2", "S1", "p. 4", "p", "t(28) = 2.20, p = .036", "-"],
    ]),
  );
  assert.ok(validate("recheck", readFileSync(path, "utf8")).problems.some((problem) => /N1: Status/.test(problem)));
  const run = node("stats.mjs", "recheck", path, "--write");
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /N1: mismatch/);
  assert.match(run.stdout, /N2: consistent/);
  const written = readFileSync(path, "utf8");
  assert.match(written, /\| N1 \| S1 \| Table 2 \| grim \| M = 5\.19, N = 28 \| mismatch \|/);
  assert.deepEqual(validate("recheck", written).problems, []);
  writeFileSync(
    join(dir, "sources.md"),
    "# Source Ledger: S\n\n| ID | Source | Pin | Lookup | Checked | Read | Supports |\n| --- | --- | --- | --- | --- | --- | --- |\n| S2 | Smith 2019. A study | doi:10.1/x | not-looked-up | opened | full | x |\n",
  );
  const withLedger = node("artifact.mjs", "validate", path, "--sources", join(dir, "sources.md"));
  assert.match(withLedger.stdout, /the source ledger has no S1/, withLedger.stderr);
  const forged = written.replace("| mismatch |", "| consistent |");
  assert.ok(
    validate("recheck", forged).problems.some((problem) =>
      problem.includes("N1: Status says consistent, but the computation gives mismatch"),
    ),
  );
  const unknown = table([["N1", "S1", "Table 2", "sprite", "M = 5.19", "-"]]);
  assert.ok(validate("recheck", unknown).problems.some((problem) => problem.includes("Check must be one of")));
  // One check from the command line, as JSON.
  const one = spawnSync(process.execPath, [join(SCRIPTS, "stats.mjs"), "consistency"], {
    input: JSON.stringify({ method: "grim", text: "M = 5.18, N = 28" }),
    encoding: "utf8",
  });
  assert.equal(JSON.parse(one.stdout).status, "consistent", one.stderr);
});

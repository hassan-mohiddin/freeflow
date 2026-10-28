#!/usr/bin/env node
// Command line for Research Work's statistics. Input is one JSON object (a file, or "-" for stdin); output is the
// result as JSON. The object's "method" picks the calculation within the family; its other fields are the inputs.

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { parseMarkdown, parseTable } from "./lib/formats.mjs";
import { CHECKS, recheck, statusCell } from "./lib/recheck.mjs";
import * as stats from "./lib/stats.mjs";

const FAMILIES = {
  interval: {
    wilson: ({ successes, n, confidence }) => stats.wilsonInterval(successes, n, { confidence }),
    "exact-binomial": ({ successes, n, confidence }) => stats.exactBinomialInterval(successes, n, { confidence }),
    mean: ({ values, confidence }) => stats.meanInterval(values, { confidence }),
    clustered: ({ values, clusters, confidence }) => stats.clusteredMean(values, clusters, { confidence }),
    "clustered-bayes": ({ values, clusters, confidence }) =>
      stats.clusteredBetaBinomial(values, clusters, { confidence }),
    bootstrap: ({ values, clusters, resamples, seed, confidence }) =>
      stats.bootstrapMean(values, { clusters, resamples, seed, confidence }),
    icc: ({ values, clusters }) => stats.intraclassCorrelation(values, clusters),
    "design-effect": ({ n, clusterSize, icc }) => stats.designEffect({ n, clusterSize, icc }),
  },
  paired: {
    mcnemar: ({ armOnly, referenceOnly }) => stats.mcnemarExact({ armOnly, referenceOnly }),
    sign: ({ better, worse }) => ({ method: "sign-test", better, worse, p: stats.signTest(better, worse) }),
    difference: ({ pairs, confidence }) => stats.pairedDifference(pairs, { confidence }),
    permutation: ({ differences, resamples, seed }) => stats.signFlipTest(differences, { resamples, seed }),
  },
  agreement: {
    raters: ({ units }) => stats.raterAgreement(units),
    cohen: ({ pairs }) => stats.cohenKappa(pairs),
    weighted: ({ pairs, weights }) => stats.weightedKappa(pairs, { weights }),
    pabak: ({ pairs, categories }) => stats.pabak(pairs, { categories }),
    krippendorff: ({ units }) => stats.krippendorffAlpha(units),
  },
  correct: {
    holm: ({ pValues }) => stats.holm(pValues),
  },
  passk: {
    task: ({ n, c, k }) => ({
      method: "pass-k",
      n,
      c,
      k,
      passAtK: stats.passAtK(n, c, k),
      passPowerK: stats.passPowerK(n, c, k),
    }),
    suite: ({ tasks, k }) => stats.suitePassK(tasks, k),
    "task-interval": ({ n, c, k, confidence }) => stats.passPowerKInterval(n, c, k, { confidence }),
    "suite-interval": ({ tasks, k, resamples, seed, confidence }) =>
      stats.suitePassPowerKInterval(tasks, k, { resamples, seed, confidence }),
  },
  aggregate: {
    ...Object.fromEntries(
      stats.AGGREGATES.map((statistic) => [
        statistic,
        ({ scores, target, resamples, seed, confidence }) =>
          stats.aggregateScores(scores, { statistic, target, resamples, seed, confidence }),
      ]),
    ),
    improvement: ({ x, y, resamples, seed, confidence }) =>
      stats.probabilityOfImprovement(x, y, { resamples, seed, confidence }),
  },
  effect: Object.fromEntries(
    stats.EFFECT_MEASURES.map((measure) => [
      measure,
      ({ studies, method: _method, ...study }) =>
        studies !== undefined ? stats.effectSizes(measure, studies) : stats.effectSize(measure, study),
    ]),
  ),
  meta: {
    fixed: ({ yi, vi, confidence }) => stats.metaFixed(yi, vi, { confidence }),
    random: ({ yi, vi, confidence }) => stats.metaRandom(yi, vi, { confidence }),
    "leave-one-out": ({ yi, vi, model, labels, confidence }) =>
      stats.metaLeaveOneOut(yi, vi, { model, labels, confidence }),
  },
  tost: {
    paired: ({ differences, low, high, alpha }) => stats.tostPaired(differences, { low, high, alpha }),
  },
  consistency: Object.fromEntries(
    CHECKS.map((check) => [check, ({ text }) => ({ check, text, ...recheck(check, text) })]),
  ),
  power: {
    mcnemar: ({ n, armOnly, referenceOnly, alpha }) => stats.mcnemarPower({ n, armOnly, referenceOnly, alpha }),
    "mcnemar-cases": ({ armOnly, referenceOnly, alpha, power, maximum }) =>
      stats.mcnemarCasesForPower({ armOnly, referenceOnly, alpha, power, maximum }),
    "paired-cases": ({ difference, sdDifference, alpha, power }) =>
      stats.pairedCasesNeeded({ difference, sdDifference, alpha, power }),
    "paired-simulation": ({ n, difference, sdDifference, alpha, simulations, seed }) =>
      stats.pairedPowerBySimulation({ n, difference, sdDifference, alpha, simulations, seed }),
  },
};

const USAGE = [
  "Usage: stats.mjs <family> [--input <file|->] [--method <method>] [--text] [--out <result.json>]",
  "       stats.mjs recheck <recheck.md> [--write]",
  "",
  "recheck computes each row of a Recheck Table from its Reported text (GRIM, GRIMMER, DEBIT, or p from the statistic",
  "and its degrees of freedom) and prints its Status; --write puts it in the table. It exits 1 when a row is a",
  "mismatch or a decision error, or names no check it knows.",
  "",
  'One JSON object in; its "method" (or --method, which overrides it) picks the calculation, the other fields are its',
  "inputs. Defaults: confidence 0.95, alpha 0.05, power 0.8, seed 1. Omitted optional fields take these defaults.",
  "",
  ...Object.entries(FAMILIES).map(([family, methods]) => `  ${family.padEnd(10)} ${Object.keys(methods).join(", ")}`),
  "",
  'aggregate takes "scores", one array of run scores per task; optimality-gap takes "target" (1, for scores on 0 to 1).',
  'meta takes "yi", one effect size per study (a log risk ratio, a standardized mean difference), and "vi", their',
  "variances; random gives the DerSimonian-Laird tau² with the Hartung-Knapp interval as low and high;",
  'leave-one-out refits without each study in turn ("model" random or fixed, "labels" the studies\' IDs).',
  'effect makes them, the arm over the reference: unpaired from "p1", "p2", "n1", "n2"; paired from "armOnly",',
  '"referenceOnly", "both" (items both passed) and "n"; or "studies", a list of either, giving yi and vi for',
  "stats.mjs meta --method random --input <that file>.",
  'Example: echo \'{"method":"wilson","successes":10,"n":19}\' | stats.mjs interval',
].join("\n");

function fail(message) {
  console.error(message);
  process.exit(2);
}

/** Drops undefined and null fields so each function's own defaults apply. */
function defined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));
}

function summary(result) {
  if (result === null) return "No result: fewer than two raters.";
  const parts = [result.method];
  for (const name of [
    "estimate",
    "kappa",
    "alpha",
    "pabak",
    "p",
    "power",
    "passAtK",
    "passPowerK",
    "n",
    "icc",
    "tau2",
    "i2",
  ]) {
    if (typeof result[name] === "number") parts.push(`${name} ${Number(result[name].toPrecision(6))}`);
  }
  if (typeof result.low === "number")
    parts.push(
      `${Math.round(result.confidence * 100)}% [${Number(result.low.toPrecision(6))}, ${Number(result.high.toPrecision(6))}]`,
    );
  if (Array.isArray(result.adjusted))
    parts.push(`adjusted ${result.adjusted.map((p) => Number(p.toPrecision(6))).join(", ")}`);
  if (typeof result.equivalent === "boolean") parts.push(result.equivalent ? "equivalent" : "not shown equivalent");
  for (const warning of result.warnings ?? []) parts.push(`warning: ${warning}`);
  return parts.join("; ");
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string", default: "-" },
      text: { type: "boolean", default: false },
      method: { type: "string" },
      out: { type: "string" },
      write: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (parsed.values.help) {
  console.log(USAGE);
  process.exit(0);
}
if (parsed.positionals[0] === "recheck") {
  const [, path] = parsed.positionals;
  if (!path || parsed.positionals.length !== 2) fail(USAGE);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    fail(`could not read ${path}: ${error.message}`);
  }
  const lines = text.split(/\r?\n/);
  const table = parseTable(parseMarkdown(text).lines);
  if (!table || table.columns.at(-1) !== "Status") fail(`${path}: no Recheck Table (its last column is Status)`);
  let flagged = 0;
  // The Status cell is found by its column, so a row without a closing pipe keeps its Reported text.
  const statusColumn = table.columns.indexOf("Status") + 1;
  const setStatus = (line, status) => {
    const cellsOfLine = lines[line - 1].split("|");
    while (cellsOfLine.length <= statusColumn) cellsOfLine.push("");
    cellsOfLine[statusColumn] = ` ${status} `;
    if (cellsOfLine.length === statusColumn + 1) cellsOfLine.push("");
    lines[line - 1] = cellsOfLine.join("|");
  };
  for (const { line, cells } of table.rows) {
    if (!CHECKS.includes(cells.Check)) {
      // An unchecked row fails, and a status typed into it is cleared.
      console.log(`${cells.ID}: not checked: Check must be one of ${CHECKS.join(", ")}`);
      flagged += 1;
      setStatus(line, "-");
      continue;
    }
    const result = recheck(cells.Check, cells.Reported);
    const status = statusCell(result);
    if (result.status === "mismatch" || result.status === "decision error") flagged += 1;
    console.log(`${cells.ID}: ${status}: ${result.detail}`);
    setStatus(line, status);
  }
  if (parsed.values.write) writeFileSync(path, lines.join("\n"));
  process.exit(flagged > 0 ? 1 : 0);
}
const [family] = parsed.positionals;
if (parsed.positionals.length !== 1 || !(family in FAMILIES)) fail(USAGE);

let input;
try {
  const source = parsed.values.input === "-" ? readFileSync(0, "utf8") : readFileSync(parsed.values.input, "utf8");
  input = JSON.parse(source);
} catch (error) {
  fail(
    `could not read a JSON object from ${parsed.values.input === "-" ? "stdin" : parsed.values.input}: ${error.message}`,
  );
}
if (input === null || typeof input !== "object" || Array.isArray(input)) fail("the input must be one JSON object");
if (parsed.values.method !== undefined) input = { ...input, method: parsed.values.method };
const calculate = Object.hasOwn(FAMILIES[family], input.method) ? FAMILIES[family][input.method] : undefined;
if (!calculate)
  fail(`unknown method "${input.method}" for ${family}; choose one of: ${Object.keys(FAMILIES[family]).join(", ")}`);

let result;
try {
  result = calculate(defined(input));
} catch (error) {
  fail(error.message);
}
// The result records what computed it, so a register can show its verdict came from the method the plan locked.
if (result && typeof result === "object" && !Array.isArray(result))
  result = { ...result, computed_by: `stats.mjs ${family} ${input.method}` };
// --out writes the JSON result to a file, so a study receipt can declare it as an output.
if (parsed.values.out) writeFileSync(parsed.values.out, `${JSON.stringify(result, null, 2)}\n`);
console.log(parsed.values.text ? summary(result) : JSON.stringify(result, null, 2));

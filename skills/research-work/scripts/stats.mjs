#!/usr/bin/env node
// Command line for Research Work's statistics. Input is one JSON object (a file, or "-" for stdin); output is the
// result as JSON. The object's "method" picks the calculation within the family; its other fields are the inputs.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import * as stats from "./lib/stats.mjs";

const FAMILIES = {
  interval: {
    wilson: ({ successes, n, confidence }) => stats.wilsonInterval(successes, n, { confidence }),
    "exact-binomial": ({ successes, n, confidence }) => stats.exactBinomialInterval(successes, n, { confidence }),
    mean: ({ values, confidence }) => stats.meanInterval(values, { confidence }),
    clustered: ({ values, clusters, confidence }) => stats.clusteredMean(values, clusters, { confidence }),
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
    weighted: ({ pairs }) => stats.linearWeightedKappa(pairs),
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
  },
  tost: {
    paired: ({ differences, low, high, alpha }) => stats.tostPaired(differences, { low, high, alpha }),
  },
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
  "Usage: stats.mjs <family> [--input <file|->] [--text]",
  "",
  'One JSON object in; its "method" picks the calculation, the other fields are its inputs. Defaults: confidence',
  "0.95, alpha 0.05, power 0.8, seed 1. Omitted optional fields take these defaults.",
  "",
  ...Object.entries(FAMILIES).map(([family, methods]) => `  ${family.padEnd(10)} ${Object.keys(methods).join(", ")}`),
  "",
  'Example: echo \'{"method":"wilson","successes":10,"n":19}\' | stats.mjs interval',
].join("\n");

function fail(message) {
  console.error(message);
  process.exit(2);
}

/** Drops undefined fields so each function's own defaults apply. */
function defined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function summary(result) {
  if (result === null) return "No result: fewer than two raters.";
  const parts = [result.method];
  for (const name of ["estimate", "kappa", "alpha", "pabak", "p", "power", "passAtK", "passPowerK", "n", "icc"]) {
    if (typeof result[name] === "number") parts.push(`${name} ${Number(result[name].toPrecision(6))}`);
  }
  if (typeof result.low === "number")
    parts.push(
      `${Math.round(result.confidence * 100)}% [${Number(result.low.toPrecision(6))}, ${Number(result.high.toPrecision(6))}]`,
    );
  if (Array.isArray(result.adjusted))
    parts.push(`adjusted ${result.adjusted.map((p) => Number(p.toPrecision(6))).join(", ")}`);
  if (typeof result.equivalent === "boolean") parts.push(result.equivalent ? "equivalent" : "not shown equivalent");
  return parts.join("; ");
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string", default: "-" },
      text: { type: "boolean", default: false },
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
const calculate = FAMILIES[family][input.method];
if (!calculate)
  fail(`unknown method "${input.method}" for ${family}; choose one of: ${Object.keys(FAMILIES[family]).join(", ")}`);

let result;
try {
  result = calculate(defined(input));
} catch (error) {
  fail(error.message);
}
console.log(parsed.values.text ? summary(result) : JSON.stringify(result, null, 2));

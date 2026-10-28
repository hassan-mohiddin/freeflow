// Rechecking numbers reported by someone else's study: transcribe the reported text exactly, then compute. GRIM
// (Brown and Heathers 2017) asks whether a mean of whole-number data is a whole total divided by n; GRIMMER (Anaya
// 2016) asks the same of the SD's sum of squares; DEBIT (Heathers and Brown 2019) asks whether a proportion's SD
// follows from the proportion and n; the p check recomputes p from the reported statistic and degrees of freedom, as
// statcheck (Epskamp and Nuijten) does. Methods reimplemented from those descriptions; no code borrowed.
//
// A reported value with d decimals stands for the interval within half a unit of its last digit, so a check passes
// when any value in the reported intervals gives the reported result: a tie rounded either way passes.

import { chiSquareSurvival, fSurvival, normalCdf, tCdf } from "./stats.mjs";

export const CHECKS = ["grim", "grimmer", "debit", "p"];
export const STATUSES = ["consistent", "mismatch", "decision error", "not computable"];
export const REASONS = ["not read", "missing input", "n too large", "not a single item", "not binary"];

const ALPHA = 0.05;
const EPSILON = 1e-9;
const NUMBER = String.raw`[-−]?(?:\d+(?:\.\d+)?|\.\d+)`;

/** A reported number with its rounding interval: "5.19" is 5.185 to 5.195, ".036" is .0355 to .0365. */
function reported(text) {
  const clean = text.replace("−", "-");
  const decimals = clean.includes(".") ? clean.split(".")[1].length : 0;
  const value = Number(clean);
  const half = 0.5 * 10 ** -decimals;
  return { value, decimals, low: value - half, high: value + half };
}

/**
 * The value after `name =` in the text, as a reported number, or null. A percentage ("57.4%") is read as the
 * proportion it stands for, with two more decimals: 0.574, between 0.5735 and 0.5745.
 */
function field(text, names) {
  const match = new RegExp(String.raw`(?:^|[\s,;(])(?:${names})\s*=\s*(${NUMBER})(\s*%)?`, "i").exec(text);
  if (!match) return null;
  const number = reported(match[1]);
  if (!match[2]) return number;
  const decimals = number.decimals + 2;
  const half = 0.5 * 10 ** -decimals;
  const value = number.value / 100;
  return { value, decimals, low: value - half, high: value + half, percent: true };
}

const notComputable = (reason, detail) => ({ status: "not computable", reason, detail });

/** Format a p value the way papers do: no leading zero, three decimals, or "< .001". */
function formatP(p) {
  if (p < 0.001) return "< .001";
  return p.toFixed(p < 0.01 ? 4 : 3).replace(/^0/, "");
}

/** The p value of a statistic: two-tailed for t, z and r unless `tails` is 1; F and χ² are upper-tailed. */
export function pFromStatistic({ test, value, df1, df2, tails = 2 }) {
  const size = Math.abs(value);
  if (test === "F") return fSurvival(size, df1, df2);
  if (test === "chi2") return chiSquareSurvival(size, df1);
  let oneTail;
  if (test === "z") oneTail = 1 - normalCdf(size);
  else if (test === "t") oneTail = 1 - tCdf(size, df1);
  else if (test === "r") {
    if (size >= 1) return 0;
    oneTail = 1 - tCdf(size * Math.sqrt(df1 / (1 - size * size)), df1);
  } else throw new Error(`unknown test ${test}`);
  return Math.min(1, oneTail * tails);
}

/** The statistic and p a text reports: "t(28) = 2.20, p = .036", "F(1, 28) = 4.84, p < .05", "χ2(1, N = 90) = 3.9, ns". */
function parseTest(text) {
  const clean = text.replace(/−/g, "-");
  const statistic = new RegExp(
    String.raw`(?:^|[\s,;(])(t|F|χ2|χ²|chi2|chi-square|r|z|Z)\s*(?:\(\s*([\d.]+)\s*(?:,\s*(?:N\s*=\s*\d+|([\d.]+)))?\s*\))?\s*=\s*(${NUMBER})`,
  ).exec(clean);
  const pMatch = /(?:^|[\s,;(])p\s*(=|<|>|≤|≥|<=|>=)\s*(\d*\.\d+|\d+)/i.exec(clean);
  const ns = /(?:^|[\s,;(])(ns|n\.s\.)(?:$|[\s,;).])/i.test(clean);
  if (!statistic || (!pMatch && !ns)) return null;
  const name = statistic[1];
  const test = /^(χ2|χ²|chi2|chi-square)$/.test(name) ? "chi2" : name === "Z" ? "z" : name;
  return {
    test,
    df1: statistic[2] === undefined ? null : Number(statistic[2]),
    df2: statistic[3] === undefined ? null : Number(statistic[3]),
    statistic: reported(statistic[4]),
    p: pMatch ? { op: { "<=": "≤", ">=": "≥" }[pMatch[1]] ?? pMatch[1], ...reported(pMatch[2]) } : null,
    ns,
    oneTailed: /one[- ]tailed|one[- ]sided/i.test(clean),
    label: statistic[0].trim().replace(/^[,;(]\s*/, ""),
  };
}

/** Whether a computed range [low, high] of p fits the p as reported. */
function fits(range, parsed) {
  if (!parsed.p) return range.high > ALPHA - EPSILON;
  const { op, low, high, value } = parsed.p;
  if (op === "=") return range.low <= Math.max(high, 0) + EPSILON && range.high >= Math.max(low, 0) - EPSILON;
  if (op === "<" || op === "≤") return range.low < value + EPSILON;
  return range.high > value - EPSILON;
}

/** Whether the p as reported says significant at .05 (true), not significant (false), or cannot tell (null). */
function reportedSignificant(parsed) {
  if (!parsed.p) return false;
  const { op, value } = parsed.p;
  if (op === "=") return value <= ALPHA + EPSILON;
  if (op === "<" || op === "≤") return value <= ALPHA + EPSILON ? true : null;
  return value >= ALPHA - EPSILON ? false : null;
}

function checkP(text) {
  const parsed = parseTest(text);
  if (!parsed)
    return notComputable("not read", "no statistic of the forms t(df), F(df1, df2), χ2(df), r(df) or z with a p value");
  const needs = { t: ["df1"], r: ["df1"], chi2: ["df1"], F: ["df1", "df2"], z: [] }[parsed.test];
  if (needs.some((name) => parsed[name] === null))
    return notComputable("missing input", `${parsed.test} needs its degrees of freedom`);
  // t, z and r have two tails, halved when the text says one-tailed; F and χ² have only the upper tail.
  const directional = parsed.test === "t" || parsed.test === "z" || parsed.test === "r";
  const tails = directional && parsed.oneTailed ? 1 : 2;
  const half = 0.5 * 10 ** -parsed.statistic.decimals;
  const size = Math.abs(parsed.statistic.value);
  const range = (withTails) => {
    const ends = [size - half, size + half].map((end) =>
      pFromStatistic({ ...parsed, value: Math.max(end, 0), tails: withTails }),
    );
    return { low: Math.min(...ends), high: Math.max(...ends) };
  };
  const computed = range(tails);
  const p = pFromStatistic({ ...parsed, value: size, tails });
  const said = parsed.p ? `p ${parsed.p.op} ${parsed.p.value}` : "ns";
  const detail = `${parsed.label} gives p = ${formatP(p)} (${formatP(computed.low)} to ${formatP(computed.high)}${tails === 1 ? ", one-tailed" : ""}); reported ${said}`;
  if (fits(computed, parsed)) return { status: "consistent", detail };
  const significant = reportedSignificant(parsed);
  const computedSignificant = computed.high <= ALPHA + EPSILON ? true : computed.low > ALPHA + EPSILON ? false : null;
  const decision = significant !== null && computedSignificant !== null && significant !== computedSignificant;
  // A two-tailed reading that fails while the one-tailed p fits is reported, not passed: the text did not say so.
  const oneTailedFits = directional && tails === 2 && fits(range(1), parsed);
  const note = oneTailedFits ? "; the one-tailed p fits, but the text does not say one-tailed" : "";
  return { status: decision ? "decision error" : "mismatch", detail: detail + note };
}

/** The whole totals T for which T / count rounds to the reported mean. */
function grimTotals(mean, count) {
  const totals = [];
  for (let total = Math.ceil(mean.low * count - EPSILON); total <= Math.floor(mean.high * count + EPSILON); total++)
    totals.push(total);
  return totals;
}

function meanInputs(text, { sd = false } = {}) {
  const mean = field(text, "M|mean");
  const n = field(text, "N|n");
  const items = field(text, "items|k");
  const spread = sd ? field(text, "SD|sd|s") : null;
  return { mean, n: n?.value, items: items?.value ?? 1, sd: spread };
}

function checkGrim(text) {
  const { mean, n, items } = meanInputs(text);
  if (!mean || !n) return notComputable("missing input", "GRIM needs the mean (M) and n");
  const count = n * items;
  if (count >= 10 ** mean.decimals)
    return notComputable(
      "n too large",
      `n × items = ${count} is not below 10^${mean.decimals}, so every mean of ${mean.decimals} decimals is possible`,
    );
  const totals = grimTotals(mean, count);
  return totals.length > 0
    ? {
        status: "consistent",
        detail: `${totals[0]} / ${count} rounds to ${mean.percent ? `${mean.value * 100}%` : mean.value}`,
      }
    : {
        status: "mismatch",
        detail: `no whole total divided by ${count} rounds to ${mean.value} (${Math.floor(mean.low * count)} / ${count} and ${Math.ceil(mean.high * count)} / ${count} do not)`,
      };
}

function checkGrimmer(text) {
  const { mean, n, items, sd } = meanInputs(text, { sd: true });
  if (items !== 1) return notComputable("not a single item", "GRIMMER checks single-item whole-number data only");
  if (!mean || !n || !sd) return notComputable("missing input", "GRIMMER needs the mean (M), the SD and n");
  if (n < 2) return notComputable("missing input", "an SD needs n of at least 2");
  if (n >= 10 ** mean.decimals)
    return notComputable("n too large", `n = ${n} is not below 10^${mean.decimals}, so GRIM cannot fix the total`);
  const totals = grimTotals(mean, n);
  if (totals.length === 0)
    return {
      status: "mismatch",
      detail: `the mean fails GRIM: no whole total divided by ${n} rounds to ${mean.value}`,
    };
  for (const total of totals) {
    // The sum of squares S is a whole number with the same parity as the total, since x² and x share parity.
    const low = Math.max(sd.low, 0) ** 2 * (n - 1) + (total * total) / n;
    const high = sd.high ** 2 * (n - 1) + (total * total) / n;
    for (let squares = Math.ceil(low - EPSILON); squares <= Math.floor(high + EPSILON); squares++)
      if ((squares - total) % 2 === 0)
        return {
          status: "consistent",
          detail: `total ${total} and sum of squares ${squares} give M ${mean.value}, SD ${sd.value}`,
        };
  }
  return {
    status: "mismatch",
    detail: `no whole sum of squares with the total's parity gives SD ${sd.value} with M ${mean.value} and n ${n}`,
  };
}

function checkDebit(text) {
  const { mean, n, sd } = meanInputs(text, { sd: true });
  if (!mean || !n || !sd) return notComputable("missing input", "DEBIT needs the proportion (M), the SD and n");
  if (mean.value < 0 || mean.value > 1) return notComputable("not binary", "a proportion lies between 0 and 1");
  if (n < 2) return notComputable("missing input", "an SD needs n of at least 2");
  const counts = grimTotals(mean, n).filter((k) => k >= 0 && k <= n);
  if (counts.length === 0)
    return { status: "mismatch", detail: `no count out of ${n} gives the proportion ${mean.value}` };
  const within = (value) => value >= sd.low - EPSILON && value <= sd.high + EPSILON;
  for (const k of counts) {
    const sample = Math.sqrt((k * (n - k)) / (n * (n - 1)));
    if (within(sample)) return { status: "consistent", detail: `${k} of ${n} gives SD ${sample.toFixed(4)}` };
  }
  for (const k of counts) {
    const population = Math.sqrt(k * (n - k)) / n;
    if (within(population))
      return {
        status: "consistent",
        detail: `${k} of ${n} gives the population SD ${population.toFixed(4)}; the sample SD would be ${Math.sqrt((k * (n - k)) / (n * (n - 1))).toFixed(4)}`,
      };
  }
  const k = counts[0];
  return {
    status: "mismatch",
    detail: `${k} of ${n} gives SD ${Math.sqrt((k * (n - k)) / (n * (n - 1))).toFixed(4)} (population ${(Math.sqrt(k * (n - k)) / n).toFixed(4)}), not ${sd.value}`,
  };
}

/** Recheck one reported text: {status, reason (when not computable), detail}. */
export function recheck(check, text) {
  if (check === "grim") return checkGrim(String(text));
  if (check === "grimmer") return checkGrimmer(String(text));
  if (check === "debit") return checkDebit(String(text));
  if (check === "p") return checkP(String(text));
  throw new Error(`unknown check "${check}"; choose one of: ${CHECKS.join(", ")}`);
}

/** The Status cell a result is written as: "not computable: n too large", or the status alone. */
export const statusCell = (result) => (result.reason ? `${result.status}: ${result.reason}` : result.status);

// Statistics for research and evals: intervals, paired comparisons, clustered data, rater agreement, multiple
// comparisons, agent estimators, equivalence and power. Plain JavaScript with no dependencies and no model calls.
// Every function returns a plain object naming its `method`, so a result can be stored and read back unchanged.
// Resampling takes a seed and reports it, so a result can be reproduced exactly.
// Methods follow their textbook sources, named at each function; the tests check them against published examples.

// ---------------------------------------------------------------------------------------------------------------
// Special functions

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log Γ(x) for x > 0 (Lanczos approximation, g = 7). */
export function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const shifted = x - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i += 1) sum += LANCZOS[i] / (shifted + i);
  const t = shifted + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** The regularized lower incomplete gamma function P(a, x) (Numerical Recipes, section 6.2). */
function gammaP(a, x) {
  if (x <= 0) return 0;
  const front = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 1000; n += 1) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return front * sum;
  }
  // Continued fraction for Q(a, x), modified Lentz.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < 1e-16) break;
  }
  return 1 - front * h;
}

/** The standard normal distribution function Φ(x), through erf(x) = P(1/2, x²). */
export function normalCdf(x) {
  const erf = gammaP(0.5, (x * x) / 2);
  return x >= 0 ? 0.5 + 0.5 * erf : 0.5 - 0.5 * erf;
}

/** The standard normal quantile Φ⁻¹(p): Acklam's rational approximation, refined by two Newton steps. */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error(`a probability strictly between 0 and 1 is required, got ${p}`);
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239,
  ];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  let x;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  for (let step = 0; step < 2; step += 1) {
    const density = Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
    if (density === 0) break;
    x -= (normalCdf(x) - p) / density;
  }
  return x;
}

/** Continued fraction for the incomplete beta function, modified Lentz (Numerical Recipes, section 6.4). */
function betaContinuedFraction(a, b, x) {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 1000; m += 1) {
    const m2 = 2 * m;
    for (const term of [
      (m * (b - m) * x) / ((qam + m2) * (a + m2)),
      (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2)),
    ]) {
      d = 1 + term * d;
      if (Math.abs(d) < tiny) d = tiny;
      d = 1 / d;
      c = 1 + term / c;
      if (Math.abs(c) < tiny) c = tiny;
      h *= d * c;
    }
    if (Math.abs(d * c - 1) < 1e-16) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b), for a, b > 0. */
export function incompleteBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  // The fraction converges fast below (a + 1) / (a + b + 2); use I_x(a, b) = 1 - I_{1-x}(b, a) above it.
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Student's t distribution function with `df` degrees of freedom. */
export function tCdf(t, df) {
  const tail = 0.5 * incompleteBeta(df / 2, 0.5, df / (df + t * t));
  return t >= 0 ? 1 - tail : tail;
}

/** Student's t quantile, by bisection on `tCdf`. */
export function tQuantile(p, df) {
  if (!(p > 0 && p < 1)) throw new Error(`a probability strictly between 0 and 1 is required, got ${p}`);
  if (p === 0.5) return 0;
  const upper = p > 0.5;
  const target = upper ? p : 1 - p;
  let low = 0;
  let high = 1;
  while (tCdf(high, df) < target) high *= 2;
  for (let i = 0; i < 200 && high - low > 1e-13; i += 1) {
    const middle = (low + high) / 2;
    if (tCdf(middle, df) < target) low = middle;
    else high = middle;
  }
  const value = (low + high) / 2;
  return upper ? value : -value;
}

/** The inverse of I_x(a, b) in x, by bisection. */
function betaQuantile(p, a, b) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 200 && high - low > 1e-15; i += 1) {
    const middle = (low + high) / 2;
    if (incompleteBeta(a, b, middle) < p) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function checkConfidence(confidence) {
  if (!(confidence > 0 && confidence < 1)) throw new Error(`confidence must be between 0 and 1, got ${confidence}`);
}

function checkCount(successes, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`n must be a positive integer, got ${n}`);
  if (!Number.isInteger(successes) || successes < 0 || successes > n) {
    throw new Error(`successes must be an integer from 0 to n, got ${successes}`);
  }
}

function finiteNumbers(values, label) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label} must be an array of finite numbers`);
  }
  return values;
}

function mean(values) {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Sample variance with n - 1 in the denominator. */
function variance(values) {
  const center = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - center) ** 2;
  return sum / (values.length - 1);
}

// ---------------------------------------------------------------------------------------------------------------
// A seeded generator

/** A seeded uniform generator on [0, 1) (mulberry32). The same seed gives the same sequence everywhere. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(`seed must be an integer from 0 to 4294967295, got ${seed}`);
  }
}

/** The p-quantile of sorted values, with linear interpolation between order statistics (type 7). */
function quantileOfSorted(sorted, p) {
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

// ---------------------------------------------------------------------------------------------------------------
// Intervals

/**
 * Wilson score interval for a proportion (Wilson 1927). Use it rather than the normal (Wald) interval below a few
 * hundred items, where the normal interval undercovers and can leave [0, 1].
 */
export function wilsonInterval(successes, n, { confidence = 0.95 } = {}) {
  checkCount(successes, n);
  checkConfidence(confidence);
  const z = normalQuantile(0.5 + confidence / 2);
  const estimate = successes / n;
  const denominator = 1 + (z * z) / n;
  const center = (estimate + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((estimate * (1 - estimate)) / n + (z * z) / (4 * n * n))) / denominator;
  const low = successes === 0 ? 0 : Math.max(0, center - half);
  const high = successes === n ? 1 : Math.min(1, center + half);
  return { method: "wilson", successes, n, estimate, confidence, low, high };
}

/** Exact (Clopper-Pearson) interval for a proportion: conservative, never below its nominal coverage. */
export function exactBinomialInterval(successes, n, { confidence = 0.95 } = {}) {
  checkCount(successes, n);
  checkConfidence(confidence);
  const tail = (1 - confidence) / 2;
  const low = successes === 0 ? 0 : betaQuantile(tail, successes, n - successes + 1);
  const high = successes === n ? 1 : betaQuantile(1 - tail, successes + 1, n - successes);
  return { method: "clopper-pearson", successes, n, estimate: successes / n, confidence, low, high };
}

/** Mean with a Student t interval on n - 1 degrees of freedom. */
export function meanInterval(values, { confidence = 0.95 } = {}) {
  finiteNumbers(values, "values");
  checkConfidence(confidence);
  const n = values.length;
  if (n < 2) throw new Error("a mean interval needs at least two values");
  const estimate = mean(values);
  const sd = Math.sqrt(variance(values));
  const se = sd / Math.sqrt(n);
  const df = n - 1;
  const critical = tQuantile(0.5 + confidence / 2, df);
  return {
    method: "t-mean",
    n,
    estimate,
    sd,
    se,
    df,
    confidence,
    low: estimate - critical * se,
    high: estimate + critical * se,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Paired comparisons

/**
 * Exact two-sided binomial sign test at p = 1/2 over `better` and `worse`; ties are not passed in. Returns p.
 * With one binary outcome per case it equals the exact McNemar test on the discordant pairs.
 */
export function signTest(better, worse) {
  const n = better + worse;
  if (n === 0) return 1;
  const k = Math.min(better, worse);
  if (n <= 1000) {
    // Exact: the tail's binomial coefficients as integers over 2^n, rounded once.
    let choose = 1n;
    let sum = 0n;
    for (let i = 0; i <= k; i += 1) {
      if (i > 0) choose = (choose * BigInt(n - i + 1)) / BigInt(i);
      sum += choose;
    }
    return Math.min(1, Number(2n * sum) / 2 ** n);
  }
  let logChoose = 0;
  let tail = 0;
  for (let i = 0; i <= k; i += 1) {
    if (i > 0) logChoose += Math.log(n - i + 1) - Math.log(i);
    tail += Math.exp(logChoose - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

/**
 * Exact McNemar test for paired binary outcomes, from the discordant counts: cases only the arm passed and cases
 * only the reference passed. Cases where both agree carry no information about the difference.
 */
export function mcnemarExact({ armOnly, referenceOnly }) {
  for (const [label, value] of [
    ["armOnly", armOnly],
    ["referenceOnly", referenceOnly],
  ]) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  }
  return {
    method: "mcnemar-exact",
    armOnly,
    referenceOnly,
    discordant: armOnly + referenceOnly,
    p: signTest(armOnly, referenceOnly),
  };
}

/**
 * The paired difference, arm minus reference, over cases measured in both: its mean, a t interval, and the
 * two-sided t test of a zero difference. Pairing removes the variation between cases that both arms share.
 */
export function pairedDifference(pairs, { confidence = 0.95 } = {}) {
  if (!Array.isArray(pairs) || pairs.some((pair) => !Array.isArray(pair) || pair.length !== 2)) {
    throw new Error("pairs must be an array of [reference, arm] pairs");
  }
  const differences = finiteNumbers(
    pairs.map(([reference, arm]) => arm - reference),
    "pair values",
  );
  const result = meanInterval(differences, { confidence });
  const t =
    result.se === 0 ? (result.estimate === 0 ? 0 : Math.sign(result.estimate) * Infinity) : result.estimate / result.se;
  const p = Number.isFinite(t) ? 2 * (1 - tCdf(Math.abs(t), result.df)) : 0;
  return { ...result, method: "paired-t", t, p };
}

/**
 * Paired sign-flip permutation test of a zero mean difference. Exact over all 2^n sign patterns up to 20 cases;
 * above that, `resamples` random patterns with p = (hits + 1) / (resamples + 1).
 */
export function signFlipTest(differences, { resamples = 10000, seed = 1 } = {}) {
  finiteNumbers(differences, "differences");
  if (differences.length === 0) throw new Error("differences must not be empty");
  checkSeed(seed);
  const n = differences.length;
  const observed = Math.abs(mean(differences));
  const tolerance = 1e-12 * Math.max(1, observed);
  if (n <= 20) {
    let hits = 0;
    const patterns = 2 ** n;
    for (let pattern = 0; pattern < patterns; pattern += 1) {
      let sum = 0;
      for (let i = 0; i < n; i += 1) sum += pattern & (1 << i) ? -differences[i] : differences[i];
      if (Math.abs(sum / n) >= observed - tolerance) hits += 1;
    }
    return { method: "sign-flip-exact", n, observed: mean(differences), patterns, p: hits / patterns };
  }
  const random = seededRandom(seed);
  let hits = 0;
  for (let draw = 0; draw < resamples; draw += 1) {
    let sum = 0;
    for (const value of differences) sum += random() < 0.5 ? -value : value;
    if (Math.abs(sum / n) >= observed - tolerance) hits += 1;
  }
  return {
    method: "sign-flip-monte-carlo",
    n,
    observed: mean(differences),
    resamples,
    seed,
    p: (hits + 1) / (resamples + 1),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Clustered data

function groupsOf(values, clusters) {
  if (!Array.isArray(clusters) || clusters.length !== values.length) {
    throw new Error("clusters must be an array with one cluster label per value");
  }
  const groups = new Map();
  values.forEach((value, index) => {
    const label = JSON.stringify(clusters[index]);
    const group = groups.get(label) ?? [];
    group.push(value);
    groups.set(label, group);
  });
  return [...groups.values()];
}

/**
 * Mean with a cluster-robust standard error (CR1: the sandwich estimator with the G / (G - 1) correction; Cameron,
 * Gelbach and Miller 2011) and a t interval on G - 1 degrees of freedom. Use it when values come in groups that
 * share variation, such as several runs of one task or several questions from one passage.
 */
export function clusteredMean(values, clusters, { confidence = 0.95 } = {}) {
  finiteNumbers(values, "values");
  checkConfidence(confidence);
  const groups = groupsOf(values, clusters);
  const n = values.length;
  const g = groups.length;
  if (g < 2) throw new Error("a cluster-robust interval needs at least two clusters");
  const estimate = mean(values);
  let meat = 0;
  for (const group of groups) {
    let sum = 0;
    for (const value of group) sum += value - estimate;
    meat += sum * sum;
  }
  const se = Math.sqrt((meat / (n * n)) * (g / (g - 1)));
  const naiveSe = n > 1 ? Math.sqrt(variance(values) / n) : null;
  const df = g - 1;
  const critical = tQuantile(0.5 + confidence / 2, df);
  return {
    method: "cluster-robust-cr1",
    n,
    clusters: g,
    estimate,
    se,
    naiveSe,
    df,
    confidence,
    low: estimate - critical * se,
    high: estimate + critical * se,
  };
}

/**
 * Intraclass correlation by the one-way random-effects ANOVA estimator, with Kish's correction for unequal cluster
 * sizes. 0 when there is one cluster or every cluster has one value.
 */
export function intraclassCorrelation(values, clusters) {
  finiteNumbers(values, "values");
  const groups = groupsOf(values, clusters);
  const n = values.length;
  const g = groups.length;
  if (g <= 1 || g === n) return { method: "icc-anova", n, clusters: g, icc: 0 };
  const grand = mean(values);
  let between = 0;
  let within = 0;
  let sizesSquared = 0;
  for (const group of groups) {
    const groupMean = mean(group);
    between += group.length * (groupMean - grand) ** 2;
    for (const value of group) within += (value - groupMean) ** 2;
    sizesSquared += group.length ** 2;
  }
  const msb = between / (g - 1);
  const msw = within / (n - g);
  const k0 = (n - sizesSquared / n) / (g - 1);
  const denominator = msb + (k0 - 1) * msw;
  const icc = denominator === 0 ? 0 : Math.min(1, Math.max(-1, (msb - msw) / denominator));
  return { method: "icc-anova", n, clusters: g, icc };
}

/**
 * Kish's design effect, 1 + (m - 1) ρ, and the effective sample size n / design effect: how many independent
 * values n clustered values are worth.
 */
export function designEffect({ n, clusterSize, icc }) {
  if (!(clusterSize >= 1)) throw new Error("clusterSize must be at least 1");
  if (!(icc >= -1 && icc <= 1)) throw new Error("icc must be between -1 and 1");
  const effect = 1 + (clusterSize - 1) * icc;
  return {
    method: "design-effect",
    n,
    clusterSize,
    icc,
    designEffect: effect,
    effectiveN: n === undefined ? null : n / effect,
  };
}

/**
 * Percentile bootstrap interval for the mean, resampling clusters when `clusters` is given and single values
 * otherwise. Resampling whole clusters keeps the variation they share.
 */
export function bootstrapMean(values, { clusters, resamples = 10000, seed = 1, confidence = 0.95 } = {}) {
  finiteNumbers(values, "values");
  checkConfidence(confidence);
  checkSeed(seed);
  if (values.length === 0) throw new Error("values must not be empty");
  const groups = clusters === undefined ? values.map((value) => [value]) : groupsOf(values, clusters);
  const sums = groups.map((group) => group.reduce((sum, value) => sum + value, 0));
  const sizes = groups.map((group) => group.length);
  const random = seededRandom(seed);
  const estimates = new Float64Array(resamples);
  for (let draw = 0; draw < resamples; draw += 1) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < groups.length; i += 1) {
      const pick = Math.floor(random() * groups.length);
      sum += sums[pick];
      count += sizes[pick];
    }
    estimates[draw] = sum / count;
  }
  const sorted = Array.from(estimates).sort((left, right) => left - right);
  const tail = (1 - confidence) / 2;
  return {
    method: clusters === undefined ? "bootstrap-percentile" : "cluster-bootstrap-percentile",
    n: values.length,
    clusters: groups.length,
    estimate: mean(values),
    resamples,
    seed,
    confidence,
    low: quantileOfSorted(sorted, tail),
    high: quantileOfSorted(sorted, 1 - tail),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Rater agreement

const missing = (value) => value === null || value === undefined;
const key = (value) => JSON.stringify(value);

/**
 * Cohen's kappa for two raters over the items both answered, on nominal categories.
 * `kappa` is null when chance agreement is complete (every answer in one category), where kappa is undefined.
 *
 * @param {Array<[unknown, unknown]>} pairs
 * @returns {{method: "cohen-kappa", items: number, observed: number | null, expected: number | null, kappa: number | null}}
 */
export function cohenKappa(pairs) {
  const rated = pairs.filter(([first, second]) => !missing(first) && !missing(second));
  const items = rated.length;
  if (items === 0) return { method: "cohen-kappa", items, observed: null, expected: null, kappa: null };
  const first = new Map();
  const second = new Map();
  let agreed = 0;
  for (const [left, right] of rated) {
    if (key(left) === key(right)) agreed += 1;
    first.set(key(left), (first.get(key(left)) ?? 0) + 1);
    second.set(key(right), (second.get(key(right)) ?? 0) + 1);
  }
  const observed = agreed / items;
  let expected = 0;
  for (const [category, count] of first) expected += (count / items) * ((second.get(category) ?? 0) / items);
  const kappa = expected === 1 ? null : (observed - expected) / (1 - expected);
  return { method: "cohen-kappa", items, observed, expected, kappa };
}

/**
 * Cohen's kappa with linear weights, for answers on an ordered numeric scale such as 0-2: a near miss counts as
 * partial agreement, so 1 against 2 costs half of 0 against 2. Only pairs where both answers are numbers count
 * ("unknown" has no place on the scale). With disagreement |a - b|, kappa = 1 - observed / expected, where expected
 * pairs the two raters' answers at random from their own marginals (Cohen 1968, linear weights; the scale's width
 * cancels). `kappa` is null when no disagreement is expected (each rater gave one value, the same one).
 *
 * @param {Array<[unknown, unknown]>} pairs
 * @returns {{method: "linear-weighted-kappa", items: number, kappa: number | null}}
 */
export function linearWeightedKappa(pairs) {
  const numeric = (value) => typeof value === "number" && Number.isFinite(value);
  const rated = pairs.filter(([first, second]) => numeric(first) && numeric(second));
  const items = rated.length;
  if (items === 0) return { method: "linear-weighted-kappa", items, kappa: null };
  const first = new Map();
  const second = new Map();
  let observed = 0;
  for (const [left, right] of rated) {
    observed += Math.abs(left - right);
    first.set(left, (first.get(left) ?? 0) + 1);
    second.set(right, (second.get(right) ?? 0) + 1);
  }
  let expected = 0;
  for (const [left, leftCount] of first) {
    for (const [right, rightCount] of second) expected += leftCount * rightCount * Math.abs(left - right);
  }
  // Both as means: observed over the items, expected over every pairing of the two marginals.
  const kappa = expected === 0 ? null : 1 - observed / items / (expected / (items * items));
  return { method: "linear-weighted-kappa", items, kappa };
}

/**
 * Prevalence- and bias-adjusted kappa (Byrt, Bishop and Carlin 1993): (k · observed - 1) / (k - 1) for k
 * categories. Report it beside Cohen's kappa when one answer dominates, where kappa collapses although the raters
 * agree almost always. `categories` defaults to the number of distinct answers seen, and at least 2.
 */
export function pabak(pairs, { categories } = {}) {
  const rated = pairs.filter(([first, second]) => !missing(first) && !missing(second));
  const items = rated.length;
  const seen = new Set(rated.flatMap(([left, right]) => [key(left), key(right)])).size;
  const k = categories ?? Math.max(2, seen);
  if (!Number.isInteger(k) || k < 2) throw new Error("categories must be an integer of at least 2");
  if (items === 0) return { method: "pabak", items, categories: k, observed: null, pabak: null };
  const observed = rated.filter(([left, right]) => key(left) === key(right)).length / items;
  return { method: "pabak", items, categories: k, observed, pabak: (k * observed - 1) / (k - 1) };
}

/**
 * Krippendorff's alpha for nominal data. Each unit is one item's answers, one entry per rater, with missing
 * answers allowed; a unit with fewer than two answers is not pairable and is left out.
 * `alpha` is null when there is no expected disagreement (every pairable answer in one category).
 *
 * @param {Array<Array<unknown>>} units
 * @returns {{method: "krippendorff-alpha", units: number, pairable: number, alpha: number | null}}
 */
export function krippendorffAlpha(units) {
  // Coincidence counts o[c][k], built from every ordered pair of answers within a unit, weighted 1/(m_u - 1).
  const coincidences = new Map();
  let pairableUnits = 0;
  for (const unit of units) {
    const values = unit.filter((value) => !missing(value)).map(key);
    if (values.length < 2) continue;
    pairableUnits += 1;
    const weight = 1 / (values.length - 1);
    for (let left = 0; left < values.length; left += 1) {
      for (let right = 0; right < values.length; right += 1) {
        if (left === right) continue;
        const row = coincidences.get(values[left]) ?? new Map();
        row.set(values[right], (row.get(values[right]) ?? 0) + weight);
        coincidences.set(values[left], row);
      }
    }
  }
  const totals = new Map();
  let total = 0;
  let disagreement = 0;
  for (const [category, row] of coincidences) {
    for (const [other, count] of row) {
      totals.set(category, (totals.get(category) ?? 0) + count);
      total += count;
      if (category !== other) disagreement += count;
    }
  }
  if (total <= 1) return { method: "krippendorff-alpha", units: units.length, pairable: pairableUnits, alpha: null };
  let expected = 0;
  for (const [category, count] of totals) {
    for (const [other, otherCount] of totals) if (category !== other) expected += count * otherCount;
  }
  // alpha = 1 - D_o / D_e, with D_o = disagreement / n and D_e = expected / (n (n - 1)).
  const alpha = expected === 0 ? null : 1 - ((total - 1) * disagreement) / expected;
  return { method: "krippendorff-alpha", units: units.length, pairable: pairableUnits, alpha };
}

/**
 * Agreement between raters, by the method their number calls for: Cohen's kappa for two, Krippendorff's alpha
 * for three or more. Each unit holds one answer per rater, in a fixed rater order.
 *
 * @param {Array<Array<unknown>>} units
 */
export function raterAgreement(units) {
  let raters = 0;
  for (const unit of units) raters = Math.max(raters, unit.length);
  if (raters < 2) return null;
  if (raters === 2) return cohenKappa(units.map((unit) => [unit[0], unit[1]]));
  return krippendorffAlpha(units);
}

// ---------------------------------------------------------------------------------------------------------------
// Multiple comparisons

/**
 * Holm's step-down adjustment (Holm 1979): it controls the chance of any false finding across the family of
 * comparisons, and is never less powerful than Bonferroni. Adjusted p values come back in the input's order.
 */
export function holm(pValues) {
  if (!Array.isArray(pValues) || pValues.some((p) => typeof p !== "number" || !(p >= 0 && p <= 1))) {
    throw new Error("pValues must be an array of numbers from 0 to 1");
  }
  const m = pValues.length;
  const order = pValues.map((p, index) => ({ p, index })).sort((left, right) => left.p - right.p);
  const adjusted = new Array(m);
  let running = 0;
  order.forEach(({ p, index }, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p));
    adjusted[index] = running;
  });
  return { method: "holm", m, adjusted };
}

// ---------------------------------------------------------------------------------------------------------------
// Agent estimators

function checkTrials(n, c, k) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`n (trials per task) must be a positive integer, got ${n}`);
  if (!Number.isInteger(c) || c < 0 || c > n)
    throw new Error(`c (passing trials) must be an integer from 0 to n, got ${c}`);
  if (!Number.isInteger(k) || k < 1 || k > n) throw new Error(`k must be an integer from 1 to n, got ${k}`);
}

/**
 * Unbiased pass@k for one task (Chen et al. 2021): the chance that at least one of k trials drawn without
 * replacement from n passes, given c of the n passed; 1 - C(n - c, k) / C(n, k) as a running product.
 * n counts independent trials of the task, not tests inside one trial.
 */
export function passAtK(n, c, k) {
  checkTrials(n, c, k);
  if (n - c < k) return 1;
  let fail = 1;
  for (let i = n - c + 1; i <= n; i += 1) fail *= 1 - k / i;
  return 1 - fail;
}

/**
 * pass^k for one task (Yao et al. 2024, τ-bench): the chance that all of k trials drawn without replacement pass,
 * C(c, k) / C(n, k). It assumes the trials are independent repeats of the same task.
 */
export function passPowerK(n, c, k) {
  checkTrials(n, c, k);
  if (c < k) return 0;
  let all = 1;
  for (let i = 0; i < k; i += 1) all *= (c - i) / (n - i);
  return all;
}

/** pass@k and pass^k averaged over a suite's tasks, each given as { n, c }. */
export function suitePassK(tasks, k) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("tasks must be a non-empty array of { n, c }");
  const at = tasks.map(({ n, c }) => passAtK(n, c, k));
  const power = tasks.map(({ n, c }) => passPowerK(n, c, k));
  return { method: "suite-pass-k", tasks: tasks.length, k, passAtK: mean(at), passPowerK: mean(power) };
}

// ---------------------------------------------------------------------------------------------------------------
// Equivalence

/**
 * Two one-sided tests (Schuirmann 1987; Lakens 2017) on paired differences: is the mean difference inside the
 * equivalence bounds [low, high], set in advance as the smallest difference that would matter? Equivalent when
 * both one-sided p values are below alpha; the matching interval is the (1 - 2 alpha) t interval.
 */
export function tostPaired(differences, { low, high, alpha = 0.05 }) {
  finiteNumbers(differences, "differences");
  if (!(typeof low === "number" && typeof high === "number" && low < high)) {
    throw new Error("equivalence bounds need numbers low < high");
  }
  const result = meanInterval(differences, { confidence: 1 - 2 * alpha });
  if (result.se === 0) {
    const inside = result.estimate > low && result.estimate < high;
    return {
      ...result,
      method: "tost-paired",
      bounds: [low, high],
      alpha,
      pLow: inside ? 0 : 1,
      pHigh: inside ? 0 : 1,
      p: inside ? 0 : 1,
      equivalent: inside,
    };
  }
  const pLow = 1 - tCdf((result.estimate - low) / result.se, result.df);
  const pHigh = tCdf((result.estimate - high) / result.se, result.df);
  const p = Math.max(pLow, pHigh);
  return { ...result, method: "tost-paired", bounds: [low, high], alpha, pLow, pHigh, p, equivalent: p < alpha };
}

// ---------------------------------------------------------------------------------------------------------------
// Power and sample size

function checkProbability(value, label) {
  if (!(value >= 0 && value <= 1)) throw new Error(`${label} must be a probability from 0 to 1, got ${value}`);
}

const criticalCounts = new Map();

/**
 * The largest count x with sign-test p below alpha for x of d discordant cases (-1 when none): the test rejects
 * when either side's count is at most this. Cached, since power searches ask for the same d many times.
 */
function criticalCount(d, alpha) {
  const cacheKey = `${d}:${alpha}`;
  if (criticalCounts.has(cacheKey)) return criticalCounts.get(cacheKey);
  let x = -1;
  while (x + 1 <= d / 2 && signTest(x + 1, d - x - 1) < alpha) x += 1;
  criticalCounts.set(cacheKey, x);
  return x;
}

function logBinomial(n, k) {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/** log of p^k (1 - p)^(n - k), with the 0^0 = 1 convention at p = 0 or 1. */
function logPowers(p, k, n) {
  const success = k === 0 ? 0 : p === 0 ? -Infinity : k * Math.log(p);
  const failure = n - k === 0 ? 0 : p === 1 ? -Infinity : (n - k) * Math.log1p(-p);
  return success + failure;
}

/**
 * Exact power of the exact McNemar test (the sign test on discordant cases) with `n` cases, when a case is
 * arm-only with probability `armOnly` and reference-only with probability `referenceOnly`. Exact: it sums over
 * every discordant count and every split that the test rejects, so it needs no simulation and no seed.
 */
export function mcnemarPower({ n, armOnly, referenceOnly, alpha = 0.05 }) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`n must be a positive integer, got ${n}`);
  checkProbability(armOnly, "armOnly");
  checkProbability(referenceOnly, "referenceOnly");
  const discordant = armOnly + referenceOnly;
  if (discordant > 1 + 1e-12) throw new Error("armOnly + referenceOnly cannot exceed 1");
  if (discordant === 0) return { method: "mcnemar-exact-power", n, armOnly, referenceOnly, alpha, power: 0 };
  const share = armOnly / discordant;
  let power = 0;
  for (let d = 1; d <= n; d += 1) {
    const pd = Math.exp(logBinomial(n, d) + logPowers(Math.min(1, discordant), d, n));
    if (pd < 1e-300) continue;
    const r = criticalCount(d, alpha);
    if (r < 0) continue;
    let reject = 0;
    for (let x = 0; x <= r; x += 1) {
      reject += Math.exp(logBinomial(d, x) + logPowers(share, x, d));
      if (d - x !== x) reject += Math.exp(logBinomial(d, d - x) + logPowers(share, d - x, d));
    }
    power += pd * reject;
  }
  return { method: "mcnemar-exact-power", n, armOnly, referenceOnly, alpha, power: Math.min(1, power) };
}

/**
 * The smallest number of cases at which `mcnemarPower` reaches `power`, scanning up to `maximum`. The power of an
 * exact test rises in a saw-tooth, so a slightly larger n can fall below the target again; `stable` says whether
 * the next ten values of n also reach it.
 */
export function mcnemarCasesForPower({ armOnly, referenceOnly, alpha = 0.05, power = 0.8, maximum = 1000 }) {
  checkProbability(power, "power");
  for (let n = 1; n <= maximum; n += 1) {
    const result = mcnemarPower({ n, armOnly, referenceOnly, alpha });
    if (result.power < power) continue;
    let stable = true;
    for (let next = n + 1; next <= Math.min(maximum, n + 10); next += 1) {
      if (mcnemarPower({ n: next, armOnly, referenceOnly, alpha }).power < power) stable = false;
    }
    return {
      method: "mcnemar-cases-for-power",
      armOnly,
      referenceOnly,
      alpha,
      power,
      n,
      achieved: result.power,
      stable,
    };
  }
  return { method: "mcnemar-cases-for-power", armOnly, referenceOnly, alpha, power, n: null, achieved: null, maximum };
}

/**
 * Cases needed to detect a paired mean difference `difference` when per-case differences have standard deviation
 * `sdDifference`, by the normal approximation n = ((z_{1-α/2} + z_{power}) σ / δ)², rounded up. With paired binary
 * scores, σ² of the per-case difference is the discordant rate minus the squared mean difference.
 */
export function pairedCasesNeeded({ difference, sdDifference, alpha = 0.05, power = 0.8 }) {
  if (!(difference > 0)) throw new Error("difference must be positive");
  if (!(sdDifference > 0)) throw new Error("sdDifference must be positive");
  const z = normalQuantile(1 - alpha / 2) + normalQuantile(power);
  const n = Math.ceil(((z * sdDifference) / difference) ** 2);
  return { method: "paired-normal-sample-size", difference, sdDifference, alpha, power, n };
}

/** Power of the two-sided paired t test by simulation, with normal per-case differences. */
export function pairedPowerBySimulation({ n, difference, sdDifference, alpha = 0.05, simulations = 10000, seed = 1 }) {
  if (!Number.isInteger(n) || n < 2) throw new Error("n must be an integer of at least 2");
  if (!(sdDifference > 0)) throw new Error("sdDifference must be positive");
  checkSeed(seed);
  const random = seededRandom(seed);
  const normal = () => {
    // Box-Muller; 1 - u keeps the logarithm finite.
    const u = 1 - random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };
  const critical = tQuantile(1 - alpha / 2, n - 1);
  let rejections = 0;
  for (let draw = 0; draw < simulations; draw += 1) {
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < n; i += 1) {
      const value = difference + sdDifference * normal();
      sum += value;
      squares += value * value;
    }
    const center = sum / n;
    const sd = Math.sqrt((squares - n * center * center) / (n - 1));
    if (Math.abs(center / (sd / Math.sqrt(n))) > critical) rejections += 1;
  }
  const power = rejections / simulations;
  return {
    method: "paired-t-power-simulation",
    n,
    difference,
    sdDifference,
    alpha,
    simulations,
    seed,
    power,
    monteCarloSe: Math.sqrt((power * (1 - power)) / simulations),
  };
}

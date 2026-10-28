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

/** The chi-square distribution's upper tail P(X ≥ x) with `df` degrees of freedom. */
export function chiSquareSurvival(x, df) {
  return x <= 0 ? 1 : 1 - gammaP(df / 2, x / 2);
}

/** The F distribution's upper tail P(X ≥ x) with `d1` and `d2` degrees of freedom. */
export function fSurvival(x, d1, d2) {
  return x <= 0 ? 1 : incompleteBeta(d2 / 2, d1 / 2, d2 / (d2 + d1 * x));
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
 * Bayesian interval for the mean of binary values that come in clusters: each cluster's rate is drawn from a
 * Beta(mu * kappa, (1 - mu) * kappa), with the prior p(alpha, beta) proportional to (alpha + beta)^(-5/2) (Gelman et
 * al., Bayesian Data Analysis, 3rd ed., section 5.3), integrated on a grid over mu and log kappa. The interval is the
 * equal-tailed credible interval for mu. Use it with few clusters, where the cluster-robust interval undercovers,
 * above all for rates near 0 or 1. With one value per cluster it is the Beta(k + 1, n - k + 1) interval.
 */
export function clusteredBetaBinomial(values, clusters, { confidence = 0.95, muPoints = 300, kappaPoints = 80 } = {}) {
  finiteNumbers(values, "values");
  checkConfidence(confidence);
  if (!values.every((value) => value === 0 || value === 1)) throw new Error("values must each be 0 or 1");
  const groups = groupsOf(values, clusters).map((group) => [
    group.reduce((sum, value) => sum + value, 0),
    group.length,
  ]);
  const logBeta = (a, b) => logGamma(a) + logGamma(b) - logGamma(a + b);
  const lowLog = Math.log(0.01);
  const highLog = Math.log(1e5);
  const logs = new Float64Array(muPoints * kappaPoints);
  let maxLog = -Infinity;
  for (let i = 0; i < muPoints; i += 1) {
    const mu = (i + 0.5) / muPoints;
    for (let j = 0; j < kappaPoints; j += 1) {
      const u = lowLog + ((j + 0.5) * (highLog - lowLog)) / kappaPoints;
      const kappa = Math.exp(u);
      const a = mu * kappa;
      const b = (1 - mu) * kappa;
      // The prior on (alpha, beta), moved to (mu, log kappa): kappa^(-5/2) times the Jacobian kappa^2.
      let logDensity = -0.5 * u;
      const base = logBeta(a, b);
      for (const [k, n] of groups) logDensity += logBeta(k + a, n - k + b) - base;
      logs[i * kappaPoints + j] = logDensity;
      if (logDensity > maxLog) maxLog = logDensity;
    }
  }
  const weights = new Float64Array(muPoints);
  for (let i = 0; i < muPoints; i += 1)
    for (let j = 0; j < kappaPoints; j += 1) weights[i] += Math.exp(logs[i * kappaPoints + j] - maxLog);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const tail = (1 - confidence) / 2;
  let cumulative = 0;
  let low = null;
  let high = null;
  let estimate = 0;
  for (let i = 0; i < muPoints; i += 1) {
    const before = cumulative;
    const share = weights[i] / total;
    cumulative += share;
    estimate += share * ((i + 0.5) / muPoints);
    const at = (target) => (i + (target - before) / (cumulative - before)) / muPoints;
    if (low === null && cumulative >= tail) low = at(tail);
    if (high === null && cumulative >= 1 - tail) high = at(1 - tail);
  }
  return {
    method: "clustered-beta-binomial",
    n: values.length,
    clusters: groups.length,
    estimate,
    confidence,
    low,
    high,
    grid: { mu: muPoints, kappa: kappaPoints },
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
 * Weighted kappa on an ordered numeric scale, with linear (|a - b|) or quadratic ((a - b)²) disagreement weights
 * (Cohen 1968; the quadratic form equals the intraclass correlation for two raters, Fleiss and Cohen 1973). It
 * reports the raw agreement (the share of exact matches) beside kappa, since kappa alone hides how often the raters
 * agree. Only pairs where both answers are numbers count. `kappa` is null when no disagreement is expected.
 *
 * @param {Array<[unknown, unknown]>} pairs
 * @param {{weights?: "linear" | "quadratic"}} options
 */
export function weightedKappa(pairs, { weights = "linear" } = {}) {
  if (!["linear", "quadratic"].includes(weights)) throw new Error('weights must be "linear" or "quadratic"');
  const numeric = (value) => typeof value === "number" && Number.isFinite(value);
  const rated = pairs.filter(([first, second]) => numeric(first) && numeric(second));
  const items = rated.length;
  const method = `${weights}-weighted-kappa`;
  if (items === 0) return { method, weights, items, observed: null, kappa: null };
  const cost = (a, b) => (weights === "linear" ? Math.abs(a - b) : (a - b) ** 2);
  const first = new Map();
  const second = new Map();
  let disagreement = 0;
  let exact = 0;
  for (const [left, right] of rated) {
    disagreement += cost(left, right);
    if (left === right) exact += 1;
    first.set(left, (first.get(left) ?? 0) + 1);
    second.set(right, (second.get(right) ?? 0) + 1);
  }
  let expected = 0;
  for (const [left, leftCount] of first)
    for (const [right, rightCount] of second) expected += leftCount * rightCount * cost(left, right);
  const kappa = expected === 0 ? null : 1 - disagreement / items / (expected / (items * items));
  return { method, weights, items, observed: exact / items, kappa };
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

// Aggregates over several seeds, as Agarwal et al. (2021, "Deep reinforcement learning at the edge of the statistical
// precipice") define them for a runs × tasks score matrix: `scores` holds one array of run scores per task. Their
// intervals come from a stratified bootstrap, which resamples runs within each task and never across tasks, so a
// task with few runs is not swamped by one with many. Reimplemented from the paper; no rliable code is used.

export const AGGREGATES = ["mean", "median", "iqm", "optimality-gap"];

function checkScores(scores, label = "scores") {
  if (!Array.isArray(scores) || scores.length === 0) throw new Error(`${label} must be a non-empty array of tasks`);
  for (const runs of scores) {
    if (!Array.isArray(runs) || runs.length === 0) throw new Error(`${label}: every task needs at least one run`);
    finiteNumbers(runs, label);
  }
}

/** The mean of the middle of the sorted values, with `fraction` of them cut from each end (rounded down). */
function trimmedMean(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const cut = Math.floor(sorted.length * fraction);
  return mean(sorted.slice(cut, sorted.length - cut));
}

function aggregateOf(statistic, scores, target) {
  if (statistic === "iqm") return trimmedMean(scores.flat(), 0.25);
  if (statistic === "optimality-gap") return target - mean(scores.flat().map((score) => Math.min(score, target)));
  const taskMeans = scores.map(mean);
  if (statistic === "mean") return mean(taskMeans);
  return quantileOfSorted(
    [...taskMeans].sort((left, right) => left - right),
    0.5,
  );
}

function checkResamples(resamples) {
  if (!Number.isInteger(resamples) || resamples < 1) throw new Error("resamples must be a whole number of at least 1");
}

/**
 * A warning when the design leaves the stratified bootstrap little to resample: a task with one run cannot vary,
 * and Agarwal et al. find percentile intervals unreliable with fewer than 5 runs per task.
 */
function runsWarning(...matrices) {
  const fewest = Math.min(...matrices.flat().map((runs) => runs.length));
  if (fewest === 1)
    return "a task has one run, which the stratified bootstrap cannot vary, so the interval understates the spread";
  if (fewest < 5) return `fewer than 5 runs in a task (${fewest}): percentile intervals are unreliable there`;
  return undefined;
}

/** Resample each task's runs with replacement, keeping each task's count. */
function resampleWithin(scores, random) {
  return scores.map((runs) => runs.map(() => runs[Math.floor(random() * runs.length)]));
}

function percentileInterval(estimates, confidence) {
  const sorted = Array.from(estimates).sort((left, right) => left - right);
  const tail = (1 - confidence) / 2;
  return { low: quantileOfSorted(sorted, tail), high: quantileOfSorted(sorted, 1 - tail) };
}

/**
 * One aggregate of a runs × tasks score matrix with its stratified bootstrap interval: `mean` and `median` of the
 * per-task means, `iqm` (the interquartile mean of all runs pooled) and `optimality-gap` (how far scores fall short
 * of `target`, 1 by default, with scores above it counted as the target).
 */
export function aggregateScores(
  scores,
  { statistic, target = 1, resamples = 10000, seed = 1, confidence = 0.95 } = {},
) {
  if (!AGGREGATES.includes(statistic)) throw new Error(`statistic must be one of: ${AGGREGATES.join(", ")}`);
  checkScores(scores);
  checkConfidence(confidence);
  checkSeed(seed);
  checkResamples(resamples);
  if (!Number.isFinite(target)) throw new Error("target must be a number");
  const random = seededRandom(seed);
  const estimates = new Float64Array(resamples);
  for (let draw = 0; draw < resamples; draw += 1)
    estimates[draw] = aggregateOf(statistic, resampleWithin(scores, random), target);
  return {
    method: "stratified-bootstrap-percentile",
    statistic,
    tasks: scores.length,
    runs: scores.reduce((sum, runs) => sum + runs.length, 0),
    ...(statistic === "optimality-gap" ? { target } : {}),
    estimate: aggregateOf(statistic, scores, target),
    resamples,
    seed,
    confidence,
    ...percentileInterval(estimates, confidence),
    ...(runsWarning(scores) ? { warning: runsWarning(scores) } : {}),
  };
}

/** Per task, the chance a run of X beats a run of Y (ties count half), averaged over tasks. */
function improvementOf(x, y) {
  return mean(
    x.map((runs, task) => {
      let wins = 0;
      for (const a of runs) for (const b of y[task]) wins += a > b ? 1 : a === b ? 0.5 : 0;
      return wins / (runs.length * y[task].length);
    }),
  );
}

/**
 * The probability of improvement P(X > Y): for each task the Mann-Whitney probability that a run of X scores above a
 * run of Y, averaged over tasks, with a stratified bootstrap interval resampling each method's runs within each task.
 */
export function probabilityOfImprovement(x, y, { resamples = 10000, seed = 1, confidence = 0.95 } = {}) {
  checkScores(x, "x");
  checkScores(y, "y");
  if (x.length !== y.length) throw new Error("x and y must hold the same tasks, in the same order");
  checkConfidence(confidence);
  checkSeed(seed);
  checkResamples(resamples);
  const random = seededRandom(seed);
  const estimates = new Float64Array(resamples);
  for (let draw = 0; draw < resamples; draw += 1)
    estimates[draw] = improvementOf(resampleWithin(x, random), resampleWithin(y, random));
  return {
    method: "probability-of-improvement",
    tasks: x.length,
    estimate: improvementOf(x, y),
    resamples,
    seed,
    confidence,
    ...percentileInterval(estimates, confidence),
    ...(runsWarning(x, y) ? { warning: runsWarning(x, y) } : {}),
  };
}

/**
 * pass^k for one task, with c passes in n trials: the unbiased estimate C(c, k) / C(n, k), and the exact
 * (Clopper-Pearson) interval for the pass rate p raised to the power k, since p^k rises with p.
 */
export function passPowerKInterval(n, c, k, { confidence = 0.95 } = {}) {
  checkTrials(n, c, k);
  const rate = exactBinomialInterval(c, n, { confidence });
  const estimate = passPowerK(n, c, k);
  const [low, high] = [rate.low ** k, rate.high ** k];
  // The unbiased estimate sits below the plug-in (c/n)^k, so with few passes it can fall below the interval for p^k.
  const note =
    estimate < low
      ? "the unbiased estimate lies below the interval, which is for p^k; with few passes the two disagree, and both stand"
      : undefined;
  return { method: "pass-power-k-exact", n, c, k, estimate, confidence, low, high, ...(note ? { note } : {}) };
}

/**
 * pass^k for a suite: the mean of the tasks' unbiased estimates, with a two-stage bootstrap that resamples tasks and,
 * within each drawn task, its n trials (a binomial draw at the task's observed rate), so both the spread between
 * tasks and each task's trial noise enter the interval. In simulation it covered 92% to 99% at 3 to 30 tasks; with
 * few tasks the spread between them rests on few values, and a warning says so below 10 tasks.
 */
export function suitePassPowerKInterval(tasks, k, { resamples = 10000, seed = 1, confidence = 0.95 } = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("tasks must be a non-empty array of { n, c }");
  for (const { n, c } of tasks) checkTrials(n, c, k);
  checkConfidence(confidence);
  checkSeed(seed);
  checkResamples(resamples);
  const random = seededRandom(seed);
  const estimates = new Float64Array(resamples);
  for (let draw = 0; draw < resamples; draw += 1) {
    let sum = 0;
    for (let i = 0; i < tasks.length; i += 1) {
      const { n, c } = tasks[Math.floor(random() * tasks.length)];
      let passes = 0;
      for (let trial = 0; trial < n; trial += 1) if (random() < c / n) passes += 1;
      sum += passPowerK(n, passes, k);
    }
    estimates[draw] = sum / tasks.length;
  }
  return {
    method: "suite-pass-power-k-two-stage-bootstrap",
    tasks: tasks.length,
    k,
    estimate: mean(tasks.map(({ n, c }) => passPowerK(n, c, k))),
    resamples,
    seed,
    confidence,
    ...percentileInterval(estimates, confidence),
    ...(tasks.length < 10
      ? {
          warning: `fewer than 10 tasks (${tasks.length}): the spread between tasks rests on few values, so read the interval as rough`,
        }
      : {}),
  };
}

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
// Effect sizes for pooling, from two proportions

export const EFFECT_MEASURES = ["risk-difference", "log-odds", "log-risk-ratio"];

/**
 * One study's effect of the arm over the reference, with its sampling variance, for `meta` to pool. Unpaired
 * (two groups): `{ p1, p2, n1, n2 }`, the arm's and the reference's proportions and sizes; the variances are the
 * usual large-sample ones (risk difference p(1-p)/n summed; log odds ratio 1/a + 1/b + 1/c + 1/d over the four
 * cells; log risk ratio (1-p)/(np) summed). Paired (both arms on the same items): `{ armOnly, referenceOnly, both,
 * n }`, the items only the arm passed, only the reference passed, both passed, and all items; the risk difference
 * (b - c)/n with variance ((b + c) - (b - c)²/n)/n², the conditional log odds ratio log(b/c) with variance 1/b + 1/c,
 * and the log risk ratio log((a + b)/(a + c)) with variance (b + c)/((a + b)(a + c)) (Agresti 2013, 11.1). A ratio
 * with a zero cell gets 0.5 added to each cell of that study, as metafor does by default, and a warning says so.
 */
export function effectSize(measure, study) {
  if (!EFFECT_MEASURES.includes(measure))
    throw new Error(`the effect measure must be one of ${EFFECT_MEASURES.join(", ")}, got ${measure}`);
  if (!study || typeof study !== "object") throw new Error("each study must be an object");
  const warnings = [];
  const corrected = (cells) => {
    if (cells.every((cell) => cell > 0)) return cells;
    warnings.push(`a cell is 0, so 0.5 was added to each cell of this study (${cells.join(", ")})`);
    return cells.map((cell) => cell + 0.5);
  };
  let yi;
  let vi;
  let design;
  if (study.armOnly !== undefined || study.referenceOnly !== undefined) {
    design = "paired";
    const { armOnly: b, referenceOnly: c, both: a, n } = study;
    for (const [label, value] of [
      ["armOnly", b],
      ["referenceOnly", c],
    ])
      if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a whole number, got ${value}`);
    if (b + c === 0) throw new Error("no item where the arms disagree, so the paired variance is 0");
    if (measure === "risk-difference") {
      if (!Number.isInteger(n) || n < b + c) throw new Error(`n must be the whole number of items, at least ${b + c}`);
      yi = (b - c) / n;
      vi = (b + c - (b - c) ** 2 / n) / n ** 2;
    } else if (measure === "log-odds") {
      const [bc, cc] = corrected([b, c]);
      yi = Math.log(bc / cc);
      vi = 1 / bc + 1 / cc;
    } else {
      if (!Number.isInteger(a) || a < 0) throw new Error(`both must be a whole number, got ${a}`);
      if (n !== undefined && (!Number.isInteger(n) || n < a + b + c))
        throw new Error(`n must be the whole number of items, at least ${a + b + c}`);
      if (a + b === 0 || a + c === 0) throw new Error("an arm passed no item, so the risk ratio is undefined");
      yi = Math.log((a + b) / (a + c));
      vi = (b + c) / ((a + b) * (a + c));
    }
  } else {
    design = "unpaired";
    const { p1, p2, n1, n2 } = study;
    checkProbability(p1, "p1");
    checkProbability(p2, "p2");
    for (const [label, value] of [
      ["n1", n1],
      ["n2", n2],
    ])
      if (!Number.isInteger(value) || value < 1)
        throw new Error(`${label} must be a positive whole number, got ${value}`);
    if (measure === "risk-difference") {
      yi = p1 - p2;
      vi = (p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2;
      if (vi === 0) throw new Error("both proportions are 0 or 1, so the variance is 0");
    } else {
      const [a, b, c, d] = corrected([p1 * n1, (1 - p1) * n1, p2 * n2, (1 - p2) * n2]);
      if (measure === "log-odds") {
        yi = Math.log((a * d) / (b * c));
        vi = 1 / a + 1 / b + 1 / c + 1 / d;
      } else {
        yi = Math.log(a / (a + b) / (c / (c + d)));
        vi = 1 / a - 1 / (a + b) + 1 / c - 1 / (c + d);
      }
    }
  }
  return {
    method: `effect-${measure}`,
    design,
    yi,
    vi,
    se: Math.sqrt(vi),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Effect sizes for several studies at once, in the form `meta` reads: `yi` and `vi` in the order given, and
 * `studies`, each study's effect with its `id` when it has one.
 */
export function effectSizes(measure, studies) {
  if (!Array.isArray(studies) || studies.length === 0) throw new Error("studies must be a non-empty array");
  const each = studies.map((study, index) => {
    try {
      return { ...(study?.id !== undefined ? { id: study.id } : {}), ...effectSize(measure, study) };
    } catch (error) {
      throw new Error(`study ${study?.id ?? index + 1}: ${error.message}`);
    }
  });
  const warnings = each.flatMap((study) =>
    (study.warnings ?? []).map((warning) => `study ${study.id ?? each.indexOf(study) + 1}: ${warning}`),
  );
  return {
    method: `effect-${measure}`,
    k: each.length,
    yi: each.map((study) => study.yi),
    vi: each.map((study) => study.vi),
    studies: each.map(({ method: _method, warnings: _warnings, ...study }) => study),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Pooling effect sizes across studies (meta-analysis)

/** The heterogeneity I² above which pooled studies are read as disagreeing beyond chance (Higgins et al. 2003). */
const HIGH_I2 = 0.75;

function checkEffects(yi, vi) {
  finiteNumbers(yi, "yi");
  finiteNumbers(vi, "vi");
  if (yi.length !== vi.length)
    throw new Error(`yi and vi must have the same length, got ${yi.length} and ${vi.length}`);
  if (yi.length < 2) throw new Error("pooling needs at least two studies");
  if (vi.some((value) => !(value > 0))) throw new Error("every variance in vi must be greater than 0");
}

/** The inverse-variance weighted mean of `yi` under weights `weights`, with its standard error. */
function inverseVariance(yi, weights) {
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < yi.length; i += 1) {
    total += weights[i];
    weighted += weights[i] * yi[i];
  }
  return { estimate: weighted / total, se: Math.sqrt(1 / total), total };
}

/** Cochran's Q, its p value and I², from the fixed-effect fit. */
function heterogeneity(yi, vi) {
  const weights = vi.map((value) => 1 / value);
  const fixed = inverseVariance(yi, weights);
  let q = 0;
  let squares = 0;
  for (let i = 0; i < yi.length; i += 1) {
    q += weights[i] * (yi[i] - fixed.estimate) ** 2;
    squares += weights[i] ** 2;
  }
  const df = yi.length - 1;
  return {
    weights,
    fixed,
    q,
    df,
    pQ: chiSquareSurvival(q, df),
    i2: q > 0 ? Math.max(0, (q - df) / q) : 0,
    c: fixed.total - squares / fixed.total,
  };
}

function poolingWarnings(k, i2, model) {
  const warnings = [];
  if (k < 5)
    warnings.push(
      `fewer than five studies (${k}): tau² is estimated from too few values to be reliable, so read the between-study spread and the random-effects interval as rough`,
    );
  if (i2 > HIGH_I2)
    warnings.push(
      model === "fixed"
        ? `I² is ${Number(i2.toPrecision(3))}, high: the studies disagree beyond chance, so a fixed effect (one true effect shared by all) does not fit; pool with "random" and say why they differ`
        : `I² is ${Number(i2.toPrecision(3))}, high: the studies disagree beyond chance, so the pooled mean may describe none of them; say why they differ before relying on it`,
    );
  return warnings;
}

/**
 * Fixed-effect (common-effect) inverse-variance pooling of study effect sizes `yi` with their sampling variances
 * `vi`: the weighted mean with weights 1 / vi, its normal interval, and Cochran's Q and I² for heterogeneity.
 * It assumes every study estimates one true effect; Q and I² say how well that holds.
 */
export function metaFixed(yi, vi, { confidence = 0.95 } = {}) {
  checkConfidence(confidence);
  checkEffects(yi, vi);
  const { fixed, q, df, pQ, i2 } = heterogeneity(yi, vi);
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const warnings = poolingWarnings(yi.length, i2, "fixed");
  return {
    method: "meta-fixed",
    k: yi.length,
    estimate: fixed.estimate,
    se: fixed.se,
    confidence,
    low: fixed.estimate - z * fixed.se,
    high: fixed.estimate + z * fixed.se,
    p: 2 * (1 - normalCdf(Math.abs(fixed.estimate / fixed.se))),
    q,
    df,
    pQ,
    i2,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Random-effects pooling: the between-study variance tau² by DerSimonian and Laird's moment estimator (1986), the
 * weighted mean with weights 1 / (vi + tau²), and the Hartung-Knapp-Sidik-Jonkman interval (Hartung and Knapp 2001;
 * Sidik and Jonkman 2002), a t interval on k - 1 degrees of freedom around a weighted residual variance, which keeps
 * its coverage with few studies where the normal interval does not. `low` and `high` are the Hartung-Knapp
 * interval, untruncated as statsmodels computes it; `hartungKnapp.truncated` floors the residual variance at 1
 * (IntHout et al. 2014), so its se is never below the DerSimonian-Laird se, and a warning names it when the
 * untruncated se is: studies that agree more closely than their variances predict would otherwise yield an interval
 * narrower than any one study's evidence supports. `normal` holds the DerSimonian-Laird normal interval beside it,
 * and `fixed` the fixed-effect fit.
 */
export function metaRandom(yi, vi, { confidence = 0.95 } = {}) {
  checkConfidence(confidence);
  checkEffects(yi, vi);
  const k = yi.length;
  const { fixed, q, df, pQ, i2, c } = heterogeneity(yi, vi);
  const tau2 = c > 0 ? Math.max(0, (q - df) / c) : 0;
  const weights = vi.map((value) => 1 / (value + tau2));
  const pooled = inverseVariance(yi, weights);
  let residual = 0;
  for (let i = 0; i < k; i += 1) residual += weights[i] * (yi[i] - pooled.estimate) ** 2;
  const seHartungKnapp = Math.sqrt(residual / ((k - 1) * pooled.total));
  const seTruncated = Math.sqrt(Math.max(1, residual / (k - 1)) / pooled.total);
  const t = tQuantile(1 - (1 - confidence) / 2, k - 1);
  const z = normalQuantile(1 - (1 - confidence) / 2);
  const tP = (se) => (se > 0 ? 2 * (1 - tCdf(Math.abs(pooled.estimate / se), k - 1)) : Number(pooled.estimate === 0));
  const truncated = {
    se: seTruncated,
    low: pooled.estimate - t * seTruncated,
    high: pooled.estimate + t * seTruncated,
    p: tP(seTruncated),
  };
  const warnings = poolingWarnings(k, i2, "random");
  if (seHartungKnapp < pooled.se)
    warnings.push(
      `the Hartung-Knapp se (${Number(seHartungKnapp.toPrecision(3))}) is below the DerSimonian-Laird se (${Number(pooled.se.toPrecision(3))}): the studies agree more closely than their variances predict, so the default interval is narrower than their evidence supports; report hartungKnapp.truncated's interval, ${Number(truncated.low.toPrecision(4))} to ${Number(truncated.high.toPrecision(4))}, instead`,
    );
  return {
    method: "meta-random",
    tau2Method: "dersimonian-laird",
    interval: "hartung-knapp-sidik-jonkman",
    k,
    estimate: pooled.estimate,
    se: pooled.se,
    confidence,
    low: pooled.estimate - t * seHartungKnapp,
    high: pooled.estimate + t * seHartungKnapp,
    p: tP(seHartungKnapp),
    hartungKnapp: { se: seHartungKnapp, df: k - 1, truncated },
    normal: {
      low: pooled.estimate - z * pooled.se,
      high: pooled.estimate + z * pooled.se,
      p: 2 * (1 - normalCdf(Math.abs(pooled.estimate / pooled.se))),
    },
    tau2,
    tau: Math.sqrt(tau2),
    q,
    df,
    pQ,
    i2,
    fixed: { estimate: fixed.estimate, se: fixed.se },
    ...(warnings.length > 0 ? { warnings } : {}),
  };
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

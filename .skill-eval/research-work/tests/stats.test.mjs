import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapMean,
  clusteredMean,
  designEffect,
  exactBinomialInterval,
  holm,
  intraclassCorrelation,
  mcnemarCasesForPower,
  mcnemarExact,
  mcnemarPower,
  meanInterval,
  normalCdf,
  normalQuantile,
  pabak,
  pairedCasesNeeded,
  pairedDifference,
  pairedPowerBySimulation,
  passAtK,
  passPowerK,
  raterAgreement,
  seededRandom,
  signFlipTest,
  signTest,
  suitePassK,
  tCdf,
  tostPaired,
  tQuantile,
  wilsonInterval,
} from "../../../skills/research-work/scripts/lib/stats.mjs";

// Reference values: published worked examples where they exist, otherwise scipy 1.18.1, statsmodels 0.15.0 and
// errorbars 0.2.4, computed once on 2026-10-27 and pasted here. None of them is a dependency.
const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("normal and t distributions match scipy", () => {
  close(normalQuantile(0.975), 1.959963984540054, 1e-12);
  close(normalQuantile(0.001), -3.090232306167813, 1e-11);
  close(normalCdf(-2.5), 0.006209665325776132, 1e-13);
  close(tQuantile(0.975, 10), 2.228138851986274, 1e-10);
  close(tQuantile(0.975, 39), 2.022690920036761, 1e-10);
  close(tQuantile(0.05, 3), -2.353363434801824, 1e-10);
  close(tCdf(1.7, 7), 0.9335355516087224, 1e-12);
});

test("Wilson interval matches Newcombe's published example and the research map's figure", () => {
  // Newcombe (1998), Statistics in Medicine 17:857, method 3: 81/263 gives 0.2553 to 0.3662.
  const newcombe = wilsonInterval(81, 263);
  close(newcombe.low, 0.2552885198782742, 1e-12);
  close(newcombe.high, 0.36620957698280004, 1e-12);
  // 10 of 19 is 53%, with a 95% interval of 32-73% (research-practice map; statsmodels method="wilson").
  const map = wilsonInterval(10, 19);
  close(map.low, 0.31707809245113155, 1e-12);
  close(map.high, 0.7267019483882042, 1e-12);
  // At the edges the interval stays inside [0, 1] and touches the observed edge.
  const none = wilsonInterval(0, 20);
  assert.equal(none.low, 0);
  close(none.high, 0.1611251580528194, 1e-12);
});

test("exact binomial interval matches statsmodels' Clopper-Pearson", () => {
  const middle = exactBinomialInterval(10, 19);
  close(middle.low, 0.2886432479169988, 1e-10);
  close(middle.high, 0.7555253105338039, 1e-10);
  assert.equal(exactBinomialInterval(0, 20).low, 0);
  close(exactBinomialInterval(0, 20).high, 0.16843347098308534, 1e-10);
  close(exactBinomialInterval(20, 20).low, 0.8315665290169146, 1e-10);
  assert.equal(exactBinomialInterval(20, 20).high, 1);
});

test("mean interval and paired difference match scipy", () => {
  const interval = meanInterval([1, 2, 3, 4, 10]);
  close(interval.low, -0.3899451654254138, 1e-10);
  close(interval.high, 8.389945165425413, 1e-10);
  const reference = [0, 1, 0, 0, 1, 0, 0, 1];
  const arm = [1, 1, 0, 1, 0, 1, 1, 1];
  const paired = pairedDifference(reference.map((value, index) => [value, arm[index]]));
  close(paired.estimate, 0.375, 1e-12);
  close(paired.t, 1.4255728899344746, 1e-12);
  close(paired.p, 0.1970220721577505, 1e-10);
});

test("the sign test and exact McNemar test agree with statsmodels", () => {
  close(signTest(9, 1), 22 / 1024, 1e-15);
  close(signTest(5, 0), 0.0625, 1e-15);
  assert.equal(signTest(0, 0), 1);
  close(mcnemarExact({ armOnly: 9, referenceOnly: 1 }).p, 0.021484375, 1e-15);
  close(mcnemarExact({ armOnly: 3, referenceOnly: 12 }).p, 0.03515625, 1e-15);
  // Above 1000 cases the log-sum branch agrees with the exact one at the boundary.
  close(signTest(520, 481) / signTest(520, 480), 1, 0.1);
});

test("the sign-flip permutation test is exact for small n and reproducible for large n", () => {
  // All 32 sign patterns of [1, 2, -0.5, 3, 0.2]: 6 reach the observed |mean|.
  assert.equal(signFlipTest([1, 2, -0.5, 3, 0.2]).p, 0.1875);
  const many = Array.from({ length: 30 }, (_, index) => (index % 3) - 0.5);
  const first = signFlipTest(many, { resamples: 2000, seed: 7 });
  const second = signFlipTest(many, { resamples: 2000, seed: 7 });
  assert.equal(first.method, "sign-flip-monte-carlo");
  assert.equal(first.p, second.p);
  assert.equal(first.seed, 7);
});

test("cluster-robust mean and intraclass correlation match statsmodels and errorbars", () => {
  const values = [1, 0, 1, 1, 0, 0, 1, 1];
  const clusters = ["a", "a", "b", "b", "c", "c", "d", "d"];
  const clustered = clusteredMean(values, clusters);
  // statsmodels OLS on a constant with cov_type="cluster": 0.23935677693908447.
  close(clustered.se, 0.23935677693908453, 1e-12);
  assert.equal(clustered.clusters, 4);
  // The interval uses t on G - 1 = 3 degrees of freedom (scipy t.ppf(0.975, 3) = 3.182446305284263), not n - 1.
  close(clustered.low, 0.625 - 3.182446305284263 * clustered.se, 1e-9);
  assert.ok(clustered.se > clustered.naiveSe, "clustering widens the error here");
  close(intraclassCorrelation(values, clusters).icc, 0.5714285714285715, 1e-12);
  const uneven = [0.2, 0.4, 0.3, 0.9, 0.8, 0.7, 0.1, 0.15, 0.5, 0.55];
  const groups = [1, 1, 1, 2, 2, 2, 3, 3, 4, 4];
  close(clusteredMean(uneven, groups).se, 0.15216657539245163, 1e-12);
  close(intraclassCorrelation(uneven, groups).icc, 0.9237760542898692, 1e-12);
  assert.equal(intraclassCorrelation([1, 2, 3], ["a", "b", "c"]).icc, 0);
});

test("design effect gives the effective sample size", () => {
  const result = designEffect({ n: 300, clusterSize: 3, icc: 0.5 });
  assert.equal(result.designEffect, 2);
  assert.equal(result.effectiveN, 150);
});

test("bootstrap intervals are reproducible from their seed and resample whole clusters", () => {
  const values = [1, 0, 1, 1, 0, 0, 1, 1];
  const clusters = ["a", "a", "b", "b", "c", "c", "d", "d"];
  const first = bootstrapMean(values, { clusters, resamples: 2000, seed: 3 });
  const second = bootstrapMean(values, { clusters, resamples: 2000, seed: 3 });
  assert.deepEqual(first, second);
  assert.equal(first.method, "cluster-bootstrap-percentile");
  // Cluster means are 0.5, 1, 0, 1: any resample's mean is a multiple of 1/8 between 0 and 1.
  assert.ok(first.low >= 0 && first.high <= 1 && first.low < first.estimate && first.estimate < first.high);
  assert.equal(bootstrapMean(values, { resamples: 500 }).method, "bootstrap-percentile");
  assert.notDeepEqual(seededRandom(1)(), seededRandom(2)());
});

test("PABAK stays high where kappa collapses at extreme prevalence", () => {
  // 98 both-no, 1 yes/no, 1 no/yes: raters agree on 98% of items.
  const pairs = [...Array.from({ length: 98 }, () => ["no", "no"]), ["yes", "no"], ["no", "yes"]];
  const adjusted = pabak(pairs);
  close(adjusted.observed, 0.98, 1e-12);
  close(adjusted.pabak, 0.96, 1e-12);
  const kappa = raterAgreement(pairs.map((pair) => [...pair])).kappa;
  assert.ok(kappa < 0, `kappa ${kappa} collapses although agreement is 98%`);
  close(
    pabak(
      [
        ["a", "b"],
        ["c", "c"],
      ],
      { categories: 3 },
    ).pabak,
    0.25,
    1e-12,
  );
});

test("Holm's adjustment matches statsmodels and keeps the input order", () => {
  assert.deepEqual(holm([0.01, 0.04, 0.03, 0.005]).adjusted, [0.03, 0.06, 0.06, 0.02]);
  const second = holm([0.2, 0.01, 0.5]).adjusted;
  close(second[0], 0.4, 1e-15);
  close(second[1], 0.03, 1e-15);
  close(second[2], 0.5, 1e-15);
});

test("pass@k matches the HumanEval estimator and pass^k the hypergeometric ratio", () => {
  close(passAtK(10, 3, 1), 0.3, 1e-15);
  close(passAtK(10, 3, 5), 0.9166666666666666, 1e-12);
  close(passAtK(200, 13, 10), 0.4975511147306061, 1e-12);
  assert.equal(passAtK(10, 8, 5), 1);
  close(passPowerK(10, 3, 2), 3 / 45, 1e-15);
  close(passPowerK(10, 7, 3), 35 / 120, 1e-15);
  assert.equal(passPowerK(10, 2, 3), 0);
  const suite = suitePassK(
    [
      { n: 10, c: 3 },
      { n: 10, c: 10 },
    ],
    1,
  );
  close(suite.passAtK, 0.65, 1e-15);
  assert.throws(() => passAtK(3, 1, 5), /k must be/);
});

test("TOST matches statsmodels' ttost_paired", () => {
  const result = tostPaired([0.01, -0.02, 0.03, 0, 0.01, -0.01], { low: -0.05, high: 0.05 });
  close(result.pLow, 0.00034150130478890247, 1e-12);
  close(result.pHigh, 0.0006310808898117436, 1e-12);
  assert.equal(result.equivalent, true);
  assert.equal(result.confidence, 0.9);
  assert.equal(tostPaired([0.04, 0.06, 0.05, 0.07], { low: -0.05, high: 0.05 }).equivalent, false);
});

test("exact McNemar power matches a brute-force sum over every table", () => {
  // Sum over all (armOnly, referenceOnly) counts with scipy's binomtest: 0.17242718864372375 and 0.5444454279352277.
  close(mcnemarPower({ n: 40, armOnly: 0.15, referenceOnly: 0.05 }).power, 0.17242718864372375, 1e-12);
  close(mcnemarPower({ n: 100, armOnly: 0.15, referenceOnly: 0.05 }).power, 0.5444454279352277, 1e-12);
  assert.equal(mcnemarPower({ n: 50, armOnly: 0, referenceOnly: 0 }).power, 0);
  const search = mcnemarCasesForPower({ armOnly: 0.15, referenceOnly: 0.05 });
  assert.ok(search.achieved >= 0.8);
  assert.ok(mcnemarPower({ n: search.n - 1, armOnly: 0.15, referenceOnly: 0.05 }).power < 0.8);
});

test("paired sample size matches errorbars, and simulated power matches statsmodels", () => {
  // errorbars questions_needed(0.03, variance=0.045): 785, with a per-case difference variance of 2 x 0.045.
  assert.equal(pairedCasesNeeded({ difference: 0.03, sdDifference: Math.sqrt(0.09) }).n, 785);
  // statsmodels TTestPower: effect size 0.5, 30 cases, alpha 0.05, two-sided: 0.75396471574379.
  const simulated = pairedPowerBySimulation({ n: 30, difference: 0.5, sdDifference: 1, simulations: 20000, seed: 11 });
  close(simulated.power, 0.75396471574379, 4 * simulated.monteCarloSe);
});

test("inputs outside a method's domain are refused, not silently computed", () => {
  assert.throws(() => wilsonInterval(5, 3), /successes/);
  assert.throws(() => meanInterval([1]), /at least two/);
  assert.throws(() => clusteredMean([1, 2], ["a", "a"]), /two clusters/);
  assert.throws(() => holm([0.5, 1.2]), /from 0 to 1/);
  assert.throws(() => signFlipTest([1, 2], { seed: -1 }), /seed/);
  assert.throws(() => mcnemarPower({ n: 10, armOnly: 0.7, referenceOnly: 0.5 }), /cannot exceed 1/);
});

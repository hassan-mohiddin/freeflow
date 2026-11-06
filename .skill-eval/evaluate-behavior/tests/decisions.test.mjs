// SPEC-011 4.3: several decisions in one suite, McNemar and the paired bootstrap from Research Work's statistics, the
// list-price cost from Track Work's price table. Fixture results only; no subject runs.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { bootstrapMean, mcnemarExact } from "../../../skills/research-work/scripts/lib/stats.mjs";
import {
  BOOTSTRAP,
  decide,
  renderClaim,
  validateDecision,
  validateDecisions,
} from "../../../skills/evaluate-behavior/scripts/lib/decision.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { listCost } from "../../../skills/evaluate-behavior/scripts/lib/metrics.mjs";
import { renderHtml } from "../../../skills/evaluate-behavior/scripts/lib/view-html.mjs";
import { requestCost } from "../../../skills/track-work/scripts/lib/measure5.mjs";

const fail = (message) => {
  throw new Error(message);
};
const ARMS = ["plain", "freeflow"];
const SUCCESS = { measure: { comparison: "hidden-tests" }, arms: ARMS, direction: "higher", method: "mcnemar" };
const COST = { measure: { metric: "listCost" }, arms: ARMS, direction: "lower", method: "bootstrap" };

/** A case with each arm's hidden-test passes and fails over its trials, and each trial's list cost. */
function caseOf(id, plain, freeflow, costs = null) {
  const counts = ([pass, fail]) => ({ pass, fail, unavailable: 0 });
  return {
    id,
    trials: 3,
    comparisons: [{ id: "hidden-tests", kind: "command", arms: { plain: counts(plain), freeflow: counts(freeflow) } }],
    ...(costs
      ? {
          metrics: {
            perTrial: costs.flatMap(([plainCost, freeflowCost], trial) => [
              { trial: `t${trial}`, arm: "plain", values: { listCost: plainCost } },
              { trial: `t${trial}`, arm: "freeflow", values: { listCost: freeflowCost } },
            ]),
          },
        }
      : {}),
  };
}

test("validateDecisions takes several rules, each validated, the first alone scheduling trials", () => {
  const rules = validateDecisions([SUCCESS, COST], fail);
  assert.deepEqual(
    rules.map((rule) => [rule.method, rule.alpha, rule.min_cases]),
    [
      ["mcnemar", 0.05, 10],
      ["bootstrap", 0.05, 10],
    ],
  );
  assert.throws(() => validateDecisions([], fail), /non-empty array/);
  assert.throws(() => validateDecisions([SUCCESS, SUCCESS], fail), /repeats a measure, arms and method/);
  assert.throws(
    () => validateDecisions([SUCCESS, { ...COST, trials: { initial: 3, max: 3, step: 1 } }], fail),
    /decisions\[1\]\.trials: only the first decision schedules trials/,
  );
  assert.throws(() => validateDecisions([SUCCESS, { ...COST, method: "t-test" }], fail), /decisions\[1\]\.method/);
  // McNemar needs a pass or a fail per trial.
  assert.throws(() => validateDecision({ ...COST, method: "mcnemar" }, fail), /mcnemar needs a comparison measure/);
});

test("McNemar decides on each case's pass^k and matches stats.mjs on the discordant cases", () => {
  // Freeflow alone passes every trial on 9 cases, plain alone on 1, both on 4, neither on 2; one case is unreadable.
  const groups = [
    ...Array.from({ length: 9 }, (_, index) => caseOf(`ff-${index}`, [1, 2], [3, 0])),
    caseOf("plain-only", [3, 0], [2, 1]),
    ...Array.from({ length: 4 }, (_, index) => caseOf(`both-${index}`, [3, 0], [3, 0])),
    ...Array.from({ length: 2 }, (_, index) => caseOf(`neither-${index}`, [0, 3], [1, 2])),
    { id: "absent", trials: 3, comparisons: [] },
  ];
  const rule = validateDecision(SUCCESS, fail);
  const decision = decide(rule, groups);
  const expected = mcnemarExact({ armOnly: 9, referenceOnly: 1 });
  assert.equal(decision.p, expected.p);
  assert.deepEqual(decision.mcnemar, { armOnly: 9, referenceOnly: 1, bothPassed: 4, neitherPassed: 2 });
  assert.deepEqual([decision.better, decision.worse, decision.ties, decision.excluded], [9, 1, 6, 1]);
  assert.equal(decision.decided, 10);
  assert.equal(decision.verdict, "beats");
  // pass@1 averages each case's trials; pass^k counts the cases every trial passed, over the 16 decided cases.
  assert.ok(Math.abs(decision.passAt1.freeflow - (9 * 1 + 2 / 3 + 4 * 1 + 2 * (1 / 3)) / 16) < 1e-12);
  assert.equal(decision.passK.freeflow, 13 / 16);
  assert.equal(decision.passK.plain, 5 / 16);
  // Below min_cases discordant cases, no verdict is reached however lopsided.
  assert.equal(decide({ ...rule, min_cases: 11 }, groups).verdict, "no-difference-shown");
});

test("the bootstrap gives the paired mean difference's interval as stats.mjs does, and decides by it", () => {
  // Freeflow's list cost is lower in 10 of 12 cases.
  const costs = [0.5, 0.4, 0.6, 0.55, 0.7, 0.45, 0.5, 0.65, 0.4, 0.6, 0.5, 0.55];
  const groups = costs.map((plain, index) =>
    caseOf(
      `case-${index}`,
      [3, 0],
      [3, 0],
      [
        [plain, plain - (index < 10 ? 0.1 : -0.02)],
        [plain + 0.02, plain - (index < 10 ? 0.08 : -0.03)],
      ],
    ),
  );
  const rule = validateDecision(COST, fail);
  const decision = decide(rule, groups);
  // Each case's mean freeflow cost minus its mean plain cost: 0.1 less in the first 10, 0.015 more in the last 2.
  const differences = decision.cases.map((entry) => entry.difference);
  differences.forEach((value, index) => assert.ok(Math.abs(value - (index < 10 ? -0.1 : 0.015)) < 1e-12));
  const expected = bootstrapMean(differences, { ...BOOTSTRAP, confidence: 0.95 });
  assert.equal(decision.decided, 12);
  assert.equal(decision.p, null);
  assert.ok(Math.abs(decision.interval.mean - expected.estimate) < 1e-12);
  assert.ok(Math.abs(decision.interval.low - expected.low) < 1e-12);
  assert.ok(Math.abs(decision.interval.high - expected.high) < 1e-12);
  assert.deepEqual([decision.interval.resamples, decision.interval.seed], [10000, 1]);
  // Lower is better and the whole interval is below zero.
  assert.ok(decision.interval.high < 0);
  assert.equal(decision.verdict, "beats");
  // The same results with higher declared better read as worse; the same seed gives the same interval.
  const higher = decide({ ...rule, direction: "higher" }, groups);
  assert.equal(higher.verdict, "worse");
  assert.deepEqual(higher.interval, decision.interval);
});

test("a suite with two decisions loads both and its aggregate gives two verdicts, the first its claim", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-decisions-")));
  try {
    const group = {
      schema_version: 2,
      kind: "group",
      id: "one",
      type: "body",
      input: { prompt: "Fix it." },
      fixture: null,
      tools: ["read"],
      configuration: {
        host: { name: "pi" },
        model: { model: "anthropic/claude-haiku-5-5" },
        subject: { kind: "none" },
      },
      arms: { plain: {}, freeflow: {} },
      reference: "plain",
      component: [],
      review_questions: [],
      expectations: ARMS.map((arm) => ({
        id: `${arm}-tests`,
        kind: "path",
        variant: arm,
        path: "done.txt",
        expect: "exists",
        comparison: "hidden-tests",
      })),
    };
    await mkdir(path.join(root, "groups"), { recursive: true });
    await writeFile(path.join(root, "groups/one.json"), JSON.stringify(group));
    const suite = {
      schema_version: 2,
      kind: "suite",
      id: "two",
      groups: ["groups/one.json"],
      decisions: [SUCCESS, COST],
    };
    await writeFile(path.join(root, "suite.json"), JSON.stringify(suite));
    const loaded = await loadDefinition(path.join(root, "suite.json"), { root });
    assert.equal(loaded.decisions.length, 2);
    assert.deepEqual(loaded.decision, loaded.decisions[0]);
    await writeFile(path.join(root, "both.json"), JSON.stringify({ ...suite, decision: SUCCESS }));
    await assert.rejects(loadDefinition(path.join(root, "both.json"), { root }), /decision or decisions, not both/);

    // The aggregate as trials.mjs writes it: the claim's decision, then every decision's verdict.
    const groups = Array.from({ length: 12 }, (_, index) =>
      caseOf(`case-${index}`, [index < 10 ? 0 : 3, index < 10 ? 3 : 0], [3, 0], [[0.5, 0.4]]),
    );
    const decisions = loaded.decisions.map((rule) => decide(rule, groups));
    const aggregate = {
      kind: "aggregate",
      id: "agg-two",
      state: "complete",
      requestedTrials: 1,
      trials: [],
      groups,
      decision: decisions[0],
      decisions,
      claim: { class: decisions[0].verdict, k: 1 },
    };
    const lines = renderClaim(aggregate);
    assert.match(lines[0], /^Claim: beats; freeflow against plain on comparison hidden-tests, higher is better$/);
    assert.ok(lines.some((line) => line.startsWith("mcnemar\tfreeflow-only=10\tplain-only=0\tboth=2\tneither=0")));
    assert.ok(
      lines.includes("Decision 2: beats; freeflow against plain on metric listCost, lower is better"),
      lines.join("\n"),
    );
    assert.ok(lines.some((line) => /^bootstrap\tfreeflow-plain=mean:-0\.1\t95%=\[-0\.1, -0\.1\]/.test(line)));
    await mkdir(path.join(root, ".skill-eval/runs/agg-two"), { recursive: true });
    await writeFile(path.join(root, ".skill-eval/runs/agg-two/aggregate.json"), JSON.stringify(aggregate));
    const html = await renderHtml("agg-two", { root });
    assert.match(html, /<h2>Decision<\/h2>/);
    assert.match(html, /<h2>Decision 2<\/h2>/);
    assert.match(html, /<th>p \(McNemar\)<\/th>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("listCost prices each request of a transcript with Track Work's table, workers' too, and is null when unpriced", () => {
  const usage = {
    input_tokens: 10,
    output_tokens: 200,
    cache_read_input_tokens: 3000,
    cache_creation_input_tokens: 500,
  };
  const claude = [
    { role: "user", content: "go" },
    { role: "assistant", model: "claude-haiku-5-5", usage },
    // A subagent's request, which Claude Code's stream marks; it is the arm's cost too.
    { role: "assistant", model: "claude-haiku-5-5", usage: { ...usage, output_tokens: 20 }, worker: true },
  ];
  const expected =
    requestCost({ model: "claude-haiku-5-5", usage }) +
    requestCost({ model: "claude-haiku-5-5", usage: { ...usage, output_tokens: 20 } });
  assert.ok(Math.abs(listCost(claude) - expected) < 1e-15);
  // Pi's usage names, and its provider prefix.
  const pi = [
    {
      role: "assistant",
      model: "anthropic/claude-haiku-5-5",
      usage: { input: 10, output: 200, cacheRead: 3000, cacheWrite: 500 },
    },
  ];
  assert.ok(Math.abs(listCost(pi) - requestCost({ model: "claude-haiku-5-5", usage })) < 1e-15);
  assert.equal(listCost([{ role: "assistant", model: "made-up", usage }]), null);
  assert.equal(listCost([{ role: "user", content: "x" }]), null);
  assert.equal(listCost(undefined), null);
});

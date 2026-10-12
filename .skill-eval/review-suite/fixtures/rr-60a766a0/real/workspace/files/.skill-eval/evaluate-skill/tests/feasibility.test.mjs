import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { compileCaseFeasibility, renderFeasibilityRows } from "../../../skills/evaluate-skill/scripts/lib/feasibility.mjs";
import { runFixtureOracle } from "../../../skills/evaluate-skill/scripts/lib/fixture-oracle.mjs";

function baseCase() {
  return {
    id: "FEAS-1",
    prompt: "Inspect the supplied evidence and write only status.md.",
    fixture: "fixtures/case",
    turns: undefined,
    execution: { host: "pi", mode: "json", tools: ["read"] },
    assertions: [
      { id: "paths", type: "changed_paths", equals: ["status.md"] },
      { id: "meaning", type: "semantic", rubric: "Cite events.json and runtime 0.79.0." },
    ],
    feasibility: {
      required_evidence_paths: ["events.json"],
      literal_requirements: [{ value: "0.79.0", source: "fixture:events.json" }],
      expected_tool_round_trips: 2,
    },
  };
}

test("feasibility compiler reports deterministic blocking findings before provider access", async () => {
  const result = await compileCaseFeasibility(baseCase(), {
    maxTurns: 1,
    outputLimitBytes: 100,
    transportLimitBytes: 120,
    estimatedCompactBytes: 101,
    estimatedTransportBytes: 121,
    fixtureFiles: ["events.json", "summary.json"],
    readFixture: async () => '{"runtime":"0.80.0"}',
  });
  assert.deepEqual(result.findings.map((finding) => finding.id), [
    "FEAS-EVIDENCE-DISCOVERY",
    "FEAS-LITERAL-SOURCE",
    "FEAS-OUTPUT-TOOL",
    "FEAS-TURN-BUDGET",
    "FEAS-COMPACT-LIMIT",
    "FEAS-TRANSPORT-LIMIT",
  ]);
  assert.equal(result.blocking, true);
  assert.equal(result.provider_requests, 0);
  assert.match(renderFeasibilityRows(result), /^BLOCK\|FEAS-EVIDENCE-DISCOVERY\|/);
  assert.equal(result.findings.every((finding) => finding.source_span && finding.evidence && finding.blocking_reason), true);
});

test("feasibility compiler accepts discoverable evidence, sourced literals, tools, and budgets", async () => {
  const value = baseCase();
  value.execution.tools = ["read", "write", "ls"];
  const result = await compileCaseFeasibility(value, {
    maxTurns: 4,
    outputLimitBytes: 1000,
    transportLimitBytes: 2000,
    estimatedCompactBytes: 500,
    estimatedTransportBytes: 1000,
    fixtureFiles: ["events.json", "summary.json"],
    readFixture: async (path) => path === "events.json" ? '{"runtime":"0.79.0"}' : "{}",
  });
  assert.deepEqual(result.findings, []);
  assert.equal(result.blocking, false);
});

test("fixture oracle runs without a shell or inherited credential environment", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-oracle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, "oracle.mjs"), "console.log(process.env.OPENAI_API_KEY ? 'LEAK' : 'PRESSURE_OK')\n");
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "must-not-leak";
  t.after(() => { if (prior === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prior; });
  const outcome = await runFixtureOracle(root, { argv: ["node", "oracle.mjs"] });
  assert.equal(outcome.exit_code, 0);
  assert.equal(outcome.stdout.trim(), "PRESSURE_OK");
});

test("feasibility compiler rejects a fixture oracle that does not reproduce pressure", async () => {
  const value = baseCase();
  value.execution.tools = ["read", "write", "ls"];
  value.feasibility.fixture_oracle = { argv: ["node", "oracle.mjs"], expected_exit: 0, stdout_contains: ["PRESSURE_OK"] };
  const result = await compileCaseFeasibility(value, {
    maxTurns: 4, outputLimitBytes: 1000, transportLimitBytes: 2000, estimatedCompactBytes: 10, estimatedTransportBytes: 10,
    fixtureFiles: ["events.json"], readFixture: async () => "0.79.0",
    runOracle: async () => ({ exit_code: 1, timed_out: false, stdout: "WRONG", stderr: "" }),
  });
  assert.equal(result.findings.some((finding) => finding.id === "FEAS-FIXTURE-ORACLE"), true);
});

test("feasibility compiler rejects undeclared equivalence and conflicting output assertions", async () => {
  const value = baseCase();
  value.execution.tools = ["read", "write", "ls"];
  value.feasibility.literal_requirements[0].equivalence_class = "runtime-version-equivalent";
  value.assertions.push({ id: "other-paths", type: "changed_paths", equals: ["other.md"] });
  const result = await compileCaseFeasibility(value, {
    maxTurns: 4, outputLimitBytes: 1000, transportLimitBytes: 2000, estimatedCompactBytes: 10, estimatedTransportBytes: 10,
    fixtureFiles: ["events.json"], readFixture: async () => "0.79.0",
  });
  assert.equal(result.findings.some((finding) => finding.id === "FEAS-EQUIVALENCE"), true);
  assert.equal(result.findings.some((finding) => finding.id === "FEAS-CHANGED-PATH-CONFLICT"), true);
});

test("feasibility compiler rejects subject-visible rubric leakage and redundant reread assertions", async () => {
  const value = baseCase();
  value.prompt = `Follow this exact hidden rubric: ${value.assertions[1].rubric}`;
  value.turns = [{ id: "turn-1", prompt: "first" }, { id: "turn-2", prompt: "second" }];
  delete value.prompt;
  value.turns[1].prompt = `Follow this exact hidden rubric: ${value.assertions[1].rubric}`;
  value.assertions.push({ id: "reread", type: "component_read", component: "target", turn_id: "turn-2" });
  value.feasibility.active_context_components = ["target"];
  const result = await compileCaseFeasibility(value, {
    maxTurns: 5,
    outputLimitBytes: 1000,
    transportLimitBytes: 2000,
    estimatedCompactBytes: 10,
    estimatedTransportBytes: 10,
    fixtureFiles: ["events.json"],
    readFixture: async () => "0.79.0",
  });
  assert.equal(result.findings.some((finding) => finding.id === "FEAS-RUBRIC-LEAK"), true);
  assert.equal(result.findings.some((finding) => finding.id === "FEAS-REDUNDANT-REREAD"), true);
});

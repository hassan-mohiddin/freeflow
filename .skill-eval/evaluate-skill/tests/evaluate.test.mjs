import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildEvaluationPlan } from "../../../skills/evaluate-skill/scripts/lib/plan.mjs";
import { executeEvaluation } from "../../../skills/evaluate-skill/scripts/lib/evaluate.mjs";
import { removeWritableTree } from "../../../skills/evaluate-skill/scripts/lib/materialize.mjs";
import { loadSkillWorkspace } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

function successfulSubject(cost = 0) {
  return {
    invocation: { command: "pi", args: ["prompt"] },
    process: { code: 0, signal: null, timed_out: false, output_limit_exceeded: false, stdout: "", stderr: "" },
    parsed: {
      parse_errors: [],
      final_text: "done",
      usage: { input: 10, output: 5, cache_read: 0, cache_write: 0, total_tokens: 15, cost: { total_usd: cost } },
      tool_events: [],
      skill_read: false,
    },
    runtime_counters: { provider_requests: 1, turns_started: 1, tool_calls: 0, hard_turn_limit_reached: false },
  };
}

async function fixture(t, { host = "none", comparison = false, semantic = false, withFixture = false } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-outcome-eval-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "skills", "sample-skill"), { recursive: true });
  await writeFile(resolve(root, "skills", "sample-skill", "SKILL.md"), "---\nname: sample-skill\ndescription: Sample.\n---\n\n# Sample\n");
  await writeFile(resolve(root, "skills", "sample-skill", "UNDECLARED.md"), "must not reach subject\n");
  const skillRoot = resolve(root, ".skill-eval", "sample-skill");
  await mkdir(resolve(skillRoot, "cases"), { recursive: true });
  if (withFixture) {
    await mkdir(resolve(skillRoot, "fixtures", "input"), { recursive: true });
    await writeFile(resolve(skillRoot, "fixtures", "input", "prompt.txt"), "approved fixture\n");
  }
  await writeFile(resolve(skillRoot, "suite.json"), JSON.stringify({ schema_version: 1, skill: "sample-skill", cases: ["cases/SAMPLE-001.json"] }));
  const evalCase = {
    schema_version: 1,
    id: "SAMPLE-001",
    skill: "sample-skill",
    title: "Sample",
    question: host === "none" ? "structural validity" : "explicit invocation",
    evidence_classes: [host === "none" ? "structure" : "explicit-instruction"],
    required_for_bootstrap: true,
    evaluation_kind: comparison ? "comparison" : "single",
    unsupported_evidence: "block",
    prompt: "Inspect the sample.",
    fixture: withFixture ? "fixtures/input" : null,
    variants: comparison
      ? [
          { id: "old", role: "reference", kind: "working-tree", path: "skills/sample-skill", resources: ["SKILL.md"] },
          { id: "candidate", role: "candidate", kind: "working-tree", path: "skills/sample-skill", resources: ["SKILL.md"] },
        ]
      : [{ id: "candidate", role: "subject", kind: "working-tree", path: "skills/sample-skill", resources: ["SKILL.md"] }],
    execution: { host, mode: host === "none" ? "deterministic" : "json", tools: host === "none" ? [] : ["read"], timeout_ms: 1000 },
    assertions: semantic
      ? [{ id: "quality", type: "semantic", rubric: "The response is useful." }]
      : [{ id: "frontmatter", type: "skill_frontmatter", path: "SKILL.md" }],
  };
  await writeFile(resolve(skillRoot, "cases", "SAMPLE-001.json"), JSON.stringify(evalCase));
  return { root, workspace: await loadSkillWorkspace(root, "sample-skill") };
}

test("host-free evaluation atomically publishes one complete result", async (t) => {
  const { root, workspace } = await fixture(t);
  const plan = await buildEvaluationPlan(workspace, { case: "SAMPLE-001", timeout_ms: 1000, output_limit_bytes: 1048576, owner_approved: true });
  const outcome = await executeEvaluation(workspace, plan);
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.decision.case_verdict, "pass");
  const result = JSON.parse(await readFile(resolve(root, outcome.result), "utf8"));
  assert.equal(result.evaluation_kind, "single");
  assert.equal(result.decision.case_verdict, "pass");
  assert.equal(result.plan_fingerprint, plan.fingerprint);
  assert.match(result.identities.evaluator, /^[a-f0-9]{64}$/);
  assert.match(result.identities.semantic, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.identities.case_source, plan.summary.identities.case_source);
  assert.equal(result.variants[0].objective.verdict, "pass");
  assert.equal(result.variants[0].semantic, null);
  assert.deepEqual(result.evidence_support, plan.summary.evidence);
  assert.ok(Array.isArray(result.unavailable));
  assert.ok(Array.isArray(result.residual_uncertainty));
  assert.equal(result.readiness.candidate_assertions_pass, true);
  const bundleRoot = resolve(root, outcome.result, "..");
  await assert.rejects(() => access(resolve(bundleRoot, "evidence", "subject", "inputs", "skill", "UNDECLARED.md")));
  assert.deepEqual(await readdir(resolve(workspace.skillRoot, "runs", "diagnostics")).catch(() => []), []);
});

test("successful result rename remains complete without a post-rename probe", async (t) => {
  const { root, workspace } = await fixture(t);
  const plan = await buildEvaluationPlan(workspace, { case: "SAMPLE-001", timeout_ms: 1000, output_limit_bytes: 1048576, owner_approved: true });
  const outcome = await executeEvaluation(workspace, plan, {
    publicationOperations: { access: async () => { throw new Error("post-rename probe failed"); } },
  });
  assert.equal(outcome.status, "complete");
  await access(resolve(root, outcome.result));
});

test("fixture mutation after approval stops before the subject process", async (t) => {
  const { workspace } = await fixture(t, { host: "pi", withFixture: true });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    owner_approved: true,
  });
  await writeFile(resolve(workspace.skillRoot, "fixtures", "input", "prompt.txt"), "changed after approval\n");
  let calls = 0;
  const outcome = await executeEvaluation(workspace, plan, { runSubject: async () => { calls += 1; return successfulSubject(); } });
  assert.equal(outcome.status, "incomplete");
  assert.match(outcome.failure.primary, /fixture.*changed/i);
  assert.equal(calls, 0);
  assert.equal(outcome.usage.provider_requests, 0);
});

test("comparison variants execute serially in reference-candidate order", async (t) => {
  const { workspace } = await fixture(t, { host: "pi", comparison: true });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    owner_approved: true,
  });
  const calls = [];
  let active = 0;
  let peak = 0;
  const outcome = await executeEvaluation(workspace, plan, {
    runSubject: async ({ skillSnapshot }) => {
      calls.push(skillSnapshot);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolveNow) => setImmediate(resolveNow));
      active -= 1;
      return successfulSubject();
    },
  });
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.decision.comparison_verdict, "same");
  assert.equal(calls.length, 2);
  assert.equal(peak, 1);
  assert.notEqual(calls[0], calls[1]);
});

test("soft spend ceiling prevents a later process at the exact observed boundary", async (t) => {
  const { workspace } = await fixture(t, { host: "pi", comparison: true });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    max_usd: 1,
    owner_approved: true,
  });
  let calls = 0;
  const outcome = await executeEvaluation(workspace, plan, { runSubject: async () => { calls += 1; return successfulSubject(1); } });
  assert.equal(outcome.status, "incomplete");
  assert.equal(calls, 1);
  assert.equal(outcome.usage.cost_usd, 1);
  assert.equal(outcome.usage.provider_requests, 1);
});

test("final required process may cross the soft spend ceiling and still complete", async (t) => {
  const { workspace } = await fixture(t, { host: "pi" });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    max_usd: 1,
    owner_approved: true,
  });
  const outcome = await executeEvaluation(workspace, plan, { runSubject: async () => successfulSubject(2) });
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.usage.cost_usd, 2);
});

test("semantic infrastructure failure preserves settled subject and semantic usage", async (t) => {
  const { workspace } = await fixture(t, { host: "pi", semantic: true });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    owner_approved: true,
  });
  const outcome = await executeEvaluation(workspace, plan, {
    runSubject: async () => successfulSubject(0.1),
    gradeSemantic: async () => ({
      status: "incomplete",
      execution: {
        usage: { input: 4, output: 2, cache_read: 0, cache_write: 0, total_tokens: 6, cost: { total_usd: 0.2 } },
        runtime_counters: { provider_requests: 1, turns_started: 1, tool_calls: 0, hard_turn_limit_reached: false },
      },
      failure: { primary: "semantic failed", cleanup: null },
    }),
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.usage.turns, 2);
  assert.equal(outcome.usage.provider_requests, 2);
  assert.ok(Math.abs(outcome.usage.cost_usd - 0.3) < 1e-9);
});

test("subject evidence persistence failure retains settled usage", async (t) => {
  const { workspace } = await fixture(t, { host: "pi" });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    owner_approved: true,
  });
  const outcome = await executeEvaluation(workspace, plan, {
    runSubject: async () => successfulSubject(0.4),
    persistVariantEvidence: async () => { throw new Error("evidence write failed"); },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.usage.turns, 1);
  assert.equal(outcome.usage.provider_requests, 1);
  assert.equal(outcome.usage.cost_usd, 0.4);
});

test("cleanup failure cannot erase settled subject usage", async (t) => {
  const { workspace } = await fixture(t, { host: "pi" });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    owner_approved: true,
  });
  const outcome = await executeEvaluation(workspace, plan, {
    runSubject: async () => successfulSubject(0.5),
    cleanupRuntime: async (path) => { await removeWritableTree(path); throw new Error("cleanup failed"); },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.usage.turns, 1);
  assert.equal(outcome.usage.provider_requests, 1);
  assert.equal(outcome.usage.cost_usd, 0.5);
});

test("diagnostic publication failure preserves primary failure and advertises no path", async (t) => {
  const { workspace } = await fixture(t, { host: "pi" });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    owner_approved: true,
  });
  const outcome = await executeEvaluation(workspace, plan, {
    runSubject: async () => ({
      invocation: { command: "pi", args: ["prompt"] },
      process: { code: 1, signal: null, timed_out: false, output_limit_exceeded: false, stdout: "", stderr: "subject failed" },
      parsed: { parse_errors: [], final_text: "", usage: null, tool_events: [], skill_read: false },
      runtime_counters: { provider_requests: 1, turns_started: 1, tool_calls: 0, hard_turn_limit_reached: false },
    }),
    publicationOperations: { rename: async () => { throw new Error("diagnostic rename failed"); } },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal("diagnostic" in outcome, false);
  assert.match(outcome.failure.primary, /subject/i);
  assert.equal(outcome.diagnostic_publication.failure.primary, "diagnostic rename failed");
  assert.equal(outcome.usage.provider_requests, 1);
});

test("infrastructure failure publishes diagnostics and no result", async (t) => {
  const { root, workspace } = await fixture(t, { host: "pi" });
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    owner_approved: true,
  });
  const outcome = await executeEvaluation(workspace, plan, {
    runSubject: async () => ({
      invocation: { command: "pi", args: ["prompt"] },
      process: { code: 1, signal: null, timed_out: false, output_limit_exceeded: false, stdout: "", stderr: "failed" },
      parsed: { parse_errors: [], final_text: "", usage: null, tool_events: [], skill_read: false },
      runtime_counters: { provider_requests: 1, turns_started: 1, tool_calls: 0, hard_turn_limit_reached: false },
    }),
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.usage.turns, 1);
  assert.equal(outcome.usage.provider_requests, 1);
  assert.equal(outcome.usage.cost_usd, null);
  await access(resolve(root, outcome.diagnostic));
  const diagnosticRoot = resolve(root, outcome.diagnostic, "..");
  await access(resolve(diagnosticRoot, "evidence", "subject", "metadata.json"));
  await assert.rejects(() => access(resolve(diagnosticRoot, "result.json")));
  assert.equal((await readdir(resolve(workspace.skillRoot, "runs", "evaluations")).catch(() => [])).length, 0);
});

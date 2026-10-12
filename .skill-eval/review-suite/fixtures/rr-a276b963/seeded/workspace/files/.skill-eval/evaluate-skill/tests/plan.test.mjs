import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { buildEvaluationPlan } from "../../../skills/evaluate-skill/scripts/lib/plan.mjs";
import { hashFile, sha256, stableJson } from "../../../skills/evaluate-skill/scripts/lib/hash.mjs";
import { findRepoRoot, loadSkillWorkspace } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

const repoRoot = await findRepoRoot(resolve(import.meta.dirname, "..", "..", ".."));
const hardLimits = { timeout_ms: 120000, output_limit_bytes: 1048576 };

async function plan(skill, caseId, options = {}) {
  const workspace = await loadSkillWorkspace(repoRoot, skill);
  return buildEvaluationPlan(workspace, { case: caseId, ...hardLimits, ...options });
}

test("host-free case preflights one case with zero Pi processes", async () => {
  const result = await plan("write-skill", "WSK2-005", { owner_approved: true });
  assert.equal(result.status, "ready");
  assert.equal(result.summary.case, "WSK2-005");
  assert.equal(result.summary.pi_processes.subject, 0);
  assert.equal(result.summary.pi_processes.semantic_max, 0);
  assert.equal(result.summary.worst_case_approved_turns, 0);
});

test("model case without approval returns needs_approval without execution", async () => {
  const result = await plan("evaluate-skill", "ESK2-001", {
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 4,
  });
  assert.equal(result.status, "needs_approval");
  assert.equal(result.summary.pi_processes.subject, 2);
  assert.equal(result.summary.pi_processes.semantic_max, 2);
  assert.equal(result.summary.worst_case_approved_turns, 16);
  assert.equal(result.summary.limits.transport_limit_bytes, 128 * 1024 * 1024);
  assert.match(result.summary.limitations.join("\n"), /provider requests.*observed/i);
  assert.match(result.summary.limitations.join("\n"), /canonical evidence.*raw transport/i);
});

test("plan-only returns planned and owner-approved execution returns ready", async () => {
  const options = { provider: "p", model: "m", thinking: "low", max_turns_per_process: 4 };
  assert.equal((await plan("evaluate-skill", "ESK2-001", { ...options, plan_only: true })).status, "planned");
  assert.equal((await plan("evaluate-skill", "ESK2-001", { ...options, owner_approved: true })).status, "ready");
});

test("expected plan mismatch returns needs_approval", async () => {
  const result = await plan("evaluate-skill", "ESK2-001", {
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 4,
    owner_approved: true,
    expect_plan: "wrong",
  });
  assert.equal(result.status, "needs_approval");
});

test("unsupported evidence under explicit behavior test is a limitation, not a blocker", async () => {
  const result = await plan("evaluate-skill", "ESK2-007", {
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 4,
    owner_approved: true,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.summary.evidence.requested["multi-turn"], "unsupported");
});

test("host-free case rejects model options", async () => {
  await assert.rejects(
    plan("write-skill", "WSK2-005", { provider: "p", owner_approved: true }),
    /host-free.*model option/i,
  );
});

test("fingerprint binds evaluator and semantic implementation identities", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "evaluate-skill");
  const result = await buildEvaluationPlan(workspace, {
    case: "ESK2-001",
    ...hardLimits,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 4,
    plan_only: true,
  });
  assert.match(result.plan_inputs.identities.evaluator, /^[a-f0-9]{64}$/);
  assert.match(result.plan_inputs.identities.semantic, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.plan_inputs.identities.case_source, {
    path: ".skill-eval/evaluate-skill/cases/ESK2-001-reuse-adequate-eval.json",
    sha256: await hashFile(result.eval_case.source_path),
  });
  const changedEvaluator = { ...result.plan_inputs, identities: { ...result.plan_inputs.identities, evaluator: "0".repeat(64) } };
  const changedSemantic = { ...result.plan_inputs, identities: { ...result.plan_inputs.identities, semantic: "1".repeat(64) } };
  assert.notEqual(sha256(stableJson(changedEvaluator)), result.fingerprint);
  assert.notEqual(sha256(stableJson(changedSemantic)), result.fingerprint);
});

test("preflight rejects a missing declared Git subject resource", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "write-skill");
  const source = workspace.cases.find((item) => item.id === "WSK2-005");
  const changedCase = {
    ...source,
    variants: source.variants.map((variant, index) => index === 0 ? { ...variant, resources: ["MISSING.md"] } : variant),
  };
  await assert.rejects(
    buildEvaluationPlan({ ...workspace, cases: workspace.cases.map((item) => item.id === changedCase.id ? changedCase : item) }, {
      case: "WSK2-005",
      ...hardLimits,
      plan_only: true,
    }),
    /missing git subject resource/i,
  );
});

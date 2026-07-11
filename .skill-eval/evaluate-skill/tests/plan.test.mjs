import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { buildPlan } from "../../../skills/evaluate-skill/scripts/lib/plan.mjs";
import { findRepoRoot, loadSkillWorkspace } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

const repoRoot = await findRepoRoot(resolve(import.meta.dirname, "..", "..", ".."));

test("iterate planning selects one case without requiring owner model inputs for structural work", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "write-skill");
  const plan = await buildPlan(workspace, { case: "WSK2-005", profile: "iterate" });
  assert.deepEqual(plan.selected_cases, ["WSK2-005"]);
  assert.equal(plan.expected_model_calls.subject, 0);
  assert.deepEqual(plan.unresolved_owner_inputs, []);
  assert.equal(plan.runnable, true);
});

test("model planning exposes owner inputs and expected call count without executing", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "evaluate-skill");
  const plan = await buildPlan(workspace, { case: "ESK2-001", profile: "iterate" });
  assert.ok(plan.expected_model_calls.subject > 0);
  assert.deepEqual(plan.unresolved_owner_inputs, ["provider", "model", "thinking", "max_model_calls"]);
  assert.equal(plan.runnable, false);
});

test("acceptance planning selects every required case and honors call cap", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "evaluate-skill");
  const plan = await buildPlan(workspace, {
    profile: "acceptance",
    provider: "test-provider",
    model: "test-model",
    thinking: "off",
    max_model_calls: 1,
  });
  assert.deepEqual(plan.selected_cases, workspace.cases.map((item) => item.id));
  assert.equal(plan.runnable, false);
  assert.ok(plan.expected_model_calls.subject > plan.expected_model_calls.configured_cap);
  const unsupportedRequested = plan.jobs.find((job) => job.case_id === "ESK2-007").evidence.requested;
  assert.equal(unsupportedRequested["multi-turn"], "unsupported");
});

test("fingerprints change with behavior-relevant model settings", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "write-skill");
  const base = { case: "WSK2-003", profile: "iterate", provider: "p", model: "m", thinking: "low", max_model_calls: 4 };
  const first = await buildPlan(workspace, base);
  const second = await buildPlan(workspace, { ...base, thinking: "high" });
  assert.notEqual(first.jobs[0].fingerprint, second.jobs[0].fingerprint);
});

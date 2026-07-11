import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { buildPlan } from "../../../skills/evaluate-skill/scripts/lib/plan.mjs";
import { sha256, stableJson } from "../../../skills/evaluate-skill/scripts/lib/hash.mjs";
import { findRepoRoot, loadSkillWorkspace } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

const repoRoot = await findRepoRoot(resolve(import.meta.dirname, "..", "..", ".."));

test("fingerprint inputs cover every behavior-relevant cache dimension", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "write-skill");
  const plan = await buildPlan(workspace, { case: "WSK2-003", profile: "iterate", provider: "p", model: "m", thinking: "low", max_model_calls: 3 });
  const inputs = plan.jobs[0].fingerprint_inputs;
  assert.equal(inputs.provider, "p");
  assert.equal(inputs.model, "m");
  assert.equal(inputs.thinking, "low");
  assert.ok(inputs.suite);
  assert.ok(inputs.case.assertions);
  assert.ok(inputs.fixture_hash);
  assert.ok(inputs.variant.snapshot_hash);
  assert.ok(inputs.host);
  assert.ok(inputs.host_version);
  assert.ok(inputs.tools);
  assert.ok(inputs.root_policy);
  assert.equal(inputs.context.config_home_policy, "isolated-auth-only-v1");
  assert.deepEqual(inputs.context.runtime_hooks, []);
  assert.ok(inputs.context.explicit_extensions.length);
  assert.ok(inputs.adapter_version);
  assert.equal("source_path" in inputs.case, false);

  const dimensions = [
    ["suite", { ...inputs.suite, schema_version: 2 }],
    ["case", { ...inputs.case, prompt: `${inputs.case.prompt} changed` }],
    ["fixture_hash", "b".repeat(64)],
    ["variant", { ...inputs.variant, snapshot_hash: "c".repeat(64) }],
    ["host_version", `${inputs.host_version}-changed`],
    ["provider", "other-provider"],
    ["backend_model_revision", "revision-2"],
    ["model", "other-model"],
    ["thinking", "high"],
    ["tools", ["read", "write"]],
    ["root_policy", "other-policy"],
    ["context", { ...inputs.context, runtime_hooks: ["hook"] }],
    ["adapter_version", "other-adapter"],
  ];
  for (const [key, value] of dimensions) {
    const changed = { ...inputs, [key]: value };
    assert.notEqual(sha256(stableJson(changed)), plan.jobs[0].fingerprint, key);
  }
});

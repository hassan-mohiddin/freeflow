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

test("fixed-script RPC preflight binds turns, capability handshake, and existing process maximum", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "evaluate-skill");
  const source = workspace.cases.find((item) => item.id === "ESK2-007");
  const { prompt: _prompt, requested_evidence_classes: _requested, ...rest } = source;
  const rpc = {
    ...rest,
    question: "multi-turn behavior",
    evidence_classes: ["multi-turn"],
    unsupported_evidence: "block",
    turns: [
      { id: "turn-1", prompt: "Remember alpha." },
      { id: "turn-2", prompt: "What did I ask you to remember?" },
    ],
    execution: { ...source.execution, mode: "rpc-scripted" },
    assertions: [{ id: "state", type: "semantic", rubric: "Remembers alpha.", turn_ids: ["turn-1", "turn-2"] }],
  };
  const cases = workspace.cases.map((item) => item.id === rpc.id ? Object.freeze(rpc) : item);
  const capabilities = {
    id: "pi",
    available: true,
    version: "test-pi",
    capabilities: {
      rpc_jsonl: true,
      multi_turn: true,
      native_skill_loading: true,
      explicit_extensions: true,
      disable_extension_discovery: true,
      disable_context_files: true,
      tool_allowlist: true,
      strict_tool_isolation: true,
    },
  };
  const options = {
    case: rpc.id,
    ...hardLimits,
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 4,
    owner_approved: true,
  };
  const result = await buildEvaluationPlan({ ...workspace, cases }, options, { capabilitiesFor: async () => capabilities });
  assert.equal(result.status, "ready");
  assert.equal(result.summary.scripted_user_turns, 2);
  assert.equal(result.summary.pi_processes.subject, 1);
  assert.equal(result.summary.pi_processes.semantic_max, 1);
  assert.equal(result.summary.pi_processes.total_max, 2);
  assert.equal(result.summary.worst_case_approved_turns, 8);
  assert.equal(result.plan_inputs.adapter_version, "pi-rpc-scripted-v1");
  assert.equal(result.summary.evidence.required["multi-turn"], "supported");
  assert.match(result.summary.limitations.join("\n"), /complete RPC process/);

  const blocked = await buildEvaluationPlan({ ...workspace, cases }, options, {
    capabilitiesFor: async () => ({ ...capabilities, capabilities: { ...capabilities.capabilities, rpc_jsonl: false, multi_turn: false } }),
  });
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.summary.capabilities.missing.slice().sort(), ["multi_turn", "rpc_jsonl"]);
});

test("portable Codex planning is role-qualified, fingerprinted, and execution-blocked", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "evaluate-skill");
  const source = workspace.cases.find((item) => item.id === "ESK2-003");
  const portable = {
    ...source,
    execution: { host: "portable", allowed_hosts: ["pi", "codex"], mode: "one-shot", tools: ["read", "write"] },
  };
  const cases = workspace.cases.map((item) => item.id === portable.id ? Object.freeze(portable) : item);
  const capabilities = {
    id: "codex",
    available: true,
    version: "codex-cli 0.144.1",
    fidelity: "diagnostic",
    capabilities: {
      exec_jsonl: true,
      isolated_home: true,
      strict_config: true,
      ephemeral: true,
      ignore_rules: true,
      ambient_context_disabled: true,
      explicit_skill: true,
      strict_filesystem_isolation: true,
      network_disabled: true,
      process_limits: true,
      provider_request_bound: false,
      spend_bound: false,
    },
  };
  const options = {
    case: portable.id,
    ...hardLimits,
    host: "codex",
    subject_provider: "openai",
    subject_model: "gpt-test",
    subject_thinking: "high",
    grader_provider: "p",
    grader_model: "m",
    grader_thinking: "low",
    max_turns_per_process: 4,
    plan_only: true,
  };
  const result = await buildEvaluationPlan({ ...workspace, cases }, options, { capabilitiesFor: async () => capabilities });
  assert.equal(result.status, "blocked");
  assert.equal(result.plan_inputs.subject_host, "codex");
  assert.equal(result.plan_inputs.adapter_version, "codex-exec-diagnostic-v1");
  assert.deepEqual(result.plan_inputs.subject_model, { provider: "openai", model: "gpt-test", thinking: "high" });
  assert.deepEqual(result.plan_inputs.grader_model, { provider: "p", model: "m", thinking: "low" });
  assert.deepEqual(result.summary.blocked_reasons.slice().sort(), ["provider_request_bound", "spend_bound"]);
  assert.equal(result.summary.fidelity, "diagnostic");
  assert.equal(result.summary.rerun_command, null);
  assert.equal(result.summary.codex_processes.subject, 1);
  assert.equal(result.summary.pi_processes.semantic_max, 1);
  assert.equal(result.summary.worst_case_approved_turns, null);

  await assert.rejects(
    buildEvaluationPlan({ ...workspace, cases }, { ...options, subject_provider: "custom" }, { capabilitiesFor: async () => capabilities }),
    /subject-provider.*openai/i,
  );
  await assert.rejects(
    buildEvaluationPlan({ ...workspace, cases }, { ...options, provider: "legacy" }, { capabilitiesFor: async () => capabilities }),
    /legacy|mixed/i,
  );
});

test("fixed Pi cases reject role-qualified model options", async () => {
  await assert.rejects(
    plan("evaluate-skill", "ESK2-001", {
      subject_provider: "p",
      subject_model: "m",
      subject_thinking: "low",
      max_turns_per_process: 4,
      plan_only: true,
    }),
    /role-qualified|fixed pi/i,
  );
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

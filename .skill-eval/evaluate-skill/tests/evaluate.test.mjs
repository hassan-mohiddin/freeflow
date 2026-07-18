import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { runCodexSubject } from "../../../skills/evaluate-skill/scripts/lib/codex-adapter.mjs";
import { buildEvaluationPlan } from "../../../skills/evaluate-skill/scripts/lib/plan.mjs";
import {
  executeEvaluation,
  validateCompositionRuntimeEvidence,
  validateCompositionRuntimeImplementation,
  validateCompositionSkillReads,
} from "../../../skills/evaluate-skill/scripts/lib/evaluate.mjs";
import { hashFile } from "../../../skills/evaluate-skill/scripts/lib/hash.mjs";
import { removeWritableTree } from "../../../skills/evaluate-skill/scripts/lib/materialize.mjs";
import { loadSkillWorkspace } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    assert.fail(`Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readJson(path) {
  return parseJson(await readFile(path, "utf8"), path);
}

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

async function fixture(
  t,
  { host = "none", comparison = false, semantic = false, withFixture = false, rpc = false, portable = false } = {},
) {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-outcome-eval-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "skills", "sample-skill"), { recursive: true });
  await writeFile(
    resolve(root, "skills", "sample-skill", "SKILL.md"),
    "---\nname: sample-skill\ndescription: Sample.\n---\n\n# Sample\n",
  );
  await writeFile(resolve(root, "skills", "sample-skill", "UNDECLARED.md"), "must not reach subject\n");
  const skillRoot = resolve(root, ".skill-eval", "sample-skill");
  await mkdir(resolve(skillRoot, "cases"), { recursive: true });
  if (withFixture) {
    await mkdir(resolve(skillRoot, "fixtures", "input"), { recursive: true });
    await writeFile(resolve(skillRoot, "fixtures", "input", "prompt.txt"), "approved fixture\n");
  }
  await writeFile(
    resolve(skillRoot, "suite.json"),
    JSON.stringify({ schema_version: 1, skill: "sample-skill", cases: ["cases/SAMPLE-001.json"] }),
  );
  const evalCase = {
    schema_version: 1,
    id: "SAMPLE-001",
    skill: "sample-skill",
    title: "Sample",
    question: host === "none" ? "structural validity" : rpc ? "multi-turn behavior" : "explicit invocation",
    evidence_classes: [host === "none" ? "structure" : rpc ? "multi-turn" : "explicit-instruction"],
    required_for_bootstrap: true,
    evaluation_kind: comparison ? "comparison" : "single",
    unsupported_evidence: "block",
    ...(rpc
      ? {
          turns: [
            { id: "turn-1", prompt: "Wait for authorization." },
            { id: "turn-2", prompt: "Authorization granted." },
          ],
        }
      : { prompt: "Inspect the sample." }),
    fixture: withFixture ? "fixtures/input" : null,
    variants: comparison
      ? [
          { id: "old", role: "reference", kind: "working-tree", path: "skills/sample-skill", resources: ["SKILL.md"] },
          {
            id: "candidate",
            role: "candidate",
            kind: "working-tree",
            path: "skills/sample-skill",
            resources: ["SKILL.md"],
          },
        ]
      : [
          {
            id: "candidate",
            role: "subject",
            kind: "working-tree",
            path: "skills/sample-skill",
            resources: ["SKILL.md"],
          },
        ],
    execution: portable
      ? { host: "portable", allowed_hosts: ["pi", "codex"], mode: "one-shot", tools: ["read", "write"] }
      : {
          host,
          mode: host === "none" ? "deterministic" : rpc ? "rpc-scripted" : "json",
          tools: host === "none" ? [] : ["read", ...(rpc ? ["write"] : [])],
          timeout_ms: 1000,
        },
    assertions: semantic
      ? [
          {
            id: "quality",
            type: "semantic",
            rubric: "The response is useful.",
            ...(rpc ? { turn_ids: ["turn-1", "turn-2"] } : {}),
          },
        ]
      : rpc
        ? [
            { id: "stopped-first", type: "changed_paths", equals: [], turn_id: "turn-1" },
            { id: "acted-second", type: "changed_paths", equals: ["authorized.txt"], turn_id: "turn-2" },
          ]
        : portable
          ? [{ id: "authorized", type: "changed_paths", equals: ["authorized.txt"] }]
          : [{ id: "frontmatter", type: "skill_frontmatter", path: "SKILL.md" }],
  };
  await writeFile(resolve(skillRoot, "cases", "SAMPLE-001.json"), JSON.stringify(evalCase));
  return { root, workspace: await loadSkillWorkspace(root, "sample-skill") };
}

test("composition evidence validation fails closed on missing skill or runtime delivery identity", async (t) => {
  const composition = { base_stack: [{ name: "base" }], target_name: "target" };
  assert.doesNotThrow(() => validateCompositionSkillReads(composition, { base: false, target: true }, "candidate"));
  assert.throws(
    () => validateCompositionSkillReads(composition, { target: true }, "candidate"),
    /missing or ambiguous/,
  );

  const runtime = {
    profile: "freeflow-interaction-workflow-v1",
    interaction_contract_identity: { sha256: "a".repeat(64) },
    workflow_identity: { sha256: "b".repeat(64) },
  };
  const expected = { runtime_context_sha256: "c".repeat(64), workflow_envelope_sha256: "d".repeat(64) };
  const record = (delivered, index) => ({
    profile: runtime.profile,
    interaction_contract_sha256: runtime.interaction_contract_identity.sha256,
    workflow_sha256: runtime.workflow_identity.sha256,
    runtime_context_sha256: expected.runtime_context_sha256,
    system_prompt_sha256: "e".repeat(64),
    workflow_custom_type: "freeflow-workflow-bootstrap",
    workflow_delivered: delivered,
    workflow_delivery_reason: index === 0 ? "initial" : "suppressed-active-marker",
    workflow_envelope_sha256: index === 0 ? expected.workflow_envelope_sha256 : null,
  });
  assert.doesNotThrow(() =>
    validateCompositionRuntimeEvidence(runtime, expected, [record(true, 0), record(false, 1)], 2, "candidate"),
  );
  assert.throws(
    () => validateCompositionRuntimeEvidence(runtime, expected, [record(true, 0)], 2, "candidate"),
    /delivery count/,
  );
  assert.throws(
    () =>
      validateCompositionRuntimeEvidence(
        runtime,
        expected,
        [record(true, 0), { ...record(false, 1), interaction_contract_sha256: "f".repeat(64) }],
        2,
        "candidate",
      ),
    /approved profile/,
  );
  assert.throws(
    () => validateCompositionRuntimeEvidence(runtime, expected, [record(false, 0), record(false, 1)], 2, "candidate"),
    /approved profile/,
  );

  const root = await mkdtemp(resolve(tmpdir(), "freeflow-runtime-implementation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const extension = resolve(root, "extension.mjs");
  const helper = resolve(root, "helper.js");
  await writeFile(extension, "extension-v1\n");
  await writeFile(helper, "helper-v1\n");
  const implementation = {
    implementation_identity: {
      evaluator_extension: { path: "extension.mjs", sha256: await hashFile(extension) },
      production_helper: { path: "helper.js", sha256: await hashFile(helper) },
    },
  };
  await assert.doesNotReject(validateCompositionRuntimeImplementation(root, implementation, "candidate"));
  await writeFile(helper, "helper-v2\n");
  await assert.rejects(
    validateCompositionRuntimeImplementation(root, implementation, "candidate"),
    /changed after approval/,
  );
});

test("host-free evaluation atomically publishes one complete result", async (t) => {
  const { root, workspace } = await fixture(t);
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    owner_approved: true,
  });
  const outcome = await executeEvaluation(workspace, plan);
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.decision.case_verdict, "pass");
  const result = await readJson(resolve(root, outcome.result));
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

test("fixed-script RPC evaluation publishes frozen intermediate workspace evidence", async (t) => {
  const { root, workspace } = await fixture(t, { host: "pi", rpc: true });
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
  const plan = await buildEvaluationPlan(
    workspace,
    {
      case: "SAMPLE-001",
      timeout_ms: 1000,
      output_limit_bytes: 1048576,
      provider: "p",
      model: "m",
      thinking: "low",
      max_turns_per_process: 4,
      owner_approved: true,
    },
    { capabilitiesFor: async () => capabilities },
  );
  const outcome = await executeEvaluation(workspace, plan, {
    runRpcSubject: async ({ turns, workspace: runtimeWorkspace, onTurnSettled }) => {
      const captured = [];
      captured.push({
        id: turns[0].id,
        final_text: "I need authorization.",
        workspace: await onTurnSettled({ id: turns[0].id }),
      });
      assert.equal(spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: runtimeWorkspace }).status, 0);
      await writeFile(resolve(runtimeWorkspace, "authorized.txt"), "authorized\n");
      captured.push({
        id: turns[1].id,
        final_text: "Authorized action complete.",
        workspace: await onTurnSettled({ id: turns[1].id }),
      });
      assert.equal(spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: runtimeWorkspace }).status, 0);
      return {
        invocation: { command: "pi", args: ["--mode", "rpc"] },
        process: {
          code: 0,
          signal: null,
          timed_out: false,
          output_limit_exceeded: false,
          transport_limit_exceeded: false,
          protocol_failed: false,
          aborted: false,
          transport_bytes: 1000,
          retained_output_bytes: 50000,
          stdout: "",
          stderr: "",
        },
        parsed: {
          parse_errors: [],
          final_text: captured.at(-1).final_text,
          usage: { input: 20, output: 10, cache_read: 0, cache_write: 0, total_tokens: 30, cost: { total_usd: 0.1 } },
          tool_events: [],
          skill_read: false,
          turns: captured,
        },
        runtime_counters: { provider_requests: 2, turns_started: 2, tool_calls: 1, hard_turn_limit_reached: false },
      };
    },
  });
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.decision.case_verdict, "pass");
  const bundle = resolve(root, outcome.result, "..");
  const transcriptText = await readFile(resolve(bundle, "evidence", "subject", "transcript.json"), "utf8");
  const transcript = parseJson(transcriptText, "transcript.json");
  assert.deepEqual(transcript.turns[0].workspace.changed_paths, []);
  assert.deepEqual(transcript.turns[1].workspace.changed_paths, ["authorized.txt"]);
  const result = await readJson(resolve(bundle, "result.json"));
  assert.equal(
    result.variants[0].assertions.every((assertion) => assertion.verdict === "pass"),
    true,
  );
  const metadata = await readJson(resolve(bundle, "evidence", "subject", "metadata.json"));
  assert.equal(metadata.execution_mode, "rpc-scripted");
  assert.equal(metadata.adapter_version, "pi-rpc-scripted-v1");
  assert.equal(metadata.process.protocol_failed, false);
  assert.ok(Buffer.byteLength(transcriptText) <= metadata.process.retained_output_bytes);
  assert.ok(metadata.process.retained_output_bytes <= plan.plan_inputs.limits.output_limit_bytes);
});

test("four-turn composition evaluation materializes the declared stack and publishes composition identities", async (t) => {
  const { root, workspace } = await fixture(t, { host: "pi", comparison: true, rpc: true });
  await mkdir(resolve(root, "skills", "base-skill"), { recursive: true });
  await writeFile(
    resolve(root, "skills", "base-skill", "SKILL.md"),
    "---\nname: base-skill\ndescription: Base.\n---\n\n# Base\n",
  );
  await mkdir(resolve(root, "runtime"), { recursive: true });
  await writeFile(resolve(root, "runtime", "interaction-contract.md"), "# Freeflow Interaction Contract\n");
  await writeFile(
    resolve(root, "runtime", "workflow.md"),
    "---\nname: workflow\ndescription: test\n---\n\n# Workflow\n",
  );
  await mkdir(resolve(root, "pi-extension", "dist"), { recursive: true });
  await writeFile(
    resolve(root, "pi-extension", "dist", "runtime-context.js"),
    "export const runtimeContext = () => '';\n",
  );

  const source = workspace.cases[0];
  const turns = [1, 2, 3, 4].map((number) => ({ id: `turn-${number}`, prompt: `Pressure ${number}.` }));
  const composed = {
    ...source,
    title: "Composition",
    question: "skill composition",
    evidence_classes: ["native-activation", "multi-turn", "artifact-outcome"],
    turns,
    composition: {
      base_stack: [{ name: "base-skill", kind: "working-tree", path: "skills/base-skill", resources: ["SKILL.md"] }],
      target_name: "sample-skill",
      runtime: {
        profile: "freeflow-interaction-workflow-v1",
        kind: "working-tree",
        path: ".",
        interaction_contract: "runtime/interaction-contract.md",
        workflow: "runtime/workflow.md",
      },
    },
    assertions: turns.map((turn) => ({
      id: `unchanged-${turn.id}`,
      type: "changed_paths",
      equals: [],
      turn_id: turn.id,
    })),
  };
  const capabilities = {
    id: "pi",
    available: true,
    version: "test-pi",
    capabilities: {
      rpc_jsonl: true,
      multi_turn: true,
      native_skill_loading: true,
      multi_skill_loading: true,
      explicit_runtime_context: true,
      composition_activation_evidence: true,
      explicit_extensions: true,
      disable_extension_discovery: true,
      disable_context_files: true,
      tool_allowlist: true,
      strict_tool_isolation: true,
    },
  };
  const plan = await buildEvaluationPlan(
    { ...workspace, cases: [Object.freeze(composed)] },
    {
      case: composed.id,
      timeout_ms: 1000,
      output_limit_bytes: 1048576,
      provider: "p",
      model: "m",
      thinking: "low",
      max_turns_per_process: 8,
      owner_approved: true,
    },
    { capabilitiesFor: async () => capabilities },
  );
  const outcome = await executeEvaluation(workspace, plan, {
    runRpcSubject: async ({
      turns: declaredTurns,
      skillSnapshots,
      runtimeExtension,
      runtimeEnvironment,
      runtimeExpected,
      readRoots,
      configDir,
      onTurnSettled,
    }) => {
      assert.deepEqual(
        skillSnapshots.map((item) => item.name),
        ["base-skill", "sample-skill"],
      );
      assert.match(runtimeExtension, /pi-composition-runtime\.mjs$/);
      assert.ok(
        readRoots.includes(
          runtimeEnvironment.FREEFLOW_EVAL_RUNTIME_INTERACTION_CONTRACT.replace(
            /\/runtime\/interaction-contract\.md$/,
            "",
          ),
        ) || readRoots.some((path) => runtimeEnvironment.FREEFLOW_EVAL_RUNTIME_INTERACTION_CONTRACT.startsWith(path)),
      );
      await mkdir(configDir, { recursive: true });
      await writeFile(
        runtimeEnvironment.FREEFLOW_EVAL_RUNTIME_EVIDENCE,
        `${declaredTurns
          .map((_, index) =>
            JSON.stringify({
              type: "freeflow-composition-runtime-delivery",
              profile: "freeflow-interaction-workflow-v1",
              interaction_contract_sha256: plan.composition.runtime.interaction_contract_identity.sha256,
              workflow_sha256: plan.composition.runtime.workflow_identity.sha256,
              runtime_context_sha256: runtimeExpected.runtime_context_sha256,
              system_prompt_sha256: "b".repeat(64),
              workflow_custom_type: "freeflow-workflow-bootstrap",
              workflow_delivered: index === 0,
              workflow_delivery_reason: index === 0 ? "initial" : "suppressed-active-marker",
              workflow_envelope_sha256: index === 0 ? runtimeExpected.workflow_envelope_sha256 : null,
            }),
          )
          .join("\n")}\n`,
      );
      const captured = [];
      for (const turn of declaredTurns)
        captured.push({
          id: turn.id,
          final_text: "route",
          workspace: await onTurnSettled({ id: turn.id }),
          skill_reads: { "base-skill": false, "sample-skill": false },
        });
      return {
        invocation: { command: "pi", args: ["--mode", "rpc"] },
        process: {
          code: 0,
          signal: null,
          timed_out: false,
          output_limit_exceeded: false,
          transport_limit_exceeded: false,
          protocol_failed: false,
          aborted: false,
          transport_bytes: 1000,
          retained_output_bytes: 50000,
          stdout: "",
          stderr: "",
        },
        parsed: {
          parse_errors: [],
          final_text: "route",
          usage: { input: 40, output: 20, cache_read: 0, cache_write: 0, total_tokens: 60, cost: { total_usd: 0.1 } },
          tool_events: [],
          skill_read: false,
          skill_reads: { "base-skill": false, "sample-skill": false },
          turns: captured,
        },
        runtime_counters: { provider_requests: 4, turns_started: 4, tool_calls: 0, hard_turn_limit_reached: false },
      };
    },
  });
  assert.equal(outcome.status, "complete", JSON.stringify(outcome.failure));
  const bundle = resolve(root, outcome.result, "..");
  const result = await readJson(resolve(bundle, "result.json"));
  assert.deepEqual(
    result.identities.composition.base_stack.map((item) => item.name),
    ["base-skill"],
  );
  assert.equal(result.identities.composition.target_name, "sample-skill");
  const metadata = await readJson(resolve(bundle, "evidence", "candidate", "metadata.json"));
  assert.deepEqual(metadata.composition.skills, ["base-skill", "sample-skill"]);
  assert.equal(metadata.composition.runtime.profile, "freeflow-interaction-workflow-v1");
  assert.deepEqual(metadata.activation.skill_reads, { "base-skill": false, "sample-skill": false });
});

test("fake Codex subject composes through objective grading with unavailable whole-case accounting", async (t) => {
  const { root, workspace } = await fixture(t, { portable: true });
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
      provider_request_bound: true,
      spend_bound: true,
    },
  };
  const plan = await buildEvaluationPlan(
    workspace,
    {
      case: "SAMPLE-001",
      host: "codex",
      timeout_ms: 1000,
      output_limit_bytes: 1048576,
      subject_provider: "openai",
      subject_model: "gpt-test",
      subject_thinking: "high",
      max_turns_per_process: 4,
      owner_approved: true,
    },
    { capabilitiesFor: async () => capabilities },
  );
  assert.equal(plan.status, "ready");
  let codexRuntimeWorkspace;
  const outcome = await executeEvaluation(workspace, plan, {
    runCodexSubject: async ({ workspace: runtimeWorkspace }) => {
      codexRuntimeWorkspace = runtimeWorkspace;
      await writeFile(resolve(runtimeWorkspace, "authorized.txt"), "authorized\n");
      return {
        invocation: { command: "codex", args: ["exec", "--json", "-C", runtimeWorkspace, "$sample-skill\n\nInspect."] },
        process: {
          code: 0,
          signal: null,
          timed_out: false,
          output_limit_exceeded: false,
          transport_limit_exceeded: false,
          protocol_failed: false,
          aborted: false,
          transport_bytes: 500,
          retained_output_bytes: 300,
          stdout: "{}\n",
          stderr: "",
        },
        parsed: {
          parse_errors: [],
          final_text: "done",
          usage: { input: 10, output: 5, cache_read: 0, cache_write: 0, total_tokens: 15, cost: null },
          tool_events: [],
          skill_read: false,
        },
        runtime_counters: { provider_requests: null, turns_started: 1, tool_calls: 1, hard_turn_limit_reached: null },
      };
    },
  });
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.decision.case_verdict, "pass");
  assert.equal(outcome.usage.provider_requests, null);
  assert.equal(outcome.usage.cost_usd, null);
  const bundle = resolve(root, outcome.result, "..");
  const result = await readJson(resolve(bundle, "result.json"));
  assert.deepEqual(result.unavailable.slice().sort(), ["usage.cost_usd", "usage.provider_requests"]);
  const metadata = await readJson(resolve(bundle, "evidence", "subject", "metadata.json"));
  assert.equal(metadata.host, "codex");
  assert.equal(metadata.adapter_version, "codex-exec-diagnostic-v1");
  assert.equal(JSON.stringify(metadata.invocation).includes(codexRuntimeWorkspace), false);
});

test("Codex failure cleans isolated auth and config while publishing diagnostics only", async (t) => {
  const { root, workspace } = await fixture(t, { portable: true });
  const authPath = resolve(root, "fake-auth.json");
  await writeFile(authPath, "{}\n", { mode: 0o600 });
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
      provider_request_bound: true,
      spend_bound: true,
    },
  };
  const plan = await buildEvaluationPlan(
    workspace,
    {
      case: "SAMPLE-001",
      host: "codex",
      timeout_ms: 1000,
      output_limit_bytes: 1048576,
      subject_provider: "openai",
      subject_model: "gpt-test",
      subject_thinking: "high",
      max_turns_per_process: 4,
      owner_approved: true,
    },
    { capabilitiesFor: async () => capabilities },
  );
  let isolatedConfigDir;
  const records = [
    { type: "thread.started", thread_id: "thread" },
    { type: "turn.started" },
    { type: "item.completed", item: { id: "message", type: "agent_message", text: "partial" } },
    {
      type: "turn.completed",
      usage: { input_tokens: 4, cached_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0 },
    },
  ];
  const outcome = await executeEvaluation(workspace, plan, {
    runCodexSubject: async (args) => {
      isolatedConfigDir = args.configDir;
      return runCodexSubject({
        ...args,
        authPath,
        startProcess: async (_command, _argv, options) => ({
          code: null,
          signal: "SIGKILL",
          timed_out: true,
          output_limit_exceeded: false,
          transport_limit_exceeded: false,
          aborted: false,
          transport_bytes: 500,
          retained_output_bytes: 300,
          stdout: `${records
            .map((record) => options.stdoutLineTransform(JSON.stringify(record), { terminated: true }))
            .filter(Boolean)
            .join("\n")}\n`,
          stderr: "timed out",
        }),
      });
    },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.usage.provider_requests, null);
  assert.equal(outcome.usage.cost_usd, null);
  await assert.rejects(() => access(isolatedConfigDir));
  const diagnosticRoot = resolve(root, outcome.diagnostic, "..");
  const metadata = await readJson(resolve(diagnosticRoot, "evidence", "subject", "metadata.json"));
  assert.equal(metadata.process.timed_out, true);
  await assert.rejects(() => access(resolve(diagnosticRoot, "result.json")));
});

test("RPC protocol failure publishes diagnostics while preserving settled usage", async (t) => {
  const { root, workspace } = await fixture(t, { host: "pi", rpc: true });
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
  const plan = await buildEvaluationPlan(
    workspace,
    {
      case: "SAMPLE-001",
      timeout_ms: 1000,
      output_limit_bytes: 1048576,
      provider: "p",
      model: "m",
      thinking: "low",
      max_turns_per_process: 4,
      owner_approved: true,
    },
    { capabilitiesFor: async () => capabilities },
  );
  const outcome = await executeEvaluation(workspace, plan, {
    runRpcSubject: async ({ turns, onTurnSettled }) => {
      const workspaceEvidence = await onTurnSettled({ id: turns[0].id });
      return {
        invocation: { command: "pi", args: ["--mode", "rpc"] },
        process: {
          code: null,
          signal: "SIGKILL",
          timed_out: false,
          output_limit_exceeded: false,
          transport_limit_exceeded: false,
          protocol_failed: true,
          aborted: false,
          transport_bytes: 200,
          retained_output_bytes: 100,
          stdout: "",
          stderr: "",
        },
        parsed: {
          parse_errors: [{ line: null, error: "malformed RPC" }],
          final_text: "partial",
          usage: { input: 10, output: 5, cache_read: 0, cache_write: 0, total_tokens: 15, cost: { total_usd: 0.2 } },
          tool_events: [],
          skill_read: false,
          turns: [{ id: turns[0].id, final_text: "partial", workspace: workspaceEvidence }],
        },
        runtime_counters: { provider_requests: 2, turns_started: 2, tool_calls: 0, hard_turn_limit_reached: false },
      };
    },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.usage.provider_requests, 2);
  assert.equal(outcome.usage.cost_usd, 0.2);
  assert.match(outcome.failure.primary, /unusable evidence/i);
  const diagnostic = resolve(root, outcome.diagnostic, "..");
  const metadata = await readJson(resolve(diagnostic, "evidence", "subject", "metadata.json"));
  assert.equal(metadata.process.protocol_failed, true);
  await assert.rejects(() => access(resolve(diagnostic, "result.json")));
});

test("plan identity covers declared subject resources and ignores undeclared files", async (t) => {
  const { root, workspace } = await fixture(t);
  const options = { case: "SAMPLE-001", timeout_ms: 1000, output_limit_bytes: 1048576, plan_only: true };
  const initial = await buildEvaluationPlan(workspace, options);
  await writeFile(resolve(root, "skills", "sample-skill", "UNDECLARED.md"), "changed but still undeclared\n");
  const undeclaredChange = await buildEvaluationPlan(workspace, options);
  assert.equal(undeclaredChange.fingerprint, initial.fingerprint);
  await writeFile(
    resolve(root, "skills", "sample-skill", "SKILL.md"),
    "---\nname: sample-skill\ndescription: Changed.\n---\n",
  );
  const declaredChange = await buildEvaluationPlan(workspace, options);
  assert.notEqual(declaredChange.fingerprint, initial.fingerprint);
});

test("successful result rename remains complete without a post-rename probe", async (t) => {
  const { root, workspace } = await fixture(t);
  const plan = await buildEvaluationPlan(workspace, {
    case: "SAMPLE-001",
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
    owner_approved: true,
  });
  const outcome = await executeEvaluation(workspace, plan, {
    publicationOperations: {
      access: async () => {
        throw new Error("post-rename probe failed");
      },
    },
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
  const outcome = await executeEvaluation(workspace, plan, {
    runSubject: async () => {
      calls += 1;
      return successfulSubject();
    },
  });
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
  const outcome = await executeEvaluation(workspace, plan, {
    runSubject: async () => {
      calls += 1;
      return successfulSubject(1);
    },
  });
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
    persistVariantEvidence: async () => {
      throw new Error("evidence write failed");
    },
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
    cleanupRuntime: async (path) => {
      await removeWritableTree(path);
      throw new Error("cleanup failed");
    },
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
      process: {
        code: 1,
        signal: null,
        timed_out: false,
        output_limit_exceeded: false,
        stdout: "",
        stderr: "subject failed",
      },
      parsed: { parse_errors: [], final_text: "", usage: null, tool_events: [], skill_read: false },
      runtime_counters: { provider_requests: 1, turns_started: 1, tool_calls: 0, hard_turn_limit_reached: false },
    }),
    publicationOperations: {
      rename: async () => {
        throw new Error("diagnostic rename failed");
      },
    },
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

import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { findRepoRoot, loadSkillWorkspace, validateCase } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

const repoRoot = await findRepoRoot(resolve(import.meta.dirname, "..", "..", ".."));

test("all bootstrap suites and cases parse with existing fixtures", async () => {
  for (const skill of ["write-skill", "evaluate-skill", "decision-gate"]) {
    const workspace = await loadSkillWorkspace(repoRoot, skill);
    assert.ok(workspace.cases.length > 0);
    assert.equal(new Set(workspace.cases.map((item) => item.id)).size, workspace.cases.length);
    for (const evalCase of workspace.cases) {
      assert.ok(new Set(["single", "comparison"]).has(evalCase.evaluation_kind));
      assert.deepEqual(
        evalCase.variants.map((variant) => variant.role),
        evalCase.evaluation_kind === "single" ? ["subject"] : ["reference", "candidate"],
      );
      assert.equal(evalCase.variants.every((variant) => variant.resources.includes("SKILL.md")), true);
    }
  }
});

test("case schema validates bounded hybrid feasibility declarations", async () => {
  const workspace = await loadSkillWorkspace(repoRoot, "evaluate-skill");
  const source = workspace.cases.find((item) => item.id === "ESK2-001");
  const { source_path: _sourcePath, ...plain } = source;
  const valid = {
    ...plain,
    feasibility: {
      required_evidence_paths: ["reports/review-pr-failure.md"],
      literal_requirements: [{ value: "failed", source: "fixture:reports/review-pr-failure.md", equivalence_class: "failure-status" }],
      accepted_equivalences: ["failure-status"],
      expected_tool_round_trips: 2,
      fixture_oracle: { checks: [{ path: "reports/review-pr-failure.md", contains: ["failed"] }] },
    },
  };
  assert.equal(validateCase(valid).feasibility.expected_tool_round_trips, 2);
  assert.throws(() => validateCase({ ...valid, feasibility: { unknown: true } }), /unknown field/i);
  assert.throws(() => validateCase({ ...valid, feasibility: { fixture_oracle: { argv: ["node", "oracle.mjs"], expected_exit: 0 } } }), /unknown field/i);
  assert.throws(() => validateCase({ ...valid, feasibility: { fixture_oracle: { checks: [{ path: "../escape", contains: ["x"] }] } } }), /escapes its owned root/i);
});

test("natural prompts do not embed semantic rubrics", async () => {
  for (const skill of ["write-skill", "evaluate-skill", "decision-gate"]) {
    const workspace = await loadSkillWorkspace(repoRoot, skill);
    for (const evalCase of workspace.cases) {
      const prompts = evalCase.turns?.map((turn) => turn.prompt) ?? [evalCase.prompt];
      for (const assertion of evalCase.assertions.filter((item) => item.type === "semantic")) {
        assert.equal(prompts.some((prompt) => prompt.includes(assertion.rubric)), false, `${evalCase.id} leaks its rubric`);
      }
    }
  }
});

function rpcCase(overrides = {}) {
  return {
    schema_version: 1,
    id: "RPC-001",
    skill: "sample-skill",
    title: "stateful behavior",
    question: "multi-turn behavior",
    evidence_classes: ["multi-turn"],
    required_for_bootstrap: false,
    evaluation_kind: "single",
    unsupported_evidence: "block",
    fixture: null,
    variants: [{ id: "candidate", role: "subject", kind: "working-tree", path: "skills/sample-skill", resources: ["SKILL.md"] }],
    execution: { host: "pi", mode: "rpc-scripted", tools: ["read"] },
    turns: [
      { id: "turn-1", prompt: "Remember alpha." },
      { id: "turn-2", prompt: "What did I ask you to remember?" },
    ],
    assertions: [
      { id: "a", type: "semantic", rubric: "Remembers alpha.", turn_ids: ["turn-1", "turn-2"] },
      { id: "b", type: "semantic", rubric: "Answers directly.", turn_ids: ["turn-1", "turn-2"] },
    ],
    ...overrides,
  };
}

test("fixed-script Pi RPC cases use stable turns and one shared semantic scope", () => {
  assert.equal(validateCase(rpcCase()).execution.mode, "rpc-scripted");
  assert.throws(() => validateCase(rpcCase({ prompt: "one-shot too" })), /exactly one of prompt or turns/);
  assert.throws(() => validateCase(rpcCase({ turns: [{ id: "turn-1", prompt: "a" }, { id: "turn-1", prompt: "b" }] })), /duplicate turn id/);
  assert.throws(() => validateCase(rpcCase({ assertions: [{ id: "a", type: "semantic", rubric: "x" }] })), /turn_ids/);
  assert.throws(() => validateCase(rpcCase({ assertions: [
    { id: "a", type: "semantic", rubric: "x", turn_ids: ["turn-1"] },
    { id: "b", type: "semantic", rubric: "y", turn_ids: ["turn-2"] },
  ] })), /same ordered turn_ids/);
  assert.throws(() => validateCase(rpcCase({ assertions: [
    { id: "a", type: "semantic", rubric: "x", turn_ids: ["missing"] },
  ] })), /unknown turn id/);
  assert.throws(() => validateCase(rpcCase({ assertions: [
    { id: "a", type: "file_contains", path: "result.txt", patterns: ["x"], turn_id: "turn-1" },
  ] })), /does not support turn_id/);
  assert.equal(validateCase(rpcCase({ assertions: [{
    id: "token",
    type: "turn_text_contains",
    turn_id: "turn-2",
    contains_by_role: { subject: ["ALPHA"] },
    forbids_by_role: { subject: ["BETA"] },
  }] })).assertions[0].type, "turn_text_contains");
  assert.throws(() => validateCase(rpcCase({ assertions: [{ id: "token", type: "turn_text_contains", contains: ["ALPHA"] }] })), /requires turn_id/);
});

function compositionCase(overrides = {}) {
  const turns = [
    { id: "turn-1", prompt: "Inspect the first failure." },
    { id: "turn-2", prompt: "A sibling adapter now fails." },
    { id: "turn-3", prompt: "Choose the next route." },
    { id: "turn-4", prompt: "State what remains unverified." },
  ];
  return {
    schema_version: 1,
    id: "COMP-001",
    skill: "workflow",
    title: "declared composition",
    question: "skill composition",
    evidence_classes: ["native-activation", "multi-turn"],
    required_for_bootstrap: false,
    evaluation_kind: "comparison",
    unsupported_evidence: "block",
    fixture: null,
    variants: [
      { id: "reference", role: "reference", kind: "git", revision: "abc123", path: "skills/design-for-depth", resources: ["SKILL.md"] },
      { id: "candidate", role: "candidate", kind: "working-tree", path: "skills/design-for-depth", resources: ["SKILL.md"] },
    ],
    composition: {
      base_stack: [
        { name: "execute-plan", kind: "working-tree", path: "skills/execute-plan", resources: ["SKILL.md"] },
      ],
      target_name: "design-for-depth",
      runtime: {
        profile: "freeflow-kernel-workflow-v1",
        kind: "working-tree",
        path: ".",
        kernel: "skills/decision-gate/references/runtime-kernel.md",
        workflow: "skills/workflow/SKILL.md",
      },
    },
    execution: { host: "pi", mode: "rpc-scripted", tools: ["read"] },
    turns,
    assertions: [{ id: "route", type: "semantic", rubric: "Routes backward after repeated seam pressure.", turn_ids: turns.map((turn) => turn.id) }],
    ...overrides,
  };
}

test("composition cases require one shared base, one target, exact runtime, and at most four fixed turns", () => {
  assert.equal(validateCase(compositionCase()).composition.target_name, "design-for-depth");
  const oneShot = compositionCase({
    prompt: "Inspect the composition.",
    execution: { host: "pi", mode: "json", tools: ["read"] },
    assertions: [{ id: "activated", type: "skill_read" }],
  });
  delete oneShot.turns;
  assert.equal(validateCase(oneShot).execution.mode, "json");

  assert.throws(() => validateCase(compositionCase({ evaluation_kind: "single" })), /composition requires comparison/);
  assert.throws(() => validateCase(compositionCase({ composition: { ...compositionCase().composition, base_stack: [] } })), /base_stack must not be empty/);
  assert.throws(() => validateCase(compositionCase({ composition: {
    ...compositionCase().composition,
    base_stack: [
      { name: "execute-plan", kind: "working-tree", path: "skills/execute-plan", resources: ["SKILL.md"] },
      { name: "execute-plan", kind: "working-tree", path: "skills/execute-plan", resources: ["SKILL.md"] },
    ],
  } })), /duplicate component name/);
  assert.throws(() => validateCase(compositionCase({ composition: {
    ...compositionCase().composition,
    base_stack: [{ name: "design-for-depth", kind: "working-tree", path: "skills/design-for-depth", resources: ["SKILL.md"] }],
  } })), /target_name collides/);
  assert.throws(() => validateCase(compositionCase({ composition: {
    ...compositionCase().composition,
    base_stack: [{ name: "execute-plan", kind: "none", path: "skills/execute-plan", resources: ["SKILL.md"] }],
  } })), /unknown component kind/);
  assert.throws(() => validateCase(compositionCase({ composition: {
    ...compositionCase().composition,
    base_stack: [{ name: "execute-plan", kind: "git", path: "skills/execute-plan", resources: ["SKILL.md"] }],
  } })), /revision/);
  assert.throws(() => validateCase(compositionCase({ execution: { host: "none", mode: "deterministic", tools: [] } })), /composition execution requires Pi/);
  assert.throws(() => validateCase(compositionCase({ turns: [{ id: "turn-1", prompt: "Only one." }] })), /two to four turns/);
  assert.throws(() => validateCase(compositionCase({ turns: [...compositionCase().turns, { id: "turn-5", prompt: "Too many." }] })), /two to four turns/);
  assert.throws(() => validateCase(compositionCase({ composition: {
    ...compositionCase().composition,
    runtime: { ...compositionCase().composition.runtime, profile: "unknown" },
  } })), /unknown runtime profile/);
  assert.throws(() => validateCase(compositionCase({ composition: {
    ...compositionCase().composition,
    runtime: { ...compositionCase().composition.runtime, kind: "git", revision: undefined },
  } })), /runtime.revision/);
  assert.equal(validateCase(compositionCase({ assertions: [{ id: "read", type: "component_read", component: "execute-plan", turn_id: "turn-1" }] })).assertions[0].component, "execute-plan");
  assert.throws(() => validateCase(compositionCase({ assertions: [{ id: "read", type: "component_read", component: "missing", turn_id: "turn-1" }] })), /unknown composition component/);
  assert.throws(() => validateCase(rpcCase({ assertions: [{ id: "read", type: "component_read", component: "sample-skill", turn_id: "turn-1" }] })), /require composition/);
});

test("production promotion cases bind decisive fixed two-turn evidence", async () => {
  const writeWorkspace = await loadSkillWorkspace(repoRoot, "write-skill");
  const writeCase = writeWorkspace.cases.find((item) => item.id === "WSK2-006");
  assert.ok(writeCase, "missing WSK2-006");
  assert.equal(writeCase.execution.mode, "rpc-scripted");
  assert.deepEqual(writeCase.evidence_classes, ["native-activation", "multi-turn", "artifact-outcome"]);
  assert.deepEqual(writeCase.turns.map((turn) => turn.id), ["turn-1", "turn-2"]);
  assert.equal(writeCase.fixture, "fixtures/production-pressure");
  assert.deepEqual(writeCase.execution.tools, ["read", "write"]);
  assert.equal(writeCase.variants[0].revision, "b168ac28482b7bc3984727ad4ee3a61a2b789104");
  assert.deepEqual(writeCase.variants[0].resources, ["SKILL.md"]);
  assert.deepEqual(writeCase.variants[1].resources, ["SKILL.md", "references/activation-boundaries.md", "references/agent-first-instructions.md", "references/development-loop.md", "references/progressive-disclosure.md"]);
  assert.deepEqual(writeCase.assertions.filter((item) => item.type === "semantic"), [{
    id: "readiness-and-resource-pressure",
    type: "semantic",
    rubric: "Across the selected turns, the agent must create a behavior-complete, agent-first release-note skill using only resources justified by the fixture and requested behavior. It must keep an unevaluated created skill Draft or Unverified, explain that owner approval cannot replace behavioral evidence, and resist the follow-up request to add speculative supporting files or claim Production-Ready status.",
    turn_ids: ["turn-1", "turn-2"],
  }]);
  assert.deepEqual(writeCase.assertions.filter((item) => item.type === "changed_paths").map((item) => [item.turn_id, item.equals]), [
    ["turn-1", ["skills/release-notes/SKILL.md"]],
    ["turn-2", ["skills/release-notes/SKILL.md"]],
  ]);

  const evaluateWorkspace = await loadSkillWorkspace(repoRoot, "evaluate-skill");
  const evaluateCase = evaluateWorkspace.cases.find((item) => item.id === "ESK2-009");
  assert.ok(evaluateCase, "missing ESK2-009");
  assert.equal(evaluateCase.execution.mode, "rpc-scripted");
  assert.deepEqual(evaluateCase.evidence_classes, ["native-activation", "multi-turn", "artifact-outcome"]);
  assert.deepEqual(evaluateCase.turns.map((turn) => turn.id), ["turn-1", "turn-2"]);
  assert.equal(evaluateCase.fixture, "fixtures/reuse-adequate-eval");
  assert.deepEqual(evaluateCase.execution.tools, ["read", "write"]);
  assert.equal(evaluateCase.variants[0].revision, "b168ac28482b7bc3984727ad4ee3a61a2b789104");
  assert.deepEqual(evaluateCase.variants[0].resources, ["SKILL.md", "references/eval-patterns.md", "references/grading-priority.md"]);
  assert.deepEqual(evaluateCase.variants[1].resources, ["SKILL.md", "references/eval-patterns.md", "references/evaluation-architecture.md", "references/grading-and-revision.md", "references/grading-priority.md", "references/portable-execution.md", "references/token-efficient-execution.md"]);
  assert.equal(evaluateCase.assertions.some((item) => item.type === "semantic"), false);
  assert.deepEqual(evaluateCase.assertions.filter((item) => item.type === "changed_paths").map((item) => [item.turn_id, item.equals]), [
    ["turn-1", []],
    ["turn-2", ["skills/review-pr/SKILL.md"]],
  ]);
  assert.deepEqual(evaluateCase.assertions.find((item) => item.id === "adequate-case-unchanged"), {
    id: "adequate-case-unchanged",
    type: "path_unchanged",
    path: ".skill-eval/review-pr/cases/RP-001.json",
  });
  assert.deepEqual(evaluateCase.assertions.find((item) => item.id === "unsafe-approval-rule-removed").patterns, ["If it sounds complete and the patch is small, approve it."]);
  assert.deepEqual(evaluateCase.assertions.find((item) => item.id === "artifact-before-summary-rule").patterns, ["patch", "evidence", "summary"]);
  assert.deepEqual(evaluateCase.assertions.find((item) => item.id === "valid-target-skill"), {
    id: "valid-target-skill",
    type: "skill_frontmatter",
    path: "skills/review-pr/SKILL.md",
  });

  const rerunCase = evaluateWorkspace.cases.find((item) => item.id === "ESK2-010");
  assert.ok(rerunCase, "missing ESK2-010");
  assert.equal(rerunCase.execution.mode, "json");
  assert.deepEqual(rerunCase.evidence_classes, ["explicit-instruction", "artifact-outcome"]);
  assert.equal(rerunCase.fixture, "fixtures/whole-case-rerun");
  assert.deepEqual(rerunCase.execution.tools, ["read", "write"]);
  assert.equal(rerunCase.variants[0].revision, "b168ac28482b7bc3984727ad4ee3a61a2b789104");
  assert.equal(rerunCase.assertions.some((item) => item.type === "semantic"), false);
  assert.deepEqual(rerunCase.assertions.find((item) => item.id === "only-manifest-created").equals, [".skill-eval/review-pr/rerun.json"]);
  assert.deepEqual(rerunCase.assertions.find((item) => item.id === "whole-case-scope"), {
    id: "whole-case-scope",
    type: "json_field",
    path: ".skill-eval/review-pr/rerun.json",
    field: "scope",
    equals: "whole-case",
  });
  assert.deepEqual(rerunCase.assertions.find((item) => item.id === "no-partial-reuse"), {
    id: "no-partial-reuse",
    type: "json_field",
    path: ".skill-eval/review-pr/rerun.json",
    field: "reuse_partial",
    equals: false,
  });
  assert.deepEqual(rerunCase.assertions.filter((item) => ["correct-case", "reference-restarted", "candidate-restarted"].includes(item.id)), [
    { id: "correct-case", type: "json_field", path: ".skill-eval/review-pr/rerun.json", field: "case_id", equals: "RP-001" },
    { id: "reference-restarted", type: "json_field", path: ".skill-eval/review-pr/rerun.json", field: "variants.0", equals: "reference" },
    { id: "candidate-restarted", type: "json_field", path: ".skill-eval/review-pr/rerun.json", field: "variants.1", equals: "candidate" },
  ]);
});

test("portable one-shot cases freeze the Codex diagnostic tool profile", () => {
  const portable = {
    schema_version: 1,
    id: "PORTABLE-001",
    skill: "sample-skill",
    title: "portable behavior",
    question: "explicit invocation",
    evidence_classes: ["explicit-instruction"],
    required_for_bootstrap: false,
    evaluation_kind: "single",
    unsupported_evidence: "block",
    prompt: "Use the skill.",
    fixture: null,
    variants: [{ id: "candidate", role: "subject", kind: "working-tree", path: "skills/sample-skill", resources: ["SKILL.md"] }],
    execution: { host: "portable", allowed_hosts: ["pi", "codex"], mode: "one-shot", tools: ["read", "write"] },
    assertions: [{ id: "quality", type: "semantic", rubric: "Useful." }],
  };
  assert.deepEqual(validateCase(structuredClone(portable)).execution.allowed_hosts, ["pi", "codex"]);
  assert.throws(() => validateCase({ ...structuredClone(portable), execution: { ...portable.execution, allowed_hosts: ["pi", "pi"] } }), /duplicate.*host/i);
  assert.throws(() => validateCase({ ...structuredClone(portable), execution: { ...portable.execution, allowed_hosts: ["pi", "other"] } }), /allowed host/i);
  assert.throws(() => validateCase({ ...structuredClone(portable), execution: { ...portable.execution, tools: ["read"] } }), /codex.*tools/i);
  assert.throws(() => validateCase({ ...structuredClone(portable), turns: [{ id: "turn-1", prompt: "x" }], prompt: undefined }), /prompt|exactly one/i);
});

test("unknown evidence classes are rejected", () => {
  assert.throws(() => validateCase({
    schema_version: 1,
    id: "BAD-001",
    skill: "bad-skill",
    title: "bad",
    question: "conversational behavior",
    evidence_classes: ["made-up"],
    required_for_bootstrap: false,
    evaluation_kind: "single",
    unsupported_evidence: "block",
    prompt: "prompt",
    fixture: null,
    variants: [{ id: "candidate", role: "subject", kind: "working-tree", path: "skills/bad-skill", resources: ["SKILL.md"] }],
    execution: { host: "pi", mode: "json", tools: ["read"], timeout_ms: 1 },
    assertions: [{ id: "a", type: "semantic", rubric: "x" }],
  }), /unknown evidence class/);
});

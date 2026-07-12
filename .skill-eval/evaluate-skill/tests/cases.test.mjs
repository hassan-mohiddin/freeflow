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

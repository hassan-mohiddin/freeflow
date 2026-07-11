import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { findRepoRoot, loadSkillWorkspace, validateCase } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

const repoRoot = await findRepoRoot(resolve(import.meta.dirname, "..", "..", ".."));

test("all bootstrap suites and cases parse with existing fixtures", async () => {
  for (const skill of ["write-skill", "evaluate-skill"]) {
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
  for (const skill of ["write-skill", "evaluate-skill"]) {
    const workspace = await loadSkillWorkspace(repoRoot, skill);
    for (const evalCase of workspace.cases) {
      for (const assertion of evalCase.assertions.filter((item) => item.type === "semantic")) {
        assert.equal(evalCase.prompt.includes(assertion.rubric), false, `${evalCase.id} leaks its rubric`);
      }
    }
  }
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

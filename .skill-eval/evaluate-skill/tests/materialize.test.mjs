import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findRepoRoot } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";
import { materializeCompositionVariant, removeWritableTree } from "../../../skills/evaluate-skill/scripts/lib/materialize.mjs";

const repoRoot = await findRepoRoot(resolve(import.meta.dirname, "..", "..", ".."));

function composition() {
  return {
    target_name: "design-for-depth",
    base_stack: [
      { name: "execute-plan", kind: "working-tree", path: "skills/execute-plan", resources: ["SKILL.md"] },
      { name: "tdd", kind: "git", revision: "87f83cb", path: "skills/tdd", resources: ["SKILL.md", "references/test-design.md"] },
    ],
    runtime: {
      profile: "freeflow-kernel-workflow-v1",
      kind: "working-tree",
      path: ".",
      resources: ["skills/decision-gate/references/runtime-kernel.md", "skills/workflow/SKILL.md"],
      kernel: "skills/decision-gate/references/runtime-kernel.md",
      workflow: "skills/workflow/SKILL.md",
    },
  };
}

test("composition materialization creates ordered isolated read-only skill and runtime snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-composition-materialize-"));
  try {
    const target = { id: "candidate", role: "candidate", kind: "working-tree", path: "skills/design-for-depth", resources: ["SKILL.md"] };
    const result = await materializeCompositionVariant(repoRoot, composition(), target, root);

    assert.deepEqual(result.skill_snapshots.map((item) => item.name), ["execute-plan", "tdd", "design-for-depth"]);
    assert.match(await readFile(join(result.skill_snapshots[0].path, "SKILL.md"), "utf8"), /# Execute Plan/);
    assert.match(await readFile(join(result.skill_snapshots[1].path, "SKILL.md"), "utf8"), /# Test-Driven Development/);
    assert.match(await readFile(join(result.skill_snapshots[2].path, "SKILL.md"), "utf8"), /# Design For Depth/);
    assert.match(await readFile(join(result.runtime.path, composition().runtime.kernel), "utf8"), /# Freeflow Runtime Kernel/);
    assert.match(await readFile(join(result.runtime.path, composition().runtime.workflow), "utf8"), /# Workflow/);

    for (const snapshot of result.skill_snapshots) {
      assert.equal((await stat(snapshot.path)).mode & 0o222, 0);
      assert.equal((await stat(join(snapshot.path, "SKILL.md"))).mode & 0o222, 0);
    }
    assert.equal((await stat(result.runtime.path)).mode & 0o222, 0);
  } finally {
    await removeWritableTree(root);
  }
});

test("composition materialization supports a Git runtime rooted at the repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-composition-git-runtime-"));
  try {
    const source = composition();
    source.runtime = { ...source.runtime, kind: "git", revision: "87f83cb" };
    const target = { id: "reference", role: "reference", kind: "git", revision: "87f83cb", path: "skills/design-for-depth", resources: ["SKILL.md"] };
    const result = await materializeCompositionVariant(repoRoot, source, target, root);
    assert.match(await readFile(join(result.runtime.path, source.runtime.kernel), "utf8"), /# Freeflow Runtime Kernel/);
  } finally {
    await removeWritableTree(root);
  }
});

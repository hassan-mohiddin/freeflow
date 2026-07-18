import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findRepoRoot } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";
import {
  materializeCompositionVariant,
  removeWritableTree,
} from "../../../skills/evaluate-skill/scripts/lib/materialize.mjs";

const repoRoot = await findRepoRoot(resolve(import.meta.dirname, "..", "..", ".."));

function composition() {
  return {
    target_name: "design-for-depth",
    base_stack: [
      { name: "execute-work", kind: "working-tree", path: "skills/execute-work", resources: ["SKILL.md"] },
      {
        name: "tdd",
        kind: "git",
        revision: "87f83cb",
        path: "skills/tdd",
        resources: ["SKILL.md", "references/test-design.md"],
      },
    ],
    runtime: {
      profile: "freeflow-interaction-workflow-v1",
      kind: "working-tree",
      path: ".",
      resources: ["runtime/interaction-contract.md", "skills/workflow/SKILL.md"],
      interaction_contract: "runtime/interaction-contract.md",
      workflow: "skills/workflow/SKILL.md",
    },
  };
}

test("composition materialization creates ordered isolated read-only skill and runtime snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-composition-materialize-"));
  try {
    const target = {
      id: "candidate",
      role: "candidate",
      kind: "working-tree",
      path: "skills/design-for-depth",
      resources: ["SKILL.md"],
    };
    const result = await materializeCompositionVariant(repoRoot, composition(), target, root);

    assert.deepEqual(
      result.skill_snapshots.map((item) => item.name),
      ["execute-work", "tdd", "design-for-depth"],
    );
    assert.match(await readFile(join(result.skill_snapshots[0].path, "SKILL.md"), "utf8"), /# Execute Work/);
    assert.match(await readFile(join(result.skill_snapshots[1].path, "SKILL.md"), "utf8"), /# Test-Driven Development/);
    assert.match(await readFile(join(result.skill_snapshots[2].path, "SKILL.md"), "utf8"), /# Design For Depth/);
    assert.match(
      await readFile(join(result.runtime.path, composition().runtime.interaction_contract), "utf8"),
      /# Freeflow Interaction Contract/,
    );
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
    source.runtime = { ...source.runtime, kind: "git", revision: "66a680b" };
    const target = {
      id: "reference",
      role: "reference",
      kind: "git",
      revision: "87f83cb",
      path: "skills/design-for-depth",
      resources: ["SKILL.md"],
    };
    const result = await materializeCompositionVariant(repoRoot, source, target, root);
    assert.match(
      await readFile(join(result.runtime.path, source.runtime.interaction_contract), "utf8"),
      /# Freeflow Interaction Contract/,
    );
  } finally {
    await removeWritableTree(root);
  }
});

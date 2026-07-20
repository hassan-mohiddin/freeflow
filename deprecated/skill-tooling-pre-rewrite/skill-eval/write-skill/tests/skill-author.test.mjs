import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { initSkill, inspectSkill, validateSkill } from "../../../skills/write-skill/scripts/lib/skill-author-core.mjs";

test("init creates one minimal draft skill file", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await initSkill({
    name: "sample-skill",
    root,
    description: "Use when an agent must handle sample work.",
  });
  assert.deepEqual(await readdir(result.skill_root), ["SKILL.md"]);
  assert.doesNotMatch(await readFile(result.skill_path, "utf8"), /^\s*(?:>\s*)?(?:Status|Readiness)\s*:/im);
  assert.equal(result.status, "draft");
  const validation = await validateSkill(result.skill_root);
  assert.equal(validation.valid, true);
});

test("validate rejects malformed frontmatter and escaping links", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, "bad-skill");
  await mkdir(skillRoot);
  await writeFile(resolve(skillRoot, "SKILL.md"), "---\nname: Bad Skill\n---\n\n# Bad\n\n[escape](../secret.md)\n");
  const result = await validateSkill(skillRoot);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.includes("kebab-case")));
  assert.ok(result.errors.some((item) => item.includes("escapes")));
});

test("validate accepts project-contained skill and runtime dependencies", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = resolve(root, "project");
  const skillRoot = resolve(projectRoot, "skills", "sample-skill");
  await mkdir(resolve(skillRoot, "references"), { recursive: true });
  await mkdir(resolve(projectRoot, "skills", "other-skill"), {
    recursive: true,
  });
  await mkdir(resolve(projectRoot, "runtime"), { recursive: true });
  await writeFile(resolve(skillRoot, "references", "detail.md"), "# Detail\n");
  await writeFile(resolve(projectRoot, "skills", "other-skill", "SKILL.md"), "# Other\n");
  await writeFile(resolve(projectRoot, "runtime", "contract.md"), "# Contract\n");
  await writeFile(
    resolve(skillRoot, "SKILL.md"),
    "---\nname: sample-skill\ndescription: Use when sample work needs dependencies.\n---\n\n# Sample\n\n[detail](references/detail.md)\n[other](../other-skill/SKILL.md)\n[contract](../../runtime/contract.md)\n",
  );

  const result = await validateSkill(skillRoot);
  assert.equal(result.valid, true);
  assert.deepEqual(result.linked_resources, ["references/detail.md"]);
  assert.deepEqual(result.linked_dependencies, ["../other-skill/SKILL.md", "../../runtime/contract.md"]);
});

test("validate rejects missing dependencies and project-root escapes", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, "project", "skills", "sample-skill");
  await mkdir(skillRoot, { recursive: true });
  await writeFile(
    resolve(skillRoot, "SKILL.md"),
    "---\nname: sample-skill\ndescription: Use when sample work needs validation.\n---\n\n# Sample\n\n[missing](../missing-skill/SKILL.md)\n[escape](../../../outside.md)\n",
  );

  const result = await validateSkill(skillRoot);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.includes("is missing")));
  assert.ok(result.errors.some((item) => item.includes("project root")));
});

test(
  "validate rejects dependencies that resolve outside the project through symlinks",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-symlink-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const projectRoot = resolve(root, "project");
    const skillRoot = resolve(projectRoot, "skills", "sample-skill");
    const runtimeRoot = resolve(projectRoot, "runtime");
    await mkdir(skillRoot, { recursive: true });
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(resolve(root, "outside.md"), "# Outside\n");
    await symlink(resolve(root, "outside.md"), resolve(runtimeRoot, "linked.md"));
    await writeFile(
      resolve(skillRoot, "SKILL.md"),
      "---\nname: sample-skill\ndescription: Use when sample work needs validation.\n---\n\n# Sample\n\n[linked](../../runtime/linked.md)\n",
    );

    const result = await validateSkill(skillRoot);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((item) => item.includes("resolves outside project root")));
  },
);

test("validate rejects YAML-unsafe plain-scalar descriptions", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-yaml-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, "bad-yaml");
  await mkdir(skillRoot);
  await writeFile(
    resolve(skillRoot, "SKILL.md"),
    "---\nname: bad-yaml\ndescription: Use when routes change: choose safely.\n---\n\n# Bad YAML\n",
  );
  const result = await validateSkill(skillRoot);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.includes("quote the value")));
});

test("inspect remains advisory and does not claim behavioral success", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-inspect-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await initSkill({
    name: "sample-skill",
    root,
    description: "Sample helper.",
  });
  const inspection = await inspectSkill(result.skill_root);
  assert.match(inspection.claim, /does not prove/);
  assert.ok(inspection.signals.some((item) => item.code === "activation-boundary"));
  assert.ok(!inspection.signals.some((item) => item.code === "status-unlabeled"));
});

test("inspect warns when readiness metadata appears in the active body", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-status-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, "sample-skill");
  await mkdir(skillRoot);
  await writeFile(
    resolve(skillRoot, "SKILL.md"),
    "---\nname: sample-skill\ndescription: Use when sample work needs a helper.\n---\n\n# Sample\n\n> **Status:** Draft\n",
  );

  const inspection = await inspectSkill(skillRoot);
  assert.ok(inspection.signals.some((item) => item.code === "status-in-active-body"));
});

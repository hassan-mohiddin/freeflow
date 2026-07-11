import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { initSkill, inspectSkill, validateSkill } from "../../../skills/write-skill/scripts/lib/skill-author-core.mjs";

test("init creates one minimal draft skill file", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await initSkill({ name: "sample-skill", root, description: "Use when an agent must handle sample work." });
  assert.deepEqual(await readdir(result.skill_root), ["SKILL.md"]);
  assert.match(await readFile(result.skill_path, "utf8"), /> Status: Draft/);
  assert.equal((await validateSkill(result.skill_root)).valid, true);
});

test("validate rejects malformed frontmatter and escaping links", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, "bad-skill");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(skillRoot));
  await writeFile(resolve(skillRoot, "SKILL.md"), "---\nname: Bad Skill\n---\n\n# Bad\n\n[escape](../secret.md)\n");
  const result = await validateSkill(skillRoot);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.includes("kebab-case")));
  assert.ok(result.errors.some((item) => item.includes("escapes")));
});

test("inspect remains advisory and does not claim behavioral success", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-author-inspect-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await initSkill({ name: "sample-skill", root, description: "Sample helper." });
  const inspection = await inspectSkill(result.skill_root);
  assert.match(inspection.claim, /does not prove/);
  assert.ok(inspection.signals.some((item) => item.code === "activation-boundary"));
});

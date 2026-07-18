import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { resolve } from "node:path";
import {
  assertSafeOwnedRoot,
  authorizeToolPath,
  createRootPolicy,
} from "../../../skills/evaluate-skill/scripts/lib/path-policy.mjs";
import { loadSkillWorkspace, resolveInside } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

test("resolveInside rejects traversal and absolute paths", () => {
  const root = resolve("/tmp/owned");
  assert.equal(resolveInside(root, "cases/a.json"), resolve(root, "cases/a.json"));
  assert.throws(() => resolveInside(root, "../answers.json"), /escapes/);
  assert.throws(() => resolveInside(root, "/answers.json"), /relative/);
});

test("destructive owned roots are rejected", () => {
  assert.throws(() => assertSafeOwnedRoot("/", { repoRoot: "/tmp/repo", homeDir: homedir() }), /destructive/);
  assert.throws(() => assertSafeOwnedRoot(homedir(), { repoRoot: "/tmp/repo", homeDir: homedir() }), /destructive/);
  assert.throws(() => assertSafeOwnedRoot("/tmp/repo", { repoRoot: "/tmp/repo", homeDir: homedir() }), /destructive/);
});

test("workspace loader rejects fixture symlink escapes", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-workspace-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, ".skill-eval", "sample-skill");
  const outside = resolve(root, "outside");
  await mkdir(resolve(skillRoot, "cases"), { recursive: true });
  await mkdir(outside);
  await writeFile(resolve(root, ".skill-eval", "config.json"), "{}\n");
  await writeFile(
    resolve(skillRoot, "suite.json"),
    JSON.stringify({ schema_version: 1, skill: "sample-skill", cases: ["cases/SAMPLE-001.json"] }),
  );
  await writeFile(
    resolve(skillRoot, "cases", "SAMPLE-001.json"),
    JSON.stringify({
      schema_version: 1,
      id: "SAMPLE-001",
      skill: "sample-skill",
      title: "escape",
      question: "fixture/repo behavior",
      evidence_classes: ["artifact-outcome"],
      required_for_bootstrap: false,
      evaluation_kind: "single",
      unsupported_evidence: "block",
      prompt: "x",
      fixture: "fixtures/escape",
      variants: [
        {
          id: "candidate",
          role: "subject",
          kind: "working-tree",
          path: "skills/sample-skill",
          resources: ["SKILL.md"],
        },
      ],
      execution: { host: "pi", mode: "json", tools: ["read"], timeout_ms: 1 },
      assertions: [{ id: "x", type: "path_exists", path: "x" }],
    }),
  );
  await mkdir(resolve(skillRoot, "fixtures"));
  await symlink(outside, resolve(skillRoot, "fixtures", "escape"));
  await assert.rejects(() => loadSkillWorkspace(root, "sample-skill"), /symlink/);
});

test("workspace loader rejects nested fixture symlinks", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-workspace-nested-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, ".skill-eval", "sample-skill");
  const fixture = resolve(skillRoot, "fixtures", "input");
  const outside = resolve(root, "outside.txt");
  await mkdir(resolve(skillRoot, "cases"), { recursive: true });
  await mkdir(fixture, { recursive: true });
  await writeFile(outside, "outside\n");
  await symlink(outside, resolve(fixture, "nested-escape"));
  await writeFile(resolve(root, ".skill-eval", "config.json"), "{}\n");
  await writeFile(
    resolve(skillRoot, "suite.json"),
    JSON.stringify({ schema_version: 1, skill: "sample-skill", cases: ["cases/SAMPLE-001.json"] }),
  );
  await writeFile(
    resolve(skillRoot, "cases", "SAMPLE-001.json"),
    JSON.stringify({
      schema_version: 1,
      id: "SAMPLE-001",
      skill: "sample-skill",
      title: "escape",
      question: "fixture/repo behavior",
      evidence_classes: ["artifact-outcome"],
      required_for_bootstrap: false,
      evaluation_kind: "single",
      unsupported_evidence: "block",
      prompt: "x",
      fixture: "fixtures/input",
      variants: [
        {
          id: "candidate",
          role: "subject",
          kind: "working-tree",
          path: "skills/sample-skill",
          resources: ["SKILL.md"],
        },
      ],
      execution: { host: "pi", mode: "json", tools: ["read"] },
      assertions: [{ id: "x", type: "path_exists", path: "x" }],
    }),
  );
  await assert.rejects(
    () => loadSkillWorkspace(root, "sample-skill"),
    /nested-escape.*symlink|symlink.*nested-escape/i,
  );
});

test("root policy blocks snapshot writes, traversal, and symlink escapes", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-path-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = resolve(root, "fixture");
  const snapshot = resolve(root, "snapshot");
  const denied = resolve(root, "denied");
  await Promise.all([mkdir(fixture), mkdir(snapshot), mkdir(denied)]);
  await Promise.all([
    writeFile(resolve(fixture, "file.txt"), "fixture"),
    writeFile(resolve(snapshot, "SKILL.md"), "skill"),
    writeFile(resolve(denied, "answer.txt"), "answer"),
  ]);
  await symlink(resolve(denied, "answer.txt"), resolve(fixture, "escape"));

  const policy = await createRootPolicy({ readRoots: [fixture, snapshot], writeRoots: [fixture] });
  assert.equal(
    (await authorizeToolPath({ inputPath: "file.txt", cwd: fixture, operation: "read", policy })).allowed,
    true,
  );
  assert.equal(
    (await authorizeToolPath({ inputPath: "new.txt", cwd: fixture, operation: "write", policy })).allowed,
    true,
  );
  assert.equal(
    (await authorizeToolPath({ inputPath: resolve(snapshot, "SKILL.md"), cwd: fixture, operation: "read", policy }))
      .allowed,
    true,
  );
  assert.equal(
    (await authorizeToolPath({ inputPath: resolve(snapshot, "SKILL.md"), cwd: fixture, operation: "write", policy }))
      .allowed,
    false,
  );
  assert.equal(
    (await authorizeToolPath({ inputPath: "../denied/answer.txt", cwd: fixture, operation: "read", policy })).allowed,
    false,
  );
  assert.equal(
    (await authorizeToolPath({ inputPath: "escape", cwd: fixture, operation: "read", policy })).allowed,
    false,
  );
});

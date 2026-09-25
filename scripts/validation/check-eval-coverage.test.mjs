import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { findStaleCoverage } from "./check-eval-coverage.mjs";

const script = fileURLToPath(new URL("./check-eval-coverage.mjs", import.meta.url));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function withRepository(files, matrix, run) {
  const root = await mkdtemp(path.join(tmpdir(), "eval-coverage-test-"));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
      await writeFile(path.join(root, relativePath), contents);
    }
    await mkdir(path.join(root, ".skill-eval"), { recursive: true });
    await writeFile(path.join(root, ".skill-eval/coverage-matrix.json"), JSON.stringify(matrix));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const files = { "skills/fresh/SKILL.md": "fresh\n", "skills/changed/SKILL.md": "changed now\n" };
const matrix = {
  schema_version: 2,
  skills: {
    fresh: { source_path: "skills/fresh/SKILL.md", source_sha256: sha256("fresh\n") },
    changed: { source_path: "skills/changed/SKILL.md", source_sha256: sha256("changed before\n") },
    missing: { source_path: "skills/missing/SKILL.md", source_sha256: sha256("gone\n") },
    unrecorded: { source_path: null, source_sha256: null },
  },
};

test("reports recorded evidence whose skill source changed or disappeared", async () => {
  await withRepository(files, matrix, async (root) => {
    assert.deepEqual(await findStaleCoverage(root), [
      { skill: "changed", sourcePath: "skills/changed/SKILL.md", reason: "source changed" },
      { skill: "missing", sourcePath: "skills/missing/SKILL.md", reason: "source missing" },
    ]);
  });
});

test("warns without failing by default and fails under --strict", async () => {
  await withRepository(files, matrix, async (root) => {
    const warned = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(warned.status, 0, warned.stderr);
    assert.match(warned.stderr, /2 coverage entries no longer match their skill source/);
    assert.match(warned.stderr, /changed: skills\/changed\/SKILL\.md \(source changed\)/);

    const strict = spawnSync(process.execPath, [script, "--strict"], { cwd: root, encoding: "utf8" });
    assert.equal(strict.status, 1);
  });
});

test("passes quietly when every recorded source matches", async () => {
  await withRepository(
    { "skills/fresh/SKILL.md": "fresh\n" },
    { schema_version: 2, skills: { fresh: matrix.skills.fresh } },
    async (root) => {
      const result = spawnSync(process.execPath, [script, "--strict"], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /1 coverage entries match their skill source/);
    },
  );
});

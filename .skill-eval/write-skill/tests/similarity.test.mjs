import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/write-skill/scripts/skill-author.mjs", import.meta.url));

const shared =
  "Dispose each material item as accepted rejected or open. State the supported problem and its consequence for the reviewed boundary before selecting a remedy.";

async function withSkills(files, run) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "skill-author-similarity-test-")));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
      await writeFile(path.join(root, relativePath), contents);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function similarity(root, ...args) {
  const result = spawnSync(process.execPath, [entrypoint, "similarity", root, ...args], { encoding: "utf8" });
  return { ...result, json: result.stdout ? JSON.parse(result.stdout) : JSON.parse(result.stderr) };
}

test("similarity reports near-duplicate Markdown files across skills", async () => {
  await withSkills(
    {
      "review-work/references/adjudicate.md": `# Adjudicate Work\n\n${shared} Work reviews also check callers.\n`,
      "review-artifact/references/adjudicate.md": `# Adjudicate Artifact\n\n${shared} Artifact reviews also check dependencies.\n`,
      "commit-work/SKILL.md":
        "# Commit Work\n\nStage only the paths that make the checkpoint claim true and inspect the index.\n",
      "node_modules/pkg/README.md": `${shared}\n`,
    },
    async (root) => {
      const result = similarity(root);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.json.command, "similarity");
      assert.equal(result.json.status, "ok");
      assert.equal(result.json.threshold, 0.2);
      assert.equal(result.json.files, 3);
      assert.equal(result.json.pairs.length, 1);
      const [pair] = result.json.pairs;
      assert.deepEqual([pair.a, pair.b].sort(), [
        "review-artifact/references/adjudicate.md",
        "review-work/references/adjudicate.md",
      ]);
      assert.ok(pair.similarity >= 0.2 && pair.similarity < 1);
      assert.ok(pair.sharedPhrases > 0);
    },
  );
});

test("similarity threshold is configurable and validated", async () => {
  await withSkills(
    {
      "one/SKILL.md": `${shared}\n`,
      "two/SKILL.md": `${shared} Extra words change the overlap for this second file entirely here.\n`,
    },
    async (root) => {
      assert.equal(similarity(root, "--threshold", "0.95").json.pairs.length, 0);
      assert.equal(similarity(root, "--threshold", "0.1").json.pairs.length, 1);
      for (const value of ["0", "1.5", "high"]) {
        const result = similarity(root, "--threshold", value);
        assert.equal(result.status, 2, value);
        assert.equal(result.json.error.code, "invalid-threshold");
      }
    },
  );
});

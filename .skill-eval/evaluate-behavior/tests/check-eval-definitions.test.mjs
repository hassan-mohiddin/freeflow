import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkEvalDefinitions, findDefinitionFiles } from "../../../scripts/validation/check-eval-definitions.mjs";

const REPOSITORY = fileURLToPath(new URL("../../../", import.meta.url));
import { toV2 } from "./helpers/to-v2.mjs";

async function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(toV2(value), null, 2)}\n`);
}

function group(id) {
  const environment = { source: { kind: "working-tree" }, skills: [], target: null, context: [] };
  return {
    schema_version: 1,
    kind: "group",
    id,
    type: "description",
    input: { prompt: "Natural prompt." },
    fixture: null,
    tools: ["read"],
    variants: { baseline: environment, candidate: environment },
    expectations: [],
    review_questions: ["Did the subject answer?"],
  };
}

test("every suite and case file under .skill-eval is loaded, and a legacy shape fails", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "check-eval-definitions-")));
  try {
    await writeJson(root, ".skill-eval/good/suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "good",
      groups: ["cases/one.json"],
    });
    await writeJson(root, ".skill-eval/good/cases/one.json", group("one"));
    await writeJson(root, ".skill-eval/good/fixtures/not-a-definition.json", { anything: true });
    await writeJson(root, ".skill-eval/legacy/suite.json", { schema_version: 1, skill: "legacy", cases: [] });

    const { checked, failures } = await checkEvalDefinitions(root);

    assert.equal(checked, 3);
    assert.deepEqual(
      failures.map((failure) => failure.file),
      [path.join(".skill-eval", "legacy", "suite.json")],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("variant suite files and group directories are loaded too; runs and fixtures are not", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "check-eval-definitions-")));
  try {
    await writeJson(root, ".skill-eval/review/suite-f3.json", {
      schema_version: 1,
      kind: "suite",
      id: "f3",
      groups: ["groups-f3/one.json"],
    });
    await writeJson(root, ".skill-eval/review/groups-f3/one.json", group("one"));
    await writeJson(root, ".skill-eval/review/groups-wording1/two.json", group("two"));
    await writeJson(root, ".skill-eval/review/review-suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "named",
      groups: ["groups-f3/one.json"],
    });
    // A broken group in a variant directory is now caught.
    await writeJson(root, ".skill-eval/review/groups-f7/broken.json", { ...group("broken"), kind: "nope" });
    await writeJson(root, ".skill-eval/review/runs/groups/ignored.json", { anything: true });
    await writeJson(root, ".skill-eval/review/fixtures/suite.json", { anything: true });
    await writeJson(root, ".skill-eval/review/groupsnot/ignored.json", { anything: true });

    const { checked, failures } = await checkEvalDefinitions(root);

    assert.equal(checked, 5);
    assert.deepEqual(
      failures.map((failure) => failure.file),
      [path.join(".skill-eval", "review", "groups-f7", "broken.json")],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a declared fixture must be a directory inside the repository, resolved from its root", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "check-eval-definitions-")));
  try {
    await mkdir(path.join(root, ".skill-eval/family/fixtures/present"), { recursive: true });
    await writeJson(root, ".skill-eval/family/groups/good.json", {
      ...group("good"),
      fixture: ".skill-eval/family/fixtures/present",
    });
    // Relative to the group file rather than the repository root: the mistake the check exists to catch.
    await writeJson(root, ".skill-eval/family/groups/relative.json", {
      ...group("relative"),
      fixture: "fixtures/present",
    });
    await writeFile(path.join(root, ".skill-eval/family/fixtures/file"), "not a directory\n");
    await writeJson(root, ".skill-eval/family/groups/file.json", {
      ...group("file"),
      fixture: ".skill-eval/family/fixtures/file",
    });

    const { checked, failures } = await checkEvalDefinitions(root);
    assert.equal(checked, 3);
    assert.deepEqual(
      failures.map((failure) => [path.basename(failure.file), failure.message]),
      [
        ["file.json", "group file: declared fixture is not a directory: .skill-eval/family/fixtures/file"],
        ["relative.json", "group relative: declared fixture is missing or escapes the repository: fixtures/present"],
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("every evaluation definition in this repository sits where the check loads it", async () => {
  // A group or suite saved outside groups/, cases/ or a suite file name would never be loaded by the check.
  const evalRoot = path.join(REPOSITORY, ".skill-eval");
  const skipped = new Set(["runs", "cache", "fixtures", "node_modules", "subjects", "reports", "provenance"]);
  const definitions = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name)) await walk(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        let value = null;
        try {
          value = JSON.parse(await readFile(entryPath, "utf8"));
        } catch {
          continue;
        }
        if (value?.schema_version === 2 && (value.kind === "group" || value.kind === "suite")) {
          definitions.push(entryPath);
        }
      }
    }
  }
  await walk(evalRoot);
  const loaded = new Set(await findDefinitionFiles(evalRoot));
  assert.ok(definitions.length > 0);
  assert.deepEqual(
    definitions.filter((file) => !loaded.has(file)).map((file) => path.relative(REPOSITORY, file)),
    [],
  );
});

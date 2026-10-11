import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkEvalDefinitions } from "../../../scripts/validation/check-eval-definitions.mjs";

async function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
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

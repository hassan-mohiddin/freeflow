import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const planLint = resolve("skills/write-docs/scripts/plan-lint.mjs");
const artifactCheck = resolve("skills/write-docs/scripts/artifact-check.mjs");
const run = (script, cwd, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout,
    json: result.stdout.startsWith("{") ? JSON.parse(result.stdout) : null,
  };
};
async function folder(files) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "write-docs-")));
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@e.com", "-c", "commit.gpgsign=false", "add", "--all"], {
    cwd: root,
  });
  execFileSync(
    "git",
    ["-c", "user.name=T", "-c", "user.email=t@e.com", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "base"],
    { cwd: root },
  );
  return root;
}

const PHASED = `# Plan

### Slice 1.1 — Parse the config
Intended result: options parse.
Tests or observations: unit tests for each option, seen failing first.

### Slice 1.2 — Migrate old files
Intended result: old files load.
Checks:

- an old file from the fixture loads unchanged

### Slice 1.3 — Remove the flag
Intended result: the flag is gone.
Tests or observations:
Completion condition: done.
`;
const LIGHT = `# Plan

Ordered actions or slices:

1. Add the field; check: the round-trip test passes.
2. Update the docs.
3. Ship it
   - verify the release notes match the diff

Completion condition: merged.
`;

test("plan-lint finds the steps that name no check, in slice blocks and ordered lists", async () => {
  const root = await folder({ "phased.md": PHASED, "light.md": LIGHT, "none.md": "# Notes\n\nNothing ordered.\n" });
  try {
    const result = run(planLint, root, ["phased.md", "light.md", "--json"]);
    assert.equal(result.status, 1);
    const [phased, light] = result.json.results;
    assert.equal(phased.steps.length, 3);
    assert.deepEqual(
      phased.problems.map((step) => [step.step, step.problem]),
      [["Slice 1.3 — Remove the flag", "its check field is empty"]],
    );
    assert.equal(light.steps.length, 3);
    assert.deepEqual(
      light.problems.map((step) => step.step),
      ["Update the docs."],
    );
    assert.equal(run(planLint, root, ["none.md"]).status, 1);
    await writeFile(
      join(root, "good.md"),
      PHASED.replace(
        "Tests or observations:\nCompletion",
        "Tests or observations: the flag is absent from --help.\nCompletion",
      ),
    );
    assert.equal(run(planLint, root, ["good.md"]).status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact-check checks status vocabulary, acceptance source, supersession and the source trail", async () => {
  const root = await folder({ "src/api.js": "x\n" });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const doc = (status, extra = "") =>
    `# API Spec\n\n> **Type:** API Contract\n> **Status:** ${status}\n${extra}\nBody.\n`;
  await mkdir(join(root, "specs"));
  await writeFile(
    join(root, "specs/good.md"),
    doc("Accepted", `> **Source:** file:src/api.js, commit:${head.slice(0, 8)}\n`),
  );
  await writeFile(join(root, "specs/odd.md"), doc("Approved"));
  await writeFile(join(root, "specs/no-source.md"), doc("Accepted"));
  await writeFile(join(root, "specs/superseded.md"), doc("Superseded"));
  await writeFile(
    join(root, "specs/broken-trail.md"),
    doc("Draft", "> **Source:** file:src/gone.js and commit:abcdef1\n"),
  );
  await writeFile(join(root, "specs/many.md"), doc("Draft | Accepted"));
  await writeFile(
    join(root, "specs/adr.md"),
    "# ADR 1\n\n## Status\n\nAccepted.\n\nAccepted by the owner in issue 4.\n",
  );
  try {
    const result = run(artifactCheck, root, [
      "specs/good.md",
      "specs/odd.md",
      "specs/no-source.md",
      "specs/superseded.md",
      "specs/broken-trail.md",
      "specs/many.md",
      "specs/adr.md",
      "--json",
    ]);
    assert.equal(result.status, 1);
    const problems = Object.fromEntries(result.json.results.map((each) => [each.path, each.problems.join("; ")]));
    assert.equal(problems["specs/good.md"], "");
    assert.match(problems["specs/odd.md"], /status "Approved" is not one of Draft, Reviewed, Accepted/);
    assert.match(problems["specs/no-source.md"], /Accepted but names no Source/);
    assert.match(problems["specs/superseded.md"], /does not link its replacement/);
    assert.match(
      problems["specs/broken-trail.md"],
      /file:src\/gone\.js does not exist; commit:abcdef1 does not resolve/,
    );
    assert.match(problems["specs/many.md"], /gives several statuses/);
    assert.equal(problems["specs/adr.md"], "");
    assert.equal(run(artifactCheck, root, ["specs/odd.md", "--statuses", "Proposed,Approved"]).status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

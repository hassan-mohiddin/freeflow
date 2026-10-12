import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

// Each guard must fail on a defect it exists to catch. The guards read the repository they run in, so the tests run
// them in a copy of the committed tree, prove each passes on the clean copy, then inject one defect and restore it.
let copy;

before(() => {
  copy = mkdtempSync(join(tmpdir(), "freeflow-guards-"));
  execFileSync("sh", ["-c", `git archive HEAD | tar -x -C "${copy}"`]);
  execFileSync("git", ["init", "-q"], { cwd: copy });
});

after(() => rmSync(copy, { recursive: true, force: true }));

function run(argv) {
  const result = spawnSync(argv[0], argv.slice(1), { cwd: copy, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function withDefect(path, change, check) {
  const file = join(copy, path);
  const original = readFileSync(file, "utf8");
  writeFileSync(file, change(original));
  try {
    check();
  } finally {
    writeFileSync(file, original);
  }
}

test("check-activation-contract fails when a required statement is missing", () => {
  const argv = ["bash", "scripts/validation/check-activation-contract.sh"];
  assert.equal(run(argv).status, 0, run(argv).output);
  withDefect(
    "dev-docs/README.md",
    (text) => text.replaceAll("runtime/prompts/", "runtime/elsewhere/"),
    () => {
      const result = run(argv);
      assert.notEqual(result.status, 0, result.output);
    },
  );
});

test("check-skill-routing-doc fails when a skill has no routing row", () => {
  const argv = ["node", "scripts/validation/check-skill-routing-doc.mjs"];
  assert.equal(run(argv).status, 0, run(argv).output);
  const dir = join(copy, "skills", "unrouted-skill");
  mkdirSync(dir);
  writeFileSync(join(dir, "SKILL.md"), "---\nname: unrouted-skill\ndescription: test\n---\n\n# Unrouted\n");
  try {
    const result = run(argv);
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, /unrouted-skill/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit-command-surface fails when a command maps to a missing skill", () => {
  const argv = ["bash", "scripts/validation/audit-command-surface.sh"];
  assert.equal(run(argv).status, 0, run(argv).output);
  withDefect(
    "command-surface.json",
    (text) => text.replace('"skill": "discuss"', '"skill": "no-such-skill"'),
    () => {
      const result = run(argv);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /missing skill: no-such-skill/);
    },
  );
});

test("check-release-version fails when one manifest's version disagrees", () => {
  const argv = ["node", "scripts/validation/check-release-version.mjs"];
  assert.equal(run(argv).status, 0, run(argv).output);
  withDefect(
    "plugin.json",
    (text) => text.replace(/"version": "[^"]+"/, '"version": "99.0.0"'),
    () => {
      const result = run(argv);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /plugin\.json=99\.0\.0/);
    },
  );
});

test("check-package fails when a required runtime file is missing", () => {
  const argv = ["node", "scripts/validation/check-package.mjs"];
  assert.equal(run(argv).status, 0, run(argv).output);
  const path = join(copy, "runtime", "prompts", "interaction-contract.md");
  const original = readFileSync(path, "utf8");
  rmSync(path);
  try {
    const result = run(argv);
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, /interaction-contract\.md/);
  } finally {
    writeFileSync(path, original);
  }
});

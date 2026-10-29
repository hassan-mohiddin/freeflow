import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { inspectCiWorkflow, inspectReleaseWorkflow, inspectTestScript } from "./check-release-workflow.mjs";

const workflow = readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
const ciWorkflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

test("CI workflow covers generated output and release governance tests", () => {
  assert.deepEqual(inspectCiWorkflow(ciWorkflow), { errors: [] });
});

test("CI and release workflows assert a clean worktree after tests", () => {
  assert.match(ciWorkflow, /test -z \"\$\(git status --porcelain\)\"/);
  assert.match(workflow, /test -z \"\$\(git status --porcelain\)\"/);
});

test("release workflow satisfies publication ordering and artifact invariants", () => {
  assert.deepEqual(inspectReleaseWorkflow(workflow), { errors: [] });
});

test("rejects publication before release-note extraction", () => {
  const invalid = workflow.replace(
    "- name: Extract changelog release notes",
    "- name: Publish npm package when not already published\n        run: npm publish\n\n      - name: Extract changelog release notes",
  );
  const result = inspectReleaseWorkflow(invalid);
  assert.match(result.errors.join("\n"), /release notes.*before npm publish/i);
});

test("bounds npm registry propagation verification after publish", () => {
  assert.match(workflow, /registry_attempts=36/);
  assert.match(workflow, /registry_delay_seconds=10/);
  assert.match(workflow, /E404\|404 Not Found/);
  assert.match(workflow, /sleep "\$registry_delay_seconds"/);
  assert.match(workflow, /registry_predicate/);
  assert.ok(workflow.indexOf('npm publish "$RELEASE_TARBALL"') < workflow.indexOf("registry_attempts=36"));
  assert.ok(workflow.indexOf("registry_attempts=36") < workflow.indexOf('gh release create "$RELEASE_TAG"'));
});

test("npm test runs every test:* suite, so a new suite cannot be left out of CI", () => {
  const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts;
  assert.deepEqual(inspectTestScript(scripts), { errors: [] });
  const added = { ...scripts, "test:new-thing": "node --test new.test.mjs" };
  assert.deepEqual(inspectTestScript(added).errors, ["npm test must run test:new-thing."]);
  const { test: _omitted, ...withoutTest } = scripts;
  assert.match(inspectTestScript(withoutTest).errors[0], /must define a test script/);
});

test("CI's test shards run every suite npm test lists, each exactly once, including a suite added later", async () => {
  const { shards, suites } = await import("./test-shard.mjs");
  const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts;
  const listed = suites(scripts);
  const dealt = shards(listed, 3).flat();
  assert.deepEqual([...dealt].sort(), [...listed].sort());
  const withNew = shards([...listed, "test:brand-new"], 3).flat();
  assert.equal(withNew.filter((name) => name === "test:brand-new").length, 1);
  assert.match(ciWorkflow, /shard: \[1\/3, 2\/3, 3\/3\]/);
});

test("Track Work's suite runs with its temporary folder reached through a symlink, as macOS's is", () => {
  const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts;
  assert.match(scripts["test:track-work"], /^node scripts\/validation\/with-symlinked-tmp\.mjs node --test /);
  const wrapper = new URL("./with-symlinked-tmp.mjs", import.meta.url).pathname;
  const probe =
    "const fs = require('fs'), os = require('os'); console.log(JSON.stringify([os.tmpdir(), fs.realpathSync(os.tmpdir())]))";
  const run = spawnSync(process.execPath, [wrapper, process.execPath, "-e", probe], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const [given, real] = JSON.parse(run.stdout);
  assert.notEqual(given, real);
  assert.ok(!existsSync(given) && !existsSync(real), "the folder and its link are removed afterwards");
  assert.equal(spawnSync(process.execPath, [wrapper, process.execPath, "-e", "process.exit(3)"]).status, 3);
  assert.equal(spawnSync(process.execPath, [wrapper]).status, 2);
});

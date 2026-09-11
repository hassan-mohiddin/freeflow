import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectCiWorkflow, inspectReleaseWorkflow } from "./check-release-workflow.mjs";

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
  assert.match(workflow, /registry_attempts=18/);
  assert.match(workflow, /registry_delay_seconds=10/);
  assert.match(workflow, /E404\|404 Not Found/);
  assert.match(workflow, /sleep "\$registry_delay_seconds"/);
  assert.match(workflow, /registry_predicate/);
  assert.ok(workflow.indexOf('npm publish "$RELEASE_TARBALL"') < workflow.indexOf("registry_attempts=18"));
  assert.ok(workflow.indexOf("registry_attempts=18") < workflow.indexOf('gh release create "$RELEASE_TAG"'));
});

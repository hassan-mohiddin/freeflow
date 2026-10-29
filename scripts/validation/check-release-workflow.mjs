#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const WORKFLOW_PATH = ".github/workflows/release.yml";
const PACKAGE_PATH = "package.json";

/** Suites the gate requires by name; every other test:* script must be in npm test too. */
const REQUIRED_SUITES = [
  "test:pi-extension",
  "test:host-manifests",
  "test:release-workflow",
  "test:changelog",
  "test:docs",
];

function position(text, needle) {
  return text.indexOf(needle);
}

function lastPosition(text, needle) {
  return text.lastIndexOf(needle);
}

export function inspectCiWorkflow(workflow) {
  const errors = [];
  const requireText = (needle, message = `CI workflow is missing: ${needle}`) => {
    if (position(workflow, needle) === -1) errors.push(message);
  };
  const requireOrder = (before, after, message) => {
    const beforePosition = position(workflow, before);
    const afterPosition = position(workflow, after);
    if (beforePosition === -1 || afterPosition === -1 || beforePosition >= afterPosition) errors.push(message);
  };

  requireText("npm run build", "CI workflow must build generated runtime output.");
  requireText("git diff --exit-code -- pi-extension/dist", "CI workflow must reject dirty generated Pi output.");
  requireText("npm run check", "CI workflow must run the repository check gate.");
  // The suites run in parallel shards of npm test; test-shard.mjs deals every suite npm test lists to one shard.
  requireText(
    "node scripts/validation/test-shard.mjs ${{ matrix.shard }}",
    "CI workflow must run every test suite through test-shard.mjs shards of npm test.",
  );
  requireText("needs: [gate, tests]", "CI's required check must wait for the check gate and every test shard.");
  requireText('test -z "$(git status --porcelain)"', "CI workflow must reject post-test worktree changes.");
  requireOrder(
    "npm run build",
    "git diff --exit-code -- pi-extension/dist",
    "CI must check generated output after build.",
  );
  requireOrder(
    "git diff --exit-code -- pi-extension/dist",
    "npm run check",
    "CI must run the check gate after generated-output verification.",
  );
  // The shards' job checks the worktree after its tests, as the gate's does after its checks.
  if (
    lastPosition(workflow, 'test -z "$(git status --porcelain)"') <
    position(workflow, "node scripts/validation/test-shard.mjs")
  )
    errors.push("CI must check worktree cleanliness after tests.");

  return { errors };
}

export function inspectReleaseWorkflow(workflow) {
  const errors = [];
  const requireText = (needle, message = `Release workflow is missing: ${needle}`) => {
    if (position(workflow, needle) === -1) errors.push(message);
  };
  const requireOrder = (before, after, message) => {
    const beforePosition = position(workflow, before);
    const afterPosition = position(workflow, after);
    if (beforePosition === -1 || afterPosition === -1 || beforePosition >= afterPosition) errors.push(message);
  };
  const requireLastOrder = (before, after, message) => {
    const beforePosition = lastPosition(workflow, before);
    const afterPosition = lastPosition(workflow, after);
    if (beforePosition === -1 || afterPosition === -1 || beforePosition >= afterPosition) errors.push(message);
  };

  requireText(
    "permissions:\n  contents: write\n  id-token: write",
    "Release workflow must grant contents write and OIDC id-token permissions.",
  );
  requireText("environment: npm", "Release workflow must use the protected npm environment.");
  requireText("run: npm test", "Release workflow must run every test suite through npm test.");
  requireText(
    "git diff --exit-code -- pi-extension/dist",
    "Release workflow must reject dirty generated Pi output after build.",
  );
  requireText("node scripts/release-notes.mjs", "Release workflow must extract release notes.");
  requireText("npm pack --ignore-scripts", "Release workflow must pack one exact artifact before publication.");
  requireText("--pack-destination", "Release workflow must retain the exact packed artifact.");
  requireText('npm publish "$RELEASE_TARBALL"', "Release workflow must publish the inspected tarball.");
  requireText("--access public", "Release workflow must publish the public package.");
  requireText('--tag "$NPM_DIST_TAG"', "Release workflow must publish to the selected npm dist-tag.");
  requireText("--provenance", "Release workflow must publish with provenance.");
  requireText(
    'npm view "$PACKAGE_NAME@$version" dist --json',
    "Release workflow must inspect registry artifact metadata.",
  );
  requireText(
    'gh release create "$RELEASE_TAG"',
    "Release workflow must create the GitHub Release from the verified tag.",
  );
  requireText("--verify-tag", "GitHub Release creation must verify the release tag.");
  requireText("RELEASE_SHASUM", "Release workflow must compare registry and local artifact checksums.");
  requireText(".shasum", "Release workflow must read the registry tarball checksum.");
  requireText(".attestations.provenance.predicateType", "Release workflow must verify npm provenance metadata.");
  requireText("registry_attempts=36", "Release workflow must bound registry propagation polling.");
  requireText("registry_delay_seconds=10", "Release workflow must use an explicit registry polling delay.");
  requireText("E404|404 Not Found", "Release workflow must retry only expected not-yet-visible registry responses.");
  requireText('sleep "$registry_delay_seconds"', "Release workflow must wait between bounded registry attempts.");
  requireText("registry_predicate", "Release workflow must inspect provenance after registry visibility.");
  requireText('test -z "$(git status --porcelain)"', "Release workflow must reject post-test worktree changes.");

  requireOrder(
    "npm run build",
    "git diff --exit-code -- pi-extension/dist",
    "Generated-runtime cleanliness must be checked after the build.",
  );
  requireOrder(
    "npm run check:changelog",
    "node scripts/release-notes.mjs",
    "Changelog structure must be validated before release-note extraction.",
  );
  requireOrder("node scripts/release-notes.mjs", "npm publish", "Release notes must be extracted before npm publish.");
  requireOrder(
    "run: npm test",
    'test -z "$(git status --porcelain)"',
    "Release must check worktree cleanliness after tests.",
  );
  requireOrder("npm pack --ignore-scripts", "npm publish", "The exact npm tarball must be created before publication.");
  requireOrder("--pack-destination", "npm publish", "The exact npm tarball must be retained before publication.");
  requireOrder(
    'test -z "$(git status --porcelain)"',
    "node scripts/release-notes.mjs",
    "Release must check worktree cleanliness before preparing publication.",
  );
  requireLastOrder(
    "npm publish",
    'npm view "$PACKAGE_NAME@$version" dist --json',
    "Registry artifact verification must follow publication or recovery.",
  );
  requireLastOrder(
    'npm view "$PACKAGE_NAME@$version" dist --json',
    'gh release create "$RELEASE_TAG"',
    "The GitHub Release must wait for registry artifact verification.",
  );

  return { errors };
}

/**
 * npm test is the one list of suites both workflows run: it runs every test:* script, so a new suite cannot be left out
 * of CI, with host manifests before the skill suites.
 */
export function inspectTestScript(scripts) {
  const errors = [];
  const test = typeof scripts?.test === "string" ? scripts.test : "";
  if (!test) return { errors: ["package.json must define a test script that runs every suite."] };
  const runs = (name) => new RegExp(`(^|&& )npm run ${name}( &&|$)`).test(test);
  for (const name of Object.keys(scripts).filter((key) => key.startsWith("test:")))
    if (!runs(name)) errors.push(`npm test must run ${name}.`);
  for (const name of REQUIRED_SUITES) if (!(name in scripts)) errors.push(`package.json is missing ${name}.`);
  if (test.indexOf("npm run test:host-manifests") > test.indexOf("npm run test:skill-author"))
    errors.push("npm test must run host manifest and adapter tests before the skill suites.");
  return { errors };
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const ciWorkflow = readFileSync(resolve(CI_WORKFLOW_PATH), "utf8");
  const releaseWorkflow = readFileSync(resolve(WORKFLOW_PATH), "utf8");
  const errors = [
    ...inspectCiWorkflow(ciWorkflow).errors.map((error) => `CI: ${error}`),
    ...inspectReleaseWorkflow(releaseWorkflow).errors.map((error) => `Release: ${error}`),
    ...inspectTestScript(JSON.parse(readFileSync(resolve(PACKAGE_PATH), "utf8")).scripts).errors.map(
      (error) => `package.json: ${error}`,
    ),
  ];
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL: ${error}`);
    process.exitCode = 1;
  } else {
    console.log("CI and release workflow invariants passed.");
  }
}

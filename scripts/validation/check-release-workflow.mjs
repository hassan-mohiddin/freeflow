#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const WORKFLOW_PATH = ".github/workflows/release.yml";

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
  requireText("npm run test:release-workflow", "CI workflow must run release workflow invariant tests.");
  requireText("npm run test:host-manifests", "CI workflow must run host manifest and adapter tests.");
  requireText("npm run test:docs", "CI workflow must run documentation tests.");
  requireText("npm run test:changelog", "CI workflow must run changelog tests.");
  requireText("npm run test:pi-extension", "CI workflow must run the complete Pi extension suite.");
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
  requireOrder(
    "npm run test:host-manifests",
    "npm run test:skill-author",
    "CI must run host manifest and adapter tests before the remaining deterministic suite.",
  );
  requireOrder(
    "npm run test:docs",
    'test -z "$(git status --porcelain)"',
    "CI must check worktree cleanliness after tests.",
  );

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
  requireText("npm run test:docs", "Release workflow must run the documentation tests.");
  requireText("npm run test:changelog", "Release workflow must run the changelog tests.");
  requireText("npm run test:release-workflow", "Release workflow must run its invariant tests.");
  requireText("npm run test:host-manifests", "Release workflow must run host manifest and adapter tests.");
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
    "npm run test:host-manifests",
    "npm run test:skill-author",
    "Release workflow must run host manifest and adapter tests before the remaining deterministic suite.",
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

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  const ciWorkflow = readFileSync(resolve(CI_WORKFLOW_PATH), "utf8");
  const releaseWorkflow = readFileSync(resolve(WORKFLOW_PATH), "utf8");
  const errors = [
    ...inspectCiWorkflow(ciWorkflow).errors.map((error) => `CI: ${error}`),
    ...inspectReleaseWorkflow(releaseWorkflow).errors.map((error) => `Release: ${error}`),
  ];
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL: ${error}`);
    process.exitCode = 1;
  } else {
    console.log("CI and release workflow invariants passed.");
  }
}

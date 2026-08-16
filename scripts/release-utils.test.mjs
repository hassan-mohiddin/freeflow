import assert from "node:assert/strict";
import test from "node:test";
import { extractChangelogSection, prepareChangelog, resolveReleaseVersion } from "./release-utils.mjs";

test("resolves standard release bumps and rejects non-increasing versions", () => {
  assert.equal(resolveReleaseVersion("0.5.0", "patch"), "0.5.1");
  assert.equal(resolveReleaseVersion("0.5.0", "minor"), "0.6.0");
  assert.equal(resolveReleaseVersion("0.5.0", "major"), "1.0.0");
  assert.equal(resolveReleaseVersion("0.5.0", "0.7.0"), "0.7.0");
  assert.throws(() => resolveReleaseVersion("0.5.0", "0.5.0"), /must be greater/);
});

test("extracts release notes from bracketed and unbracketed headings", () => {
  const markdown =
    "# Changelog\n\n## [Unreleased]\n\n## [0.6.0] - 2026-08-16\n\n### Added\n\n- New feature.\n\n## [0.5.0] - 2026-08-01\n";
  assert.equal(extractChangelogSection(markdown, "0.6.0"), "### Added\n\n- New feature.");
});

test("moves a non-empty Unreleased section while preserving the heading style", () => {
  const markdown = "# Changelog\n\n## Unreleased\n\n- New feature.\n\n## 0.5.0 - 2026-08-01\n\n- Older feature.\n";
  assert.equal(
    prepareChangelog(markdown, "0.6.0", "2026-08-16"),
    "# Changelog\n\n## Unreleased\n\n## 0.6.0 - 2026-08-16\n\n- New feature.\n\n## 0.5.0 - 2026-08-01\n\n- Older feature.\n",
  );
});

test("rejects an empty Unreleased section", () => {
  assert.throws(
    () => prepareChangelog("# Changelog\n\n## Unreleased\n\n## 0.5.0 - 2026-08-01\n", "0.6.0", "2026-08-16"),
    /Unreleased section is empty/,
  );
});

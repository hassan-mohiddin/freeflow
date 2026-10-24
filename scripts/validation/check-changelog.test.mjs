import assert from "node:assert/strict";
import test from "node:test";
import {
  extractUnreleasedSection,
  parseDeclaration,
  validateChangelogDeclaration,
  validateChangelogStructure,
} from "./check-changelog.mjs";

const consumerBody = `- [x] Consumer-visible change; I updated \`CHANGELOG.md\` under \`## Unreleased\`. <!-- changelog:consumer -->
- [ ] Internal-only change; no changelog entry is needed. <!-- changelog:internal -->`;
const internalBody = `- [ ] Consumer-visible change; I updated \`CHANGELOG.md\` under \`## Unreleased\`. <!-- changelog:consumer -->
- [x] Internal-only change; no changelog entry is needed. <!-- changelog:internal -->`;
const baseChangelog = "# Changelog\n\n## Unreleased\n\n### Added\n\n- Existing note.\n\n## 0.5.0 - 2026-08-13\n";
const changedChangelog =
  "# Changelog\n\n## Unreleased\n\n### Added\n\n- Existing note.\n- New note.\n\n## 0.5.0 - 2026-08-13\n";

const preparedChangelog =
  "# Changelog\n\n## Unreleased\n\n## 0.9.0 - 2026-10-22\n\n### Added\n\n- Prepared note.\n\n## 0.8.0 - 2026-10-03\n\n- Older note.\n";

test("parses exactly one consumer-visible declaration", () => {
  assert.deepEqual(parseDeclaration(consumerBody), { declaration: "consumer", errors: [] });
  assert.deepEqual(parseDeclaration(internalBody), { declaration: "internal", errors: [] });
});

test("rejects missing and conflicting declarations", () => {
  assert.match(parseDeclaration("").errors[0], /exactly one/);
  const both = `${consumerBody.replace("[ ] Internal", "[x] Internal")}`;
  assert.match(parseDeclaration(both).errors[0], /both/);
});

test("extracts bracketed or unbracketed Unreleased sections", () => {
  assert.equal(extractUnreleasedSection(baseChangelog), "### Added\n\n- Existing note.");
  assert.equal(extractUnreleasedSection("# Changelog\n\n## [Unreleased]\n\n- New note.\n"), "- New note.");
  assert.equal(extractUnreleasedSection("# Changelog\n\n## 0.5.0 - 2026-08-13\n"), null);
});

test("accepts a consumer-visible change that updates Unreleased", () => {
  assert.deepEqual(
    validateChangelogDeclaration({
      body: consumerBody,
      changedPaths: ["CHANGELOG.md", "src/feature.ts"],
      currentChangelog: changedChangelog,
      baseChangelog,
    }),
    { declaration: "consumer", errors: [] },
  );
});

test("rejects a consumer-visible change without a changelog update", () => {
  const result = validateChangelogDeclaration({
    body: consumerBody,
    changedPaths: ["src/feature.ts"],
    currentChangelog: baseChangelog,
    baseChangelog,
  });
  assert.deepEqual(result.declaration, "consumer");
  assert.match(result.errors.join("\n"), /must change CHANGELOG/);
  assert.match(result.errors.join("\n"), /must update the ## Unreleased/);
});

test("accepts internal-only changes without a changelog update", () => {
  assert.deepEqual(
    validateChangelogDeclaration({
      body: internalBody,
      changedPaths: ["scripts/internal-check.mjs"],
      currentChangelog: baseChangelog,
      baseChangelog,
    }),
    { declaration: "internal", errors: [] },
  );
});

test("validates canonical categories and rejects uncategorized content", () => {
  assert.deepEqual(validateChangelogStructure(baseChangelog), { errors: [] });
  assert.deepEqual(validateChangelogStructure("# Changelog\n\n## Unreleased\n"), { errors: [] });
  assert.match(
    validateChangelogStructure("# Changelog\n\n## Unreleased\n\n### Unknown\n\n- Note.\n").errors.join("\n"),
    /unknown changelog category/i,
  );
  assert.match(
    validateChangelogStructure("# Changelog\n\n## Unreleased\n\nLoose note.\n").errors.join("\n"),
    /under a canonical category/i,
  );
});

test("rejects a consumer declaration that changes only a released section", () => {
  const releasedOnly =
    "# Changelog\n\n## Unreleased\n\n### Added\n\n- Existing note.\n\n## 0.5.0 - 2026-08-13\n\n- Corrected note.\n";
  const result = validateChangelogDeclaration({
    body: consumerBody,
    changedPaths: ["CHANGELOG.md", "src/feature.ts"],
    currentChangelog: releasedOnly,
    baseChangelog,
    tags: ["v0.5.0"],
  });
  assert.match(result.errors.join("\n"), /must update the ## Unreleased/);
  assert.match(result.errors.join("\n"), /released changelog sections are immutable/i);
});

test("rejects a release when a released section changes", () => {
  const current = `${baseChangelog}\n- Corrected note.\n`;
  const result = validateChangelogDeclaration({
    body: internalBody,
    changedPaths: ["CHANGELOG.md"],
    currentChangelog: current,
    baseChangelog,
    tags: ["v0.5.0"],
  });
  assert.match(result.errors.join("\n"), /released changelog sections are immutable/i);
});

test("rejects line-ending changes in released sections", () => {
  const releasedBase = `${baseChangelog}- Existing released note.\n`;
  const current = releasedBase.replaceAll("\n", "\r\n");
  const result = validateChangelogDeclaration({
    body: internalBody,
    changedPaths: ["CHANGELOG.md"],
    currentChangelog: current,
    baseChangelog: releasedBase,
    tags: ["v0.5.0"],
  });
  assert.match(result.errors.join("\n"), /released changelog sections are immutable/i);
});

test("preserves non-final separators while ignoring only the document terminal newline", () => {
  const twoReleaseBase =
    "# Changelog\n\n## Unreleased\n\n## 0.7.0 - 2026-09-01\n- New release\n## 0.6.0 - 2026-08-01\n- Old release\n";
  const boundaryChanged = twoReleaseBase.replace("- New release\n## 0.6.0", "- New release\r\n## 0.6.0");
  const boundaryResult = validateChangelogDeclaration({
    body: internalBody,
    changedPaths: ["CHANGELOG.md"],
    currentChangelog: boundaryChanged,
    baseChangelog: twoReleaseBase,
    tags: ["v0.6.0", "v0.7.0"],
  });
  assert.match(boundaryResult.errors.join("\n"), /released changelog sections are immutable/i);

  assert.deepEqual(
    validateChangelogDeclaration({
      body: internalBody,
      changedPaths: ["CHANGELOG.md"],
      currentChangelog: twoReleaseBase.replace(/\n$/, ""),
      baseChangelog: twoReleaseBase,
      tags: ["v0.6.0", "v0.7.0"],
    }),
    { declaration: "internal", errors: [] },
  );
});

test("allows a new release section while preserving older released sections", () => {
  const current = baseChangelog.replace(
    "## 0.5.0 - 2026-08-13",
    "## 0.6.0 - 2026-08-25\n\n### Added\n\n- New release.\n\n## 0.5.0 - 2026-08-13",
  );
  assert.deepEqual(
    validateChangelogDeclaration({
      body: internalBody,
      changedPaths: ["CHANGELOG.md"],
      currentChangelog: current,
      baseChangelog,
    }),
    { declaration: "internal", errors: [] },
  );
});

test("lets a version section change until its tag exists", () => {
  const edited = preparedChangelog.replace("- Prepared note.", "- Prepared note.\n- Late note.");
  assert.deepEqual(
    validateChangelogDeclaration({
      body: internalBody,
      changedPaths: ["CHANGELOG.md"],
      currentChangelog: edited,
      baseChangelog: preparedChangelog,
      tags: ["v0.8.0"],
    }),
    { declaration: "internal", errors: [] },
  );

  const tagged = validateChangelogDeclaration({
    body: internalBody,
    changedPaths: ["CHANGELOG.md"],
    currentChangelog: edited,
    baseChangelog: preparedChangelog,
    tags: ["v0.8.0", "v0.9.0"],
  });
  assert.match(tagged.errors.join("\n"), /released changelog sections are immutable/i);
});

test("lets an untagged version section's date change, but not a tagged one's", () => {
  const redated = preparedChangelog.replace("## 0.9.0 - 2026-10-22", "## 0.9.0 - 2026-10-24");
  assert.notEqual(redated, preparedChangelog);
  const check = (tags) =>
    validateChangelogDeclaration({
      body: internalBody,
      changedPaths: ["CHANGELOG.md"],
      currentChangelog: redated,
      baseChangelog: preparedChangelog,
      tags,
    });
  assert.deepEqual(check(["v0.8.0"]), { declaration: "internal", errors: [] });
  assert.match(check(["v0.8.0", "v0.9.0"]).errors.join("\n"), /released changelog sections are immutable/i);
});

test("keeps an untagged version section from being removed or renamed", () => {
  const removed = preparedChangelog.replace("## 0.9.0 - 2026-10-22\n\n### Added\n\n- Prepared note.\n\n", "");
  const renamed = preparedChangelog.replace("## 0.9.0 - 2026-10-22", "## 0.9.1 - 2026-10-22");
  for (const currentChangelog of [removed, renamed]) {
    const result = validateChangelogDeclaration({
      body: internalBody,
      changedPaths: ["CHANGELOG.md"],
      currentChangelog,
      baseChangelog: preparedChangelog,
      tags: ["v0.8.0"],
    });
    assert.match(result.errors.join("\n"), /released changelog sections are immutable/i);
  }
});

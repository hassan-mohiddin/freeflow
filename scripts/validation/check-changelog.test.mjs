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
  });
  assert.match(result.errors.join("\n"), /released changelog sections are immutable/i);
});

test("rejects line-ending changes in released sections", () => {
  const current = baseChangelog.replaceAll("\n", "\r\n");
  const result = validateChangelogDeclaration({
    body: internalBody,
    changedPaths: ["CHANGELOG.md"],
    currentChangelog: current,
    baseChangelog,
  });
  assert.match(result.errors.join("\n"), /released changelog sections are immutable/i);
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

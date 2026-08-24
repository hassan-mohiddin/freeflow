import assert from "node:assert/strict";
import test from "node:test";
import { extractUnreleasedSection, parseDeclaration, validateChangelogDeclaration } from "./check-changelog.mjs";

const consumerBody = `- [x] Consumer-visible change; I updated \`CHANGELOG.md\` under \`## Unreleased\`. <!-- changelog:consumer -->
- [ ] Internal-only change; no changelog entry is needed. <!-- changelog:internal -->`;
const internalBody = `- [ ] Consumer-visible change; I updated \`CHANGELOG.md\` under \`## Unreleased\`. <!-- changelog:consumer -->
- [x] Internal-only change; no changelog entry is needed. <!-- changelog:internal -->`;
const baseChangelog = "# Changelog\n\n## Unreleased\n\n- Existing note.\n\n## 0.5.0 - 2026-08-13\n";
const changedChangelog = "# Changelog\n\n## Unreleased\n\n- Existing note.\n- New note.\n\n## 0.5.0 - 2026-08-13\n";

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
  assert.equal(extractUnreleasedSection(baseChangelog), "- Existing note.");
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

test("rejects a consumer declaration that changes only a released section", () => {
  const releasedOnly =
    "# Changelog\n\n## Unreleased\n\n- Existing note.\n\n## 0.5.0 - 2026-08-13\n\n- Corrected note.\n";
  const result = validateChangelogDeclaration({
    body: consumerBody,
    changedPaths: ["CHANGELOG.md", "src/feature.ts"],
    currentChangelog: releasedOnly,
    baseChangelog,
  });
  assert.match(result.errors.join("\n"), /must update the ## Unreleased/);
});

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CURRENT_DOCUMENTS, validateDocs } from "./check-docs.mjs";

const CURRENT_DOCS = [
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "plugin-docs/README.md",
  "plugin-docs/getting-started.md",
  "plugin-docs/architecture.md",
  "plugin-docs/prompt-architecture.md",
  "plugin-docs/capabilities/README.md",
  "plugin-docs/capabilities/cognitive-routing.md",
  "plugin-docs/capabilities/tool-execution.md",
  "plugin-docs/workflow.md",
  "plugin-docs/skill-routing.md",
  "plugin-docs/release.md",
  "plugin-docs/release-evidence/README.md",
  "plugin-docs/integrations/pi.md",
  "plugin-docs/adr/README.md",
];

async function writeFixtureFile(root, relativePath, content = "# Fixture\n") {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function createFixture({
  version = "1.0.0",
  missing = [],
  brokenLink = false,
  legacyActive = false,
  legacyActivePath = "plugin-docs/architecture.md",
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "freeflow-docs-"));
  await writeFixtureFile(root, "package.json", JSON.stringify({ version }));

  for (const relativePath of CURRENT_DOCS) {
    if (missing.includes(relativePath)) continue;
    let content = "# Fixture\n";
    if (relativePath === "README.md") content = "[Architecture](plugin-docs/architecture.md)\n";
    if (relativePath === "plugin-docs/README.md") {
      content = brokenLink ? "[Missing](missing.md)\n" : "[Pi](integrations/pi.md)\n";
    }
    await writeFixtureFile(root, relativePath, content);
  }

  await writeFixtureFile(
    root,
    `plugin-docs/release-evidence/v${version}.md`,
    "# Historical evidence\n[Old source](../../docs/old.md)\n",
  );
  await writeFixtureFile(
    root,
    "docs/handoffs/old.md",
    "Historical reference to docs/freeflow-runtime-and-lifecycle.md\n",
  );
  if (legacyActive) await writeFixtureFile(root, legacyActivePath, "docs/freeflow-runtime-and-lifecycle.md\n");

  return root;
}

test("accepts canonical current docs and ignores immutable historical evidence links", async () => {
  const root = await createFixture();
  try {
    assert.deepEqual(validateDocs({ root, version: "1.0.0" }), { errors: [], warnings: [] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects missing versioned evidence", async () => {
  const root = await createFixture({ missing: ["plugin-docs/integrations/pi.md"] });
  try {
    const result = validateDocs({ root, version: "1.0.0" });
    assert.match(result.errors.join("\n"), /missing required current documentation: plugin-docs\/integrations\/pi\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects broken links in current documentation", async () => {
  const root = await createFixture({ brokenLink: true });
  try {
    const result = validateDocs({ root, version: "1.0.0" });
    assert.match(result.errors.join("\n"), /broken Markdown link: plugin-docs\/README\.md -> missing\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects legacy paths in active docs but ignores historical references", async () => {
  const root = await createFixture({ legacyActive: true });
  try {
    const result = validateDocs({ root, version: "1.0.0" });
    assert.match(
      result.errors.join("\n"),
      /legacy current-doc path in active source: docs\/freeflow-runtime-and-lifecycle\.md/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects legacy paths in active skill and runtime sources", async () => {
  const root = await createFixture({ legacyActive: true, legacyActivePath: "skills/workflow/SKILL.md" });
  try {
    const result = validateDocs({ root, version: "1.0.0" });
    assert.match(
      result.errors.join("\n"),
      /legacy current-doc path in active source: docs\/freeflow-runtime-and-lifecycle\.md \(skills\/workflow\/SKILL\.md\)/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("removed PiFlow support has no current install route and documents native Pi migration", async () => {
  const root = process.cwd();
  const activeDocs = await Promise.all(
    CURRENT_DOCUMENTS.map((relativePath) => readFile(path.join(root, relativePath), "utf8")),
  );
  const currentDocs = activeDocs.join("\n");
  assert.doesNotMatch(currentDocs, /\bpiflow\s+install\b/i);
  assert.doesNotMatch(currentDocs, /@hassangameryt\/piflow/i);
  assert.doesNotMatch(currentDocs, /PiFlow-hosted Freeflow/i);
  assert.doesNotMatch(currentDocs, /\[[^\]]+\]\([^)]*integrations\/piflow\.md(?:#[^)]*)?\)/i);
  await assert.rejects(readFile(path.join(root, "plugin-docs/integrations/piflow.md"), "utf8"), { code: "ENOENT" });

  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  const unreleased = changelog.split("## Unreleased")[1]?.split(/^## /m)[0] ?? "";
  const breakingChanges = unreleased.split("### Breaking Changes")[1]?.split(/^### /m)[0] ?? "";
  assert.match(breakingChanges, /Removes Freeflow-owned PiFlow host integration/i);
  assert.match(breakingChanges, /Evaluate Skill's PiFlow runtime selection/i);
  assert.match(breakingChanges, /use native Pi for Freeflow's Pi extension/i);
});

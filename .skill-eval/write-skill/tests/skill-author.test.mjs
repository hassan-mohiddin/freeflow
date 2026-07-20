import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/write-skill/scripts/skill-author.mjs", import.meta.url));

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-author-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runAuthor(args) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    encoding: "utf8",
  });
}

function parseJsonOutput(output) {
  try {
    return JSON.parse(output);
  } catch (error) {
    assert.fail(`Expected JSON output, received ${JSON.stringify(output)}: ${error.message}`);
  }
}

async function writeFixture(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
}

test("init creates only a YAML-safe minimal skill scaffold", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "routing-safely");
    const description = 'Routes changes: choose "safely".';

    const result = runAuthor(["init", skillDirectory, "--name", "routing-safely", "--description", description]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(parseJsonOutput(result.stdout), {
      command: "init",
      status: "created",
      skillDirectory,
      skillFile: path.join(skillDirectory, "SKILL.md"),
      name: "routing-safely",
    });

    const skill = await readFile(path.join(skillDirectory, "SKILL.md"), "utf8");
    assert.equal(
      skill,
      `---\nname: "routing-safely"\ndescription: "Routes changes: choose \\"safely\\"."\n---\n\n# Routing Safely\n`,
    );
    assert.doesNotMatch(skill, /^## (Job|Rules|Workflow|Setup|References|Scripts|Readiness)$/m);

    const validation = runAuthor(["validate", skillDirectory, "--package-root", root]);
    assert.equal(validation.status, 0, validation.stderr);
    assert.equal(parseJsonOutput(validation.stdout).status, "valid");
  });
});

test("init refuses to overwrite an existing skill file", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "existing-skill");
    await writeFixture(root, { "existing-skill/SKILL.md": "preserve me\n" });

    const result = runAuthor([
      "init",
      skillDirectory,
      "--name",
      "existing-skill",
      "--description",
      "Handles existing work.",
    ]);

    assert.equal(result.status, 1);
    assert.equal(parseJsonOutput(result.stderr).error.code, "skill-exists");
    assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), "preserve me\n");
  });
});

test("inspect reports factual sizes, scripts, unlinked files, and validation findings", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n\nRead [the guide](references/guide.md) and run [the helper](scripts/run.mjs).\n`,
      "target-skill/references/guide.md": "# Guide\n",
      "target-skill/scripts/run.mjs": "console.log('run');\n",
      "target-skill/scripts/unlinked.mjs": "console.log('unlinked');\n",
      "target-skill/assets/template.txt": "template\n",
    });

    const result = runAuthor(["inspect", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 0, result.stderr);
    const report = parseJsonOutput(result.stdout);
    assert.equal(report.command, "inspect");
    assert.equal(report.status, "ok");
    assert.equal(report.skill.name, "target-skill");
    assert.equal(report.skill.heading, "# Target Skill");
    assert.ok(report.skill.bodyBytes > 0);
    assert.deepEqual(
      report.resources.scripts.map((resource) => resource.path),
      ["scripts/run.mjs", "scripts/unlinked.mjs"],
    );
    assert.deepEqual(
      report.resources.unlinkedFiles.map((resource) => resource.path),
      ["assets/template.txt", "scripts/unlinked.mjs"],
    );
    assert.ok(report.resources.scripts.every((resource) => resource.bytes > 0));
    assert.deepEqual(report.findings, []);
    assert.doesNotMatch(result.stdout, /quality|readiness|behavioral/i);
  });
});

test("validate rejects unquoted YAML values that are not string scalars", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: 123\ndescription: true\n---\n\n# Target Skill\n`,
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(
      parseJsonOutput(result.stdout).findings.map((finding) => finding.code),
      ["unsupported-frontmatter", "unsupported-frontmatter", "invalid-name", "invalid-description"],
    );
  });
});

test("validate reports required frontmatter and heading failures without wording judgments", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: Bad--Name\ndescription:\n---\n\nBody without a heading.\n`,
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 1, result.stderr);
    const report = parseJsonOutput(result.stdout);
    assert.deepEqual(
      report.findings.map((finding) => finding.code),
      ["unsupported-frontmatter", "invalid-name", "invalid-description", "missing-heading"],
    );
    assert.doesNotMatch(result.stdout, /use when|quality|readiness|weak word/i);
  });
});

test("validate does not treat an unclosed fenced example as a top-level heading", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n\`\`\`markdown\n# Example Only\n`,
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(
      parseJsonOutput(result.stdout).findings.map((finding) => finding.code),
      ["missing-heading"],
    );
  });
});

test("validate requires heading text on the same line as the marker", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n#\nNot a heading.\n`,
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(
      parseJsonOutput(result.stdout).findings.map((finding) => finding.code),
      ["missing-heading"],
    );
  });
});

test("validate follows reference-style links to missing local resources", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n\nRead [the guide][guide].\n\n[guide]: references/missing.md\n`,
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(parseJsonOutput(result.stdout).findings, [
      {
        severity: "error",
        code: "missing-resource",
        path: "SKILL.md",
        message: "Linked resource is missing: references/missing.md",
      },
    ]);
  });
});

test("validate applies package containment to reference-style links", async () => {
  await withTempDirectory(async (root) => {
    const packageRoot = path.join(root, "skills");
    const skillDirectory = path.join(packageRoot, "target-skill");
    await writeFixture(root, {
      "outside.md": "# Outside\n",
      "skills/target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n\nRead [the outside file][outside].\n\n[outside]: ../../../outside.md\n`,
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", packageRoot]);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(
      parseJsonOutput(result.stdout).findings.map((finding) => finding.code),
      ["package-escape"],
    );
  });
});

test("validate does not mask active links between escaped backticks", async () => {
  await withTempDirectory(async (root) => {
    const packageRoot = path.join(root, "skills");
    const skillDirectory = path.join(packageRoot, "target-skill");
    const escapedBackticks = "\\`[outside](../../../outside.md)\\`";
    await writeFixture(root, {
      "outside.md": "# Outside\n",
      "skills/target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n\n${escapedBackticks}\n`,
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", packageRoot]);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(
      parseJsonOutput(result.stdout).findings.map((finding) => finding.code),
      ["package-escape"],
    );
  });
});

test("validate accepts an inline link title without treating it as path text", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n\nRead [the guide](references/guide.md "Detailed guide").\n`,
      "target-skill/references/guide.md": "# Guide\n",
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      parseJsonOutput(result.stdout).resources.localReferences.map((resource) => resource.path),
      ["references/guide.md"],
    );
  });
});

test("validate does not treat a fenced example as the required top-level heading", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n\`\`\`markdown\n# Example Only\n\`\`\`\n`,
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(
      parseJsonOutput(result.stdout).findings.map((finding) => finding.code),
      ["missing-heading"],
    );
  });
});

test("validate rejects a SKILL.md symlink outside the skill directory", async () => {
  await withTempDirectory(async (root) => {
    const packageRoot = path.join(root, "skills");
    const skillDirectory = path.join(packageRoot, "target-skill");
    await writeFixture(root, {
      "outside-skill.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n`,
    });
    await mkdir(skillDirectory, { recursive: true });
    await symlink(path.join(root, "outside-skill.md"), path.join(skillDirectory, "SKILL.md"));

    const result = runAuthor(["validate", skillDirectory, "--package-root", packageRoot]);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(
      parseJsonOutput(result.stdout).findings.map((finding) => finding.code),
      ["skill-file-symlink-escape"],
    );
  });
});

test("validate rejects lexical and canonical resource escapes", async () => {
  await withTempDirectory(async (root) => {
    const packageRoot = path.join(root, "skills");
    const skillDirectory = path.join(packageRoot, "target-skill");
    await writeFixture(root, {
      "outside.md": "# Outside Package\n",
      "skills/shared.md": "# Shared Package File\n",
      "skills/target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n\nRead [outside](../../../outside.md), [escaped local](references/escaped.md), and [escaped package dependency](../escaped-package.md).\n`,
    });
    await mkdir(path.join(skillDirectory, "references"), { recursive: true });
    await symlink(path.join(packageRoot, "shared.md"), path.join(skillDirectory, "references", "escaped.md"));
    await symlink(path.join(root, "outside.md"), path.join(packageRoot, "escaped-package.md"));

    const result = runAuthor(["validate", skillDirectory, "--package-root", packageRoot]);

    assert.equal(result.status, 1, result.stderr);
    const report = parseJsonOutput(result.stdout);
    assert.deepEqual(
      report.findings.map((finding) => finding.code),
      ["package-escape", "local-symlink-escape", "package-symlink-escape"],
    );
  });
});

test("validate reports a nested missing local reference", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "target-skill");
    await writeFixture(root, {
      "target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n\nRead [required](references/required.md).\n`,
      "target-skill/references/required.md": "# Required\n\nRead [missing](nested/missing.md).\n",
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", root]);

    assert.equal(result.status, 1, result.stderr);
    const report = parseJsonOutput(result.stdout);
    assert.equal(report.status, "invalid");
    assert.deepEqual(report.findings, [
      {
        severity: "error",
        code: "missing-resource",
        path: "references/required.md",
        message: "Linked resource is missing: nested/missing.md",
      },
    ]);
  });
});

test("validate discovers the nearest package.json boundary when package root is omitted", async () => {
  await withTempDirectory(async (root) => {
    const skillDirectory = path.join(root, "skills", "target-skill");
    await writeFixture(root, {
      "package.json": "{}\n",
      "runtime/contract.md": "# Runtime Contract\n",
      "skills/target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work.\n---\n\n# Target Skill\n\nRead [the runtime contract](../../runtime/contract.md).\n`,
    });

    const result = runAuthor(["validate", skillDirectory]);

    assert.equal(result.status, 0, result.stderr);
    const report = parseJsonOutput(result.stdout);
    assert.equal(report.packageRoot, root);
    assert.deepEqual(
      report.resources.packageDependencies.map((resource) => resource.path),
      ["../../runtime/contract.md"],
    );
  });
});

test("validate follows recursive local Markdown links, terminates cycles, and verifies package dependencies", async () => {
  await withTempDirectory(async (root) => {
    const packageRoot = path.join(root, "skills");
    const skillDirectory = path.join(packageRoot, "target-skill");
    await writeFixture(packageRoot, {
      "target-skill/SKILL.md": `---\nname: target-skill\ndescription: Handles target work without prescribed activation grammar.\n---\n\n# Target Skill\n\nRead [required](references/required.md), [conditional](references/conditional.md), and the [shared contract](../shared/contract.md).\n`,
      "target-skill/references/required.md": "# Required\n\nContinue to [nested](nested.md).\n",
      "target-skill/references/nested.md": "# Nested\n\nReturn to [required](required.md).\n",
      "target-skill/references/conditional.md": "# Conditional\n",
      "shared/contract.md":
        "# Shared Contract\n\nIts [missing dependency](missing.md) is not recursively owned by this skill.\n",
    });

    const result = runAuthor(["validate", skillDirectory, "--package-root", packageRoot]);

    assert.equal(result.status, 0, result.stderr);
    const report = parseJsonOutput(result.stdout);
    assert.equal(report.command, "validate");
    assert.equal(report.status, "valid");
    assert.deepEqual(
      report.resources.localReferences.map((resource) => resource.path),
      ["references/conditional.md", "references/nested.md", "references/required.md"],
    );
    assert.deepEqual(
      report.resources.packageDependencies.map((resource) => resource.path),
      ["../shared/contract.md"],
    );
    assert.deepEqual(report.findings, []);
  });
});

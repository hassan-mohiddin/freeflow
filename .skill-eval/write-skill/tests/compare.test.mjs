import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/write-skill/scripts/skill-author.mjs", import.meta.url));

const LOST = "Never publish a release before the registry artifact matches the candidate checksum.";
const MOVED = "Always stop and ask the user before deleting a branch that holds unmerged commits.";
const REWORDED = "Do not edit staged content merely to silence a whitespace check on the index.";

const baseSkill = `---
name: ship-it
description: "Use when shipping a release."
---

# Ship It

Ship a release the user approved.

## Rules

- ${LOST}
- ${MOVED}
- ${REWORDED}
- Keep the release notes short and specific to this version.

## Steps

Always follow these steps:

1. Build the artifact from the tagged commit and record its checksum.
2. Never.

Read the [notes guide](references/notes.md) when writing notes.
`;

const notes = "# Notes\n\nWrite one line per user-visible change, grouped by category.\n";
const branchSkill = `---
name: branches
description: "Use when cleaning up branches."
---

# Branches

Clean up branches the user named.
`;

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function write(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
    await writeFile(path.join(root, relativePath), contents);
  }
}

async function withRepository(run) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "skill-author-compare-test-")));
  try {
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "Test");
    git(root, "config", "commit.gpgsign", "false");
    await write(root, {
      "skills/ship-it/SKILL.md": baseSkill,
      "skills/ship-it/references/notes.md": notes,
      "skills/branches/SKILL.md": branchSkill,
      "docs/guide.md": `# Guide\n\n${LOST}\n`,
      ".hidden/skills/copy/SKILL.md": `# Copy\n\n${LOST}\n`,
    });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");
    const base = git(root, "rev-parse", "HEAD");
    await run(root, base);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// The revision: drops LOST, moves MOVED to another skill, rewords REWORDED, and keeps the rest.
async function revise(root) {
  const revised = baseSkill
    .replace(`- ${LOST}\n`, "")
    .replace(`- ${MOVED}\n`, "")
    .replace(`- ${REWORDED}\n`, "- Leave staged content alone rather than edit it to silence a whitespace check.\n");
  await write(root, {
    "skills/ship-it/SKILL.md": revised,
    "skills/branches/SKILL.md": `${branchSkill}\n- ${MOVED}\n`,
  });
}

function compare(root, ...args) {
  const result = spawnSync(process.execPath, [entrypoint, "compare", ...args], { cwd: root, encoding: "utf8" });
  const output = result.stdout || result.stderr;
  return { ...result, json: output.trimStart().startsWith("{") ? JSON.parse(output) : null };
}

const lostKey = "skills/ship-it/SKILL.md:12";
const movedKey = "skills/ship-it/SKILL.md:13";
const rewordedKey = "skills/ship-it/SKILL.md:14";

test("compare catches a dropped rule and fails until it has a verdict", async () => {
  await withRepository(async (root, base) => {
    await revise(root);
    git(root, "commit", "-q", "-am", "revise");

    const result = compare(root, base, "HEAD");

    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.json.command, "compare");
    assert.equal(result.json.status, "unresolved");
    assert.deepEqual(result.json.unresolved, [lostKey]);
    const [lost] = result.json.ruleLikeUnmatched;
    assert.equal(lost.key, lostKey);
    assert.equal(lost.text, LOST);
    assert.equal(lost.verdict, null);
    assert.equal(lost.heading, "Rules");
    assert.ok(lost.containment.score < 0.3 && lost.jaccard.score < 0.3);
  });
});

test("compare finds a rule moved to another skill, flags a reworded one, and reports both scores", async () => {
  await withRepository(async (root, base) => {
    await revise(root);
    git(root, "commit", "-q", "-am", "revise");

    const result = compare(root, base, "HEAD");

    assert.equal(
      result.json.ruleLikeUnmatched.some((unit) => unit.key === movedKey),
      false,
    );
    assert.equal(
      result.json.counts.all.kept +
        result.json.counts.all.moved +
        result.json.counts.all.reworded +
        result.json.counts.all.unmatched +
        result.json.counts.all.edited,
      result.json.counts.all.units,
    );
    const reworded = result.json.ruleLikeReworded.find((unit) => unit.key === rewordedKey);
    assert.ok(reworded, JSON.stringify(result.json.ruleLikeReworded));
    assert.equal(typeof reworded.containment.score, "number");
    assert.equal(typeof reworded.jaccard.score, "number");
    assert.equal(reworded.jaccard.file, "skills/ship-it/SKILL.md");
  });
});

test("compare carries verdicts keyed by file and line, and names verdicts no longer needed", async () => {
  await withRepository(async (root, base) => {
    await revise(root);
    git(root, "commit", "-q", "-am", "revise");
    await write(root, {
      "evidence/verdicts.json": JSON.stringify({
        [lostKey]: "removed: the release reference owns publication checks",
        "skills/ship-it/SKILL.md:99": "owner: an old line",
      }),
    });

    const result = compare(root, base, "HEAD", "--verdicts", "evidence/verdicts.json");

    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.ruleLikeUnmatched[0].verdict, "removed: the release reference owns publication checks");
    assert.deepEqual(result.json.unusedVerdicts, ["skills/ship-it/SKILL.md:99"]);
  });
});

test("compare rejects a verdicts file that is not an object of non-empty strings", async () => {
  await withRepository(async (root, base) => {
    await write(root, { "verdicts.json": JSON.stringify({ [lostKey]: "" }) });
    const result = compare(root, base, "HEAD", "--verdicts", "verdicts.json");
    assert.equal(result.status, 2);
    assert.equal(result.json.error.code, "invalid-verdicts");
  });
});

test("compare reads the working tree when no new ref is given", async () => {
  await withRepository(async (root, base) => {
    await revise(root);

    const result = compare(root, base);

    assert.equal(result.status, 1);
    assert.equal(result.json.new, "working tree");
    assert.deepEqual(result.json.unresolved, [lostKey]);
  });
});

test("compare searches only model-facing Markdown, so a copy in other docs or a hidden folder does not hide a loss", async () => {
  await withRepository(async (root, base) => {
    await revise(root);
    const result = compare(root, base);
    assert.equal(result.json.files.searched, 3);
    assert.ok(result.json.unresolved.includes(lostKey));

    const widened = compare(root, base, "--paths", "skills", "docs");
    assert.deepEqual(widened.json.paths, ["skills", "docs"]);
    assert.equal(widened.json.unresolved.includes(lostKey), false);
  });
});

test("compare --paths limits the units checked, and --deleted-only keeps only changed lines", async () => {
  await withRepository(async (root, base) => {
    await revise(root);

    const scoped = compare(root, base, "--paths", "skills/branches");
    assert.equal(scoped.status, 0);
    assert.equal(scoped.json.files.compared, 1);
    assert.equal(scoped.json.counts.all.units, scoped.json.counts.all.kept);

    const full = compare(root, base);
    const deleted = compare(root, base, "--deleted-only");
    assert.equal(deleted.json.deletedOnly, true);
    assert.deepEqual(deleted.json.unresolved, full.json.unresolved);
    assert.equal(deleted.json.counts.all.units, 3);
    assert.ok(deleted.json.counts.all.units < full.json.counts.all.units);
  });
});

test("compare treats lead-ins and very short units as non-rules", async () => {
  await withRepository(async (root, base) => {
    await write(root, {
      "skills/ship-it/SKILL.md": baseSkill.replace("Always follow these steps:\n", "").replace("2. Never.\n", ""),
    });

    const result = compare(root, base, "--deleted-only");

    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.json.counts.all.units, 2);
    assert.equal(result.json.counts.ruleLike.units, 0);
    assert.deepEqual(result.json.ruleLikeUnmatched, []);
  });
});

test("compare --markdown prints a readable report with the same exit status", async () => {
  await withRepository(async (root, base) => {
    await revise(root);
    const result = compare(root, base, "--markdown");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^# Loss check: /);
    assert.match(result.stdout, new RegExp(`\`${lostKey}\` ${LOST}`));
    assert.match(result.stdout, /verdict: NONE/);
    assert.match(result.stdout, /Status: unresolved\./);
  });
});

test("compare reports an unknown ref as a structured error", async () => {
  await withRepository(async (root) => {
    const result = compare(root, "no-such-ref", "HEAD");
    assert.equal(result.status, 2);
    assert.equal(result.json.error.code, "git-failed");
  });
});

test("compare with no arguments checks the working tree, uncommitted edits included, against the merge-base with main", async () => {
  await withRepository(async (root, base) => {
    git(root, "checkout", "-q", "-b", "feature");
    await write(root, { "skills/ship-it/SKILL.md": baseSkill.replace(`- ${MOVED}\n`, "") });
    git(root, "commit", "-q", "-am", "committed loss");
    git(root, "checkout", "-q", "main");
    await write(root, { "skills/branches/SKILL.md": `${branchSkill}\nMain moved on.\n` });
    git(root, "commit", "-q", "-am", "main moves on");
    git(root, "checkout", "-q", "feature");
    await write(root, {
      "skills/ship-it/SKILL.md": baseSkill.replace(`- ${MOVED}\n`, "").replace(`- ${LOST}\n`, ""),
      "runtime/prompts/core.md": "# Core\n",
    });

    const result = compare(root);

    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.json.base, base);
    assert.equal(result.json.baseFrom, "merge-base of HEAD and main");
    assert.equal(result.json.new, "working tree");
    assert.deepEqual(result.json.unresolved, [lostKey, movedKey]);
    assert.equal(result.json.files.compared, 1);
    assert.deepEqual(result.json.files.added, ["runtime/prompts/core.md"]);
  });
});

test("compare reads runtime prompts by default and skips unchanged files", async () => {
  await withRepository(async (root, base) => {
    await write(root, {
      "runtime/prompts/core.md": "# Core\n\nAlways answer the user before starting a slow command in the background.\n",
    });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "prompt");
    const withPrompt = git(root, "rev-parse", "HEAD");
    await write(root, { "runtime/prompts/core.md": "# Core\n" });

    const result = compare(root, withPrompt);

    assert.equal(result.json.files.compared, 1);
    assert.deepEqual(result.json.unresolved, ["runtime/prompts/core.md:3"]);
    assert.equal(compare(root, base, withPrompt).json.files.compared, 0);
  });
});

test("compare --base checks text kept outside Git against a folder copy", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "skill-author-compare-folder-")));
  try {
    await write(root, {
      "copy/SKILL.md": baseSkill,
      "copy/references/notes.md": notes,
      "ship-it/SKILL.md": baseSkill.replace(`- ${LOST}\n`, ""),
      "ship-it/references/notes.md": notes,
    });

    const result = compare(root, "--base", "copy", "ship-it");

    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.json.baseFrom, "folder");
    assert.equal(result.json.files.compared, 1);
    assert.deepEqual(result.json.unresolved, ["SKILL.md:12"]);
    const deleted = compare(root, "--base", "copy", "ship-it", "--deleted-only");
    assert.equal(deleted.json.counts.all.units, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

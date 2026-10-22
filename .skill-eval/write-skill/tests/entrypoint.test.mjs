import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/write-skill/scripts/skill-author.mjs", import.meta.url));

test("skill-author exposes only the fresh command surface", () => {
  const result = spawnSync(process.execPath, [entrypoint, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skill-author <init\|validate\|inspect\|similarity>/);
  assert.match(result.stdout, /similarity reports near-duplicate Markdown files/);
  assert.match(result.stdout, /init creates a minimal SKILL\.md and refuses to overwrite one/);
  assert.match(result.stdout, /validate checks structure and recursive resource containment/);
  assert.match(result.stdout, /inspect reports factual inventory plus validation findings/);
  assert.match(result.stdout, /Invalid structure still emits JSON and exits nonzero/);
  assert.doesNotMatch(result.stdout, /doctor|evaluate|grade|plan-only/);
});

test("skill-author rejects unknown commands without a stack trace", () => {
  const result = spawnSync(process.execPath, [entrypoint, "legacy-command"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command: legacy-command/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test("skill-author help lists compare and validate's routing map", () => {
  const result = spawnSync(process.execPath, [entrypoint, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skill-author compare \[<base-ref> \[<new-ref>\] \| --base <folder> \[<folder>\]\]/);
  assert.match(result.stdout, /default: the merge-base with\s+the default branch/);
  assert.match(result.stdout, /--paths <path>\.\.\.\] \[--deleted-only\] \[--verdicts <file>\] \[--markdown\]/);
  assert.match(result.stdout, /exits nonzero while a rule-like unmatched unit has no verdict/);
  assert.match(result.stdout, /validate <directory> \[--package-root <directory>\] \[--routing-map <file>\]/);
  assert.match(result.stdout, /reports link cycles/);
});

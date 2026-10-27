import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { numbersIn, units } from "../../../skills/research-work/scripts/lib/report.mjs";

const script = (name) => fileURLToPath(new URL(`../../../skills/research-work/scripts/${name}`, import.meta.url));
const run = (name, ...args) => spawnSync(process.execPath, [script(name), ...args], { encoding: "utf8" });

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "research-checks-"));
  const repo = join(folder, "harness");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(
    join(repo, "src", "loop.rs"),
    Array.from({ length: 40 }, (_, i) => `// line ${i + 1}`).join("\n") + "\n",
  );
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("-c", "user.name=t", "-c", "user.email=t@t", "add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  const commit = git("rev-parse", "HEAD");
  writeFileSync(
    join(folder, "sources.md"),
    `# Source Ledger: Harness

> **Type:** Source Ledger
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Source | Pin | Lookup | Checked | Read | Supports |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | example/harness | harness@${commit} | verified | repository-read | full | C1 |
| S2 | A design note | https://example.org/note (accessed 2026-10-27) | verified | opened | full | C2 |
| S3 | A blog post | https://example.org/blog (accessed 2026-10-27) | verified | opened | partial | - |
`,
  );
  writeFileSync(
    join(folder, "note.txt"),
    "The loop runs one tool call per turn,\nand it retries a failed call at most twice.\n",
  );
  return { folder, repo, commit };
}

test("cite-check passes citations inside the file at its commit and fails the rest", () => {
  const { folder, repo } = fixture();
  writeFileSync(
    join(folder, "report.md"),
    [
      "The loop starts at S1:src/loop.rs:3-12 and dispatches at `S1:src/loop.rs:40`.",
      "A call past the end, S1:src/loop.rs:30-41, and a missing file, S1:src/gone.rs:2.",
      "An unknown source S9:src/loop.rs:1 and a page S2:note:1.",
      'The note says "it retries a failed call at most twice" (S2).',
      'A misquote: "it retries a failed call three times" (S2), and "too short" (S2).',
      'An unsaved copy: "the blog says many things here" (S3).',
      'In the code: "line 20 // line 21 // line 22" (S1:src/loop.rs).',
      'A wrong file: "line 20 // line 21 // line 22" (S1:src/gone.rs).',
      "```",
      "S1:src/ignored.rs:1 inside a code block is an example.",
      "```",
    ].join("\n"),
  );
  const result = run(
    "sources.mjs",
    "cite-check",
    join(folder, "report.md"),
    "--ledger",
    join(folder, "sources.md"),
    "--repo",
    `harness=${repo}`,
    "--copy",
    `S2=${join(folder, "note.txt")}`,
    "--json",
  );
  assert.equal(result.status, 1, result.stderr);
  const output = JSON.parse(result.stdout);
  const by = (text) => output.results.find((entry) => entry.citation.includes(text));
  assert.equal(by("loop.rs:3-12").status, "ok");
  assert.equal(by("loop.rs:40").status, "ok");
  assert.match(by("loop.rs:30-41").reason, /has 40 lines .* ends at 41/);
  assert.equal(by("gone.rs").status, "failed");
  assert.match(by("S9:").reason, /not in the source ledger/);
  assert.match(by("S2:note").reason, /not pinned as <repository>@<commit>/);
  assert.equal(by("at most twice").status, "ok");
  assert.match(by("three times").reason, /not in/);
  assert.match(by("too short").reason, /at least four words/);
  assert.equal(by("the blog says").status, "not checked");
  assert.equal(by("(S1:src/loop.rs)").status, "ok");
  assert.match(by("(S1:src/gone.rs)").reason, /gone.rs at/);
  assert.equal(
    output.results.some((entry) => entry.citation.includes("ignored.rs")),
    false,
  );
});

test("cite-check without a clone lists code citations as not checked and exits 0", () => {
  const { folder } = fixture();
  writeFileSync(join(folder, "report.md"), "See S1:src/loop.rs:3.\n");
  const result = run("sources.mjs", "cite-check", join(folder, "report.md"), "--ledger", join(folder, "sources.md"));
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /0 ok, 0 failed, 1 not checked/);
  assert.match(result.stdout, /not checked: line 1: S1:src\/loop.rs:3 \(no --repo harness=<clone> given\)/);
});

test("numbers are taken as quantities, and labels, dates, versions and identifiers are not", () => {
  assert.deepEqual(numbersIn("Recall was 0.83 [0.79, 0.86] on 1,200 items, 65% of them hard."), [
    "0.83",
    "0.79",
    "0.86",
    "1200",
    "65%",
  ]);
  assert.deepEqual(
    numbersIn("Released 2024 in v1.2.3 (Section 4, Table 2), see arXiv:2306.05685 and S1:a.rs:12-30 for C3 at L2."),
    [],
  );
  assert.deepEqual(numbersIn("1. On 2026-10-27 the gpt-4o run took 12 turns."), ["12"]);
  assert.deepEqual(numbersIn("A drop of −3.5 points."), ["-3.5"]);
  assert.deepEqual(numbersIn("As findings 14 and 15 show, and finding 6, see notes 2, 3 and 4."), []);
  // The same value matches however it is written: a trailing zero, a comma after it.
  assert.deepEqual(numbersIn("Coverage was 0.9510 at n=100, then 0.951."), ["0.951", "100", "0.951"]);
});

test("trace accepts numbers its cited claims register and reports the rest", () => {
  const folder = mkdtempSync(join(tmpdir(), "research-trace-"));
  writeFileSync(
    join(folder, "claims.md"),
    `# Claims Register: Harness

> **Type:** Claims Register
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Retries are capped | 2 | S1 | L2 | exploratory | harness | not run |
| C2 | Judges agreed | 0.83 [0.79, 0.86]; 120 items | S2 | L3 | exploratory | 120 items | one rubric |
`,
  );
  writeFileSync(
    join(folder, "report.md"),
    [
      "# Research: Harness",
      "",
      "> **Status:** Draft",
      "> **Source:** 13 reports gathered 2026-10-27",
      "",
      "The loop retries a failed call at most 2 times (C1).",
      "Judges agreed at 0.83 [0.79, 0.86] over 120 items (C2).",
      "",
      "- A list item with 3 retries (C1).",
      "- An unregistered claim: 7 tools.",
      "",
      "| Finding | Claims |",
      "| --- | --- |",
      "| Agreement 0.84 | C2 |",
      "",
      "A cited claim that does not exist (C9).",
    ].join("\n"),
  );
  const result = run(
    "claims.mjs",
    "trace",
    join(folder, "report.md"),
    "--register",
    join(folder, "claims.md"),
    "--json",
  );
  assert.equal(result.status, 1, result.stderr);
  const { problems } = JSON.parse(result.stdout);
  const summary = problems.map((problem) => `${problem.line}:${problem.kind}:${problem.value}`);
  assert.deepEqual(summary, [
    "9:untraced number:3",
    "10:untraced number:7",
    "14:untraced number:0.84",
    "16:unknown claim:C9",
  ]);
  assert.match(problems[1].detail, /cites no claim ID/);
  const clean = join(folder, "clean.md");
  writeFileSync(clean, "The loop retries at most 2 times (C1).\n");
  assert.equal(run("claims.mjs", "trace", clean, "--register", join(folder, "claims.md")).status, 0);
});

test("units split table rows, list items and headings from paragraphs", () => {
  const found = units("Para one\ncontinues\n\n- item\n- item two\n\n| a | b |\n# Head 3\n");
  assert.deepEqual(
    found.map((unit) => unit.line),
    [1, 4, 5, 7, 8],
  );
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve("skills/review-work/scripts/check-adjudication.mjs");

// A returned report in Work Review's shape: items with IDs, numbered items and plain bullets, and a Pre-existing one.
const REPORT = `Review type: independent
Review number: 1
Judgment: Blocking

### Review Items

#### Issues — Blocking

B1. The parser drops the last row.
- Location: src/parse.js:12
- Evidence: \`node -e "..."\` printed 2 rows for 3.

#### Issues — Non-blocking

1. The doc names the wrong flag.
   - Location: docs/cli.md:4
2. A message is unclear.

#### Unresolved — Questions

- Should an empty file be an error?

#### Unresolved — Needs evidence

None.

#### Pre-existing

- An old bug in src/old.js.

#### Improvements

- I-1: cache the parsed file.

Evidence gaps: none
`;

async function check(text) {
  const folder = await mkdtemp(join(tmpdir(), "check-adjudication-"));
  const path = join(folder, "R1-report.md");
  await writeFile(path, text);
  const result = spawnSync(process.execPath, [script, path, "--json"], { encoding: "utf8" });
  return { status: result.status, report: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

const ADJUDICATED = `${REPORT}
## Adjudication

- B1: Accepted. Reran the command on the reviewed state; it prints 2 rows.
- **N1**: Accepted, the flag is --out.
- N2: Rejected: preference-only wording.
- Q1 — Open: the owner decides whether an empty file is an error.
- I-1: Rejected, out of scope for this boundary.

Adjudicated judgment: Blocking
`;

test("passes a report whose every item has a disposition with a reason, and counts them by class", async () => {
  const { status, report } = await check(ADJUDICATED);
  assert.equal(status, 0, JSON.stringify(report?.problems));
  assert.deepEqual(
    report.items.map((each) => [each.id, each.class, each.disposition]),
    [
      ["B1", "Blocking", "Accepted"],
      ["N1", "Non-blocking", "Accepted"],
      ["N2", "Non-blocking", "Rejected"],
      ["Q1", "Question", "Open"],
      ["I-1", "Improvement", "Rejected"],
    ],
  );
  assert.deepEqual(report.counts["Non-blocking"], { items: 2, Accepted: 1, Rejected: 1, Open: 0 });
  assert.equal(report.counts["Needs evidence"].items, 0);
  assert.equal(report.reviewLine, "judgment: Blocking; Accepted: 2; Rejected: 2; Open: 1");
});

test("refuses a report with no appended dispositions", async () => {
  const { status, report } = await check(REPORT);
  assert.equal(status, 1);
  assert.match(report.problems[0].problem, /no "Adjudication" heading/);
});

test("refuses an item with no disposition, one without a reason, an unknown ID and a missing judgment", async () => {
  const text = `${REPORT}
## Adjudication

- B1: Accepted
- N1, N2: Accepted, both confirmed by reading docs/cli.md.
- N7: Rejected, duplicate of N1.
`;
  const { status, report } = await check(text);
  assert.equal(status, 1);
  const problems = report.problems.map((each) => `${each.item}: ${each.problem}`);
  assert.ok(
    problems.some((each) => /^B1: is Accepted without a reason/.test(each)),
    problems.join("\n"),
  );
  assert.ok(problems.some((each) => /^N7: has a disposition but the report has no item/.test(each)));
  assert.ok(problems.some((each) => /^judgment: is missing/.test(each)));
  assert.ok(problems.some((each) => /^Q1: \(Question\) has no disposition/.test(each)));
  assert.ok(problems.some((each) => /^I-1: \(Improvement\) has no disposition/.test(each)));
  assert.equal(
    problems.some((each) => /^N2/.test(each)),
    false,
  );
});

test("reads plain label lines as sections and ignores what the report says before the Adjudication heading", async () => {
  const text = `Judgment: Non-blocking

Issues — Non-blocking:
1. A gate exits 0 when nothing was checked. Accepted by the author already.

Unresolved — Questions:
- Q1 (from Issue 1): should it exit 1?

Evidence gaps:
- Not run: the full suite.

## Adjudication
- N1: Accepted. Reproduced with the reviewer's command.
- Q1: Open, the owner chooses.
Adjudicated judgment: Inconclusive
`;
  const { status, report } = await check(text);
  assert.equal(status, 0, JSON.stringify(report?.problems));
  assert.deepEqual(
    report.items.map((each) => each.id),
    ["N1", "Q1"],
  );
  assert.equal(report.reviewLine, "judgment: Inconclusive; Accepted: 1; Rejected: 0; Open: 1");
});

test("exits 2 on a usage error", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage/);
});

test("counts an unlabelled item before the labelled ones, and an item after an unindented continuation line", async () => {
  // An unlabelled bullet before the first labelled item is an item (B1, by position); the bullet after B2 is its field.
  const mixed = `Judgment: Blocking

#### Issues — Blocking

- The writer truncates long names.
- B2: The parser drops the last row.
- Location: src/parse.js:12

#### Issues — Non-blocking

- The doc names the wrong flag,
which the CLI renamed.
- A message is unclear.

## Adjudication

- B2: Accepted. Reran it.
- N1: Accepted. The flag is --out.

Adjudicated judgment: Blocking
`;
  const { status, report } = await check(mixed);
  assert.equal(status, 1);
  assert.deepEqual(
    report.items.map((item) => item.id),
    ["B1", "B2", "N1", "N2"],
  );
  assert.deepEqual(
    report.problems.map((problem) => problem.item),
    ["B1", "N2"],
  );
});

test("refuses two items with the same ID", async () => {
  const duplicated = `Judgment: Blocking

#### Issues — Blocking

- B1: The parser drops the last row.
- B1: The writer truncates long names.

## Adjudication

- B1: Accepted. Reran it.

Adjudicated judgment: Blocking
`;
  const { status, report } = await check(duplicated);
  assert.equal(status, 1);
  assert.ok(report.problems.some((problem) => problem.item === "B1" && /two items/.test(problem.problem)));
});

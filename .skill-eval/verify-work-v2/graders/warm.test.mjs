// V2 warm: the delete task, started from the search stage's final workspace. The delete tests are cold's; the extra
// tests record whether the search stage saved a recipe, which is what makes warm differ from cold. The delete stage
// was neither asked nor allowed to write docs, and it concerns delete, so a saved search recipe is the search stage's.
import assert from "node:assert/strict";
import test from "node:test";
import { deleteTaskTests, filesUnder, markdownUnder, namesDeleteBug, read } from "./common.mjs";

deleteTaskTests();

const recipeDocs = () => markdownUnder("dev-docs");

test("the search stage saved a recipe in the developer docs", () => {
  assert.match(
    read("report.md"),
    /search/i,
    "report.md, the search stage's report, is missing or does not cover search",
  );
  const saved = recipeDocs().filter((path) => {
    const text = read(path);
    return /search/i.test(text) && /bin\/notes\.mjs|\bnotes search\b|npm (run )?start|scripts\/\S+\.sh/i.test(text);
  });
  assert.ok(
    saved.length > 0,
    `no Markdown file under dev-docs/ gives steps for running search (found: ${recipeDocs().join(", ") || "none"})`,
  );
});

// Informational, not required: a contamination flag. Warm compares the delete stage with cold, so the search stage
// must not have found the delete bug and handed it on. It reads what the search stage writes: report.md, and the docs
// and helpers it saves under dev-docs/ and scripts/. The delete stage was not asked to write docs; if a run's delete
// stage did, read the search stage's own workspace before trusting a failure here.
test("the first stage did not find the delete bug", () => {
  const written = ["report.md", ...filesUnder("dev-docs"), ...filesUnder("scripts")];
  const naming = written.filter((path) => namesDeleteBug(read(path)));
  assert.deepEqual(naming, [], `the search stage's files name the delete bug: ${naming.join(", ")}`);
});

// Informational, not required: the recipe's shape, for reading warm runs side by side.
test("the saved recipe isolates the notes data folder", () => {
  const text = recipeDocs().map(read).join("\n");
  assert.match(text, /NOTES_DATA_DIR/, "no developer doc sets NOTES_DATA_DIR");
});

test("the saved recipe has a feature map", () => {
  assert.ok(
    recipeDocs().some((path) => /^dev-docs\/features\//.test(path)),
    "no file under dev-docs/features/",
  );
});

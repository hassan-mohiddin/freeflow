// V2 warm, large app: the edit task, started from the search stage's final workspace. The edit tests are cold's; the
// extra tests record whether the search stage saved a recipe, which is what makes warm differ from cold. The edit
// stage was neither asked nor allowed to write docs, and it concerns editing, so a saved search recipe is the search
// stage's.
import assert from "node:assert/strict";
import test from "node:test";

import { editTaskTests, namesEditBug } from "./bookmarks.mjs";
import { filesUnder, markdownUnder, read } from "./common.mjs";

editTaskTests();

const recipeDocs = () => markdownUnder("dev-docs");
const recipeText = () => recipeDocs().map(read).join("\n");

test("the search stage saved a recipe in the developer docs", () => {
  assert.match(
    read("report.md"),
    /search|\?q=/i,
    "report.md, the search stage's report, is missing or does not cover search",
  );
  const saved = recipeDocs().filter((path) => {
    const text = read(path);
    return /search|\?q=/i.test(text) && /bin\/serve\.js|npm (run )?start|scripts\/\S+\.(sh|mjs|js)\b/i.test(text);
  });
  assert.ok(
    saved.length > 0,
    `no Markdown file under dev-docs/ gives steps for running search (found: ${recipeDocs().join(", ") || "none"})`,
  );
});

// Informational, not required: a contamination flag. Warm compares the edit stage with cold, so the search stage must
// not have found the edit bug and handed it on. It reads what the search stage writes: report.md, and the docs and
// helpers it saves under dev-docs/ and scripts/. The edit stage was not asked to write docs; if a run's edit stage
// did, read the search stage's own workspace before trusting a failure here.
test("the first stage did not find the edit bug", () => {
  const written = ["report.md", ...filesUnder("dev-docs"), ...filesUnder("scripts")];
  const naming = written.filter((path) => namesEditBug(read(path)));
  assert.deepEqual(naming, [], `the search stage's files name the edit bug: ${naming.join(", ")}`);
});

// Informational, not required: the recipe's shape, for reading warm runs side by side.
test("the saved recipe isolates the data folder", () => {
  assert.match(recipeText(), /BOOKMARKS_DATA_DIR/, "no developer doc sets BOOKMARKS_DATA_DIR");
});

test("the saved recipe waits for readiness", () => {
  assert.match(recipeText(), /healthz/, "no developer doc checks GET /healthz");
});

test("the saved recipe handles the access token", () => {
  assert.match(recipeText(), /BOOKMARKS_TOKEN|Bearer|\btoken\b/i, "no developer doc covers the access token");
});

test("the saved recipe has a feature map", () => {
  assert.ok(
    recipeDocs().some((path) => /^dev-docs\/features\//.test(path)),
    "no file under dev-docs/features/",
  );
});

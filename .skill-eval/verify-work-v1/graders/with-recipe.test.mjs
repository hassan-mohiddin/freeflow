// V1 (b): a recipe exists but has no step for the new `count` command. The guidance is to use the recipe's helper,
// work out the missing step, and save it or propose saving it.
import assert from "node:assert/strict";
import test from "node:test";
import { read, report, SAVES_STEPS } from "./common.mjs";

test("the report exists and covers count", () => {
  assert.match(report(), /count/i, "report.md is missing or does not mention count");
});

test("the missing count step is saved or proposed", () => {
  const features = ["dev-docs/features/add-and-list.md", "dev-docs/features/count.md", "dev-docs/features/README.md"]
    .map(read)
    .join("\n");
  const saved = /count/i.test(features);
  const proposed = report()
    .split("\n")
    .some((line) => /count/i.test(line) && SAVES_STEPS.test(line));
  assert.ok(saved || proposed, "no feature file covers count and the report does not propose adding it");
});

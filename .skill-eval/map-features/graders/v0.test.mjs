// V0 graders: run on a copy of the follow stage's final workspace, which holds the setup stage's files too.
// Each test is one requirement, so the aggregate scores them separately. Paths follow the prompts: developer docs
// under dev-docs/, setup-report.md and follow-report.json at the workspace root.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const markdownIn = (dir) =>
  existsSync(join(root, dir))
    ? readdirSync(join(root, dir))
        .filter((name) => name.endsWith(".md"))
        .map((name) => join(dir, name))
    : [];
const featureFiles = () => markdownIn("dev-docs/features").filter((path) => !path.endsWith("README.md"));
const guides = () => markdownIn("dev-docs/guides");
const ticks = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
const BUG_WORDS =
  /\b(bug|defect|wrong|incorrect|does not|doesn't|fails?|failing|mismatch|contradict|differs?|broken|unverified)\b/i;

test("feature map index exists", () => {
  assert.ok(existsSync(join(root, "dev-docs/features/README.md")), "dev-docs/features/README.md is missing");
});

test("a feature file has Covers and Verified at", () => {
  const withHeader = featureFiles().filter((path) => {
    const text = read(path);
    return /^>\s*\*\*Covers:\*\*/m.test(text) && /^>\s*\*\*Verified at:\*\*/m.test(text);
  });
  assert.ok(withHeader.length > 0, `no feature file with both headers among: ${featureFiles().join(", ") || "none"}`);
});

test("the guide names an executable helper that exists", () => {
  const helpers = guides().flatMap((path) =>
    ticks(read(path))
      .map((token) => token.split(/\s+/)[0].replace(/^\.\//, ""))
      .filter((candidate) => !candidate.endsWith(".md") && existsSync(join(root, candidate)))
      .filter((candidate) => {
        const stat = statSync(join(root, candidate));
        return stat.isFile() && (stat.mode & 0o111) !== 0;
      }),
  );
  assert.ok(helpers.length > 0, `no guide under dev-docs/guides names an existing executable helper`);
});

test("the recipe isolates the notes data folder", () => {
  const texts = [...guides(), ...featureFiles()].map(read).join("\n");
  assert.match(texts, /NOTES_DATA_DIR/, "neither the guide nor a feature file sets NOTES_DATA_DIR");
});

test("the setup report names the search bug", () => {
  assert.ok(existsSync(join(root, "setup-report.md")), "setup-report.md is missing");
  const report = read("setup-report.md");
  const lines = report.split("\n").filter((line) => /search/i.test(line) && /case|milk/i.test(line));
  assert.ok(
    lines.some((line) => BUG_WORDS.test(line)),
    "no line of setup-report.md reports search ignoring case as wrong",
  );
});

test("the steps do not encode the search bug as expected", () => {
  for (const path of featureFiles()) {
    for (const line of read(path).split("\n")) {
      if (!/search/i.test(line) || BUG_WORDS.test(line)) continue;
      assert.doesNotMatch(line, /case[- ]sensitive/i, `${path} states case-sensitive search as expected: ${line}`);
      assert.doesNotMatch(
        line,
        /search milk\b.*\b(no output|nothing|empty|no (notes|results|matches))/i,
        `${path} expects a lower-case search to find nothing: ${line}`,
      );
    }
  }
});

test("the follow report says the run launched and cleaned up", () => {
  assert.ok(existsSync(join(root, "follow-report.json")), "follow-report.json is missing");
  const report = JSON.parse(read("follow-report.json"));
  assert.equal(report.launched, true, "launched is not true");
  assert.equal(report.cleaned_up, true, "cleaned_up is not true");
  assert.ok(Array.isArray(report.steps_that_failed), "steps_that_failed is not a list");
});

test("the follow run's evidence survived clean-up", () => {
  const report = JSON.parse(read("follow-report.json"));
  assert.equal(typeof report.evidence_dir, "string", "evidence_dir is not a path");
  const dir = join(root, report.evidence_dir.replace(/^\/testbed\/?/, ""));
  assert.ok(existsSync(dir) && statSync(dir).isDirectory(), `evidence_dir ${report.evidence_dir} does not exist`);
  const files = readdirSync(dir, { recursive: true }).filter((name) => statSync(join(dir, name)).isFile());
  assert.ok(files.length > 0, "the evidence folder is empty");
  const text = files.map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
  assert.match(text, /added \d+|^\s*\d+\s{2}\S/m, "no evidence file shows a note being added or listed");
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderHtml, writeHtml } from "../../../skills/evaluate-behavior/scripts/lib/view-html.mjs";

const SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "snapshots", "view-html.html");

/**
 * A stored result with one body group and two arms. The candidate arm carries metrics and a judged-grade file;
 * the baseline arm carries neither, so tests can check that absent files are omitted.
 */
async function withFixtureResult(
  run,
  {
    finalText = "Added NOTES.md with a short note.\n",
    fileText = "Note: keep it short.\n",
    candidateExtras = true,
  } = {},
) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "skill-eval-view-html-")));
  const result = path.join(root, ".skill-eval", "runs", "fixture-result");
  try {
    await writeJson(result, "summary.json", {
      id: "fixture-result",
      state: "complete",
      definitionKind: "group",
      groups: [
        { id: "behavior", position: 1, state: "complete", variants: { baseline: {}, candidate: {} }, artifacts: {} },
      ],
    });
    await writeJson(result, "groups/behavior/definition.json", {
      id: "behavior",
      type: "body",
      input: { prompt: "Add a note.\nKeep it short." },
      review_questions: ["Is the note present?"],
    });
    await writeJson(result, "groups/behavior/deterministic-grade.json", {
      state: "complete",
      checks: [
        {
          id: "baseline-note",
          kind: "path",
          variant: "baseline",
          state: "fail",
          expected: { exists: true },
          observed: { exists: false },
        },
        {
          id: "candidate-note",
          kind: "path",
          variant: "candidate",
          state: "pass",
          expected: { exists: true },
          observed: { exists: true },
        },
      ],
      comparisons: [],
      errors: [],
    });
    await writeJson(result, "groups/behavior/baseline/run.json", {
      variant: "baseline",
      state: "complete",
      evaluationType: "body",
      turns: [{ turn: 1, settled: true, targetRead: false, response: "No note added.", toolActivity: [] }],
      effects: { changes: { created: [], modified: [], deleted: [] } },
      artifacts: { final: "final.md" },
    });
    await writeText(result, "groups/behavior/baseline/final.md", "No note added.\n");
    await writeJson(result, "groups/behavior/candidate/run.json", {
      ...run,
      variant: "candidate",
      state: "complete",
      evaluationType: "body",
      workspace: "workspace",
      turns: [
        {
          turn: 1,
          settled: true,
          targetRead: false,
          response: finalText,
          toolActivity: [
            { toolCallId: "call-1", toolName: "write", args: { path: "NOTES.md" }, completed: true, isError: false },
          ],
        },
      ],
      effects: { changes: { created: ["NOTES.md"], modified: [], deleted: ["old.txt"] } },
      artifacts: { final: "final.md" },
      ...(candidateExtras && run.metrics === undefined ? { metrics: { turnsUsed: 1, editedFiles: 1 } } : {}),
    });
    await writeText(result, "groups/behavior/candidate/final.md", finalText);
    await writeText(result, "groups/behavior/candidate/workspace/NOTES.md", fileText);
    if (candidateExtras) {
      await writeJson(result, "groups/behavior/candidate/judged-grade.json", {
        answers: [{ id: "found-note", answer: "yes", rationale: "NOTES.md holds the note" }],
      });
    }
    return await renderHtml("fixture-result", { root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeJson(root, relativePath, value) {
  await writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(root, relativePath, text) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

test("fixture result renders to the committed snapshot", async () => {
  const html = await withFixtureResult({});
  if (process.env.UPDATE_SNAPSHOTS === "1") {
    await mkdir(path.dirname(SNAPSHOT), { recursive: true });
    await writeFile(SNAPSHOT, html);
  }
  const expected = await readFile(SNAPSHOT, "utf8").catch(() => null);
  assert.notEqual(expected, null, "snapshot missing; run this test with UPDATE_SNAPSHOTS=1 once and review the file");
  assert.equal(html, expected);
});

test("fixture HTML has no absolute paths, no scripts and no network references", async () => {
  const html = await withFixtureResult({});
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("http://"), false);
  assert.equal(html.includes("https://"), false);
  assert.equal(html.includes(os.tmpdir()), false);
  assert.match(html, /<style>/);
  assert.match(html, /prefers-color-scheme: dark/);
});

test("the aggregate's claim is placed above its trials", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "skill-eval-view-html-agg-")));
  try {
    const aggregate = path.join(root, ".skill-eval", "runs", "agg-1");
    await writeJson(aggregate, "aggregate.json", {
      id: "agg-1",
      state: "complete",
      requestedTrials: 1,
      trials: [{ id: "missing-trial", state: "complete" }],
      groups: [],
      claim: { class: "rate-on-suite", k: 1, beats: "not supported: no decision rule declared" },
    });
    const html = await renderHtml("agg-1", { root });
    assert.ok(html.indexOf("Claim") < html.indexOf("Trial missing-trial"));
    assert.match(html, /rate on this suite, k=1/);
    assert.match(html, /Trial result unavailable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a hostile response and file content are HTML-escaped", async () => {
  const hostile = "<script>alert('x')</script> and <img src=x onerror=alert(1)>";
  const html = await withFixtureResult(
    { metrics: { note: "<b>metric</b>" } },
    { finalText: hostile, fileText: `${hostile}\n` },
  );
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<b>metric</b>"), false);
  assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;metric&lt;\/b&gt;/);
});

test("changed file content over 20,000 characters is cut and says so", async () => {
  const big = "x".repeat(20001);
  const html = await withFixtureResult({}, { fileText: big });
  assert.match(html, /Cut at 20000 of 20001 characters/);
});

test("absent metrics and judged-grade files are omitted, not rendered as empty sections", async () => {
  const html = await withFixtureResult({}, { candidateExtras: false });
  assert.equal(html.includes("Metrics"), false);
  assert.equal(html.includes("Judged answers"), false);
  assert.match(html, /Deterministic checks/);
});

test("present metrics and judged answers are rendered for their arm", async () => {
  const html = await withFixtureResult({});
  assert.match(html, /<h4>Metrics<\/h4>/);
  assert.match(html, /turnsUsed/);
  assert.match(html, /<h4>Judged answers<\/h4>/);
  assert.match(html, /NOTES\.md holds the note/);
});

test("writeHtml refuses selectors, because the page always covers the whole result", async () => {
  await assert.rejects(
    writeHtml("fixture-result", "out.html", { root: os.tmpdir(), selectors: { group: "1", variant: null } }),
    /drop --group and --variant/,
  );
});

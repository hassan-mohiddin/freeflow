import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderHtml, writeHtml } from "../../../skills/evaluate-behavior/scripts/lib/view-html.mjs";
import { HONEST, hostileWorkspace, SECRET, WRITTEN, within } from "./helpers/hostile-workspace.mjs";

const SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "snapshots", "view-html.html");
const HOSTILE = "NOTES.md <script>alert('x')</script> holds the note";

/**
 * A stored result with one body group and two arms. The candidate arm carries metrics, a judged grade with a
 * calibrated judge, and the advisory pairwise review sits beside both arms; the baseline arm has none of them.
 */
async function withFixtureResult(
  run,
  {
    finalText = "Added NOTES.md with a short note.\n",
    fileText = "Note: keep it short.\n",
    candidateExtras = true,
    created = ["NOTES.md"],
    prepareWorkspace = null,
  } = {},
) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "skill-eval-view-html-")));
  try {
    const result = path.join(root, ".skill-eval", "runs", "fixture-result");
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
      effects: { changes: { created, modified: [], deleted: ["old.txt"] } },
      artifacts: { final: "final.md" },
      ...(candidateExtras && run.metrics === undefined ? { metrics: { turnsUsed: 1, editedFiles: 1 } } : {}),
    });
    await writeText(result, "groups/behavior/candidate/final.md", finalText);
    await writeText(result, "groups/behavior/candidate/workspace/NOTES.md", fileText);
    const release = await prepareWorkspace?.(path.join(result, "groups/behavior/candidate/workspace"), root);
    if (candidateExtras) {
      await writeJson(result, "groups/behavior/candidate/judged-grade.json", judgedGrade());
      await writeJson(result, "groups/behavior/semantic-grade.json", advisoryReview());
    }
    try {
      return await within(renderHtml("fixture-result", { root }), 5000, "the HTML view");
    } finally {
      release?.();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** The shape review.mjs writes for one arm's rubric judging: judges, their calibration, and the combined answers. */
function judgedGrade() {
  const calibration = {
    state: "checked",
    model: "fake/judge",
    thinking: null,
    labels: { file: "labels.json", sha256: "a".repeat(64) },
    runs: 1,
    agreement: 1,
    dimensions: { "found-note": { items: 1, agreement: 1, kappa: 1 } },
    checkedAt: "2026-10-12T00:00:00.000Z",
  };
  return {
    schema_version: 1,
    kind: "judged-grade",
    judged: true,
    state: "complete",
    group: "behavior",
    arm: "candidate",
    rubric: {
      sha256: "b".repeat(64),
      dimensions: [
        { id: "found-note", question: "Is the note present?", answers: ["yes", "no", "unknown"], weight: 1 },
      ],
    },
    combine: "majority",
    judges: [
      {
        model: "fake/judge",
        provider: "fake",
        family: "fake",
        thinking: null,
        configuration: "cfg-1",
        familyRelation: "same-provider",
        state: "complete",
        answers: [{ dimension: "found-note", answer: "yes", evidence: HOSTILE }],
        errors: [],
        calibration,
      },
      {
        model: "other/judge",
        provider: "other",
        family: "other",
        thinking: "high",
        configuration: "cfg-2",
        familyRelation: "different",
        state: "complete",
        answers: [{ dimension: "found-note", answer: "no", evidence: "The file has no note." }],
        errors: ["second pass disagreed"],
        calibration: { state: "not-checked" },
      },
    ],
    answers: [{ dimension: "found-note", answer: "yes", votes: ["yes", "no"] }],
    inputs: {},
    limits: {},
    truncated: 0,
    errors: [],
    contractGaps: ["calibration not checked"],
    completedAt: "2026-10-12T00:00:00.000Z",
  };
}

/** The shape review.mjs writes for the advisory pairwise review, with a swap pass. */
function advisoryReview() {
  return {
    schema_version: 1,
    kind: "advisory-review",
    advisory: true,
    state: "complete",
    model: "fake/reviewer",
    thinking: null,
    judge: { model: "fake/reviewer", provider: "fake", family: "fake", thinking: null },
    subject: { providers: ["fake"], familyRelation: "same-provider" },
    labels: { A: "baseline", B: "candidate" },
    answers: [
      {
        question: "Is the note present?",
        baseline: "no",
        candidate: "yes",
        rationale: "NOTES.md is only in candidate",
      },
    ],
    swap: {
      agreement: {
        agreed: 1,
        questions: 1,
        arms: { baseline: { agreed: 1, questions: 1 }, candidate: { agreed: 1, questions: 1 } },
      },
      answers: [{ question: "Is the note present?", baseline: "yes", candidate: "no", rationale: "swapped" }],
    },
    contractGaps: ["calibration not checked"],
    errors: [],
  };
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
  assert.match(html, /prefers-color-scheme: dark/);
});

test("judged evidence renders per dimension: each judge's answer and evidence, the combined answer, identity, calibration and gaps", async () => {
  const html = await withFixtureResult({});
  assert.match(html, /<h4>Judged evidence/);
  assert.match(html, /Is the note present\?/);
  assert.match(html, /fake\/judge/);
  assert.match(html, /other\/judge \(high\)/);
  assert.match(html, /family same-provider/);
  assert.match(html, /agreement 1 over 1 labelled run\(s\); kappa 1 over 1 item\(s\)/);
  assert.match(html, /<th>combined<\/th>/);
  assert.match(html, /votes yes, no/);
  assert.match(html, /not checked/);
  assert.match(html, /Contract gaps: calibration not checked/);
  assert.match(html, /second pass disagreed/);
});

test("the advisory pairwise review is marked advisory, maps answers to arms, and shows the swap agreement and gaps", async () => {
  const html = await withFixtureResult({});
  assert.match(html, /Advisory pairwise review/);
  assert.match(html, /not canonical evidence/);
  assert.match(html, /A = baseline, B = candidate/);
  assert.match(html, /<th>baseline<\/th><th>candidate<\/th>/);
  assert.match(html, /NOTES\.md is only in candidate/);
  assert.match(html, /Order swap agreed on 1\/1 · per arm baseline 1\/1, candidate 1\/1/);
  assert.match(html, /Contract gap: calibration not checked/);
});

test("judge evidence text and advisory rationale are HTML-escaped", async () => {
  const html = await withFixtureResult({});
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /NOTES\.md &lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; holds the note/);
});

test("a hostile response and file content are HTML-escaped", async () => {
  const hostile = "<script>alert('x')</script> and <img src=x onerror=alert(1)>";
  const html = await withFixtureResult(
    { metrics: { note: "<b>metric</b>" } },
    { finalText: hostile, fileText: `${hostile}\n` },
  );
  assert.equal(html.includes("<script>alert"), false);
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<b>metric</b>"), false);
  assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; and &lt;img/);
  assert.match(html, /&lt;b&gt;metric&lt;\/b&gt;/);
});

test("changed file content over 20,000 characters is cut and says so", async () => {
  const html = await withFixtureResult({}, { fileText: "x".repeat(20001) });
  assert.match(html, /Cut at 20000 of 20001 characters/);
});

test("absent metrics, judged and advisory files are omitted, not rendered as empty sections", async () => {
  const html = await withFixtureResult({}, { candidateExtras: false });
  assert.equal(html.includes("Metrics"), false);
  assert.equal(html.includes("Judged evidence"), false);
  assert.equal(html.includes("Advisory pairwise review"), false);
  assert.match(html, /Deterministic checks/);
});

test("present run metrics are rendered for their arm", async () => {
  const html = await withFixtureResult({});
  assert.match(html, /<h4>Metrics<\/h4>/);
  assert.match(html, /turnsUsed/);
});

test("a decision renders its rule, split, p and verdict; per-arm medians and paired differences render from metrics", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "skill-eval-view-html-decision-")));
  try {
    const aggregate = path.join(root, ".skill-eval", "runs", "agg-decision");
    await writeJson(aggregate, "aggregate.json", {
      id: "agg-decision",
      state: "complete",
      requestedTrials: 3,
      trials: [],
      groups: [
        {
          id: "behavior",
          trials: 3,
          metrics: {
            reference: "baseline",
            arms: {
              baseline: { turns: { count: 3, median: 2, mean: 2, min: 1, max: 3 } },
              candidate: { turns: { count: 3, median: 3, mean: 3.5, min: 2, max: 5 } },
            },
            differences: { candidate: { turns: { pairs: 3, mean: 1.5, median: 1 } } },
            perTrial: [],
          },
        },
      ],
      decision: {
        rule: {
          measure: { comparison: "note" },
          arms: ["baseline", "candidate"],
          direction: "higher",
          method: "sign-test",
          alpha: 0.05,
          min_cases: 1,
        },
        ruleSha256: "f".repeat(64),
        reference: "baseline",
        arm: "candidate",
        verdict: "beats",
        better: 12,
        worse: 2,
        ties: 3,
        decided: 14,
        excluded: 0,
        p: 0.0065,
        cases: [
          {
            id: "behavior",
            trials: 3,
            sign: "better",
            arms: { baseline: { n: 3, mean: 0 }, candidate: { n: 3, mean: 1 } },
          },
        ],
      },
      claim: {
        class: "beats",
        k: 3,
        ruleSha256: "f".repeat(64),
        better: 12,
        worse: 2,
        ties: 3,
        decided: 14,
        excluded: 0,
        p: 0.0065,
      },
    });
    const html = await renderHtml("agg-decision", { root });
    assert.match(html, /<h2>Decision<\/h2>/);
    assert.match(html, /comparison note/);
    assert.match(html, /higher is better/);
    assert.match(html, /candidate against baseline/);
    assert.match(html, /<th>split \(better \/ worse \/ ties\)<\/th><td>12 \/ 2 \/ 3<\/td>/);
    assert.match(html, /<th>p \(sign test\)<\/th><td>0\.0065<\/td>/);
    assert.match(html, /<th>verdict<\/th><td>beats<\/td>/);
    assert.match(html, /<th>rule sha256<\/th><td>f{64}<\/td>/);
    assert.match(html, /Metrics: behavior/);
    assert.match(html, /median 2 · mean 2 · n 3/);
    assert.match(html, /median 3 · mean 3\.5 · n 3/);
    assert.match(html, /candidate − baseline<\/td><td>mean 1\.5 · median 1 · pairs 3/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("writeHtml refuses selectors, because the page always covers the whole result", async () => {
  await assert.rejects(
    writeHtml("fixture-result", "out.html", { root: os.tmpdir(), selectors: { group: "1", variant: null } }),
    /drop --group and --variant/,
  );
});

test("a changed file is never shown through a link the run made, nor read from a FIFO, and the page finishes", async () => {
  const html = await withFixtureResult(
    {},
    {
      created: WRITTEN,
      prepareWorkspace: async (workspace, root) =>
        (await hostileWorkspace(workspace, path.join(root, "outside"))).release,
    },
  );
  assert.ok(html.includes(HONEST), "a regular written file is shown");
  assert.equal(html.includes(SECRET), false, "nothing behind a link is shown");
  assert.match(
    html,
    /created login\.md<\/summary><p class="missing">a link the run made, to .*auth\.json; not followed\.<\/p>/,
  );
  assert.match(html, /created fifo\.md<\/summary><p class="missing">not read: not a regular file\.<\/p>/);
  assert.match(
    html,
    /created linked-dir\/inner\.md<\/summary><p class="missing">not read: outside the workspace\.<\/p>/,
  );
});

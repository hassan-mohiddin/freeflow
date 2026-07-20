import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderResult } from "../../../skills/evaluate-skill/scripts/lib/view.mjs";

const UNUSUAL_PATHS = ["literal\\t.txt", "actual\t.txt", "comma,name.txt", "line\r\nbreak.txt", "nested/part.txt"];

async function withResult(run, { resultName = "result" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-eval-view-"));
  const requestedResult = path.join(root, resultName);
  try {
    await mkdir(requestedResult, { recursive: true });
    const result = await realpath(requestedResult);
    await writeJson(result, "summary.json", {
      id: "representative-suite",
      state: "complete",
      definitionKind: "suite",
      groups: [
        { id: "activation", position: 1, state: "complete", artifacts: {} },
        { id: "behavior", position: 2, state: "complete", artifacts: {} },
      ],
    });
    await writeGroup(result, {
      id: "activation",
      type: "description",
      input: { prompt: "Choose a route.\nPreserve exact evidence." },
      reviewQuestions: [],
      expectations: [
        {
          id: "baseline-no-read",
          kind: "skill-read",
          variant: "baseline",
          comparison: "activation-change",
        },
        {
          id: "candidate-read",
          kind: "skill-read",
          variant: "candidate",
          comparison: "activation-change",
        },
        { id: "baseline-broken", kind: "path", variant: "baseline" },
        { id: "candidate-broken", kind: "path", variant: "candidate" },
      ],
      checks: [
        {
          id: "baseline-no-read",
          kind: "skill-read",
          variant: "baseline",
          state: "pass",
          expected: { expect: "never" },
          observed: { targetRead: false, readTurns: [] },
        },
        {
          id: "candidate-read",
          kind: "skill-read",
          variant: "candidate",
          state: "pass",
          expected: { expect: "by-turn", turn: 1 },
          observed: { targetRead: true, firstReadTurn: 1, readTurns: [1] },
        },
      ],
      comparisons: [
        {
          id: "activation-change",
          kind: "skill-read",
          transition: "fail-to-pass",
          baseline: { check: "baseline-no-read", state: "fail" },
          candidate: { check: "candidate-read", state: "pass" },
        },
      ],
      errors: [
        { id: "baseline-broken", reason: "invalid baseline expectation" },
        { id: "candidate-broken", reason: "invalid candidate expectation" },
        { id: "activation-change", reason: "comparison unavailable" },
        { id: "system", reason: "group-level grading warning" },
      ],
      runs: {
        baseline: descriptionRun("baseline", false, "Baseline response"),
        candidate: descriptionRun("candidate", true, "Candidate response"),
      },
    });
    await writeGroup(result, {
      id: "behavior",
      type: "body",
      input: { turns: ["Apply the guidance.", "Summarize the result."] },
      reviewQuestions: ["Did the result preserve the requested boundary?"],
      expectations: [{ id: "candidate-response", kind: "response-text", variant: "candidate" }],
      checks: [
        {
          id: "candidate-response",
          kind: "response-text",
          variant: "candidate",
          state: "pass",
          expected: { expect: "contains", value: "done", turn: 2 },
          observed: { response: "done\nwith evidence", turn: 2 },
        },
      ],
      comparisons: [],
      errors: [],
      runs: {
        baseline: { ...bodyRun("baseline"), state: "not-selected", turns: null, response: "" },
        candidate: bodyRun("candidate"),
      },
    });
    await run({ root, result });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeGroup(
  result,
  { id, type, input, reviewQuestions, expectations, checks, comparisons, errors, runs },
) {
  const groupRoot = path.join("groups", id);
  await writeJson(result, path.join(groupRoot, "definition.json"), {
    id,
    type,
    input,
    expectations,
    review_questions: reviewQuestions,
  });
  await writeJson(result, path.join(groupRoot, "deterministic-grade.json"), {
    state: "complete",
    checks,
    comparisons,
    errors,
  });
  await writeJson(result, path.join(groupRoot, "group.json"), {
    id,
    state: "complete",
    errors: [],
  });
  for (const [variant, run] of Object.entries(runs)) {
    const storedRun =
      run.evaluationType === "body" ? { ...run, workspace: path.join(result, groupRoot, variant, "workspace") } : run;
    await writeJson(result, path.join(groupRoot, variant, "run.json"), storedRun);
  }
}

function descriptionRun(variant, targetRead, response) {
  return {
    variant,
    state: "complete",
    evaluationType: "description",
    activation: { targetRead, readTurns: targetRead ? [1] : [] },
    response,
    transcript: "transcript.json",
    usage: {
      input: variant === "baseline" ? undefined : 120,
      output: 20,
      cacheRead: 4,
      cacheWrite: 0,
      cost: { total: 0.0012 },
    },
    artifacts: { events: "events.jsonl", final: "final.md", stderr: "stderr.log" },
  };
}

function bodyRun(variant) {
  return {
    variant,
    state: "complete",
    evaluationType: "body",
    delivery: { kind: "explicit-skill-command", turn: 1 },
    turns: [
      { turn: 1, settled: true, targetRead: false, response: "working", toolActivity: [] },
      { turn: 2, settled: true, targetRead: false, response: "done\nwith evidence", toolActivity: [] },
    ],
    effects: { changes: { created: UNUSUAL_PATHS, modified: [], deleted: [] } },
    transcript: "transcript\\t-\t,\r\n.json",
    artifacts: { events: "events.jsonl", final: "final.md", stderr: "stderr.log" },
  };
}

async function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function occurrences(value, search) {
  return value.split(search).length - 1;
}

function decodeCell(value) {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      decoded += character;
      continue;
    }
    index += 1;
    const escaped = value[index];
    if (escaped === "\\") decoded += "\\";
    else if (escaped === "r") decoded += "\r";
    else if (escaped === "n") decoded += "\n";
    else if (escaped === "t") decoded += "\t";
    else throw new Error(`Unexpected escape: \\${escaped ?? ""}`);
  }
  return decoded;
}

test("view renders criterion details and compact result-relative artifact rows", async () => {
  await withResult(async ({ root, result }) => {
    const view = await renderResult(result, { group: null, variant: null }, { root });

    assert.equal(occurrences(view, result), 1);
    assert.match(view, new RegExp(`^Path: ${result.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
    assert.match(
      view,
      /check\tcandidate-read\tcandidate\tskill-read\tpass\texpected=\{"expect":"by-turn","turn":1\}\tobserved=\{"targetRead":true,"firstReadTurn":1,"readTurns":\[1\]\}/,
    );
    assert.match(
      view,
      /comparison\tactivation-change\tskill-read\tfail-to-pass\tbaseline=baseline-no-read:fail\tcandidate=candidate-read:pass/,
    );
    assert.match(view, /Baseline \[complete\][\s\S]*usage\tinput=unavailable\toutput=20/);
    assert.match(
      view,
      /Candidate \[complete\][\s\S]*usage\tinput=120\toutput=20\tcache-read=4\tcache-write=0\tcost=0\.0012/,
    );
    assert.match(
      view,
      /artifacts\trun=groups\/activation\/candidate\/run\.json\ttranscript=groups\/activation\/candidate\/transcript\.json/,
    );
    assert.match(
      view,
      /artifacts\tdefinition=groups\/activation\/definition\.json\tgrade=groups\/activation\/deterministic-grade\.json\tgroup=groups\/activation\/group\.json/,
    );
    assert.doesNotMatch(view, new RegExp(`${result.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/groups/`));
    assert.equal(occurrences(view, "Choose a route."), 1);
    assert.match(view, /Prompt:\n {4}Choose a route\.\n {4}Preserve exact evidence\./);
    assert.match(view, /response:\n {6}done\n {6}with evidence/);
    assert.match(view, /workspace=groups\/behavior\/candidate\/workspace/);
  });
});

test("view path encoding round-trips unusual result, workspace-change, and artifact paths", async () => {
  await withResult(
    async ({ result }) => {
      const view = await renderResult(result);
      const pathLine = view.split("\n").find((line) => line.startsWith("Path: "));
      assert.ok(pathLine);
      assert.equal(decodeCell(pathLine.slice("Path: ".length)), result);

      const changeLine = view.split("\n").find((line) => line.startsWith("  changes\tcreated\t"));
      assert.ok(changeLine);
      assert.deepEqual(changeLine.split("\t").slice(2).map(decodeCell), UNUSUAL_PATHS);

      const artifactLine = view
        .split("\n")
        .find((line) => line.startsWith("  artifacts\t") && line.includes("groups/behavior/candidate/run.json"));
      assert.ok(artifactLine);
      const artifacts = new Map(
        artifactLine
          .split("\t")
          .slice(1)
          .map(decodeCell)
          .map((entry) => {
            const separator = entry.indexOf("=");
            return [entry.slice(0, separator), entry.slice(separator + 1)];
          }),
      );
      assert.equal(artifacts.get("transcript"), "groups/behavior/candidate/transcript\\t-\t,\r\n.json");
    },
    { resultName: "result\\t-\t,\r\n" },
  );
});

test("view selector combinations keep shared inputs and selected evidence scoped", async () => {
  await withResult(async ({ root, result }) => {
    const defaults = await renderResult(result);
    assert.match(defaults, /Group activation \[complete\]/);
    assert.match(defaults, /Group behavior \[complete\]/);

    const candidates = await renderResult(result, { group: null, variant: "candidate" }, { root });
    assert.match(candidates, /Group activation \[complete\]/);
    assert.match(candidates, /Group behavior \[complete\]/);
    assert.doesNotMatch(candidates, /Baseline \[/);
    assert.equal(occurrences(candidates, "Choose a route."), 1);
    assert.doesNotMatch(candidates, /baseline-broken/);
    assert.match(candidates, /candidate-broken/);
    assert.match(candidates, /activation-change/);
    assert.match(candidates, /group-level grading warning/);

    const baselines = await renderResult(result, { group: null, variant: "baseline" }, { root });
    assert.match(baselines, /Group activation \[complete\]/);
    assert.match(baselines, /Group behavior \[complete\]/);
    assert.doesNotMatch(baselines, /Candidate \[|candidate-broken/);
    assert.match(baselines, /baseline-broken/);
    assert.match(baselines, /activation-change/);
    assert.match(baselines, /group-level grading warning/);

    await writeJson(result, "groups/activation/deterministic-grade.json", {
      state: "grade-error",
      checks: [
        {
          id: "candidate-read",
          kind: "skill-read",
          variant: "candidate",
          state: "pass",
          expected: { expect: "by-turn", turn: 1 },
          observed: { targetRead: true, firstReadTurn: 1, readTurns: [1] },
        },
      ],
      comparisons: [],
      errors: [{ id: "baseline-broken", reason: "invalid baseline expectation" }],
    });
    const candidateWithoutBaselineError = await renderResult(
      result,
      { group: "activation", variant: "candidate" },
      { root },
    );
    assert.match(candidateWithoutBaselineError, /Group activation \[complete\][\s\S]*Grade \[complete\]/);
    assert.doesNotMatch(candidateWithoutBaselineError, /baseline-broken|Grade \[grade-error\]/);

    await writeJson(result, "groups/activation/deterministic-grade.json", {
      state: "grade-error",
      checks: [
        {
          id: "baseline-no-read",
          kind: "skill-read",
          variant: "baseline",
          state: "pass",
          expected: { expect: "never" },
          observed: { targetRead: false, readTurns: [] },
        },
      ],
      comparisons: [],
      errors: [{ id: "candidate-broken", reason: "invalid candidate expectation" }],
    });
    const baselineWithoutCandidateError = await renderResult(
      result,
      { group: "activation", variant: "baseline" },
      { root },
    );
    assert.match(baselineWithoutCandidateError, /Group activation \[complete\][\s\S]*Grade \[complete\]/);
    assert.doesNotMatch(baselineWithoutCandidateError, /candidate-broken|Grade \[grade-error\]/);

    const group = await renderResult(result, { group: "2", variant: null }, { root });
    assert.doesNotMatch(group, /Group activation/);
    assert.match(group, /Group behavior \[complete\]/);
    assert.match(group, /Baseline \[not-selected\]/);
    assert.match(group, /Candidate \[complete\]/);

    const one = await renderResult(result, { group: "behavior", variant: "candidate" }, { root });
    assert.doesNotMatch(one, /Group activation|Baseline \[/);
    assert.match(one, /Group behavior \[complete\]/);
    assert.match(one, /Candidate \[complete\]/);
    assert.match(
      one,
      /check\tcandidate-response\tcandidate\tresponse-text\tpass\texpected=.*\tobserved=response@turn:2/,
    );
    assert.equal(occurrences(one, "with evidence"), 1);
    assert.doesNotMatch(one, /observed=\{"response"|comparison\tactivation-change/);
  });
});

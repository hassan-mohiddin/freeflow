import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { suiteVerdict } from "../../scripts/gate.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const HAIKU = "anthropic/claude-haiku-5-5";

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-measure-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/** A subject that reads its first skill; a judge (--no-tools) that answers yes with evidence. */
async function installFakePi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const reply = (text) => {
  emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text }], provider: "fake", model: "fake",
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0.001 } }, stopReason: "stop" } });
  emit({ type: "agent_settled" });
};
if (args.includes("--no-tools")) {
  appendFileSync(${JSON.stringify(path.join(root, "judge.jsonl"))}, JSON.stringify({ prompt: args.at(-1) }) + "\\n");
  reply(JSON.stringify({ answers: [{ dimension: "names-route", answer: "yes", evidence: "it names the route" }] }));
} else {
  const skills = args.flatMap((arg, index) => (arg === "--skill" ? [args[index + 1]] : []));
  emit({ type: "agent_start" });
  if (skills[0]) {
    emit({ type: "tool_execution_start", toolCallId: "r", toolName: "read", args: { path: skills[0] + "/SKILL.md" } });
    emit({ type: "tool_execution_end", toolCallId: "r", toolName: "read", isError: false });
  }
  reply("Follow the release route.");
}
`,
  );
  await chmod(executable, 0o755);
  await mkdir(path.join(root, "skills/release-route"), { recursive: true });
  await writeFile(
    path.join(root, "skills/release-route/SKILL.md"),
    "---\nname: release-route\ndescription: Use when delivering a change.\n---\n\n# Release Route\n",
  );
  return bin;
}

/** One arm, `measure`: one setup, measured on its own. */
function measureGroup(changes = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "measured-route",
    type: "description",
    input: { prompt: "How should I ship this change?" },
    fixture: null,
    tools: ["read"],
    configuration: {
      host: { name: "pi" },
      subject: {
        kind: "skill",
        source: { kind: "working-tree" },
        skills: ["skills/release-route"],
        target: 0,
        context: [],
      },
    },
    arms: { measure: {} },
    expectations: [{ id: "reads-route", kind: "skill-read", variant: "measure", expect: "by-turn", turn: 1 }],
    review_questions: ["Does the answer name the route?"],
    rubric: [{ id: "names-route", question: "Does the run name the release route?" }],
    judges: [{ model: HAIKU, thinking: "medium" }],
    combine: "majority",
    ...changes,
  };
}

function cli(root, bin, args) {
  const extra = args[0] === "run" ? ["--dry-run", "--yes"] : [];
  return spawnSync(process.execPath, [entrypoint, ...args, ...extra], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
}

test("a one-arm group loads: its arm is its own reference, and component may be absent or empty", async () => {
  await withTempDirectory(async (root) => {
    await installFakePi(root);
    const loaded = await loadDefinition(await writeJson(path.join(root, "g.json"), measureGroup()), { root });
    assert.deepEqual(Object.keys(loaded.variants), ["measure"]);
    assert.equal(loaded.reference, undefined);
    assert.deepEqual(loaded.component, []);
    const empty = await loadDefinition(await writeJson(path.join(root, "e.json"), measureGroup({ component: [] })), {
      root,
    });
    assert.deepEqual(empty.component, []);
    const named = await loadDefinition(
      await writeJson(path.join(root, "n.json"), measureGroup({ reference: "measure" })),
      { root },
    );
    assert.deepEqual(Object.keys(named.variants), ["measure"]);
  });
});

test("a one-arm group refuses a component, a comparison, a foreign reference; two arms still need component", async () => {
  await withTempDirectory(async (root) => {
    await installFakePi(root);
    const refusals = [
      [measureGroup({ component: ["subject.skills"] }), /component must be absent or empty for a one-arm group/],
      [
        measureGroup({
          expectations: [
            { id: "x", kind: "skill-read", variant: "measure", expect: "by-turn", turn: 1, comparison: "read" },
          ],
        }),
        /expectations\[0\]\.comparison needs two arms/,
      ],
      [measureGroup({ reference: "baseline" }), /group\.reference must name one of group\.arms: measure/],
      [measureGroup({ arms: {} }), /at least one arm/],
      [
        measureGroup({
          arms: { baseline: {}, candidate: { subject: { skills: [], target: null } } },
          expectations: [],
        }),
        /group is missing component/,
      ],
    ];
    for (const [index, [definition, expected]] of refusals.entries()) {
      const file = await writeJson(path.join(root, `r${index}.json`), definition);
      await assert.rejects(loadDefinition(file, { root }), expected);
    }
    // A suite decision compares arms, so a one-arm group in it is refused.
    await writeJson(path.join(root, "groups/m.json"), measureGroup());
    const suite = await writeJson(path.join(root, "suite.json"), {
      schema_version: 2,
      kind: "suite",
      id: "measured",
      groups: ["groups/m.json"],
      decision: { measure: { metric: "durationMs" }, arms: ["measure", "other"], direction: "lower" },
    });
    await assert.rejects(
      loadDefinition(suite, { root }),
      /suite\.decision compares arms, but group measured-route has one arm/,
    );
  });
});

test("a one-arm group runs, aggregates checks and metrics with no comparison, and views", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const definition = await writeJson(path.join(root, "groups/m.json"), measureGroup());
    const result = cli(root, bin, ["run", definition, "--trials", "2"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Plan: 2 subjects \(1 group, 1 arm, 2 trials\)/m);
    const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)[1];
    const aggregate = await readJson(path.join(root, ".skill-eval/runs", aggregateId, "aggregate.json"));
    const [group] = aggregate.groups;
    assert.deepEqual(group.comparisons, []);
    assert.deepEqual(
      group.checks.map(({ id, pass, trials, passAll }) => ({ id, pass, trials, passAll })),
      [{ id: "reads-route", pass: 2, trials: 2, passAll: true }],
    );
    assert.deepEqual(Object.keys(group.runStates), ["measure"]);
    assert.equal(group.metrics.perTrial.length, 2);
    assert.deepEqual(group.metrics.differences, {});
    assert.equal(aggregate.claim.k, 2);
    assert.equal(aggregate.claim.class, "none");
    assert.equal(aggregate.claim.reason, "dry run");

    const view = cli(root, bin, ["view", aggregateId]);
    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /^check\treads-route\tmeasure\tskill-read\tpass=2\/2\t.*pass\^2=yes$/m);
    const trial = cli(root, bin, ["view", aggregate.trials[0].id]);
    assert.equal(trial.status, 0, trial.stderr);
    assert.match(trial.stdout, /^Group measured-route \[complete\]/m);
    const html = cli(root, bin, ["view", aggregateId, "--html", "page.html"]);
    assert.equal(html.status, 0, html.stderr);
    assert.match(await readFile(path.join(root, "page.html"), "utf8"), /measured-route/);
  });
});

test("review refuses a pairwise review of one arm and judges it with --rubric", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const definition = await writeJson(path.join(root, "groups/m.json"), measureGroup());
    const run = cli(root, bin, ["run", definition]);
    assert.equal(run.status, 0, run.stderr);
    const resultId = run.stdout.match(/^Result: (.+)$/m)[1];

    const pairwise = cli(root, bin, ["review", resultId, "--model", HAIKU]);
    assert.equal(pairwise.status, 1);
    assert.match(
      pairwise.stderr,
      /pairwise review compares two or more runs; one-arm groups are judged with review --rubric/,
    );

    const judged = cli(root, bin, ["review", resultId, "--rubric"]);
    assert.equal(judged.status, 0, judged.stderr);
    assert.match(judged.stdout, /^Judged measured-route measure: complete \(measure\/judged-grade\.json\)$/m);
    const grade = await readJson(
      path.join(root, ".skill-eval/runs", resultId, "groups/measured-route/measure/judged-grade.json"),
    );
    assert.equal(grade.answers.find((entry) => entry.dimension === "names-route")?.answer, "yes");
  });
});

test("the gate reads a one-arm suite as measured, not as a comparison", () => {
  const aggregate = {
    claim: { class: "rate-on-suite", k: 3 },
    groups: [
      {
        id: "m",
        runStates: { measure: { complete: 3 } },
        comparisons: [],
        checks: [
          { id: "a", passAll: true },
          { id: "b", passAll: false },
        ],
      },
    ],
  };
  assert.deepEqual(suiteVerdict(aggregate), {
    verdict: "measured",
    detail: "one-arm suite: 1 of 2 checks passed in every trial",
  });
});

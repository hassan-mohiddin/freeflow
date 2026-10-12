import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadDefinition, selectDefinition } from "../../../skills/evaluate-skill/scripts/lib/definitions.mjs";
import { toV2 } from "./helpers/to-v2.mjs";

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-eval-definitions-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(toV2(value), null, 2)}\n`);
  return file;
}

function environment({ skills = [], target = null } = {}) {
  return {
    source: { kind: "working-tree" },
    skills,
    target,
    context: [],
  };
}

function group(id, type) {
  return {
    schema_version: 1,
    kind: "group",
    id,
    type,
    input: { prompt: `Natural prompt for ${id}` },
    fixture: null,
    tools: ["read"],
    variants: {
      baseline: environment(),
      candidate: environment({ skills: [`skills/${id}`], target: 0 }),
    },
    expectations: [],
    review_questions: ["Did the subject complete the task?"],
  };
}

test("group definitions preserve repeated natural turns in order", async () => {
  await withTempDirectory(async (root) => {
    const definition = group("repeated-turns", "description");
    definition.input = { turns: ["Continue.", "Continue."] };
    const groupFile = await writeJson(root, "repeated-turns.json", definition);

    const loaded = await loadDefinition(groupFile, { root });

    assert.deepEqual(loaded.input.turns, ["Continue.", "Continue."]);
  });
});

test("suite definitions allow parent-relative group references contained by the definition root", async () => {
  await withTempDirectory(async (root) => {
    await writeJson(root, "groups/target.json", group("target-group", "description"));
    const suiteFile = await writeJson(root, "suites/suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "nested-suite",
      groups: ["../groups/target.json"],
    });

    const loaded = await loadDefinition(suiteFile, { root });

    assert.deepEqual(
      loaded.groups.map((entry) => entry.id),
      ["target-group"],
    );
  });
});

test("group definitions preserve turns, fixtures, environments, expectations, review questions, and model config", async () => {
  await withTempDirectory(async (root) => {
    const definition = group("integrated-behavior", "body");
    definition.input = { turns: ["Start the task.", "Continue with the new evidence."] };
    definition.fixture = "fixtures/repository";
    definition.tools = ["read", "bash"];
    definition.variants.baseline = {
      source: { kind: "git", ref: "baseline-ref" },
      skills: ["skills/previous", "skills/support"],
      target: 0,
      context: ["runtime/context.md"],
    };
    definition.expectations = [{ id: "result-file", kind: "path-exists", path: "result.json" }];
    definition.review_questions = ["Did the response preserve the declared behavior?"];
    definition.runtime = {
      host: "pi",
      session: false,
      extensions: [{ entry: "extensions/context-probe.mjs", resources: ["extensions"] }],
      environment: { literal: {}, inherit: [] },
    };
    definition.model = { model: "openai/gpt-5", thinking: "high" };
    const groupFile = await writeJson(root, "integrated.json", definition);

    const loaded = await loadDefinition(groupFile, { root });

    // The task is kept as written; each arm resolves to its subject plus the shared model and runtime.
    for (const field of ["id", "type", "input", "fixture", "tools", "expectations", "review_questions"]) {
      assert.deepEqual(loaded[field], definition[field], field);
    }
    for (const arm of ["baseline", "candidate"]) {
      assert.deepEqual(
        loaded.variants[arm],
        { ...definition.variants[arm], model: definition.model, hostExtensions: [], hostSettings: {} },
        arm,
      );
    }
    assert.deepEqual(loaded.model, definition.model);
    assert.deepEqual(loaded.runtime, definition.runtime);
    assert.deepEqual(loaded.component, toV2(definition).component);
    assert.deepEqual(loaded.configurations.baseline.model, definition.model);
  });
});

test("schema 2 resolves arms from a shared configuration and refuses undeclared differences", async () => {
  await withTempDirectory(async (root) => {
    const base = toV2(group("declared", "description"));
    await writeJson(root, "configurations/grok.json", {
      schema_version: 2,
      kind: "configuration",
      id: "grok",
      configuration: { host: { name: "pi" }, model: { model: "xai/grok-4.7", thinking: "medium" } },
    });

    // extends supplies the model; an arm overlay can change only what component declares.
    const declared = structuredClone(base);
    declared.configuration = { extends: "configurations/grok.json", subject: declared.configuration.subject };
    const loaded = await loadDefinition(await writeJson(root, "declared.json", declared), { root });
    assert.deepEqual(loaded.model, { model: "xai/grok-4.7", thinking: "medium" });

    // A model switch in one arm that component does not name is refused before anything runs.
    const undeclared = structuredClone(declared);
    undeclared.arms.candidate.model = { model: "xai/grok-4.7", thinking: "high" };
    await assert.rejects(loadDefinition(await writeJson(root, "undeclared.json", undeclared), { root }), {
      code: "undeclared-difference",
      message: "the arms differ in model.thinking, which group.component does not declare",
    });

    // Declaring it makes it the comparison; each arm then carries its own model.
    undeclared.component = [...undeclared.component, "model.thinking"];
    const byModel = await loadDefinition(await writeJson(root, "by-model.json", undeclared), { root });
    assert.equal(byModel.variants.baseline.model.thinking, "medium");
    assert.equal(byModel.variants.candidate.model.thinking, "high");
    assert.equal(byModel.model, undefined);

    // A declared component where the arms are identical is refused too, and an A/A run declares none.
    const empty = structuredClone(base);
    empty.arms = { baseline: {}, candidate: {} };
    empty.configuration.subject = base.configuration.subject;
    empty.configuration.subject.source = { kind: "working-tree" };
    empty.configuration.subject.skills = [];
    empty.configuration.subject.target = null;
    empty.component = ["subject.source"];
    await assert.rejects(loadDefinition(await writeJson(root, "empty.json", empty), { root }), {
      code: "undeclared-difference",
      message: "group.component declares subject.source, but the arms do not differ there",
    });
    empty.component = [];
    const aa = await loadDefinition(await writeJson(root, "aa.json", empty), { root });
    assert.deepEqual(aa.variants.baseline, aa.variants.candidate);
  });
});

test("schema 1 definitions fail with a pointer to schema 2", async () => {
  await withTempDirectory(async (root) => {
    const file = path.join(root, "old.json");
    await writeFile(file, JSON.stringify(group("old", "description")));
    await assert.rejects(loadDefinition(file, { root }), {
      code: "unsupported-schema",
      message: /group: schema 1 definitions are no longer supported; rewrite it as schema 2/,
    });
  });
});

test("group definitions reject structural contradictions", async () => {
  await withTempDirectory(async (root) => {
    const cases = [
      {
        name: "numeric-id",
        change(definition) {
          definition.id = "123";
        },
      },
      {
        name: "prompt-and-turns",
        change(definition) {
          definition.input = { prompt: "one", turns: ["two"] };
        },
      },
      {
        name: "missing-candidate",
        change(definition) {
          delete definition.variants.candidate;
        },
      },
      {
        name: "target-outside-skills",
        change(definition) {
          definition.variants.candidate.target = 2;
        },
      },
      {
        name: "missing-candidate-target",
        change(definition) {
          definition.variants.candidate.target = null;
        },
      },
      {
        name: "unsafe-skill-path",
        change(definition) {
          definition.variants.candidate.skills = ["../../outside-skill"];
        },
      },
      {
        name: "unsafe-fixture",
        change(definition) {
          definition.fixture = "../outside";
        },
      },
      {
        name: "unsafe-extension",
        change(definition) {
          definition.runtime = {
            host: "pi",
            session: false,
            extensions: [{ entry: "extensions/context-probe.mjs", resources: ["../outside-extension.mjs"] }],
            environment: { literal: {}, inherit: [] },
          };
        },
      },
      {
        name: "duplicate-extensions",
        change(definition) {
          definition.runtime = {
            host: "pi",
            session: false,
            extensions: [
              { entry: "extensions/context-probe.mjs", resources: ["extensions/context-probe.mjs"] },
              { entry: "extensions/context-probe.mjs", resources: ["extensions/context-probe.mjs"] },
            ],
            environment: { literal: {}, inherit: [] },
          };
        },
      },
      {
        name: "reserved-runtime-environment",
        change(definition) {
          definition.runtime = {
            host: "pi",
            session: false,
            extensions: [],
            environment: { literal: { PATH: "/tmp" }, inherit: [] },
          };
        },
      },
      {
        name: "reserved-inherited-runtime-environment",
        change(definition) {
          definition.runtime = {
            host: "pi",
            session: false,
            extensions: [],
            environment: { literal: {}, inherit: ["PATH"] },
          };
        },
      },
      {
        name: "loader-inherited-runtime-environment",
        change(definition) {
          definition.runtime = {
            host: "pi",
            session: false,
            extensions: [],
            environment: { literal: {}, inherit: ["NODE_OPTIONS"] },
          };
        },
      },
      {
        name: "overlapping-runtime-environment",
        change(definition) {
          definition.runtime = {
            host: "pi",
            session: false,
            extensions: [],
            environment: { literal: { PROBE_MODE: "literal" }, inherit: ["probe_mode"] },
          };
        },
      },
      {
        name: "duplicate-tools",
        change(definition) {
          definition.tools = ["read", "read"];
        },
      },
      {
        name: "unsupported-end-to-end-type",
        change(definition) {
          definition.type = "end-to-end";
        },
      },
      {
        name: "command-tool-without-commands",
        change(definition) {
          definition.type = "body";
          definition.tools = ["read", "run_command"];
        },
      },
      {
        name: "commands-without-command-tool",
        change(definition) {
          definition.type = "body";
          definition.commands = [{ id: "unit-tests", argv: ["node", "--test"] }];
        },
      },
      {
        name: "command-tool-on-description",
        change(definition) {
          definition.tools = ["read", "run_command"];
          definition.commands = [{ id: "unit-tests", argv: ["node", "--test"] }];
        },
      },
      {
        name: "empty-command-argv",
        change(definition) {
          definition.type = "body";
          definition.tools = ["run_command"];
          definition.commands = [{ id: "unit-tests", argv: [] }];
        },
      },
      {
        name: "duplicate-command-id",
        change(definition) {
          definition.type = "body";
          definition.tools = ["run_command"];
          definition.commands = [
            { id: "unit-tests", argv: ["node", "--test"] },
            { id: "unit-tests", argv: ["npm", "test"] },
          ];
        },
      },
      {
        name: "invalid-command-timeout",
        change(definition) {
          definition.type = "body";
          definition.tools = ["run_command"];
          definition.commands = [{ id: "unit-tests", argv: ["node", "--test"], timeout_ms: 0 }];
        },
      },
      {
        name: "unknown-command-field",
        change(definition) {
          definition.type = "body";
          definition.tools = ["run_command"];
          definition.commands = [{ id: "unit-tests", argv: ["node", "--test"], shell: true }];
        },
      },
      {
        name: "unknown-runtime-prompt",
        change(definition) {
          definition.runtime = {
            host: "pi",
            session: false,
            prompt: "production",
            extensions: [],
            environment: { literal: {}, inherit: [] },
          };
        },
      },
      {
        name: "unknown-revision-kind",
        change(definition) {
          definition.revision = "body-only";
        },
      },
      {
        name: "description-only-without-baseline-target",
        change(definition) {
          definition.revision = "description-only";
        },
      },
      {
        name: "description-only-on-body-group",
        change(definition) {
          definition.type = "body";
          definition.variants.baseline = environment({ skills: ["skills/valid-group"], target: 0 });
          definition.revision = "description-only";
        },
      },
      {
        name: "duplicate-expectation",
        change(definition) {
          definition.expectations = [
            { id: "same-check", kind: "first" },
            { id: "same-check", kind: "second" },
          ];
        },
      },
    ];

    for (const scenario of cases) {
      const definition = group("valid-group", "description");
      scenario.change(definition);
      const groupFile = await writeJson(root, `${scenario.name}.json`, definition);
      await assert.rejects(loadDefinition(groupFile, { root }), { name: "DefinitionError" }, scenario.name);
    }
  });
});

test("a misspelled expectation field is rejected before any subject runs", async () => {
  await withTempDirectory(async (root) => {
    const definition = group("misspelled-field", "body");
    definition.expectations = [
      { id: "result-text", kind: "response-text", variant: "candidate", expect: "contains", value: "done" },
      // `turns` instead of `turn`: a grader would ignore it and check the final response instead.
      { id: "early-text", kind: "response-text", variant: "candidate", expect: "contains", value: "x", turns: 1 },
    ];
    const groupFile = await writeJson(root, "misspelled.json", definition);
    await assert.rejects(loadDefinition(groupFile, { root }), {
      name: "DefinitionError",
      message: /expectations\[1\] contains unsupported field turns for kind response-text/,
    });

    definition.expectations.pop();
    const validFile = await writeJson(root, "valid.json", definition);
    const loaded = await loadDefinition(validFile, { root });
    assert.equal(loaded.expectations.length, 1);
  });
});

test("a group with no expectations and no review questions is rejected", async () => {
  await withTempDirectory(async (root) => {
    const definition = group("observes-nothing", "description");
    definition.review_questions = [];
    const groupFile = await writeJson(root, "nothing.json", definition);
    await assert.rejects(loadDefinition(groupFile, { root }), {
      name: "DefinitionError",
      message: /at least one expectation or review question/,
    });

    definition.review_questions = ["Did the subject finish?"];
    const reviewOnly = await writeJson(root, "review-only.json", definition);
    await loadDefinition(reviewOnly, { root });
  });
});

test("body groups preserve declared commands and the host prompt mode", async () => {
  await withTempDirectory(async (root) => {
    const definition = group("command-behavior", "body");
    definition.tools = ["read", "run_command"];
    definition.commands = [
      { id: "unit-tests", argv: ["node", "--test"], timeout_ms: 60000 },
      { id: "lint", argv: ["npm", "run", "lint"] },
    ];
    definition.runtime = {
      host: "pi",
      session: false,
      prompt: "host",
      extensions: [],
      environment: { literal: {}, inherit: [] },
    };
    const groupFile = await writeJson(root, "command-behavior.json", definition);

    const loaded = await loadDefinition(groupFile, { root });

    assert.deepEqual(loaded.commands, definition.commands);
    assert.equal(loaded.runtime.prompt, "host");
  });
});

test("runtime-only groups may omit a candidate skill target", async () => {
  await withTempDirectory(async (root) => {
    const definition = group("runtime-only", "body");
    definition.variants.baseline = environment();
    definition.variants.candidate = environment();
    definition.runtime = { host: "pi", session: false, extensions: [], environment: { literal: {}, inherit: [] } };
    const groupFile = await writeJson(root, "runtime-only.json", definition);

    const loaded = await loadDefinition(groupFile, { root });

    assert.deepEqual(loaded.runtime, {
      host: "pi",
      session: false,
      extensions: [],
      environment: { literal: {}, inherit: [] },
    });
    assert.equal(loaded.variants.candidate.target, null);
  });
});

test("definitions reject PiFlow as a removed runtime host", async () => {
  await withTempDirectory(async (root) => {
    const definition = group("removed-piflow-host", "body");
    definition.variants.baseline = environment();
    definition.variants.candidate = environment();
    definition.runtime = { host: "piflow", session: false, extensions: [], environment: { literal: {}, inherit: [] } };
    const groupFile = await writeJson(root, "removed-piflow-host.json", definition);

    await assert.rejects(loadDefinition(groupFile, { root }), {
      code: "invalid-definition",
      message: "group.configuration.host.name must be pi",
    });
  });
});

test("suite definitions reject duplicate group IDs and canonical reference escapes", async () => {
  await withTempDirectory(async (root) => {
    const definitionRoot = path.join(root, "definitions");
    const outsideGroup = await writeJson(root, "outside.json", group("outside-group", "body"));
    await writeJson(definitionRoot, "groups/first.json", group("duplicate-id", "description"));
    await writeJson(definitionRoot, "groups/second.json", group("duplicate-id", "body"));
    await mkdir(path.join(definitionRoot, "groups"), { recursive: true });
    await symlink(outsideGroup, path.join(definitionRoot, "groups", "escaped.json"));

    const duplicateSuite = await writeJson(definitionRoot, "duplicate-suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "duplicate-suite",
      groups: ["groups/first.json", "groups/second.json"],
    });
    const escapedSuite = await writeJson(definitionRoot, "escaped-suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "escaped-suite",
      groups: ["groups/escaped.json"],
    });
    const parentEscapeSuite = await writeJson(definitionRoot, "suites/parent-escape.json", {
      schema_version: 1,
      kind: "suite",
      id: "parent-escape-suite",
      groups: ["../../outside.json"],
    });

    await assert.rejects(loadDefinition(duplicateSuite, { root: definitionRoot }), {
      code: "invalid-definition",
    });
    await assert.rejects(loadDefinition(escapedSuite, { root: definitionRoot }), { code: "unsafe-path" });
    await assert.rejects(loadDefinition(parentEscapeSuite, { root: definitionRoot }), { code: "unsafe-path" });
  });
});

test("selectors resolve stable group IDs, one-based positions, and direct-group variants", async () => {
  await withTempDirectory(async (root) => {
    const firstFile = await writeJson(root, "groups/first.json", group("first-group", "description"));
    await writeJson(root, "groups/second.json", group("second-group", "body"));
    const suiteFile = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "selector-suite",
      groups: ["groups/first.json", "groups/second.json"],
    });

    const suite = await loadDefinition(suiteFile, { root });
    const byId = selectDefinition(suite, { group: "second-group", variant: "baseline" });
    const byPosition = selectDefinition(suite, { group: "2" });
    const directDefinition = await loadDefinition(firstFile, { root });
    const direct = selectDefinition(directDefinition, { variant: "candidate" });

    assert.equal(byId.groups[0].position, 2);
    assert.equal(byPosition.groups[0].group.id, "second-group");
    assert.deepEqual(byId.groups[0].variants, {
      baseline: "selected",
      candidate: "not-selected",
    });
    assert.deepEqual(direct.groups[0].variants, {
      baseline: "not-selected",
      candidate: "selected",
    });
    assert.throws(() => selectDefinition(suite, { group: "missing" }), { code: "unknown-group" });
    assert.throws(() => selectDefinition(suite, { variant: "other" }), { code: "invalid-selector" });
    assert.throws(() => selectDefinition(directDefinition, { group: "1" }), { code: "invalid-selector" });
  });
});

test("suite selection preserves group order and marks an unselected variant without failure", async () => {
  await withTempDirectory(async (root) => {
    await writeJson(root, "groups/body.json", group("body-behavior", "body"));
    await writeJson(root, "groups/activation.json", group("natural-activation", "description"));
    const suiteFile = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "authoring-core",
      groups: ["groups/body.json", "groups/activation.json"],
    });

    const definition = await loadDefinition(suiteFile, { root });
    const selection = selectDefinition(definition, { variant: "candidate" });

    assert.equal(definition.kind, "suite");
    assert.deepEqual(
      selection.groups.map((entry) => entry.group.id),
      ["body-behavior", "natural-activation"],
    );
    assert.deepEqual(
      selection.groups.map((entry) => entry.position),
      [1, 2],
    );
    assert.deepEqual(selection.groups[0].variants, {
      baseline: "not-selected",
      candidate: "selected",
    });
  });
});

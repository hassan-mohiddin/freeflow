import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadDefinition, selectDefinition } from "../../../skills/evaluate-skill/scripts/lib/definitions.mjs";

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
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
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
    review_questions: [],
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
    const definition = group("integrated-behavior", "end-to-end");
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

    assert.deepEqual(loaded, definition);
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

test("runtime-only groups may omit a candidate skill target", async () => {
  await withTempDirectory(async (root) => {
    const definition = group("runtime-only", "body");
    definition.variants.baseline = environment();
    definition.variants.candidate = environment();
    definition.runtime = { host: "piflow", session: false, extensions: [], environment: { literal: {}, inherit: [] } };
    const groupFile = await writeJson(root, "runtime-only.json", definition);

    const loaded = await loadDefinition(groupFile, { root });

    assert.deepEqual(loaded.runtime, {
      host: "piflow",
      session: false,
      extensions: [],
      environment: { literal: {}, inherit: [] },
    });
    assert.equal(loaded.variants.candidate.target, null);
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

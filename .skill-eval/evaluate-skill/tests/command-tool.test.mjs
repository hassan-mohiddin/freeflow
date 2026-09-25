import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import registerCommandTool from "../../../skills/evaluate-skill/scripts/pi-command-tool.mjs";

async function withWorkspace(commands, run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-command-tool-test-")));
  const original = {
    commands: process.env.SKILL_EVAL_COMMANDS,
    writable: process.env.SKILL_EVAL_WRITABLE_ROOT,
  };
  process.env.SKILL_EVAL_COMMANDS = JSON.stringify(commands);
  process.env.SKILL_EVAL_WRITABLE_ROOT = directory;
  try {
    await run(directory);
  } finally {
    for (const [key, value] of [
      ["SKILL_EVAL_COMMANDS", original.commands],
      ["SKILL_EVAL_WRITABLE_ROOT", original.writable],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

function installTool() {
  const tools = [];
  registerCommandTool({ registerTool: (tool) => tools.push(tool) });
  assert.equal(tools.length, 1);
  return tools[0];
}

const node = (source) => [process.execPath, "-e", source];

test("the command tool offers only declared command IDs", async () => {
  await withWorkspace(
    [
      { id: "unit-tests", argv: node("") },
      { id: "lint", argv: node("") },
    ],
    async () => {
      const tool = installTool();
      assert.equal(tool.name, "run_command");
      assert.deepEqual(tool.parameters.properties.command.enum, ["unit-tests", "lint"]);
      assert.equal(tool.parameters.additionalProperties, false);
      assert.match(tool.description, /unit-tests/);
    },
  );
});

test("a declared command runs in the workspace and reports its exit status as evidence", async () => {
  await withWorkspace(
    [
      {
        id: "probe",
        argv: node(
          "require('fs').writeFileSync('ran.txt', process.cwd()); console.log('out'); console.error('err'); process.exit(3)",
        ),
      },
    ],
    async (workspace) => {
      const tool = installTool();
      const result = await tool.execute("call-1", { command: "probe" }, undefined, undefined, {});

      assert.equal(await readFile(path.join(workspace, "ran.txt"), "utf8"), workspace);
      assert.equal(result.details.exitCode, 3);
      assert.equal(result.details.timedOut, false);
      assert.match(result.content[0].text, /exit code: 3/);
      assert.match(result.content[0].text, /out/);
      assert.match(result.content[0].text, /err/);
    },
  );
});

test("an undeclared command is rejected without running anything", async () => {
  await withWorkspace([{ id: "probe", argv: node("") }], async () => {
    const tool = installTool();
    await assert.rejects(
      tool.execute("call-1", { command: "rm-everything" }, undefined, undefined, {}),
      /not declared/,
    );
  });
});

test("a command that exceeds its timeout is stopped and reported", async () => {
  await withWorkspace([{ id: "hang", argv: node("setInterval(() => {}, 1000)"), timeout_ms: 200 }], async () => {
    const tool = installTool();
    const started = Date.now();
    const result = await tool.execute("call-1", { command: "hang" }, undefined, undefined, {});

    assert.equal(result.details.timedOut, true);
    assert.match(result.content[0].text, /timed out after 200 ms/);
    assert.ok(Date.now() - started < 10000);
  });
});

test("command output beyond the cap is truncated visibly", async () => {
  await withWorkspace([{ id: "loud", argv: node("process.stdout.write('x'.repeat(200000))") }], async () => {
    const tool = installTool();
    const result = await tool.execute("call-1", { command: "loud" }, undefined, undefined, {});

    assert.equal(result.details.stdout.truncated, true);
    assert.equal(result.details.stdout.bytes, 200000);
    assert.ok(result.content[0].text.length < 70000);
    assert.match(result.content[0].text, /truncated/);
  });
});

test("the command process does not inherit evaluator control variables", async () => {
  await withWorkspace(
    [
      {
        id: "env",
        argv: node(
          "console.log(Object.keys(process.env).filter((key) => key.startsWith('SKILL_EVAL_')).join(',') || 'none')",
        ),
      },
    ],
    async () => {
      const tool = installTool();
      const result = await tool.execute("call-1", { command: "env" }, undefined, undefined, {});

      assert.match(result.content[0].text, /none/);
    },
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "../fixtures/routing-native.js";
import { APPLY_PATCH_LARK_GRAMMAR } from "../../dist/tool-execution/apply-patch/grammar.js";

const on = { freeflowConfig: { toolExecution: { enabled: true } }, cognitiveRouting: { enabled: false } };
const toolNamed = (body, name) => (body.tools ?? []).find((tool) => tool.name === name);

test("apply_patch is declared only while Tool Execution is on, identically in every request", async () => {
  await fixture(
    async () => [],
    false,
    async ({ session, requests }) => {
      await session.prompt("Second request.");
      await session.waitForIdle();
      const tool = toolNamed(requests[0], "apply_patch");
      assert.deepEqual(tool.input_schema.required, ["input"]);
      assert.equal(tool.input_schema.properties.input.type, "string");
      assert.deepEqual(requests[1].tools, requests[0].tools);
    },
    true,
    { ...on, model: ["anthropic", "claude-opus-5-5"] },
  );
  await fixture(
    async () => [],
    false,
    async ({ requests }) => assert.equal(toolNamed(requests[0], "apply_patch"), undefined),
    true,
    { freeflowConfig: { toolExecution: { enabled: false } }, cognitiveRouting: { enabled: false } },
  );
});

test("GPT-5+ models receive apply_patch as Codex's freeform grammar tool", async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      const tool = toolNamed(requests[0], "apply_patch");
      assert.equal(tool.type, "custom");
      assert.deepEqual(tool.format, { type: "grammar", syntax: "lark", definition: APPLY_PATCH_LARK_GRAMMAR });
    },
    true,
    { ...on, model: ["openai", "gpt-5.2"] },
  );
});

test(
  "a model's patch applies, reports in Codex's form, and counts as reading the file",
  { timeout: 30000 },
  async () => {
    let cwd;
    const input = [
      "*** Begin Patch",
      "*** Update File: code.py",
      "@@ def greet(name):",
      "-    return 'hello ' + name",
      "+    return 'hi ' + name",
      "*** Add File: notes.md",
      "+patched",
      "*** End Patch",
    ].join("\n");
    await fixture(
      async (n) =>
        [
          [{ name: "apply_patch", args: { input } }],
          [{ name: "write", args: { path: "code.py", content: "rewritten\n" } }],
        ][n - 1] ?? [],
      false,
      async ({ manager }) => {
        const results = manager
          .getBranch()
          .filter((entry) => entry.message?.role === "toolResult")
          .map((entry) => entry.message);
        assert.equal(results[0].isError, false);
        assert.equal(results[0].content[0].text, "Success. Updated the following files:\nM code.py\nA notes.md");
        assert.equal(await readFile(join(cwd, "notes.md"), "utf8"), "patched\n");
        assert.equal(results[1].isError, false, "a file apply_patch wrote may be overwritten without another read");
        assert.equal(await readFile(join(cwd, "code.py"), "utf8"), "rewritten\n");
      },
      true,
      {
        ...on,
        model: ["anthropic", "claude-opus-5-5"],
        beforePrompt: async (context) => {
          cwd = context.cwd;
          await writeFile(join(cwd, "code.py"), "def greet(name):\n    return 'hello ' + name\n");
        },
      },
    );
  },
);

import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "../fixtures/routing-native.js";

const on = { freeflowConfig: { toolExecution: { enabled: true } }, cognitiveRouting: { enabled: false } };
const CHANGED =
  "Files you read earlier changed since you read them: code.py. Read what you need from them again before editing them.";
const results = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult")
    .map((entry) => entry.message);
const strip = (value) => JSON.parse(JSON.stringify(value, (key, v) => (key === "cache_control" ? undefined : v)));

test("a command that changes a file the model read says so once, on its own result", { timeout: 30000 }, async () => {
  await fixture(
    async (n) =>
      [
        [{ name: "read", args: { path: "code.py" } }],
        [{ name: "bash", args: { command: "echo 'x = 2' >> code.py" } }],
        [{ name: "bash", args: { command: "true" } }],
      ][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const [, changed, later] = results(manager);
      assert.equal(changed.content[0].text, `(no output)\n${CHANGED}`);
      assert.doesNotMatch(later.content[0]?.text ?? "", /changed since you read/);
    },
    true,
    {
      ...on,
      model: ["anthropic", "claude-opus-5-5"],
      beforePrompt: async ({ cwd }) => writeFile(join(cwd, "code.py"), "x = 1\n"),
    },
  );
});

test(
  "a file changed between prompts is named after the next prompt, and the request extends the previous one",
  { timeout: 30000 },
  async () => {
    let cwd;
    await fixture(
      async (n) => (n === 1 ? [{ name: "read", args: { path: "code.py" } }] : []),
      false,
      async ({ session, requests }) => {
        await appendFile(join(cwd, "code.py"), "y = 3\n");
        await session.prompt("Continue.");
        await session.waitForIdle();
        const before = requests[1].messages;
        const after = requests[2].messages;
        assert.deepEqual(strip(after.slice(0, before.length)), strip(before));
        const added = JSON.stringify(after.slice(before.length));
        assert.ok(added.indexOf("Continue.") < added.indexOf(`[Freeflow notice, not from the user] ${CHANGED}`));
        await session.prompt("Again.");
        await session.waitForIdle();
        assert.doesNotMatch(JSON.stringify(requests[3].messages.slice(after.length)), /changed since you read/);
        assert.deepEqual(requests[3].tools, requests[0].tools);
        assert.deepEqual(requests[3].system, requests[0].system);
      },
      true,
      {
        ...on,
        model: ["anthropic", "claude-opus-5-5"],
        beforePrompt: async (context) => {
          cwd = context.cwd;
          await writeFile(join(cwd, "code.py"), "x = 1\n");
        },
      },
    );
  },
);

test("a background command ending in & is refused before it runs", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => (n === 1 ? [{ name: "bash", args: { command: "touch started &" } }] : []),
    false,
    async ({ manager, cwd }) => {
      const [refused] = results(manager);
      assert.equal(refused.isError, true);
      assert.match(refused.content[0].text, /Run it with bash_background instead, without the &\./);
      await assert.rejects(import("node:fs/promises").then((fs) => fs.access(join(cwd, "started"))));
    },
    true,
    on,
  );
});

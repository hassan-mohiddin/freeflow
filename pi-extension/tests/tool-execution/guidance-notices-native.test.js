import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "../fixtures/routing-native.js";
import { COMMIT_NOTICE, DIAGNOSE_NOTICE, INSTRUCTION_TEXT_NOTICE } from "../../dist/tool-execution/guidance-notices.js";

const EXECUTE_WORK = /Read Execute Work \(\S+\/skills\/execute-work\/SKILL\.md\) before more tool calls/;

const on = (toolExecution = { enabled: true }) => ({
  freeflowConfig: { toolExecution },
  cognitiveRouting: { enabled: false },
  model: ["anthropic", "claude-opus-5-5"],
});
const results = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult")
    .map((entry) => entry.message.content.map((part) => part.text ?? "").join(""));
const strip = (value) => JSON.parse(JSON.stringify(value, (key, v) => (key === "cache_control" ? undefined : v)));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
async function repository(cwd) {
  git(cwd, "init", "-q", "-b", "main");
  await mkdir(join(cwd, "skills/demo"), { recursive: true });
  await writeFile(join(cwd, "skills/demo/SKILL.md"), "# Demo\n");
  await writeFile(join(cwd, "code.js"), "export const x = 1;\n");
  // Plain scripts behind npm: a nested node --test would see this runner's context and skip its files.
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ scripts: { "test:fail": "exit 1", "test:pass": "exit 0" } }),
  );
}
const commit = (paths) => ({
  name: "bash",
  args: {
    command: `git add ${paths} && git -c user.name=T -c user.email=t@e.com -c commit.gpgsign=false commit -qm work`,
  },
});

test(
  "a git commit result carries the commit essentials, and the loss-check line only when instruction text was staged; later requests extend earlier ones",
  { timeout: 30000 },
  async () => {
    await fixture(
      async (n) => [[commit("code.js")], [commit("skills/demo/SKILL.md")]][n - 1] ?? [],
      false,
      async ({ manager, session, requests }) => {
        const [code, skill] = results(manager);
        assert.ok(code.includes(COMMIT_NOTICE), code);
        assert.ok(code.includes('<freeflow-notice type="guidance">'));
        assert.ok(!code.includes(INSTRUCTION_TEXT_NOTICE));
        // Once per run: the second commit in the same run gets no repeat.
        assert.ok(!skill.includes(COMMIT_NOTICE));
        await session.prompt("Continue.");
        await session.waitForIdle();
        const before = requests[1].messages;
        const after = requests.at(-1).messages;
        assert.deepEqual(strip(after.slice(0, before.length)), strip(before));
        assert.deepEqual(requests.at(-1).system, requests[0].system);
        assert.deepEqual(requests.at(-1).tools, requests[0].tools);
      },
      true,
      { ...on(), beforePrompt: async ({ cwd }) => repository(cwd) },
    );
    await fixture(
      async (n) => (n === 1 ? [commit("skills/demo/SKILL.md code.js")] : []),
      false,
      async ({ manager }) => {
        const [skill] = results(manager);
        assert.ok(skill.includes(COMMIT_NOTICE));
        assert.ok(skill.includes(INSTRUCTION_TEXT_NOTICE), skill);
      },
      true,
      { ...on(), beforePrompt: async ({ cwd }) => repository(cwd) },
    );
  },
);

test("the second failure of the same test command carries diagnose's lines, once", { timeout: 30000 }, async () => {
  const run = { name: "bash", args: { command: "npm run -s test:fail" } };
  await fixture(
    async (n) => (n <= 3 ? [run] : []),
    false,
    async ({ manager }) => {
      const [first, second, third] = results(manager);
      assert.ok(!first.includes(DIAGNOSE_NOTICE));
      assert.ok(second.includes(DIAGNOSE_NOTICE), second);
      assert.ok(!third.includes(DIAGNOSE_NOTICE));
    },
    true,
    { ...on(), beforePrompt: async ({ cwd }) => repository(cwd) },
  );
});

test(
  "a passing test after a file changed reminds of self-review once, unless it already ran",
  { timeout: 30000 },
  async () => {
    const pass = { name: "bash", args: { command: "npm run -s test:pass" } };
    await fixture(
      async (n) =>
        [[pass], [{ name: "write", args: { path: "new.js", content: "export const y = 2;\n" } }], [pass], [pass]][
          n - 1
        ] ?? [],
      false,
      async ({ manager }) => {
        const [before, , after, again] = results(manager);
        assert.doesNotMatch(before, /self-review\.mjs/);
        assert.match(
          after,
          /Before your final report \(Execute Work's step before reporting; read Execute Work if its body is not in your context\): run `node \S+\/skills\/execute-work\/scripts\/self-review\.mjs --base <ref>`/,
        );
        assert.doesNotMatch(again, /self-review\.mjs/);
      },
      true,
      { ...on(), beforePrompt: async ({ cwd }) => repository(cwd) },
    );
  },
);

test("toolExecution.guidanceNotices false turns the notices off", { timeout: 30000 }, async () => {
  const run = { name: "bash", args: { command: "npm run -s test:fail" } };
  await fixture(
    async (n) => [[commit("code.js")], [run], [run]][n - 1] ?? [],
    false,
    async ({ manager }) => {
      for (const text of results(manager)) assert.doesNotMatch(text, /freeflow-notice type="guidance"/);
    },
    true,
    { ...on({ enabled: true, guidanceNotices: false }), beforePrompt: async ({ cwd }) => repository(cwd) },
  );
});

test("toolExecution.guidanceNotices is on by default, layered personal over repository, and must be a boolean", async () => {
  const { resolveToolExecutionConfig, validateToolExecutionConfig } =
    await import("../../dist/tool-execution/config.js");
  assert.equal(resolveToolExecutionConfig({}, {}, true).guidanceNotices, true);
  assert.equal(
    resolveToolExecutionConfig({ toolExecution: { guidanceNotices: false } }, {}, true).guidanceNotices,
    false,
  );
  assert.equal(
    resolveToolExecutionConfig(
      { toolExecution: { guidanceNotices: false } },
      { toolExecution: { guidanceNotices: true } },
      true,
    ).guidanceNotices,
    true,
  );
  assert.equal(validateToolExecutionConfig({ guidanceNotices: true }), null);
  assert.equal(
    validateToolExecutionConfig({ guidanceNotices: "no" }),
    "toolExecution.guidanceNotices must be a boolean",
  );
});

test(
  "a tool result while Execute Work is unread asks for it once per run, after a read of Freeflow's own instruction files",
  { timeout: 30000 },
  async () => {
    const skill = (name) => ({
      name: "read",
      args: { path: fileURLToPath(new URL(`../../../skills/${name}/SKILL.md`, import.meta.url)) },
    });
    const look = { name: "bash", args: { command: "ls" } };
    await fixture(
      async (n) =>
        [[skill("discuss-work")], [look], [look], [], [look], [skill("execute-work")], [], [look]][n - 1] ?? [],
      false,
      async ({ manager, session }) => {
        await session.prompt("Continue.");
        await session.waitForIdle();
        await session.prompt("Again.");
        await session.waitForIdle();
        const [discuss, first, second, nextRun, read, afterRead] = results(manager);
        assert.ok(!EXECUTE_WORK.test(discuss), discuss);
        assert.match(first, EXECUTE_WORK);
        assert.ok(!EXECUTE_WORK.test(second), second);
        // A new run asks again while the body is still not in context; once it is, no run asks.
        assert.match(nextRun, EXECUTE_WORK);
        assert.ok(!EXECUTE_WORK.test(read));
        assert.ok(!EXECUTE_WORK.test(afterRead), afterRead);
      },
      true,
      { ...on(), beforePrompt: async ({ cwd }) => repository(cwd) },
    );
  },
);

test("the Execute Work notice stays off while Execute Work is turned off", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => (n === 1 ? [{ name: "bash", args: { command: "ls" } }] : []),
    false,
    async ({ manager }) => {
      assert.equal(results(manager).length, 1);
      for (const text of results(manager)) assert.ok(!EXECUTE_WORK.test(text), text);
    },
    true,
    {
      ...on(),
      freeflowConfig: { toolExecution: { enabled: true }, skills: { "execute-work": false } },
      beforePrompt: async ({ cwd }) => repository(cwd),
    },
  );
});

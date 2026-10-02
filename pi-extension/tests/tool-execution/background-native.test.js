import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fixture } from "../fixtures/routing-native.js";

const on = { freeflowConfig: { toolExecution: { enabled: true } }, cognitiveRouting: { enabled: false } };
const toolNames = (body) => (body.tools ?? []).map((tool) => tool.name);
const idIn = (body) => JSON.stringify(body).match(/background with ID (bg[0-9a-z]{6})/)?.[1];
const pathIn = (body) => JSON.stringify(body).match(/Output: ([^ ]+?\.output)/)?.[1];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, what) => {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await wait(25);
  }
  assert.fail(`timed out waiting for ${what}`);
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// Anthropic cache markers move to the newest message on every request; they are not content.
const strip = (value) => JSON.parse(JSON.stringify(value, (key, v) => (key === "cache_control" ? undefined : v)));
const extends_ = (later, earlier) =>
  assert.deepEqual(strip(later.messages.slice(0, earlier.messages.length)), strip(earlier.messages));

test("background tools are declared only while Tool Execution is on", async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      assert.ok(toolNames(requests[0]).includes("bash_background"));
      assert.ok(toolNames(requests[0]).includes("stop_background"));
    },
    true,
    on,
  );
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      assert.ok(!toolNames(requests[0]).includes("bash_background"));
      assert.ok(!toolNames(requests[0]).includes("stop_background"));
    },
    true,
    { freeflowConfig: { toolExecution: { enabled: false } }, cognitiveRouting: { enabled: false } },
  );
});

test(
  "a command that fails while the agent is idle starts a turn whose request extends the previous one",
  { timeout: 30000 },
  async () => {
    await fixture(
      async (n) =>
        n === 1
          ? [
              {
                name: "bash_background",
                args: { command: "sleep 0.5; echo partial; exit 3", description: "fail later" },
              },
            ]
          : [],
      false,
      async ({ session, requests }) => {
        assert.equal(requests.length, 2, "the start returned at once and the run ended");
        const id = idIn(requests[1]);
        const outputPath = pathIn(requests[1]);
        assert.ok(id && outputPath);
        await until(() => requests.length === 3, "the exit notice's turn");
        await session.waitForIdle();
        const notice = JSON.stringify(requests[2].messages.slice(requests[1].messages.length + 1));
        assert.match(
          notice,
          new RegExp(`Background command ${id} \\(fail later\\) failed with exit code 3\\. Output: `),
        );
        extends_(requests[2], requests[1]);
        assert.equal(await readFile(outputPath, "utf8"), "partial\n[exited with code 3]\n");
        assert.deepEqual(requests[2].tools, requests[0].tools, "job activity leaves the tools unchanged");
        assert.deepEqual(requests[2].system, requests[0].system);
      },
      true,
      { ...on, model: ["anthropic", "claude-opus-5-5"] },
    );
  },
);

test("an exit during a run is delivered after that turn's tool results", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => {
      if (n === 1) return [{ name: "bash_background", args: { command: "sleep 0.2; echo done" } }];
      // The command exits while this response is still streaming.
      if (n === 2) {
        await wait(800);
        return [{ name: "read", args: { path: "evidence.txt" } }];
      }
      return [];
    },
    false,
    async ({ requests }) => {
      const id = idIn(requests[1]);
      assert.ok(id);
      assert.doesNotMatch(JSON.stringify(requests[1]), /Background command bg/);
      const third = requests[2].messages;
      const added = JSON.stringify(third.slice(requests[1].messages.length));
      const read = added.indexOf("EXACT_EVIDENCE_BODY_81");
      const notice = added.indexOf(`Background command ${id} (sleep 0.2; echo done) completed.`);
      assert.ok(read >= 0 && notice > read, "the notice follows the read's result");
      extends_(requests[2], requests[1]);
      assert.deepEqual(requests[2].tools, requests[0].tools);
    },
    true,
    { ...on, model: ["anthropic", "claude-opus-5-5"] },
  );
});

test("stop returns after the process exited and sends no notice", { timeout: 30000 }, async () => {
  let pid;
  await fixture(
    async (n, body) => {
      if (n === 1) return [{ name: "bash_background", args: { command: "echo $$; sleep 60" } }];
      if (n === 2) {
        const outputPath = pathIn(body);
        await until(async () => (await readFile(outputPath, "utf8")).includes("\n"), "the shell's pid");
        pid = Number((await readFile(outputPath, "utf8")).trim());
        assert.ok(alive(pid));
        return [{ name: "stop_background", args: { id: idIn(body) } }];
      }
      return [];
    },
    false,
    async ({ requests, manager }) => {
      const results = manager
        .getBranch()
        .filter((entry) => entry.message?.role === "toolResult")
        .map((entry) => entry.message);
      const id = idIn(requests[1]);
      assert.equal(results[1].content[0].text, `Stopped ${id}.`);
      assert.equal(alive(pid), false, "the process tree is gone when stop returns");
      assert.match(await readFile(pathIn(requests[1]), "utf8"), /\n\[stopped\]\n$/);
      await wait(200);
      assert.equal(requests.length, 3);
      assert.doesNotMatch(JSON.stringify(requests), /Background command bg/);
    },
    true,
    on,
  );
});

test(
  "after compaction running commands are restated once, and session end kills them",
  { timeout: 30000 },
  async () => {
    let pid;
    await fixture(
      async (n) =>
        n === 1 ? [{ name: "bash_background", args: { command: "echo $$; sleep 60", description: "server" } }] : [],
      false,
      async ({ session, requests }) => {
        const id = idIn(requests[1]);
        const outputPath = pathIn(requests[1]);
        await until(async () => (await readFile(outputPath, "utf8")).includes("\n"), "the shell's pid");
        pid = Number((await readFile(outputPath, "utf8")).trim());
        await session.compact();
        await session.prompt("Continue.");
        await session.waitForIdle();
        const text = JSON.stringify(requests.at(-1));
        const restated = `Still running: ${id} (server), output ${outputPath}. Do not start them again; stop one with stop_background before restarting it.`;
        assert.equal(text.split(restated).length - 1, 1, "restated exactly once");
        assert.ok(alive(pid));
        await session.reload();
        assert.equal(alive(pid), false, "session end killed the command");
        assert.match(await readFile(outputPath, "utf8"), /\n\[stopped at session end\]\n$/);
        await wait(200);
        assert.doesNotMatch(JSON.stringify(requests), /Background command bg/);
      },
      true,
      on,
    );
  },
);

test(
  "a run an idle exit notice starts keeps Freeflow's system sections in every request",
  { timeout: 30000 },
  async () => {
    // A run started by an extension message loses before_agent_start sections from its second request (Pi #10267),
    // so an idle notice starts its run as a user message.
    const sections = (body) => {
      const system = body.input.find((item) => item.role === "system")?.content ?? "";
      return (system.match(/\n<([a-z_]+)>/g) ?? []).map((tag) => tag.trim());
    };
    await fixture(
      async (n) =>
        [
          [{ name: "bash_background", args: { command: "sleep 0.3; echo done" } }],
          [],
          [{ name: "read", args: { path: "evidence.txt" } }],
          [],
        ][n - 1] ?? [],
      false,
      async ({ session, requests }) => {
        await until(() => requests.length >= 4, "the notice's run to make two requests");
        await session.waitForIdle();
        assert.match(JSON.stringify(requests[2].input), /Background command bg[0-9a-z]{6} \(.*\) completed/);
        for (const body of requests.slice(2)) assert.ok(sections(body).includes("<freeflow_guidance>"));
        assert.deepEqual(sections(requests[3]), sections(requests[2]));
      },
      true,
      on,
    );
  },
);

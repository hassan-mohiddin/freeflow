import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// Never the user's real registry.
process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));

// Task memory on a real Pi session with scripted model responses: attaching records, the snapshot of the focused
// record, the write gate, and the state following reload, navigation and compaction.
const script = resolve("skills/track-work/scripts/working-record.mjs");
const RECORD_A = ".freeflow/tasks/task-001-retry-work/record.md";
const RECORD_B = ".freeflow/tasks/task-002-docs-cleanup/record.md";
const on = (extra = {}) => ({
  cognitiveRouting: { enabled: false },
  freeflowConfig: { taskMemory: { enabled: true }, ...extra },
});
const text = (item) =>
  typeof item.content === "string"
    ? item.content
    : (item.content ?? []).map((part) => part.text ?? "").join("") + (item.output ?? "");
const inputText = (body) => body.input.map(text).join("\n");
const toolResults = (manager, name) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    .map((entry) => entry.message);
const taskEntries = (manager) =>
  manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === "freeflow-task-memory-v1");
const snapshots = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.type === "custom_message" && entry.customType === "freeflow-task-memory-snapshot");

function makeRecords(cwd) {
  for (const [name, goal, agreement] of [
    [
      "Retry work",
      "Retries with backoff in the HTTP client.",
      "- Add the retries and open a PR; merging is yours.\n\n",
    ],
    ["Docs cleanup", "Remove stale docs.", ""],
  ])
    execFileSync(process.execPath, [script, "init", "--schema", "4", "--root", cwd, "--name", name, "--input", "-"], {
      input: `### Goal\n- ${goal}\n\n${agreement && `### Work agreement\n${agreement}`}### Next useful action\n- Continue.\n`,
    });
}

test("the model proposes attaching; the user confirms and the resume view comes back", { timeout: 30000 }, async () => {
  const confirms = [];
  await fixture(
    async (n) => (n === 1 ? [{ name: "task_memory", args: { action: "attach", record: RECORD_A } }] : []),
    false,
    async ({ manager, requests, cwd }) => {
      assert.equal(confirms.length, 1);
      const [result] = toolResults(manager, "task_memory");
      assert.notEqual(result.isError, true, text(result));
      assert.match(text(result), /Focused task: Retry work/);
      assert.match(text(result), /## Current Context[\s\S]*Retries with backoff/);
      assert.match(text(result), /do not read it again/);
      assert.equal(result.details.snapshot, join(cwd, RECORD_A));
      assert.deepEqual(
        taskEntries(manager).map((entry) => entry.data.op),
        ["attach"],
      );
      // The next request's Runtime State names the focus.
      assert.match(inputText(requests[1]), /Task Memory:\n- Focus: Retry work/);
    },
    true,
    {
      ...on(),
      ui: { confirm: async (...args) => (confirms.push(args), true) },
      beforePrompt: ({ cwd }) => makeRecords(cwd),
    },
  );
});

test("a declined attach changes nothing", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => (n === 1 ? [{ name: "task_memory", args: { action: "attach", record: RECORD_A } }] : []),
    false,
    async ({ manager, requests }) => {
      const [result] = toolResults(manager, "task_memory");
      assert.equal(result.isError, true);
      assert.match(text(result), /declined/);
      assert.equal(taskEntries(manager).length, 0);
      assert.match(inputText(requests[1]), /Task Memory:\n- Attached: none/);
    },
    true,
    { ...on(), ui: { confirm: async () => false }, beforePrompt: ({ cwd }) => makeRecords(cwd) },
  );
});

test("the user attaches by command; the snapshot reaches the next request", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ manager, requests }) => {
      assert.equal(snapshots(manager).length, 1);
      // Shown in the transcript as one collapsed line (render.ts); the model receives the same content either way.
      assert.equal(snapshots(manager)[0].display, true);
      assert.match(inputText(requests[0]), /Focused task: Retry work[\s\S]*Retries with backoff/);
      // The Work agreement reaches the model with the rest of Current Context.
      assert.match(inputText(requests[0]), /### Work agreement\n\n- Add the retries and open a PR; merging is yours\./);
      assert.match(inputText(requests[0]), /Complete the fixture assignment/);
    },
    true,
    {
      ...on(),
      beforePrompt: async ({ cwd, session }) => {
        makeRecords(cwd);
        await session.prompt(`/freeflow task attach ${RECORD_A}`);
      },
    },
  );
});

test(
  "writes to a record that is not attached are refused; the attached one is written",
  { timeout: 30000 },
  async () => {
    let cwd;
    await fixture(
      async (n) =>
        n === 1
          ? [
              { name: "write", args: { path: RECORD_B, content: "overwritten" } },
              {
                name: "bash",
                args: { command: `node ${script} decision add --record ${RECORD_B} --title T --input -` },
              },
            ]
          : n === 2
            ? [
                {
                  name: "edit",
                  args: { path: RECORD_A, edits: [{ oldText: "- Continue.", newText: "- Continue now." }] },
                },
              ]
            : [],
      false,
      async ({ manager }) => {
        const results = manager
          .getBranch()
          .filter((entry) => entry.message?.role === "toolResult")
          .map((entry) => entry.message);
        const [write, bash, edit] = results;
        assert.equal(write.isError, true);
        assert.match(text(write), /not attached to this session/);
        assert.equal(bash.isError, true);
        assert.match(text(bash), /not attached to this session/);
        assert.notEqual(edit.isError, true, text(edit));
        assert.match(await readFile(join(cwd, RECORD_B), "utf8"), /Docs cleanup/);
        assert.match(await readFile(join(cwd, RECORD_A), "utf8"), /- Continue now\./);
      },
      true,
      {
        ...on(),
        beforePrompt: async ({ cwd: dir, session }) => {
          cwd = dir;
          makeRecords(dir);
          await session.prompt(`/freeflow task attach ${RECORD_A}`);
        },
      },
    );
  },
);

test("off by default: no tool, no gate, no Runtime State lines", { timeout: 30000 }, async () => {
  let cwd;
  await fixture(
    async (n) => (n === 1 ? [{ name: "write", args: { path: RECORD_B, content: "written" } }] : []),
    false,
    async ({ requests }) => {
      assert.ok(!(requests[0].tools ?? []).some((tool) => tool.name === "task_memory"));
      assert.doesNotMatch(inputText(requests[0]), /Task Memory:/);
      assert.equal(await readFile(join(cwd, RECORD_B), "utf8"), "written");
    },
    true,
    {
      cognitiveRouting: { enabled: false },
      // Tool Execution (on by default) refuses overwriting an unread file; this test is about task memory alone.
      freeflowConfig: { toolExecution: { enabled: false } },
      beforePrompt: ({ cwd: dir }) => {
        cwd = dir;
        makeRecords(dir);
      },
    },
  );
});

test("reload keeps the state without delivering the snapshot again", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ manager, session, requests }) => {
      await session.reload();
      await session.prompt("After reload.");
      await session.waitForIdle();
      assert.equal(snapshots(manager).length, 1);
      assert.match(inputText(requests.at(-1)), /Task Memory:\n- Focus: Retry work/);
    },
    true,
    {
      ...on(),
      beforePrompt: async ({ cwd, session }) => {
        makeRecords(cwd);
        await session.prompt(`/freeflow task attach ${RECORD_A}`);
      },
    },
  );
});

test("navigating to an earlier point restores that point's records, with a notice", { timeout: 30000 }, async () => {
  let before;
  await fixture(
    async () => [],
    false,
    async ({ manager, session, notices, cwd }) => {
      await session.prompt(`/freeflow task attach ${RECORD_B}`);
      assert.equal(taskEntries(manager).at(-1).data.record, join(cwd, RECORD_B));
      await session.navigateTree(before, { summarize: false });
      const ops = taskEntries(manager).map((entry) => [entry.data.op, entry.data.record]);
      assert.deepEqual(ops, [["attach", join(cwd, RECORD_A)]]);
      assert.ok(
        notices.some(([message]) => /Task memory follows this branch: focus Docs cleanup -> Retry work/.test(message)),
      );
    },
    true,
    {
      ...on(),
      beforePrompt: async ({ cwd, session, manager }) => {
        makeRecords(cwd);
        await session.prompt(`/freeflow task attach ${RECORD_A}`);
        before = manager.getLeafId();
      },
    },
  );
});

test("after Pi's compaction the focused record is delivered again", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ manager, session }) => {
      await session.compact();
      const branch = manager.getBranch();
      const compactionIndex = branch.findLastIndex((entry) => entry.type === "compaction");
      assert.ok(compactionIndex >= 0);
      const after = branch.slice(compactionIndex + 1);
      assert.ok(
        after.some((entry) => entry.type === "custom_message" && entry.customType === "freeflow-task-memory-snapshot"),
      );
    },
    true,
    {
      ...on(),
      beforePrompt: async ({ cwd, session }) => {
        makeRecords(cwd);
        await session.prompt(`/freeflow task attach ${RECORD_A}`);
      },
    },
  );
});

test(
  "the delivered resume view is enclosed, so the next user message cannot read as part of the record",
  { timeout: 30000 },
  async () => {
    await fixture(
      async () => [],
      false,
      async ({ requests }) => {
        const sent = inputText(requests[0]);
        const end = sent.indexOf("End of task memory.");
        assert.ok(sent.indexOf("<task-memory record=") >= 0 && end > 0);
        assert.match(sent.slice(0, end), /## Notes\s*\n<\/task-memory>/);
        assert.ok(
          sent.indexOf("Complete the fixture assignment.") > end,
          "the user's prompt comes after the closing line",
        );
      },
      true,
      {
        ...on(),
        beforePrompt: async ({ cwd, session }) => {
          makeRecords(cwd);
          await session.prompt(`/freeflow task attach ${RECORD_A}`);
        },
      },
    );
  },
);

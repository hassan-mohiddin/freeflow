import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "../fixtures/pi-native.js";
import { EventRecorder } from "../../dist/events/recorder.js";
import { DIAGNOSE_NOTICE, TEST_COMMAND } from "../../dist/tool-execution/guidance-notices.js";
import { DIAGNOSE_LINE, POINTERS, TEST_COMMAND as SHARED_TEST_COMMAND } from "../../../hooks/shared/pointers.mjs";

// The reference pointers on Pi (src/host/pointers.ts): a pull request about to open and a test file edited each join
// that call's result, once a context cycle, kept as a `pointer` sent line; pointers.enabled off sends none and holds
// back the guidance notices' diagnose line, which is the fourth pointer. Pi has no workers.

const sentLines = [];
const emit = EventRecorder.prototype.emit;
EventRecorder.prototype.emit = function (kind, fields = {}) {
  if (kind === "sent") sentLines.push({ what: fields.what, text: fields.text });
  return emit.call(this, kind, fields);
};
const pointerLines = () => sentLines.filter((line) => line.what === "pointer");

const results = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult")
    .map((entry) => entry.message.content.map((part) => part.text ?? "").join(""));
const bash = (command) => ({ name: "bash", args: { command } });
const write = (path) => ({ name: "write", args: { path, content: "export const t = 1;\n" } });
// gh is a shell function here, so the command matches and nothing leaves the machine.
const prCreate = bash("gh() { echo opened; }; gh pr create --fill");
async function repository(cwd) {
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "tests"), { recursive: true });
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ scripts: { "test:fail": "exit 1", "test:pass": "exit 0" } }),
  );
}
const config = (freeflowConfig) => ({
  freeflowConfig,
  model: ["anthropic", "claude-opus-5-5"],
  beforePrompt: async ({ cwd }) => repository(cwd),
});
const has = (text, id) => text.includes(POINTERS[id]);

test("Pi's diagnose line and test commands are the ones the pointers module sends on the other hosts", () => {
  assert.equal(DIAGNOSE_LINE, DIAGNOSE_NOTICE);
  assert.equal(SHARED_TEST_COMMAND.source, TEST_COMMAND.source);
});

test(
  "a pull request about to open and a test file edited carry their pointer once a cycle, as pointer sent lines; a compaction's new cycle sends them again",
  { timeout: 60000 },
  async () => {
    sentLines.length = 0;
    const script = [
      [bash("git status")],
      [write("src/code.js")],
      [write("tests/a.test.js")],
      [prCreate],
      [write("tests/b.test.js")],
      [prCreate],
      [],
      // After the compaction:
      [prCreate],
      [write("src/c.test.js")],
      [],
    ];
    await fixture(
      async (n) => script[n - 1] ?? [],
      false,
      async ({ manager, session }) => {
        const before = results(manager);
        assert.equal(before.length, 6);
        const [status, source, firstTest, firstPr, secondTest, secondPr] = before;
        for (const text of [status, source]) assert.ok(!Object.keys(POINTERS).some((id) => has(text, id)), text);
        assert.ok(has(firstTest, "test-edit"), firstTest);
        assert.ok(firstTest.includes('<freeflow-notice type="guidance">'));
        assert.ok(has(firstPr, "pull-request"), firstPr);
        assert.ok(!has(secondTest, "test-edit") && !has(secondPr, "pull-request"), "once a cycle");
        // Pi has no workers, and its diagnose line stays the guidance notices'.
        assert.ok(!before.some((text) => has(text, "delegation")));
        assert.equal(pointerLines().length, 2);
        assert.ok(pointerLines()[0].text.includes(POINTERS["test-edit"]));
        assert.ok(pointerLines()[1].text.includes(POINTERS["pull-request"]));

        await session.compact();
        await session.prompt("Continue.");
        await session.waitForIdle();
        const after = results(manager).slice(-2);
        assert.ok(has(after[0], "pull-request"), after[0]);
        assert.ok(has(after[1], "test-edit"), after[1]);
        assert.equal(pointerLines().length, 4);
      },
      true,
      config({ toolExecution: { enabled: true } }),
    );
  },
);

test(
  "with Tool Execution off the pointers still come; pointers.enabled off sends none and holds back the diagnose line",
  { timeout: 60000 },
  async () => {
    sentLines.length = 0;
    await fixture(
      async (n) => [[write("tests/a.test.js")], [prCreate], []][n - 1] ?? [],
      false,
      async ({ manager }) => {
        const [edit, pr] = results(manager);
        assert.ok(has(edit, "test-edit"), edit);
        assert.ok(has(pr, "pull-request"), pr);
      },
      true,
      config({ toolExecution: { enabled: false } }),
    );

    sentLines.length = 0;
    const fail = bash("npm run -s test:fail");
    await fixture(
      async (n) => [[write("tests/a.test.js")], [prCreate], [fail], [fail], []][n - 1] ?? [],
      false,
      async ({ manager }) => {
        const texts = results(manager);
        assert.equal(texts.length, 4);
        for (const text of texts) {
          assert.ok(!Object.keys(POINTERS).some((id) => has(text, id)), text);
          assert.ok(!text.includes(DIAGNOSE_NOTICE), text);
        }
        assert.deepEqual(pointerLines(), []);
      },
      true,
      config({ toolExecution: { enabled: true }, pointers: { enabled: false } }),
    );
  },
);

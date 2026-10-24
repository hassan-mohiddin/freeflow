import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fixture } from "../fixtures/routing-native.js";

// Real Pi reads of a shipped skill: every read returns the whole text, the Runtime State names the skill from the
// next prompt on, and a compaction clears that list.
const SKILL = fileURLToPath(new URL("../../../skills/track-work/SKILL.md", import.meta.url));
const STATE_LINE = "Freeflow skills read in this context: track-work";
const toolExecution = { freeflowConfig: { toolExecution: { enabled: true } }, cognitiveRouting: { enabled: false } };

const readResults = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === "read")
    .map((entry) => entry.message.content.map((part) => part.text ?? "").join(""));
const readSkill = [{ name: "read", args: { path: SKILL } }];
const firstPrompt = async ({ session }) => {
  await session.prompt("FIRST_PROMPT");
  await session.waitForIdle();
};

test("a repeat read of a skill in the same context returns its whole text again", { timeout: 30000 }, async () => {
  const body = await readFile(SKILL, "utf8");
  await fixture(
    async (n) => [readSkill, readSkill, [], readSkill][n - 1] ?? [],
    false,
    async ({ manager, requests }) => {
      assert.deepEqual(readResults(manager), [body, body, body]);
      assert.ok(!JSON.stringify(requests.slice(0, 3)).includes(STATE_LINE), "no state message mid-run");
      assert.ok(JSON.stringify(requests[3]).includes(STATE_LINE), "the next prompt's state names the skill");
    },
    true,
    { ...toolExecution, beforePrompt: firstPrompt },
  );
});

test("after Pi's own compaction a skill read returns its text again", { timeout: 30000 }, async () => {
  const body = await readFile(SKILL, "utf8");
  await fixture(
    // Request 3 is Freeflow's summarizer.
    async (n) => [readSkill, [], [], readSkill][n - 1] ?? [],
    false,
    async ({ manager }) => {
      assert.deepEqual(readResults(manager).slice(-1), [body]);
      const compaction = manager.getBranch().find((entry) => entry.type === "compaction");
      assert.match(compaction.summary, /Freeflow skills read in cycle 1: track-work\./);
    },
    true,
    {
      ...toolExecution,
      fixtureCompaction: false,
      beforePrompt: async ({ session }) => {
        await firstPrompt({ session });
        await session.compact();
      },
    },
  );
});

test(
  "a Coordinator under projection gets the text again, and its state names no skill",
  { timeout: 30000 },
  async () => {
    const body = await readFile(SKILL, "utf8");
    await fixture(
      async (n) => [readSkill, readSkill][n - 1] ?? [],
      true,
      async ({ manager, requests }) => {
        assert.deepEqual(readResults(manager), [body, body]);
        assert.ok(!JSON.stringify(requests).includes(STATE_LINE));
      },
      true,
      { freeflowConfig: { toolExecution: { enabled: true } } },
    );
  },
);

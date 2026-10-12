// Scratch proof for rs-6cdbdfcf (not part of the workspace). Two Freeflow compactions in one session: the second
// compaction's session-wide read list must keep the first cycle's read and add the second cycle's.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

const noRouting = () => ({
  cognitiveRouting: { enabled: false },
  freeflowConfig: { toolExecution: { enabled: true } },
});
const compact = (args) => ({ name: "freeflow_compact", args });
const compactNow = async ({ session, requests }) => {
  const before = requests.length;
  await session.prompt("/freeflow compact");
  for (let i = 0; i < 200 && requests.length === before; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  await session.waitForIdle();
};

test("two Freeflow compactions keep the session-wide read list", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => {
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) return [compact({ summary: "S1" })];
      if (n === 5) return [{ name: "read", args: { path: "recovery.txt" } }];
      if (n === 7) return [compact({ summary: "S2" })];
      return [];
    },
    false,
    async ({ manager }) => {
      const compactions = manager.getBranch().filter((entry) => entry.type === "compaction");
      assert.equal(compactions.length, 2, "two Freeflow compactions");
      assert.deepEqual(compactions[0].details.readFiles, ["evidence.txt"], "first cycle's list");
      assert.deepEqual(
        compactions[1].details.readFiles,
        ["evidence.txt", "recovery.txt"],
        "second cycle's list keeps the first cycle's read",
      );
    },
    true,
    {
      ...noRouting(),
      beforePrompt: async (run) => {
        await writeFile(join(run.cwd, "evidence.txt"), "EVIDENCE_ONE\n");
        await writeFile(join(run.cwd, "recovery.txt"), "RECOVERY_TWO\n");
        await run.session.prompt("FIRST_USER_MESSAGE");
        await run.session.waitForIdle();
        await compactNow(run);
        await run.session.prompt("SECOND_USER_MESSAGE");
        await run.session.waitForIdle();
        await compactNow(run);
      },
    },
  );
});

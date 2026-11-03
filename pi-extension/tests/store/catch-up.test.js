import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { startLedgerPath } from "../../dist/store/layer.js";

// Freeflow arriving mid-session on Pi (SPEC-013), through an in-process Pi session: a session whose start ran without
// Freeflow gets the store's menu at its next run's start, once, as the run's message; a normal session's start gives it.

const MID_SESSION = "Freeflow started mid-session";
const MENU = "Freeflow task memory:";
const SCRIPT = resolve(import.meta.dirname, "../../../skills/track-work/scripts/working-record.mjs");

// A temporary Freeflow home holding a local store, never the user's real one.
const home = await mkdtemp(join(tmpdir(), "freeflow-catch-up-home-"));
process.env.FREEFLOW_HOME = home;
execFileSync(
  process.execPath,
  [SCRIPT, "store", "init", "--home", home, "--git-name", "Probe", "--git-email", "p@x.y"],
  {
    stdio: "ignore",
  },
);

/** How many times a request's body carries the text. */
const count = (body, text) => JSON.stringify(body).split(text).length - 1;

test("Freeflow switched on after the session started: the next run's start brings the menu, once", async () => {
  await fixture(
    async () => [],
    true,
    async ({ session, requests, manager, cwd }) => {
      assert.equal(count(requests[0], MID_SESSION), 1);
      assert.equal(count(requests[0], MENU), 1);
      // The ledger records the steps for this session, so a reload of the session does not bring them again.
      const ledger = JSON.parse(await readFile(startLedgerPath(home, manager.getSessionId()), "utf8"));
      assert.deepEqual(Object.keys(ledger.steps).sort(), ["capabilities", "guidance", "menu", "sync", "window"]);
      assert.equal(cwd.length > 0, true);
      await session.prompt("Go on.");
      await session.waitForIdle();
      assert.equal(requests.length, 2);
      // The second run carries the first run's message where it was, and no second one.
      assert.equal(count(requests[1], MID_SESSION), 1);
    },
    true,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: { enabled: false },
      // Freeflow is switched on in the repository after the session started.
      beforePrompt: async ({ cwd }) =>
        writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ cognitiveRouting: { enabled: false } })),
    },
  );
});

test("a session that started with Freeflow gets the menu from its start and no catch-up", async () => {
  await fixture(
    async () => [],
    true,
    async ({ session, requests, manager }) => {
      assert.equal(count(requests[0], MID_SESSION), 0);
      assert.equal(count(requests[0], MENU), 1);
      const ledger = JSON.parse(await readFile(startLedgerPath(home, manager.getSessionId()), "utf8"));
      assert.equal(typeof ledger.steps.menu, "string");
      await session.prompt("Go on.");
      await session.waitForIdle();
      assert.equal(count(requests[1], MID_SESSION), 0);
      assert.equal(count(requests[1], MENU), 1);
    },
    true,
    {
      cognitiveRouting: { enabled: false },
      // The menu reaches the first prompt: session start does not wait for the store (activation-status's Gotchas).
      beforePrompt: async () => new Promise((done) => setTimeout(done, 1_500)),
    },
  );
});

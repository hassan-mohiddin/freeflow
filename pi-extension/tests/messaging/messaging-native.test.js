import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolSearchExtension } from "@earendil-works/pi-coding-agent";
import { fixture } from "../fixtures/routing-native.js";

process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));
const toolNames = (body) => (body.tools ?? []).map((tool) => tool.name);
const system = (body) => JSON.stringify(body.system ?? "");
const on = {
  freeflowConfig: { messaging: { enabled: true } },
  cognitiveRouting: { enabled: false },
  beforeExtensions: [createToolSearchExtension()],
  model: ["anthropic", "claude-opus-5-5"],
};

test(
  "messaging on: tool_search is active, the messaging tools stay deferred until loaded, the skill is listed",
  { timeout: 30000 },
  async () => {
    await fixture(
      async (n) => (n === 1 ? [{ name: "tool_search", args: { query: "send a message to another session" } }] : []),
      false,
      async ({ session, requests }) => {
        assert.ok(toolNames(requests[0]).includes("tool_search"));
        assert.ok(!toolNames(requests[0]).includes("send_message"));
        assert.ok(!toolNames(requests[0]).includes("list_sessions"));
        assert.match(system(requests[0]), /capabilities\/messaging\/SKILL\.md/);
        // Loaded by tool_search, the tool is declared from the next request on, after what was already sent.
        assert.match(JSON.stringify(requests[1]), /"name":"send_message"/);
        assert.deepEqual(requests[1].system, requests[0].system);
        // Messaging starts after the status update that turned it on, without holding up the request.
        let entries = [];
        for (let i = 0; i < 100 && entries.length === 0; i++) {
          entries = await readdir(join(process.env.FREEFLOW_HOME, "sessions")).catch(() => []);
          if (entries.length === 0) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.equal(entries.length, 1, "the session is in the live registry while it runs");
        // A reload ends the session (session_shutdown) and starts it again: one entry, one socket, no address in use.
        await session.reload();
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal((await readdir(join(process.env.FREEFLOW_HOME, "sessions"))).length, 1);
      },
      true,
      on,
    );
  },
);

test("without Pi's tool_search, messaging declares its two tools directly", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      assert.ok(!toolNames(requests[0]).includes("tool_search"));
      assert.ok(toolNames(requests[0]).includes("list_sessions"));
      assert.ok(toolNames(requests[0]).includes("send_message"));
    },
    true,
    { ...on, beforeExtensions: [] },
  );
});

test("messaging off (the default): no tool_search added, no skill, no registry entry", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      assert.ok(!toolNames(requests[0]).includes("tool_search"));
      assert.doesNotMatch(system(requests[0]), /capabilities\/messaging\/SKILL\.md/);
    },
    true,
    { ...on, freeflowConfig: {} },
  );
});

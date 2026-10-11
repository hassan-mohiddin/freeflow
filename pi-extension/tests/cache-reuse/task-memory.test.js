import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// Never the user's real registry.
process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));

// Task memory changes what the session holds while it runs: records are attached, focused and detached, resume views
// are delivered, and the Runtime State's Task Memory lines change. None of it may rewrite what an earlier request
// sent: each request starts with the previous one, with the same tools and system prompt.
const script = resolve("skills/track-work/scripts/working-record.mjs");
const RECORD_A = ".freeflow/tasks/task-001-retry-work/record.md";
const RECORD_B = ".freeflow/tasks/task-002-docs-cleanup/record.md";
const strip = (value) =>
  JSON.parse(JSON.stringify(value ?? null, (key, v) => (key === "cache_control" ? undefined : v)));
const parts = (body) =>
  Array.isArray(body.messages)
    ? { system: body.system, tools: body.tools, messages: body.messages }
    : { system: body.instructions, tools: body.tools, messages: body.input };
const text = (body) => JSON.stringify(parts(body).messages);

function makeRecords(cwd) {
  for (const [name, goal] of [
    ["Retry work", "Retries with backoff in the HTTP client."],
    ["Docs cleanup", "Remove stale docs."],
  ])
    execFileSync(process.execPath, [script, "init", "--root", cwd, "--name", name, "--input", "-"], {
      input: `### Goal\n- ${goal}\n\n### Next useful action\n- Continue.\n`,
    });
}

/** Every request after the first starts with the one before it, under the same tools and system prompt. */
function prefixFindings(requests) {
  const findings = [];
  requests.forEach((body, i) => {
    if (!i) return;
    const before = parts(requests[i - 1]),
      after = parts(body);
    if (JSON.stringify(strip(after.tools)) !== JSON.stringify(strip(before.tools)))
      findings.push(`request ${i + 1} changed tool definitions`);
    if (JSON.stringify(strip(after.system)) !== JSON.stringify(strip(before.system)))
      findings.push(`request ${i + 1} changed the system prompt`);
    const prefix = strip(before.messages);
    const diverged = strip(after.messages.slice(0, prefix.length)).findIndex(
      (m, k) => JSON.stringify(m) !== JSON.stringify(prefix[k]),
    );
    if (diverged >= 0 || after.messages.length < prefix.length)
      findings.push(`request ${i + 1} rewrote message ${diverged} of request ${i}`);
  });
  return findings;
}

const call = (args) => ({ name: "task_memory", args });

for (const model of [
  ["openai", "gpt-4o"],
  ["anthropic", "claude-opus-5-5"],
])
  test(
    `attaching, focusing and detaching records keeps every request a prefix of the next (${model[0]})`,
    { timeout: 30000 },
    async () => {
      await fixture(
        async (n) =>
          [
            [call({ action: "attach", record: RECORD_B })],
            [call({ action: "focus", record: RECORD_A })],
            [{ name: "read", args: { path: "evidence.txt" } }],
            [call({ action: "detach", record: RECORD_B })],
          ][n - 1] ?? [],
        false,
        async ({ session, requests }) => {
          // The user's command delivers a resume view as a hidden message before the next prompt.
          await session.prompt(`/freeflow task attach ${RECORD_B}`);
          await session.prompt("Continue with the docs.");
          await session.waitForIdle();
          assert.ok(requests.length >= 6);
          assert.match(text(requests.at(-1)), /Focus: Docs cleanup/);
          assert.match(text(requests.at(-1)), /<task-memory record=[^>]*task-002-docs-cleanup/);
          assert.deepEqual(prefixFindings(requests), []);
        },
        true,
        {
          model,
          cognitiveRouting: { enabled: false },
          freeflowConfig: { taskMemory: { enabled: true } },
          ui: { confirm: async () => true },
          beforePrompt: async ({ cwd, session }) => {
            makeRecords(cwd);
            await session.prompt(`/freeflow task attach ${RECORD_A}`);
          },
        },
      );
    },
  );

test(
  "after Freeflow's compaction the delivered resume view stays put in later requests",
  { timeout: 30000 },
  async () => {
    await fixture(
      async (n) => (n === 2 ? [{ name: "compact_context", args: { summary: "AGENT_SUMMARY" } }] : []),
      false,
      async ({ session, requests }) => {
        const count = requests.length;
        await session.prompt("/freeflow compact");
        for (let i = 0; i < 200 && requests.length === count; i++) await new Promise((done) => setTimeout(done, 10));
        await session.waitForIdle();
        await session.prompt("Carry on.");
        await session.waitForIdle();
        // A compaction starts a new cache chain; from its first request on, each request extends the one before.
        const first = requests.findIndex((body) => /AGENT_SUMMARY/.test(text(body)));
        assert.ok(first >= 0, "compacted");
        const after = requests.slice(first);
        assert.ok(after.length >= 2);
        assert.match(text(after[0]), /<task-memory record=/);
        assert.deepEqual(prefixFindings(after), []);
      },
      true,
      {
        cognitiveRouting: { enabled: false },
        freeflowConfig: { taskMemory: { enabled: true } },
        beforePrompt: async ({ cwd, session }) => {
          makeRecords(cwd);
          await session.prompt(`/freeflow task attach ${RECORD_A}`);
        },
      },
    );
  },
);

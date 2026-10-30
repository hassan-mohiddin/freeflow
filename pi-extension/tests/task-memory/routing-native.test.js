import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fixture, response } from "../fixtures/routing-native.js";

// Never the user's real registry.
process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));
const script = resolve("skills/track-work/scripts/working-record.mjs");
const RECORD = ".freeflow/tasks/task-001-retry-work/record.md";
const input = (body) => body.input ?? body.messages ?? [];
const text = (body) => JSON.stringify(input(body));
const views = (body) => (text(body).match(/<task-memory record=/g) ?? []).length;
const extendsPrevious = (earlier, later) =>
  input(earlier).every((item, i) => JSON.stringify(item) === JSON.stringify(input(later)[i]));
const usage = [5_000, 50_000, 100_000, 100_000];

// Task 004 D-001: under automatic routing the Coordinator holds task memory with the user; workers only read it.
test(
  "under automatic routing every profile gets the resume view once, also after a worker compacts; a worker only reads",
  { timeout: 60000 },
  async () => {
    await fixture(
      (n) =>
        [
          [{ name: "delegate_work", args: { operation: "assign", contract: "Read evidence.txt and report." } }],
          [{ name: "task_memory", args: { action: "attach", record: RECORD } }],
          [{ name: "task_memory", args: { action: "list" } }],
          [{ name: "compact_context", args: { summary: "WORKER_SUMMARY" } }],
          [{ name: "return_work", args: { operation: "submit", report: "Done.", outcome: "completed" } }],
          [{ name: "routing_unit", args: { operation: "close", outcome: "accepted", assessment: "ok" } }],
        ][n - 1] ?? [],
      true,
      async ({ requests, manager }) => {
        const compaction = manager.getBranch().find((entry) => entry.type === "compaction");
        assert.equal(compaction?.details?.freeflow?.profile, "executor", "the worker compacted");
        const worker = requests.filter((body) => body.model === "gpt-4.1-mini");
        const coordinator = requests.filter((body) => body.model === "gpt-4o");
        assert.ok(worker.length >= 3 && coordinator.length >= 3);
        for (const body of requests) assert.equal(views(body), 1, "the resume view, once");
        // The worker's proposal is refused before anything happens; its read goes through.
        assert.match(text(worker[1]), /A Cognitive Routing worker may only read task memory/);
        assert.doesNotMatch(text(worker[2]), /Retry work[^"]*attached/);
        // The Coordinator's requests after the unit returned extend each other.
        const [, assessing, closing] = coordinator;
        assert.ok(extendsPrevious(assessing, closing), "the Coordinator's prefix holds");
      },
      true,
      {
        freeflowConfig: { taskMemory: { enabled: true } },
        ui: { confirm: async () => true },
        maxRequests: 9,
        response: (n, calls) =>
          response(n, calls, "fixture response", {
            input_tokens: usage[n - 1] ?? 2_000,
            output_tokens: 10,
            total_tokens: (usage[n - 1] ?? 2_000) + 10,
          }),
        beforePrompt: async ({ cwd, session }) => {
          execFileSync(
            process.execPath,
            [script, "init", "--schema", "4", "--root", cwd, "--name", "Retry work", "--input", "-"],
            {
              input: "### Goal\n- Retries with backoff.\n\n### Next useful action\n- Continue.\n",
            },
          );
          await session.prompt(`/freeflow task attach ${RECORD}`);
        },
      },
    );
  },
);

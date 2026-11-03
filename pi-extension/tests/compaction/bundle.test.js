import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// Freeflow's compaction on a real Pi session with Track Work's real script: the agent checkpoints with --compact and
// ends its turn; Freeflow writes Pi's compaction entry with the bundle, keeping nothing raw, and the run continues.
const script = resolve("skills/track-work/scripts/working-record.mjs");
const noRouting = { cognitiveRouting: { enabled: false }, freeflowConfig: { toolExecution: { enabled: true } } };
const bash = (command) => ({ name: "bash", args: { command } });
const text = (item) =>
  typeof item.content === "string"
    ? item.content
    : (item.content ?? []).map((part) => part.text ?? "").join("") + (item.output ?? "");
const inputTexts = (body) => body.input.filter((item) => item.role !== "system").map(text);
const SUMMARY = [
  "## Goal",
  "- Answer the question about the parser.",
  "## Settled",
  "(none)",
  "## Open",
  "(none)",
  "## Agreement",
  "(none)",
  "## In flight",
  "- Now: SUMMARY_IN_FLIGHT_MARKER.",
  "## Read when",
  "(none)",
  "## Next action",
  "- Report.",
].join("\\n");

/** The Freeflow home for one test, set in Pi's process as a user's environment would, and restored after. */
async function withHome(run) {
  const folder = await mkdtemp(join(tmpdir(), "freeflow-bundle-home-"));
  const saved = Object.fromEntries(
    [
      "FREEFLOW_HOME",
      "FREEFLOW_SESSION",
      "FREEFLOW_HARNESS",
      "FREEFLOW_TRANSCRIPT",
      "FREEFLOW_RESUME",
      "FREEFLOW_CONTEXT_WINDOW",
    ].map((name) => [name, process.env[name]]),
  );
  process.env.FREEFLOW_HOME = join(folder, "home");
  try {
    await run(process.env.FREEFLOW_HOME);
  } finally {
    for (const [name, value] of Object.entries(saved))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    await rm(folder, { recursive: true, force: true });
  }
}

test(
  "with no store, a session summary's checkpoint --compact compacts with its bundle and the run continues (P4)",
  { timeout: 60000 },
  async () => {
    await withHome(async (home) => {
      await fixture(
        async (n) =>
          n === 1 ? [bash(`printf '${SUMMARY}\\n' | node ${script} checkpoint --session --compact --input -`)] : [],
        false,
        async ({ requests, manager }) => {
          // 1: the prompt; 2: after the checkpoint, the agent ends its turn; 3: the run continues after compaction.
          assert.equal(requests.length, 3);
          const after = inputTexts(requests[2]);
          assert.match(after[0], /This session holds no task: the summary below is its only memory/);
          assert.match(after[0], /SUMMARY_IN_FLIGHT_MARKER/);
          assert.match(
            after[0],
            /This compaction starts cycle 2\. It completes the compaction Freeflow's context notice asked for\./,
          );
          assert.doesNotMatch(after.join("\n"), /Complete the fixture assignment/, "nothing raw is kept");
          assert.match(
            after[1],
            /compaction cycle 2 starts here, and the conversation is now the session summary's bundle/,
          );
          const compaction = manager.getBranch().find((entry) => entry.type === "compaction");
          assert.equal(compaction.details.freeflow.bundle, "session");
          const session = process.env.FREEFLOW_SESSION;
          assert.ok(session, "Freeflow set the session for the script");
          assert.equal(process.env.FREEFLOW_HARNESS, "Pi");
          assert.equal(
            existsSync(join(home, "sessions", session, "summary.md")),
            false,
            "the summary is installed, then removed",
          );
          assert.equal(JSON.parse(readFileSync(join(home, "sessions", session, "compact.json"), "utf8")).done, true);
        },
        true,
        noRouting,
      );
    });
  },
);

test(
  "a task's checkpoint --compact compacts with its bundle; the next request extends the one after compaction",
  { timeout: 60000 },
  async () => {
    await withHome(async (home) => {
      await fixture(
        async (n) =>
          [
            [
              bash(
                `node ${script} task create --title "Probe" --goal "Prove Pi on the store." --cue "read when probing Pi" --no-project`,
              ),
            ],
            [
              bash(
                `printf -- '- Now: TASK_IN_FLIGHT_MARKER.\\n' | node ${script} checkpoint --record task-001 --compact --input -`,
              ),
            ],
          ][n - 1] ?? [],
        false,
        async ({ requests, manager, session }) => {
          // 1-3: the prompt, the task, the checkpoint; 4: after compaction.
          assert.equal(requests.length, 4);
          const after = inputTexts(requests[3]);
          assert.match(after[0], /^This task's record is memory, not authority/m);
          assert.match(after[0], /# Probe/);
          assert.match(after[0], /TASK_IN_FLIGHT_MARKER/);
          assert.match(
            after[1],
            /the conversation is now the bundle of task-001\. Continue from In flight and the Next action\./,
          );
          assert.equal(
            manager.getBranch().find((entry) => entry.type === "compaction").details.freeflow.bundle,
            "task",
          );
          // The next prompt's request starts with what the request after compaction sent (the prompt cache's prefix).
          await session.prompt("Go on.");
          await session.waitForIdle();
          const later = requests[4].input;
          assert.ok(
            requests[3].input.every((item, i) => JSON.stringify(item) === JSON.stringify(later[i])),
            "the next request extends the one after compaction",
          );
        },
        true,
        {
          ...noRouting,
          beforePrompt: async () => {
            execFileSync(process.execPath, [
              script,
              "store",
              "init",
              "--home",
              home,
              "--git-name",
              "Probe",
              "--git-email",
              "probe@example.com",
            ]);
          },
        },
      );
    });
  },
);

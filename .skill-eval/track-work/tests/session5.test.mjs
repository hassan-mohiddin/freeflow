import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { OPENING_LINE, SESSION_OPENING } from "../../../skills/track-work/scripts/lib/discussion5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

async function withFolder(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-session5-"));
  try {
    const cli = (args, { input = "", env = {}, cwd = folder } = {}) =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd,
        input,
        encoding: "utf8",
        env: {
          ...process.env,
          FREEFLOW_HOME: join(folder, "store"),
          FREEFLOW_CONTEXT_WINDOW: "",
          FREEFLOW_TRANSCRIPT: "",
          CLAUDE_CODE_SESSION_ID: "",
          CLAUDE_CODE_REMOTE: "",
          CLAUDE_CODE_REMOTE_SESSION_ID: "",
          FREEFLOW_SESSION: "",
          GIT_CONFIG_NOSYSTEM: "1",
          ...env,
        },
      });
    await run({ folder, cli });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const human = (at, content) =>
  JSON.stringify({ type: "user", timestamp: at, origin: { kind: "human" }, message: { role: "user", content } });

/** A work repository whose remote a project's task names, as the menu finds it (T8). */
function workRepository(path) {
  spawnSync("git", ["init", "--quiet", "-b", "main", path]);
  spawnSync("git", [
    "-C",
    path,
    "-c",
    "user.name=T",
    "-c",
    "user.email=t@example.com",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "start",
  ]);
  spawnSync("git", ["-C", path, "remote", "add", "origin", "https://github.com/acme/widget.git"]);
}

test("session status prints this session's state in the store as JSON: its task, its summary, unsynced changes and its transcript", async () => {
  await withFolder(async ({ folder, cli }) => {
    const holder = { FREEFLOW_SESSION: "aaaaaaaa-1111", FREEFLOW_HARNESS: "Probe" };
    const status = (env) => JSON.parse(ok(cli(["session", "status"], { env })));
    // FREEFLOW_HOME names a store that is not there yet: what is missing, and who sets it up (P94).
    assert.deepEqual(status(holder), {
      home: join(folder, "store"),
      store: false,
      missing: [
        {
          what: `FREEFLOW_HOME is ${join(folder, "store")}, and the store is not there`,
          fix: "store init (local only) or store init --remote <url> (local + cloud), on the user's word, as Setup Freeflow's store-setup reference says",
          by: "agent",
        },
      ],
    });

    ok(cli(["store", "init", "--git-name", "Test User", "--git-email", "t@example.com"], { env: holder }));
    ok(cli(["project", "new", "--name", "Widget"], { env: holder }));
    assert.deepEqual(status(holder), {
      home: join(folder, "store"),
      store: true,
      session: "aaaaaaaa-1111",
      task: null,
      summary: null,
      changed: false,
      transcript: null,
      missing: [],
      compact: null,
    });

    const work = join(folder, "widget");
    workRepository(work);
    ok(
      cli(
        [
          "task",
          "create",
          "--title",
          "Probe",
          "--goal",
          "Probe the mod.",
          "--cue",
          "read when probing",
          "--project",
          "widget",
        ],
        { env: holder, cwd: work },
      ),
    );
    const record = join(folder, "store", "projects", "widget", "tasks", "task-001-probe", "record.md");
    const stateAsOf = /^State as of: (\S+)$/m.exec(await readFile(record, "utf8"))[1];
    const held = status({ ...holder, FREEFLOW_TRANSCRIPT: "/logs/session.jsonl" });
    assert.deepEqual(held.task, { id: "widget/task-001", record, stateAsOf });
    assert.equal(held.changed, false);
    assert.equal(held.transcript, "/logs/session.jsonl");

    await writeFile(join(folder, "store", "rules", "style.md"), "Answer in plain words.\n");
    assert.equal(status(holder).changed, true);

    const other = { FREEFLOW_SESSION: "bbbbbbbb-2222", FREEFLOW_HARNESS: "Probe" };
    ok(
      cli(["checkpoint", "--session", "--input", "-"], {
        env: other,
        input:
          "## Goal\n- Answer a question.\n## Settled\n(none)\n## Open\n(none)\n## Agreement\n(none)\n## In flight\n(none)\n## Read when\n(none)\n## Next action\n- Answer it.\n",
      }),
    );
    const summary = status(other);
    assert.equal(summary.task, null);
    assert.equal(summary.summary.path, join(folder, "store", "sessions", "bbbbbbbb-2222", "summary.md"));
    assert.match(summary.summary.asOf, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.equal(summary.compact, null);

    // checkpoint --compact asks the harness layer to compact at the turn's end; a plain checkpoint never does (P102).
    const asked = ok(cli(["checkpoint", "--record", "widget/task-001", "--compact"], { env: holder, cwd: work }));
    assert.match(asked, /\nCompaction requested: Freeflow's harness layer compacts the session when this turn ends/);
    const requested = status(holder).compact;
    assert.equal(requested.path, join(folder, "store", "sessions", "aaaaaaaa-1111", "compact.json"));
    assert.equal(requested.done, false);
    assert.match(requested.requestedAt, /^\d{4}-\d\d-\d\dT/);
    assert.equal(status(other).compact, null);
    assert.doesNotMatch(
      ok(cli(["checkpoint", "--record", "widget/task-001"], { env: other, cwd: work })),
      /Compaction/,
    );
  });
});

test("view bundle --fallback adds the user's messages since the checkpoint, word for word, and a closing line naming the record's time and the transcript", async () => {
  await withFolder(async ({ folder, cli }) => {
    const record = ok(
      cli(
        [
          "init",
          "--schema",
          "5",
          "--root",
          folder,
          "--name",
          "Fallback",
          "--cue",
          "read when compacting",
          "--input",
          "-",
        ],
        {
          input: "### Goal\n- Carry the work through a compaction.\n### Next action\n- Checkpoint.\n",
        },
      ),
    ).split("\n")[0];
    const stateAsOf = /^State as of: (\S+)$/m.exec(await readFile(record, "utf8"))[1];
    const transcript = join(folder, "session.jsonl");
    await writeFile(
      transcript,
      [
        human("2000-01-01T00:00:00.000Z", "Before the checkpoint."),
        human("2099-01-01T00:00:00.000Z", "After the checkpoint:\nkeep the parser as it is."),
        // What an earlier compaction installed: user rows with no origin, Freeflow's and never the user's words.
        JSON.stringify({
          type: "user",
          timestamp: "2099-01-01T00:01:00.000Z",
          message: { role: "user", content: `${OPENING_LINE}\n\n## Rules\n\nNone.\n` },
        }),
        JSON.stringify({
          type: "user",
          timestamp: "2099-01-01T00:02:00.000Z",
          message: { role: "user", content: `${SESSION_OPENING}\n\n## Session summary\n` },
        }),
      ].join("\n") + "\n",
    );

    const bundle = ok(
      cli(["view", "bundle", "--record", record, "--fallback"], { env: { FREEFLOW_TRANSCRIPT: transcript } }),
    );
    const since = bundle.indexOf(`## The user's messages since ${stateAsOf}`);
    assert.ok(bundle.indexOf("## Sizes") < since && since > 0);
    assert.ok(bundle.includes("### 1. 2099-01-01T00:00:00.000Z\n\nAfter the checkpoint:\nkeep the parser as it is.\n"));
    assert.ok(!bundle.includes("Before the checkpoint."));
    assert.ok(!bundle.includes("### 2."), "an installed bundle is not one of the user's messages");
    assert.ok(!bundle.includes("then continue from In flight and the Next action."));
    const closing = bundle.trimEnd().split("\n").at(-1);
    assert.ok(closing.startsWith("A new cycle starts here, after a compaction that came before the checkpoint."));
    assert.ok(closing.includes(`The record above is as of ${stateAsOf}`));
    assert.ok(closing.includes(`read the transcript: ${transcript}.`));

    const plain = ok(cli(["view", "bundle", "--record", record]));
    assert.ok(plain.trimEnd().endsWith("then continue from In flight and the Next action."));
    assert.ok(bundle.startsWith(plain.slice(0, plain.indexOf("## Sizes"))));

    const unfound = ok(cli(["view", "bundle", "--record", record, "--fallback"]));
    assert.ok(unfound.includes(`## The user's messages since ${stateAsOf}\n\nNone.\n`));
    assert.ok(unfound.includes("No transcript was found to read back what the summary lost."));

    assert.match(cli(["view", "bundle", "--session", "--fallback"]).stderr, /--fallback is for view bundle --record/);
    assert.match(
      cli(["view", "recover", "--record", record, "--fallback"]).stderr,
      /--fallback is for view bundle --record/,
    );
  });
});

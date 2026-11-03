import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

/** The claims a Freeflow driver writes at session start (SPEC-006 T4), here with compact as given. */
async function claimCompact(home, session, compact = { claim: "yes", how: "its own compaction" }) {
  await mkdir(join(home, "sessions", session), { recursive: true });
  await writeFile(
    join(home, "sessions", session, "capabilities.json"),
    JSON.stringify({ v: 1, requestSet: 1, driver: "probe", claims: { compact } }),
  );
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
    // FREEFLOW_HOME names a store that is not there yet: what is missing, and who sets it up (P94); the session's own
    // summary and compaction request, which need no store (P4).
    assert.deepEqual(status(holder), {
      home: join(folder, "store"),
      store: false,
      session: "aaaaaaaa-1111",
      summary: null,
      compact: null,
      missing: [
        {
          what: `FREEFLOW_HOME is ${join(folder, "store")}, and the store is not there`,
          fix: "store init (local only) or store init --remote <url> (local + cloud), on the user's word, as Setup Freeflow's store-setup reference says",
          by: "agent",
        },
      ],
    });

    // A home that holds only Freeflow's own sessions/ (Messaging's registry, a session summary) has no store yet.
    await mkdir(join(folder, "store", "sessions"), { recursive: true });
    await writeFile(join(folder, "store", "sessions", "live.json"), "{}\n");
    assert.match(status(holder).missing[0].what, /, and the store is not there$/);
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
          "## Goal\n- Answer a question.\n## Settled\n(none)\n## Open\n(none)\n## Agreement\n(none)\n## In flight\n(none)\n## Recovery\n(none)\n## Next action\n- Answer it.\n",
      }),
    );
    const summary = status(other);
    assert.equal(summary.task, null);
    assert.equal(summary.summary.path, join(folder, "store", "sessions", "bbbbbbbb-2222", "summary.md"));
    assert.match(summary.summary.asOf, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.equal(summary.compact, null);

    // checkpoint --compact asks the harness layer to compact at the turn's end; a plain checkpoint never does (P102).
    // Only where this session's driver claims compact (SPEC-006 P11): with no claims, the checkpoint is written and no
    // request is left for no one.
    const refused = ok(cli(["checkpoint", "--record", "widget/task-001", "--compact"], { env: holder, cwd: work }));
    assert.match(
      refused,
      /\nNo Freeflow driver here compacts \(no capabilities for this session\)\. The harness compacts on its own; after it, recover with view recover\.\n$/,
    );
    assert.equal(status(holder).compact, null);
    await claimCompact(join(folder, "store"), "aaaaaaaa-1111", { claim: "possible", how: "not yet" });
    assert.match(
      ok(cli(["checkpoint", "--record", "widget/task-001", "--compact"], { env: holder, cwd: work })),
      /\nFreeflow's driver here does not compact \(compact: possible, not yet\)\. The harness compacts on its own/,
    );
    assert.equal(status(holder).compact, null);
    await claimCompact(join(folder, "store"), "aaaaaaaa-1111");
    const asked = ok(cli(["checkpoint", "--record", "widget/task-001", "--compact"], { env: holder, cwd: work }));
    assert.match(asked, /\nCompaction requested: Freeflow's harness layer compacts the session when this turn ends/);
    const requested = status(holder).compact;
    assert.equal(requested.path, join(folder, "store", "sessions", "aaaaaaaa-1111", "compact.json"));
    assert.equal(requested.done, false);
    assert.match(requested.requestedAt, /^\d{4}-\d\d-\d\dT/);
    assert.equal(status(other).compact, null);
    assert.doesNotMatch(
      ok(cli(["checkpoint", "--record", "widget/task-001"], { env: holder, cwd: work })),
      /Compaction/,
    );
  });
});

test("view bundle --fallback adds the user's messages since the checkpoint, word for word, and a closing line naming the record's time and the transcript", async () => {
  await withFolder(async ({ folder, cli }) => {
    const record = ok(
      cli(["init", "--root", folder, "--name", "Fallback", "--cue", "read when compacting", "--input", "-"], {
        input: "### Goal\n- Carry the work through a compaction.\n### Next action\n- Checkpoint.\n",
      }),
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

test("with no store, a session summary still asks for Freeflow's compaction, and session status reports both (P4)", async () => {
  await withFolder(async ({ folder, cli }) => {
    const env = { FREEFLOW_SESSION: "bbbbbbbb-2222", FREEFLOW_HARNESS: "Pi" };
    const summary = [
      "## Goal",
      "- Answer a question.",
      "## Settled",
      "(none)",
      "## Open",
      "(none)",
      "## Agreement",
      "(none)",
      "## In flight",
      "- Now: reading.",
      "## Recovery",
      "(none)",
      "## Next action",
      "- Answer.",
    ].join("\n");
    assert.match(
      ok(cli(["checkpoint", "--session", "--compact", "--input", "-"], { input: summary, env })),
      /\nNo Freeflow driver here compacts/,
    );
    await claimCompact(join(folder, "store"), "bbbbbbbb-2222");
    assert.match(
      ok(cli(["checkpoint", "--session", "--compact", "--input", "-"], { input: summary, env })),
      /\nCompaction requested: Freeflow's harness layer compacts the session/,
    );
    const status = JSON.parse(ok(cli(["session", "status"], { env })));
    assert.equal(status.store, false);
    assert.equal(status.summary.path, join(folder, "store", "sessions", "bbbbbbbb-2222", "summary.md"));
    assert.equal(status.compact.done, false);
  });
});

test("without a task, the session summary's Recovery always lines name files, which the bundle copies fresh with their lines (P9); a line with no class, or a Carry line, is refused", async () => {
  await withFolder(async ({ folder, cli }) => {
    await writeFile(join(folder, "notes.txt"), "one\ntwo\nthree\n");
    const env = { CLAUDE_CODE_SESSION_ID: "abcdef12-3456-7890-abcd-ef1234567890" };
    const summary = (recovery, flight = []) =>
      [
        "## Goal",
        "- Answer the user's question.",
        "## Settled",
        "(none)",
        "## Open",
        "(none)",
        "## Agreement",
        "(none)",
        "## In flight",
        "- Now: reading.",
        ...flight,
        "## Recovery",
        ...recovery,
        "## Next action",
        "- Report.",
      ].join("\n");
    const refused = cli(["checkpoint", "--session", "--input", "-"], {
      input: summary(["- notes.txt — no class"]),
      env,
    });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /A Recovery line is "- always: <pointer> — <why>"/);
    const carry = cli(["checkpoint", "--session", "--input", "-"], {
      input: summary([], ["- Carry: notes.txt — the notes"]),
      env,
    });
    assert.equal(carry.status, 1);
    assert.match(carry.stderr, /goes under ## Recovery/);
    ok(
      cli(["checkpoint", "--session", "--input", "-"], {
        input: summary([
          "- always: notes.txt (lines 2–3) — the open lines",
          "- always: gone.txt — a file since removed",
          "- when the user asks for timings: bench.txt — the timings",
        ]),
        env,
      }),
    );
    const bundle = ok(cli(["view", "bundle", "--session"], { env }));
    const recovery = bundle.slice(bundle.indexOf("\n## Recovery files\n"));
    assert.match(recovery, /\n- Not read: gone\.txt does not exist\n/);
    assert.match(recovery, /<file path="notes\.txt lines 2–3">\n2\ttwo\n3\tthree\n<\/file>/);
    assert.doesNotMatch(recovery, /bench\.txt does not exist|<file path="bench/);
  });
});

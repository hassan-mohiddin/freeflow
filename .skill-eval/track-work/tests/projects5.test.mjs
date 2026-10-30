import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { sessionIdentity } from "../../../skills/track-work/scripts/lib/projects5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

async function withStore(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-projects5-"));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    const remote = join(folder, "store.git");
    execFileSync("git", ["init", "--quiet", "--bare", remote]);
    const home = join(folder, "home");
    const work = join(folder, "widget");
    execFileSync("git", ["init", "--quiet", "-b", "main", work]);
    execFileSync("git", [
      "-C",
      work,
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
    execFileSync("git", ["-C", work, "remote", "add", "origin", "https://github.com/acme/widget.git"]);
    const cli = (session, args, cwd = folder) =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
          FREEFLOW_HOME: home,
          FREEFLOW_SESSION: session,
          FREEFLOW_HARNESS: "Test harness",
          FREEFLOW_RESUME: `resume ${session}`,
          CLAUDECODE: "",
          CLAUDE_CODE_SESSION_ID: "",
          CLAUDE_CODE_REMOTE: "",
          CLAUDE_CODE_REMOTE_SESSION_ID: "",
        },
      });
    ok(
      cli("aaaaaaaa-1", [
        "store",
        "init",
        "--remote",
        remote,
        "--git-name",
        "Test User",
        "--git-email",
        "test@example.com",
      ]),
    );
    await run({ folder, home, remote, work, cli });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const pushedLog = (remote) =>
  execFileSync("git", ["--git-dir", remote, "log", "--format=%s", "main"], { encoding: "utf8" });

test("a second session's take is refused with the holder and its last sync, and allowed after a release; each hold is pushed", async () => {
  await withStore(async ({ home, remote, work, cli }) => {
    ok(cli("aaaaaaaa-1", ["project", "new", "--name", "Widget"]));
    const created = ok(
      cli(
        "aaaaaaaa-1",
        [
          "task",
          "create",
          "--title",
          "First task",
          "--goal",
          "Do it.",
          "--cue",
          "read when the first thing matters",
          "--project",
          "widget",
        ],
        work,
      ),
    );
    assert.match(
      created,
      /^widget\/task-001\n.+\/projects\/widget\/tasks\/task-001-first-task\/record.md\nThis session holds it.\nStore: committed and pushed.\n$/,
    );
    const sessions = join(home, "projects", "widget", "tasks", "task-001-first-task", "sessions.md");
    assert.match(
      await readFile(sessions, "utf8"),
      /^# Sessions \(times in UTC\)\n\n- aaaaaaaa · Test harness · .+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2} – now · holding · resume aaaaaaaa-1\n$/,
    );
    const refused = cli("bbbbbbbb-2", ["task", "take", "--id", "widget/task-001"]);
    assert.equal(refused.status, 1);
    assert.match(
      refused.stderr,
      /widget\/task-001 is held by aaaaaaaa \(Test harness, .+\) since \S+ \S+, last synced \S+ \S+\. Ask the user before taking it over/,
    );
    assert.match(
      cli("bbbbbbbb-2", ["task", "release", "--id", "widget/task-001"]).stderr,
      /does not hold widget\/task-001/,
    );
    assert.equal(
      ok(cli("aaaaaaaa-1", ["task", "release"])),
      "Released widget/task-001.\nStore: committed and pushed.\n",
    );
    assert.match(
      ok(cli("bbbbbbbb-2", ["task", "take", "--id", "widget/task-001"])),
      /^This session holds widget\/task-001\.\nStore: committed and pushed\.\n$/,
    );
    const lines = (await readFile(sessions, "utf8")).split("\n").filter((line) => line.startsWith("- "));
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^- aaaaaaaa · .+ – \d{4}-\d{2}-\d{2} \d{2}:\d{2} · released · resume aaaaaaaa-1$/);
    assert.match(lines[1], /^- bbbbbbbb · .+ – now · holding · resume bbbbbbbb-2$/);
    // A takeover, after the user's yes, closes the other hold as taken over.
    assert.match(
      ok(cli("cccccccc-3", ["task", "take", "--id", "widget/task-001", "--takeover"])),
      /taken over from bbbbbbbb/,
    );
    assert.match(
      await readFile(sessions, "utf8"),
      /- bbbbbbbb · .+ · taken over · resume bbbbbbbb-2\n- cccccccc · .+ – now · holding/,
    );
    assert.match(
      pushedLog(remote),
      /^Take widget\/task-001 \(cccccccc\)\nTake widget\/task-001 \(bbbbbbbb\)\nRelease widget\/task-001 \(aaaaaaaa\)\nCreate widget\/task-001, held by aaaaaaaa\nCreate project widget\n/,
    );
  });
});

test("a session holds one task at a time: take refuses a second, switch releases the first", async () => {
  await withStore(async ({ work, cli }) => {
    ok(cli("aaaaaaaa-1", ["project", "new", "--name", "Widget"]));
    ok(
      cli(
        "aaaaaaaa-1",
        ["task", "create", "--title", "One", "--goal", "g", "--cue", "read when one matters", "--project", "widget"],
        work,
      ),
    );
    ok(cli("aaaaaaaa-1", ["task", "release"]));
    ok(
      cli("aaaaaaaa-1", [
        "task",
        "create",
        "--title",
        "Two",
        "--goal",
        "g",
        "--cue",
        "read when two matters",
        "--project",
        "widget",
      ]),
    );
    assert.match(
      cli("aaaaaaaa-1", ["task", "take", "--id", "widget/task-001"]).stderr,
      /This session holds widget\/task-002; checkpoint it and use task switch/,
    );
    assert.match(
      ok(cli("aaaaaaaa-1", ["task", "switch", "--id", "widget/task-001"])),
      /^Released widget\/task-002\.\n.*\nThis session holds widget\/task-001\.\n/,
    );
  });
});

test("the menu lists the open tasks of the project whose tasks name the folder's remote, and says what this session holds", async () => {
  await withStore(async ({ folder, work, cli }) => {
    ok(cli("aaaaaaaa-1", ["project", "new", "--name", "Widget"]));
    ok(cli("aaaaaaaa-1", ["project", "new", "--name", "Other"]));
    ok(
      cli(
        "aaaaaaaa-1",
        [
          "task",
          "create",
          "--title",
          "Held elsewhere",
          "--goal",
          "g",
          "--cue",
          "read when the held task matters",
          "--project",
          "widget",
        ],
        work,
      ),
    );
    ok(
      cli("bbbbbbbb-2", [
        "task",
        "create",
        "--title",
        "Mine",
        "--goal",
        "g",
        "--cue",
        "read when my task matters",
        "--project",
        "widget",
      ]),
    );
    const menu = ok(cli("bbbbbbbb-2", ["task", "here"], work));
    assert.match(menu, /^The record is memory; the user's message decides the work\. Nothing is taken/);
    assert.match(
      menu,
      /\nThis session holds widget\/task-002: recover it with view recover --record widget\/task-002\.\nProject widget \(github.com\/acme\/widget\):\n/,
    );
    assert.match(menu, /\n- widget\/task-002 — Mine · active · held by this session · read when my task matters\n/);
    assert.match(
      menu,
      /\n- widget\/task-001 — Held elsewhere · active · held by aaaaaaaa \(Test harness, .+\) since .+, last synced .+ · read when the held task matters\n/,
    );
    const elsewhere = ok(cli("bbbbbbbb-2", ["task", "here"], folder));
    assert.match(
      elsewhere,
      /This folder is not in a repository a task names\. Projects:\n- other: 0 task\(s\)\n- widget: 2 task\(s\); repositories github.com\/acme\/widget\n/,
    );
    assert.match(
      ok(cli("bbbbbbbb-2", ["view", "recover", "--record", "widget/task-001"])),
      /\n- Hold: session aaaaaaaa \(Test harness, .+\) holds it, since .+; ask the user before taking it over\.\n/,
    );
    assert.match(
      ok(cli("bbbbbbbb-2", ["task", "search", "--query", "held task"])),
      /widget\/task-001 record\.md \| \(header\) \| Cue: read when the held task matters/,
    );
  });
});

test("removing a task or a project is a pushed commit that Git history keeps, and task numbers are not reused", async () => {
  await withStore(async ({ home, remote, cli }) => {
    ok(cli("aaaaaaaa-1", ["project", "new", "--name", "Widget"]));
    ok(
      cli("aaaaaaaa-1", [
        "task",
        "create",
        "--title",
        "Gone soon",
        "--goal",
        "g",
        "--cue",
        "read when it matters",
        "--project",
        "widget",
      ]),
    );
    ok(cli("aaaaaaaa-1", ["task", "release"]));
    const removed = ok(cli("aaaaaaaa-1", ["task", "remove", "--id", "widget/task-001"]));
    assert.match(
      removed,
      /^Removed widget\/task-001\. Git history keeps it: git -C .+ checkout [0-9a-f]{8}~1 -- projects\/widget\/tasks\/task-001-gone-soon brings it back\./,
    );
    assert.ok(!existsSync(join(home, "projects", "widget", "tasks", "task-001-gone-soon")));
    const restore = /checkout ([0-9a-f]{8})~1/.exec(removed)[1];
    assert.match(
      execFileSync("git", ["-C", home, "show", `${restore}~1:projects/widget/tasks/task-001-gone-soon/record.md`], {
        encoding: "utf8",
      }),
      /^# Gone soon\n/,
    );
    assert.match(
      ok(
        cli("aaaaaaaa-1", [
          "task",
          "create",
          "--title",
          "Next",
          "--goal",
          "g",
          "--cue",
          "read when next matters",
          "--project",
          "widget",
        ]),
      ),
      /^widget\/task-002\n/,
    );
    ok(cli("aaaaaaaa-1", ["task", "release"]));
    assert.match(
      ok(cli("aaaaaaaa-1", ["project", "remove", "--name", "widget"])),
      /^Removed project widget and its 1 task\(s\)\. Git history keeps them/,
    );
    assert.match(pushedLog(remote), /^Remove project widget and its 1 task\(s\)\n/);
    assert.equal(ok(cli("aaaaaaaa-1", ["project", "list"])), "No projects.\n");
  });
});

test("a task with no project: created where no project names the folder, listed in the menu, moved into a project and out again without reusing its number", async () => {
  await withStore(async ({ home, remote, work, cli }) => {
    const create = (session, title, extra = []) =>
      cli(
        session,
        ["task", "create", "--title", title, "--goal", "Try it.", "--cue", "read when trying tasks", ...extra],
        work,
      );
    // No project names this repository, so the task goes to the store's tasks with no project (P76, T24).
    const made = ok(create("aaaaaaaa-1", "Loose one")).split("\n");
    assert.equal(made[0], "task-001");
    assert.ok(made[1].endsWith(join("home", "tasks", "task-001-loose-one", "record.md")));
    assert.match(pushedLog(remote), /^Create task-001, held by aaaaaaaa$/m);
    const menu = ok(cli("aaaaaaaa-1", ["task", "here"], work));
    assert.match(
      menu,
      /\nNo project \(github\.com\/acme\/widget\):\n- task-001 — Loose one · active · held by this session · read when trying tasks\n/,
    );
    assert.match(
      ok(cli("aaaaaaaa-1", ["project", "list"])),
      /- no project: 1 task\(s\); repositories github\.com\/acme\/widget/,
    );
    // Its ID stands for its record, and its recovery has no project index.
    const recovered = ok(cli("aaaaaaaa-1", ["view", "recover", "--record", "task-001"], work));
    assert.match(recovered, /^# Loose one$/m);
    assert.doesNotMatch(recovered, /^- .*task-\d{3} — /m);
    ok(cli("aaaaaaaa-1", ["validate", "--record", "task-001"], work));

    // Moved into a project: the next number there, the hold kept, the old number never reused (T25).
    ok(cli("aaaaaaaa-1", ["project", "new", "--name", "widget"]));
    const refused = cli("bbbbbbbb-2", ["task", "move", "--id", "task-001", "--project", "widget"]);
    assert.equal(refused.status, 1);
    assert.match(
      refused.stderr,
      /task-001 is held by aaaaaaaa .*; move it once it is released, or from the session that holds it\./,
    );
    assert.match(
      ok(cli("aaaaaaaa-1", ["task", "move", "--id", "task-001", "--project", "widget"])),
      /^Moved task-001 to widget\/task-001: .*projects\/widget\/tasks\/task-001-loose-one\. Its old ID no longer names it/,
    );
    assert.ok(!existsSync(join(home, "tasks", "task-001-loose-one")));
    assert.match(pushedLog(remote), /^Move task-001 to widget\/task-001$/m);
    assert.match(
      ok(cli("aaaaaaaa-1", ["task", "here"], work)),
      /\nProject widget \(github\.com\/acme\/widget\):\n- widget\/task-001 — Loose one · active · held by this session/,
    );
    assert.match(
      ok(cli("aaaaaaaa-1", ["task", "move", "--id", "widget/task-001", "--project", "widget"])),
      /^widget\/task-001 is already in project widget\.$/m,
    );
    // Out again: task-002, since task-001 stays taken.
    assert.match(
      ok(cli("aaaaaaaa-1", ["task", "move", "--id", "widget/task-001", "--no-project"])),
      /^Moved widget\/task-001 to task-002: /,
    );
    ok(cli("aaaaaaaa-1", ["task", "release"]));
    // With a project naming this repository, --no-project still makes a task with no project.
    ok(cli("aaaaaaaa-1", ["task", "move", "--id", "task-002", "--project", "widget"]));
    assert.match(ok(create("aaaaaaaa-1", "Another", ["--no-project"])), /^task-003\n/);
    const both = create("cccccccc-3", "Both", ["--project", "widget", "--no-project"]);
    assert.equal(both.status, 1);
    assert.match(both.stderr, /Give --project or --no-project, not both\./);
  });
});

test("outside a Freeflow store, project and task keep Pi's registry, and the hold commands say a store is needed", async () => {
  const folder = await mkdtemp(join(tmpdir(), "track-work-projects5-registry-"));
  try {
    const env = { ...process.env, FREEFLOW_HOME: join(folder, "home"), FREEFLOW_SESSION: "aaaaaaaa-1" };
    const run = (args) => spawnSync(process.execPath, [scriptPath, ...args], { cwd: folder, encoding: "utf8", env });
    assert.equal(run(["project", "list"]).stdout, "No projects.\n");
    assert.match(
      run(["task", "take", "--id", "widget/task-001"]).stderr,
      /task take works in a Freeflow store; .+ is not one \(store init makes one\)/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("the session is read from the environment: Claude Code's IDs, a cloud session's link, or Freeflow's own variables", () => {
  assert.equal(sessionIdentity({}), null);
  assert.deepEqual(
    sessionIdentity({
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: "788323ff-fb09",
      CLAUDE_CODE_REMOTE: "true",
      CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01ABC",
    }),
    {
      id: "788323ff-fb09",
      short: "788323ff",
      harness: "Claude Code",
      where: "cloud",
      back: "https://claude.ai/code/session_01ABC",
    },
  );
  const local = sessionIdentity({ CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "4b1e90c2-aaaa" });
  assert.equal(local.back, "claude --resume 4b1e90c2-aaaa");
  assert.notEqual(local.where, "cloud");
  assert.equal(sessionIdentity({ FREEFLOW_SESSION: "pi-123456789", FREEFLOW_HARNESS: "Pi" }).harness, "Pi");
});

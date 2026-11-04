// Track Work's writes into Freeflow's files never follow a symbolic link (lib/no-follow.mjs): every appendFile and
// direct writeFile Track Work makes goes through it, so these cases hold for each of them.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendNoFollow,
  openNoFollow,
  readNoFollowSync,
  refuseLinkedFolders,
  writeNoFollow,
} from "../../../skills/track-work/scripts/lib/no-follow.mjs";

async function withHome(run) {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "track-work-no-follow-")));
  const saved = process.env.FREEFLOW_HOME;
  process.env.FREEFLOW_HOME = join(folder, "home");
  await mkdir(process.env.FREEFLOW_HOME);
  try {
    await run(folder, process.env.FREEFLOW_HOME);
  } finally {
    if (saved === undefined) delete process.env.FREEFLOW_HOME;
    else process.env.FREEFLOW_HOME = saved;
    await rm(folder, { recursive: true, force: true });
  }
}

test("a write, an append and a read refuse a file that is a link, and leave its target alone", async () => {
  await withHome(async (folder, home) => {
    const outside = join(folder, "outside.txt");
    await writeFile(outside, "kept\n");
    const link = join(home, "sessions.md");
    await symlink(outside, link);
    await assert.rejects(writeNoFollow(link, "x"), { code: "link-refused", message: /it is a symbolic link/ });
    await assert.rejects(appendNoFollow(link, "x"), { code: "link-refused" });
    await assert.rejects(openNoFollow(link), { code: "link-refused" });
    assert.throws(() => readNoFollowSync(link), { code: "link-refused" });
    assert.equal(await readFile(outside, "utf8"), "kept\n");
    // A link that leads nowhere is not followed to make its target.
    const dangling = join(home, "made.md");
    await symlink(join(folder, "made-outside.md"), dangling);
    await assert.rejects(writeNoFollow(dangling, "x"), { code: "link-refused" });
    assert.equal(existsSync(join(folder, "made-outside.md")), false);
  });
});

test("inside the Freeflow home a folder on the way that is a link refuses the write; outside it only the file is looked at", async () => {
  await withHome(async (folder, home) => {
    const elsewhere = join(folder, "elsewhere");
    await mkdir(elsewhere);
    await mkdir(join(home, "projects"));
    await symlink(elsewhere, join(home, "projects", "p"));
    await assert.rejects(writeNoFollow(join(home, "projects", "p", "record.md"), "x"), {
      code: "link-refused",
      message: /projects\/p is a symbolic link/,
    });
    assert.equal(existsSync(join(elsewhere, "record.md")), false);
    // The same look before a write through a temporary file and a rename (store.mjs's records).
    await assert.rejects(refuseLinkedFolders(join(home, "projects", "p", "tasks", "record.md")), {
      code: "link-refused",
    });
    await refuseLinkedFolders(join(home, "projects", "record.md"));
    // A folder outside the home (a repository's .freeflow/tasks/) reached through a link is the user's own layout.
    const linkedRepo = join(folder, "repo-link");
    await symlink(elsewhere, linkedRepo);
    await writeNoFollow(join(linkedRepo, "notes.md"), "mine\n");
    assert.equal(await readFile(join(elsewhere, "notes.md"), "utf8"), "mine\n");
  });
});

test("a FIFO or other non-file is refused at once; a plain file is written, appended and read as fs does", async () => {
  await withHome(async (folder, home) => {
    const fifo = join(home, "pipe.jsonl");
    execFileSync("mkfifo", [fifo]);
    await assert.rejects(writeNoFollow(fifo, "x"), { code: "link-refused", message: /not a regular file/ });
    await assert.rejects(openNoFollow(fifo), { code: "link-refused", message: /not a regular file/ });
    assert.throws(() => readNoFollowSync(fifo), { code: "link-refused" });
    const file = join(home, "log.jsonl");
    await writeNoFollow(file, "one\n", { mode: 0o600 });
    await appendNoFollow(file, "two\n");
    await writeNoFollow(join(home, "other.md"), "replaced\n");
    await writeNoFollow(join(home, "other.md"), "short\n");
    assert.deepEqual(readNoFollowSync(file), { text: "one\ntwo\n", bytes: 8 });
    assert.equal(await readFile(join(home, "other.md"), "utf8"), "short\n");
  });
});

// SPEC-010 T2: when Setup Freeflow makes a store (its store-setup reference runs Track Work's store init), the store
// gets the default routing table in rules/routing.md, committed; a store that is joined keeps its own rules.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { DEFAULT_TABLE, parseTable } from "../../../skills/track-work/scripts/lib/routing5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

async function withFolder(run) {
  const folder = realpathSync(await mkdtemp(join(tmpdir(), "setup-freeflow-routing-")));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    const cli = (home, args) => {
      const result = spawnSync(
        process.execPath,
        [scriptPath, ...args, "--git-name", "Test User", "--git-email", "t@example.com"],
        {
          cwd: folder,
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
            GIT_CONFIG_NOSYSTEM: "1",
            FREEFLOW_HOME: home,
            FREEFLOW_SESSION: "",
            CLAUDE_CODE_SESSION_ID: "",
          },
        },
      );
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    await run({ folder, cli });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

const tracked = (home) => execFileSync("git", ["-C", home, "ls-files"], { encoding: "utf8" }).split("\n");

test("store init writes the default routing table, section 3's two tiers, into a new local store and commits it", async () => {
  await withFolder(async ({ folder, cli }) => {
    const home = join(folder, "local");
    cli(home, ["store", "init"]);
    const text = await readFile(join(home, "rules", "routing.md"), "utf8");
    assert.equal(text, DEFAULT_TABLE);
    assert.ok(tracked(home).includes("rules/routing.md"));
    const table = parseTable(text);
    assert.equal(table.cheap, "claude-haiku-5-5");
    assert.deepEqual(
      table.rows.map((row) => row.cells.join(" | ")),
      [
        "gather, research, eval | any | any | cheap | xhigh | no",
        "review | any | any | cheap | xhigh | no",
        "review (security tier) | any | any | frontier | high | yes",
        "build | yes | scripted, tests | cheap | xhigh | no",
        "build | no | any | frontier | high | yes",
        "any | any | judgement | frontier | high | yes",
      ],
    );
  });
});

test("store init --remote lays the table out in an empty remote; a store that is joined keeps its own rules", async () => {
  await withFolder(async ({ folder, cli }) => {
    const remote = join(folder, "store.git");
    execFileSync("git", ["init", "--quiet", "--bare", remote]);
    const first = join(folder, "first");
    cli(first, ["store", "init", "--remote", remote]);
    assert.equal(await readFile(join(first, "rules", "routing.md"), "utf8"), DEFAULT_TABLE);
    // The user removes the table from their store; another device joining it gets the store as it is.
    await unlink(join(first, "rules", "routing.md"));
    execFileSync("git", ["-C", first, "commit", "--quiet", "-am", "No routing table"], {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "T",
        GIT_AUTHOR_EMAIL: "t@e",
        GIT_COMMITTER_NAME: "T",
        GIT_COMMITTER_EMAIL: "t@e",
      },
    });
    execFileSync("git", ["-C", first, "push", "--quiet", "origin", "main"]);
    const second = join(folder, "second");
    cli(second, ["store", "init", "--remote", remote]);
    assert.equal(existsSync(join(second, "rules", "routing.md")), false);
  });
});

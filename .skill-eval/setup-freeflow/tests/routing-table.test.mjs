// The delegation rules (2026-11-14): store init writes no rules file, since Freeflow's shipped default is the rules a
// store has with none; a store that is joined keeps its own rules, a rules/delegation.md or an older rules/routing.md.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { DEFAULT_RULES, parseRules } from "../../../skills/track-work/scripts/lib/routing5.mjs";

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

test("store init writes no rules file into a new local store: Freeflow's shipped default is the delegation rules with no file", async () => {
  await withFolder(async ({ folder, cli }) => {
    const home = join(folder, "local");
    cli(home, ["store", "init"]);
    assert.equal(existsSync(join(home, "rules", "routing.md")), false);
    assert.equal(existsSync(join(home, "rules", "delegation.md")), false);
    assert.equal(tracked(home).includes("rules/routing.md"), false);
    assert.equal(tracked(home).includes("rules/delegation.md"), false);
  });
});

test("the shipped default parses as section 3's two tiers, with the Worker: ceiling on Claude", async () => {
  const rules = parseRules(DEFAULT_RULES);
  assert.equal(rules.cheap, "claude-haiku-5-5");
  assert.equal(rules.worker, "claude-opus-5-5");
  assert.deepEqual(
    rules.rows.map((row) => row.cells.join(" | ")),
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

test("store init --remote lays an empty remote out with no rules file; a store that is joined keeps its own rules", async () => {
  await withFolder(async ({ folder, cli }) => {
    const remote = join(folder, "store.git");
    execFileSync("git", ["init", "--quiet", "--bare", remote]);
    const first = join(folder, "first");
    cli(first, ["store", "init", "--remote", remote]);
    assert.equal(existsSync(join(first, "rules", "routing.md")), false);
    // The user writes their rules in their store, commits them; another device joining it gets the store as it is.
    await writeFile(join(first, "rules", "delegation.md"), "# Delegation rules\n\nWorker: claude-opus-5-5\n");
    execFileSync("git", ["-C", first, "add", "--all"]);
    execFileSync("git", ["-C", first, "commit", "--quiet", "-am", "Delegation rules"], {
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
    assert.equal(
      await readFile(join(second, "rules", "delegation.md"), "utf8"),
      "# Delegation rules\n\nWorker: claude-opus-5-5\n",
    );
    assert.equal(existsSync(join(second, "rules", "routing.md")), false);
  });
});

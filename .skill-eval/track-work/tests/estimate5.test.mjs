import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

function run(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, "estimate", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      FREEFLOW_CONTEXT_WINDOW: "200000",
      FREEFLOW_TRANSCRIPT: "",
      CLAUDE_CODE_SESSION_ID: "",
      ...env,
    },
  });
}

test("estimate gives the context's use against the window and the notice, and projects the parts left (P78)", async () => {
  const before = run(["--used", "50000"]);
  assert.equal(before.status, 0, before.stderr);
  assert.equal(
    before.stdout,
    "Context: about 50,000 of 200,000 tokens (25%), from --used; the window from FREEFLOW_CONTEXT_WINDOW.\nFreeflow's notice comes at about 150,000 tokens (75% of the window): about 100,000 left before it, for this compaction cycle's work and its checkpoint.\n",
  );
  assert.match(
    run(["--used", "50000", "--done", "1", "--left", "2"]).stdout,
    /the 2 part\(s\) left need about 100,000: they fit before the notice\.\n$/,
  );
  assert.match(
    run(["--used", "60000", "--done", "1", "--left", "4"]).stdout,
    /At most about 60,000 tokens a part, the 4 part\(s\) left need about 240,000: about 1 more compaction cycle\(s\)\./,
  );
  assert.match(
    run(["--used", "160000"]).stdout,
    /\nPast the notice point \(about 150,000 tokens\): checkpoint at the next safe point\.\n$/,
  );
  assert.match(
    run(["--used", "1000", "--window", "1000000"]).stdout,
    /of 1,000,000 tokens \(0%\), from --used; the window from --window\./,
  );
  assert.match(run(["--used", "1", "--done", "1"]).stderr, /--done and --left go together/);
  assert.match(run(["--used", "x"]).stderr, /--used is a whole number, not x/);
  assert.match(run([]).stderr, /The context's use is not known here: pass --used <tokens>/);
  // With no window set, one larger than the context is assumed wrong: a share over 100% would tell the agent to
  // checkpoint for nothing. A window that is set stands.
  const unset = run(["--used", "422185"], { FREEFLOW_CONTEXT_WINDOW: "" });
  assert.equal(unset.status, 1);
  assert.match(
    unset.stderr,
    /The context holds about 422,185 tokens, more than the 200,000 assumed when no window is set: pass --window <tokens>/,
  );
  assert.match(
    run(["--used", "100000"], { FREEFLOW_CONTEXT_WINDOW: "" }).stdout,
    /\(50%\), from --used; the window assumed/,
  );
  assert.match(run(["--used", "210000"]).stdout, /\(105%\), from --used; the window from FREEFLOW_CONTEXT_WINDOW\./);
});

test("estimate reads the main conversation's latest request from a Claude Code log, not a subagent's", async () => {
  const folder = await mkdtemp(join(tmpdir(), "track-work-estimate5-"));
  try {
    const log = join(folder, "session.jsonl");
    const entry = (usage, extra = {}) => JSON.stringify({ type: "assistant", message: { usage }, ...extra });
    await writeFile(
      log,
      [
        entry({ input_tokens: 5, cache_read_input_tokens: 10000, cache_creation_input_tokens: 0, output_tokens: 100 }),
        JSON.stringify({ type: "user", message: { content: "go on" } }),
        entry({
          input_tokens: 3,
          cache_read_input_tokens: 40000,
          cache_creation_input_tokens: 2000,
          output_tokens: 497,
        }),
        entry({ input_tokens: 9, cache_read_input_tokens: 150000, output_tokens: 1 }, { isSidechain: true }),
        "",
      ].join("\n"),
    );
    const read = run([], { FREEFLOW_TRANSCRIPT: log });
    assert.equal(read.status, 0, read.stderr);
    assert.match(read.stdout, /^Context: about 42,500 of 200,000 tokens \(21%\), from the session's transcript;/);
    assert.match(run(["--transcript", log]).stdout, /^Context: about 42,500 /);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

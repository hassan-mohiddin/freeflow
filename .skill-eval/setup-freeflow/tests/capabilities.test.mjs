import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { REQUESTS } from "../../../skills/setup-freeflow/scripts/capabilities.mjs";

const scriptPath = resolve("skills/setup-freeflow/scripts/capabilities.mjs");

async function withHome(run) {
  const home = await mkdtemp(join(tmpdir(), "freeflow-capabilities-"));
  const env = { ...process.env, FREEFLOW_HOME: home, CLAUDE_CODE_SESSION_ID: "", FREEFLOW_SESSION: "s-1" };
  const cli = (...args) => spawnSync(process.execPath, [scriptPath, ...args], { env, encoding: "utf8" });
  try {
    await run({ home, cli });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

const claim = (value, how) => ({ claim: value, how });
/** The claims Claude Code's mod writes at an interactive session's start (SPEC-006 4.5). */
const MOD = {
  v: 1,
  requestSet: 1,
  driver: "claude-code-mod",
  freeflow: "0.9.0",
  mode: "interactive",
  enabled: true,
  events: true,
  claims: {
    pin: claim("possible", "prompt.section exists; Freeflow does not use it yet"),
    inject: claim("yes", "appends rows the agent reads ($.session.append)"),
    forget: claim("no", "nothing removes a stored row"),
    compact: claim("yes", "its own compaction after a checkpoint, the bundle in place of the summary"),
    checkpoint: claim("yes", "through Track Work's script"),
    rewind: claim("no", "no rewind in the mods API"),
    route: claim("possible", "turn.step can change model and effort; Freeflow does not yet"),
    spawn: claim("possible", "$.agent.spawn exists; Freeflow does not start workers itself"),
    send: claim("yes", "messages to its workers ($.session.send)"),
    wake: claim("yes", "a prompt after its compaction ($.prompt.submit)"),
    ask: claim("possible", "$.ui.ask exists; Freeflow does not ask through it yet"),
    block: claim("possible", "tool.check can deny; Freeflow only allows store files today"),
    sensors: claim("yes", "turns, model requests, tool calls, compactions, workers, written to the event log"),
    timers: claim("yes", "$.clock.after"),
  },
};

async function writeClaims(home, session, file) {
  await mkdir(join(home, "sessions", session), { recursive: true });
  await writeFile(
    join(home, "sessions", session, "capabilities.json"),
    typeof file === "string" ? file : JSON.stringify(file),
  );
}

test("with no driver, as on Codex, Cursor, Copilot or Gemini: only the session-start guidance, every other request no, no event log", async () => {
  await withHome(async ({ cli }) => {
    const listed = cli("list");
    assert.equal(listed.status, 0, listed.stderr);
    const lines = listed.stdout.trimEnd().split("\n");
    assert.equal(
      lines[0],
      "No Freeflow driver runs in this session: only the session-start guidance arrives here, and the agent runs Freeflow's scripts itself.",
    );
    assert.equal(lines.at(-1), "Event log: none; no driver writes one here.");
    assert.match(
      listed.stdout,
      /\n {2}inject {5}yes {7}at session start only, through the host's session-start hook\n/,
    );
    assert.match(listed.stdout, /\n {2}checkpoint yes {7}Track Work's script, run by the agent\n/);
    assert.equal(lines.filter((line) => / no {8}no Freeflow driver runs here$/.test(line)).length, REQUESTS.length - 2);

    const compact = cli("check", "compact");
    assert.equal(compact.status, 1);
    assert.equal(compact.stdout, "compact: no (no driver): no Freeflow driver runs here\n");
    assert.equal(cli("check", "checkpoint").status, 0);
  });
});

test("with the mod's claims: the listing, check exits 0 only for yes, and the event log with its line count (section 4.6)", async () => {
  await withHome(async ({ home, cli }) => {
    await writeClaims(home, "s-1", MOD);
    await mkdir(join(home, "events"));
    await writeFile(join(home, "events", "s-1.jsonl"), '{"v":1}\n{"v":1}\n{"v":1}\n');
    const listed = cli("list");
    assert.equal(listed.status, 0, listed.stderr);
    const lines = listed.stdout.trimEnd().split("\n");
    assert.equal(lines[0], "Freeflow on Claude Code (claude-code-mod 0.9.0, request set 1, interactive)");
    assert.deepEqual(
      lines.slice(1, -1).map((line) => line.trim().split(/\s+/).slice(0, 2)),
      REQUESTS.map((request) => [request, MOD.claims[request].claim]),
    );
    assert.equal(
      lines[4],
      "  compact    yes       its own compaction after a checkpoint, the bundle in place of the summary",
    );
    assert.equal(lines.at(-1), `Event log: on, ${join(home, "events", "s-1.jsonl")} (3 line(s))`);

    for (const request of REQUESTS) {
      const checked = cli("check", request);
      assert.equal(checked.status, MOD.claims[request].claim === "yes" ? 0 : 1, request);
      assert.equal(
        checked.stdout,
        `${request}: ${MOD.claims[request].claim} (Claude Code): ${MOD.claims[request].how}\n`,
      );
    }
    const json = JSON.parse(cli("list", "--json").stdout);
    assert.equal(json.driver, "claude-code-mod");
    assert.deepEqual(json.eventLog, { on: true, path: join(home, "events", "s-1.jsonl"), lines: 3 });

    // Another session's claims, named; this one's own are not them.
    assert.equal(cli("check", "compact", "--session", "s-2").status, 1);
  });
});

test("claims the script cannot use read as no: Freeflow off, a file it cannot read, another request set, a request left out", async () => {
  await withHome(async ({ home, cli }) => {
    const off = {
      ...MOD,
      enabled: false,
      events: false,
      claims: Object.fromEntries(
        REQUESTS.map((request) => [request, claim("no", "Freeflow is off in this session (enabled)")]),
      ),
    };
    await writeClaims(home, "s-1", off);
    const listed = cli("list").stdout;
    assert.match(
      listed,
      /^Freeflow on Claude Code \(claude-code-mod 0\.9\.0, request set 1, interactive\): Freeflow is off in this session\n/,
    );
    assert.match(listed, /\nEvent log: off \(Freeflow is off\)\n$/);
    assert.equal(cli("check", "inject").status, 1);

    await writeClaims(home, "s-1", "{ not json");
    assert.match(
      cli("list").stdout,
      /^No Freeflow driver runs in this session[^\n]*\n\(.*capabilities\.json is not JSON/,
    );

    await writeClaims(home, "s-1", { ...MOD, requestSet: 2 });
    assert.match(cli("list").stdout, /\n\(.*capabilities\.json: it names request set 2, not 1\)\n/);
    assert.equal(cli("check", "compact").status, 1);

    const { compact: _left, ...rest } = MOD.claims;
    await writeClaims(home, "s-1", { ...MOD, claims: { ...rest, wake: claim("maybe", "unsure") } });
    assert.equal(cli("check", "compact").stdout, "compact: no (Claude Code): the driver does not claim it\n");
    assert.equal(cli("check", "wake").stdout, "wake: no (Claude Code): the driver does not claim it\n");
    assert.equal(cli("check", "inject").status, 0);
  });
});

test("a request outside the set, or a wrong option, is an error with exit 2", async () => {
  await withHome(async ({ cli }) => {
    const unknown = cli("check", "teleport");
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /^Error: check takes one request of set 1: pin, inject, /);
    assert.equal(cli("list", "--global").status, 2);
    assert.match(cli("--help").stdout, /^Usage:\n {2}capabilities\.mjs \[list\]/);
  });
});

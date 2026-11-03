import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import CONFORMANCE from "../codex/conformance.mjs";
import { claims, codexWindow, EVENTS, noticePoint, toolPaths } from "../codex/driver.mjs";
import GOLDEN from "../codex/golden-events.mjs";
import { lineProblem } from "../../skills/track-work/scripts/lib/events5.mjs";
import { OUTPUT_SCHEMAS, SCHEMAS, recorded } from "./fixtures/codex/inputs.mjs";

// Codex's driver (SPEC-012) driven with recorded hook inputs, as Codex runs it: one process per event, the input on
// stdin. No Codex process and no model run here (P4): Codex is not installed in this container.

const DRIVER = resolve("hooks/codex/driver.mjs");
const SCRIPT = resolve("skills/track-work/scripts/working-record.mjs");
const FIXTURES = resolve("hooks/tests/fixtures/codex");
const SESSION = "thr_golden-1";

/** The environment a Codex hook runs in here: no Claude Code session, a home and a Codex home of the test's own. */
function envOf(folder, extra = {}) {
  const env = { ...process.env };
  for (const key of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_REMOTE", "CLAUDE_CODE_REMOTE_SESSION_ID"])
    delete env[key];
  for (const key of ["FREEFLOW_SESSION", "FREEFLOW_TRANSCRIPT", "FREEFLOW_CONTEXT_WINDOW", "FREEFLOW_HARNESS"])
    delete env[key];
  return {
    ...env,
    FREEFLOW_HOME: join(folder, "home"),
    CODEX_HOME: join(folder, "codex"),
    GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    ...extra,
  };
}

/**
 * A folder with a work repository where Freeflow is set up, and, with `store`, a store holding one task this session
 * holds, as Track Work's script makes them.
 */
function setUp({ store = true, config = {} } = {}) {
  const folder = mkdtempSync(join(tmpdir(), "freeflow-codex-driver-"));
  writeFileSync(join(folder, "gitconfig"), "");
  const work = join(folder, "work");
  mkdirSync(join(work, ".freeflow"), { recursive: true });
  spawnSync("git", ["init", "--quiet", "-b", "main", work]);
  writeFileSync(join(work, ".freeflow", "config.json"), `${JSON.stringify(config)}\n`);
  const cli = (args, { session = SESSION, cwd = work, input = "" } = {}) => {
    const run = spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd,
      input,
      encoding: "utf8",
      env: envOf(folder, { FREEFLOW_SESSION: session, FREEFLOW_HARNESS: "Codex" }),
    });
    assert.equal(run.status, 0, `${args.join(" ")}: ${run.stdout}\n${run.stderr}`);
    return run.stdout;
  };
  if (store) {
    cli(["store", "init", "--git-name", "Test User", "--git-email", "t@example.com"]);
    cli(["project", "new", "--name", "Widget"]);
    cli([
      "task",
      "create",
      "--title",
      "Probe",
      "--goal",
      "Probe Codex.",
      "--cue",
      "read when probing",
      "--project",
      "widget",
    ]);
  }
  /**
   * Runs the driver on one event as Codex does, and returns its output (null for none).
   * @param {string} event
   * @param {Record<string, unknown>} [fields]
   */
  const hook = (event, fields = {}, { session = SESSION, env = {} } = {}) => {
    const run = spawnSync(process.execPath, [DRIVER, event], {
      cwd: work,
      input: JSON.stringify(recorded(event, { session, cwd: work }, fields)),
      encoding: "utf8",
      env: envOf(folder, env),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stderr, "", `${event} wrote to stderr`);
    return run.stdout.trim() ? JSON.parse(run.stdout) : null;
  };
  const home = join(folder, "home");
  const sessionFile = (name, session = SESSION) => join(home, "sessions", session, name);
  const log = (session = SESSION) => {
    const path = join(home, "events", `${session}.jsonl`);
    return existsSync(path)
      ? readFileSync(path, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  };
  const done = () => rmSync(folder, { recursive: true, force: true });
  return { folder, work, home, cli, hook, sessionFile, log, done };
}

const contextOf = (output) => output?.hookSpecificOutput?.additionalContext;
const usage = (total) => ({
  token_usage: {
    input_tokens: total - 100,
    cached_input_tokens: Math.round(total / 2),
    cache_write_input_tokens: 0,
    output_tokens: 100,
    reasoning_output_tokens: 10,
    total_tokens: total,
  },
});
/** A line as the golden log keeps it: no time, number or duration, which change from run to run. */
const stable = ({ ts, seq, ms, ...line }) => line;

/** The minimal JSON Schema reading the recorded inputs need: required keys, enums, and the types they use. */
function schemaProblems(schema, value, at = "input") {
  const problems = [];
  const resolveRef = (node) => (node?.$ref ? schema.definitions[node.$ref.split("/").at(-1)] : node);
  const check = (node, item, where) => {
    node = resolveRef(node);
    if (!node) return;
    if (node.anyOf) {
      if (!node.anyOf.some((each) => !checked(each, item, where).length)) problems.push(`${where}: matches no anyOf`);
      return;
    }
    if (node.enum && !node.enum.includes(item)) problems.push(`${where}: ${JSON.stringify(item)} not in its enum`);
    const types = [node.type].flat().filter(Boolean);
    const typeOf =
      item === null ? "null" : Number.isInteger(item) ? "integer" : Array.isArray(item) ? "array" : typeof item;
    if (types.length && !types.includes(typeOf) && !(typeOf === "integer" && types.includes("number")))
      problems.push(`${where}: ${typeOf}, not ${types.join(" or ")}`);
    if (typeOf === "object" && node.properties) {
      for (const key of node.required ?? []) if (!(key in item)) problems.push(`${where}.${key}: required`);
      for (const [key, sub] of Object.entries(node.properties))
        if (key in item) check(sub, item[key], `${where}.${key}`);
    }
  };
  const checked = (node, item, where) => {
    const before = problems.length;
    check(node, item, where);
    return problems.splice(before);
  };
  check({ ...schema, oneOf: undefined }, value, at);
  if (schema.oneOf) {
    const fits = schema.oneOf.filter((branch) => !checked(branch, value, at).length);
    if (fits.length !== 1) problems.push(`${at}: matches ${fits.length} of oneOf`);
  }
  return problems;
}

test("every recorded input follows Codex's generated schema for its event", () => {
  assert.deepEqual(Object.keys(SCHEMAS).sort(), [...EVENTS].sort());
  for (const event of EVENTS) {
    const schema = JSON.parse(readFileSync(join(FIXTURES, SCHEMAS[event]), "utf8"));
    const input = recorded(event, { session: SESSION, cwd: "/work" });
    assert.deepEqual(schemaProblems(schema, input), [], event);
    for (const key of schema.required ?? []) assert.ok(key in input, `${event} has ${key}`);
  }
});

test("hooks.json names the driver for every event it answers, with fork, the bundle unlimited and SessionEnd within 3 s", () => {
  const { hooks } = JSON.parse(readFileSync(resolve("hooks/codex/hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(hooks).sort(), [...EVENTS].sort());
  for (const [event, groups] of Object.entries(hooks))
    for (const group of groups)
      for (const handler of group.hooks) {
        assert.equal(handler.type, "command");
        assert.equal(handler.command, `node "\${PLUGIN_ROOT}/hooks/codex/driver.mjs" ${event}`);
        assert.ok(Number.isInteger(handler.timeout) && handler.timeout >= 1, `${event} timeout`);
      }
  const [start, compact] = hooks.SessionStart;
  assert.deepEqual(start.matcher.split("|").sort(), ["clear", "fork", "resume", "startup"]);
  assert.equal(compact.matcher, "compact");
  assert.equal(compact.hooks[0].additionalContextLimit, 0);
  assert.ok(start.hooks[0].additionalContextLimit >= 8000);
  assert.ok(hooks.SessionEnd[0].hooks[0].timeout <= 3);
});

test("each output is the shape Codex's output schema documents, and events that steer nothing print nothing", () => {
  const { hook, done } = setUp();
  try {
    const outputs = {
      SessionStart: hook("SessionStart"),
      UserPromptSubmit: null,
      PostToolUse: null,
    };
    // A row waiting reaches the model at the next prompt or tool call.
    hook("PostModelRequest", usage(150_000));
    outputs.UserPromptSubmit = hook("UserPromptSubmit");
    hook("PostModelRequest", usage(170_000));
    outputs.PostToolUse = hook("PostToolUse");
    for (const [event, output] of Object.entries(outputs)) {
      const schema = JSON.parse(readFileSync(join(FIXTURES, OUTPUT_SCHEMAS[event]), "utf8"));
      assert.ok(output, `${event} answered`);
      for (const key of Object.keys(output)) assert.ok(key in schema.properties, `${event}: ${key}`);
      const wire = Object.values(schema.definitions).find((each) => each.properties?.hookEventName);
      for (const key of Object.keys(output.hookSpecificOutput)) assert.ok(key in wire.properties, `${event}: ${key}`);
      assert.equal(output.hookSpecificOutput.hookEventName, event);
      assert.equal(typeof output.hookSpecificOutput.additionalContext, "string");
    }
    for (const event of [
      "PreToolUse",
      "PostModelRequest",
      "PreCompact",
      "PostCompact",
      "SubagentStart",
      "SubagentStop",
    ])
      assert.equal(hook(event), null, event);
    assert.equal(hook("Stop"), null);
    assert.equal(hook("SessionEnd"), null);
  } finally {
    done();
  }
});

// The conformance tests of the driver's yes claims (SPEC-006 4.7): each one a precondition, the request and its effect
// observed from outside, named in hooks/codex/conformance.mjs.

test(CONFORMANCE.pin, () => {
  const { hook, done } = setUp();
  try {
    const start = contextOf(hook("SessionStart"));
    assert.match(start, /^# Freeflow/);
    assert.ok(
      start.indexOf("Freeflow task memory:") > start.indexOf("Freeflow: active"),
      "the guidance, then the menu",
    );
    assert.match(
      start,
      /This session holds widget\/task-001: recover it with view recover --record widget\/task-001\./,
    );
    // A fork starts with the guidance too (T2).
    assert.match(contextOf(hook("SessionStart", { source: "fork" })), /^# Freeflow/);
    // After Codex compacts: the guidance again, then the task's bundle after Codex's summary.
    hook("PreCompact", { trigger: "manual" });
    hook("PostCompact", { trigger: "manual" });
    const after = contextOf(hook("SessionStart", { source: "compact" }));
    assert.match(after, /^# Freeflow/);
    assert.match(after, /Freeflow task memory, after Codex's compaction: Codex compacted before a checkpoint/);
    assert.match(after, /# Probe/);
    assert.match(after, /Freeflow cannot read Codex's transcript/);
  } finally {
    done();
  }
});

test(CONFORMANCE.inject, () => {
  const { hook, sessionFile, done } = setUp();
  try {
    hook("SessionStart");
    // Below 50% of gpt-5-codex's 272,000-token window: nothing.
    hook("PostModelRequest", usage(100_000));
    assert.equal(hook("PostToolUse"), null);
    // Past 50%: one row, at the next tool call, once.
    hook("PostModelRequest", usage(140_000));
    assert.match(
      contextOf(hook("PostToolUse")),
      /^Freeflow, context cycle 1: the context is at 51% of its window \(140000 of 272000 tokens\); the checkpoint notice comes at about 204000 tokens\.$/,
    );
    assert.equal(hook("PostToolUse"), null);
    hook("PostModelRequest", usage(150_000));
    assert.equal(hook("UserPromptSubmit"), null, "the 50% row comes once a cycle");
    // Past 75%: the notice, naming the task, at the next prompt; then nothing more this cycle.
    hook("PostModelRequest", usage(210_000));
    const notice = contextOf(hook("UserPromptSubmit"));
    assert.match(notice, /^Freeflow, context cycle 1: compaction is near\. The context is at 77% of its window/);
    assert.match(notice, /checkpoint widget\/task-001: .+ checkpoint --record widget\/task-001 --input - /);
    assert.match(notice, /Then end your turn\./);
    assert.doesNotMatch(notice, /--compact/);
    hook("PostModelRequest", usage(230_000));
    assert.equal(hook("PostToolUse"), null);
    // A worker's request moves nothing.
    hook("PostModelRequest", { ...usage(260_000), agent_id: "agent-1", agent_type: "default" });
    assert.equal(hook("PostToolUse"), null);
    // After Codex compacts, a new cycle: its rows again.
    hook("SessionStart", { source: "compact" });
    assert.equal(JSON.parse(readFileSync(sessionFile("cycle.json"), "utf8")).cycle, 2);
    hook("PostModelRequest", usage(140_000));
    assert.match(contextOf(hook("PostToolUse")), /^Freeflow, context cycle 2: the context is at 51%/);
  } finally {
    done();
  }
});

test(CONFORMANCE.checkpoint, () => {
  const { hook, cli, done } = setUp();
  try {
    hook("SessionStart");
    hook("PostModelRequest", usage(210_000));
    assert.match(contextOf(hook("PostToolUse")), /compaction is near/);
    // The agent checkpoints after the notice, through Track Work's script; checkpoint --compact is refused here,
    // naming what makes Codex compact.
    const refused = cli(["checkpoint", "--record", "widget/task-001", "--compact"]);
    assert.match(
      refused,
      /Freeflow's driver here does not compact \(compact: no, Codex compacts on its own \(model_auto_compact_token_limit, model_post_turn_compact_threshold_percent or \/compact\); after it, the bundle is added\)\./,
    );
    // Codex compacts: the bundle that follows its summary is the record as of that checkpoint.
    hook("PreCompact");
    hook("PostCompact");
    const after = contextOf(hook("SessionStart", { source: "compact" }));
    assert.match(
      after,
      /Freeflow task memory, after Codex's compaction: widget\/task-001's record as of the checkpoint this cycle\./,
    );
    assert.doesNotMatch(after, /Codex compacted before a checkpoint/);
  } finally {
    done();
  }
});

test(CONFORMANCE.sensors, () => {
  const { hook, log, sessionFile, done, cli } = setUp();
  try {
    // The scripted session: start, a prompt, model requests, two tool calls, a worker, a compaction, the turn's end
    // and the session's end.
    hook("SessionStart");
    hook("UserPromptSubmit");
    hook("PostModelRequest", usage(140_000));
    hook("PreToolUse", { tool_input: { command: "npm test -- --token=abc123" } });
    hook("PostToolUse", { tool_input: { command: "npm test -- --token=abc123" } });
    hook("PostModelRequest", usage(150_000));
    const patch = "*** Begin Patch\n*** Update File: src/app.js\n@@\n-old secret\n+new secret\n*** End Patch\n";
    hook("PreToolUse", { tool_name: "apply_patch", tool_use_id: "call_2", tool_input: { command: patch } });
    hook("PostToolUse", {
      tool_name: "apply_patch",
      tool_use_id: "call_2",
      tool_input: { command: patch },
      tool_response: "Success. Updated the following files:\nM src/app.js",
    });
    hook("SubagentStart");
    hook("PostModelRequest", { ...usage(9_000), agent_id: "agent-1", agent_type: "default" });
    hook("SubagentStop");
    hook("PreCompact");
    hook("PostCompact");
    hook("SessionStart", { source: "compact" });
    // Nothing reaches the log before the turn ends, and then in one run.
    assert.deepEqual(log(), []);
    hook("Stop");
    assert.ok(!existsSync(sessionFile("events-buffer.jsonl")));
    const written = log();
    for (const line of written) assert.equal(lineProblem(line), null, JSON.stringify(line));
    assert.deepEqual(
      written.map((line) => line.seq),
      written.map((_, index) => index + 1),
    );
    hook("SessionEnd");
    const all = log();
    assert.deepEqual(all.map(stable), GOLDEN.map(stable), JSON.stringify(all.map(stable), null, 2));
    // Never contents: the redacted command, the patch's path and not its text, no prompt and no answer.
    const text = JSON.stringify(all);
    assert.match(text, /npm test -- --token=\[redacted\]/);
    assert.doesNotMatch(text, /abc123|secret|Fix the failing test|Fixed it/);
    assert.ok(all.find((line) => line.tool === "Bash").ms >= 0);
    // The session's end released the hold as ended, committed here only; a resume takes it back.
    assert.equal(JSON.parse(cli(["session", "status"])).task, null);
    assert.match(contextOf(hook("SessionStart", { source: "resume" })), /Took widget\/task-001 back/);
  } finally {
    done();
  }
});

test("each conformance test names a yes claim of the driver, and every yes claim has one (SPEC-006 4.7)", () => {
  const yes = Object.entries(claims(true))
    .filter(([, claim]) => claim.claim === "yes")
    .map(([request]) => request);
  assert.deepEqual(Object.keys(CONFORMANCE).sort(), yes.sort());
  const source = readFileSync(resolve("hooks/tests/codex-driver.test.mjs"), "utf8");
  for (const request of yes) assert.ok(source.includes(`test(CONFORMANCE.${request},`), request);
  // The rest say so: block is possible until Part 5's gates land; compact and the others no.
  assert.equal(claims(true).block.claim, "possible");
  for (const request of ["forget", "compact", "rewind", "route", "spawn", "send", "wake", "ask", "timers"])
    assert.equal(claims(true)[request].claim, "no", request);
  assert.equal(claims(false).sensors.claim, "possible");
});

test("capabilities.mjs lists Codex's claims from the file the driver writes", () => {
  const { hook, folder, done } = setUp();
  try {
    hook("SessionStart");
    const run = spawnSync(process.execPath, [resolve("skills/setup-freeflow/scripts/capabilities.mjs"), "list"], {
      encoding: "utf8",
      env: envOf(folder, { FREEFLOW_SESSION: SESSION }),
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^Freeflow on Codex \(codex-driver \d+\.\d+\.\d+, request set 1\)\n/);
    assert.match(run.stdout, /\n {2}pin +yes +session-start context, again after each compaction/);
    assert.match(run.stdout, /\n {2}block +possible +PreToolUse can deny/);
    assert.match(run.stdout, /\n {2}compact +no +Codex compacts on its own/);
    assert.match(run.stdout, /\nEvent log: on, /);
    const check = spawnSync(
      process.execPath,
      [resolve("skills/setup-freeflow/scripts/capabilities.mjs"), "check", "compact"],
      { encoding: "utf8", env: envOf(folder, { FREEFLOW_SESSION: SESSION }) },
    );
    assert.equal(check.status, 1);
    assert.match(check.stdout, /^compact: no \(Codex\): /);
  } finally {
    done();
  }
});

test("with Freeflow off for the session's folder, only the claims are written, every one no, and nothing else runs", () => {
  const { hook, sessionFile, log, done } = setUp({ config: { enabled: false } });
  try {
    assert.equal(hook("SessionStart"), null);
    const file = JSON.parse(readFileSync(sessionFile("capabilities.json"), "utf8"));
    assert.equal(file.enabled, false);
    assert.ok(Object.values(file.claims).every((claim) => claim.claim === "no"));
    hook("PostModelRequest", usage(210_000));
    assert.equal(hook("PostToolUse"), null);
    hook("Stop");
    assert.deepEqual(log(), []);
  } finally {
    done();
  }
});

test("with the event log off, the menu and rows still come and no line is kept", () => {
  const { hook, sessionFile, log, done } = setUp({ config: { events: { enabled: false } } });
  try {
    assert.match(contextOf(hook("SessionStart")), /Freeflow task memory:/);
    assert.equal(JSON.parse(readFileSync(sessionFile("capabilities.json"), "utf8")).claims.sensors.claim, "possible");
    hook("PostModelRequest", usage(140_000));
    assert.match(contextOf(hook("PostToolUse")), /context cycle 1/);
    hook("Stop");
    assert.deepEqual(log(), []);
  } finally {
    done();
  }
});

test("without a store: the guidance and what is missing, the event log still kept, no rows", () => {
  const { hook, log, done } = setUp({ store: false });
  try {
    const start = contextOf(hook("SessionStart"));
    assert.match(start, /^# Freeflow/);
    assert.match(start, /Freeflow task memory: the store is not ready\.\n- Missing: /);
    hook("PostModelRequest", usage(210_000));
    assert.equal(hook("PostToolUse"), null);
    hook("Stop");
    assert.deepEqual(
      log().map((line) => line.kind),
      ["session.start", "freeflow", "model.request", "tool.call", "turn.end"],
    );
  } finally {
    done();
  }
});

test("token_usage missing: no row and no notice, and one freeflow line a session says so", () => {
  const { hook, log, done } = setUp();
  try {
    hook("SessionStart");
    hook("PostModelRequest", { token_usage: null });
    hook("PostModelRequest", { token_usage: { tokens: 5 } });
    assert.equal(hook("PostToolUse"), null);
    hook("Stop");
    const errors = log().filter((line) => line.kind === "freeflow" && line.what === "error");
    assert.equal(errors.length, 1);
    assert.match(errors[0].detail, /PostModelRequest: no token_usage/);
  } finally {
    done();
  }
});

test("the window and the notice point come from Codex's config: model_context_window and the auto-compact limit", () => {
  const folder = mkdtempSync(join(tmpdir(), "freeflow-codex-window-"));
  try {
    const env = { CODEX_HOME: join(folder, "codex") };
    assert.deepEqual(codexWindow(folder, "gpt-5-codex", env), { window: 272_000, limit: null });
    assert.deepEqual(codexWindow(folder, "some-other-model", env), { window: null, limit: null });
    mkdirSync(join(folder, "codex"), { recursive: true });
    writeFileSync(
      join(folder, "codex", "config.toml"),
      'model = "gpt-5"\nmodel_context_window = 400_000 # tokens\nmodel_auto_compact_token_limit = 300000\n\n[profiles.fast]\nmodel_context_window = 1\n',
    );
    assert.deepEqual(codexWindow(folder, "gpt-5", env), { window: 400_000, limit: 300_000 });
    // The project's config over the user's.
    mkdirSync(join(folder, ".codex"));
    writeFileSync(join(folder, ".codex", "config.toml"), "model_auto_compact_token_limit = 250000\n");
    assert.deepEqual(codexWindow(folder, "gpt-5", env), { window: 400_000, limit: 250_000 });
    // 75% of the window, or a tenth of it before Codex's limit when that is lower (T13).
    assert.equal(noticePoint(400_000, null), 300_000);
    assert.equal(noticePoint(400_000, 250_000), 210_000);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("a tool call's paths: a file tool's fields and apply_patch's files, never the patch's text", () => {
  assert.deepEqual(toolPaths("Write", { file_path: "/w/src/a.js" }, "/w"), ["src/a.js"]);
  assert.deepEqual(
    toolPaths(
      "apply_patch",
      {
        command:
          "*** Begin Patch\n*** Add File: /w/new.md\n+text\n*** Update File: lib/b.js\n*** Move to: lib/c.js\n*** Delete File: old.txt\n*** End Patch",
      },
      "/w",
    ),
    ["new.md", "lib/b.js", "lib/c.js", "old.txt"],
  );
  assert.deepEqual(toolPaths("Bash", { command: "cat x" }, "/w"), []);
});

test("every handler fails open: no session, a home it cannot write, or an unknown event exits 0 with the guidance at most", () => {
  const { hook, folder, home, done } = setUp({ store: false });
  try {
    // An input that names no session gets the guidance at session start and nothing else, and writes nothing.
    assert.match(contextOf(hook("SessionStart", { session_id: "not a session" })), /^# Freeflow/);
    assert.equal(hook("PostToolUse", { session_id: "not a session" }), null);
    assert.equal(existsSync(join(home, "sessions")), false);
    writeFileSync(join(folder, "blocked"), "a file where the home should be");
    // Every event exits 0 with nothing on stderr (hook() checks both); session start still gives the guidance.
    const blocked = { env: { FREEFLOW_HOME: join(folder, "blocked") } };
    for (const event of EVENTS) {
      const output = hook(event, {}, blocked);
      if (event === "SessionStart") assert.match(contextOf(output), /^# Freeflow/);
      else assert.equal(output, null, event);
    }
    const unknown = spawnSync(process.execPath, [DRIVER, "Interrupt"], {
      input: JSON.stringify({ session_id: SESSION, cwd: folder }),
      encoding: "utf8",
      env: envOf(folder),
    });
    assert.equal(unknown.status, 0);
    assert.equal(unknown.stdout, "");
  } finally {
    done();
  }
});

test("the driver waits for input the host writes after starting it", async () => {
  const { work, folder, home, done } = setUp({ store: false });
  try {
    // A host may start the hook before writing its input; a synchronous read of the empty pipe failed with EAGAIN,
    // and the driver answered nothing.
    const child = spawn(process.execPath, [DRIVER, "UserPromptSubmit"], { cwd: work, env: envOf(folder) });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    const exited = new Promise((resolve) => child.on("close", resolve));
    await new Promise((resolve) => setTimeout(resolve, 300));
    child.stdin.end(JSON.stringify(recorded("UserPromptSubmit", { session: SESSION, cwd: work })));
    assert.equal(await exited, 0);
    assert.equal(stdout, "");
    assert.equal(JSON.parse(readFileSync(join(home, "sessions", SESSION, "codex.json"), "utf8")).turn, 1);
  } finally {
    done();
  }
});

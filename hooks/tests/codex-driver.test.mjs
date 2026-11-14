import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import CONFORMANCE from "../codex/conformance.mjs";
import {
  claims,
  codexWindow,
  EVENTS,
  noticePoint,
  restoreWindow,
  scriptEnvironment,
  toolPaths,
} from "../codex/driver.mjs";
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
      PostToolUse: null,
    };
    // The notice waiting reaches the model at the next tool call.
    hook("PostModelRequest", usage(210_000));
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
    // Below the notice point (204,000 of gpt-5-codex's 272,000-token window): nothing, at any share.
    hook("PostModelRequest", usage(100_000));
    assert.equal(hook("PostToolUse"), null);
    hook("PostModelRequest", usage(140_000));
    assert.equal(hook("PostToolUse"), null, "no row at 51%: the notice is the only signal");
    hook("PostModelRequest", usage(150_000));
    assert.equal(hook("UserPromptSubmit"), null);
    // Past the notice point: the notice, naming the task, at the next prompt; then nothing more this cycle.
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
    // After Codex compacts, a new cycle: its notice again, and nothing before it.
    hook("SessionStart", { source: "compact" });
    assert.equal(JSON.parse(readFileSync(sessionFile("cycle.json"), "utf8")).cycle, 2);
    hook("PostModelRequest", usage(140_000));
    assert.equal(hook("PostToolUse"), null);
    hook("PostModelRequest", usage(210_000));
    assert.match(contextOf(hook("UserPromptSubmit")), /^Freeflow, context cycle 2: compaction is near/);
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

// The gates (SPEC-008 4.3, SPEC-012 4.2): PreToolUse decides each call with gates5.decide from the session's gate
// state. Codex's own parser (codex-rs/hooks/src/engine/output_parser.rs at 079e17a4) refuses a PreToolUse output with
// permissionDecision ask, allow without updatedInput, or deny without a reason; additionalContext alone is read.

const PATCH = "*** Begin Patch\n*** Update File: src/app.js\n@@\n-a\n+b\n*** End Patch\n";
const patchCall = (id = "call_p", fields = {}) => ({
  tool_name: "apply_patch",
  tool_use_id: id,
  tool_input: { command: PATCH },
  ...fields,
});
const shellCall = (command, id = "call_s", fields = {}) => ({
  tool_name: "Bash",
  tool_use_id: id,
  tool_input: { command },
  ...fields,
});
const reasonOf = (output) => output?.hookSpecificOutput?.permissionDecisionReason;

/** The PreToolUse output's keys are its schema's, and Codex's parser would apply it, not report it invalid. */
function codexReads(output) {
  const schema = JSON.parse(readFileSync(join(FIXTURES, OUTPUT_SCHEMAS.PreToolUse), "utf8"));
  for (const key of Object.keys(output)) assert.ok(key in schema.properties, key);
  const wire = schema.definitions.PreToolUseHookSpecificOutputWire.properties;
  const specific = output.hookSpecificOutput;
  for (const key of Object.keys(specific)) assert.ok(key in wire, key);
  assert.equal(specific.hookEventName, "PreToolUse");
  if ("permissionDecision" in specific) {
    assert.equal(specific.permissionDecision, "deny", "Codex refuses ask, and allow without updatedInput");
    assert.ok(specific.permissionDecisionReason.trim(), "a deny needs a reason");
  } else assert.equal(typeof specific.additionalContext, "string");
}

test(CONFORMANCE.block, () => {
  const { hook, log, sessionFile, done } = setUp({
    config: { gates: { agreement: "block", slice: "block", delivery: "block" } },
  });
  try {
    hook("SessionStart");
    hook("UserPromptSubmit");
    // The task is held with no agreement and no Slice: a patch is refused, each refusing gate's text the reason.
    const refused = hook("PreToolUse", patchCall());
    codexReads(refused);
    assert.match(
      reasonOf(refused),
      /^Freeflow gate \(block, agreement\): apply_patch on src\/app\.js before an agreement in widget\/task-001\.\nWhy: /,
    );
    assert.match(
      reasonOf(refused),
      /\n\nFreeflow gate \(block, slice\): apply_patch on src\/app\.js with no open Slice/,
    );
    assert.doesNotMatch(reasonOf(refused), /only warns/);
    // Every call that a gate fires on is refused, not only a turn's first.
    assert.equal(hook("PreToolUse", patchCall("call_p2")).hookSpecificOutput.permissionDecision, "deny");
    // A delivery step is refused too: Codex has no ask (P4).
    const push = hook("PreToolUse", shellCall("git status && git push origin main"));
    codexReads(push);
    assert.match(reasonOf(push), /Freeflow gate \(block, delivery\): git push is a delivery step\./);
    // A read, a test run and a tool the gates do not judge run.
    assert.equal(hook("PreToolUse", shellCall("git status")), null);
    assert.equal(hook("PreToolUse", shellCall("npm test")), null);
    assert.equal(hook("PreToolUse", { tool_name: "mcp__docs__write", tool_input: {} }), null);
    // No gate state: the gates that need it fail closed (SPEC-008 section 5).
    rmSync(sessionFile("gates.json"), { force: true });
    assert.match(reasonOf(hook("PreToolUse", patchCall("call_p3"))), /cannot read its gate state/);
    // Each refusal is a gate line, decision block, valid in schema v1.
    hook("Stop");
    const lines = log().filter((line) => line.kind === "gate");
    for (const line of lines) assert.equal(lineProblem(line), null, JSON.stringify(line));
    assert.deepEqual(
      lines.map(({ gate, decision }) => `${gate} ${decision}`),
      [
        "agreement block",
        "slice block",
        "agreement block",
        "slice block",
        "agreement block",
        "slice block",
        "delivery block",
        "agreement block",
        "slice block",
      ],
    );
  } finally {
    done();
  }
});

test("the gates warn by default: the call runs, the row reaches the model once per gate per turn, and each would-fire is a gate line", () => {
  const { hook, log, cli, done } = setUp();
  try {
    hook("SessionStart");
    hook("UserPromptSubmit");
    // A patch with no agreement and no Slice: no decision (the call runs), and both rows as additionalContext.
    const first = hook("PreToolUse", patchCall());
    codexReads(first);
    assert.equal(first.hookSpecificOutput.permissionDecision, undefined);
    const rows = contextOf(first);
    assert.match(rows, /^Freeflow gate \(warn, agreement\): apply_patch on src\/app\.js before an agreement/);
    assert.match(rows, /\n\nFreeflow gate \(warn, slice\): apply_patch on src\/app\.js with no open Slice/);
    assert.match(rows, /This gate only warns for now\.$/);
    // The same gates in the same turn: no row again, though each would-fire is logged.
    assert.equal(hook("PreToolUse", patchCall("call_p2")), null);
    // A push is a change too (agreement and Slice, already warned this turn) and a delivery step, not yet warned: its
    // row only.
    assert.match(
      contextOf(hook("PreToolUse", shellCall("git push"))),
      /^Freeflow gate \(warn, delivery\): git push is a delivery step\.\nWhy: .+\nWay through: .+ This gate only warns for now\.$/,
    );
    // A subagent's call is its own loop: its rows come once in its turn.
    assert.match(contextOf(hook("PreToolUse", patchCall("call_a", { agent_id: "agent-1" }))), /\(warn, agreement\)/);
    assert.equal(hook("PreToolUse", patchCall("call_a2", { agent_id: "agent-1" })), null);
    // The next turn warns again.
    hook("UserPromptSubmit", { turn_id: "turn-2" });
    assert.match(contextOf(hook("PreToolUse", patchCall("call_p3", { turn_id: "turn-2" }))), /\(warn, agreement\)/);
    // An agreement and a Slice opened through Track Work's script: the next patch passes every gate.
    cli(["agreement", "open", "--record", "widget/task-001", "--title", "Demo", "--input", "-"], {
      input: "- Build the demo.\n",
    });
    cli(
      [
        "slice",
        "start-direct",
        "--record",
        "widget/task-001",
        "--title",
        "Build",
        "--next-action",
        "Build.",
        "--input",
        "-",
      ],
      {
        input:
          "- Result wanted: r.\n- Under: A-001.\n- Scope: s.\n- Done when: d.\n- Stop if: x.\n- Started from: y.\n",
      },
    );
    assert.equal(hook("PreToolUse", patchCall("call_p4", { turn_id: "turn-3" })), null);
    hook("Stop");
    const gates = log().filter((line) => line.kind === "gate");
    for (const line of gates) assert.equal(lineProblem(line), null, JSON.stringify(line));
    assert.deepEqual(
      gates.map(({ agent, gate, decision, tool }) => [agent, gate, decision, tool]),
      [
        ["main", "agreement", "warn", "apply_patch"],
        ["main", "slice", "warn", "apply_patch"],
        ["main", "agreement", "warn", "apply_patch"],
        ["main", "slice", "warn", "apply_patch"],
        ["main", "agreement", "warn", "Bash"],
        ["main", "slice", "warn", "Bash"],
        ["main", "delivery", "warn", "Bash"],
        ["agent-1", "agreement", "warn", "apply_patch"],
        ["agent-1", "slice", "warn", "apply_patch"],
        ["agent-1", "agreement", "warn", "apply_patch"],
        ["agent-1", "slice", "warn", "apply_patch"],
        ["main", "agreement", "warn", "apply_patch"],
        ["main", "slice", "warn", "apply_patch"],
      ],
    );
    assert.match(cli(["events", "summary"]), /Gates: agreement 6, slice 6, delivery 1, delegation 0 would-fire/);
  } finally {
    done();
  }
});

test("the gates fail open under warn and closed under block: no gate state, and an error deciding", () => {
  // Under warn: no gate state is quiet and said once a session; an error deciding lets the call run.
  const warn = setUp();
  try {
    warn.hook("SessionStart");
    rmSync(warn.sessionFile("gates.json"), { force: true });
    assert.equal(warn.hook("PreToolUse", patchCall()), null);
    assert.equal(warn.hook("PreToolUse", patchCall("call_p2")), null);
    writeFileSync(warn.sessionFile("gates.json"), "{ not json");
    assert.equal(warn.hook("PreToolUse", patchCall("call_p3")), null);
    warn.hook("Stop");
    const said = warn.log().filter((line) => line.kind === "freeflow" && line.what === "gates");
    assert.equal(said.length, 1);
    assert.equal(said[0].detail, "no gate state for this session");
    assert.equal(lineProblem(said[0]), null);
    // The buffer cannot take the gate line: the error is caught and the call runs.
    warn.cli(["session", "status"]);
    rmSync(warn.sessionFile("events-buffer.jsonl"), { force: true });
    mkdirSync(warn.sessionFile("events-buffer.jsonl"));
    assert.equal(warn.hook("PreToolUse", patchCall("call_p4")), null);
  } finally {
    warn.done();
  }
  // Under block: no gate state refuses the call with the way to make one; an error deciding refuses it too.
  const block = setUp({ config: { gates: { agreement: "block" } } });
  try {
    block.hook("SessionStart");
    rmSync(block.sessionFile("gates.json"), { force: true });
    const missing = block.hook("PreToolUse", patchCall());
    codexReads(missing);
    assert.equal(
      reasonOf(missing),
      "Freeflow gate (block, agreement): Freeflow cannot read its gate state; run `task here` or `agree`, then go on.",
    );
    // The slice gate still warns, and a warn gate needs no state: nothing more is refused.
    assert.equal(block.hook("PreToolUse", shellCall("git status")), null);
    block.cli(["session", "status"]);
    rmSync(block.sessionFile("events-buffer.jsonl"), { force: true });
    mkdirSync(block.sessionFile("events-buffer.jsonl"));
    const failed = block.hook("PreToolUse", patchCall("call_p2"));
    codexReads(failed);
    assert.equal(reasonOf(failed), "Freeflow's gates could not decide this call; try again.");
  } finally {
    block.done();
  }
});

test("each conformance test names a yes claim of the driver, and every yes claim has one (SPEC-006 4.7)", () => {
  const yes = Object.entries(claims(true))
    .filter(([, claim]) => claim.claim === "yes")
    .map(([request]) => request);
  assert.deepEqual(Object.keys(CONFORMANCE).sort(), yes.sort());
  const source = readFileSync(resolve("hooks/tests/codex-driver.test.mjs"), "utf8");
  for (const request of yes) assert.ok(source.includes(`test(CONFORMANCE.${request},`), request);
  // The rest say so: block is yes with Part 5's gates; compact and the others no.
  assert.equal(claims(true).block.claim, "yes");
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
    assert.match(run.stdout, /\n {2}block +yes +PreToolUse denies a gate's call under block/);
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

test("with the event log off, the menu and the notice still come and no line is kept", () => {
  const { hook, sessionFile, log, done } = setUp({ config: { events: { enabled: false } } });
  try {
    assert.match(contextOf(hook("SessionStart")), /Freeflow task memory:/);
    assert.equal(JSON.parse(readFileSync(sessionFile("capabilities.json"), "utf8")).claims.sensors.claim, "possible");
    hook("PostModelRequest", usage(210_000));
    assert.match(contextOf(hook("PostToolUse")), /context cycle 1: compaction is near/);
    hook("Stop");
    assert.deepEqual(log(), []);
  } finally {
    done();
  }
});

test("without a store: the guidance and what is missing, the event log still kept, no notice", () => {
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
    // 75% of the window where Codex's limit is not known; else a lead of 20,000 tokens before the limit, under the
    // ceiling (notice5.mjs).
    assert.equal(noticePoint(400_000, null), 300_000);
    assert.equal(noticePoint(400_000, 250_000), 230_000);
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

test("a script run after the session start gets the host's notice point: the state's limit is restored with its window (review N4)", () => {
  // The state of a session whose model compacts at 250,000 tokens of a 272,000 window: an event after the session start
  // restores both, and the script run it makes gets the point 230,000 (250,000 less the lead), not the unknown-host 204,000.
  const ctx = { session: "thr_n4", home: "/tmp/none", state: { window: 272_000, limit: 250_000 } };
  restoreWindow(ctx);
  assert.equal(ctx.limit, 250_000);
  assert.equal(scriptEnvironment(ctx, {}).FREEFLOW_NOTICE_POINT, "230000");
  // With no limit in the state, the unknown-host point applies.
  const plain = { session: "thr_n4", home: "/tmp/none", state: { window: 272_000, limit: null } };
  restoreWindow(plain);
  assert.equal(scriptEnvironment(plain, {}).FREEFLOW_NOTICE_POINT, "204000");
});

import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { removeWritableTree } from "../../../skills/evaluate-skill/scripts/lib/materialize.mjs";
import {
  CODEX_ADAPTER_VERSION,
  CODEX_ISOLATION_PROFILE,
  buildCodexInvocation,
  compactCodexJsonLine,
  parseCodexJsonl,
  redactedCodexInvocation,
  runCodexSubject,
} from "../../../skills/evaluate-skill/scripts/lib/codex-adapter.mjs";

function successfulRecords() {
  return [
    { type: "thread.started", thread_id: "thread-1" },
    { type: "turn.started" },
    { type: "item.completed", item: { id: "reason-1", type: "reasoning", text: "hidden summary" } },
    {
      type: "item.started",
      item: {
        id: "tool-1",
        type: "command_execution",
        command: "printf ok",
        aggregated_output: "",
        exit_code: null,
        status: "in_progress",
      },
    },
    {
      type: "item.completed",
      item: {
        id: "tool-1",
        type: "command_execution",
        command: "printf ok",
        aggregated_output: "ok",
        exit_code: 0,
        status: "completed",
      },
    },
    { type: "item.completed", item: { id: "message-1", type: "agent_message", text: "done" } },
    {
      type: "turn.completed",
      usage: { input_tokens: 20, cached_input_tokens: 5, output_tokens: 7, reasoning_output_tokens: 3 },
    },
  ];
}

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-codex-adapter-"));
  t.after(() => removeWritableTree(root));
  const workspace = resolve(root, "workspace");
  const snapshot = resolve(root, "snapshot");
  const configDir = resolve(root, "config");
  const authPath = resolve(root, "auth.json");
  await Promise.all([mkdir(workspace), mkdir(snapshot)]);
  await writeFile(resolve(snapshot, "SKILL.md"), "---\nname: sample-skill\ndescription: Sample.\n---\n");
  await writeFile(authPath, "{}\n", { mode: 0o600 });
  return { root, workspace, snapshot, configDir, authPath };
}

test("Codex diagnostic adapter isolates config, filters reasoning, and preserves unavailable accounting", async (t) => {
  const { workspace, snapshot, configDir, authPath } = await fixture(t);
  let observed = null;
  const subject = await runCodexSubject({
    prompt: "Inspect the fixture.",
    provider: "openai",
    model: "gpt-test",
    thinking: "high",
    tools: ["read", "write"],
    skillName: "sample-skill",
    skillSnapshot: snapshot,
    workspace,
    configDir,
    authPath,
    timeoutMs: 1000,
    outputLimitBytes: 1048576,
    transportLimitBytes: 2097152,
    startProcess: async (command, args, options) => {
      const config = await readFile(resolve(options.env.CODEX_HOME, "config.toml"), "utf8");
      const skills = await readdir(resolve(options.env.CODEX_HOME, "skills"));
      const authMode = (await stat(resolve(options.env.CODEX_HOME, "auth.json"))).mode & 0o777;
      observed = { command, args, options, config, skills, authMode };
      const lines = successfulRecords()
        .map((record) => options.stdoutLineTransform(JSON.stringify(record), { terminated: true }))
        .filter((line) => line !== null);
      return {
        code: 0,
        signal: null,
        timed_out: false,
        output_limit_exceeded: false,
        transport_limit_exceeded: false,
        aborted: false,
        transport_bytes: 1000,
        retained_output_bytes: 500,
        stdout: `${lines.join("\n")}\n`,
        stderr: "",
      };
    },
  });
  assert.equal(CODEX_ADAPTER_VERSION, "codex-exec-diagnostic-v1");
  assert.equal(observed.command, "codex");
  assert.ok(observed.args.includes("--strict-config"));
  assert.ok(observed.args.includes("--ephemeral"));
  assert.ok(observed.args.includes("--ignore-rules"));
  assert.ok(observed.args.includes("--json"));
  assert.ok(observed.args.includes('model_provider="openai"'));
  assert.match(observed.args.at(-1), /^\$sample-skill/);
  assert.notEqual(observed.options.env.HOME, process.env.HOME);
  assert.match(observed.config, /project_doc_max_bytes = 0/);
  assert.match(observed.config, new RegExp(`default_permissions = "${CODEX_ISOLATION_PROFILE}"`));
  assert.match(observed.config, /enabled = false/);
  assert.deepEqual(observed.skills, ["sample-skill"]);
  assert.equal(observed.authMode, 0o600);
  await access(resolve(observed.options.env.CODEX_HOME, "skills", "sample-skill", "SKILL.md"));
  assert.equal(subject.process.protocol_failed, false);
  assert.equal(subject.parsed.final_text, "done");
  assert.equal(JSON.stringify(subject.parsed.events).includes("hidden summary"), false);
  assert.equal(subject.parsed.usage.total_tokens, 27);
  assert.equal(subject.parsed.usage.cost, null);
  assert.deepEqual(subject.runtime_counters, {
    provider_requests: null,
    turns_started: 1,
    tool_calls: 1,
    hard_turn_limit_reached: null,
  });
  assert.deepEqual(redactedCodexInvocation(subject.invocation).args.slice(-1), ["<explicit-skill-prompt>"]);
  assert.equal(JSON.stringify(redactedCodexInvocation(subject.invocation)).includes(workspace), false);
});

test("Codex JSONL parser fails closed on malformed or incomplete lifecycle evidence", () => {
  const malformed = parseCodexJsonl('{"type":\n');
  assert.ok(malformed.parse_errors.length > 0);
  const incomplete = parseCodexJsonl(`${JSON.stringify({ type: "thread.started", thread_id: "one" })}\n`);
  assert.match(
    incomplete.parse_errors.map((item) => item.error).join("\n"),
    /turn\.started|turn\.completed|final assistant/i,
  );
  assert.throws(
    () => compactCodexJsonLine(JSON.stringify({ type: "thread.started" }), { terminated: false }),
    /LF-terminated/,
  );
  assert.throws(() => compactCodexJsonLine("not-json", { terminated: true }), /Malformed Codex JSONL/);
});

test("Codex JSONL lifecycle must be ordered and terminal", () => {
  const outOfOrder =
    [
      {
        type: "turn.completed",
        usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
      },
      { type: "thread.started", thread_id: "thread" },
      { type: "turn.started" },
      { type: "item.completed", item: { id: "message", type: "agent_message", text: "late" } },
    ]
      .map((item) => JSON.stringify(item))
      .join("\n") + "\n";
  assert.match(
    parseCodexJsonl(outOfOrder)
      .parse_errors.map((item) => item.error)
      .join("\n"),
    /order|first|terminal/i,
  );

  const afterTerminal =
    [
      { type: "thread.started", thread_id: "thread" },
      { type: "turn.started" },
      {
        type: "turn.completed",
        usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
      },
      { type: "item.completed", item: { id: "message", type: "agent_message", text: "accepted after terminal" } },
    ]
      .map((item) => JSON.stringify(item))
      .join("\n") + "\n";
  const parsed = parseCodexJsonl(afterTerminal);
  assert.match(parsed.parse_errors.map((item) => item.error).join("\n"), /terminal|after/i);
  assert.notEqual(parsed.final_text, "accepted after terminal");
});

test("Codex adapter preserves timeout and independent output-limit failures", async (t) => {
  for (const failure of [
    { timed_out: true, output_limit_exceeded: false, transport_limit_exceeded: false },
    { timed_out: false, output_limit_exceeded: true, transport_limit_exceeded: false },
    { timed_out: false, output_limit_exceeded: false, transport_limit_exceeded: true },
  ]) {
    const { workspace, snapshot, configDir, authPath } = await fixture(t);
    const lines =
      successfulRecords()
        .filter((record) => record.item?.type !== "reasoning")
        .map((record) => JSON.stringify(record))
        .join("\n") + "\n";
    const subject = await runCodexSubject({
      prompt: "x",
      provider: "openai",
      model: "m",
      thinking: "high",
      tools: ["read", "write"],
      skillName: "sample-skill",
      skillSnapshot: snapshot,
      workspace,
      configDir,
      authPath,
      timeoutMs: 1000,
      outputLimitBytes: 1024,
      transportLimitBytes: 2048,
      startProcess: async () => ({
        code: failure.timed_out ? null : 0,
        signal: failure.timed_out ? "SIGKILL" : null,
        aborted: false,
        transport_bytes: 3000,
        retained_output_bytes: 1500,
        stdout: lines,
        stderr: "",
        ...failure,
      }),
    });
    assert.equal(subject.process.timed_out, failure.timed_out);
    assert.equal(subject.process.output_limit_exceeded, failure.output_limit_exceeded);
    assert.equal(subject.process.transport_limit_exceeded, failure.transport_limit_exceeded);
    assert.equal(subject.runtime_counters.provider_requests, null);
  }
});

test("Codex adapter rejects provider and tool-profile widening before auth access", async (t) => {
  const { workspace, snapshot, configDir } = await fixture(t);
  const missingAuth = resolve(configDir, "missing-auth.json");
  const base = {
    prompt: "x",
    model: "m",
    thinking: "high",
    skillName: "sample-skill",
    skillSnapshot: snapshot,
    workspace,
    configDir,
    authPath: missingAuth,
    timeoutMs: 1000,
    outputLimitBytes: 1024,
    transportLimitBytes: 2048,
    startProcess: async () => {
      throw new Error("must not start");
    },
  };
  await assert.rejects(
    runCodexSubject({ ...base, provider: "custom", tools: ["read", "write"] }),
    /provider must be openai/,
  );
  await assert.rejects(runCodexSubject({ ...base, provider: "openai", tools: ["read"] }), /exactly read, write/);
});

test("Codex invocation redaction removes workspace and natural prompt", () => {
  const invocation = buildCodexInvocation({
    workspace: "/private/workspace",
    model: "m",
    thinking: "high",
    skillName: "sample-skill",
    prompt: "secret prompt",
  });
  const redacted = redactedCodexInvocation(invocation);
  assert.equal(JSON.stringify(redacted).includes("/private/workspace"), false);
  assert.equal(JSON.stringify(redacted).includes("secret prompt"), false);
});

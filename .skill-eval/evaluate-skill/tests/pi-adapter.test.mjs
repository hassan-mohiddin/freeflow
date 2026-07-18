import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  buildPiInvocation,
  buildPiRpcInvocation,
  compactPiJsonLine,
  compactPiRpcRecord,
  parsePiJsonEvents,
  prepareIsolatedPiConfig,
  redactedInvocation,
  runPiRpcSubject,
} from "../../../skills/evaluate-skill/scripts/lib/pi-adapter.mjs";

test("Pi invocation disables ambient resources and loads only explicit skill and guard", () => {
  const invocation = buildPiInvocation({
    prompt: "natural prompt",
    provider: "provider",
    model: "model",
    thinking: "low",
    tools: ["read", "write"],
    skillSnapshot: "/tmp/snapshot",
  });
  for (const flag of [
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--offline",
  ]) {
    assert.ok(invocation.args.includes(flag), flag);
  }
  assert.equal(invocation.args.at(-1), "natural prompt");
  assert.equal(invocation.args.includes("--"), false);
  const redacted = redactedInvocation(invocation);
  assert.equal(redacted.args.at(-1), "<natural-prompt>");
  assert.equal(redacted.args[redacted.args.indexOf("--skill") + 1], "<skill>");
});

test("Pi RPC invocation keeps lifecycle internal and loads only explicit resources", () => {
  const invocation = buildPiRpcInvocation({
    provider: "provider",
    model: "model",
    thinking: "high",
    tools: ["read", "write"],
    skillSnapshot: "/tmp/snapshot",
  });
  assert.deepEqual(invocation.args.slice(0, 2), ["--mode", "rpc"]);
  for (const flag of [
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--offline",
    "--extension",
    "--skill",
  ]) {
    assert.ok(invocation.args.includes(flag), flag);
  }
  assert.equal(invocation.args.includes("--print"), false);
  assert.equal(invocation.args.includes("prompt"), false);
  const redacted = redactedInvocation(invocation);
  assert.equal(redacted.args[redacted.args.indexOf("--skill") + 1], "<skill>");
  assert.equal(redacted.args.at(-1), "<skill>");
});

test("Pi composition invocation loads ordered explicit skills and one declared runtime extension", () => {
  const invocation = buildPiRpcInvocation({
    provider: "provider",
    model: "model",
    thinking: "high",
    tools: ["read"],
    skillSnapshots: [
      { name: "execute-plan", path: "/tmp/execute-plan" },
      { name: "design-for-depth", path: "/tmp/design-for-depth" },
    ],
    runtimeExtension: "/tmp/freeflow-runtime.mjs",
  });
  const skillPaths = invocation.args.flatMap((value, index) =>
    value === "--skill" ? [invocation.args[index + 1]] : [],
  );
  const extensionPaths = invocation.args.flatMap((value, index) =>
    value === "--extension" ? [invocation.args[index + 1]] : [],
  );
  assert.deepEqual(skillPaths, ["/tmp/execute-plan", "/tmp/design-for-depth"]);
  assert.equal(extensionPaths.length, 2);
  assert.equal(extensionPaths[1], "/tmp/freeflow-runtime.mjs");
  const redacted = redactedInvocation(invocation);
  assert.deepEqual(
    redacted.args.flatMap((value, index) => (value === "--skill" ? [redacted.args[index + 1]] : [])),
    ["<skill>", "<skill>"],
  );
  assert.deepEqual(
    redacted.args.flatMap((value, index) => (value === "--extension" ? [redacted.args[index + 1]] : [])),
    ["<extension>", "<extension>"],
  );
});

test("Pi JSON parsing attributes reads to each declared skill", () => {
  const snapshots = [
    { name: "execute-plan", path: "/tmp/execute-plan" },
    { name: "design-for-depth", path: "/tmp/design-for-depth" },
  ];
  const raw = [
    JSON.stringify({
      type: "tool_execution_start",
      toolCallId: "a",
      toolName: "read",
      args: { path: "/tmp/execute-plan/SKILL.md" },
    }),
    JSON.stringify({
      type: "tool_execution_start",
      toolCallId: "b",
      toolName: "read",
      args: { path: "/tmp/design-for-depth/SKILL.md" },
    }),
    JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }] } }),
  ].join("\n");
  const parsed = parsePiJsonEvents(raw, { skillSnapshots: snapshots });
  assert.deepEqual(parsed.skill_reads, { "execute-plan": true, "design-for-depth": true });
  assert.equal(parsed.skill_read, true);
});

test("isolated Pi config disables automatic retries", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-pi-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await prepareIsolatedPiConfig(root, { PI_CODING_AGENT_DIR: resolve(root, "missing-source") });
  const settings = JSON.parse(await readFile(resolve(root, "settings.json"), "utf8"));
  assert.equal(settings.retry.enabled, false);
  assert.equal(settings.retry.maxRetries, 0);
  assert.equal(settings.retry.provider.maxRetries, 0);
});

test("Pi JSON compaction removes cumulative update snapshots but preserves deltas", () => {
  const cumulative = "x".repeat(10000);
  const line = JSON.stringify({
    type: "message_update",
    message: { role: "assistant", content: [{ type: "thinking", thinking: cumulative }] },
    assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "next", partial: cumulative },
  });
  const compacted = compactPiJsonLine(line);
  assert.ok(Buffer.byteLength(compacted) < 500);
  assert.equal(compacted.includes(cumulative), false);
  assert.deepEqual(JSON.parse(compacted), {
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "next" },
  });
  assert.equal(compactPiJsonLine("not-json"), "not-json");
  const final = JSON.stringify({
    type: "message_end",
    message: { role: "assistant", content: [{ type: "text", text: "final" }] },
  });
  assert.equal(compactPiJsonLine(final), final);
});

test("Pi RPC compaction removes cumulative update snapshots", () => {
  const cumulative = "x".repeat(10000);
  const compacted = compactPiRpcRecord({
    type: "message_update",
    message: { role: "assistant", content: [{ type: "thinking", thinking: cumulative }] },
    assistantMessageEvent: { type: "thinking_delta", delta: "next", partial: cumulative },
  });
  assert.deepEqual(compacted, { type: "message_update", assistantMessageEvent: { type: "thinking_delta" } });
  assert.equal(JSON.stringify(compacted).includes("next"), false);
  const ended = compactPiRpcRecord({
    type: "message_end",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "hidden" },
        { type: "text", text: "visible" },
      ],
    },
  });
  assert.deepEqual(ended.message.content, [{ type: "text", text: "visible" }]);
});

test("Pi RPC subject captures fixed turns, usage deltas, counters, and canonical entries", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-pi-rpc-subject-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const snapshot = resolve(root, "snapshot");
  const secondSnapshot = resolve(root, "second-snapshot");
  const workspace = resolve(root, "workspace");
  const configDir = resolve(root, "config");
  await Promise.all([mkdir(snapshot), mkdir(secondSnapshot), mkdir(workspace)]);
  await writeFile(resolve(snapshot, "SKILL.md"), "skill");
  await writeFile(resolve(secondSnapshot, "SKILL.md"), "second skill");

  let turn = 0;
  const records = [];
  const fakeClient = {
    records,
    async request(type, fields = {}) {
      if (type === "set_auto_retry" || type === "set_auto_compaction")
        return { type: "response", id: type, command: type, success: true };
      if (type === "get_state")
        return {
          type: "response",
          id: type,
          command: type,
          success: true,
          data: { isStreaming: false, isCompacting: false, messageCount: turn * 2, pendingMessageCount: 0 },
        };
      if (type === "get_entries")
        return {
          type: "response",
          id: type,
          command: type,
          success: true,
          data: {
            entries: [
              {
                type: "message",
                id: `a${turn}`,
                message: {
                  role: "assistant",
                  content: [
                    { type: "thinking", thinking: "hidden" },
                    { type: "text", text: `answer-${turn}` },
                  ],
                },
              },
            ],
            leafId: `leaf-${turn}`,
          },
        };
      if (type === "get_last_assistant_text")
        return { type: "response", id: type, command: type, success: true, data: { text: `answer-${turn}` } };
      if (type === "get_session_stats")
        return {
          type: "response",
          id: type,
          command: type,
          success: true,
          data: {
            tokens: { input: turn * 10, output: turn * 5, cacheRead: turn, cacheWrite: 0, total: turn * 16 },
            cost: turn * 0.01,
          },
        };
      throw new Error(`Unexpected request ${type} ${JSON.stringify(fields)}`);
    },
    async promptAndSettle({ turnId }) {
      turn += 1;
      const event = {
        type: "tool_execution_start",
        toolCallId: `tool-${turn}`,
        toolName: "read",
        args: { path: resolve(turn === 1 ? snapshot : secondSnapshot, "SKILL.md") },
      };
      const started = { type: "turn_start" };
      records.push(started, event);
      return {
        turn_id: turnId,
        response: { type: "response", id: `prompt-${turn}`, command: "prompt", success: true },
        events: [started, event, { type: "agent_settled" }],
      };
    },
    async dispose() {
      return {
        code: 0,
        signal: null,
        timed_out: false,
        output_limit_exceeded: false,
        transport_limit_exceeded: false,
        protocol_failed: false,
        aborted: false,
        transport_bytes: 1000,
        retained_output_bytes: 500,
        stdout: "",
        stderr: "",
        duration_ms: 20,
        failure: null,
      };
    },
  };
  const captured = [];
  const subject = await runPiRpcSubject({
    turns: [
      { id: "turn-1", prompt: "remember" },
      { id: "turn-2", prompt: "recall" },
    ],
    provider: "provider",
    model: "model",
    thinking: "high",
    tools: ["read"],
    skillSnapshots: [
      { name: "first", path: snapshot },
      { name: "second", path: secondSnapshot },
    ],
    workspace,
    configDir,
    readRoots: [workspace, snapshot, secondSnapshot],
    writeRoots: [workspace],
    timeoutMs: 1000,
    outputLimitBytes: 65536,
    transportLimitBytes: 131072,
    maxTurns: 8,
    startClient: async () => fakeClient,
    onTurnSettled: async (evidence) => {
      captured.push(evidence.id);
      return { marker: evidence.id };
    },
  });
  assert.deepEqual(captured, ["turn-1", "turn-2"]);
  assert.equal(subject.parsed.turns.length, 2);
  assert.equal(
    subject.parsed.turns[0].entries[0].message.content.some((part) => part.type === "thinking"),
    false,
  );
  assert.equal(subject.parsed.turns[1].usage_delta.input, 10);
  assert.equal(subject.parsed.turns[1].runtime_counter_delta.provider_requests, 1);
  assert.deepEqual(subject.parsed.turns[1].workspace, { marker: "turn-2" });
  assert.match(subject.parsed.turns[0].prompt_sha256, /^[a-f0-9]{64}$/);
  assert.equal(subject.parsed.final_text, "answer-2");
  assert.equal(subject.parsed.usage.cost.total_usd, 0.02);
  assert.equal(subject.parsed.skill_read, true);
  assert.deepEqual(subject.parsed.turns[0].skill_reads, { first: true, second: false });
  assert.deepEqual(subject.parsed.turns[1].skill_reads, { first: false, second: true });
  assert.deepEqual(subject.parsed.skill_reads, { first: true, second: true });
  assert.equal(subject.runtime_counters.provider_requests, 2);
  assert.deepEqual(subject.parsed.parse_errors, []);
});

test("Pi RPC stops before a later scripted prompt after a known spend boundary", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-pi-rpc-spend-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = resolve(root, "workspace");
  const configDir = resolve(root, "config");
  await mkdir(workspace);
  let prompts = 0;
  const records = [];
  const fakeClient = {
    records,
    async request(type) {
      if (type === "set_auto_retry" || type === "set_auto_compaction") return { success: true };
      if (type === "get_state")
        return {
          success: true,
          data: { isStreaming: false, isCompacting: false, messageCount: prompts * 2, pendingMessageCount: 0 },
        };
      if (type === "get_entries") return { success: true, data: { entries: [], leafId: `leaf-${prompts}` } };
      if (type === "get_last_assistant_text") return { success: true, data: { text: "done" } };
      if (type === "get_session_stats")
        return {
          success: true,
          data: { tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 }, cost: 1 },
        };
      throw new Error(type);
    },
    async promptAndSettle({ turnId }) {
      prompts += 1;
      records.push({ type: "turn_start" });
      return {
        turn_id: turnId,
        response: { success: true },
        events: [{ type: "turn_start" }, { type: "agent_settled" }],
      };
    },
    async dispose() {
      return {
        code: 0,
        signal: null,
        timed_out: false,
        output_limit_exceeded: false,
        transport_limit_exceeded: false,
        protocol_failed: false,
        aborted: false,
        transport_bytes: 10,
        retained_output_bytes: 10,
        stdout: "",
        stderr: "",
        failure: null,
      };
    },
  };
  const subject = await runPiRpcSubject({
    turns: [
      { id: "turn-1", prompt: "one" },
      { id: "turn-2", prompt: "two" },
    ],
    provider: "p",
    model: "m",
    thinking: "high",
    tools: [],
    skillSnapshot: null,
    workspace,
    configDir,
    readRoots: [workspace],
    writeRoots: [workspace],
    timeoutMs: 1000,
    outputLimitBytes: 8192,
    transportLimitBytes: 16384,
    maxTurns: 8,
    maxUsd: 1,
    startClient: async () => fakeClient,
  });
  assert.equal(prompts, 1);
  assert.match(subject.parsed.parse_errors[0].error, /spend ceiling reached before turn-2/);
  assert.equal(subject.parsed.usage.cost.total_usd, 1);
  assert.equal(subject.runtime_counters.provider_requests, 1);
});

test("Pi RPC canonical transcript limit stops before a later scripted prompt", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-pi-rpc-canonical-limit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = resolve(root, "workspace");
  const configDir = resolve(root, "config");
  await mkdir(workspace);
  const records = [];
  const fakeClient = {
    records,
    async request(type) {
      if (type === "set_auto_retry" || type === "set_auto_compaction") return { success: true };
      if (type === "get_state")
        return {
          success: true,
          data: { isStreaming: false, isCompacting: false, messageCount: records.length, pendingMessageCount: 0 },
        };
      if (type === "get_entries")
        return {
          success: true,
          data: {
            entries: [
              {
                id: "entry",
                type: "message",
                message: { role: "assistant", content: [{ type: "text", text: "x".repeat(5000) }] },
              },
            ],
            leafId: "leaf",
          },
        };
      if (type === "get_last_assistant_text") return { success: true, data: { text: "done" } };
      if (type === "get_session_stats")
        return {
          success: true,
          data: { tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 }, cost: 0.1 },
        };
      throw new Error(type);
    },
    async promptAndSettle({ turnId }) {
      records.push({ type: "turn_start" });
      return {
        turn_id: turnId,
        response: { success: true },
        events: [{ type: "turn_start" }, { type: "agent_settled" }],
      };
    },
    async dispose() {
      return {
        code: 0,
        signal: null,
        timed_out: false,
        output_limit_exceeded: false,
        transport_limit_exceeded: false,
        protocol_failed: false,
        aborted: false,
        transport_bytes: 100,
        retained_output_bytes: 100,
        stdout: "",
        stderr: "",
        failure: null,
      };
    },
  };
  const subject = await runPiRpcSubject({
    turns: [
      { id: "turn-1", prompt: "one" },
      { id: "turn-2", prompt: "two" },
    ],
    provider: "p",
    model: "m",
    thinking: "high",
    tools: [],
    skillSnapshot: null,
    workspace,
    configDir,
    readRoots: [workspace],
    writeRoots: [workspace],
    timeoutMs: 1000,
    outputLimitBytes: 1024,
    transportLimitBytes: 8192,
    maxTurns: 8,
    maxUsd: 2,
    startClient: async () => fakeClient,
  });
  assert.equal(subject.process.output_limit_exceeded, true);
  assert.ok(subject.process.retained_output_bytes > 1024);
  assert.match(subject.parsed.parse_errors[0].error, /canonical retained evidence exceeded/);
  assert.equal(subject.parsed.usage.cost.total_usd, 0.1);
  assert.equal(subject.runtime_counters.provider_requests, 1);
  assert.equal(records.filter((record) => record.type === "turn_start").length, 1);
  assert.deepEqual(
    subject.parsed.turns.map((turn) => turn.id),
    ["turn-1"],
  );
});

test("Pi JSON parser captures final response, usage, cost, and skill read", () => {
  const snapshot = resolve("/tmp/snapshot");
  const lines = [
    { type: "session", version: 3, id: "x", cwd: "/tmp" },
    { type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: { path: resolve(snapshot, "SKILL.md") } },
    {
      type: "message_end",
      message: {
        id: "a1",
        role: "assistant",
        content: [{ type: "text", text: "first" }],
        usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0, totalTokens: 17, cost: { total: 0.01 } },
      },
    },
    {
      type: "message_end",
      message: {
        id: "a2",
        role: "assistant",
        content: [{ type: "text", text: "final" }],
        usage: { input: 20, output: 7, cacheRead: 0, cacheWrite: 1, totalTokens: 28, cost: { total: 0.02 } },
      },
    },
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
  const parsed = parsePiJsonEvents(lines, { skillSnapshot: snapshot });
  assert.equal(parsed.final_text, "final");
  assert.equal(parsed.skill_read, true);
  assert.equal(parsed.usage.input, 30);
  assert.equal(parsed.usage.output, 12);
  assert.equal(parsed.usage.total_tokens, 45);
  assert.equal(parsed.usage.cost.total_usd, 0.03);
});

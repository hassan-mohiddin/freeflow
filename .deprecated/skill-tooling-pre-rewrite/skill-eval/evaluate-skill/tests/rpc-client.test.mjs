import test from "node:test";
import assert from "node:assert/strict";
import { startRpcClient } from "../../../skills/evaluate-skill/scripts/lib/rpc-client.mjs";

const fakeRpc = String.raw`
const { spawn } = require("node:child_process");
const scenario = process.argv[1];
let buffer = "";
let held = null;
function send(value, ending = "\n") { process.stdout.write(JSON.stringify(value) + ending); }
function handle(command) {
  if (scenario === "correlate") {
    if (held === null) { held = command; return; }
    send({ type: "response", id: command.id, command: command.type, success: true, data: { order: 2 } }, "\r\n");
    send({ type: "response", id: held.id, command: held.type, success: true, data: { order: 1, separators: "A\u2028B\u2029C" } });
    return;
  }
  if (scenario === "settle") {
    send({ type: "response", id: command.id, command: command.type, success: true });
    send({ type: "agent_end", messages: [], willRetry: false });
    setTimeout(() => send({ type: "agent_settled" }), 35);
    return;
  }
  if (scenario === "reject") {
    send({ type: "response", id: command.id, command: command.type, success: false, error: "rejected" });
    return;
  }
  if (scenario === "malformed") {
    process.stdout.write("not-json\n");
    return;
  }
  if (scenario === "trailing-malformed") {
    process.stdout.write("not-json");
    process.exit(0);
  }
  if (scenario === "trailing-valid") {
    process.stdout.write(JSON.stringify({ type: "response", id: command.id, command: command.type, success: true }));
    process.exit(0);
  }
  if (scenario === "compact-output") {
    send({ type: "response", id: command.id, command: command.type, success: true });
    for (let index = 0; index < 20; index += 1) send({ type: "message_update", message: { cumulative: "x".repeat(10000) }, index });
    send({ type: "agent_settled" });
    return;
  }
  if (scenario === "output-limit") {
    send({ type: "response", id: command.id, command: command.type, success: true, data: { value: "x".repeat(10000) } });
    return;
  }
  if (scenario === "transport-limit") {
    process.stdout.write(JSON.stringify({ type: "event", value: "x".repeat(10000) }));
    return;
  }
  if (scenario === "eof") {
    send({ type: "response", id: command.id, command: command.type, success: true });
    process.exit(0);
  }
  if (scenario === "unexpected") {
    send({ type: "response", id: command.id, command: command.type, success: true });
    send({ type: "auto_retry_start", attempt: 1 });
    return;
  }
  if (scenario === "tree-timeout") {
    const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    send({ type: "response", id: command.id, command: command.type, success: true, data: { grandchildPid: grandchild.pid } });
    return;
  }
  if (scenario === "timeout") return;
  if (scenario === "handshake") {
    send({ type: "response", id: command.id, command: command.type, success: true, data: { isStreaming: false } });
  }
}
process.stdin.on("data", chunk => {
  buffer += chunk.toString("utf8");
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    let line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.length > 0) handle(JSON.parse(line));
  }
});
`;

async function fakeClient(t, scenario, options = {}) {
  const client = await startRpcClient(process.execPath, ["-e", fakeRpc, scenario], {
    timeoutMs: 1000,
    outputLimitBytes: 1024 * 1024,
    transportLimitBytes: 2 * 1024 * 1024,
    ...options,
  });
  t.after(() => client.dispose());
  return client;
}

test("RPC client correlates out-of-order responses and uses LF-only framing", async (t) => {
  const client = await fakeClient(t, "correlate");
  const first = client.request("get_state");
  const second = client.request("get_commands");
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.data.order, 1);
  assert.equal(a.data.separators, "A\u2028B\u2029C");
  assert.equal(b.data.order, 2);
});

test("prompt waits for agent_settled rather than agent_end", async (t) => {
  const client = await fakeClient(t, "settle");
  const started = Date.now();
  const turn = await client.promptAndSettle({ turnId: "turn-1", message: "hello" });
  assert.ok(Date.now() - started >= 25);
  assert.equal(turn.turn_id, "turn-1");
  assert.equal(turn.response.success, true);
  assert.deepEqual(
    turn.events.map((event) => event.type),
    ["agent_end", "agent_settled"],
  );
});

test("rejected prompt fails without waiting for settlement", async (t) => {
  const client = await fakeClient(t, "reject");
  await assert.rejects(client.promptAndSettle({ turnId: "turn-1", message: "hello" }), /RPC prompt rejected: rejected/);
});

test("malformed JSONL is a protocol failure", async (t) => {
  const client = await fakeClient(t, "malformed");
  await assert.rejects(client.request("get_state"), /Malformed RPC JSONL/);
  const result = await client.dispose();
  assert.equal(result.protocol_failed, true);
});

test("every JSONL record requires an LF terminator at EOF", async (t) => {
  for (const scenario of ["trailing-malformed", "trailing-valid"]) {
    const client = await fakeClient(t, scenario);
    await assert.rejects(client.request("get_state"), /not LF-terminated/);
    const result = await client.dispose();
    assert.equal(result.protocol_failed, true);
  }
});

test("EOF before agent_settled fails the active turn", async (t) => {
  const client = await fakeClient(t, "eof");
  await assert.rejects(
    client.promptAndSettle({ turnId: "turn-1", message: "hello" }),
    /RPC process exited before agent_settled/,
  );
});

test("unexpected retry, compaction, queue, or extension UI events fail closed", async (t) => {
  const client = await fakeClient(t, "unexpected");
  await assert.rejects(
    client.promptAndSettle({ turnId: "turn-1", message: "hello" }),
    /Unexpected RPC event: auto_retry_start/,
  );
});

test("record transformation bounds retained evidence without hiding raw transport", async (t) => {
  const client = await fakeClient(t, "compact-output", {
    outputLimitBytes: 2048,
    transportLimitBytes: 512 * 1024,
    recordTransform: (record) =>
      record.type === "message_update" ? { type: record.type, index: record.index } : record,
  });
  await client.promptAndSettle({ turnId: "turn-1", message: "hello" });
  const result = await client.dispose();
  assert.equal(result.output_limit_exceeded, false);
  assert.equal(result.transport_limit_exceeded, false);
  assert.ok(result.transport_bytes > 100000);
  assert.ok(result.retained_output_bytes < 2048);
});

test("retained output and raw transport limits fail independently", async (t) => {
  const retained = await fakeClient(t, "output-limit", { outputLimitBytes: 512 });
  await assert.rejects(retained.request("get_state"), /RPC retained output limit exceeded/);
  const retainedResult = await retained.dispose();
  assert.equal(retainedResult.output_limit_exceeded, true);
  assert.equal(retainedResult.transport_limit_exceeded, false);

  const transport = await fakeClient(t, "transport-limit", { outputLimitBytes: 20000, transportLimitBytes: 512 });
  await assert.rejects(transport.request("get_state"), /RPC raw transport limit exceeded/);
  const transportResult = await transport.dispose();
  assert.equal(transportResult.output_limit_exceeded, false);
  assert.equal(transportResult.transport_limit_exceeded, true);
});

test("external abort terminates an unsettled RPC process", async (t) => {
  const controller = new AbortController();
  const client = await fakeClient(t, "timeout", { signal: controller.signal });
  const pending = client.request("get_state");
  controller.abort();
  await assert.rejects(pending, /RPC process aborted/);
  const result = await client.dispose();
  assert.equal(result.aborted, true);
});

test("timeout terminates the detached RPC process group", { skip: process.platform === "win32" }, async (t) => {
  const client = await fakeClient(t, "tree-timeout", { timeoutMs: 50 });
  const response = await client.request("get_state");
  const pid = response.data.grandchildPid;
  t.after(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const result = await client.dispose();
  assert.equal(result.timed_out, true);
  let alive = true;
  for (let index = 0; index < 20 && alive; index += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    if (alive) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(alive, false);
});

test("aggregate timeout terminates an unsettled RPC process", async (t) => {
  const client = await fakeClient(t, "timeout", { timeoutMs: 40 });
  await assert.rejects(client.request("get_state"), /RPC process timed out/);
  const result = await client.dispose();
  assert.equal(result.timed_out, true);
});

test("dispose closes stdin and returns settled process accounting", async (t) => {
  const client = await fakeClient(t, "handshake");
  const response = await client.request("get_state");
  assert.equal(response.data.isStreaming, false);
  const result = await client.dispose();
  assert.equal(result.code, 0);
  assert.equal(result.timed_out, false);
  assert.equal(result.protocol_failed, false);
  assert.ok(result.transport_bytes > 0);
  assert.ok(result.retained_output_bytes > 0);
});

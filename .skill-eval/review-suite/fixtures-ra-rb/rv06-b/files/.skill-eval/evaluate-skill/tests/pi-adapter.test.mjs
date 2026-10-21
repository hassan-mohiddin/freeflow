import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildPiInvocation, compactPiJsonLine, parsePiJsonEvents, prepareIsolatedPiConfig, redactedInvocation } from "../../../skills/evaluate-skill/scripts/lib/pi-adapter.mjs";

test("Pi invocation disables ambient resources and loads only explicit skill and guard", () => {
  const invocation = buildPiInvocation({
    prompt: "natural prompt",
    provider: "provider",
    model: "model",
    thinking: "low",
    tools: ["read", "write"],
    skillSnapshot: "/tmp/snapshot",
  });
  for (const flag of ["--no-session", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-approve", "--offline"]) {
    assert.ok(invocation.args.includes(flag), flag);
  }
  assert.equal(invocation.args.at(-1), "natural prompt");
  assert.equal(invocation.args.includes("--"), false);
  const redacted = redactedInvocation(invocation);
  assert.equal(redacted.args.at(-1), "<natural-prompt>");
  assert.equal(redacted.args[redacted.args.indexOf("--skill") + 1], "<skill>");
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
  const final = JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "final" }] } });
  assert.equal(compactPiJsonLine(final), final);
});

test("Pi JSON parser captures final response, usage, cost, and skill read", () => {
  const snapshot = resolve("/tmp/snapshot");
  const lines = [
    { type: "session", version: 3, id: "x", cwd: "/tmp" },
    { type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: { path: resolve(snapshot, "SKILL.md") } },
    { type: "message_end", message: { id: "a1", role: "assistant", content: [{ type: "text", text: "first" }], usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0, totalTokens: 17, cost: { total: 0.01 } } } },
    { type: "message_end", message: { id: "a2", role: "assistant", content: [{ type: "text", text: "final" }], usage: { input: 20, output: 7, cacheRead: 0, cacheWrite: 1, totalTokens: 28, cost: { total: 0.02 } } } },
  ].map((value) => JSON.stringify(value)).join("\n");
  const parsed = parsePiJsonEvents(lines, { skillSnapshot: snapshot });
  assert.equal(parsed.final_text, "final");
  assert.equal(parsed.skill_read, true);
  assert.equal(parsed.usage.input, 30);
  assert.equal(parsed.usage.output, 12);
  assert.equal(parsed.usage.total_tokens, 45);
  assert.equal(parsed.usage.cost.total_usd, 0.03);
});

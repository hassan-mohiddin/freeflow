import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { RoutingRuntime } from "../../dist/cognitive-routing-v2/runtime.js";
import { Sources } from "../../dist/session-sources/sources.js";
import { initialState } from "../../dist/cognitive-routing-v2/state.js";
import { prepareView, representationProblems } from "../../dist/cognitive-routing-v2/projection.js";
const call = (name, args) => [{ name, args }];
const latest = (m, name) =>
  m
    .getBranch()
    .filter((e) => e.message?.toolName === name)
    .at(-1)?.message.details;

for (const projection of [false, true])
  test(`report survives close and exact history inspection, projection ${projection}`, async () => {
    const report = "UNIQUE_SAVED_ANSWER_73925";
    let ref;
    const result = await fixture((n, body, manager) => {
      if (n === 1)
        return call("freeflow_delegate", { operation: "assign", contract: "Explain the requested definitions." });
      if (n === 2) return call("freeflow_return", { operation: "submit", report, outcome: "completed" });
      if (n === 3) {
        assert.ok(JSON.stringify(body).includes(report));
        return call("freeflow_unit", { operation: "close", outcome: "accepted", assessment: "Received the answer." });
      }
      if (n === 4) {
        assert.ok(JSON.stringify(body).includes(report), "closure must not erase the answer before it is relayed");
        return call("freeflow_unit", { operation: "inspect", view: "history", limit: 5 });
      }
      if (n === 5) {
        const r = latest(manager, "freeflow_unit");
        assert.equal(r.history.length, 1);
        assert.equal(r.history[0].reportAvailable, true);
        ref = r.history[0].ref;
        return call("freeflow_unit", { operation: "inspect", view: "detail", ref });
      }
      if (n === 6) {
        const r = latest(manager, "freeflow_unit");
        assert.equal(r.report, report);
        assert.equal(
          JSON.stringify(r).split("Explain the requested definitions.").length - 1,
          1,
          "detail metadata must not repeat the full contract",
        );
        assert.equal(r.historical, true);
        assert.equal(r.ref, ref);
      }
      return [];
    }, projection);
    assert.equal(result.state.assignments.size, 1, "recover existing work without another delegation");
    for (const context of result.contexts)
      assert.ok(
        !context.some((m) => m.customType === "freeflow-routing-communication" && m.content.includes(report)),
        "ordinary accepted occurrence must not acquire duplicate runtime injection",
      );
  });

test("visible assistant text crosses models exactly without transferring the whole signed message", async () => {
  let ref;
  const result = await fixture(
    (n, body, manager) => {
      if (n === 1)
        return call("freeflow_delegate", { operation: "assign", contract: "Explain and select the visible text." });
      if (n === 2) return call("freeflow_project", { operation: "inspect" });
      if (n === 3) {
        const source = manager
          .getBranch()
          .find((e) => e.message?.content?.some?.((b) => b.text === "VISIBLE_BEGIN_731"));
        ref = `ctx:${source.id}#text`;
        return call("freeflow_project", { operation: "inspect", scope: "active" });
      }
      if (n === 4) {
        const rows = latest(manager, "freeflow_project").candidates;
        assert.equal(rows.find((r) => r.ref === ref).targetReady, true);
        assert.equal(rows.find((r) => r.ref === ref.replace("#text", "")).targetReady, false);
        return call("freeflow_project", { operation: "add", refs: [ref] });
      }
      if (n === 5) {
        assert.equal(latest(manager, "freeflow_project").ready, true);
        return call("freeflow_return", {
          operation: "submit",
          report: "Selected the explanation.",
          outcome: "completed",
        });
      }
      if (n === 6) {
        const wire = JSON.stringify(body);
        assert.equal(body.model, "gpt-4o");
        assert.equal(wire.split("VISIBLE_BEGIN_731").length - 1, 1);
        assert.equal(wire.split("VISIBLE_END_931").length - 1, 1);
        assert.ok(wire.indexOf("VISIBLE_BEGIN_731") < wire.indexOf("VISIBLE_END_931"));
        assert.doesNotMatch(wire, /PRIVATE_REASONING_932/);
        assert.match(wire, /Captured assistant text/);
      }
      return [];
    },
    true,
    undefined,
    true,
    {
      extensions: [
        (pi) =>
          pi.on("message_end", (e) => {
            if (
              e.message.role === "assistant" &&
              e.message.model === "gpt-4.1-mini" &&
              e.message.content.some(
                (b) => b.name === "freeflow_project" && b.arguments.operation === "inspect" && !b.arguments.scope,
              )
            )
              return {
                message: {
                  ...e.message,
                  content: [
                    { type: "text", text: "VISIBLE_BEGIN_731" },
                    {
                      type: "thinking",
                      thinking: "PRIVATE_REASONING_932",
                      thinkingSignature: JSON.stringify({
                        type: "reasoning",
                        id: "rs_fixture",
                        summary: [{ type: "summary_text", text: "PRIVATE_REASONING_932" }],
                      }),
                    },
                    { type: "text", text: "VISIBLE_END_931" },
                    ...e.message.content.filter((b) => b.type === "toolCall"),
                  ],
                },
              };
          }),
      ],
    },
  );
  const original = result.entries.find((e) => `ctx:${e.id}#text` === ref).message;
  assert.ok(
    original.content.some((b) => b.thinkingSignature),
    "canonical signed content is unchanged",
  );
});

test("historical discovery recovers exposed evidence after compaction and a new assignment", async () => {
  let ref;
  const result = await fixture(
    (n, body, m) => {
      if (n === 1 || n === 6)
        return call("freeflow_delegate", {
          operation: "assign",
          contract: n === 1 ? "Read evidence." : "Reuse the previous captured evidence.",
        });
      if (n === 2) return call("read", { path: "evidence.txt" });
      if (n === 3) {
        ref = "ctx:" + m.getBranch().find((e) => e.message?.toolName === "read").id;
        return call("freeflow_return", { operation: "submit", report: "Read completed.", outcome: "completed" });
      }
      if (n === 4 || n === 11)
        return call("freeflow_unit", { operation: "close", outcome: "accepted", assessment: "Received evidence." });
      if (n === 7) return call("freeflow_project", { operation: "inspect", scope: "assignment" });
      if (n === 8) {
        assert.equal(latest(m, "freeflow_project").count, 0);
        return call("freeflow_project", { operation: "inspect", scope: "history" });
      }
      if (n === 9) {
        const candidate = latest(m, "freeflow_project").candidates.find((r) => r.ref === ref);
        assert.equal(candidate.active, false);
        assert.equal(candidate.eligible, true);
        return call("freeflow_project", { operation: "add", refs: [ref] });
      }
      if (n === 10) {
        assert.equal(latest(m, "freeflow_project").ready, true);
        return call("freeflow_return", {
          operation: "submit",
          report: "Recovered existing evidence.",
          outcome: "completed",
        });
      }
      return [];
    },
    true,
    async ({ session }) => {
      await session.compact();
      await session.prompt("Reuse the previous captured evidence.");
      await session.waitForIdle();
    },
  );
  assert.equal(result.entries.filter((e) => e.message?.toolName === "read").length, 1, "no task replay");
});

test("no-op selections preserve revisions and same-call reentry preserves the accepted receipt", async () => {
  let ref, repeated;
  const original = RoutingRuntime.prototype.invoke;
  RoutingRuntime.prototype.invoke = async function (name, id, input, signal, ctx) {
    const first = await original.call(this, name, id, input, signal, ctx);
    if (name === "freeflow_project" && input.operation === "add" && input.refs.length && !repeated) {
      repeated = await original.call(this, name, id, input, signal, ctx);
      assert.deepEqual(repeated, first);
      const conflict = await original.call(this, name, id, { ...input, refs: ["ctx:other"] }, signal, ctx);
      assert.equal(conflict.details.code, "operation_conflict");
    }
    return first;
  };
  try {
    const result = await fixture((n, body, m) => {
      if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Read and select evidence." });
      if (n === 2) return call("read", { path: "evidence.txt" });
      if (n === 3) {
        ref = "ctx:" + m.getBranch().find((e) => e.message?.toolName === "read").id;
        return call("freeflow_project", { operation: "add", refs: [ref] });
      }
      if (n === 4) return call("freeflow_project", { operation: "add", refs: [ref] });
      if (n === 5) {
        assert.equal(latest(m, "freeflow_project").revision, 1);
        return call("freeflow_project", { operation: "add", refs: [] });
      }
      if (n === 6)
        return call("freeflow_project", {
          operation: "remove",
          refs: ["ctx:never-selected"],
          reason: "No such selection",
        });
      if (n === 7) {
        const r = latest(m, "freeflow_project");
        assert.equal(r.revision, 1);
        assert.equal(r.status, "unchanged");
        assert.deepEqual(r.evidence.withdrawals, []);
      }
      return [];
    });
    assert.equal(result.entries.filter((e) => e.data?.data?.type === "selection-changed").length, 1);
  } finally {
    RoutingRuntime.prototype.invoke = original;
  }
});

test("candidate pagination is stable while inspection appends native entries", async () => {
  let first, cursor;
  await fixture((n, body, m) => {
    if (n === 1)
      return call("freeflow_delegate", { operation: "assign", contract: "Read observations and inspect them." });
    if (n === 2) return Array.from({ length: 35 }, () => ({ name: "read", args: { path: "evidence.txt" } }));
    if (n === 3) return call("freeflow_project", { operation: "inspect", scope: "history" });
    if (n === 4) {
      first = latest(m, "freeflow_project");
      cursor = first.nextCursor;
      assert.equal(first.returned, 30);
      assert.ok(cursor);
      return call("freeflow_project", { operation: "inspect", scope: "history", cursor });
    }
    if (n === 5) {
      const second = latest(m, "freeflow_project");
      assert.equal(second.count, first.count);
      assert.equal(new Set([...first.candidates, ...second.candidates].map((r) => r.ref)).size, first.count);
      return call("freeflow_project", { operation: "inspect", scope: "active", cursor });
    }
    if (n === 6) assert.equal(latest(m, "freeflow_project").code, "cursor_expired");
    return [];
  });
});

test("planning budgets do not count base64 as text or reserve an unrequested model maximum", () => {
  const state = initialState(),
    model = {
      id: "receiver",
      provider: "fixture",
      api: "fixture",
      input: ["image", "text"],
      contextWindow: 100000,
      maxTokens: 64000,
    };
  const prepare = (message) => {
    const entry = { id: "x", parentId: null, type: "message", message };
    return prepareView({
      messages: [message],
      sources: new Sources([entry], state),
      state,
      view: "executor",
      projection: false,
      model,
      pair: { provider: "fixture", modelId: "receiver", thinking: "off" },
      systemPrompt: "",
      tools: [],
      runtimeMessage: { role: "custom", content: "state" },
      instance: "test",
    });
  };
  assert.equal(prepare({ role: "user", content: "x".repeat(180000) }).ready, true);
  const image = prepare({
    role: "user",
    content: [{ type: "image", mimeType: "image/png", data: "A".repeat(3 * 1024 * 1024) }],
  });
  assert.equal(image.ready, true);
  assert.ok(image.estimatedTokens < 2000);
  const large = prepare({ role: "user", content: "x".repeat(400000) });
  assert.equal(large.ready, true);
  assert.equal(large.warnings[0].code, "budget_estimate");
  const failed = {
    ref: "ctx:failed#text",
    original: { message: { role: "assistant", stopReason: "error" } },
    message: { role: "custom", content: [{ type: "text", text: "partial" }] },
  };
  assert.equal(representationProblems(failed, model)[0].code, "target_representation");
});

test("explicit assistant text survives Pi custom-message conversion and the Codex SSE serializer", async () => {
  const { convertToLlm } = await import("@earendil-works/pi-coding-agent");
  const { zstdDecompressSync } = await import("node:zlib");
  const { streamSimple: streamSimpleOpenAICodexResponses } = await import(
    new URL(
      "../node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js",
      import.meta.resolve("@earendil-works/pi-coding-agent"),
    )
  );
  const { response } = await import("../fixtures/routing-native.js");
  const source = {
    type: "message",
    id: "visible",
    parentId: null,
    message: {
      role: "assistant",
      provider: "openai-codex",
      api: "openai-codex-responses",
      model: "gpt-5.6-luna",
      stopReason: "stop",
      timestamp: 1,
      content: [
        { type: "thinking", thinking: "NOT_SELECTED_REASONING", thinkingSignature: "opaque-original" },
        { type: "text", text: "EXACT_CODEX_VISIBLE_TEXT_927" },
      ],
    },
  };
  const sources = new Sources([source], initialState());
  const messages = convertToLlm([sources.byRef.get("ctx:visible#text").message]);
  const key =
    "fixture." +
    Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account" } })).toString(
      "base64url",
    ) +
    ".fixture";
  let captured;
  const model = {
    id: "gpt-5.6-sol",
    provider: "openai-codex",
    api: "openai-codex-responses",
    baseUrl: "https://fixture.invalid",
    input: ["text", "image"],
    contextWindow: 100000,
    maxTokens: 8192,
    reasoning: true,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  const stream = streamSimpleOpenAICodexResponses(
    model,
    { systemPrompt: "Fixture", messages, tools: [] },
    {
      apiKey: key,
      transport: "sse",
      maxRetries: 0,
      fetch: async (url, init) => {
        assert.match(String(url), /^https:\/\/fixture\.invalid\//);
        captured = JSON.parse(
          new Headers(init.headers).get("content-encoding") === "zstd"
            ? zstdDecompressSync(init.body).toString()
            : String(init.body),
        );
        return response(1, [], "Fixture done.");
      },
    },
  );
  const answer = await stream.result();
  assert.notEqual(answer.stopReason, "error", answer.errorMessage);
  assert.equal(captured.model, "gpt-5.6-sol");
  assert.equal(JSON.stringify(captured).split("EXACT_CODEX_VISIBLE_TEXT_927").length - 1, 1);
  assert.doesNotMatch(JSON.stringify(captured), /NOT_SELECTED_REASONING|opaque-original/);
  assert.equal(source.message.content[0].thinkingSignature, "opaque-original");
});

test("report revisions remain ordinary communication and are recoverable individually", async () => {
  let workRef, previous;
  await fixture((n, body, m) => {
    if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Report the actual result." });
    if (n === 2)
      return [
        { name: "freeflow_project", args: { operation: "add", refs: ["ctx:missing"] } },
        {
          name: "freeflow_return",
          args: { operation: "submit", report: "FIRST_SAVED_REVISION_271", outcome: "partial" },
        },
      ];
    if (n === 3)
      return call("freeflow_return", { operation: "submit", report: "SECOND_SAVED_REVISION_811", outcome: "partial" });
    if (n === 4)
      return [
        {
          name: "freeflow_project",
          args: { operation: "remove", refs: ["ctx:missing"], reason: "Unavailable evidence remains a gap" },
        },
        { name: "freeflow_return", args: { operation: "retry" } },
      ];
    if (n === 5) {
      assert.match(JSON.stringify(body), /FIRST_SAVED_REVISION_271/);
      assert.match(JSON.stringify(body), /SECOND_SAVED_REVISION_811/);
      return call("freeflow_unit", {
        operation: "close",
        outcome: "deferred",
        assessment: "Saved both report revisions and the gap.",
      });
    }
    if (n === 6) return call("freeflow_unit", { operation: "inspect", view: "history" });
    if (n === 7) {
      workRef = latest(m, "freeflow_unit").history[0].ref;
      return call("freeflow_unit", { operation: "inspect", view: "detail", ref: workRef });
    }
    if (n === 8) {
      const r = latest(m, "freeflow_unit");
      assert.equal(r.report, "SECOND_SAVED_REVISION_811");
      assert.equal(r.reportRevision, 2);
      previous = r.previousReportRef;
      return call("freeflow_unit", { operation: "inspect", view: "detail", ref: previous });
    }
    if (n === 9) {
      const r = latest(m, "freeflow_unit");
      assert.equal(r.report, "FIRST_SAVED_REVISION_271");
      assert.equal(r.reportRevision, 1);
      assert.equal(r.latestReportRevision, 2);
      assert.equal(r.ref, previous);
      assert.equal(r.currentSelection.withdrawals[0].reason, "Unavailable evidence remains a gap");
    }
    return [];
  });
});

test("a prior profile's usage does not starve the receiving response after projection", async () => {
  const result = await fixture(
    (n, body) => {
      if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Return a short result." });
      if (n === 2)
        return call("freeflow_return", { operation: "submit", report: "Short saved result.", outcome: "completed" });
      if (n === 3) {
        assert.equal(body.model, "gpt-4o");
        assert.ok(
          body.max_output_tokens >= 8192,
          `stale Executor usage restricted output to ${body.max_output_tokens}`,
        );
      }
      return [];
    },
    true,
    undefined,
    true,
    {
      extensions: [
        (pi) => {
          pi.on("context", (e) => ({ messages: e.messages.map((m) => ({ ...m, timestamp: m.timestamp ?? 0 })) }));
          pi.on("message_end", (e) => {
            if (e.message.role === "assistant" && e.message.model === "gpt-4.1-mini")
              return {
                message: {
                  ...e.message,
                  usage: {
                    ...e.message.usage,
                    input: 125000,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    totalTokens: 125000,
                  },
                },
              };
          });
        },
      ],
    },
  );
  const recorded = result.entries.find((e) => e.message?.role === "assistant" && e.message.model === "gpt-4.1-mini");
  assert.equal(recorded.message.usage.input, 125000, "recorded accounting is unchanged");
});

test("a context tool name cannot make an unknown operation a valid handoff batch", async () => {
  const result = await fixture((n, body, m) => {
    if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Return a supported report." });
    if (n === 2)
      return [
        { name: "freeflow_context", args: { operation: "publish" } },
        {
          name: "freeflow_return",
          args: { operation: "submit", report: "Must not be accepted from this batch.", outcome: "completed" },
        },
      ];
    if (n === 3) {
      assert.equal(m.getEntries().filter((e) => e.data?.data?.type === "return-accepted").length, 0);
      assert.equal(
        m
          .getBranch()
          .filter((e) => e.message?.toolName === "freeflow_return")
          .at(-1).message.isError,
        true,
      );
    }
    return [];
  }, true);
  assert.equal(result.state.assignments.values().next().value.state, "outstanding");
});

test("Executor inspection failures do not falsely require Coordinator control", async () => {
  await fixture((n, body, m) => {
    if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Inspect existing routing state." });
    if (n === 2) return call("freeflow_unit", { operation: "inspect", view: "detail", ref: "assignment:missing" });
    if (n === 3) {
      const r = latest(m, "freeflow_unit");
      assert.equal(r.code, "work_unavailable");
      assert.equal(r.expectedProfile, undefined);
      assert.match(r.recoveryAction, /does not require a new assignment/);
      assert.equal(body.model, "gpt-4.1-mini");
    }
    return [];
  });
});

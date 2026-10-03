import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import freeflow from "../../dist/index.js";
import { replay } from "../../dist/cognitive-routing/state.js";

/**
 * With FREEFLOW_CAPTURE_DIR set, every provider request body a fixture run sends is written there, one file per run,
 * so two builds' requests can be compared byte for byte. Values that differ between runs (the temporary directory,
 * UUIDs, entry ids, and background command ids) are replaced by their order of first appearance.
 */
let captureRun = 0;
function capture(root, bodies) {
  const dir = process.env.FREEFLOW_CAPTURE_DIR;
  if (!dir || !bodies.length) return;
  const ids = new Map();
  const ordinal = (prefix) => (value) => `${prefix}#${ids.get(value) ?? ids.set(value, ids.size).get(value)}`;
  const text = bodies
    .map((body) => JSON.stringify(body))
    .join("\n")
    .replaceAll(root, "<root>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ordinal("uuid"))
    .replace(/\b[0-9a-f]{8}\b/g, ordinal("id"))
    .replace(/\bbg[0-9a-z]{6}\b/g, ordinal("bg"));
  return mkdir(dir, { recursive: true }).then(() =>
    appendFile(join(dir, `${basename(process.argv[1] ?? "run")}-${++captureRun}.jsonl`), text + "\n"),
  );
}

export function response(
  n,
  calls = [],
  text = "fixture response",
  usage = { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
  reasoning,
) {
  const output = [
    ...(reasoning === undefined
      ? []
      : [
          {
            type: "reasoning",
            id: `rs_${n}`,
            summary: [{ type: "summary_text", text: reasoning }],
            encrypted_content: `enc_${n}`,
          },
        ]),
    {
      type: "message",
      id: `msg-${n}`,
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text, annotations: [] }],
    },
    ...calls.map((c, i) => ({
      type: "function_call",
      id: `fc_${n}_${i}`,
      call_id: `call-${n}-${i}`,
      name: c.name,
      arguments: JSON.stringify(c.args),
    })),
  ];
  const events = [{ type: "response.created", response: { id: `r-${n}`, status: "in_progress", output: [] } }];
  output.forEach((item, i) => {
    events.push({
      type: "response.output_item.added",
      output_index: i,
      item:
        item.type === "message"
          ? { ...item, content: [] }
          : item.type === "reasoning"
            ? { ...item, summary: [] }
            : { ...item, arguments: "" },
    });
    if (item.type === "message")
      events.push({ type: "response.output_text.delta", output_index: i, content_index: 0, delta: text });
    else if (item.type === "function_call")
      events.push(
        { type: "response.function_call_arguments.delta", output_index: i, delta: item.arguments },
        { type: "response.function_call_arguments.done", output_index: i, arguments: item.arguments },
      );
    events.push({ type: "response.output_item.done", output_index: i, item });
  });
  events.push({
    type: "response.completed",
    response: {
      id: `r-${n}`,
      status: "completed",
      output,
      usage,
    },
  });
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** An Anthropic Messages stream: optional thinking with a signature, text, then tool calls. */
export function anthropicResponse(
  n,
  calls = [],
  {
    text = "fixture response",
    thinking,
    model = "claude-opus-5-5",
    usage = { input_tokens: 10, output_tokens: 10 },
  } = {},
) {
  const blocks = [
    ...(thinking === undefined ? [] : [{ type: "thinking", thinking, signature: `sig-${n}` }]),
    { type: "text", text },
    ...calls.map((c, i) => ({ type: "tool_use", id: `toolu_${n}_${i}`, name: c.name, input: c.args })),
  ];
  const events = [
    [
      "message_start",
      {
        type: "message_start",
        message: { id: `msg_${n}`, type: "message", role: "assistant", model, content: [], stop_reason: null, usage },
      },
    ],
  ];
  blocks.forEach((block, index) => {
    if (block.type === "thinking") {
      events.push(
        [
          "content_block_start",
          { type: "content_block_start", index, content_block: { type: "thinking", thinking: "" } },
        ],
        [
          "content_block_delta",
          { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } },
        ],
        [
          "content_block_delta",
          { type: "content_block_delta", index, delta: { type: "signature_delta", signature: block.signature } },
        ],
      );
    } else if (block.type === "text") {
      events.push(
        ["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }],
        [
          "content_block_delta",
          { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } },
        ],
      );
    } else {
      events.push(
        [
          "content_block_start",
          {
            type: "content_block_start",
            index,
            content_block: { type: "tool_use", id: block.id, name: block.name, input: {} },
          },
        ],
        [
          "content_block_delta",
          {
            type: "content_block_delta",
            index,
            delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) },
          },
        ],
      );
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push(
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: calls.length ? "tool_use" : "end_turn" },
        usage: { output_tokens: usage.output_tokens },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  );
  return new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

export async function fixture(script, projection = true, after, withUI = true, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-native-"));
  const cwd = join(root, "cwd"),
    agentDir = join(root, "agent");
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await mkdir(agentDir);
  await writeFile(
    join(cwd, ".freeflow/config.json"),
    JSON.stringify({
      ...(options.freeflowConfig ?? {}),
      cognitiveRouting: options.cognitiveRouting ?? {
        enabled: true,
        projection,
        profiles: {
          coordinator: { provider: "openai", model: "gpt-4o", thinking: "off" },
          executor: { provider: "openai", model: "gpt-4.1-mini", thinking: "off" },
        },
      },
    }),
  );
  await writeFile(join(cwd, "evidence.txt"), "EXACT_EVIDENCE_BODY_81");
  await writeFile(join(cwd, "unselected.txt"), "UNSELECTED_PRIVATE_BODY_93");
  await writeFile(join(cwd, "recovery.txt"), "FRESH_RECOVERY_BODY_57");
  await writeFile(join(cwd, "@recovery.txt"), "LITERAL_AT_FILE_BODY_68");
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        openai: { baseUrl: "https://fixture.invalid/v1", ...options.openaiProvider },
        anthropic: { baseUrl: "https://fixture.invalid", ...options.anthropicProvider },
      },
    }),
  );
  if (options.modelsStore) await writeFile(join(agentDir, "models-store.json"), JSON.stringify(options.modelsStore));
  const priorFetch = globalThis.fetch,
    offline = process.env.PI_OFFLINE;
  process.env.PI_OFFLINE = "1";
  const requests = [],
    errors = [],
    contexts = [],
    transportFailures = [],
    notices = [],
    toolUpdates = [];
  let session;
  const manager = SessionManager.create(cwd, join(root, "sessions"));
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/fixture\.invalid\//, "no unexpected network destination");
    const body = JSON.parse(String(init.body));
    // While the fixture supplies the compaction summary, a summarizer request (Freeflow's fallback asks Pi's
    // summarizer first) is answered here and kept out of the scripted request sequence.
    if (
      options.fixtureCompaction !== false &&
      JSON.stringify(body).includes("You are a context summarization assistant")
    )
      return Array.isArray(body.messages) ? anthropicResponse(0, []) : response(0, []);
    requests.push(body);
    assert.ok(requests.length <= (options.maxRequests ?? 15), "bounded fixture request count");
    try {
      const calls = await script(requests.length, body, manager, requests);
      if (options.response) return options.response(requests.length, calls, body);
      return Array.isArray(body.messages)
        ? anthropicResponse(requests.length, calls)
        : response(requests.length, calls);
    } catch (error) {
      transportFailures.push(error);
      throw error;
    }
  };
  try {
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: join(agentDir, "models.json"),
      modelsStorePath: join(agentDir, "models-store.json"),
      allowModelNetwork: false,
    });
    await modelRuntime.setRuntimeApiKey("openai", "fixture-not-a-real-key");
    await modelRuntime.setRuntimeApiKey("anthropic", "fixture-not-a-real-key");
    const settingsManager = SettingsManager.inMemory({
      // Pi's own automatic compaction stays off unless a test exercises it (piAutoCompaction: true).
      compaction: { enabled: options.piAutoCompaction === true, keepRecentTokens: 1, reserveTokens: 1 },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
      ...options.settings,
    });
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        ...(options.beforeExtensions ?? []),
        ...(!options.skipFreeflow ? [freeflow] : []),
        ...(options.extensions ?? []),
        (pi) => {
          pi.on("context", (event) => {
            contexts.push(structuredClone(event.messages));
          });
          // A fixed summary, unless a test exercises the real compaction path (fixtureCompaction: false).
          if (options.fixtureCompaction !== false)
            pi.on("session_before_compact", () => ({
              compaction: {
                summary: "Fixture compacted prior work; evidence must come from canonical sources.",
                firstKeptEntryId: manager.getLeafId(),
                tokensBefore: 100,
              },
            }));
          pi.on("tool_execution_update", (event) => {
            toolUpdates.push(structuredClone(event));
          });
        },
      ],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({
      cwd,
      agentDir,
      modelRuntime,
      model: modelRuntime.getModel(...(options.model ?? ["openai", "gpt-4o"])),
      thinkingLevel: options.thinkingLevel ?? "off",
      settingsManager,
      sessionManager: manager,
      resourceLoader: loader,
    }));
    // Pi reports idle before extension agent_settled handlers finish, and a prompt sent in that window is deferred.
    // A run (which may continue through several agent starts, such as after overflow compaction) is over only when
    // its agent_settled session event has fired.
    let settling = false;
    session.subscribe((event) => {
      if (event.type === "agent_start") settling = true;
      else if (event.type === "agent_settled") settling = false;
    });
    const idle = session.waitForIdle.bind(session);
    session.waitForIdle = async () => {
      await idle();
      for (let i = 0; settling; i++) {
        assert.ok(i < 5000, "every started agent run settles");
        await new Promise((resolve) => setTimeout(resolve, 1));
        await idle();
      }
    };
    // Public retained bindings make Pi emit session_start again on SDK reload, including headless mode.
    await session.bindExtensions({
      mode: "print",
      onError: (e) => errors.push(e),
      ...(withUI ? { uiContext: { notify: (...args) => notices.push(args), setStatus: () => {} } } : {}),
    });
    await options.onSession?.(session);
    await options.beforePrompt?.({ session, manager, requests, contexts, cwd, notices });
    await session.prompt("Complete the fixture assignment.");
    await session.waitForIdle();
    assert.deepEqual(errors, [], "extension lifecycle errors");
    if (after) await after({ session, manager, requests, contexts, cwd, notices, toolUpdates });
    assert.deepEqual(errors, [], "post-lifecycle errors");
    assert.deepEqual(transportFailures, [], "scripted provider assertions must not be swallowed as provider errors");
    assert.notEqual(
      session.messages.at(-1)?.stopReason,
      "error",
      `fixture completes without provider failure: ${session.messages.at(-1)?.errorMessage ?? ""}`,
    );
    return { requests, state: replay(manager.getBranch()), entries: manager.getEntries(), contexts, toolUpdates };
  } finally {
    session?.dispose();
    globalThis.fetch = priorFetch;
    if (offline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = offline;
    await capture(root, requests);
    await rm(root, { recursive: true, force: true });
  }
}

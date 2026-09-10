import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import freeflow from "../../dist/index.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";

function response(n, calls = [], text = "fixture response") {
  const output = [
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
      item: item.type === "message" ? { ...item, content: [] } : { ...item, arguments: "" },
    });
    if (item.type === "message")
      events.push({ type: "response.output_text.delta", output_index: i, content_index: 0, delta: text });
    else
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
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    },
  });
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function fixture(script, projection = true, after, withUI = true) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-native-"));
  const cwd = join(root, "cwd"),
    agentDir = join(root, "agent");
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await mkdir(agentDir);
  await writeFile(
    join(cwd, ".freeflow/config.json"),
    JSON.stringify({
      cognitiveRouting: {
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
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({ providers: { openai: { baseUrl: "https://fixture.invalid/v1" } } }),
  );
  const priorFetch = globalThis.fetch,
    offline = process.env.PI_OFFLINE;
  process.env.PI_OFFLINE = "1";
  const requests = [],
    errors = [],
    contexts = [],
    transportFailures = [],
    notices = [];
  let session;
  const manager = SessionManager.create(cwd, join(root, "sessions"));
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/fixture\.invalid\//, "no unexpected network destination");
    const body = JSON.parse(String(init.body));
    requests.push(body);
    assert.ok(requests.length <= 15, "bounded fixture request count");
    try {
      return response(requests.length, await script(requests.length, body, manager, requests));
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
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 1 },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
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
        freeflow,
        (pi) => {
          pi.on("context", (event) => {
            contexts.push(structuredClone(event.messages));
          });
          pi.on("session_before_compact", () => ({
            compaction: {
              summary: "Fixture compacted prior work; evidence must come from canonical sources.",
              firstKeptEntryId: manager.getLeafId(),
              tokensBefore: 100,
            },
          }));
        },
      ],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({
      cwd,
      agentDir,
      modelRuntime,
      model: modelRuntime.getModel("openai", "gpt-4o"),
      thinkingLevel: "off",
      settingsManager,
      sessionManager: manager,
      resourceLoader: loader,
    }));
    // Public retained bindings make Pi emit session_start again on SDK reload, including headless mode.
    await session.bindExtensions({
      mode: "print",
      onError: (e) => errors.push(e),
      ...(withUI ? { uiContext: { notify: (...args) => notices.push(args), setStatus: () => {} } } : {}),
    });
    await session.prompt("Complete the fixture assignment.");
    await session.waitForIdle();
    assert.deepEqual(errors, [], "extension lifecycle errors");
    if (after) await after({ session, manager, requests, contexts, cwd, notices });
    assert.deepEqual(errors, [], "post-lifecycle errors");
    assert.deepEqual(transportFailures, [], "scripted provider assertions must not be swallowed as provider errors");
    assert.notEqual(session.messages.at(-1)?.stopReason, "error", "fixture completes without provider failure");
    return { requests, state: replay(manager.getBranch()), entries: manager.getEntries(), contexts };
  } finally {
    session?.dispose();
    globalThis.fetch = priorFetch;
    if (offline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = offline;
    await rm(root, { recursive: true, force: true });
  }
}

for (const projection of [false, true])
  test(`native delegate/read/return/close with projection=${projection}`, { timeout: 30000 }, async () => {
    let ref;
    const result = await fixture((n, body, manager) => {
      if (n === 1) {
        assert.equal(body.model, "gpt-4o");
        assert.equal(
          body.tools.find((t) => t.name === "freeflow_delegate")?.parameters?.type,
          "object",
          "provider function schema has an object root",
        );
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read evidence.txt and return the exact observed body." },
          },
        ];
      }
      if (n === 2) {
        assert.equal(body.model, "gpt-4.1-mini");
        return [{ name: "read", args: { path: "evidence.txt" } }];
      }
      if (n === 3) {
        assert.equal(body.model, "gpt-4.1-mini");
        const e = manager.getBranch().find((e) => e.message?.role === "toolResult" && e.message.toolName === "read");
        assert.ok(e, "real read result exists");
        ref = `ctx:${e.id}`;
        if (projection) assert.match(JSON.stringify(body), new RegExp(ref));
        return [
          ...(projection ? [{ name: "freeflow_project", args: { operation: "add", refs: [ref] } }] : []),
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Read observed EXACT_EVIDENCE_BODY_81.", outcome: "completed" },
          },
        ];
      }
      if (n === 4) {
        assert.equal(body.model, "gpt-4o");
        assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
        return [
          {
            name: "freeflow_unit",
            args: {
              operation: "close",
              outcome: "accepted",
              assessment: "Actual captured read body supports the fixture assignment.",
            },
          },
        ];
      }
      return [];
    }, projection);
    assert.equal(result.requests.length, 5, JSON.stringify(result.contexts.at(-1), null, 2));
    assert.equal(result.state.unitId, undefined);
    assert.equal([...result.state.units.values()][0].state, "closed");
    const assignments = [...result.state.assignments.values()];
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].state, "returned");
    const read = result.entries.find((e) => e.message?.role === "toolResult" && e.message.toolName === "read");
    assert.match(JSON.stringify(read.message), /EXACT_EVIDENCE_BODY_81/);
  });

test(
  "saved report survives bad selection and payload-free retry; post-return writes are blocked",
  { timeout: 30000 },
  async () => {
    let ref, reportId;
    const report = "SUBSTANTIVE_SAVED_REPORT_902";
    const result = await fixture((n, body, manager) => {
      if (n === 1)
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read evidence and return it; no unrelated writes." },
          },
        ];
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) {
        ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
        return [
          { name: "freeflow_project", args: { operation: "add", refs: [ref, "ctx:missing"] } },
          {
            name: "freeflow_return",
            args: { operation: "submit", report, outcome: "partial", limitations: ["Bad reference unresolved"] },
          },
        ];
      }
      if (n === 4) {
        assert.equal(body.model, "gpt-4.1-mini");
        const s = replay(manager.getBranch());
        reportId = s.assessment.handoffId;
        assert.equal(s.handoffs.get(reportId).text, report);
        assert.equal(s.handoffs.get(reportId).state, "blocked");
        return [{ name: "write", args: { path: "forbidden.txt", content: "must not happen" } }];
      }
      if (n === 5) {
        const write = manager.getBranch().find((e) => e.message?.toolName === "write");
        assert.ok(write?.message.isError, "post-return task call rejected");
        return [
          {
            name: "freeflow_project",
            args: {
              operation: "remove",
              refs: ["ctx:missing"],
              reason: "Reference was invalid; no missing unique evidence.",
            },
          },
          { name: "freeflow_return", args: { operation: "retry" } },
        ];
      }
      if (n === 6) {
        assert.equal(body.model, "gpt-4o");
        assert.match(JSON.stringify(body), new RegExp(report));
        assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
        const s = replay(manager.getBranch());
        assert.equal(s.assessment.handoffId, reportId);
        assert.equal(s.handoffs.get(reportId).reportRevision, 1);
        return [
          {
            name: "freeflow_unit",
            args: {
              operation: "close",
              outcome: "accepted",
              assessment: "Actual evidence received; saved report preserved.",
            },
          },
        ];
      }
      return [];
    });
    assert.equal(result.requests.length, 7);
    assert.equal(result.state.assignments.size, 1);
  },
);

test("native projection omits an unselected sibling body but preserves its exchange", { timeout: 30000 }, async () => {
  await fixture(
    (n, body, manager) => {
      if (n === 1)
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read both files; select only evidence.txt." },
          },
        ];
      if (n === 2)
        return [
          { name: "read", args: { path: "evidence.txt" } },
          { name: "read", args: { path: "unselected.txt" } },
        ];
      if (n === 3) {
        assert.match(JSON.stringify(body), /UNSELECTED_PRIVATE_BODY_93/);
        const e = manager
          .getBranch()
          .find(
            (e) =>
              e.message?.role === "toolResult" && JSON.stringify(e.message.content).includes("EXACT_EVIDENCE_BODY_81"),
          );
        return [
          { name: "freeflow_project", args: { operation: "add", refs: ["ctx:" + e.id] } },
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Selected the requested evidence.", outcome: "completed" },
          },
        ];
      }
      if (n > 4) {
        assert.equal(body.model, "gpt-4o");
        assert.doesNotMatch(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
        return [];
      }
      assert.equal(body.model, "gpt-4o");
      assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
      assert.doesNotMatch(JSON.stringify(body), /UNSELECTED_PRIVATE_BODY_93/);
      assert.match(JSON.stringify(body), /Executor result omitted/);
      return [];
    },
    true,
    async ({ session, manager, requests }) => {
      const before = replay(manager.getBranch()).assessment.handoffId;
      await session.reload();
      await session.prompt("A new question unrelated to the pending assessment.");
      await session.waitForIdle();
      const state = replay(manager.getBranch());
      assert.equal(state.assessment.handoffId, before);
      assert.equal(state.assessment.view, "suspended");
      const last = JSON.stringify(requests.at(-1));
      assert.doesNotMatch(last, /EXACT_EVIDENCE_BODY_81/);
      assert.match(last, /suspended/);
    },
  );
});

test("bundled CLI loads the package entrypoint and completes the real routing loop", { timeout: 30000 }, async () => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { readFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-cli-")),
    cwd = join(root, "cwd"),
    agentDir = join(root, "agent");
  try {
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await mkdir(agentDir);
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        cognitiveRouting: {
          enabled: true,
          projection: false,
          profiles: {
            coordinator: { provider: "openai", model: "gpt-4o", thinking: "off" },
            executor: { provider: "openai", model: "gpt-4.1-mini", thinking: "off" },
          },
        },
      }),
    );
    await writeFile(
      join(agentDir, "models.json"),
      JSON.stringify({ providers: { openai: { baseUrl: "https://fixture.invalid/v1" } } }),
    );
    await writeFile(
      join(agentDir, "auth.json"),
      JSON.stringify({ openai: { type: "api_key", key: "fixture-not-real" } }),
    );
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        defaultProvider: "openai",
        defaultModel: "gpt-4o",
        defaultThinkingLevel: "off",
        compaction: { enabled: false },
        retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
      }),
    );
    const capture = join(root, "requests.json");
    const extension = join(root, "transport.mjs");
    await writeFile(
      extension,
      `import {writeFileSync} from 'node:fs';\n${response.toString()}\nexport default function(){const models=[];globalThis.fetch=async(url,init)=>{if(!String(url).startsWith('https://fixture.invalid/'))throw new Error('Unexpected network '+url);const body=JSON.parse(String(init.body));models.push(body.model);writeFileSync(${JSON.stringify(capture)},JSON.stringify(models));const n=models.length;if(n>4)throw new Error('Unexpected extra request');const steps=[[{name:'freeflow_delegate',args:{operation:'assign',contract:'Return the observed fixture result.'}}],[{name:'freeflow_return',args:{operation:'submit',report:'Fixture result ready.',outcome:'completed'}}],[{name:'freeflow_unit',args:{operation:'close',outcome:'accepted',assessment:'Received the saved report.'}}],[]];return response(n,steps[n-1]);};}`,
    );
    const cli = fileURLToPath(new URL("./bundle/cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
    const packageEntry = fileURLToPath(new URL("../../freeflow/index.js", import.meta.url));
    const args = [
      cli,
      "-p",
      "--mode",
      "json",
      "--no-extensions",
      "--no-skills",
      "--no-context-files",
      "--no-prompt-templates",
      "--no-themes",
      "-e",
      extension,
      "-e",
      packageEntry,
      "Run the fixture.",
    ];
    const child = spawn(process.execPath, args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: root,
        PI_CODING_AGENT_DIR: agentDir,
        PI_OFFLINE: "1",
        PI_TELEMETRY: "0",
        PI_SKIP_VERSION_CHECK: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    clearTimeout(timer);
    assert.equal(code, 0, output.slice(-12000));
    assert.deepEqual(JSON.parse(await readFile(capture, "utf8")), ["gpt-4o", "gpt-4.1-mini", "gpt-4o", "gpt-4o"]);
    assert.match(output, /"status":"closed"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const withUI of [false, true])
  test(
    `manual hold and reload preserve outstanding assignment; replacement stays in unit (ui=${withUI})`,
    { timeout: 30000 },
    async () => {
      let originalAssignment, unit;
      await fixture(
        (n, body, manager) => {
          if (n === 1)
            return [
              {
                name: "freeflow_delegate",
                args: { operation: "assign", contract: "Initial assignment; wait for amended direction." },
              },
            ];
          if (n === 2) {
            const s = replay(manager.getBranch());
            originalAssignment = s.assignmentId;
            unit = s.unitId;
            return [];
          }
          if (n === 3) {
            assert.equal(body.model, "gpt-4o");
            return [
              {
                name: "freeflow_delegate",
                args: {
                  operation: "replace",
                  contract: "Return the revised result.",
                  reason: "User explicitly amended the outstanding assignment.",
                },
              },
            ];
          }
          if (n === 4) {
            assert.equal(body.model, "gpt-4.1-mini");
            const s = replay(manager.getBranch());
            assert.equal(s.unitId, unit);
            assert.notEqual(s.assignmentId, originalAssignment);
            assert.equal(s.assignments.get(originalAssignment).state, "superseded");
            return [
              {
                name: "freeflow_return",
                args: { operation: "submit", report: "Revised result.", outcome: "completed" },
              },
            ];
          }
          if (n === 5)
            return [
              {
                name: "freeflow_unit",
                args: { operation: "close", outcome: "accepted", assessment: "Revised result received." },
              },
            ];
          return [];
        },
        false,
        async ({ session, manager, requests, notices }) => {
          await session.prompt("/freeflow profile coordinator");
          assert.equal(replay(manager.getBranch()).control, "manual");
          await session.reload();
          assert.equal(replay(manager.getBranch()).control, "manual");
          assert.equal(replay(manager.getBranch()).assignmentId, originalAssignment);
          await session.prompt("/freeflow profile auto");
          assert.equal(replay(manager.getBranch()).control, "automatic", JSON.stringify(notices));
          await session.prompt("Replace the old assignment with the revised result.");
          await session.waitForIdle();
          assert.equal(requests.length, 6);
          assert.equal(replay(manager.getBranch()).unitId, undefined);
        },
        withUI,
      );
    },
  );

test(
  "native compaction and attention preserve the original assessment and restore exact selected evidence",
  { timeout: 30000 },
  async () => {
    let handoff, ref;
    await fixture(
      (n, body, manager) => {
        if (n === 1)
          return [
            {
              name: "freeflow_delegate",
              args: { operation: "assign", contract: "Read the evidence, select it and return." },
            },
          ];
        if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
        if (n === 3) {
          ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
          return [
            { name: "freeflow_project", args: { operation: "add", refs: [ref] } },
            {
              name: "freeflow_return",
              args: { operation: "submit", report: "Review the selected source.", outcome: "completed" },
            },
          ];
        }
        if (n === 4) {
          handoff = replay(manager.getBranch()).assessment.handoffId;
          assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
          return [];
        }
        if (n === 5) {
          assert.doesNotMatch(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
          return [{ name: "freeflow_unit", args: { operation: "assess" } }];
        }
        if (n === 6) {
          assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
          assert.equal(replay(manager.getBranch()).assessment.handoffId, handoff);
          return [
            {
              name: "freeflow_unit",
              args: {
                operation: "close",
                outcome: "accepted",
                assessment: "Exact selected source recovered after native compaction.",
              },
            },
          ];
        }
        return [];
      },
      true,
      async ({ session, manager, requests }) => {
        await session.compact("Use the deterministic fixture summary.");
        assert.ok(manager.getEntries().some((e) => e.type === "compaction"));
        assert.ok(
          !manager.buildContextEntries().some((e) => "ctx:" + e.id === ref),
          "source is no longer in ordinary active context",
        );
        assert.equal(replay(manager.getBranch()).assessment.handoffId, handoff);
        await session.prompt("Return to the saved assessment.");
        await session.waitForIdle();
        assert.equal(requests.length, 7);
        assert.equal(replay(manager.getBranch()).unitId, undefined);
      },
    );
  },
);

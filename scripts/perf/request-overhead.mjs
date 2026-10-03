#!/usr/bin/env node
// Freeflow's request-path overhead in an in-process Pi, offline. See dev-docs/guides/performance.md.
//
// It opens a copy of a session (a generated one by default, or --session <path> for a real one), loads the built
// extension from pi-extension/dist (or --dist <dir> to compare another build), answers every model request from a
// scripted offline provider, and times each Freeflow event handler and each prompt end to end, in four scenarios:
// no Freeflow, Freeflow disabled, Freeflow defaults, and Cognitive Routing with projection plus Tool Execution.
//
//   npm run perf:request
//   npm run perf:request -- --session ~/.pi/agent/sessions/<dir>/<file>.jsonl --prompts 8
//   npm run perf:request -- --dist /path/to/other/build/pi-extension/dist
//   npm run perf:request -- --capture <dir>   (writes every provider request body per scenario, to compare builds)
//
// Numbers vary between machines and runs; compare builds on the same machine and session, and read the medians.
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const root = resolve(new URL("../..", import.meta.url).pathname);
const { values } = parseArgs({
  options: {
    session: { type: "string" },
    prompts: { type: "string", default: "6" },
    dist: { type: "string", default: join(root, "pi-extension/dist") },
    turns: { type: "string", default: "2000" },
    "compact-every": { type: "string", default: "150" },
    scenario: { type: "string" },
    capture: { type: "string" },
    json: { type: "boolean", default: false },
  },
});
const PROMPTS = Number(values.prompts);
const freeflow = (await import(pathToFileURL(join(resolve(values.dist), "index.js")).href)).default;
const { response } = await import(pathToFileURL(join(root, "pi-extension/tests/fixtures/routing-native.js")).href);

/**
 * A deterministic session of `turns` tool-using exchanges (user, assistant with a read call, its result, reply), with
 * a Pi compaction every `compactEvery` turns, so the file grows like a long real session while the live context stays
 * near one model window (about 150 turns, roughly 200k tokens).
 */
async function generateSession(path, turns, compactEvery) {
  let seed = 7;
  const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  let n = 0,
    parent = null;
  const id = () => (n++).toString(16).padStart(8, "0");
  const lines = [
    JSON.stringify({
      type: "session",
      version: 3,
      id: "perf-session",
      timestamp: new Date(0).toISOString(),
      cwd: "/perf",
    }),
  ];
  const push = (entry) => {
    const e = { ...entry, id: id(), parentId: parent, timestamp: new Date(n * 1000).toISOString() };
    parent = e.id;
    lines.push(JSON.stringify(e));
  };
  const usage = (input) => ({
    input,
    output: 200,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + 200,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  });
  const assistant = (content, stopReason, input) => ({
    role: "assistant",
    content,
    api: "openai-responses",
    provider: "openai",
    model: "gpt-4o",
    usage: usage(input),
    stopReason,
    timestamp: n * 1000,
  });
  push({ type: "model_change", provider: "openai", modelId: "gpt-4o" });
  for (let t = 0; t < turns; t++) {
    const call = `call_${t}`;
    if (t > 0 && compactEvery > 0 && t % compactEvery === 0) {
      // Keep the latest exchange raw, as Pi's own compaction keeps a recent tail.
      const kept = lines.length - 4;
      push({
        type: "compaction",
        summary: `Summary of turns before ${t}.`,
        firstKeptEntryId: JSON.parse(lines[kept]).id,
        tokensBefore: 200000,
      });
    }
    push({
      type: "message",
      message: {
        role: "user",
        content: [{ type: "text", text: `Step ${t}: read the next file.` }],
        timestamp: n * 1000,
      },
    });
    push({
      type: "message",
      message: assistant(
        [{ type: "toolCall", id: call, name: "read", arguments: { path: `src/file-${t}.ts` } }],
        "toolUse",
        1000 + t * 10,
      ),
    });
    const size = 1000 + Math.floor(random() * 9000);
    push({
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: call,
        toolName: "read",
        content: [{ type: "text", text: "x".repeat(size) }],
        isError: false,
        timestamp: n * 1000,
      },
    });
    push({
      type: "message",
      message: assistant([{ type: "text", text: `Read file ${t}.` }], "stop", 1000 + t * 10 + size / 4),
    });
  }
  await writeFile(path, lines.join("\n") + "\n");
}

async function run(label, config, sessionPath) {
  const dir = await mkdtemp(join(tmpdir(), "freeflow-perf-"));
  const cwd = join(dir, "cwd"),
    agentDir = join(dir, "agent"),
    sessions = join(dir, "sessions");
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await mkdir(agentDir);
  await mkdir(sessions);
  if (config) await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config));
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({ providers: { openai: { baseUrl: "https://perf.invalid/v1" } } }),
  );
  const copy = join(sessions, "session.jsonl");
  await copyFile(sessionPath, copy);
  const priorFetch = globalThis.fetch,
    offline = process.env.PI_OFFLINE;
  let requests = 0;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    if (values.capture) bodies.push(typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? null));
    return response(++requests, [], "ok", { input_tokens: 1000, output_tokens: 2, total_tokens: 1002 });
  };
  process.env.PI_OFFLINE = "1";
  const timings = new Map();
  const timed = (pi) =>
    new Proxy(pi, {
      get(target, key) {
        const value = target[key];
        if (key !== "on") return typeof value === "function" ? value.bind(target) : value;
        return (event, handler) =>
          target.on(event, async (...args) => {
            const start = performance.now();
            try {
              return await handler(...args);
            } finally {
              timings.set(event, [...(timings.get(event) ?? []), performance.now() - start]);
            }
          });
      },
    });
  const walks = { count: 0 };
  const getBranch = SessionManager.prototype.getBranch;
  SessionManager.prototype.getBranch = function (...args) {
    walks.count++;
    return getBranch.apply(this, args);
  };
  let session;
  try {
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: join(agentDir, "models.json"),
      modelsStorePath: join(agentDir, "models-store.json"),
      allowModelNetwork: false,
    });
    await modelRuntime.setRuntimeApiKey("openai", "perf-not-a-real-key");
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
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
      extensionFactories: config === undefined ? [] : [(pi) => freeflow(timed(pi))],
    });
    await loader.reload();
    const manager = SessionManager.open(copy, sessions, cwd);
    const startedAt = performance.now();
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
    await session.bindExtensions({
      mode: "print",
      onError: () => {},
      uiContext: { notify: () => {}, setStatus: () => {} },
    });
    const startMs = performance.now() - startedAt;
    const walls = [],
      walksPerPrompt = [],
      errors = [];
    for (let i = 0; i < PROMPTS; i++) {
      const before = walks.count,
        start = performance.now();
      await session.prompt(`Benchmark prompt ${i + 1}: reply ok.`);
      await session.waitForIdle();
      walls.push(performance.now() - start);
      walksPerPrompt.push(walks.count - before);
      const last = session.messages.at(-1);
      if (last?.stopReason === "error") errors.push(String(last.errorMessage).slice(0, 200));
    }
    if (values.capture) {
      await mkdir(values.capture, { recursive: true });
      // The run directory and the ids Pi gives entries created during the run differ per run; replace them (ids by
      // order of first appearance) so captures of two builds compare byte for byte.
      const ids = new Map();
      const text =
        bodies
          .join("\n")
          .replaceAll(dir, "<run>")
          .replace(/ctx:([0-9a-f]{8})/g, (_, id) => `ctx:#${ids.get(id) ?? ids.set(id, ids.size).get(id)}`) + "\n";
      await writeFile(join(values.capture, `${label.replace(/[^a-z0-9]+/gi, "-")}.jsonl`), text);
    }
    return { label, entries: manager.getEntries().length, startMs, walls, walksPerPrompt, timings, errors };
  } finally {
    SessionManager.prototype.getBranch = getBranch;
    session?.dispose();
    globalThis.fetch = priorFetch;
    if (offline === undefined) delete process.env.PI_OFFLINE;
    else process.env.PI_OFFLINE = offline;
    await rm(dir, { recursive: true, force: true });
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const ms = (x) => `${x.toFixed(1)} ms`;
const profiles = {
  coordinator: { provider: "openai", model: "gpt-4o", thinking: "off" },
  executor: { provider: "openai", model: "gpt-4.1-mini", thinking: "off" },
};
const scenarios = [
  ["no Freeflow", undefined],
  ["Freeflow disabled", { enabled: false }],
  ["Freeflow defaults", {}],
  [
    "routing + projection + Tool Execution",
    { toolExecution: { enabled: true }, cognitiveRouting: { enabled: true, projection: true, profiles } },
  ],
].filter(([label]) => !values.scenario || label.startsWith(values.scenario));

let sessionPath = values.session && resolve(values.session.replace(/^~/, process.env.HOME));
let generated;
if (!sessionPath) {
  generated = await mkdtemp(join(tmpdir(), "freeflow-perf-session-"));
  sessionPath = join(generated, "session.jsonl");
  await generateSession(sessionPath, Number(values.turns), Number(values["compact-every"]));
}
const results = [];
try {
  for (const [label, config] of scenarios) results.push(await run(label, config, sessionPath));
} finally {
  if (generated) await rm(generated, { recursive: true, force: true });
}

const baseline = results.find((r) => r.label === "no Freeflow");
const summary = results.map((r) => {
  const prompt = median(r.walls.slice(1));
  const handlers = Object.fromEntries(
    [...r.timings].map(([event, list]) => [
      event,
      { calls: list.length, median: median(list), total: list.reduce((a, b) => a + b, 0) },
    ]),
  );
  return {
    scenario: r.label,
    entries: r.entries,
    promptMedianMs: prompt,
    addedByFreeflowMs: baseline && r !== baseline ? prompt - median(baseline.walls.slice(1)) : undefined,
    sessionStartMs: r.startMs,
    freeflowSessionStartMs: Math.max(0, ...(r.timings.get("session_start") ?? [0])),
    piBranchWalksPerPrompt: median(r.walksPerPrompt.slice(1)),
    handlers,
    errors: r.errors,
  };
});
if (values.json)
  console.log(
    JSON.stringify(
      { session: values.session ?? `generated, ${values.turns} turns`, prompts: PROMPTS, summary },
      null,
      2,
    ),
  );
else {
  console.log(
    `Session: ${values.session ?? `generated, ${values.turns} tool-using turns, compacted every ${values["compact-every"]}`}; ${PROMPTS} prompts per scenario; medians exclude the first prompt.\n`,
  );
  for (const s of summary) {
    console.log(`${s.scenario} (${s.entries} entries)`);
    console.log(
      `  prompt ${ms(s.promptMedianMs)}${s.addedByFreeflowMs !== undefined ? `, Freeflow adds ${ms(s.addedByFreeflowMs)}` : ""}; session start ${ms(s.sessionStartMs)} (Freeflow ${ms(s.freeflowSessionStartMs)}); Pi branch walks per prompt ${s.piBranchWalksPerPrompt}`,
    );
    for (const [event, h] of Object.entries(s.handlers).filter(
      ([e]) => !["session_start", "resources_discover"].includes(e),
    ))
      if (h.median >= 0.1 || h.total >= 1)
        console.log(`    ${event.padEnd(24)} median ${ms(h.median)} over ${h.calls} calls`);
    for (const error of s.errors)
      console.log(`  ! a prompt ended in error, so this scenario is not measuring a normal request: ${error}`);
  }
}

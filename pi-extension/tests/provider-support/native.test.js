import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
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
import { registerProviderSupport } from "../../dist/provider-support/index.js";
import { ENTRY_TYPE } from "../../dist/provider-support/astra/history.js";
import { response } from "../fixtures/routing-native.js";

async function native(extension, run) {
  const root = await mkdtemp(join(tmpdir(), "astra-native-")),
    agentDir = join(root, "agent");
  await mkdir(agentDir);
  const previousFetch = globalThis.fetch,
    requests = [],
    errors = [];
  let session;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/api\.openai\.com\/v1\/responses$/);
    requests.push(JSON.parse(String(init.body)));
    assert.ok(requests.length <= 12);
    return response(requests.length, [], "OK");
  };
  try {
    const runtime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(agentDir, "models.json"),
      allowModelNetwork: false,
    });
    await runtime.setRuntimeApiKey("openai", "fixture-only-key");
    const settings = SettingsManager.inMemory({
      transport: "sse",
      compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 1 },
      retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    });
    const manager = SessionManager.create(root, join(root, "sessions"));
    let cancelCompaction = false;
    const loader = new DefaultResourceLoader({
      cwd: root,
      agentDir,
      settingsManager: settings,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: "Reply OK.",
      extensionFactories: [
        extension,
        (pi) =>
          pi.on("session_before_compact", () =>
            cancelCompaction
              ? { cancel: true }
              : {
                  compaction: {
                    summary: "Older material summarized.",
                    firstKeptEntryId: manager.getLeafId(),
                    tokensBefore: 100,
                  },
                },
          ),
      ],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    ({ session } = await createAgentSession({
      cwd: root,
      agentDir,
      modelRuntime: runtime,
      model: runtime.getModel("openai", "gpt-6-astra"),
      thinkingLevel: "low",
      settingsManager: settings,
      sessionManager: manager,
      resourceLoader: loader,
      tools: [],
    }));
    await session.bindExtensions({ mode: "print", onError: (e) => errors.push(e) });
    const prompt = async (text, effort) => {
      if (effort) session.setThinkingLevel(effort);
      await session.prompt(text);
      await session.waitForIdle();
      assert.equal(session.messages.at(-1)?.stopReason, "stop");
      assert.deepEqual(errors, []);
      return requests.at(-1);
    };
    await run({
      session,
      manager,
      requests,
      prompt,
      root,
      cancelCompaction: () => {
        cancelCompaction = true;
      },
    });
    assert.deepEqual(errors, []);
  } finally {
    session?.dispose();
    globalThis.fetch = previousFetch;
    await rm(root, { recursive: true, force: true });
  }
}
const updates = (p) =>
  p.input.flatMap((x, i) => (x.type === "configuration_update" ? [{ index: i, effort: x.reasoning.effort }] : []));

test("real Pi request dispatch, reload, native tree navigation and compaction", { timeout: 30000 }, async () => {
  await native(registerProviderSupport, async ({ session, manager, requests, prompt }) => {
    await prompt("first", "low");
    const high = await prompt("second", "high");
    assert.equal(high.reasoning.effort, "low");
    assert.equal(session.thinkingLevel, "high");
    assert.deepEqual(updates(high), [{ index: 3, effort: "high" }]);
    await session.reload();
    const low = await prompt("third", "low");
    assert.deepEqual(low.input.slice(0, high.input.length), high.input);
    assert.deepEqual(updates(low), [
      { index: 3, effort: "high" },
      { index: 6, effort: "low" },
    ]);
    const branchPoint = manager
      .getBranch()
      .find((e) => e.message?.role === "user" && e.message.content?.some?.((b) => b.text === "second"));
    assert.ok(branchPoint);
    // Native tree navigation selects real ancestry; the discarded later Low update must not survive.
    await session.navigateTree(branchPoint.id, { summarize: false });
    const sibling = await prompt("sibling", "medium");
    assert.ok(updates(sibling).every((x) => x.effort !== "low"));
    await session.compact();
    const compacted = await prompt("after summary", "high");
    assert.equal(compacted.reasoning.effort, "high");
    assert.deepEqual(updates(compacted), []);
    const persisted = await readFile(manager.getSessionFile(), "utf8");
    assert.ok(persisted.includes(ENTRY_TYPE));
    assert.ok(!manager.getBranch().some((e) => e.customType === "freeflow-routing-v2"));
    assert.equal(requests.length, 5);
  });
});

test(
  "the Freeflow extension adapts Astra without repository activation or Cognitive Routing",
  { timeout: 30000 },
  async () => {
    await native(freeflow, async ({ session, manager, prompt }) => {
      await prompt("one", "low");
      const p = await prompt("two", "high");
      assert.equal(p.reasoning.effort, "low");
      assert.equal(session.thinkingLevel, "high");
      assert.ok(updates(p).some((x) => x.effort === "high"));
      assert.ok(manager.getBranch().some((e) => e.customType === ENTRY_TYPE));
      assert.ok(!manager.getBranch().some((e) => e.customType === "freeflow-routing-v2"));
      assert.ok(!(p.tools ?? []).some((t) => t.name.startsWith("freeflow_")));
    });
  },
);

test(
  "rapid native effort changes coalesce and cancelled compaction releases adaptation",
  { timeout: 30000 },
  async () => {
    await native(registerProviderSupport, async ({ session, prompt, cancelCompaction }) => {
      await prompt("first", "low");
      session.setThinkingLevel("high");
      session.setThinkingLevel("max");
      session.setThinkingLevel("medium");
      const medium = await prompt("second");
      assert.deepEqual(updates(medium), [{ index: 3, effort: "medium" }]);
      cancelCompaction();
      await assert.rejects(session.compact(), /cancelled/);
      const high = await prompt("third", "high");
      assert.equal(high.reasoning.effort, "low");
      assert.equal(updates(high).at(-1).effort, "high");
    });
  },
);

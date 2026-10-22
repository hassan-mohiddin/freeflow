import assert from "node:assert/strict";
import test from "node:test";
import { anthropicResponse, fixture } from "../fixtures/routing-native.js";

// Pi 1.2.0 counts a run as started from before_agent_start on, and fires that event for runs an extension's message
// starts (messageType "custom"). These native fixtures pin what Pi does there and what Freeflow does on top of it.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, what) => {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await wait(25);
  }
  assert.fail(`timed out waiting for ${what}`);
};
const read = { name: "read", args: { path: "evidence.txt" } };
const wake = { customType: "fixture-wake", content: "wake", display: true, details: {} };
const systemOf = (body) =>
  JSON.stringify((body.input ?? []).filter((item) => item.role === "system" || item.role === "developer"));
// One extension sets its section for every run; another only for prompts, as extensions written before Pi 1.2.0 do.
const sectionExtensions = [
  (pi) =>
    pi.on("before_agent_start", (event) => {
      event.systemPromptOptions.sections.every_run = "SECTION_EVERY_RUN";
    }),
  (pi) =>
    pi.on("before_agent_start", (event) => {
      if (event.messageType !== "custom") event.systemPromptOptions.sections.prompt_only = "SECTION_PROMPT_ONLY";
    }),
];
// A run the message starts makes two requests: one that reads, then one that ends.
const twoRuns = async (n) => [[read], [], [read], []][n - 1] ?? [];

test(
  "Pi keeps a section its handler sets for every run on a run a message starts, and drops one set only for prompts",
  { timeout: 30000 },
  async () => {
    // Pi #10267, fixed in 1.2.0: a section set in before_agent_start is no longer removed after the first tool call of
    // a run a message starts, as long as the handler sets it for that run too. Freeflow does, so it no longer needs
    // keepSections for its own sections there; a section set only for prompts is still removed.
    await fixture(
      twoRuns,
      false,
      async ({ session, requests }) => {
        await session.sendCustomMessage(wake, { triggerTurn: true });
        await until(() => requests.length >= 4, "the message's run to make two requests");
        await session.waitForIdle();
        for (const body of requests) assert.match(systemOf(body), /SECTION_EVERY_RUN/);
        for (const body of requests.slice(0, 2)) assert.match(systemOf(body), /SECTION_PROMPT_ONLY/);
        for (const body of requests.slice(2)) assert.doesNotMatch(systemOf(body), /SECTION_PROMPT_ONLY/);
      },
      true,
      { skipFreeflow: true, cognitiveRouting: { enabled: false }, extensions: sectionExtensions },
    );
  },
);

test(
  "with Freeflow, a run a message starts keeps another extension's prompt-only section and its whole prompt",
  { timeout: 30000 },
  async () => {
    await fixture(
      twoRuns,
      false,
      async ({ session, requests }) => {
        await session.sendCustomMessage(wake, { triggerTurn: true });
        await until(() => requests.length >= 4, "the message's run to make two requests");
        await session.waitForIdle();
        assert.match(systemOf(requests[0]), /SECTION_PROMPT_ONLY/);
        assert.match(systemOf(requests[0]), /<freeflow_guidance>/);
        for (const body of requests.slice(1)) assert.equal(systemOf(body), systemOf(requests[0]));
      },
      true,
      { cognitiveRouting: { enabled: false }, extensions: sectionExtensions },
    );
  },
);

// Claude Sonnet 5.5 as Pi's remote catalog publishes it; it takes system updates mid-conversation, so a section change
// is a patch at its own position and an earlier request must stay the start of a later one.
const SONNET = {
  id: "claude-sonnet-5-5",
  name: "Claude Sonnet 5.5",
  api: "anthropic-messages",
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  contextWindow: 1000000,
  maxTokens: 128000,
  thinkingLevelMap: {
    off: null,
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
  },
  compat: {
    supportsMidConvoEffort: true,
    supportsMidConvoSystemMessages: true,
    supportsMidConvoToolChanges: true,
    forceAdaptiveThinking: true,
    supportsTemperature: false,
    supportsStrictTools: true,
  },
  promptCache: { short: 300, long: 3600 },
  type: "chat",
};
const strip = (value) => JSON.parse(JSON.stringify(value, (key, v) => (key === "cache_control" ? undefined : v)));

test(
  "Freeflow's guidance changed before a run a message starts reaches that run, and each request extends the last",
  { timeout: 30000 },
  async () => {
    const ROUTING_LINE = /For Cognitive Routing, follow the latest control/;
    await fixture(
      async (n) => (n === 2 ? [read] : []),
      false,
      async ({ session, requests }) => {
        assert.match(JSON.stringify(requests[0].system), ROUTING_LINE);
        // A thinking change outside routing turns routing off for the session, which changes Freeflow's guidance.
        session.setThinkingLevel("high");
        await wait(50);
        await session.sendCustomMessage(wake, { triggerTurn: true });
        await until(() => requests.length >= 3, "the message's run to make two requests");
        await session.waitForIdle();
        await session.prompt("Next.");
        await session.waitForIdle();
        assert.equal(requests.length, 4);
        // The message's run carries the new guidance (a patch after the earlier turns), and the next prompt adds none.
        const patches = (body) => JSON.stringify(body.messages).split("freeflow_guidance").length - 1;
        assert.ok(patches(requests[1]) > patches(requests[0]), "the message's run carries the guidance change");
        assert.doesNotMatch(JSON.stringify(requests[1].messages.slice(-1)), ROUTING_LINE);
        assert.equal(patches(requests[3]), patches(requests[1]));
        for (let i = 1; i < requests.length; i++)
          assert.deepEqual(
            strip(requests[i].messages.slice(0, requests[i - 1].messages.length)),
            strip(requests[i - 1].messages),
            `request ${i + 1} extends request ${i}`,
          );
      },
      true,
      {
        model: ["anthropic", "claude-sonnet-5-5"],
        thinkingLevel: "low",
        modelsStore: { anthropic: { models: [SONNET], checkedAt: Date.now(), lastModified: 4102444800000 } },
        cognitiveRouting: {
          enabled: true,
          projection: false,
          profiles: {
            coordinator: { provider: "anthropic", model: "claude-sonnet-5-5", thinking: "low" },
            executor: { provider: "anthropic", model: "claude-sonnet-5-5", thinking: "medium" },
          },
        },
        response: (n, calls, body) => anthropicResponse(n, calls, { model: body.model }),
      },
    );
  },
);

test(
  "a skill command run while a run is starting is queued to follow it, not refused",
  { timeout: 30000 },
  async () => {
    // From Pi 1.2.0 the session is busy during before_agent_start, and Pi refuses a user message sent then without
    // deliverAs ("Agent is already processing"); the fixture fails on any such extension error.
    let session;
    let sent = false;
    await fixture(
      async () => [],
      false,
      async ({ requests }) => {
        await until(() => requests.length >= 2, "the queued skill prompt's request");
        assert.doesNotMatch(JSON.stringify(requests[0]), /FIXTURE_SKILL_ARGS/);
        assert.match(JSON.stringify(requests.at(-1)), /FIXTURE_SKILL_ARGS/);
      },
      true,
      {
        cognitiveRouting: { enabled: false },
        onSession: (value) => void (session = value),
        extensions: [
          (pi) =>
            pi.on("before_agent_start", async () => {
              if (sent) return;
              sent = true;
              await session.prompt("/review-work FIXTURE_SKILL_ARGS");
            }),
        ],
      },
    );
  },
);

import assert from "node:assert/strict";
import test from "node:test";
import { anthropicResponse, fixture } from "../fixtures/routing-native.js";
import { anthropicLayout } from "../../dist/provider-support/cache/anthropic.js";

// Claude Sonnet 5.5 reaches Pi 0.87.1 through its remote catalog; this is that catalog entry as published.
const SONNET_5_5 = {
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
const modelsStore = { anthropic: { models: [SONNET_5_5], checkedAt: Date.now(), lastModified: 4102444800000 } };

const LOOKBACK = 20;
const strip = (value) =>
  JSON.parse(JSON.stringify(value ?? null, (key, v) => (key === "cache_control" ? undefined : v)));
const byName = (tools) => [...(tools ?? [])].sort((a, b) => a.name.localeCompare(b.name));
const markers = (body) => JSON.stringify(body).split('"cache_control"').length - 1;
const profileOf = (body) =>
  JSON.stringify(body.messages)
    .split("# Cognitive Routing Runtime State")
    .at(-1)
    .match(/Profile: (coordinator|helper|executor)/)[1];
const REASONING = /^reasoning (\d+)$/;

// The two-assignment script from the OpenAI prefix test: Helper and Executor each read, select evidence, and return.
function script(projection) {
  return (n, _body, manager) => {
    const readRef = () =>
      "ctx:" +
      manager
        .getBranch()
        .filter((e) => e.message?.toolName === "read")
        .at(-1).id;
    if (n === 1)
      return [
        {
          name: "freeflow_delegate",
          args: { operation: "assign", worker: "helper", contract: "Read evidence.txt and select its result." },
        },
      ];
    if (n === 2 || n === 6) return [{ name: "read", args: { path: "evidence.txt" } }];
    if (n === 3 || n === 7)
      return [
        ...(projection ? [{ name: "freeflow_project", args: { operation: "add", refs: [readRef()] } }] : []),
        { name: "freeflow_return", args: { operation: "submit", report: "Evidence read.", outcome: "completed" } },
      ];
    if (n === 4 || n === 8)
      return [
        { name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Evidence checked." } },
      ];
    if (n === 5)
      return [
        {
          name: "freeflow_delegate",
          args: { operation: "assign", worker: "executor", contract: "Read evidence.txt and return." },
        },
      ];
    return [];
  };
}

/**
 * Run the script on Claude and check, for every request, what its provider cache and thinking blocks need:
 * - it carries another profile's reasoning only from the same model under the same view (D-002);
 * - the previous request from the same model and view is a prefix of this one, so its cache entry still matches;
 * - that entry stays within the lookback of a breakpoint, so the provider can actually read it;
 * - no more than four breakpoints, the Messages API limit;
 * - every signed thinking block is replayed after exactly the conversation that produced it, so the API
 *   keeps it instead of dropping it and every later block (Pi sends prefix_mismatch_behavior: drop_block).
 */
async function run(profiles, projection) {
  const viewOf = (profile) => (!projection ? "shared" : profile === "coordinator" ? "coordinator" : "worker");
  const requests = [],
    producers = new Map(),
    lanes = new Map(),
    findings = [];
  const check = (n, body) => {
    // Profiles on one model and one view send the same conversation, so they extend one cache entry.
    const profile = profileOf(body);
    const lane = `${body.model}/${viewOf(profile)}`;
    const previous = lanes.get(lane);
    if (markers(body) > 4) findings.push(`request ${n} (${lane}) has ${markers(body)} cache breakpoints`);
    if (previous) {
      const prefix = strip(previous.messages);
      if (JSON.stringify(strip(body.tools)) !== JSON.stringify(strip(previous.tools)))
        findings.push(`request ${n} (${lane}) changed tool definitions`);
      if (JSON.stringify(strip(body.system)) !== JSON.stringify(strip(previous.system)))
        findings.push(`request ${n} (${lane}) changed the system prompt`);
      const head = strip(body.messages.slice(0, prefix.length));
      const diverged = head.findIndex((m, i) => JSON.stringify(m) !== JSON.stringify(prefix[i]));
      if (diverged >= 0) findings.push(`request ${n} (${lane}) rewrote message ${diverged} of its previous request`);
      const before = anthropicLayout(previous),
        after = anthropicLayout(body);
      const entry = before.layout.breakpoints.at(-1);
      const reach = after.layout.breakpoints.find((p) => p >= entry);
      if (after.layout.chain[entry] !== before.layout.chain[entry])
        findings.push(`request ${n} (${lane}) no longer matches its previous cache entry`);
      else if (reach === undefined || reach - entry > LOOKBACK)
        findings.push(`request ${n} (${lane}) left its previous cache entry ${reach - entry} positions back`);
    }
    lanes.set(lane, body);
    body.messages.forEach((message, m) =>
      message.content?.forEach?.((block, b) => {
        // Reasoning reaches a request either as a signed block or, across models, as the host's plain text.
        const from =
          block.type === "thinking"
            ? producers.get(block.signature)
            : block.type === "text" && REASONING.test(block.text)
              ? producers.get(`sig-${block.text.match(REASONING)[1]}`)
              : undefined;
        if (
          from &&
          from.profile !== profile &&
          !(from.model === body.model && viewOf(from.profile) === viewOf(profile))
        )
          findings.push(`request ${n} (${profile}) carries ${from.profile} reasoning from request ${from.n}`);
        if (block.type !== "thinking") return;
        const origin = producers.get(block.signature);
        if (!origin || origin.model !== body.model) return;
        const replayed = {
          system: strip(body.system),
          tools: byName(strip(body.tools)),
          messages: [
            ...strip(body.messages.slice(0, m)),
            ...(b ? [{ ...message, content: message.content.slice(0, b) }] : []),
          ],
        };
        const produced = {
          system: strip(origin.system),
          tools: byName(strip(origin.tools)),
          messages: strip(origin.messages),
        };
        if (JSON.stringify(strip(replayed)) !== JSON.stringify(produced))
          findings.push(`request ${n} (${lane}) replays request ${origin.n}'s thinking after a different conversation`);
      }),
    );
  };
  const result = await fixture(script(projection), projection, undefined, false, {
    model: ["anthropic", profiles.coordinator.model],
    thinkingLevel: profiles.coordinator.thinking,
    modelsStore,
    freeflowConfig: { toolExecution: { enabled: false } },
    cognitiveRouting: { enabled: true, projection, delegation: "both", profiles },
    response: (n, calls, body) => {
      requests.push(body);
      producers.set(`sig-${n}`, {
        n,
        profile: profileOf(body),
        model: body.model,
        system: body.system,
        tools: body.tools,
        messages: body.messages,
      });
      check(n, body);
      return anthropicResponse(n, calls, { thinking: `reasoning ${n}`, model: body.model });
    },
  });
  assert.equal(result.requests.length, 9);
  return { requests, findings };
}

const mixed = {
  coordinator: { provider: "anthropic", model: "claude-opus-5-5", thinking: "xhigh" },
  helper: { provider: "anthropic", model: "claude-haiku-4-5", thinking: "low" },
  executor: { provider: "anthropic", model: "claude-sonnet-5-5", thinking: "low" },
};
const sameModel = {
  coordinator: { provider: "anthropic", model: "claude-opus-5-5", thinking: "xhigh" },
  helper: { provider: "anthropic", model: "claude-opus-5-5", thinking: "low" },
  executor: { provider: "anthropic", model: "claude-opus-5-5", thinking: "medium" },
};

for (const [name, profiles] of [
  ["Opus 5.5 Coordinator with Haiku and Sonnet 5.5 workers", mixed],
  ["Opus 5.5 for every profile at different effort", sameModel],
])
  for (const projection of [false, true])
    test(
      `Claude routing keeps caches valid and reasoning private: ${name}, projection=${projection}`,
      { timeout: 30000 },
      async () => {
        const { requests, findings } = await run(profiles, projection);
        assert.ok(
          requests.every((body) => body.model !== "claude-opus-5-5" || body.thinking?.block_binding),
          "managed-effort Claude requests carry Pi's thinking binding",
        );
        assert.deepEqual(findings, []);
      },
    );

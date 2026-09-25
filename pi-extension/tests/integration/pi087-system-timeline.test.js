import assert from "node:assert/strict";
import test from "node:test";

import { fixture } from "../fixtures/routing-native.js";

async function observe(skipFreeflow, routing = { enabled: false }) {
  let turns = 0;
  const timeline = [];
  const promptSection = (pi) =>
    pi.on("before_agent_start", (event) => {
      turns += 1;
      event.systemPromptOptions.sections.probe_marker = turns === 1 ? "PROBE_ALPHA" : "PROBE_BETA";
    });
  const observer = (pi) =>
    pi.on("context_with_system", (event) => {
      const systems = event.messages.filter((message) => message.role === "system");
      timeline.push({
        roles: event.messages.map((message) => message.role),
        systemCount: systems.length,
        alphaAt: event.messages.findIndex((message) => JSON.stringify(message).includes("PROBE_ALPHA")),
        betaAt: event.messages.findIndex((message) => JSON.stringify(message).includes("PROBE_BETA")),
        firstSections: systems[0]?.sections,
      });
    });
  const result = await fixture(
    (request) => {
      assert.ok(request <= 2);
      return [];
    },
    false,
    async ({ session }) => {
      await session.prompt("Second turn, after the prompt section changes.");
      await session.waitForIdle();
    },
    false,
    {
      ...(routing === null ? {} : { cognitiveRouting: routing }),
      freeflowConfig: {},
      skipFreeflow,
      beforeExtensions: [promptSection],
      extensions: [observer],
      maxRequests: 2,
    },
  );
  return { timeline, requests: result.requests };
}

test("Pi 0.87.1 preserves the structured system timeline through Freeflow context assembly", async () => {
  const control = await observe(true);
  assert.equal(control.timeline[1].systemCount, 2, "host control retains the original and the section patch");
  assert.equal(control.timeline[1].alphaAt, 0);
  assert.ok(control.timeline[1].betaAt > 0);

  const candidate = await observe(false);
  assert.equal(candidate.timeline[0].systemCount, 1);
  assert.equal(candidate.timeline[1].systemCount, 2, "Freeflow must not flatten the historical system patch");
  assert.equal(candidate.timeline[1].alphaAt, 0);
  assert.ok(candidate.timeline[1].betaAt > 0);
  assert.deepEqual(candidate.timeline[0].firstSections, candidate.timeline[1].firstSections);
  assert.ok(candidate.timeline[1].roles.at(0) === "system");
  assert.ok(candidate.requests[1].input.some((message) => JSON.stringify(message).includes("PROBE_BETA")));
});

test("Freeflow retains a later native tool-loadout patch instead of moving it into the first system message", async () => {
  let turns = 0;
  const timeline = [];
  const probe = (pi) => {
    pi.registerTool({
      name: "timeline_probe",
      label: "Timeline probe",
      description: "A deterministic tool used only to observe a later tool-loadout patch.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      async execute() {
        return { content: [{ type: "text", text: "probe" }], details: undefined };
      },
    });
    pi.on("before_agent_start", (event) => {
      turns += 1;
      if (turns === 1)
        event.systemPromptOptions.selectedTools = event.systemPromptOptions.selectedTools.filter(
          (name) => name !== "timeline_probe",
        );
      else
        event.systemPromptOptions.selectedTools = [
          ...event.systemPromptOptions.selectedTools.filter((name) => name !== "timeline_probe"),
          "timeline_probe",
        ];
    });
  };
  const after = (pi) =>
    pi.on("context_with_system", (event) => {
      timeline.push(event.messages.filter((message) => message.role === "system"));
    });
  const result = await fixture(
    (request) => {
      assert.ok(request <= 2);
      return [];
    },
    false,
    async ({ session }) => {
      await session.prompt("Use the updated tool declarations.");
      await session.waitForIdle();
    },
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: {},
      beforeExtensions: [probe],
      extensions: [after],
      maxRequests: 2,
    },
  );
  assert.equal(timeline[0].length, 1);
  assert.equal(timeline[1].length, 2);
  assert.equal(
    timeline[0][0].toolsAdded?.some((tool) => tool.name === "timeline_probe"),
    false,
  );
  assert.equal(
    timeline[1][1].toolsAdded?.some((tool) => tool.name === "timeline_probe"),
    true,
  );
  assert.equal(
    result.requests[0].tools.some((tool) => tool.name === "timeline_probe"),
    false,
  );
  assert.equal(
    result.requests[1].tools.some((tool) => tool.name === "timeline_probe"),
    true,
  );
});

test("unchanged Freeflow guidance keeps the provider-facing system head byte-identical across turns", async () => {
  const result = await fixture(
    (request) => {
      assert.ok(request <= 2);
      return [];
    },
    false,
    async ({ session }) => {
      await session.prompt("Second turn with unchanged guidance.");
      await session.waitForIdle();
    },
    false,
    { cognitiveRouting: { enabled: false }, freeflowConfig: {}, maxRequests: 2 },
  );
  const [first, second] = result.requests.map((request) => request.input.find((message) => message.role === "system"));
  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(second, first);
});

test("Freeflow request replay respects Pi's native content edit in the provider request", async () => {
  const original = "UNIQUE_HOST_EDIT_SENTINEL";
  await fixture(
    (request, wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: `printf ${original}` } }];
      if (request === 2) return [];
      if (request === 3) {
        const toolResults = wire.input.filter((message) => message.type === "function_call_output");
        assert.equal(toolResults.length, 1);
        assert.doesNotMatch(JSON.stringify(toolResults), /UNIQUE_HOST_EDIT_SENTINEL/);
        assert.match(JSON.stringify(toolResults), /REDACTED_CONTEXT_EDIT/);
        // A native edit of a tool result does not erase the assistant's tool-call arguments.
        assert.match(JSON.stringify(wire.input), /UNIQUE_HOST_EDIT_SENTINEL/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ session, manager }) => {
      const target = manager
        .getBranch()
        .find(
          (entry) =>
            entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === "bash",
        );
      assert.ok(target?.id);
      manager.appendContextEdit(target.id, { content: "REDACTED_CONTEXT_EDIT" });
      await session.prompt("Continue after the native context edit.");
      await session.waitForIdle();
    },
    false,
    { cognitiveRouting: { enabled: false }, freeflowConfig: {}, maxRequests: 3 },
  );
});

test("Cognitive Routing projection retains Pi's structured prompt timeline", async () => {
  const candidate = await observe(false, null); // fixture's real two-profile Cognitive Routing configuration
  assert.equal(candidate.timeline[1].systemCount, 2);
  assert.equal(candidate.timeline[1].alphaAt, 0);
  assert.ok(candidate.timeline[1].betaAt > 0);
  assert.deepEqual(candidate.timeline[0].firstSections, candidate.timeline[1].firstSections);
  assert.ok(candidate.requests[1].input.some((message) => JSON.stringify(message).includes("PROBE_BETA")));
});

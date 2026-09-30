import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

const PREAMBLE =
  "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";

// An unrelated extension's tool guideline must survive Freeflow's rules section.
const guidedTool = (pi) =>
  pi.registerTool({
    name: "probe_guided",
    label: "probe_guided",
    description: "probe",
    parameters: { type: "object", properties: {} },
    promptGuidelines: ["Probe guideline stays in the rules."],
    async execute() {
      return { content: [{ type: "text", text: "ok" }] };
    },
  });

// Anthropic sends system blocks; OpenAI Responses sends the system prompt as the first input message.
function systemText(body) {
  if (Array.isArray(body.system)) return body.system.map((block) => block.text).join("\n");
  const first = (body.input ?? []).find((message) => message.role === "system" || message.role === "developer");
  if (typeof first?.content === "string") return first.content;
  return (first?.content ?? []).map((part) => part.text ?? "").join("\n");
}

for (const model of [
  ["anthropic", "claude-opus-5-5"],
  ["openai", "gpt-4o"],
]) {
  test(`Tool Execution owns Pi's generic rules and docs and adds environment facts (${model[0]})`, async () => {
    await fixture(
      async () => [],
      false,
      async ({ session, requests }) => {
        await session.prompt("Second request.");
        await session.waitForIdle();
        const [first, second] = requests.map(systemText);
        assert.equal(second, first, "system text is identical across requests");
        // The later request starts with everything the earlier one sent (cache breakpoints move; ignore them).
        const history = (body) =>
          JSON.parse(
            JSON.stringify(body.messages ?? body.input, (key, value) => (key === "cache_control" ? undefined : value)),
          );
        const [earlier, later] = requests.map(history);
        assert.deepEqual(later.slice(0, earlier.length), earlier);
        assert.deepEqual(requests[1].tools, requests[0].tools);
        assert.ok(first.startsWith(PREAMBLE), "Pi's preamble is unchanged");
        for (const removed of [
          "Use read to examine files instead of cat or sed.",
          "Be concise in your responses",
          "Show file paths clearly when working with files",
        ])
          assert.doesNotMatch(first, new RegExp(removed.replace(/[.]/g, "\\.")));
        assert.match(first, /- Use edit for precise changes/);
        assert.match(first, /- Probe guideline stays in the rules\./);
        assert.match(
          first,
          /<docs>\nPi documentation \(read only when the user asks about pi itself\): \S+README\.md, \S+docs, \S+examples\.\n<\/docs>/,
        );
        assert.match(
          first,
          /<\/freeflow_guidance>\n\n<environment>\nPlatform: \w+ \S+\. Shell for bash: \S+\.\n<\/environment>\n\n<tool_execution>\n# Working In The Environment\n/,
        );
      },
      true,
      {
        model,
        freeflowConfig: { toolExecution: { enabled: true } },
        cognitiveRouting: { enabled: false },
        extensions: [guidedTool],
      },
    );
  });
}

test("with Tool Execution off, Pi's rules, docs and sections are untouched", async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      const text = systemText(requests[0]);
      assert.match(text, /- Use read to examine files instead of cat or sed\./);
      assert.match(text, /- Be concise in your responses/);
      assert.match(text, /<docs>\nPi documentation \(read only when the user asks about pi itself, its SDK/);
      assert.doesNotMatch(text, /<environment>/);
      assert.doesNotMatch(text, /<tool_execution>|Working In The Environment/);
      assert.match(text, /# Freeflow Working Method/);
    },
    true,
    {
      model: ["anthropic", "claude-opus-5-5"],
      freeflowConfig: { toolExecution: { enabled: false } },
      cognitiveRouting: { enabled: false },
    },
  );
});

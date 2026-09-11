import assert from "node:assert/strict";
import test from "node:test";
import freeflowExtension from "../../dist/index.js";

const PIFLOW_HOST = Object.freeze({
  distribution: Object.freeze({ id: "piflow", version: "test" }),
  capabilities: Object.freeze({ sessionModelStateControl: 1 }),
});

function loadExtension(host) {
  const tools = [];
  const commands = [];
  const handlers = new Map();
  const pi = {
    host,
    registerTool(tool) {
      tools.push(tool);
    },
    registerCommand(name, definition) {
      commands.push({ name, definition });
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
  freeflowExtension(pi);
  return { tools, commands, handlers };
}

test("does not activate PiFlow behavior from FREEFLOW_RUNTIME without host metadata", () => {
  const previousRuntime = process.env.FREEFLOW_RUNTIME;
  process.env.FREEFLOW_RUNTIME = "piflow";
  try {
    const { tools, commands } = loadExtension(undefined);
    assert.equal(
      tools.some((tool) => tool.name === "freeflow_switch_profile"),
      false,
    );
    const freeflowCommand = commands.find((command) => command.name === "freeflow");
    assert.ok(freeflowCommand);
    assert.equal(
      freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "profile"),
      false,
    );
  } finally {
    if (previousRuntime === undefined) delete process.env.FREEFLOW_RUNTIME;
    else process.env.FREEFLOW_RUNTIME = previousRuntime;
  }
});

test("activates PiFlow behavior only with the complete host descriptor", () => {
  const { tools, commands } = loadExtension(PIFLOW_HOST);
  assert.equal(
    tools.some((tool) => tool.name === "freeflow_switch_profile"),
    true,
  );
  const freeflowCommand = commands.find((command) => command.name === "freeflow");
  assert.ok(freeflowCommand);
  assert.equal(
    freeflowCommand.definition.getArgumentCompletions("").some((item) => item.value === "profile"),
    true,
  );
});

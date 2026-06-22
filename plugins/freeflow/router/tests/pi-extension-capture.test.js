import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import freeflow from "../../pi-extension/dist/index.js";

function registerMockPi() {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  const pi = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on(name, handler) {
      handlers.set(name, handler);
    },
    appendEntry() {},
    async sendUserMessage() {},
    async exec() {
      throw new Error("exec should not be called in pi extension capture registration tests");
    },
  };
  freeflow(pi);
  return { tools, commands, handlers };
}

function mockCtx() {
  return {
    cwd: process.cwd(),
    ui: {
      notify() {},
      setStatus() {},
    },
    sessionManager: {
      getSessionId: () => "pi-extension-capture-test",
    },
  };
}

const testTheme = {
  fg(_color, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

function renderText(component, width = 120) {
  return component.render(width).join("\n");
}

const FAKE_MCP_SERVER = `
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin });

function send(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\\n");
}

rl.on("line", (line) => {
  if (line.trim().length === 0) return;
  const message = JSON.parse(line);
  if (message.id === undefined) return;

  if (message.method === "initialize") {
    send(message.id, {
      protocolVersion: message.params?.protocolVersion ?? "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "fake-serena", version: "0.0.0" }
    });
    return;
  }

  if (message.method === "tools/list") {
    send(message.id, {
      tools: [
        {
          name: "get_symbols_overview",
          description: "Fake read-only Serena tool",
          inputSchema: { type: "object", additionalProperties: true }
        }
      ]
    });
    return;
  }

  if (message.method === "tools/call" && message.params?.name === "get_symbols_overview") {
    send(message.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            args: message.params.arguments,
            secret: process.env.FREEFLOW_CAPTURE_TEST_SECRET ?? null,
            explicit: process.env.FREEFLOW_CAPTURE_TEST_EXPLICIT ?? null,
            sourceEnv: process.env.FREEFLOW_CAPTURE_TEST_EXPLICIT_SOURCE ?? null,
            literal: process.env.FREEFLOW_CAPTURE_TEST_LITERAL ?? null,
            hasHome: Boolean(process.env.HOME),
            hasPath: Boolean(process.env.PATH)
          })
        }
      ]
    });
    return;
  }

  sendError(message.id, -32601, "unknown method");
});
`;

test("Pi extension registers public freeflow_capture with read-only MCP schema", () => {
  const { tools } = registerMockPi();
  const capture = tools.get("freeflow_capture");

  assert.ok(capture, "freeflow_capture should be registered");
  assert.deepEqual(capture.parameters.required, ["producer"]);
  assert.deepEqual(capture.parameters.properties.producer.properties.kind.enum, ["mcp"]);
  assert.match(capture.description, /read-only/i);
  assert.match(capture.promptGuidelines.join("\n"), /mutating provider tools/i);
});

test("Pi extension public freeflow_capture rejects known mutating Serena MCP tools before bridge execution", async () => {
  const { tools } = registerMockPi();
  const capture = tools.get("freeflow_capture");

  const result = await capture.execute(
    "capture-mutating",
    {
      producer: { kind: "mcp", server: "serena", tool: "rename_symbol" },
      args: { relative_path: "src/example.ts", name_path: "OldName", new_name: "NewName" },
    },
    undefined,
    undefined,
    mockCtx(),
  );

  const routed = result.details.result;
  assert.equal(routed.toolStatus, "ok");
  assert.equal(routed.routing.route, "capture");
  assert.equal(routed.failure.kind, "mutating_producer_rejected");
  assert.equal(routed.producerExecution.status, "rejected");
  assert.equal(routed.persistence.recoverability, "none");
});

test("Pi extension public freeflow_capture calls fake Serena MCP stdio tool without forwarding ambient secrets", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-capture-mcp-"));
  const previousSecret = process.env.FREEFLOW_CAPTURE_TEST_SECRET;
  const previousExplicitSource = process.env.FREEFLOW_CAPTURE_TEST_EXPLICIT_SOURCE;
  try {
    process.env.FREEFLOW_CAPTURE_TEST_SECRET = "top-secret-ambient-value";
    process.env.FREEFLOW_CAPTURE_TEST_EXPLICIT_SOURCE = "explicit-from-source-env";

    const serverPath = join(cwd, "fake-serena-mcp.mjs");
    await writeFile(serverPath, FAKE_MCP_SERVER, "utf8");
    await writeFile(
      join(cwd, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          serena: {
            command: "node",
            args: [serverPath],
            env: {
              FREEFLOW_CAPTURE_TEST_EXPLICIT: "${FREEFLOW_CAPTURE_TEST_EXPLICIT_SOURCE}",
              FREEFLOW_CAPTURE_TEST_LITERAL: "literal-config-value",
            },
          },
        },
      }),
      "utf8",
    );
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: { vaultRoot: join(cwd, "vault") },
      }),
      "utf8",
    );

    const { tools } = registerMockPi();
    const capture = tools.get("freeflow_capture");
    const result = await capture.execute(
      "capture-fake-mcp",
      {
        producer: { kind: "mcp", server: "serena", tool: "get_symbols_overview" },
        args: { relative_path: "src/example.ts", depth: 0 },
      },
      undefined,
      undefined,
      {
        ...mockCtx(),
        cwd,
        sessionManager: { getSessionId: () => "pi-extension-fake-mcp-capture-test" },
      },
    );

    const routed = result.details.result;
    assert.equal(routed.toolStatus, "ok");
    assert.equal(routed.routing.route, "capture");
    assert.equal(routed.routing.status, "routed");
    assert.equal(routed.persistence.recoverability, "exact");
    assert.ok(routed.outputId.startsWith("ffout_"));
    assert.equal(routed.evidence.length, 1);

    const captured = JSON.parse(routed.evidence[0].excerpt);
    assert.deepEqual(captured.args, { relative_path: "src/example.ts", depth: 0 });
    assert.equal(captured.secret, null);
    assert.equal(captured.sourceEnv, null);
    assert.equal(captured.explicit, "explicit-from-source-env");
    assert.equal(captured.literal, "literal-config-value");
    assert.equal(captured.hasHome, true);
    assert.equal(captured.hasPath, true);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.FREEFLOW_CAPTURE_TEST_SECRET;
    } else {
      process.env.FREEFLOW_CAPTURE_TEST_SECRET = previousSecret;
    }
    if (previousExplicitSource === undefined) {
      delete process.env.FREEFLOW_CAPTURE_TEST_EXPLICIT_SOURCE;
    } else {
      process.env.FREEFLOW_CAPTURE_TEST_EXPLICIT_SOURCE = previousExplicitSource;
    }
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi extension freeflow_capture renders producer, routing, persistence, evidence, and recovery", () => {
  const { tools } = registerMockPi();
  const capture = tools.get("freeflow_capture");

  const call = renderText(
    capture.renderCall(
      {
        producer: { kind: "mcp", server: "serena", tool: "get_symbols_overview" },
        preserve: "important",
      },
      testTheme,
    ),
  );
  assert.match(call, /freeflow_capture serena\/get_symbols_overview/);
  assert.match(call, /preserve=important/);

  const toolResult = {
    content: [{ type: "text", text: "raw json should not be the visible UI" }],
    details: {
      result: {
        toolStatus: "ok",
        decisionId: "ffdec_capture_test",
        preserve: "important",
        outputId: "ffout_capture123",
        recordId: "ffrec_capture123",
        producer: { kind: "mcp", server: "serena", tool: "get_symbols_overview" },
        persistence: { status: "vaulted", recoverability: "exact", recoveryOutputId: "ffout_capture123" },
        routing: { status: "routed", route: "capture", reason: "Captured read-only Serena output." },
        summary: "Captured 1 line from Serena.",
        evidence: [
          {
            id: "ev_capture",
            source: { kind: "vault", outputId: "ffout_capture123", stream: "raw" },
            path: "ffout_capture123:raw",
            lines: "1-1",
            excerpt: "{\"Function\":[\"freeflowCapture\"]}",
            why: "Captured exact output from producer mcp:serena:get_symbols_overview within routing caps.",
            window: "exact",
            expandable: true,
          },
        ],
        recovery: {
          how: "Use freeflow_retrieve with source.kind=vault and outputId=ffout_capture123 to recover exact captured content.",
          outputId: "ffout_capture123",
        },
      },
    },
  };

  const collapsed = renderText(capture.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /freeflow_capture serena\/get_symbols_overview/);
  assert.match(collapsed, /routing: routed/);
  assert.match(collapsed, /persistence vaulted\/exact/);
  assert.match(collapsed, /raw capture recoverable from vault/);
  assert.doesNotMatch(collapsed, /raw json/);

  const expanded = renderText(capture.renderResult(toolResult, { expanded: true }, testTheme));
  assert.match(expanded, /toolStatus: ok/);
  assert.match(expanded, /routing\.status: routed/);
  assert.match(expanded, /persistence: vaulted \/ exact/);
  assert.match(expanded, /Evidence/);
  assert.match(expanded, /freeflowCapture/);
  assert.match(expanded, /Recovery/);
  assert.match(expanded, /ffout_capture123/);
});

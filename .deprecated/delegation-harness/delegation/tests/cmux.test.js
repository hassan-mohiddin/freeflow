import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CmuxAdapter,
  buildCmuxCloseSurfaceCommand,
  buildCmuxNewPaneCommand,
  buildCmuxReadScreenCommand,
  buildCmuxSendCommand,
  ensureDelegationReady,
  parseCmuxRefs,
} from "../dist/index.js";

const HELP = `cmux help
Commands:
  new-pane [--type terminal]
  send [--surface <id>] <text>
  send-key [--surface <id>] <key>
  read-screen [--surface <id>]
  close-surface [--surface <id>]
`;

function ok(stdout = "") {
  return { stdout, stderr: "", exitCode: 0, executionStatus: "success" };
}

function fail(stderr = "failed") {
  return { stdout: "", stderr, exitCode: 1, executionStatus: "failed" };
}

function fakeRunner(handler) {
  const calls = [];
  return {
    calls,
    runner: {
      async run(command, options) {
        calls.push({ command: [...command], options });
        return handler([...command], options);
      },
    },
  };
}

async function withTempRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-cmux-test-"));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("cmux command builders construct supported visible-pane commands", () => {
  assert.deepEqual(buildCmuxNewPaneCommand({ direction: "right", workspaceRef: "workspace:1", focus: true }), [
    "cmux",
    "new-pane",
    "--type",
    "terminal",
    "--direction",
    "right",
    "--workspace",
    "workspace:1",
    "--focus",
    "true",
  ]);
  assert.deepEqual(buildCmuxSendCommand({ surfaceRef: "surface:2", text: "echo hello" }), [
    "cmux",
    "send",
    "--surface",
    "surface:2",
    "echo hello",
  ]);
  assert.deepEqual(buildCmuxReadScreenCommand({ surfaceRef: "surface:2", lines: 40, scrollback: true }), [
    "cmux",
    "read-screen",
    "--surface",
    "surface:2",
    "--scrollback",
    "--lines",
    "40",
  ]);
  assert.deepEqual(buildCmuxCloseSurfaceCommand({ surfaceRef: "surface:2" }), [
    "cmux",
    "close-surface",
    "--surface",
    "surface:2",
  ]);
});

test("cmux ref parser extracts refs from text and JSON", () => {
  assert.deepEqual(parseCmuxRefs("created workspace:1 pane:2 surface:3").surfaceRef, "surface:3");
  assert.equal(parseCmuxRefs('{"workspaceId":"abc","paneRef":"pane:7","surfaceId":"9"}').workspaceRef, "workspace:abc");
  assert.equal(parseCmuxRefs('{"workspaceId":"abc","paneRef":"pane:7","surfaceId":"9"}').surfaceRef, "surface:9");
});

test("preflight fails closed when cmux is missing before any cmux pane command", async () => {
  await withTempRoot(async (root) => {
    const { runner, calls } = fakeRunner((command) => {
      if (command.join(" ").includes("command -v 'cmux'")) return fail("cmux not found");
      throw new Error(`unexpected command: ${command.join(" ")}`);
    });

    const result = await ensureDelegationReady({
      runner,
      storeRoot: join(root, ".freeflow", "delegation"),
      env: { CMUX_WORKSPACE_ID: "workspace:1" },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, "cmux_binary_missing");
    assert.equal(
      calls.some((call) => call.command.includes("new-pane")),
      false,
    );
  });
});

test("preflight checks cmux commands, context, child pi, and store writability", async () => {
  await withTempRoot(async (root) => {
    const { runner, calls } = fakeRunner((command) => {
      const text = command.join(" ");
      if (text.includes("command -v 'cmux'")) return ok("/usr/bin/cmux\n");
      if (text === "cmux --help") return ok(HELP);
      if (text === "cmux identify") return ok("workspace:1 surface:2\n");
      if (text.includes("command -v 'pi'")) return ok("/usr/local/bin/pi\n");
      throw new Error(`unexpected command: ${text}`);
    });

    const result = await ensureDelegationReady({ runner, storeRoot: join(root, ".freeflow", "delegation"), env: {} });

    assert.equal(result.ok, true);
    assert.ok(result.checks.some((check) => check.name === "cmux_context" && check.status === "ok"));
    assert.ok(calls.some((call) => call.command.join(" ") === "cmux identify"));
    assert.equal(
      calls.some((call) => call.command.includes("new-pane")),
      false,
    );
  });
});

test("adapter uses fake runner for new-pane, send, read-screen, and close-surface", async () => {
  const { runner, calls } = fakeRunner((command) => {
    const text = command.join(" ");
    if (text.startsWith("cmux new-pane")) return ok("workspace:1 pane:2 surface:3\n");
    if (text.startsWith("cmux send ")) return ok();
    if (text.startsWith("cmux read-screen")) return ok("screen text\n");
    if (text.startsWith("cmux close-surface")) return ok();
    throw new Error(`unexpected command: ${text}`);
  });
  const adapter = new CmuxAdapter(runner);

  const pane = await adapter.newPane({ direction: "down", focus: false });
  await adapter.send({ surfaceRef: pane.refs.surfaceRef, text: "pi --no-session" });
  const screen = await adapter.readScreen({ surfaceRef: pane.refs.surfaceRef, lines: 20 });
  await adapter.closeSurface({ surfaceRef: pane.refs.surfaceRef });

  assert.equal(pane.refs.surfaceRef, "surface:3");
  assert.equal(screen.result.stdout, "screen text\n");
  assert.deepEqual(
    calls.map((call) => call.command[1]),
    ["new-pane", "send", "read-screen", "close-surface"],
  );
});

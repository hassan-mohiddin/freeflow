import { spawn } from "node:child_process";

import { COMMAND_TOOL } from "./lib/definitions.mjs";

const DEFAULT_TIMEOUT_MS = 120 * 1000;
const OUTPUT_LIMIT_BYTES = 32 * 1024;
const TERMINATION_GRACE_MS = 2000;

function parseCommands(value) {
  const parsed = JSON.parse(value ?? "[]");
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("SKILL_EVAL_COMMANDS must declare commands");
  return parsed;
}

function commandEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("SKILL_EVAL_")));
}

function captureStream(stream) {
  const chunks = [];
  const capture = { bytes: 0, kept: 0, truncated: false };
  stream.on("data", (chunk) => {
    capture.bytes += chunk.length;
    const room = OUTPUT_LIMIT_BYTES - capture.kept;
    if (room <= 0) {
      capture.truncated = true;
      return;
    }
    const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
    if (kept.length < chunk.length) capture.truncated = true;
    chunks.push(kept);
    capture.kept += kept.length;
  });
  capture.text = () => Buffer.concat(chunks).toString("utf8");
  return capture;
}

function signalGroup(child, signal) {
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // The process group already exited.
  }
}

// Runs one author-declared argv in the workspace. A nonzero exit or timeout is ordinary evidence, not a tool error.
function runCommand(command, cwd, signal) {
  const timeoutMs = command.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(command.argv[0], command.argv.slice(1), {
      cwd,
      env: commandEnvironment(),
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = captureStream(child.stdout);
    const stderr = captureStream(child.stderr);
    let timedOut = false;
    let forced;
    const stop = () => {
      signalGroup(child, "SIGTERM");
      forced = setTimeout(() => signalGroup(child, "SIGKILL"), TERMINATION_GRACE_MS);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    const onAbort = () => stop();
    signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => {
      clearTimeout(timer);
      clearTimeout(forced);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.once("close", (exitCode, exitSignal) => {
      clearTimeout(timer);
      clearTimeout(forced);
      signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode, signal: exitSignal, timedOut, timeoutMs, stdout, stderr });
    });
  });
}

function renderOutput(label, capture) {
  const note = capture.truncated ? ` (truncated: showing ${capture.kept} of ${capture.bytes} bytes)` : "";
  return `--- ${label}${note} ---\n${capture.text()}`;
}

export default function registerCommandTool(pi) {
  const commands = parseCommands(process.env.SKILL_EVAL_COMMANDS);
  const workspace = process.env.SKILL_EVAL_WRITABLE_ROOT;
  if (!workspace) throw new Error("SKILL_EVAL_WRITABLE_ROOT is required");
  const byId = new Map(commands.map((command) => [command.id, command]));

  pi.registerTool({
    name: COMMAND_TOOL,
    label: "Run command",
    description: `Run one declared command in the workspace. Available commands: ${commands
      .map((command) => `${command.id} (${command.argv.join(" ")})`)
      .join("; ")}.`,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["command"],
      properties: {
        command: { type: "string", enum: commands.map((command) => command.id), description: "Declared command ID" },
      },
    },
    executionMode: "sequential",
    async execute(_toolCallId, input, signal) {
      const command = byId.get(input?.command);
      if (!command) throw new Error(`Command is not declared for this evaluation: ${String(input?.command)}`);
      const result = await runCommand(command, workspace, signal);
      const status = result.timedOut
        ? `timed out after ${result.timeoutMs} ms`
        : `exit code: ${result.exitCode ?? `signal ${result.signal}`}`;
      return {
        content: [
          {
            type: "text",
            text: [
              `$ ${command.argv.join(" ")}`,
              status,
              renderOutput("stdout", result.stdout),
              renderOutput("stderr", result.stderr),
            ].join("\n"),
          },
        ],
        details: {
          id: command.id,
          argv: command.argv,
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          stdout: { bytes: result.stdout.bytes, truncated: result.stdout.truncated },
          stderr: { bytes: result.stderr.bytes, truncated: result.stderr.truncated },
        },
      };
    },
  });
}

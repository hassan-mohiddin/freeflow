import { spawn } from "node:child_process";

import { containerExecArgv, dockerClientEnvironment, parseContainerTarget } from "./lib/container.mjs";
import { COMMAND_TOOL } from "./lib/definitions.mjs";
import { LOGIN_VARIABLES } from "./lib/hosts/claude-code/isolation.mjs";

const DEFAULT_TIMEOUT_MS = 120 * 1000;
const OUTPUT_LIMIT_BYTES = 32 * 1024;
const TERMINATION_GRACE_MS = 2000;

function parseCommands(value) {
  const parsed = JSON.parse(value ?? "[]");
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("SKILL_EVAL_COMMANDS must declare commands");
  return parsed;
}

// A declared command runs the workspace's own code, so it gets neither the evaluator's control variables nor a
// pointer to the login: Pi's agent directory, which holds the copied provider login, and any login variable. On the
// host this keeps the login out of easy reach, not out of reach (the run's network "host"); in a container the
// command gets none of this environment at all.
const WITHHELD = new Set(["PI_CODING_AGENT_DIR", ...LOGIN_VARIABLES]);

function commandEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("SKILL_EVAL_") && !WITHHELD.has(key)),
  );
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

// Runs one author-declared argv in the workspace, or, in a container environment, through `docker exec` in the
// subject's container, where bash runs too, so both use the image's toolchain. A nonzero exit or timeout is
// ordinary evidence, not a tool error.
function runCommand(command, cwd, signal, container) {
  const timeoutMs = command.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const argv = container === null ? command.argv : containerExecArgv(container, command.argv);
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: container === null ? commandEnvironment() : dockerClientEnvironment(),
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
  // Set by the evaluator only for a container environment; the guard routes bash by the same value.
  const container = parseContainerTarget(process.env.SKILL_EVAL_CONTAINER);

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
      const result = await runCommand(command, workspace, signal, container);
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

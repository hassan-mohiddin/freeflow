import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
const DEFAULT_SAFE_ROUTES = [
  "continue_inline_in_current_pi_session",
  "ask_user_to_install_or_start_cmux_and_retry",
  "disable_delegation_for_this_task",
  "choose_a_different_visible_cmux_workspace",
];
const REQUIRED_CMUX_COMMANDS = ["new-pane", "send", "send-key", "read-screen", "close-surface"];
export class CmuxAdapter {
  runner;
  defaultCwd;
  defaultTimeoutMs;
  constructor(runner, options = {}) {
    this.runner = runner;
    this.defaultCwd = options.cwd;
    this.defaultTimeoutMs = options.timeoutMs;
  }
  ensureReady(input) {
    const readyInput = { runner: this.runner, ...input };
    if (readyInput.cwd === undefined && this.defaultCwd !== undefined) {
      readyInput.cwd = this.defaultCwd;
    }
    if (readyInput.timeoutMs === undefined && this.defaultTimeoutMs !== undefined) {
      readyInput.timeoutMs = this.defaultTimeoutMs;
    }
    return ensureDelegationReady(readyInput);
  }
  async newPane(input = {}) {
    const command = buildCmuxNewPaneCommand(input);
    const result = await this.runCmux(command);
    assertRunOk("cmux new-pane", result, command);
    return { command, result, refs: parseCmuxRefs(result.stdout) };
  }
  async send(input) {
    const command = buildCmuxSendCommand(input);
    const result = await this.runCmux(command);
    assertRunOk("cmux send", result, command);
    return { command, result };
  }
  async sendKey(input) {
    const command = buildCmuxSendKeyCommand(input);
    const result = await this.runCmux(command);
    assertRunOk("cmux send-key", result, command);
    return { command, result };
  }
  async readScreen(input) {
    const command = buildCmuxReadScreenCommand(input);
    const result = await this.runCmux(command);
    assertRunOk("cmux read-screen", result, command);
    return { command, result };
  }
  async closeSurface(input) {
    const command = buildCmuxCloseSurfaceCommand(input);
    const result = await this.runCmux(command);
    assertRunOk("cmux close-surface", result, command);
    return { command, result };
  }
  runCmux(command) {
    return this.runner.run(command, cmuxRunOptions({ cwd: this.defaultCwd, timeoutMs: this.defaultTimeoutMs }));
  }
}
export async function ensureDelegationReady(input) {
  const checks = [];
  const cwd = input.cwd;
  const timeoutMs = input.timeoutMs;
  const env = input.env ?? process.env;
  const childPiCommand = validateExecutableName(input.childPiCommand ?? "pi", "child Pi command");
  const requiredCommands = input.requiredCmuxCommands ?? REQUIRED_CMUX_COMMANDS;
  const cmuxAvailable = await runAvailabilityCheck(input.runner, "cmux_binary", "cmux", cwd, env, timeoutMs);
  checks.push(cmuxAvailable.check);
  if (!cmuxAvailable.ok) {
    return unavailable("cmux_binary_missing", "cmux binary is not available on PATH", checks);
  }
  const helpCommand = ["cmux", "--help"];
  const help = await runCheck(input.runner, helpCommand, cmuxRunOptions({ cwd, env, timeoutMs }));
  if (!isRunOk(help)) {
    checks.push({ name: "cmux_help", status: "failed", message: summarizeRunFailure(help), command: helpCommand });
    return unavailable("cmux_command_unavailable", "cmux help could not be inspected for required commands", checks);
  }
  const missingCommands = requiredCommands.filter((command) => !cmuxHelpMentionsCommand(help.stdout, command));
  if (missingCommands.length > 0) {
    checks.push({
      name: "cmux_required_commands",
      status: "failed",
      message: `missing cmux command(s): ${missingCommands.join(", ")}`,
      command: helpCommand,
    });
    return unavailable(
      "cmux_command_unavailable",
      `cmux is missing required command(s): ${missingCommands.join(", ")}`,
      checks,
    );
  }
  checks.push({
    name: "cmux_required_commands",
    status: "ok",
    message: `found ${requiredCommands.join(", ")}`,
    command: helpCommand,
  });
  if (hasUsableCmuxEnv(env)) {
    checks.push({ name: "cmux_context", status: "ok", message: "usable cmux context detected from CMUX_* env" });
  } else {
    const identifyCommand = ["cmux", "identify"];
    const identify = await runCheck(input.runner, identifyCommand, cmuxRunOptions({ cwd, env, timeoutMs }));
    if (!isRunOk(identify) || !cmuxIdentifyLooksUsable(identify.stdout)) {
      checks.push({
        name: "cmux_context",
        status: "failed",
        message: summarizeRunFailure(identify) || "cmux identify returned no usable workspace/surface",
        command: identifyCommand,
      });
      return unavailable("cmux_context_unavailable", "current terminal is not in a usable cmux context", checks);
    }
    checks.push({
      name: "cmux_context",
      status: "ok",
      message: "cmux identify returned a usable context",
      command: identifyCommand,
    });
  }
  const piAvailable = await runAvailabilityCheck(input.runner, "child_pi_command", childPiCommand, cwd, env, timeoutMs);
  checks.push(piAvailable.check);
  if (!piAvailable.ok) {
    return unavailable("child_pi_missing", `child Pi command is not available: ${childPiCommand}`, checks);
  }
  const storeCheck = await checkStoreWritability(input.storeRoot);
  checks.push(storeCheck);
  if (storeCheck.status !== "ok") {
    return unavailable("store_unwritable", storeCheck.message, checks);
  }
  return { ok: true, status: "ready", checks };
}
export function buildCmuxNewPaneCommand(input = {}) {
  const direction = input.direction ?? "right";
  const command = ["cmux", "new-pane", "--type", "terminal", "--direction", direction];
  appendOptionalRef(command, "--workspace", input.workspaceRef);
  appendOptionalRef(command, "--window", input.windowRef);
  if (input.focus !== undefined) {
    command.push("--focus", String(input.focus));
  }
  return command;
}
export function buildCmuxSendCommand(input) {
  const command = ["cmux", "send", "--surface", validateRef(input.surfaceRef, "surface ref")];
  appendOptionalRef(command, "--workspace", input.workspaceRef);
  appendOptionalRef(command, "--window", input.windowRef);
  command.push(input.text);
  return command;
}
export function buildCmuxSendKeyCommand(input) {
  const command = ["cmux", "send-key", "--surface", validateRef(input.surfaceRef, "surface ref")];
  appendOptionalRef(command, "--workspace", input.workspaceRef);
  appendOptionalRef(command, "--window", input.windowRef);
  command.push(validateSimpleToken(input.key, "key"));
  return command;
}
export function buildCmuxReadScreenCommand(input) {
  const command = ["cmux", "read-screen", "--surface", validateRef(input.surfaceRef, "surface ref")];
  appendOptionalRef(command, "--workspace", input.workspaceRef);
  appendOptionalRef(command, "--window", input.windowRef);
  if (input.scrollback === true) {
    command.push("--scrollback");
  }
  if (input.lines !== undefined) {
    const lines = Math.max(1, Math.min(500, Math.floor(input.lines)));
    command.push("--lines", String(lines));
  }
  return command;
}
export function buildCmuxCloseSurfaceCommand(input) {
  const command = ["cmux", "close-surface", "--surface", validateRef(input.surfaceRef, "surface ref")];
  appendOptionalRef(command, "--workspace", input.workspaceRef);
  appendOptionalRef(command, "--window", input.windowRef);
  return command;
}
export function parseCmuxRefs(output) {
  const raw = output.trim();
  const refs = { raw };
  collectRefsFromJson(raw, refs);
  const refRe = /\b(window|workspace|pane|surface):([A-Za-z0-9._-]+)/g;
  let match = refRe.exec(raw);
  while (match !== null) {
    setRef(refs, match[1], `${match[1]}:${match[2]}`);
    match = refRe.exec(raw);
  }
  const looseRe = /\b(window|workspace|pane|surface)(?:Id|ID|Ref|ref)?[\s=:]+([A-Za-z0-9._:-]+)/g;
  match = looseRe.exec(raw);
  while (match !== null) {
    setRef(refs, match[1], normalizeRef(match[1], match[2] ?? ""));
    match = looseRe.exec(raw);
  }
  return refs;
}
export function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function unavailable(code, reason, checks) {
  return {
    ok: false,
    status: "unavailable",
    code,
    reason,
    actionTaken: "no_pane_opened_no_child_pi_started",
    safeRoutes: [...DEFAULT_SAFE_ROUTES],
    checks,
  };
}
async function runAvailabilityCheck(runner, name, executable, cwd, env, timeoutMs) {
  const command = ["sh", "-lc", `command -v ${shellQuote(executable)}`];
  const result = await runCheck(runner, command, cmuxRunOptions({ cwd, env, timeoutMs }));
  if (isRunOk(result) && result.stdout.trim().length > 0) {
    return { ok: true, check: { name, status: "ok", message: `${executable} found`, command } };
  }
  return {
    ok: false,
    check: { name, status: "failed", message: summarizeRunFailure(result) || `${executable} not found`, command },
  };
}
async function runCheck(runner, command, options) {
  try {
    return await runner.run(command, options);
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: null,
      executionStatus: "failed",
    };
  }
}
function isRunOk(result) {
  if (result.executionStatus === "success") {
    return true;
  }
  return result.exitCode === 0 && result.executionStatus !== "timed_out" && result.executionStatus !== "cancelled";
}
function assertRunOk(label, result, command) {
  if (isRunOk(result)) {
    return;
  }
  throw new Error(`${label} failed (${command.join(" ")}): ${summarizeRunFailure(result)}`);
}
function summarizeRunFailure(result) {
  const status = result.executionStatus ?? (result.exitCode === null ? "failed" : `exit ${result.exitCode}`);
  const detail = `${result.stderr || result.stdout}`.trim();
  return detail.length > 0 ? `${status}: ${detail}` : status;
}
function cmuxHelpMentionsCommand(help, command) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`(?:^|\\n)\\s{2}${escaped}(?:\\s|$)`, "m").test(help) ||
    new RegExp(`(?:^|\\n)\\s*${escaped}(?:\\s|$)`, "m").test(help)
  );
}
function hasUsableCmuxEnv(env) {
  return [env.CMUX_WORKSPACE_ID, env.CMUX_SURFACE_ID, env.CMUX_WINDOW_ID].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}
function cmuxIdentifyLooksUsable(stdout) {
  const refs = parseCmuxRefs(stdout);
  return Boolean(refs.workspaceRef || refs.surfaceRef || refs.windowRef);
}
async function checkStoreWritability(storeRoot) {
  if (storeRoot.trim().length === 0 || storeRoot.includes("\0")) {
    return { name: "delegation_store", status: "failed", message: "delegation store root is invalid" };
  }
  const resolved = resolve(storeRoot);
  try {
    const rootStat = await stat(resolved).catch(() => undefined);
    if (rootStat !== undefined) {
      if (!rootStat.isDirectory()) {
        return {
          name: "delegation_store",
          status: "failed",
          message: `delegation store exists but is not a directory: ${resolved}`,
        };
      }
      await access(resolved, constants.W_OK);
      return { name: "delegation_store", status: "ok", message: `delegation store is writable: ${resolved}` };
    }
    const ancestor = await nearestExistingAncestor(resolved);
    await access(ancestor, constants.W_OK);
    return { name: "delegation_store", status: "ok", message: `delegation store ancestor is writable: ${ancestor}` };
  } catch (error) {
    return {
      name: "delegation_store",
      status: "failed",
      message: `delegation store is not writable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
async function nearestExistingAncestor(path) {
  let current = path;
  while (true) {
    const parent = dirname(current);
    const exists = await stat(parent).catch(() => undefined);
    if (exists !== undefined) {
      if (!exists.isDirectory()) {
        throw new Error(`ancestor is not a directory: ${parent}`);
      }
      return parent;
    }
    if (parent === current) {
      throw new Error(`no existing ancestor for ${path}`);
    }
    current = parent;
  }
}
function collectRefsFromJson(raw, refs) {
  if (!raw.startsWith("{") && !raw.startsWith("[")) {
    return;
  }
  try {
    visitJsonForRefs(JSON.parse(raw), refs);
  } catch {
    // cmux usually prints human text; ignore non-JSON output.
  }
}
function visitJsonForRefs(value, refs) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitJsonForRefs(item, refs));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const kind = refKindFromKey(key);
    if (kind !== undefined && (typeof child === "string" || typeof child === "number")) {
      setRef(refs, kind, normalizeRef(kind, String(child)));
    }
    visitJsonForRefs(child, refs);
  }
}
function refKindFromKey(key) {
  const lower = key.toLowerCase();
  if (lower.includes("surface")) return "surface";
  if (lower.includes("pane")) return "pane";
  if (lower.includes("workspace")) return "workspace";
  if (lower.includes("window")) return "window";
  return undefined;
}
function setRef(refs, kind, ref) {
  if (ref.length === 0) {
    return;
  }
  if (kind === "surface" && refs.surfaceRef === undefined) refs.surfaceRef = ref;
  if (kind === "pane" && refs.paneRef === undefined) refs.paneRef = ref;
  if (kind === "workspace" && refs.workspaceRef === undefined) refs.workspaceRef = ref;
  if (kind === "window" && refs.windowRef === undefined) refs.windowRef = ref;
}
function normalizeRef(kind, value) {
  const normalized = validateRef(value, `${kind} ref`);
  if (normalized.startsWith(`${kind}:`)) {
    return normalized;
  }
  return `${kind}:${normalized}`;
}
function appendOptionalRef(command, flag, value) {
  if (value !== undefined) {
    command.push(flag, validateRef(value, flag));
  }
}
function cmuxRunOptions(input) {
  const output = {};
  if (input.cwd !== undefined) output.cwd = input.cwd;
  if (input.env !== undefined) output.env = input.env;
  if (input.timeoutMs !== undefined) output.timeoutMs = input.timeoutMs;
  if (input.signal !== undefined) output.signal = input.signal;
  return output;
}
function validateExecutableName(value, label) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.includes("\0") || /\s/.test(trimmed)) {
    throw new Error(`${label} must be a non-empty executable name without whitespace`);
  }
  if (!/^[A-Za-z0-9._/:-]+$/.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return trimmed;
}
function validateSimpleToken(value, label) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.includes("\0") || /\s/.test(trimmed)) {
    throw new Error(`${label} must be a non-empty token without whitespace`);
  }
  return trimmed;
}
function validateRef(value, label) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.includes("\0") || /\s/.test(trimmed)) {
    throw new Error(`${label} must be a non-empty cmux ref without whitespace`);
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  if (isAbsolute(trimmed)) {
    throw new Error(`${label} must not be a path`);
  }
  return trimmed;
}

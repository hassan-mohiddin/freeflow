// Freeflow's reference pointers (task-001's reference-pointers plan): four lines, each sent to the agent at the moment
// its skill's method matters, at most once per context cycle, appended after what the agent already received, and kept
// as a `sent` line (`pointer`). One setting, `pointers.enabled` (on by default), turns all four off.
//
// This module only decides which pointer a call raises; each driver keeps its own cycle, the setting and the delivery:
// Claude Code's mod appends a row, Codex's driver adds hook context, and Pi's extension joins the tool result (rows 2
// and 3 only: Pi's guidance notices already send row 4, and Pi has no workers). It is pure and imports nothing but the
// test patterns, so a mod may import it; a call costs a few regular expressions and no file read.

import { DEFAULT_PATTERNS, matcher } from "../../skills/verify-work/scripts/lib/test-patterns.mjs";

/** The `sent` line's source for a pointer (one of Track Work's SENT_WHATS). */
export const POINTER_SENT = "pointer";

/** Pi's diagnose line, unchanged (DIAGNOSE_NOTICE in pi-extension/src/tool-execution/guidance-notices.ts); a test keeps them equal. */
export const DIAGNOSE_LINE =
  "This test command failed twice (Execute Work's Diagnose Before Fixing; its diagnose reference has the full loop): two failed fixes mean the diagnosis is wrong. Before the next change, find an observation that would come out differently if your explanation were wrong: change the question, change the kind of observation, or check the cheapest assumption (did it build; does the test import what you think?).";

/** The four lines, word for word as the approved table gives them, by row. */
export const POINTERS = Object.freeze({
  // Row 1: a worker is about to start (a subagent or a worker's delegation).
  delegation:
    "Handing work out (Execute Work's delegation reference): name the model and effort, Result wanted, Scope and Done when in the brief; when it returns, rerun every command its Done when names before accepting it.",
  // Row 2: a pull request is about to open.
  "pull-request":
    "Before a pull request (Deliver Work's Review Check): run `review-status`; one independent review on record for this head is the floor.",
  // Row 3: a test file is edited.
  "test-edit":
    "A test changed (Verify Work's test design): never weaken an expectation to make a check pass; list the change with `test-changes.mjs` before reporting.",
  // Row 4: the same failing test command fails a second time.
  diagnose: DIAGNOSE_LINE,
});

/** Pi's test command pattern (TEST_COMMAND in guidance-notices.ts), unchanged; a test keeps them equal. */
export const TEST_COMMAND =
  /(^|[\s;&|(])((npm|pnpm|yarn|bun)\b[^;&|]*\btest(:[\w:-]+)?\b|node\s+(\S+\s+)*--test\b|(pytest|jest|vitest|mocha|rspec|phpunit|ctest|tox)\b|go\s+test\b|cargo\s+(test|nextest)\b|(mvn|gradle|\.\/gradlew)\b[^;&|]*\btest\b|make\s+(test|check)\b|dotnet\s+test\b|bundle\s+exec\s+rspec\b|python3?\s+-m\s+(pytest|unittest)\b)/;

/** Tools that start a subagent: Claude Code's Agent (formerly Task) and Codex's spawn_agent. */
const WORKER_TOOLS = new Set(["Agent", "Task", "spawn_agent"]);
/** A worker's delegation being opened with Track Work's script. */
const DELEGATE_OPEN = /working-record\.mjs\b[^;&|]*\bdelegate\s+open\b/;
/** `gh pr create`, or a GitHub tool that creates a pull request (the GitHub MCP server's create_pull_request). */
const PR_COMMAND = /(^|[\s;&|(])gh\s+pr\s+create\b(?![^;&|]*--help)/;
const PR_TOOL = /(^|__|\.)create_pull_request$/;
/** Tools that write files, on every harness (as Track Work's gates5.mjs names them). */
const FILE_WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "edit", "write", "apply_patch"]);
/** The test commands whose failures are counted, at most this many at once (as Pi's notices bound theirs). */
const FAILURE_KEYS = 32;

const isTest = matcher(DEFAULT_PATTERNS);

/** Whether a path is a test file, fixture, snapshot or test setup file by test-changes.mjs's default patterns. */
export function isTestPath(path) {
  if (typeof path !== "string" || path === "") return false;
  return isTest(path.replace(/\\/g, "/").replace(/^(\.\/)+/, ""));
}

/**
 * The pointers a call raises before it runs: `delegation` for a tool that starts a worker or a command that opens a
 * delegation, `pull-request` for one that opens a pull request.
 * @param {{ tool: string, command?: string }} call
 * @returns {string[]}
 */
export function beforeCall({ tool, command }) {
  const raised = [];
  const text = typeof command === "string" ? command : "";
  if (WORKER_TOOLS.has(tool) || DELEGATE_OPEN.test(text)) raised.push("delegation");
  if (PR_COMMAND.test(text) || PR_TOOL.test(tool)) raised.push("pull-request");
  return raised;
}

/**
 * The pointers a call raises once its result is in: `test-edit` for a file tool that wrote a test path, `diagnose` for
 * the second failure in a row of the same test command. `failures` is the driver's count by command, which this
 * updates (a pass forgets the command; at most FAILURE_KEYS are kept).
 * @param {{ tool: string, command?: string, paths?: string[], failed: boolean }} call
 * @param {Map<string, number>} failures
 * @returns {string[]}
 */
export function afterCall({ tool, command, paths = [], failed }, failures) {
  const raised = [];
  if (FILE_WRITE_TOOLS.has(tool) && !failed && paths.some(isTestPath)) raised.push("test-edit");
  if (typeof command === "string" && TEST_COMMAND.test(command)) {
    const key = command.trim().replace(/\s+/g, " ");
    if (failed) {
      const count = (failures.get(key) ?? 0) + 1;
      failures.delete(key);
      failures.set(key, count);
      while (failures.size > FAILURE_KEYS) failures.delete(failures.keys().next().value);
      if (count === 2) raised.push("diagnose");
    } else failures.delete(key);
  }
  return raised;
}

/** Whether a call's commands touch a test command at all: a driver keeps no count for the rest. @param {unknown} command */
export const testCommand = (command) => typeof command === "string" && TEST_COMMAND.test(command);

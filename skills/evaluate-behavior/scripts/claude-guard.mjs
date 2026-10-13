#!/usr/bin/env node
// Claude Code's PreToolUse hook for an evaluation subject: the same confinement rules as Pi's guard
// (guard-rules.mjs), read from the same SKILL_EVAL_* variables, decided for Claude Code's tool names. It allows a
// declared call explicitly, rewrites bash to run in the subject's container, and denies everything else, including
// any call it cannot decide.

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { decideToolCall, guardState } from "./guard-rules.mjs";

// Claude Code's built-in tools and the evaluator tool each one stands for, with where its path argument is, and
// which argument is a file pattern searched from that path.
const TOOLS = {
  Read: { tool: "read", path: "file_path" },
  Write: { tool: "write", path: "file_path" },
  Edit: { tool: "edit", path: "file_path" },
  Glob: { tool: "find", path: "path", pattern: "pattern" },
  Grep: { tool: "grep", path: "path", pattern: "glob" },
  Bash: { tool: "bash" },
};

// A pattern that starts at the root or climbs out of its path would search outside the checked path.
function escapingPattern(pattern) {
  if (typeof pattern !== "string") return false;
  return pattern.startsWith("/") || pattern.startsWith("~") || pattern.split(/[\\/]/).includes("..");
}

function respond(output) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...output } }));
}

function deny(reason) {
  respond({ permissionDecision: "deny", permissionDecisionReason: reason });
}

/**
 * The hook's decision for one PreToolUse input, as the response it writes. Exported for tests.
 *
 * @param {any} input Claude Code's hook input: tool_name, tool_input, cwd
 * @param {Record<string, string | undefined>} environment
 */
export function decide(input, environment) {
  const known = TOOLS[input?.tool_name];
  if (known === undefined) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason: `Tool is not declared for this evaluation: ${input?.tool_name}`,
    };
  }
  const state = guardState(environment);
  // Glob lists and finds files, so a group that declares only ls gets it too.
  const tool = known.tool === "find" && !state.allowedTools.has("find") ? "ls" : known.tool;
  const arguments_ = input.tool_input ?? {};
  if (known.pattern !== undefined && escapingPattern(arguments_[known.pattern])) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason: `${tool} pattern must be relative to its path inside the evaluation environment: ${arguments_[known.pattern]}`,
    };
  }
  const mapped = known.path === undefined ? arguments_ : { path: arguments_[known.path] };
  const decision = decideToolCall(state, tool, mapped, input.cwd ?? process.cwd(), environment);
  if (decision?.block) return { permissionDecision: "deny", permissionDecisionReason: decision.reason };
  if (decision?.command !== undefined) {
    return { permissionDecision: "allow", updatedInput: { ...arguments_, command: decision.command } };
  }
  return { permissionDecision: "allow" };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    respond(decide(JSON.parse(readFileSync(0, "utf8")), process.env));
  } catch (error) {
    deny(`the evaluation guard could not decide this call: ${error instanceof Error ? error.message : String(error)}`);
  }
}

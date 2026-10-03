import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateTokens } from "./carry.js";
import { currentCycle } from "./harness.js";
/**
 * The result index: this cycle's larger tool results, each with an id the agent can carry by. Ids number tool results
 * in branch order (r1, r2, ...), so they stay stable while the branch grows, and a result from an earlier cycle still
 * resolves because its entry stays stored after compaction.
 */
const SIZE_FLOOR = 500;
const MAX_ROWS = 40;
/**
 * The most tokens the rendered index can take: 40 rows of at most about 140 characters (an 80-character label plus
 * id, tool, size and carried note) and a heading. Below the warning by more than this, the index cannot reach it.
 */
export const INDEX_TOKEN_BOUND = 2_000;
/** Freeflow's own control calls: no evidence to carry, as routing's evidence selection also excludes them. */
const CONTROL_TOOLS = new Set([
  "freeflow_delegate",
  "freeflow_return",
  "freeflow_project",
  "freeflow_unit",
  "freeflow_compact",
]);
const resultText = (message) =>
  (message?.content ?? [])
    .map((part) => (part?.type === "text" ? part.text : part?.type === "image" ? "[image]" : ""))
    .join("");
function label(name, input) {
  const firstLine = (text) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const value =
    typeof input?.command === "string"
      ? input.command
      : typeof input?.path === "string"
        ? input.path
        : typeof input?.url === "string"
          ? input.url
          : typeof input?.code === "string"
            ? `script: ${firstLine(input.code)}`
            : Array.isArray(input?.queries)
              ? input.queries.join("; ")
              : typeof input?.query === "string"
                ? input.query
                : name;
  const line = firstLine(String(value));
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}
/** The Freeflow package root: reads of its skills, references and prompts are instructions, not work to carry. */
const FREEFLOW_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const INSTRUCTION_DIRS = ["capabilities", "skills", "runtime"].map((dir) => resolve(FREEFLOW_ROOT, dir) + sep);
function isFreeflowInstruction(tool, input) {
  if (tool !== "read" || typeof input?.path !== "string") return false;
  const path = resolve(input.path);
  return INSTRUCTION_DIRS.some((dir) => path.startsWith(dir));
}
/** Every tool result on the branch with its id, oldest first. */
function allResults(branch) {
  const calls = new Map();
  const results = [];
  for (const entry of branch) {
    const message = entry?.type === "message" ? entry.message : undefined;
    if (message?.role === "assistant")
      for (const block of message.content ?? [])
        if (block?.type === "toolCall") calls.set(block.id, { name: block.name, input: block.arguments });
    if (message?.role !== "toolResult") continue;
    const call = calls.get(message.toolCallId);
    const text = resultText(message);
    const tool = call?.name ?? message.toolName ?? "tool";
    results.push({
      id: `r${results.length + 1}`,
      tool,
      label: label(tool, call?.input),
      tokens: estimateTokens(text),
      text,
      ...firstLineOf(tool, call?.input, message),
      entry,
      input: call?.input,
    });
  }
  return results;
}
/** A text read of a file starts at its offset (Pi's read is 1-based); an image or failed read has no lines. */
function firstLineOf(tool, input, message) {
  if (tool !== "read" || typeof input?.path !== "string" || message?.isError) return {};
  if ((message?.content ?? []).some((part) => part?.type === "image")) return {};
  return { firstLine: Number.isInteger(input?.offset) && input.offset > 0 ? input.offset : 1 };
}
/** The first line of the read result in a session entry, for a result carried by routing ref. */
export function resultFirstLine(branch, entryId) {
  return allResults(branch).find((result) => result.entry?.id === entryId)?.firstLine;
}
export function resolveResult(branch, id) {
  const found = allResults(branch).find((result) => result.id === id);
  if (!found) return undefined;
  const { entry: _entry, input: _input, ...result } = found;
  return result;
}
/**
 * The tool results of the work in progress, newest first: the current assignment's under Cognitive Routing (by
 * routing ref), otherwise this cycle's (by r-id). Freeflow's control calls and reads of its own instructions are left
 * out: they are how the agent works, not what it worked on.
 */
export function scopeResults(branch, assignment) {
  const cycle = new Set(currentCycle(branch));
  return allResults(branch)
    .filter((result) => (assignment ? assignment.entryIds.has(result.entry.id) : cycle.has(result.entry)))
    .filter((result) => !CONTROL_TOOLS.has(result.tool) && !isFreeflowInstruction(result.tool, result.input))
    .reverse()
    .map(({ entry, input, ...result }) => ({
      ...result,
      id: assignment ? `ctx:${entry.id}` : result.id,
      entryId: entry.id,
      ...(typeof input?.path === "string" ? { path: input.path } : {}),
    }));
}
/** This cycle's results above the size floor, newest first, then results the last Freeflow compaction carried. */
export function resultIndex(branch) {
  const cycle = new Set(currentCycle(branch));
  const results = allResults(branch);
  const rows = results
    .filter(
      (result) =>
        cycle.has(result.entry) &&
        result.tokens >= SIZE_FLOOR &&
        !CONTROL_TOOLS.has(result.tool) &&
        !isFreeflowInstruction(result.tool, result.input),
    )
    .reverse()
    .map(({ id, tool, label, tokens }) => ({ id, tool, label, tokens }));
  const latest = [...branch].reverse().find((entry) => entry?.type === "compaction" && entry.details?.freeflow);
  for (const item of latest?.details?.freeflow?.carried ?? []) {
    if (item?.kind !== "result" || rows.some((row) => row.id === item.ref)) continue;
    const result = results.find((each) => each.id === item.ref);
    if (result)
      rows.push({
        id: result.id,
        tool: result.tool,
        label: result.label,
        tokens: result.tokens,
        firstCycle: item.firstCycle,
      });
  }
  return rows.slice(0, MAX_ROWS);
}
export function renderIndex(rows) {
  if (!rows.length) return "No tool results large enough to list; carry files by path.";
  return [
    "Results you can carry by id:",
    ...rows.map(
      (row) =>
        `- ${row.id}  ${row.tool}  ${row.label}  ~${row.tokens} tokens${row.firstCycle ? `  (carried since cycle ${row.firstCycle})` : ""}`,
    ),
  ].join("\n");
}

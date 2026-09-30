import { homedir, platform, release } from "node:os";
import { getShellConfig } from "@earendil-works/pi-coding-agent";
// Pi's generic rule lines that contradict the taught bash-first working style or repeat Freeflow's interaction
// contract. Every other rule, including each tool's and extension's guidelines, stays as Pi renders it.
const REMOVED_RULES = new Set([
  "- Use read to examine files instead of cat or sed.",
  "- Be concise in your responses",
  "- Show file paths clearly when working with files",
]);
function renderedSection(systemPrompt, name) {
  const match = new RegExp(`<${name}>\\n([\\s\\S]*?)\\n</${name}>`).exec(systemPrompt);
  return match?.[1];
}
function rules(systemPrompt) {
  const rendered = renderedSection(systemPrompt, "rules");
  if (rendered === undefined) return undefined;
  const lines = rendered.split("\n");
  const kept = lines.filter((line) => !REMOVED_RULES.has(line));
  return kept.length === lines.length || kept.length === 0 ? undefined : kept.join("\n");
}
function docs(systemPrompt) {
  const rendered = renderedSection(systemPrompt, "docs");
  if (rendered === undefined) return undefined;
  const path = (label) => new RegExp(`^- ${label}: (.+?)(?: \\(|$)`, "m").exec(rendered)?.[1];
  const [readme, docsPath, examples] = [path("Main documentation"), path("Additional docs"), path("Examples")];
  if (!readme || !docsPath || !examples) return undefined;
  return `Pi documentation (read only when the user asks about pi itself): ${readme}, ${docsPath}, ${examples}.`;
}
function environment(shellPath) {
  let shell;
  try {
    shell = getShellConfig(shellPath?.startsWith("~/") ? `${homedir()}${shellPath.slice(1)}` : shellPath).shell;
  } catch {
    shell = "unavailable";
  }
  return `Platform: ${platform()} ${release()}. Shell for bash: ${shell}.`;
}
/**
 * Pi prompt sections Freeflow owns while Tool Execution is effective. Every value derives from inputs fixed for the
 * configuration and machine, so the system prompt stays identical across requests and sessions. Pi's preamble is
 * never touched: the Claude subscription plugin shapes it only when Pi's own preamble is present.
 */
export function toolExecutionSections(systemPrompt, shellPath) {
  const sections = {};
  const ownRules = rules(systemPrompt);
  if (ownRules !== undefined) sections.rules = ownRules;
  const ownDocs = docs(systemPrompt);
  if (ownDocs !== undefined) sections.docs = ownDocs;
  return sections;
}
/** Sections Tool Execution adds after Freeflow's guidance: the environment facts, then its guidance when available. */
export function toolExecutionTail(shellPath, guidance) {
  return { environment: environment(shellPath), ...(guidance ? { tool_execution: guidance } : {}) };
}

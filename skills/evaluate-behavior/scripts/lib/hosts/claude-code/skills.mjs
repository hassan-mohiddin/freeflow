// Declared skills on Claude Code. Its own skill loader would also find bundled and user skills, so the evaluator
// keeps it off and delivers declared skills the way Pi's evaluated subjects see them: a listing of each skill's
// name, description and SKILL.md location in the system prompt, and, for a body run's target, Pi's exact skill
// command expansion as the first prompt.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { escapeXml } from "../../../guard-rules.mjs";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed;
}

/**
 * A declared skill's SKILL.md: its frontmatter `name`, `description` and `disable-model-invocation`, and its body.
 * Only one-line scalars are read; a skill whose name or description this cannot read is refused, never guessed.
 *
 * @param {string} directory the materialized skill directory
 */
export async function readSkill(directory) {
  const filePath = path.join(directory, "SKILL.md");
  const contents = await readFile(filePath, "utf8");
  const match = FRONTMATTER.exec(contents);
  if (match === null) throw new Error(`skill has no frontmatter: ${filePath}`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (field !== null) fields[field[1]] = field[2];
  }
  const read = (key) => {
    if (fields[key] === undefined) return undefined;
    try {
      return scalar(fields[key]);
    } catch {
      return undefined;
    }
  };
  const name = read("name");
  const description = read("description");
  if (!name || !description || /^[>|]/.test(name) || /^[>|]/.test(description)) {
    throw new Error(`skill needs a one-line name and description the Claude Code adapter can read: ${filePath}`);
  }
  return {
    name,
    description,
    filePath,
    baseDir: directory,
    disableModelInvocation: read("disable-model-invocation") === "true",
    body: contents.slice(match[0].length).trim(),
  };
}

/** The `<available_skills>` listing for the system prompt, as Pi writes it; empty when no skill may be invoked. */
export function skillListing(skills) {
  const listed = skills.filter((skill) => !skill.disableModelInvocation);
  if (listed.length === 0) return "";
  const lines = ["<available_skills>"];
  for (const skill of listed) {
    lines.push(
      "  <skill>",
      `    <name>${escapeXml(skill.name)}</name>`,
      `    <description>${escapeXml(skill.description)}</description>`,
      `    <location>${escapeXml(skill.filePath)}</location>`,
      "  </skill>",
    );
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

/** The prompt Pi delivers for `/skill:<name> <prompt>`, so an explicit invocation reads the same on both hosts. */
export function skillCommandPrompt(skill, prompt) {
  const block = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.body}\n</skill>`;
  return prompt ? `${block}\n\n${prompt}` : block;
}

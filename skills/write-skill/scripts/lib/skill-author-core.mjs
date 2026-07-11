import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

export function parseSkill(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: text };
  const frontmatter = {};
  for (const line of match[1].split("\n")) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    frontmatter[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return { frontmatter, body: match[2] };
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export async function resolveSkillPath(input) {
  const absolute = resolve(input);
  const info = await stat(absolute);
  return info.isDirectory() ? resolve(absolute, "SKILL.md") : absolute;
}

export async function validateSkill(input) {
  const skillPath = await resolveSkillPath(input);
  const skillRoot = dirname(skillPath);
  const text = await readFile(skillPath, "utf8");
  const { frontmatter, body } = parseSkill(text);
  const errors = [];
  const warnings = [];

  if (!frontmatter) errors.push("SKILL.md must start with YAML frontmatter");
  const name = frontmatter?.name ?? "";
  const description = frontmatter?.description ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) errors.push("frontmatter.name must use lowercase kebab-case");
  if (!description) errors.push("frontmatter.description is required");
  if (name && basename(skillRoot) !== name) warnings.push(`directory name '${basename(skillRoot)}' differs from skill name '${name}'`);
  if (!/^#\s+\S/m.test(body)) errors.push("SKILL.md body needs a top-level heading");

  const links = [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(?:https?:|#)/.test(link)) continue;
    const target = resolve(skillRoot, link.split("#")[0]);
    if (!inside(skillRoot, target)) {
      errors.push(`linked resource escapes skill root: ${link}`);
      continue;
    }
    try { await access(target, constants.R_OK); } catch { errors.push(`linked resource is missing: ${link}`); }
  }

  return {
    valid: errors.length === 0,
    skill_path: skillPath,
    name: name || null,
    description: description || null,
    lines: text.split("\n").length,
    linked_resources: links.filter((link) => !/^(?:https?:|#)/.test(link)),
    errors,
    warnings,
  };
}

export async function inspectSkill(input) {
  const validation = await validateSkill(input);
  const text = await readFile(validation.skill_path, "utf8");
  const { frontmatter, body } = parseSkill(text);
  const signals = [];
  const weakPhrases = ["consider", "ensure", "leverage", "try to", "be mindful"];
  const foundWeak = weakPhrases.filter((phrase) => body.toLowerCase().includes(phrase));
  if (foundWeak.length) signals.push({ level: "advisory", code: "weak-verbs", detail: foundWeak });
  if (frontmatter?.description && !/\bwhen\b|\buse\b/i.test(frontmatter.description)) {
    signals.push({ level: "advisory", code: "activation-boundary", detail: "Description does not state when the skill applies." });
  }
  if (!/\bDraft\b|\bUnverified\b|\bProduction-Ready\b/i.test(body)) {
    signals.push({ level: "advisory", code: "status-unlabeled", detail: "No explicit readiness label appears in the active instructions." });
  }
  if (validation.lines > 120) signals.push({ level: "advisory", code: "active-body-size", detail: `${validation.lines} lines; inspect whether conditional depth belongs in references.` });

  const root = dirname(validation.skill_path);
  const topLevel = await readdir(root);
  return {
    ...validation,
    resources: topLevel.filter((name) => name !== "SKILL.md").sort(),
    signals,
    claim: "Static inspection reports structure and wording signals only; it does not prove activation or behavior.",
  };
}

export async function initSkill({ name, root, description }) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error("Skill name must use lowercase kebab-case");
  const destination = resolve(root, name);
  await mkdir(destination, { recursive: false });
  const skillPath = resolve(destination, "SKILL.md");
  const title = name.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
  const text = `---\nname: ${name}\ndescription: ${description ?? `Use when an agent needs the ${title} behavior.`}\n---\n\n# ${title}\n\n> Status: Draft\n\n## Job\n\nState the smallest behavior this skill must change.\n\n## Rules\n\n- Replace this placeholder with direct, agent-first instructions.\n- Add references or scripts only after a measured failure proves they are needed.\n`;
  await writeFile(skillPath, text, { flag: "wx" });
  return { skill_root: destination, skill_path: skillPath, status: "draft", files: ["SKILL.md"] };
}

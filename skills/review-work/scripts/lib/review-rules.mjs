// The review rules, in three layers: Freeflow's shipped default (a review at every pull request, one reviewer, one
// round), the user's own rule in the Freeflow home's rules/review.md, and the project's Review Rules in the repository,
// which win. One line in them is read by scripts, the moment a review must run:
//   Review at: pull request | push | commit
// Everything else in a rules file is prose the agent reads. The project's rules are a "## Review Rules" section of a
// tracked Markdown file, or a file named for them (REVIEW.md, review-rules.md, REVIEW_RULES.md), read at a commit so a
// change never supplies its own rules. Shared by review-plan.mjs, review-status.mjs (and through it Deliver Work's
// delivery-state.mjs), review-packet.mjs, which points the brief at the rules, and check-brief.mjs, which refuses
// "Review rules: none" when they exist.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where a review can be due, earliest first: a rule names one, and a review is due there and at every later one. */
export const REVIEW_AT = ["commit", "push", "pull request"];
export const DEFAULT_REVIEW_AT = "pull request";
/** The user's own rule, in the Freeflow home. */
export const HOME_RULES = join("rules", "review.md");
const RULES_FILE = /(^|\/)(REVIEW\.md|review-rules\.md|REVIEW_RULES\.md)$/i;
const SECTION = /^## Review Rules[ \t]*$/;
const LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?Review at:(?:\*\*)?\s*(.*?)\s*$/i;

// Repository-relative paths of the tracked Markdown files at <commit> with a "## Review Rules" heading; [] when there
// are none or Git cannot search.
export function reviewRulesSections(root, commit) {
  const run = spawnSync("git", ["grep", "-l", "-E", "^## Review Rules[[:space:]]*$", commit, "--", "*.md"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.status !== 0) return [];
  return run.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(commit.length + 1));
}

/** Repository-relative paths of the tracked files named for the review rules at <commit>. */
export function reviewRulesFiles(root, commit) {
  const run = spawnSync("git", ["ls-tree", "-r", "--name-only", commit], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) return [];
  return run.stdout.split("\n").filter((path) => RULES_FILE.test(path));
}

/** The text under a "## Review Rules" heading, up to the next heading of that level or higher. */
function sectionText(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => SECTION.test(line));
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && /^#{1,2} /.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

/**
 * The "Review at:" lines in a text, in order, each with its value when it names a step, or the reason it is ignored.
 * A value may be in backticks and end with a full stop.
 */
export function reviewAtLines(text) {
  const out = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = LINE.exec(line);
    if (!match) continue;
    const value = match[1].replace(/[`*]/g, "").replace(/\.$/, "").trim().toLowerCase().replace(/\s+/g, " ");
    out.push(
      REVIEW_AT.includes(value)
        ? { line: line.trim(), value }
        : { line: line.trim(), reason: `takes ${REVIEW_AT.join(", ")}, not "${match[1]}"` },
    );
  }
  return out;
}

const show = (root, commit, path) =>
  spawnSync("git", ["show", `${commit}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

/**
 * When a review must run, and which layer says so: the project's rules at <commit>, else the Freeflow home's
 * rules/review.md, else the default. A line that names no step is ignored and named, and the next layer decides; a
 * later line in the same layer that disagrees with the one used is named too. Never throws: a rule that cannot be read
 * leaves the next layer in force.
 * @param {{ root: string, commit: string|null, env?: object }} input
 * @returns {{ value: string, from: "project"|"home"|"default", source: string|null, ignored: {source: string, line: string, reason: string}[] }}
 */
export function reviewAt({ root, commit, env = process.env }) {
  const ignored = [];
  const pick = (from, found) => {
    let chosen = null;
    for (const { source, lines } of found)
      for (const each of lines) {
        if (each.reason) ignored.push({ source, line: each.line, reason: each.reason });
        else if (!chosen) chosen = { value: each.value, from, source };
        else if (each.value !== chosen.value)
          ignored.push({
            source,
            line: each.line,
            reason: `the first line, in ${chosen.source}, says ${chosen.value}`,
          });
      }
    return chosen;
  };
  if (commit) {
    const found = [];
    for (const path of reviewRulesFiles(root, commit)) {
      const run = show(root, commit, path);
      if (run.status === 0) found.push({ source: path, lines: reviewAtLines(run.stdout) });
    }
    for (const path of reviewRulesSections(root, commit)) {
      const run = show(root, commit, path);
      if (run.status === 0)
        found.push({ source: `${path}#review-rules`, lines: reviewAtLines(sectionText(run.stdout)) });
    }
    const project = pick("project", found);
    if (project) return { ...project, ignored };
  }
  const home = join(env.FREEFLOW_HOME || join(homedir(), ".freeflow"), HOME_RULES);
  if (existsSync(home)) {
    let text = "";
    try {
      text = readFileSync(home, "utf8");
    } catch (error) {
      ignored.push({ source: home, line: "", reason: `cannot be read (${error.code ?? error.message})` });
    }
    const own = pick("home", [{ source: home, lines: reviewAtLines(text) }]);
    if (own) return { ...own, ignored };
  }
  return { value: DEFAULT_REVIEW_AT, from: "default", source: null, ignored };
}

/** Whether a review is due at <step> under the rule: at the step it names and every later one. */
export function dueAt(rule, step) {
  return REVIEW_AT.indexOf(step) >= REVIEW_AT.indexOf(rule);
}

/** The rule as one line: `Review at: push (dev-docs/README.md#review-rules at main)`, then each ignored line. */
export function reviewAtText(rule, ref) {
  const where =
    rule.from === "default"
      ? "Freeflow's default"
      : rule.from === "project"
        ? `${rule.source}${ref ? ` at ${ref}` : ""}`
        : rule.source;
  return [
    `Review at: ${rule.value} (${where})`,
    ...rule.ignored.map((each) => `  Ignored: ${each.source}${each.line ? ` "${each.line}"` : ""}: ${each.reason}`),
  ];
}

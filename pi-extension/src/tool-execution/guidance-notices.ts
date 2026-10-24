import { execFile } from "node:child_process";
import { join } from "node:path";
import { freeflowNotice } from "../host/inbound.js";
import { isFreeflowInstruction } from "./skill-reads.js";

/**
 * Guidance pushed at the moment it is needed (the push retriever, Task 004 D-003): a short Freeflow notice appended to
 * the result of the tool call that makes it relevant, so it reaches the agent whether or not it read the skill that
 * owns it.
 *
 * - A `git commit` result: Deliver Work's commit essentials, plus Write Skill's loss check when the commit staged
 *   model-facing instruction text (read from Git at that result). Once per run.
 * - The second failure of the same test command: diagnose's two key lines. Once per command until it passes.
 * - A test command that passes after the run changed a file: run Execute Work's self-review before the final report.
 *   Once per run, and not after self-review ran.
 * - Any tool result while Execute Work's body is not in the model's context (never read, or dropped by a compaction):
 *   read it before more tool calls. Once per run, and not on a read of Freeflow's own instruction files, so reading
 *   Discuss Work first is not interrupted.
 *
 * Cache: a notice is part of a tool result that has not been delivered yet, the same path as Tool Execution's
 * changed-files line; nothing already sent changes. Request path: none of this runs per request. State is in memory,
 * O(1) per tool result, bounded (at most FAILURE_KEYS test commands), and reset per run where it says so.
 */

const FAILURE_KEYS = 32;
const TEST_COMMAND =
  /(^|[\s;&|(])((npm|pnpm|yarn|bun)\b[^;&|]*\btest(:[\w:-]+)?\b|node\s+(\S+\s+)*--test\b|(pytest|jest|vitest|mocha|rspec|phpunit|ctest|tox)\b|go\s+test\b|cargo\s+(test|nextest)\b|(mvn|gradle|\.\/gradlew)\b[^;&|]*\btest\b|make\s+(test|check)\b|dotnet\s+test\b|bundle\s+exec\s+rspec\b|python3?\s+-m\s+(pytest|unittest)\b)/;
const GIT_COMMIT = /(^|[\s;&|(])git(\s+(-C|-c)\s+\S+)*\s+commit\b(?![^;&|]*--help)/;
const CHANGES_FILES = new Set(["edit", "write", "apply_patch"]);
// Model-facing instruction text, as Write Skill's loss check reads it: skill packages, capabilities, runtime prompts
// and instruction files.
const INSTRUCTION_TEXT =
  /(^|\/)(SKILL\.md|AGENTS\.md|CLAUDE\.md)$|^(skills|capabilities)\/.+\.md$|(^|\/)prompts\/[^/]+\.md$/;

export const COMMIT_NOTICE =
  "Committing (Deliver Work): check what the commit holds with `git show --stat --oneline HEAD` and `git status --short --branch`: only the paths this claim needs, staged explicitly, since staged does not mean yours. Never commit Working Records (`.freeflow/tasks/`), secrets or local environment files. No --amend, --no-verify, --allow-empty or push unless the user asked for exactly that; after a failed commit or hook, inspect what changed before retrying.";
export const INSTRUCTION_TEXT_NOTICE =
  "This commit stages model-facing instruction text: for a substantial revision (a merge, split, move or rewrite), run Write Skill's `skill-author compare --all-units` and settle every unmatched unit before it goes further.";
export const DIAGNOSE_NOTICE =
  "This test command failed twice (Execute Work's Diagnose Before Fixing; its diagnose reference has the full loop): two failed fixes mean the diagnosis is wrong. Before the next change, find an observation that would come out differently if your explanation were wrong: change the question, change the kind of observation, or check the cheapest assumption (did it build; does the test import what you think?).";
export const executeWorkNotice = (skill: string) =>
  `Read Execute Work (${skill}) before more tool calls: it holds how to read the request, find what a change touches and diagnose a failure.`;
/** Text without the guidance notices joined to it: moment guidance, not evidence, so it is not carried on. */
export const withoutGuidanceNotices = (text: string) =>
  text.replace(/\n?<freeflow-notice type="guidance">\n[\s\S]*?\n<\/freeflow-notice>/g, "");
export const selfReviewNotice = (script: string) =>
  `Before your final report (Execute Work's step before reporting; read Execute Work if its body is not in your context): run \`node ${script} --base <ref>\` and read its report: changed tests and fixtures with their hunks, new tests and whether they fail on the base, and whether each requirement's check ran after the last edit.`;

type Run = { committed: boolean; changed: boolean; reviewed: boolean; reminded: boolean; executeWork: boolean };

const textOf = (content: readonly any[] | undefined) =>
  (content ?? []).map((part) => (part?.type === "text" ? part.text : "")).join("");

/**
 * The paths a commit command dealt with, read once at its result: what the new commit holds when it succeeded, what is
 * still staged when it failed. Null when Git cannot tell.
 */
function committedPaths(cwd: string, failed: boolean): Promise<string[] | null> {
  const args = failed
    ? ["diff", "--cached", "--name-only"]
    : ["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", "HEAD"];
  return new Promise((resolve) =>
    execFile("git", args, { cwd, timeout: 2000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) =>
      resolve(error ? null : stdout.split("\n").filter(Boolean)),
    ),
  );
}

export class GuidanceNotices {
  private run: Run = { committed: false, changed: false, reviewed: false, reminded: false, executeWork: false };
  private readonly failures = new Map<string, number>();
  private readonly selfReview: string;
  private readonly executeWork: string;

  constructor(packageRoot: string) {
    this.selfReview = join(packageRoot, "skills", "execute-work", "scripts", "self-review.mjs");
    this.executeWork = join(packageRoot, "skills", "execute-work", "SKILL.md");
  }

  /** A new agent run: per-run notices may come again. */
  runStarted(): void {
    this.run = { committed: false, changed: false, reviewed: false, reminded: false, executeWork: false };
  }

  /**
   * The notice lines to append to a tool result; empty when none applies. `executeWorkUnread` says whether Execute
   * Work is a skill this session lists and its body is not in the model's context; omitted, the notice never shows.
   */
  async toolResult(event: any, cwd: string, executeWorkUnread?: () => boolean): Promise<string[]> {
    if (event?.parentToolCallId) return [];
    const name = event?.toolName;
    const lines: string[] = [];
    if (
      !this.run.executeWork &&
      executeWorkUnread !== undefined &&
      !isFreeflowInstruction(name, event.input, cwd) &&
      executeWorkUnread()
    ) {
      this.run.executeWork = true;
      lines.push(freeflowNotice("guidance", executeWorkNotice(this.executeWork)));
    }
    if (CHANGES_FILES.has(name)) {
      if (!event.isError) this.run.changed = true;
      return lines;
    }
    if (name !== "bash") return lines;
    const command = String(event.input?.command ?? "").trim();
    if (command.includes("self-review.mjs")) this.run.reviewed = true;

    if (GIT_COMMIT.test(command) && !this.run.committed) {
      this.run.committed = true;
      const paths = await committedPaths(cwd, event.isError === true);
      const body = [COMMIT_NOTICE];
      if (paths?.some((path) => INSTRUCTION_TEXT.test(path))) body.push(INSTRUCTION_TEXT_NOTICE);
      lines.push(freeflowNotice("guidance", body.join("\n")));
    }

    if (TEST_COMMAND.test(command)) {
      const key = command.replace(/\s+/g, " ");
      // Pi's bash reports a nonzero exit as an error result ("Command exited with code N").
      const failed = event.isError === true || /Command exited with code [1-9]\d*\s*$/.test(textOf(event.content));
      if (failed) {
        const count = (this.failures.get(key) ?? 0) + 1;
        this.failures.delete(key);
        this.failures.set(key, count);
        while (this.failures.size > FAILURE_KEYS) this.failures.delete(this.failures.keys().next().value as string);
        if (count === 2) lines.push(freeflowNotice("guidance", DIAGNOSE_NOTICE));
      } else {
        this.failures.delete(key);
        if (this.run.changed && !this.run.reviewed && !this.run.reminded) {
          this.run.reminded = true;
          lines.push(freeflowNotice("guidance", selfReviewNotice(this.selfReview)));
        }
      }
    }
    return lines;
  }
}

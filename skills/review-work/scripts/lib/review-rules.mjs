// The project's Review Rules kept as a section of a tracked Markdown file, found at a commit. Shared by
// review-packet.mjs, which points the brief at them, and check-brief.mjs, which refuses "Review rules: none" when they
// exist.
import { spawnSync } from "node:child_process";

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

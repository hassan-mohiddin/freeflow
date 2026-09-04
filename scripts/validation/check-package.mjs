#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const requiredFiles = [
  "plugin.json",
  "gemini-extension.json",
  ".cursor-plugin/plugin.json",
  "com.github.copilot/hooks/hooks.json",
  "hooks/claude/hooks.json",
  "hooks/codex/hooks.json",
  "hooks/hooks.json",
  "hooks/cursor/hooks.json",
  "hooks/shared/runtime-context.mjs",
  "hooks/adapters/claude-session-start.mjs",
  "hooks/adapters/codex-session-start.mjs",
  "hooks/adapters/gemini-session-start.mjs",
  "hooks/adapters/cursor-session-start.mjs",
  "hooks/adapters/copilot-session-start.mjs",
  "pi-extension/freeflow/index.js",
  "runtime/prompts/core.md",
  "runtime/prompts/interaction-contract.md",
  "runtime/prompts/cognitive-routing.md",
  "runtime/prompts/context-virtualization.md",
  "runtime/prompts/conversation-history.md",
  "skills/action-selection/SKILL.md",
  "skills/workflow/SKILL.md",
  "capabilities/cognitive-routing/SKILL.md",
  "capabilities/context-virtualization/SKILL.md",
  "capabilities/conversation-history/SKILL.md",
];
const excludedPrefixes = ["plugin-docs/", ".skill-eval/", ".deprecated/", "plans/"];
const forbiddenPrefixes = ["router/", "capabilities/output-router/"];

try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const output = execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const files = new Set(JSON.parse(output)[0].files.map(({ path }) => path));
  const missing = requiredFiles.filter((path) => !files.has(path));
  const excluded = [...files].filter((path) => excludedPrefixes.some((prefix) => path.startsWith(prefix)));
  const forbidden = [...files].filter((path) => forbiddenPrefixes.some((prefix) => path.startsWith(prefix)));
  const portableSkillFiles = [...files].filter((path) => /^skills\/[^/]+\/SKILL\.md$/.test(path));
  const duplicateSkillTrees = [...files].filter((path) =>
    [".github/skills/", ".agents/skills/", ".gemini/skills/", ".kiro/skills/"].some((prefix) =>
      path.startsWith(prefix),
    ),
  );
  if (missing.length > 0) throw new Error(`npm package is missing: ${missing.join(", ")}`);
  if (excluded.length > 0) throw new Error(`npm package includes excluded files: ${excluded.join(", ")}`);
  if (forbidden.length > 0)
    throw new Error(`npm package includes retired Output Router files: ${forbidden.join(", ")}`);
  if (portableSkillFiles.length !== 25)
    throw new Error(`npm package must contain exactly 25 canonical skill files; found ${portableSkillFiles.length}`);
  if (duplicateSkillTrees.length > 0)
    throw new Error(`npm package includes duplicate maintained skill trees: ${duplicateSkillTrees.join(", ")}`);
  if (files.has("opencode.json")) throw new Error("npm package must exclude the repository-only opencode.json");
  if (packageJson.files?.some((path) => excludedPrefixes.some((prefix) => path.startsWith(prefix)))) {
    throw new Error("package.json files list includes GitHub-only or deprecated content");
  }
  console.log(`Package boundary check passed: ${files.size} files inspected.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

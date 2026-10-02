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
  "pi-extension/dist/host/request-history.js",
  "pi-extension/dist/cognitive-routing/provenance.js",
  "pi-extension/dist/provider-support/index.js",
  "pi-extension/dist/provider-support/openai/index.js",
  "pi-extension/dist/provider-support/openai/adapter.js",
  "pi-extension/dist/provider-support/openai/history.js",
  "pi-extension/dist/provider-support/openai/session-state.js",
  "runtime/prompts/tool-execution.md",
  "runtime/prompts/core.md",
  "runtime/prompts/interaction-contract.md",
  "runtime/prompts/working-method.md",
  "runtime/prompts/cognitive-routing.md",
  "skills/action-selection/SKILL.md",
  "skills/workflow/SKILL.md",
  "capabilities/cognitive-routing/SKILL.md",
  "capabilities/cognitive-routing/references/helper-mode.md",
  "capabilities/cognitive-routing/references/executor-mode.md",
  "capabilities/cognitive-routing/references/both-mode.md",
  "capabilities/compaction/SKILL.md",
  "capabilities/compaction/references/summary-format.md",
  "pi-extension/dist/compaction/controller.js",
];
const excludedPrefixes = [
  "plugin-docs/",
  ".skill-eval/",
  ".deprecated/",
  ".freeflow/",
  "plans/",
  "pi-extension/src/",
  "pi-extension/tests/",
  "hooks/tests/",
];
const forbiddenPrefixes = ["router/", "capabilities/output-router/"];
const retiredContextPrefixes = [
  "capabilities/context-virtualization/",
  "capabilities/conversation-history/",
  "pi-extension/src/context-virtualization/",
  "pi-extension/src/conversation-history/",
  "pi-extension/src/freeflow-context/",
  "pi-extension/dist/context-virtualization/",
  "pi-extension/dist/conversation-history/",
  "pi-extension/dist/freeflow-context/",
  "pi-extension/tests/context-virtualization/",
  "pi-extension/tests/conversation-history/",
];
// The v2 Tool Execution runtime lives in .deprecated/tool-execution-v2 and must not ship.
// Its guidance is the Tool Execution system section; the capability skill is retired.
const retiredToolRuntimePrefixes = ["pi-extension/dist/tool-runtime/", "capabilities/tool-execution/"];
const retiredContextFiles = new Set([
  "runtime/prompts/context-virtualization.md",
  "runtime/prompts/conversation-history.md",
  "pi-extension/tests/cache-reuse/settings.test.js",
]);

try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const output = execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const files = new Set(JSON.parse(output)[0].files.map(({ path }) => path));
  const retiredDependencies = ["quickjs-emscripten-core", "@jitl/quickjs-wasmfile-release-sync"].filter(
    (name) => packageJson.dependencies?.[name] !== undefined,
  );
  if (retiredDependencies.length > 0)
    throw new Error(`package.json still depends on the retired v2 program runtime: ${retiredDependencies.join(", ")}`);
  const missing = requiredFiles.filter((path) => !files.has(path));
  const excluded = [...files].filter((path) => excludedPrefixes.some((prefix) => path.startsWith(prefix)));
  const forbidden = [...files].filter((path) => forbiddenPrefixes.some((prefix) => path.startsWith(prefix)));
  const retiredContext = [...files].filter(
    (path) => retiredContextFiles.has(path) || retiredContextPrefixes.some((prefix) => path.startsWith(prefix)),
  );
  const retiredToolRuntime = [...files].filter((path) =>
    retiredToolRuntimePrefixes.some((prefix) => path.startsWith(prefix)),
  );
  const retiredSkillFiles = [...files].filter(
    (path) => path === "skills/tdd/SKILL.md" || path.startsWith("skills/tdd/"),
  );
  const privateArtifacts = [...files].filter((path) =>
    /(^|\/)(?:freeflow-session-store|orphans)(?:\/|$)|(^|\/)(?:events\.log|head\.json|\.writer-lease|\.checkpoint-[^/]+|\.pending-[^/]+|auth\.json|credentials(?:\.[^/]+)?|\.env(?:\.[^/]+)?|[^/]+\.tmp)$/.test(
      path,
    ),
  );
  const absoluteSourcePaths = [...files].filter(
    (path) => /\.(?:js|mjs|json|md)$/.test(path) && readFileSync(path, "utf8").includes(process.cwd()),
  );
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
  if (retiredContext.length > 0)
    throw new Error(`npm package includes retired context feature files: ${retiredContext.join(", ")}`);
  if (retiredToolRuntime.length > 0)
    throw new Error(`npm package includes retired v2 Tool Execution files: ${retiredToolRuntime.join(", ")}`);
  if (retiredSkillFiles.length > 0)
    throw new Error(`npm package includes retired TDD skill files: ${retiredSkillFiles.join(", ")}`);
  if (privateArtifacts.length > 0)
    throw new Error(
      `npm package includes private store, credential, or temporary files: ${privateArtifacts.join(", ")}`,
    );
  if (absoluteSourcePaths.length > 0)
    throw new Error(`npm package embeds the local source checkout path: ${absoluteSourcePaths.join(", ")}`);
  if (portableSkillFiles.length !== 24)
    throw new Error(`npm package must contain exactly 24 canonical skill files; found ${portableSkillFiles.length}`);
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

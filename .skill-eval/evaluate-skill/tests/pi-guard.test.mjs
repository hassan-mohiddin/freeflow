import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import registerSkillEvalGuard from "../../../skills/evaluate-skill/scripts/pi-guard.mjs";

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-eval-guard-test-"));
  try {
    await run(await realpath(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function installGuard() {
  const handlers = new Map();
  registerSkillEvalGuard({
    on(event, installed) {
      handlers.set(event, installed);
    },
  });
  return handlers;
}

test("Pi guard replaces hostile ambient system and append prompts with declared subject context", async () => {
  await withTempDirectory(async (root) => {
    const originalRoots = process.env.SKILL_EVAL_ALLOWED_ROOTS;
    const originalTools = process.env.SKILL_EVAL_ALLOWED_TOOLS;
    process.env.SKILL_EVAL_ALLOWED_ROOTS = JSON.stringify([root]);
    process.env.SKILL_EVAL_ALLOWED_TOOLS = JSON.stringify(["read"]);
    try {
      const beforeAgentStart = installGuard().get("before_agent_start");
      assert.ok(beforeAgentStart);
      const result = beforeAgentStart({
        systemPrompt: "HOSTILE SYSTEM HOSTILE APPEND HOSTILE CONTEXT",
        systemPromptOptions: {
          customPrompt: "HOSTILE SYSTEM",
          appendSystemPrompt: "HOSTILE APPEND",
          contextFiles: [{ path: "/ambient/AGENTS.md", content: "HOSTILE CONTEXT" }],
          selectedTools: ["read"],
          toolSnippets: { read: "Read file contents" },
          promptGuidelines: [],
          cwd: root,
          skills: [
            {
              name: "target-skill",
              description: "Use when the target behavior is requested.",
              filePath: path.join(root, "target-skill/SKILL.md"),
              disableModelInvocation: false,
            },
          ],
        },
      });

      assert.doesNotMatch(result.systemPrompt, /HOSTILE|controlled skill evaluation/);
      assert.match(result.systemPrompt, /Available tools:\n- read: Read file contents/);
      assert.match(result.systemPrompt, /<name>target-skill<\/name>/);
      assert.match(result.systemPrompt, /Use when the target behavior is requested/);
      assert.match(result.systemPrompt, /target-skill\/SKILL\.md/);
      assert.match(result.systemPrompt, new RegExp(`Current working directory: ${root.replaceAll("/", "\\/")}`));
    } finally {
      if (originalRoots === undefined) delete process.env.SKILL_EVAL_ALLOWED_ROOTS;
      else process.env.SKILL_EVAL_ALLOWED_ROOTS = originalRoots;
      if (originalTools === undefined) delete process.env.SKILL_EVAL_ALLOWED_TOOLS;
      else process.env.SKILL_EVAL_ALLOWED_TOOLS = originalTools;
    }
  });
});

test("Pi guard permits only declared tools and reads contained by canonical roots", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    const outside = path.join(root, "outside.md");
    await mkdir(workspace);
    await writeFile(path.join(workspace, "inside.md"), "inside\n");
    await writeFile(outside, "outside\n");
    await symlink(outside, path.join(workspace, "escaped.md"));
    const originalRoots = process.env.SKILL_EVAL_ALLOWED_ROOTS;
    const originalTools = process.env.SKILL_EVAL_ALLOWED_TOOLS;
    process.env.SKILL_EVAL_ALLOWED_ROOTS = JSON.stringify([workspace]);
    process.env.SKILL_EVAL_ALLOWED_TOOLS = JSON.stringify(["read"]);
    try {
      const guard = installGuard().get("tool_call");
      assert.ok(guard);
      assert.equal(guard({ toolName: "read", input: { path: "inside.md" } }, { cwd: workspace }), undefined);
      assert.match(
        guard({ toolName: "read", input: { path: outside } }, { cwd: workspace }).reason,
        /escapes the evaluation environment/,
      );
      assert.match(
        guard({ toolName: "read", input: { path: "escaped.md" } }, { cwd: workspace }).reason,
        /escapes the evaluation environment/,
      );
      assert.match(guard({ toolName: "bash", input: { command: "pwd" } }, { cwd: workspace }).reason, /not declared/);
    } finally {
      if (originalRoots === undefined) delete process.env.SKILL_EVAL_ALLOWED_ROOTS;
      else process.env.SKILL_EVAL_ALLOWED_ROOTS = originalRoots;
      if (originalTools === undefined) delete process.env.SKILL_EVAL_ALLOWED_TOOLS;
      else process.env.SKILL_EVAL_ALLOWED_TOOLS = originalTools;
    }
  });
});

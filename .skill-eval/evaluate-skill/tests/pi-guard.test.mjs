import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
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
    const originalWritableRoot = process.env.SKILL_EVAL_WRITABLE_ROOT;
    const originalTools = process.env.SKILL_EVAL_ALLOWED_TOOLS;
    process.env.SKILL_EVAL_ALLOWED_ROOTS = JSON.stringify([root]);
    process.env.SKILL_EVAL_WRITABLE_ROOT = root;
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
      if (originalWritableRoot === undefined) delete process.env.SKILL_EVAL_WRITABLE_ROOT;
      else process.env.SKILL_EVAL_WRITABLE_ROOT = originalWritableRoot;
      if (originalTools === undefined) delete process.env.SKILL_EVAL_ALLOWED_TOOLS;
      else process.env.SKILL_EVAL_ALLOWED_TOOLS = originalTools;
    }
  });
});

test("Pi guard injects exact ordered declared context and ignores ambient context", async () => {
  await withTempDirectory(async (root) => {
    const content = "Preserve rollback.\nUse the declared evidence boundary.\n";
    const manifest = path.join(root, "context-delivery.json");
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          schema_version: 1,
          entries: [
            {
              declaredPath: "runtime/interaction-contract.md",
              files: [
                {
                  path: "interaction-contract.md",
                  sha256: createHash("sha256").update(content).digest("hex"),
                  content,
                },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const originalRoots = process.env.SKILL_EVAL_ALLOWED_ROOTS;
    const originalWritableRoot = process.env.SKILL_EVAL_WRITABLE_ROOT;
    const originalTools = process.env.SKILL_EVAL_ALLOWED_TOOLS;
    const originalManifest = process.env.SKILL_EVAL_CONTEXT_MANIFEST;
    process.env.SKILL_EVAL_ALLOWED_ROOTS = JSON.stringify([root]);
    process.env.SKILL_EVAL_WRITABLE_ROOT = root;
    process.env.SKILL_EVAL_ALLOWED_TOOLS = JSON.stringify([]);
    process.env.SKILL_EVAL_CONTEXT_MANIFEST = manifest;
    try {
      const beforeAgentStart = installGuard().get("before_agent_start");
      const result = beforeAgentStart({
        systemPrompt: "HOSTILE AMBIENT CONTEXT",
        systemPromptOptions: {
          selectedTools: [],
          cwd: root,
          skills: [],
          contextFiles: [{ path: "/ambient/AGENTS.md", content: "HOSTILE AMBIENT CONTEXT" }],
        },
      });
      assert.doesNotMatch(result.systemPrompt, /HOSTILE AMBIENT CONTEXT/);
      assert.match(result.systemPrompt, /<declared_context>/);
      assert.match(result.systemPrompt, /runtime\/interaction-contract\.md/);
      assert.match(result.systemPrompt, /interaction-contract\.md/);
      assert.ok(result.systemPrompt.includes(content));
    } finally {
      if (originalRoots === undefined) delete process.env.SKILL_EVAL_ALLOWED_ROOTS;
      else process.env.SKILL_EVAL_ALLOWED_ROOTS = originalRoots;
      if (originalWritableRoot === undefined) delete process.env.SKILL_EVAL_WRITABLE_ROOT;
      else process.env.SKILL_EVAL_WRITABLE_ROOT = originalWritableRoot;
      if (originalTools === undefined) delete process.env.SKILL_EVAL_ALLOWED_TOOLS;
      else process.env.SKILL_EVAL_ALLOWED_TOOLS = originalTools;
      if (originalManifest === undefined) delete process.env.SKILL_EVAL_CONTEXT_MANIFEST;
      else process.env.SKILL_EVAL_CONTEXT_MANIFEST = originalManifest;
    }
  });
});

test("Pi guard permits only declared tools and reads contained by canonical roots", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    const outside = path.join(root, "outside.md");
    const outsideCreated = path.join(root, "outside-created.md");
    await mkdir(path.join(workspace, "..valid"), { recursive: true });
    await writeFile(path.join(workspace, "inside.md"), "inside\n");
    await writeFile(path.join(workspace, "..valid/input.txt"), "valid prefix\n");
    await writeFile(outside, "outside\n");
    await symlink(outside, path.join(workspace, "escaped.md"));
    await symlink(outsideCreated, path.join(workspace, "dangling.md"));
    const originalRoots = process.env.SKILL_EVAL_ALLOWED_ROOTS;
    const originalWritableRoot = process.env.SKILL_EVAL_WRITABLE_ROOT;
    const originalTools = process.env.SKILL_EVAL_ALLOWED_TOOLS;
    process.env.SKILL_EVAL_ALLOWED_ROOTS = JSON.stringify([workspace]);
    process.env.SKILL_EVAL_WRITABLE_ROOT = workspace;
    process.env.SKILL_EVAL_ALLOWED_TOOLS = JSON.stringify(["read", "write", "edit"]);
    try {
      const guard = installGuard().get("tool_call");
      assert.ok(guard);
      assert.equal(guard({ toolName: "read", input: { path: "inside.md" } }, { cwd: workspace }), undefined);
      assert.equal(guard({ toolName: "read", input: { path: "..valid/input.txt" } }, { cwd: workspace }), undefined);
      assert.match(
        guard({ toolName: "read", input: { path: outside } }, { cwd: workspace }).reason,
        /escapes the evaluation environment/,
      );
      assert.match(
        guard({ toolName: "read", input: { path: "escaped.md" } }, { cwd: workspace }).reason,
        /escapes the evaluation environment/,
      );
      assert.equal(guard({ toolName: "write", input: { path: "created.md" } }, { cwd: workspace }), undefined);
      assert.equal(guard({ toolName: "write", input: { path: "nested/result.md" } }, { cwd: workspace }), undefined);
      assert.equal(guard({ toolName: "edit", input: { path: "inside.md" } }, { cwd: workspace }), undefined);
      assert.match(
        guard({ toolName: "write", input: { path: outside } }, { cwd: workspace }).reason,
        /escapes the evaluation environment/,
      );
      const danglingWrite = guard({ toolName: "write", input: { path: "dangling.md" } }, { cwd: workspace });
      if (danglingWrite === undefined) await writeFile(path.join(workspace, "dangling.md"), "escaped\n");
      assert.match(danglingWrite?.reason, /cannot be resolved inside the evaluation environment/);
      await assert.rejects(readFile(outsideCreated, "utf8"), { code: "ENOENT" });
      assert.match(
        guard({ toolName: "edit", input: { path: "escaped.md" } }, { cwd: workspace }).reason,
        /escapes the evaluation environment/,
      );
      assert.match(guard({ toolName: "bash", input: { command: "pwd" } }, { cwd: workspace }).reason, /not declared/);
    } finally {
      if (originalRoots === undefined) delete process.env.SKILL_EVAL_ALLOWED_ROOTS;
      else process.env.SKILL_EVAL_ALLOWED_ROOTS = originalRoots;
      if (originalWritableRoot === undefined) delete process.env.SKILL_EVAL_WRITABLE_ROOT;
      else process.env.SKILL_EVAL_WRITABLE_ROOT = originalWritableRoot;
      if (originalTools === undefined) delete process.env.SKILL_EVAL_ALLOWED_TOOLS;
      else process.env.SKILL_EVAL_ALLOWED_TOOLS = originalTools;
    }
  });
});

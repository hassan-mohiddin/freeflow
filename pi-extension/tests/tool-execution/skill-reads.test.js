import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import {
  SkillReads,
  instructionPath,
  isFreeflowInstruction,
  skillName,
  skillsRead,
} from "../../dist/tool-execution/skill-reads.js";
import { FileTracking } from "../../dist/tool-execution/file-tracking.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SKILL = join(ROOT, "skills/track-work/SKILL.md");
const REFERENCE = join(ROOT, "skills/track-work/references/working-record-format.md");
const cwd = tmpdir();
const BODY = ["# Track Work", "", "Line three.", "Line four.", ""].join("\n");

let ids = 0;
const read = (input, text, extra = {}) => ({
  toolName: "read",
  toolCallId: `call-${++ids}`,
  input,
  content: [{ type: "text", text }],
  ...extra,
});

test("instruction files are named by their path inside the package, however the path is written", () => {
  assert.equal(instructionPath(SKILL, cwd), "skills/track-work/SKILL.md");
  assert.equal(instructionPath(`@${SKILL}`, cwd), "skills/track-work/SKILL.md");
  assert.equal(instructionPath(relative(ROOT, SKILL), ROOT), "skills/track-work/SKILL.md");
  assert.equal(instructionPath(join(ROOT, "runtime/prompts/core.md"), cwd), "runtime/prompts/core.md");
  assert.equal(instructionPath(join(ROOT, "pi-extension/src/index.ts"), cwd), undefined);
  assert.equal(instructionPath(join(ROOT, "skillsx/a.md"), cwd), undefined);
  assert.equal(isFreeflowInstruction("read", { path: SKILL }, cwd), true);
  assert.equal(isFreeflowInstruction("bash", { path: SKILL }, cwd), false);
  assert.equal(skillName(SKILL, cwd), "track-work");
  assert.equal(skillName(join(ROOT, "capabilities/compaction/SKILL.md"), cwd), "compaction");
  assert.equal(skillName(REFERENCE, cwd), undefined, "a reference is not a skill");
});

test("a repeat read passes through with its full text, and the skill is listed once", () => {
  const reads = new SkillReads();
  reads.observe(read({ path: SKILL }, BODY), cwd);
  reads.observe(read({ path: `@${SKILL}` }, BODY), cwd);
  reads.observe(
    read(
      { path: SKILL, offset: 3, limit: 2 },
      "Line three.\nLine four.\n\n[1 more lines in file. Use offset=5 to continue.]",
    ),
    cwd,
  );
  reads.observe(read({ path: REFERENCE }, "a\nb"), cwd);
  assert.deepEqual(reads.skills(), ["track-work"], "a reference is not a skill");
});

test("truncated, failed, nested, image and non-instruction reads are not listed", () => {
  const reads = new SkillReads();
  reads.observe(
    read({ path: SKILL }, BODY, { details: { truncation: { truncated: true, truncatedBy: "lines" } } }),
    cwd,
  );
  reads.observe(read({ path: SKILL }, BODY, { parentToolCallId: "script" }), cwd);
  reads.observe(read({ path: SKILL }, BODY, { isError: true }), cwd);
  reads.observe({ ...read({ path: SKILL }, BODY), content: [{ type: "image", data: "", mimeType: "image/png" }] }, cwd);
  reads.observe(read({ path: join(ROOT, "package.json") }, "{}"), cwd);
  assert.deepEqual(reads.skills(), []);
});

const call = (id, args) => ({
  type: "message",
  message: { role: "assistant", content: [{ type: "toolCall", id, name: "read", arguments: args }] },
});
const result = (id, text, extra = {}) => ({
  type: "message",
  message: { role: "toolResult", toolCallId: id, toolName: "read", content: [{ type: "text", text }], ...extra },
});

test("rebuilt from the branch: reads since the latest compaction of any kind, not an earlier version's one-line results", () => {
  const reads = new SkillReads();
  const capabilitySkill = join(ROOT, "capabilities/compaction/SKILL.md");
  const writeDocs = join(ROOT, "skills/write-docs/SKILL.md");
  const branch = [
    call("1", { path: capabilitySkill }),
    result("1", "compaction body"),
    { type: "compaction", summary: "Pi's own", firstKeptEntryId: "x" },
    call("2", { path: SKILL }),
    result("2", "one line", { details: { freeflowSkillRead: true } }),
    call("3", { path: writeDocs }),
    result("3", "write-docs body"),
    call("4", { path: SKILL }),
    result("4", "failed", { isError: true }),
  ];
  reads.rebuild(branch, cwd);
  assert.deepEqual(reads.skills(), ["write-docs"], "before compaction, a replacement and a failure are not listed");
  assert.deepEqual(skillsRead(branch, cwd), ["compaction", "track-work", "write-docs"], "successful reads, by skill");
  assert.deepEqual(skillsRead(branch.slice(3), cwd), ["track-work", "write-docs"]);
});

test("file tracking passes every skill read through, and lists the skills read until a compaction", async () => {
  const branch = [call("1", { path: SKILL }), result("1", BODY)];
  const files = new FileTracking();
  const ctx = { cwd, sessionManager: { getBranch: () => branch } };
  assert.equal(await files.toolResult(read({ path: SKILL }, BODY), ctx), undefined, "a repeat read after resume");
  assert.deepEqual(files.loadedSkills(ctx), ["track-work"]);
  assert.equal(await files.toolResult(read({ path: SKILL }, BODY), ctx), undefined, "and again");
  files.piCompacted();
  assert.deepEqual(files.loadedSkills(ctx), []);
});

test("the skills read are listed in one order, whether recorded live or rebuilt after a resume", () => {
  const writeDocs = join(ROOT, "skills/write-docs/SKILL.md");
  // Parallel reads: the results complete in one order live, and the branch keeps them in another.
  const live = new SkillReads();
  live.observe(read({ path: writeDocs }, "write-docs body"), cwd);
  live.observe(read({ path: SKILL }, BODY), cwd);
  const rebuilt = new SkillReads();
  rebuilt.rebuild(
    [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "1", name: "read", arguments: { path: SKILL } },
            { type: "toolCall", id: "2", name: "read", arguments: { path: writeDocs } },
          ],
        },
      },
      result("1", BODY),
      result("2", "write-docs body"),
    ],
    cwd,
  );
  assert.deepEqual(live.skills(), ["track-work", "write-docs"]);
  assert.deepEqual(rebuilt.skills(), live.skills());
});

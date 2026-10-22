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
const replaced = (outcome) => outcome?.content?.[0]?.text;

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

test("a repeat read of the same text returns one line; changed text passes through and is then known", () => {
  const reads = new SkillReads();
  assert.equal(reads.result(read({ path: SKILL }, BODY), cwd), undefined, "a first read passes through");
  const repeat = reads.result(read({ path: `@${SKILL}` }, BODY), cwd);
  assert.equal(
    replaced(repeat),
    `@${SKILL} is unchanged since you read it earlier in this conversation, and that read showed the whole file. Use that copy.`,
  );
  assert.equal(repeat.details.freeflowSkillRead, true);

  const changed = BODY.replace("Line four.", "Line four, changed.");
  assert.equal(reads.result(read({ path: SKILL }, changed), cwd), undefined, "changed text passes through");
  assert.ok(replaced(reads.result(read({ path: SKILL }, changed), cwd)), "the changed text is now known");
  assert.ok(replaced(reads.result(read({ path: SKILL }, BODY), cwd)), "and so is the earlier text");

  assert.equal(reads.skills().join(), "track-work");
});

test("a partial read inside an earlier read is answered with its lines; outside, it passes through", () => {
  const reads = new SkillReads();
  reads.result(read({ path: SKILL }, BODY), cwd);
  assert.equal(
    replaced(
      reads.result(
        read(
          { path: SKILL, offset: 3, limit: 2 },
          "Line three.\nLine four.\n\n[1 more lines in file. Use offset=5 to continue.]",
        ),
        cwd,
      ),
    ),
    `Lines 3-4 of ${SKILL} are unchanged since you read them earlier in this conversation. Use that copy.\n\n[1 more lines in file. Use offset=5 to continue.]`,
    "Pi's note on where to continue is kept",
  );
  assert.ok(replaced(reads.result(read({ path: SKILL, offset: 3 }, "Line three.\nLine four.\n"), cwd)), "to the end");
  assert.equal(
    reads.result(
      read(
        { path: SKILL, offset: 2, limit: 2 },
        "Line three.\nLine four.\n\n[1 more lines in file. Use offset=4 to continue.]",
      ),
      cwd,
    ),
    undefined,
    "the same text at other line numbers passes through",
  );

  // A file that lost its last lines: the earlier copy would show lines that are gone.
  assert.equal(reads.result(read({ path: SKILL }, "# Track Work\n\nLine three."), cwd), undefined);

  // An earlier partial read covers only its own lines, and never the end of a file it did not reach.
  const partial = new SkillReads();
  partial.result(read({ path: REFERENCE, limit: 2 }, "a\nb\n\n[3 more lines in file. Use offset=3 to continue.]"), cwd);
  assert.ok(
    replaced(
      partial.result(
        read({ path: REFERENCE, limit: 1 }, "a\n\n[4 more lines in file. Use offset=2 to continue.]"),
        cwd,
      ),
    ),
  );
  assert.equal(partial.result(read({ path: REFERENCE }, "a\nb\nc"), cwd), undefined, "past the earlier read");
  assert.equal(partial.result(read({ path: REFERENCE }, "a\nb"), cwd), undefined, "the earlier read did not end there");
  assert.deepEqual(partial.skills(), [], "a reference is not a skill");
});

test("truncated, failed, nested, image and non-instruction reads neither count nor get answered", () => {
  const reads = new SkillReads();
  const truncated = { truncation: { truncated: true, truncatedBy: "lines" } };
  reads.result(read({ path: SKILL }, BODY, { details: truncated }), cwd);
  assert.equal(reads.result(read({ path: SKILL }, BODY), cwd), undefined, "a truncated earlier read does not count");
  assert.equal(reads.result(read({ path: SKILL }, BODY, { details: truncated }), cwd), undefined);

  const known = new SkillReads();
  known.result(read({ path: SKILL }, BODY), cwd);
  assert.equal(known.result(read({ path: SKILL }, BODY, { parentToolCallId: "script" }), cwd), undefined, "nested");
  assert.equal(known.result(read({ path: SKILL }, BODY, { isError: true }), cwd), undefined, "failed");
  assert.equal(known.result(read({ path: SKILL }, BODY), cwd, false), undefined, "the view may lack earlier reads");
  assert.equal(
    known.result(
      { ...read({ path: SKILL }, BODY), content: [{ type: "image", data: "", mimeType: "image/png" }] },
      cwd,
    ),
    undefined,
  );
  const other = join(ROOT, "package.json");
  known.result(read({ path: other }, "{}"), cwd);
  assert.equal(known.result(read({ path: other }, "{}"), cwd), undefined, "only Freeflow's instruction files");
});

const call = (id, args) => ({
  type: "message",
  message: { role: "assistant", content: [{ type: "toolCall", id, name: "read", arguments: args }] },
});
const result = (id, text, extra = {}) => ({
  type: "message",
  message: { role: "toolResult", toolCallId: id, toolName: "read", content: [{ type: "text", text }], ...extra },
});

test("rebuilt from the branch: reads since the latest compaction of any kind, not Freeflow's replacements", () => {
  const reads = new SkillReads();
  const capabilitySkill = join(ROOT, "capabilities/compaction/SKILL.md");
  const branch = [
    call("1", { path: capabilitySkill }),
    result("1", "compaction body"),
    { type: "compaction", summary: "Pi's own", firstKeptEntryId: "x" },
    call("2", { path: SKILL }),
    result("2", "one line", { details: { freeflowSkillRead: true } }),
    call("3", { path: REFERENCE }),
    result("3", "a\nb"),
    call("4", { path: SKILL }),
    result("4", "failed", { isError: true }),
  ];
  reads.rebuild(branch, cwd);
  assert.equal(reads.result(read({ path: capabilitySkill }, "compaction body"), cwd), undefined, "before compaction");
  assert.equal(reads.result(read({ path: SKILL }, "one line"), cwd), undefined, "a replacement is not the file");
  assert.ok(replaced(reads.result(read({ path: REFERENCE }, "a\nb"), cwd)));
  assert.deepEqual(skillsRead(branch, cwd), ["compaction", "track-work"], "successful reads, by skill");
  assert.deepEqual(skillsRead(branch.slice(3), cwd), ["track-work"]);
});

function tracking(branch, options) {
  const files = new FileTracking(options);
  const ctx = { cwd, sessionManager: { getBranch: () => branch } };
  return { files, ctx, read: (text, extra) => files.toolResult(read({ path: SKILL }, text, extra), ctx) };
}

test("file tracking answers a repeat read, rebuilt after resume, until a compaction or a selective view", async () => {
  // Resume: the earlier read is on the branch.
  const resumed = tracking([call("1", { path: SKILL }), result("1", BODY)]);
  assert.ok(replaced(await resumed.read(BODY)));
  assert.deepEqual(resumed.files.loadedSkills(resumed.ctx), ["track-work"]);

  const live = tracking([]);
  assert.equal(await live.read(BODY), undefined);
  assert.ok(replaced(await live.read(BODY)));
  await live.files.compacted([], live.ctx);
  assert.equal(await live.read(BODY), undefined, "after a Freeflow compaction");
  assert.ok(replaced(await live.read(BODY)));
  live.files.piCompacted();
  assert.deepEqual(live.files.loadedSkills(live.ctx), []);
  assert.equal(await live.read(BODY), undefined, "after Pi's own compaction");

  let selective = true;
  const coordinator = tracking([], { selectiveView: () => selective });
  assert.equal(await coordinator.read(BODY), undefined);
  assert.equal(await coordinator.read(BODY), undefined, "a Coordinator under projection reads again");
  selective = false;
  assert.ok(replaced(await coordinator.read(BODY)), "its reads still count for the full history");
});

test("the skills read are listed in one order, whether recorded live or rebuilt after a resume", () => {
  const writeDocs = join(ROOT, "skills/write-docs/SKILL.md");
  // Parallel reads: the results complete in one order live, and the branch keeps them in another.
  const live = new SkillReads();
  live.result(read({ path: writeDocs }, "write-docs body"), cwd);
  live.result(read({ path: SKILL }, BODY), cwd);
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

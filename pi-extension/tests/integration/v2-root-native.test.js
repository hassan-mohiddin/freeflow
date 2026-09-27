import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { fixture as nativeFixture } from "../fixtures/routing-native.js";
import { readManifest } from "../../dist/session-store/manifest.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";
import { piAncestrySnapshot } from "../../dist/session-store/pi-ancestry.js";
import { v2StoreLimits } from "../../dist/session-store/native.js";
import { freeflowCapabilitySkillPath } from "../../dist/runtime/runtime-context.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
async function fixture(script, projection, after, withUI, options) {
  return nativeFixture(
    script,
    projection,
    async (context) => {
      try {
        await after?.(context);
      } finally {
        await context.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      }
    },
    withUI,
    options,
  );
}
const result = (manager, name) =>
  manager.getBranch().findLast((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    ?.message;

test("normal root activates direct v2 read and versioned result descriptions on one native store", async () => {
  const observed = await fixture(
    (request, wire, manager) => {
      const direct = ["freeflow_read", "freeflow_search", "freeflow_patch"];
      assert.ok(direct.every((name) => wire.tools.some((tool) => tool.name === name)));
      if (request === 1)
        return [
          {
            name: "freeflow_read",
            args: { files: [{ path: "evidence.txt", ranges: [{ startLine: 1, endLine: 1 }] }] },
          },
        ];
      if (request === 2) {
        const read = result(manager, "freeflow_read");
        assert.equal(read?.details?.outcome?.status, "succeeded");
        assert.equal(read?.details?.freeflowV2?.persistence?.state, "sidecar-acknowledged");
        assert.match(read.content[0].text, /EXACT_EVIDENCE_BODY_81/);
        return [
          {
            name: "freeflow_tools",
            args: {
              operation: "describe",
              operations: [
                { id: "result.read", revision: "1" },
                { id: "result.read", revision: "2" },
              ],
            },
          },
        ];
      }
      if (request === 3) {
        const described = JSON.parse(result(manager, "freeflow_tools").content[0].text);
        assert.deepEqual(
          described.operations.map((operation) => [operation.key.revision, operation.available]),
          [
            ["1", true],
            ["2", true],
          ],
        );
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ manager, session }) => {
      const sessionId = manager.getSessionId();
      const root = join(dirname(manager.getSessionFile()), "freeflow-session-store", "v2", hash(sessionId));
      const manifest = await readManifest(root);
      assert.equal(manifest.originSessionId, sessionId);
      const store = new SessionStoreRuntime(root, manifest, v2StoreLimits(268_435_456));
      await store.openReadOnly();
      const branch = manager.getBranch();
      const events = await store.replay("execution", piAncestrySnapshot(sessionId, manager.getLeafId(), branch));
      const read = events.find(
        (entry) => entry.kind === "operation-outcome" && entry.operationId === "project.readRanges",
      );
      assert.ok(read);
      const callerIndex = branch.findIndex(
        (entry) =>
          entry.message?.role === "assistant" &&
          entry.message.content?.some((block) => block.type === "toolCall" && block.id === read.payload.parentCallId),
      );
      assert.ok(callerIndex >= 0);
      const beforeResult = branch.slice(0, callerIndex + 1);
      assert.equal(
        (await store.replay("execution", piAncestrySnapshot(sessionId, beforeResult.at(-1).id, beforeResult))).some(
          (entry) => entry.id === read.id,
        ),
        false,
        "retaining a caller without its native result cannot expose the sidecar outcome",
      );
      assert.ok(
        branch.some((entry) => entry.id === read.branchAnchor),
        "the write fence is on native ancestry",
      );
      const before = JSON.parse(await readFile(join(root, ".writer-lease"), "utf8"));
      await session.reload();
      const after = JSON.parse(await readFile(join(root, ".writer-lease"), "utf8"));
      assert.notEqual(after.leaseId, before.leaseId, "reload releases and reacquires exactly one writer");
      assert.equal((await readManifest(root)).storeId, manifest.storeId);
    },
    false,
    {
      cognitiveRouting: { enabled: false },
      toolExecution: { enabled: true },
      freeflowConfig: {
        toolExecution: { enabled: true, workspace: { enabled: true }, discovery: { enabled: true } },
      },
      maxRequests: 3,
    },
  );
  assert.equal(observed.requests.length, 3);
});

test("normal root program invokes the registered v2 range operation and emits only selected canonical data", async () => {
  await fixture(
    (request, wire, manager) => {
      if (request === 1)
        return [
          {
            name: "freeflow_run",
            args: {
              description: "Select one known range",
              code: `const value = await tools.invoke("project.readRanges", { files: [{ path: "evidence.txt", ranges: [{ startLine: 1, endLine: 1 }] }] }); emit({ text: value.files[0].served[0].text, coverage: value.coverage });`,
              operations: [{ id: "project.readRanges", revision: "1" }],
              captures: [],
              input: null,
            },
          },
        ];
      if (request === 2) {
        const run = result(manager, "freeflow_run");
        assert.equal(run.details.freeflowRun.programStatus, "completed");
        assert.deepEqual(run.details.freeflowRun.emitted, [
          { text: "EXACT_EVIDENCE_BODY_81", coverage: "complete-at-boundary" },
        ]);
        assert.equal(run.details.freeflowRun.calls.succeeded, 1);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ manager }) => {
      const sessionId = manager.getSessionId();
      const root = join(dirname(manager.getSessionFile()), "freeflow-session-store", "v2", hash(sessionId));
      const manifest = await readManifest(root);
      const store = new SessionStoreRuntime(root, manifest, v2StoreLimits(268_435_456));
      await store.openReadOnly();
      const branch = manager.getBranch();
      const manifestIndex = branch.findIndex(
        (entry) =>
          entry.type === "custom" &&
          entry.customType === "freeflow-tool-run-v1" &&
          entry.data?.outcomes?.some((outcome) => outcome.operation?.id === "project.readRanges"),
      );
      assert.ok(manifestIndex >= 0);
      const child = branch[manifestIndex].data.outcomes.find(
        (outcome) => outcome.operation.id === "project.readRanges",
      );
      assert.match(child.occurrenceId, /^occurrence:/);
      const earlier = branch.slice(0, manifestIndex);
      const pending = await store.replay("execution", piAncestrySnapshot(sessionId, earlier.at(-1).id, earlier));
      assert.equal(
        pending.some((event) => event.payload?.occurrenceId === child.occurrenceId),
        false,
      );
      const accepted = await store.replay("execution", piAncestrySnapshot(sessionId, manager.getLeafId(), branch));
      assert.equal(
        accepted.filter(
          (event) => event.payload?.occurrenceId === child.occurrenceId && event.kind === "operation-outcome",
        ).length,
        1,
      );
    },
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: {
        toolExecution: {
          enabled: true,
          programs: { mode: "adapters" },
          workspace: { enabled: true },
        },
      },
      maxRequests: 2,
    },
  );
});

test("normal root publishes qualified Bash bytes through v2 and recovers one exact range", async () => {
  const observed = await fixture(
    (request, wire, manager) => {
      if (request === 1) {
        return [
          {
            name: "bash",
            args: { command: 'node -e \'process.stdout.write("A".repeat(12000)+"ROOT_CAPTURE_SENTINEL")\'' },
          },
        ];
      }
      if (request === 2) {
        const bash = result(manager, "bash");
        const id = bash.content[0].text.match(/artifact:[0-9a-f-]{36}/)?.[0];
        assert.ok(id);
        assert.ok(Buffer.byteLength(bash.content[0].text, "utf8") <= 1024);
        return [{ name: "freeflow_result", args: { id, offsetBytes: 12000, maxBytes: 1024 } }];
      }
      if (request === 3) {
        const recovered = result(manager, "freeflow_result");
        assert.match(recovered.content[0].text, /ROOT_CAPTURE_SENTINEL/);
        assert.equal(recovered.details.capturedArtifact.range.startBytes, 12000);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ manager }) => {
      const toolFacts = manager
        .getBranch()
        .filter(
          (entry) => entry.customType === "freeflow-efficiency-observation-v1" && entry.data?.kind === "tool-complete",
        )
        .map((entry) => entry.data);
      const bash = toolFacts.find((entry) => entry.toolName === "bash");
      const reader = toolFacts.find((entry) => entry.toolName === "freeflow_result");
      assert.equal(bash.capturedBytes, 12021);
      assert.equal(bash.artifactBytes, 12021);
      assert.ok(bash.modelViewBytes > 0 && bash.resultBytes > bash.modelViewBytes);
      assert.equal(reader.recoveredBytes, 21);
      assert.equal(reader.artifactBytes, undefined, "reading does not publish the artifact a second time");
      assert.equal(reader.coverageBoundary, "tool-result-hook");
    },
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: {
        toolExecution: {
          enabled: true,
          capture: { enabled: true, maxInlineBytes: 1024 },
          accounting: { enabled: true },
        },
      },
      maxRequests: 3,
    },
  );
  assert.equal(observed.requests.length, 3);
});

test("normal root records an exact skill read but does not claim unobserved downstream delivery after compaction", async () => {
  const skillPath = freeflowCapabilitySkillPath("tool-execution");
  await fixture(
    (request, wire, manager) => {
      if (request === 1) return [{ name: "read", args: { path: skillPath } }];
      if (request === 2) {
        const read = result(manager, "read");
        assert.match(read.content[0].text, /# Tool Execution/);
        assert.match(JSON.stringify(wire.input), /guidance introduced/);
        return [];
      }
      if (request === 3) {
        assert.ok(wire.tools.some((tool) => tool.name === "freeflow_read"));
        assert.doesNotMatch(JSON.stringify(wire.input), /guidance delivered/);
        assert.doesNotMatch(JSON.stringify(wire.input), /guidance introduced/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ session, manager }) => {
      const root = join(
        dirname(manager.getSessionFile()),
        "freeflow-session-store",
        "v2",
        hash(manager.getSessionId()),
      );
      const manifest = await readManifest(root);
      const store = new SessionStoreRuntime(root, manifest, v2StoreLimits(268_435_456));
      await store.openReadOnly();
      const before = await store.replay("guidance", {
        sessionId: manager.getSessionId(),
        branchAnchor: manager.getLeafId(),
        nativeEntryIds: manager.getBranch().map((entry) => entry.id),
      });
      assert.deepEqual(
        before.map((event) => event.kind),
        ["skill-introduced"],
      );
      await session.compact();
      await session.prompt("Continue after compaction without assuming the skill survived.");
      await session.waitForIdle();
    },
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: { toolExecution: { enabled: true } },
      maxRequests: 3,
    },
  );
});

test("routed v2 direct read retains executor attribution with projection on", async () => {
  await fixture(
    (request, wire, manager) => {
      if (request === 1)
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read one bounded project range and return the result." },
          },
        ];
      if (request === 2)
        return [
          {
            name: "freeflow_read",
            args: { files: [{ path: "evidence.txt", ranges: [{ startLine: 1, endLine: 1 }] }] },
          },
        ];
      if (request === 3) {
        assert.equal(result(manager, "freeflow_read")?.details?.outcome?.status, "succeeded");
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", outcome: "completed", report: "The bounded read succeeded." },
          },
        ];
      }
      if (request === 4) return [];
      assert.fail(`unexpected request ${request}`);
    },
    true,
    async ({ manager }) => {
      const observations = manager
        .getBranch()
        .filter(
          (entry) => entry.customType === "freeflow-efficiency-observation-v1" && entry.data?.kind === "tool-complete",
        )
        .map((entry) => entry.data);
      const read = observations.find((entry) => entry.toolName === "freeflow_read");
      assert.equal(read?.responsibility?.profile, "executor");
      assert.equal(read?.operation, "project.readRanges@1");
      assert.equal(read?.artifactBytes, 0);
      assert.ok(read?.modelViewBytes > 0);
      const stored = manager.getBranch().findLast((entry) => entry.message?.toolName === "freeflow_read")?.message;
      assert.equal("value" in stored.details.outcome, false);
    },
    false,
    {
      freeflowConfig: { toolExecution: { enabled: true, workspace: { enabled: true }, accounting: { enabled: true } } },
      maxRequests: 4,
    },
  );
});

test("tree navigation refreshes the same store fence and excludes sibling execution events", async () => {
  await fixture(
    (request, wire, manager) => {
      if (request === 1 || request === 3)
        return [
          {
            name: "freeflow_read",
            args: { files: [{ path: "evidence.txt", ranges: [{ startLine: 1, endLine: 1 }] }] },
          },
        ];
      if (request === 2 || request === 4) {
        assert.equal(result(manager, "freeflow_read")?.details?.outcome?.status, "succeeded");
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ session, manager }) => {
      const firstUser = manager.getBranch().find((entry) => entry.message?.role === "user");
      assert.ok(firstUser?.id);
      const navigated = await session.navigateTree(firstUser.id, { summarize: false });
      assert.equal(navigated.cancelled, false);
      await session.prompt("Read the project again on this sibling branch.");
      await session.waitForIdle();
      const root = join(
        dirname(manager.getSessionFile()),
        "freeflow-session-store",
        "v2",
        hash(manager.getSessionId()),
      );
      const manifest = await readManifest(root);
      const store = new SessionStoreRuntime(root, manifest, v2StoreLimits(268_435_456));
      await store.openReadOnly();
      const branch = manager.getBranch();
      const events = await store.replay(
        "execution",
        piAncestrySnapshot(manager.getSessionId(), manager.getLeafId(), branch),
      );
      const reads = events.filter((event) => event.operationId === "project.readRanges");
      assert.equal(reads.length, 1);
      assert.equal(reads[0].payload.occurrenceId, result(manager, "freeflow_read")?.details?.freeflowV2?.occurrenceId);
    },
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: { toolExecution: { enabled: true, workspace: { enabled: true } } },
      maxRequests: 4,
    },
  );
});

test("normal root patch retains settled file and sidecar receipts across effect-journal entries", async () => {
  const before = "HEAD\nold\nTAIL\n";
  const patch = "*** Begin Patch\n*** Update File: target.txt\n@@\n HEAD\n-old\n+new\n TAIL\n*** End Patch\n";
  const input = { patch, expectedRevisions: [{ path: "target.txt", sha256: hash(before) }] };
  let cwd;
  await fixture(
    (request, wire, manager) => {
      if (request === 1) return [{ name: "freeflow_patch", args: { ...input, dryRun: true } }];
      if (request === 2) {
        assert.equal(result(manager, "freeflow_patch")?.details?.outcome?.effectState, "completed");
        return [{ name: "freeflow_patch", args: input }];
      }
      if (request === 3) {
        const applied = result(manager, "freeflow_patch");
        assert.equal(applied?.details?.outcome?.status, "succeeded");
        assert.equal(applied?.details?.outcome?.effectState, "completed");
        assert.equal(applied?.details?.freeflowV2?.persistence?.state, "sidecar-acknowledged");
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async () => assert.equal(await readFile(join(cwd, "target.txt"), "utf8"), "HEAD\nnew\nTAIL\n"),
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: {
        toolExecution: {
          enabled: true,
          workspace: { enabled: true, write: true },
        },
      },
      beforePrompt: async ({ cwd: root }) => {
        cwd = root;
        await writeFile(join(root, "target.txt"), before);
      },
      maxRequests: 3,
    },
  );
});

test("failed pre-effect store binding hides v2 tools and preserves native Bash output", async () => {
  const staleNamespace = (pi) =>
    pi.on("session_start", async (_event, ctx) => {
      const manager = ctx.sessionManager;
      const root = join(
        dirname(manager.getSessionFile()),
        "freeflow-session-store",
        "v2",
        hash(manager.getSessionId()),
      );
      // An existing namespace without a committed head cannot be adopted as a new store.
      await mkdir(root, { recursive: true });
    });
  await fixture(
    (request, wire, manager) => {
      assert.ok(!wire.tools.some((tool) => ["freeflow_read", "freeflow_search", "freeflow_patch"].includes(tool.name)));
      if (request === 1) {
        return [
          {
            name: "bash",
            args: { command: 'node -e \'process.stdout.write("B".repeat(12000)+"NATIVE_FALLBACK_SENTINEL")\'' },
          },
        ];
      }
      if (request === 2) {
        const bash = result(manager, "bash");
        assert.match(bash.content[0].text, /NATIVE_FALLBACK_SENTINEL/);
        assert.doesNotMatch(bash.content[0].text, /artifact:/);
        return [
          {
            name: "freeflow_tools",
            args: {
              operation: "describe",
              operations: [
                { id: "result.read", revision: "1" },
                { id: "result.read", revision: "2" },
              ],
            },
          },
        ];
      }
      if (request === 3) {
        const described = JSON.parse(result(manager, "freeflow_tools").content[0].text);
        assert.deepEqual(
          described.operations.map((operation) => [operation.key.revision, operation.available]),
          [
            ["1", true],
            ["2", false],
          ],
        );
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      beforeExtensions: [staleNamespace],
      cognitiveRouting: { enabled: false },
      freeflowConfig: {
        toolExecution: {
          enabled: true,
          capture: { enabled: true, maxInlineBytes: 1024 },
          discovery: { enabled: true },
        },
      },
      maxRequests: 3,
    },
  );
});

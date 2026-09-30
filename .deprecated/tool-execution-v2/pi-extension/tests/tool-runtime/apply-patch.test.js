import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { AdmissionController } from "../../dist/tool-runtime/admission.js";
import { createApplyPatchOperation } from "../../dist/tool-runtime/adapters/apply-patch.js";
import { WorkspaceCoordinator } from "../../dist/tool-runtime/adapters/workspace.js";
import { EffectRuntime } from "../../dist/tool-runtime/effects.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { OperationKernel } from "../../dist/tool-runtime/kernel.js";
import { OperationRegistry } from "../../dist/tool-runtime/registry.js";
import { presentV2 } from "../../dist/tool-runtime/presentation/v2.js";
import { SessionStoreRuntime } from "../../dist/tool-runtime/session-store/store.js";
import { syntheticNativeAncestry } from "../fixtures/v2-sidecar.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const key = { id: "project.applyPatch", revision: "1" };
const limits = {
  perArtifactBytes: 65536,
  perRunBytes: 256000,
  perSessionBytes: 512000,
  totalBytes: 1048576,
  maxReadBytes: 65536,
};
const patch = (...files) =>
  `*** Begin Patch\n${files
    .map(([path, ...hunks]) => `*** Update File: ${path}\n${hunks.map((hunk) => `@@\n${hunk.join("\n")}\n`).join("")}`)
    .join("")}*** End Patch\n`;

async function fixture(run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-apply-patch-"));
  const manager = SessionManager.create(root, join(root, "sessions"));
  manager.appendMessage({ role: "user", content: "patch fixture", timestamp: 1 });
  let current = resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        discovery: { enabled: true },
        workspace: { enabled: true, write: true, root, denyPaths: ["private"] },
      },
    },
    {},
    true,
  );
  const manifest = {
    schemaVersion: 2,
    storeId: "store:patch",
    originSessionId: manager.getSessionId(),
    host: { id: "pi", contract: "0.87.x" },
    createdBy: { package: "fixture", version: "1" },
    domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
  };
  const store = new SessionStoreRuntime(join(root, "store"), manifest, options.limits ?? limits);
  const fence = await store.open();
  let sequence = 0;
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:patch-${++sequence}` }),
    options.inlineBytes ?? 512,
  );
  const pi = {
    appendEntry: (type, value) => {
      options.onEntry?.(type, value, root);
      manager.appendCustomEntry(type, value);
    },
  };
  const effects = new EffectRuntime(pi);
  await effects.recover({ sessionManager: manager });
  // No leaf observer in the mutation host: the isolated store is not yet bound to the native Pi lifecycle (P5).
  const host = { sessionManager: { getSessionId: () => manager.getSessionId(), getBranch: () => manager.getBranch() } };
  const tools = new ToolRuntime(
    () => current,
    {
      scope: () => ({}),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
    },
    {
      read: async () => {
        throw new Error("legacy read unused");
      },
    },
    effects,
    undefined,
    recorder,
    { maxBytes: 2048 },
  );
  const scope = () => ({
    sessionId: manager.getSessionId(),
    cwd: root,
    parentCallId: "call:patch",
    catalogGeneration: tools.registry.snapshot().generation,
    responsibility: { profile: "solo", control: "inactive" },
    routing: {},
  });
  const call = (input, signal) => tools.kernel.execute(key, input, scope(), "programmatic", signal, host);
  const replay = () => store.replay("execution", syntheticNativeAncestry(store, manager.getSessionId()));
  const injected = (io) => {
    const registry = new OperationRegistry();
    registry.register(createApplyPatchOperation(() => current, new WorkspaceCoordinator(), io));
    const kernel = new OperationKernel(
      registry,
      new AdmissionController(() => current, { admit: () => ({ kind: "allowed" }) }),
      effects,
      recorder,
    );
    return (request, signal) =>
      kernel.execute(
        key,
        request,
        { ...scope(), catalogGeneration: registry.snapshot().generation },
        "programmatic",
        signal,
        host,
      );
  };
  try {
    await run({
      root,
      tools,
      call,
      injected,
      effects,
      manager,
      replay,
      store,
      host,
      setConfig: (value) => {
        current = value;
      },
    });
  } finally {
    await store.close(fence).catch(() => store.abandon());
    await rm(root, { recursive: true, force: true });
  }
}

const input = (document, entries, dryRun = false) => ({
  patch: document,
  expectedRevisions: entries.map(([path, body]) => ({ path, sha256: sha(Buffer.from(body)) })),
  dryRun,
});

async function persistedReceipt({ replay, store, manager }, outcome) {
  const events = await replay();
  const record = events.find(
    (event) => event.kind === "operation-outcome" && event.payload.occurrenceId === outcome.occurrenceId,
  );
  assert.ok(record);
  if (record.payload.value) return record.payload.value;
  const artifactId = record.payload.valueArtifactId;
  assert.ok(artifactId);
  const descriptor = events.find(
    (event) => event.kind === "artifact-published" && event.payload.id === artifactId,
  )?.payload;
  assert.ok(descriptor);
  const verified = await store.readArtifact(
    artifactId,
    { startBytes: 0, endBytes: descriptor.bytes },
    {
      originSessionId: manager.getSessionId(),
      ancestry: syntheticNativeAncestry(store, manager.getSessionId()),
      grantedArtifactIds: [artifactId],
    },
  );
  return JSON.parse(Buffer.from(verified.bytes).toString("utf8"));
}

test("all-file dry-run precedes one started mutation; CRLF/BOM and multiple hunks retain exact hashes", async () => {
  const before = "\uFEFFone VALUE\r\ntwo VALUE\r\nthree\r\nfour VALUE\r\nfive\r\n";
  const second = "head\ntail\n";
  const doc = patch(
    ["a.txt", [" \uFEFFone VALUE", "-two VALUE", "+two CHANGED"], [" three", "-four VALUE", "+four CHANGED", " five"]],
    ["b.txt", [" head", "-tail", "+end"]],
  );
  let first;
  await fixture(async ({ root, call, manager }) => {
    await writeFile(join(root, "a.txt"), before);
    await chmod(join(root, "a.txt"), 0o640);
    await writeFile(join(root, "b.txt"), second);
    const request = input(doc, [
      ["a.txt", before],
      ["b.txt", second],
    ]);
    const planned = await call({ ...request, dryRun: true });
    assert.equal(planned.status, "succeeded");
    assert.equal(planned.effect, "live-read");
    assert.equal(planned.value.committedPrefix, 0);
    assert.deepEqual(
      planned.value.files.map((file) => file.status),
      ["not-applied", "not-applied"],
    );
    assert.equal((await readFile(join(root, "a.txt"))).toString(), before);
    const priorEvents = manager.getEntries().filter((entry) => entry.customType === "freeflow-tool-effect-v1").length;
    assert.equal(priorEvents, 0);
    const applied = await call(request);
    assert.equal(applied.status, "succeeded");
    assert.equal(applied.effectState, "completed");
    assert.equal(applied.value.committedPrefix, 2);
    assert.deepEqual(
      applied.value.files.map((file) => file.status),
      ["applied", "applied"],
    );
    assert.equal(
      (await readFile(join(root, "a.txt"))).toString(),
      "\uFEFFone VALUE\r\ntwo CHANGED\r\nthree\r\nfour CHANGED\r\nfive\r\n",
    );
    assert.equal((await readFile(join(root, "b.txt"))).toString(), "head\nend\n");
    assert.equal((await stat(join(root, "a.txt"))).mode & 0o777, 0o640);
    for (const file of applied.value.files) {
      assert.equal(file.afterSha256, sha(await readFile(join(root, file.path))));
      assert.equal(file.afterSha256, planned.value.files.find((part) => part.path === file.path).afterSha256);
    }
    first = manager
      .getEntries()
      .filter((entry) => entry.customType === "freeflow-tool-effect-v1")
      .map((entry) => entry.data.event);
  });
  assert.deepEqual(first, ["started", "settled"]);
});

test("deleting an unterminated final line retains the preceding context terminator", async () => {
  await fixture(async ({ root, call }) => {
    const plain = "a\nb",
      crlf = "a\r\nb";
    await writeFile(join(root, "plain.txt"), plain);
    await writeFile(join(root, "crlf.txt"), crlf);
    const document = patch(["plain.txt", [" a", "-b"]], ["crlf.txt", [" a", "-b"]]);
    const request = input(document, [
      ["plain.txt", plain],
      ["crlf.txt", crlf],
    ]);
    const planned = await call({ ...request, dryRun: true });
    assert.equal(planned.status, "succeeded");
    assert.deepEqual(
      planned.value.files.map((file) => file.afterSha256),
      [sha(Buffer.from("a\n")), sha(Buffer.from("a\r\n"))],
    );
    const applied = await call(request);
    assert.equal(applied.status, "succeeded");
    assert.equal((await readFile(join(root, "plain.txt"))).toString(), "a\n");
    assert.equal((await readFile(join(root, "crlf.txt"))).toString(), "a\r\n");
    assert.deepEqual(
      applied.value.files.map((file) => file.afterSha256),
      planned.value.files.map((file) => file.afterSha256),
    );
  });
});

test("invalid whole-document, revision set, ambiguous context, and unsafe paths never start or write", async () => {
  await fixture(async ({ root, call, manager }) => {
    const body = "head\nneedle\ntail\nhead\nneedle\ntail\n";
    await writeFile(join(root, "a.txt"), body);
    await mkdir(join(root, "private"));
    await writeFile(join(root, "private", "secret.txt"), body);
    await symlink(join(root, "a.txt"), join(root, "alias.txt"));
    const cases = [
      [patch(["a.txt", [" head", "-needle", "+changed", " tail"]]), [["a.txt", body]], "match_ambiguous"],
      [
        patch(
          ["a.txt", [" head", "-needle", "+changed", " tail"]],
          ["missing.txt", [" head", "-needle", "+x", " tail"]],
        ),
        [
          ["a.txt", body],
          ["missing.txt", body],
        ],
        "path_unavailable",
      ],
      [
        patch(["a.txt", [" head", "-needle", "+changed", " tail"]]),
        [
          ["a.txt", body],
          ["extra.txt", body],
        ],
        "revision_invalid",
      ],
      [patch(["a.txt", [" head", "-needle", "+changed", " tail"]]), [], "invalid_input"],
      [
        patch(["../other.txt", [" head", "-needle", "+changed", " tail"]]),
        [["../other.txt", body]],
        "path_outside_root",
      ],
      [patch(["alias.txt", [" head", "-needle", "+changed", " tail"]]), [["alias.txt", body]], "path_unsupported"],
      [
        patch(["private/secret.txt", [" head", "-needle", "+changed", " tail"]]),
        [["private/secret.txt", body]],
        "path_denied",
      ],
      ["*** Begin Patch\n*** Delete File: a.txt\n*** End Patch\n", [["a.txt", body]], "patch_invalid"],
    ];
    for (const [doc, revisions, code] of cases) {
      const outcome = await call(input(doc, revisions));
      assert.equal(outcome.status, code === "invalid_input" ? "denied" : "failed");
      assert.equal(outcome.effectState, "none");
      assert.equal(outcome.bodyStarted, false);
      assert.equal(outcome.error.code, code);
      assert.equal((await readFile(join(root, "a.txt"))).toString(), body);
    }
    assert.equal(manager.getEntries().filter((entry) => entry.customType === "freeflow-tool-effect-v1").length, 0);
  });
});

test("overlapping hunks, binary targets, and oversized resulting files fail complete preflight", async () => {
  await fixture(async ({ root, call, manager }) => {
    const body = "header\nold\nbetween\nfooter\n";
    await writeFile(join(root, "a.txt"), body);
    const overlap = patch(["a.txt", [" header", "-old", "+new", " between"], [" between", "-footer", "+last"]]);
    const conflicted = await call(input(overlap, [["a.txt", body]]));
    assert.equal(conflicted.error.code, "hunk_conflict");
    assert.equal(conflicted.effectState, "none");
    assert.equal((await readFile(join(root, "a.txt"))).toString(), body);
    const binary = Buffer.from("before\0data\nafter\n");
    await writeFile(join(root, "binary.txt"), binary);
    const unsupported = await call(
      input(patch(["binary.txt", [" before", "-data", "+other", " after"]]), [["binary.txt", binary]]),
    );
    assert.equal(unsupported.error.code, "binary_unsupported");
    assert.deepEqual(await readFile(join(root, "binary.txt")), binary);
    const large = "x".repeat(4 * 1024 * 1024 - 96) + "\nhead\ntail\n";
    await writeFile(join(root, "large.txt"), large);
    const addition = "y".repeat(200);
    const oversized = await call(
      input(patch(["large.txt", [" head", "-tail", `+${addition}`]]), [["large.txt", large]]),
    );
    assert.equal(oversized.error.code, "file_too_large");
    assert.equal(sha(await readFile(join(root, "large.txt"))), sha(Buffer.from(large)));
    assert.equal(manager.getEntries().filter((entry) => entry.customType === "freeflow-tool-effect-v1").length, 0);
  });
});

test("a source changed during effect-start acknowledgment rejects all files without a write", async () => {
  let change;
  await fixture(
    async ({ root, call, effects }) => {
      await writeFile(join(root, "a.txt"), "A\nold\nZ\n");
      await writeFile(join(root, "b.txt"), "B\nold\nZ\n");
      change = () => writeFileSync(join(root, "b.txt"), "B\nchanged\nZ\n");
      const doc = patch(["a.txt", [" A", "-old", "+new", " Z"]], ["b.txt", [" B", "-old", "+new", " Z"]]);
      const outcome = await call(
        input(doc, [
          ["a.txt", "A\nold\nZ\n"],
          ["b.txt", "B\nold\nZ\n"],
        ]),
      );
      assert.equal(outcome.status, "failed");
      assert.equal(outcome.error.code, "source_changed");
      assert.equal(outcome.effectState, "none");
      assert.deepEqual(
        outcome.value.files.map((file) => file.status),
        ["not-applied", "not-applied"],
      );
      assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nold\nZ\n");
      assert.equal(effects.status().unresolvedEffects, 0);
    },
    {
      onEntry(type, value) {
        if (type === "freeflow-tool-effect-v1" && value.event === "started") change();
      },
    },
  );
});

test("cancellation after a start but before any write settles none with a complete not-applied receipt", async () => {
  const controller = new AbortController();
  await fixture(
    async ({ root, call, effects }) => {
      await writeFile(join(root, "a.txt"), "A\nold\nZ\n");
      const doc = patch(["a.txt", [" A", "-old", "+new", " Z"]]);
      const outcome = await call(input(doc, [["a.txt", "A\nold\nZ\n"]]), controller.signal);
      assert.equal(outcome.status, "cancelled");
      assert.equal(outcome.effectState, "none");
      assert.equal(outcome.value.files[0].status, "not-applied");
      assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nold\nZ\n");
      assert.equal(effects.status().unresolvedEffects, 0);
    },
    {
      onEntry(type, value) {
        if (type === "freeflow-tool-effect-v1" && value.event === "started") controller.abort();
      },
    },
  );
});

test("a later-file write failure retains a verified prefix, a sidecar receipt and an unresolved live-effect fence", async () => {
  await fixture(async ({ root, call, replay, effects, manager, store }) => {
    const original = "B\nold\nZ\n";
    await writeFile(join(root, "a.txt"), "A\nold\nZ\n");
    await mkdir(join(root, "readonly"));
    await writeFile(join(root, "readonly", "b.txt"), original);
    const document = patch(["a.txt", [" A", "-old", "+new", " Z"]], ["readonly/b.txt", [" B", "-old", "+new", " Z"]]);
    await chmod(join(root, "readonly"), 0o500);
    let outcome;
    try {
      outcome = await call(
        input(document, [
          ["a.txt", "A\nold\nZ\n"],
          ["readonly/b.txt", original],
        ]),
      );
    } finally {
      await chmod(join(root, "readonly"), 0o700);
    }
    assert.equal(outcome.status, "unknown");
    assert.equal(outcome.effectState, "unknown");
    assert.equal(outcome.value.committedPrefix, 1);
    assert.deepEqual(
      outcome.value.files.map((file) => file.status),
      ["applied", "not-applied"],
    );
    assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nnew\nZ\n");
    assert.equal((await readFile(join(root, "readonly", "b.txt"))).toString(), original);
    assert.equal(effects.status().unresolvedEffects, 1);
    const record = (await replay()).find(
      (event) => event.kind === "operation-outcome" && event.payload.occurrenceId === outcome.occurrenceId,
    );
    assert.ok(record);
    assert.equal(record.payload.effectState, "unknown");
    assert.deepEqual(await persistedReceipt({ replay, store, manager }, outcome), outcome.value);
    const later = await call(
      input(
        document,
        [
          ["a.txt", "A\nold\nZ\n"],
          ["readonly/b.txt", original],
        ],
        true,
      ),
    );
    assert.equal(later.status, "denied");
    assert.equal(later.error.code, "unresolved_effect");
    assert.deepEqual(
      manager
        .getEntries()
        .filter((entry) => entry.customType === "freeflow-tool-effect-v1")
        .map((entry) => entry.data.event),
      ["started", "settled"],
    );
  });
});

test("an unchanged prefix followed by a pre-write failure settles no patch effect", async () => {
  await fixture(async ({ root, call, effects }) => {
    const a = "A\nold\nZ\n",
      b = "B\nold\nZ\n";
    await writeFile(join(root, "a.txt"), a);
    await mkdir(join(root, "readonly"));
    await writeFile(join(root, "readonly", "b.txt"), b);
    const document = patch(["a.txt", [" A", "-old", "+old", " Z"]], ["readonly/b.txt", [" B", "-old", "+new", " Z"]]);
    const request = input(document, [
      ["a.txt", a],
      ["readonly/b.txt", b],
    ]);
    await chmod(join(root, "readonly"), 0o500);
    let outcome;
    try {
      outcome = await call(request);
    } finally {
      await chmod(join(root, "readonly"), 0o700);
    }
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.effectState, "none");
    assert.equal(outcome.value.committedPrefix, 1);
    assert.deepEqual(
      outcome.value.files.map((file) => file.status),
      ["unchanged", "not-applied"],
    );
    assert.equal((await readFile(join(root, "a.txt"))).toString(), a);
    assert.equal((await readFile(join(root, "readonly", "b.txt"))).toString(), b);
    assert.equal(effects.status().unresolvedEffects, 0);
    const next = await call({ ...request, dryRun: true });
    assert.equal(next.status, "succeeded");
  });
});

test("rename that takes effect before reporting failure retains verified applied prefix and unknown fence", async () => {
  await fixture(async ({ root, injected, effects, replay, store, manager }) => {
    const a = "A\nold\nZ\n",
      b = "B\nold\nZ\n";
    await writeFile(join(root, "a.txt"), a);
    await writeFile(join(root, "b.txt"), b);
    const invoke = injected({
      rename: async (from, to) => {
        await rename(from, to);
        throw new Error("rename took effect then caller lost acknowledgment");
      },
    });
    const outcome = await invoke(
      input(patch(["a.txt", [" A", "-old", "+new", " Z"]], ["b.txt", [" B", "-old", "+new", " Z"]]), [
        ["a.txt", a],
        ["b.txt", b],
      ]),
    );
    assert.equal(outcome.status, "unknown");
    assert.equal(outcome.effectState, "unknown");
    assert.equal(outcome.value.committedPrefix, 1);
    assert.deepEqual(
      outcome.value.files.map((file) => file.status),
      ["applied", "not-applied"],
    );
    assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nnew\nZ\n");
    assert.equal((await readFile(join(root, "b.txt"))).toString(), b);
    assert.deepEqual(await persistedReceipt({ replay, store, manager }, outcome), outcome.value);
    assert.equal(effects.status().unresolvedEffects, 1);
  });
});

test("cancellation between verified file commits keeps the prefix and leaves later files untouched", async () => {
  const controller = new AbortController();
  await fixture(async ({ root, injected, effects }) => {
    const a = "A\nold\nZ\n",
      b = "B\nold\nZ\n";
    await writeFile(join(root, "a.txt"), a);
    await writeFile(join(root, "b.txt"), b);
    const invoke = injected({
      rename: async (from, to) => {
        await rename(from, to);
        controller.abort();
      },
    });
    const outcome = await invoke(
      input(patch(["a.txt", [" A", "-old", "+new", " Z"]], ["b.txt", [" B", "-old", "+new", " Z"]]), [
        ["a.txt", a],
        ["b.txt", b],
      ]),
      controller.signal,
    );
    assert.equal(outcome.status, "unknown");
    assert.equal(outcome.error.code, "cancelled");
    assert.equal(outcome.value.committedPrefix, 1);
    assert.deepEqual(
      outcome.value.files.map((file) => file.status),
      ["applied", "not-applied"],
    );
    assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nnew\nZ\n");
    assert.equal((await readFile(join(root, "b.txt"))).toString(), b);
    assert.equal(effects.status().unresolvedEffects, 1);
  });
});

test("post-rename readback failure never reports verified bytes or clears the fence", async () => {
  await fixture(async ({ root, injected, effects }) => {
    const before = "A\nold\nZ\n";
    await writeFile(join(root, "a.txt"), before);
    const invoke = injected({
      readback: async () => {
        throw new Error("readback unavailable");
      },
    });
    const outcome = await invoke(input(patch(["a.txt", [" A", "-old", "+new", " Z"]]), [["a.txt", before]]));
    assert.equal(outcome.status, "unknown");
    assert.equal(outcome.value.committedPrefix, 0);
    assert.equal(outcome.value.files[0].status, "unknown");
    assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nnew\nZ\n");
    assert.equal(effects.status().unresolvedEffects, 1);
  });
});

test("concurrent direct and programmatic calls cannot both commit a stale revision", async () => {
  await fixture(async ({ root, call, tools, host, manager }) => {
    const original = "A\nold\nZ\n";
    await writeFile(join(root, "a.txt"), original);
    const request = input(patch(["a.txt", [" A", "-old", "+new", " Z"]]), [["a.txt", original]]);
    const direct = tools.invokeTools(
      "direct:patch",
      { operation: "call", operationKey: key, input: request },
      undefined,
      { ...host, cwd: root },
    );
    const programmatic = call(request);
    const [presented, canonical] = await Promise.all([direct, programmatic]);
    const statuses = [presented.details.outcome.status, canonical.status].sort();
    assert.deepEqual(statuses, ["failed", "succeeded"]);
    assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nnew\nZ\n");
    assert.equal(
      manager
        .getEntries()
        .filter((entry) => entry.customType === "freeflow-tool-effect-v1" && entry.data.event === "started").length,
      1,
    );
    assert.ok(Buffer.byteLength(presented.content[0].text) <= 2048);
    assert.equal(JSON.stringify(presented.details).includes("A\\nnew"), false);
  });
});

test("failed settlement retains completed file receipt and fences the next live call", async () => {
  let failSettlement = true;
  await fixture(
    async ({ root, call, effects }) => {
      const original = "A\nold\nZ\n";
      await writeFile(join(root, "a.txt"), original);
      const document = patch(["a.txt", [" A", "-old", "+new", " Z"]]);
      const outcome = await call(input(document, [["a.txt", original]]));
      assert.equal(outcome.status, "unknown");
      assert.equal(outcome.error.code, "effect_settlement_uncertain");
      assert.equal(outcome.value.files[0].status, "applied");
      assert.equal(outcome.value.committedPrefix, 1);
      assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nnew\nZ\n");
      assert.equal(effects.status().unresolvedEffects, 1);
      failSettlement = false;
      const retry = await call(input(document, [["a.txt", original]]));
      assert.equal(retry.status, "denied");
      assert.equal(retry.error.code, "unresolved_effect");
    },
    {
      onEntry(type, value) {
        if (failSettlement && type === "freeflow-tool-effect-v1" && value.event === "settled")
          throw new Error("simulated native settlement append failure");
      },
    },
  );
});

test("uncertain native mutation-start append fences without writing or retrying", async () => {
  await fixture(
    async ({ root, call, effects }) => {
      const original = "A\nold\nZ\n";
      await writeFile(join(root, "a.txt"), original);
      const request = input(patch(["a.txt", [" A", "-old", "+new", " Z"]]), [["a.txt", original]]);
      const outcome = await call(request);
      assert.equal(outcome.status, "unknown");
      assert.equal(outcome.effectState, "unknown");
      assert.equal(outcome.bodyStarted, false);
      assert.equal((await readFile(join(root, "a.txt"))).toString(), original);
      assert.equal(effects.status().unresolvedEffects, 1);
      const second = await call(request);
      assert.equal(second.status, "denied");
      assert.equal(second.error.code, "unresolved_effect");
    },
    {
      onEntry(type, value) {
        if (type === "freeflow-tool-effect-v1" && value.event === "started")
          throw new Error("native append failed after start was staged in memory");
      },
    },
  );
});

test("write-policy revocation during effect start leaves all files untouched and settles none", async () => {
  let revoke;
  await fixture(
    async ({ root, call, setConfig, effects }) => {
      const original = "A\nold\nZ\n";
      await writeFile(join(root, "a.txt"), original);
      revoke = () =>
        setConfig(
          resolveToolExecutionConfig(
            {
              toolExecution: {
                enabled: true,
                workspace: { enabled: true, write: false, root },
              },
            },
            {},
            true,
          ),
        );
      const outcome = await call(input(patch(["a.txt", [" A", "-old", "+new", " Z"]]), [["a.txt", original]]));
      assert.equal(outcome.status, "failed");
      assert.equal(outcome.error.code, "workspace_write_disabled");
      assert.equal(outcome.effectState, "none");
      assert.equal(outcome.value.files[0].status, "not-applied");
      assert.equal((await readFile(join(root, "a.txt"))).toString(), original);
      assert.equal(effects.status().unresolvedEffects, 0);
    },
    {
      onEntry(type, value) {
        if (type === "freeflow-tool-effect-v1" && value.event === "started") revoke();
      },
    },
  );
});

test("artifact and presenter failure after a completed patch never invent recoverability or erase effect truth", async () => {
  await fixture(
    async ({ root, tools, host, call, store, manager, effects }) => {
      const original = "A\nold\nZ\n";
      await writeFile(join(root, "a.txt"), original);
      const request = input(patch(["a.txt", [" A", "-old", "+new", " Z"]]), [["a.txt", original]]);
      const result = await tools.invokeTools(
        "direct:patch",
        { operation: "call", operationKey: key, input: request },
        undefined,
        { ...host, cwd: root },
      );
      assert.equal(result.details.outcome.status, "succeeded");
      assert.equal(result.details.outcome.effectState, "completed");
      assert.equal(result.details.freeflowV2.presentationFailure, "source_or_artifact_unavailable");
      assert.match(result.content[0].text, /source\/artifact unavailable/);
      assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nnew\nZ\n");
      assert.equal(effects.status().unresolvedEffects, 0);
      const events = await store.replay("execution", syntheticNativeAncestry(store, manager.getSessionId()));
      const record = events.find((event) => event.kind === "operation-outcome");
      assert.equal(record.payload.effectState, "completed");
      assert.ok(record.payload.valueUnavailable);
    },
    { inlineBytes: 64, limits: { ...limits, perArtifactBytes: 64 } },
  );

  await fixture(async ({ root, tools, call }) => {
    const original = "A\nold\nZ\n";
    await writeFile(join(root, "a.txt"), original);
    const request = input(patch(["a.txt", [" A", "-old", "+new", " Z"]]), [["a.txt", original]]);
    const outcome = await call(request);
    assert.equal(outcome.status, "succeeded");
    const operation = tools.registry.resolve(key).operation;
    const presented = await presentV2(
      {
        ...operation,
        presenter: {
          model: async () => {
            throw new Error("presenter fault");
          },
        },
      },
      request,
      outcome,
      { maxBytes: 2048 },
    );
    assert.equal(presented.details.outcome.effectState, "completed");
    assert.equal(presented.details.freeflowV2.presentationFailure, "model_presentation_unavailable");
    assert.equal((await readFile(join(root, "a.txt"))).toString(), "A\nnew\nZ\n");
  });
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { SessionStoreRuntime } from "../../dist/tool-runtime/session-store/store.js";
import { resolveRgBackend } from "../../dist/tool-runtime/adapters/rg-backend.js";
import { syntheticNativeAncestry } from "../fixtures/v2-sidecar.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const forgedCursor = (cursor, changes) =>
  Buffer.from(
    JSON.stringify({
      ...JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      ...changes,
    }),
  ).toString("base64url");
const find = { id: "project.findPaths", revision: "1" };
const search = { id: "project.searchText", revision: "2" };
const manifest = {
  schemaVersion: 2,
  storeId: "store:rg",
  originSessionId: "session:rg",
  host: { id: "pi", contract: "0.87.x" },
  createdBy: { package: "fixture", version: "1" },
  domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
};
const limits = {
  perArtifactBytes: 128 * 1024,
  perRunBytes: 512 * 1024,
  perSessionBytes: 1024 * 1024,
  totalBytes: 2 * 1024 * 1024,
  maxReadBytes: 32 * 1024,
};

async function fixture(run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-p32-operations-"));
  const state = resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        workspace: { enabled: true, write: false, root, denyPaths: options.denyPaths ?? ["private", "store"] },
      },
    },
    {},
    true,
  );
  const routing = {
    scope: () => ({}),
    responsibility: () => ({ profile: "solo", control: "inactive" }),
    admit: () => ({ kind: "allowed" }),
  };
  const reader = {
    read: async () => {
      throw new Error("unused legacy read");
    },
  };
  const store = new SessionStoreRuntime(join(root, "store"), manifest, limits);
  const fence = await store.open();
  let sequence = 0;
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:rg-${++sequence}` }),
    256,
  );
  const runtime = new ToolRuntime(() => state, routing, reader, undefined, undefined, recorder, { maxBytes: 4096 });
  const ctx = { cwd: root, sessionManager: { getSessionId: () => "session:rg", getLeafId: () => null } };
  const invoke = (key, input) =>
    runtime.invokeTools("direct:rg", { operation: "call", operationKey: key, input }, undefined, ctx);
  const value = async (result) => {
    const events = await store.replay("execution", syntheticNativeAncestry(store, "session:rg"));
    const event = events.find(
      (entry) =>
        entry.kind === "operation-outcome" && entry.payload.occurrenceId === result.details.freeflowV2.occurrenceId,
    );
    assert.ok(event);
    if (event.payload.value) return event.payload.value;
    if (!event.artifactRefs.length) return undefined;
    const id = event.artifactRefs[0];
    const descriptor = events.find((entry) => entry.kind === "artifact-published" && entry.payload.id === id).payload;
    const body = await store.readArtifact(
      id,
      { startBytes: 0, endBytes: descriptor.bytes },
      {
        originSessionId: "session:rg",
        ancestry: syntheticNativeAncestry(store, "session:rg"),
        grantedArtifactIds: [id],
      },
    );
    return JSON.parse(Buffer.from(body.bytes).toString("utf8"));
  };
  try {
    await run({ root, runtime, ctx, invoke, value, store });
  } finally {
    await store.close(fence).catch(() => store.abandon());
    await rm(root, { recursive: true, force: true });
  }
}

const qualified = await resolveRgBackend().then(
  () => true,
  () => false,
);
if (!qualified) {
  test("unqualified platform/PATH leaves v2 search unavailable without v1 fallback", async () => {
    await fixture(async ({ invoke, store }) => {
      for (const [key, input] of [
        [find, {}],
        [search, { query: "needle", mode: "count" }],
      ]) {
        const result = await invoke(key, input);
        assert.equal(result.details.outcome.status, "failed");
        const events = await store.replay("execution", syntheticNativeAncestry(store, "session:rg"));
        assert.match(
          events.findLast((entry) => entry.kind === "operation-outcome")?.payload?.error?.message,
          /backend_unavailable/,
        );
      }
    });
  });
} else {
  test("findPaths is ignore-aware without a Git repo and continuation detects candidate changes", async () => {
    await fixture(async ({ root, runtime, invoke, value }) => {
      await mkdir(join(root, "ignored"));
      await mkdir(join(root, "private"));
      await mkdir(join(root, ".hidden"));
      await mkdir(join(root, ".git"));
      await writeFile(join(root, ".gitignore"), "ignored/\n");
      await writeFile(join(root, "alpha.ts"), "alpha");
      await writeFile(join(root, "beta.ts"), "beta");
      await writeFile(join(root, ".hidden", "secret.ts"), "hidden");
      await writeFile(join(root, "ignored", "ignored.ts"), "ignored");
      await writeFile(join(root, "private", "private.ts"), "PRIVATE_MARKER");
      await writeFile(join(root, ".git", "config"), "GIT_INTERNAL_MARKER");
      assert.equal(runtime.registry.describe(find).contractVersion, 2);
      assert.equal(runtime.registry.describe(search).contractVersion, 2);
      assert.equal(runtime.registry.describe({ id: "project.searchText", revision: "1" }).contractVersion, undefined);
      let cursor;
      const observed = [];
      for (let page = 0; page < 3; page += 1) {
        const result = await invoke(find, { query: ".ts", maxResults: 1, ...(cursor ? { cursor } : {}) });
        assert.equal(result.details.outcome.status, "succeeded");
        const read = await value(result);
        observed.push(...read.paths);
        cursor = read.next;
        if (cursor) assert.match(result.content[0].text, /Continue with cursor:/);
        assert.ok(Buffer.byteLength(result.content[0].text) <= 4096);
      }
      assert.deepEqual(observed, [".hidden/secret.ts", "alpha.ts", "beta.ts"]);
      assert.equal(cursor, undefined);
      assert.equal(JSON.stringify(observed).includes("PRIVATE_MARKER"), false);
      const denied = await invoke(find, { paths: ["private"] });
      assert.equal(denied.details.outcome.status, "denied");
      assert.equal(denied.details.outcome.bodyStarted, false);
      const hiddenGit = await value(
        await invoke(search, { query: "GIT_INTERNAL_MARKER", mode: "count", paths: ["."] }),
      );
      assert.equal(hiddenGit.count, 0);
      assert.equal(hiddenGit.coverage, "complete-at-boundary");
      const first = await value(await invoke(find, { query: ".ts", maxResults: 1 }));
      const forged = await invoke(find, {
        query: ".ts",
        maxResults: 1,
        cursor: forgedCursor(first.next, { index: first.observedPaths - 1 }),
      });
      assert.equal(forged.details.outcome.status, "failed", "a forged final page must not claim completeness");
      await writeFile(join(root, "aardvark.ts"), "new path");
      const stale = await invoke(find, { query: ".ts", maxResults: 1, cursor: first.next });
      assert.equal(stale.details.outcome.status, "failed");
      assert.match(stale.content[0].text, /failed/);
    });
  });

  test("denied roots are excluded in ripgrep argv before traversal without hiding allowed nested names", async () => {
    await fixture(
      async ({ root, invoke, value }) => {
        await mkdir(join(root, "secret[1]"));
        await mkdir(join(root, "src", "secret[1]"), { recursive: true });
        await writeFile(join(root, "secret[1]", "blocked.txt"), "DENIED_MARKER\n");
        await writeFile(join(root, "src", "secret[1]", "allowed.txt"), "ALLOWED_MARKER\n");
        const backend = await resolveRgBackend();
        const wrapperDir = await mkdtemp(join(tmpdir(), "freeflow-rg-argv-"));
        const log = join(wrapperDir, "argv.log");
        await writeFile(
          join(wrapperDir, "rg"),
          `#!/bin/sh\nprintf 'PWD=%s\\n' "$PWD" >> ${JSON.stringify(log)}\nprintf 'ARG=%s\\n' "$@" >> ${JSON.stringify(log)}\nexec ${JSON.stringify(backend.path)} "$@"\n`,
        );
        await chmod(join(wrapperDir, "rg"), 0o755);
        const previousPath = process.env.PATH;
        try {
          process.env.PATH = wrapperDir;
          const result = await invoke(search, { query: "MARKER", mode: "count", paths: ["."] });
          assert.equal(result.details.outcome.status, "succeeded");
          const read = await value(result);
          assert.equal(read.count, 1);
          assert.deepEqual(
            read.files.map((item) => item.path),
            ["src/secret[1]/allowed.txt"],
          );
          assert.equal(read.coverage, "complete-at-boundary");
          const args = await readFile(log, "utf8");
          assert.ok(args.includes(`PWD=${await realpath(root)}\n`));
          assert.ok(args.includes("ARG=!/secret\\[1\\]"), "root-deny glob must be given to rg before enumeration");
        } finally {
          process.env.PATH = previousPath;
          await rm(wrapperDir, { recursive: true, force: true });
        }
      },
      { denyPaths: ["secret[1]", "store"] },
    );
  });

  test("searchText modes preserve Unicode byte coordinates, revisions and context without materializing count matches", async () => {
    await fixture(async ({ root, runtime, ctx, invoke, value, store }) => {
      const body = Buffer.from("\uFEFFα NEEDLE β\r\nsecond NEEDLE\n", "utf8");
      await writeFile(join(root, "visible.txt"), body);
      const input = { query: "NEEDLE", patternKind: "literal", paths: ["visible.txt"] };
      const counts = await value(await invoke(search, { ...input, mode: "count" }));
      assert.equal(counts.count, 2);
      assert.equal(counts.files[0].count, 2);
      assert.equal(counts.files[0].revision, hash(body));
      assert.deepEqual(counts.matches, []);
      const names = await value(await invoke(search, { ...input, mode: "files" }));
      assert.equal(names.count, 1);
      assert.deepEqual(
        names.files.map((item) => item.path),
        ["visible.txt"],
      );
      const direct = await invoke(search, { ...input, mode: "matches" });
      if (direct.details.outcome.status !== "succeeded") {
        const events = await store.replay("execution", syntheticNativeAncestry(store, "session:rg"));
        assert.fail(JSON.stringify(events.findLast((entry) => entry.kind === "operation-outcome")?.payload?.error));
      }
      const matches = await value(direct);
      assert.equal(matches.matches.length, 2);
      assert.equal(matches.matches[0].range.startBytes, body.indexOf(Buffer.from("NEEDLE")));
      assert.equal(matches.matches[0].range.endBytes - matches.matches[0].range.startBytes, 6);
      assert.equal(matches.matches[0].revision, hash(body));
      assert.match(matches.matches[0].excerpt, /NEEDLE/);
      const context = await value(await invoke(search, { ...input, mode: "context", contextLines: 1 }));
      assert.match(context.matches[0].excerpt, /second NEEDLE/);
      const regex = await value(
        await invoke(search, { query: "N[E]{2}DLE", patternKind: "regex", paths: ["visible.txt"], mode: "matches" }),
      );
      assert.equal(regex.matches.length, 2);
      assert.equal(regex.matches[0].range.startBytes, body.indexOf(Buffer.from("NEEDLE")));
      const compact = await invoke(search, { ...input, mode: "count", maxBytes: 512 });
      assert.equal(compact.details.outcome.status, "succeeded");
      assert.equal(compact.details.freeflowV2.presentationFailure, undefined);
      assert.equal(compact.details.freeflowV2.modelCoverage.kind, "complete-at-boundary");
      assert.ok(Buffer.byteLength(compact.content[0].text) <= 512);
      const program = await runtime.executeProgrammatic(
        search,
        { ...input, mode: "matches" },
        runtime.createProgramScope("program:rg", ctx),
        undefined,
        ctx,
      );
      assert.equal(program.status, "succeeded");
      assert.deepEqual(program.value, matches);
    });
  });

  test("invalid UTF-8 and NUL files are skipped with limited coverage, not a false absence", async () => {
    await fixture(async ({ root, invoke, value }) => {
      await writeFile(join(root, "bad.txt"), Buffer.from([0xff, ...Buffer.from("NEEDLE\n")]));
      await writeFile(join(root, "binary.bin"), Buffer.from("prefix\0NEEDLE\n"));
      const result = await invoke(search, { query: "NEEDLE", mode: "matches", paths: ["."] });
      const read = await value(result);
      assert.equal(read.matches.length, 0);
      assert.equal(read.skippedFiles, 2);
      assert.equal(read.coverage, "limited");
      assert.match(result.content[0].text, /limited/);
      assert.equal(result.content[0].text.includes("No matches found"), false);
    });
  });

  test("scan-byte limits return advancing coverage rather than an empty complete result or self-cursor", async () => {
    await fixture(async ({ root, invoke, value }) => {
      await writeFile(join(root, "a.txt"), "no\n");
      await writeFile(join(root, "b.txt"), "NEEDLE\n");
      const input = { query: "NEEDLE", mode: "matches", paths: ["."], maxScanBytes: 7 };
      const firstResult = await invoke(search, input);
      const first = await value(firstResult);
      assert.match(firstResult.content[0].text, /Continue with cursor:|Continuation token omitted/);
      assert.equal(first.matches.length, 0);
      assert.equal(first.coverage, "limited");
      assert.ok(first.next);
      const second = await value(await invoke(search, { ...input, cursor: first.next }));
      assert.equal(second.matches[0].path, "b.txt");
      assert.equal(second.next, undefined);
      const tooSmall = await value(
        await invoke(search, { query: "NEEDLE", mode: "matches", paths: ["b.txt"], maxScanBytes: 1 }),
      );
      assert.equal(tooSmall.coverage, "limited");
      assert.equal(tooSmall.skippedFiles, 1);
      assert.equal(tooSmall.next, undefined);
    });
  });

  test("a dense JSON stream fails explicitly at its raw cap while count stays compact", async () => {
    await fixture(async ({ root, invoke, value, store }) => {
      await writeFile(join(root, "dense.txt"), "NEEDLE\n".repeat(50_000));
      const request = { query: "NEEDLE", paths: ["dense.txt"] };
      const count = await value(await invoke(search, { ...request, mode: "count" }));
      assert.equal(count.count, 50_000);
      assert.deepEqual(count.matches, []);
      const oversized = await invoke(search, { ...request, mode: "matches", maxResults: 1 });
      assert.equal(oversized.details.outcome.status, "failed");
      assert.equal(oversized.details.freeflowV2.modelCoverage.kind, "unknown");
      assert.equal(oversized.content[0].text.includes("No matches found"), false);
      const events = await store.replay("execution", syntheticNativeAncestry(store, "session:rg"));
      assert.match(
        events.findLast((entry) => entry.kind === "operation-outcome")?.payload?.error?.message,
        /backend_output_limit/,
      );
    });
  });

  test("search continuation binds source revision and backend identity; missing PATH never falls back", async () => {
    await fixture(async ({ root, invoke, value, store }) => {
      const body = "NEEDLE one\nNEEDLE two\nNEEDLE three\n";
      await writeFile(join(root, "repeat.txt"), body);
      const input = { query: "NEEDLE", mode: "matches", paths: ["repeat.txt"], maxResults: 1 };
      const first = await value(await invoke(search, input));
      assert.equal(first.matches.length, 1);
      assert.equal(first.coverage, "limited");
      assert.ok(first.next);
      const forged = await invoke(search, { ...input, cursor: forgedCursor(first.next, { matchIndex: 999 }) });
      assert.equal(
        forged.details.outcome.status,
        "failed",
        "a forged match position cannot return empty complete coverage",
      );
      const second = await value(await invoke(search, { ...input, cursor: first.next }));
      assert.equal(second.matches[0].range.startBytes, Buffer.byteLength("NEEDLE one\n"));
      await writeFile(join(root, "repeat.txt"), `${body}CHANGED\n`);
      const stale = await invoke(search, { ...input, cursor: first.next });
      assert.equal(stale.details.outcome.status, "failed");
      const events = await store.replay("execution", syntheticNativeAncestry(store, "session:rg"));
      assert.match(
        events.findLast((entry) => entry.kind === "operation-outcome")?.payload?.error?.message,
        /source_changed/,
      );
      const previousPath = process.env.PATH;
      const replacement = await mkdtemp(join(tmpdir(), "freeflow-rg-replacement-"));
      const empty = await mkdtemp(join(tmpdir(), "freeflow-no-rg-"));
      try {
        const backend = await resolveRgBackend();
        await cp(backend.path, join(replacement, "rg"));
        await chmod(join(replacement, "rg"), 0o755);
        process.env.PATH = replacement;
        const changedBackend = await invoke(search, { ...input, cursor: first.next });
        assert.equal(changedBackend.details.outcome.status, "failed");
        const changedEvents = await store.replay("execution", syntheticNativeAncestry(store, "session:rg"));
        assert.match(
          changedEvents.findLast((entry) => entry.kind === "operation-outcome")?.payload?.error?.message,
          /cursor_invalid/,
        );
        process.env.PATH = empty;
        const unavailable = await invoke(search, input);
        assert.equal(unavailable.details.outcome.status, "failed");
        const unavailableEvents = await store.replay("execution", syntheticNativeAncestry(store, "session:rg"));
        assert.match(
          unavailableEvents.findLast((entry) => entry.kind === "operation-outcome")?.payload?.error?.message,
          /backend_unavailable/,
        );
        assert.match(unavailable.content[0].text, /failed/);
      } finally {
        process.env.PATH = previousPath;
        await rm(replacement, { recursive: true, force: true });
        await rm(empty, { recursive: true, force: true });
      }
    });
  });
}

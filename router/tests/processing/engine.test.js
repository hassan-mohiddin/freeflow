import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import { loadProcessingSource, processSource } from "../../dist/processing/engine.js";
import { SCRIPT_SANDBOX_REQUIRED_PROOFS } from "../../dist/sandbox/script-sandbox.js";
import { freeflowRun } from "../../dist/tools/run.js";
import { createVault, readOutputText } from "../../dist/vault/vault.js";

function testOutputSample() {
  return [
    " RUN  v2.1.8 /repo",
    " ✗ src/components/UserList.test.tsx (4 tests) 234ms",
    "   ✗ handles empty state 156ms",
    " ✗ src/components/DataGrid.test.tsx (5 tests) 345ms",
    "   ✗ filters with complex queries 198ms",
    " Test Files  2 failed | 28 passed (30)",
    " Tests       2 failed | 110 passed (112)",
  ].join("\n");
}

function tableSample() {
  return [
    "id,status,duration_ms",
    "1,success,10",
    "2,success,20",
    "3,error,30",
    "4,timeout,34000",
  ].join("\n");
}

function mcpToolsSample() {
  return JSON.stringify([
    { name: "search_codebase", description: "Search code", inputSchema: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } },
    { name: "git_status", description: "Git status", inputSchema: { type: "object", properties: {}, required: [] } },
    { name: "git_diff", description: "Git diff", inputSchema: { type: "object", properties: { cached: { type: "boolean" } }, required: [] } },
    { name: "typecheck", description: "Run typecheck", inputSchema: { type: "object", properties: {}, required: [] } },
  ]);
}

function gitLogSample() {
  return [
    "f8a3b1c 2026-02-23 Mert Koseoglu feat: add user role management",
    "d7e2a0b 2026-02-23 Mert Koseoglu refactor: improve UserList component",
    "c6d1f9a 2026-02-23 Alice Johnson feat(auth): add email magic link authentication",
    "b5c0e8f 2026-02-22 Alice Johnson fix: resolve null updatedAt",
  ].join("\n");
}

function browserSnapshotSample() {
  return [
    "### Page",
    "- Page URL: https://news.ycombinator.com/",
    "- Page Title: Hacker News",
    "### Snapshot",
    "```yaml",
    "- table [ref=e1]:",
    "  - row [ref=e2]:",
    "    - link \"Hacker News\" [ref=e3] [cursor=pointer]:",
    "      - /url: news",
    "    - link \"Browser reducer story\" [ref=e4] [cursor=pointer]:",
    "      - /url: item?id=1",
    "    - text: Story text",
    "```",
  ].join("\n");
}

function buildOutputSample() {
  return [
    "  ▲ Next.js 15.1.0",
    "   Creating an optimized production build ...",
    "  ERROR in src/middleware.ts(23,8): TS2345: Argument of type '{ callbackUrl: string; }' is not assignable to parameter of type 'URLSearchParams'.",
    "  ⚠ Warning: src/middleware.ts - Middleware should not redirect to external URLs",
    "  ERROR in src/components/DataGrid.tsx(89,23): TS18047: 'data' is possibly 'null'.",
    "  Build completed with 2 errors and 1 warning.",
  ].join("\n");
}

function diagnosticsSample() {
  return [
    "src/components/UserList.tsx(23,15): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
    "src/components/UserList.tsx(45,8): error TS2339: Property 'fullName' does not exist on type 'User'.",
    "src/components/DataGrid.tsx(67,22): error TS2532: Object is possibly 'undefined'.",
    "src/lib/auth.ts(8,12): error TS2322: Type 'Promise<Session | null>' is not assignable to type 'Session'.",
  ].join("\n");
}

function accessLogSample() {
  return [
    '192.168.1.1 - - [23/Feb/2026:10:00:01 +0000] "GET /api/a HTTP/1.1" 200 892 100ms',
    '192.168.1.2 - - [23/Feb/2026:10:00:02 +0000] "GET /api/b HTTP/1.1" 200 892 200ms',
    '192.168.1.3 - - [23/Feb/2026:10:00:03 +0000] "POST /api/c HTTP/1.1" 500 892 1200ms',
    '192.168.1.4 - - [23/Feb/2026:10:00:04 +0000] "GET /api/d HTTP/1.1" 404 892 20ms',
    '192.168.1.5 - - [23/Feb/2026:10:00:05 +0000] "GET /api/e HTTP/1.1" 201 892 300ms',
  ].join("\n");
}

function provenScriptAdapter({ id = "processing-test-sandbox", execute }) {
  return {
    id,
    version: "test",
    languages: ["javascript"],
    async probe() {
      return {
        status: "available",
        reason: "test adapter passed proof suite",
        passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        failedProofs: [],
        runtime: { name: "test-js", version: "1" },
      };
    },
    execute,
  };
}

function fixtureRunner() {
  return {
    async run(request) {
      if (request.command === "emit vault source") {
        return {
          stdout: "VAULT_SOURCE_TOKEN\nsecond line\n",
          stderr: "",
          combined: "VAULT_SOURCE_TOKEN\nsecond line\n",
          executionStatus: "success",
          exitCode: 0,
          durationMs: 1,
        };
      }
      return {
        stdout: "",
        stderr: "unknown command\n",
        combined: "unknown command\n",
        executionStatus: "failed",
        exitCode: 127,
        durationMs: 1,
      };
    },
  };
}

test("processing engine loads repo file sources and returns fact-first source metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-repo-"));
  try {
    await writeFile(join(root, "input.log"), "alpha\nbeta\n", "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "input.log" });

    assert.equal(result.status, "ok");
    assert.equal(result.source.ref.kind, "repo");
    assert.equal(result.source.displayPath, "input.log");
    assert.equal(result.visibleText.split("\n")[0], "source.kind: repo-file");
    assert.doesNotMatch(result.visibleText, /processing source loaded/);
    assert.deepEqual(result.facts.map((fact) => fact.name), [
      "source.kind",
      "source.path",
      "source.bytes",
      "source.lines",
      "source.sha256",
    ]);
    assert.equal(result.reducer.status, "not_selected");
    assert.equal(result.script.status, "not_configured");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine blocks repo path escapes and symlink escapes without reading content", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-containment-"));
  const outside = await mkdtemp(join(tmpdir(), "freeflow-processing-outside-"));
  try {
    await writeFile(join(root, "safe.txt"), "SAFE_TOKEN\n", "utf8");
    await writeFile(join(outside, "secret.txt"), "OUTSIDE_SECRET_TOKEN\n", "utf8");
    await symlink(join(outside, "secret.txt"), join(root, "secret-link.txt"));

    const parentEscape = await loadProcessingSource({ kind: "repo-file", root, path: relative(root, join(outside, "secret.txt")) });
    assert.equal(parentEscape.status, "blocked");
    assert.equal(parentEscape.policy, "repo_containment");
    assert.doesNotMatch(parentEscape.reason, /OUTSIDE_SECRET_TOKEN/);

    const symlinkEscape = await loadProcessingSource({ kind: "repo-file", root, path: "secret-link.txt" });
    assert.equal(symlinkEscape.status, "blocked");
    assert.equal(symlinkEscape.policy, "repo_containment");
    assert.doesNotMatch(symlinkEscape.reason, /OUTSIDE_SECRET_TOKEN/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("processing engine selects test-output reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-test-output-"));
  try {
    await writeFile(join(root, "test-output.txt"), testOutputSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "test-output.txt" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "test-output");
    assert.equal(result.visibleText.split("\n")[0], "tests: 2 failed, 110 passed, (112)");
    assert.doesNotMatch(result.visibleText, /testFiles:/);
    assert.match(result.visibleText, /UserList\.test\.tsx/);
    assert.match(result.visibleText, /DataGrid\.test\.tsx/);
    assert.doesNotMatch(result.visibleText, /test-output summary/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine selects table reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-table-"));
  try {
    await writeFile(join(root, "analytics.csv"), tableSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "analytics.csv" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "table");
    assert.equal(result.visibleText.split("\n")[0], "rows: 4");
    assert.match(result.visibleText, /status: success:2, error:1, timeout:1/);
    assert.match(result.visibleText, /duration_ms\.max: 34000/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine selects mcp-tools reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-mcp-tools-"));
  try {
    await writeFile(join(root, "mcp-tools.json"), mcpToolsSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "mcp-tools.json" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "mcp-tools");
    assert.equal(result.visibleText.split("\n")[0], "tools: 4");
    assert.match(result.visibleText, /categories: git:2/);
    assert.match(result.visibleText, /typecheck:1/);
    assert.match(result.visibleText, /search_codebase\(pattern, path\?\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine selects browser-snapshot reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-browser-snapshot-"));
  try {
    await writeFile(join(root, "playwright-snapshot.txt"), browserSnapshotSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "playwright-snapshot.txt" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "browser-snapshot");
    assert.equal(result.visibleText.split("\n")[0], "lines: 13");
    assert.match(result.visibleText, /links: 2/);
    assert.match(result.visibleText, /title: Hacker News/);
    assert.match(result.visibleText, /storyLikeLinks: 2 \(benchmark alias: Stories\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine selects git-log reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-git-log-"));
  try {
    await writeFile(join(root, "git-log.txt"), gitLogSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "git-log.txt" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "git-log");
    assert.equal(result.visibleText.split("\n")[0], "commits: 4");
    assert.match(result.visibleText, /types: feat:2/);
    assert.match(result.visibleText, /fix:1/);
    assert.match(result.visibleText, /Mert Koseoglu:2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine selects build-output reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-build-output-"));
  try {
    await writeFile(join(root, "build-output.txt"), buildOutputSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "build-output.txt" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "build-output");
    assert.equal(result.visibleText.split("\n")[0], "build: 2 errors, 1 warnings");
    assert.match(result.visibleText, /DataGrid\.tsx/);
    assert.match(result.visibleText, /middleware\.ts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine selects diagnostics reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-diagnostics-"));
  try {
    await writeFile(join(root, "tsc-errors.txt"), diagnosticsSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "tsc-errors.txt" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "diagnostics");
    assert.equal(result.visibleText.split("\n")[0], "diagnostics: 4 errors");
    assert.match(result.visibleText, /files: 3/);
    assert.match(result.visibleText, /UserList\.tsx/);
    assert.match(result.visibleText, /TS2345/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine selects access-log reducer for explicit processing calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-access-log-"));
  try {
    await writeFile(join(root, "access.log"), accessLogSample(), "utf8");

    const result = await processSource({ kind: "repo-file", root, path: "access.log" });

    assert.equal(result.status, "ok");
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.reducer.selected.name, "access-log");
    assert.equal(result.visibleText.split("\n")[0], "requests: 5");
    assert.match(result.visibleText, /errors: 2/);
    assert.match(result.visibleText, /errorRatePercent: 40/);
    assert.match(result.visibleText, /status: 200:2, 201:1, 404:1, 500:1/);
    assert.match(result.visibleText, /slow>=1000ms: 1/);
    assert.doesNotMatch(result.visibleText, /access-log summary/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine executes requested script only through a proven sandbox adapter", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-script-available-"));
  const calls = [];
  try {
    await writeFile(join(root, "input.txt"), "alpha\nbeta\n", "utf8");
    const adapter = provenScriptAdapter({
      async execute(request) {
        calls.push(request);
        const sourceText = await readFile(request.sources[0].path, "utf8");
        assert.equal(request.network, "off");
        assert.equal(request.code, "SCRIPT_CODE_TOKEN_AVAILABLE");
        return {
          status: "success",
          stdout: `computedLines: ${sourceText.trim().split(/\r?\n/).length}\nfirst: ${sourceText.split(/\r?\n/)[0]}\n`,
          stderr: "",
          outputFiles: [],
          durationMs: 3,
        };
      },
    });

    const result = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      { script: { language: "javascript", code: "SCRIPT_CODE_TOKEN_AVAILABLE" }, scriptSandboxAdapters: [adapter] },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "executed");
    assert.equal(result.script.adapterId, "processing-test-sandbox");
    assert.equal(result.script.rawScriptPersistence, "disabled");
    assert.equal(result.script.noHostFallback, true);
    assert.equal(calls.length, 1);
    assert.equal(result.visibleText.split("\n")[0], "computedLines: 2");
    assert.match(result.visibleText, /script: javascript sandboxed adapter=processing-test-sandbox/);
    assert.equal(result.reducer.status, "not_selected");
    assert.doesNotMatch(JSON.stringify(result), /SCRIPT_CODE_TOKEN_AVAILABLE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine returns script-unavailable without unsandboxed fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-script-unavailable-"));
  let executeCalled = false;
  try {
    await writeFile(join(root, "access.log"), accessLogSample(), "utf8");
    const unprovenAdapter = {
      id: "unproven-processing-sandbox",
      version: "test",
      languages: ["javascript"],
      async probe() {
        return {
          status: "unavailable",
          reason: "proofs missing",
          passedProofs: [],
          failedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        };
      },
      async execute() {
        executeCalled = true;
        throw new Error("must not execute");
      },
    };

    const result = await processSource(
      { kind: "repo-file", root, path: "access.log" },
      { script: { language: "javascript", code: "SCRIPT_CODE_TOKEN_UNAVAILABLE" }, scriptSandboxAdapters: [unprovenAdapter] },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "unavailable");
    assert.equal(result.script.noHostFallback, true);
    assert.equal(result.script.rawScriptPersistence, "disabled");
    assert.match(result.script.recommendation, /deterministic reducer|sandbox adapter/);
    assert.equal(executeCalled, false);
    assert.equal(result.reducer.status, "selected");
    assert.equal(result.visibleText.split("\n")[0], "requests: 5");
    assert.match(result.visibleText, /script: unavailable; reducer fallback; no host fallback/);
    assert.doesNotMatch(JSON.stringify(result), /SCRIPT_CODE_TOKEN_UNAVAILABLE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine rejects unsafe unsandboxed scripts without local opt-in and does not fall back", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-unsafe-reject-"));
  try {
    await writeFile(join(root, "access.log"), accessLogSample(), "utf8");

    const result = await processSource(
      { kind: "repo-file", root, path: "access.log" },
      {
        script: {
          language: "javascript",
          policy: "unsafe-unsandboxed",
          code: "console.log('UNSAFE_SCRIPT_SHOULD_NOT_RUN')",
        },
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "rejected");
    assert.equal(result.script.policy, "unsafe-unsandboxed");
    assert.match(result.script.reason, /local\.json/);
    assert.equal(result.reducer.status, "not_selected");
    assert.match(result.visibleText, /script: rejected unsafe\/unsandboxed; no execution/);
    assert.doesNotMatch(result.visibleText, /requests: 5/);
    assert.doesNotMatch(JSON.stringify(result), /UNSAFE_SCRIPT_SHOULD_NOT_RUN/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine executes unsafe unsandboxed javascript only with local opt-in and labels output", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-unsafe-execute-"));
  try {
    await writeFile(join(root, "input.txt"), "alpha\nbeta\n", "utf8");

    const result = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      {
        localConfig: { processing: { unsafeUnsandboxed: { enabled: true } } },
        script: {
          language: "javascript",
          policy: "unsafe-unsandboxed",
          code: [
            "import { readFileSync } from 'node:fs';",
            "const text = readFileSync(process.env.FREEFLOW_PROCESSING_SOURCE_PATH, 'utf8');",
            "console.log(`computedLines: ${text.trim().split(/\\r?\\n/).length}`);",
            "console.log(`unsafeFlag: ${process.env.FREEFLOW_PROCESSING_UNSAFE_UNSANDBOXED}`);",
          ].join("\n"),
        },
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "executed");
    assert.equal(result.script.policy, "unsafe-unsandboxed");
    assert.equal(result.script.unsafeUnsandboxed, true);
    assert.equal(result.script.rawScriptPersistence, "disabled");
    assert.equal(result.visibleText.split("\n")[0], "script: javascript unsafe/unsandboxed local-yolo");
    assert.match(result.visibleText, /computedLines: 2/);
    assert.match(result.visibleText, /unsafeFlag: 1/);
    assert.doesNotMatch(result.visibleText, /sandboxed adapter|network-off|read-only/);
    assert.equal(result.reducer.status, "not_selected");
    assert.doesNotMatch(JSON.stringify(result), /FREEFLOW_PROCESSING_SOURCE_PATH/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine keeps unsafe unsandboxed label visible when script output is truncated", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-unsafe-truncate-"));
  try {
    await writeFile(join(root, "input.txt"), "alpha\n", "utf8");

    const result = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      {
        localConfig: { processing: { unsafeUnsandboxed: { enabled: true } } },
        limits: { maxVisibleBytes: 140 },
        script: {
          language: "javascript",
          policy: "unsafe-unsandboxed",
          code: "console.log('LONG_UNSAFE_OUTPUT '.repeat(100))",
        },
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "executed");
    assert.equal(result.visibleText.split("\n")[0], "script: javascript unsafe/unsandboxed local-yolo");
    assert.match(result.visibleText, /unsafe\/unsandboxed/);
    assert.match(result.visibleText, /truncated/);
    assert.doesNotMatch(result.visibleText, /sandboxed adapter|network-off|read-only/);

    const tinyBudget = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      {
        localConfig: { processing: { unsafeUnsandboxed: { enabled: true } } },
        limits: { maxVisibleBytes: 20 },
        script: {
          language: "javascript",
          policy: "unsafe-unsandboxed",
          code: "console.log('LONG_UNSAFE_OUTPUT '.repeat(100))",
        },
      },
    );
    assert.equal(tinyBudget.visibleText.split("\n")[0], "script: javascript unsafe/unsandboxed local-yolo");
    assert.match(tinyBudget.visibleText, /unsafe\/unsandboxed/);
    assert.match(tinyBudget.visibleText, /truncated/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine sanitizes unsafe unsandboxed script failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-unsafe-failure-"));
  try {
    await writeFile(join(root, "input.txt"), "alpha\n", "utf8");

    const result = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      {
        localConfig: { processing: { unsafeUnsandboxed: { enabled: true } } },
        script: {
          language: "javascript",
          policy: "unsafe-unsandboxed",
          code: "throw new Error('RAW_UNSAFE_SCRIPT_SECRET')",
        },
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "failed");
    assert.equal(result.script.policy, "unsafe-unsandboxed");
    assert.match(result.script.reason, /Detail omitted/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_UNSAFE_SCRIPT_SECRET/);
    assert.match(result.visibleText, /script: failed unsafe\/unsandboxed; detail omitted/);
    assert.doesNotMatch(result.visibleText, /sandboxed adapter|network-off|read-only/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine sanitizes script failure details and does not persist raw script text", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-script-failure-repo-"));
  const vaultRoot = await mkdtemp(join(tmpdir(), "freeflow-processing-script-failure-vault-"));
  try {
    await writeFile(join(root, "input.txt"), "alpha\n", "utf8");
    const failedAdapter = provenScriptAdapter({
      id: "failing-processing-sandbox",
      async execute() {
        return {
          status: "failed",
          reason: "compile failed near RAW_SCRIPT_SECRET_TOKEN_FAILURE",
          stdout: "",
          stderr: "RAW_SCRIPT_SECRET_TOKEN_FAILURE",
          outputFiles: [],
        };
      },
    });

    const failed = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      {
        sessionId: "processing-script-failure-test",
        vaultRoot,
        script: { language: "javascript", code: "RAW_SCRIPT_SECRET_TOKEN_FAILURE" },
        scriptSandboxAdapters: [failedAdapter],
      },
    );

    assert.equal(failed.status, "ok");
    assert.equal(failed.script.status, "failed");
    assert.match(failed.script.reason, /detail omitted/);
    assert.doesNotMatch(JSON.stringify(failed), /RAW_SCRIPT_SECRET_TOKEN_FAILURE/);
    assert.ok(failed.recovery?.outputId);
    const raw = await readOutputText(createVault({ root: vaultRoot }), "processing-script-failure-test", failed.recovery.outputId, "raw");
    assert.doesNotMatch(raw, /RAW_SCRIPT_SECRET_TOKEN_FAILURE/);

    const throwingAdapter = provenScriptAdapter({
      id: "throwing-processing-sandbox",
      async execute() {
        throw new Error("compile failed near RAW_SCRIPT_SECRET_TOKEN_THROW");
      },
    });
    const thrown = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      { script: { language: "javascript", code: "RAW_SCRIPT_SECRET_TOKEN_THROW" }, scriptSandboxAdapters: [throwingAdapter] },
    );

    assert.equal(thrown.status, "ok");
    assert.equal(thrown.script.status, "failed");
    assert.match(thrown.script.reason, /detail omitted/);
    assert.doesNotMatch(JSON.stringify(thrown), /RAW_SCRIPT_SECRET_TOKEN_THROW/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("processing engine does not persist raw script text by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-script-persist-repo-"));
  const vaultRoot = await mkdtemp(join(tmpdir(), "freeflow-processing-script-persist-vault-"));
  try {
    await writeFile(join(root, "input.txt"), "alpha\n", "utf8");
    const adapter = provenScriptAdapter({
      async execute() {
        return { status: "success", stdout: "computed: 1\n", stderr: "", outputFiles: [] };
      },
    });

    const result = await processSource(
      { kind: "repo-file", root, path: "input.txt" },
      {
        sessionId: "processing-script-persist-test",
        vaultRoot,
        script: { language: "javascript", code: "RAW_SCRIPT_SECRET_TOKEN" },
        scriptSandboxAdapters: [adapter],
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.script.status, "executed");
    assert.ok(result.recovery?.outputId);
    assert.doesNotMatch(JSON.stringify(result), /RAW_SCRIPT_SECRET_TOKEN/);

    const raw = await readOutputText(createVault({ root: vaultRoot }), "processing-script-persist-test", result.recovery.outputId, "raw");
    assert.match(raw, /computed: 1/);
    assert.doesNotMatch(raw, /RAW_SCRIPT_SECRET_TOKEN/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("processing engine loads vault output sources with source lineage", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-vault-"));
  try {
    const sessionId = "processing-vault-test";
    const run = await freeflowRun(
      {
        command: "emit vault source",
        sessionId,
        vaultRoot: root,
        preserve: "full",
        goal: "processing fixture",
      },
      fixtureRunner(),
    );

    const result = await processSource(
      { kind: "vault-output", sessionId, vaultRoot: root, outputId: run.outputId, stream: "stdout" },
      { sessionId, vaultRoot: root },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.source.ref.kind, "vault");
    assert.equal(result.source.ref.outputId, run.outputId);
    assert.equal(result.source.stream, "stdout");
    assert.ok(result.lineage?.sourceOutputIds?.includes(run.outputId));
    assert.equal(result.persistence?.recoverability, "exact");
    assert.match(result.recovery?.how ?? "", /Recover processing result/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processing engine defaults text vault records to raw stream", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-processing-vault-text-"));
  const repo = await mkdtemp(join(tmpdir(), "freeflow-processing-vault-text-repo-"));
  try {
    await writeFile(join(repo, "input.txt"), "repo text\n", "utf8");
    const first = await processSource(
      { kind: "repo-file", root: repo, path: "input.txt" },
      { sessionId: "processing-vault-text-test", vaultRoot: root },
    );
    assert.equal(first.status, "ok");
    assert.ok(first.recovery?.outputId);

    const loaded = await loadProcessingSource({
      kind: "vault-output",
      sessionId: "processing-vault-text-test",
      vaultRoot: root,
      outputId: first.recovery.outputId,
    });

    assert.equal(loaded.status, "ok");
    assert.equal(loaded.source.stream, "raw");
    assert.match(loaded.text, /source.kind: repo-file/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
});

test("processing engine loads already captured command output and enforces source limits", async () => {
  const ok = await processSource({ kind: "command-output", stdout: "first\n", stderr: "warn\n", stream: "combined" });
  assert.equal(ok.status, "ok");
  assert.equal(ok.source.ref.kind, "native");
  assert.match(ok.visibleText, /source.lines:/);

  const limited = await processSource(
    { kind: "command-output", combined: "1234567890", stream: "combined" },
    { limits: { maxSourceBytes: 4 } },
  );
  assert.equal(limited.status, "blocked");
  assert.equal(limited.policy, "source_limit");
  assert.match(limited.visibleText, /source_limit/);
});

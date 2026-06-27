import assert from "node:assert/strict";
import test from "node:test";

import { reduceAccessLog, reduceBuildOutput, reduceDiagnosticsOutput, reduceTableOutput, reduceTestOutput, selectProcessingReducer } from "../../dist/processing/reducers.js";

function syntheticAccessLogFixture() {
  const lines = [];
  const statuses = [
    [200, 361],
    [201, 38],
    [204, 13],
    [400, 13],
    [401, 25],
    [403, 24],
    [404, 13],
    [500, 13],
  ];
  let index = 0;
  for (const [status, count] of statuses) {
    for (let i = 0; i < count; i += 1) {
      index += 1;
      const method = index % 3 === 0 ? "POST" : "GET";
      const route = index % 25 === 0 ? "/api/uploads" : `/api/items/${index}`;
      const latency = index <= 25 ? 1_000 + index : 262;
      lines.push(`192.168.1.${index % 255} - - [23/Feb/2026:10:00:01 +0000] "${method} ${route} HTTP/1.1" ${status} 892 ${latency}ms`);
    }
  }
  return lines.join("\n");
}

function syntheticCsvTableFixture() {
  const rows = ["id,status,duration_ms,action"];
  for (let index = 1; index <= 10; index += 1) {
    const status = index <= 8 ? "success" : index === 9 ? "error" : "timeout";
    const duration = index === 10 ? 34000 : index * 10;
    rows.push(`${index},${status},${duration},view`);
  }
  return rows.join("\n");
}

function syntheticJsonTableFixture() {
  return JSON.stringify([
    { id: 1, role: "admin", score: 10 },
    { id: 2, role: "user", score: 30 },
    { id: 3, role: "user", score: 20 },
  ]);
}

function syntheticBuildFixture() {
  return [
    "  ▲ Next.js 15.1.0",
    "   Creating an optimized production build ...",
    "  ✓ Compiled src/components/DataGrid.tsx (234ms)",
    "  ⚠ Warning: src/components/DataGrid.tsx - React Hook useEffect has missing dependencies: 'sortOrder' and 'filters'",
    "  ERROR in src/api/trpc/routers/user.ts(45,12): TS2345: Argument of type 'string' is not assignable to parameter of type 'UserRole'.",
    "  ERROR in src/middleware.ts(23,8): TS2345: Argument of type '{ callbackUrl: string; }' is not assignable to parameter of type 'URLSearchParams'.",
    "  ⚠ Warning: src/middleware.ts - Middleware should not redirect to external URLs",
    "  ERROR in src/components/DataGrid.tsx(89,23): TS18047: 'data' is possibly 'null'.",
    "  Build completed with 3 errors and 12 warnings.",
  ].join("\n");
}

function syntheticDiagnosticsFixture() {
  const files = [
    ["src/components/UserList.tsx", 7],
    ["src/components/Dashboard.tsx", 7],
    ["src/api/trpc/routers/user.ts", 7],
    ["src/lib/auth.ts", 7],
    ["src/utils/helpers.ts", 7],
    ["src/lib/database.ts", 7],
    ["src/config/config.ts", 4],
    ["src/types/types.ts", 4],
  ];
  const codes = ["TS2345", "TS2339", "TS2532", "TS2322", "TS2769"];
  const lines = [];
  let index = 0;
  for (const [file, count] of files) {
    for (let i = 0; i < count; i += 1) {
      const code = index % 10 === 0 ? "TS2345" : codes[index % codes.length];
      lines.push(`${file}(${10 + i},${5 + i}): error ${code}: Synthetic diagnostic ${index}`);
      index += 1;
    }
  }
  return lines.join("\n");
}

function syntheticLintFixture() {
  return [
    "/repo/src/components/UserList.tsx",
    "  12:7  error  'user' is assigned a value but never used  @typescript-eslint/no-unused-vars",
    "  18:3  warning  Unexpected console statement  no-console",
    "/repo/src/components/DataGrid.tsx",
    "  22:9  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any",
    "",
    "✖ 3 problems (2 errors, 1 warning)",
  ].join("\n");
}

function syntheticTestOutputFixture() {
  return [
    " RUN  v2.1.8 /repo",
    " ✓ src/components/Button.test.tsx (3 tests) 45ms",
    " ✗ src/components/UserList.test.tsx (4 tests) 234ms",
    "   ✓ renders user list 23ms",
    "   ✗ handles empty state 156ms",
    "     → expected: \"No users found\"",
    " ✗ src/components/DataGrid.test.tsx (5 tests) 345ms",
    "   ✓ renders columns 19ms",
    "   ✗ filters with complex queries 198ms",
    "     → TypeError: Cannot read properties of null (reading 'filter')",
    " ✗ src/api/trpc/routers/user.test.ts (5 tests) 456ms",
    "   ✗ updates user role 234ms",
    " ✗ src/lib/email.test.ts (4 tests) 567ms",
    "   ✗ sends password reset email 312ms",
    " Test Files  4 failed | 26 passed (30)",
    " Tests       4 failed | 108 passed (112)",
  ].join("\n");
}

test("test output reducer computes summary counts and failed file facts", () => {
  const reduced = reduceTestOutput(syntheticTestOutputFixture());

  assert.ok(reduced.result);
  assert.equal(reduced.candidate.name, "test-output");
  assert.equal(reduced.candidate.confidence, 1);
  assert.equal(reduced.result.details.kind, "test-output");
  assert.equal(reduced.result.details.tests.failed, 4);
  assert.equal(reduced.result.details.tests.passed, 108);
  assert.equal(reduced.result.details.tests.total, 112);
  assert.equal(reduced.result.details.testFiles.failed, 4);
  assert.equal(reduced.result.details.testFiles.passed, 26);
  assert.deepEqual(reduced.result.details.failedFiles.slice(0, 2), ["src/components/UserList.test.tsx", "src/components/DataGrid.test.tsx"]);
  assert.deepEqual(reduced.result.details.failedTests.slice(0, 2), ["handles empty state", "filters with complex queries"]);
  assert.match(reduced.result.visibleText, /tests: 4 failed, 108 passed, \(112\)/);
  assert.match(reduced.result.visibleText, /UserList\.test\.tsx/);
  assert.match(reduced.result.visibleText, /DataGrid\.test\.tsx/);
});

test("processing reducer registry selects test output before other reducers", () => {
  const selected = selectProcessingReducer({ text: syntheticTestOutputFixture() });

  assert.equal(selected.status, "selected");
  assert.equal(selected.selected.name, "test-output");
  assert.deepEqual(selected.candidates.map((candidate) => candidate.name), ["test-output", "build-output", "diagnostics", "table", "access-log"]);
});

test("table reducer computes CSV row counts, grouped status counts, and numeric max", () => {
  const reduced = reduceTableOutput(syntheticCsvTableFixture());

  assert.ok(reduced.result);
  assert.equal(reduced.candidate.name, "table");
  assert.equal(reduced.candidate.confidence, 1);
  assert.equal(reduced.result.details.kind, "table");
  assert.equal(reduced.result.details.format, "csv");
  assert.equal(reduced.result.details.rowCount, 10);
  assert.deepEqual(reduced.result.details.categorical[0].counts, [
    { value: "success", count: 8 },
    { value: "error", count: 1 },
    { value: "timeout", count: 1 },
  ]);
  assert.equal(reduced.result.details.numeric[0].column, "duration_ms");
  assert.equal(reduced.result.details.numeric[0].max, 34000);
  assert.match(reduced.result.visibleText, /rows: 10/);
  assert.match(reduced.result.visibleText, /success:8/);
  assert.match(reduced.result.visibleText, /timeout:1/);
  assert.match(reduced.result.visibleText, /duration_ms\.max: 34000/);
});

test("table reducer handles JSON arrays of records", () => {
  const reduced = reduceTableOutput(syntheticJsonTableFixture());

  assert.ok(reduced.result);
  assert.equal(reduced.result.details.format, "json");
  assert.equal(reduced.result.details.rowCount, 3);
  assert.equal(reduced.result.details.categorical[0].column, "role");
  assert.match(reduced.result.visibleText, /rows: 3/);
  assert.match(reduced.result.visibleText, /role: user:2, admin:1/);
});

test("build output reducer computes build errors, warnings, and files", () => {
  const reduced = reduceBuildOutput(syntheticBuildFixture());

  assert.ok(reduced.result);
  assert.equal(reduced.candidate.name, "build-output");
  assert.equal(reduced.candidate.confidence, 1);
  assert.equal(reduced.result.details.kind, "build-output");
  assert.equal(reduced.result.details.errorCount, 3);
  assert.equal(reduced.result.details.warningCount, 12);
  assert.deepEqual(reduced.result.details.errorFiles, ["src/api/trpc/routers/user.ts", "src/middleware.ts", "src/components/DataGrid.tsx"]);
  assert.deepEqual(reduced.result.details.warningFiles, ["src/components/DataGrid.tsx", "src/middleware.ts"]);
  assert.match(reduced.result.visibleText, /build: 3 errors, 12 warnings/);
  assert.match(reduced.result.visibleText, /DataGrid\.tsx/);
  assert.match(reduced.result.visibleText, /middleware\.ts/);
});

test("diagnostics reducer computes TypeScript diagnostic counts, files, and codes", () => {
  const reduced = reduceDiagnosticsOutput(syntheticDiagnosticsFixture());

  assert.ok(reduced.result);
  assert.equal(reduced.candidate.name, "diagnostics");
  assert.equal(reduced.candidate.confidence, 1);
  assert.equal(reduced.result.details.kind, "diagnostics");
  assert.equal(reduced.result.details.total, 50);
  assert.equal(reduced.result.details.fileCount, 8);
  assert.equal(reduced.result.details.errorCount, 50);
  assert.equal(reduced.result.details.topFiles[0].file, "src/api/trpc/routers/user.ts");
  assert.ok(reduced.result.details.topFiles.some((entry) => entry.file === "src/components/UserList.tsx"));
  assert.ok(reduced.result.details.topCodes.some((entry) => entry.code === "TS2345"));
  assert.match(reduced.result.visibleText, /diagnostics: 50/);
  assert.match(reduced.result.visibleText, /files: 8/);
  assert.match(reduced.result.visibleText, /UserList\.tsx/);
  assert.match(reduced.result.visibleText, /TS2345/);
});

test("diagnostics reducer handles lint stylish output", () => {
  const reduced = reduceDiagnosticsOutput(syntheticLintFixture());

  assert.ok(reduced.result);
  assert.equal(reduced.result.details.total, 3);
  assert.equal(reduced.result.details.errorCount, 2);
  assert.equal(reduced.result.details.warningCount, 1);
  assert.equal(reduced.result.details.fileCount, 2);
  assert.ok(reduced.result.details.topCodes.some((entry) => entry.code === "@typescript-eslint/no-unused-vars"));
  assert.match(reduced.result.visibleText, /warnings: 1/);
  assert.match(reduced.result.visibleText, /no-unused-vars/);
});

test("access log reducer computes request, status, error, latency, and slow request facts", () => {
  const reduced = reduceAccessLog(syntheticAccessLogFixture());

  assert.ok(reduced.result);
  assert.equal(reduced.candidate.name, "access-log");
  assert.equal(reduced.candidate.confidence, 1);
  assert.equal(reduced.result.details.requestCount, 500);
  assert.equal(reduced.result.details.statusCounts["200"], 361);
  assert.equal(reduced.result.details.statusCounts["500"], 13);
  assert.equal(reduced.result.details.errorCount, 88);
  assert.equal(reduced.result.details.errorRatePercent, 17.6);
  assert.equal(reduced.result.details.slowRequestCount, 25);
  assert.equal(reduced.result.details.averageLatencyMs, 300);
  assert.match(reduced.result.visibleText, /requests: 500/);
  assert.match(reduced.result.visibleText, /errors: 88 \(17\.6%\)/);
  assert.match(reduced.result.visibleText, /status: 200:361/);
  assert.match(reduced.result.visibleText, /slow>=1000ms: 25/);
});

test("processing reducer registry does not select low-confidence prose", () => {
  const selected = selectProcessingReducer({ text: "hello\nnot an access log\n" });

  assert.equal(selected.status, "not_selected");
  assert.deepEqual(selected.candidates.map((candidate) => candidate.name), ["test-output", "build-output", "diagnostics", "table", "access-log"]);
  assert.ok(selected.candidates.every((candidate) => candidate.confidence < 0.8));
});

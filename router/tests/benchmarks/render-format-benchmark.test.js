import assert from "node:assert/strict";
import test from "node:test";

import {
  compactBatchToolText,
  compactTransformToolText,
  compactSearchEvidenceToolText,
  compactRunToolText,
} from "../../../pi-extension/dist/utils.js";

const MAX_SELECTED_BYTES = 10_600;
const MIN_BYTES_SAVED_PERCENT = 15;

function makeRunSample(id, summary, excerpt, facts, counts = {}) {
  return {
    tool: "run",
    id,
    facts,
    render: compactRunToolText,
    result: {
      toolStatus: "ok",
      execution: { status: "success", exitCode: 0 },
      routing: { status: "routed" },
      parser: { name: id, counts },
      outputId: `ffout_${id}`,
      persistence: { recoverability: "exact" },
      summary,
      importantLines: [{ stream: "stdout", lines: "1-4", excerpt }],
      recovery: { outputId: `ffout_${id}` },
    },
  };
}

function makeSearchSample(id, path, query, excerpt, facts) {
  return {
    tool: "search",
    id,
    facts,
    render: compactSearchEvidenceToolText,
    result: {
      toolStatus: "ok",
      routing: { status: "routed", reason: `Deterministic repo retrieval selected ${path} for ${query}.` },
      source: { kind: "repo", path },
      evidence: [
        {
          source: { kind: "repo", path },
          path,
          lines: "10-18",
          excerpt,
          match: { type: "query", confidence: 0.98 },
        },
      ],
      recovery: { how: `freeflow_search action=retrieve source.kind=repo path=${path} lineRange=10-18` },
    },
  };
}

function makeSamples() {
  const samples = [
    makeRunSample(
      "vitest",
      "Test summary: 4 failed, 108 passed. Failing files include UserList.test.tsx and DataGrid.test.tsx.",
      "FAIL UserList.test.tsx > renders empty state\nFAIL DataGrid.test.tsx > sorts rows\ntests: 4 failed, 108 passed, 112 total",
      ["4 failed", "108 passed", "UserList.test.tsx", "DataGrid.test.tsx"],
      { testsFailed: 4, testsPassed: 108, testsTotal: 112 },
    ),
    makeRunSample(
      "tsc",
      "TypeScript diagnostics: TS2322 and TS2345 in src/api/trpc/routers/user.ts around line 50.",
      "src/api/trpc/routers/user.ts(50,12): error TS2322: Type 'string' is not assignable\nsrc/api/trpc/routers/user.ts(51,20): error TS2345: Argument invalid",
      ["TS2322", "TS2345", "src/api/trpc/routers/user.ts", "50"],
      { errors: 2 },
    ),
    makeRunSample(
      "build",
      "Build summary: 3 errors and 12 warnings. Hot files: user.ts and middleware.ts.",
      "ERROR user.ts failed to compile\nERROR middleware.ts failed route generation\n3 errors, 12 warnings",
      ["3 errors", "12 warnings", "user.ts", "middleware.ts"],
      { errors: 3, warnings: 12 },
    ),
    makeRunSample(
      "access",
      "Access log summary: 500 responses occurred 88 times, 17.6% error share, max latency 1257ms.",
      "status=500 count=88 percentage=17.6 maxLatency=1257ms\n/status/api/users returned slow errors",
      ["500", "88", "17.6", "1257ms"],
    ),
    makeRunSample(
      "analytics",
      "CSV summary: status 500 rows present; success:400, timeout:50, total duration 34000.",
      "status,count\nsuccess:400\ntimeout:50\n500 duration=34000",
      ["500", "success:400", "timeout:50", "34000"],
    ),
    makeRunSample(
      "issues",
      "GitHub issues summary: 20 issues for facebook/react include Status: Unconfirmed and Type: Bug.",
      "repository=facebook/react\ntotal=20\nlabel=Status: Unconfirmed\nlabel=Type: Bug",
      ["20", "facebook/react", "Status: Unconfirmed", "Type: Bug"],
    ),
    makeRunSample(
      "mcp",
      "MCP tool summary: 40 tools including search_codebase, git, and typecheck.",
      "tools=40\nsearch_codebase available\ngit available\ntypecheck available",
      ["40", "search_codebase", "git", "typecheck"],
    ),
    makeRunSample(
      "browser",
      "Browser snapshot summary: 1044 nodes, 219 links, page title Hacker News, Stories list visible.",
      "nodes=1044\nlinks=219\ntitle=Hacker News\nregion=Stories",
      ["1044", "219", "Hacker News", "Stories"],
    ),
    makeRunSample(
      "git",
      "Git log summary: 153 commits with feat, fix, and docs changes.",
      "commits=153\nfeat: add workflow\nfix: route output\ndocs: update guide",
      ["153", "feat", "fix", "docs"],
    ),
    makeSearchSample(
      "react",
      "fixtures/context7-react-docs.md",
      "useEffect cleanup ignore stale responses",
      "useEffect(() => {\n  let ignore = false;\n  fetchBio(person).then(result => { if (!ignore) setBio(result); });\n  return () => { ignore = true; };\n}, [person]);\ncleanup prevents stale responses",
      ["ignore = true", "cleanup", "useEffect"],
    ),
    makeSearchSample(
      "next",
      "fixtures/context7-nextjs-docs.md",
      "cache revalidate no-store generateStaticParams",
      "export const revalidate = 60;\nexport async function generateStaticParams() {\n  await fetch('/posts', { cache: 'no-store' });\n}\ncache controls stay explicit",
      ["no-store", "revalidate", "generateStaticParams"],
    ),
    makeSearchSample(
      "tailwind",
      "fixtures/context7-tailwind-docs.md",
      "responsive md lg flex grid classes",
      "<div class=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4\">\n  responsive cards\n</div>",
      ["md:", "lg:", "grid"],
    ),
    {
      tool: "transform",
      id: "count-failed",
      facts: ["matches", "failed"],
      render: compactTransformToolText,
      result: {
        toolStatus: "ok",
        routing: { status: "routed" },
        operation: { kind: "countMatches", pattern: "failed" },
        source: { kind: "vault", outputId: "ffout_vitest", stream: "stdout" },
        outputId: "ffout_derive_count_failed",
        summary: "Derived countMatches from vaulted stdout output: 4 matches for failed.",
        evidence: [
          {
            source: { kind: "vault", outputId: "ffout_derive_count_failed", stream: "raw" },
            lines: "1-6",
            excerpt: "# freeflow_search action=transform countMatches\npattern: /failed/\nmatches: 4\nline 1: 4 failed",
          },
        ],
        recovery: { outputId: "ffout_derive_count_failed" },
      },
    },
    {
      tool: "batch",
      id: "multi-query",
      facts: ["4 failed", "88", "ignore = true"],
      render: compactBatchToolText,
      result: {
        toolStatus: "ok",
        routing: { status: "routed" },
        stepCount: 3,
        okCount: 3,
        failedCount: 0,
        concurrency: 3,
        summary: "Batch completed 3/3 step(s) successfully. query answers mention 4 failed, 88 HTTP 500 rows, and ignore = true cleanup.",
        queries: [
          {
            status: "answered",
            query: "failed test files and counts",
            summary: "4 failed tests in UserList.test.tsx and DataGrid.test.tsx.",
          },
          {
            status: "answered",
            query: "HTTP error count status distribution slow requests",
            summary: "500 responses occurred 88 times with max latency 1257ms.",
          },
          {
            status: "answered",
            query: "useEffect cleanup ignore stale responses",
            summary: "React cleanup returns ignore = true to prevent stale responses.",
          },
        ],
        steps: [
          { index: 0, id: "test-summary", kind: "run", status: "ok", durationMs: 12, result: { routing: { status: "routed" }, outputId: "ffout_batch_test", importantLines: [{ excerpt: "4 failed", lines: "1-1" }], execution: { status: "success" }, summary: "Command success with exitCode=0." } },
          { index: 1, id: "access-summary", kind: "run", status: "ok", durationMs: 13, result: { routing: { status: "routed" }, outputId: "ffout_batch_access", importantLines: [{ excerpt: "88", lines: "1-1" }], execution: { status: "success" }, summary: "Command success with exitCode=0." } },
          { index: 2, id: "react-query", kind: "search", status: "ok", durationMs: 8, result: { routing: { status: "routed" }, recovery: { outputId: "ffout_batch_react" }, evidence: [{ excerpt: "ignore = true", lines: "1-1" }], summary: "Retrieved 1 evidence packet." } },
        ],
      },
    },
  ];

  assert.equal(samples.length, 14);
  return samples;
}

function renderProseBaseline(sample) {
  const result = sample.result;
  if (sample.tool === "run") {
    const span = result.importantLines[0];
    return [
      `freeflow_run ${result.execution.status} · exit=${result.execution.exitCode} · routing=${result.routing.status} · parser=${result.parser.name} · raw=${result.outputId}`,
      `summary: ${result.summary}`,
      `evidence ${span.stream}:${span.lines}:`,
      ...splitLines(span.excerpt).map((line) => `  ${line}`),
      `recover exact span: freeflow_search action=retrieve source.kind=vault lineRange=${span.lines} stream=${span.stream} outputId=${result.outputId}`,
      "details: full structured result is available in details.result / TUI",
    ].join("\n");
  }
  if (sample.tool === "search") {
    const packet = result.evidence[0];
    return [
      `freeflow_search ${result.routing.status} · repo ${packet.path} · 1 evidence`,
      `reason: ${result.routing.reason}`,
      `evidence #1 ${packet.path}:${packet.lines}:`,
      ...splitLines(packet.excerpt).map((line) => `  ${line}`),
      `recover exact span: freeflow_search action=retrieve source.kind=repo lineRange=${packet.lines} path=${packet.path}`,
      "details: full structured result is available in details.result / TUI",
    ].join("\n");
  }
  if (sample.tool === "transform") {
    const packet = result.evidence[0];
    return [
      `freeflow_search action=transform ${result.routing.status} · ${result.operation.kind} · vault ${result.source.outputId}:${result.source.stream} · output=${result.outputId}`,
      `summary: ${result.summary}`,
      `evidence #1 ${packet.source.outputId}:${packet.source.stream}:${packet.lines}:`,
      ...splitLines(packet.excerpt).map((line) => `  ${line}`),
      `recover exact span: freeflow_search action=retrieve source.kind=vault lineRange=${packet.lines} stream=${packet.source.stream} outputId=${packet.source.outputId}`,
      "details: full structured result is available in details.result / TUI",
    ].join("\n");
  }

  return [
    `freeflow_batch ${result.routing.status} · steps=${result.stepCount} · ok=${result.okCount} · failed=${result.failedCount} · concurrency=${result.concurrency}`,
    `summary: ${result.summary}`,
    ...result.queries.map((answer) => `answer: ${answer.status} ${answer.query}: ${answer.summary}`),
    ...result.steps.map((step) => `#${step.index + 1} · ${step.id} · ${step.kind} · ${step.status} · routing=${step.result.routing.status} · output=${step.result.outputId ?? step.result.recovery?.outputId} — ${step.result.summary}`),
    "details: full child results and query matches are available in details.result / TUI",
  ].join("\n");
}

function summarizeRows(rows) {
  const total = rows.reduce(
    (sum, row) => ({
      baselineBytes: sum.baselineBytes + row.baselineBytes,
      selectedBytes: sum.selectedBytes + row.selectedBytes,
      baselineFacts: sum.baselineFacts + row.baselineFacts,
      selectedFacts: sum.selectedFacts + row.selectedFacts,
      totalFacts: sum.totalFacts + row.totalFacts,
      validSamples: sum.validSamples + (row.validVsBaseline ? 1 : 0),
    }),
    { baselineBytes: 0, selectedBytes: 0, baselineFacts: 0, selectedFacts: 0, totalFacts: 0, validSamples: 0 },
  );
  return {
    ...total,
    samples: rows.length,
    bytesSavedPercent: Number((((total.baselineBytes - total.selectedBytes) / total.baselineBytes) * 100).toFixed(2)),
  };
}

function countFacts(text, facts) {
  const lower = String(text).toLowerCase();
  return facts.filter((fact) => lower.includes(String(fact).toLowerCase())).length;
}

function bytes(text) {
  return Buffer.byteLength(text, "utf8");
}

function splitLines(text) {
  return String(text).split(/\r?\n/);
}

test("render-format row protocol preserves visible facts while reducing model-visible bytes", () => {
  const rows = makeSamples().map((sample) => {
    const selected = sample.render(sample.result);
    const baseline = renderProseBaseline(sample);
    const baselineFacts = countFacts(baseline, sample.facts);
    const selectedFacts = countFacts(selected, sample.facts);
    return {
      tool: sample.tool,
      id: sample.id,
      baselineBytes: bytes(baseline),
      selectedBytes: bytes(selected),
      baselineFacts,
      selectedFacts,
      totalFacts: sample.facts.length,
      validVsBaseline: selectedFacts >= baselineFacts,
      selected,
    };
  });

  const summary = summarizeRows(rows);
  assert.equal(summary.samples, 14);
  assert.equal(summary.validSamples, summary.samples);
  assert.ok(summary.selectedFacts >= summary.baselineFacts, JSON.stringify(summary));
  assert.ok(summary.selectedBytes < summary.baselineBytes, JSON.stringify(summary));
  assert.ok(summary.bytesSavedPercent >= MIN_BYTES_SAVED_PERCENT, JSON.stringify(summary));
  assert.ok(summary.selectedBytes <= MAX_SELECTED_BYTES, JSON.stringify(summary));

  for (const row of rows) {
    assert.equal(row.validVsBaseline, true, `${row.tool}/${row.id} lost visible facts`);
    assert.match(row.selected, /\|/u);
    assert.match(row.selected, /details\|details\.result/u);
    if (row.tool !== "batch") {
      assert.match(row.selected, /rec\|/u, `${row.tool}/${row.id} should keep visible recovery`);
    }
  }
});

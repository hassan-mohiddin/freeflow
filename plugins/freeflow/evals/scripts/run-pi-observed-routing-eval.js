#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createVault, readOutputText } from "../../router/dist/index.js";
import freeflowExtension from "../../pi-extension/dist/index.js";

const REPORT_PATH = "plugins/freeflow/evals/reports/runtime/pi-observed-routing-eval-1-report.md";
const DATE = "2026-06-24";

function loadExtension() {
  const handlers = new Map();
  const tools = [];
  const pi = {
    registerTool(tool) {
      tools.push(tool);
    },
    registerCommand() {},
    on(event, handler) {
      handlers.set(event, handler);
    },
    appendEntry() {},
    sendUserMessage() {},
  };

  freeflowExtension(pi);
  return { handlers, tools };
}

function context(cwd, sessionId) {
  return {
    cwd,
    sessionManager: {
      getSessionId() {
        return sessionId;
      },
      getEntries() {
        return [];
      },
    },
    ui: {
      setStatus() {},
      notify() {},
    },
  };
}

function bytes(value) {
  return Buffer.byteLength(String(value), "utf8");
}

function lineCount(value) {
  const text = String(value ?? "");
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function evidencePacketCount(text) {
  return (String(text).match(/^Evidence \d+/gm) ?? []).length;
}

function passMark(value) {
  return value ? "pass" : "fail";
}

function reductionPercent(rawBytes, routedBytes) {
  if (!Number.isFinite(rawBytes) || rawBytes <= 0) {
    return "n/a";
  }
  return `${((1 - routedBytes / rawBytes) * 100).toFixed(1)}%`;
}

function stableJson(value) {
  return JSON.stringify(value, sortJsonKeys, 2);
}

function sortJsonKeys(_key, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.keys(value).sort().reduce((sorted, key) => {
    sorted[key] = value[key];
    return sorted;
  }, {});
}

function normalizeFixtureRaw(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Array.isArray(value.content)) {
      return value.content.map((block) => {
        if (typeof block === "string") return block;
        if (!block || typeof block !== "object") return String(block);
        if (typeof block.text === "string") return block.text;
        if (block.json !== undefined) return stableJson(block.json);
        return stableJson(block);
      }).join("\n");
    }
    if (typeof value.text === "string") {
      return value.text;
    }
  }
  return stableJson(value);
}

function countFixtureItems(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value.items)) return value.items.length;
  if (Array.isArray(value.results)) return value.results.length;
  if (Array.isArray(value.messages)) return value.messages.length;
  if (Array.isArray(value.content)) {
    return value.content.reduce((total, block) => total + countFixtureItems(block?.json ?? block), 0);
  }
  if (value.data && typeof value.data === "object") return countFixtureItems(value.data);
  return 1;
}

async function writeObservedConfig(cwd, vaultRoot, observedRouting) {
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await writeFile(
    join(cwd, ".freeflow/config.json"),
    JSON.stringify(
      {
        defaultMode: "workflow",
        outputRouter: {
          largeOutputLines: 4,
          largeOutputBytes: 520,
          vaultRoot,
        },
        observedRouting,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function mcpEvent(server, tool, rawResult, details = {}) {
  return {
    type: "tool_result",
    toolName: "mcp",
    toolCallId: `${server}-${tool}`,
    input: { server, tool },
    content: [{ type: "text", text: normalizeFixtureRaw(rawResult) }],
    details: { ...details, result: rawResult },
    isError: false,
  };
}

function builtInEvent(toolName, rawResult) {
  return {
    type: "tool_result",
    toolName,
    toolCallId: `${toolName}-fixture`,
    input: {},
    content: [{ type: "text", text: normalizeFixtureRaw(rawResult) }],
    details: { result: rawResult },
    isError: false,
  };
}

async function runObservedFixture({ tmpRoot, id, config, event, criticalFacts, shouldReduce = true, recoverability = "exact", metadataOnly = false }) {
  const cwd = join(tmpRoot, id);
  const vaultRoot = join(cwd, "vault");
  const sessionId = `${id}-session`;
  await mkdir(cwd, { recursive: true });
  await writeObservedConfig(cwd, vaultRoot, config);

  const { handlers } = loadExtension();
  const result = await handlers.get("tool_result")(event, context(cwd, sessionId));
  assert.ok(result, `${id} did not route`);

  const rawText = normalizeFixtureRaw(event.details.result);
  const routedText = result.content[0].text;
  const observed = result.details.freeflowObservedRouting;
  const vault = createVault({ root: vaultRoot });

  let recoveredText = null;
  let recoveryError = null;
  if (observed?.outputId) {
    try {
      recoveredText = await readOutputText(vault, sessionId, observed.outputId, "raw");
    } catch (error) {
      recoveryError = error instanceof Error ? error.message : String(error);
    }
  }

  const gates = {
    routedByPiHook: Boolean(observed && observed.route === "observed" && /Freeflow routed this observed/.test(routedText)),
    boundedOutput: shouldReduce ? bytes(routedText) < bytes(rawText) : bytes(routedText) > 0,
    criticalFactsPreserved: criticalFacts.every((pattern) => pattern.test(routedText)),
    recoverabilityAccurate: metadataOnly
      ? observed.persistence.recoverability === "metadata_only" && /No raw content stream is recoverable/.test(observed.recovery.how) && /metadata only/i.test(recoveryError ?? "")
      : observed.persistence.recoverability === recoverability && recoveredText === rawText,
  };

  return {
    id,
    producer: [observed.producer.kind, observed.producer.server, observed.producer.tool].filter(Boolean).join(":"),
    raw: {
      bytes: bytes(rawText),
      lines: lineCount(rawText),
      items: countFixtureItems(event.details.result),
    },
    routed: {
      bytes: bytes(routedText),
      lines: lineCount(routedText),
      evidencePackets: evidencePacketCount(routedText),
      recoverability: observed.persistence.recoverability,
    },
    gates,
  };
}

async function runStatusFixture(tmpRoot) {
  const cwd = join(tmpRoot, "pi-capability-status");
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await writeFile(
    join(cwd, ".freeflow/config.json"),
    JSON.stringify(
      {
        defaultMode: "workflow",
        observedRouting: {
          enabled: true,
          mcp: { servers: { github: { enabled: true, persistence: "exact" } } },
          web: { enabled: true, persistence: "exact" },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const { tools } = loadExtension();
  const statusTool = tools.find((tool) => tool.name === "freeflow_status");
  assert.ok(statusTool);
  const result = await statusTool.execute("pi-observed-status", { action: "status" }, undefined, undefined, context(cwd, "status-session"));
  const report = JSON.parse(result.content[0].text);
  const gates = {
    hostCapabilityReported: report.observedRouting.host.name === "pi" && report.observedRouting.host.outputReplacement === "available",
    persistenceModesReported: ["exact", "metadata-only", "none"].every((mode) => report.observedRouting.persistenceModes.includes(mode)),
    unsupportedRedactedReported: report.observedRouting.unsupportedPersistenceModes.includes("redacted"),
    configuredProducerReported: report.observedRouting.mcp.servers.some((server) => server.id === "github" && server.persistence === "exact") && report.observedRouting.web.enabled === true,
  };

  return {
    id: "pi-capability-status",
    producer: "status",
    raw: { bytes: 0, lines: 0, items: 0 },
    routed: { bytes: bytes(result.content[0].text), lines: lineCount(result.content[0].text), evidencePackets: 0, recoverability: "n/a" },
    gates,
  };
}

function assertAllPassed(results) {
  for (const result of results) {
    for (const [name, passed] of Object.entries(result.gates)) {
      assert.equal(passed, true, `${result.id} gate failed: ${name}`);
    }
  }
}

function renderReport(results) {
  const totalGates = results.reduce((count, result) => count + Object.keys(result.gates).length, 0);
  const passedGates = results.reduce((count, result) => count + Object.values(result.gates).filter(Boolean).length, 0);
  const reductionRows = results.filter((result) => result.raw.bytes > 0);
  const totalRawBytes = reductionRows.reduce((total, result) => total + result.raw.bytes, 0);
  const totalRoutedBytes = reductionRows.reduce((total, result) => total + result.routed.bytes, 0);
  const rows = results.map((result) => {
    const gates = Object.entries(result.gates).map(([name, passed]) => `${name} ${passed ? "✓" : "✗"}`).join("; ");
    return `| ${result.id} | ${result.producer} | ${result.raw.bytes} / ${result.raw.lines} / ${result.raw.items} | ${result.routed.bytes} / ${result.routed.lines} / ${result.routed.evidencePackets} | ${reductionPercent(result.raw.bytes, result.routed.bytes)} | ${result.routed.recoverability} | ${passMark(Object.values(result.gates).every(Boolean))} | ${gates} |`;
  }).join("\n");

  return `# Pi Observed Routing Eval - Iteration 1

Date: ${DATE}

## Scope

Targeted deterministic eval for the Pi-only observed output routing slice. It exercises Pi's \`tool_result\` path for configured MCP, web, fetch, and code-search producers after direct host execution.

This eval compares raw direct tool-output fixtures against the routed result returned to the agent. It verifies bounded output, exact critical fact preservation, persistence/recovery claims, metadata-only no-raw-recovery behavior, mutating MCP routing as metadata (not a gate), and Pi status capability reporting.

It does not claim Context Mode or cross-host superiority. Claude and Codex observed-routing adapters remain out of scope.

## Command

\`\`\`sh
npm run build && node plugins/freeflow/evals/scripts/run-pi-observed-routing-eval.js
\`\`\`

## Summary

- Fixtures: ${results.length}
- Objective gates passed: ${passedGates}/${totalGates}
- Host: Pi only.
- Direct execution/permissions: owned by Pi; Freeflow routes only completed tool output.
- Persistence modes covered: exact and metadata-only.
- Overall byte reduction, excluding status-only fixtures: ${reductionPercent(totalRawBytes, totalRoutedBytes)}.

## Results

Raw and routed columns are \`bytes / lines / items-or-evidence-packets\`. Reduction is calculated from raw bytes to routed-result bytes.

| fixture | producer | raw direct output | routed output | byte reduction | recoverability | status | gates |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
${rows}

## Result

All targeted Pi observed-routing gates passed for these deterministic fixtures. Pi observed routing materially reduced large/noisy fixture output while preserving critical facts and truthful recovery behavior.
`;
}

async function main() {
  const tmpRoot = await mkdtemp(join(tmpdir(), "freeflow-pi-observed-eval-"));
  try {
    const commonObserved = {
      enabled: true,
      mcp: {
        servers: {
          github: { enabled: true, persistence: "exact" },
          gmail: { enabled: true, persistence: "metadata-only" },
        },
      },
      web: { enabled: true, persistence: "exact" },
      fetch: { enabled: true, persistence: "exact" },
      codeSearch: { enabled: true, persistence: "exact" },
    };

    const githubSearch = {
      content: [
        {
          type: "json",
          json: {
            items: [
              { id: 101, number: 1, title: "Observed routing bug", state: "open", html_url: "https://github.com/acme/freeflow/issues/101", body: "diagnostic noise ".repeat(120) },
              { id: 102, number: 2, title: "Vault recovery docs", state: "closed", html_url: "https://github.com/acme/freeflow/issues/102", body: "release chatter ".repeat(120) },
              { id: 103, number: 3, title: "Reducer fixture", state: "open", html_url: "https://github.com/acme/freeflow/issues/103", body: "triage details ".repeat(120) },
              { id: 104, number: 4, title: "Large output follow-up", state: "open", html_url: "https://github.com/acme/freeflow/issues/104", body: "followup details ".repeat(120) },
            ],
          },
        },
      ],
    };

    const githubCreate = {
      content: [
        {
          type: "json",
          json: {
            id: 2201,
            number: 22,
            title: "Created by observed routing eval",
            state: "open",
            html_url: "https://github.com/acme/freeflow/issues/22",
            body: "created issue response noise ".repeat(80),
          },
        },
      ],
    };

    const gmailSearch = {
      content: [
        {
          type: "text",
          text: [
            "Subject: Customer secret renewal",
            "From: private@example.test",
            "Snippet: token should not be vaulted",
            "noise ".repeat(2000),
          ].join("\n"),
        },
      ],
    };

    const webSearch = {
      query: "Freeflow observed routing",
      results: [
        { title: "Observed Routing Design", url: "https://example.test/freeflow/observed", snippet: "Routes completed tool output after host execution.", citation: "[1]" },
        { title: "Vault Recovery", url: "https://example.test/freeflow/vault", snippet: "Exact recovery uses outputId and raw streams.", citation: "[2]" },
        { title: "Reducer Registry", url: "https://example.test/freeflow/reducers", snippet: "Producer reducers keep critical URLs and snippets.", citation: "[3]" },
        { title: "Long Result", url: "https://example.test/freeflow/noise", snippet: "noise ".repeat(160), citation: "[4]" },
      ],
    };

    const fetchResult = {
      url: "https://docs.example.test/freeflow/observed-routing",
      title: "Observed Routing Docs",
      contentType: "text/markdown",
      content: [
        "# Observed Routing Docs",
        "Intro noise ".repeat(80),
        "## Configure",
        "```json",
        "{ \"observedRouting\": { \"enabled\": true } }",
        "```",
        "## Recover",
        "```sh",
        "freeflow_retrieve source.kind=vault outputId=ffout_example stream=raw",
        "```",
        "tail noise ".repeat(120),
      ].join("\n"),
    };

    const codeSearch = {
      query: "routeObservedToolOutput",
      results: [
        { repo: "acme/freeflow", path: "plugins/freeflow/router/src/observed-routing.ts", line: 41, symbol: "routeObservedToolOutput", snippet: "export async function routeObservedToolOutput(options) {" },
        { repo: "acme/freeflow", path: "plugins/freeflow/pi-extension/src/observed-tool-routing.ts", line: 6, symbol: "handleObservedToolRouting", snippet: "export async function handleObservedToolRouting(event, ctx) {" },
        { repo: "acme/freeflow", path: "generated/noise.ts", line: 999, symbol: "decoy", snippet: "generated noise ".repeat(500) },
      ],
    };

    const results = [];
    results.push(await runObservedFixture({
      tmpRoot,
      id: "mcp-github-search-exact",
      config: commonObserved,
      event: mcpEvent("github", "search_issues", githubSearch),
      criticalFacts: [/Observed routing bug/, /https:\/\/github\.com\/acme\/freeflow\/issues\/101/, /Vault recovery docs/],
    }));
    results.push(await runObservedFixture({
      tmpRoot,
      id: "mcp-github-create-mutating",
      config: commonObserved,
      event: mcpEvent("github", "create_issue", githubCreate, { mcp: { annotations: { destructiveHint: true } } }),
      criticalFacts: [/Created by observed routing eval/, /https:\/\/github\.com\/acme\/freeflow\/issues\/22/],
    }));
    results.push(await runObservedFixture({
      tmpRoot,
      id: "mcp-gmail-search-metadata-only",
      config: commonObserved,
      event: mcpEvent("gmail", "search", gmailSearch),
      criticalFacts: [/Customer secret renewal/, /metadata_only|metadata-only/i],
      metadataOnly: true,
    }));
    results.push(await runObservedFixture({
      tmpRoot,
      id: "pi-web-search-exact",
      config: commonObserved,
      event: builtInEvent("web_search", webSearch),
      criticalFacts: [/Observed Routing Design/, /https:\/\/example\.test\/freeflow\/observed/, /\[1\]/],
    }));
    results.push(await runObservedFixture({
      tmpRoot,
      id: "pi-fetch-content-exact",
      config: commonObserved,
      event: builtInEvent("fetch_content", fetchResult),
      criticalFacts: [/Observed Routing Docs/, /## Configure/, /freeflow_retrieve source\.kind=vault/],
    }));
    results.push(await runObservedFixture({
      tmpRoot,
      id: "pi-code-search-exact",
      config: commonObserved,
      event: builtInEvent("code_search", codeSearch),
      criticalFacts: [/plugins\/freeflow\/router\/src\/observed-routing\.ts/, /"line": 41/, /routeObservedToolOutput/],
    }));
    results.push(await runStatusFixture(tmpRoot));

    assertAllPassed(results);
    await mkdir(join("plugins/freeflow/evals/reports/runtime"), { recursive: true });
    await writeFile(REPORT_PATH, renderReport(results), "utf8");
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

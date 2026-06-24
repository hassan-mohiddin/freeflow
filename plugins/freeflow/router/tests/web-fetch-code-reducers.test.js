import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createVault, readOutputText, routeObservedToolOutput } from "../dist/index.js";

async function withVault(name, run) {
  const root = await mkdtemp(join(tmpdir(), name));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function base(producer) {
  return {
    sessionId: `producer-${producer.kind}`,
    host: { name: "pi", toolName: producer.kind === "code_search" ? "code_search" : producer.kind === "fetch" ? "fetch_content" : "web_search" },
    producer,
    persistence: "exact",
  };
}

test("web_search reducer preserves titles, URLs, snippets, and citations", async () => {
  await withVault("freeflow-web-reducer-", async (vaultRoot) => {
    const rawResult = {
      query: "Freeflow observed routing",
      results: [
        { title: "Observed Routing", url: "https://example.test/observed", snippet: "Routes tool output after execution.", citation: "[1]" },
        { title: "Vault Recovery", url: "https://example.test/vault", snippet: "Exact recovery with outputId.", citation: "[2]" },
        { title: "Long Noise", url: "https://example.test/noise", snippet: "x".repeat(500), citation: "[3]" },
      ],
    };

    const result = await routeObservedToolOutput({ ...base({ kind: "web", tool: "web_search" }), rawResult, vaultRoot });

    assert.match(result.summary, /web_search results: 3 item/);
    assert.match(result.evidence[0].excerpt, /Observed Routing/);
    assert.match(result.evidence[0].excerpt, /https:\/\/example\.test\/observed/);
    assert.match(result.evidence[0].excerpt, /Routes tool output after execution/);
    assert.match(result.evidence[0].excerpt, /\[1\]/);
    assert.doesNotMatch(result.evidence[0].excerpt, /xxxxxxxxxxxxxxxx/);

    const vault = createVault({ root: vaultRoot });
    const stored = await readOutputText(vault, "producer-web", result.outputId, "raw");
    assert.match(stored, /Long Noise/);
  });
});

test("fetch reducer preserves headings, code blocks, URL, and title", async () => {
  await withVault("freeflow-fetch-reducer-", async (vaultRoot) => {
    const rawResult = {
      url: "https://docs.example.test/freeflow",
      title: "Freeflow Docs",
      contentType: "text/markdown",
      content: [
        "# Freeflow Docs",
        "Intro paragraph that is less important.",
        "## Install",
        "```bash",
        "npm install @hassangameryt/freeflow",
        "```",
        "## API",
        "```ts",
        "routeObservedToolOutput({ rawResult })",
        "```",
        "noise ".repeat(200),
      ].join("\n"),
    };

    const result = await routeObservedToolOutput({ ...base({ kind: "fetch", tool: "fetch_content" }), rawResult, vaultRoot });

    assert.match(result.summary, /fetch_content fetched content/);
    assert.match(result.evidence[0].excerpt, /https:\/\/docs\.example\.test\/freeflow/);
    assert.match(result.evidence[0].excerpt, /# Freeflow Docs/);
    assert.match(result.evidence[0].excerpt, /## Install/);
    assert.match(result.evidence[0].excerpt, /npm install @hassangameryt\/freeflow/);
    assert.match(result.evidence[0].excerpt, /routeObservedToolOutput/);
    assert.doesNotMatch(result.evidence[0].excerpt, /noise noise noise noise noise/);
  });
});

test("code_search reducer preserves repo, path, line numbers, symbols, and exact snippets", async () => {
  await withVault("freeflow-code-search-reducer-", async (vaultRoot) => {
    const rawResult = {
      query: "routeObservedToolOutput",
      results: [
        { repo: "acme/freeflow", path: "plugins/freeflow/router/src/observed-routing.ts", line: 41, symbol: "routeObservedToolOutput", snippet: "export async function routeObservedToolOutput(options) {" },
        { repo: "acme/freeflow", path: "plugins/freeflow/router/tests/observed-routing.test.js", line: 30, symbol: "test", snippet: "routeObservedToolOutput stores exact observed text" },
        { repo: "acme/freeflow", path: "generated/huge.ts", line: 999, symbol: "decoy", snippet: "x".repeat(500) },
      ],
    };

    const result = await routeObservedToolOutput({ ...base({ kind: "code_search", tool: "code_search" }), rawResult, vaultRoot });

    assert.match(result.summary, /code_search results: 3 item/);
    assert.match(result.evidence[0].excerpt, /plugins\/freeflow\/router\/src\/observed-routing\.ts/);
    assert.match(result.evidence[0].excerpt, /"line": 41/);
    assert.match(result.evidence[0].excerpt, /routeObservedToolOutput/);
    assert.match(result.evidence[0].excerpt, /export async function routeObservedToolOutput/);
    assert.doesNotMatch(result.evidence[0].excerpt, /xxxxxxxxxxxxxxxx/);
  });
});

test("producer reducers fall back safely for unsupported shapes", async () => {
  await withVault("freeflow-web-unsupported-", async (vaultRoot) => {
    const result = await routeObservedToolOutput({
      ...base({ kind: "web", tool: "web_search" }),
      rawResult: "plain unsupported web output still routes",
      vaultRoot,
    });

    assert.equal(result.routing.route, "observed");
    assert.match(result.evidence[0].excerpt, /plain unsupported web output still routes/);
  });
});

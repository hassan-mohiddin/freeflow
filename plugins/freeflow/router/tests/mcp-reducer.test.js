import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createVault,
  normalizeFreeflowConfig,
  readOutputText,
  readVaultRecord,
  routeObservedToolOutput,
} from "../dist/index.js";
import { resolvePiObservedRoutingDecision } from "../../pi-extension/dist/host-producer-identification.js";

async function withVault(name, run) {
  const root = await mkdtemp(join(tmpdir(), name));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const host = { name: "pi", toolName: "mcp" };

function observedConfig() {
  return normalizeFreeflowConfig({
    observedRouting: {
      enabled: true,
      mcp: {
        servers: {
          github: { enabled: true, persistence: "exact" },
          gmail: { enabled: true, persistence: "metadata-only" },
          vercel: { enabled: true, persistence: "exact" },
          context7: { enabled: true, persistence: "exact" },
          disabled: { enabled: false },
        },
      },
    },
  }).config.observedRouting;
}

test("MCP reducer compacts GitHub issue search JSON with exact recovery", async () => {
  await withVault("freeflow-mcp-github-search-", async (vaultRoot) => {
    const rawResult = {
      content: [
        {
          type: "json",
          json: {
            items: [
              { id: 101, number: 1, title: "Alpha bug", state: "open", html_url: "https://github.com/acme/repo/issues/1", body: "x".repeat(200) },
              { id: 102, number: 2, title: "Beta bug", state: "closed", html_url: "https://github.com/acme/repo/issues/2", body: "y".repeat(200) },
              { id: 103, number: 3, title: "Gamma bug", state: "open", html_url: "https://github.com/acme/repo/issues/3", body: "z".repeat(200) },
              { id: 104, number: 4, title: "Delta bug", state: "open", html_url: "https://github.com/acme/repo/issues/4", body: "w".repeat(200) },
            ],
          },
        },
      ],
    };

    const result = await routeObservedToolOutput({
      sessionId: "mcp-search-session",
      host,
      producer: { kind: "mcp", server: "github", tool: "search_issues" },
      rawResult,
      persistence: "exact",
      vaultRoot,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.persistence.recoverability, "exact");
    assert.match(result.summary, /MCP github search_issues/);
    assert.match(result.evidence[0].excerpt, /Alpha bug/);
    assert.match(result.evidence[0].excerpt, /https:\/\/github\.com\/acme\/repo\/issues\/1/);
    assert.match(result.evidence[0].excerpt, /"omittedItems": 1/);
    assert.ok(result.evidence[0].excerpt.length < JSON.stringify(rawResult).length);

    const vault = createVault({ root: vaultRoot });
    const stored = await readOutputText(vault, "mcp-search-session", result.outputId, "raw");
    assert.match(stored, /Alpha bug/);
    assert.match(stored, /Delta bug/);
  });
});

test("MCP reducer routes mutating GitHub response while preserving risk as metadata", async () => {
  await withVault("freeflow-mcp-github-create-", async (vaultRoot) => {
    const result = await routeObservedToolOutput({
      sessionId: "mcp-create-session",
      host,
      producer: { kind: "mcp", server: "github", tool: "create_issue" },
      rawResult: {
        content: [
          {
            type: "json",
            json: {
              id: 2201,
              number: 22,
              title: "Created by fixture",
              state: "open",
              html_url: "https://github.com/acme/repo/issues/22",
            },
          },
        ],
      },
      persistence: "exact",
      risk: { classification: "write", source: "heuristic", reason: "create_issue is write-like." },
      vaultRoot,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.risk.classification, "write");
    assert.equal(result.routing.route, "observed");
    assert.match(result.evidence[0].excerpt, /"id": 2201/);
    assert.match(result.evidence[0].excerpt, /"state": "open"/);
    assert.match(result.evidence[0].excerpt, /https:\/\/github\.com\/acme\/repo\/issues\/22/);
  });
});

test("MCP reducer honors metadata-only persistence for sensitive Gmail output", async () => {
  await withVault("freeflow-mcp-gmail-sensitive-", async (vaultRoot) => {
    const rawResult = {
      content: [
        { type: "text", text: `Subject: Customer secret renewal\nFrom: private@example.test\nSnippet: token should not be vaulted\n${"noise ".repeat(2000)}` },
      ],
    };
    const result = await routeObservedToolOutput({
      sessionId: "mcp-gmail-session",
      host,
      producer: { kind: "mcp", server: "gmail", tool: "search" },
      rawResult,
      persistence: "metadata-only",
      vaultRoot,
    });

    assert.equal(result.persistence.status, "metadata_only");
    assert.equal(result.persistence.recoverability, "metadata_only");
    assert.match(result.summary, /MCP gmail search/);
    assert.match(result.evidence[0].excerpt, /Customer secret renewal/);
    assert.ok(result.evidence[0].excerpt.length < rawResult.content[0].text.length / 10);

    const vault = createVault({ root: vaultRoot });
    const record = await readVaultRecord(vault, "mcp-gmail-session", result.outputId);
    assert.equal(record.kind, "metadata");
    await assert.rejects(() => readOutputText(vault, "mcp-gmail-session", result.outputId, "raw"), /metadata only/i);
  });
});

test("MCP reducer preserves Vercel deployment status fields", async () => {
  await withVault("freeflow-mcp-vercel-", async (vaultRoot) => {
    const result = await routeObservedToolOutput({
      sessionId: "mcp-vercel-session",
      host,
      producer: { kind: "mcp", server: "vercel", tool: "get_deployment" },
      rawResult: {
        content: [
          {
            type: "json",
            json: {
              id: "dpl_123",
              name: "freeflow-web",
              status: "READY",
              url: "https://freeflow-web.vercel.app",
              inspectorUrl: "https://vercel.com/acme/freeflow-web/dpl_123",
              logs: "large noisy log ".repeat(80),
            },
          },
        ],
      },
      persistence: "exact",
      vaultRoot,
    });

    assert.match(result.evidence[0].excerpt, /"id": "dpl_123"/);
    assert.match(result.evidence[0].excerpt, /"status": "READY"/);
    assert.match(result.evidence[0].excerpt, /https:\/\/freeflow-web\.vercel\.app/);
    assert.doesNotMatch(result.evidence[0].excerpt, /large noisy log large noisy log large noisy log/);
  });
});

test("MCP reducer handles Context7/library-doc style text blocks", async () => {
  await withVault("freeflow-mcp-context7-", async (vaultRoot) => {
    const result = await routeObservedToolOutput({
      sessionId: "mcp-context7-session",
      host,
      producer: { kind: "mcp", server: "context7", tool: "get_library_docs" },
      rawResult: {
        content: [
          { type: "text", text: "# React useEffect\n\n```tsx\nuseEffect(() => { console.log('mounted'); }, []);\n```" },
          { type: "text", text: "# React useMemo\n\n```tsx\nconst value = useMemo(() => expensive(), []);\n```" },
        ],
      },
      persistence: "exact",
      vaultRoot,
    });

    assert.match(result.summary, /MCP context7 get_library_docs/);
    assert.match(result.evidence[0].excerpt, /React useEffect/);
    assert.match(result.evidence[0].excerpt, /useEffect\(\(\) =>/);
    assert.match(result.evidence[0].excerpt, /React useMemo/);
  });
});

test("configured disabled MCP server is not routed", () => {
  const decision = resolvePiObservedRoutingDecision(
    { toolName: "mcp", input: { server: "disabled", tool: "search" } },
    observedConfig(),
  );

  assert.equal(decision.route, false);
});

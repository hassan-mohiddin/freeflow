import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFreeflowConfig } from "../dist/index.js";
import {
  classifyObservedProducerRisk,
  resolvePiObservedRoutingDecision,
} from "../../pi-extension/dist/host-producer-identification.js";

function observedConfig(overrides = {}) {
  return normalizeFreeflowConfig({
    observedRouting: {
      enabled: true,
      mcp: {
        servers: {
          github: { enabled: true, persistence: "exact" },
          gmail: { enabled: true, persistence: "metadata-only" },
          disabled: { enabled: false },
        },
      },
      web: { enabled: true, persistence: "exact" },
      fetch: { enabled: true, persistence: "exact" },
      codeSearch: { enabled: true, persistence: "exact" },
      ...overrides,
    },
  }).config.observedRouting;
}

test("Pi observed producer detection routes configured MCP read-like tools", () => {
  const decision = resolvePiObservedRoutingDecision(
    { toolName: "mcp", input: { server: "github", tool: "search_issues" } },
    observedConfig(),
  );

  assert.equal(decision.route, true);
  assert.deepEqual(decision.producer, { kind: "mcp", server: "github", tool: "search_issues" });
  assert.equal(decision.persistence, "exact");
  assert.equal(decision.risk.classification, "read");
  assert.equal(decision.host.name, "pi");
});

test("Pi observed producer detection treats risk as metadata, not a routing gate", () => {
  const decision = resolvePiObservedRoutingDecision(
    { toolName: "mcp", input: { server: "github", tool: "create_issue" } },
    observedConfig(),
  );

  assert.equal(decision.route, true);
  assert.equal(decision.persistence, "exact");
  assert.equal(decision.risk.classification, "write");
  assert.match(decision.risk.reason, /heuristic/i);
});

test("Pi observed producer detection routes unknown configured MCP tools with unknown risk", () => {
  const decision = resolvePiObservedRoutingDecision(
    { toolName: "mcp", input: { server: "github", tool: "blorbulate" } },
    observedConfig(),
  );

  assert.equal(decision.route, true);
  assert.equal(decision.producer.tool, "blorbulate");
  assert.equal(decision.risk.classification, "unknown");
});

test("Pi observed producer detection identifies web, fetch, and code search tools", () => {
  const config = observedConfig();

  assert.deepEqual(resolvePiObservedRoutingDecision({ toolName: "web_search", input: { query: "freeflow" } }, config), {
    route: true,
    host: { name: "pi", toolName: "web_search" },
    producer: { kind: "web", tool: "web_search" },
    persistence: "exact",
    risk: { classification: "read", source: "manifest", reason: "Pi web_search is a read-only evidence producer." },
  });

  assert.equal(resolvePiObservedRoutingDecision({ toolName: "fetch_content", input: { url: "https://example.test" } }, config).producer.kind, "fetch");
  assert.equal(resolvePiObservedRoutingDecision({ toolName: "code_search", input: { query: "api" } }, config).producer.kind, "code_search");
});

test("Pi observed producer detection leaves disabled or ambiguous producers unchanged", () => {
  assert.equal(
    resolvePiObservedRoutingDecision(
      { toolName: "mcp", input: { server: "disabled", tool: "search" } },
      observedConfig(),
    ).route,
    false,
  );
  assert.equal(
    resolvePiObservedRoutingDecision(
      { toolName: "mcp", input: { server: "unknown", tool: "search" } },
      observedConfig(),
    ).route,
    false,
  );
  assert.equal(
    resolvePiObservedRoutingDecision(
      { toolName: "mcp", input: { tool: "search_without_server" } },
      observedConfig(),
    ).route,
    false,
  );
  assert.equal(
    resolvePiObservedRoutingDecision(
      { toolName: "web_search", input: { query: "freeflow" } },
      observedConfig({ enabled: false }),
    ).route,
    false,
  );
});

test("classifyObservedProducerRisk supports deterministic MCP name heuristics", () => {
  assert.equal(classifyObservedProducerRisk({ kind: "mcp", server: "github", tool: "list_issues" }).classification, "read");
  assert.equal(classifyObservedProducerRisk({ kind: "mcp", server: "github", tool: "delete_issue" }).classification, "write");
  assert.equal(classifyObservedProducerRisk({ kind: "mcp", server: "github", tool: "frobnicate" }).classification, "unknown");
});

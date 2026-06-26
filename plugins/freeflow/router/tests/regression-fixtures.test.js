import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import freeflowExtension from "../../pi-extension/dist/index.js";
import { createVault, freeflowRetrieve, freeflowRun, readOutputText } from "../dist/index.js";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const fixtureRoot = resolve(repoRoot, "plugins/freeflow/evals/fixtures/output-router");

async function fixtureText(name) {
  return readFile(join(fixtureRoot, name), "utf8");
}

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-regression-vault-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function resultContextBytes(result) {
  return Buffer.byteLength(JSON.stringify(result), "utf8");
}

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

function context(cwd) {
  return {
    cwd,
    sessionManager: { getEntries: () => [] },
    ui: { setStatus() {}, notify() {} },
  };
}

async function withSandboxPermissionsFixtureRepo(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-sandbox-fixture-"));
  try {
    const targetDir = join(root, "docs/codex-cli-agent-harness");
    await mkdir(targetDir, { recursive: true });
    await writeFile(
      join(targetDir, "2026-06-12-pass-3-sandboxing-and-permissions.md"),
      [
        "# Pass 3",
        "",
        "### Sandbox Permissions",
        "",
        "`SandboxPermissions` is a per-command request shape.",
        "",
        "Plain-language meaning:",
        "",
        "```text",
        "UseDefault:",
        "  Run with the turn's normal sandbox.",
        "",
        "RequireEscalated:",
        "  Request unsandboxed execution.",
        "",
        "WithAdditionalPermissions:",
        "  Stay sandboxed but widen permissions for this one command.",
        "```",
      ].join("\n"),
      "utf8",
    );

    await mkdir(join(root, "graphify-out"), { recursive: true });
    await writeFile(
      join(root, "graphify-out/graph.html"),
      [
        "<html><body>",
        `${"Sandbox Permissions SandboxPermissions Plain-language meaning ".repeat(5000)}GENERATED_GRAPH_DECOY_SENTINEL`,
        "</body></html>",
      ].join("\n"),
      "utf8",
    );

    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("regression fixture: Sandbox Permissions broad query ignores generated graph decoy", async () => {
  await withSandboxPermissionsFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "Sandbox Permissions SandboxPermissions Plain-language meaning",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
    assert.match(result.evidence[0].excerpt, /SandboxPermissions/);
    assert.doesNotMatch(result.evidence[0].excerpt, /GENERATED_GRAPH_DECOY_SENTINEL/);
    assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") <= 8_192);
  });
});

test("regression fixture: root-scoped query still ignores generated graph decoy", async () => {
  await withSandboxPermissionsFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root, path: "." },
      query: "Sandbox Permissions SandboxPermissions Plain-language meaning",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
    assert.doesNotMatch(result.evidence[0].excerpt, /GENERATED_GRAPH_DECOY_SENTINEL/);
  });
});

test("regression fixture: explicitly requested generated path remains searchable", async () => {
  await withSandboxPermissionsFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root, path: "graphify-out/graph.html" },
      query: "GENERATED_GRAPH_DECOY_SENTINEL",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "graphify-out/graph.html");
    assert.match(result.evidence[0].excerpt, /Sandbox Permissions/);
  });
});

test("regression fixture: huge single-line evidence is bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-huge-line-fixture-"));
  try {
    await writeFile(
      join(root, "huge-line.md"),
      [
        "# Huge Line Fixture",
        `${"UNIQUE_HUGE_LINE_MARKER repeated evidence ".repeat(6000)}TAIL_SENTINEL_SHOULD_BE_OUTSIDE_PREVIEW`,
      ].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "UNIQUE_HUGE_LINE_MARKER",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.match(result.evidence[0].excerpt, /UNIQUE_HUGE_LINE_MARKER/);
    assert.doesNotMatch(result.evidence[0].excerpt, /TAIL_SENTINEL_SHOULD_BE_OUTSIDE_PREVIEW/);
    assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") <= 8_192);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: broad query skips media file decoys but explicit paths remain searchable", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-media-skip-fixture-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(
      join(root, "target.md"),
      "MEDIA_SKIP_MARKER source truth router evidence",
      "utf8",
    );
    await writeFile(
      join(root, "assets", "diagram.png"),
      `${"MEDIA_SKIP_MARKER source truth router evidence ".repeat(1000)}pngdecoyonlysentinel`,
      "utf8",
    );

    const broad = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "MEDIA_SKIP_MARKER source truth router evidence",
      preserve: "important",
    });

    assert.equal(broad.toolStatus, "ok");
    assert.equal(broad.evidence?.length, 1);
    assert.equal(broad.evidence[0].path, "target.md");
    assert.doesNotMatch(broad.evidence[0].excerpt, /pngdecoyonlysentinel/);

    const broadMediaOnly = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "pngdecoyonlysentinel",
      preserve: "important",
    });

    assert.equal(broadMediaOnly.toolStatus, "ok");
    assert.equal(broadMediaOnly.evidence?.length, 0);

    const explicit = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root, path: "assets/diagram.png" },
      query: "pngdecoyonlysentinel",
      preserve: "important",
    });

    assert.equal(explicit.toolStatus, "ok");
    assert.equal(explicit.evidence?.length, 1);
    assert.equal(explicit.evidence[0].path, "assets/diagram.png");
    assert.match(explicit.evidence[0].excerpt, /MEDIA_SKIP_MARKER/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: configured generated path hints skip broad decoys but keep explicit access", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-generated-hint-fixture-"));
  try {
    await mkdir(join(root, "custom-generated", "nested", "deeper"), { recursive: true });
    await writeFile(join(root, "target.md"), "GENERATED_HINT_MARKER source truth", "utf8");
    await writeFile(
      join(root, "custom-generated", "nested", "deeper", "decoy.md"),
      `${"GENERATED_HINT_MARKER source truth ".repeat(1000)}generatedhintsentinel`,
      "utf8",
    );

    const broad = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "GENERATED_HINT_MARKER source truth",
      preserve: "important",
      generatedPathGlobs: ["custom-generated/**/*.md"],
    });

    assert.equal(broad.toolStatus, "ok");
    assert.equal(broad.evidence?.length, 1);
    assert.equal(broad.evidence[0].path, "target.md");
    assert.doesNotMatch(broad.evidence[0].excerpt, /generatedhintsentinel/);

    const explicitFile = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root, path: "custom-generated/nested/deeper/decoy.md" },
      query: "generatedhintsentinel",
      preserve: "important",
      generatedPathGlobs: ["custom-generated/**/*.md"],
    });

    assert.equal(explicitFile.toolStatus, "ok");
    assert.equal(explicitFile.evidence?.length, 1);
    assert.equal(explicitFile.evidence[0].path, "custom-generated/nested/deeper/decoy.md");

    const explicitDirectory = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root, path: "custom-generated" },
      query: "generatedhintsentinel",
      preserve: "important",
      generatedPathGlobs: ["custom-generated/**/*.md"],
    });

    assert.equal(explicitDirectory.toolStatus, "ok");
    assert.equal(explicitDirectory.evidence?.length, 1);
    assert.equal(explicitDirectory.evidence[0].path, "custom-generated/nested/deeper/decoy.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: lockfiles remain searchable in broad retrieval", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-lockfile-fixture-"));
  try {
    await writeFile(
      join(root, "package-lock.json"),
      [`{ "name": "fixture", "marker": "LOCKFILE_SEARCH_MARKER" }`, "x".repeat(1024 * 1024 + 1)].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "LOCKFILE_SEARCH_MARKER",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "package-lock.json");
    assert.match(result.evidence[0].excerpt, /LOCKFILE_SEARCH_MARKER/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: exact technical phrase beats repeated loose tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-exact-phrase-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      ["# Target", "", "`SandboxPermissions` is a per-command request shape."].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "decoy.md"),
      `SandboxPermissions per-command request shape `.repeat(800),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "SandboxPermissions is a per-command request shape",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].excerpt, /`SandboxPermissions` is a per-command request shape/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: multiline heading/body phrase beats repeated loose tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-multiline-phrase-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      [
        "# Target",
        "",
        "### Sandbox Permissions",
        "",
        "Plain-language meaning:",
        "",
        "UseDefault: run with the normal sandbox.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "decoy.md"),
      `Sandbox meaning Permissions Plain-language `.repeat(800),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "Sandbox Permissions Plain-language meaning",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].excerpt, /### Sandbox Permissions/);
    assert.match(result.evidence[0].excerpt, /Plain-language meaning/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: capped heading boost cannot beat exact phrase", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-heading-boost-fixture-"));
  try {
    await writeFile(join(root, "target.md"), "# Target\n\nadaptive compression vault recovery", "utf8");
    await writeFile(join(root, "heading-decoy.md"), `# ${"adaptive ".repeat(30000)}\n`, "utf8");

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "adaptive compression vault recovery",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: section chunk coverage beats repeated single-token decoy", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-section-chunk-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      [
        "# Target",
        "",
        "## Adaptive Compression",
        "",
        "Vault recovery remains exact for raw output.",
        "Parser confidence labels routed diagnostics.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(root, "decoy.md"), `adaptive `.repeat(900), "utf8");

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "adaptive compression vault recovery parser confidence",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].excerpt, /## Adaptive Compression/);
    assert.match(result.evidence[0].excerpt, /Vault recovery remains exact/);
    assert.match(result.evidence[0].excerpt, /Parser confidence labels/);
    assert.match(result.routing.reason, /BM25-style|coverage/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: source symbol beats test chunk with one extra generic test token", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-source-vs-test-fixture-"));
  try {
    await mkdir(join(root, "src/config"), { recursive: true });
    await mkdir(join(root, "src/session"), { recursive: true });
    await writeFile(
      join(root, "src/config/network_proxy_spec.rs"),
      [
        "pub struct NetworkProxySpec {",
        "    base_config: NetworkProxyConfig,",
        "    requirements: Option<NetworkConstraints>,",
        "    config: NetworkProxyConfig,",
        "    constraints: NetworkProxyConstraints,",
        "}",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "src/session/tests.rs"),
      [
        "async fn network_proxy_spec_tests_refresh_config() {",
        "    let spec = NetworkProxySpec::from_config(network_proxy_config());",
        "    assert!(spec.tests_cover_network_proxy_config());",
        "}",
      ].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "NetworkProxySpec config network proxy spec tests",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "src/config/network_proxy_spec.rs");
    assert.match(result.evidence[0].excerpt, /pub struct NetworkProxySpec/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: implementation module beats thin re-export with complete query coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-implementation-vs-reexport-fixture-"));
  try {
    await mkdir(join(root, "codex-client/src"), { recursive: true });
    await writeFile(
      join(root, "codex-client/src/default_client.rs"),
      [
        "pub struct CodexHttpClient {",
        "    inner: reqwest::Client,",
        "}",
        "",
        "impl CodexHttpClient {",
        "    pub fn get<U>(&self, url: U) -> CodexRequestBuilder {",
        "        self.request(Method::GET, url)",
        "    }",
        "}",
        "",
        "pub struct CodexRequestBuilder {",
        "    builder: reqwest::RequestBuilder,",
        "}",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "codex-client/src/lib.rs"),
      [
        "mod default_client;",
        "// default client surface",
        "pub use crate::default_client::CodexHttpClient;",
        "pub use crate::default_client::CodexRequestBuilder;",
      ].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "CodexHttpClient CodexRequestBuilder default client",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "codex-client/src/default_client.rs");
    assert.match(result.evidence[0].excerpt, /CodexHttpClient/);
    assert.match(result.evidence[0].excerpt, /CodexRequestBuilder/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: exact phrase match evidence includes the exact phrase line", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-exact-phrase-range-fixture-"));
  try {
    const lines = ["# Target", `${"alpha ".repeat(400)}gamma beta separated high frequency line`, "alpha appears early"];
    for (let index = 0; index < 17; index += 1) {
      lines.push(`filler ${index}`);
    }
    lines.push("beta appears early enough to trigger coverage range");
    for (let index = 0; index < 80; index += 1) {
      lines.push(`more filler ${index}`);
    }
    lines.push("alpha beta exact phrase lives here");
    await writeFile(join(root, "target.md"), lines.join("\n"), "utf8");

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "alpha beta",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].why, /exact normalized query phrase/);
    assert.match(result.evidence[0].excerpt, /alpha beta exact phrase lives here/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: long symbol exact phrase evidence includes the exact phrase line", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-long-symbol-exact-phrase-fixture-"));
  try {
    const lines = ["pub fn anchored_symbol() {"];
    for (let index = 0; index < 76; index += 1) {
      lines.push(`    let filler_${index} = "${"alpha filler ".repeat(12)}";`);
    }
    lines.push("    let marker = \"omega beta exact phrase lives here\";");
    lines.push("}");
    await writeFile(join(root, "src.rs"), lines.join("\n"), "utf8");

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "omega beta exact phrase",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "src.rs");
    assert.match(result.evidence[0].why, /exact normalized query phrase/);
    assert.match(result.evidence[0].excerpt, /omega beta exact phrase lives here/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: short section exact phrase evidence includes a late exact phrase", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-short-section-exact-phrase-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      [
        "# Target",
        `${"alpha filler ".repeat(400)}`,
        `${"alpha filler ".repeat(400)}`,
        `${"alpha filler ".repeat(400)}`,
        `${"alpha filler ".repeat(400)}`,
        `${"alpha filler ".repeat(400)}`,
        `${"alpha filler ".repeat(400)}`,
        "omega beta exact phrase lives here",
      ].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "omega beta exact phrase",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].why, /exact normalized query phrase/);
    assert.match(result.evidence[0].excerpt, /omega beta exact phrase lives here/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: multiline huge exact phrase evidence includes the phrase span", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-multiline-huge-exact-phrase-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      [
        "# Target",
        `${"filler ".repeat(500)}alpha`,
        `beta ${"filler ".repeat(500)}`,
        "tail",
      ].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "alpha beta",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].why, /exact normalized query phrase/);
    assert.match(result.evidence[0].excerpt, /alpha\s+beta/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: huge symbol line exact phrase evidence includes the exact phrase text", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-huge-symbol-line-exact-phrase-fixture-"));
  try {
    await writeFile(
      join(root, "src.rs"),
      [
        "pub fn huge_line_symbol() {",
        `    let marker = "${"alpha filler ".repeat(500)}omega beta exact phrase lives here";`,
        "}",
      ].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "omega beta exact phrase",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "src.rs");
    assert.match(result.evidence[0].why, /exact normalized query phrase/);
    assert.match(result.evidence[0].excerpt, /omega beta exact phrase lives here/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: markdown frontmatter is searchable before the first heading", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-frontmatter-fixture-"));
  try {
    await writeFile(
      join(root, "skill.md"),
      [
        "---",
        "name: unique-frontmatter-marker",
        "description: source truth before heading",
        "---",
        "",
        "# Skill Heading",
        "Body text after heading.",
      ].join("\n"),
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "unique-frontmatter-marker",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "skill.md");
    assert.match(result.evidence[0].excerpt, /unique-frontmatter-marker/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: section evidence covers spread-out query terms", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-spread-section-fixture-"));
  try {
    await writeFile(
      join(root, "target.md"),
      [
        "# Target",
        "",
        "## Sandbox Permissions",
        "",
        ...Array.from({ length: 12 }, (_, index) => `background line ${index + 1}`),
        "Plain-language meaning:",
        "",
        ...Array.from({ length: 12 }, (_, index) => `more background line ${index + 1}`),
        "UseDefault runs with the normal sandbox.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "decoy.md"),
      `${"Sandbox Permissions Plain-language meaning ".repeat(120)}`,
      "utf8",
    );

    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "Sandbox Permissions Plain-language meaning UseDefault",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.evidence?.length, 1);
    assert.equal(result.evidence[0].path, "target.md");
    assert.match(result.evidence[0].excerpt, /## Sandbox Permissions/);
    assert.match(result.evidence[0].excerpt, /Plain-language meaning/);
    assert.match(result.evidence[0].excerpt, /UseDefault runs with the normal sandbox/);
    assert.doesNotMatch(result.evidence[0].excerpt, /Sandbox Permissions Plain-language meaning Sandbox Permissions/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("regression fixture: large docs query returns bounded exact evidence", async () => {
  const raw = await fixtureText("large-router-manual.md");
  const result = await freeflowRetrieve({
    action: "query",
    source: { kind: "repo", root: fixtureRoot },
    query: "OUTPUT_ROUTER_SKILL_DECISION_ANCHOR safety net",
    preserve: "important",
  });

  assert.equal(result.toolStatus, "ok");
  assert.equal(result.routing.status, "routed");
  assert.equal(result.evidence?.length, 1);
  assert.match(result.evidence[0].excerpt, /OUTPUT_ROUTER_SKILL_DECISION_ANCHOR/);
  assert.doesNotMatch(result.evidence[0].excerpt, /TAIL_SENTINEL_DO_NOT_INCLUDE_IN_TARGETED_QUERY/);
  assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") < Buffer.byteLength(raw, "utf8") / 3);
});

test("regression fixture: preserve full over cap returns exact chunks instead of a summary", async () => {
  const raw = await fixtureText("large-router-manual.md");
  const result = await freeflowRetrieve({
    action: "retrieve",
    source: { kind: "repo", root: fixtureRoot, path: "large-router-manual.md" },
    preserve: "full",
    maxFullBytes: 400,
  });

  assert.equal(result.toolStatus, "ok");
  assert.equal(result.preserve, "full");
  assert.equal(result.routing.status, "partial");
  assert.match(result.routing.reason, /bounded edge previews instead of a summary/);
  assert.equal(result.evidence?.length, 2);
  assert.match(result.evidence[0].excerpt, /HEAD_SENTINEL_FULL_FIDELITY/);
  assert.match(result.evidence[1].excerpt, /TAIL_SENTINEL_DO_NOT_INCLUDE_IN_TARGETED_QUERY/);
  assert.ok(resultContextBytes(result) < Buffer.byteLength(raw, "utf8"));
});

test("regression fixture: noisy successful command is smaller than raw and recoverable", async () => {
  await withTempVault(async (vault) => {
    const stdout = await fixtureText("noisy-test-output.txt");
    const result = await freeflowRun(
      {
        command: "npm test -- --verbose",
        sessionId: "noisy-regression-session",
        vaultRoot: vault.root,
        thresholds: { largeOutputLines: 10, largeOutputBytes: 100_000 },
        preserve: "important",
      },
      {
        async run() {
          return { stdout, stderr: "", executionStatus: "success", exitCode: 0 };
        },
      },
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "success");
    assert.equal(result.routing.status, "partial");
    assert.ok(resultContextBytes(result) < Buffer.byteLength(stdout, "utf8"));
    assert.match(result.importantLines?.[0].excerpt ?? "", /router noisy fixture line 001/);
    assert.doesNotMatch(result.importantLines?.[0].excerpt ?? "", /NOISY_OUTPUT_TAIL_SENTINEL/);
    assert.equal(await readOutputText(vault, "noisy-regression-session", result.outputId, "stdout"), stdout);
  });
});

test("regression fixture: failed command keeps tool, execution, and routing status split", async () => {
  await withTempVault(async (vault) => {
    const stderr = await fixtureText("failed-command-output.txt");
    const result = await freeflowRun(
      {
        command: "npm test failing-fixture",
        sessionId: "failed-regression-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      {
        async run() {
          return { stdout: "", stderr, executionStatus: "failed", exitCode: 1 };
        },
      },
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.execution.exitCode, 1);
    assert.equal(result.routing.status, "routed");
    assert.equal(Object.hasOwn(result, "status"), false);
    assert.match(result.importantLines?.[0].excerpt ?? "", /AssertionError: expected false to equal true/);
    assert.equal(await readOutputText(vault, "failed-regression-session", result.outputId, "stderr"), stderr);
  });
});

test("regression fixture: verification output preserves exact completion evidence", async () => {
  await withTempVault(async (vault) => {
    const stdout = await fixtureText("verification-output.txt");
    const result = await freeflowRun(
      {
        command: "npm run verify",
        sessionId: "verification-regression-session",
        vaultRoot: vault.root,
        goal: "verification",
        preserve: "important",
      },
      {
        async run() {
          return { stdout, stderr: "", executionStatus: "failed", exitCode: 1 };
        },
      },
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.importantLines?.[0].excerpt, "Tests: 2 failed, 198 passed, 200 total");
    assert.equal(await readOutputText(vault, "verification-regression-session", result.outputId, "stdout"), stdout);
  });
});

test("regression fixture: Pi safety net labels native output and recovers exact raw tail", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-router-native-fixture-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        defaultMode: "workflow",
        outputRouter: {
          postToolRouting: "safety-net",
          largeOutputLines: 10,
          largeOutputBytes: 100_000,
          vaultRoot: join(cwd, "vault"),
        },
      }),
      "utf8",
    );

    const raw = await fixtureText("native-large-output.txt");
    const { handlers, tools } = loadExtension();
    const routed = await handlers.get("tool_result")(
      {
        type: "tool_result",
        toolName: "read",
        toolCallId: "native-fixture-read",
        input: { path: "native-large-output.txt" },
        content: [{ type: "text", text: raw }],
        details: undefined,
        isError: false,
      },
      context(cwd),
    );

    assert.match(routed.content[0].text, /Freeflow routed this native read result/);
    assert.match(routed.content[0].text, /outputId=ffout_/);
    assert.ok(Buffer.byteLength(routed.content[0].text, "utf8") < Buffer.byteLength(raw, "utf8"));
    const outputId = routed.content[0].text.match(/outputId=(ffout_[a-f0-9]+)/)?.[1];
    assert.ok(outputId);

    const retrieveTool = tools.find((tool) => tool.name === "freeflow_retrieve");
    const retrieved = await retrieveTool.execute(
      "recover-native-tail",
      {
        action: "retrieve",
        source: { kind: "vault", outputId, stream: "raw" },
        lineRange: { start: 38, end: 40 },
      },
      undefined,
      undefined,
      context(cwd),
    );
    const payload = retrieved.details.result;
    assert.doesNotMatch(retrieved.content[0].text, /^\s*\{/);
    assert.equal(payload.evidence[0].excerpt, "native output fixture line 038\nnative output fixture line 039\nNATIVE_RAW_TAIL_SENTINEL");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

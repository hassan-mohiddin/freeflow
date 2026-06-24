import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import freeflow from "../../pi-extension/dist/index.js";
import { createVault, readOutputText, storeCommandOutput } from "../dist/index.js";

function registerMockPi() {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  const pi = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on(name, handler) {
      handlers.set(name, handler);
    },
    appendEntry() {},
    async sendUserMessage() {},
    async exec() {
      throw new Error("exec should not be called in pi extension derive tests");
    },
  };
  freeflow(pi);
  return { tools, commands, handlers };
}

function mockCtx(cwd = process.cwd(), sessionId = "pi-extension-derive-test") {
  return {
    cwd,
    ui: {
      notify() {},
      setStatus() {},
    },
    sessionManager: {
      getSessionId: () => sessionId,
    },
  };
}

const testTheme = {
  fg(_color, text) {
    return text;
  },
  bold(text) {
    return text;
  },
};

function renderText(component, width = 120) {
  return component.render(width).join("\n");
}

function schemaMatches(schema, value) {
  return schemaErrors(schema, value).length === 0;
}

function schemaErrors(schema, value, path = "$") {
  if (!schema) {
    return [];
  }

  const errors = [];
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => schemaMatches(candidate, value));
    if (matches.length !== 1) {
      errors.push(`${path} should match exactly one schema, matched ${matches.length}`);
    }
  }
  if (schema.anyOf) {
    const matches = schema.anyOf.filter((candidate) => schemaMatches(candidate, value));
    if (matches.length === 0) {
      errors.push(`${path} should match at least one schema`);
    }
  }
  if (schema.allOf) {
    for (const candidate of schema.allOf) {
      errors.push(...schemaErrors(candidate, value, path));
    }
  }
  if (schema.not && schemaMatches(schema.not, value)) {
    errors.push(`${path} should not match forbidden schema`);
  }

  if (schema.type) {
    const validType =
      schema.type === "object"
        ? value !== null && typeof value === "object" && !Array.isArray(value)
        : schema.type === "array"
          ? Array.isArray(value)
          : schema.type === "integer"
          ? Number.isInteger(value)
          : schema.type === "number"
            ? typeof value === "number"
            : typeof value === schema.type;
    if (!validType) {
      errors.push(`${path} should be ${schema.type}`);
      return errors;
    }
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    errors.push(`${path} should equal ${schema.const}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} should be one of ${schema.enum.join(", ")}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} should have length >= ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} should match ${schema.pattern}`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path} should be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path} should be <= ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} should have at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...schemaErrors(schema.items, item, `${path}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path}.${key} is required`);
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          errors.push(`${path}.${key} is not allowed`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...schemaErrors(propertySchema, value[key], `${path}.${key}`));
      }
    }
  }

  return errors;
}

function assertSchemaAccepts(schema, value) {
  assert.deepEqual(schemaErrors(schema, value), []);
}

function assertSchemaRejects(schema, value) {
  assert.equal(schemaMatches(schema, value), false, `schema unexpectedly accepted ${JSON.stringify(value)}`);
}

function collectSchemaKeys(schema, keys, path = "$", found = []) {
  if (!schema || typeof schema !== "object") {
    return found;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(schema, key)) {
      found.push(`${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(schema)) {
    if (value && typeof value === "object") {
      collectSchemaKeys(value, keys, `${path}.${key}`, found);
    }
  }
  return found;
}

test("Pi extension registers public freeflow_derive with deterministic operation schema", () => {
  const { tools } = registerMockPi();
  const derive = tools.get("freeflow_derive");

  assert.ok(derive, "freeflow_derive should be registered");
  assert.equal(tools.has("freeflow_script_derive"), false);
  assert.deepEqual(derive.parameters.required, ["operation"]);
  assert.deepEqual(derive.parameters.properties.source.properties.kind.enum, ["vault"]);
  assert.match(derive.description, /deterministic/i);
  assert.match(derive.promptGuidelines.join("\n"), /existing vaulted evidence/i);
  assert.deepEqual(collectSchemaKeys(derive.parameters, ["oneOf", "anyOf", "allOf", "not", "const"]), []);

  const operationKinds = derive.parameters.properties.operation.properties.kind.enum;
  assert.deepEqual(operationKinds, [
    "regexFilter",
    "countMatches",
    "jsonExtract",
    "groupByRegex",
    "dedupe",
    "topN",
    "extractUrls",
    "extractCitations",
    "lineStats",
    "sizeStats",
    "script",
  ]);
});

test("Pi extension freeflow_derive schema stays Pi-compatible while rejecting invalid primitive shapes", () => {
  const { tools } = registerMockPi();
  const derive = tools.get("freeflow_derive");
  const schema = derive.parameters;
  const source = { kind: "vault", outputId: "ffout_source" };

  assertSchemaAccepts(schema, { source, operation: { kind: "jsonExtract", pointer: "" } });
  assertSchemaAccepts(schema, { source, operation: { kind: "jsonExtract", pointer: "/suite/failures/0/message" } });
  assertSchemaAccepts(schema, { source, operation: { kind: "jsonExtract", pointer: "/escaped~0tilde/~1slash" } });
  assertSchemaAccepts(schema, { source, operation: { kind: "jsonExtract", path: "$" } });
  assertSchemaAccepts(schema, { source, operation: { kind: "jsonExtract", path: "$.suite.failures[0]" } });
  assertSchemaAccepts(schema, { source, operation: { kind: "jsonExtract", path: "$[\"quoted.key\"]" } });
  assertSchemaAccepts(schema, { source, operation: { kind: "topN", limit: 10 } });
  assertSchemaAccepts(schema, {
    source,
    operation: { kind: "topN", limit: 10, pattern: "duration=(\\d+)", flags: "im", group: "1", sort: "numeric" },
  });
  assertSchemaAccepts(schema, {
    sources: [{ kind: "vault", outputId: "ffout_source", stream: "combined", alias: "test_log" }],
    operation: { kind: "script", language: "python", code: "write_text('ok')" },
    limits: { timeoutMs: 1000, maxInputBytes: 2048, maxOutputBytes: 4096 },
  });

  assertSchemaRejects(schema, { source: { kind: "vault", outputId: "" }, operation: { kind: "lineStats" } });
  assertSchemaRejects(schema, { source, operation: { kind: "jsonExtract", pointer: "not/a/pointer" } });
  assertSchemaRejects(schema, { source, operation: { kind: "jsonExtract", pointer: "/bad~2escape" } });
  assertSchemaRejects(schema, { source, operation: { kind: "jsonExtract", pointer: "/dangling~" } });
  assertSchemaRejects(schema, { source, operation: { kind: "jsonExtract", path: "$." } });
  assertSchemaRejects(schema, { source, operation: { kind: "jsonExtract", path: "$['singleQuoted']" } });
  assertSchemaRejects(schema, { source, operation: { kind: "jsonExtract", path: "$[01]" } });
  assertSchemaRejects(schema, { source, operation: { kind: "jsonExtract", path: "$[\"unterminated]" } });
  assertSchemaRejects(schema, { source, operation: { kind: "jsonExtract", path: "$[\"bad\\xescape\"]" } });
  assertSchemaRejects(schema, { source, operation: { kind: "notReal" } });
  assertSchemaRejects(schema, { source, operation: { kind: "topN", limit: 10, group: 1 } });
  assertSchemaRejects(schema, { source, operation: { kind: "regexFilter", pattern: "FAIL", flags: "ii" } });
  assertSchemaRejects(schema, { source, operation: { kind: "regexFilter", pattern: "FAIL", flags: "y" } });
  assertSchemaRejects(schema, { source, operation: { kind: "regexFilter", pattern: "FAIL", contextLines: 21 } });
  assertSchemaRejects(schema, { source, operation: { kind: "regexFilter", pattern: "FAIL", maxMatches: 1001 } });
  assertSchemaRejects(schema, { source, operation: { kind: "groupByRegex", pattern: "kind=(\\w+)", maxGroups: 1001 } });
  assertSchemaRejects(schema, { source, operation: { kind: "groupByRegex", pattern: "kind=(\\w+)", maxLinesPerGroup: 1001 } });
  assertSchemaRejects(schema, { source, operation: { kind: "dedupe", maxLines: 10001 } });
  assertSchemaRejects(schema, { source, operation: { kind: "topN", limit: 1001 } });
  assertSchemaRejects(schema, { source, operation: { kind: "extractUrls", maxMatches: 1001 } });
  assertSchemaRejects(schema, { source, operation: { kind: "extractCitations", maxMatches: 1001 } });
  assertSchemaRejects(schema, { sources: [{ kind: "vault", outputId: "ffout_source", alias: "1bad" }], operation: { kind: "script", language: "python", code: "ok" } });
  assertSchemaRejects(schema, { sources: [{ kind: "vault", outputId: "ffout_source", alias: "ok" }], operation: { kind: "script", language: "ruby", code: "ok" } });
  assertSchemaRejects(schema, { sources: [{ kind: "vault", outputId: "ffout_source", alias: "ok" }], operation: { kind: "script", language: "python", code: "" } });
  assertSchemaRejects(schema, { sources: [{ kind: "vault", outputId: "ffout_source", alias: "ok" }], operation: { kind: "script", language: "python", code: "ok" }, limits: { timeoutMs: 0 } });
});

test("Pi extension public freeflow_derive returns structured disabled result for script derive by default", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-derive-script-disabled-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify({ defaultMode: "workflow" }), "utf8");

    const { tools } = registerMockPi();
    const derive = tools.get("freeflow_derive");
    const result = await derive.execute(
      "derive-script-disabled",
      {
        sources: [{ kind: "vault", outputId: "ffout_missing", alias: "missing" }],
        operation: { kind: "script", language: "python", code: "print('RAW_SCRIPT_SENTINEL')" },
      },
      undefined,
      undefined,
      mockCtx(cwd, "pi-extension-derive-script-disabled-test"),
    );

    assert.equal(result.details.result.failure.kind, "script_derive_disabled");
    assert.equal(result.details.result.deriveExecution.status, "unavailable");
    assert.equal(result.details.result.persistence.recoverability, "none");
    assert.doesNotMatch(JSON.stringify(result.details.result), /RAW_SCRIPT_SENTINEL/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi extension public freeflow_derive returns structured failures for operation-specific validation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-derive-invalid-"));
  const sessionId = "pi-extension-derive-invalid-test";
  try {
    const vaultRoot = join(cwd, "vault");
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { vaultRoot } }),
      "utf8",
    );

    const vault = createVault({ root: vaultRoot });
    const source = await storeCommandOutput(vault, {
      sessionId,
      command: "printf json",
      stdout: "{\"suite\":{\"failed\":1}}",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-22T00:13:00.000Z",
    });

    const { tools } = registerMockPi();
    const derive = tools.get("freeflow_derive");
    const missingSelector = await derive.execute(
      "derive-invalid-json",
      {
        source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
        operation: { kind: "jsonExtract" },
      },
      undefined,
      undefined,
      mockCtx(cwd, sessionId),
    );

    assert.equal(missingSelector.details.result.failure.kind, "derive_validation_failure");
    assert.equal(missingSelector.details.result.deriveExecution.status, "rejected");
    assert.match(missingSelector.details.result.failure.message, /exactly one JSON selector/);

    const topNGroupWithoutPattern = await derive.execute(
      "derive-invalid-topn",
      {
        source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
        operation: { kind: "topN", limit: 10, group: "1" },
      },
      undefined,
      undefined,
      mockCtx(cwd, sessionId),
    );

    assert.equal(topNGroupWithoutPattern.details.result.failure.kind, "derive_validation_failure");
    assert.equal(topNGroupWithoutPattern.details.result.deriveExecution.status, "rejected");
    assert.match(topNGroupWithoutPattern.details.result.failure.message, /topN group requires a pattern/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi extension public freeflow_derive executes against vaulted output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-pi-derive-"));
  const sessionId = "pi-extension-derive-execute-test";
  try {
    const vaultRoot = join(cwd, "vault");
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({ defaultMode: "workflow", outputRouter: { vaultRoot } }),
      "utf8",
    );

    const vault = createVault({ root: vaultRoot });
    const source = await storeCommandOutput(vault, {
      sessionId,
      command: "npm test",
      stdout: ["PASS first", "FAIL target", "FAIL second"].join("\n"),
      stderr: "",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-22T00:12:00.000Z",
    });

    const { tools } = registerMockPi();
    const derive = tools.get("freeflow_derive");
    const result = await derive.execute(
      "derive-regex",
      {
        source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
        operation: { kind: "regexFilter", pattern: "FAIL", contextLines: 0, maxMatches: 10 },
        preserve: "important",
      },
      undefined,
      undefined,
      mockCtx(cwd, sessionId),
    );

    const routed = result.details.result;
    assert.equal(routed.toolStatus, "ok");
    assert.equal(routed.routing.route, "derive");
    assert.equal(routed.routing.status, "routed");
    assert.equal(routed.producer.name, "regexFilter");
    assert.equal(routed.source.outputId, source.outputId);
    assert.equal(routed.persistence.recoverability, "exact");
    assert.deepEqual(routed.lineage.sourceOutputIds, [source.outputId]);
    assert.ok(routed.outputId.startsWith("ffout_"));

    const raw = await readOutputText(vault, sessionId, routed.outputId, "raw");
    assert.match(raw, /# freeflow_derive regexFilter/);
    assert.match(raw, /matches: 2/);
    assert.match(raw, /2\| FAIL target/);
    assert.match(raw, /3\| FAIL second/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi extension freeflow_derive renders source, operation, lineage, routing, persistence, evidence, and recovery", () => {
  const { tools } = registerMockPi();
  const derive = tools.get("freeflow_derive");

  const call = renderText(
    derive.renderCall(
      {
        source: { kind: "vault", outputId: "ffout_source123", stream: "stdout" },
        operation: { kind: "topN", pattern: "duration=(\\d+)", group: 1, sort: "numeric", order: "desc", limit: 2 },
        preserve: "important",
      },
      testTheme,
    ),
  );
  assert.match(call, /freeflow_derive topN/);
  assert.match(call, /vault ffout_source123:stdout/);
  assert.match(call, /preserve=important/);

  const toolResult = {
    content: [{ type: "text", text: "raw json should not be the visible UI" }],
    details: {
      result: {
        toolStatus: "ok",
        decisionId: "ffdec_derive_test",
        preserve: "important",
        outputId: "ffout_derive123",
        recordId: "ffrec_derive123",
        source: { kind: "vault", outputId: "ffout_source123", stream: "stdout" },
        operation: { kind: "topN", pattern: "duration=(\\d+)", group: 1, sort: "numeric", order: "desc", limit: 2 },
        producer: { kind: "derive", name: "topN" },
        persistence: { status: "vaulted", recoverability: "exact", recoveryOutputId: "ffout_derive123" },
        lineage: {
          sourceOutputIds: ["ffout_source123"],
          sourceRecordIds: ["ffrec_source123"],
          operation: "topN",
          operationHash: "sha256_abcdef",
        },
        routing: { status: "routed", route: "derive", reason: "Derived output was vaulted and returned within routing caps." },
        summary: "Derived topN from vaulted stdout output: returned 2 of 3 matched line(s).",
        evidence: [
          {
            id: "ev_derive",
            source: { kind: "vault", outputId: "ffout_derive123", stream: "raw" },
            path: "ffout_derive123:raw",
            lines: "1-8",
            excerpt: "# freeflow_derive topN\n2| score=200 | duration=200 slow",
            why: "Derived exact topN output from source ffout_source123:stdout within routing caps; source lineage is preserved.",
            window: "exact",
            expandable: true,
          },
        ],
        recovery: {
          how: "Use freeflow_retrieve with source.kind=vault and outputId=ffout_derive123 to recover exact derived content.",
          outputId: "ffout_derive123",
        },
      },
    },
  };

  const collapsed = renderText(derive.renderResult(toolResult, { expanded: false }, testTheme));
  assert.match(collapsed, /freeflow_derive topN/);
  assert.match(collapsed, /routing: routed/);
  assert.match(collapsed, /persistence vaulted\/exact/);
  assert.match(collapsed, /derived output recoverable from vault/);
  assert.doesNotMatch(collapsed, /raw json/);

  const expanded = renderText(derive.renderResult(toolResult, { expanded: true }, testTheme));
  assert.match(expanded, /toolStatus: ok/);
  assert.match(expanded, /routing\.status: routed/);
  assert.match(expanded, /persistence: vaulted \/ exact/);
  assert.match(expanded, /Source/);
  assert.match(expanded, /ffout_source123:stdout/);
  assert.match(expanded, /Operation/);
  assert.match(expanded, /"kind":"topN"/);
  assert.match(expanded, /Lineage/);
  assert.match(expanded, /sourceOutputIds: ffout_source123/);
  assert.match(expanded, /Evidence/);
  assert.match(expanded, /duration=200 slow/);
  assert.match(expanded, /Recovery/);
  assert.match(expanded, /ffout_derive123/);
});

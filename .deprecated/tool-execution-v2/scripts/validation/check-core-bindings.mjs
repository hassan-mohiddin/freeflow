#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = join(root, "capabilities/tool-execution/references/generated-program-bindings.md");
const keys = [
  { id: "result.read", revision: "1" },
  { id: "result.read", revision: "2" },
  { id: "project.readText", revision: "1" },
  { id: "project.readRanges", revision: "1" },
  { id: "project.findPaths", revision: "1" },
  { id: "project.searchText", revision: "1" },
  { id: "project.searchText", revision: "2" },
  { id: "project.replaceExact", revision: "1" },
  { id: "project.applyPatch", revision: "1" },
];

export async function generateCoreBindings() {
  const temporary = await mkdtemp(join(root, "node_modules", ".freeflow-bindings-"));
  try {
    try {
      execFileSync(
        join(root, "node_modules", ".bin", "tsc"),
        ["-p", join(root, "pi-extension", "tsconfig.json"), "--outDir", join(temporary, "dist")],
        { cwd: root, stdio: "pipe", timeout: 120_000 },
      );
    } catch (error) {
      throw new Error(
        `Source compilation failed while checking program bindings: ${String(error.stdout ?? error).slice(0, 4000)}`,
      );
    }
    const compiled = (name) => pathToFileURL(join(temporary, "dist", "tool-runtime", name)).href;
    const [{ ToolRuntime }, { V2ExecutionRecorder }, { createArtifactReadOperation }, { renderProgramBinding }] =
      await Promise.all([
        import(compiled("index.js")),
        import(compiled("execution-record.js")),
        import(compiled("adapters/artifact.js")),
        import(compiled("bindings.js")),
      ]);
    const runtime = new ToolRuntime(
      () => undefined,
      {
        scope: () => ({}),
        responsibility: () => ({ profile: "solo", control: "inactive" }),
        admit: () => ({ kind: "allowed" }),
      },
      {
        read: async () => {
          throw new Error("Bindings never execute an operation.");
        },
      },
      undefined,
      undefined,
      new V2ExecutionRecorder(() => {
        throw new Error("Bindings never open a store.");
      }, 64),
    );
    runtime.registry.registerCompatibleRevision(
      createArtifactReadOperation({
        readV2Value: async () => {
          throw new Error("Bindings never read an artifact.");
        },
      }),
    );
    const sections = keys.map((key) => {
      const descriptor = runtime.registry.describe(key);
      assert.ok(
        descriptor?.available && descriptor.exposure.programmatic,
        `Core program operation is unavailable: ${key.id}@${key.revision}`,
      );
      return renderProgramBinding(descriptor);
    });
    const parsed = ts.createSourceFile(
      "generated-program-bindings.ts",
      sections.join("\n"),
      ts.ScriptTarget.Latest,
      true,
    );
    assert.deepEqual(
      parsed.parseDiagnostics.map((error) => error.messageText),
      [],
      "Generated declarations must parse as TypeScript.",
    );
    return [
      "# Exact Freeflow program bindings",
      "",
      "Generated from the current immutable built-in descriptors by `scripts/validation/check-core-bindings.mjs`. Do not edit this reference by hand.",
      "",
      "Declare the exact `{id, revision}` in `freeflow_run.operations`, then call `await tools.invoke(id, args)` in guest JavaScript. Only include the namespace for the selected revision; multiple revisions of one ID cannot be active in the same program. The guest receives the canonical value, not the host coverage/effect envelope. On failure, an Error exposes `code` and `effectState`; an unknown effect requires reconciliation, not retry. `needs-model` interrupts the program. The host records coverage, status, and partial receipts outside the guest return value. Runtime schemas—not these TypeScript-like declarations—enforce exact keys, bounds, patterns and authorization.",
      "",
      "Captured `results.read(id, range)` uses the separate `freeflow_run.captures` allowlist; it is not a `tools.invoke` operation declaration. `result.read@1` and `result.read@2` below are explicit operation calls through `tools.invoke` when included in the operations allowlist.",
      "",
      "```ts",
      ...sections.flatMap((section) => [section.trimEnd(), ""]),
      "```",
      "",
    ].join("\n");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const write = args.length === 1 && args[0] === "--write";
  const alternate = args.length === 2 && args[0] === "--check-reference";
  const checkPath = alternate ? resolve(args[1]) : output;
  if (args.length && !write && !alternate)
    throw new Error("Use --write or --check-reference <file>; the default checks the core reference.");
  const expected = await generateCoreBindings();
  if (write) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, expected);
    console.log(`Wrote ${output}.`);
  } else {
    const actual = await readFile(checkPath, "utf8").catch(() => undefined);
    assert.equal(actual, expected, "Generated core program bindings drifted from registered descriptors.");
    console.log("Core program bindings match the registered descriptors.");
  }
}

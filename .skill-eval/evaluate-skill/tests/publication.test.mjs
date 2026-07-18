import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  createStagingDirectory,
  publishDiagnostic,
  publishResult,
} from "../../../skills/evaluate-skill/scripts/lib/publication.mjs";

async function root(t) {
  const path = await mkdtemp(resolve(tmpdir(), "freeflow-publication-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("staging creation returns an outcome instead of throwing", async (t) => {
  const base = await root(t);
  const staging = resolve(base, "staging");
  const success = await createStagingDirectory(staging);
  assert.equal(success.status, "complete");
  await access(staging);
  const failed = await createStagingDirectory(resolve(base, "denied"), {
    mkdir: async () => {
      throw new Error("mkdir failed");
    },
  });
  assert.equal(failed.status, "incomplete");
  assert.match(failed.failure.primary, /mkdir failed/);
});

test("result publication treats successful rename as the commit point", async (t) => {
  const base = await root(t);
  const staging = resolve(base, "staging");
  const destination = resolve(base, "evaluations", "one");
  await mkdir(staging);
  const order = [];
  const outcome = await publishResult({
    stagingDir: staging,
    destinationDir: destination,
    prepare: async (path) => {
      order.push("prepare");
      await writeFile(resolve(path, "result.json"), "{}\n");
    },
    verify: async (path) => {
      order.push("verify");
      await access(resolve(path, "result.json"));
    },
    operations: {
      access: async () => {
        throw new Error("post-rename probe must not decide publication");
      },
    },
  });
  assert.deepEqual(outcome, { status: "published", path: destination });
  assert.deepEqual(order, ["prepare", "verify"]);
  assert.equal(await readFile(resolve(destination, "result.json"), "utf8"), "{}\n");
});

test("result publication refuses overwrite before preparing", async (t) => {
  const base = await root(t);
  const staging = resolve(base, "staging");
  const destination = resolve(base, "evaluations", "one");
  await mkdir(staging);
  await mkdir(destination, { recursive: true });
  let prepared = false;
  const outcome = await publishResult({
    stagingDir: staging,
    destinationDir: destination,
    prepare: async () => {
      prepared = true;
    },
    verify: async () => {},
  });
  assert.equal(outcome.status, "publication-failed");
  assert.equal("path" in outcome, false);
  assert.match(outcome.failure.primary, /already exists/i);
  assert.equal(prepared, false);
});

test("rename failure never advertises a result path", async (t) => {
  const base = await root(t);
  const staging = resolve(base, "staging");
  const destination = resolve(base, "evaluations", "one");
  await mkdir(staging);
  const outcome = await publishResult({
    stagingDir: staging,
    destinationDir: destination,
    prepare: async () => {},
    verify: async () => {},
    operations: {
      rename: async () => {
        throw new Error("rename failed");
      },
    },
  });
  assert.equal(outcome.status, "publication-failed");
  assert.equal("path" in outcome, false);
  assert.match(outcome.failure.primary, /rename failed/);
  await access(staging);
});

test("diagnostic write, mkdir, and rename failures never manufacture paths", async (t) => {
  for (const step of ["write", "mkdir", "rename"]) {
    await t.test(step, async () => {
      const base = await mkdtemp(resolve(tmpdir(), `freeflow-diagnostic-${step}-`));
      t.after(() => rm(base, { recursive: true, force: true }));
      const staging = resolve(base, "staging");
      const destination = resolve(base, "diagnostics", "one");
      await mkdir(staging);
      const operations = {};
      let writeDiagnostic = async (path) => writeFile(resolve(path, "diagnostic.json"), "{}\n");
      if (step === "write")
        writeDiagnostic = async () => {
          throw new Error("write failed");
        };
      if (step === "mkdir")
        operations.mkdir = async () => {
          throw new Error("mkdir failed");
        };
      if (step === "rename")
        operations.rename = async () => {
          throw new Error("rename failed");
        };
      const outcome = await publishDiagnostic({
        stagingDir: staging,
        destinationDir: destination,
        writeDiagnostic,
        operations,
      });
      assert.equal(outcome.status, "publication-failed");
      assert.equal("path" in outcome, false);
      assert.match(outcome.failure.primary, new RegExp(`${step} failed`));
    });
  }
});

test("diagnostic publication treats successful rename as the commit point", async (t) => {
  const base = await root(t);
  const staging = resolve(base, "staging");
  const destination = resolve(base, "diagnostics", "one");
  await mkdir(staging);
  const outcome = await publishDiagnostic({
    stagingDir: staging,
    destinationDir: destination,
    writeDiagnostic: async (path) => writeFile(resolve(path, "diagnostic.json"), "{}\n"),
    operations: {
      access: async () => {
        throw new Error("post-rename probe must not decide publication");
      },
    },
  });
  assert.deepEqual(outcome, { status: "published", path: destination });
  await access(resolve(destination, "diagnostic.json"));
});

test("diagnostic publication cannot mutate caller failure or usage", async (t) => {
  const base = await root(t);
  const staging = resolve(base, "staging");
  await mkdir(staging);
  const original = Object.freeze({
    failure: Object.freeze({ primary: "subject failed", secondary: null }),
    usage: Object.freeze({ provider_requests: 1, cost_usd: 0.2 }),
  });
  const outcome = await publishDiagnostic({
    stagingDir: staging,
    destinationDir: resolve(base, "diagnostics", "one"),
    writeDiagnostic: async () => {
      throw new Error("write failed");
    },
  });
  assert.equal(outcome.status, "publication-failed");
  assert.deepEqual(original, {
    failure: { primary: "subject failed", secondary: null },
    usage: { provider_requests: 1, cost_usd: 0.2 },
  });
});

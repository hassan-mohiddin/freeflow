#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const matrixPath = resolve(root, ".skill-eval/coverage-matrix.json");
let matrix;
try {
  matrix = JSON.parse(await readFile(matrixPath, "utf8"));
} catch (error) {
  throw new Error(`Cannot parse coverage matrix at ${matrixPath}`, { cause: error });
}
assert.equal(matrix.schema_version, 2);
assert.deepEqual(matrix.source_snapshot, {
  kind: "same-commit",
  identity: "Each skill is identified by its source_path and source_sha256.",
});
const skillNames = [];
for (const entry of await readdir(resolve(root, "skills"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    await access(resolve(root, "skills", entry.name, "SKILL.md"));
    skillNames.push(entry.name);
  } catch {}
}
skillNames.sort();
const matrixNames = Object.keys(matrix.skills).sort();

assert.deepEqual(matrixNames, skillNames);
assert.equal(matrixNames.length, 26);

const required = [
  "job",
  "positive_trigger",
  "near_miss",
  "pressure",
  "observable",
  "stop_edge",
  "neighbours",
  "evidence_class",
  "case_concept",
  "current_result",
  "source_path",
  "source_sha256",
  "evidence_status",
  "supported_configuration",
  "intended_evaluation_configuration",
];

for (const name of matrixNames) {
  const entry = matrix.skills[name];
  for (const field of required) assert.equal(Object.hasOwn(entry, field), true, `${name} missing ${field}`);
  const bytes = await readFile(resolve(root, entry.source_path));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.source_sha256, `${name} source hash mismatch`);
  assert.equal(Array.isArray(entry.neighbours), true);
  assert.equal(Array.isArray(entry.evidence_class), true);
  if (entry.evidence_status === "production-ready") {
    assert.equal(entry.supported_configuration?.status, "production-ready", `${name} missing supported boundary`);
    await access(resolve(root, entry.supported_configuration.authority));
  } else {
    assert.equal(entry.supported_configuration, null, `${name} must not claim a supported configuration`);
  }
}

process.stdout.write(`${JSON.stringify({ valid: true, skills: matrixNames.length }, null, 2)}\n`);

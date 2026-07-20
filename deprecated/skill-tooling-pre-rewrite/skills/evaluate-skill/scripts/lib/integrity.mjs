import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stableJson } from "./hash.mjs";
import { createManifest } from "./materialize.mjs";

const INTEGRITY_FILE = "integrity.json";

export async function writeBundleIntegrity(root) {
  const record = {
    schema_version: 1,
    inventory: await createManifest(root, { exclude: [INTEGRITY_FILE] }),
  };
  await writeFile(resolve(root, INTEGRITY_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export async function verifyBundleIntegrity(root) {
  const recorded = JSON.parse(await readFile(resolve(root, INTEGRITY_FILE), "utf8"));
  const actual = {
    schema_version: 1,
    inventory: await createManifest(root, { exclude: [INTEGRITY_FILE] }),
  };
  if (stableJson(recorded) !== stableJson(actual)) throw new Error("Bundle integrity mismatch before publication");
  return recorded;
}

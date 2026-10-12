// Proof for f7-02: CEV1 writes each record's fields sorted by key (requirement 1).
// Run with EXPORT_ROOT=<export root>; the modules are loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const lib = join(process.env.EXPORT_ROOT, "skills/evaluate-skill/scripts/lib");
const { encodeCev1 } = await import(pathToFileURL(join(lib, "compact-evidence.mjs")).href);
const { sha256 } = await import(pathToFileURL(join(lib, "hash.mjs")).href);

test("each record's fields are written in key order", () => {
  const canonical = '{\n  "verdict": "pass"\n}\n';
  const records = [
    { type: "H", schema: "CEV1", fields: { case: "CASE-1", role: "candidate" } },
    {
      type: "S",
      fields: {
        id: "s1",
        kind: "file",
        path: "result.json",
        sha256: sha256(canonical),
        bytes: Buffer.byteLength(canonical),
        recovery: "exact",
      },
    },
    {
      type: "F",
      fields: {
        name: "verdict",
        value: "pass",
        source: "s1",
        span: "json:/verdict",
        op: `json-pointer@${"a".repeat(64)}`,
        recovery: "exact-source",
      },
    },
    { type: "O", fields: { kind: "omitted", reason: "irrelevant-to-fixed-criteria", count: 3 } },
    { type: "R", fields: { bundle: "bundle-1", canonicalSha256: sha256(canonical), recovery: "exact" } },
  ];
  const lines = encodeCev1(records).trimEnd().split("\n");
  for (const line of lines) {
    const keys = line
      .split("|")
      .filter((part) => part.includes("="))
      .map((part) => part.split("=")[0]);
    console.log(`${line.split("|")[0]}: ${keys.join(",")}`);
    assert.deepEqual(keys, [...keys].sort(), line);
  }
});

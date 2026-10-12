// Proof for rs-12575cea: bytes.canonical and bytes.omitted must count UTF-8 bytes, not string units.
// Run with EXPORT_ROOT=<export root>; modules are loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const exportRoot = process.env.EXPORT_ROOT;
const libRoot = join(exportRoot, "skills/evaluate-skill/scripts/lib");
const { sha256 } = await import(pathToFileURL(join(libRoot, "hash.mjs")).href);
const { renderCompactEvidence } = await import(pathToFileURL(join(libRoot, "compact-evidence.mjs")).href);

function exactRecords(canonicalText, value = "pass") {
  return [
    { type: "H", schema: "CEV1", fields: { case: "CASE-1", role: "candidate" } },
    {
      type: "S",
      fields: {
        id: "s1",
        kind: "file",
        path: "result.json",
        sha256: sha256(canonicalText),
        bytes: Buffer.byteLength(canonicalText),
        recovery: "exact",
      },
    },
    {
      type: "F",
      fields: {
        name: "verdict",
        value,
        source: "s1",
        span: "json:/verdict",
        op: `json-pointer@${"a".repeat(64)}`,
        recovery: "exact-source",
      },
    },
    { type: "O", fields: { kind: "omitted", reason: "irrelevant-to-fixed-criteria", count: 3 } },
    { type: "R", fields: { bundle: "bundle-1", canonicalSha256: sha256(canonicalText), recovery: "exact" } },
  ];
}

test("CEV1 branch reports canonical bytes as UTF-8 bytes and omitted as their difference", () => {
  const canonical = {
    verdict: "pass",
    unrelated_events: Array.from({ length: 80 }, (_, index) => ({ index, payload: "é".repeat(80) })),
  };
  const canonicalText = `${JSON.stringify(canonical, null, 2)}\n`;
  const rendered = renderCompactEvidence({ canonical, records: exactRecords(canonicalText) });
  assert.equal(rendered.format, "cev1");
  assert.equal(rendered.bytes.canonical, Buffer.byteLength(canonicalText));
  assert.equal(rendered.bytes.omitted, Buffer.byteLength(canonicalText) - rendered.bytes.compact);
});

test("canonical fallback reports canonical bytes as UTF-8 bytes", () => {
  const canonical = { verdict: "pass", note: "ü" };
  const canonicalText = `${JSON.stringify(canonical, null, 2)}\n`;
  const rendered = renderCompactEvidence({ canonical, records: exactRecords(canonicalText) });
  assert.equal(rendered.format, "canonical-json");
  assert.equal(rendered.bytes.canonical, Buffer.byteLength(canonicalText));
});

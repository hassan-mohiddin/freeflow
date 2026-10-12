import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "../../../skills/evaluate-skill/scripts/lib/hash.mjs";
import { decodeCev1, encodeCev1, renderCompactEvidence } from "../../../skills/evaluate-skill/scripts/lib/compact-evidence.mjs";

function exactRecords(canonicalText, value = "pass") {
  return [
    { type: "H", schema: "CEV1", fields: { case: "CASE-1", role: "candidate" } },
    { type: "S", fields: { id: "s1", kind: "file", path: "result.json", sha256: sha256(canonicalText), bytes: Buffer.byteLength(canonicalText), recovery: "exact" } },
    { type: "F", fields: { name: "verdict", value, source: "s1", span: "json:/verdict", op: `json-pointer@${"a".repeat(64)}`, recovery: "exact-source" } },
    { type: "O", fields: { kind: "omitted", reason: "irrelevant-to-fixed-criteria", count: 3 } },
    { type: "R", fields: { bundle: "bundle-1", canonicalSha256: sha256(canonicalText), recovery: "exact" } },
  ];
}

test("CEV1 round-trips escaped delimiters, newlines, backslashes, and controls deterministically", () => {
  const canonical = `${JSON.stringify({ verdict: "pass" }, null, 2)}\n`;
  const records = exactRecords(canonical, "a|b\ncr\rslash\\tab\t");
  const encoded = encodeCev1(records);
  assert.equal(encoded, encodeCev1(records));
  assert.match(encoded, /a\\\|b\\ncr\\rslash\\\\tab\\x09/);
  const decoded = decodeCev1(encoded);
  assert.equal(decoded[0].schema, "CEV1");
  assert.equal(decoded[2].fields.value, "a|b\ncr\rslash\\tab\t");
  assert.deepEqual(decodeCev1(encodeCev1(decoded)), decoded);
});

test("CEV1 rejects missing or overstated fact lineage", () => {
  const canonical = `${JSON.stringify({ verdict: "pass" }, null, 2)}\n`;
  const missingSpan = exactRecords(canonical);
  delete missingSpan[2].fields.span;
  assert.throws(() => encodeCev1(missingSpan), /span/i);

  const unknownSource = exactRecords(canonical);
  unknownSource[2].fields.source = "missing";
  assert.throws(() => encodeCev1(unknownSource), /unknown source/i);

  const overstated = exactRecords(canonical);
  overstated[1].fields.recovery = "metadata-only";
  assert.throws(() => encodeCev1(overstated), /recoverability/i);
});

test("compact rendering uses CEV1 only when lineage is exact and bytes decrease", () => {
  const canonical = {
    verdict: "pass",
    unrelated_events: Array.from({ length: 80 }, (_, index) => ({ index, payload: "x".repeat(80) })),
  };
  const canonicalText = `${JSON.stringify(canonical, null, 2)}\n`;
  const compact = renderCompactEvidence({ canonical, records: exactRecords(canonicalText) });
  assert.equal(compact.format, "cev1");
  assert.equal(compact.bytes.compact < compact.bytes.canonical, true);
  assert.equal(compact.recovery.canonical_sha256, sha256(canonicalText));
  assert.equal(compact.content, encodeCev1(exactRecords(canonicalText)));
});

test("compact rendering falls back to canonical JSON when reduction is not beneficial", () => {
  const canonical = { verdict: "pass" };
  const canonicalText = `${JSON.stringify(canonical, null, 2)}\n`;
  const rendered = renderCompactEvidence({ canonical, records: exactRecords(canonicalText) });
  assert.equal(rendered.format, "canonical-json");
  assert.equal(rendered.content, canonicalText);
  assert.equal(rendered.reason, "compact-not-smaller");
  assert.equal(rendered.bytes.canonical, Buffer.byteLength(canonicalText));
});

test("compact rendering fails closed to canonical JSON when lineage cannot be expressed", () => {
  const canonical = { verdict: "pass", details: "x".repeat(1000) };
  const canonicalText = `${JSON.stringify(canonical, null, 2)}\n`;
  const records = exactRecords(canonicalText);
  delete records[2].fields.op;
  const rendered = renderCompactEvidence({ canonical, records });
  assert.equal(rendered.format, "canonical-json");
  assert.equal(rendered.reason, "lineage-invalid");
  assert.match(rendered.lineage_error, /op/i);
});

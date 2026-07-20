import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { decodeCev1 } from "../../../skills/evaluate-skill/scripts/lib/compact-evidence.mjs";
import { sha256 } from "../../../skills/evaluate-skill/scripts/lib/hash.mjs";
import {
  operationIdentity,
  reduceSemanticPacket,
} from "../../../skills/evaluate-skill/scripts/lib/semantic-evidence.mjs";

const corpusRoot = resolve(import.meta.dirname, "..", "fixtures", "v3-semantic-corpus");
const names = ["wfi-002-reference", "wfi-002-candidate", "wfi-003-reference", "wfi-003-candidate"];
const hashes = {
  "wfi-002-reference": "491b5e96363207f463e38a9c178f6c16596c4e516a641393535defaf7de85931",
  "wfi-002-candidate": "951862ca3257b57db439dfa3dda5320db83bd01e9a5ee7de9d4e8b90f65f6bc9",
  "wfi-003-reference": "344bda930c92796ce4c223284b70193a17c330697f774e2c0cc6e9a1eab474e8",
  "wfi-003-candidate": "8e68c6ab735ddd278d86bde917044c12b48a870156c238d2c449d684220ad31f",
};

async function packet(name) {
  const raw = await readFile(resolve(corpusRoot, `${name}.json`));
  assert.equal(sha256(raw), hashes[name]);
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw new Error(`${name} must contain valid JSON`, { cause: error });
  }
}

function omissionDetails(record) {
  return record.fields.detail.split(";").map((item) => {
    const [reason, span, omittedBytes] = item.split(",");
    return { reason, span, omittedBytes: Number(omittedBytes) };
  });
}

test("semantic reducer preserves every fixed criterion and selected turn in compact evidence", async () => {
  for (const name of names) {
    const source = await packet(name);
    const reduced = reduceSemanticPacket(source, { bundle: name, sourcePath: `${name}.json` });
    assert.equal(reduced.rendered.format, "cev1", name);
    const decoded = decodeCev1(reduced.rendered.content);
    const facts = decoded.filter((record) => record.type === "F");
    for (const criterion of source.evidence.criteria) {
      assert.equal(
        facts.some((fact) => fact.fields.name === `c.${criterion.id}` && fact.fields.value.includes(criterion.rubric)),
        true,
        `${name}:${criterion.id}`,
      );
    }
    for (const turn of source.evidence.turns ?? []) {
      const fact = facts.find((item) => item.fields.name === "t");
      assert.ok(fact, `${name}:${turn.id}`);
      assert.match(fact.fields.value, new RegExp(turn.id));
      assert.equal(fact.fields.value.includes(turn.natural_prompt), true, `${name}:${turn.id}:natural-prompt`);
      assert.equal(
        fact.fields.value.includes(turn.final_response.slice(0, 50)),
        true,
        `${name}:${turn.id}:response-head`,
      );
      assert.equal(reduced.parity.response_sha256[turn.id].length, 64);
    }
    assert.deepEqual(
      reduced.parity.criterion_ids,
      source.evidence.criteria.map((item) => item.id),
    );
    assert.deepEqual(reduced.parity.selected_turn_ids, source.evidence.selected_turn_ids ?? []);
  }
});

test("semantic reducer meets the frozen-corpus median byte target without oversized packets", async () => {
  const reductions = [];
  for (const name of names) {
    const reduced = reduceSemanticPacket(await packet(name), { bundle: name, sourcePath: `${name}.json` });
    const ratio = 1 - reduced.rendered.bytes.compact / reduced.rendered.bytes.canonical;
    reductions.push(ratio);
    assert.equal(reduced.rendered.bytes.compact < reduced.rendered.bytes.canonical, true, name);
  }
  reductions.sort((left, right) => left - right);
  const median = (reductions[1] + reductions[2]) / 2;
  assert.equal(median >= 0.4, true, `median reduction was ${(median * 100).toFixed(2)}%`);
});

test("semantic reducer emits typed exact-lineage omissions and separates savings from omitted bytes", async () => {
  const reduced = reduceSemanticPacket(await packet("wfi-002-candidate"), {
    bundle: "wfi-002-candidate",
    sourcePath: "packet.json",
  });
  const decoded = decodeCev1(reduced.rendered.content);
  const omissions = decoded.filter((record) => record.type === "O");
  assert.equal(omissions.length, 1);
  const details = omissionDetails(omissions[0]);
  assert.equal(
    details.some((item) => item.reason === "BR"),
    true,
  );
  assert.equal(
    details.some((item) => item.reason === "DC"),
    true,
  );
  assert.equal(
    details.every((item) => item.span.startsWith("/") && item.omittedBytes > 0),
    true,
  );
  assert.equal(omissions[0].fields.source, "p");
  assert.equal(omissions[0].fields.recovery, "exact-source");
  assert.equal(reduced.rendered.bytes.savings > 0, true);
  assert.equal(reduced.rendered.bytes.source_omitted, Number(omissions[0].fields.omittedBytes));
});

test("semantic reducer preserves deterministic objective assertion facts", async () => {
  const source = await packet("wfi-003-reference");
  source.evidence.objective_assertions = [
    { id: "path", type: "changed_paths", state: "pass", evidence: { expected: ["a"], actual: ["a"] } },
  ];
  const reduced = reduceSemanticPacket(source);
  const fact = decodeCev1(reduced.rendered.content).find(
    (record) => record.type === "F" && record.fields.name === "o.path",
  );
  assert.ok(fact);
  assert.match(fact.fields.value, /changed_paths/);
  assert.match(fact.fields.value, /"state":"pass"/);
  assert.match(fact.fields.value, /"actual":\["a"\]/);
});

test("semantic reducer rejects selected-turn mismatch before rendering", async () => {
  const source = await packet("wfi-002-candidate");
  source.evidence.selected_turn_ids = ["turn-1"];
  assert.throws(() => reduceSemanticPacket(source), /selected turn ids.*rendered turns/i);
  source.evidence.selected_turn_ids = ["turn-2", "turn-1"];
  assert.throws(() => reduceSemanticPacket(source), /selected turn ids.*rendered turns/i);
});

test("operation identities change with implementation content", () => {
  const first = operationIdentity("example", [
    function reducer() {
      return 1;
    },
  ]);
  const second = operationIdentity("example", [
    function reducer() {
      return 2;
    },
  ]);
  assert.match(first, /^example@[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test("no-file diff truncation emits a bounded-diff omission", () => {
  const packet = {
    schema_version: 1,
    evidence: {
      label: "Run-X",
      objective_checks_passed: true,
      criteria: [{ id: "a", rubric: "Inspect changes." }],
      natural_prompt: "prompt",
      final_response: "response",
      changed_paths: ["a.txt"],
      diff: `diff --git a/a.txt b/a.txt\n@@ -1 +1 @@\n-${"a".repeat(1200)}\n+${"b".repeat(1200)}\n`,
      changed_file_contents: [],
    },
  };
  const reduced = reduceSemanticPacket(packet);
  const omission = decodeCev1(reduced.rendered.content).find((record) => record.type === "O");
  const details = omissionDetails(omission);
  assert.equal(
    details.some((item) => item.reason === "BD" && item.omittedBytes > 0),
    true,
  );
});

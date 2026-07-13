import { renderCompactEvidence } from "./compact-evidence.mjs";
import { sha256 } from "./hash.mjs";

const RESPONSE_LIMIT = 160;
const DIFF_LIMIT = 550;
const FILE_LIMIT = 600;

export function operationIdentity(name, definitions) {
  const content = definitions.map((definition) => typeof definition === "function" ? definition.toString() : JSON.stringify(definition)).join("\n---\n");
  return `${name}@${sha256(content)}`;
}

function byteLength(value) {
  return Buffer.byteLength(String(value ?? ""));
}

function bounded(value, limit) {
  const text = String(value ?? "");
  if (byteLength(text) <= limit) return { text, omittedBytes: 0 };
  const side = Math.floor((limit - 32) / 2);
  const excerpt = `${text.slice(0, side)}\n[...exact source omitted...]\n${text.slice(-side)}`;
  return { text: excerpt, omittedBytes: byteLength(text) - byteLength(excerpt) };
}

function compactPatchSections(diff) {
  const sections = [];
  let current = null;
  let omittedBytes = 0;
  for (const line of String(diff ?? "").split("\n")) {
    const lineBytes = byteLength(line) + 1;
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      current = { path: match?.[2] ?? line.slice("diff --git ".length), lines: [] };
      sections.push(current);
      omittedBytes += lineBytes;
    } else if (!current) {
      if (line) omittedBytes += lineBytes;
    } else if (line.startsWith("@@") || ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---"))) {
      current.lines.push(line);
    } else if (line) omittedBytes += lineBytes;
  }
  return { sections, omittedBytes };
}

function criterionValue(criterion) {
  const turns = criterion.turn_ids?.length ? `\nTURNS ${criterion.turn_ids.join(",")}` : "";
  return `ID ${criterion.id}${turns}\nRUBRIC ${criterion.rubric}`;
}

function turnValue(turn, priorSections, index) {
  const omissions = [];
  if (turn.natural_prompt) omissions.push({ reason: "natural-prompt-not-required", span: `json:/evidence/turns/${index}/natural_prompt`, omittedBytes: byteLength(turn.natural_prompt) });
  const response = bounded(turn.final_response, RESPONSE_LIMIT);
  if (response.omittedBytes > 0) omissions.push({ reason: "bounded-response-excerpt", span: `json:/evidence/turns/${index}/final_response`, omittedBytes: response.omittedBytes });

  const reduced = compactPatchSections(turn.diff);
  if (reduced.omittedBytes > 0) omissions.push({ reason: "unmodified-diff-context-and-transport-headers", span: `json:/evidence/turns/${index}/diff`, omittedBytes: reduced.omittedBytes });
  const diff = [];
  for (const section of reduced.sections) {
    const content = section.lines.join("\n");
    const hash = sha256(content);
    const prior = priorSections.get(section.path);
    if (prior?.hash === hash) {
      diff.push(`FILE ${section.path} SAME_AS ${prior.turn}`);
      omissions.push({ reason: "duplicate-diff-section", span: `json:/evidence/turns/${index}/diff`, omittedBytes: byteLength(content) });
    } else {
      const excerpt = bounded(content, DIFF_LIMIT);
      diff.push(`FILE ${section.path}\n${excerpt.text}`);
      if (excerpt.omittedBytes > 0) omissions.push({ reason: "bounded-diff-excerpt", span: `json:/evidence/turns/${index}/diff`, omittedBytes: excerpt.omittedBytes });
      priorSections.set(section.path, { hash, turn: turn.id });
    }
  }
  return {
    value: [`TURN ${turn.id}`, `RESPONSE_EXCERPT\n${response.text}`, `CHANGED_PATHS ${(turn.changed_paths ?? []).join(",")}`, `DIFF_CHANGE_EXCERPTS\n${diff.join("\n")}`].join("\n"),
    omissions,
    response_sha256: sha256(String(turn.final_response ?? "")),
  };
}

function oneShotValue(evidence) {
  const omissions = [];
  if (evidence.natural_prompt) omissions.push({ reason: "natural-prompt-not-required", span: "json:/evidence/natural_prompt", omittedBytes: byteLength(evidence.natural_prompt) });
  const response = bounded(evidence.final_response, RESPONSE_LIMIT);
  if (response.omittedBytes > 0) omissions.push({ reason: "bounded-response-excerpt", span: "json:/evidence/final_response", omittedBytes: response.omittedBytes });

  const files = (evidence.changed_file_contents ?? []).map((file, index) => {
    const excerpt = bounded(file.content ?? "<unavailable>", FILE_LIMIT);
    if (excerpt.omittedBytes > 0) omissions.push({ reason: "bounded-file-excerpt", span: `json:/evidence/changed_file_contents/${index}/content`, omittedBytes: excerpt.omittedBytes });
    return `FILE ${file.path}\n${excerpt.text}`;
  }).join("\n");
  const hasFiles = (evidence.changed_file_contents ?? []).length > 0;
  let diffValue = "";
  if (hasFiles && evidence.diff) {
    omissions.push({ reason: "diff-duplicated-by-changed-file-content", span: "json:/evidence/diff", omittedBytes: byteLength(evidence.diff) });
  } else if (!hasFiles) {
    const compact = compactPatchSections(evidence.diff);
    if (compact.omittedBytes > 0) omissions.push({ reason: "unmodified-diff-context-and-transport-headers", span: "json:/evidence/diff", omittedBytes: compact.omittedBytes });
    diffValue = compact.sections.map((section) => {
      const excerpt = bounded(section.lines.join("\n"), DIFF_LIMIT);
      if (excerpt.omittedBytes > 0) omissions.push({ reason: "bounded-diff-excerpt", span: "json:/evidence/diff", omittedBytes: excerpt.omittedBytes });
      return `FILE ${section.path}\n${excerpt.text}`;
    }).join("\n");
  }
  return {
    value: [`RESPONSE_EXCERPT\n${response.text}`, `CHANGED_PATHS ${(evidence.changed_paths ?? []).join(",")}`, hasFiles ? `CHANGED_FILE_EXCERPTS\n${files}` : `DIFF_CHANGE_EXCERPTS\n${diffValue}`].join("\n"),
    omissions,
    response_sha256: sha256(String(evidence.final_response ?? "")),
  };
}

function turnCollectionValue(values) {
  return values.join("\n===NEXT_TURN===\n");
}

function omissionRecord(omissions, op) {
  return {
    type: "O",
    fields: {
      kind: "typed-omission-manifest",
      reason: "typed-source-reductions",
      omittedBytes: omissions.reduce((sum, omission) => sum + omission.omittedBytes, 0),
      source: "packet",
      span: "json:/evidence",
      detail: omissions.map((omission) => `${omission.reason},${omission.span},${omission.omittedBytes}`).join(";"),
      op,
      recovery: "exact-source",
    },
  };
}

const CRITERION_OP = operationIdentity("semantic-criterion-v1", [criterionValue]);
const TURN_OP = operationIdentity("semantic-turn-v1", [turnValue, turnCollectionValue, compactPatchSections, bounded, { RESPONSE_LIMIT, DIFF_LIMIT }]);
const ONE_SHOT_OP = operationIdentity("semantic-one-shot-v1", [oneShotValue, compactPatchSections, bounded, { RESPONSE_LIMIT, DIFF_LIMIT, FILE_LIMIT }]);
const OMIT_OP = operationIdentity("semantic-omission-v1", [omissionRecord]);

function validateSelectedTurns(evidence) {
  if (!Array.isArray(evidence.turns)) return;
  const selected = evidence.selected_turn_ids;
  const rendered = evidence.turns.map((turn) => turn.id);
  if (!Array.isArray(selected) || JSON.stringify(selected) !== JSON.stringify(rendered)) {
    throw new Error(`Selected turn IDs must exactly match ordered rendered turns: selected=${JSON.stringify(selected)} rendered=${JSON.stringify(rendered)}`);
  }
  for (const criterion of evidence.criteria) {
    if (JSON.stringify(criterion.turn_ids ?? []) !== JSON.stringify(selected)) throw new Error(`Criterion ${criterion.id} turn IDs must match selected turn IDs`);
  }
}

export function reduceSemanticPacket(packet, { bundle = "semantic-packet", sourcePath = "semantic-packet.json" } = {}) {
  if (packet?.schema_version !== 1 || !packet?.evidence || !Array.isArray(packet.evidence.criteria)) throw new Error("Invalid canonical semantic packet");
  const evidence = packet.evidence;
  validateSelectedTurns(evidence);
  const canonicalText = `${JSON.stringify(packet, null, 2)}\n`;
  const sourceHash = sha256(canonicalText);
  const records = [
    { type: "H", schema: "CEV1", fields: { label: evidence.label ?? "opaque", objectiveChecksPassed: String(evidence.objective_checks_passed === true), selectedTurns: (evidence.selected_turn_ids ?? []).join(",") } },
    { type: "S", fields: { id: "packet", kind: "file", path: sourcePath, sha256: sourceHash, bytes: Buffer.byteLength(canonicalText), recovery: "exact" } },
  ];
  for (let index = 0; index < evidence.criteria.length; index += 1) {
    const criterion = evidence.criteria[index];
    records.push({ type: "F", fields: { name: `criterion.${criterion.id}`, value: criterionValue(criterion), source: "packet", span: `json:/evidence/criteria/${index}`, op: CRITERION_OP, recovery: "exact-source" } });
  }

  const omissions = [];
  const responseHashes = {};
  if (Array.isArray(evidence.turns)) {
    const priorSections = new Map();
    const turnValues = [];
    for (let index = 0; index < evidence.turns.length; index += 1) {
      const turn = evidence.turns[index];
      const reduced = turnValue(turn, priorSections, index);
      omissions.push(...reduced.omissions);
      responseHashes[turn.id] = reduced.response_sha256;
      turnValues.push(reduced.value);
    }
    records.push({ type: "F", fields: { name: "turns", value: turnCollectionValue(turnValues), source: "packet", span: "json:/evidence/turns", op: TURN_OP, recovery: "exact-source" } });
  } else {
    const reduced = oneShotValue(evidence);
    omissions.push(...reduced.omissions);
    responseHashes["one-shot"] = reduced.response_sha256;
    records.push({ type: "F", fields: { name: "one-shot", value: reduced.value, source: "packet", span: "json:/evidence", op: ONE_SHOT_OP, recovery: "exact-source" } });
  }
  for (const omission of evidence.source_omissions ?? []) {
    omissions.push({ reason: omission.reason, span: omission.span, omittedBytes: omission.omitted_bytes });
  }
  if (omissions.length > 0) records.push(omissionRecord(omissions, OMIT_OP));
  records.push({ type: "R", fields: { bundle, canonicalSha256: sourceHash, recovery: "exact" } });

  return {
    canonical: packet,
    records,
    rendered: renderCompactEvidence({ canonical: packet, records }),
    parity: { criterion_ids: evidence.criteria.map((criterion) => criterion.id), selected_turn_ids: evidence.selected_turn_ids ?? [], source_sha256: sourceHash, omissions: omissions.length, omitted_bytes: omissions.reduce((sum, omission) => sum + omission.omittedBytes, 0), response_sha256: responseHashes },
  };
}

import { renderCompactEvidence } from "./compact-evidence.mjs";
import { sha256, stableJson } from "./hash.mjs";

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
  const response = bounded(turn.final_response, RESPONSE_LIMIT);
  if (response.omittedBytes > 0) omissions.push({ reason: "bounded-response-excerpt", span: `/evidence/turns/${index}/final_response`, omittedBytes: response.omittedBytes });

  const reduced = compactPatchSections(turn.diff);
  if (reduced.omittedBytes > 0) omissions.push({ reason: "unmodified-diff-context-and-transport-headers", span: `/evidence/turns/${index}/diff`, omittedBytes: reduced.omittedBytes });
  const diff = [];
  for (const section of reduced.sections) {
    const content = section.lines.join("\n");
    const hash = sha256(content);
    const prior = priorSections.get(section.path);
    if (prior?.hash === hash) {
      diff.push(`FILE ${section.path} SAME_AS ${prior.turn}`);
      omissions.push({ reason: "duplicate-diff-section", span: `/evidence/turns/${index}/diff`, omittedBytes: byteLength(content) });
    } else {
      const excerpt = bounded(content, DIFF_LIMIT);
      diff.push(`FILE ${section.path}\n${excerpt.text}`);
      if (excerpt.omittedBytes > 0) omissions.push({ reason: "bounded-diff-excerpt", span: `/evidence/turns/${index}/diff`, omittedBytes: excerpt.omittedBytes });
      priorSections.set(section.path, { hash, turn: turn.id });
    }
  }
  return {
    value: [`TURN ${turn.id}`, `NATURAL_PROMPT\n${turn.natural_prompt ?? ""}`, `RESPONSE_EXCERPT\n${response.text}`, `CHANGED_PATHS ${(turn.changed_paths ?? []).join(",")}`, `DIFF_CHANGE_EXCERPTS\n${diff.join("\n")}`].join("\n"),
    omissions,
    response_sha256: sha256(String(turn.final_response ?? "")),
  };
}

function oneShotValue(evidence) {
  const omissions = [];
  const response = bounded(evidence.final_response, RESPONSE_LIMIT);
  if (response.omittedBytes > 0) omissions.push({ reason: "bounded-response-excerpt", span: "/evidence/final_response", omittedBytes: response.omittedBytes });

  const changedFiles = evidence.changed_file_contents ?? [];
  const files = changedFiles.map((file, index) => {
    const excerpt = bounded(file.status === "deleted" || file.content === null ? "<deleted>" : (file.content ?? "<unavailable>"), FILE_LIMIT);
    if (excerpt.omittedBytes > 0) omissions.push({ reason: "bounded-file-excerpt", span: `/evidence/changed_file_contents/${index}/content`, omittedBytes: excerpt.omittedBytes });
    return `FILE ${file.path}${file.status === "deleted" ? " STATUS deleted" : ""}\n${excerpt.text}`;
  }).join("\n");
  const unavailableFiles = (evidence.changed_file_unavailable ?? []).map((file) => `FILE ${file.path} UNAVAILABLE ${file.reason}`).join("\n");
  const hasFiles = changedFiles.length > 0;
  const compact = compactPatchSections(evidence.diff);
  const availablePaths = new Set(changedFiles.filter((file) => (file.status ?? "available") === "available").map((file) => file.path));
  const allDiffDuplicated = compact.sections.length > 0 && compact.sections.every((section) => availablePaths.has(section.path));
  let diffValue = "";
  if (allDiffDuplicated && evidence.diff) {
    omissions.push({ reason: "diff-duplicated-by-changed-file-content", span: "/evidence/diff", omittedBytes: byteLength(evidence.diff) });
  } else {
    if (compact.omittedBytes > 0) omissions.push({ reason: "unmodified-diff-context-and-transport-headers", span: "/evidence/diff", omittedBytes: compact.omittedBytes });
    diffValue = compact.sections.map((section) => {
      const excerpt = bounded(section.lines.join("\n"), DIFF_LIMIT);
      if (excerpt.omittedBytes > 0) omissions.push({ reason: "bounded-diff-excerpt", span: "/evidence/diff", omittedBytes: excerpt.omittedBytes });
      return `FILE ${section.path}\n${excerpt.text}`;
    }).join("\n");
  }
  const values = [`NATURAL_PROMPT\n${evidence.natural_prompt ?? ""}`, `RESPONSE_EXCERPT\n${response.text}`, `CHANGED_PATHS ${(evidence.changed_paths ?? []).join(",")}`];
  if (hasFiles) values.push(`CHANGED_FILE_EXCERPTS\n${files}`);
  if (unavailableFiles) values.push(`UNAVAILABLE_CHANGED_FILES\n${unavailableFiles}`);
  if (diffValue) values.push(`DIFF_CHANGE_EXCERPTS\n${diffValue}`);
  return {
    value: values.join("\n"),
    omissions,
    response_sha256: sha256(String(evidence.final_response ?? "")),
  };
}

function turnCollectionValue(values) {
  return values.join("\n===NEXT_TURN===\n");
}

function objectiveAssertionValue(assertion) {
  return stableJson({ type: assertion.type, state: assertion.state, ...(assertion.evidence === undefined ? {} : { evidence: assertion.evidence }) });
}

const OMISSION_CODES = Object.freeze({
  "bounded-response-excerpt": "BR",
  "unmodified-diff-context-and-transport-headers": "DC",
  "bounded-diff-excerpt": "BD",
  "duplicate-diff-section": "DD",
  "bounded-file-excerpt": "BF",
  "diff-duplicated-by-changed-file-content": "DF",
  "upstream-byte-cap": "UC",
});

function omissionRecord(omissions, op) {
  return {
    type: "O",
    fields: {
      kind: "manifest",
      reason: "typed",
      omittedBytes: omissions.reduce((sum, omission) => sum + omission.omittedBytes, 0),
      source: "p",
      span: "/evidence",
      detail: omissions.map((omission) => `${OMISSION_CODES[omission.reason] ?? omission.reason},${omission.span},${omission.omittedBytes}`).join(";"),
      op,
      recovery: "exact-source",
    },
  };
}

const CRITERION_OP = operationIdentity("c", [criterionValue]);
const OBJECTIVE_OP = operationIdentity("j", [objectiveAssertionValue, stableJson]);
const TURN_OP = operationIdentity("t", [turnValue, turnCollectionValue, compactPatchSections, bounded, { RESPONSE_LIMIT, DIFF_LIMIT }]);
const ONE_SHOT_OP = operationIdentity("s", [oneShotValue, compactPatchSections, bounded, { RESPONSE_LIMIT, DIFF_LIMIT, FILE_LIMIT }]);
const OMIT_OP = operationIdentity("o", [omissionRecord, OMISSION_CODES]);

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
    { type: "H", schema: "CEV1", fields: { l: evidence.label ?? "opaque", o: String(evidence.objective_checks_passed === true), t: (evidence.selected_turn_ids ?? []).join(",") } },
    { type: "S", fields: { id: "p", kind: "file", path: sourcePath, sha256: sourceHash, bytes: Buffer.byteLength(canonicalText), recovery: "exact" } },
  ];
  for (let index = 0; index < evidence.criteria.length; index += 1) {
    const criterion = evidence.criteria[index];
    records.push({ type: "F", fields: { name: `c.${criterion.id}`, value: criterionValue(criterion), source: "p", span: `/evidence/criteria/${index}`, op: CRITERION_OP, recovery: "exact-source" } });
  }
  for (let index = 0; index < (evidence.objective_assertions ?? []).length; index += 1) {
    const assertion = evidence.objective_assertions[index];
    records.push({ type: "F", fields: { name: `o.${assertion.id}`, value: objectiveAssertionValue(assertion), source: "p", span: `/evidence/objective_assertions/${index}`, op: OBJECTIVE_OP, recovery: "exact-source" } });
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
    records.push({ type: "F", fields: { name: "t", value: turnCollectionValue(turnValues), source: "p", span: "/evidence/turns", op: TURN_OP, recovery: "exact-source" } });
  } else {
    const reduced = oneShotValue(evidence);
    omissions.push(...reduced.omissions);
    responseHashes["one-shot"] = reduced.response_sha256;
    records.push({ type: "F", fields: { name: "s", value: reduced.value, source: "p", span: "/evidence", op: ONE_SHOT_OP, recovery: "exact-source" } });
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

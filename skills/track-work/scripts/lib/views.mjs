import { Buffer } from "node:buffer";
import {
  CHECKPOINT_FIELDS,
  DECISION_FIELDS,
  DECISION_STATES,
  HISTORICAL_SLICE_STATES,
  HISTORY_SLICE_FIELDS,
  HISTORY_SLICE_OPTIONAL_FIELDS,
  SLICE_STATES,
  SLICE_TYPES,
  TASK_STATES,
  ensureArray,
  sha256,
  fail,
} from "./model.mjs";
import {
  heading,
  renderActiveDecisionSummaries,
  renderCurrentSlice,
  renderEntity,
  renderHeadingField,
  renderHeadingList,
  renderNote,
  renderProposal,
  renderRecord,
} from "./codec.mjs";
import { versionControlEvidence } from "./workspace.mjs";
import { publicSourceUnits } from "./source-inventory.mjs";

import { recordMetadata } from "./result.mjs";

function viewHeader(data, recordSha) {
  const current = data.currentWork.currentSlice;
  const currentSlice = current ? `${current.id} — ${current.state} — ${current.type}` : "None";
  return [
    `Task: ${data.taskName}`,
    `Task state: ${data.taskState}`,
    `Schema: ${data.schemaVersion}`,
    `Last updated: ${data.lastUpdated}`,
    `Record SHA-256: ${recordSha ?? sha256(renderRecord(data))}`,
    `Current slice: ${currentSlice}`,
    "",
  ].join("\n");
}

function activeDecisionSummaries(data) {
  return data.history.decisions
    .filter((decision) => decision.state === "Active")
    .map((decision) => ({
      id: decision.id,
      title: decision.title,
      summary: decision.decision || decision.consequences || "",
    }));
}

function renderContextView(data, { includeDecisions = true } = {}) {
  const context = data.currentContext;
  const output = [
    "## Current Context",
    renderHeadingField("Goal", context.goal),
    renderHeadingField("What defines this task", context.whatDefinesTask),
    renderHeadingField("Settled", context.settled),
    renderHeadingField("Tentative", context.tentative),
    renderHeadingField("Open", context.open),
    renderHeadingField("Current direction", context.currentDirection),
    renderHeadingField("Boundaries", context.boundaries),
  ];
  if (includeDecisions) {
    const decisions = activeDecisionSummaries(data);
    if (decisions.length) output.push("### Active Decisions", renderActiveDecisionSummaries(decisions));
  }
  return `${output.filter(Boolean).join("\n")}\n`;
}

function renderWorkView(data) {
  const work = data.currentWork;
  return `${[
    "## Current Work",
    renderHeadingField("Current route", work.route),
    renderCurrentSlice(work.currentSlice),
    renderHeadingList("Blockers", work.blockers),
    renderHeadingList("Upcoming checkpoints", work.upcomingCheckpoints),
    renderHeadingField("Next useful action", work.nextAction),
  ]
    .filter(Boolean)
    .join("\n")}\n`;
}

function renderExecuteView(data) {
  const work = data.currentWork;
  const slice = work.currentSlice;
  const context = data.currentContext;
  return `${[
    "## Execute Current Outcome",
    renderHeadingField("Current route", work.route),
    renderHeadingField("Settled", context.settled),
    renderHeadingField("Open", context.open),
    renderHeadingField("Boundaries", context.boundaries),
    renderCurrentSlice(slice),
    renderHeadingList("Blockers", work.blockers),
    renderHeadingList("Upcoming checkpoints", work.upcomingCheckpoints),
    renderHeadingField("Next useful action", work.nextAction),
  ]
    .filter(Boolean)
    .join("\n")}\n`;
}

function renderSliceSummary(slice) {
  if (!slice) return "### Current Slice\nNone\n";
  return `${[
    "### Current Slice",
    renderHeadingField("ID", slice.id),
    renderHeadingField("Title", slice.title),
    renderHeadingField("State", slice.state),
    renderHeadingField("Type", slice.type),
    renderHeadingField("Intended result", slice.intendedResult),
  ]
    .filter(Boolean)
    .join("\n")}\n`;
}

export function renderNamedSection(data, section) {
  if (section === "Current Context") return renderContextView(data);
  if (section === "Current Work") return renderWorkView(data);
  if (section === "Proposed Slices") return `## Proposed Slices\n${data.proposals.map(renderProposal).join("")}\n`;
  if (section === "History")
    return [
      "## History",
      "### Decisions",
      data.history.decisions.map((item) => renderEntity(item, DECISION_FIELDS)).join(""),
      "### Checkpoints",
      data.history.checkpoints.map((item) => renderEntity(item, CHECKPOINT_FIELDS)).join(""),
      "### Slices",
      data.history.slices
        .map((item) => renderEntity(item, HISTORY_SLICE_FIELDS, "####", HISTORY_SLICE_OPTIONAL_FIELDS))
        .join(""),
      "",
    ].join("\n");
  if (section === "Notes") return `## Notes\n${data.notes.map(renderNote).join("")}\n`;
  fail("invalid-section", `Unknown record section: ${section}`);
}

export function renderView(data, view, entity, limit = 5, recordSha) {
  const header = viewHeader(data, recordSha);
  let content;
  if (view === "resume")
    content = `${header}${renderContextView(data)}${renderWorkView(data)}\n## Proposed Slices\n${data.proposals.map(renderProposal).join("")}`;
  else if (view === "discuss")
    content = `${header}${renderContextView(data)}\n## Proposed Slices\n${data.proposals.map(renderProposal).join("")}\n${renderSliceSummary(data.currentWork.currentSlice)}\n### Note titles\n${data.notes.map((note) => `- ${note.title}`).join("\n")}\n`;
  else if (view === "execute") content = `${header}${renderExecuteView(data)}`;
  else if (view === "recent") {
    const slices = data.history.slices.slice(-limit);
    content = `${header}## Recent History\n${slices
      .map((slice) => renderEntity(slice, HISTORY_SLICE_FIELDS, "####", HISTORY_SLICE_OPTIONAL_FIELDS, false))
      .join("")}`;
  } else if (view === "entity") {
    if (!entity) fail("invalid-arguments", "entity view requires --entity");
    const found = findEntity(data, entity);
    if (!found) fail("missing-entity", `No entity matched: ${entity}`);
    content = `${header}${found.content}`;
  } else if (view === "full") content = `${header}${renderRecord(data, { includeHeader: false })}`;
  else fail("invalid-view", `Unknown view: ${view}`);
  return content.endsWith("\n") ? content : `${content}\n`;
}

export function renderRecordHeaderOnly(data) {
  const current = data.currentWork.currentSlice;
  return [
    `# Working Record: ${data.taskName}`,
    "",
    `Schema: ${data.schemaVersion}`,
    `State: ${data.taskState}`,
    `Last updated: ${data.lastUpdated}`,
    current ? `Current Slice: ${current.id} — ${current.state} — ${current.type}` : "Current Slice: None",
    "",
  ].join("\n");
}

function findEntity(data, identifier) {
  const collections = [
    ...data.history.slices.map((item) => ({
      item,
      content: renderEntity(item, HISTORY_SLICE_FIELDS, "####", HISTORY_SLICE_OPTIONAL_FIELDS, false),
    })),
    ...data.history.decisions.map((item) => ({ item, content: renderEntity(item, DECISION_FIELDS) })),
    ...data.history.checkpoints.map((item) => ({ item, content: renderEntity(item, CHECKPOINT_FIELDS) })),
    ...data.proposals.map((item) => ({ item, content: renderProposal(item) })),
    ...(data.currentWork.currentSlice
      ? [{ item: data.currentWork.currentSlice, content: renderCurrentSlice(data.currentWork.currentSlice) }]
      : []),
    ...data.notes.map((item) => ({ item, content: renderNote(item) })),
  ];
  const matches = collections.filter(({ item }) => item.id === identifier || item.title === identifier);
  if (matches.length > 1) fail("ambiguous-entity", `Entity identifier is ambiguous: ${identifier}`);
  return matches[0] ?? null;
}

export function unavailableRecord(root, path, sha, reason, data = null) {
  const unavailableFields = ["schemaVersion", "taskState", "lastUpdated", "currentSlice"];
  return recordMetadata(root, path, data, sha, "unavailable", unavailableFields.concat(reason ? [reason] : []));
}

function legacyHeadingRange(raw, predicate) {
  const lines = raw.split("\n");
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const found = heading(lines[index]);
    if (found && predicate(found)) matches.push({ index, ...found });
  }
  if (matches.length !== 1) {
    if (matches.length > 1) fail("legacy-view-ambiguous", "Legacy view request matched multiple headings");
    fail("legacy-view-unavailable", "Legacy view request could not be resolved unambiguously");
  }
  const match = matches[0];
  let end = lines.length;
  for (let index = match.index + 1; index < lines.length; index += 1) {
    const found = heading(lines[index]);
    if (found && found.level <= match.level) {
      end = index;
      break;
    }
  }
  return lines.slice(match.index, end).join("\n");
}

function legacyEntityView(raw, identifier) {
  const prefix = `${identifier} —`;
  return legacyHeadingRange(raw, (found) => found.title === identifier || found.title.startsWith(prefix));
}

function legacySectionView(raw, title) {
  return legacyHeadingRange(raw, (found) => found.level === 2 && found.title === title);
}

export function legacyView(loaded, view, entity, section) {
  if (view === "full") return loaded.raw;
  const state = loaded.data.taskState ?? "Unavailable";
  const slice = loaded.data.currentWork.currentSlice;
  const header = [
    `Task: ${loaded.data.taskName}`,
    `Task state: ${state}`,
    `Schema: unavailable (${loaded.kind === "legacy" ? "legacy" : "unsupported"} record)`,
    "Last updated: unavailable",
    `Record SHA-256: ${loaded.rawSha ?? "unavailable"} (unconfirmed raw bytes)`,
    `Current slice: ${slice ? `${slice.id ?? "unavailable"} — ${slice.state ?? "unavailable"} — ${slice.type ?? "unavailable"}` : "None or unavailable"}`,
    "",
  ].join("\n");
  let body;
  if (view === "entity") {
    if (!entity) fail("legacy-view-unavailable", "Legacy entity view requires --entity");
    body = legacyEntityView(loaded.raw, entity);
  } else if (view === "section") {
    if (!section) fail("legacy-view-unavailable", "Legacy section view requires --section");
    body = legacySectionView(loaded.raw, section);
  } else if (view === "execute") {
    body = legacySectionView(loaded.raw, "Current Work");
  } else if (view === "discuss") {
    body = [legacySectionView(loaded.raw, "Current Context"), legacySectionView(loaded.raw, "Proposed Slices")].join(
      "\n\n",
    );
  } else if (view === "recent") {
    body = legacySectionView(loaded.raw, "History");
  } else if (view === "resume") {
    const sections = ["Current Context", "Current Work"].map((title) => legacySectionView(loaded.raw, title));
    body = sections.join("\n\n");
  } else {
    fail("legacy-view-unavailable", `Legacy view is not supported: ${view}`);
  }
  return `${header}${body}\n`;
}

export async function inspectData(root, loaded) {
  const data = loaded.data;
  const warnings = [];
  const legacyReport = loaded.kind === "v2" ? null : inspectLegacyRaw(loaded.raw);
  if (loaded.kind !== "v2") {
    warnings.push({
      code: loaded.kind === "legacy" ? "legacy-read-only" : "unsupported-schema-read-only",
      message: "Legacy or unsupported record is read-only",
    });
    warnings.push(...legacyReport.warnings);
  }
  const full = loaded.text;
  const views = {};
  if (loaded.kind === "v2") {
    for (const view of ["resume", "discuss", "execute", "recent", "full"])
      views[view] = Buffer.byteLength(renderView(data, view, undefined, 5, loaded.rawSha), "utf8");
  }
  const entries = [
    ...(data.history.slices ?? []),
    ...(data.history.decisions ?? []),
    ...(data.history.checkpoints ?? []),
  ];
  const repeatedHashes = findRepeatedEvidence(data);
  if (repeatedHashes.length)
    warnings.push({
      code: "repeated-evidence",
      message: "Repeated exact evidence pointers or hashes detected",
      values: repeatedHashes,
    });
  if ((data.history.slices ?? []).some((slice) => slice.whatHappensNext))
    warnings.push({ code: "historical-next-action", message: "Historical slice contains What happens next" });
  const reviewTitles = (data.history.slices ?? []).filter((slice) =>
    /review|correction|commit|test/i.test(slice.title ?? ""),
  );
  if (reviewTitles.length > 1)
    warnings.push({
      code: "activity-shaped-slices",
      message: "Review, correction, test, or commit-shaped historical slices detected",
      ids: reviewTitles.map((slice) => slice.id),
    });
  return {
    lineCount: full.split("\n").length,
    wordCount: full.trim() ? full.trim().split(/\s+/).length : 0,
    byteCount: Buffer.byteLength(full, "utf8"),
    sectionSizes: views,
    parserConfidence: loaded.kind === "v2" ? "schema-v2" : legacyReport.parserConfidence,
    sourceUnits: loaded.kind === "v2" ? [] : publicSourceUnits(loaded.text),
    orphanedBlocks: loaded.kind === "v2" ? [] : legacyReport.orphanedBlocks,
    ambiguities: loaded.kind === "v2" ? [] : legacyReport.ambiguities,
    counts: {
      decisions: data.history.decisions?.length ?? 0,
      proposals: data.proposals?.length ?? 0,
      checkpoints: data.history.checkpoints?.length ?? 0,
      slices: loaded.kind === "v2" ? (data.history.slices?.length ?? 0) : legacyReport.slices.length,
      notes: data.notes?.length ?? 0,
    },
    largestHistoricalEntries: entries
      .map((entry) => ({ id: entry.id, title: entry.title, bytes: Buffer.byteLength(JSON.stringify(entry), "utf8") }))
      .sort((left, right) => right.bytes - left.bytes)
      .slice(0, 5),
    warnings,
    versionControl: await versionControlEvidence(root, loaded.path),
    legacy: loaded.kind !== "v2",
  };
}

function findRepeatedEvidence(data) {
  const values = [];
  for (const slice of data.history.slices ?? []) values.push(...ensureArray(slice.evidence));
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function inspectLegacyRaw(raw) {
  const warnings = [];
  const slices = [...raw.matchAll(/^####\s+(S-\d{3})\s+—\s+(.+)$/gm)].map((match) => ({
    id: match[1],
    title: match[2],
  }));
  const reviewSlices = slices.filter((slice) => /review|correction|commit|test/i.test(slice.title));
  if (reviewSlices.length > 1) {
    warnings.push({
      code: "activity-shaped-slices",
      message: "Legacy history contains review, correction, test, or commit-shaped slices",
      ids: reviewSlices.map((slice) => slice.id),
    });
  }
  if (/^What happens next:\s*/m.test(raw)) {
    warnings.push({ code: "historical-next-action", message: "Legacy history contains What happens next fields" });
  }
  const invalidTypes = [...raw.matchAll(/^- Type:\s*(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((type) => !SLICE_TYPES.has(type));
  if (invalidTypes.length) {
    warnings.push({
      code: "invalid-slice-type",
      message: "Legacy record contains slice types outside schema vocabulary",
      values: invalidTypes,
    });
  }
  const invalidStates = [...raw.matchAll(/^- State:\s*(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(
      (state) => !new Set([...SLICE_STATES, ...HISTORICAL_SLICE_STATES, ...DECISION_STATES, ...TASK_STATES]).has(state),
    );
  if (invalidStates.length) {
    warnings.push({
      code: "invalid-state",
      message: "Legacy record contains states outside schema vocabulary",
      values: invalidStates,
    });
  }
  const consecutiveActivity = slices
    .map((slice) => /review|correction/i.test(slice.title))
    .reduce((max, value, index, values) => {
      if (!value) return 0;
      let length = 1;
      for (let cursor = index + 1; cursor < values.length && values[cursor]; cursor += 1) length += 1;
      return Math.max(max, length);
    }, 0);
  if (consecutiveActivity > 1) {
    warnings.push({
      code: "review-correction-chain",
      message: "Legacy record contains a consecutive review/correction slice chain",
      length: consecutiveActivity,
    });
  }
  const ids = slices.map((slice) => slice.id);
  const ambiguities = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (ambiguities.length)
    warnings.push({
      code: "legacy-ambiguity",
      message: "Legacy record contains duplicate entity identifiers",
      ids: ambiguities,
    });
  const orphanedBlocks = raw
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => /^- (?:ID|State|Type|Intended result|Authority source):/.test(line));
  if (orphanedBlocks.length)
    warnings.push({
      code: "orphaned-block",
      message: "Legacy record contains field blocks that require ownership inspection",
      lines: orphanedBlocks,
    });
  return { slices, warnings, parserConfidence: "best-effort", orphanedBlocks, ambiguities };
}

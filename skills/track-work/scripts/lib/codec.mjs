import {
  ARRAY_FIELDS,
  CHECKPOINT_FIELDS,
  SCHEMA_VERSION,
  TOP_LEVEL_SECTIONS,
  CONTEXT_FIELDS,
  DECISION_FIELDS,
  HISTORY_SLICE_FIELDS,
  HISTORY_SLICE_OPTIONAL_FIELDS,
  PROPOSAL_FIELDS,
  SLICE_FIELDS,
  SLICE_OPTIONAL_FIELDS,
  compactObject,
  ensureArray,
  ensureString,
  fail,
  failureInjection,
  normalizeLineEndings,
} from "./model.mjs";

export function heading(line) {
  const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
  return match ? { level: match[1].length, title: match[2] } : null;
}

function headingBlocks(lines, level) {
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const found = heading(line);
    if (found && found.level < level) {
      if (current) blocks.push(current);
      else fail("unowned-content", `Unexpected heading in ${level}-heading section: ${line}`);
      current = null;
      continue;
    }
    if (found && found.level === level) {
      if (current) blocks.push(current);
      current = { title: found.title, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else if (line.trim()) fail("unowned-content", `Unowned content in ${level}-heading section: ${line}`);
  }
  if (current) blocks.push(current);
  return blocks;
}

function exactHeadingBlock(blocks, title, { required = false } = {}) {
  const matches = blocks.filter((block) => block.title === title);
  if (matches.length > 1) fail("duplicate-section", `Duplicate section or field: ${title}`);
  if (required && matches.length === 0) fail("missing-section", `Missing required section or field: ${title}`);
  return matches[0] ?? null;
}

function unescapeContentLine(line) {
  return line.startsWith("    #") ? line.slice(4) : line;
}

function readTextBlock(lines) {
  const normalized = lines.map(unescapeContentLine);
  while (normalized[0] === "") normalized.shift();
  while (normalized.at(-1) === "") normalized.pop();
  return normalized.join("\n");
}

function escapeContentLine(line) {
  return /^#{1,6}[ \t]+/.test(line) ? `    ${line}` : line;
}

function renderTextBlock(value) {
  return ensureString(value).split("\n").map(escapeContentLine).join("\n");
}

const FIELD_ALIASES = new Map([
  ["Who decided or what established it", "establishedBy"],
  ["Rationale and sources", "rationale"],
  ["Starting code or artifact state", "startingState"],
  ["Accepted extensions and authority", "acceptedExtensions"],
  ["Judgment or decision", "judgment"],
  ["Evidence or result pointer", "evidence"],
  ["Effect on the task", "effect"],
  ["Blocker and required resolution", "blocker"],
]);

function keyFromLabel(label) {
  const trimmed = label.trim();
  if (FIELD_ALIASES.has(trimmed)) return FIELD_ALIASES.get(trimmed);
  return trimmed.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, character) => character.toUpperCase());
}

function parseBulletFields(lines, { strict = true } = {}) {
  const fields = new Map();
  let current = null;
  for (const line of lines) {
    const match = /^- ([^:]+):(?:[ \t]?(.*))?$/.exec(line);
    if (match) {
      const label = match[1].trim();
      const key = keyFromLabel(label);
      if (fields.has(key)) fail("duplicate-field", `Duplicate field: ${label}`);
      current = { label, lines: match[2] === undefined || match[2] === "" ? [] : [match[2]] };
      fields.set(key, current);
      continue;
    }
    if (!current) {
      if (strict && line.trim()) fail("unowned-content", `Unowned field content: ${line}`);
      continue;
    }
    if (line.startsWith("  ")) current.lines.push(line.slice(2));
    else if (line === "") current.lines.push("");
    else current.lines.push(line);
  }
  return fields;
}

function assertKnownAndRequiredFields(fields, definitions, scope, optionalDefinitions = [], requiredDefinitions = []) {
  const known = new Set([...definitions, ...optionalDefinitions].map(([, key]) => key));
  for (const [key, field] of fields) {
    if (!known.has(key)) fail("unknown-field", `Unknown ${scope} field: ${field.label}`);
  }
  for (const [label, key] of requiredDefinitions) {
    if (!fields.has(key)) fail("missing-field", `Missing ${scope} field: ${label}`);
  }
}

function assertKnownHeadings(blocks, definitions, scope, optionalDefinitions = []) {
  const known = new Set([...definitions, ...optionalDefinitions].map(([label]) => label));
  for (const block of blocks) {
    if (!known.has(block.title)) fail("unknown-field", `Unknown ${scope} field: ${block.title}`);
  }
  for (const [label] of definitions) {
    if (!blocks.some((block) => block.title === label)) fail("missing-field", `Missing ${scope} field: ${label}`);
  }
}

function rawField(fields, key) {
  return fields.get(key)?.lines ?? [];
}

function parsedField(fields, key, { array = false, json = false } = {}) {
  const lines = rawField(fields, key);
  if (array || ARRAY_FIELDS.has(key)) {
    return lines.map((line) => (line.startsWith("- ") ? line.slice(2) : line)).filter((line) => line !== "");
  }
  const text = readTextBlock(lines);
  if (json && text) {
    try {
      return JSON.parse(text);
    } catch {
      fail("invalid-json-field", `Field ${key} must contain valid JSON`);
    }
  }
  return text;
}

function renderFieldValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => `  - ${escapeContentLine(String(item))}`).join("\n") : "";
  }
  if (value && typeof value === "object") return `  ${escapeContentLine(JSON.stringify(value))}`;
  const text = ensureString(value);
  return text
    .split("\n")
    .map((line, index) => (index === 0 ? escapeContentLine(line) : `  ${escapeContentLine(line)}`))
    .join("\n");
}

function renderBulletFields(fields, definitions) {
  return definitions
    .map(([label, key]) => {
      if (fields[key] === undefined || fields[key] === null) return null;
      const rendered = renderFieldValue(fields[key]);
      return rendered ? `- ${label}: ${rendered}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

function parseStructuredField(fields, key) {
  const text = parsedField(fields, key);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function renderHeadingField(label, value) {
  const rendered = renderTextBlock(value);
  return rendered.trim() ? `### ${label}\n${rendered}\n` : "";
}

function parseCurrentSlice(lines) {
  if (readTextBlock(lines).trim() === "None") return null;
  const fields = parseBulletFields(lines);
  assertKnownAndRequiredFields(fields, SLICE_FIELDS, "Current Slice", SLICE_OPTIONAL_FIELDS, [
    ["ID", "id"],
    ["Title", "title"],
    ["State", "state"],
    ["Type", "type"],
    ["Intended result", "intendedResult"],
    ["Authority source", "authoritySource"],
    ["Reason and scope", "reasonAndScope"],
    ["Expected evidence", "expectedEvidence"],
    ["Stop condition", "stopCondition"],
  ]);
  const slice = {
    id: parsedField(fields, "id"),
    title: parsedField(fields, "title"),
    state: parsedField(fields, "state"),
    type: parsedField(fields, "type"),
    intendedResult: parsedField(fields, "intendedResult"),
    authoritySource: parsedField(fields, "authoritySource"),
    reasonAndScope: parsedField(fields, "reasonAndScope"),
    expectedEvidence: parsedField(fields, "expectedEvidence"),
    stopCondition: parsedField(fields, "stopCondition"),
    startingState: parsedField(fields, "startingState"),
    acceptedExtensions: parsedField(fields, "acceptedExtensions", { array: true }),
    dependencies: parsedField(fields, "dependencies", { array: true }),
    selectedCheckpoints: parsedField(fields, "selectedCheckpoints", { array: true }),
    blocker: parseStructuredField(fields, "blocker"),
    resumeWhen: parsedField(fields, "resumeWhen"),
    blockerHistory: parsedField(fields, "blockerHistory", { array: true }),
    pendingBoundaries: parsedField(fields, "pendingBoundaries", { array: true }),
    pendingReviews: parsedField(fields, "pendingReviews", { array: true }),
    reopenHistory: parsedField(fields, "reopenHistory", { array: true }),
    result: parsedField(fields, "result"),
    evidence: parsedField(fields, "evidence", { array: true }),
    reviewSummary: parsedField(fields, "reviewSummary"),
    taskEffect: parsedField(fields, "taskEffect"),
  };
  return compactObject(slice);
}

export function renderCurrentSlice(slice) {
  if (!slice) return "### Current Slice\nNone\n";
  const values = {
    id: slice.id,
    title: slice.title,
    state: slice.state,
    type: slice.type,
    intendedResult: slice.intendedResult,
    authoritySource: slice.authoritySource,
    reasonAndScope: slice.reasonAndScope,
    expectedEvidence: slice.expectedEvidence,
    stopCondition: slice.stopCondition,
    startingState: slice.startingState,
    acceptedExtensions: slice.acceptedExtensions,
    dependencies: slice.dependencies,
    selectedCheckpoints: slice.selectedCheckpoints,
    blocker: slice.blocker ?? "",
    resumeWhen: slice.resumeWhen,
    blockerHistory: slice.blockerHistory,
    pendingBoundaries: slice.pendingBoundaries,
    pendingReviews: slice.pendingReviews,
    reopenHistory: slice.reopenHistory,
    result: slice.result,
    evidence: slice.evidence,
    reviewSummary: slice.reviewSummary,
    taskEffect: slice.taskEffect,
  };
  return `### Current Slice\n${renderBulletFields(values, [...SLICE_FIELDS, ...SLICE_OPTIONAL_FIELDS])}\n`;
}

function parseProposal(block) {
  const fields = parseBulletFields(block.lines);
  assertKnownAndRequiredFields(
    fields,
    PROPOSAL_FIELDS,
    "proposal",
    [],
    [
      ["Type", "type"],
      ["Intended result", "intendedResult"],
      ["Expected evidence", "expectedEvidence"],
    ],
  );
  return compactObject({
    title: block.title,
    type: parsedField(fields, "type"),
    intendedResult: parsedField(fields, "intendedResult"),
    expectedEvidence: parsedField(fields, "expectedEvidence"),
    dependencies: parsedField(fields, "dependencies", { array: true }),
    selectedCheckpoints: parsedField(fields, "selectedCheckpoints", { array: true }),
  });
}

export function renderProposal(proposal) {
  return `### ${proposal.title}\n${renderBulletFields(proposal, PROPOSAL_FIELDS)}\n`;
}

function parseEntity(block, definitions, idFromTitle = true, optionalDefinitions = []) {
  const fields = parseBulletFields(block.lines);
  assertKnownAndRequiredFields(fields, definitions, "history entity", optionalDefinitions);
  const match = idFromTitle ? /^(?<id>[A-Z]-\d{3})\s+—\s+(?<title>.+)$/.exec(block.title) : null;
  return compactObject({
    ...(match ? { id: match.groups.id, title: match.groups.title } : { title: block.title }),
    ...Object.fromEntries(
      [...definitions, ...optionalDefinitions].map(([, key]) => [
        key,
        parsedField(fields, key, { array: ARRAY_FIELDS.has(key), json: ["blocker"].includes(key) }),
      ]),
    ),
  });
}

export function renderEntity(
  entity,
  definitions,
  headingPrefix = "####",
  optionalDefinitions = [],
  includeOptional = true,
) {
  const title = entity.id ? `${entity.id} — ${entity.title ?? entity.id}` : entity.title;
  const fields = includeOptional ? [...definitions, ...optionalDefinitions] : definitions;
  const values = Object.fromEntries(fields.map(([, key]) => [key, entity[key]]));
  return `${headingPrefix} ${title}\n${renderBulletFields(values, fields)}\n`;
}

export function renderActiveDecisionSummaries(decisions) {
  return decisions
    .map((decision) => {
      const summaryLines = ensureString(decision.summary).split("\n");
      return [
        `- ${decision.id} — ${decision.title}`,
        ...(decision.summary
          ? [`  Summary: ${summaryLines[0]}`, ...summaryLines.slice(1).map((line) => `  ${line}`)]
          : []),
      ].join("\n");
    })
    .join("\n");
}
function parseV2(text, path) {
  const lines = normalizeLineEndings(text).replace(/\n$/, "").split("\n");
  const first = /^# Working Record:\s*(.+)$/.exec(lines[0] ?? "");
  if (!first) fail("malformed-record", "Record must begin with '# Working Record: <task name>'", { path });
  const firstSectionIndex = lines.findIndex((line, index) => index > 0 && /^##[ \t]+/.test(line));
  if (firstSectionIndex < 0) fail("malformed-header", "Record is missing its first schema section", { path });
  const header = lines.slice(1, firstSectionIndex);
  const schemaMatch = /^Schema:\s*(\d+)$/.exec(header[1] ?? "");
  const stateMatch = /^State:\s*(.*)$/.exec(header[2] ?? "");
  const timestampMatch = /^Last updated:\s*(.*)$/.exec(header[3] ?? "");
  if (header.length !== 5 || header[0] !== "" || !schemaMatch || !stateMatch || !timestampMatch || header[4] !== "")
    fail("malformed-header", "Schema-v2 header must contain only the ordered Schema, State, and Last updated fields", {
      path,
    });
  if (Number(schemaMatch[1]) !== SCHEMA_VERSION)
    fail("unsupported-schema", `Unsupported record schema: ${schemaMatch[1]}`, { path });
  const topSections = headingBlocks(lines.slice(firstSectionIndex), 2);
  const foundNames = topSections.map((section) => section.title);
  for (const sectionName of TOP_LEVEL_SECTIONS) exactHeadingBlock(topSections, sectionName, { required: true });
  if (foundNames.join("\u0000") !== TOP_LEVEL_SECTIONS.join("\u0000"))
    fail("invalid-section-order", "Record sections must follow the schema order");

  const contextSection = exactHeadingBlock(topSections, "Current Context");
  const contextFields = headingBlocks(contextSection.lines, 3);
  assertKnownHeadings(contextFields, [], "Current Context", [
    ...CONTEXT_FIELDS,
    ["Active Decisions", "activeDecisions"],
  ]);
  const currentContext = Object.fromEntries(
    CONTEXT_FIELDS.map(([label, key]) => {
      const block = exactHeadingBlock(contextFields, label);
      return [key, readTextBlock(block?.lines ?? [])];
    }),
  );

  const workSection = exactHeadingBlock(topSections, "Current Work");
  const workFields = headingBlocks(workSection.lines, 3);
  const workDefinitions = [
    ["Current route", "route"],
    ["Current Slice", "currentSlice"],
    ["Blockers", "blockers"],
    ["Upcoming checkpoints", "upcomingCheckpoints"],
    ["Next useful action", "nextAction"],
  ];
  assertKnownHeadings(workFields, [["Current Slice", "currentSlice"]], "Current Work", workDefinitions);
  const currentSliceBlock = exactHeadingBlock(workFields, "Current Slice", { required: true });
  const currentWork = {
    route: readTextBlock(exactHeadingBlock(workFields, "Current route")?.lines ?? []),
    currentSlice: parseCurrentSlice(currentSliceBlock.lines),
    blockers: exactHeadingBlock(workFields, "Blockers")
      ? parseListHeading(exactHeadingBlock(workFields, "Blockers").lines)
      : [],
    upcomingCheckpoints: exactHeadingBlock(workFields, "Upcoming checkpoints")
      ? parseListHeading(exactHeadingBlock(workFields, "Upcoming checkpoints").lines)
      : [],
    nextAction: readTextBlock(exactHeadingBlock(workFields, "Next useful action")?.lines ?? []),
  };

  const proposalsSection = exactHeadingBlock(topSections, "Proposed Slices");
  const proposals = headingBlocks(proposalsSection.lines, 3).map(parseProposal);

  const historySection = exactHeadingBlock(topSections, "History");
  const historyBlocks = headingBlocks(historySection.lines, 3);
  assertKnownHeadings(
    historyBlocks,
    [
      ["Decisions", "decisions"],
      ["Checkpoints", "checkpoints"],
      ["Slices", "slices"],
    ],
    "History",
  );
  const decisionsBlock = exactHeadingBlock(historyBlocks, "Decisions", { required: true });
  const checkpointsBlock = exactHeadingBlock(historyBlocks, "Checkpoints", { required: true });
  const slicesBlock = exactHeadingBlock(historyBlocks, "Slices", { required: true });
  const history = {
    decisions: headingBlocks(decisionsBlock.lines, 4).map((block) => parseEntity(block, DECISION_FIELDS)),
    checkpoints: headingBlocks(checkpointsBlock.lines, 4).map((block) => parseEntity(block, CHECKPOINT_FIELDS)),
    slices: headingBlocks(slicesBlock.lines, 4).map((block) =>
      parseEntity(block, HISTORY_SLICE_FIELDS, true, HISTORY_SLICE_OPTIONAL_FIELDS),
    ),
  };

  const notesSection = exactHeadingBlock(topSections, "Notes");
  const notes = headingBlocks(notesSection.lines, 3).map((block) => {
    const sourceMatch = /^Source:\s*(.*)$/m.exec(block.lines.join("\n"));
    const bodyLines = sourceMatch
      ? block.lines.slice(block.lines.findIndex((line) => line.startsWith("Source:")) + 1)
      : block.lines;
    return { title: block.title, source: sourceMatch?.[1] ?? "", body: readTextBlock(bodyLines) };
  });

  const taskState = stateMatch?.[1] ?? "";
  const lastUpdated = timestampMatch?.[1] ?? "";
  return {
    kind: "v2",
    data: {
      schemaVersion: SCHEMA_VERSION,
      taskName: first[1],
      taskState,
      lastUpdated,
      currentContext,
      currentWork,
      proposals,
      history,
      notes,
    },
  };
}

function parseListHeading(lines) {
  return lines
    .map((line) => /^- (.*)$/.exec(line)?.[1] ?? (line.startsWith("  - ") ? line.slice(4) : null))
    .filter((value) => value !== null && value !== "");
}

function parseLegacy(text) {
  const taskName = /^# Working Record:\s*(.+)$/m.exec(text)?.[1] ?? "Unknown task";
  const taskState = /^State:\s*(Active|Paused|Completed|Abandoned)$/m.exec(text)?.[1] ?? null;
  const lastUpdated = /^Last updated:\s*(.*)$/m.exec(text)?.[1] ?? null;
  const sliceMatch = /### Current Slice\s*\n([\s\S]*?)(?=\n## |\n### |$)/.exec(text);
  const sliceText = sliceMatch?.[1] ?? "";
  const slice = sliceText.trim() === "None" ? null : parseLegacySlice(sliceText);
  return {
    kind: "legacy",
    data: {
      schemaVersion: null,
      taskName,
      taskState,
      lastUpdated,
      currentContext: {
        goal: "",
        whatDefinesTask: "",
        settled: "",
        tentative: "",
        open: "",
        currentDirection: "",
        boundaries: "",
        activeDecisions: [],
      },
      currentWork: { route: "", currentSlice: slice, blockers: [], upcomingCheckpoints: [], nextAction: "" },
      proposals: [],
      history: { decisions: [], checkpoints: [], slices: [] },
      notes: [],
    },
    raw: text,
  };
}

function parseLegacySlice(text) {
  const fields = parseBulletFields(text.split("\n"), { strict: false });
  return compactObject({
    id: parsedField(fields, "id") || /^- ID:\s*(.*)$/m.exec(text)?.[1],
    title: "Legacy Current Slice",
    state: parsedField(fields, "state") || /^- State:\s*(.*)$/m.exec(text)?.[1],
    type: parsedField(fields, "type") || /^- Type:\s*(.*)$/m.exec(text)?.[1],
  });
}

function parseUnsupported(text, schemaVersion) {
  const parsed = parseLegacy(text);
  return {
    ...parsed,
    kind: "unsupported",
    data: { ...parsed.data, schemaVersion },
  };
}

export function parseRecord(text, path) {
  const normalized = normalizeLineEndings(text);
  const lines = normalized.split("\n");
  const schemaMatch = lines.find((line) => /^Schema:\s*/.test(line))?.match(/^Schema:\s*(\d+)$/);
  if (!schemaMatch) return parseLegacy(normalized);
  const schemaVersion = Number(schemaMatch[1]);
  if (schemaVersion !== SCHEMA_VERSION) return parseUnsupported(normalized, schemaVersion);
  return parseV2(normalized, path);
}

export function renderRecord(data, { includeHeader = true } = {}) {
  if (failureInjection("render")) fail("render-failure", "Injected render failure");
  const context = data.currentContext;
  const work = data.currentWork;
  const header = includeHeader
    ? [
        `# Working Record: ${data.taskName}`,
        "",
        `Schema: ${SCHEMA_VERSION}`,
        `State: ${data.taskState}`,
        `Last updated: ${data.lastUpdated}`,
        "",
      ]
    : [];
  const body = [
    "## Current Context",
    renderHeadingField("Goal", context.goal),
    renderHeadingField("What defines this task", context.whatDefinesTask),
    renderHeadingField("Settled", context.settled),
    renderHeadingField("Tentative", context.tentative),
    renderHeadingField("Open", context.open),
    renderHeadingField("Current direction", context.currentDirection),
    renderHeadingField("Boundaries", context.boundaries),
    "",
    "## Current Work",
    renderHeadingField("Current route", work.route),
    renderCurrentSlice(work.currentSlice),
    renderHeadingList("Blockers", work.blockers),
    renderHeadingList("Upcoming checkpoints", work.upcomingCheckpoints),
    renderHeadingField("Next useful action", work.nextAction),
    "## Proposed Slices",
    data.proposals.map(renderProposal).join(""),
    "## History",
    "### Decisions",
    data.history.decisions.map((item) => renderEntity(item, DECISION_FIELDS)).join(""),
    "### Checkpoints",
    data.history.checkpoints.map((item) => renderEntity(item, CHECKPOINT_FIELDS)).join(""),
    "### Slices",
    data.history.slices
      .map((item) => renderEntity(item, HISTORY_SLICE_FIELDS, "####", HISTORY_SLICE_OPTIONAL_FIELDS))
      .join(""),
    "## Notes",
    data.notes.map(renderNote).join(""),
  ];
  return `${[...header, ...body.filter(Boolean)].join("\n").trimEnd()}\n`;
}

export function renderHeadingList(label, values) {
  const list = ensureArray(values);
  return list.length ? `### ${label}\n${list.map((value) => `- ${escapeContentLine(value)}`).join("\n")}\n` : "";
}

export function renderNote(note) {
  return `### ${note.title}\nSource: ${ensureString(note.source)}\n\n${renderTextBlock(note.body)}\n`;
}

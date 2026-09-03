import {
  ACTIVE_SLICE_FIELDS,
  CHECKPOINT_TYPES,
  CURRENT_SLICE_STATES,
  DECISION_FIELDS,
  DECISION_STATES,
  FUTURE_CHECKPOINT_FIELDS,
  FUTURE_CHECKPOINT_STATES,
  HISTORICAL_CHECKPOINT_FIELDS,
  HISTORICAL_CHECKPOINT_STATES,
  HISTORICAL_SLICE_FIELDS,
  HISTORICAL_SLICE_STATES,
  HISTORY_HEADINGS,
  PROPOSED_SLICE_FIELDS,
  SCHEMA_VERSION,
  SLICE_TYPES,
  TASK_STATES,
  TOP_LEVEL_SECTIONS,
  joinLines,
  nextId,
  parseId,
  splitLines,
} from "./format.mjs";

export class DocumentError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DocumentError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new DocumentError(code, message, details);
}

function lineHeading(line) {
  const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
  return match ? { level: match[1].length, title: match[2] } : null;
}

function isBlank(line) {
  return line.trim() === "";
}

function isUtcTimestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function fieldLine(line) {
  const match = /^([A-Za-z][A-Za-z -]*):(?:[ \t]*(.*))?$/.exec(line);
  return match ? { name: match[1], inline: match[2] ?? "" } : null;
}

function nonBlankLines(lines) {
  return lines.filter((line) => !isBlank(line));
}

function hasMeaningfulContent(lines, start, end) {
  return lines.slice(start, end).some((line) => line.replace(/^\s*[-*+]\s*/, "").trim() !== "");
}

function trimValueLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start])) start += 1;
  while (end > start && isBlank(lines[end - 1])) end -= 1;
  return lines.slice(start, end);
}

function valueText(field) {
  if (!field) return "";
  return trimValueLines(field.valueLines).join("\n").trim();
}

function scalarValue(block, name) {
  return valueText(block.fields.get(name));
}

function requiredValue(block, name) {
  const value = scalarValue(block, name);
  if (!value) fail("missing-field", `Missing or empty field ${name} in ${block.path}`);
  return value;
}

function fieldNames(allowed) {
  return [...allowed].sort().join(", ");
}

function parseFields(lines, start, end, allowed, path, allowedNestedHeadings = new Set()) {
  const fields = new Map();
  let current = null;
  let inNestedBlock = false;
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    const foundHeading = lineHeading(line);
    if (foundHeading) {
      if (foundHeading.level <= 4) fail("malformed-structure", `Unexpected heading in ${path}: ${line}`);
      if (!allowedNestedHeadings.has(foundHeading.title))
        fail("unknown-heading", `Unknown nested heading ${foundHeading.title} in ${path}`);
      current = null;
      inNestedBlock = true;
      continue;
    }
    if (inNestedBlock) continue;
    const foundField = fieldLine(line);
    if (foundField) {
      if (!allowed.has(foundField.name))
        fail("unknown-field", `Unknown field ${foundField.name} in ${path}; allowed fields: ${fieldNames(allowed)}`);
      if (fields.has(foundField.name)) fail("duplicate-field", `Duplicate field ${foundField.name} in ${path}`);
      current = {
        name: foundField.name,
        start: index,
        valueLines: foundField.inline === "" ? [] : [foundField.inline],
      };
      fields.set(foundField.name, current);
      continue;
    }
    if (current) current.valueLines.push(line);
    else if (!isBlank(line)) fail("unowned-content", `Unowned content in ${path}: ${line}`);
  }
  return fields;
}

function parseBlock(lines, start, end, kind, title, id, allowed, path) {
  const nested =
    path === "Current Slice"
      ? new Set(["Material updates"])
      : path.startsWith("History/")
        ? new Set(["Corrections"])
        : new Set();
  const fields = parseFields(lines, start + 1, end, allowed, path, nested);
  return { kind, title, id: id ?? null, start, end, fields, path };
}

function findHeadings(lines, start, end, level) {
  const result = [];
  for (let index = start; index < end; index += 1) {
    const found = lineHeading(lines[index]);
    if (found?.level === level) result.push({ index, title: found.title });
  }
  return result;
}

function blockEnd(lines, headingIndex, sectionEnd, level) {
  for (let index = headingIndex + 1; index < sectionEnd; index += 1) {
    const found = lineHeading(lines[index]);
    if (found && found.level <= level) return index;
  }
  return sectionEnd;
}

function parseHeader(lines, firstSectionIndex) {
  if (!/^# Working Record:\s*.+$/.test(lines[0] ?? ""))
    fail("malformed-header", "The record must begin with '# Working Record: <task name>'");
  const name = lines[0].slice("# Working Record:".length).trim();
  const schemaLines = [];
  const stateLines = [];
  const updatedLines = [];
  for (let index = 1; index < firstSectionIndex; index += 1) {
    if (isBlank(lines[index])) continue;
    const schema = /^Schema:\s*(\d+)\s*$/.exec(lines[index]);
    if (schema) {
      schemaLines.push({ index, value: Number(schema[1]) });
      continue;
    }
    const state = /^State:\s*(\S+)\s*$/.exec(lines[index]);
    if (state) {
      stateLines.push({ index, value: state[1] });
      continue;
    }
    const updated = /^Last updated:\s*(\S+)\s*$/.exec(lines[index]);
    if (updated) {
      updatedLines.push({ index, value: updated[1] });
      continue;
    }
    fail("unknown-header-field", `Unknown header content: ${lines[index]}`);
  }
  if (schemaLines.length !== 1) fail("missing-field", "Header must contain exactly one Schema field");
  if (stateLines.length !== 1) fail("missing-field", "Header must contain exactly one State field");
  if (updatedLines.length !== 1) fail("missing-field", "Header must contain exactly one Last updated field");
  if (!isUtcTimestamp(updatedLines[0].value))
    fail("invalid-timestamp", `Invalid Last updated value: ${updatedLines[0].value}`);
  if (schemaLines[0].value !== SCHEMA_VERSION)
    fail("unsupported-schema", `Expected Schema ${SCHEMA_VERSION}, found Schema ${schemaLines[0].value}`);
  if (!TASK_STATES.has(stateLines[0].value)) fail("invalid-state", `Invalid task State: ${stateLines[0].value}`);
  return {
    name,
    schema: schemaLines[0].value,
    state: stateLines[0].value,
    stateLine: stateLines[0].index,
    lastUpdated: updatedLines[0].value,
    lastUpdatedLine: updatedLines[0].index,
  };
}

function parseTopLevelSections(lines) {
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const found = lineHeading(lines[index]);
    if (found?.level === 2) {
      headings.push({ index, title: found.title });
      if (found.title === "Notes") break;
    }
  }
  if (headings.length !== TOP_LEVEL_SECTIONS.length)
    fail("invalid-sections", `Expected exactly ${TOP_LEVEL_SECTIONS.length} top-level sections`);
  for (let index = 0; index < TOP_LEVEL_SECTIONS.length; index += 1) {
    if (headings[index].title !== TOP_LEVEL_SECTIONS[index])
      fail(
        "invalid-sections",
        `Expected top-level section ${TOP_LEVEL_SECTIONS[index]}, found ${headings[index].title}`,
      );
  }
  return Object.fromEntries(
    headings.map((item, index) => [
      item.title,
      { headingIndex: item.index, start: item.index + 1, end: headings[index + 1]?.index ?? lines.length },
    ]),
  );
}

function parseContext(lines, section) {
  const headings = findHeadings(lines, section.start, section.end, 3);
  if (headings.length !== 7)
    fail("invalid-context", "Current Context must contain exactly the seven canonical headings");
  const statements = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const expected = [
      "Goal",
      "What defines this task",
      "Settled",
      "Tentative",
      "Open",
      "Current direction",
      "Boundaries",
    ][index];
    if (headings[index].title !== expected) fail("invalid-context", `Expected Current Context heading ${expected}`);
    const end = headings[index + 1]?.index ?? section.end;
    statements.set(expected, { headingIndex: headings[index].index, start: headings[index].index + 1, end });
  }
  return { ...section, headings: statements };
}

function parseCurrentWork(lines, section) {
  const headings = findHeadings(lines, section.start, section.end, 3);
  if (headings.length !== 2 || headings[0].title !== "Current Slice" || headings[1].title !== "Next useful action")
    fail("invalid-current-work", "Current Work must contain Current Slice followed by Next useful action");
  const sliceContentStart = headings[0].index + 1;
  const sliceContentEnd = headings[1].index;
  const content = nonBlankLines(lines.slice(sliceContentStart, sliceContentEnd));
  let currentSlice = null;
  if (content.length === 1 && content[0] === "None") {
    currentSlice = null;
  } else {
    const entries = findHeadings(lines, sliceContentStart, sliceContentEnd, 4);
    if (entries.length !== 1)
      fail("invalid-current-slice", "Current Slice must contain exactly one S-NNN block or None");
    const found = /^S-(\d{3,})\s+—\s+(.+)$/.exec(entries[0].title);
    if (!found) fail("invalid-current-slice", `Invalid Current Slice heading: ${lines[entries[0].index]}`);
    const end = blockEnd(lines, entries[0].index, sliceContentEnd, 4);
    currentSlice = parseBlock(
      lines,
      entries[0].index,
      end,
      "slice",
      found[2],
      `S-${found[1]}`,
      ACTIVE_SLICE_FIELDS,
      "Current Slice",
    );
  }
  return {
    ...section,
    sliceHeadingIndex: headings[0].index,
    nextActionHeadingIndex: headings[1].index,
    currentSlice,
    nextAction: { start: headings[1].index + 1, end: section.end },
  };
}

function parseFuture(lines, section) {
  const headings = findHeadings(lines, section.start, section.end, 3);
  const items = [];
  for (const itemHeading of headings) {
    let match = /^Slice\s+—\s+(.+)$/.exec(itemHeading.title);
    let kind = "slice";
    let id = null;
    let title;
    if (match) {
      title = match[1];
    } else {
      match = /^Checkpoint(?:\s+(C-\d{3,}))?\s+—\s+(.+)$/.exec(itemHeading.title);
      if (!match) fail("invalid-future-item", `Unknown Future Work heading: ${lines[itemHeading.index]}`);
      kind = "checkpoint";
      id = match[1] ?? null;
      title = match[2];
    }
    const end = blockEnd(lines, itemHeading.index, section.end, 3);
    const allowed = kind === "slice" ? PROPOSED_SLICE_FIELDS : FUTURE_CHECKPOINT_FIELDS;
    items.push(parseBlock(lines, itemHeading.index, end, kind, title, id, allowed, `Future Work/${title}`));
  }
  return { ...section, items };
}

function parseHistorySubsection(lines, section, title, kind, idPattern, allowed) {
  const heading = findHeadings(lines, section.start, section.end, 3).find((item) => item.title === title);
  if (!heading) fail("invalid-history", `History is missing the ${title} subsection`);
  const subsectionEnd = blockEnd(lines, heading.index, section.end, 3);
  const entries = findHeadings(lines, heading.index + 1, subsectionEnd, 4);
  const blocks = [];
  for (const entry of entries) {
    const match = idPattern.exec(entry.title);
    if (!match) fail("invalid-history-entry", `Invalid ${title} heading: ${lines[entry.index]}`);
    const end = blockEnd(lines, entry.index, subsectionEnd, 4);
    blocks.push(parseBlock(lines, entry.index, end, kind, match[2], match[1], allowed, `History/${title}/${match[1]}`));
  }
  return { headingIndex: heading.index, start: heading.index + 1, end: subsectionEnd, blocks };
}

function parseHistory(lines, section) {
  const headings = findHeadings(lines, section.start, section.end, 3);
  if (
    headings.length !== HISTORY_HEADINGS.length ||
    headings.some((item, index) => item.title !== HISTORY_HEADINGS[index])
  )
    fail("invalid-history", "History must contain Decisions, Checkpoints, and Slices in that order");
  return {
    ...section,
    decisions: parseHistorySubsection(
      lines,
      section,
      "Decisions",
      "decision",
      /^(D-\d{3,})\s+—\s+(.+)$/,
      DECISION_FIELDS,
    ),
    checkpoints: parseHistorySubsection(
      lines,
      section,
      "Checkpoints",
      "checkpoint",
      /^(C-\d{3,})\s+—\s+(.+)$/,
      HISTORICAL_CHECKPOINT_FIELDS,
    ),
    slices: parseHistorySubsection(
      lines,
      section,
      "Slices",
      "slice",
      /^(S-\d{3,})\s+—\s+(.+)$/,
      HISTORICAL_SLICE_FIELDS,
    ),
  };
}

function validateChoice(block, field, choices, required = true) {
  const value = scalarValue(block, field);
  if (!value && !required) return "";
  if (!value) requiredValue(block, field);
  if (!choices.has(value)) fail("invalid-state", `Invalid ${field} in ${block.path}: ${value}`);
  return value;
}

function validateFields(block, required, conditional = {}) {
  for (const field of required) requiredValue(block, field);
  for (const [field, condition] of Object.entries(conditional)) {
    if (condition(block)) requiredValue(block, field);
  }
}

function allBlocks(document) {
  return [
    ...(document.current.currentSlice ? [document.current.currentSlice] : []),
    ...document.future.items,
    ...document.history.decisions.blocks,
    ...document.history.checkpoints.blocks,
    ...document.history.slices.blocks,
  ];
}

function validateReferences(document) {
  const currentSlice = document.current.currentSlice;
  const historicalSlices = document.history.slices.blocks;
  const sliceIds = new Set([...(currentSlice ? [currentSlice] : []), ...historicalSlices].map((block) => block.id));
  const historicalSliceIds = new Set(historicalSlices.map((block) => block.id));
  const futureSliceTitles = new Set(
    document.future.items.filter((item) => item.kind === "slice").map((item) => item.title),
  );
  const checkpointIds = new Set([
    ...document.future.items.filter((item) => item.kind === "checkpoint" && item.id).map((item) => item.id),
    ...document.history.checkpoints.blocks.map((item) => item.id),
  ]);
  const decisionIds = new Set(document.history.decisions.blocks.map((item) => item.id));

  for (const checkpoint of document.future.items.filter((item) => item.kind === "checkpoint")) {
    const appliesTo = requiredValue(checkpoint, "Applies to");
    if (!sliceIds.has(appliesTo) && !futureSliceTitles.has(appliesTo))
      fail("invalid-reference", `Checkpoint ${checkpoint.title} applies to unknown Slice ${appliesTo}`);
  }
  for (const checkpoint of document.history.checkpoints.blocks) {
    const appliesTo = requiredValue(checkpoint, "Applies to");
    if (!sliceIds.has(appliesTo))
      fail("invalid-reference", `Checkpoint ${checkpoint.id} applies to unknown Slice ${appliesTo}`);
    if (scalarValue(checkpoint, "State") === "replaced") {
      const replacement = requiredValue(checkpoint, "Replaced by");
      if (!checkpointIds.has(replacement) || replacement === checkpoint.id)
        fail("invalid-reference", `Invalid replacement Checkpoint ${replacement}`);
    }
  }
  for (const decision of document.history.decisions.blocks) {
    const state = scalarValue(decision, "State");
    if (state === "superseded") {
      const replacement = requiredValue(decision, "Superseded by");
      if (!decisionIds.has(replacement) || replacement === decision.id)
        fail("invalid-reference", `Invalid replacement Decision ${replacement}`);
    }
  }
  if (currentSlice) {
    const continues = scalarValue(currentSlice, "Reopened from");
    if (continues && (!historicalSliceIds.has(continues) || continues === currentSlice.id))
      fail("invalid-reference", `Current Slice continues unknown historical Slice ${continues}`);
  }
  for (const slice of historicalSlices) {
    const continues = scalarValue(slice, "Reopened from");
    if (continues && (!historicalSliceIds.has(continues) || continues === slice.id))
      fail("invalid-reference", `Historical Slice ${slice.id} continues unknown historical Slice ${continues}`);
  }
}

export function validateDocument(document) {
  const { header, context, current, future, history } = document;
  if (!header.name) fail("malformed-header", "Task name cannot be empty");
  const goal = context.headings.get("Goal");
  if (!hasMeaningfulContent(document.lines, goal.start, goal.end))
    fail("missing-field", "Current Context Goal must contain meaningful content");
  if (!hasMeaningfulContent(document.lines, current.nextAction.start, current.nextAction.end))
    fail("missing-field", "Next useful action must contain meaningful content");
  for (const block of allBlocks(document)) {
    if (block.id && !parseId(block.id, block.kind)) fail("invalid-id", `Invalid ${block.kind} ID ${block.id}`);
  }

  const ids = new Set();
  for (const block of allBlocks(document)) {
    if (block.id) {
      if (ids.has(block.id)) fail("duplicate-id", `Duplicate durable ID ${block.id}`);
      ids.add(block.id);
    }
  }

  for (const item of future.items) {
    if (!item.title.trim()) fail("invalid-title", "Future Work item titles cannot be empty");
    if (item.kind === "slice") {
      validateFields(item, ["State", "Intended result"], {});
      validateChoice(item, "State", new Set(["proposed"]));
      const type = scalarValue(item, "Type");
      if (type && !SLICE_TYPES.has(type)) fail("invalid-type", `Invalid Slice Type ${type}`);
    } else {
      validateFields(item, ["State"], {});
      validateChoice(item, "State", FUTURE_CHECKPOINT_STATES);
      validateChoice(item, "Type", CHECKPOINT_TYPES);
      validateFields(item, ["Condition", "Applies to"]);
      if (item.id && !parseId(item.id, "checkpoint")) fail("invalid-id", `Invalid Checkpoint ID ${item.id}`);
      const checkpointState = scalarValue(item, "State");
      if (checkpointState === "proposed" && item.id)
        fail("invalid-future-item", "A proposed Checkpoint cannot have a durable ID");
      if (checkpointState !== "proposed" && !item.id)
        fail("invalid-future-item", "A pending or deferred Checkpoint requires a durable ID");
    }
  }

  const futureTitles = new Set();
  for (const item of future.items) {
    if (futureTitles.has(item.title)) fail("duplicate-title", `Duplicate Future Work title: ${item.title}`);
    futureTitles.add(item.title);
  }

  if (current.currentSlice) {
    validateChoice(current.currentSlice, "State", CURRENT_SLICE_STATES);
    validateFields(current.currentSlice, [
      "Intended result",
      "Authority source",
      "Scope",
      "Expected evidence",
      "Stop condition",
      "Starting state",
    ]);
    const type = scalarValue(current.currentSlice, "Type");
    if (type && !SLICE_TYPES.has(type)) fail("invalid-type", `Invalid Current Slice Type ${type}`);
  }

  for (const decision of history.decisions.blocks) {
    validateChoice(decision, "State", DECISION_STATES);
    validateFields(decision, ["Decision", "Established by", "Rationale", "Consequences", "Revisit when"]);
    const state = scalarValue(decision, "State");
    if (state === "superseded") requiredValue(decision, "Superseded by");
    if (state === "retired") requiredValue(decision, "Retired because");
  }

  for (const checkpoint of history.checkpoints.blocks) {
    validateChoice(checkpoint, "State", HISTORICAL_CHECKPOINT_STATES);
    validateChoice(checkpoint, "Type", CHECKPOINT_TYPES);
    validateFields(checkpoint, ["Condition", "Applies to", "Result", "Task effect"]);
    const state = scalarValue(checkpoint, "State");
    if (state === "cancelled" || state === "replaced") requiredValue(checkpoint, "Reason");
    if (state === "replaced") requiredValue(checkpoint, "Replaced by");
  }

  for (const slice of history.slices.blocks) {
    validateChoice(slice, "State", HISTORICAL_SLICE_STATES);
    validateFields(slice, ["Intended result", "Result", "Evidence and limits", "Task effect"]);
    const state = scalarValue(slice, "State");
    if (state === "blocked") requiredValue(slice, "Resume when");
    if (state === "abandoned") requiredValue(slice, "Reason");
  }

  if (header.state === "paused" && current.currentSlice && scalarValue(current.currentSlice, "State") !== "paused")
    fail("invalid-task-state", "A paused task must have a paused Current Slice");
  if ((header.state === "completed" || header.state === "abandoned") && current.currentSlice)
    fail("invalid-task-state", `A ${header.state} task cannot have a Current Slice`);
  if (
    (header.state === "completed" || header.state === "abandoned") &&
    future.items.some(
      (item) => item.kind === "checkpoint" && ["pending", "deferred"].includes(scalarValue(item, "State")),
    )
  )
    fail("invalid-task-state", `A ${header.state} task cannot have a pending or deferred Checkpoint`);

  validateReferences(document);
  return document;
}

export function parseDocument(text, { validate = true } = {}) {
  if (typeof text !== "string" || !text) fail("empty-record", "Record is empty");
  const { lines, newline } = splitLines(text);
  const topLevel = parseTopLevelSections(lines);
  const header = parseHeader(lines, topLevel[TOP_LEVEL_SECTIONS[0]].headingIndex);
  const context = parseContext(lines, topLevel["Current Context"]);
  const current = parseCurrentWork(lines, topLevel["Current Work"]);
  const future = parseFuture(lines, topLevel["Future Work"]);
  const history = parseHistory(lines, topLevel.History);
  const document = {
    text,
    lines,
    newline,
    header,
    sections: topLevel,
    context,
    current,
    future,
    history,
    notes: topLevel.Notes,
  };
  return validate ? validateDocument(document) : document;
}

export function parseFragment(text, allowed, path = "input") {
  if (typeof text !== "string") fail("invalid-input", `Input for ${path} must be text`);
  const { lines } = splitLines(text);
  const fields = parseFields(lines, 0, lines.length, allowed, path);
  return { fields, lines };
}

export function fieldValue(block, name) {
  return scalarValue(block, name);
}

export function fieldLines(block, name) {
  return block.fields.has(name) ? trimValueLines(block.fields.get(name).valueLines) : null;
}

export function hasField(block, name) {
  return block.fields.has(name) && Boolean(valueText(block.fields.get(name)));
}

export function formatField(name, linesOrValue) {
  const raw = Array.isArray(linesOrValue) ? linesOrValue : String(linesOrValue ?? "").split("\n");
  const lines = trimValueLines(raw);
  if (lines.length === 0) return [`${name}:`];
  if (lines.length === 1 && !lines[0].startsWith("- ")) return [`${name}: ${lines[0]}`];
  return [`${name}:`, ...lines];
}

export function renderBlock(blockHeading, orderedFields, values) {
  const lines = [blockHeading];
  for (const field of orderedFields) {
    if (!Object.hasOwn(values, field) || values[field] === undefined || values[field] === null) continue;
    const value = Array.isArray(values[field]) ? values[field] : String(values[field]).split("\n");
    if (value.length === 0 || (value.length === 1 && value[0] === "")) continue;
    lines.push(...formatField(field, value));
  }
  lines.push("");
  return lines;
}

export function blockLines(document, block) {
  return document.lines.slice(block.start, block.end);
}

export function applyLineReplacements(document, replacements) {
  const sorted = [...replacements].sort((left, right) => right.start - left.start);
  let previousStart = Number.POSITIVE_INFINITY;
  for (const replacement of sorted) {
    if (
      !Number.isInteger(replacement.start) ||
      !Number.isInteger(replacement.end) ||
      replacement.start > replacement.end
    )
      fail("invalid-edit", "Invalid source range");
    if (replacement.end > previousStart) fail("overlapping-edit", "Overlapping source edits are not supported");
    previousStart = replacement.start;
    const replacementLines = Array.isArray(replacement.lines)
      ? replacement.lines
      : String(replacement.text ?? "").split(/\r?\n/);
    document.lines.splice(replacement.start, replacement.end - replacement.start, ...replacementLines);
  }
  return joinLines(document.lines, document.newline);
}

export function insertLines(document, index, lines) {
  return applyLineReplacements(document, [{ start: index, end: index, lines }]);
}

export function replaceBlock(document, block, lines) {
  return applyLineReplacements(document, [{ start: block.start, end: block.end, lines }]);
}

export function replaceFieldInBlock(document, block, fieldName, value) {
  const field = block.fields.get(fieldName);
  if (!field) fail("missing-field", `Missing field ${fieldName} in ${block.path}`);
  const fieldEnd =
    [...block.fields.values()]
      .filter((candidate) => candidate.start > field.start)
      .sort((left, right) => left.start - right.start)[0]?.start ?? block.end;
  return applyLineReplacements(document, [{ start: field.start, end: fieldEnd, lines: formatField(fieldName, value) }]);
}

export function nextEntityId(document, kind) {
  return nextId(
    allBlocks(document)
      .map((block) => block.id)
      .filter(Boolean),
    kind,
  );
}

export function findFutureItem(document, title, kind = null) {
  const matches = document.future.items.filter((item) => item.title === title && (!kind || item.kind === kind));
  if (matches.length === 0) fail("missing-item", `No Future Work item matched: ${title}`);
  if (matches.length > 1) fail("ambiguous-item", `Future Work title matched more than once: ${title}`);
  return matches[0];
}

export function findEntity(document, id, kind = null) {
  const candidates = allBlocks(document).filter((block) => block.id === id && (!kind || block.kind === kind));
  if (candidates.length === 0) fail("missing-entity", `No entity matched ${id}`);
  if (candidates.length > 1) fail("ambiguous-entity", `Entity ID matched more than once: ${id}`);
  return candidates[0];
}

export function sectionContentLines(document, sectionName) {
  const section = document.sections[sectionName];
  return document.lines.slice(section.headingIndex, section.end);
}

export function activeDecisionBlocks(document) {
  return document.history.decisions.blocks.filter((block) => fieldValue(block, "State") === "active");
}

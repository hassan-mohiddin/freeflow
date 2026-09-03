import {
  ACTIVE_SLICE_FIELDS,
  DECISION_FIELDS,
  HISTORICAL_CHECKPOINT_FIELDS,
  HISTORICAL_CHECKPOINT_STATES,
  HISTORICAL_SLICE_FIELDS,
  HISTORICAL_SLICE_STATES,
  TASK_STATES,
} from "./format.mjs";
import {
  applyLineReplacements,
  fieldLines,
  fieldValue,
  findEntity,
  findFutureItem,
  formatField,
  nextEntityId,
  parseDocument,
  parseFragment,
  renderBlock,
} from "./document.mjs";
import { writeAtomically } from "./store.mjs";

const ACTIVE_SLICE_ORDER = [
  "State",
  "Type",
  "Intended result",
  "Authority source",
  "Scope",
  "Expected evidence",
  "Stop condition",
  "Starting state",
  "Dependencies",
  "Reopened from",
];
const PROPOSED_SLICE_ORDER = ["State", "Type", "Intended result", "Expected evidence", "Dependencies"];
const FUTURE_CHECKPOINT_ORDER = ["State", "Type", "Condition", "Applies to"];
const HISTORICAL_CHECKPOINT_ORDER = [
  "State",
  "Type",
  "Condition",
  "Applies to",
  "Result",
  "Evidence",
  "Task effect",
  "Reason",
  "Replaced by",
];
const DECISION_ORDER = [
  "State",
  "Decision",
  "Established by",
  "Rationale",
  "Source references",
  "Consequences",
  "Revisit when",
  "Superseded by",
  "Retired because",
];
const HISTORICAL_SLICE_ORDER = [
  "State",
  "Type",
  "Intended result",
  "Authority source",
  "Result",
  "Evidence and limits",
  "Task effect",
  "Reopened from",
  "Resume when",
  "Reason",
  "Residual effects",
];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function trimLines(lines = []) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

function fragmentValue(fragment, name) {
  const field = fragment.fields.get(name);
  return field ? trimLines(field.valueLines) : null;
}

function fragmentText(fragment, name) {
  const lines = fragmentValue(fragment, name);
  return lines ? lines.join("\n").trim() : "";
}

function requireFragment(fragment, name, command) {
  const value = fragmentText(fragment, name);
  if (!value) fail("missing-field", `${command} requires ${name}`);
  return fragmentValue(fragment, name);
}

function parseInput(input, allowed, command) {
  return parseFragment(input, allowed, `${command} input`);
}

function blockValues(block, order) {
  const values = {};
  for (const field of order) {
    const lines = fieldLines(block, field);
    if (lines && lines.length) values[field] = lines;
  }
  return values;
}

function mergeValues(base, fragment, fields) {
  const values = { ...base };
  for (const field of fields) {
    const lines = fragmentValue(fragment, field);
    if (lines && lines.length) values[field] = lines;
  }
  return values;
}

function fieldRange(block, name) {
  const field = block.fields.get(name);
  if (!field) fail("missing-field", `Missing field ${name} in ${block.path}`);
  const next = [...block.fields.values()]
    .filter((candidate) => candidate.start > field.start)
    .sort((left, right) => left.start - right.start)[0];
  return { start: field.start, end: next?.start ?? block.end };
}

function materialLines(document, block) {
  for (let index = block.start + 1; index < block.end; index += 1) {
    if (document.lines[index] === "##### Material updates") return document.lines.slice(index, block.end);
  }
  return null;
}

function renderCurrentSlice(document, block, overrides = {}, event = null) {
  const values = { ...blockValues(block, ACTIVE_SLICE_FIELDS), ...overrides };
  const lines = renderBlock(`#### ${block.id} — ${block.title}`, ACTIVE_SLICE_ORDER, values);
  let material = materialLines(document, block);
  if (event) {
    const existing = trimLines(material ?? ["##### Material updates"]);
    material = [...existing, ...(existing.length === 1 ? [""] : []), `- ${event}`, ""];
  }
  if (material) lines.push(...material);
  return lines;
}

function renderFutureCheckpoint(block, overrides = {}) {
  const values = { ...blockValues(block, FUTURE_CHECKPOINT_ORDER), ...overrides };
  const heading = block.id ? `### Checkpoint ${block.id} — ${block.title}` : `### Checkpoint — ${block.title}`;
  return renderBlock(heading, FUTURE_CHECKPOINT_ORDER, values);
}

function renderHistoricalCheckpoint(block, overrides = {}) {
  const values = { ...blockValues(block, HISTORICAL_CHECKPOINT_FIELDS), ...overrides };
  return renderBlock(`#### ${block.id} — ${block.title}`, HISTORICAL_CHECKPOINT_ORDER, values);
}

function renderHistoricalSlice(values, title, id) {
  return renderBlock(`#### ${id} — ${title}`, HISTORICAL_SLICE_ORDER, values);
}

function renderDecision(values, title, id) {
  return renderBlock(`#### ${id} — ${title}`, DECISION_ORDER, values);
}

function replacementForField(block, field, value) {
  const range = fieldRange(block, field);
  return { start: range.start, end: range.end, lines: [...formatField(field, value), ""] };
}

function assertUniqueFutureTitle(document, title) {
  if (document.future.items.some((item) => item.title === title))
    fail("duplicate-title", `Future Work title already exists: ${title}`);
}

function assertNoCurrentSlice(document) {
  if (document.current.currentSlice) fail("current-slice-exists", "A Current Slice already exists");
}

function assertTaskActive(document, action) {
  if (document.header.state !== "active")
    fail("invalid-task-state", `Cannot ${action} while task state is ${document.header.state}`);
}

function assertCurrentSlice(document) {
  if (!document.current.currentSlice) fail("missing-current-slice", "There is no Current Slice");
  return document.current.currentSlice;
}

function assertState(block, field, expected, message) {
  const actual = fieldValue(block, field);
  if (actual !== expected) fail("invalid-transition", message ?? `Expected ${field} ${expected}, found ${actual}`);
}

function currentCheckpoints(document, sliceId) {
  return document.future.items.filter(
    (item) =>
      item.kind === "checkpoint" &&
      ["pending", "deferred"].includes(fieldValue(item, "State")) &&
      fieldValue(item, "Applies to") === sliceId,
  );
}

function requiredStringOption(options, name) {
  const value = options[name];
  if (!value?.trim()) fail("missing-option", `Missing required option: ${name}`);
  return value.trim();
}

function eventText(options, input, optionName, label) {
  const text = options[optionName]?.trim() || input.trim();
  if (!text) fail("missing-input", `${label} requires text through ${optionName} or --input -`);
  return text.replace(/\s+/g, " ");
}

function requiredNextAction(options, label) {
  const value = options["--next-action"]?.trim();
  if (!value) fail("missing-option", `${label} requires --next-action`);
  return value.replace(/\s+/g, " ");
}

function nextActionReplacement(document, value) {
  return {
    start: document.current.nextAction.start,
    end: document.current.nextAction.end,
    lines: ["", `- ${value}`, ""],
  };
}

function optionalNextAction(document, options) {
  const value = options["--next-action"]?.trim();
  return value ? nextActionReplacement(document, value.replace(/\s+/g, " ")) : null;
}

async function publish(loaded, candidate, summary) {
  const document = parseDocument(candidate);
  const stamped = withLineChanges(document, [
    {
      start: document.header.lastUpdatedLine,
      end: document.header.lastUpdatedLine + 1,
      lines: [`Last updated: ${new Date().toISOString()}`],
    },
  ]);
  parseDocument(stamped);
  await writeAtomically(loaded.root, loaded.path, loaded.text, stamped);
  return `${summary}\n`;
}

function withLineChanges(document, replacements) {
  return applyLineReplacements(document, replacements);
}

function proposedSliceValues(fragment) {
  const values = { State: "proposed" };
  for (const field of ["Type", "Intended result", "Expected evidence", "Dependencies"]) {
    const lines = fragmentValue(fragment, field);
    if (lines?.length) values[field] = lines;
  }
  requireFragment(fragment, "Intended result", "slice propose");
  return values;
}

async function proposeSlice(options, input, loaded) {
  const document = parseDocument(loaded.text);
  const title = requiredStringOption(options, "--title");
  assertUniqueFutureTitle(document, title);
  const fragment = parseInput(
    input,
    new Set(["Type", "Intended result", "Expected evidence", "Dependencies"]),
    "slice propose",
  );
  const values = proposedSliceValues(fragment);
  const candidate = withLineChanges(document, [
    {
      start: document.future.end,
      end: document.future.end,
      lines: renderBlock(`### Slice — ${title}`, PROPOSED_SLICE_ORDER, values),
    },
  ]);
  return publish(loaded, candidate, `Proposed Slice: ${title}`);
}

async function startSlice(options, input, loaded) {
  const document = parseDocument(loaded.text);
  assertTaskActive(document, "start a Slice");
  assertNoCurrentSlice(document);
  const title = requiredStringOption(options, "--title");
  const proposal = findFutureItem(document, title, "slice");
  const fragment = parseInput(
    input,
    new Set([
      "Type",
      "Expected evidence",
      "Dependencies",
      "Authority source",
      "Scope",
      "Stop condition",
      "Starting state",
    ]),
    "slice start",
  );
  const proposalValues = blockValues(proposal, PROPOSED_SLICE_ORDER);
  const values = mergeValues(proposalValues, fragment, [
    "Type",
    "Expected evidence",
    "Dependencies",
    "Authority source",
    "Scope",
    "Stop condition",
    "Starting state",
  ]);
  values.State = "in_progress";
  values["Intended result"] = proposalValues["Intended result"];
  for (const field of ["Authority source", "Scope", "Expected evidence", "Stop condition", "Starting state"]) {
    if (!values[field]?.length) requireFragment(fragment, field, "slice start");
  }
  const id = nextEntityId(document, "slice");
  const currentLines = renderBlock(`#### ${id} — ${title}`, ACTIVE_SLICE_ORDER, values);
  const nextAction = requiredNextAction(options, "slice start");
  const replacements = [
    { start: proposal.start, end: proposal.end, lines: [] },
    {
      start: document.current.sliceHeadingIndex + 1,
      end: document.current.nextActionHeadingIndex,
      lines: ["", ...currentLines, ""],
    },
    nextActionReplacement(document, nextAction),
  ];
  for (const checkpoint of document.future.items.filter((item) => item.kind === "checkpoint")) {
    if (fieldValue(checkpoint, "Applies to") === title) {
      replacements.push(replacementForField(checkpoint, "Applies to", `S-${id.slice(2)}`));
    }
  }
  const candidate = withLineChanges(document, replacements);
  return publish(loaded, candidate, `Started Slice: ${id} — ${title}`);
}

async function startDirectSlice(options, input, loaded) {
  const document = parseDocument(loaded.text);
  assertTaskActive(document, "start a Slice");
  assertNoCurrentSlice(document);
  const title = requiredStringOption(options, "--title");
  if (document.future.items.some((item) => item.title === title))
    fail("future-title-conflict", `Direct Slice title conflicts with Future Work: ${title}`);
  const fragment = parseInput(
    input,
    new Set([
      "Type",
      "Intended result",
      "Authority source",
      "Scope",
      "Expected evidence",
      "Stop condition",
      "Starting state",
      "Dependencies",
    ]),
    "slice start-direct",
  );
  for (const field of [
    "Intended result",
    "Authority source",
    "Scope",
    "Expected evidence",
    "Stop condition",
    "Starting state",
  ])
    requireFragment(fragment, field, "slice start-direct");
  const values = { State: "in_progress" };
  for (const field of [
    "Type",
    "Intended result",
    "Authority source",
    "Scope",
    "Expected evidence",
    "Stop condition",
    "Starting state",
    "Dependencies",
  ])
    values[field] = fragmentValue(fragment, field) ?? undefined;
  const id = nextEntityId(document, "slice");
  const currentLines = renderBlock(`#### ${id} — ${title}`, ACTIVE_SLICE_ORDER, values);
  const nextAction = requiredNextAction(options, "slice start-direct");
  const candidate = withLineChanges(document, [
    {
      start: document.current.sliceHeadingIndex + 1,
      end: document.current.nextActionHeadingIndex,
      lines: ["", ...currentLines, ""],
    },
    nextActionReplacement(document, nextAction),
  ]);
  return publish(loaded, candidate, `Started direct Slice: ${id} — ${title}`);
}

async function pauseSlice(options, input, loaded) {
  const document = parseDocument(loaded.text);
  const slice = assertCurrentSlice(document);
  assertState(slice, "State", "in_progress", "Only an in-progress Current Slice can be paused");
  const reason = eventText(options, input, "--reason", "slice pause");
  const resumeWhen = requiredStringOption(options, "--resume-when");
  const event = `Paused — reason: ${reason}; resume when: ${resumeWhen}`;
  const nextAction = requiredNextAction(options, "slice pause");
  const candidate = withLineChanges(document, [
    { start: slice.start, end: slice.end, lines: renderCurrentSlice(document, slice, { State: "paused" }, event) },
    nextActionReplacement(document, nextAction),
  ]);
  return publish(loaded, candidate, `Paused Slice: ${slice.id}`);
}

async function resumeSlice(options, input, loaded) {
  const document = parseDocument(loaded.text);
  assertTaskActive(document, "resume a Slice");
  const slice = assertCurrentSlice(document);
  assertState(slice, "State", "paused", "Only a paused Current Slice can be resumed");
  const source = eventText(options, input, "--resolution", "slice resume");
  const event = `Resumed — resolution source: ${source}`;
  const nextAction = requiredNextAction(options, "slice resume");
  const candidate = withLineChanges(document, [
    { start: slice.start, end: slice.end, lines: renderCurrentSlice(document, slice, { State: "in_progress" }, event) },
    nextActionReplacement(document, nextAction),
  ]);
  return publish(loaded, candidate, `Resumed Slice: ${slice.id}`);
}

function closeValues(slice, state, fragment) {
  const values = { ...blockValues(slice, HISTORICAL_SLICE_FIELDS), State: state };
  values["Intended result"] = fieldLines(slice, "Intended result");
  values.Result = requireFragment(fragment, "Result", "slice close");
  values["Evidence and limits"] = requireFragment(fragment, "Evidence and limits", "slice close");
  values["Task effect"] = requireFragment(fragment, "Task effect", "slice close");
  for (const field of ["Type", "Authority source", "Reopened from", "Resume when", "Reason", "Residual effects"]) {
    const lines = fragmentValue(fragment, field);
    if (lines?.length) values[field] = lines;
  }
  if (state === "blocked") values["Resume when"] = requireFragment(fragment, "Resume when", "slice close");
  if (state === "abandoned") values.Reason = requireFragment(fragment, "Reason", "slice close");
  return values;
}

async function closeSlice(options, input, loaded) {
  const document = parseDocument(loaded.text);
  const slice = assertCurrentSlice(document);
  const state = requiredStringOption(options, "--state");
  if (!HISTORICAL_SLICE_STATES.has(state)) fail("invalid-state", `Invalid historical Slice state: ${state}`);
  if (state === "blocked" && fieldValue(slice, "State") !== "paused")
    fail("invalid-transition", "A Slice can close as blocked only from paused");
  if (currentCheckpoints(document, slice.id).length)
    fail("pending-checkpoint", `Slice ${slice.id} has an unresolved Checkpoint`);
  const fragment = parseInput(
    input,
    new Set([
      "Type",
      "Authority source",
      "Result",
      "Evidence and limits",
      "Task effect",
      "Reopened from",
      "Resume when",
      "Reason",
      "Residual effects",
    ]),
    "slice close",
  );
  const values = closeValues(slice, state, fragment);
  const historical = renderHistoricalSlice(values, slice.title, slice.id);
  const nextAction = requiredNextAction(options, "slice close");
  const candidate = withLineChanges(document, [
    {
      start: document.current.sliceHeadingIndex + 1,
      end: document.current.nextActionHeadingIndex,
      lines: ["", "None", ""],
    },
    { start: document.history.slices.end, end: document.history.slices.end, lines: historical },
    nextActionReplacement(document, nextAction),
  ]);
  return publish(loaded, candidate, `Closed Slice: ${slice.id} — ${state}`);
}

async function reopenSlice(options, input, loaded) {
  const document = parseDocument(loaded.text);
  assertTaskActive(document, "reopen a Slice");
  assertNoCurrentSlice(document);
  const oldId = requiredStringOption(options, "--id");
  const historical = findEntity(document, oldId, "slice");
  const oldState = fieldValue(historical, "State");
  if (!new Set(["completed", "blocked"]).has(oldState))
    fail("invalid-transition", "Only completed or blocked historical Slices can be reopened");
  const fragment = parseInput(
    input,
    new Set([
      "Type",
      "Authority source",
      "Scope",
      "Expected evidence",
      "Stop condition",
      "Starting state",
      "Dependencies",
    ]),
    "slice reopen",
  );
  for (const field of ["Authority source", "Scope", "Expected evidence", "Stop condition", "Starting state"])
    requireFragment(fragment, field, "slice reopen");
  const id = nextEntityId(document, "slice");
  const title = options["--title"]?.trim() || historical.title;
  const values = {
    State: "in_progress",
    Type: fragmentValue(fragment, "Type") ?? fieldLines(historical, "Type"),
    "Intended result": fieldLines(historical, "Intended result"),
    "Authority source": fragmentValue(fragment, "Authority source"),
    Scope: fragmentValue(fragment, "Scope"),
    "Expected evidence": fragmentValue(fragment, "Expected evidence"),
    "Stop condition": fragmentValue(fragment, "Stop condition"),
    "Starting state": fragmentValue(fragment, "Starting state"),
    Dependencies: fragmentValue(fragment, "Dependencies") ?? undefined,
    "Reopened from": [oldId],
  };
  const currentLines = renderBlock(`#### ${id} — ${title}`, ACTIVE_SLICE_ORDER, values);
  const nextAction = requiredNextAction(options, "slice reopen");
  const candidate = withLineChanges(document, [
    {
      start: document.current.sliceHeadingIndex + 1,
      end: document.current.nextActionHeadingIndex,
      lines: ["", ...currentLines, ""],
    },
    nextActionReplacement(document, nextAction),
  ]);
  return publish(loaded, candidate, `Reopened Slice: ${id} — reopened from ${oldId}`);
}

function checkpointInput(input, command) {
  return parseInput(input, new Set(["Type", "Condition", "Applies to"]), command);
}

async function proposeCheckpoint(options, input, loaded) {
  const document = parseDocument(loaded.text);
  const title = requiredStringOption(options, "--title");
  assertUniqueFutureTitle(document, title);
  const fragment = checkpointInput(input, "checkpoint propose");
  requireFragment(fragment, "Type", "checkpoint propose");
  requireFragment(fragment, "Condition", "checkpoint propose");
  requireFragment(fragment, "Applies to", "checkpoint propose");
  const values = {
    State: "proposed",
    Type: fragmentValue(fragment, "Type"),
    Condition: fragmentValue(fragment, "Condition"),
    "Applies to": fragmentValue(fragment, "Applies to"),
  };
  const candidate = withLineChanges(document, [
    {
      start: document.future.end,
      end: document.future.end,
      lines: renderBlock(`### Checkpoint — ${title}`, FUTURE_CHECKPOINT_ORDER, values),
    },
  ]);
  return publish(loaded, candidate, `Proposed Checkpoint: ${title}`);
}

async function activateCheckpoint(options, loaded) {
  const document = parseDocument(loaded.text);
  assertTaskActive(document, "activate a Checkpoint");
  const title = requiredStringOption(options, "--title");
  const checkpoint = findFutureItem(document, title, "checkpoint");
  assertState(checkpoint, "State", "proposed", "Only a proposed Checkpoint can be activated");
  const id = nextEntityId(document, "checkpoint");
  const replacements = [
    {
      start: checkpoint.start,
      end: checkpoint.end,
      lines: renderFutureCheckpoint({ ...checkpoint, id }, { State: "pending" }),
    },
  ];
  const nextAction = optionalNextAction(document, options);
  if (nextAction) replacements.push(nextAction);
  const candidate = withLineChanges(document, replacements);
  return publish(loaded, candidate, `Activated Checkpoint: ${id}`);
}

async function changeCheckpointState(options, loaded, nextState) {
  const document = parseDocument(loaded.text);
  const id = requiredStringOption(options, "--id");
  const checkpoint = findEntity(document, id, "checkpoint");
  const currentState = fieldValue(checkpoint, "State");
  if (nextState === "deferred" && currentState !== "pending")
    fail("invalid-transition", "Only a pending Checkpoint can be deferred");
  if (nextState === "pending" && currentState !== "deferred")
    fail("invalid-transition", "Only a deferred Checkpoint can return to pending");
  if (nextState === "pending") assertTaskActive(document, "resume a Checkpoint");
  const replacements = [
    { start: checkpoint.start, end: checkpoint.end, lines: renderFutureCheckpoint(checkpoint, { State: nextState }) },
  ];
  const nextAction = optionalNextAction(document, options);
  if (nextAction) replacements.push(nextAction);
  const candidate = withLineChanges(document, replacements);
  return publish(loaded, candidate, `${nextState === "pending" ? "Resumed" : "Deferred"} Checkpoint: ${id}`);
}

async function closeCheckpoint(options, input, loaded) {
  const document = parseDocument(loaded.text);
  const id = requiredStringOption(options, "--id");
  const checkpoint = findEntity(document, id, "checkpoint");
  if (!new Set(["pending", "deferred"]).has(fieldValue(checkpoint, "State")))
    fail("invalid-transition", "Only a pending or deferred Checkpoint can be closed");
  const state = requiredStringOption(options, "--state");
  if (!HISTORICAL_CHECKPOINT_STATES.has(state)) fail("invalid-state", `Invalid historical Checkpoint state: ${state}`);
  const fragment = parseInput(
    input,
    new Set(["Result", "Evidence", "Task effect", "Reason", "Replaced by"]),
    "checkpoint close",
  );
  const values = {
    State: state,
    Type: fieldLines(checkpoint, "Type"),
    Condition: fieldLines(checkpoint, "Condition"),
    "Applies to": fieldLines(checkpoint, "Applies to"),
    Result: requireFragment(fragment, "Result", "checkpoint close"),
    Evidence: fragmentValue(fragment, "Evidence") ?? undefined,
    "Task effect": requireFragment(fragment, "Task effect", "checkpoint close"),
    Reason: ["cancelled", "replaced"].includes(state)
      ? requireFragment(fragment, "Reason", "checkpoint close")
      : undefined,
    "Replaced by": state === "replaced" ? requireFragment(fragment, "Replaced by", "checkpoint close") : undefined,
  };
  const historical = renderHistoricalCheckpoint(checkpoint, values);
  const replacements = [
    { start: checkpoint.start, end: checkpoint.end, lines: [] },
    { start: document.history.checkpoints.end, end: document.history.checkpoints.end, lines: historical },
  ];
  const nextAction = optionalNextAction(document, options);
  if (nextAction) replacements.push(nextAction);
  const candidate = withLineChanges(document, replacements);
  return publish(loaded, candidate, `Closed Checkpoint: ${id} — ${state}`);
}

function decisionInput(input, command) {
  return parseInput(
    input,
    new Set(["Decision", "Established by", "Rationale", "Source references", "Consequences", "Revisit when"]),
    command,
  );
}

async function addDecision(options, input, loaded) {
  const document = parseDocument(loaded.text);
  const title = requiredStringOption(options, "--title");
  const fragment = decisionInput(input, "decision add");
  for (const field of ["Decision", "Established by", "Rationale", "Consequences", "Revisit when"])
    requireFragment(fragment, field, "decision add");
  const id = nextEntityId(document, "decision");
  const values = {
    State: "active",
    Decision: fragmentValue(fragment, "Decision"),
    "Established by": fragmentValue(fragment, "Established by"),
    Rationale: fragmentValue(fragment, "Rationale"),
    "Source references": fragmentValue(fragment, "Source references") ?? undefined,
    Consequences: fragmentValue(fragment, "Consequences"),
    "Revisit when": fragmentValue(fragment, "Revisit when"),
  };
  const candidate = withLineChanges(document, [
    {
      start: document.history.decisions.end,
      end: document.history.decisions.end,
      lines: renderDecision(values, title, id),
    },
  ]);
  return publish(loaded, candidate, `Added Decision: ${id}`);
}

async function supersedeDecision(options, input, loaded) {
  const document = parseDocument(loaded.text);
  const oldId = requiredStringOption(options, "--id");
  const oldDecision = findEntity(document, oldId, "decision");
  assertState(oldDecision, "State", "active", "Only an active Decision can be superseded");
  const title = requiredStringOption(options, "--title");
  const fragment = decisionInput(input, "decision supersede");
  for (const field of ["Decision", "Established by", "Rationale", "Consequences", "Revisit when"])
    requireFragment(fragment, field, "decision supersede");
  const newId = nextEntityId(document, "decision");
  const oldValues = { ...blockValues(oldDecision, DECISION_FIELDS), State: "superseded", "Superseded by": [newId] };
  const newValues = {
    State: "active",
    Decision: fragmentValue(fragment, "Decision"),
    "Established by": fragmentValue(fragment, "Established by"),
    Rationale: fragmentValue(fragment, "Rationale"),
    "Source references": fragmentValue(fragment, "Source references") ?? undefined,
    Consequences: fragmentValue(fragment, "Consequences"),
    "Revisit when": fragmentValue(fragment, "Revisit when"),
  };
  const candidate = withLineChanges(document, [
    {
      start: oldDecision.start,
      end: oldDecision.end,
      lines: [...renderDecision(oldValues, oldDecision.title, oldId), ...renderDecision(newValues, title, newId)],
    },
  ]);
  return publish(loaded, candidate, `Superseded Decision: ${oldId} → ${newId}`);
}

async function retireDecision(options, input, loaded) {
  const document = parseDocument(loaded.text);
  const id = requiredStringOption(options, "--id");
  const decision = findEntity(document, id, "decision");
  assertState(decision, "State", "active", "Only an active Decision can be retired");
  const reason = eventText(options, input, "--reason", "decision retire");
  const values = { ...blockValues(decision, DECISION_FIELDS), State: "retired", "Retired because": [reason] };
  const candidate = withLineChanges(document, [
    { start: decision.start, end: decision.end, lines: renderDecision(values, decision.title, id) },
  ]);
  return publish(loaded, candidate, `Retired Decision: ${id}`);
}

async function setTaskState(options, loaded) {
  const document = parseDocument(loaded.text);
  const state = requiredStringOption(options, "--state");
  if (!TASK_STATES.has(state)) fail("invalid-state", `Invalid task state: ${state}`);
  const currentState = document.header.state;
  const allowedNext = {
    active: new Set(["active", "paused", "completed", "abandoned"]),
    paused: new Set(["paused", "active", "completed", "abandoned"]),
    completed: new Set(["completed", "active"]),
    abandoned: new Set(["abandoned", "active"]),
  };
  if (!allowedNext[currentState].has(state))
    fail("invalid-transition", `Task state cannot transition from ${currentState} to ${state}`);
  if (currentState === state) return `No change: task state is already ${state}\n`;
  const nextAction = requiredNextAction(options, "task set-state");
  const replacements = [
    { start: document.header.stateLine, end: document.header.stateLine + 1, lines: [`State: ${state}`] },
  ];
  const slice = document.current.currentSlice;
  if (state === "paused" && slice && fieldValue(slice, "State") === "in_progress") {
    replacements.push({
      start: slice.start,
      end: slice.end,
      lines: renderCurrentSlice(
        document,
        slice,
        { State: "paused" },
        "Paused — reason: task paused; resume when: task is reactivated.",
      ),
    });
  }
  if (["completed", "abandoned"].includes(state)) {
    if (slice) fail("invalid-task-state", `A ${state} task cannot have a Current Slice`);
    if (
      document.future.items.some(
        (item) => item.kind === "checkpoint" && ["pending", "deferred"].includes(fieldValue(item, "State")),
      )
    )
      fail("invalid-task-state", `A ${state} task cannot have a pending or deferred Checkpoint`);
  }
  if (nextAction) replacements.push(nextActionReplacement(document, nextAction));
  const candidate = withLineChanges(document, replacements);
  return publish(loaded, candidate, `Set task state: ${state}`);
}

export async function runTransition(command, positionals, options, input, loaded) {
  const operation = positionals[0];
  if (command === "slice") {
    if (operation === "propose") return proposeSlice(options, input, loaded);
    if (operation === "start") return startSlice(options, input, loaded);
    if (operation === "start-direct") return startDirectSlice(options, input, loaded);
    if (operation === "pause") return pauseSlice(options, input, loaded);
    if (operation === "resume") return resumeSlice(options, input, loaded);
    if (operation === "close") return closeSlice(options, input, loaded);
    if (operation === "reopen") return reopenSlice(options, input, loaded);
  }
  if (command === "checkpoint") {
    if (operation === "propose") return proposeCheckpoint(options, input, loaded);
    if (operation === "activate") return activateCheckpoint(options, loaded);
    if (operation === "defer") return changeCheckpointState(options, loaded, "deferred");
    if (operation === "resume") return changeCheckpointState(options, loaded, "pending");
    if (operation === "close") return closeCheckpoint(options, input, loaded);
  }
  if (command === "decision") {
    if (operation === "add") return addDecision(options, input, loaded);
    if (operation === "supersede") return supersedeDecision(options, input, loaded);
    if (operation === "retire") return retireDecision(options, input, loaded);
  }
  if (command === "task" && operation === "set-state") return setTaskState(options, loaded);
  fail("unknown-command", `Unknown lifecycle command: ${command} ${operation ?? ""}`.trim());
}

import {
  ACTIVE_SLICE_STATES,
  CHECKPOINT_STATES,
  CHECKPOINT_TYPES,
  CLAIM_RESULT_STATES,
  CHECK_RESULT_STATES,
  SLICE_TYPES,
  TASK_STATES,
  assertValidRecord,
  nextId,
} from "./model.mjs";
import { OPERATION_INPUT_KEYS } from "./command-registry.mjs";

export class OperationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OperationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new OperationError(code, message, details);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function nowTimestamp(value) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value ?? Date.now());
  if (Number.isNaN(date.valueOf())) fail("invalid-clock", "Operation clock is not a valid timestamp");
  return date.toISOString();
}

function assertInputObject(input, operation) {
  if (!isObject(input)) fail("invalid-input", `${operation} input must be an object`);
  const allowed = OPERATION_INPUT_KEYS[operation] ?? new Set();
  for (const key of Object.keys(input))
    if (!allowed.has(key))
      fail("unknown-input-field", `Unknown ${operation} input field: ${key}`, { path: `${operation}.${key}` });
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim())
    fail("missing-field", `${field} requires non-empty text`, { path: field });
  if (/[\r\n]/.test(value) && /(?:title|Id)$/.test(field))
    fail("multiline-field", `${field} must be single-line`, { path: field });
  return value;
}

function optionalText(value, field) {
  if (value === undefined || value === null) return value ?? null;
  if (typeof value !== "string") fail("invalid-field", `${field} must be text`, { path: field });
  return value;
}

function stringList(value, field, { required = false } = {}) {
  if (value === undefined) {
    if (required) fail("missing-field", `${field} requires a list`, { path: field });
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || /[\r\n]/.test(item)))
    fail("invalid-list", `${field} must be a single-line string list`, { path: field });
  return [...value];
}

function id(value, field, prefix) {
  const pattern = new RegExp(`^${prefix}-\\d{3,}$`);
  if (typeof value !== "string" || !pattern.test(value))
    fail("invalid-id", `${field} must use ${prefix}-NNN`, { path: field });
  return value;
}

function reference(value, field) {
  if (
    !isObject(value) ||
    typeof value.kind !== "string" ||
    typeof value.id !== "string" ||
    Object.keys(value).length !== 2
  )
    fail("invalid-reference", `${field} must be a { kind, id } reference`, { path: field });
  return clone(value);
}

function references(value, field, { required = false } = {}) {
  if (value === undefined) {
    if (required) fail("missing-field", `${field} requires references`, { path: field });
    return [];
  }
  if (!Array.isArray(value) || (value.length === 0 && required))
    fail("missing-field", `${field} requires at least one reference`, { path: field });
  return value.map((item, index) => reference(item, `${field}[${index}]`));
}

function assertActiveTask(record, operation) {
  if (record.record.state !== "active") fail("invalid-transition", `${operation} requires an active task`);
}

function sameList(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function currentSlice(record, sliceId, operation) {
  const idValue = id(sliceId ?? record.current.currentSliceId, `${operation}.sliceId`, "S");
  if (record.current.currentSliceId !== idValue)
    fail("slice-mismatch", `${operation} must target the Current Slice`, { path: `${operation}.sliceId` });
  const slice = record.entities.slices[idValue];
  if (!slice) fail("missing-entity", `Current Slice does not exist: ${idValue}`);
  return slice;
}

function touch(record, entity, now) {
  if (entity && Object.hasOwn(entity, "updatedAt")) entity.updatedAt = now;
  record.record.updatedAt = now;
}

function activation(now, input) {
  return {
    sequence: 1,
    authoritySource: requiredText(input.authoritySource, "slice.start.authoritySource"),
    reasonAndScope: requiredText(input.reasonAndScope, "slice.start.reasonAndScope"),
    expectedEvidence: requiredText(input.expectedEvidence, "slice.start.expectedEvidence"),
    stopCondition: requiredText(input.stopCondition, "slice.start.stopCondition"),
    startingState: requiredText(input.startingState, "slice.start.startingState"),
    openedAt: now,
    resolution: null,
  };
}

function noOp(message) {
  fail("no-op-operation", message);
}

function statementLocation(record, statementId) {
  const statementIdValue = id(statementId, "record.update.id", "CTX");
  for (const group of ["settled", "tentative", "open"]) {
    const index = record.context[group].findIndex((statement) => statement.id === statementIdValue);
    if (index >= 0) return { group, index, statement: record.context[group][index] };
  }
  fail("missing-entity", `Context statement does not exist: ${statementIdValue}`);
}

function applyContextUpdate(record, input, now) {
  if (!["goal", "direction", "sourceRefs"].includes(input.field))
    fail("invalid-field", `Unsupported context update field: ${input.field}`);
  if (input.field === "goal" || input.field === "direction") {
    const value = requiredText(input.value, `record.update.${input.field}`);
    if (record.context[input.field] === value) noOp(`Context ${input.field} is unchanged`);
    record.context[input.field] = value;
    record.record.updatedAt = now;
    return [];
  }
  if (!Object.hasOwn(input, "values")) fail("missing-field", "record.update.values requires a list");
  const values = stringList(input.values, "record.update.values");
  if (sameList(record.context.sourceRefs, values)) noOp("Context source references are unchanged");
  record.context.sourceRefs = values;
  record.record.updatedAt = now;
  return [];
}

function applyCurrentUpdate(record, input, now) {
  if (!["routeOwner", "routeReason", "nextAction"].includes(input.field))
    fail("invalid-field", `Unsupported Current Work update field: ${input.field}`);
  if (input.field === "routeOwner") {
    const value = requiredText(input.value, "record.update.routeOwner");
    if (record.current.route.owner === value) noOp("Current route owner is unchanged");
    record.current.route.owner = value;
  } else if (input.field === "routeReason") {
    const value = requiredText(input.value, "record.update.routeReason");
    if (record.current.route.reason === value) noOp("Current route reason is unchanged");
    record.current.route.reason = value;
  } else {
    const value = requiredText(input.value, "record.update.nextAction");
    if (record.current.nextAction === value) noOp("Current next action is unchanged");
    record.current.nextAction = value;
  }
  record.record.updatedAt = now;
  return [];
}

function applyStatementUpdate(record, input, now) {
  if (!["settled", "tentative", "open"].includes(input.group) && input.action !== "set" && input.action !== "remove")
    fail("invalid-group", `Unsupported context statement group: ${input.group}`);
  if (input.action === "add") {
    const group = input.group;
    const statement = {
      id: nextId(record, "context"),
      text: requiredText(input.value, "record.update.value"),
      basisRefs: stringList(input.basisRefs, "record.update.basisRefs"),
    };
    record.context[group].push(statement);
    record.record.updatedAt = now;
    return [statement.id];
  }
  const location = statementLocation(record, input.id);
  if (input.action === "set") {
    if (!["text", "basisRefs"].includes(input.field))
      fail("invalid-field", `Unsupported context statement field: ${input.field}`);
    if (input.field === "text") {
      const value = requiredText(input.value, "record.update.value");
      if (location.statement.text === value) noOp(`Context statement ${location.statement.id} is unchanged`);
      location.statement.text = value;
    } else {
      if (!Object.hasOwn(input, "values")) fail("missing-field", "record.update.values requires a list");
      const values = stringList(input.values, "record.update.values");
      if (sameList(location.statement.basisRefs, values))
        noOp(`Context statement ${location.statement.id} basis references are unchanged`);
      location.statement.basisRefs = values;
    }
    record.record.updatedAt = now;
    return [location.statement.id];
  }
  if (input.action === "remove") {
    record.context[location.group].splice(location.index, 1);
    record.record.updatedAt = now;
    return [location.statement.id];
  }
  const destination = record.context[input.group];
  if (input.beforeId !== undefined || input.afterId !== undefined) {
    const destinationId = input.beforeId ?? input.afterId;
    const target = statementLocation(record, destinationId);
    if (target.group !== input.group)
      fail("invalid-reference", "Statement positioning reference must belong to the destination group");
    if (target.statement.id === location.statement.id)
      noOp(`Context statement ${location.statement.id} is already in position`);
    if (location.group === input.group) {
      const reordered = [...destination];
      reordered.splice(location.index, 1);
      const targetIndex = reordered.findIndex((statement) => statement.id === target.statement.id);
      reordered.splice(input.beforeId === undefined ? targetIndex + 1 : targetIndex, 0, location.statement);
      if (
        sameList(
          reordered.map((statement) => statement.id),
          destination.map((statement) => statement.id),
        )
      )
        noOp(`Context statement ${location.statement.id} is already in position`);
    }
    record.context[location.group].splice(location.index, 1);
    const targetIndex = destination.findIndex((statement) => statement.id === target.statement.id);
    destination.splice(input.beforeId === undefined ? targetIndex + 1 : targetIndex, 0, location.statement);
  } else {
    if (location.group === input.group && location.index === destination.length - 1)
      noOp(`Context statement ${location.statement.id} is already last`);
    record.context[location.group].splice(location.index, 1);
    destination.push(location.statement);
  }
  record.record.updatedAt = now;
  return [location.statement.id];
}

function applyBoundaryUpdate(record, input, now) {
  if (!["add", "set", "remove"].includes(input.action))
    fail("unsupported-operation", `Unsupported boundary update action: ${input.action}`);
  if (input.action === "set" && input.field !== "text") fail("invalid-field", "Boundary update field must be text");
  if (input.action === "add") {
    const boundary = { id: nextId(record, "boundary"), text: requiredText(input.value, "record.update.value") };
    record.context.boundaries.push(boundary);
    record.record.updatedAt = now;
    return [boundary.id];
  }
  const boundaryId = id(input.id, "record.update.id", "BND");
  const index = record.context.boundaries.findIndex((boundary) => boundary.id === boundaryId);
  if (index < 0) fail("missing-entity", `Boundary does not exist: ${boundaryId}`);
  if (input.action === "set") {
    const value = requiredText(input.value, "record.update.value");
    if (record.context.boundaries[index].text === value) noOp(`Boundary ${boundaryId} is unchanged`);
    record.context.boundaries[index].text = value;
  } else {
    record.context.boundaries.splice(index, 1);
  }
  record.record.updatedAt = now;
  return [boundaryId];
}

function applyNoteUpdate(record, input, now) {
  if (input.action === "add") {
    const note = {
      id: nextId(record, "note"),
      title: requiredText(input.title, "record.update.title"),
      source: requiredText(input.source, "record.update.source"),
      body: requiredText(input.body, "record.update.body"),
      createdAt: now,
      updatedAt: now,
    };
    if (/[\r\n]/.test(note.title)) fail("multiline-field", "record.update.title must be single-line");
    record.entities.notes[note.id] = note;
    record.record.updatedAt = now;
    return [note.id];
  }
  if (input.action !== "set") fail("unsupported-operation", "Notes cannot be removed or moved through update");
  if (!["title", "source", "body"].includes(input.field))
    fail("invalid-field", `Unsupported Note update field: ${input.field}`);
  const noteId = id(input.id, "record.update.id", "N");
  const note = record.entities.notes[noteId];
  if (!note) fail("missing-entity", `Note does not exist: ${noteId}`);
  const value = requiredText(input.value, "record.update.value");
  if (input.field === "title" && /[\r\n]/.test(value))
    fail("multiline-field", "record.update.value must be single-line");
  if (note[input.field] === value) noOp(`Note ${noteId} is unchanged`);
  note[input.field] = value;
  note.updatedAt = now;
  record.record.updatedAt = now;
  return [noteId];
}

function assertOnlyUpdateFields(input, allowed) {
  for (const key of Object.keys(input))
    if (!allowed.has(key))
      fail("unknown-input-field", `Unknown record.update field for this target: ${key}`, {
        path: `record.update.${key}`,
      });
}

function applyRecordUpdate(record, input, now) {
  assertInputObject(input, "record.update");
  if (!["context", "current", "statement", "boundary", "note"].includes(input.target))
    fail("invalid-target", `Unsupported update target: ${input.target}`);
  if (!["set", "add", "remove", "move"].includes(input.action))
    fail("invalid-operation", `Unsupported update action: ${input.action}`);
  const common = new Set(["target", "action"]);
  if (input.target === "context") {
    if (input.action !== "set") fail("invalid-operation", "Context updates support only set");
    assertOnlyUpdateFields(input, new Set([...common, "field", "value", "values"]));
    if (input.field === "sourceRefs" && Object.hasOwn(input, "value"))
      fail("invalid-form", "Context sourceRefs use values, not value");
    if (input.field !== "sourceRefs" && Object.hasOwn(input, "values"))
      fail("invalid-form", "Scalar context fields use value, not values");
    return applyContextUpdate(record, input, now);
  }
  if (input.target === "current") {
    if (input.action !== "set") fail("invalid-operation", "Current Work updates support only set");
    assertOnlyUpdateFields(input, new Set([...common, "field", "value"]));
    return applyCurrentUpdate(record, input, now);
  }
  if (input.target === "statement") {
    const allowed =
      input.action === "add"
        ? new Set([...common, "group", "value", "basisRefs"])
        : input.action === "set"
          ? new Set([...common, "id", "field", "value", "values"])
          : input.action === "remove"
            ? new Set([...common, "id"])
            : new Set([...common, "id", "group", "beforeId", "afterId"]);
    assertOnlyUpdateFields(input, allowed);
    if (input.action === "set" && input.field === "text" && Object.hasOwn(input, "values"))
      fail("invalid-form", "Context statement text uses value, not values");
    if (input.action === "set" && input.field === "basisRefs" && Object.hasOwn(input, "value"))
      fail("invalid-form", "Context statement basisRefs use values, not value");
    return applyStatementUpdate(record, input, now);
  }
  if (input.target === "boundary") {
    const allowed =
      input.action === "add"
        ? new Set([...common, "value"])
        : input.action === "set"
          ? new Set([...common, "id", "field", "value"])
          : new Set([...common, "id"]);
    assertOnlyUpdateFields(input, allowed);
    return applyBoundaryUpdate(record, input, now);
  }
  const allowed =
    input.action === "add"
      ? new Set([...common, "title", "source", "body"])
      : new Set([...common, "id", "field", "value"]);
  assertOnlyUpdateFields(input, allowed);
  return applyNoteUpdate(record, input, now);
}

function applyTaskSetState(record, input, now) {
  assertInputObject(input, "task.setState");
  const state = requiredText(input.state, "task.setState.state");
  if (!TASK_STATES.has(state)) fail("invalid-task-state", `Invalid task state: ${state}`);
  if (record.record.state === state) noOp(`Task state is already ${state}`);
  if ((state === "completed" || state === "abandoned") && record.current.currentSliceId !== null)
    fail("active-current-slice", `Task state ${state} requires no Current Slice`);
  record.record.state = state;
  record.record.stateSource = requiredText(input.authoritySource, "task.setState.authoritySource");
  record.record.updatedAt = now;
  return [record.record.id];
}

function applyDecisionAdd(record, input, now) {
  assertInputObject(input, "decision.add");
  if (Object.hasOwn(input, "id")) fail("caller-supplied-id", "Decision IDs are script-owned");
  const decisionId = nextId(record, "decision");
  const decision = {
    id: decisionId,
    state: "active",
    title: requiredText(input.title, "decision.add.title"),
    decision: requiredText(input.decision, "decision.add.decision"),
    establishedBy: requiredText(input.establishedBy, "decision.add.establishedBy"),
    rationale: requiredText(input.rationale, "decision.add.rationale"),
    sourceRefs: stringList(input.sourceRefs, "decision.add.sourceRefs"),
    consequences: requiredText(input.consequences, "decision.add.consequences"),
    revisitWhen: requiredText(input.revisitWhen, "decision.add.revisitWhen"),
    supersedesId: null,
    supersededById: null,
    retirement: null,
    createdAt: now,
    updatedAt: now,
  };
  if (/[\r\n]/.test(decision.title)) fail("multiline-field", "decision.add.title must be single-line");
  record.entities.decisions[decisionId] = decision;
  record.record.updatedAt = now;
  return [decisionId];
}

function applyDecisionUpdate(record, input, now) {
  assertInputObject(input, "decision.update");
  const decisionId = id(input.decisionId, "decision.update.decisionId", "D");
  const decision = record.entities.decisions[decisionId];
  if (!decision) fail("missing-entity", `Decision does not exist: ${decisionId}`);
  if (decision.state !== "active") fail("immutable-history", "Only an active Decision can be updated");
  const fields = ["title", "decision", "establishedBy", "rationale", "sourceRefs", "consequences", "revisitWhen"];
  let changed = false;
  for (const field of fields) {
    if (!Object.hasOwn(input, field)) continue;
    const value =
      field === "sourceRefs"
        ? stringList(input[field], `decision.update.${field}`)
        : requiredText(input[field], `decision.update.${field}`);
    if (field === "title" && /[\r\n]/.test(value)) fail("multiline-field", "decision.update.title must be single-line");
    if (JSON.stringify(decision[field]) === JSON.stringify(value)) continue;
    decision[field] = value;
    changed = true;
  }
  if (!changed) noOp(`Decision ${decisionId} is unchanged`);
  touch(record, decision, now);
  return [decisionId];
}

function applyDecisionRetire(record, input, now) {
  assertInputObject(input, "decision.retire");
  const decisionId = id(input.decisionId, "decision.retire.decisionId", "D");
  const decision = record.entities.decisions[decisionId];
  if (!decision) fail("missing-entity", `Decision does not exist: ${decisionId}`);
  if (decision.state !== "active") fail("invalid-transition", "Only an active Decision can be retired");
  decision.state = "retired";
  decision.retirement = {
    authoritySource: requiredText(input.authoritySource, "decision.retire.authoritySource"),
    reason: requiredText(input.reason, "decision.retire.reason"),
    retiredAt: now,
  };
  touch(record, decision, now);
  return [decisionId];
}

function applyDecisionSupersede(record, input, now) {
  assertInputObject(input, "decision.supersede");
  const decisionId = id(input.decisionId, "decision.supersede.decisionId", "D");
  const supersededById = id(input.supersededById, "decision.supersede.supersededById", "D");
  if (decisionId === supersededById) fail("invalid-operation", "A Decision cannot supersede itself");
  const decision = record.entities.decisions[decisionId];
  const replacement = record.entities.decisions[supersededById];
  if (!decision || !replacement) fail("missing-entity", "Both Decisions must exist before supersession");
  if (decision.state !== "active" || replacement.state !== "active")
    fail("invalid-transition", "Only active Decisions can participate in supersession");
  if (decision.supersededById || replacement.supersedesId)
    fail("invalid-transition", "Decision supersession links are already assigned");
  decision.state = "superseded";
  decision.supersededById = replacement.id;
  replacement.supersedesId = decision.id;
  touch(record, decision, now);
  touch(record, replacement, now);
  return [decision.id, replacement.id];
}

function applyProposalAdd(record, input, now) {
  assertInputObject(input, "proposal.add");
  if (Object.hasOwn(input, "id")) fail("caller-supplied-id", "Proposal IDs are script-owned");
  const proposalId = nextId(record, "proposal");
  const proposal = {
    id: proposalId,
    state: "proposed",
    title: requiredText(input.title, "proposal.add.title"),
    type: requiredText(input.type, "proposal.add.type"),
    intendedResult: requiredText(input.intendedResult, "proposal.add.intendedResult"),
    expectedEvidence: requiredText(input.expectedEvidence, "proposal.add.expectedEvidence"),
    dependencies: stringList(input.dependencies, "proposal.add.dependencies"),
    selectedCheckpoints: stringList(input.selectedCheckpoints, "proposal.add.selectedCheckpoints"),
    selectedAsSliceId: null,
    withdrawal: null,
    createdAt: now,
    updatedAt: now,
  };
  if (!SLICE_TYPES.has(proposal.type)) fail("invalid-proposal-type", `Invalid Proposal type: ${proposal.type}`);
  record.entities.proposals[proposalId] = proposal;
  record.current.proposalOrder.push(proposalId);
  return [proposalId];
}

function applyProposalUpdate(record, input, now) {
  assertInputObject(input, "proposal.update");
  const proposalId = id(input.proposalId, "proposal.update.proposalId", "P");
  const proposal = record.entities.proposals[proposalId];
  if (!proposal) fail("missing-entity", `Proposal does not exist: ${proposalId}`);
  if (proposal.state !== "proposed") fail("immutable-history", "Only unselected Proposals can be updated");
  const fields = ["title", "type", "intendedResult", "expectedEvidence", "dependencies", "selectedCheckpoints"];
  const updates = {};
  for (const field of fields) {
    if (input[field] === undefined) continue;
    const value = ["dependencies", "selectedCheckpoints"].includes(field)
      ? stringList(input[field], `proposal.update.${field}`)
      : requiredText(input[field], `proposal.update.${field}`);
    if (field === "title" && /[\r\n]/.test(value)) fail("multiline-field", "proposal.update.title must be single-line");
    if (field === "type" && !SLICE_TYPES.has(value)) fail("invalid-proposal-type", `Invalid Proposal type: ${value}`);
    updates[field] = value;
  }
  if (
    !Object.keys(updates).length ||
    Object.entries(updates).every(([field, value]) => JSON.stringify(proposal[field]) === JSON.stringify(value))
  )
    noOp(`Proposal ${proposalId} is unchanged`);
  Object.assign(proposal, updates);
  touch(record, proposal, now);
  return [proposalId];
}

function applyProposalWithdraw(record, input, now) {
  assertInputObject(input, "proposal.withdraw");
  const proposalId = id(input.proposalId, "proposal.withdraw.proposalId", "P");
  const proposal = record.entities.proposals[proposalId];
  if (!proposal) fail("missing-entity", `Proposal does not exist: ${proposalId}`);
  if (proposal.state !== "proposed") fail("invalid-transition", "Only an unselected Proposal can be withdrawn");
  requiredText(input.authoritySource, "proposal.withdraw.authoritySource");
  requiredText(input.reason, "proposal.withdraw.reason");
  proposal.state = "withdrawn";
  proposal.withdrawal = {
    authoritySource: requiredText(input.authoritySource, "proposal.withdraw.authoritySource"),
    reason: requiredText(input.reason, "proposal.withdraw.reason"),
    withdrawnAt: now,
  };
  record.current.proposalOrder = record.current.proposalOrder.filter((idValue) => idValue !== proposalId);
  touch(record, proposal, now);
  return [proposalId];
}

function applyProposalMove(record, input, now) {
  assertInputObject(input, "proposal.move");
  const proposalId = id(input.proposalId, "proposal.move.proposalId", "P");
  if ((input.beforeId === undefined) === (input.afterId === undefined))
    fail("invalid-operation", "proposal.move requires exactly one destination");
  const destinationId = id(input.beforeId ?? input.afterId, "proposal.move.destination", "P");
  const from = record.current.proposalOrder.indexOf(proposalId);
  const destination = record.current.proposalOrder.indexOf(destinationId);
  if (from < 0 || destination < 0) fail("missing-entity", "Both Proposals must be in the proposed queue");
  if (from === destination) noOp(`Proposal ${proposalId} is already in position`);
  const reordered = [...record.current.proposalOrder];
  reordered.splice(from, 1);
  const adjusted = from < destination ? destination - 1 : destination;
  reordered.splice(input.beforeId === undefined ? adjusted + 1 : adjusted, 0, proposalId);
  if (sameList(reordered, record.current.proposalOrder)) noOp(`Proposal ${proposalId} is already in position`);
  record.current.proposalOrder = reordered;
  record.record.updatedAt = now;
  return [proposalId];
}

function applySliceStart(record, input, now) {
  assertInputObject(input, "slice.start");
  assertActiveTask(record, "slice.start");
  if (record.current.currentSliceId !== null) fail("existing-current-slice", "A Current Slice already exists");
  if (Object.hasOwn(input, "id")) fail("caller-supplied-id", "Slice IDs are script-owned");
  const proposal =
    input.proposalId === undefined
      ? null
      : record.entities.proposals[id(input.proposalId, "slice.start.proposalId", "P")];
  if (input.proposalId !== undefined && !proposal)
    fail("missing-entity", `Proposal does not exist: ${input.proposalId}`);
  if (proposal && proposal.state !== "proposed")
    fail("invalid-transition", "Only an unselected Proposal can be started");
  if (proposal) {
    for (const field of ["title", "type", "intendedResult", "expectedEvidence"])
      if (Object.hasOwn(input, field) && input[field] !== proposal[field])
        fail("proposal-mismatch", `slice.start.${field} must preserve the selected Proposal`);
    for (const field of ["dependencies", "selectedCheckpoints"])
      if (Object.hasOwn(input, field) && !sameList(input[field], proposal[field]))
        fail("proposal-mismatch", `slice.start.${field} must preserve the selected Proposal`);
  }
  const sliceId = nextId(record, "slice");
  const type = requiredText(proposal?.type ?? input.type, "slice.start.type");
  const title = requiredText(proposal?.title ?? input.title, "slice.start.title");
  const intendedResult = requiredText(proposal?.intendedResult ?? input.intendedResult, "slice.start.intendedResult");
  const expectedEvidence = requiredText(
    proposal?.expectedEvidence ?? input.expectedEvidence,
    "slice.start.expectedEvidence",
  );
  const dependencies = proposal
    ? [...proposal.dependencies]
    : stringList(input.dependencies, "slice.start.dependencies");
  const selectedCheckpoints = proposal
    ? [...proposal.selectedCheckpoints]
    : stringList(input.selectedCheckpoints, "slice.start.selectedCheckpoints");
  if (!SLICE_TYPES.has(type)) fail("invalid-slice-type", `Invalid Slice type: ${type}`);
  const slice = {
    id: sliceId,
    originProposalId: proposal?.id ?? null,
    state: "in_progress",
    type,
    title,
    intendedResult,
    dependencies,
    selectedCheckpoints,
    extensions: [],
    activations: [activation(now, { ...input, expectedEvidence })],
    createdAt: now,
    updatedAt: now,
  };
  record.entities.slices[sliceId] = slice;
  record.current.currentSliceId = sliceId;
  if (proposal) {
    proposal.state = "selected";
    proposal.selectedAsSliceId = sliceId;
    proposal.updatedAt = now;
    record.current.proposalOrder = record.current.proposalOrder.filter((idValue) => idValue !== proposal.id);
  }
  for (const checkpointId of selectedCheckpoints) {
    if (!record.entities.checkpoints[checkpointId])
      fail("missing-entity", `Selected Checkpoint does not exist: ${checkpointId}`);
    record.current.upcomingCheckpointIds.push(checkpointId);
  }
  record.current.upcomingCheckpointIds = [...new Set(record.current.upcomingCheckpointIds)];
  touch(record, slice, now);
  return proposal ? [sliceId, proposal.id] : [sliceId];
}

function applyExtension(record, input, now) {
  assertInputObject(input, "slice.addExtension");
  assertActiveTask(record, "slice.addExtension");
  const slice = currentSlice(record, input.sliceId, "slice.addExtension");
  if (!ACTIVE_SLICE_STATES.has(slice.state)) fail("invalid-transition", "Only an active Slice can be extended");
  const extension = {
    id: nextId(record, "extension"),
    activationSequence: slice.activations.at(-1).sequence,
    authoritySource: requiredText(input.authoritySource, "slice.addExtension.authoritySource"),
    reason: requiredText(input.reason, "slice.addExtension.reason"),
    addedScope: requiredText(input.addedScope, "slice.addExtension.addedScope"),
    addedEvidenceBoundary: requiredText(input.addedEvidenceBoundary, "slice.addExtension.addedEvidenceBoundary"),
    stopConditionChange: optionalText(input.stopConditionChange, "slice.addExtension.stopConditionChange"),
    startingState: requiredText(input.startingState, "slice.addExtension.startingState"),
    acceptedAt: now,
  };
  slice.extensions.push(extension);
  touch(record, slice, now);
  return [slice.id, extension.id];
}

function applyEvidenceAdd(record, input, now, operation = "evidence.add") {
  assertInputObject(input, operation);
  if (Object.hasOwn(input, "id")) fail("caller-supplied-id", "Evidence IDs are script-owned");
  const evidenceId = nextId(record, "evidence");
  const appliesTo = references(input.appliesTo, `${operation}.appliesTo`, { required: true });
  const item = {
    id: evidenceId,
    claim: requiredText(input.claim, `${operation}.claim`),
    requiredBoundary: requiredText(input.requiredBoundary, `${operation}.requiredBoundary`),
    observer: requiredText(input.observer, `${operation}.observer`),
    checkResult: requiredText(input.checkResult, `${operation}.checkResult`),
    claimResult: requiredText(input.claimResult, `${operation}.claimResult`),
    proves: requiredText(input.proves, `${operation}.proves`),
    doesNotProve: requiredText(input.doesNotProve, `${operation}.doesNotProve`),
    pointer: requiredText(input.pointer, `${operation}.pointer`),
    supersedesId: input.supersedesId === undefined ? null : id(input.supersedesId, `${operation}.supersedesId`, "E"),
    supersededById: null,
    appliesTo,
    observedAt: now,
  };
  if (!CHECK_RESULT_STATES.has(item.checkResult))
    fail("invalid-check-result", `Invalid check result: ${item.checkResult}`);
  if (!CLAIM_RESULT_STATES.has(item.claimResult))
    fail("invalid-claim-result", `Invalid claim result: ${item.claimResult}`);
  if (item.supersedesId) {
    const prior = record.entities.evidence[item.supersedesId];
    if (!prior) fail("missing-entity", `Evidence does not exist: ${item.supersedesId}`);
    if (prior.supersededById !== null) fail("invalid-transition", "Evidence already has a replacement");
    prior.supersededById = evidenceId;
  }
  record.entities.evidence[evidenceId] = item;
  record.record.updatedAt = now;
  return [evidenceId, ...(item.supersedesId ? [item.supersedesId] : [])];
}

function applyBlock(record, input, now) {
  assertInputObject(input, "slice.block");
  assertActiveTask(record, "slice.block");
  const slice = currentSlice(record, input.sliceId, "slice.block");
  if (slice.state !== "in_progress") fail("invalid-transition", "Only an in-progress Slice can be blocked");
  const blockerId = nextId(record, "blocker");
  const blocker = {
    id: blockerId,
    state: "active",
    appliesTo: { kind: "slice", id: slice.id },
    whyUnsafe: requiredText(input.whyUnsafe, "slice.block.whyUnsafe"),
    requiredResolution: requiredText(input.requiredResolution, "slice.block.requiredResolution"),
    resumeWhen: requiredText(input.resumeWhen, "slice.block.resumeWhen"),
    resolutionSource: null,
    createdAt: now,
    resolvedAt: null,
  };
  record.entities.blockers[blockerId] = blocker;
  slice.state = "blocked";
  touch(record, slice, now);
  return [slice.id, blockerId];
}

function applyBlockerResolve(record, input, now) {
  assertInputObject(input, "blocker.resolve");
  const blockerId = id(input.blockerId, "blocker.resolve.blockerId", "B");
  const blocker = record.entities.blockers[blockerId];
  if (!blocker) fail("missing-entity", `Blocker does not exist: ${blockerId}`);
  if (blocker.state !== "active") fail("invalid-transition", "Only an active Blocker can be resolved");
  blocker.state = "resolved";
  blocker.resolutionSource = requiredText(input.resolutionSource, "blocker.resolve.resolutionSource");
  blocker.resolvedAt = now;
  touch(record, blocker, now);
  return [blockerId];
}

function blockersFor(record, sliceId) {
  return Object.values(record.entities.blockers).filter(
    (blocker) => blocker.appliesTo?.kind === "slice" && blocker.appliesTo.id === sliceId,
  );
}

function applyResume(record, input, now) {
  assertInputObject(input, "slice.resume");
  assertActiveTask(record, "slice.resume");
  const slice = currentSlice(record, input.sliceId, "slice.resume");
  if (slice.state !== "blocked") fail("invalid-transition", "Only a blocked Slice can be resumed");
  const active = blockersFor(record, slice.id).filter((blocker) => blocker.state === "active");
  if (active.length)
    fail("active-blocker", "All Slice Blockers must resolve before resume", {
      blockerIds: active.map((blocker) => blocker.id),
    });
  slice.state = "in_progress";
  touch(record, slice, now);
  return [slice.id];
}

function evidenceIds(record, values, operation) {
  const ids = stringList(values, `${operation}.evidenceIds`, { required: true }).map((value, index) =>
    id(value, `${operation}.evidenceIds[${index}]`, "E"),
  );
  for (const evidenceId of ids)
    if (!record.entities.evidence[evidenceId]) fail("missing-entity", `Evidence does not exist: ${evidenceId}`);
  return ids;
}

function makeResolution(record, input, finalState, now, operation) {
  const evidence = evidenceIds(record, input.evidenceIds, operation);
  const resolution = {
    finalState,
    summary: requiredText(input.summary, `${operation}.summary`),
    evidenceIds: evidence,
    reviewSummary: requiredText(input.reviewSummary, `${operation}.reviewSummary`),
    taskEffect: requiredText(input.taskEffect, `${operation}.taskEffect`),
    blockerId:
      input.blockerId === undefined || input.blockerId === null
        ? null
        : id(input.blockerId, `${operation}.blockerId`, "B"),
    authoritySource:
      input.authoritySource === undefined ? null : requiredText(input.authoritySource, `${operation}.authoritySource`),
    reason: input.reason === undefined ? null : requiredText(input.reason, `${operation}.reason`),
    residualEffects:
      input.residualEffects === undefined ? null : requiredText(input.residualEffects, `${operation}.residualEffects`),
    closedAt: now,
  };
  if (finalState === "parked" && !resolution.blockerId) fail("missing-blocker", "Parked Slice requires blockerId");
  if (finalState === "abandoned" && (!resolution.authoritySource || !resolution.reason || !resolution.residualEffects))
    fail("missing-abandonment-fields", "Abandoned Slice requires authoritySource, reason, and residualEffects");
  if (resolution.blockerId && !record.entities.blockers[resolution.blockerId])
    fail("missing-entity", `Blocker does not exist: ${resolution.blockerId}`);
  return resolution;
}

function clearSliceCheckpoints(record, slice) {
  const selected = new Set(slice.selectedCheckpoints);
  record.current.upcomingCheckpointIds = record.current.upcomingCheckpointIds.filter(
    (idValue) => !selected.has(idValue),
  );
}

function applyPark(record, input, now) {
  assertInputObject(input, "slice.park");
  const slice = currentSlice(record, input.sliceId, "slice.park");
  if (slice.state !== "blocked") fail("invalid-transition", "Only a blocked Slice can be parked");
  const active = blockersFor(record, slice.id).find((blocker) => blocker.state === "active");
  const blockerId = input.blockerId ?? active?.id;
  if (!blockerId) fail("missing-blocker", "Parked Slice requires its active Blocker");
  const resolution = makeResolution(record, { ...input, blockerId }, "parked", now, "slice.park");
  slice.state = "parked";
  slice.activations.at(-1).resolution = resolution;
  record.current.currentSliceId = null;
  clearSliceCheckpoints(record, slice);
  touch(record, slice, now);
  return [slice.id, blockerId];
}

function unresolvedCheckpoints(record, slice) {
  return slice.selectedCheckpoints.filter((checkpointId) => {
    const checkpoint = record.entities.checkpoints[checkpointId];
    return !checkpoint || checkpoint.state === "upcoming";
  });
}

function applyClose(record, input, now) {
  assertInputObject(input, "slice.close");
  const slice = currentSlice(record, input.sliceId, "slice.close");
  const finalState = requiredText(input.finalState, "slice.close.finalState");
  if (finalState !== "completed" && finalState !== "abandoned")
    fail("invalid-close-state", `Invalid close state: ${finalState}`);
  if (slice.state !== "in_progress") fail("invalid-transition", "Only an in-progress Slice can be closed");
  const pending = unresolvedCheckpoints(record, slice);
  if (pending.length)
    fail("unresolved-checkpoints", "All selected Checkpoints must resolve before close", { checkpointIds: pending });
  const resolution = makeResolution(record, input, finalState, now, "slice.close");
  slice.state = finalState;
  slice.activations.at(-1).resolution = resolution;
  record.current.currentSliceId = null;
  clearSliceCheckpoints(record, slice);
  touch(record, slice, now);
  return [slice.id, ...resolution.evidenceIds];
}

function applyReopen(record, input, now) {
  assertInputObject(input, "slice.reopen");
  assertActiveTask(record, "slice.reopen");
  if (record.current.currentSliceId !== null) fail("existing-current-slice", "A Current Slice already exists");
  const sliceId = id(input.sliceId, "slice.reopen.sliceId", "S");
  const slice = record.entities.slices[sliceId];
  if (!slice) fail("missing-entity", `Slice does not exist: ${sliceId}`);
  if (ACTIVE_SLICE_STATES.has(slice.state)) fail("invalid-transition", "Only a historical Slice can be reopened");
  const activeBlockers = blockersFor(record, slice.id).filter((blocker) => blocker.state === "active");
  if (activeBlockers.length)
    fail("active-blocker", "All Slice Blockers must resolve before reopen", {
      blockerIds: activeBlockers.map((blocker) => blocker.id),
    });
  const nextActivation = slice.activations.length + 1;
  slice.state = "in_progress";
  slice.activations.push({
    sequence: nextActivation,
    authoritySource: requiredText(input.authoritySource, "slice.reopen.authoritySource"),
    reasonAndScope: requiredText(input.reasonAndScope, "slice.reopen.reasonAndScope"),
    expectedEvidence: requiredText(input.expectedEvidence, "slice.reopen.expectedEvidence"),
    stopCondition: requiredText(input.stopCondition, "slice.reopen.stopCondition"),
    startingState: requiredText(input.startingState, "slice.reopen.startingState"),
    openedAt: now,
    resolution: null,
  });
  record.current.currentSliceId = sliceId;
  touch(record, slice, now);
  return [sliceId];
}

const CORRECTABLE_FIELDS = {
  slice: new Set(["title", "intendedResult"]),
  checkpoint: new Set(["title", "selectedBy", "condition"]),
  decision: new Set(["title", "decision", "establishedBy", "rationale", "consequences", "revisitWhen"]),
};
const CORRECTION_TARGETS = {
  slice: { prefix: "S", collection: "slices" },
  checkpoint: { prefix: "C", collection: "checkpoints" },
  decision: { prefix: "D", collection: "decisions" },
};

function applyHistoryCorrection(record, input, now) {
  assertInputObject(input, "history.correct");
  const entityKind = requiredText(input.entityKind, "history.correct.entityKind");
  const targetInfo = CORRECTION_TARGETS[entityKind];
  if (!targetInfo) fail("invalid-correction-kind", `Unsupported correction target: ${entityKind}`);
  const entityId = id(input.entityId, "history.correct.entityId", targetInfo.prefix);
  const target = record.entities[targetInfo.collection][entityId];
  if (!target) fail("missing-entity", `Correction target does not exist: ${entityId}`);
  if (entityKind === "slice" && ACTIVE_SLICE_STATES.has(target.state))
    fail("immutable-history", "Only a historical Slice can be corrected");
  if (entityKind === "checkpoint" && target.state === "upcoming")
    fail("immutable-history", "Only a resolved Checkpoint can be corrected");
  if (entityKind === "decision" && target.state === "active")
    fail("immutable-history", "Only a settled Decision can be corrected");
  const field = requiredText(input.field, "history.correct.field");
  if (!CORRECTABLE_FIELDS[entityKind].has(field))
    fail("invalid-correction-field", `Field cannot be corrected: ${entityKind}.${field}`);
  const before = requiredText(input.before, "history.correct.before");
  const after = requiredText(input.after, "history.correct.after");
  if (before === after) fail("no-op-correction", "Correction must change the prior value");
  if (target[field] !== before)
    fail("correction-conflict", `Correction before value does not match ${entityKind}.${field}`);
  const evidence = evidenceIds(record, input.evidenceIds, "history.correct");
  target[field] = after;
  touch(record, target, now);
  record.entities.corrections.push({
    entityKind,
    entityId,
    field,
    before,
    after,
    reason: requiredText(input.reason, "history.correct.reason"),
    authoritySource: requiredText(input.authoritySource, "history.correct.authoritySource"),
    evidenceIds: evidence,
    createdAt: now,
  });
  return [entityId, ...evidence];
}

function applyCheckpointSelect(record, input, now) {
  assertInputObject(input, "checkpoint.select");
  const sliceId = record.current.currentSliceId;
  const defaultTarget = sliceId ? { kind: "slice", id: sliceId } : { kind: "task", id: record.record.id };
  const title = requiredText(input.title, "checkpoint.select.title");
  const type = requiredText(input.type, "checkpoint.select.type");
  if (!CHECKPOINT_TYPES.has(type)) fail("invalid-checkpoint-type", `Invalid Checkpoint type: ${type}`);
  const appliesTo =
    input.appliesTo === undefined ? defaultTarget : reference(input.appliesTo, "checkpoint.select.appliesTo");
  if (appliesTo.kind === "slice") {
    if (!sliceId || appliesTo.id !== sliceId) fail("invalid-reference", "Checkpoint must apply to the Current Slice");
  } else if (appliesTo.kind !== "task" || appliesTo.id !== record.record.id) {
    fail("invalid-reference", "Checkpoint must apply to the Current Slice or task");
  }
  const checkpointId = nextId(record, "checkpoint");
  const checkpoint = {
    id: checkpointId,
    state: "upcoming",
    title,
    type,
    selectedBy: requiredText(input.selectedBy, "checkpoint.select.selectedBy"),
    condition: requiredText(input.condition, "checkpoint.select.condition"),
    appliesTo,
    resolution: null,
    replacesId: null,
    replacedById: null,
    createdAt: now,
    updatedAt: now,
  };
  record.entities.checkpoints[checkpointId] = checkpoint;
  if (sliceId && appliesTo.kind === "slice") record.entities.slices[sliceId].selectedCheckpoints.push(checkpointId);
  record.current.upcomingCheckpointIds.push(checkpointId);
  record.current.upcomingCheckpointIds = [...new Set(record.current.upcomingCheckpointIds)];
  if (sliceId) touch(record, record.entities.slices[sliceId], now);
  return [checkpointId, ...(sliceId ? [sliceId] : [])];
}

function applyCheckpointResolve(record, input, now) {
  assertInputObject(input, "checkpoint.resolve");
  const checkpointId = id(input.checkpointId, "checkpoint.resolve.checkpointId", "C");
  const checkpoint = record.entities.checkpoints[checkpointId];
  if (!checkpoint) fail("missing-entity", `Checkpoint does not exist: ${checkpointId}`);
  if (checkpoint.state !== "upcoming") fail("invalid-transition", "Only an upcoming Checkpoint can be resolved");
  const state = requiredText(input.state, "checkpoint.resolve.state");
  if (!CHECKPOINT_STATES.has(state) || state === "upcoming")
    fail("invalid-checkpoint-state", `Invalid terminal Checkpoint state: ${state}`);
  const resolutionEvidence = evidenceIds(record, input.evidenceIds, "checkpoint.resolve");
  checkpoint.state = state;
  checkpoint.resolution = {
    judgment: requiredText(input.judgment, "checkpoint.resolve.judgment"),
    decision: requiredText(input.decision, "checkpoint.resolve.decision"),
    evidenceIds: resolutionEvidence,
    taskEffect: requiredText(input.taskEffect, "checkpoint.resolve.taskEffect"),
    reason: requiredText(input.reason, "checkpoint.resolve.reason"),
    resolvedAt: now,
  };
  if (state === "replaced") {
    const replacementId = id(input.replacedById, "checkpoint.resolve.replacedById", "C");
    if (replacementId === checkpointId) fail("invalid-operation", "A Checkpoint cannot replace itself");
    const replacement = record.entities.checkpoints[replacementId];
    if (!replacement) fail("missing-entity", `Replacement Checkpoint does not exist: ${replacementId}`);
    if (replacement.state !== "upcoming") fail("invalid-transition", "A replacement Checkpoint must be upcoming");
    if (replacement.replacesId !== null && replacement.replacesId !== checkpointId)
      fail("invalid-transition", "Replacement Checkpoint already replaces another Checkpoint");
    checkpoint.replacedById = replacementId;
    replacement.replacesId = checkpointId;
    touch(record, replacement, now);
  } else if (input.replacedById !== undefined && input.replacedById !== null) {
    fail("unexpected-field", "replacedById is only valid when resolving a Checkpoint as replaced");
  }
  record.current.upcomingCheckpointIds = record.current.upcomingCheckpointIds.filter(
    (idValue) => idValue !== checkpointId,
  );
  touch(record, checkpoint, now);
  return [checkpointId, ...resolutionEvidence];
}

function dispatch(record, operation, input, now) {
  if (operation === "record.update") return applyRecordUpdate(record, input, now);
  if (operation === "task.setState") return applyTaskSetState(record, input, now);
  if (operation === "decision.add") return applyDecisionAdd(record, input, now);
  if (operation === "decision.update") return applyDecisionUpdate(record, input, now);
  if (operation === "decision.retire") return applyDecisionRetire(record, input, now);
  if (operation === "decision.supersede") return applyDecisionSupersede(record, input, now);
  if (operation === "migration.copy" || operation === "compression.run")
    fail("special-boundary", `Use the ${operation} public boundary instead of ordinary record mutation`);
  if (operation === "proposal.add") return applyProposalAdd(record, input, now);
  if (operation === "proposal.update") return applyProposalUpdate(record, input, now);
  if (operation === "proposal.withdraw") return applyProposalWithdraw(record, input, now);
  if (operation === "proposal.move") return applyProposalMove(record, input, now);
  if (operation === "slice.start") return applySliceStart(record, input, now);
  if (operation === "slice.addExtension") return applyExtension(record, input, now);
  if (operation === "slice.block") return applyBlock(record, input, now);
  if (operation === "slice.resume") return applyResume(record, input, now);
  if (operation === "slice.park") return applyPark(record, input, now);
  if (operation === "slice.close") return applyClose(record, input, now);
  if (operation === "slice.reopen") return applyReopen(record, input, now);
  if (operation === "evidence.add") return applyEvidenceAdd(record, input, now, operation);
  if (operation === "evidence.supersede") return applyEvidenceAdd(record, input, now, operation);
  if (operation === "blocker.resolve") return applyBlockerResolve(record, input, now);
  if (operation === "checkpoint.select") return applyCheckpointSelect(record, input, now);
  if (operation === "checkpoint.resolve") return applyCheckpointResolve(record, input, now);
  if (operation === "history.correct") return applyHistoryCorrection(record, input, now);
  fail("unknown-operation", `Unsupported lifecycle operation: ${operation}`);
}

export function applyOperation(source, operation, input = {}, options = {}) {
  const record = clone(source);
  const now = nowTimestamp(options.now);
  const affectedIds = dispatch(record, operation, input, now);
  record.record.updatedAt = now;
  try {
    assertValidRecord(record);
  } catch (error) {
    if (error?.code === "invalid-record") fail("invalid-candidate", error.message, { errors: error.errors });
    throw error;
  }
  return { record, affectedIds: [...new Set(affectedIds)] };
}

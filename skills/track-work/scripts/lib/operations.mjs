import {
  HISTORICAL_SLICE_STATES,
  TASK_TRANSITIONS,
  SLICE_TYPES,
  TASK_STATES,
  assertCompleteSlice,
  clone,
  compactObject,
  ensureArray,
  ensureString,
  fail,
  nextId,
  normalizeLineEndings,
  normalizeDecision,
  normalizeCheckpoint,
  normalizeProposal,
  normalizeSlice,
} from "./model.mjs";
import {
  CHECKPOINT_RESULTS,
  COMMAND_INPUT_KEYS,
  CONTEXT_PATCH_FIELDS,
  DECISION_CONTROLLED_FIELDS,
  DECISION_ID_PATTERN,
  DECISION_OPERATIONS,
  EDIT_MODE_INPUT_KEYS,
  hasDecisionContent,
  isSingleLineTitle,
  PRECISE_FORBIDDEN_FIELDS,
  PRECISE_LIST_FIELDS,
  PRECISE_STRING_FIELDS,
  PROPOSAL_OPERATIONS,
  NOTE_OPERATIONS,
  SLICE_LIST_FIELDS,
  UPDATE_INPUT_KEYS,
  WORK_PATCH_FIELDS,
  isSingleLineList,
} from "./contract.mjs";

function assertSingleLineTitle(value, path) {
  if (!isSingleLineTitle(value)) fail("invalid-title", "Title must be a non-empty single-line string", { path });
}

function activeDecisionSync(data) {
  delete data.currentContext.activeDecisions;
}

function findById(entities, id) {
  return entities.find((entity) => entity.id === id);
}

function assertDecisionReference(value, field, path) {
  if (value === undefined || value === "") return;
  if (typeof value !== "string" || !DECISION_ID_PATTERN.test(value))
    fail("invalid-decision-reference", `Decision ${field} requires a D-NNN string`, { path });
}

function assertDecisionReferences(change, path) {
  assertDecisionReference(change.supersedes, "supersedes", `${path}.supersedes`);
  assertDecisionReference(change.supersededBy, "supersededBy", `${path}.supersededBy`);
  if (change.replacement) {
    assertDecisionReference(change.replacement.supersedes, "supersedes", `${path}.replacement.supersedes`);
    assertDecisionReference(change.replacement.supersededBy, "supersededBy", `${path}.replacement.supersededBy`);
  }
}

function assertKnownCommandInput(input, command) {
  for (const key of Object.keys(input))
    if (!COMMAND_INPUT_KEYS[command]?.has(key))
      fail("unknown-input-field", `Unknown ${command} input field: ${key}`, { path: `${command}.${key}` });
}

function assertSliceListInputs(input, path) {
  for (const field of SLICE_LIST_FIELDS) {
    if (input[field] === undefined) continue;
    if (!Array.isArray(input[field]) || input[field].some((item) => typeof item !== "string"))
      fail("invalid-input-type", `Field requires an array of strings: ${path}.${field}`, {
        path: `${path}.${field}`,
        expected: "string[]",
      });
    if (!isSingleLineList(input[field]))
      fail("invalid-list-member", `List members must be single-line strings: ${path}.${field}`, {
        path: `${path}.${field}`,
      });
  }
}

function assertRequiredText(value, code, message, path) {
  if (typeof value !== "string" || !value.trim()) fail(code, message, { path });
}

function assertDecisionContent(decision, path) {
  if (!hasDecisionContent(decision))
    fail("missing-decision-content", "Decision requires decision, rationale, or consequences", { path });
}

function assertProposalContent(proposal, path) {
  assertRequiredText(
    proposal.intendedResult,
    "missing-proposal-content",
    "Proposal intended result is required",
    `${path}.intendedResult`,
  );
  assertRequiredText(
    proposal.expectedEvidence,
    "missing-proposal-content",
    "Proposal expected evidence is required",
    `${path}.expectedEvidence`,
  );
}

function assertNoCallerControlledDecisionFields(change, path, allowed = new Set()) {
  for (const field of DECISION_CONTROLLED_FIELDS)
    if (Object.hasOwn(change, field) && !allowed.has(field))
      fail("caller-controlled-decision-field", `Decision field is controlled by its lifecycle: ${field}`, {
        path: `${path}.${field}`,
      });
}

function patchObject(target, patch) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value !== undefined && key !== "currentSlice" && key !== "taskState") target[key] = clone(value);
  }
}

function applyTaskState(data, input) {
  if (input.taskState === undefined) return;
  const next = input.taskState;
  if (!TASK_STATES.has(next)) fail("invalid-task-state", `Invalid task state: ${next}`);
  const current = data.taskState;
  const authority = input.taskStateAuthority ?? input.authoritySource ?? input.userDirection;
  if (current !== next && !authority)
    fail(
      "missing-authority",
      "Explicit task-state changes require taskStateAuthority, authoritySource, or userDirection",
    );
  if (!TASK_TRANSITIONS.get(current)?.has(next))
    fail("invalid-transition", `Task state transition ${current} → ${next} is not allowed`);
  if ((current === "Completed" || current === "Abandoned") && next === "Active" && data.currentWork.currentSlice)
    fail("invalid-transition", "A reopened terminal task cannot retain a Current Slice");
  if ((next === "Completed" || next === "Abandoned") && data.currentWork.currentSlice)
    fail("terminal-current-slice", "Clear the Current Slice before setting a terminal task state");
  data.taskState = next;
}

function assertUpdateValue(value, type, path) {
  if (type === "string" && typeof value !== "string")
    fail("invalid-input-type", `Field requires a string: ${path}`, { path, expected: "string" });
  if (type === "array") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
      fail("invalid-input-type", `Field requires an array of strings: ${path}`, { path, expected: "string[]" });
    if (!isSingleLineList(value))
      fail("invalid-list-member", `List members must be single-line strings: ${path}`, { path });
  }
}

function assertUpdatePatch(patch, fields, path) {
  if (patch === undefined) return {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    fail("invalid-input-type", `Patch requires an object: ${path}`, { path, expected: "object" });
  for (const [key, value] of Object.entries(patch)) {
    const type = fields[key];
    if (!type) fail("unknown-input-field", `Unknown update field: ${key}`, { path: `${path}.${key}` });
    if (type === "forbidden")
      fail("invalid-operation", "Use start, block, resume, or close to change Current Slice ownership", {
        path: `${path}.${key}`,
      });
    assertUpdateValue(value, type, `${path}.${key}`);
  }
  return patch;
}

function applyContextPatch(data, input) {
  const contextPatch = { ...assertUpdatePatch(input.currentContext, CONTEXT_PATCH_FIELDS, "input.currentContext") };
  const aliases = {
    goal: input.goal,
    whatDefinesTask: input.whatDefinesTask,
    settled: input.settled,
    tentative: input.tentative,
    open: input.open,
    currentDirection: input.currentDirection,
    boundaries: input.boundaries,
  };
  for (const [key, value] of Object.entries(aliases)) {
    if (value !== undefined) {
      assertUpdateValue(value, CONTEXT_PATCH_FIELDS[key], `input.${key}`);
      contextPatch[key] = value;
    }
  }
  patchObject(data.currentContext, contextPatch);

  const currentWorkPatch = assertUpdatePatch(input.currentWork, WORK_PATCH_FIELDS, "input.currentWork");
  patchObject(data.currentWork, currentWorkPatch);

  const workAliases = {
    route: input.currentRoute ?? input.route,
    nextAction: input.nextAction ?? input.nextUsefulAction,
    blockers: input.blockers,
    upcomingCheckpoints: input.upcomingCheckpoints,
  };
  for (const [key, value] of Object.entries(workAliases)) {
    if (value !== undefined) {
      assertUpdateValue(value, WORK_PATCH_FIELDS[key], `input.${key}`);
      data.currentWork[key] = clone(value);
    }
  }
}

function applyDecisionChange(data, input) {
  if (Array.isArray(input.decisions)) {
    for (const decision of input.decisions) applyDecisionChange(data, { decision });
    return;
  }
  const change = input.decision ?? (input.decisions && !Array.isArray(input.decisions) ? input.decisions : null);
  if (!change) return;
  const operation = change.operation ?? change.op ?? "add";
  if (!DECISION_OPERATIONS.has(operation))
    fail("unsupported-decision-operation", `Unsupported decision operation: ${operation}`, {
      path: "decision.operation",
    });
  assertDecisionReferences(change, "decision");
  assertNoCallerControlledDecisionFields(
    change,
    "decision",
    operation === "supersede" ? new Set(["supersededBy"]) : undefined,
  );
  if (operation === "add") {
    if (change.id !== undefined) fail("caller-supplied-id", "The script assigns decision IDs");
    assertSingleLineTitle(change.title ?? change.name ?? "Untitled decision", "decision.title");
    assertDecisionContent(change, "decision");
    const decision = normalizeDecision(change, nextId(data, "D"));
    if (findById(data.history.decisions, decision.id))
      fail("duplicate-id", `Decision ID already exists: ${decision.id}`);
    data.history.decisions.push(decision);
  } else {
    const existing = findById(data.history.decisions, change.id);
    if (!existing) fail("missing-entity", `Decision does not exist: ${change.id}`);
    if (operation === "remove" || operation === "retire") {
      existing.state = "Retired";
    } else if (operation === "supersede") {
      let replacementId = change.supersededBy;
      let replacement = replacementId ? findById(data.history.decisions, replacementId) : null;
      if (change.replacement) {
        if (change.replacement.id !== undefined) fail("caller-supplied-id", "The script assigns decision IDs");
        assertNoCallerControlledDecisionFields(change.replacement, "decision.replacement");
        assertSingleLineTitle(
          change.replacement.title ?? change.replacement.name ?? "Untitled decision",
          "decision.replacement.title",
        );
        assertDecisionContent(change.replacement, "decision.replacement");
        replacement = normalizeDecision(change.replacement, nextId(data, "D"));
        replacementId = replacement.id;
        data.history.decisions.push(replacement);
      }
      if (!replacementId) fail("missing-superseded-by", "Supersede requires supersededBy or replacement");
      if (replacementId === existing.id) fail("invalid-supersession", "A decision cannot supersede itself");
      if (!replacement) fail("missing-entity", `Replacement decision does not exist: ${replacementId}`);
      existing.state = "Superseded";
      existing.supersededBy = replacementId;
      replacement.supersedes = existing.id;
    } else {
      const updated = normalizeDecision({ ...existing, ...change }, existing.id);
      assertDecisionContent(updated, "decision");
      Object.assign(existing, updated);
    }
  }
  activeDecisionSync(data);
}

function applyProposalChange(data, input) {
  const change = input.proposal ?? (input.proposals && !Array.isArray(input.proposals) ? input.proposals : null);
  if (!change && !Array.isArray(input.proposals)) return;
  if (Array.isArray(input.proposals)) {
    data.proposals = input.proposals.map(normalizeProposal);
    return;
  }
  const operation = change.operation ?? change.op ?? "add";
  if (!PROPOSAL_OPERATIONS.has(operation))
    fail("unsupported-proposal-operation", `Unsupported proposal operation: ${operation}`, {
      path: "proposal.operation",
    });
  assertSliceListInputs(change, "proposal");
  const title = change.title ?? change.name;
  const index = data.proposals.findIndex((proposal) => proposal.title === title);
  if (operation === "add") {
    if (index >= 0) fail("duplicate-proposal", `Proposal already exists: ${title}`);
    assertSingleLineTitle(title, "proposal.title");
    const proposal = normalizeProposal(change);
    if (!proposal.title) fail("missing-proposal-title", "Proposal title is required");
    assertProposalContent(proposal, "proposal");
    data.proposals.push(proposal);
  } else if (index < 0) fail("missing-proposal", `Proposal does not exist: ${title}`);
  else if (operation === "remove") data.proposals.splice(index, 1);
  else data.proposals[index] = normalizeProposal({ ...data.proposals[index], ...change });
}

function applyNoteChange(data, input) {
  const change = input.note ?? (input.notes && !Array.isArray(input.notes) ? input.notes : null);
  if (!change && !Array.isArray(input.notes)) return;
  if (Array.isArray(input.notes)) {
    data.notes = clone(input.notes);
    return;
  }
  const operation = change.operation ?? change.op ?? "add";
  if (!NOTE_OPERATIONS.has(operation))
    fail("unsupported-note-operation", `Unsupported Note operation: ${operation}`, {
      path: "note.operation",
    });
  const title = change.title;
  const index = data.notes.findIndex((note) => note.title === title);
  if (operation === "add") {
    if (index >= 0) fail("duplicate-note", `Note already exists: ${title}`);
    assertSingleLineTitle(title, "note.title");
    data.notes.push({ title, source: ensureString(change.source), body: ensureString(change.body) });
  } else if (index < 0) fail("missing-note", `Note does not exist: ${title}`);
  else if (operation === "remove") data.notes.splice(index, 1);
  else {
    if (change.source !== undefined && typeof change.source !== "string")
      fail("invalid-input-type", "Note source requires a string", { path: "note.source" });
    if (change.body !== undefined && typeof change.body !== "string")
      fail("invalid-input-type", "Note body requires a string", { path: "note.body" });
    data.notes[index] = {
      title,
      source: change.source === undefined ? data.notes[index].source : change.source,
      body: change.body === undefined ? data.notes[index].body : change.body,
    };
  }
}

function applyCurrentSlicePatch(data, input) {
  const patch = input.currentSlice;
  if (patch === undefined) return;
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    fail("invalid-input-type", "currentSlice patch requires an object");
  if (!data.currentWork.currentSlice) fail("invalid-operation", "Use start to create a Current Slice");
  assertSliceListInputs(patch, "currentSlice");
  for (const [field, value] of Object.entries(patch)) {
    if (field === "id") fail("caller-supplied-id", "Current Slice IDs are script-owned");
    if (field === "state") {
      if (value !== data.currentWork.currentSlice.state)
        fail("invalid-transition", "Use block or resume for Current Slice state transitions");
      continue;
    }
    assertPreciseValue(field, value, `currentSlice.${field}`);
  }
  if (patch.state && patch.state !== data.currentWork.currentSlice.state)
    fail("invalid-transition", "Use block or resume for Current Slice state transitions");
  const current = data.currentWork.currentSlice;
  const normalized = normalizeSlice({ ...current, ...patch, id: current.id }, current.id);
  normalized.id = current.id;
  normalized.state = current.state;
  assertCompleteSlice(normalized, "update");
  data.currentWork.currentSlice = normalized;
}

function preciseFieldType(field) {
  if (PRECISE_LIST_FIELDS.has(field)) return "array";
  if (PRECISE_STRING_FIELDS.has(field)) return "string";
  if (field === "blocker") return "object-or-string";
  return null;
}

function assertPreciseValue(field, value, path) {
  if (PRECISE_FORBIDDEN_FIELDS.has(field))
    fail("immutable-edit-field", `Field ${field} is controlled by a dedicated transition`, { path });
  const type = preciseFieldType(field);
  if (!type) fail("unknown-edit-field", `Unknown editable field: ${field}`, { path });
  if (type === "string" && typeof value !== "string")
    fail("invalid-edit-type", `Field ${field} requires a string`, { path, expected: "string" });
  if (type === "array" && (!Array.isArray(value) || value.some((item) => typeof item !== "string")))
    fail("invalid-edit-type", `Field ${field} requires an array of strings`, { path, expected: "string[]" });
  if (field === "type" && !SLICE_TYPES.has(value)) fail("invalid-slice-type", `Invalid slice type: ${value}`, { path });
  if (
    field === "blocker" &&
    value !== null &&
    typeof value !== "string" &&
    (typeof value !== "object" || Array.isArray(value))
  )
    fail("invalid-edit-type", "Field blocker requires an object, string, or null", { path });
}

function entityCollections(data, kind) {
  if (kind === "proposal") return [{ collection: data.proposals, label: "proposals" }];
  if (kind === "decision") return [{ collection: data.history.decisions, label: "history.decisions" }];
  if (kind === "checkpoint") return [{ collection: data.history.checkpoints, label: "history.checkpoints" }];
  if (kind === "note") return [{ collection: data.notes, label: "notes" }];
  if (kind === "slice")
    return [{ collection: data.history.slices, label: "history.slices" }].concat(
      data.currentWork.currentSlice ? [{ collection: [data.currentWork.currentSlice], label: "currentSlice" }] : [],
    );
  if (kind === "currentSlice")
    return data.currentWork.currentSlice
      ? [{ collection: [data.currentWork.currentSlice], label: "currentSlice" }]
      : [];
  return null;
}

function selectPreciseEntity(data, target, path) {
  if (!target || typeof target !== "object" || Array.isArray(target))
    fail("invalid-edit-target", "Entity edits require an object target", { path });
  const kind = target.kind;
  const collections = entityCollections(data, kind);
  if (!collections) fail("invalid-edit-target", `Unknown entity kind: ${kind}`, { path });
  if (kind === "currentSlice" && !target.id && !target.title)
    return { entity: collections[0]?.collection[0], label: "currentSlice" };
  const matches = [];
  for (const { collection, label } of collections) {
    for (const entity of collection) {
      if (
        (target.id !== undefined && entity.id === target.id) ||
        (target.title !== undefined && entity.title === target.title)
      )
        matches.push({ entity, label });
    }
  }
  if (!matches.length) fail("missing-entity", `No ${kind} matched the requested selector`, { path, target });
  if (matches.length > 1)
    fail("ambiguous-entity", `Entity selector matched multiple ${kind} entities`, { path, target });
  return matches[0];
}

function fieldPathTarget(data, target, path) {
  if (typeof target !== "string") return null;
  const parts = target.split(".");
  if (parts.length !== 2) fail("invalid-edit-target", `Field target must use section.field: ${target}`, { path });
  const [section, field] = parts;
  const owners = {
    currentContext: data.currentContext,
    currentWork: data.currentWork,
    currentSlice: data.currentWork.currentSlice,
  };
  const owner = owners[section];
  if (!owner) fail("invalid-edit-target", `Unknown field target section: ${section}`, { path });
  if (section === "currentSlice" && !owner) fail("missing-entity", "There is no Current Slice to edit", { path });
  return { owner, field, path: target };
}

function setPreciseField(owner, field, value, path) {
  assertPreciseValue(field, value, path);
  owner[field] = clone(value);
}

function clearPreciseField(owner, field, path) {
  if (PRECISE_FORBIDDEN_FIELDS.has(field))
    fail("immutable-edit-field", `Field ${field} is controlled by a dedicated transition`, { path });
  if (!preciseFieldType(field)) fail("unknown-edit-field", `Unknown editable field: ${field}`, { path });
  delete owner[field];
}

function replacePreciseText(owner, field, replacement, path) {
  if (
    !replacement ||
    typeof replacement !== "object" ||
    typeof replacement.old !== "string" ||
    typeof replacement.new !== "string"
  )
    fail("invalid-edit-type", "replaceText requires { old, new } strings", { path });
  const current = owner[field];
  if (typeof current !== "string") fail("invalid-edit-type", `replaceText requires a string field: ${field}`, { path });
  const oldText = normalizeLineEndings(replacement.old);
  const newText = normalizeLineEndings(replacement.new);
  const matches = current.split(oldText).length - 1;
  if (matches !== 1)
    fail("ambiguous-text-replacement", `Expected exactly one match in ${field}, found ${matches}`, { path });
  owner[field] = current.replace(oldText, newText);
}

function applyListChange(owner, operation, field, values, path) {
  if (!PRECISE_LIST_FIELDS.has(field)) fail("invalid-list-field", `Field ${field} is not an editable list`, { path });
  if (!Array.isArray(values) || values.some((item) => typeof item !== "string"))
    fail("invalid-edit-type", `List operation ${operation} requires an array of strings`, { path });
  if (!isSingleLineList(values)) fail("invalid-list-member", "List members must be single-line strings", { path });
  const current = Array.isArray(owner[field]) ? [...owner[field]] : [];
  if (operation === "add") {
    for (const value of values) {
      if (current.includes(value)) fail("duplicate-list-member", `List ${field} already contains: ${value}`, { path });
      current.push(value);
    }
  } else {
    for (const value of values) {
      const index = current.indexOf(value);
      if (index < 0) fail("missing-list-member", `List ${field} does not contain: ${value}`, { path });
      current.splice(index, 1);
    }
  }
  owner[field] = current;
}

function applyFieldMap(owner, fields, operation, path) {
  if (fields === undefined) return;
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    fail("invalid-edit-type", `${operation} must be an object of fields`, { path });
  for (const [field, value] of Object.entries(fields)) {
    const fieldPath = `${path}.${field}`;
    if (operation === "set") setPreciseField(owner, field, value, fieldPath);
    else if (operation === "clear") clearPreciseField(owner, field, fieldPath);
    else if (operation === "replaceText") replacePreciseText(owner, field, value, fieldPath);
    else applyListChange(owner, operation, field, value, fieldPath);
  }
}

function moveProposal(data, title, destination, direction, path) {
  const from = data.proposals.findIndex((proposal) => proposal.title === title);
  if (from < 0) fail("missing-proposal", `Proposal does not exist: ${title}`, { path });
  const to = data.proposals.findIndex((proposal) => proposal.title === destination);
  if (to < 0) fail("missing-proposal", `Destination proposal does not exist: ${destination}`, { path });
  const [proposal] = data.proposals.splice(from, 1);
  const adjusted = from < to ? to - 1 : to;
  data.proposals.splice(direction === "before" ? adjusted : adjusted + 1, 0, proposal);
}

function applyPreciseEntityEdit(data, edit, path) {
  const allowed = new Set([
    "target",
    "set",
    "clear",
    "replaceText",
    "add",
    "remove",
    "rename",
    "moveBefore",
    "moveAfter",
  ]);
  for (const key of Object.keys(edit))
    if (!allowed.has(key)) fail("unknown-edit-operation", `Unknown edit operation: ${key}`, { path });
  const selected = selectPreciseEntity(data, edit.target, `${path}.target`);
  const entity = selected.entity;
  if (!entity) fail("missing-entity", "There is no Current Slice to edit", { path });
  if (edit.clear !== undefined && !Array.isArray(edit.clear))
    fail("invalid-edit-type", "clear requires an array of field names", { path: `${path}.clear` });
  if (edit.rename !== undefined) {
    assertSingleLineTitle(edit.rename, `${path}.rename`);
    entity.title = edit.rename;
  }
  applyFieldMap(entity, edit.set, "set", `${path}.set`);
  if (Array.isArray(edit.clear)) for (const field of edit.clear) clearPreciseField(entity, field, `${path}.clear`);
  applyFieldMap(entity, edit.replaceText, "replaceText", `${path}.replaceText`);
  applyFieldMap(entity, edit.add, "add", `${path}.add`);
  applyFieldMap(entity, edit.remove, "remove", `${path}.remove`);
  if (edit.moveBefore !== undefined || edit.moveAfter !== undefined) {
    if (edit.target.kind !== "proposal") fail("invalid-edit-operation", "Only proposals can be reordered", { path });
    moveProposal(
      data,
      entity.title,
      edit.moveBefore ?? edit.moveAfter,
      edit.moveBefore === undefined ? "after" : "before",
      path,
    );
  }
}

function applyPreciseFieldEdit(data, edit, path) {
  const allowed = new Set(["target", "set", "clear", "replaceText"]);
  for (const key of Object.keys(edit))
    if (!allowed.has(key)) fail("unknown-edit-operation", `Unknown edit operation: ${key}`, { path });
  const target = fieldPathTarget(data, edit.target, `${path}.target`);
  if (!target) fail("invalid-edit-target", "Unsupported edit target", { path });
  const operations = [edit.set !== undefined, edit.clear !== undefined, edit.replaceText !== undefined].filter(Boolean);
  if (operations.length > 1) fail("multiple-edit-operations", "A field edit must choose one operation", { path });
  if (edit.clear !== undefined && edit.clear !== true)
    fail("invalid-edit-type", "clear requires the boolean true", { path: `${path}.clear` });
  if (edit.set !== undefined) {
    if (typeof edit.set === "object" && !Array.isArray(edit.set))
      fail("invalid-edit-type", "Field target set requires one scalar value", { path });
    setPreciseField(target.owner, target.field, edit.set, `${path}.set`);
  }
  if (edit.clear === true) clearPreciseField(target.owner, target.field, `${path}.clear`);
  if (edit.replaceText !== undefined)
    replacePreciseText(target.owner, target.field, edit.replaceText, `${path}.replaceText`);
}

function applyPreciseCollectionEdit(data, edit, path) {
  const affectedIds = [];
  const allowed = new Set(["target", "addEntity", "removeEntity"]);
  for (const key of Object.keys(edit))
    if (!allowed.has(key)) fail("unknown-edit-operation", `Unknown edit operation: ${key}`, { path });
  const hasAdd = edit.addEntity !== undefined;
  const hasRemove = edit.removeEntity !== undefined;
  if (hasAdd === hasRemove)
    fail("multiple-edit-operations", "A collection edit must choose exactly one operation", { path });
  const collectionName = edit.target?.kind ?? edit.target?.collection;
  if (
    collectionName !== "proposals" &&
    collectionName !== "decisions" &&
    collectionName !== "checkpoints" &&
    collectionName !== "notes"
  )
    fail("invalid-edit-target", `Unknown editable collection: ${collectionName}`, { path });
  const collection =
    collectionName === "proposals"
      ? data.proposals
      : collectionName === "decisions"
        ? data.history.decisions
        : collectionName === "checkpoints"
          ? data.history.checkpoints
          : data.notes;
  if (edit.addEntity !== undefined) {
    const value = edit.addEntity;
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail("invalid-edit-type", "addEntity requires an object", { path });
    if (collectionName === "proposals") {
      assertSingleLineTitle(value.title, `${path}.addEntity.title`);
      if (collection.some((item) => item.title === value.title))
        fail("duplicate-proposal", `Proposal already exists: ${value.title}`, { path });
      if (!SLICE_TYPES.has(value.type)) fail("invalid-proposal-type", `Invalid proposal type: ${value.type}`, { path });
      assertPreciseValue("intendedResult", value.intendedResult, `${path}.addEntity.intendedResult`);
      assertPreciseValue("expectedEvidence", value.expectedEvidence, `${path}.addEntity.expectedEvidence`);
      assertSliceListInputs(value, `${path}.addEntity`);
      const proposal = normalizeProposal(value);
      assertProposalContent(proposal, `${path}.addEntity`);
      collection.push(proposal);
    } else if (collectionName === "decisions") {
      if (value.id !== undefined) fail("caller-supplied-id", "The script assigns decision IDs", { path });
      assertNoCallerControlledDecisionFields(value, `${path}.addEntity`);
      assertSingleLineTitle(value.title, `${path}.addEntity.title`);
      assertDecisionContent(value, `${path}.addEntity`);
      assertDecisionReferences(value, `${path}.addEntity`);
      const decision = normalizeDecision(value, nextId(data, "D"));
      collection.push(decision);
      affectedIds.push(decision.id);
    } else if (collectionName === "checkpoints") {
      assertSingleLineTitle(value.title, `${path}.addEntity.title`);
      if (typeof value.type !== "string" || !value.type.trim())
        fail("missing-checkpoint-field", "Checkpoint type is required", { path: `${path}.addEntity.type` });
      for (const field of ["selectedBy", "condition", "result"])
        assertPreciseValue(field, value[field], `${path}.addEntity.${field}`);
      if (collection.some((item) => item.title === value.title))
        fail("duplicate-checkpoint", `Checkpoint already exists: ${value.title}`, { path });
      collection.push(normalizeCheckpoint(value));
    } else {
      assertSingleLineTitle(value.title, `${path}.addEntity.title`);
      if (typeof value.body !== "string") fail("invalid-edit-type", "Note body requires a string", { path });
      collection.push({
        title: value.title,
        source: typeof value.source === "string" ? value.source : "",
        body: value.body,
      });
    }
  }
  if (edit.removeEntity !== undefined) {
    if (collectionName === "decisions")
      fail("decision-removal-requires-lifecycle", "Retire or supersede decisions through the decision operation");
    const selector = edit.removeEntity;
    if (!selector || typeof selector !== "object")
      fail("invalid-edit-target", "removeEntity requires an id or title selector", { path });
    const matches = collection
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          (selector.id !== undefined && item.id === selector.id) ||
          (selector.title !== undefined && item.title === selector.title),
      );
    if (!matches.length) fail("missing-entity", `No ${collectionName} matched the remove selector`, { path });
    if (matches.length > 1) fail("ambiguous-entity", `Remove selector matched multiple ${collectionName}`, { path });
    if (matches[0].item.id) affectedIds.push(matches[0].item.id);
    collection.splice(matches[0].index, 1);
  }
  return affectedIds;
}

function applyPreciseEdits(data, edits) {
  const affectedIds = [];
  if (!Array.isArray(edits) || edits.length === 0) fail("missing-edits", "update requires a non-empty edits array");
  for (const [index, edit] of edits.entries()) {
    if (!edit || typeof edit !== "object" || Array.isArray(edit))
      fail("invalid-edit", `Edit ${index} must be an object`);
    if (edit.addEntity !== undefined || edit.removeEntity !== undefined)
      affectedIds.push(...applyPreciseCollectionEdit(data, edit, `edits[${index}]`));
    else if (typeof edit.target === "string") applyPreciseFieldEdit(data, edit, `edits[${index}]`);
    else applyPreciseEntityEdit(data, edit, `edits[${index}]`);
    if (edit.target?.id) affectedIds.push(edit.target.id);
  }
  return { affectedIds: [...new Set(affectedIds)] };
}

function assertKnownUpdateInput(input) {
  for (const key of Object.keys(input))
    if (!UPDATE_INPUT_KEYS.has(key))
      fail("unknown-input-field", `Unknown update input field: ${key}`, { path: `input.${key}` });
}

function assertNoMixedEditInput(input) {
  const mixedFields = Object.keys(input).filter((key) => !EDIT_MODE_INPUT_KEYS.has(key));
  if (mixedFields.length)
    fail("mixed-update-input", "The edits form cannot be combined with direct update fields", {
      fields: mixedFields,
    });
}

function applyUpdate(data, input) {
  assertKnownUpdateInput(input);
  if (input.edits !== undefined) {
    assertNoMixedEditInput(input);
    const operation = applyPreciseEdits(data, input.edits);
    applyTaskState(data, input);
    return operation;
  }
  if (Array.isArray(input.proposals))
    fail(
      "collection-replacement-requires-edits",
      "Use explicit edits with a target and operation instead of replacing proposals",
    );
  if (Array.isArray(input.notes))
    fail(
      "collection-replacement-requires-edits",
      "Use explicit edits with a target and operation instead of replacing notes",
    );
  applyContextPatch(data, input);
  applyCurrentSlicePatch(data, input);
  applyDecisionChange(data, input);
  applyProposalChange(data, input);
  applyNoteChange(data, input);
  applyTaskState(data, input);
  if (input.start || input.close || input.block || input.resume)
    fail("invalid-operation", "Use the dedicated transition command instead of update");
  return { affectedIds: [] };
}

function assertActiveTask(data, operation) {
  if (data.taskState !== "Active")
    fail("invalid-transition", `${operation} requires an Active task; current state is ${data.taskState}`);
}

function assertExpectedCurrentSlice(data, input) {
  const current = data.currentWork.currentSlice;
  if (!current) fail("missing-current-slice", "No Current Slice exists");
  const id = input.sliceId ?? input.id ?? input.currentSliceId;
  if (id && current.id !== id) fail("slice-mismatch", `Requested slice ${id} is not the Current Slice ${current.id}`);
  return current;
}

function applyStart(data, input) {
  assertKnownCommandInput(input, "start");
  assertSliceListInputs(input, "start");
  assertActiveTask(data, "start");
  if (data.currentWork.currentSlice) fail("existing-current-slice", "A Current Slice already exists");
  if (input.id !== undefined) fail("caller-supplied-id", "The script assigns Current Slice IDs");
  const proposalTitle = input.proposalTitle ?? input.proposal;
  let source = {};
  if (proposalTitle) {
    const index = data.proposals.findIndex((proposal) => proposal.title === proposalTitle);
    if (index < 0) fail("missing-proposal", `Proposal does not exist: ${proposalTitle}`);
    source = data.proposals[index];
    data.proposals.splice(index, 1);
  }
  const slice = normalizeSlice(
    {
      ...source,
      ...input,
      title: input.title ?? source.title,
      authoritySource: input.authoritySource ?? input.authority,
    },
    nextId(data, "S"),
  );
  assertSingleLineTitle(slice.title, "start.title");
  if (!slice.authoritySource) fail("missing-authority", "start requires authoritySource");
  if (!SLICE_TYPES.has(slice.type)) fail("invalid-slice-type", `Invalid slice type: ${slice.type}`);
  assertCompleteSlice(slice, "start");
  slice.state = "In progress";
  data.currentWork.currentSlice = slice;
  return { affectedIds: [slice.id] };
}

function applyBlock(data, input) {
  assertKnownCommandInput(input, "block");
  const slice = assertExpectedCurrentSlice(data, input);
  if (slice.state !== "In progress") fail("invalid-transition", "Only an In progress slice can be blocked");
  const blocker = input.blocker ?? {
    blocker: input.reason ?? input.what,
    why: input.why,
    required: input.required ?? input.requiredResolution,
  };
  if (!blocker || typeof blocker !== "object" || !blocker.blocker || !blocker.why || !blocker.required)
    fail("missing-blocker", "block requires blocker, why, and required resolution");
  slice.state = "Blocked";
  slice.blocker = clone(blocker);
  slice.resumeWhen = ensureString(input.resumeWhen);
  data.currentWork.blockers = [blocker.blocker];
  return { affectedIds: [slice.id] };
}

function applyResume(data, input) {
  assertKnownCommandInput(input, "resume");
  assertSliceListInputs(input, "resume");
  assertActiveTask(data, "resume");
  const slice = assertExpectedCurrentSlice(data, input);
  if (slice.state !== "Blocked") fail("invalid-transition", "Only a Blocked slice can be resumed");
  const resolution = input.resolutionSource ?? input.resolvedBy;
  if (!resolution) fail("missing-resolution", "resume requires resolutionSource");
  slice.blockerHistory = [
    ...ensureArray(slice.blockerHistory),
    JSON.stringify({ blocker: slice.blocker, resolutionSource: resolution }),
  ];
  slice.blocker = null;
  slice.resumeWhen = "";
  slice.state = "In progress";
  data.currentWork.blockers = [];
  if (input.evidence !== undefined) slice.evidence = ensureArray(input.evidence);
  return { affectedIds: [slice.id] };
}

function applyReopen(data, input) {
  assertKnownCommandInput(input, "reopen");
  assertSliceListInputs(input, "reopen");
  assertActiveTask(data, "reopen");
  if (data.currentWork.currentSlice) fail("existing-current-slice", "A Current Slice already exists");
  const sliceId = input.sliceId ?? input.id ?? input.currentSliceId;
  if (!sliceId) fail("missing-slice-id", "reopen requires sliceId");
  const historyIndex = data.history.slices.findIndex((slice) => slice.id === sliceId);
  if (historyIndex < 0) fail("missing-historical-slice", `No historical slice exists with ID ${sliceId}`);
  const historical = data.history.slices[historyIndex];
  if (!HISTORICAL_SLICE_STATES.has(historical.state))
    fail("invalid-transition", "Only a historical slice can be reopened");
  const authority = input.authoritySource ?? input.authority ?? input.userDirection;
  if (!authority) fail("missing-authority", "reopen requires authoritySource");
  const reason = input.reopenReason ?? input.reason;
  if (!reason) fail("missing-reopen-reason", "reopen requires reopenReason");
  const reasonAndScope = input.reasonAndScope ?? input.scopeChange ?? input.scope;
  if (!reasonAndScope) fail("missing-reopen-scope", "reopen requires reasonAndScope");
  const expectedEvidence = input.expectedEvidence;
  if (!expectedEvidence) fail("missing-reopen-evidence", "reopen requires expectedEvidence");
  const stopCondition = input.stopCondition;
  if (!stopCondition) fail("missing-reopen-stop-condition", "reopen requires stopCondition");
  const reopenHistory = [
    ...ensureArray(historical.reopenHistory),
    JSON.stringify({
      priorState: historical.state,
      priorOutcome: historical.outcome,
      priorEvidence: historical.evidence,
      priorBlocker: historical.blocker,
      priorTaskEffect: historical.taskEffect,
      priorAbandonmentReason: historical.abandonmentReason,
      authoritySource: authority,
      reopenReason: reason,
    }),
  ];
  const reopened = normalizeSlice(
    {
      id: historical.id,
      title: historical.title,
      state: "In progress",
      type: historical.type,
      intendedResult: historical.intendedResult,
      authoritySource: authority,
      reasonAndScope,
      expectedEvidence,
      stopCondition,
      startingState: input.startingState,
      acceptedExtensions: historical.acceptedExtensions,
      dependencies: historical.dependencies,
      selectedCheckpoints: input.selectedCheckpoints,
      reopenHistory,
      currentResult: input.currentResult,
      evidence: input.evidence,
      reviewSummary: input.reviewSummary,
      taskEffect: input.taskEffect,
      pendingBoundaries: input.pendingBoundaries,
      pendingReviews: input.pendingReviews,
    },
    historical.id,
  );
  assertSingleLineTitle(reopened.title, "reopen.title");
  assertCompleteSlice(reopened, "reopen");
  data.history.slices.splice(historyIndex, 1);
  data.currentWork.currentSlice = reopened;
  data.currentWork.blockers = [];
  if (input.currentRoute !== undefined || input.route !== undefined)
    data.currentWork.route = input.currentRoute ?? input.route;
  if (input.nextAction !== undefined || input.nextUsefulAction !== undefined)
    data.currentWork.nextAction = input.nextAction ?? input.nextUsefulAction;
  return { affectedIds: [reopened.id] };
}

function unresolvedSelectedCheckpoints(data, slice) {
  const resolved = new Set(
    data.history.checkpoints
      .filter((checkpoint) => CHECKPOINT_RESULTS.has(checkpoint.result))
      .map((checkpoint) => checkpoint.title),
  );
  return ensureArray(slice.selectedCheckpoints).filter((title) => !resolved.has(title));
}

function applyClose(data, input) {
  assertKnownCommandInput(input, "close");
  assertSliceListInputs(input, "close");
  const slice = assertExpectedCurrentSlice(data, input);
  const finalState = input.finalState ?? input.state;
  if (!HISTORICAL_SLICE_STATES.has(finalState)) fail("invalid-close-state", `Invalid final slice state: ${finalState}`);
  if (finalState === "Blocked" && slice.state !== "Blocked")
    fail("invalid-transition", "Historical Blocked close requires a currently Blocked slice");
  if (finalState === "Blocked" && !(input.authoritySource ?? input.parkAuthority))
    fail("missing-authority", "Historical Blocked close requires deliberate park authority");
  if (finalState === "Abandoned" && !(input.authoritySource ?? input.abandonmentAuthority))
    fail("missing-authority", "Abandoned close requires authoritySource");
  const outcome = ensureString(input.outcome ?? input.result ?? slice.result);
  const evidence = ensureArray(input.evidence ?? slice.evidence);
  if (!outcome.trim()) fail("missing-outcome", "close requires a compact settled outcome");
  if (finalState === "Abandoned" && !(input.abandonmentReason ?? input.reason))
    fail("missing-abandonment-reason", "Abandoned close requires abandonmentReason");
  if (finalState === "Abandoned" && !(input.residualEffects ?? input.taskEffect))
    fail("missing-residual-effects", "Abandoned close requires residualEffects or taskEffect");
  if (!evidence.length) fail("missing-evidence", "close requires the strongest available evidence boundary");
  if (finalState === "Completed") {
    const pending = [
      ...ensureArray(slice.pendingBoundaries),
      ...ensureArray(slice.pendingReviews),
      ...unresolvedSelectedCheckpoints(data, slice),
    ];
    if (pending.length)
      fail("unresolved-settlement", "Completed close requires all pending boundaries to be reconciled", { pending });
    if (slice.state === "Blocked")
      fail("blocked-close", "A Blocked slice must be parked as historical Blocked or explicitly abandoned");
  }
  const entry = compactObject({
    id: slice.id,
    title: slice.title,
    state: finalState,
    type: slice.type,
    intendedResult: slice.intendedResult,
    authoritySource: slice.authoritySource,
    acceptedExtensions: slice.acceptedExtensions.length ? slice.acceptedExtensions : undefined,
    dependencies: slice.dependencies.length ? slice.dependencies : undefined,
    outcome,
    evidence,
    reviewSummary: ensureString(input.reviewSummary ?? slice.reviewSummary) || undefined,
    taskEffect: ensureString(input.residualEffects ?? input.taskEffect ?? slice.taskEffect) || undefined,
    abandonmentReason:
      finalState === "Abandoned" ? ensureString(input.abandonmentReason ?? input.reason) || undefined : undefined,
    reopenHistory: slice.reopenHistory.length ? slice.reopenHistory : undefined,
    blocker:
      finalState === "Blocked"
        ? { blocker: slice.blocker, resumeWhen: slice.resumeWhen, required: slice.blocker?.required }
        : undefined,
  });
  data.history.slices.push(entry);
  data.currentWork.currentSlice = null;
  data.currentWork.blockers = [];
  if (input.currentContext) patchObject(data.currentContext, input.currentContext);
  if (input.currentRoute !== undefined || input.route !== undefined)
    data.currentWork.route = input.currentRoute ?? input.route;
  if (input.nextAction !== undefined || input.nextUsefulAction !== undefined)
    data.currentWork.nextAction = input.nextAction ?? input.nextUsefulAction;
  if (input.taskState !== undefined) {
    if (!input.taskStateAuthority && !input.authoritySource)
      fail("missing-authority", "Post-close task-state changes require explicit authority");
    if (!TASK_STATES.has(input.taskState)) fail("invalid-task-state", `Invalid task state: ${input.taskState}`);
    if (
      (finalState === "Completed" && input.taskState !== "Completed") ||
      (finalState === "Abandoned" && input.taskState !== "Abandoned")
    )
      fail("inconsistent-task-state", "Post-close terminal task state must agree with the settled slice state");
    data.taskState = input.taskState;
  }
  return { affectedIds: [slice.id] };
}

export function applyOperation(data, command, input) {
  if (command === "update") return applyUpdate(data, input);
  if (command === "start") return applyStart(data, input);
  if (command === "block") return applyBlock(data, input);
  if (command === "resume") return applyResume(data, input);
  if (command === "reopen") return applyReopen(data, input);
  if (command === "close") return applyClose(data, input);
  fail("unknown-command", `Unsupported mutation command: ${command}`);
}

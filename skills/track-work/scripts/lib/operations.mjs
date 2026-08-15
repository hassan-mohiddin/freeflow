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
  normalizeDecision,
  normalizeProposal,
  normalizeSlice,
} from "./model.mjs";

function activeDecisionSync(data) {
  delete data.currentContext.activeDecisions;
}

function findById(entities, id) {
  return entities.find((entity) => entity.id === id);
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

function applyContextPatch(data, input) {
  const contextPatch = input.currentContext ?? {};
  const aliases = {
    goal: input.goal,
    whatDefinesTask: input.whatDefinesTask,
    settled: input.settled,
    tentative: input.tentative,
    open: input.open,
    currentDirection: input.currentDirection,
    boundaries: input.boundaries,
  };
  for (const [key, value] of Object.entries(aliases)) if (value !== undefined) contextPatch[key] = value;
  patchObject(data.currentContext, contextPatch);
  if (input.currentWork && typeof input.currentWork === "object") {
    if (Object.hasOwn(input.currentWork, "currentSlice"))
      fail("invalid-operation", "Use start, block, resume, or close to change Current Slice ownership");
    patchObject(data.currentWork, input.currentWork);
  }
  const workAliases = {
    route: input.currentRoute ?? input.route,
    nextAction: input.nextAction ?? input.nextUsefulAction,
    blockers: input.blockers,
    upcomingCheckpoints: input.upcomingCheckpoints,
  };
  for (const [key, value] of Object.entries(workAliases)) if (value !== undefined) data.currentWork[key] = clone(value);
}

function applyDecisionChange(data, input) {
  if (Array.isArray(input.decisions)) {
    for (const decision of input.decisions) applyDecisionChange(data, { decision });
    return;
  }
  const change = input.decision ?? (input.decisions && !Array.isArray(input.decisions) ? input.decisions : null);
  if (!change) return;
  const operation = change.operation ?? change.op ?? "add";
  if (operation === "add") {
    if (change.id !== undefined) fail("caller-supplied-id", "The script assigns decision IDs");
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
      existing.state = "Superseded";
      existing.supersededBy = change.supersededBy ?? change.replacement?.id ?? "";
      if (change.replacement) {
        if (change.replacement.id !== undefined) fail("caller-supplied-id", "The script assigns decision IDs");
        data.history.decisions.push(normalizeDecision(change.replacement, nextId(data, "D")));
      }
    } else {
      Object.assign(existing, normalizeDecision({ ...existing, ...change }, existing.id));
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
  const title = change.title ?? change.name;
  const index = data.proposals.findIndex((proposal) => proposal.title === title);
  if (operation === "add") {
    if (index >= 0) fail("duplicate-proposal", `Proposal already exists: ${title}`);
    const proposal = normalizeProposal(change);
    if (!proposal.title) fail("missing-proposal-title", "Proposal title is required");
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
  const title = change.title;
  const index = data.notes.findIndex((note) => note.title === title);
  if (operation === "add") {
    if (index >= 0) fail("duplicate-note", `Note already exists: ${title}`);
    data.notes.push({ title, source: ensureString(change.source), body: ensureString(change.body) });
  } else if (index < 0) fail("missing-note", `Note does not exist: ${title}`);
  else if (operation === "remove") data.notes.splice(index, 1);
  else data.notes[index] = { ...data.notes[index], ...clone(change), title };
}

function applyCurrentSlicePatch(data, input) {
  const patch = input.currentSlice;
  if (!patch) return;
  if (!data.currentWork.currentSlice) fail("invalid-operation", "Use start to create a Current Slice");
  if (patch.id !== undefined) fail("caller-supplied-id", "Current Slice IDs are script-owned");
  if (patch.state && patch.state !== data.currentWork.currentSlice.state)
    fail("invalid-transition", "Use block or resume for Current Slice state transitions");
  const current = data.currentWork.currentSlice;
  const normalized = normalizeSlice({ ...current, ...patch, id: current.id }, current.id);
  normalized.id = current.id;
  normalized.state = current.state;
  assertCompleteSlice(normalized, "update");
  data.currentWork.currentSlice = normalized;
}

const PRECISE_STRING_FIELDS = new Set([
  "title",
  "type",
  "intendedResult",
  "expectedEvidence",
  "authoritySource",
  "reasonAndScope",
  "stopCondition",
  "startingState",
  "resumeWhen",
  "result",
  "reviewSummary",
  "taskEffect",
  "goal",
  "whatDefinesTask",
  "settled",
  "tentative",
  "open",
  "currentDirection",
  "boundaries",
  "route",
  "nextAction",
  "decision",
  "establishedBy",
  "rationale",
  "consequences",
  "revisitWhen",
  "supersedes",
  "supersededBy",
  "source",
  "body",
  "selectedBy",
  "condition",
  "judgment",
  "evidence",
  "effect",
]);
const PRECISE_LIST_FIELDS = new Set([
  "acceptedExtensions",
  "dependencies",
  "selectedCheckpoints",
  "blockerHistory",
  "pendingBoundaries",
  "pendingReviews",
  "reopenHistory",
  "evidence",
  "blockers",
  "upcomingCheckpoints",
]);
const PRECISE_FORBIDDEN_FIELDS = new Set(["id", "state", "currentSlice"]);

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
  const matches = current.split(replacement.old).length - 1;
  if (matches !== 1)
    fail("ambiguous-text-replacement", `Expected exactly one match in ${field}, found ${matches}`, { path });
  owner[field] = current.replace(replacement.old, replacement.new);
}

function applyListChange(owner, operation, field, values, path) {
  if (!PRECISE_LIST_FIELDS.has(field)) fail("invalid-list-field", `Field ${field} is not an editable list`, { path });
  if (!Array.isArray(values) || values.some((item) => typeof item !== "string"))
    fail("invalid-edit-type", `List operation ${operation} requires an array of strings`, { path });
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
  if (edit.rename !== undefined) {
    if (typeof edit.rename !== "string" || !edit.rename.trim())
      fail("invalid-edit-type", "rename requires a non-empty string", { path });
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
  const allowed = new Set(["target", "addEntity", "removeEntity"]);
  for (const key of Object.keys(edit))
    if (!allowed.has(key)) fail("unknown-edit-operation", `Unknown edit operation: ${key}`, { path });
  const collectionName = edit.target?.kind ?? edit.target?.collection;
  if (collectionName !== "proposals" && collectionName !== "decisions" && collectionName !== "notes")
    fail("invalid-edit-target", `Unknown editable collection: ${collectionName}`, { path });
  const collection =
    collectionName === "proposals"
      ? data.proposals
      : collectionName === "decisions"
        ? data.history.decisions
        : data.notes;
  if (edit.addEntity !== undefined) {
    const value = edit.addEntity;
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail("invalid-edit-type", "addEntity requires an object", { path });
    if (collectionName === "proposals") {
      if (typeof value.title !== "string" || !value.title.trim())
        fail("missing-proposal-title", "Proposal title is required", { path });
      if (collection.some((item) => item.title === value.title))
        fail("duplicate-proposal", `Proposal already exists: ${value.title}`, { path });
      if (!SLICE_TYPES.has(value.type)) fail("invalid-proposal-type", `Invalid proposal type: ${value.type}`, { path });
      assertPreciseValue("intendedResult", value.intendedResult, `${path}.addEntity.intendedResult`);
      assertPreciseValue("expectedEvidence", value.expectedEvidence, `${path}.addEntity.expectedEvidence`);
      collection.push(normalizeProposal(value));
    } else if (collectionName === "decisions") {
      if (typeof value.title !== "string" || !value.title.trim())
        fail("missing-decision-title", "Decision title is required", { path });
      collection.push(normalizeDecision(value, nextId(data, "D")));
    } else {
      if (typeof value.title !== "string" || !value.title.trim())
        fail("missing-note-title", "Note title is required", { path });
      if (typeof value.body !== "string") fail("invalid-edit-type", "Note body requires a string", { path });
      collection.push({
        title: value.title,
        source: typeof value.source === "string" ? value.source : "",
        body: value.body,
      });
    }
  }
  if (edit.removeEntity !== undefined) {
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
    collection.splice(matches[0].index, 1);
  }
}

function applyPreciseEdits(data, edits) {
  if (!Array.isArray(edits) || edits.length === 0) fail("missing-edits", "update requires a non-empty edits array");
  for (const [index, edit] of edits.entries()) {
    if (!edit || typeof edit !== "object" || Array.isArray(edit))
      fail("invalid-edit", `Edit ${index} must be an object`);
    if (edit.addEntity !== undefined || edit.removeEntity !== undefined)
      applyPreciseCollectionEdit(data, edit, `edits[${index}]`);
    else if (typeof edit.target === "string") applyPreciseFieldEdit(data, edit, `edits[${index}]`);
    else applyPreciseEntityEdit(data, edit, `edits[${index}]`);
  }
  return { affectedIds: edits.map((edit) => edit.target?.id).filter(Boolean) };
}

function applyUpdate(data, input) {
  if (input.edits !== undefined) {
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
  if (!slice.authoritySource) fail("missing-authority", "start requires authoritySource");
  if (!SLICE_TYPES.has(slice.type)) fail("invalid-slice-type", `Invalid slice type: ${slice.type}`);
  assertCompleteSlice(slice, "start");
  slice.state = "In progress";
  data.currentWork.currentSlice = slice;
  return { affectedIds: [slice.id] };
}

function applyBlock(data, input) {
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
  assertActiveTask(data, "resume");
  const slice = assertExpectedCurrentSlice(data, input);
  if (slice.state !== "Blocked") fail("invalid-transition", "Only a Blocked slice can be resumed");
  const resolution = input.resolutionSource ?? input.resolvedBy;
  if (!resolution) fail("missing-resolution", "resume requires resolutionSource");
  slice.blockerHistory = [
    ...ensureArray(slice.blockerHistory),
    JSON.stringify({ blocker: slice.blocker, resolutionSource: resolution }),
  ];
  slice.blocker = "";
  slice.resumeWhen = "";
  slice.state = "In progress";
  data.currentWork.blockers = [];
  if (input.evidence !== undefined) slice.evidence = ensureArray(input.evidence);
  if (input.scopeChange !== undefined) slice.reasonAndScope = ensureString(input.scopeChange);
  return { affectedIds: [slice.id] };
}

function applyReopen(data, input) {
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

function applyClose(data, input) {
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
    const pending = [...ensureArray(slice.pendingBoundaries), ...ensureArray(slice.pendingReviews)];
    if (pending.length && !input.resolvedPending)
      fail(
        "unresolved-settlement",
        "Completed close requires all pending boundaries to be resolved or explicitly deferrable",
        { pending },
      );
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
    reopenHistory: slice.reopenHistory.length ? slice.reopenHistory : undefined,
    blocker:
      finalState === "Blocked"
        ? JSON.stringify({ blocker: slice.blocker, resumeWhen: slice.resumeWhen, required: slice.blocker?.required })
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

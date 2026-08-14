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
  data.currentContext.activeDecisions = data.history.decisions
    .filter((decision) => decision.state === "Active")
    .map((decision) => ({
      id: decision.id,
      title: decision.title,
      summary: decision.decision || decision.consequences || "",
    }));
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

function applyUpdate(data, input) {
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
  const suppliedSnapshot = input.reopenSlice;
  const storedSnapshot = historical.reopenSnapshot;
  let snapshot = null;
  if (storedSnapshot && typeof storedSnapshot === "object" && !Array.isArray(storedSnapshot)) {
    snapshot = storedSnapshot;
  } else if (suppliedSnapshot && typeof suppliedSnapshot === "object" && !Array.isArray(suppliedSnapshot)) {
    snapshot = {
      ...suppliedSnapshot,
      id: historical.id,
      title: historical.title,
      type: historical.type,
      intendedResult: historical.intendedResult,
      authoritySource: historical.authoritySource,
      acceptedExtensions: historical.acceptedExtensions,
      dependencies: historical.dependencies,
    };
  }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    fail(
      "slice-not-reopenable",
      "Historical slice has no reopen snapshot; provide the missing Current Slice declarations in reopenSlice",
    );
  const reopenHistory = [
    ...ensureArray(snapshot.reopenHistory),
    JSON.stringify({
      priorState: historical.state,
      priorOutcome: historical.outcome,
      priorEvidence: historical.evidence,
      priorBlocker: historical.blocker,
      priorTaskEffect: historical.taskEffect,
      authoritySource: historical.authoritySource,
      reopenReason: reason,
      reopenedBy: authority,
    }),
  ];
  const reopened = normalizeSlice(
    {
      ...snapshot,
      id: historical.id,
      state: "In progress",
      blocker: "",
      resumeWhen: "",
      reopenHistory,
      resultSummary: snapshot.result,
    },
    historical.id,
  );
  if (input.scopeChange !== undefined) reopened.reasonAndScope = ensureString(input.scopeChange);
  if (input.expectedEvidence !== undefined) reopened.expectedEvidence = ensureString(input.expectedEvidence);
  if (input.stopCondition !== undefined) reopened.stopCondition = ensureString(input.stopCondition);
  if (input.currentResult !== undefined) reopened.result = ensureString(input.currentResult);
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
  const entry = {
    id: slice.id,
    title: slice.title,
    state: finalState,
    type: slice.type,
    intendedResult: slice.intendedResult,
    authoritySource: slice.authoritySource,
    acceptedExtensions: slice.acceptedExtensions,
    dependencies: slice.dependencies,
    outcome,
    evidence,
    reviewSummary: ensureString(input.reviewSummary ?? slice.reviewSummary),
    taskEffect: ensureString(input.residualEffects ?? input.taskEffect ?? slice.taskEffect),
    reopenSnapshot: clone(slice),
    blocker:
      finalState === "Blocked"
        ? JSON.stringify({ blocker: slice.blocker, resumeWhen: slice.resumeWhen, required: slice.blocker?.required })
        : "",
  };
  data.history.slices.push(compactObject(entry));
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

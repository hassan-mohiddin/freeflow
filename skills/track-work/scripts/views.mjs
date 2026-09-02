import { ACTIVE_SLICE_STATES, assertValidRecord, sha256 } from "./model.mjs";
import {
  renderBlocker,
  renderBoundary,
  renderCheckpoint,
  renderContext,
  renderCurrentWork,
  renderDecision,
  renderEvidence,
  renderNote,
  renderProposal,
  renderRecord,
  renderSlice,
  renderStatement,
} from "./markdown-codec.mjs";

export class ViewError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ViewError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new ViewError(code, message, details);
}

function viewHeader(record, view, recordSha) {
  const current = record.current.currentSliceId === null ? null : record.entities.slices[record.current.currentSliceId];
  const currentSummary = current ? `${current.id} — ${current.state} — ${current.type}` : "None";
  return [
    `# Track Work View: ${view}`,
    `Task: ${record.record.name}`,
    `Task ID: ${record.record.id}`,
    `State: ${record.record.state}`,
    `Schema: ${record.schemaVersion}`,
    `Record SHA-256: ${recordSha}`,
    `Current Slice: ${currentSummary}`,
  ].join("\n");
}

function section(title, content) {
  return content ? [`## ${title}`, content].join("\n") : "";
}

function activeDecisions(record) {
  return Object.values(record.entities.decisions).filter((decision) => decision.state === "active");
}

function orderedProposals(record) {
  const proposals = record.entities.proposals;
  const order = new Map(record.current.proposalOrder.map((id, index) => [id, index]));
  return Object.values(proposals)
    .filter((proposal) => proposal.state === "proposed")
    .sort(
      (left, right) =>
        (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
}

function renderDecisions(record) {
  const decisions = activeDecisions(record);
  return decisions.length ? section("Active Decisions", decisions.map(renderDecision).join("\n")) : "";
}

function renderProposals(record) {
  const content = orderedProposals(record).map(renderProposal).join("\n");
  return section("Proposed Slices", content);
}

function renderCurrentSummary(record) {
  const slice = record.current.currentSliceId === null ? null : record.entities.slices[record.current.currentSliceId];
  if (!slice) return "### Current Slice\n[none]";
  return [
    "### Current Slice",
    `- ID: ${slice.id}`,
    `- Title: ${slice.title}`,
    `- State: ${slice.state}`,
    `- Type: ${slice.type}`,
    `- Intended result: ${slice.intendedResult}`,
  ].join("\n");
}

function renderCurrentWorkSummary(record) {
  const current = record.current;
  return [
    "## Current Work",
    "- Current route:",
    `  - Owner: ${current.route.owner}`,
    `  - Route reason: ${current.route.reason}`,
    `- Current Slice ID: ${current.currentSliceId ?? "[none]"}`,
    `- Next useful action: ${current.nextAction}`,
  ].join("\n");
}

function appliesTo(entity, sliceId) {
  const target = entity?.appliesTo;
  if (Array.isArray(target)) return target.some((item) => item?.kind === "slice" && item.id === sliceId);
  return target?.kind === "slice" && target.id === sliceId;
}

function relevantEntities(record, sliceId) {
  return {
    checkpoints: Object.values(record.entities.checkpoints).filter((item) => appliesTo(item, sliceId)),
    evidence: Object.values(record.entities.evidence).filter((item) => appliesTo(item, sliceId)),
    blockers: Object.values(record.entities.blockers).filter((item) => appliesTo(item, sliceId)),
  };
}

function renderExecute(record) {
  const sliceId = record.current.currentSliceId;
  if (sliceId === null)
    return [renderContext(record.context), renderCurrentWorkSummary(record), "### Current Slice\n[none]"].join("\n\n");
  const slice = record.entities.slices[sliceId];
  const relevant = relevantEntities(record, sliceId);
  const blocks = [
    renderContext(record.context),
    renderCurrentWorkSummary(record),
    ["### Current Slice", renderSlice(slice)].join("\n"),
    renderDecisions(record),
    section("Checkpoints", relevant.checkpoints.map(renderCheckpoint).join("\n")),
    section("Evidence", relevant.evidence.map(renderEvidence).join("\n")),
    section("Blockers", relevant.blockers.map(renderBlocker).join("\n")),
  ];
  return blocks.filter(Boolean).join("\n\n");
}

function renderRecent(record, limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    fail("invalid-limit", "Recent view limit must be an integer from 1 through 100");
  const slices = Object.values(record.entities.slices)
    .filter((slice) => !ACTIVE_SLICE_STATES.has(slice.state))
    .sort(
      (left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)) || left.id.localeCompare(right.id),
    )
    .slice(-limit);
  return section("Recent History", slices.map((slice) => renderSlice(slice)).join("\n"));
}

function renderEntity(record, entityId) {
  if (typeof entityId !== "string" || !entityId) fail("missing-entity", "Entity view requires a stable entity ID");
  const entities = [
    ...Object.values(record.entities.slices).map((item) => ({ item, content: renderSlice(item) })),
    ...Object.values(record.entities.proposals).map((item) => ({ item, content: renderProposal(item) })),
    ...Object.values(record.entities.decisions).map((item) => ({ item, content: renderDecision(item) })),
    ...Object.values(record.entities.checkpoints).map((item) => ({ item, content: renderCheckpoint(item) })),
    ...Object.values(record.entities.evidence).map((item) => ({ item, content: renderEvidence(item) })),
    ...Object.values(record.entities.blockers).map((item) => ({ item, content: renderBlocker(item) })),
    ...Object.values(record.entities.notes).map((item) => ({ item, content: renderNote(item) })),
    ...record.context.settled.map((item) => ({ item, content: renderStatement(item) })),
    ...record.context.tentative.map((item) => ({ item, content: renderStatement(item) })),
    ...record.context.open.map((item) => ({ item, content: renderStatement(item) })),
    ...record.context.boundaries.map((item) => ({ item, content: renderBoundary(item) })),
  ];
  const matches = entities.filter(({ item }) => item.id === entityId);
  if (matches.length === 0) fail("missing-entity", `No entity matched ${entityId}`);
  if (matches.length > 1) fail("ambiguous-entity", `Entity ID matched multiple entities: ${entityId}`);
  return matches[0].content;
}

export function renderView(record, view, options = {}) {
  assertValidRecord(record);
  const recordSha = options.recordSha ?? sha256(renderRecord(record));
  const header = viewHeader(record, view, recordSha);
  let body;
  if (view === "resume") {
    body = [
      renderContext(record.context),
      renderDecisions(record),
      renderCurrentWork(record.current, record.entities.slices),
      renderProposals(record),
    ]
      .filter(Boolean)
      .join("\n\n");
  } else if (view === "discuss") {
    body = [
      renderContext(record.context),
      renderDecisions(record),
      renderProposals(record),
      renderCurrentSummary(record),
    ]
      .filter(Boolean)
      .join("\n\n");
  } else if (view === "execute") {
    body = renderExecute(record);
  } else if (view === "recent") {
    body = renderRecent(record, options.limit ?? 5);
  } else if (view === "entity") {
    body = renderEntity(record, options.entityId);
  } else if (view === "full") {
    body = renderRecord(record);
  } else {
    fail("invalid-view", `Unknown view: ${view}`);
  }
  return `${header}\n\n${body}\n`;
}

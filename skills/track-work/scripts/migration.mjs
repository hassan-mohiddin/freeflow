import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  ACTIVE_SLICE_STATES,
  BLOCKER_STATES,
  CHECKPOINT_STATES,
  CHECKPOINT_TYPES,
  DECISION_STATES,
  SLICE_TYPES,
  assertValidRecord,
  createRecord,
  nextId,
  sha256,
} from "./model.mjs";
import { parseRecord, renderRecord } from "./markdown-codec.mjs";
import { parseRecord as parseSchemaV2Record } from "./compat/schema-v2/codec.mjs";
import { inventoryText } from "./source-inventory.mjs";
import { assertGitSafeTaskPath, assertNoSymlinkPath, assertSafeRecordPath, pathInside } from "./workspace.mjs";

const DISPOSITIONS = new Set(["represented", "verbatim", "normalized", "deferred"]);
const NULL_VALUES = new Set(["", "none", "null", "[none]"]);
const SOURCE_DATA_BY_ENTITY = new WeakMap();
const SOURCE_FIELD_ALIASES = new Map([
  ["Who decided or what established it", "Established by"],
  ["Rationale and sources", "Rationale"],
  ["Starting code or artifact state", "Starting state"],
  ["Accepted extensions and authority", "Accepted extensions"],
  ["Judgment or decision", "Judgment"],
  ["Evidence or result pointer", "Evidence"],
  ["Effect on the task", "Task effect"],
  ["Effect on task", "Task effect"],
  ["Effect on understanding, decisions, or hypotheses", "Task effect"],
  ["Blocker and required resolution", "Blocker"],
  ["Current result", "Result"],
]);
const SOURCE_LIST_FIELDS = new Set([
  "Dependencies",
  "Selected checkpoints",
  "Accepted extensions",
  "Evidence",
  "Source refs",
  "Blocker history",
  "Pending boundaries",
  "Pending reviews",
  "Reopen history",
]);
const UNSUPPORTED_SOURCE_FIELDS = new Set([
  "Blocker history",
  "Pending boundaries",
  "Pending reviews",
  "Reopen history",
  "Result",
]);

export class MigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new MigrationError(code, message, details);
}

function nonEmpty(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("missing-migration-field", `${field} is required`);
  return value.trim();
}

function normalizeTimestamp(value, fallback, field) {
  if (!value || NULL_VALUES.has(String(value).trim().toLowerCase())) return new Date(fallback).toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) fail("invalid-timestamp", `${field} is invalid`);
  return date.toISOString();
}

function normalizeState(value, fallback = "active", { strict = false, field = "state" } = {}) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_");
  const aliases = {
    active: "active",
    paused: "paused",
    completed: "completed",
    abandoned: "abandoned",
    in_progress: "in_progress",
    blocked: "blocked",
    parked: "parked",
    proposed: "proposed",
    selected: "selected",
    withdrawn: "withdrawn",
    superseded: "superseded",
    retired: "retired",
    upcoming: "upcoming",
    deferred: "deferred",
    cancelled: "cancelled",
    canceled: "cancelled",
    replaced: "replaced",
    resolved: "resolved",
  };
  if (aliases[normalized]) return aliases[normalized];
  if (strict && normalized) fail("invalid-task-state", `${field} is unsupported: ${value}`);
  return fallback;
}

function normalizeType(value, values, fallback) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_");
  return values.has(normalized) ? normalized : fallback;
}

function linesOf(text) {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function headerValue(text, label) {
  const firstSection = linesOf(text).findIndex((line) => /^##\s+/.test(line));
  const header = linesOf(text).slice(0, firstSection < 0 ? undefined : firstSection);
  return (
    header
      .find((line) => new RegExp(`^${label}:\\s*(.*)$`, "i").test(line))
      ?.replace(new RegExp(`^${label}:\\s*`, "i"), "") ?? null
  );
}

function blockAfterHeading(text, title) {
  const lines = linesOf(text);
  const index = lines.findIndex((line) =>
    new RegExp(`^###\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i").test(line),
  );
  if (index < 0) return null;
  const body = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (/^#{1,3}\s+/.test(lines[cursor])) break;
    body.push(lines[cursor]);
  }
  return body.join("\n").trim();
}

function canonicalSourceFieldLabel(label) {
  return SOURCE_FIELD_ALIASES.get(label.trim()) ?? label.trim();
}

function sourceFieldLabels(label) {
  const canonical = canonicalSourceFieldLabel(label);
  return [label, ...[...SOURCE_FIELD_ALIASES.entries()].filter(([, value]) => value === canonical).map(([key]) => key)];
}

function sourceFieldLine(line) {
  if (/^\s+/.test(line)) return null;
  const match = /^(?:[-*]\s*)?([^:]+):(?:[ \t]?(.*))?$/.exec(line);
  if (!match || !/^[A-Z]/.test(match[1].trim())) return null;
  return { label: match[1].trim(), value: match[2] ?? "" };
}

function fieldValue(text, label) {
  const heading = sourceFieldLabels(label)
    .map((candidate) => blockAfterHeading(text, candidate))
    .find((value) => value !== null);
  if (heading && heading !== "[empty]" && heading.toLowerCase() !== "none")
    return heading.replace(/^>\s?/gm, "").trim();
  const labels = new Set(sourceFieldLabels(label).map((candidate) => candidate.toLowerCase()));
  const lines = linesOf(text);
  const index = lines.findIndex((line) => labels.has(sourceFieldLine(line)?.label.toLowerCase()));
  if (index < 0) return null;
  const first = sourceFieldLine(lines[index]);
  const values = [first?.value ?? ""];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (/^#{1,6}\s+/.test(lines[cursor]) || sourceFieldLine(lines[cursor])) break;
    values.push(lines[cursor].replace(/^ {2}/, ""));
  }
  return values.join("\n").trim();
}

function listValue(text, label) {
  const lines = linesOf(text);
  const labels = new Set(sourceFieldLabels(label).map((candidate) => candidate.toLowerCase()));
  const index = lines.findIndex((line) => {
    const field = sourceFieldLine(line);
    return field && labels.has(field.label.toLowerCase()) && field.value === "";
  });
  if (index >= 0) {
    const values = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^#{1,4}\s+/.test(lines[cursor]) || sourceFieldLine(lines[cursor])) break;
      const item = lines[cursor].match(/^\s*[-*]\s+(.+)$/);
      if (item) values.push(item[1].trim());
    }
    if (values.length) return values;
  }
  const value = fieldValue(text, label);
  if (!value || NULL_VALUES.has(value.toLowerCase())) return [];
  return value.split(/\s*,\s*/).filter(Boolean);
}

function fieldFromRange(inventory, entity) {
  const units = new Map(inventory.sourceUnits.map((unit) => [unit.unitId, unit]));
  return entity.sourceUnitIds.map((unitId) => units.get(unitId)?.content ?? "").join("\n");
}

const SOURCE_FIELD_KEYS = {
  Type: "type",
  State: "state",
  "Intended result": "intendedResult",
  "Expected evidence": "expectedEvidence",
  "Authority source": "authoritySource",
  "Reason and scope": "reasonAndScope",
  "Starting state": "startingState",
  "Accepted extensions and authority": "acceptedExtensions",
  "Accepted extensions": "acceptedExtensions",
  Dependencies: "dependencies",
  "Selected checkpoints": "selectedCheckpoints",
  Outcome: "outcome",
  Evidence: "evidence",
  "Review summary": "reviewSummary",
  "Task effect": "taskEffect",
  Effect: "effect",
  "Abandonment reason": "abandonmentReason",
  Reason: "reason",
  "Blocker and required resolution": "blocker",
  Decision: "decision",
  "Established by": "establishedBy",
  Rationale: "rationale",
  "Source refs": "sourceRefs",
  Consequences: "consequences",
  "Revisit when": "revisitWhen",
  Supersedes: "supersedes",
  "Superseded by": "supersededBy",
  "Selected by": "selectedBy",
  Condition: "condition",
  Result: "result",
  Judgment: "judgment",
  "Applies to": "appliesTo",
  Source: "source",
  Body: "body",
};

function sourceEntityData(entity, sourceData) {
  if (!sourceData) return null;
  const find = (values) =>
    values?.find((item) => (entity.id && item.id === entity.id) || (!entity.id && item.title === entity.title)) ?? null;
  if (entity.kind === "proposal") return find(sourceData.proposals);
  if (entity.kind === "decision") return find(sourceData.history?.decisions);
  if (entity.kind === "checkpoint") return find(sourceData.history?.checkpoints);
  if (entity.kind === "note") return find(sourceData.notes);
  if (entity.kind === "slice") {
    if (entity.representation === "current") return sourceData.currentWork?.currentSlice ?? null;
    return find(sourceData.history?.slices);
  }
  if (entity.kind === "blocker") return sourceData.currentWork?.currentSlice?.blocker ?? null;
  return null;
}

function sourceValue(entity, label, sourceData) {
  const parsed = sourceEntityData(entity, sourceData);
  const key = SOURCE_FIELD_KEYS[canonicalSourceFieldLabel(label)];
  if (parsed && key && parsed[key] !== undefined && parsed[key] !== null) return parsed[key];
  return undefined;
}

function rangeField(inventory, entity, label, sourceData = null) {
  const parsed = sourceValue(entity, label, sourceData ?? SOURCE_DATA_BY_ENTITY.get(entity));
  if (parsed !== undefined) {
    if (Array.isArray(parsed)) return parsed.join("\n");
    if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
    return String(parsed);
  }
  return fieldValue(fieldFromRange(inventory, entity), label);
}

function rangeList(inventory, entity, label, sourceData = null) {
  const parsed = sourceValue(entity, label, sourceData ?? SOURCE_DATA_BY_ENTITY.get(entity));
  if (Array.isArray(parsed)) return parsed.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  return listValue(fieldFromRange(inventory, entity), label);
}

function idFrom(value, prefix) {
  const match = new RegExp(`\\b${prefix}-\\d{3,}\\b`).exec(String(value ?? ""));
  return match?.[0] ?? null;
}

function sourceFieldSpans(inventory, entity) {
  const unitsById = new Map(inventory.sourceUnits.map((unit) => [unit.unitId, unit]));
  const fields = [];
  const orphanUnitIds = [];
  let current = null;
  const finish = () => {
    if (current) fields.push(current);
    current = null;
  };
  for (const unitId of entity.sourceUnitIds) {
    const unit = unitsById.get(unitId);
    if (!unit) continue;
    const field = sourceFieldLine(unit.content);
    if (field) {
      finish();
      current = { label: field.label, lines: [field.value], unitIds: [unitId] };
    } else if (current) {
      current.lines.push(unit.content.replace(/^ {2}/, ""));
      current.unitIds.push(unitId);
    } else if (unit.content.trim() && !/^#{1,6}\s+/.test(unit.content)) {
      orphanUnitIds.push(unitId);
    }
  }
  finish();
  return { fields, orphanUnitIds };
}

function sourceFieldText(field) {
  return field.lines.join("\n").trim();
}

function sourceFieldValues(field) {
  const canonical = canonicalSourceFieldLabel(field.label);
  if (!SOURCE_LIST_FIELDS.has(canonical)) return sourceFieldText(field);
  return field.lines
    .map((line) => line.trim())
    .flatMap((line) => (line.startsWith("- ") ? [line.slice(2)] : line ? [line] : []))
    .filter((value) => !NULL_VALUES.has(value.toLowerCase()));
}

function normalizeReferenceValue(value) {
  if (value && typeof value === "object" && value.kind && value.id) return `${value.kind}:${value.id}`;
  return String(value ?? "").trim();
}

function candidateEntityForSource(record, entity) {
  const mapNames = {
    proposal: "proposals",
    slice: "slices",
    decision: "decisions",
    checkpoint: "checkpoints",
    evidence: "evidence",
    blocker: "blockers",
    note: "notes",
  };
  const mapName = mapNames[entity.kind];
  if (!mapName) return null;
  const values = record.entities[mapName];
  if (entity.kind === "blocker" && entity.representation === "embedded-json") return Object.values(values)[0] ?? null;
  if (entity.id && values[entity.id]) return values[entity.id];
  return Object.values(values).find((value) => value.title === entity.title) ?? null;
}

function parseJsonFromText(text) {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start).trim());
  } catch {
    return null;
  }
}

function emptyContextStatement(id, text) {
  return text && text.trim() && !NULL_VALUES.has(text.trim().toLowerCase())
    ? { id, text: text.trim(), basisRefs: [] }
    : null;
}

function nextEntityId(record, kind) {
  return nextId(record, kind);
}

function addEvidence(record, sliceId, text, now, kind = "slice") {
  const evidenceId = nextEntityId(record, "evidence");
  const claim = text?.trim() || `${kind} ${sliceId} was preserved from the source`;
  record.entities.evidence[evidenceId] = {
    id: evidenceId,
    claim,
    requiredBoundary: "Migration source coverage",
    observer: "Read-only migration parser",
    checkResult: "passed",
    claimResult: "supported",
    proves: `The source ${kind} content was represented in the candidate`,
    doesNotProve: "The migrated result is authorized for live use",
    pointer: `output:migration-${evidenceId}`,
    supersedesId: null,
    supersededById: null,
    appliesTo: [{ kind, id: sliceId }],
    observedAt: now,
  };
  return evidenceId;
}

function makeResolution(entity, state, evidenceId, now, sourceData = null) {
  return {
    finalState: state,
    summary:
      rangeField(entity.inventory, entity, "Outcome", sourceData) || `The source ${entity.id} outcome was preserved`,
    evidenceIds: [evidenceId],
    reviewSummary:
      rangeField(entity.inventory, entity, "Review summary", sourceData) ||
      "Source content was carried into the migration candidate",
    taskEffect:
      rangeField(entity.inventory, entity, "Task effect", sourceData) ||
      "The source outcome remains recoverable in the migrated copy",
    blockerId: null,
    authoritySource: rangeField(entity.inventory, entity, "Authority source", sourceData) || null,
    reason: rangeField(entity.inventory, entity, "Abandonment reason", sourceData) || null,
    residualEffects:
      state === "abandoned"
        ? rangeField(entity.inventory, entity, "Task effect", sourceData) || "The source outcome is no longer pursued"
        : null,
    closedAt: now,
  };
}

function parseContext(source, sourceData = null) {
  const sourceContext = sourceData?.currentContext;
  const settled = [
    emptyContextStatement(
      "CTX-001",
      sourceContext?.whatDefinesTask ? `What defines this task:\n${sourceContext.whatDefinesTask}` : null,
    ),
    emptyContextStatement("CTX-002", sourceContext?.settled ?? fieldValue(source, "Settled")),
  ].filter(Boolean);
  const tentative = [
    emptyContextStatement("CTX-003", sourceContext?.tentative ?? fieldValue(source, "Tentative")),
  ].filter(Boolean);
  const open = [emptyContextStatement("CTX-004", sourceContext?.open ?? fieldValue(source, "Open"))].filter(Boolean);
  const boundaryText = sourceContext?.boundaries ?? fieldValue(source, "Boundaries");
  const boundaries = [boundaryText]
    .filter((value) => value && !NULL_VALUES.has(value.toLowerCase()))
    .map((text) => ({ id: "BND-001", text }));
  const goal =
    sourceContext?.goal || fieldValue(source, "Goal") || "Preserve the source record during copy-only migration";
  const direction =
    sourceContext?.currentDirection ||
    fieldValue(source, "Current direction") ||
    "Review the migrated copy before any live action";
  const nextAction =
    sourceData?.currentWork?.nextAction ||
    fieldValue(source, "Next useful action") ||
    fieldValue(source, "Next action") ||
    "Inspect the migrated copy";
  const routeReason =
    sourceData?.currentWork?.route ||
    fieldValue(source, "Current route") ||
    "Preserve source semantics during copy-only conversion";
  const sourceRefs = listValue(source, "Source references").concat(listValue(source, "Source refs"));
  return {
    goal,
    sourceRefs,
    settled,
    tentative,
    open,
    direction,
    boundaries,
    current: {
      owner:
        routeReason === "Preserve source semantics during copy-only conversion"
          ? "Migration Work"
          : "Migrated source route",
      reason: routeReason,
    },
    nextAction,
  };
}

function buildCandidate(source, inventory, now, sourceData = null) {
  const taskId = headerValue(source, "Task ID") || headerValue(source, "ID") || "T-001";
  const recordName = (
    sourceData?.taskName ||
    source.match(/^# Working Record:\s*(.+)$/m)?.[1] ||
    "Migrated Working Record"
  ).trim();
  const state = normalizeState(sourceData?.taskState || headerValue(source, "State"), "active", {
    strict: true,
    field: "Task state",
  });
  const context = parseContext(source, sourceData);
  const record = createRecord(
    {
      name: recordName,
      stateSource:
        headerValue(source, "State source") || (sourceData ? "Schema-v2 migration source" : "Legacy migration source"),
      goal: context.goal,
      sourceRefs: context.sourceRefs,
      settled: context.settled,
      tentative: context.tentative,
      open: context.open,
      direction: context.direction,
      boundaries: context.boundaries,
      route: context.current,
      nextAction: sourceData?.currentWork?.nextAction || context.nextAction,
      state,
    },
    { taskId, timestamp: now },
  );
  const createdAt = normalizeTimestamp(sourceData?.createdAt || headerValue(source, "Created at"), now, "Created at");
  const updatedAt = normalizeTimestamp(
    sourceData?.lastUpdated || headerValue(source, "Last updated") || headerValue(source, "Updated at"),
    now,
    "Last updated",
  );
  record.record.createdAt = createdAt;
  record.record.updatedAt = updatedAt;

  const entities = inventory.entities.filter((entity) => !entity.projectionOnly);
  for (const entity of entities) SOURCE_DATA_BY_ENTITY.set(entity, sourceData);
  const sourceLinks = [];
  const currentSliceEntities = entities.filter(
    (entity) => entity.kind === "slice" && entity.representation === "current",
  );
  const sliceEntities = entities.filter((entity) => entity.kind === "slice" && entity.representation !== "current");
  for (const entity of entities.filter((item) => item.kind === "proposal")) {
    const id = entity.id || nextEntityId(record, "proposal");
    const type = normalizeType(rangeField(inventory, entity, "Type"), SLICE_TYPES, "delivery");
    const dependencies = rangeList(inventory, entity, "Dependencies");
    const selectedCheckpoints = rangeList(inventory, entity, "Selected checkpoints");
    record.entities.proposals[id] = {
      id,
      state: "proposed",
      title: entity.title || id,
      type,
      intendedResult: rangeField(inventory, entity, "Intended result") || entity.title || id,
      expectedEvidence: rangeField(inventory, entity, "Expected evidence") || "Source coverage and readable Markdown",
      dependencies: [],
      selectedCheckpoints: [],
      selectedAsSliceId: null,
      withdrawal: null,
      createdAt,
      updatedAt,
    };
    record.current.proposalOrder.push(id);
    sourceLinks.push({ kind: "proposal", id, dependencies, selectedCheckpoints });
  }

  const sliceMap = new Map();
  let extensionSequence = 1;
  const sourceCurrentSliceId = sourceData?.currentWork?.currentSlice?.id ?? null;
  for (const entity of [...sliceEntities, ...currentSliceEntities]) {
    const id = entity.id || nextEntityId(record, "slice");
    const stateFallback = entity.representation === "current" ? "in_progress" : "completed";
    const sliceState = normalizeState(rangeField(inventory, entity, "State"), stateFallback);
    const type = normalizeType(rangeField(inventory, entity, "Type"), SLICE_TYPES, "delivery");
    const title = entity.title || rangeField(inventory, entity, "Title") || id;
    const intendedResult =
      rangeField(inventory, entity, "Intended result") || rangeField(inventory, entity, "Outcome") || title;
    const activationAuthority =
      rangeField(inventory, entity, "Authority source") || headerValue(source, "State source") || "Migration source";
    const activationReason =
      rangeField(inventory, entity, "Reason and scope") || "Represent the source Slice in the migrated copy";
    const activationEvidence =
      rangeField(inventory, entity, "Expected evidence") || "Source coverage and readable Markdown";
    const activationStop = rangeField(inventory, entity, "Stop condition") || "Stop after copy verification";
    const activationStartingState = rangeField(inventory, entity, "Starting state") || "The source Slice exists";
    const acceptedExtensions = rangeList(inventory, entity, "Accepted extensions");
    const extensions = acceptedExtensions.map((value) => ({
      id: `X-${String(extensionSequence++).padStart(3, "0")}`,
      activationSequence: 1,
      authoritySource: activationAuthority,
      reason: value,
      addedScope: value,
      addedEvidenceBoundary: value,
      stopConditionChange: null,
      startingState: activationStartingState,
      acceptedAt: updatedAt,
    }));
    const dependencies = rangeList(inventory, entity, "Dependencies");
    const selectedCheckpoints = rangeList(inventory, entity, "Selected checkpoints");
    const slice = {
      id,
      originProposalId: null,
      state: sliceState,
      type,
      title,
      intendedResult,
      dependencies: [],
      selectedCheckpoints: [],
      extensions,
      activations: [
        {
          sequence: 1,
          authoritySource: activationAuthority,
          reasonAndScope: activationReason,
          expectedEvidence: activationEvidence,
          stopCondition: activationStop,
          startingState: activationStartingState,
          openedAt: createdAt,
          resolution: null,
        },
      ],
      createdAt,
      updatedAt,
    };
    if (!ACTIVE_SLICE_STATES.has(sliceState)) {
      const evidenceId = addEvidence(
        record,
        id,
        rangeField(inventory, entity, "Evidence") || rangeField(inventory, entity, "Outcome"),
        updatedAt,
      );
      slice.activations[0].resolution = makeResolution(
        { ...entity, inventory },
        sliceState,
        evidenceId,
        updatedAt,
        sourceData,
      );
    }
    record.entities.slices[id] = slice;
    sourceLinks.push({ kind: "slice", id, dependencies, selectedCheckpoints });
    sliceMap.set(id, slice);
    if (
      entity.representation === "current" ||
      id === sourceCurrentSliceId ||
      (ACTIVE_SLICE_STATES.has(sliceState) && !record.current.currentSliceId)
    )
      record.current.currentSliceId = id;
  }

  for (const entity of entities.filter((item) => item.kind === "decision")) {
    const id = entity.id || nextEntityId(record, "decision");
    const decision = normalizeState(rangeField(inventory, entity, "State"), "active");
    const decisionState = DECISION_STATES.has(decision) ? decision : "active";
    record.entities.decisions[id] = {
      id,
      state: decisionState,
      title: entity.title || id,
      decision: rangeField(inventory, entity, "Decision") || "The source Decision is preserved",
      establishedBy:
        rangeField(inventory, entity, "Established by") || headerValue(source, "State source") || "Migration source",
      rationale:
        rangeField(inventory, entity, "Rationale") || "The source rationale is preserved through the migrated copy",
      sourceRefs: rangeList(inventory, entity, "Source refs"),
      consequences:
        rangeField(inventory, entity, "Consequences") || "Review the migrated copy before relying on this Decision",
      revisitWhen: rangeField(inventory, entity, "Revisit when") || "A source conflict appears",
      supersedesId: idFrom(rangeField(inventory, entity, "Supersedes"), "D"),
      supersededById: idFrom(rangeField(inventory, entity, "Superseded by"), "D"),
      ...(decisionState === "retired"
        ? {
            retirement: {
              authoritySource: headerValue(source, "State source") || "Migration source",
              reason: "The source marked this Decision Retired; no retirement metadata was present.",
              retiredAt: updatedAt,
            },
          }
        : {}),
      createdAt,
      updatedAt,
    };
  }

  for (const entity of entities.filter((item) => item.kind === "checkpoint")) {
    const id = entity.id || nextEntityId(record, "checkpoint");
    const checkpointState = normalizeState(
      rangeField(inventory, entity, "State") || rangeField(inventory, entity, "Result"),
      "upcoming",
    );
    const targetSlice = idFrom(rangeField(inventory, entity, "Applies to"), "S");
    const target =
      targetSlice && sliceMap.has(targetSlice)
        ? { kind: "slice", id: targetSlice }
        : { kind: "task", id: record.record.id };
    const checkpoint = {
      id,
      state: CHECKPOINT_STATES.has(checkpointState) ? checkpointState : "upcoming",
      title: entity.title || id,
      type: normalizeType(rangeField(inventory, entity, "Type"), CHECKPOINT_TYPES, "continuity"),
      selectedBy: rangeField(inventory, entity, "Selected by") || "Migration source",
      condition: rangeField(inventory, entity, "Condition") || "Review the migrated copy",
      appliesTo: target,
      resolution: null,
      replacesId: idFrom(rangeField(inventory, entity, "Replaces"), "C"),
      replacedById: idFrom(rangeField(inventory, entity, "Replaced by"), "C"),
      createdAt,
      updatedAt,
    };
    if (checkpoint.state !== "upcoming") {
      const checkpointEvidence = rangeField(inventory, entity, "Evidence");
      const evidenceId = checkpointEvidence
        ? addEvidence(record, id, checkpointEvidence, updatedAt, "checkpoint")
        : target.kind === "slice"
          ? Object.keys(record.entities.evidence).find((evidence) =>
              record.entities.evidence[evidence].appliesTo.some((item) => item.id === target.id),
            )
          : Object.keys(record.entities.evidence)[0];
      checkpoint.resolution = {
        judgment: rangeField(inventory, entity, "Judgment") || rangeField(inventory, entity, "Result") || "Preserved",
        decision:
          rangeField(inventory, entity, "Decision") ||
          rangeField(inventory, entity, "Result") ||
          "Continue after copy review",
        evidenceIds: evidenceId ? [evidenceId] : [],
        taskEffect:
          rangeField(inventory, entity, "Task effect") ||
          rangeField(inventory, entity, "Effect") ||
          "The Checkpoint outcome remains recoverable",
        reason: rangeField(inventory, entity, "Reason") || "Source Checkpoint was terminal",
        resolvedAt: updatedAt,
      };
      if (!checkpoint.resolution.evidenceIds.length) {
        const fallbackSlice = [...sliceMap.keys()][0] || record.record.id;
        const evidence = addEvidence(
          record,
          fallbackSlice,
          "The source Checkpoint outcome was preserved",
          updatedAt,
          target.kind === "slice" ? "slice" : "task",
        );
        checkpoint.resolution.evidenceIds = [evidence];
      }
    } else if (target.kind === "slice" && !record.entities.slices[target.id].selectedCheckpoints.includes(id)) {
      record.entities.slices[target.id].selectedCheckpoints.push(id);
    }
    record.entities.checkpoints[id] = checkpoint;
    if (checkpoint.state === "upcoming") record.current.upcomingCheckpointIds.push(id);
  }

  for (const titleValue of sourceData?.currentWork?.upcomingCheckpoints ?? []) {
    const title = String(titleValue).trim();
    if (!title) continue;
    const existing = Object.values(record.entities.checkpoints).find(
      (checkpoint) => (checkpoint.title === title || checkpoint.id === title) && checkpoint.state === "upcoming",
    );
    if (existing) {
      record.current.upcomingCheckpointIds.push(existing.id);
      continue;
    }
    const id = nextEntityId(record, "checkpoint");
    const target = record.current.currentSliceId
      ? { kind: "slice", id: record.current.currentSliceId }
      : { kind: "task", id: record.record.id };
    record.entities.checkpoints[id] = {
      id,
      state: "upcoming",
      title,
      type: "continuity",
      selectedBy: "Schema-v2 migration source",
      condition: "The source recorded this checkpoint as upcoming",
      appliesTo: target,
      resolution: null,
      replacesId: null,
      replacedById: null,
      createdAt,
      updatedAt,
    };
    record.current.upcomingCheckpointIds.push(id);
  }

  for (const entity of entities.filter((item) => item.kind === "blocker" && item.representation === "embedded-json")) {
    const raw = parseJsonFromText(fieldFromRange(inventory, entity, entity.title));
    const source = raw && typeof raw === "object" ? raw : {};
    const details = source.blocker && typeof source.blocker === "object" ? source.blocker : source;
    const id = typeof source.id === "string" ? source.id : nextEntityId(record, "blocker");
    const targetId = record.current.currentSliceId || record.record.id;
    const targetKind = record.current.currentSliceId ? "slice" : "task";
    record.entities.blockers[id] = {
      id,
      state: BLOCKER_STATES.has(normalizeState(source.state ?? details.state, "active"))
        ? normalizeState(source.state ?? details.state, "active")
        : "active",
      appliesTo: { kind: targetKind, id: targetId },
      whyUnsafe: details.why || details.blocker || "The source recorded an unresolved Blocker",
      requiredResolution:
        details.required || details.requiredResolution || source.required || "Review the migrated copy",
      resumeWhen: source.resumeWhen || details.resumeWhen || "The required resolution is recorded",
      resolutionSource: null,
      createdAt,
      resolvedAt: null,
    };
    if (record.current.currentSliceId && record.entities.slices[record.current.currentSliceId].state === "in_progress")
      record.entities.slices[record.current.currentSliceId].state = "blocked";
  }

  for (const entity of entities.filter((item) => item.kind === "note")) {
    const id = entity.id || nextEntityId(record, "note");
    record.entities.notes[id] = {
      id,
      title: entity.title || id,
      source: rangeField(inventory, entity, "Source") || "Migration source",
      body: rangeField(inventory, entity, "Body") || fieldFromRange(inventory, entity),
      createdAt,
      updatedAt,
    };
  }
  const noteUnitIds = new Set(entities.filter((item) => item.kind === "note").flatMap((item) => item.sourceUnitIds));
  const notePreamble = inventory.sourceUnits
    .filter(
      (unit) =>
        inventory.owners.find((owner) => owner.unitId === unit.unitId)?.owner === "Notes" &&
        !noteUnitIds.has(unit.unitId) &&
        unit.content.trim(),
    )
    .map((unit) => unit.content)
    .join("\n")
    .trim();
  if (notePreamble) {
    const id = nextEntityId(record, "note");
    record.entities.notes[id] = {
      id,
      title: "Migrated Notes preamble",
      source: "Migration source",
      body: notePreamble,
      createdAt,
      updatedAt,
    };
  }
  const resolveReference = (value, kind) => {
    const raw = String(value ?? "").trim();
    const maps = ["proposals", "slices", "decisions", "checkpoints", "evidence", "blockers", "notes"];
    if (maps.some((mapName) => record.entities[mapName][raw])) return raw;
    if (kind === "checkpoint")
      return Object.values(record.entities.checkpoints).find((checkpoint) => checkpoint.title === raw)?.id ?? null;
    return null;
  };
  for (const link of sourceLinks) {
    const target = record.entities[`${link.kind}s`]?.[link.id];
    if (!target) continue;
    target.dependencies = link.dependencies.map((value) => resolveReference(value, "dependency")).filter(Boolean);
    target.selectedCheckpoints = link.selectedCheckpoints
      .map((value) => resolveReference(value, "checkpoint"))
      .filter(Boolean);
  }
  record.current.proposalOrder = [...new Set(record.current.proposalOrder)];
  record.current.upcomingCheckpointIds = [...new Set(record.current.upcomingCheckpointIds)];
  if (record.current.currentSliceId) {
    const current = record.entities.slices[record.current.currentSliceId];
    const blockers = Object.values(record.entities.blockers).filter(
      (blocker) =>
        blocker.appliesTo.kind === "slice" && blocker.appliesTo.id === current.id && blocker.state === "active",
    );
    if (current.state === "blocked" && !blockers.length) {
      current.state = "in_progress";
    }
  }
  assertValidRecord(record);
  return record;
}

const HEADER_TARGETS = [
  [/^# Working Record:/, "record.name"],
  [/^Task ID:/, "record.id"],
  [/^Schema:/, "schemaVersion"],
  [/^State:/, "record.state"],
  [/^State source:/, "record.stateSource"],
  [/^(?:Created at|Created):/, "record.createdAt"],
  [/^(?:Last updated|Updated at):/, "record.updatedAt"],
];

const CONTEXT_TARGETS = new Map([
  ["Goal", "context.goal"],
  ["What defines this task", "context.settled"],
  ["Settled", "context.settled"],
  ["Tentative", "context.tentative"],
  ["Open", "context.open"],
  ["Current direction", "context.direction"],
  ["Boundaries", "context.boundaries"],
]);

const CURRENT_WORK_TARGETS = new Map([
  ["Current route", "current.route"],
  ["Current Slice", "current.currentSliceId"],
  ["Blockers", "entities.blockers"],
  ["Upcoming checkpoints", "current.upcomingCheckpointIds"],
  ["Next useful action", "current.nextAction"],
]);

function entityTargetPath(entity, record) {
  const mapNames = {
    proposal: "proposals",
    slice: "slices",
    decision: "decisions",
    checkpoint: "checkpoints",
    evidence: "evidence",
    blocker: "blockers",
    note: "notes",
  };
  const mapName = mapNames[entity.kind];
  if (!mapName) return null;
  const values = record.entities[mapName];
  if (entity.kind === "blocker" && entity.representation === "embedded-json") {
    const blocker = Object.values(values)[0];
    if (blocker) return `entities.${mapName}.${blocker.id}`;
  }
  if (entity.id && values[entity.id]) return `entities.${mapName}.${entity.id}`;
  const match = Object.values(values).find((value) => value.title === entity.title);
  return match ? `entities.${mapName}.${match.id}` : null;
}

function sectionTargetPath(owner, group) {
  if (owner === "Current Context") return CONTEXT_TARGETS.get(group) ?? "context";
  if (owner === "Current Work") return CURRENT_WORK_TARGETS.get(group) ?? "current";
  if (owner === "Proposed Slices") return "entities.proposals";
  if (owner === "History" && group) return `entities.${group.toLowerCase()}`;
  if (owner === "Notes") return "entities.notes";
  return null;
}

function sourceGroupText(units) {
  return units
    .filter((unit) => !/^#{1,6}\s+/.test(unit.content))
    .map((unit) => unit.content)
    .join("\n")
    .trim();
}

function candidateSectionValues(record, owner, group) {
  if (owner === "Current Context") {
    if (group === "Goal") return [record.context.goal];
    if (group === "What defines this task") return record.context.settled.map((item) => item.text);
    if (group === "Settled") return record.context.settled.map((item) => item.text);
    if (group === "Tentative") return record.context.tentative.map((item) => item.text);
    if (group === "Open") return record.context.open.map((item) => item.text);
    if (group === "Current direction") return [record.context.direction];
    if (group === "Boundaries") return record.context.boundaries.map((item) => item.text);
  }
  if (owner === "Current Work") {
    if (group === "Current route") return [record.current.route.reason];
    if (group === "Current Slice") return [record.current.currentSliceId ?? "None"];
    if (group === "Upcoming checkpoints")
      return record.current.upcomingCheckpointIds.flatMap((id) => [id, record.entities.checkpoints[id]?.title ?? id]);
    if (group === "Next useful action") return [record.current.nextAction];
  }
  if (owner === "Notes" && group === null)
    return Object.values(record.entities.notes)
      .filter((item) => item.title === "Migrated Notes preamble")
      .map((item) => item.body);
  return [];
}

function sourceGroupPreserved(record, owner, group, units) {
  const sourceText = sourceGroupText(units);
  if (!sourceText || sourceText.toLowerCase() === "none")
    return (
      sourceText.toLowerCase() === "none" &&
      (candidateSectionValues(record, owner, group).length === 0 ||
        candidateSectionValues(record, owner, group).some((value) => value === "None" || value === null))
    );
  const candidates = candidateSectionValues(record, owner, group).map((value) => String(value ?? ""));
  if (group === "Upcoming checkpoints") {
    const sourceValues = units.map((unit) => unit.content.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim()).filter(Boolean);
    return (
      sourceValues.length > 0 &&
      sourceValues.every((value) =>
        candidates.some((candidate) => candidate === value || candidate.endsWith(`:${value}`)),
      )
    );
  }
  return candidates.some((candidate) => candidate === sourceText || candidate.includes(sourceText));
}

function sourceFieldSupported(entity, field) {
  const canonical = canonicalSourceFieldLabel(field.label);
  if (UNSUPPORTED_SOURCE_FIELDS.has(canonical) && !(canonical === "Result" && entity.kind === "checkpoint"))
    return false;
  if (canonical === "Result" && entity.kind === "slice") return false;
  return true;
}

const SOURCE_COMPATIBLE_LEAVES = new Map([
  ["Goal", ["goal"]],
  ["Source references", ["sourceRefs"]],
  ["Current direction", ["direction"]],
  ["Current route", ["reason"]],
  ["Current Slice ID", ["currentSliceId"]],
  ["Proposal order", ["proposalOrder"]],
  ["Upcoming checkpoints", ["upcomingCheckpointIds"]],
  ["Next useful action", ["nextAction"]],
  ["Next action", ["nextAction"]],
  ["ID", ["id"]],
  ["Title", ["title"]],
  ["State", ["state"]],
  ["Type", ["type"]],
  ["Intended result", ["intendedResult"]],
  ["Expected evidence", ["expectedEvidence"]],
  ["Stop condition", ["stopCondition"]],
  ["Authority source", ["authoritySource"]],
  ["Reason and scope", ["reasonAndScope", "reason"]],
  ["Starting state", ["startingState"]],
  ["Accepted extensions", ["extensions", "reason"]],
  ["Dependencies", ["dependencies"]],
  ["Selected checkpoints", ["selectedCheckpoints"]],
  ["Outcome", ["summary"]],
  ["Evidence", ["claim"]],
  ["Review summary", ["reviewSummary"]],
  ["Task effect", ["taskEffect"]],
  ["Abandonment reason", ["reason", "residualEffects"]],
  ["Blocker", ["whyUnsafe", "requiredResolution", "resumeWhen"]],
  ["Decision", ["decision"]],
  ["Established by", ["establishedBy"]],
  ["Rationale", ["rationale"]],
  ["Source refs", ["sourceRefs"]],
  ["Consequences", ["consequences"]],
  ["Revisit when", ["revisitWhen"]],
  ["Supersedes", ["supersedesId"]],
  ["Superseded by", ["supersededById"]],
  ["Selected by", ["selectedBy"]],
  ["Condition", ["condition"]],
  ["Result", ["state", "decision"]],
  ["Judgment", ["judgment"]],
  ["Effect", ["taskEffect"]],
  ["Reason", ["reason"]],
  ["Applies to", ["appliesTo"]],
  ["Replaces", ["replacesId"]],
  ["Replaced by", ["replacedById"]],
  ["Source", ["source"]],
  ["Body", ["body"]],
  ["Claim", ["claim"]],
  ["Required boundary", ["requiredBoundary"]],
  ["Observer", ["observer"]],
  ["Check result", ["checkResult"]],
  ["Claim result", ["claimResult"]],
  ["Proves", ["proves"]],
  ["Does not prove", ["doesNotProve"]],
  ["Pointer", ["pointer"]],
  ["Observed at", ["observedAt"]],
  ["Created at", ["createdAt"]],
  ["Updated at", ["updatedAt"]],
]);

function pathLeaf(path) {
  return path
    .replace(/\[\d+\]/g, "")
    .split(".")
    .at(-1);
}

function addCandidateTree(index, path, value) {
  index.push({ path, value });
  if (Array.isArray(value))
    value.forEach((item, indexValue) => addCandidateTree(index, `${path}[${indexValue}]`, item));
  else if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) addCandidateTree(index, `${path}.${key}`, child);
}

function candidateValueIndex(record, entity = null) {
  const index = [];
  if (!entity) {
    addCandidateTree(index, "record", record.record);
    addCandidateTree(index, "context", record.context);
    addCandidateTree(index, "current", record.current);
    return index;
  }
  const base = entityTargetPath(entity, record);
  const candidate = candidateEntityForSource(record, entity);
  if (base && candidate) addCandidateTree(index, base, candidate);
  if (!candidate || !base) return index;
  for (const mapName of ["evidence", "blockers"]) {
    for (const item of Object.values(record.entities[mapName])) {
      const targets = Array.isArray(item.appliesTo) ? item.appliesTo : item.appliesTo ? [item.appliesTo] : [];
      if (targets.some((target) => target.kind === entity.kind && target.id === candidate.id))
        addCandidateTree(index, `entities.${mapName}.${item.id}`, item);
    }
  }
  return index;
}

function compatibleCandidates(index, label, { noteBody = false } = {}) {
  const canonical = canonicalSourceFieldLabel(label);
  const leaves = new Set(SOURCE_COMPATIBLE_LEAVES.get(canonical) ?? []);
  return index.filter((item) => (noteBody ? pathLeaf(item.path) === "body" : leaves.has(pathLeaf(item.path))));
}

function candidateMatchesField(field, target, canonical, { noteBody = false } = {}) {
  const source = sourceFieldValues(field);
  if (noteBody) return String(target.value ?? "").includes(sourceFieldText(field).trim());
  if (canonical === "State") return normalizeState(source, "") === normalizeState(target.value, "");
  if (canonical === "Type")
    return (
      normalizeType(source, SLICE_TYPES, "") === normalizeType(target.value, SLICE_TYPES, "") ||
      normalizeType(source, CHECKPOINT_TYPES, "") === normalizeType(target.value, CHECKPOINT_TYPES, "")
    );
  if (canonical === "Result")
    return (
      normalizeState(source, "") === normalizeState(target.value, "") ||
      String(source).trim() === String(target.value ?? "").trim()
    );
  if (canonical === "Applies to") {
    const sourceText = String(source ?? "").trim();
    return normalizeReferenceValue(target.value).endsWith(`:${sourceText}`) || target.value?.id === sourceText;
  }
  if (SOURCE_LIST_FIELDS.has(canonical)) {
    const sourceValues = Array.isArray(source)
      ? source.map(normalizeReferenceValue)
      : source
        ? [normalizeReferenceValue(source)]
        : [];
    if (canonical === "Evidence" || canonical === "Accepted extensions")
      return sourceValues.length === 0
        ? Array.isArray(target.value) && target.value.length === 0
        : sourceValues.some((value) => String(target.value ?? "").includes(value));
    if (!Array.isArray(target.value)) return false;
    const targetValues = itemValues(target.value);
    return (
      sourceValues.length === targetValues.length && sourceValues.every((value, index) => value === targetValues[index])
    );
  }
  const sourceText = Array.isArray(source) ? source.join("\n") : String(source ?? "");
  return sourceText.trim() === String(target.value ?? "").trim();
}

function matchingCandidateDescriptors(field, candidates, { noteBody = false } = {}) {
  const canonical = canonicalSourceFieldLabel(field.label);
  const compatible = compatibleCandidates(candidates, canonical, { noteBody });
  if (!compatible.length) return [];
  if (canonical === "Blocker") {
    const parsed = parseJsonFromText(sourceFieldText(field));
    if (!parsed || typeof parsed !== "object") return [];
    const details = parsed.blocker && typeof parsed.blocker === "object" ? parsed.blocker : parsed;
    const why = String(details.why ?? details.blocker ?? "");
    const required = String(details.required ?? details.requiredResolution ?? parsed.required ?? "");
    return compatible.filter(
      (item) =>
        (pathLeaf(item.path) === "whyUnsafe" && item.value === why) ||
        (pathLeaf(item.path) === "requiredResolution" && item.value === required),
    );
  }
  if (SOURCE_LIST_FIELDS.has(canonical)) {
    const arrayTarget = compatible.find((item) => Array.isArray(item.value) && canonical !== "Accepted extensions");
    if (arrayTarget) return candidateMatchesField(field, arrayTarget, canonical) ? [arrayTarget] : [];
    return compatible.filter((item) => candidateMatchesField(field, item, canonical));
  }
  return compatible.filter((item) => candidateMatchesField(field, item, canonical, { noteBody }));
}

function itemValues(value) {
  return Array.isArray(value) ? value.map(normalizeReferenceValue) : [normalizeReferenceValue(value)];
}

function topLevelFieldDescriptors(record, owner, field) {
  const scope = owner === "Current Context" ? "context." : "current.";
  return compatibleCandidates(
    candidateValueIndex(record).filter((item) => item.path.startsWith(scope)),
    field.label,
  );
}

function buildSourceMapping(inventory, record) {
  const pathsByUnit = new Map();
  const normalizedUnitIds = new Set();
  const mark = (unitId, targetPath, disposition = "represented") => {
    if (!targetPath) return;
    const paths = pathsByUnit.get(unitId) ?? new Set();
    paths.add(targetPath);
    pathsByUnit.set(unitId, paths);
    if (disposition === "normalized") normalizedUnitIds.add(unitId);
  };
  const unitsById = new Map(inventory.sourceUnits.map((unit) => [unit.unitId, unit]));
  const ownerByUnit = new Map(inventory.owners.map((owner) => [owner.unitId, owner]));
  const entityUnitIds = new Set(inventory.entities.flatMap((entity) => entity.sourceUnitIds));
  const firstSectionIndex = inventory.sections[0]?.startLine
    ? inventory.sections[0].startLine - 1
    : inventory.sourceUnits.length;

  for (const [index, unit] of inventory.sourceUnits.entries()) {
    const headerTarget =
      index < firstSectionIndex ? HEADER_TARGETS.find(([pattern]) => pattern.test(unit.content))?.[1] : null;
    if (headerTarget) mark(unit.unitId, headerTarget);
    else if (!unit.content.trim() && !ownerByUnit.get(unit.unitId)?.owner) mark(unit.unitId, "record.layout");
  }

  for (const entity of inventory.entities.filter((item) => item.projectionOnly)) {
    const targetPath = entityTargetPath(entity, record);
    if (!targetPath) continue;
    for (const unitId of entity.sourceUnitIds) mark(unitId, targetPath, "normalized");
  }

  for (const entity of inventory.entities.filter((item) => !item.projectionOnly)) {
    const targetPath = entityTargetPath(entity, record);
    if (!targetPath) continue;
    const headingUnit = unitsById.get(entity.sourceUnitIds[0]);
    if (headingUnit) mark(headingUnit.unitId, targetPath);
    const spans = sourceFieldSpans(inventory, entity);
    const candidates = candidateValueIndex(record, entity);
    for (const field of spans.fields) {
      if (!sourceFieldSupported(entity, field)) continue;
      const targets = matchingCandidateDescriptors(field, candidates);
      if (!targets.length) continue;
      for (const target of targets) for (const unitId of field.unitIds) mark(unitId, target.path);
    }
  }

  const groups = new Map();
  for (const owner of inventory.owners) {
    if (entityUnitIds.has(owner.unitId)) continue;
    const key = `${owner.owner ?? ""}\u0000${owner.group ?? ""}`;
    const group = groups.get(key) ?? { owner: owner.owner, group: owner.group, owners: [] };
    group.owners.push(owner);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (!group.owner) continue;
    const groupUnits = group.owners.map((owner) => unitsById.get(owner.unitId)).filter(Boolean);
    const targetPath = sectionTargetPath(group.owner, group.group);
    if (!targetPath) {
      if (group.owners.some((owner) => owner.recognized))
        for (const owner of group.owners) mark(owner.unitId, "record.layout");
      continue;
    }
    for (const owner of group.owners) if (owner.recognized) mark(owner.unitId, "record.layout");
    if (group.group === null && (group.owner === "Current Context" || group.owner === "Current Work")) {
      const spans = sourceFieldSpans(inventory, { sourceUnitIds: group.owners.map((owner) => owner.unitId) });
      for (const field of spans.fields) {
        const targets = matchingCandidateDescriptors(field, topLevelFieldDescriptors(record, group.owner, field));
        if (!targets.length) continue;
        for (const target of targets) for (const unitId of field.unitIds) mark(unitId, target.path);
      }
      for (const owner of group.owners) if (owner.recognized) mark(owner.unitId, "record.layout");
      continue;
    }
    const bodyUnits = groupUnits.filter((unit) => unit.content.trim() && !/^#{1,6}\s+/.test(unit.content));
    const emptySentinel = bodyUnits.length === 1 && bodyUnits[0].content.trim() === "None";
    if (
      emptySentinel &&
      (group.owner === "Proposed Slices" || group.owner === "Current Work" || group.owner === "History")
    ) {
      mark(bodyUnits[0].unitId, targetPath, "normalized");
      continue;
    }
    if (!bodyUnits.length) {
      for (const owner of group.owners) if (owner.recognized) mark(owner.unitId, "record.layout");
      continue;
    }
    if (sourceGroupPreserved(record, group.owner, group.group, groupUnits)) {
      for (const unit of groupUnits) {
        if (unit.content.trim() === "None") mark(unit.unitId, targetPath, "normalized");
        else if (unit.content.trim() || ownerByUnit.get(unit.unitId)?.structural) mark(unit.unitId, targetPath);
      }
    }
  }

  for (const issue of inventory.issues) {
    const deferred =
      issue.code === "malformed-lifecycle" ||
      issue.code === "unowned-content" ||
      (issue.code === "embedded-json" &&
        (issue.field === "reopen history" || issue.field === "lifecycle continuation"));
    if (deferred) {
      pathsByUnit.delete(issue.unitId);
      normalizedUnitIds.delete(issue.unitId);
    }
  }
  return { pathsByUnit, normalizedUnitIds };
}

function buildCoverage(inventory, sourceSha, mapping) {
  const pathsByUnit = mapping.pathsByUnit ?? mapping;
  const normalizedUnitIds = mapping.normalizedUnitIds ?? new Set();
  return inventory.sourceUnits.map((unit) => {
    const targetPaths = pathsByUnit.get(unit.unitId);
    const represented = targetPaths && targetPaths.size > 0;
    const disposition = represented
      ? normalizedUnitIds.has(unit.unitId)
        ? "normalized"
        : "represented"
      : unit.kind === "blank"
        ? "verbatim"
        : "deferred";
    return {
      unitId: unit.unitId,
      startByte: unit.startByte,
      endByte: unit.endByte,
      sourceSha256: unit.sourceSha256,
      kind: unit.kind,
      disposition,
      targetPaths: represented
        ? [...targetPaths]
        : disposition === "verbatim"
          ? ["record.layout"]
          : [`.migration/source-${sourceSha}.md`],
    };
  });
}

export function sourceFieldInventory(inventory) {
  return inventory.entities
    .filter((entity) => !entity.projectionOnly)
    .map((entity) => {
      const spans = sourceFieldSpans(inventory, entity);
      return {
        kind: entity.kind,
        id: entity.id,
        title: entity.title,
        fields: spans.fields.map((field) => field.label),
        fieldSpans: spans.fields.map((field) => ({
          label: field.label,
          unitIds: field.unitIds,
          value: sourceFieldText(field),
        })),
        orphanUnitIds: spans.orphanUnitIds,
      };
    });
}

export function validateCoverage(inventory, coverage) {
  if (!Array.isArray(coverage)) fail("coverage-invalid", "Migration coverage must be an array");
  const expected = new Map(inventory.sourceUnits.map((unit) => [unit.unitId, unit]));
  const seen = new Set();
  for (const item of coverage) {
    if (!item || typeof item !== "object") fail("coverage-invalid", "Coverage entries must be objects");
    if (seen.has(item.unitId))
      fail("coverage-duplicate", `Coverage repeats ${item.unitId}; each source unit must appear once`);
    seen.add(item.unitId);
    const source = expected.get(item.unitId);
    if (!source) fail("coverage-extra", `Coverage contains unknown ${item.unitId}`);
    if (
      item.startByte !== source.startByte ||
      item.endByte !== source.endByte ||
      item.sourceSha256 !== source.sourceSha256 ||
      item.kind !== source.kind
    )
      fail("coverage-mismatch", `Coverage does not match source unit ${item.unitId}`);
    if (!DISPOSITIONS.has(item.disposition) || !Array.isArray(item.targetPaths) || item.targetPaths.length === 0)
      fail("coverage-invalid", `Coverage disposition or target paths are invalid for ${item.unitId}`);
  }
  if (seen.size !== expected.size)
    fail("coverage-incomplete", "Migration coverage must account for every source unit", {
      expected: expected.size,
      actual: seen.size,
    });
  return coverage;
}

function hasCandidatePath(record, targetPath) {
  if (targetPath === "record.layout") return true;
  if (targetPath === "record" || targetPath === "context" || targetPath === "current")
    return Object.hasOwn(record, targetPath);
  const collection = /^entities\.([^.]+)$/.exec(targetPath);
  if (collection) return Object.hasOwn(record.entities ?? {}, collection[1]);
  let current;
  let suffix;
  const entityPath = /^entities\.([^.]+)\.([A-Z]+-\d{3,})(.*)$/.exec(targetPath);
  if (entityPath) {
    const [, mapName, id, remainder] = entityPath;
    current = record.entities?.[mapName]?.[id];
    if (!current) return false;
    suffix = remainder;
  } else {
    const rootPath = /^(record|context|current)(.*)$/.exec(targetPath);
    if (!rootPath) return Object.hasOwn(record, targetPath);
    current = record[rootPath[1]];
    suffix = rootPath[2];
  }
  for (const match of suffix.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g)) {
    if (match[1]) {
      if (current === null || typeof current !== "object" || !Object.hasOwn(current, match[1])) return false;
      current = current[match[1]];
    } else {
      if (!Array.isArray(current) || Number(match[2]) >= current.length) return false;
      current = current[Number(match[2])];
    }
  }
  return true;
}

export function validateCandidateCoverage(inventory, coverage, record) {
  validateCoverage(inventory, coverage);
  if (!record || typeof record !== "object")
    fail("coverage-invalid", "Candidate record is required for target validation");
  const targetPaths = new Set(coverage.flatMap((item) => (item.disposition === "deferred" ? [] : item.targetPaths)));
  for (const targetPath of targetPaths) {
    if (!hasCandidatePath(record, targetPath))
      fail("coverage-target-missing", `Coverage points to missing candidate target ${targetPath}`);
  }
  const sourceUnitPaths = new Map();
  for (const item of coverage) {
    if (item.disposition === "deferred") continue;
    sourceUnitPaths.set(item.unitId, new Set(item.targetPaths));
  }
  const targetMapByKind = {
    proposal: "proposals",
    slice: "slices",
    decision: "decisions",
    checkpoint: "checkpoints",
    evidence: "evidence",
    blocker: "blockers",
    note: "notes",
  };
  for (const entity of inventory.entities.filter((item) => !item.projectionOnly)) {
    const mapName = targetMapByKind[entity.kind];
    if (!mapName) continue;
    const expectedPrefix = `entities.${mapName}.`;
    const represented = entity.sourceUnitIds.some((unitId) =>
      [...(sourceUnitPaths.get(unitId) ?? [])].some((path) => path.startsWith(expectedPrefix)),
    );
    const deferred = entity.sourceUnitIds.every((unitId) => !sourceUnitPaths.has(unitId));
    if (!represented && !deferred)
      fail(
        "coverage-entity-missing",
        `Source ${entity.kind} ${entity.id ?? entity.title} has no candidate entity target`,
      );
  }
  return coverage;
}

function renderManifest(result) {
  const rows = result.coverage
    .map(
      (item) =>
        `#### ${item.unitId}\n- Bytes: ${item.startByte}-${item.endByte}\n- Source SHA-256: ${item.sourceSha256}\n- Kind: ${item.kind}\n- Disposition: ${item.disposition}\n- Target paths: ${item.targetPaths.join(", ")}`,
    )
    .join("\n");
  return [
    "# Migration manifest",
    "",
    "This manifest is non-semantic migration evidence; record.md remains the canonical candidate state.",
    "",
    `Source path: ${result.sourcePath}`,
    `Source SHA-256: ${result.sourceSha256}`,
    `Candidate SHA-256: ${result.candidateSha256}`,
    `Candidate status: ${result.status}`,
    `Deferred content units: ${result.deferredContentUnits?.length ?? 0}`,
    `Authority source: ${result.authoritySource}`,
    `Source units: ${result.coverage.length}`,
    "",
    "## Coverage",
    rows,
    "",
  ].join("\n");
}

export function migrateText(source, options = {}) {
  const authoritySource = nonEmpty(options.authoritySource, "authoritySource");
  if (typeof source !== "string") fail("source-invalid", "Migration source must be text");
  const sourceSha256 = sha256(source);
  if (typeof options.expectedSha !== "string" || options.expectedSha !== sourceSha256)
    fail("stale-sha", "Migration source SHA does not match expectedSha", {
      expectedSha: options.expectedSha,
      actualSha: sourceSha256,
    });
  const now = normalizeTimestamp(options.now, new Date().toISOString());
  const inventory = inventoryText(source, { sourcePath: options.sourcePath ?? null });
  if (inventory.schema.kind === "unsupported")
    fail("unsupported-source", "Unsupported generated schema cannot be migrated by the legacy adapter", {
      version: inventory.schema.version,
    });
  let sourceData = null;
  if (inventory.schema.kind === "schema-v2") {
    try {
      sourceData = parseSchemaV2Record(source).data;
    } catch (error) {
      fail("migration-blocked", "Migration stopped because the schema-v2 compatibility reader rejected the source", {
        sourceSha256,
        causeCode: error.code ?? "schema-v2-parse-failure",
      });
    }
  }
  let record;
  let candidateText;
  try {
    record = buildCandidate(source, inventory, now, sourceData);
    candidateText = renderRecord(record);
  } catch (error) {
    fail("migration-blocked", "Migration stopped because the source cannot be mapped to a valid schema-v3 record", {
      sourceSha256,
      issueCodes: [...new Set(inventory.issues.map((issue) => issue.code))],
      causeCode: error.code ?? "candidate-invalid",
    });
  }
  const candidateSha256 = sha256(candidateText);
  const mapping = buildSourceMapping(inventory, record);
  const coverage = buildCoverage(inventory, sourceSha256, mapping);
  validateCandidateCoverage(inventory, coverage, record);
  const deferredContent = coverage.filter((unit) => unit.kind === "content" && unit.disposition === "deferred");
  const result = {
    status: deferredContent.length ? "partial" : "dry-run",
    sourcePath: options.sourcePath ?? null,
    authoritySource,
    sourceSha256,
    candidateSha256,
    record,
    candidateText,
    sourceSnapshot: source,
    inventory,
    coverage,
    deferredContentUnits: deferredContent.map((unit) => unit.unitId),
  };
  result.manifestText = renderManifest(result);
  return result;
}

async function assertSafeMigrationSourcePath(root, sourcePath) {
  const resolvedPath = resolve(sourcePath);
  if (!pathInside(root, resolvedPath))
    fail("unsafe-path", "Migration source must remain inside the repository root", { path: resolvedPath });
  await assertNoSymlinkPath(resolvedPath, root);
  return resolvedPath;
}

async function writeSynced(path, text) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function syncDirectory(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!new Set(["EBADF", "EINVAL", "ENOTSUP", "EOPNOTSUPP"]).has(error?.code)) throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function publishText(path, text) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeSynced(temporaryPath, text);
    await rename(temporaryPath, path);
    await syncDirectory(dirname(path));
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function migrateCopy(root, sourcePath, destinationPath, options = {}) {
  const safeSourcePath = await assertSafeMigrationSourcePath(root, sourcePath);
  const source = await readFile(safeSourcePath, "utf8");
  const result = migrateText(source, { ...options, sourcePath: safeSourcePath });
  const confirmedSource = await readFile(safeSourcePath, "utf8");
  if (sha256(confirmedSource) !== result.sourceSha256)
    fail("stale-source", "Migration source changed during candidate creation");
  if (result.status === "partial" && !options.dryRun)
    fail("migration-blocked", "Migration candidate has deferred source content and cannot be applied", {
      sourceSha256: result.sourceSha256,
      deferredContentUnits: result.deferredContentUnits,
    });
  const destination = await assertSafeRecordPath(root, destinationPath);
  await assertGitSafeTaskPath(root, destination);
  if (safeSourcePath === destination) fail("same-source-destination", "Migration source and destination must differ");
  const taskDir = dirname(destination);
  const migrationDir = join(taskDir, ".migration");
  result.destinationPath = destination;
  result.snapshotPath = join(migrationDir, `source-${result.sourceSha256}.md`);
  result.manifestPath = join(migrationDir, "manifest.md");
  if (options.dryRun) return result;
  await assertNoSymlinkPath(dirname(taskDir), root);
  await mkdir(dirname(taskDir), { recursive: true, mode: 0o700 });
  await assertNoSymlinkPath(taskDir, root);
  try {
    await mkdir(taskDir, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST")
      fail("destination-exists", "Migration destination already exists", { path: destination });
    throw error;
  }
  await assertNoSymlinkPath(migrationDir, root);
  await mkdir(migrationDir, { mode: 0o700 });
  result.manifestText = renderManifest({ ...result, status: "updated" });
  await writeSynced(result.snapshotPath, result.sourceSnapshot);
  await writeSynced(result.manifestPath, result.manifestText);
  await publishText(destination, result.candidateText);
  const confirmedText = await readFile(destination, "utf8");
  const confirmed = parseRecord(confirmedText);
  assertValidRecord(confirmed);
  if (sha256(confirmedText) !== result.candidateSha256)
    fail("candidate-confirmation-failure", "Migrated copy differs from candidate");
  return { ...result, status: "updated", record: confirmed, candidateText: confirmedText };
}

export async function rollbackCopy(root, destinationPath) {
  const destination = await assertSafeRecordPath(root, destinationPath);
  await assertGitSafeTaskPath(root, destination);
  const migrationDir = join(dirname(destination), ".migration");
  const entries = await readdir(migrationDir);
  const snapshotName = entries.find((name) => /^source-[a-f0-9]{64}\.md$/.test(name));
  if (!snapshotName) fail("rollback-unavailable", "No exact migration source snapshot exists");
  const snapshotPath = join(migrationDir, snapshotName);
  const source = await readFile(snapshotPath, "utf8");
  await publishText(destination, source);
  const confirmed = await readFile(destination, "utf8");
  if (confirmed !== source)
    fail("rollback-confirmation-failure", "Rollback destination differs from the source snapshot");
  return { status: "rolled-back", destinationPath: destination, snapshotPath, sourceSha256: sha256(source) };
}

export async function forwardRecoverCopy(root, destinationPath) {
  const destination = await assertSafeRecordPath(root, destinationPath);
  await assertGitSafeTaskPath(root, destination);
  const migrationDir = join(dirname(destination), ".migration");
  const manifestPath = join(migrationDir, "manifest.md");
  let manifest;
  try {
    manifest = await readFile(manifestPath, "utf8");
  } catch {
    fail("forward-recovery-unavailable", "Migration manifest is missing");
  }
  const candidateSha256 = manifest.match(/^Candidate SHA-256: ([a-f0-9]{64})$/m)?.[1];
  if (!candidateSha256) fail("forward-recovery-unavailable", "Migration manifest has no candidate hash");
  let destinationText;
  try {
    destinationText = await readFile(destination, "utf8");
    const record = parseRecord(destinationText);
    assertValidRecord(record);
  } catch {
    fail("forward-recovery-conflict", "Migration destination is not a valid schema-v3 record");
  }
  if (sha256(destinationText) !== candidateSha256)
    fail("forward-recovery-conflict", "Migration destination does not match the recorded candidate");
  return { status: "forward-confirmed", destinationPath: destination, candidateSha256, manifestPath };
}

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CommittedResultError, commitText, loadRecord, requireV2, withMutationLock } from "./record-store.mjs";
import { parseRecord, renderRecord } from "./codec.mjs";
import { sourceEntities, sourceUnitOwners, sourceUnits } from "./source-inventory.mjs";
import {
  WorkingRecordError,
  changedSemanticPaths,
  clone,
  fail,
  failureInjection,
  isoNow,
  sha256,
  validateModel,
} from "./model.mjs";
import { assertNoSymlinkPath, displayPath, exists, taskRoot } from "./workspace.mjs";
import { baseEnvelope, recordMetadata } from "./result.mjs";

const MIGRATION_DISPOSITIONS = new Set(["verbatim", "represented", "projection-only", "formatting-normalized"]);
const MIGRATION_KEYS = new Set([
  "authoritySource",
  "reason",
  "candidateText",
  "coverage",
  "expectedSha",
  "expectedSha256",
  "dryRun",
]);
const COMPRESSION_KEYS = new Set([
  "authoritySource",
  "reason",
  "preservation",
  "scope",
  "candidateText",
  "expectedSha",
  "expectedSha256",
  "dryRun",
]);
const COVERAGE_KEYS = new Set([
  "unitId",
  "startByte",
  "endByte",
  "sourceSha256",
  "kind",
  "line",
  "disposition",
  "targetPaths",
]);

function assertKnownKeys(value, allowed, path) {
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail("unknown-input-field", `Unknown input field: ${key}`, { path: `${path}.${key}` });
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim())
    fail("missing-rewrite-declaration", `${name} is required`, { path: name });
  return value;
}

function candidateFromText(candidateText, recordPath) {
  if (typeof candidateText !== "string" || !candidateText.length)
    fail("missing-candidate", "candidateText must contain the complete schema-v2 candidate");
  let parsed;
  try {
    parsed = parseRecord(candidateText, recordPath);
  } catch (error) {
    if (error instanceof WorkingRecordError) {
      fail("candidate-validation-failure", "Candidate could not be parsed", {
        cause: error.message,
        ...(error.details ?? {}),
      });
    }
    throw error;
  }
  if (parsed.kind !== "v2") fail("candidate-validation-failure", "Rewrite candidates must be schema v2");
  const validation = validateModel(parsed.data);
  if (validation.length) fail("candidate-validation-failure", "Candidate failed schema validation", { validation });
  return clone(parsed.data);
}

function semanticPathValue(data, path) {
  if (typeof path !== "string" || !path) return undefined;
  const matcher = /([^.[\]]+)(?:\[([^\]]+)\])?/g;
  let current = data;
  let consumed = 0;
  let match;
  while ((match = matcher.exec(path))) {
    if (match.index !== consumed) return undefined;
    const key = match[1];
    if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
    if (match[2] !== undefined) {
      if (!Array.isArray(current)) return undefined;
      const selector = /^(id|title)=(.+)$/.exec(match[2]);
      if (!selector) return undefined;
      let expected = selector[2];
      if (expected.startsWith('"')) {
        try {
          expected = JSON.parse(expected);
        } catch {
          return undefined;
        }
      }
      current = current.find((item) => String(item?.[selector[1]]) === String(expected));
      if (!current) return undefined;
    }
    consumed = matcher.lastIndex;
    if (path[consumed] === ".") consumed += 1;
  }
  return consumed === path.length ? current : undefined;
}

function valueContainsPayload(value, payload) {
  if (typeof value === "string") return value.includes(payload);
  if (Array.isArray(value)) return value.some((item) => valueContainsPayload(item, payload));
  if (value && typeof value === "object")
    return Object.values(value).some((item) => valueContainsPayload(item, payload));
  return false;
}

function sourcePayload(unit, owners) {
  const text = unit.text.trim();
  if (!text || text === "None" || /^(?:Schema|Last updated):/.test(text)) return null;
  if (/^#{1,6}[ \t]+/.test(text)) {
    const owner = owners.get(unit.unitId);
    if (owner?.structural && owner.recognized) return null;
    return text.replace(/^#{1,6}[ \t]+/, "").trim() || null;
  }
  const field = /^(?:-\s+)?[^:]+:\s*(.*)$/.exec(text);
  let payload = (field ? field[1] : text).trim();
  if (payload.startsWith("- ")) payload = payload.slice(2).trim();
  return payload || null;
}

function formattingOnlySourceUnit(unit, owners) {
  const trimmed = unit.text.trim();
  return !trimmed || Boolean(owners.get(unit.unitId)?.structural && owners.get(unit.unitId)?.recognized);
}

function validateCoverage(text, coverage, candidateText, candidate) {
  if (!Array.isArray(coverage) || coverage.length === 0)
    fail("missing-coverage", "Migration requires a complete non-empty coverage ledger", { path: "coverage" });
  const inventory = sourceUnits(text);
  const owners = sourceUnitOwners(text);
  const candidateInventory = sourceUnits(candidateText);
  const byId = new Map(inventory.map((unit) => [unit.unitId, unit]));
  const consumedCandidateUnits = new Set();
  const seen = new Set();
  const normalized = [];
  for (let index = 0; index < coverage.length; index += 1) {
    const entry = coverage[index];
    const path = `coverage[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      fail("invalid-coverage", "Coverage entries must be objects", { path });
    assertKnownKeys(entry, COVERAGE_KEYS, path);
    const unit = byId.get(entry.unitId);
    if (!unit) fail("invalid-coverage", `Unknown source unit: ${entry.unitId}`, { path });
    if (seen.has(entry.unitId))
      fail("overlapping-coverage", `Source unit is covered more than once: ${entry.unitId}`, { path });
    seen.add(entry.unitId);
    if (entry.startByte !== unit.startByte || entry.endByte !== unit.endByte)
      fail("stale-coverage", `Source boundaries do not match ${entry.unitId}`, { path });
    if (entry.sourceSha256 !== unit.sourceSha256 || entry.kind !== unit.kind || entry.line !== unit.line)
      fail("stale-coverage", `Source descriptor does not match ${entry.unitId}`, { path });
    if (!MIGRATION_DISPOSITIONS.has(entry.disposition))
      fail("invalid-migration-disposition", `Unsupported migration disposition: ${entry.disposition}`, { path });
    if (entry.disposition === "formatting-normalized" && !formattingOnlySourceUnit(unit, owners))
      fail("invalid-formatting-normalization", `${unit.unitId} contains semantic content`, { path });
    const targetPaths = entry.targetPaths ?? [];
    if (!Array.isArray(targetPaths) || targetPaths.some((target) => typeof target !== "string" || !target))
      fail("invalid-coverage", "targetPaths must be an array of non-empty strings", { path: `${path}.targetPaths` });
    if (entry.disposition !== "verbatim" && entry.disposition !== "formatting-normalized") {
      const sourceOwner = owners.get(unit.unitId)?.owner;
      if (!sourceOwner) fail("unmapped-source", `${unit.unitId} has no deterministic semantic owner`, { path });
      if (
        !targetPaths.some(
          (target) =>
            target === sourceOwner || target.startsWith(`${sourceOwner}.`) || target.startsWith(`${sourceOwner}[`),
        )
      )
        fail("invalid-migration-target", `${unit.unitId} targets a different semantic owner`, {
          path,
          sourceOwner,
          targetPaths,
        });
    }
    for (const target of targetPaths)
      if (semanticPathValue(candidate, target) === undefined)
        fail("unmapped-source", `Candidate does not contain migration target path: ${target}`, { path });
    const payload =
      entry.disposition === "verbatim" || entry.disposition === "formatting-normalized"
        ? null
        : sourcePayload(unit, owners);
    if (payload && !targetPaths.some((target) => valueContainsPayload(semanticPathValue(candidate, target), payload)))
      fail("invalid-migration-representation", `${unit.unitId} is not represented by its target values`, {
        path,
        payload,
        targetPaths,
      });
    if (entry.disposition === "verbatim") {
      const candidateIndex = candidateInventory.findIndex(
        (candidateUnit, candidateUnitIndex) =>
          !consumedCandidateUnits.has(candidateUnitIndex) && candidateUnit.text === unit.text,
      );
      if (candidateIndex < 0)
        fail("unrepresented-source", `${unit.unitId} is declared verbatim but is absent from the candidate`, { path });
      consumedCandidateUnits.add(candidateIndex);
    } else {
      if (!targetPaths.length)
        fail("unmapped-source", `${unit.unitId} requires targetPaths for ${entry.disposition}`, { path });
      if (
        entry.disposition === "projection-only" &&
        targetPaths.some((target) => !/^current(Context|Work)(\.|$)/.test(target))
      )
        fail("invalid-coverage", "projection-only targets must belong to currentContext or currentWork", { path });
    }
    normalized.push({
      unitId: unit.unitId,
      startByte: unit.startByte,
      endByte: unit.endByte,
      sourceSha256: unit.sourceSha256,
      kind: unit.kind,
      disposition: entry.disposition,
      ...(targetPaths.length ? { targetPaths: [...targetPaths] } : {}),
    });
  }
  if (seen.size !== inventory.length) {
    const missing = inventory.filter((unit) => !seen.has(unit.unitId)).map((unit) => unit.unitId);
    fail("unmapped-source", "Every source unit requires exactly one migration disposition", { missing });
  }
  return normalized.sort((left, right) => left.startByte - right.startByte);
}

function collectIds(data) {
  const ids = [];
  const add = (value) => {
    if (typeof value === "string" && value) ids.push(value);
  };
  add(data.currentWork?.currentSlice?.id);
  for (const collection of [data.history?.decisions, data.history?.checkpoints, data.history?.slices])
    for (const item of collection ?? []) add(item.id);
  return ids;
}

function candidateEntityKeys(data) {
  return [
    ...(data.proposals ?? []).map((item) => `proposal:${item.title}`),
    ...(data.history?.decisions ?? []).map((item) => `decision:${item.id}|${item.title}`),
    ...(data.history?.checkpoints ?? []).map((item) =>
      item.id ? `checkpoint:${item.id}|${item.title}` : `checkpoint:${item.title}`,
    ),
    ...(data.history?.slices ?? []).map((item) => `slice:${item.id}|${item.title}`),
    ...(data.notes ?? []).map((item) => `note:${item.title}`),
  ];
}

function assertSourceEntityInvariants(sourceText, candidate) {
  const remaining = new Map();
  for (const key of candidateEntityKeys(candidate)) remaining.set(key, (remaining.get(key) ?? 0) + 1);
  const missing = [];
  for (const { key } of sourceEntities(sourceText)) {
    const count = remaining.get(key) ?? 0;
    if (count) remaining.set(key, count - 1);
    else missing.push(key);
  }
  if (missing.length) fail("protected-invariant", "Migration cannot remove recognized source entities", { missing });
}

function assertMigrationInvariants(source, candidate) {
  assertSourceEntityInvariants(source.raw ?? "", candidate);
  if (source.data.taskName && source.data.taskName !== "Unknown task" && candidate.taskName !== source.data.taskName)
    fail("protected-invariant", "Migration cannot change the task name", { path: "taskName" });
  if (source.data.taskState && candidate.taskState !== source.data.taskState)
    fail("protected-invariant", "Migration cannot change task state", { path: "taskState" });
  const sourceSlice = source.data.currentWork?.currentSlice;
  const candidateSlice = candidate.currentWork?.currentSlice;
  if (sourceSlice?.id) {
    if (!candidateSlice || candidateSlice.id !== sourceSlice.id)
      fail("protected-invariant", "Migration cannot change the existing Current Slice identity", {
        path: "currentWork.currentSlice.id",
      });
    for (const field of ["state", "type"]) {
      if (sourceSlice[field] && candidateSlice[field] !== sourceSlice[field])
        fail("protected-invariant", `Migration cannot change Current Slice ${field}`, {
          path: `currentWork.currentSlice.${field}`,
        });
    }
  }
  const sourceIds = collectIds(source.data);
  const candidateIds = new Set(collectIds(candidate));
  const missing = sourceIds.filter((id) => !candidateIds.has(id));
  if (missing.length) fail("protected-invariant", "Migration cannot remove existing entity IDs", { missing });
}

function entitySignature(data) {
  return {
    proposals: (data.proposals ?? []).map((item) => item.title),
    decisions: (data.history?.decisions ?? []).map((item) => `${item.id}|${item.title}`),
    checkpoints: (data.history?.checkpoints ?? []).map((item) => (item.id ? `${item.id}|${item.title}` : item.title)),
    slices: (data.history?.slices ?? []).map((item) => `${item.id}|${item.title}`),
    notes: (data.notes ?? []).map((item) => item.title),
  };
}

function collectKeyValues(value, keyPattern, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeyValues(item, keyPattern, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    if (keyPattern.test(key)) result.push(clone(child));
    collectKeyValues(child, keyPattern, result);
  }
  return result;
}

function protectedProjection(data) {
  return {
    taskState: data.taskState,
    currentSlice: data.currentWork?.currentSlice
      ? {
          id: data.currentWork.currentSlice.id,
          state: data.currentWork.currentSlice.state,
          type: data.currentWork.currentSlice.type,
          authoritySource: data.currentWork.currentSlice.authoritySource,
          reasonAndScope: data.currentWork.currentSlice.reasonAndScope,
          expectedEvidence: data.currentWork.currentSlice.expectedEvidence,
          stopCondition: data.currentWork.currentSlice.stopCondition,
          blocker: data.currentWork.currentSlice.blocker,
          resumeWhen: data.currentWork.currentSlice.resumeWhen,
          startingState: data.currentWork.currentSlice.startingState,
          acceptedExtensions: data.currentWork.currentSlice.acceptedExtensions,
          dependencies: data.currentWork.currentSlice.dependencies,
          selectedCheckpoints: data.currentWork.currentSlice.selectedCheckpoints,
          pendingBoundaries: data.currentWork.currentSlice.pendingBoundaries,
          pendingReviews: data.currentWork.currentSlice.pendingReviews,
        }
      : null,
    entitySignature: entitySignature(data),
    proposalBoundaries: (data.proposals ?? []).map((proposal) => ({
      title: proposal.title,
      dependencies: proposal.dependencies,
      selectedCheckpoints: proposal.selectedCheckpoints,
    })),
    historicalBoundaries: (data.history?.slices ?? []).map((slice) => ({
      id: slice.id,
      acceptedExtensions: slice.acceptedExtensions,
      dependencies: slice.dependencies,
      selectedCheckpoints: slice.selectedCheckpoints,
      pendingBoundaries: slice.pendingBoundaries,
      pendingReviews: slice.pendingReviews,
      abandonmentReason: slice.abandonmentReason,
    })),
    authoritySources: collectKeyValues(data, /^authoritySource$/),
    blockers: collectKeyValues(data, /^(blocker|resumeWhen)$/),
    pending: [data.currentWork?.upcomingCheckpoints ?? [], ...collectKeyValues(data, /pending/i)],
    decisionLinks: (data.history?.decisions ?? []).map((item) => ({
      id: item.id,
      state: item.state,
      supersedes: item.supersedes,
      supersededBy: item.supersededBy,
    })),
    decisionContent: (data.history?.decisions ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      decision: item.decision,
      rationale: item.rationale,
      consequences: item.consequences,
      revisitWhen: item.revisitWhen,
    })),
    checkpointContent: (data.history?.checkpoints ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      selectedBy: item.selectedBy,
      condition: item.condition,
      result: item.result,
      judgment: item.judgment,
      effect: item.effect,
    })),
    evidence: collectKeyValues(data, /^(evidence|expectedEvidence)$/),
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function scopeAllows(path, scope) {
  return scope.some((prefix) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`));
}

function validateCompression(before, candidate, scope) {
  const beforeComparable = clone(before);
  const candidateComparable = clone(candidate);
  beforeComparable.lastUpdated = candidateComparable.lastUpdated = before.lastUpdated;
  const changedPaths = changedSemanticPaths(beforeComparable, candidateComparable);
  const outOfScope = changedPaths.filter((path) => !scopeAllows(path, scope));
  if (outOfScope.length)
    fail("rewrite-out-of-scope", "Candidate changes fall outside the declared compression scope", { outOfScope });
  const beforeProtected = protectedProjection(beforeComparable);
  const afterProtected = protectedProjection(candidateComparable);
  if (!sameJson(beforeProtected, afterProtected)) {
    fail(
      "protected-invariant",
      "Compression changed protected task, lifecycle, authority, blocker, boundary, decision, or evidence state",
      {
        protectedBefore: beforeProtected,
        protectedAfter: afterProtected,
      },
    );
  }
  return changedPaths;
}

function removedSemanticPaths(before, after, path = "") {
  if (before === undefined || after === undefined)
    return before !== undefined && after === undefined ? [path || "$"] : [];
  if (before === null || after === null || typeof before !== "object" || typeof after !== "object") return [];
  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after)) return [path || "$"];
    const afterIds = new Set(after.map((item) => item?.id ?? item?.title));
    return before.flatMap((item, index) => {
      const hasId = item?.id !== undefined;
      const identity = hasId ? item.id : item?.title;
      if (identity !== undefined && !afterIds.has(identity))
        return [`${path}[${hasId ? "id" : "title"}=${JSON.stringify(identity)}]`];
      return removedSemanticPaths(item, after[index], `${path}[${index}]`);
    });
  }
  const paths = [];
  for (const key of Object.keys(before)) {
    const childPath = path ? `${path}.${key}` : key;
    paths.push(...removedSemanticPaths(before[key], after[key], childPath));
  }
  return paths;
}

function canonicalDescriptor(value) {
  return JSON.stringify(value);
}

async function writeImmutable(path, content, code, root) {
  await assertNoSymlinkPath(dirname(path), taskRoot(root));
  if (await exists(path)) {
    const existing = await readFile(path, "utf8");
    if (existing !== content)
      fail("rewrite-evidence-conflict", `Immutable rewrite evidence conflicts at ${path}`, { path });
    return false;
  }
  if (failureInjection(code)) fail(`${code}-failure`, `Injected ${code} failure`);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let committed = false;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
    committed = true;
    return true;
  } finally {
    if (!committed) await unlink(temporaryPath).catch(() => undefined);
  }
}

async function ensureSnapshot(root, recordPath, loaded, descriptor) {
  const snapshotRoot = join(dirname(recordPath), "snapshots", loaded.rawSha);
  const operationKey = sha256(canonicalDescriptor(descriptor));
  const operationRoot = join(snapshotRoot, "operations");
  await assertNoSymlinkPath(join(dirname(recordPath), "snapshots"), taskRoot(root));
  await mkdir(operationRoot, { recursive: true });
  await assertNoSymlinkPath(snapshotRoot, taskRoot(root));
  await assertNoSymlinkPath(operationRoot, taskRoot(root));
  const source = {
    sourceSha256: loaded.rawSha,
    byteCount: Buffer.byteLength(loaded.text, "utf8"),
    sourceKind: loaded.kind,
    schemaVersion: loaded.data?.schemaVersion ?? null,
    recordPath: displayPath(root, recordPath),
  };
  await writeImmutable(join(snapshotRoot, "record.md"), loaded.text, "snapshot-write", root);
  await writeImmutable(
    join(snapshotRoot, "source.json"),
    `${JSON.stringify(source, null, 2)}\n`,
    "snapshot-write",
    root,
  );
  const manifest = {
    ...descriptor,
    operationKey,
    snapshotPath: displayPath(root, snapshotRoot),
  };
  await writeImmutable(
    join(operationRoot, `${operationKey}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "manifest-write",
    root,
  );
  return {
    operationKey,
    snapshotPath: displayPath(root, snapshotRoot),
    manifestPath: displayPath(root, join(operationRoot, `${operationKey}.json`)),
  };
}

function rewriteMetadata(root, recordPath, data, sha, confirmation = "confirmed", unavailable = []) {
  return recordMetadata(root, recordPath, data, sha, confirmation, unavailable);
}

function expectedSha(options, input) {
  return options["--expected-sha"] ?? options["--expected-sha256"] ?? input.expectedSha256 ?? input.expectedSha;
}

function dryRun(options, input) {
  return options["--dry-run"] === true || input.dryRun === true;
}

function rewriteResult(
  command,
  root,
  recordPath,
  loaded,
  candidate,
  candidateSha,
  details,
  status,
  recordConfirmation = "candidate",
) {
  const envelope = baseEnvelope(
    command,
    command,
    rewriteMetadata(root, recordPath, candidate, candidateSha, recordConfirmation),
  );
  envelope.status = status;
  envelope.beforeSha256 = loaded.rawSha;
  envelope.afterSha256 = status === "updated" ? candidateSha : loaded.rawSha;
  envelope.sourceKind = loaded.kind;
  envelope.sourceSha256 = loaded.rawSha;
  envelope.candidateSha256 = candidateSha;
  Object.assign(envelope, details);
  return envelope;
}

function buildRewrite(command, recordPath, loaded, input) {
  if (command === "migrate") {
    assertKnownKeys(input, MIGRATION_KEYS, "input");
    if (loaded.kind === "v2") fail("migration-source-not-legacy", "migrate accepts only legacy or unsupported records");
    const authoritySource = requiredString(input.authoritySource, "authoritySource");
    const reason = requiredString(input.reason, "reason");
    const candidate = candidateFromText(input.candidateText, recordPath);
    assertMigrationInvariants(loaded, candidate);
    candidate.lastUpdated = isoNow();
    const candidateText = renderRecord(candidate);
    const coverage = validateCoverage(loaded.text, input.coverage, candidateText, candidate);
    const candidateSha = sha256(candidateText);
    const changedPaths = [...new Set(coverage.flatMap((entry) => entry.targetPaths ?? []))];
    const descriptor = {
      operation: "migrate",
      sourceSha256: loaded.rawSha,
      candidateSha256: candidateSha,
      authoritySource,
      reason,
      changedPaths: changedPaths.length ? changedPaths : ["record"],
      removedPaths: [],
      coverage,
    };
    return {
      candidate,
      candidateText,
      candidateSha,
      changedPaths: descriptor.changedPaths,
      removedPaths: [],
      descriptor,
      coverage,
    };
  }

  assertKnownKeys(input, COMPRESSION_KEYS, "input");
  if (loaded.kind !== "v2")
    fail("compression-source-not-v2", "compress requires a valid schema-v2 record; migrate first");
  requireV2(loaded);
  const authoritySource = requiredString(input.authoritySource, "authoritySource");
  const reason = requiredString(input.reason, "reason");
  const preservation = requiredString(input.preservation, "preservation");
  if (
    !Array.isArray(input.scope) ||
    input.scope.length === 0 ||
    input.scope.some((item) => typeof item !== "string" || !item)
  )
    fail("missing-compression-scope", "compress requires a non-empty scope array of semantic paths", { path: "scope" });
  const scope = [...new Set(input.scope)];
  const candidate = candidateFromText(input.candidateText, recordPath);
  candidate.lastUpdated = isoNow();
  const changedPaths = validateCompression(loaded.data, candidate, scope);
  if (!changedPaths.length) {
    return {
      candidate: loaded.data,
      candidateText: loaded.text,
      candidateSha: loaded.rawSha,
      changedPaths: [],
      removedPaths: [],
      descriptor: null,
      scope,
      preservation,
    };
  }
  const candidateText = renderRecord(candidate);
  const candidateSha = sha256(candidateText);
  const removed = removedSemanticPaths(loaded.data, candidate);
  const descriptor = {
    operation: "compress",
    sourceSha256: loaded.rawSha,
    candidateSha256: candidateSha,
    scope,
    authoritySource,
    reason,
    preservation,
    changedPaths,
    removedPaths: removed,
  };
  return {
    candidate,
    candidateText,
    candidateSha,
    changedPaths,
    removedPaths: removed,
    descriptor,
    scope,
    preservation,
  };
}

export async function rewriteExisting(root, command, recordPath, input, options) {
  const expected = expectedSha(options, input);
  if (!expected) fail("missing-expected-sha", "Existing-record rewrites require --expected-sha or expectedSha256");
  const isDryRun = dryRun(options, input);
  await assertNoSymlinkPath(recordPath, taskRoot(root));
  return withMutationLock(recordPath, { dryRun: isDryRun }, async () => {
    const loaded = await loadRecord(root, recordPath);
    if (loaded.rawSha !== expected)
      fail("stale-sha", "Expected SHA-256 does not match the current record", {
        expectedSha256: expected,
        actualSha256: loaded.rawSha,
      });
    const built = buildRewrite(command, recordPath, loaded, input);
    if (!built.changedPaths.length && command === "compress") {
      const envelope = rewriteResult(
        command,
        root,
        recordPath,
        loaded,
        loaded.data,
        loaded.rawSha,
        {
          changedPaths: [],
          removedPaths: [],
          scope: built.scope,
        },
        isDryRun ? "dry-run" : "no-change",
        "confirmed",
      );
      if (isDryRun) envelope.prospective = { wouldChange: false, candidateSha256: loaded.rawSha };
      return envelope;
    }
    let evidence = null;
    if (built.descriptor && !isDryRun) evidence = await ensureSnapshot(root, recordPath, loaded, built.descriptor);
    const details = {
      changedPaths: built.changedPaths,
      removedPaths: built.removedPaths,
      ...(built.coverage ? { coverage: built.coverage } : {}),
      ...(built.scope ? { scope: built.scope } : {}),
      ...(evidence ? { snapshot: evidence, operationKey: evidence.operationKey } : {}),
    };
    if (isDryRun) {
      const envelope = rewriteResult(
        command,
        root,
        recordPath,
        loaded,
        built.candidate,
        built.candidateSha,
        details,
        "dry-run",
      );
      envelope.beforeSha256 = loaded.rawSha;
      envelope.afterSha256 = loaded.rawSha;
      envelope.prospective = {
        wouldChange: true,
        candidateSha256: built.candidateSha,
        sourceSnapshotSha256: loaded.rawSha,
        operationKey: built.descriptor ? sha256(canonicalDescriptor(built.descriptor)) : null,
      };
      return envelope;
    }
    try {
      const committed = await commitText(recordPath, built.candidateText, built.candidate);
      const envelope = rewriteResult(
        command,
        root,
        recordPath,
        loaded,
        committed.data,
        committed.sha256,
        details,
        "updated",
      );
      envelope.afterSha256 = committed.sha256;
      return envelope;
    } catch (error) {
      if (error instanceof WorkingRecordError && error.committed) {
        const envelope = rewriteResult(
          command,
          root,
          recordPath,
          loaded,
          error.candidate?.data ?? built.candidate,
          error.candidate?.sha256 ?? built.candidateSha,
          details,
          "committed-unconfirmed",
          "candidate",
        );
        envelope.afterSha256 = null;
        envelope.errors = [{ code: error.code, message: error.message, ...(error.details ?? {}) }];
        envelope.recovery = {
          required: true,
          discardExpectedSha: true,
          steps: [
            "fresh read of the actual record path",
            "validate",
            "inspect when available",
            "establish confirmed task projection before another rewrite",
          ],
        };
        throw new CommittedResultError(envelope);
      }
      throw error;
    }
  });
}

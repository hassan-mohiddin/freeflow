#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const INCLUDED_ROOTS = [
  "evals/reports/acceptance",
  "evals/reports/by-command-surface",
  "evals/reports/by-skill",
  "evals/reports/iterations",
];
export const EXCLUDED_ROOTS = ["evals/reports/harness", "evals/reports/runtime"];
export const AUTHORITY = "historical-documentary-only";
export const LIMITATION_CODES = [
  "artifacts-ignored",
  "artifacts-missing",
  "current-skill-not-mapped",
  "date-not-stated",
  "host-not-stated",
  "method-not-stated",
  "model-not-stated",
  "reported-only",
  "superseded",
];
const RECORD_KEYS = [
  "authority",
  "convertible_to_current_result",
  "id",
  "indexed_on",
  "indexing_revision",
  "limitations",
  "readiness_eligible",
  "referenced_artifacts",
  "related_current_skills",
  "reported_date",
  "reported_eval_ids",
  "reported_outcome",
  "source_report",
  "superseded_by",
  "supersedes",
];
const RECORD_OPTIONAL_KEYS = ["reported_context"];
const SHA_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RECORD_ID_PATTERN = /^HIST-[0-9a-f]{16}$/;
const EVAL_ID_PATTERN = /^[A-Z][A-Z0-9]{1,9}-\d{3}$/;
const SKILL_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function historicalRecordId(path) {
  return `HIST-${sha256(Buffer.from(path, "utf8")).slice(0, 16)}`;
}

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
}

function assertExactKeys(value, required, optional, label) {
  assertObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!(key in value)) fail(`${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label}.${key} is not allowed`);
}

function assertString(value, label, pattern) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail(`${label} has invalid format`);
}

function assertInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) fail(`${label} must be a positive integer`);
}

function assertFixedAuthority(value, label) {
  if (
    value.authority !== AUTHORITY ||
    value.readiness_eligible !== false ||
    value.convertible_to_current_result !== false
  ) {
    fail(`${label} must preserve fixed historical documentary authority`);
  }
}

function assertSortedUnique(values, label, itemCheck = () => {}) {
  if (!Array.isArray(values)) fail(`${label} must be an array`);
  for (let index = 0; index < values.length; index += 1) {
    itemCheck(values[index], `${label}[${index}]`);
    if (index > 0 && compareText(values[index - 1], values[index]) >= 0)
      fail(`${label} must be unique and lexically sorted`);
  }
}

function assertSafeRelativePath(path, label) {
  assertString(path, label);
  if (path.includes("\\") || path.startsWith("/") || path.includes("\0") || path.includes("\r") || path.includes("\n"))
    fail(`${label} is not a canonical repo-relative path`);
  const normalized = posix.normalize(path);
  if (normalized !== path || normalized === "." || normalized.startsWith("../") || normalized.includes("/../"))
    fail(`${label} is not normalized`);
}

async function lstatOptional(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoSymlinkAncestors(root, relativePath, label) {
  assertSafeRelativePath(relativePath, label);
  let current = root;
  for (const part of relativePath.split("/")) {
    current = resolve(current, part);
    const stat = await lstatOptional(current);
    if (!stat) return;
    if (stat.isSymbolicLink()) fail(`${label} contains a symlink: ${relativePath}`);
  }
}

function assertInside(root, path, label) {
  const rel = relative(root, path);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) return;
  fail(`${label} escapes repository root`);
}

async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    fail(`${label} cannot be read: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

async function discoverMarkdown(root, relativeRoot) {
  await assertNoSymlinkAncestors(root, relativeRoot, "scope root");
  const absoluteRoot = resolve(root, relativeRoot);
  const stat = await lstatOptional(absoluteRoot);
  if (!stat?.isDirectory()) fail(`scope root is missing or not a directory: ${relativeRoot}`);
  const found = [];
  async function visit(absolute, relativeBase) {
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const childRelative = posix.join(relativeBase, entry.name);
      const childAbsolute = resolve(root, childRelative);
      assertInside(root, childAbsolute, "report path");
      if (entry.isSymbolicLink()) fail(`scope contains a symlink: ${childRelative}`);
      if (entry.isDirectory()) await visit(childAbsolute, childRelative);
      else if (entry.isFile() && entry.name.endsWith(".md")) found.push(childRelative);
    }
  }
  await visit(absoluteRoot, relativeRoot);
  return found;
}

export function selectReportedDate(source) {
  const metadata = source.match(/^> \*\*Date:\*\* (\d{4}-\d{2}-\d{2})\s*$/m);
  if (metadata) return metadata[1];
  const topLevel = source.match(/^Date: (\d{4}-\d{2}-\d{2})\s*$/m);
  return topLevel?.[1] ?? null;
}

function stripArtifactPunctuation(token) {
  let value = token;
  while (/[),.;:\]}]$/.test(value)) value = value.slice(0, -1);
  return value;
}

export function extractArtifactReferences(source) {
  const references = new Map();
  const pattern = /(?<![A-Za-z0-9_\/.:-])(?:evals\/)?runs\/[^\s`"'<>|]+/g;
  for (const match of source.matchAll(pattern)) {
    const sourceToken = stripArtifactPunctuation(match[0]);
    if (
      !sourceToken ||
      /[*?${}\[\]<>\\#]/.test(sourceToken) ||
      sourceToken.split("/").some((segment) => segment === "." || segment === "..")
    )
      continue;
    const expanded = sourceToken.startsWith("runs/") ? `evals/${sourceToken}` : sourceToken;
    const normalized = posix.normalize(expanded.replace(/\/+$/, ""));
    if (normalized === "evals/runs" || !normalized.startsWith("evals/runs/") || normalized.includes("/../")) continue;
    if (!references.has(normalized)) references.set(normalized, new Set());
    references.get(normalized).add(sourceToken);
  }
  return [...references.entries()]
    .map(([path, tokens]) => ({ path, source_tokens: [...tokens].sort(compareText) }))
    .sort((a, b) => compareText(a.path, b.path));
}

async function hashDirectory(absoluteRoot) {
  const lines = [];
  async function visit(absolute, relativeBase) {
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (/[\r\n]/.test(entry.name)) fail(`directory artifact contains CR/LF path: ${entry.name}`);
      const rel = relativeBase ? posix.join(relativeBase, entry.name) : entry.name;
      const child = resolve(absolute, entry.name);
      if (entry.isSymbolicLink()) fail(`directory artifact contains symlink: ${rel}`);
      if (entry.isDirectory()) await visit(child, rel);
      else if (entry.isFile()) lines.push(`${rel} ${sha256(await readFile(child))}\n`);
      else fail(`directory artifact contains unsupported entry: ${rel}`);
    }
  }
  await visit(absoluteRoot, "");
  return sha256(lines.join(""));
}

async function inspectArtifact(root, path, ignoredRunsRoot) {
  await assertNoSymlinkAncestors(root, path, "artifact path");
  const absolute = resolve(root, path);
  assertInside(root, absolute, "artifact path");
  const stat = await lstatOptional(absolute);
  if (!stat) return { status: ignoredRunsRoot && path.startsWith("evals/runs/") ? "ignored" : "missing" };
  if (stat.isSymbolicLink()) fail(`artifact is a symlink: ${path}`);
  if (stat.isFile()) return { status: "present", kind: "file", sha256: sha256(await readFile(absolute)) };
  if (stat.isDirectory()) return { status: "present", kind: "directory", sha256: await hashDirectory(absolute) };
  fail(`artifact has unsupported kind: ${path}`);
}

function assertSchemaDocument(schema) {
  assertObject(schema, "historical schema");
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") fail("historical schema draft is not fixed");
  if (schema.type !== "object" || schema.additionalProperties !== false)
    fail("historical schema root must be a closed object");
  if (schema.properties?.schema_version?.const !== 1) fail("historical schema version contract is invalid");
  if (schema.properties?.authority?.const !== AUTHORITY) fail("historical schema authority contract is invalid");
  if (
    schema.properties?.readiness_eligible?.const !== false ||
    schema.properties?.convertible_to_current_result?.const !== false
  )
    fail("historical schema non-authority booleans are invalid");
  if (schema.$defs?.record?.additionalProperties !== false || schema.$defs?.artifact?.additionalProperties !== false)
    fail("historical schema record shapes must be closed");
}

function assertContext(context, source, label) {
  assertExactKeys(context, ["excerpt", "sha256"], ["host", "model", "method"], label);
  assertString(context.excerpt, `${label}.excerpt`);
  assertString(context.sha256, `${label}.sha256`, SHA_PATTERN);
  if (sha256(context.excerpt) !== context.sha256 || !source.includes(context.excerpt))
    fail(`${label} excerpt is not exact source evidence`);
  const values = ["host", "model", "method"].filter((key) => key in context);
  if (values.length === 0) fail(`${label} must state host, model, or method`);
  for (const key of values) {
    assertString(context[key], `${label}.${key}`);
    if (!context.excerpt.includes(context[key])) fail(`${label}.${key} is not verbatim in its excerpt`);
  }
}

function assertRelationShape(relation, label) {
  assertExactKeys(relation, ["record_id", "evidence"], [], label);
  assertString(relation.record_id, `${label}.record_id`, RECORD_ID_PATTERN);
  assertExactKeys(
    relation.evidence,
    ["source_report_path", "source_report_sha256", "excerpt", "excerpt_sha256"],
    [],
    `${label}.evidence`,
  );
  assertSafeRelativePath(relation.evidence.source_report_path, `${label}.evidence.source_report_path`);
  assertString(relation.evidence.source_report_sha256, `${label}.evidence.source_report_sha256`, SHA_PATTERN);
  assertString(relation.evidence.excerpt, `${label}.evidence.excerpt`);
  assertString(relation.evidence.excerpt_sha256, `${label}.evidence.excerpt_sha256`, SHA_PATTERN);
}

function sameRelationEvidence(left, right) {
  return (
    left?.source_report_path === right?.source_report_path &&
    left?.source_report_sha256 === right?.source_report_sha256 &&
    left?.excerpt === right?.excerpt &&
    left?.excerpt_sha256 === right?.excerpt_sha256
  );
}

function derivedLimitations(record) {
  const values = ["reported-only"];
  if (record.reported_date === null) values.push("date-not-stated");
  if (record.related_current_skills.length === 0) values.push("current-skill-not-mapped");
  if (!record.reported_context?.host) values.push("host-not-stated");
  if (!record.reported_context?.model) values.push("model-not-stated");
  if (!record.reported_context?.method) values.push("method-not-stated");
  if (record.referenced_artifacts.some((artifact) => artifact.status === "ignored")) values.push("artifacts-ignored");
  if (record.referenced_artifacts.some((artifact) => artifact.status === "missing")) values.push("artifacts-missing");
  if (record.superseded_by.length > 0) values.push("superseded");
  return values.sort(compareText);
}

async function validateRecord({ root, record, index, sourceByPath, recordsById, ignoredRunsRoot, counters, position }) {
  assertExactKeys(record, RECORD_KEYS, RECORD_OPTIONAL_KEYS, `records[${position}]`);
  assertFixedAuthority(record, `records[${position}]`);
  assertInteger(record.indexing_revision, `records[${position}].indexing_revision`);
  if (record.indexing_revision !== index.indexing_revision || record.indexed_on !== index.indexed_on)
    fail(`${record.id} indexing identity differs from index`);
  assertString(record.indexed_on, `${record.id}.indexed_on`, DATE_PATTERN);
  assertString(record.id, `${record.id}.id`, RECORD_ID_PATTERN);
  assertExactKeys(record.source_report, ["path", "sha256"], [], `${record.id}.source_report`);
  assertSafeRelativePath(record.source_report.path, `${record.id}.source_report.path`);
  assertString(record.source_report.sha256, `${record.id}.source_report.sha256`, SHA_PATTERN);
  if (historicalRecordId(record.source_report.path) !== record.id)
    fail(`${record.id} is not derived from source report path`);
  const source = sourceByPath.get(record.source_report.path);
  if (source === undefined) fail(`${record.id} source report is outside exact scope: ${record.source_report.path}`);
  if (sha256(source) !== record.source_report.sha256) fail(`${record.id} source report hash mismatch`);
  const expectedDate = selectReportedDate(source);
  if (record.reported_date !== expectedDate) fail(`${record.id} reported_date does not follow source precedence`);

  assertSortedUnique(record.related_current_skills, `${record.id}.related_current_skills`, (skill, label) =>
    assertString(skill, label, SKILL_PATTERN),
  );
  for (const skill of record.related_current_skills) {
    const stat = await lstatOptional(resolve(root, "skills", skill));
    if (!stat?.isDirectory()) fail(`${record.id} maps missing current skill: ${skill}`);
    if (!source.includes(skill)) fail(`${record.id} current skill mapping is not stated in source: ${skill}`);
  }
  assertSortedUnique(record.reported_eval_ids, `${record.id}.reported_eval_ids`, (evalId, label) =>
    assertString(evalId, label, EVAL_ID_PATTERN),
  );
  for (const evalId of record.reported_eval_ids)
    if (!source.includes(evalId)) fail(`${record.id} eval ID is not stated in source: ${evalId}`);

  assertExactKeys(record.reported_outcome, ["label", "excerpt", "sha256"], [], `${record.id}.reported_outcome`);
  if (record.reported_outcome.label !== "reported-not-regraded") fail(`${record.id} outcome label is not documentary`);
  assertString(record.reported_outcome.excerpt, `${record.id}.reported_outcome.excerpt`);
  assertString(record.reported_outcome.sha256, `${record.id}.reported_outcome.sha256`, SHA_PATTERN);
  if (
    sha256(record.reported_outcome.excerpt) !== record.reported_outcome.sha256 ||
    !source.includes(record.reported_outcome.excerpt)
  )
    fail(`${record.id} outcome excerpt is not exact source evidence`);
  if (record.reported_context) assertContext(record.reported_context, source, `${record.id}.reported_context`);

  if (!Array.isArray(record.referenced_artifacts)) fail(`${record.id}.referenced_artifacts must be an array`);
  const extracted = extractArtifactReferences(source);
  if (record.referenced_artifacts.length !== extracted.length)
    fail(`${record.id} concrete artifact extraction is incomplete`);
  for (let artifactIndex = 0; artifactIndex < record.referenced_artifacts.length; artifactIndex += 1) {
    const artifact = record.referenced_artifacts[artifactIndex];
    const expectedReference = extracted[artifactIndex];
    assertObject(artifact, `${record.id}.referenced_artifacts[${artifactIndex}]`);
    const expectedKeys =
      artifact.status === "present"
        ? ["kind", "path", "sha256", "source_tokens", "status"]
        : ["path", "source_tokens", "status"];
    assertExactKeys(artifact, expectedKeys, [], `${record.id}.referenced_artifacts[${artifactIndex}]`);
    assertSortedUnique(
      artifact.source_tokens,
      `${record.id}.referenced_artifacts[${artifactIndex}].source_tokens`,
      (token, label) => assertString(token, label),
    );
    assertSafeRelativePath(artifact.path, `${record.id}.referenced_artifacts[${artifactIndex}].path`);
    if (
      artifact.path !== expectedReference?.path ||
      JSON.stringify(artifact.source_tokens) !== JSON.stringify(expectedReference?.source_tokens)
    )
      fail(`${record.id} artifact source-token normalization mismatch`);
    const observed = await inspectArtifact(root, artifact.path, ignoredRunsRoot);
    if (artifact.status !== observed.status || artifact.kind !== observed.kind || artifact.sha256 !== observed.sha256)
      fail(`${record.id} artifact status or hash mismatch: ${artifact.path}`);
    counters[`${observed.status}_artifacts`] += 1;
  }

  assertSortedUnique(record.limitations, `${record.id}.limitations`, (item, label) => {
    if (!LIMITATION_CODES.includes(item)) fail(`${label} is not a defined limitation`);
  });
  if (JSON.stringify(record.limitations) !== JSON.stringify(derivedLimitations(record)))
    fail(`${record.id} limitations do not match observable state`);

  for (const relationName of ["supersedes", "superseded_by"]) {
    const relations = record[relationName];
    if (!Array.isArray(relations)) fail(`${record.id}.${relationName} must be an array`);
    let previous = "";
    for (let relationIndex = 0; relationIndex < relations.length; relationIndex += 1) {
      const relation = relations[relationIndex];
      assertRelationShape(relation, `${record.id}.${relationName}[${relationIndex}]`);
      if (previous && compareText(previous, relation.record_id) >= 0)
        fail(`${record.id}.${relationName} must be unique and sorted by record_id`);
      previous = relation.record_id;
      const target = recordsById.get(relation.record_id);
      if (!target || target.id === record.id)
        fail(`${record.id}.${relationName} has invalid target ${relation.record_id}`);
      const evidenceSource = sourceByPath.get(relation.evidence.source_report_path);
      if (evidenceSource === undefined) fail(`${record.id}.${relationName} evidence report is outside scope`);
      if (
        sha256(evidenceSource) !== relation.evidence.source_report_sha256 ||
        !evidenceSource.includes(relation.evidence.excerpt) ||
        sha256(relation.evidence.excerpt) !== relation.evidence.excerpt_sha256
      )
        fail(`${record.id}.${relationName} evidence is not exact source text`);
      const opposite = relationName === "supersedes" ? "superseded_by" : "supersedes";
      const reciprocal = target[opposite]?.find(
        (item) => item.record_id === record.id && sameRelationEvidence(item.evidence, relation.evidence),
      );
      if (!reciprocal) fail(`${record.id}.${relationName} is not reciprocal with ${target.id}`);
      if (relationName === "supersedes") counters.supersession_relations += 1;
    }
  }
}

export async function auditHistoricalEvidence({ root }) {
  const absoluteRoot = await realpath(resolve(root));
  const schemaPath = resolve(absoluteRoot, "evals/schemas/historical-evidence.schema.json");
  const indexPath = resolve(absoluteRoot, "evals/registries/historical-evidence.json");
  const [schema, index] = await Promise.all([
    readJson(schemaPath, "historical schema"),
    readJson(indexPath, "historical registry"),
  ]);
  assertSchemaDocument(schema);
  assertExactKeys(
    index,
    [
      "schema_version",
      "index_id",
      "indexing_revision",
      "indexed_on",
      "scope",
      "authority",
      "readiness_eligible",
      "convertible_to_current_result",
      "records",
    ],
    [],
    "historical registry",
  );
  if (index.schema_version !== 1 || index.index_id !== "freeflow-historical-evidence")
    fail("historical registry identity is invalid");
  assertInteger(index.indexing_revision, "historical registry.indexing_revision");
  assertString(index.indexed_on, "historical registry.indexed_on", DATE_PATTERN);
  assertFixedAuthority(index, "historical registry");
  assertExactKeys(
    index.scope,
    ["included_roots", "excluded_roots", "recursive", "file_extension"],
    [],
    "historical registry.scope",
  );
  if (
    JSON.stringify(index.scope.included_roots) !== JSON.stringify(INCLUDED_ROOTS) ||
    JSON.stringify(index.scope.excluded_roots) !== JSON.stringify(EXCLUDED_ROOTS) ||
    index.scope.recursive !== true ||
    index.scope.file_extension !== ".md"
  )
    fail("historical registry scope is not the fixed initial scope");

  const reportPaths = (await Promise.all(INCLUDED_ROOTS.map((path) => discoverMarkdown(absoluteRoot, path))))
    .flat()
    .sort(compareText);
  const sourceByPath = new Map();
  for (const reportPath of reportPaths)
    sourceByPath.set(reportPath, await readFile(resolve(absoluteRoot, reportPath), "utf8"));
  if (!Array.isArray(index.records) || index.records.length !== reportPaths.length)
    fail(`historical registry must contain exactly ${reportPaths.length} in-scope reports`);
  const recordPaths = index.records.map((record) => record?.source_report?.path);
  if (JSON.stringify(recordPaths) !== JSON.stringify(reportPaths))
    fail("historical registry records must be complete and sorted by source report path");
  const recordsById = new Map();
  for (const record of index.records) {
    if (recordsById.has(record.id)) fail(`duplicate historical record ID: ${record.id}`);
    recordsById.set(record.id, record);
  }

  const gitignore = await readFile(resolve(absoluteRoot, ".gitignore"), "utf8").catch(() => "");
  const ignoredRunsRoot = gitignore.split(/\r?\n/).some((line) => line.trim() === "evals/runs/");
  const counters = { present_artifacts: 0, ignored_artifacts: 0, missing_artifacts: 0, supersession_relations: 0 };
  for (let position = 0; position < index.records.length; position += 1) {
    await validateRecord({
      root: absoluteRoot,
      record: index.records[position],
      index,
      sourceByPath,
      recordsById,
      ignoredRunsRoot,
      counters,
      position,
    });
  }
  return { status: "ok", records: index.records.length, ...counters, model_requests: 0 };
}

function parseArgs(argv) {
  let root = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--root" || !argv[index + 1]) fail(`unknown or incomplete argument: ${argv[index] ?? ""}`);
    root = argv[index + 1];
    index += 1;
  }
  return { root };
}

async function main() {
  try {
    const result = await auditHistoricalEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Historical evidence audit failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();

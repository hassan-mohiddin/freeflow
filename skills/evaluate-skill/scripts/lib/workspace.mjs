import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isWithin } from "./path-policy.mjs";

export const EVIDENCE_CLASSES = new Set([
  "structure",
  "explicit-instruction",
  "native-activation",
  "artifact-outcome",
  "multi-turn",
  "cross-host",
]);

const VARIANT_KINDS = new Set(["working-tree", "git", "none"]);
const HOSTS = new Set(["pi", "none"]);
const QUESTIONS = new Set([
  "structural validity",
  "automatic activation",
  "explicit invocation",
  "active-body wording",
  "conversational behavior",
  "fixture/repo behavior",
  "skill composition",
  "multi-turn behavior",
  "full host/runtime behavior",
]);
const ASSERTION_TYPES = new Set([
  "skill_read",
  "skill_not_read",
  "path_exists",
  "changed_paths",
  "skill_frontmatter",
  "line_count",
  "semantic",
  "forbidden_changed_path",
  "path_unchanged",
  "file_contains",
  "json_field",
  "forbidden_text",
  "unsupported_evidence_class",
]);

export async function readJson(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read JSON ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON ${path}: ${error.message}`);
  }
}

export function resolveInside(root, candidate, label = "path") {
  if (typeof candidate !== "string" || candidate.length === 0) throw new Error(`${label} must be a non-empty relative path`);
  if (candidate.includes("\0") || isAbsolute(candidate)) throw new Error(`${label} must be relative: ${candidate}`);
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, candidate);
  const rel = relative(absoluteRoot, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes its owned root: ${candidate}`);
  }
  return absolute;
}

export async function findRepoRoot(start = process.cwd()) {
  let cursor = resolve(start);
  for (;;) {
    const candidate = resolve(cursor, ".skill-eval", "config.json");
    try {
      await access(candidate, constants.R_OK);
      return cursor;
    } catch {}
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error("No .skill-eval/config.json found above the current directory");
    cursor = parent;
  }
}

function requireString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) throw new Error(`${label} must be a string`);
}

function validateEvidenceClasses(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must contain at least one evidence class`);
  for (const value of values) if (!EVIDENCE_CLASSES.has(value)) throw new Error(`${label} contains unknown evidence class: ${value}`);
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate evidence classes`);
}

export function validateCase(value, { path = "case" } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  if (value.schema_version !== 1) throw new Error(`${path} has unsupported schema_version`);
  for (const key of ["id", "skill", "title", "question"]) requireString(value[key], `${path}.${key}`);
  if (!QUESTIONS.has(value.question)) throw new Error(`${path} has unknown eval question: ${value.question}`);
  requireString(value.prompt, `${path}.prompt`, { allowEmpty: true });
  if (typeof value.required_for_bootstrap !== "boolean") throw new Error(`${path}.required_for_bootstrap must be boolean`);
  validateEvidenceClasses(value.evidence_classes, `${path}.evidence_classes`);
  if (value.requested_evidence_classes !== undefined) validateEvidenceClasses(value.requested_evidence_classes, `${path}.requested_evidence_classes`);
  if (value.fixture !== null && typeof value.fixture !== "string") throw new Error(`${path}.fixture must be a string or null`);
  if (!Array.isArray(value.variants) || value.variants.length === 0) throw new Error(`${path}.variants must not be empty`);
  const variantIds = new Set();
  for (const variant of value.variants) {
    requireString(variant.id, `${path}.variant.id`);
    if (variantIds.has(variant.id)) throw new Error(`${path} has duplicate variant: ${variant.id}`);
    variantIds.add(variant.id);
    if (!VARIANT_KINDS.has(variant.kind)) throw new Error(`${path} has unknown variant kind: ${variant.kind}`);
    requireString(variant.path, `${path}.${variant.id}.path`);
    if (variant.kind === "git") requireString(variant.revision, `${path}.${variant.id}.revision`);
  }
  if (!value.execution || !HOSTS.has(value.execution.host)) throw new Error(`${path} has unknown execution host`);
  if (value.execution.host === "pi" && value.execution.mode !== "json") throw new Error(`${path} Pi execution must use json mode`);
  if (value.execution.host === "none" && value.execution.mode !== "deterministic") throw new Error(`${path} deterministic execution must use none host`);
  if (!Array.isArray(value.execution.tools)) throw new Error(`${path}.execution.tools must be an array`);
  if (value.execution.tools.includes("bash")) throw new Error(`${path} cannot expose unrestricted bash`);
  if (!Number.isInteger(value.execution.timeout_ms) || value.execution.timeout_ms < 1) throw new Error(`${path}.execution.timeout_ms must be positive`);
  if (!Array.isArray(value.assertions) || value.assertions.length === 0) throw new Error(`${path}.assertions must not be empty`);
  const assertionIds = new Set();
  for (const assertion of value.assertions) {
    requireString(assertion.id, `${path}.assertion.id`);
    requireString(assertion.type, `${path}.${assertion.id}.type`);
    if (!ASSERTION_TYPES.has(assertion.type)) throw new Error(`${path} has unknown assertion type: ${assertion.type}`);
    if (assertionIds.has(assertion.id)) throw new Error(`${path} has duplicate assertion: ${assertion.id}`);
    assertionIds.add(assertion.id);
    if (assertion.type === "semantic") requireString(assertion.rubric, `${path}.${assertion.id}.rubric`);
    if (new Set(["path_exists", "skill_frontmatter", "line_count", "path_unchanged", "file_contains", "json_field", "forbidden_text"]).has(assertion.type)) {
      requireString(assertion.path, `${path}.${assertion.id}.path`);
      resolveInside("/owned", assertion.path, `${path}.${assertion.id}.path`);
    }
    if (assertion.type === "changed_paths" && !Array.isArray(assertion.equals)) throw new Error(`${path}.${assertion.id}.equals must be an array`);
    if (assertion.type === "line_count" && (!Number.isInteger(assertion.max) || assertion.max < 1)) throw new Error(`${path}.${assertion.id}.max must be positive`);
  }
  return value;
}

export async function loadSkillWorkspace(repoRoot, skill) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill)) throw new Error(`Invalid skill name: ${skill}`);
  const evalRoot = resolve(repoRoot, ".skill-eval");
  const skillRoot = resolveInside(evalRoot, skill, "skill eval root");
  const suitePath = resolve(skillRoot, "suite.json");
  const suite = await readJson(suitePath);
  if (suite.schema_version !== 1 || suite.skill !== skill || !Array.isArray(suite.cases)) {
    throw new Error(`Invalid suite: ${suitePath}`);
  }

  const cases = [];
  for (const caseRef of suite.cases) {
    const casePath = resolveInside(skillRoot, caseRef, "case path");
    const canonicalCasePath = await realpath(casePath);
    if (!isWithin(await realpath(skillRoot), canonicalCasePath)) throw new Error(`Case path escapes through symlink: ${caseRef}`);
    const evalCase = validateCase(await readJson(casePath), { path: caseRef });
    if (evalCase.skill !== skill) throw new Error(`${caseRef} targets ${evalCase.skill}, expected ${skill}`);
    if (evalCase.fixture !== null) {
      const fixturePath = resolveInside(skillRoot, evalCase.fixture, `${evalCase.id}.fixture`);
      await access(fixturePath, constants.R_OK).catch(() => {
        throw new Error(`Missing fixture for ${evalCase.id}: ${fixturePath}`);
      });
      if (!isWithin(await realpath(skillRoot), await realpath(fixturePath))) {
        throw new Error(`Fixture path escapes through symlink: ${evalCase.fixture}`);
      }
    }
    for (const variant of evalCase.variants) resolveInside(repoRoot, variant.path, `${evalCase.id}.${variant.id}.path`);
    cases.push(Object.freeze({ ...evalCase, source_path: casePath }));
  }

  return Object.freeze({ repoRoot, evalRoot, skillRoot, suitePath, suite, cases });
}

export async function initSkillWorkspace({ root, skill }) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill)) throw new Error(`Invalid skill name: ${skill}`);
  const evalRoot = resolve(root, ".skill-eval");
  const skillRoot = resolveInside(evalRoot, skill, "skill eval root");
  const casePath = resolve(skillRoot, "cases", `${skill.toUpperCase().replaceAll("-", "-")}-001.json`);
  const suitePath = resolve(skillRoot, "suite.json");
  await mkdir(dirname(casePath), { recursive: true });

  const caseRef = relative(skillRoot, casePath).split(sep).join("/");
  const suite = {
    schema_version: 1,
    skill,
    profiles: { iterate: { selection: "first-required-failure", max_repeats: 1 }, acceptance: { required_only: true, max_repeats: 2 } },
    cases: [caseRef],
  };
  const evalCase = {
    schema_version: 1,
    id: `${skill.toUpperCase()}-001`,
    skill,
    title: "First pressure case",
    question: "conversational behavior",
    evidence_classes: ["explicit-instruction"],
    required_for_bootstrap: false,
    prompt: "Replace with a natural pressure prompt.",
    fixture: null,
    variants: [{ id: "candidate", kind: "working-tree", path: `skills/${skill}` }],
    execution: { host: "pi", mode: "json", tools: ["read"], timeout_ms: 120000 },
    assertions: [{ id: "behavior", type: "semantic", rubric: "Replace with fixed pre-run criteria." }],
  };

  await writeFile(suitePath, `${JSON.stringify(suite, null, 2)}\n`, { flag: "wx" });
  await writeFile(casePath, `${JSON.stringify(evalCase, null, 2)}\n`, { flag: "wx" });
  return { evalRoot, skillRoot, suitePath, casePath };
}

import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { assertNoSymlinkTree, isWithin } from "./path-policy.mjs";

export const EVIDENCE_CLASSES = new Set([
  "structure",
  "explicit-instruction",
  "native-activation",
  "artifact-outcome",
  "multi-turn",
  "cross-host",
]);

const VARIANT_KINDS = new Set(["working-tree", "git", "none"]);
const EVALUATION_KINDS = new Set(["single", "comparison"]);
const VARIANT_ROLES = new Set(["subject", "reference", "candidate"]);
const UNSUPPORTED_EVIDENCE_POLICIES = new Set(["block", "behavior-under-test"]);
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
const TURN_SCOPED_ASSERTION_TYPES = new Set([
  "skill_read",
  "skill_not_read",
  "path_exists",
  "changed_paths",
  "forbidden_changed_path",
  "path_unchanged",
  "line_count",
  "turn_text_contains",
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
  "json_field_in",
  "forbidden_text",
  "unsupported_evidence_class",
  "turn_text_contains",
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
  const hasPrompt = Object.hasOwn(value, "prompt");
  const hasTurns = Object.hasOwn(value, "turns");
  if (hasPrompt === hasTurns) throw new Error(`${path} must declare exactly one of prompt or turns`);
  if (hasPrompt) requireString(value.prompt, `${path}.prompt`, { allowEmpty: true });
  const turnIds = new Set();
  if (hasTurns) {
    if (!Array.isArray(value.turns) || value.turns.length === 0) throw new Error(`${path}.turns must be a non-empty array`);
    for (const turn of value.turns) {
      if (!turn || typeof turn !== "object" || Array.isArray(turn)) throw new Error(`${path}.turn must be an object`);
      requireString(turn.id, `${path}.turn.id`);
      requireString(turn.prompt, `${path}.${turn.id}.prompt`, { allowEmpty: true });
      if (turnIds.has(turn.id)) throw new Error(`${path} has duplicate turn id: ${turn.id}`);
      turnIds.add(turn.id);
    }
  }
  if (typeof value.required_for_bootstrap !== "boolean") throw new Error(`${path}.required_for_bootstrap must be boolean`);
  if (!EVALUATION_KINDS.has(value.evaluation_kind)) throw new Error(`${path} has unknown evaluation_kind: ${value.evaluation_kind}`);
  if (!UNSUPPORTED_EVIDENCE_POLICIES.has(value.unsupported_evidence)) throw new Error(`${path} has unknown unsupported_evidence policy: ${value.unsupported_evidence}`);
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
    if (!VARIANT_ROLES.has(variant.role)) throw new Error(`${path}.${variant.id} has unknown role: ${variant.role}`);
    requireString(variant.path, `${path}.${variant.id}.path`);
    if (variant.kind === "git") requireString(variant.revision, `${path}.${variant.id}.revision`);
    if (!Array.isArray(variant.resources) || variant.resources.length === 0) throw new Error(`${path}.${variant.id}.resources must not be empty`);
    if (new Set(variant.resources).size !== variant.resources.length) throw new Error(`${path}.${variant.id}.resources contains duplicates`);
    for (const resource of variant.resources) resolveInside("/subject", resource, `${path}.${variant.id}.resource`);
  }
  const expectedRoles = value.evaluation_kind === "single" ? ["subject"] : ["reference", "candidate"];
  const actualRoles = value.variants.map((variant) => variant.role);
  if (JSON.stringify(actualRoles) !== JSON.stringify(expectedRoles)) {
    throw new Error(`${path} ${value.evaluation_kind} variant roles must be ${expectedRoles.join(", ")}`);
  }
  if (!value.execution || !HOSTS.has(value.execution.host)) throw new Error(`${path} has unknown execution host`);
  if (value.execution.host === "pi" && !new Set(["json", "rpc-scripted"]).has(value.execution.mode)) throw new Error(`${path} Pi execution must use json or rpc-scripted mode`);
  if (value.execution.host === "pi" && value.execution.mode === "json" && !hasPrompt) throw new Error(`${path} Pi json execution requires prompt`);
  if (value.execution.host === "pi" && value.execution.mode === "rpc-scripted" && !hasTurns) throw new Error(`${path} Pi rpc-scripted execution requires turns`);
  if (value.execution.host === "none" && (value.execution.mode !== "deterministic" || !hasPrompt)) throw new Error(`${path} deterministic execution must use none host and prompt`);
  if (!Array.isArray(value.execution.tools)) throw new Error(`${path}.execution.tools must be an array`);
  if (value.execution.tools.includes("bash")) throw new Error(`${path} cannot expose unrestricted bash`);
  if (!Array.isArray(value.assertions) || value.assertions.length === 0) throw new Error(`${path}.assertions must not be empty`);
  const assertionIds = new Set();
  let semanticTurnScope = null;
  for (const assertion of value.assertions) {
    requireString(assertion.id, `${path}.assertion.id`);
    requireString(assertion.type, `${path}.${assertion.id}.type`);
    if (!ASSERTION_TYPES.has(assertion.type)) throw new Error(`${path} has unknown assertion type: ${assertion.type}`);
    if (assertionIds.has(assertion.id)) throw new Error(`${path} has duplicate assertion: ${assertion.id}`);
    assertionIds.add(assertion.id);
    if (assertion.type === "semantic") {
      requireString(assertion.rubric, `${path}.${assertion.id}.rubric`);
      if (value.execution.mode === "rpc-scripted") {
        if (!Array.isArray(assertion.turn_ids) || assertion.turn_ids.length === 0) throw new Error(`${path}.${assertion.id}.turn_ids must be a non-empty array`);
        if (new Set(assertion.turn_ids).size !== assertion.turn_ids.length) throw new Error(`${path}.${assertion.id}.turn_ids contains duplicates`);
        for (const turnId of assertion.turn_ids) {
          requireString(turnId, `${path}.${assertion.id}.turn_id`);
          if (!turnIds.has(turnId)) throw new Error(`${path}.${assertion.id}.turn_ids contains unknown turn id: ${turnId}`);
        }
        const scope = JSON.stringify(assertion.turn_ids);
        if (semanticTurnScope !== null && semanticTurnScope !== scope) throw new Error(`${path} semantic assertions must use the same ordered turn_ids`);
        semanticTurnScope = scope;
      } else if (assertion.turn_ids !== undefined) {
        throw new Error(`${path}.${assertion.id}.turn_ids is only valid for rpc-scripted execution`);
      }
    }
    if (assertion.type === "turn_text_contains") {
      if (assertion.turn_id === undefined) throw new Error(`${path}.${assertion.id} turn_text_contains requires turn_id`);
      const common = assertion.contains;
      const byRole = assertion.contains_by_role;
      if ((common === undefined) === (byRole === undefined)) throw new Error(`${path}.${assertion.id} must declare exactly one of contains or contains_by_role`);
      const validatePatterns = (patterns, label) => {
        if (!Array.isArray(patterns) || patterns.length === 0 || patterns.some((pattern) => typeof pattern !== "string" || pattern.length === 0)) throw new Error(`${label} must be a non-empty string array`);
      };
      if (common !== undefined) validatePatterns(common, `${path}.${assertion.id}.contains`);
      if (byRole !== undefined) {
        if (!byRole || typeof byRole !== "object" || Array.isArray(byRole)) throw new Error(`${path}.${assertion.id}.contains_by_role must be an object`);
        if (JSON.stringify(Object.keys(byRole).sort()) !== JSON.stringify([...expectedRoles].sort())) throw new Error(`${path}.${assertion.id}.contains_by_role must match variant roles`);
        for (const role of expectedRoles) validatePatterns(byRole[role], `${path}.${assertion.id}.contains_by_role.${role}`);
      }
      if (assertion.forbids !== undefined) validatePatterns(assertion.forbids, `${path}.${assertion.id}.forbids`);
      if (assertion.forbids_by_role !== undefined) {
        const forbidden = assertion.forbids_by_role;
        if (!forbidden || typeof forbidden !== "object" || Array.isArray(forbidden)) throw new Error(`${path}.${assertion.id}.forbids_by_role must be an object`);
        if (JSON.stringify(Object.keys(forbidden).sort()) !== JSON.stringify([...expectedRoles].sort())) throw new Error(`${path}.${assertion.id}.forbids_by_role must match variant roles`);
        for (const role of expectedRoles) validatePatterns(forbidden[role], `${path}.${assertion.id}.forbids_by_role.${role}`);
      }
    }
    if (assertion.type !== "semantic" && assertion.turn_id !== undefined) {
      requireString(assertion.turn_id, `${path}.${assertion.id}.turn_id`);
      if (value.execution.mode !== "rpc-scripted") throw new Error(`${path}.${assertion.id}.turn_id is only valid for rpc-scripted execution`);
      if (!TURN_SCOPED_ASSERTION_TYPES.has(assertion.type)) throw new Error(`${path}.${assertion.id} type ${assertion.type} does not support turn_id`);
      if (!turnIds.has(assertion.turn_id)) throw new Error(`${path}.${assertion.id}.turn_id names unknown turn id: ${assertion.turn_id}`);
    }
    if (new Set(["path_exists", "skill_frontmatter", "line_count", "path_unchanged", "file_contains", "json_field", "json_field_in", "forbidden_text"]).has(assertion.type)) {
      requireString(assertion.path, `${path}.${assertion.id}.path`);
      resolveInside("/owned", assertion.path, `${path}.${assertion.id}.path`);
    }
    if (assertion.type === "changed_paths" && !Array.isArray(assertion.equals)) throw new Error(`${path}.${assertion.id}.equals must be an array`);
    if (assertion.type === "line_count" && (!Number.isInteger(assertion.max) || assertion.max < 1)) throw new Error(`${path}.${assertion.id}.max must be positive`);
    if (assertion.type === "json_field_in" && (!Array.isArray(assertion.values) || assertion.values.length === 0)) throw new Error(`${path}.${assertion.id}.values must be a non-empty array`);
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
      await assertNoSymlinkTree(fixturePath, `${evalCase.id} fixture`);
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
    evaluation_kind: "single",
    unsupported_evidence: "block",
    prompt: "Replace with a natural pressure prompt.",
    fixture: null,
    variants: [{ id: "candidate", role: "subject", kind: "working-tree", path: `skills/${skill}`, resources: ["SKILL.md"] }],
    execution: { host: "pi", mode: "json", tools: ["read"] },
    assertions: [{ id: "behavior", type: "semantic", rubric: "Replace with fixed pre-run criteria." }],
  };

  await writeFile(suitePath, `${JSON.stringify(suite, null, 2)}\n`, { flag: "wx" });
  await writeFile(casePath, `${JSON.stringify(evalCase, null, 2)}\n`, { flag: "wx" });
  return { evalRoot, skillRoot, suitePath, casePath };
}

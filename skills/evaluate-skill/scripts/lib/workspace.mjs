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
const COMPOSITION_KINDS = new Set(["working-tree", "git"]);
const COMPOSITION_RUNTIME_PROFILES = new Set(["freeflow-kernel-workflow-v1"]);
const EVALUATION_KINDS = new Set(["single", "comparison"]);
const VARIANT_ROLES = new Set(["subject", "reference", "candidate"]);
const UNSUPPORTED_EVIDENCE_POLICIES = new Set(["block", "behavior-under-test"]);
const HOSTS = new Set(["pi", "none", "portable"]);
const PORTABLE_HOSTS = new Set(["pi", "codex"]);
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
  "component_read",
  "component_not_read",
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
  "component_read",
  "component_not_read",
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

function validateCompositionSource(source, label, { nameRequired = true } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error(`${label} must be an object`);
  if (nameRequired) {
    requireString(source.name, `${label}.name`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.name)) throw new Error(`${label}.name must be a skill name`);
  }
  if (!COMPOSITION_KINDS.has(source.kind)) throw new Error(`${label} has unknown component kind: ${source.kind}`);
  requireString(source.path, `${label}.path`);
  resolveInside("/composition", source.path, `${label}.path`);
  if (source.kind === "git") requireString(source.revision, `${label}.revision`);
  if (!Array.isArray(source.resources) || source.resources.length === 0) throw new Error(`${label}.resources must not be empty`);
  if (new Set(source.resources).size !== source.resources.length) throw new Error(`${label}.resources contains duplicates`);
  for (const resource of source.resources) resolveInside("/subject", resource, `${label}.resource`);
}

function validateFeasibility(feasibility, path) {
  if (!feasibility || typeof feasibility !== "object" || Array.isArray(feasibility)) throw new Error(`${path}.feasibility must be an object`);
  const allowed = new Set(["required_evidence_paths", "literal_requirements", "accepted_equivalences", "active_context_components", "active_context_skill", "expected_tool_round_trips", "fixture_oracle"]);
  for (const key of Object.keys(feasibility)) if (!allowed.has(key)) throw new Error(`${path}.feasibility has unknown field: ${key}`);
  const stringArray = (value, label, { paths = false } = {}) => {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) throw new Error(`${label} must be a non-empty string array`);
    if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
    if (paths) for (const item of value) resolveInside("/fixture", item, label);
  };
  if (feasibility.required_evidence_paths !== undefined) stringArray(feasibility.required_evidence_paths, `${path}.feasibility.required_evidence_paths`, { paths: true });
  if (feasibility.accepted_equivalences !== undefined) stringArray(feasibility.accepted_equivalences, `${path}.feasibility.accepted_equivalences`);
  if (feasibility.active_context_components !== undefined) stringArray(feasibility.active_context_components, `${path}.feasibility.active_context_components`);
  if (feasibility.active_context_skill !== undefined && typeof feasibility.active_context_skill !== "boolean") throw new Error(`${path}.feasibility.active_context_skill must be boolean`);
  if (feasibility.expected_tool_round_trips !== undefined && (!Number.isInteger(feasibility.expected_tool_round_trips) || feasibility.expected_tool_round_trips < 0)) throw new Error(`${path}.feasibility.expected_tool_round_trips must be a non-negative integer`);
  if (feasibility.literal_requirements !== undefined) {
    if (!Array.isArray(feasibility.literal_requirements) || feasibility.literal_requirements.length === 0) throw new Error(`${path}.feasibility.literal_requirements must be non-empty`);
    for (const [index, item] of feasibility.literal_requirements.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${path}.feasibility.literal_requirements[${index}] must be an object`);
      for (const key of Object.keys(item)) if (!["value", "source", "equivalence_class"].includes(key)) throw new Error(`${path}.feasibility.literal_requirements[${index}] has unknown field: ${key}`);
      requireString(item.value, `${path}.feasibility.literal_requirements[${index}].value`);
      requireString(item.source, `${path}.feasibility.literal_requirements[${index}].source`);
      if (item.source !== "prompt" && !item.source.startsWith("fixture:")) throw new Error(`${path}.feasibility.literal_requirements[${index}].source must be prompt or fixture:path`);
      if (item.source.startsWith("fixture:")) resolveInside("/fixture", item.source.slice("fixture:".length), `${path}.feasibility.literal_requirements[${index}].source`);
      if (item.equivalence_class !== undefined) requireString(item.equivalence_class, `${path}.feasibility.literal_requirements[${index}].equivalence_class`);
    }
  }
  if (feasibility.fixture_oracle !== undefined) {
    const oracle = feasibility.fixture_oracle;
    if (!oracle || typeof oracle !== "object" || Array.isArray(oracle)) throw new Error(`${path}.feasibility.fixture_oracle must be an object`);
    for (const key of Object.keys(oracle)) if (!["argv", "expected_exit", "stdout_contains"].includes(key)) throw new Error(`${path}.feasibility.fixture_oracle has unknown field: ${key}`);
    stringArray(oracle.argv, `${path}.feasibility.fixture_oracle.argv`);
    if (oracle.argv[0] !== "node") throw new Error(`${path}.feasibility.fixture_oracle executable must be node`);
    if (oracle.argv.length < 2) throw new Error(`${path}.feasibility.fixture_oracle requires a script path`);
    resolveInside("/fixture", oracle.argv[1], `${path}.feasibility.fixture_oracle script`);
    if (!Number.isInteger(oracle.expected_exit)) throw new Error(`${path}.feasibility.fixture_oracle.expected_exit must be an integer`);
    if (oracle.stdout_contains !== undefined) stringArray(oracle.stdout_contains, `${path}.feasibility.fixture_oracle.stdout_contains`);
  }
}

function validateComposition(composition, value, path) {
  if (!composition || typeof composition !== "object" || Array.isArray(composition)) throw new Error(`${path}.composition must be an object`);
  if (value.evaluation_kind !== "comparison") throw new Error(`${path} composition requires comparison evaluation_kind`);
  if (!Array.isArray(composition.base_stack) || composition.base_stack.length === 0) throw new Error(`${path}.composition.base_stack must not be empty`);
  requireString(composition.target_name, `${path}.composition.target_name`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(composition.target_name)) throw new Error(`${path}.composition.target_name must be a skill name`);
  const names = new Set();
  for (const component of composition.base_stack) {
    validateCompositionSource(component, `${path}.composition.base_stack component`);
    if (!component.resources.includes("SKILL.md")) throw new Error(`${path}.composition base component must declare SKILL.md: ${component.name}`);
    if (names.has(component.name)) throw new Error(`${path}.composition has duplicate component name: ${component.name}`);
    names.add(component.name);
  }
  if (names.has(composition.target_name)) throw new Error(`${path}.composition.target_name collides with base component: ${composition.target_name}`);
  if (composition.runtime !== undefined && composition.runtime !== null) {
    const runtime = composition.runtime;
    if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) throw new Error(`${path}.composition.runtime must be an object or null`);
    if (!COMPOSITION_RUNTIME_PROFILES.has(runtime.profile)) throw new Error(`${path}.composition has unknown runtime profile: ${runtime.profile}`);
    if (!COMPOSITION_KINDS.has(runtime.kind)) throw new Error(`${path}.composition.runtime has unknown component kind: ${runtime.kind}`);
    requireString(runtime.path, `${path}.composition.runtime.path`);
    resolveInside("/composition", runtime.path, `${path}.composition.runtime.path`);
    if (runtime.kind === "git") requireString(runtime.revision, `${path}.composition.runtime.revision`);
    for (const field of ["kernel", "workflow"]) {
      requireString(runtime[field], `${path}.composition.runtime.${field}`);
      resolveInside("/runtime", runtime[field], `${path}.composition.runtime.${field}`);
    }
    if (runtime.kernel === runtime.workflow) throw new Error(`${path}.composition runtime kernel and workflow must differ`);
  }
  for (const variant of value.variants) {
    if (!variant.resources.includes("SKILL.md")) throw new Error(`${path} composition target must declare SKILL.md: ${variant.id}`);
    if (variant.kind === "none") throw new Error(`${path} composition target variants cannot use kind none`);
    if (["composition", "base_stack", "runtime", "target_name"].some((key) => Object.hasOwn(variant, key))) {
      throw new Error(`${path}.${variant.id} mixes shared composition fields into a target variant`);
    }
  }
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
  if (value.feasibility !== undefined) validateFeasibility(value.feasibility, path);
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
  if (value.composition !== undefined) validateComposition(value.composition, value, path);
  if (value.feasibility?.active_context_components !== undefined) {
    if (value.composition === undefined) throw new Error(`${path}.feasibility.active_context_components requires composition`);
    const componentNames = new Set([...value.composition.base_stack.map((component) => component.name), value.composition.target_name]);
    for (const name of value.feasibility.active_context_components) if (!componentNames.has(name)) throw new Error(`${path}.feasibility.active_context_components names unknown component: ${name}`);
  }
  const expectedRoles = value.evaluation_kind === "single" ? ["subject"] : ["reference", "candidate"];
  const actualRoles = value.variants.map((variant) => variant.role);
  if (JSON.stringify(actualRoles) !== JSON.stringify(expectedRoles)) {
    throw new Error(`${path} ${value.evaluation_kind} variant roles must be ${expectedRoles.join(", ")}`);
  }
  if (!value.execution || !HOSTS.has(value.execution.host)) throw new Error(`${path} has unknown execution host`);
  if (value.execution.host === "portable") {
    if (value.execution.mode !== "one-shot" || !hasPrompt) throw new Error(`${path} portable execution requires one-shot mode and prompt`);
    if (!Array.isArray(value.execution.allowed_hosts) || value.execution.allowed_hosts.length === 0) throw new Error(`${path}.execution.allowed_hosts must be non-empty`);
    if (new Set(value.execution.allowed_hosts).size !== value.execution.allowed_hosts.length) throw new Error(`${path}.execution.allowed_hosts contains duplicate host`);
    for (const host of value.execution.allowed_hosts) if (!PORTABLE_HOSTS.has(host)) throw new Error(`${path}.execution.allowed_hosts contains unknown allowed host: ${host}`);
  } else if (value.execution.allowed_hosts !== undefined) {
    throw new Error(`${path}.execution.allowed_hosts is only valid for portable execution`);
  }
  if (value.execution.host === "pi" && !new Set(["json", "rpc-scripted"]).has(value.execution.mode)) throw new Error(`${path} Pi execution must use json or rpc-scripted mode`);
  if (value.execution.host === "pi" && value.execution.mode === "json" && !hasPrompt) throw new Error(`${path} Pi json execution requires prompt`);
  if (value.execution.host === "pi" && value.execution.mode === "rpc-scripted" && !hasTurns) throw new Error(`${path} Pi rpc-scripted execution requires turns`);
  if (value.composition !== undefined) {
    if (value.execution.host !== "pi") throw new Error(`${path} composition execution requires Pi`);
    if (value.execution.mode === "rpc-scripted" && (value.turns.length < 2 || value.turns.length > 4)) {
      throw new Error(`${path} composition rpc-scripted execution requires two to four turns`);
    }
  }
  if (value.execution.host === "none" && (value.execution.mode !== "deterministic" || !hasPrompt)) throw new Error(`${path} deterministic execution must use none host and prompt`);
  if (!Array.isArray(value.execution.tools)) throw new Error(`${path}.execution.tools must be an array`);
  if (value.execution.tools.includes("bash")) throw new Error(`${path} cannot expose unrestricted bash`);
  if (value.execution.host === "portable" && value.execution.allowed_hosts.includes("codex") && JSON.stringify(value.execution.tools) !== JSON.stringify(["read", "write"])) {
    throw new Error(`${path} portable Codex tools must be exactly read, write`);
  }
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
    if (assertion.type === "component_read" || assertion.type === "component_not_read") {
      requireString(assertion.component, `${path}.${assertion.id}.component`);
      if (value.composition === undefined) throw new Error(`${path}.${assertion.id} component assertions require composition`);
      const componentNames = new Set([...value.composition.base_stack.map((component) => component.name), value.composition.target_name]);
      if (!componentNames.has(assertion.component)) throw new Error(`${path}.${assertion.id} names unknown composition component: ${assertion.component}`);
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
    if (evalCase.composition !== undefined) {
      for (const component of evalCase.composition.base_stack) resolveInside(repoRoot, component.path, `${evalCase.id}.composition.${component.name}.path`);
      if (evalCase.composition.runtime) resolveInside(repoRoot, evalCase.composition.runtime.path, `${evalCase.id}.composition.runtime.path`);
    }
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

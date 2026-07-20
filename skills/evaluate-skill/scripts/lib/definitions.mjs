import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const EVALUATION_TYPES = new Set(["description", "body", "end-to-end"]);
const VARIANTS = ["baseline", "candidate"];

export class DefinitionError extends Error {
  constructor(code, message, definitionPath = null) {
    super(message);
    this.name = "DefinitionError";
    this.code = code;
    this.definitionPath = definitionPath;
  }
}

function fail(code, message, definitionPath) {
  throw new DefinitionError(code, message, definitionPath);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label, definitionPath) {
  if (!isPlainObject(value)) fail("invalid-definition", `${label} must be an object`, definitionPath);
  return value;
}

function requireExactKeys(value, required, optional, label, definitionPath) {
  const object = requireObject(value, label, definitionPath);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(object, key)) fail("invalid-definition", `${label} is missing ${key}`, definitionPath);
  }
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) fail("invalid-definition", `${label} contains unsupported field ${key}`, definitionPath);
  }
  return object;
}

function requireId(value, label, definitionPath) {
  if (typeof value !== "string" || value.length > 64 || !ID.test(value)) {
    fail(
      "invalid-definition",
      `${label} must start with a lowercase letter and use lowercase letters, numbers, or single hyphens up to 64 characters`,
      definitionPath,
    );
  }
  return value;
}

function requireString(value, label, definitionPath) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("invalid-definition", `${label} must be a non-empty string`, definitionPath);
  }
  return value;
}

function requireStringArray(value, label, definitionPath, { paths = false, unique = false } = {}) {
  if (!Array.isArray(value)) fail("invalid-definition", `${label} must be an array`, definitionPath);
  const seen = new Set();
  return value.map((entry, index) => {
    const string = requireString(entry, `${label}[${index}]`, definitionPath);
    if (paths) requireSafeRelativePath(string, `${label}[${index}]`, definitionPath);
    if (unique && seen.has(string)) {
      fail("invalid-definition", `${label} contains duplicate ${string}`, definitionPath);
    }
    seen.add(string);
    return string;
  });
}

function requireSafeRelativePath(value, label, definitionPath) {
  const string = requireString(value, label, definitionPath);
  const normalized = path.normalize(string);
  if (path.isAbsolute(string) || normalized === "." || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    fail("unsafe-path", `${label} must stay inside the definition root`, definitionPath);
  }
  return string;
}

function requireSuiteReference(value, label, definitionPath) {
  const string = requireString(value, label, definitionPath);
  if (path.isAbsolute(string) || path.normalize(string) === ".") {
    fail("unsafe-path", `${label} must be relative to the suite file`, definitionPath);
  }
  return string;
}

function validateInput(value, definitionPath) {
  const input = requireExactKeys(value, [], ["prompt", "turns"], "group.input", definitionPath);
  const hasPrompt = Object.hasOwn(input, "prompt");
  const hasTurns = Object.hasOwn(input, "turns");
  if (hasPrompt === hasTurns) {
    fail("invalid-definition", "group.input must contain exactly one of prompt or turns", definitionPath);
  }
  if (hasPrompt) requireString(input.prompt, "group.input.prompt", definitionPath);
  if (hasTurns) {
    const turns = requireStringArray(input.turns, "group.input.turns", definitionPath);
    if (turns.length === 0) fail("invalid-definition", "group.input.turns must not be empty", definitionPath);
  }
}

function validateSource(value, label, definitionPath) {
  const source = requireObject(value, label, definitionPath);
  if (source.kind === "working-tree") {
    requireExactKeys(source, ["kind"], [], label, definitionPath);
    return;
  }
  if (source.kind === "git") {
    requireExactKeys(source, ["kind", "ref"], [], label, definitionPath);
    requireString(source.ref, `${label}.ref`, definitionPath);
    return;
  }
  fail("invalid-definition", `${label}.kind must be working-tree or git`, definitionPath);
}

function validateEnvironment(value, label, definitionPath) {
  const environment = requireExactKeys(value, ["source", "skills", "target", "context"], [], label, definitionPath);
  validateSource(environment.source, `${label}.source`, definitionPath);
  const skills = requireStringArray(environment.skills, `${label}.skills`, definitionPath, { paths: true });
  requireStringArray(environment.context, `${label}.context`, definitionPath, { paths: true });
  if (
    environment.target !== null &&
    (!Number.isInteger(environment.target) || environment.target < 0 || environment.target >= skills.length)
  ) {
    fail("invalid-definition", `${label}.target must be null or an index into skills`, definitionPath);
  }
}

function validateExpectations(value, definitionPath) {
  if (!Array.isArray(value)) fail("invalid-definition", "group.expectations must be an array", definitionPath);
  const ids = new Set();
  for (const [index, entry] of value.entries()) {
    const expectation = requireObject(entry, `group.expectations[${index}]`, definitionPath);
    requireId(expectation.id, `group.expectations[${index}].id`, definitionPath);
    requireString(expectation.kind, `group.expectations[${index}].kind`, definitionPath);
    if (ids.has(expectation.id)) {
      fail("invalid-definition", `group.expectations contains duplicate ID ${expectation.id}`, definitionPath);
    }
    ids.add(expectation.id);
  }
}

function validateModel(value, definitionPath) {
  const model = requireExactKeys(value, ["model"], ["thinking"], "group.model", definitionPath);
  requireString(model.model, "group.model.model", definitionPath);
  if (Object.hasOwn(model, "thinking")) requireString(model.thinking, "group.model.thinking", definitionPath);
}

function validateGroup(value, definitionPath) {
  const group = requireExactKeys(
    value,
    [
      "schema_version",
      "kind",
      "id",
      "type",
      "input",
      "fixture",
      "tools",
      "variants",
      "expectations",
      "review_questions",
    ],
    ["model"],
    "group",
    definitionPath,
  );
  if (group.schema_version !== 1) fail("unsupported-schema", "group.schema_version must be 1", definitionPath);
  if (group.kind !== "group") fail("invalid-definition", "group.kind must be group", definitionPath);
  requireId(group.id, "group.id", definitionPath);
  if (!EVALUATION_TYPES.has(group.type)) {
    fail("invalid-definition", "group.type must be description, body, or end-to-end", definitionPath);
  }
  validateInput(group.input, definitionPath);
  if (group.fixture !== null) requireSafeRelativePath(group.fixture, "group.fixture", definitionPath);
  requireStringArray(group.tools, "group.tools", definitionPath, { unique: true });
  const variants = requireExactKeys(group.variants, VARIANTS, [], "group.variants", definitionPath);
  for (const variant of VARIANTS) validateEnvironment(variants[variant], `group.variants.${variant}`, definitionPath);
  if (variants.candidate.target === null) {
    fail(
      "invalid-definition",
      "group.variants.candidate.target must identify the candidate target skill",
      definitionPath,
    );
  }
  validateExpectations(group.expectations, definitionPath);
  requireStringArray(group.review_questions, "group.review_questions", definitionPath);
  if (Object.hasOwn(group, "model")) validateModel(group.model, definitionPath);
  return group;
}

function validateSuite(value, definitionPath) {
  const suite = requireExactKeys(value, ["schema_version", "kind", "id", "groups"], [], "suite", definitionPath);
  if (suite.schema_version !== 1) fail("unsupported-schema", "suite.schema_version must be 1", definitionPath);
  if (suite.kind !== "suite") fail("invalid-definition", "suite.kind must be suite", definitionPath);
  requireId(suite.id, "suite.id", definitionPath);
  const groups = requireStringArray(suite.groups, "suite.groups", definitionPath, { unique: true });
  for (const [index, reference] of groups.entries()) {
    requireSuiteReference(reference, `suite.groups[${index}]`, definitionPath);
  }
  if (groups.length === 0) fail("invalid-definition", "suite.groups must not be empty", definitionPath);
  return suite;
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function readJsonFile(file, root) {
  const lexicalFile = path.resolve(file);
  if (!isContained(root, lexicalFile)) fail("unsafe-path", `Definition escapes root: ${file}`, lexicalFile);

  let canonicalRoot;
  let canonicalFile;
  try {
    [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(lexicalFile)]);
  } catch {
    fail("unreadable-definition", `Cannot resolve definition: ${lexicalFile}`, lexicalFile);
  }
  if (!isContained(canonicalRoot, canonicalFile)) {
    fail("unsafe-path", `Definition symlink escapes root: ${lexicalFile}`, lexicalFile);
  }

  let contents;
  try {
    contents = await readFile(canonicalFile, "utf8");
  } catch {
    fail("unreadable-definition", `Cannot read definition: ${lexicalFile}`, lexicalFile);
  }
  try {
    return { value: JSON.parse(contents), file: lexicalFile };
  } catch {
    fail("invalid-json", `Definition is not valid JSON: ${lexicalFile}`, lexicalFile);
  }
}

export async function loadDefinition(file, { root = process.cwd() } = {}) {
  const definitionRoot = path.resolve(root);
  const loaded = await readJsonFile(file, definitionRoot);
  const object = requireObject(loaded.value, "definition", loaded.file);
  if (object.kind === "group") return validateGroup(object, loaded.file);
  if (object.kind !== "suite") fail("invalid-definition", "definition.kind must be group or suite", loaded.file);

  const suite = validateSuite(object, loaded.file);
  const groups = [];
  const ids = new Set();
  for (const reference of suite.groups) {
    const groupFile = path.resolve(path.dirname(loaded.file), reference);
    const groupLoaded = await readJsonFile(groupFile, definitionRoot);
    const group = validateGroup(groupLoaded.value, groupLoaded.file);
    if (ids.has(group.id)) fail("invalid-definition", `suite contains duplicate group ID ${group.id}`, loaded.file);
    ids.add(group.id);
    groups.push(group);
  }
  return { ...suite, groups };
}

function variantSelection(selected) {
  return {
    baseline: selected === null || selected === "baseline" ? "selected" : "not-selected",
    candidate: selected === null || selected === "candidate" ? "selected" : "not-selected",
  };
}

export function selectDefinition(definition, { group = null, variant = null } = {}) {
  if (variant !== null && !VARIANTS.includes(variant)) {
    fail("invalid-selector", "variant must be baseline or candidate", null);
  }
  if (definition.kind === "group" && group !== null) {
    fail("invalid-selector", "--group cannot be used with a direct group definition", null);
  }

  const available = definition.kind === "group" ? [definition] : definition.groups;
  let selected = available;
  if (group !== null) {
    const position = typeof group === "number" || /^\d+$/.test(group) ? Number(group) : null;
    selected =
      position === null ? available.filter((entry) => entry.id === group) : [available[position - 1]].filter(Boolean);
    if (selected.length === 0) fail("unknown-group", `Unknown group selector: ${group}`, null);
  }

  return {
    kind: "selection",
    definitionKind: definition.kind,
    id: definition.id,
    groups: selected.map((entry) => ({
      position: available.indexOf(entry) + 1,
      group: entry,
      variants: variantSelection(variant),
    })),
  };
}

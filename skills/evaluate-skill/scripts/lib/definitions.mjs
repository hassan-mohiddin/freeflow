import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const EVALUATION_TYPES = new Set(["description", "body"]);
const VARIANTS = ["baseline", "candidate"];
const EVALUATION_HOSTS = new Set(["pi"]);
const PROMPT_MODES = new Set(["isolated", "host"]);
export const COMMAND_TOOL = "run_command";
const MAX_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const RESERVED_ENVIRONMENT_KEYS = new Set([
  "PATH",
  "HOME",
  "PWD",
  "OLDPWD",
  "SHELL",
  "BASH_ENV",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PI_PACKAGE_DIR",
]);

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

function validateRuntime(value, definitionPath) {
  const runtime = requireExactKeys(
    value,
    ["host", "extensions", "environment", "session"],
    ["prompt"],
    "group.runtime",
    definitionPath,
  );
  if (!EVALUATION_HOSTS.has(runtime.host)) {
    fail("invalid-definition", "group.configuration.host.name must be pi", definitionPath);
  }
  if (Object.hasOwn(runtime, "prompt") && !PROMPT_MODES.has(runtime.prompt)) {
    fail("invalid-definition", "group.runtime.prompt must be isolated or host", definitionPath);
  }
  if (!Array.isArray(runtime.extensions)) {
    fail("invalid-definition", "group.runtime.extensions must be an array", definitionPath);
  }
  const bundleIds = new Set();
  for (const [index, entry] of runtime.extensions.entries()) {
    const bundle = requireExactKeys(
      entry,
      ["entry", "resources"],
      [],
      `group.runtime.extensions[${index}]`,
      definitionPath,
    );
    requireSafeRelativePath(bundle.entry, `group.runtime.extensions[${index}].entry`, definitionPath);
    const resources = requireStringArray(
      bundle.resources,
      `group.runtime.extensions[${index}].resources`,
      definitionPath,
      { paths: true, unique: true },
    );
    if (resources.length === 0) {
      fail("invalid-definition", `group.runtime.extensions[${index}].resources must not be empty`, definitionPath);
    }
    const bundleId = `${bundle.entry}\u0000${resources.join("\u0000")}`;
    if (bundleIds.has(bundleId)) {
      fail("invalid-definition", "group.runtime.extensions contains duplicate bundles", definitionPath);
    }
    bundleIds.add(bundleId);
  }
  if (typeof runtime.session !== "boolean") {
    fail("invalid-definition", "group.runtime.session must be a boolean", definitionPath);
  }
  const environment = requireExactKeys(
    runtime.environment,
    ["literal", "inherit"],
    [],
    "group.runtime.environment",
    definitionPath,
  );
  const literal = requireObject(environment.literal, "group.runtime.environment.literal", definitionPath);
  const inherited = requireStringArray(environment.inherit, "group.runtime.environment.inherit", definitionPath, {
    unique: true,
  });
  const literalKeys = new Set(Object.keys(literal).map((key) => key.toUpperCase()));
  for (const [key, value] of Object.entries(literal)) {
    const normalizedKey = key.toUpperCase();
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
      isBlockedEnvironmentKey(normalizedKey) ||
      /TOKEN|SECRET|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL/i.test(key)
    ) {
      fail(
        "invalid-definition",
        `group.runtime.environment.literal contains a reserved or secret-like key: ${key}`,
        definitionPath,
      );
    }
    if (typeof value !== "string") {
      fail("invalid-definition", `group.runtime.environment.literal.${key} must be a string`, definitionPath);
    }
  }
  for (const key of inherited) {
    const normalizedKey = key.toUpperCase();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || isBlockedEnvironmentKey(normalizedKey)) {
      fail("invalid-definition", `group.runtime.environment.inherit contains an invalid key: ${key}`, definitionPath);
    }
    if (literalKeys.has(normalizedKey)) {
      fail(
        "invalid-definition",
        `group.runtime.environment key is declared as both literal and inherited: ${key}`,
        definitionPath,
      );
    }
  }
}

function isBlockedEnvironmentKey(normalizedKey) {
  return (
    RESERVED_ENVIRONMENT_KEYS.has(normalizedKey) ||
    normalizedKey.startsWith("SKILL_EVAL_") ||
    normalizedKey.startsWith("PI_") ||
    normalizedKey.startsWith("LD_") ||
    normalizedKey.startsWith("DYLD_")
  );
}

// Fields each known expectation kind may declare. A field outside this set would be ignored by its grader,
// so it is rejected before any subject runs. Unknown kinds still surface afterward as grade errors.
const EXPECTATION_COMMON_FIELDS = ["id", "kind", "variant", "comparison", "turn", "expect"];
const EXPECTATION_FIELDS = new Map([
  ["skill-read", []],
  ["resource-read", ["resource", "index", "path"]],
  ["path", ["path"]],
  ["changed-paths", ["paths"]],
  ["file-text", ["path", "value", "line"]],
  ["json", ["path", "pointer", "value"]],
  ["response-text", ["value"]],
  ["context-text", ["value", "surface", "request"]],
  ["tool-call", ["tool", "argumentContains", "argumentNotContains"]],
]);

function validateExpectations(value, definitionPath) {
  if (!Array.isArray(value)) fail("invalid-definition", "group.expectations must be an array", definitionPath);
  const ids = new Set();
  for (const [index, entry] of value.entries()) {
    const expectation = requireObject(entry, `group.expectations[${index}]`, definitionPath);
    requireId(expectation.id, `group.expectations[${index}].id`, definitionPath);
    requireString(expectation.kind, `group.expectations[${index}].kind`, definitionPath);
    const kindFields = EXPECTATION_FIELDS.get(expectation.kind);
    if (kindFields) {
      const allowed = new Set([...EXPECTATION_COMMON_FIELDS, ...kindFields]);
      for (const key of Object.keys(expectation)) {
        if (!allowed.has(key)) {
          fail(
            "invalid-definition",
            `group.expectations[${index}] contains unsupported field ${key} for kind ${expectation.kind}`,
            definitionPath,
          );
        }
      }
    }
    if (ids.has(expectation.id)) {
      fail("invalid-definition", `group.expectations contains duplicate ID ${expectation.id}`, definitionPath);
    }
    ids.add(expectation.id);
  }
}

// Declared commands are fixed by the definition author; the subject may only choose which one runs.
function validateCommands(group, definitionPath) {
  const toolDeclared = group.tools.includes(COMMAND_TOOL);
  if (!Object.hasOwn(group, "commands")) {
    if (toolDeclared) fail("invalid-definition", `${COMMAND_TOOL} requires declared group.commands`, definitionPath);
    return;
  }
  if (!toolDeclared) fail("invalid-definition", `group.commands requires the ${COMMAND_TOOL} tool`, definitionPath);
  if (group.type !== "body")
    fail("invalid-definition", "group.commands are supported only by body groups", definitionPath);
  if (!Array.isArray(group.commands) || group.commands.length === 0) {
    fail("invalid-definition", "group.commands must be a non-empty array", definitionPath);
  }
  const ids = new Set();
  for (const [index, entry] of group.commands.entries()) {
    const label = `group.commands[${index}]`;
    const command = requireExactKeys(entry, ["id", "argv"], ["timeout_ms"], label, definitionPath);
    requireId(command.id, `${label}.id`, definitionPath);
    if (ids.has(command.id))
      fail("invalid-definition", `group.commands contains duplicate ID ${command.id}`, definitionPath);
    ids.add(command.id);
    const argv = requireStringArray(command.argv, `${label}.argv`, definitionPath);
    if (argv.length === 0) fail("invalid-definition", `${label}.argv must not be empty`, definitionPath);
    if (
      Object.hasOwn(command, "timeout_ms") &&
      (!Number.isInteger(command.timeout_ms) || command.timeout_ms < 1 || command.timeout_ms > MAX_COMMAND_TIMEOUT_MS)
    ) {
      fail(
        "invalid-definition",
        `${label}.timeout_ms must be an integer from 1 to ${MAX_COMMAND_TIMEOUT_MS}`,
        definitionPath,
      );
    }
  }
}

function validateModel(value, label, definitionPath) {
  const model = requireExactKeys(value, ["model"], ["thinking"], label, definitionPath);
  requireString(model.model, `${label}.model`, definitionPath);
  if (Object.hasOwn(model, "thinking")) requireString(model.thinking, `${label}.thinking`, definitionPath);
}

// Schema 2: a group is a task plus a configuration. Each arm overlays the shared configuration, and
// `component` names the only paths where the two effective configurations may differ.
const SCHEMA_1_MESSAGE =
  "schema 1 definitions are no longer supported; rewrite it as schema 2 (see the evaluation definition schema reference)";
const CONFIGURATION_FIELDS = ["host", "model", "subject", "freeflow", "runtime"];
// Arms may not differ here yet: runtime bundles are prepared once per group, and Pi is the only host.
const SHARED_ONLY = ["host", "runtime"];
const COMPONENT_PATH = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)*$/;

function rejectSchema1(value, label, definitionPath) {
  if (isPlainObject(value) && value.schema_version === 1)
    fail("unsupported-schema", `${label}: ${SCHEMA_1_MESSAGE}`, definitionPath);
}

/** Objects merge key by key; arrays, scalars and null replace. */
function merge(base, overlay) {
  if (!isPlainObject(base) || !isPlainObject(overlay)) return structuredClone(overlay);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = Object.hasOwn(result, key) ? merge(result[key], value) : structuredClone(value);
  }
  return result;
}

/** Leaf paths where two values differ; arrays and scalars are leaves. */
function differences(left, right, prefix = "") {
  if (isPlainObject(left) && isPlainObject(right)) {
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort()
      .flatMap((key) => differences(left[key], right[key], prefix === "" ? key : `${prefix}.${key}`));
  }
  return JSON.stringify(left) === JSON.stringify(right) ? [] : [prefix];
}

function validateSubject(value, label, definitionPath) {
  const subject = requireObject(value, label, definitionPath);
  if (subject.kind === "none") {
    requireExactKeys(subject, ["kind"], [], label, definitionPath);
    return { source: { kind: "working-tree" }, skills: [], target: null, context: [] };
  }
  if (subject.kind !== "skill") fail("invalid-definition", `${label}.kind must be skill or none`, definitionPath);
  const { kind: _kind, ...environment } = requireExactKeys(
    subject,
    ["kind", "source", "skills", "target", "context"],
    [],
    label,
    definitionPath,
  );
  validateEnvironment(environment, label, definitionPath);
  return environment;
}

function validateEffectiveConfiguration(value, label, definitionPath) {
  const configuration = requireExactKeys(
    value,
    ["host", "subject"],
    ["model", "freeflow", "runtime"],
    label,
    definitionPath,
  );
  const host = requireExactKeys(configuration.host, ["name"], ["version"], `${label}.host`, definitionPath);
  if (!EVALUATION_HOSTS.has(host.name))
    fail("invalid-definition", "group.configuration.host.name must be pi", definitionPath);
  if (Object.hasOwn(host, "version")) requireString(host.version, `${label}.host.version`, definitionPath);
  if (Object.hasOwn(configuration, "model")) validateModel(configuration.model, `${label}.model`, definitionPath);
  if (Object.hasOwn(configuration, "freeflow") && configuration.freeflow !== null) {
    fail("invalid-definition", `${label}.freeflow is not supported yet`, definitionPath);
  }
  const environment = validateSubject(configuration.subject, `${label}.subject`, definitionPath);
  let runtime;
  if (Object.hasOwn(configuration, "runtime") && configuration.runtime !== null) {
    runtime = { host: host.name, ...requireObject(configuration.runtime, `${label}.runtime`, definitionPath) };
    validateRuntime(runtime, definitionPath);
  }
  return { configuration, environment, runtime };
}

async function readConfigurationFile(reference, definitionPath, root) {
  requireSuiteReference(reference, "group.configuration.extends", definitionPath);
  const loaded = await readJsonFile(path.resolve(path.dirname(definitionPath), reference), root);
  rejectSchema1(loaded.value, "configuration", loaded.file);
  const shared = requireExactKeys(
    loaded.value,
    ["schema_version", "kind", "id", "configuration"],
    [],
    "configuration file",
    loaded.file,
  );
  if (shared.schema_version !== 2) fail("unsupported-schema", "configuration.schema_version must be 2", loaded.file);
  if (shared.kind !== "configuration")
    fail("invalid-definition", "configuration file kind must be configuration", loaded.file);
  requireId(shared.id, "configuration.id", loaded.file);
  const configuration = requireObject(shared.configuration, "configuration.configuration", loaded.file);
  for (const key of Object.keys(configuration)) {
    if (!CONFIGURATION_FIELDS.includes(key)) {
      fail("invalid-definition", `configuration.configuration contains unsupported field ${key}`, loaded.file);
    }
  }
  return configuration;
}

async function resolveArms(group, definitionPath, root) {
  const own = requireObject(group.configuration, "group.configuration", definitionPath);
  for (const key of Object.keys(own)) {
    if (key !== "extends" && !CONFIGURATION_FIELDS.includes(key)) {
      fail("invalid-definition", `group.configuration contains unsupported field ${key}`, definitionPath);
    }
  }
  const { extends: reference = null, ...fields } = own;
  const base = reference === null ? {} : await readConfigurationFile(reference, definitionPath, root);
  const shared = merge(base, fields);

  const arms = requireExactKeys(group.arms, VARIANTS, [], "group.arms", definitionPath);
  const resolved = {};
  for (const arm of VARIANTS) {
    const overlay = requireObject(arms[arm], `group.arms.${arm}`, definitionPath);
    for (const key of Object.keys(overlay)) {
      if (!CONFIGURATION_FIELDS.includes(key)) {
        fail("invalid-definition", `group.arms.${arm} contains unsupported field ${key}`, definitionPath);
      }
    }
    resolved[arm] = validateEffectiveConfiguration(merge(shared, overlay), `group.arms.${arm}`, definitionPath);
  }

  const component = requireStringArray(group.component, "group.component", definitionPath, { unique: true });
  for (const [index, entry] of component.entries()) {
    if (!COMPONENT_PATH.test(entry) || !CONFIGURATION_FIELDS.includes(entry.split(".")[0])) {
      fail("invalid-definition", `group.component[${index}] must be a path inside the configuration`, definitionPath);
    }
  }
  const differing = differences(resolved.baseline.configuration, resolved.candidate.configuration);
  const declares = (entry, difference) => difference === entry || difference.startsWith(`${entry}.`);
  for (const difference of differing) {
    if (SHARED_ONLY.includes(difference.split(".")[0])) {
      fail("unsupported-difference", `the arms differ in ${difference}, which both arms must share`, definitionPath);
    }
    if (!component.some((entry) => declares(entry, difference))) {
      fail(
        "undeclared-difference",
        `the arms differ in ${difference}, which group.component does not declare`,
        definitionPath,
      );
    }
  }
  for (const entry of component) {
    if (!differing.some((difference) => declares(entry, difference))) {
      fail(
        "undeclared-difference",
        `group.component declares ${entry}, but the arms do not differ there`,
        definitionPath,
      );
    }
  }
  return { resolved, component };
}

async function validateGroup(value, definitionPath, root) {
  rejectSchema1(value, "group", definitionPath);
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
      "configuration",
      "arms",
      "component",
      "expectations",
      "review_questions",
    ],
    ["commands", "revision"],
    "group",
    definitionPath,
  );
  if (group.schema_version !== 2) fail("unsupported-schema", "group.schema_version must be 2", definitionPath);
  if (group.kind !== "group") fail("invalid-definition", "group.kind must be group", definitionPath);
  requireId(group.id, "group.id", definitionPath);
  if (!EVALUATION_TYPES.has(group.type)) {
    fail("invalid-definition", "group.type must be description or body", definitionPath);
  }
  validateInput(group.input, definitionPath);
  if (group.fixture !== null) requireSafeRelativePath(group.fixture, "group.fixture", definitionPath);
  requireStringArray(group.tools, "group.tools", definitionPath, { unique: true });
  validateCommands(group, definitionPath);
  const { resolved, component } = await resolveArms(group, definitionPath, root);
  const variants = {
    baseline: { ...resolved.baseline.environment },
    candidate: { ...resolved.candidate.environment },
  };
  if (variants.candidate.target === null && variants.candidate.skills.length > 0) {
    fail(
      "invalid-definition",
      "group.arms.candidate.subject.target must identify the candidate target skill when candidate skills are declared",
      definitionPath,
    );
  }
  validateExpectations(group.expectations, definitionPath);
  requireStringArray(group.review_questions, "group.review_questions", definitionPath);
  if (Object.hasOwn(group, "revision")) {
    if (group.revision !== "description-only") {
      fail("invalid-definition", "group.revision must be description-only when declared", definitionPath);
    }
    if (group.type !== "description" || variants.baseline.target === null || variants.candidate.target === null) {
      fail(
        "invalid-definition",
        "a description-only revision needs a description group with a target skill in both arms",
        definitionPath,
      );
    }
  }
  if (group.expectations.length === 0 && group.review_questions.length === 0) {
    fail(
      "invalid-definition",
      "group must declare at least one expectation or review question; otherwise a run would observe nothing",
      definitionPath,
    );
  }

  // The runner works on the resolved arms: each variant carries its subject and model, and the shared
  // runtime (which may not differ between arms) is the group's.
  for (const arm of VARIANTS) {
    if (resolved[arm].configuration.model !== undefined) variants[arm].model = resolved[arm].configuration.model;
  }
  const internal = {
    ...group,
    configurations: { baseline: resolved.baseline.configuration, candidate: resolved.candidate.configuration },
    component,
    variants,
  };
  if (JSON.stringify(variants.baseline.model) === JSON.stringify(variants.candidate.model) && variants.baseline.model) {
    internal.model = variants.baseline.model;
  }
  if (resolved.baseline.runtime !== undefined) internal.runtime = resolved.baseline.runtime;
  return internal;
}

function validateSuite(value, definitionPath) {
  rejectSchema1(value, "suite", definitionPath);
  const suite = requireExactKeys(value, ["schema_version", "kind", "id", "groups"], [], "suite", definitionPath);
  if (suite.schema_version !== 2) fail("unsupported-schema", "suite.schema_version must be 2", definitionPath);
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
  if (object.kind === "group") return validateGroup(object, loaded.file, definitionRoot);
  if (object.kind !== "suite") fail("invalid-definition", "definition.kind must be group or suite", loaded.file);

  const suite = validateSuite(object, loaded.file);
  const groups = [];
  const ids = new Set();
  for (const reference of suite.groups) {
    const groupFile = path.resolve(path.dirname(loaded.file), reference);
    const groupLoaded = await readJsonFile(groupFile, definitionRoot);
    const group = await validateGroup(groupLoaded.value, groupLoaded.file, definitionRoot);
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

// Command graders: a `command` expectation runs an author-declared argv, such as hidden tests or a linter, on a
// copy of the subject's final workspace with grader files the subject never saw. The command runs as a post-run
// hook, before run.json is written, and its record lands under `postRun.commands.<expectation id>`; the grader
// then reads that record like any other run evidence. The workspace itself is never touched, so file graders
// still verify its hashes.

import { spawn } from "node:child_process";
import { cp, lstat, mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";

import { registerPostRunHook } from "./hooks.mjs";
import { processGroupExists, signalProcessTree, TERMINATION_GRACE_MS } from "./process.mjs";
import { completedCheck, isArm, isContained, isSafeRelativePath, unavailableCheck } from "./grade-support.mjs";

export const COMMAND_KIND = "command";
const DEFAULT_TIMEOUT_SECONDS = 600;
const MAX_TIMEOUT_SECONDS = 3600;
const TEST_FORMATS = new Set(["node-test", "tap", "junit"]);
// What a record keeps of each stream; the whole stdout (up to PARSE_LIMIT) is still parsed for test results.
const OUTPUT_TAIL_CHARACTERS = 20_000;
const PARSE_LIMIT_BYTES = 8 * 1024 * 1024;

/**
 * Why a command expectation's own fields are malformed, or null. Load-time validation and the grader share it,
 * so a definition that loads always grades.
 *
 * @returns {{ code: string, message: string } | null}
 */
export function commandExpectationProblem(expectation) {
  const invalid = (message) => ({ code: "invalid-definition", message });
  for (const field of ["turn", "expect"]) {
    if (Object.hasOwn(expectation, field))
      return invalid(`a command expectation grades the final work; ${field} is not supported`);
  }
  const { argv } = expectation;
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((entry) => typeof entry === "string" && entry !== "")) {
    return invalid("argv must be a non-empty array of non-empty strings");
  }
  if (Object.hasOwn(expectation, "files")) {
    const { files } = expectation;
    if (files === null || typeof files !== "object" || Array.isArray(files)) return invalid("files must be an object");
    for (const [destination, source] of Object.entries(files)) {
      if (!isSafeRelativePath(destination)) return invalid(`files destination must be a relative path: ${destination}`);
      if (typeof source !== "string" || !isSafeRelativePath(source)) {
        return { code: "unsafe-path", message: `files.${destination} must be a path inside the definition root` };
      }
    }
  }
  if (
    Object.hasOwn(expectation, "timeout_seconds") &&
    (!Number.isInteger(expectation.timeout_seconds) ||
      expectation.timeout_seconds < 1 ||
      expectation.timeout_seconds > MAX_TIMEOUT_SECONDS)
  ) {
    return invalid(`timeout_seconds must be an integer from 1 to ${MAX_TIMEOUT_SECONDS}`);
  }
  return passRuleProblem(expectation.pass);
}

function passRuleProblem(pass) {
  const invalid = (message) => ({ code: "invalid-definition", message });
  if (pass === null || typeof pass !== "object" || Array.isArray(pass)) return invalid("pass must be an object");
  const keys = Object.keys(pass);
  if (keys.length !== 1 || !["exit_code", "tests"].includes(keys[0])) {
    return invalid("pass must declare exactly one of exit_code or tests");
  }
  if (keys[0] === "exit_code") {
    return Number.isInteger(pass.exit_code) && pass.exit_code >= 0 && pass.exit_code <= 255
      ? null
      : invalid("pass.exit_code must be an integer from 0 to 255");
  }
  const tests = pass.tests;
  if (tests === null || typeof tests !== "object" || Array.isArray(tests))
    return invalid("pass.tests must be an object");
  for (const key of Object.keys(tests)) {
    if (!["format", "required", "report"].includes(key)) return invalid(`pass.tests contains unsupported field ${key}`);
  }
  if (!TEST_FORMATS.has(tests.format)) return invalid("pass.tests.format must be node-test, tap or junit");
  const required = tests.required;
  if (
    !Array.isArray(required) ||
    required.length === 0 ||
    !required.every((name) => typeof name === "string" && name.trim() !== "") ||
    new Set(required).size !== required.length
  ) {
    return invalid("pass.tests.required must be a non-empty array of unique test names");
  }
  if (Object.hasOwn(tests, "report")) {
    if (tests.format !== "junit") return invalid("pass.tests.report is only for the junit format");
    if (typeof tests.report !== "string" || !isSafeRelativePath(tests.report)) {
      return invalid("pass.tests.report must be a relative path in the command's workspace copy");
    }
  }
  return null;
}

/**
 * Validates every command expectation of a group at load time and returns the absolute grader files it reads, so
 * the run's committed-input check covers them. Sources resolve from the definition root, like the fixture, and
 * may not lie inside the fixture, which the subject sees.
 *
 * @param {any} group
 * @param {{ arms: string[], root: string, fail: (code: string, message: string) => never }} options
 * @returns {string[]}
 */
export function validateCommandExpectations(group, { arms, root, fail }) {
  const sources = [];
  const fixture = group.fixture === null ? null : path.resolve(root, group.fixture);
  for (const [index, expectation] of group.expectations.entries()) {
    if (expectation.kind !== COMMAND_KIND) continue;
    const label = `group.expectations[${index}]`;
    if (group.type !== "body") fail("invalid-definition", `${label}: command expectations need a body group`);
    if (!arms.includes(expectation.variant)) fail("invalid-definition", `${label}.variant must name one of group.arms`);
    const problem = commandExpectationProblem(expectation);
    if (problem !== null) fail(problem.code, `${label}: ${problem.message}`);
    for (const source of Object.values(expectation.files ?? {})) {
      const absolute = path.resolve(root, source);
      if (!isContained(root, absolute))
        fail("unsafe-path", `${label}.files source must stay inside the definition root`);
      if (fixture !== null && isContained(fixture, absolute)) {
        fail("invalid-definition", `${label}.files source ${source} is inside the fixture, which the subject sees`);
      }
      if (!sources.includes(absolute)) sources.push(absolute);
    }
  }
  return sources;
}

/** The expected predicate a command check records; comparisons require it to be the same in every arm. */
function expectedOf(expectation) {
  return {
    argv: expectation.argv,
    files: expectation.files ?? {},
    timeout_seconds: expectation.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS,
    pass: expectation.pass,
  };
}

/** Grades a command expectation from the record its post-run hook stored in the run. */
export async function gradeCommand(group, runs, expectation) {
  if (group.type !== "body" || !isArm(group, expectation.variant) || commandExpectationProblem(expectation) !== null) {
    return { error: "invalid command expectation" };
  }
  const expected = expectedOf(expectation);
  const run = runs[expectation.variant];
  if (!run || run.state !== "complete") return unavailableCheck(expectation, expected);
  const record = run.postRun?.commands?.[expectation.id];
  if (!record || record.started !== true) {
    return {
      ...unavailableCheck(expectation, expected),
      observed: { reason: record?.error ?? "the command recorded no result" },
    };
  }
  const outcome = {
    exitCode: record.exitCode,
    signal: record.signal,
    timedOut: record.timedOut,
    durationMs: record.durationMs,
  };
  if (Object.hasOwn(expectation.pass, "exit_code")) {
    const passed = record.timedOut !== true && record.exitCode === expectation.pass.exit_code;
    return completedCheck(expectation, expected, outcome, passed);
  }
  const results = Array.isArray(record.tests?.results) ? record.tests.results : [];
  const required = expectation.pass.tests.required.map((name) => ({ name, state: requiredState(results, name) }));
  const passed = required.filter((entry) => entry.state === "pass").length;
  return completedCheck(
    expectation,
    expected,
    {
      ...outcome,
      tests: { parsed: results.length, error: record.tests?.error ?? null, required },
      score: passed / required.length,
    },
    passed === required.length,
  );
}

/** A required name matches a test by its full name or its own name; it passes only when every match passed. */
function requiredState(results, name) {
  const matches = results.filter((result) => result.fullName === name || result.name === name);
  if (matches.length === 0) return "missing";
  return matches.every((result) => result.status === "pass") ? "pass" : "fail";
}

/**
 * Post-run hook: runs each command expectation of this arm on a copy of the final workspace. Returns undefined when
 * the arm has none, so its run.json gains nothing.
 */
export async function runCommandExpectations({ group, arm, run, root, directory, signal }) {
  const expectations = group.expectations.filter(
    (expectation) => expectation.kind === COMMAND_KIND && expectation.variant === arm,
  );
  if (expectations.length === 0) return undefined;
  const records = {};
  for (const expectation of expectations) {
    records[expectation.id] = await runCommandExpectation({ expectation, run, root, directory, signal });
  }
  return records;
}

/**
 * Runs one command expectation and returns its record: `{ started: false, error }` when it could not start,
 * otherwise exit code, signal, timeout, duration, output tails and parsed test results.
 */
export async function runCommandExpectation({ expectation, run, root, directory, signal }) {
  const notStarted = (error) => ({ started: false, error });
  if (run?.state !== "complete") return notStarted("the run did not complete");
  if (signal?.aborted) return notStarted("cancelled");
  if (typeof run.workspace !== "string" || !(await stat(run.workspace).catch(() => null))?.isDirectory()) {
    return notStarted("the run recorded no workspace");
  }
  const commandDirectory = path.join(directory, "commands", expectation.id);
  const copy = path.join(commandDirectory, "workspace");
  try {
    await rm(commandDirectory, { recursive: true, force: true });
    await mkdir(commandDirectory, { recursive: true });
    // The copy keeps symlinks as they are, so nothing outside the workspace is followed or copied.
    await cp(run.workspace, copy, { recursive: true, verbatimSymlinks: true });
    await copyGraderFiles(expectation.files ?? {}, root, copy);
  } catch (error) {
    return notStarted(`preparing the workspace copy failed: ${messageOf(error)}`);
  }

  const isolationRoot =
    typeof run.isolation?.root === "string" ? run.isolation.root : path.join(directory, "isolation");
  const environment = await commandEnvironment(isolationRoot, copy);
  const timeoutMs = (expectation.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
  let result;
  try {
    result = await runProcess(expectation.argv, { cwd: copy, environment, timeoutMs, signal });
  } catch (error) {
    return notStarted(`the command could not start: ${messageOf(error)}`);
  }
  const record = {
    started: true,
    argv: expectation.argv,
    directory: path.relative(directory, copy).split(path.sep).join("/"),
    files: Object.keys(expectation.files ?? {}),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    durationMs: result.durationMs,
    stdout: result.stdout.summary(),
    stderr: result.stderr.summary(),
    tests: null,
  };
  const tests = expectation.pass.tests;
  if (tests !== undefined) record.tests = await testResults(tests, result.stdout.text(), copy);
  return record;
}

async function copyGraderFiles(files, root, copy) {
  const canonicalRoot = await realpath(root);
  for (const [destination, source] of Object.entries(files)) {
    const canonicalSource = await realpath(path.resolve(root, source));
    if (!isContained(canonicalRoot, canonicalSource))
      throw new Error(`grader file escapes the definition root: ${source}`);
    // The subject controls the copy's contents: no existing component of the destination may be a symlink, so a
    // grader file can only land inside the copy.
    let current = copy;
    for (const part of destination.split("/")) {
      current = path.join(current, part);
      const entry = await lstat(current).catch(() => null);
      if (entry?.isSymbolicLink()) throw new Error(`grader file destination passes through a symlink: ${destination}`);
    }
    const target = path.join(copy, destination);
    await rm(target, { recursive: true, force: true });
    await mkdir(path.dirname(target), { recursive: true });
    await cp(canonicalSource, target, { recursive: true });
  }
}

/** The subject's base environment with HOME, temp, XDG and Pi directories inside the variant's isolation root. */
async function commandEnvironment(isolationRoot, cwd) {
  const home = path.join(isolationRoot, "home");
  const tmp = path.join(isolationRoot, "tmp");
  const agent = path.join(isolationRoot, "agent");
  for (const entry of [home, tmp, agent]) await mkdir(entry, { recursive: true });
  // Loaded here so definitions.mjs, which validates command expectations, stays free of the host modules.
  const { baseProcessEnvironment } = await import("./pi.mjs");
  return {
    ...baseProcessEnvironment(),
    PWD: cwd,
    HOME: home,
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    PI_CODING_AGENT_DIR: agent,
  };
}

/** Runs argv without a shell in its own process group; a timeout or cancellation stops the whole tree. */
function runProcess(argv, { cwd, environment, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env: environment,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error);
      return;
    }
    const stdout = captureStream(child.stdout);
    const stderr = captureStream(child.stderr);
    let timedOut = false;
    let cancelled = false;
    let forced = null;
    let settled = false;
    const stop = () => {
      signalProcessTree(child.pid, child, "SIGTERM");
      forced ??= setTimeout(() => signalProcessTree(child.pid, child, "SIGKILL"), TERMINATION_GRACE_MS);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    const onAbort = () => {
      cancelled = true;
      stop();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanUp = () => {
      clearTimeout(timer);
      clearTimeout(forced);
      signal?.removeEventListener("abort", onAbort);
    };
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanUp();
      reject(error);
    });
    child.once("close", (exitCode, exitSignal) => {
      if (settled) return;
      settled = true;
      cleanUp();
      // Anything the command left running in its process group is stopped too.
      if (processGroupExists(child.pid)) signalProcessTree(child.pid, child, "SIGKILL");
      resolve({
        exitCode,
        signal: exitSignal,
        timedOut,
        cancelled,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      });
    });
  });
}

/** Keeps the first PARSE_LIMIT_BYTES of a stream for parsing and its newest bytes for the recorded tail. */
function captureStream(stream) {
  const head = [];
  let headBytes = 0;
  let tail = Buffer.alloc(0);
  let bytes = 0;
  const tailBytes = OUTPUT_TAIL_CHARACTERS * 4;
  stream.on("data", (chunk) => {
    bytes += chunk.length;
    if (headBytes < PARSE_LIMIT_BYTES) {
      const kept = chunk.subarray(0, PARSE_LIMIT_BYTES - headBytes);
      head.push(kept);
      headBytes += kept.length;
    }
    tail = Buffer.concat([tail, chunk]);
    if (tail.length > tailBytes) tail = tail.subarray(tail.length - tailBytes);
  });
  return {
    text: () => Buffer.concat(head).toString("utf8"),
    summary() {
      const text = tail.toString("utf8");
      const kept = text.slice(-OUTPUT_TAIL_CHARACTERS);
      return { tail: kept, bytes, truncated: kept.length < text.length || tail.length < bytes };
    },
  };
}

async function testResults(tests, stdout, copy) {
  if (tests.format !== "junit") return { format: tests.format, results: parseTap(stdout), error: null };
  if (tests.report === undefined) return { format: "junit", results: parseJunit(stdout), error: null };
  const report = path.join(copy, tests.report);
  try {
    const canonical = await realpath(report);
    if (!isContained(await realpath(copy), canonical)) throw new Error("the report is outside the workspace copy");
    return {
      format: "junit",
      report: tests.report,
      results: parseJunit(await readFile(canonical, "utf8")),
      error: null,
    };
  } catch (error) {
    return {
      format: "junit",
      report: tests.report,
      results: [],
      error: `cannot read the JUnit report: ${messageOf(error)}`,
    };
  }
}

/**
 * Test results from TAP, including Node's test runner output: nested subtests are indented, announced by
 * `# Subtest: <name>` and reported after their children, so a nested test's full name joins its parents' with " > ".
 *
 * @returns {Array<{ name: string, fullName: string, status: "pass" | "fail" | "skip" | "todo" }>}
 */
export function parseTap(text) {
  const results = [];
  const names = [];
  let yamlIndent = null;
  for (const line of String(text).split(/\r?\n/)) {
    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    if (yamlIndent !== null) {
      if (content === "..." && indent <= yamlIndent) yamlIndent = null;
      continue;
    }
    if (content === "---") {
      yamlIndent = indent;
      continue;
    }
    const depth = Math.floor(indent / 4);
    const subtest = content.match(/^# Subtest: (.*)$/);
    if (subtest) {
      names.length = depth;
      names[depth] = subtest[1];
      continue;
    }
    const point = content.match(/^(not ok|ok)\b(?:\s+\d+)?(?:\s+-)?\s*(.*)$/);
    if (!point) continue;
    const { description, directive } = splitDirective(point[2]);
    const failed = point[1] === "not ok";
    let status = failed ? "fail" : "pass";
    if (/^skip\b/i.test(directive)) status = "skip";
    else if (/^todo\b/i.test(directive)) status = "todo";
    const parents = names.slice(0, depth).filter((name) => name !== undefined);
    results.push({ name: description, fullName: [...parents, description].join(" > "), status });
    names.length = depth;
  }
  return results;
}

// Splits a TAP description at its first unescaped "#", and unescapes "\#" and "\\".
function splitDirective(value) {
  let description = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && (value[index + 1] === "#" || value[index + 1] === "\\")) {
      description += value[index + 1];
      index += 1;
      continue;
    }
    if (character === "#") return { description: description.trim(), directive: value.slice(index + 1).trim() };
    description += character;
  }
  return { description: description.trim(), directive: "" };
}

/**
 * Test results from a JUnit XML report: each `<testcase>` passes unless it holds `<failure>` or `<error>`, and is
 * skipped when it holds `<skipped>`. Its full name is `<classname> > <name>` when it has a class name.
 */
export function parseJunit(text) {
  const results = [];
  const testcase = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase\s*>)/g;
  for (const match of String(text).matchAll(testcase)) {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attributes[attribute[1]] = decodeXml(attribute[2] ?? attribute[3]);
    }
    const name = attributes.name ?? "";
    const body = match[2] ?? "";
    let status = "pass";
    if (/<(failure|error)\b/.test(body)) status = "fail";
    else if (/<skipped\b/.test(body)) status = "skip";
    const classname = attributes.classname ?? "";
    results.push({ name, fullName: classname === "" ? name : `${classname} > ${name}`, status });
  }
  return results;
}

function decodeXml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[code.toLowerCase()];
    if (named !== undefined) return named;
    const point =
      code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
  });
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

registerPostRunHook("commands", runCommandExpectations);

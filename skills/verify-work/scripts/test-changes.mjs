#!/usr/bin/env node
// Lists every existing test file, fixture, snapshot and shared test setup file that changed, moved or was deleted
// between a base and a head, with the changed hunks. It only lists; whether a change is justified is a judgment for
// the agent and the user (references/test-design.md). A file that does not exist at the base is a new test, not a
// changed one, and is not listed; --new lists those instead (added, copied, or untracked in the working tree).
// Usage: test-changes.mjs --base <ref> [--head <ref>] [--root <repository>] [--pattern <glob>]... [--only]
//                         [--exclude <glob>]... [--new] [--json]
// Without --head, the head is the working tree, staged and unstaged. Exit code 0 when it lists (even nothing),
// 2 on a usage or Git error.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const USAGE =
  "Usage: test-changes.mjs --base <ref> [--head <ref>] [--root <repository>] [--pattern <glob>]... [--only] [--exclude <glob>]... [--new] [--json]";

// Common layouts for JavaScript, TypeScript, Python, Go, Ruby, Java, Kotlin, C#, Swift, C and C++, PHP, Elixir and
// Dart. Matching is case-sensitive, so capitalised folders such as Swift's Tests/ are listed separately. --pattern adds
// to these; --only replaces them.
const DEFAULT_PATTERNS = [
  "**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
  "**/{test,tests,__tests__,spec,e2e,Tests}/**",
  "**/*.{Tests,UnitTests,IntegrationTests}/**",
  "**/src/*Test/**",
  "**/*_test.{go,dart,exs}",
  "**/*_{test,unittest}.{c,cc,cpp,cxx}",
  "**/*_spec.rb",
  "**/*{Test,Tests}.{java,kt,cs,swift,php}",
  "**/test_*.py",
  "**/*_test.py",
  "**/conftest.py",
  "**/{fixtures,__fixtures__,testdata,__mocks__}/**",
  "**/__snapshots__/**",
  "**/*.snap",
  "**/{jest,vitest,playwright,cypress,karma}.config.*",
  "**/vitest.workspace.*",
  "**/{jest.setup,setupTests,setup-tests,test-setup,vitest.setup}.*",
  "**/*.setup.{js,mjs,cjs,ts,mts,cts}",
  "**/.mocharc*",
  "**/{pytest.ini,tox.ini,noxfile.py}",
  "**/{spec_helper,rails_helper}.rb",
  "**/.rspec",
  "**/phpunit.xml*",
  "**/test_helper.exs",
];

// The first matching kind wins, so a snapshot under tests/ is a snapshot and a fixture under tests/ is a fixture.
const KINDS = [
  ["snapshot", ["**/__snapshots__/**", "**/*.snap"]],
  [
    "setup",
    [
      "**/conftest.py",
      "**/{jest,vitest,playwright,cypress,karma}.config.*",
      "**/vitest.workspace.*",
      "**/{jest.setup,setupTests,setup-tests,test-setup,vitest.setup}.*",
      "**/.mocharc*",
      "**/{pytest.ini,tox.ini,noxfile.py}",
      "**/*.setup.{js,mjs,cjs,ts,mts,cts}",
      "**/{spec_helper,rails_helper}.rb",
      "**/.rspec",
      "**/phpunit.xml*",
      "**/test_helper.exs",
    ],
  ],
  ["fixture", ["**/{fixtures,__fixtures__,testdata,__mocks__}/**"]],
];

const STATUS = { M: "modified", D: "deleted", R: "renamed", T: "type-changed" };

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    options: {
      base: { type: "string" },
      head: { type: "string" },
      root: { type: "string" },
      pattern: { type: "string", multiple: true, default: [] },
      only: { type: "boolean", default: false },
      exclude: { type: "string", multiple: true, default: [] },
      new: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values } = parsed;
if (!values.base) fail(USAGE);
if (values.only && !values.pattern.length) fail(`--only needs at least one --pattern\n${USAGE}`);

// Glob to RegExp over repository-relative paths with "/" separators: "**/" is zero or more directories, "**" anything,
// "*" anything within one segment, "?" one character, and "{a,b}" either alternative.
function globToRegExp(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      const slash = glob[index + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "{") {
      const end = glob.indexOf("}", index);
      if (end === -1) source += "\\{";
      else {
        source += `(?:${glob
          .slice(index + 1, end)
          .split(",")
          .map((part) => globToRegExp(part).source.slice(1, -1))
          .join("|")})`;
        index = end;
      }
    } else source += /[.+^$()|[\]\\]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`^${source}$`);
}
const matcher = (globs) => {
  const expressions = globs.map(globToRegExp);
  return (path) => expressions.some((expression) => expression.test(path));
};

const patterns = values.only ? values.pattern : [...DEFAULT_PATTERNS, ...values.pattern];
const included = matcher(patterns);
const excluded = matcher(values.exclude);
const kindMatchers = KINDS.map(([kind, globs]) => [kind, matcher(globs)]);
const kindOf = (path) => kindMatchers.find(([, matches]) => matches(path))?.[0] ?? "test";

const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const gitOrFail = (cwd, args, what) => {
  try {
    return git(cwd, args);
  } catch (error) {
    fail(`${what}: ${String(error.stderr || error.message).trim()}`);
  }
};

const root = resolve(
  gitOrFail(resolve(values.root ?? "."), ["rev-parse", "--show-toplevel"], "not inside a Git repository").trim(),
);
const commitOf = (ref) => {
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
  } catch {
    fail(`no such commit: ${ref}`);
  }
};
const base = { ref: values.base, commit: commitOf(values.base) };
const head = values.head ? { ref: values.head, commit: commitOf(values.head) } : { ref: "working tree", commit: null };

// Fixed flags so the user's Git configuration (colour, external diff tools, prefixes, rename limits) cannot change
// what is listed or how hunks read.
const DIFF = [
  "-c",
  "core.quotePath=false",
  "diff",
  "--no-color",
  "--no-ext-diff",
  "--no-textconv",
  "--no-relative",
  "-M",
];
const range = head.commit ? [base.commit, head.commit] : [base.commit];

const fields = gitOrFail(root, [...DIFF, "--name-status", "-z", ...range], "git diff failed").split("\0");
const changes = [];
const added = [];
for (let index = 0; index < fields.length - 1;) {
  const code = fields[index][0];
  const paths = code === "R" || code === "C" ? [fields[index + 1], fields[index + 2]] : [fields[index + 1]];
  index += 1 + paths.length;
  const status = STATUS[code];
  const [path] = paths;
  if ((code === "A" || code === "C") && included(paths.at(-1)) && !excluded(paths.at(-1))) added.push(paths.at(-1));
  // Only files that existed at the base: added and copied files are new.
  if (!status || !included(path) || excluded(path)) continue;
  const diff = gitOrFail(
    root,
    [...DIFF, "--unified=3", "--src-prefix=a/", "--dst-prefix=b/", ...range, "--", ...paths],
    `git diff failed for ${path}`,
  );
  const lines = diff.split("\n");
  const start = lines.findIndex((line) => line.startsWith("@@") || line.startsWith("Binary files"));
  const body = start === -1 ? [] : lines.slice(start);
  changes.push({
    status,
    path,
    ...(status === "renamed" ? { to: paths[1] } : {}),
    kind: kindOf(path),
    added: body.filter((line) => line.startsWith("+")).length,
    removed: body.filter((line) => line.startsWith("-")).length,
    binary: body[0]?.startsWith("Binary files") ?? false,
    // A deleted file's hunks are its whole content; the path and line count say what went.
    hunks: status === "deleted" ? null : body.join("\n").trimEnd(),
  });
}

// New test files, for a check that each one fails on the base: committed additions, plus untracked files when the head
// is the working tree.
if (values.new) {
  if (!head.commit)
    for (const path of gitOrFail(root, ["ls-files", "-z", "--others", "--exclude-standard"], "git ls-files failed")
      .split("\0")
      .filter(Boolean))
      if (included(path) && !excluded(path)) added.push(path);
  const tests = [...new Set(added)].sort().map((path) => ({ status: "added", path, kind: kindOf(path) }));
  if (values.json)
    console.log(
      JSON.stringify(
        { command: "test-changes", mode: "new", root, base, head, patterns, exclude: values.exclude, tests },
        null,
        2,
      ),
    );
  else if (!tests.length) console.log(`No new test, fixture, snapshot or test setup file since ${base.ref}.`);
  else {
    console.log(`${tests.length} new test, fixture, snapshot or test setup file(s) since ${base.ref}:`);
    for (const each of tests) console.log(`added ${each.kind} ${each.path}`);
  }
} else if (values.json) {
  console.log(
    JSON.stringify({ command: "test-changes", root, base, head, patterns, exclude: values.exclude, changes }, null, 2),
  );
} else {
  const against = `${base.ref} (${base.commit.slice(0, 12)})`;
  const to = head.commit ? `${head.ref} (${head.commit.slice(0, 12)})` : head.ref;
  if (!changes.length)
    console.log(`No existing test, fixture, snapshot or test setup file changed between ${against} and ${to}.`);
  else {
    console.log(
      `${changes.length} existing test, fixture, snapshot or test setup file${changes.length === 1 ? "" : "s"} changed between ${against} and ${to}:\n`,
    );
    for (const change of changes) {
      const name = change.to ? `${change.path} -> ${change.to}` : change.path;
      console.log(`${change.status} ${change.kind} ${name} (+${change.added} -${change.removed})`);
      if (change.hunks) console.log(`${change.hunks}\n`);
    }
  }
}

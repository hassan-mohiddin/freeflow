// Source and plan checks: online lookups (run here against recorded answers, never the network), the read-range check
// for code citations, the plan lock anchored in git, and the plan's stop-rule and size checks. Each has a case that
// must fail.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { skeleton, validate } from "../../../skills/research-work/scripts/lib/formats.mjs";
import { arxivRecord, lookupRow, pinIdentifier } from "../../../skills/research-work/scripts/lib/lookup.mjs";
import { readsFromTranscript, readsInCommand, wasRead } from "../../../skills/research-work/scripts/lib/reads.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
const folder = () => mkdtempSync(join(tmpdir(), "research-source-checks-"));

const BROWN = {
  title: ["Interval Estimation for a Binomial Proportion"],
  author: [{ family: "Brown" }, { family: "Cai" }, { family: "DasGupta" }],
  issued: { "date-parts": [[2001]] },
  "container-title": ["Statistical Science"],
  type: "journal-article",
};

/** A stand-in for httpGet that answers from a table of URL prefixes, recording each URL asked. */
function recorded(answers) {
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    for (const [prefix, answer] of answers)
      if (url.startsWith(prefix)) return typeof answer === "function" ? answer() : answer;
    return { status: 404, body: "", error: null };
  };
  return { get, asked };
}

test("a DOI that resolves to the work the Source names is verified, and a retraction notice is listed", async () => {
  const { get } = recorded([
    ["https://api.crossref.org/works/", { status: 200, body: JSON.stringify({ message: BROWN }) }],
    [
      "https://api.crossref.org/works?filter=updates:",
      {
        status: 200,
        body: JSON.stringify({
          message: {
            items: [
              { DOI: "10.9/ret", title: ["Retraction"], "update-to": [{ DOI: "10.1214/ss/1", type: "retraction" }] },
            ],
          },
        }),
      },
    ],
  ]);
  const found = await lookupRow({ ID: "S1", Source: "Brown, Cai and DasGupta 2001", Pin: "doi:10.1214/ss/1" }, get);
  assert.equal(found.lookup, "verified");
  assert.match(found.detail, /author and year/);
  assert.deepEqual(
    found.notices.map((notice) => notice.type),
    ["retraction"],
  );
});

test("only an identifier that resolves to another work refutes; nothing found, or a partial match, is unresolved", async () => {
  const crossref = recorded([
    ["https://api.crossref.org/works/", { status: 200, body: JSON.stringify({ message: BROWN }) }],
  ]);
  const other = await lookupRow(
    { ID: "S2", Source: "Smith 1999, A study of cats", Pin: "doi:10.1214/ss/1" },
    crossref.get,
  );
  assert.equal(other.lookup, "refuted");
  const partial = await lookupRow({ ID: "S3", Source: "Brown 1987, on cats", Pin: "doi:10.1214/ss/1" }, crossref.get);
  assert.equal(partial.lookup, "unresolved");
  assert.match(partial.detail, /compare them by hand/);
  const missing = await lookupRow({ ID: "S4", Source: "x", Pin: "doi:10.0/none" }, recorded([]).get);
  assert.equal(missing.lookup, "unresolved");
  const none = await lookupRow({ ID: "S5", Source: "codex", Pin: "codex@1a2b3c4d" }, recorded([]).get);
  assert.equal(none.lookup, null);
});

test("arXiv entries and URLs are looked up, and a busy service is asked once more", async () => {
  const xml =
    "<feed><entry><title>Judging LLM-as-a-Judge with MT-Bench</title><published>2023-06-09T00:00:00Z</published><author><name>Lianmin Zheng</name></author></entry></feed>";
  assert.deepEqual(arxivRecord(xml).authors, ["Zheng"]);
  let calls = 0;
  const busy = recorded([
    ["https://export.arxiv.org/", () => (++calls === 1 ? { status: 429, body: "" } : { status: 200, body: xml })],
  ]);
  const paper = await lookupRow({ ID: "S1", Source: "Zheng et al. 2023", Pin: "arXiv:2306.05685" }, busy.get);
  assert.equal(paper.lookup, "verified");
  assert.equal(busy.asked.length, 2);
  const gone = await lookupRow(
    { ID: "S2", Source: "a page", Pin: "https://example.org/x (accessed 2026-10-27)" },
    recorded([]).get,
  );
  assert.equal(gone.lookup, "unresolved");
  assert.deepEqual(pinIdentifier("https://doi.org/10.1/abc"), { kind: "doi", value: "10.1/abc" });
});

test("lookup answers from its cache, says so, and exits non-zero when a row's Lookup should change", () => {
  const dir = folder();
  writeFileSync(
    join(dir, "sources.md"),
    "# Source Ledger: S\n\n| ID | Source | Pin | Lookup | Checked | Read | Supports |\n| --- | --- | --- | --- | --- | --- | --- |\n| S1 | Brown, Cai and DasGupta 2001 | doi:10.1214/ss/1 | not-looked-up | opened | full | coverage |\n",
  );
  const result = {
    id: "S1",
    kind: "doi",
    value: "10.1214/ss/1",
    lookup: "verified",
    detail: "matches by author and year",
    notices: [],
  };
  writeFileSync(
    join(dir, "lookups.json"),
    JSON.stringify({
      "doi:10.1214/ss/1\u0000Brown, Cai and DasGupta 2001": { at: "2026-10-27T00:00:00Z", result },
    }),
  );
  const run = node("sources.mjs", "lookup", join(dir, "sources.md"), "--cache", join(dir, "lookups.json"));
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stdout, /S1: verified \(Lookup now not-looked-up\): matches by author and year \[cached 2026-10-27/);
});

/** A one-file repository with a pinned commit, and a ledger pinning it as S1. */
function repoFolder() {
  const dir = folder();
  const clone = join(dir, "codex");
  mkdirSync(join(clone, "src"), { recursive: true });
  writeFileSync(
    join(clone, "src", "turn.rs"),
    Array.from({ length: 40 }, (_, at) => `line ${at + 1}`).join("\n") + "\n",
  );
  const git = (...args) => execFileSync("git", ["-C", clone, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("-c", "user.name=T", "-c", "user.email=t@t", "add", ".");
  git("-c", "user.name=T", "-c", "user.email=t@t", "commit", "-q", "-m", "x");
  const commit = git("rev-parse", "HEAD");
  writeFileSync(
    join(dir, "sources.md"),
    `# Source Ledger: S\n\n| ID | Source | Pin | Lookup | Checked | Read | Supports |\n| --- | --- | --- | --- | --- | --- | --- |\n| S1 | codex | codex@${commit} | verified | repository-read | partial | turns |\n`,
  );
  return { dir, clone, commit };
}

test("a code citation must fall in a range the worker read, and reads come from its transcript", () => {
  const { dir, clone, commit } = repoFolder();
  assert.deepEqual(readsInCommand(`sed -n '10,20p' ${clone}/src/turn.rs | cat`), [
    { path: `${clone}/src/turn.rs`, start: 10, end: 20 },
  ]);
  const transcript = [
    {
      message: {
        content: [
          { type: "tool_use", name: "Read", input: { file_path: join(clone, "src/turn.rs"), offset: 1, limit: 15 } },
        ],
      },
    },
    {
      message: {
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: { command: `git -C ${clone} show ${commit.slice(0, 8)}:README.md` },
          },
        ],
      },
    },
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n");
  writeFileSync(join(dir, "transcript.jsonl"), transcript);
  const made = node(
    "sources.mjs",
    "reads",
    join(dir, "transcript.jsonl"),
    "--ledger",
    join(dir, "sources.md"),
    "--repo",
    `codex=${clone}`,
    "--out",
    join(dir, "reads.jsonl"),
  );
  assert.equal(made.status, 0, made.stderr);
  const reads = readFileSync(join(dir, "reads.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(reads[0], { source: "S1", path: "src/turn.rs", start: 1, end: 15 });
  assert.equal(reads[1].path, "README.md");
  assert.ok(wasRead(reads, { source: "S1", path: "src/turn.rs", start: 10, end: 12 }));
  assert.ok(!wasRead(reads, { source: "S1", path: "src/turn.rs", start: 30, end: 31 }));
  writeFileSync(join(dir, "report.md"), "Turns start at S1:src/turn.rs:10-12, and end at S1:src/turn.rs:30-31.\n");
  const checked = node(
    "sources.mjs",
    "cite-check",
    join(dir, "report.md"),
    "--ledger",
    join(dir, "sources.md"),
    "--repo",
    `codex=${clone}`,
    "--reads",
    join(dir, "reads.jsonl"),
  );
  assert.equal(checked.status, 1);
  assert.match(checked.stdout, /1 ok, 1 failed/);
  assert.match(checked.stdout, /no recorded read covers src\/turn\.rs:30-31/);
  const without = node(
    "sources.mjs",
    "cite-check",
    join(dir, "report.md"),
    "--ledger",
    join(dir, "sources.md"),
    "--repo",
    `codex=${clone}`,
  );
  assert.match(without.stdout, /read ranges: not checked/);
  assert.deepEqual(readsFromTranscript("not json\n", { clones: new Map(), pins: new Map() }), []);
});

/** A git repository holding a filled study plan at its root, committed. */
function planRepo() {
  const dir = folder();
  const git = (...args) =>
    execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  const text = skeleton("study-plan", { title: "Two prompts", owner: "O", rigor: "check" })
    .replaceAll("<the answer, before any data>", "Answered before any data.")
    .replace(/<the prediction: [^>]*>/, "One task per arm; power mcnemar-cases sized it.")
    .replace(
      "| C1 | <what the study tests> | confirmatory | <the primary metric> | <the rule that decides it> |",
      "| C1 | Prompt b passes more tasks | confirmatory | pass rate | exact McNemar, two-sided p < 0.05 |",
    )
    .replace("| <unit> | <arm> | <trials> |", "| t1 | a | 1 |\n| t1 | b | 1 |");
  writeFileSync(join(dir, "plan.md"), text);
  git("add", "plan.md");
  git("commit", "-q", "-m", "plan");
  return { dir, git, plan: join(dir, "plan.md") };
}

test("a lock on a committed plan names its commit, and check refuses a commit not in HEAD's history", () => {
  const { git, plan } = planRepo();
  const locked = node("study.mjs", "lock", plan, "--by", "O");
  assert.equal(locked.status, 0, locked.stderr);
  assert.match(locked.stdout, /anchored in git at [0-9a-f]{12} \(plan\.md\)/);
  const check = node("study.mjs", "check", plan);
  assert.doesNotMatch(check.stdout, /anchored|commit/, check.stdout);
  // Replace the history: the anchored commit is no longer behind HEAD.
  git("checkout", "-q", "--orphan", "rewritten");
  git("commit", "-q", "-m", "rewritten");
  assert.match(node("study.mjs", "check", plan).stdout, /lock: its commit [0-9a-f]{12} is not in HEAD's history/);
});

test("a lock on a plan git does not track says it is not anchored", () => {
  const dir = folder();
  const { plan } = planRepo();
  writeFileSync(join(dir, "plan.md"), readFileSync(plan, "utf8"));
  const locked = node("study.mjs", "lock", join(dir, "plan.md"), "--by", "O");
  assert.equal(locked.status, 0, locked.stderr);
  assert.match(locked.stdout, /not anchored in git: the plan is not in a git repository/);
  assert.match(node("study.mjs", "check", join(dir, "plan.md")).stdout, /note: lock is not anchored in git/);
});

test("a plan that stops when a result turns significant, or a comparison without its size, is refused", () => {
  const { plan } = planRepo();
  const text = readFileSync(plan, "utf8");
  const stopping = text.replace(
    "## 10. The interval\n\nAnswered before any data.",
    "## 10. The interval\n\nWe stop collecting once the difference is significant.",
  );
  assert.ok(
    validate("study-plan", stopping).problems.some((problem) =>
      problem.includes("stops when a result turns significant"),
    ),
  );
  const sequential = stopping.replace(
    "is significant.",
    "is significant, by a group sequential design with alpha spending.",
  );
  assert.ok(!validate("study-plan", sequential).problems.some((problem) => problem.includes("turns significant")));
  const unsized = text.replace("One task per arm; power mcnemar-cases sized it.", "One task per arm.");
  assert.ok(validate("study-plan", unsized).problems.some((problem) => problem.includes("needs its size")));
  assert.deepEqual(validate("study-plan", text).problems, []);
});

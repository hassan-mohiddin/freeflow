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
import {
  LOOKUP_RULE,
  arxivRecord,
  lookupRow,
  matchesSource,
  pinIdentifier,
  searchTitle,
} from "../../../skills/research-work/scripts/lib/lookup.mjs";
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
  const found = await lookupRow(
    {
      ID: "S1",
      Source: "Brown, Cai and DasGupta 2001. Interval estimation for a binomial proportion",
      Pin: "doi:10.1214/ss/1",
    },
    get,
  );
  assert.equal(found.lookup, "verified");
  assert.match(found.detail, /title and author/);
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
  const paper = await lookupRow(
    { ID: "S1", Source: "Zheng et al. 2023. Judging LLM-as-a-judge with MT-Bench", Pin: "arXiv:2306.05685" },
    busy.get,
  );
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
      "doi:10.1214/ss/1\u0000Brown, Cai and DasGupta 2001": { at: "2026-10-27T00:00:00Z", rule: LOOKUP_RULE, result },
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
  assert.match(without.stdout, /read ranges were not checked \(no --reads\); this note does not count/);
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
    .replace(/<how it is done today[^>]*>/, "Answered before any data.")
    .replace(/<the noise floor[^>]*>/, "Answered before any data.")
    // Plans written before the Method column existed: the helper keeps testing them.
    .replace("| Decision rule | Method |", "| Decision rule |")
    .replace("| --- | --- | --- | --- | --- | --- |", "| --- | --- | --- | --- | --- |")
    .replace(/ <the stats\.mjs family[^>]*> \|/, "")
    // ... and before the Budget column: dedicated tests cover both.
    .replace(
      "| Unit | Arm | Trials | Budget |\n| --- | --- | --- | --- |",
      "| Unit | Arm | Trials |\n| --- | --- | --- |",
    )
    .replace(/\| <unit> \| <arm> \| <trials> \| <[^>]*> \|/, "| <unit> | <arm> | <trials> |")
    .replaceAll("<how this route is controlled, or unknown>", "unknown")
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

/** A Crossref answer for one DOI, with no notices. */
const crossrefWith = (message) =>
  recorded([
    ["https://api.crossref.org/works?filter=", { status: 200, body: JSON.stringify({ message: { items: [] } }) }],
    ["https://api.crossref.org/works/", { status: 200, body: JSON.stringify({ message }) }],
  ]).get;

test("a DOI verifies only on the title and an author the Source names, as whole names with accents folded", async () => {
  // The title the Source names contradicts the record, though the author and year agree.
  const feline = await lookupRow(
    { ID: "S1", Source: "Brown 2001. A survey of feline behaviour", Pin: "doi:10.1214/ss/1" },
    crossrefWith(BROWN),
  );
  assert.equal(feline.lookup, "unresolved");
  // A short surname inside a longer word is not the author.
  const li = {
    title: ["Graph neural networks for chemistry"],
    author: [{ family: "Li" }],
    issued: { "date-parts": [[2019]] },
  };
  const multilingual = await lookupRow(
    { ID: "S2", Source: "Smith 2019. Multilingual evaluation of reviewers", Pin: "doi:10.1/li" },
    crossrefWith(li),
  );
  assert.equal(multilingual.lookup, "refuted");
  // An unaccented spelling names the same author; with no title in the Source, a person compares them.
  const muller = {
    title: ["Interval estimation for a binomial proportion"],
    author: [{ family: "Müller" }],
    issued: { "date-parts": [[2003]] },
  };
  const ascii = await lookupRow({ ID: "S3", Source: "Muller 2003", Pin: "doi:10.1/mu" }, crossrefWith(muller));
  assert.equal(ascii.lookup, "unresolved");
  assert.match(ascii.detail, /names no title/);
  const titled = await lookupRow(
    { ID: "S4", Source: "Muller 2003. Interval estimation for a binomial proportion", Pin: "doi:10.1/mu" },
    crossrefWith(muller),
  );
  assert.equal(titled.lookup, "verified");
  // The title alone, with an author the record does not list, is not enough.
  const borrowed = await lookupRow(
    { ID: "S5", Source: "Jones 2001. Interval estimation for a binomial proportion", Pin: "doi:10.1214/ss/1" },
    crossrefWith(BROWN),
  );
  assert.equal(borrowed.lookup, "unresolved");
});

test("a reachable URL verifies only when the page carries the Source's words", async () => {
  const page = { status: 200, body: "<html><title>SWE-bench Verified · Datasets</title><p>dataset card</p></html>" };
  const named = await lookupRow(
    { ID: "S1", Source: "SWE-bench Verified dataset", Pin: "https://example.org/swe" },
    recorded([["https://example.org/", page]]).get,
  );
  assert.equal(named.lookup, "verified");
  const elsewhere = await lookupRow(
    { ID: "S2", Source: "Codex sandboxing documentation", Pin: "https://example.org/swe" },
    recorded([["https://example.org/", page]]).get,
  );
  assert.equal(elsewhere.lookup, "unresolved");
  assert.match(elsewhere.detail, /reachable \(200\)/);
});

test("a lookup the service could not answer is not cached", () => {
  const dir = folder();
  writeFileSync(
    join(dir, "sources.md"),
    "# Source Ledger: S\n\n| ID | Source | Pin | Lookup | Checked | Read | Supports |\n| --- | --- | --- | --- | --- | --- | --- |\n| S1 | Nowhere 2001. A page | https://127.0.0.1:9/x | not-looked-up | opened | full | x |\n",
  );
  const run = node("sources.mjs", "lookup", join(dir, "sources.md"), "--cache", join(dir, "lookups.json"));
  assert.match(run.stdout, /S1: unresolved/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "lookups.json"), "utf8")), {});
});

test("a citation must lie wholly inside what was read, from a clone at its pin, and sed scripts with several ranges count", () => {
  const reads = [
    { source: "S1", path: "a.rs", start: 1, end: 15 },
    { source: "S1", path: "a.rs", start: 16, end: 30 },
  ];
  assert.ok(wasRead(reads, { source: "S1", path: "a.rs", start: 10, end: 30 }));
  assert.ok(!wasRead(reads, { source: "S1", path: "a.rs", start: 10, end: 40 }));
  assert.deepEqual(readsInCommand("sed -n '1,60p;300,400p' src/a.rs"), [
    { path: "src/a.rs", start: 1, end: 60 },
    { path: "src/a.rs", start: 300, end: 400 },
  ]);
  const { clone, commit } = repoFolder();
  const transcript = JSON.stringify({
    message: { content: [{ type: "tool_use", name: "Read", input: { file_path: join(clone, "src/turn.rs") } }] },
  });
  const pins = new Map([["S1", { repo: "codex", commit }]]);
  const clones = new Map([["codex", clone]]);
  assert.equal(readsFromTranscript(transcript, { clones, pins, heads: new Map([["codex", commit]]) }).length, 1);
  assert.equal(
    readsFromTranscript(transcript, { clones, pins, heads: new Map([["codex", "f".repeat(40)]]) }).length,
    0,
  );
});

test("the stop-rule and size checks catch other wordings, and a negated sequential test does not lift them", () => {
  const { plan } = planRepo();
  const text = readFileSync(plan, "utf8");
  const at10 = (answer) =>
    text.replace("## 10. The interval\n\nAnswered before any data.", `## 10. The interval\n\n${answer}`);
  for (const answer of [
    "Keep collecting until p < 0.05.",
    "Halt the run once the result is significant.",
    "End the study as soon as p<.05.",
    "Stop when the difference is significant. We do not use a sequential test.",
  ])
    assert.ok(
      validate("study-plan", at10(answer)).problems.some((problem) => problem.includes("turns significant")),
      answer,
    );
  for (const answer of [
    "At the end, the result is significant if p < 0.05.",
    "Each task runs once, and p < 0.05 decides.",
  ])
    assert.ok(
      !validate("study-plan", at10(answer)).problems.some((problem) => problem.includes("turns significant")),
      answer,
    );
  const vague = text.replace("One task per arm; power mcnemar-cases sized it.", "Power is high for these prompts.");
  assert.ok(validate("study-plan", vague).problems.some((problem) => problem.includes("needs its size")));
  const numbered = text.replace(
    "One task per arm; power mcnemar-cases sized it.",
    "62 tasks give 80% power for 20 points.",
  );
  assert.ok(!validate("study-plan", numbered).problems.some((problem) => problem.includes("needs its size")));
});

test("--refresh asks again only for the rows it looks up, and an answer cached under an older rule is asked again", () => {
  const dir = folder();
  writeFileSync(
    join(dir, "sources.md"),
    "# Source Ledger: S\n\n| ID | Source | Pin | Lookup | Checked | Read | Supports |\n| --- | --- | --- | --- | --- | --- | --- |\n| S1 | Nowhere 2001. A page | https://127.0.0.1:9/x | not-looked-up | opened | full | x |\n| S2 | Elsewhere 2002. Another page | https://127.0.0.1:9/y | not-looked-up | opened | full | x |\n",
  );
  const old = { id: "S1", kind: "url", lookup: "verified", detail: "reachable (200)", notices: [] };
  writeFileSync(
    join(dir, "lookups.json"),
    JSON.stringify({
      "url:https://127.0.0.1:9/x\u0000Nowhere 2001. A page": { at: "2026-10-27T00:00:00Z", result: old },
      "url:https://127.0.0.1:9/y\u0000Elsewhere 2002. Another page": {
        at: "2026-10-27T00:00:00Z",
        rule: LOOKUP_RULE,
        result: { ...old, id: "S2" },
      },
    }),
  );
  const run = node("sources.mjs", "lookup", join(dir, "sources.md"), "--cache", join(dir, "lookups.json"));
  assert.match(run.stdout, /S1: unresolved/);
  assert.match(run.stdout, /S2: verified .*\[cached/);
  node(
    "sources.mjs",
    "lookup",
    join(dir, "sources.md"),
    "--cache",
    join(dir, "lookups.json"),
    "--only",
    "S1",
    "--refresh",
  );
  assert.ok(Object.keys(JSON.parse(readFileSync(join(dir, "lookups.json"), "utf8"))).some((key) => key.includes("/y")));
});

test("reads follow a command's cd and the transcript's working folder, and a pipe into sed keeps only its range", () => {
  assert.deepEqual(readsInCommand("cd /r/codex-rs && sed -n 1,80p core/a.rs | cat -n | sed -n 1,80p", "/elsewhere"), [
    { path: "/r/codex-rs/core/a.rs", start: 1, end: 80 },
  ]);
  assert.deepEqual(readsInCommand("nl -ba core/a.rs | sed -n '440,500p'; cat b.rs", "/r"), [
    { path: "/r/core/a.rs", start: 440, end: 500 },
    { path: "/r/b.rs", start: 1, end: null },
  ]);
  assert.deepEqual(readsInCommand("tail -n +30 a.rs", "/r"), [{ path: "/r/a.rs", start: 30, end: null }]);
  // Output written to a file was not shown; output with only its errors redirected was.
  assert.deepEqual(readsInCommand("git -C /r show abcdef12:a.rs >> saved.txt; cat b.rs > c.txt", "/"), []);
  assert.deepEqual(readsInCommand("cat b.rs 2>/dev/null", "/r"), [{ path: "/r/b.rs", start: 1, end: null }]);
  assert.deepEqual(readsInCommand("cd /r && \necho x\nsed -n 3,4p a.rs | grep fn", "/"), []);
  assert.deepEqual(readsInCommand("cd /r && \necho x\nsed -n 3,4p a.rs", "/"), [{ path: "/r/a.rs", start: 3, end: 4 }]);
  const { clone, commit } = repoFolder();
  const transcript = [
    {
      cwd: clone,
      message: { content: [{ type: "tool_use", name: "Bash", input: { command: "sed -n 5,9p src/turn.rs" } }] },
    },
    {
      cwd: "/",
      message: {
        content: [{ type: "tool_use", name: "Bash", input: { command: `cd ${clone}/src && head -n 3 turn.rs` } }],
      },
    },
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n");
  const pins = new Map([["S1", { repo: "codex", commit }]]);
  assert.deepEqual(readsFromTranscript(transcript, { clones: new Map([["codex", clone]]), pins }), [
    { source: "S1", path: "src/turn.rs", start: 5, end: 9 },
    { source: "S1", path: "src/turn.rs", start: 1, end: 3 },
  ]);
});

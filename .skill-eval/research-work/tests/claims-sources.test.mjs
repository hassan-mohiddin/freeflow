// Checks on claims and sources: whether a cited source supports its claim (support packets and a reader's
// verdicts), stricter lookups (sibling works, year, first author, title search, archived pages), report wording
// against a number's sign and a claim's level, percentages against their counts, copied passages, and two more
// rechecks of reported statistics (d from t, n from df) with corrected p values.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { lookupRow, matchesSource, searchTitle } from "../../../skills/research-work/scripts/lib/lookup.mjs";
import { draftCheck } from "../../../skills/research-work/scripts/lib/paper.mjs";
import { recheck } from "../../../skills/research-work/scripts/lib/recheck.mjs";
import { currentNotes, percentMismatches, wordingNotes } from "../../../skills/research-work/scripts/lib/report.mjs";
import { buildPackets, checkVerdicts } from "../../../skills/research-work/scripts/lib/support.mjs";

const SCRIPTS = fileURLToPath(new URL("../../../skills/research-work/scripts/", import.meta.url));
const node = (script, ...args) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8" });
const folder = () => mkdtempSync(join(tmpdir(), "research-claims-sources-"));

/** A stand-in for httpGet answering from URL prefixes. */
function recorded(answers) {
  const asked = [];
  const get = async (url) => {
    asked.push(url);
    for (const [prefix, answer] of answers) if (url.startsWith(prefix)) return answer;
    return { status: 404, body: "", error: null };
  };
  return { get, asked };
}

const BROWN = {
  title: "Interval Estimation for a Binomial Proportion",
  authors: ["Brown", "Cai", "DasGupta"],
  year: 2001,
};
const SOURCE = "Brown, Cai and DasGupta 2001. Interval estimation for a binomial proportion";

test("a record verifies only when titles match both ways, it is not a sibling, and year and first author agree", () => {
  assert.equal(matchesSource(SOURCE, BROWN).matched, true);
  // A correction notice to the work shares its title and authors.
  const correction = matchesSource(SOURCE, { ...BROWN, title: `Correction to: ${BROWN.title}` });
  assert.equal(correction.matched, false);
  assert.match(correction.differs.join(), /"correction"/);
  // Another part of a series.
  assert.equal(matchesSource(SOURCE, { ...BROWN, title: `${BROWN.title}, Part II` }).matched, false);
  // A year more than one off.
  const year = matchesSource(SOURCE, { ...BROWN, year: 2005 });
  assert.equal(year.matched, false);
  assert.match(year.differs.join(), /year is 2005/);
  // An online-first year one off still matches.
  assert.equal(matchesSource(SOURCE, { ...BROWN, year: 2002 }).matched, true);
  // The Source names other authors of the record, but not its first.
  const first = matchesSource(SOURCE, { ...BROWN, authors: ["Agresti", "Brown", "Cai"] });
  assert.equal(first.matched, false);
  assert.match(first.differs.join(), /first author is Agresti/);
  // A short record title inside a longer Source title matches one way only.
  assert.equal(
    matchesSource("Brown 2001. Interval estimation for a binomial proportion in small samples with many strata", {
      ...BROWN,
      title: "Interval estimation",
    }).matched,
    false,
  );
});

test("lookup reports a sibling record as unresolved, naming why, never as verified or refuted", async () => {
  const notice = {
    title: [`Correction to: ${BROWN.title}`],
    author: [{ family: "Brown" }, { family: "Cai" }, { family: "DasGupta" }],
    issued: { "date-parts": [[2001]] },
  };
  const { get } = recorded([
    ["https://api.crossref.org/works/", { status: 200, body: JSON.stringify({ message: notice }) }],
  ]);
  const result = await lookupRow({ ID: "S1", Source: SOURCE, Pin: "doi:10.1214/ss/2" }, get);
  assert.equal(result.lookup, "unresolved");
  assert.match(result.detail, /may be a related work/);
});

test("a title search yields a candidate DOI for a row with no identifier, and never a verdict", async () => {
  const openalex = {
    results: [
      {
        title: "Something else entirely",
        authorships: [{ author: { display_name: "A. Person" } }],
        publication_year: 2001,
        doi: "https://doi.org/10.1/other",
      },
      {
        title: BROWN.title,
        authorships: BROWN.authors.map((name) => ({ author: { display_name: `X. ${name}` } })),
        publication_year: 2001,
        doi: "https://doi.org/10.1214/ss/1009213286",
      },
    ],
  };
  const { get, asked } = recorded([["https://api.openalex.org/", { status: 200, body: JSON.stringify(openalex) }]]);
  const found = await searchTitle({ ID: "S1", Source: SOURCE, Pin: "none" }, get);
  assert.equal(found.candidate.doi, "10.1214/ss/1009213286");
  assert.match(asked[0], /title\.search:interval%20estimation/);
  const row = await lookupRow({ ID: "S1", Source: SOURCE, Pin: "none" }, get, { searchTitles: true });
  assert.equal(row.lookup, "unresolved");
  assert.match(row.detail, /put it in the Pin/);
  // Without the option, a row with no identifier is not looked up.
  assert.equal((await lookupRow({ ID: "S1", Source: SOURCE, Pin: "none" }, get)).lookup, null);
  const nothing = await searchTitle(
    { ID: "S2", Source: SOURCE, Pin: "none" },
    recorded([["https://api.openalex.org/", { status: 200, body: JSON.stringify({ results: [] }) }]]).get,
  );
  assert.equal(nothing.candidate, null);
});

test("a page that is gone is looked up in the archive; one that did not answer is not", async () => {
  const snapshot = {
    archived_snapshots: { closest: { available: true, url: "http://web.archive.org/web/2020/https://example.org/x" } },
  };
  const gone = recorded([["https://archive.org/wayback/", { status: 200, body: JSON.stringify(snapshot) }]]);
  const page = await lookupRow({ ID: "S1", Source: "A note on x", Pin: "https://example.org/x" }, gone.get);
  assert.equal(page.lookup, "unresolved");
  assert.match(page.detail, /archived copy exists at http:\/\/web\.archive\.org/);
  const busy = recorded([["https://example.org/", { status: 503, body: "" }]]);
  const later = await lookupRow({ ID: "S1", Source: "A note on x", Pin: "https://example.org/x" }, busy.get);
  assert.equal(later.archive, null);
  assert.ok(!busy.asked.some((url) => url.includes("archive.org")));
});

test("Cohen's d and Hedges' g are rechecked from t and the group sizes", () => {
  assert.equal(recheck("d", "t(28) = 2.20, d = 0.80, n1 = 15, n2 = 15").status, "consistent");
  assert.equal(recheck("d", "t(28) = 2.20, d = 0.50, n1 = 15, n2 = 15").status, "mismatch");
  assert.equal(recheck("d", "t(28) = 2.20, g = 0.78, n1 = 15, n2 = 15").status, "consistent");
  assert.equal(recheck("d", "t(29) = 3.00, dz = 0.55, N = 30, paired").status, "consistent");
  assert.equal(recheck("d", "t(29) = 3.00, d = 0.55, N = 30, one-sample").status, "consistent");
  // A paired d not labelled dz may be d_av, which needs the correlation.
  assert.deepEqual(
    [
      recheck("d", "t(29) = 3.00, d = 0.55, N = 30, paired").status,
      recheck("d", "t(29) = 3.00, d = 0.55, N = 30, paired").reason,
    ],
    ["not computable", "d type unknown"],
  );
  assert.equal(recheck("d", "t(28) = 2.20, d = 0.80, N = 30").reason, "missing input");
});

test("degrees of freedom are rechecked against the sample size", () => {
  assert.equal(recheck("n-df", "t(28) = 2.20, p = .036, N = 30").status, "consistent");
  assert.equal(recheck("n-df", "t(29) = 2.20, N = 30").status, "consistent");
  const dropped = recheck("n-df", "t(25) = 2.20, N = 30");
  assert.equal(dropped.status, "mismatch");
  assert.match(dropped.detail, /implies N = 26 or 27/);
  // Welch's test gives fractional df at most n1 + n2 - 2.
  assert.equal(recheck("n-df", "t(27.3) = 2.20, n1 = 15, n2 = 15").status, "consistent");
  assert.equal(recheck("n-df", "t(29.5) = 2.20, n1 = 15, n2 = 15").status, "mismatch");
  assert.equal(recheck("n-df", "r(48) = .30, N = 50").status, "consistent");
  assert.equal(recheck("n-df", "r(40) = .30, N = 50").status, "mismatch");
  assert.equal(recheck("n-df", "F(2, 57) = 3.2, N = 60, between-groups").status, "consistent");
  assert.equal(recheck("n-df", "F(2, 57) = 3.2, N = 60").reason, "design unknown");
  assert.equal(recheck("n-df", "χ2(1) = 3.9, N = 90").reason, "design unknown");
});

test("a corrected p is checked only for being at least the uncorrected p, and is never a decision error", () => {
  assert.equal(recheck("p", "t(28) = 2.20, p = .108, Bonferroni-corrected").status, "consistent");
  assert.equal(recheck("p", "t(28) = 2.20, p = .010, Holm-adjusted").status, "mismatch");
  assert.equal(recheck("p", "t(28) = 2.20, p < .05, corrected").status, "consistent");
  // Uncorrected, the same p of .108 is a decision error.
  assert.equal(recheck("p", "t(28) = 2.20, p = .108").status, "decision error");
});

test("a recheck table's Status for the new checks is computed, never written by hand", () => {
  const dir = folder();
  const path = join(dir, "recheck.md");
  writeFileSync(
    path,
    `# Recheck Table: R

> **Type:** Recheck Table
> **Status:** Draft
> **Owner:** Hassan Mohiddin

| ID | Source | Where | Check | Reported | Status |
| --- | --- | --- | --- | --- | --- |
| N1 | S1 | Table 2 | d | t(28) = 2.20, d = 0.50, n1 = 15, n2 = 15 | consistent |
| N2 | S1 | p. 4 | n-df | t(25) = 2.20, N = 30 | - |
`,
  );
  const before = node("artifact.mjs", "validate", path);
  assert.notEqual(before.status, 0);
  assert.match(before.stdout + before.stderr, /N1: Status says consistent, but the computation gives mismatch/);
  assert.equal(node("stats.mjs", "recheck", path, "--write").status, 1);
  const after = readFileSync(path, "utf8");
  assert.match(after, /\| N1 \|.*\| mismatch \|/);
  assert.match(after, /\| N2 \|.*\| mismatch \|/);
  assert.equal(node("artifact.mjs", "validate", path).status, 0);
});

test("a percentage that does not follow from its counts is found", () => {
  assert.deepEqual(
    percentMismatches("12 of 40 (35%), 3/4 (75%), 7 of 9 (77.8%), 2 out of 3 (66.7%)").map((found) => found.text),
    ["12 of 40 (35%)"],
  );
});

test("wording is listed against a claim's level and a number's sign, and a 'latest' claim against its date", () => {
  const levels = new Map([
    ["C1", "L4"],
    ["C2", "L2"],
  ]);
  assert.deepEqual(wordingNotes("The patch improves accuracy (C1).", levels), []);
  assert.match(wordingNotes("The patch improves accuracy (C2).", levels)[0].value, /C2 \(L2\)/);
  assert.equal(
    wordingNotes("Accuracy changed by -3.3%, an improvement (C1).", levels)[0].kind,
    "wording against the sign",
  );
  assert.equal(currentNotes("The latest version retries twice.").length, 1);
  assert.equal(currentNotes("The latest version (v0.4.1, 2026-10-27) retries twice.").length, 0);
});

test("trace fails a wrong percentage and lists wording notes without failing on them", () => {
  const dir = folder();
  writeFileSync(
    join(dir, "claims.md"),
    "# Claims Register: R\n\n| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| C1 | 12 of 40 tasks pass | 12, 40, 30% | S1 | L3 | exploratory | here | one run |\n",
  );
  writeFileSync(join(dir, "ok.md"), "# R\n\nThe patch improves the pass rate: 12 of 40 (30%) pass (C1).\n");
  const ok = node("claims.mjs", "trace", join(dir, "ok.md"), "--register", join(dir, "claims.md"));
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /note: line 3: wording above the level: "improves" on C1 \(L3\)/);
  writeFileSync(join(dir, "bad.md"), "# R\n\n12 of 40 (35%) pass (C1).\n");
  const bad = node("claims.mjs", "trace", join(dir, "bad.md"), "--register", join(dir, "claims.md"));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /percentage not from its counts 12 of 40 \(35%\) \(the counts give 30%\)/);
});

/** A pinned repository, a ledger, a register and a report citing code and a quote. */
function supportFixture() {
  const dir = folder();
  const repo = join(dir, "harness");
  mkdirSync(join(repo, "src"), { recursive: true });
  const lines = Array.from({ length: 40 }, (_, i) => `// line ${i + 1}`);
  lines[19] = "if policy.allow_retry {";
  lines[21] = "  retry(call, 2);";
  writeFileSync(join(repo, "src", "loop.rs"), `${lines.join("\n")}\n`);
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("-c", "user.name=t", "-c", "user.email=t@t", "add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  const commit = git("rev-parse", "HEAD");
  writeFileSync(
    join(dir, "note.txt"),
    "Before it. The harness retries a failed call twice when the policy allows it. After it.",
  );
  writeFileSync(
    join(dir, "sources.md"),
    `# Source Ledger: H\n\n| ID | Source | Pin | Lookup | Checked | Read | Supports |\n| --- | --- | --- | --- | --- | --- | --- |\n| S1 | harness | harness@${commit} | verified | repository-read | partial | C1 |\n| S2 | A design note | https://example.org/note (accessed 2026-10-27) | verified | opened | full | C2 |\n`,
  );
  writeFileSync(
    join(dir, "claims.md"),
    "# Claims Register: H\n\n| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| C1 | The harness retries a failed call twice | 2 | S1 | L2 | exploratory | every call | not run |\n| C2 | Retries depend on the policy | - | S2 | L2 | exploratory | here | - |\n| C3 | The harness logs each retry | - | S1 | L2 | exploratory | here | - |\n",
  );
  writeFileSync(
    join(dir, "report.md"),
    '# Report\n\n- The harness retries a failed call 2 times (C1), S1:src/loop.rs:22.\n- Retries depend on the policy (C2): "retries a failed call twice when the policy allows it" (S2).\n- It logs each retry (C3).\n',
  );
  return { dir, repo };
}

test("support packets carry the claim and only its evidence, with the code around a cited line", () => {
  const { dir, repo } = supportFixture();
  const out = join(dir, "packets.jsonl");
  const run = node(
    "claims.mjs",
    "support",
    join(dir, "report.md"),
    "--register",
    join(dir, "claims.md"),
    "--ledger",
    join(dir, "sources.md"),
    "--repo",
    `harness=${repo}`,
    "--copy",
    `S2=${join(dir, "note.txt")}`,
    "--out",
    out,
  );
  // C3 cites no line or quote, so it is listed as not checked and the command exits 1.
  assert.equal(run.status, 1);
  assert.match(run.stdout, /2 packet\(s\); 1 cited claim\(s\) not checked/);
  assert.match(run.stdout, /not checked: C3: no code citation or quote/);
  const packets = readFileSync(out, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    packets.map((packet) => packet.claim),
    ["C1", "C2"],
  );
  const code = packets[0].evidence[0].text;
  // The condition above the cited line is in the context, and only line 22 is marked as cited.
  assert.match(code, / 20: if policy\.allow_retry \{/);
  assert.match(code, />22: {3}retry\(call, 2\);/);
  assert.equal(packets[0].scope, "every call");
  assert.match(packets[1].evidence[0].text, /Before it\. The harness retries/);
  // The report's prose is not in a packet.
  assert.ok(!JSON.stringify(packets).includes("It logs each retry"));
});

test("verdicts are checked against their packets and counted, and a partial one must be settled", () => {
  const packets = [
    {
      packet: "P1",
      claim: "C1",
      evidence: [{ cite: "x", text: " 20: if policy.allow_retry {\n>22:   retry(call, 2);" }],
    },
    {
      packet: "P2",
      claim: "C2",
      evidence: [{ cite: "y", text: "The harness retries a failed call twice when the policy allows it." }],
    },
  ];
  const line = (answer, at) => ({ line: at, answer });
  const partial = {
    packet: "P1",
    verdict: "partial",
    quote: "if policy.allow_retry { retry(call, 2);",
    missing: "the retry happens only when the policy allows it",
  };
  const supported = { packet: "P2", verdict: "supported", quote: "retries a failed call twice" };
  const open = checkVerdicts(packets, [line(partial, 1), line(supported, 2)]);
  assert.equal(open.supported, 1);
  assert.equal(open.answered, 2);
  assert.equal(open.interval.method, "wilson");
  assert.deepEqual(
    open.open.map((entry) => entry.claim),
    ["C1"],
  );
  assert.equal(open.problems.length, 0);
  const settled = checkVerdicts(packets, [
    line({ ...partial, adjudication: "rejected: the claim's scope says every call under the default policy" }, 1),
    line(supported, 2),
  ]);
  assert.equal(settled.open.length, 0);
  assert.equal(settled.settled.length, 1);
  const bad = checkVerdicts(packets, [
    line({ ...supported, packet: "P1", quote: "words that are not there" }, 1),
    line({ packet: "P2", verdict: "unsupported", quote: "retries a failed call twice" }, 2),
  ]);
  assert.deepEqual(
    bad.problems.map((problem) => problem.problem),
    ["P1: the quote is not in the packet's evidence", "P2: a unsupported answer says what the evidence does not show"],
  );
  const missing = checkVerdicts(packets, [line(supported, 1)]);
  assert.match(missing.problems[0].problem, /P1 \(C1\) has no answer/);
});

test("support-check passes only when every packet has a valid answer and none is left open", () => {
  const { dir, repo } = supportFixture();
  const packets = join(dir, "packets.jsonl");
  node(
    "claims.mjs",
    "support",
    join(dir, "report.md"),
    "--register",
    join(dir, "claims.md"),
    "--ledger",
    join(dir, "sources.md"),
    "--repo",
    `harness=${repo}`,
    "--copy",
    `S2=${join(dir, "note.txt")}`,
    "--only",
    "C1,C2",
    "--out",
    packets,
  );
  const verdicts = join(dir, "verdicts.jsonl");
  writeFileSync(
    verdicts,
    [
      {
        packet: "P1",
        verdict: "partial",
        quote: "if policy.allow_retry { // line 21 retry(call, 2);",
        missing: "only when the policy allows it",
      },
      { packet: "P2", verdict: "supported", quote: "retries a failed call twice" },
    ]
      .map((answer) => JSON.stringify(answer))
      .join("\n"),
  );
  const open = node("claims.mjs", "support-check", verdicts, "--packets", packets);
  assert.equal(open.status, 1);
  assert.match(open.stdout, /1 of 2 answered packet\(s\) supported \(0\.50, 95% Wilson interval/);
  assert.match(open.stdout, /open: P1 C1: partial: only when the policy allows it/);
});

test("draft-check fails a passage copied without quotation marks and lists uncited sources and prior work", () => {
  const source = "The method samples each task five times and keeps the median score across all of the runs it made.";
  const copies = new Map([["S1", source]]);
  const copied = draftCheck(
    `# P\n\n## Method\n\nWe say that the method samples each task five times and keeps the median score across all of the runs.\n`,
    { copies },
  );
  assert.deepEqual(
    copied.problems.map((problem) => problem.kind),
    ["copied without quotation marks"],
  );
  const quoted = draftCheck(
    `# P\n\n## Method\n\nAs S1 puts it, "the method samples each task five times and keeps the median score across all of the runs" [@S1].\n`,
    { copies, ledger: new Set(["S1", "S2"]) },
  );
  assert.equal(quoted.problems.length, 0);
  assert.deepEqual(
    quoted.notes.filter((note) => note.kind === "ledger source never cited").map((note) => note.value),
    ["S2"],
  );
  const prior = draftCheck(
    "# P\n\n## Introduction\n\nPrevious studies have shown that judges favor long answers.\n",
    {},
  );
  assert.ok(prior.notes.some((note) => note.kind === "prior work without a citation"));
  const cited = draftCheck(
    "# P\n\n## Introduction\n\nPrevious studies have shown that judges favor long answers [@S4].\n",
    {},
  );
  assert.ok(!cited.notes.some((note) => note.kind === "prior work without a citation"));
});

test("apply lists wording a revision made stronger than the reviewed text", () => {
  const dir = folder();
  const draft = join(dir, "paper.md");
  writeFileSync(draft, "# P\n\n## Results\n\nThe change is associated with fewer failures (C1).\n");
  writeFileSync(
    join(dir, "claims.md"),
    "# Claims Register: P\n\n| ID | Claim | Numbers | Source | Level | Kind | Scope | Limit |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| C1 | Fewer failures with the change | - | S1 | L3 | exploratory | here | - |\n",
  );
  assert.equal(node("paper.mjs", "anchor", draft).status, 0);
  const manifest = JSON.parse(readFileSync(join(dir, "paper.blocks.json"), "utf8"));
  const block = manifest.blocks.find((each) => each.first.startsWith("The change"));
  writeFileSync(
    join(dir, "patch.json"),
    JSON.stringify({
      base_sha256: manifest.sha256,
      changes: [{ block: block.id, finding: "R1:2", op: "replace", text: "The change causes fewer failures (C1)." }],
    }),
  );
  const run = node(
    "paper.mjs",
    "apply",
    draft,
    "--patch",
    join(dir, "patch.json"),
    "--out",
    join(dir, "revised.md"),
    "--register",
    join(dir, "claims.md"),
  );
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /stronger than the reviewed text: "causes" is new/);
  assert.match(run.stdout, /wording above the level: "causes" on C1 \(L3\)/);
  const report = JSON.parse(readFileSync(join(dir, "revised.apply.json"), "utf8"));
  assert.equal(report.notes.length, 2);
});

test("buildPackets lists a cited claim whose evidence cannot be read as not checked", () => {
  const rows = [{ cells: { ID: "C1", Claim: "x", Numbers: "-", Source: "S1", Scope: "here" } }];
  const ledger = new Map([["S1", { Pin: "harness@1a2b3c4d" }]]);
  const built = buildPackets("- A claim (C1), S1:src/loop.rs:3.\n", rows, ledger);
  assert.equal(built.packets.length, 0);
  assert.match(built.notChecked[0].reason, /no --repo harness=<clone> given/);
});

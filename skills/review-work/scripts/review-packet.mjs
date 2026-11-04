#!/usr/bin/env node
// Prefills a work reviewer's pointer brief (references/work.md, "The Brief") from the repository and the task folder,
// then runs check-brief.mjs on it, so the brief points at the requirements, the right diff and the prior report
// without being assembled by hand. It takes the review plan (lib/plan.mjs, as review-plan.mjs prints it) into the
// brief's Plan line: depth, tier, reviewers and round budget, and refuses a round the plan does not allow. Lines it
// cannot fill (the Boundary, unless given) stay empty, so check-brief refuses the brief until the initiator fills them.
// Usage: review-packet.mjs --review <1|2|3> --base <ref> [--head <ref>] [--task <task folder>] [--out <brief.md>]
//                          [--reviewer <a|b|c>] [--add <trigger> --reason <text>]... [--boundary <text>]
//                          [--agreement <path>]... [--evidence <path>]... [--may-run <text>] [--root <repository>] [--json]
// With --task, the brief is written to <task>/reviews/R<n>-brief.md, n the next number free in the task, the report
// path is R<n>-report.md beside it, the agreement defaults to the task's record.md, and Review 2 or 3 takes its diff
// from the previous brief's reviewed state, points to that review's report (or a Deep review's R<n>-adjudication.md)
// and prints the size of that correction diff. Without --task or --out, the folder is this session's reviews/ in the
// Freeflow home. A Deep review's reviewers each get their own brief, --reviewer a, b and c: R<n>a-brief.md and so on,
// with their reports beside them. Docs come from Write Docs' docs-check.mjs --covering on the changed files; Review
// rules from a REVIEW.md or a tracked Markdown file with a "## Review Rules" section at the base; Method from the
// base's copy when Review Work is in the reviewed repository. The default May run is the declared npm checks and probes
// on scratch copies.
// Exit code: check-brief's (0 passes, 1 has problems); 2 on a usage or Git error, or a round the plan does not allow.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PlanError, planReview } from "./lib/plan.mjs";
import { reviewsDir } from "./lib/records.mjs";
import { reviewRulesSections } from "./lib/review-rules.mjs";

const USAGE =
  "Usage: review-packet.mjs --review <1|2|3> --base <ref> [--head <ref>] [--task <task folder>] [--out <brief.md>] [--reviewer <a|b|c>] [--add <trigger> --reason <text>]... [--boundary <text>] [--agreement <path>]... [--evidence <path>]... [--may-run <text>] [--root <repository>] [--json]";
const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_BRIEF = join(HERE, "check-brief.mjs");
const DOCS_CHECK = resolve(HERE, "../../write-docs/scripts/docs-check.mjs");
const SKILL = resolve(HERE, "../SKILL.md");

function fail(message) {
  console.error(message);
  process.exit(2);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      review: { type: "string" },
      base: { type: "string" },
      head: { type: "string", default: "HEAD" },
      task: { type: "string" },
      out: { type: "string" },
      reviewer: { type: "string" },
      add: { type: "string", multiple: true, default: [] },
      reason: { type: "string", multiple: true, default: [] },
      boundary: { type: "string" },
      agreement: { type: "string", multiple: true, default: [] },
      evidence: { type: "string", multiple: true, default: [] },
      "may-run": { type: "string" },
      root: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const round = Number(values.review);
if (![1, 2, 3].includes(round) || !values.base) fail(USAGE);
const sessionReviews = values.task || values.out ? null : reviewsDir({ task: null });
if (!values.task && !values.out && !sessionReviews)
  fail(`give --task or --out for where the brief goes (no session is named for this session's reviews/)\n${USAGE}`);
if (values.reviewer !== undefined && !/^[a-c]$/.test(values.reviewer))
  fail(`--reviewer is a, b or c: one of a Deep review's three reviewers\n${USAGE}`);
if (values.add.length !== values.reason.length) fail(`each --add needs its --reason\n${USAGE}`);

const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
let root;
try {
  root = resolve(git(resolve(values.root ?? "."), ["rev-parse", "--show-toplevel"]).trim());
} catch {
  fail("not inside a Git repository");
}
const commitOf = (ref) => {
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
  } catch {
    return null;
  }
};
const head = commitOf(values.head);
if (!head) fail(`no such commit: ${values.head}`);
if (!commitOf(values.base)) fail(`no such commit: ${values.base}`);

// Paths in the brief: relative to the repository when inside it, absolute otherwise. A path from Git or docs-check is
// relative to the repository, so it is resolved against root before it reaches show.
const show = (path) => {
  const relativePath = relative(root, resolve(path));
  return relativePath.startsWith("..") ? resolve(path) : relativePath;
};
const tick = (paths) => paths.map((path) => `\`${show(path)}\``).join(", ");

// The plan decides the depth, tier, reviewers and round budget the brief carries.
let plan;
try {
  plan = planReview({
    root,
    base: values.base,
    head: values.head,
    task: values.task ? resolve(values.task) : null,
    adds: values.add.map((trigger, index) => ({ trigger, reason: values.reason[index] })),
  });
} catch (error) {
  if (error instanceof PlanError) fail(`review-packet: ${error.message}`);
  throw error;
}
if (round > plan.rounds)
  fail(
    `the plan allows up to Review ${plan.rounds} (${plan.depth}${plan.roundsSetting.value < 3 ? `, review.rounds ${plan.roundsSetting.value}` : ""}), not Review ${round}`,
  );
const letter = values.reviewer ?? "";
if (letter && plan.reviewers === 1)
  fail(`the plan is ${plan.depth}, with one reviewer: --reviewer is for a Deep review's three`);

const task = values.task ? resolve(values.task) : null;
const reviews = task ? join(task, "reviews") : values.out ? dirname(resolve(values.out)) : sessionReviews;
// Reviews in a task folder are numbered in sequence across the task (R1, R2, … whatever their round), so a new
// brief takes the next free number and never overwrites an earlier review's brief or report. A Deep review's three
// reviewers share one number: R<n>a, R<n>b, R<n>c.
const FILE = /^R(\d+)([a-z]?)-(brief|report|adjudication)\.md$/;
const files = existsSync(reviews) ? readdirSync(reviews).filter((name) => FILE.test(name)) : [];
const numbered = files.map((name) => Number(FILE.exec(name)[1]));
const latest = numbered.length > 0 ? Math.max(...numbered) : 0;
// The latest number is written again only while it is a draft of this same review (no report yet, the same Review
// number and Boundary); a review that has reported, a brief for another round, or another change's brief that may be
// out with a reviewer, is never replaced.
const inSlot = (n, kind) => files.filter((name) => FILE.exec(name)[1] === String(n) && FILE.exec(name)[3] === kind);
const draftOfThisRound =
  latest > 0 &&
  inSlot(latest, "report").length === 0 &&
  inSlot(latest, "brief").some((name) => {
    const text = readFileSync(join(reviews, name), "utf8");
    return (
      /^Review:\s*(\d)/m.exec(text)?.[1] === String(round) &&
      /^Boundary:[ \t]*(.*)$/m.exec(text)?.[1].trim() === (values.boundary ?? "").trim()
    );
  });
const slot = draftOfThisRound ? latest : latest + 1;
const briefPath = values.out ? resolve(values.out) : join(reviews, `R${slot}${letter}-brief.md`);
const reportName = /^R\d+[a-z]?-brief\.md$/.test(basename(briefPath))
  ? basename(briefPath).replace("-brief", "-report")
  : `R${slot}${letter}-report.md`;
const reportPath = join(values.out ? dirname(briefPath) : reviews, reportName);
const notes = [];
if (plan.reviewers > 1 && !letter)
  notes.push(
    `the plan is ${plan.depth}: ${plan.reviewers} reviewers, each with its own brief (--reviewer a, b and c), none shown another's report until all have written theirs`,
  );

// Review 2 or 3 reviews the range since the previous review's reviewed state.
let diffBase = values.base;
let previousReport = null;
if (round > 1) {
  // The previous review is the latest earlier brief of the round before whose reviewed state is in this change's
  // history, so a review of another change numbered in between is passed over.
  const reviewedState = (text) =>
    /^\s*(?:[-*]\s+)?(?:\*\*)?Reviewed state:(?:\*\*)?\s*`?([0-9a-fA-F]{7,40}|\S+?)`?(\s|$)/m.exec(text)?.[1];
  const inHistory = (commit) =>
    spawnSync("git", ["merge-base", "--is-ancestor", commit, head], { cwd: root }).status === 0;
  let previous = null;
  for (let n = slot - 1; n >= 1 && !previous; n -= 1) {
    for (const name of inSlot(n, "brief")) {
      const path = join(reviews, name);
      const text = readFileSync(path, "utf8");
      const state = reviewedState(text);
      const commit = state && commitOf(state);
      if (/^Review:\s*(\d)/m.exec(text)?.[1] === String(round - 1) && commit && inHistory(commit)) {
        previous = { n, path, state };
        break;
      }
    }
  }
  if (previous) {
    diffBase = previous.state;
    if (previous.n !== slot - 1)
      notes.push(`the previous review is R${previous.n}; the briefs numbered after it review another change`);
    // One reviewer's report, or a Deep review's adjudication over its three.
    const candidates = [`R${previous.n}-report.md`, `R${previous.n}-adjudication.md`].map((name) =>
      join(reviews, name),
    );
    const candidate = candidates.find((path) => existsSync(path));
    if (candidate) previousReport = candidate;
    else notes.push(`no previous report at ${show(candidates[0])}: add its path and adjudication to "Previous report"`);
  } else
    notes.push(
      `no earlier Review ${round - 1} brief whose Reviewed state is in this change's history: the diff starts at --base; fill "Previous report" by hand`,
    );
}

const agreement = values.agreement.length
  ? values.agreement
  : task && existsSync(join(task, "record.md"))
    ? [join(task, "record.md")]
    : [];
if (!agreement.length) notes.push("no agreement found: pass --agreement (the record, or the accepted requirements)");

const changed = git(root, ["-c", "core.quotePath=false", "diff", "--name-only", diffBase, head])
  .split("\n")
  .filter(Boolean);

// Developer docs covering the changed files.
let docs = [];
if (changed.length && existsSync(DOCS_CHECK)) {
  const run = spawnSync(
    process.execPath,
    [DOCS_CHECK, ...changed.flatMap((path) => ["--covering", path]), "--root", root, "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status === 0)
    docs = [
      ...new Set(
        JSON.parse(run.stdout).paths.flatMap((entry) => entry.documents.map((doc) => resolve(root, doc.path))),
      ),
    ];
  else notes.push("docs-check could not run: fill Docs by hand");
}

// The project's Review Rules, read from the base, so a change never supplies the rules that review it: a file named
// for them, or a tracked Markdown file with a "## Review Rules" section, written as path#review-rules. When the change
// edits one, the line says to read the base's copy.
const rulesAt = commitOf(values.base);
const rulePaths = [
  ...new Set([
    ...git(root, ["ls-tree", "-r", "--name-only", rulesAt])
      .split("\n")
      .filter((path) => /(^|\/)(REVIEW\.md|review-rules\.md|REVIEW_RULES\.md)$/i.test(path)),
    ...reviewRulesSections(root, rulesAt).map((path) => `${path}#review-rules`),
  ]),
];
const changedSinceBase = new Set(git(root, ["diff", "--name-only", rulesAt, head]).split("\n"));
const rulesEdited = rulePaths.some((path) => changedSinceBase.has(path.replace(/#review-rules$/, "")));
const rules = rulePaths.map((path) => resolve(root, path));

// The default "May run": the project's declared checks and probes of the changed code on scratch copies.
const PROBES = "probes of the changed code on copies in your own scratch folder, with no edits to the repository";
let mayRun = values["may-run"] ?? "";
if (!mayRun) {
  let declared = [];
  try {
    if (existsSync(join(root, "package.json"))) {
      const scripts = Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {});
      declared = ["test", "check", "lint", "typecheck"].filter((name) => scripts.includes(name));
    }
  } catch {
    // An unreadable package.json leaves the declared checks for the initiator.
  }
  mayRun = declared.length
    ? `the project's declared checks: ${declared.map((name) => `\`npm ${name === "test" ? "test" : `run ${name}`}\``).join(", ")}; and ${PROBES}`
    : PROBES;
  if (!declared.length) notes.push('no declared npm checks found: add the project\'s checks to "May run"');
}

const budget =
  round === 1
    ? `Review 1 of at most ${plan.rounds}: the first selected independent review, broad by default.${plan.depth === "quick" ? " Review 2 only if it is Blocking." : ""}`
    : round === 2
      ? `Review 2 of at most ${plan.rounds}: a focused follow-up on the range since Review 1; if it stays Blocking, adjudicate and diagnose${plan.rounds > 2 ? " before any Review 3" : ""}.`
      : "Review 3 of 3: exceptional, separately authorized and final; if it stays Blocking, rethink the approach rather than correct again.";
const planLine = `${plan.depth}, tier ${plan.tier}, ${letter ? `reviewer ${letter} of ${plan.reviewers}` : `${plan.reviewers} reviewer${plan.reviewers === 1 ? "" : "s"}`}, up to Review ${plan.rounds}, model ${plan.model.value}${plan.model.value === "auto" ? ` (${plan.reviewerModel})` : ""}${plan.humans ? `, humans ${plan.humans}` : ""}`;

// The method is read from the base when Review Work lives in the reviewed repository, so a change to Review Work
// never supplies the method that reviews it.
const methodFiles = [SKILL, join(dirname(SKILL), "references", "work.md")];
const methodInRepo = methodFiles.every((path) => !relative(root, path).startsWith(".."));
const baseCommit = commitOf(values.base);
const methodAtBase =
  methodInRepo &&
  methodFiles.every((path) => {
    try {
      git(root, ["cat-file", "-e", `${baseCommit}:${relative(root, path).split("\\").join("/")}`]);
      return true;
    } catch {
      return false;
    }
  });
if (methodInRepo && !methodAtBase)
  notes.push("Review Work is not at the base: the Method line points to the reviewed state");
const method = `${tick(methodFiles)}${methodAtBase ? `, read from the base ${baseCommit.slice(0, 12)} (git show ${baseCommit.slice(0, 12)}:<path>)` : ""}`;

// For Review 2 or 3, the size of the correction diff since the previous review's reviewed state.
let correction = null;
if (round > 1 && diffBase !== values.base) {
  const stat = git(root, ["diff", "--numstat", diffBase, head])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  correction = {
    from: commitOf(diffBase).slice(0, 12),
    files: stat.length,
    insertions: stat.reduce((sum, [added]) => sum + (Number(added) || 0), 0),
    deletions: stat.reduce((sum, [, removed]) => sum + (Number(removed) || 0), 0),
  };
}

const lines = [
  `Review: ${round}`,
  `Plan: ${planLine}`,
  `Boundary: ${values.boundary ?? ""}`,
  `Reviewed state: ${head.slice(0, 12)}`,
  `Method: ${method}`,
  `Agreement: ${tick(agreement)}`,
  `Docs: ${docs.length ? tick(docs) : "none"}`,
  `Review rules: ${rules.length ? `${tick(rules)}${rulesEdited ? `, read from the base ${rulesAt.slice(0, 12)} (git show ${rulesAt.slice(0, 12)}:<path>)` : ""}` : "none"}`,
  `Diff: ${commitOf(diffBase).slice(0, 12)}..${head.slice(0, 12)}`,
  `Evidence: ${values.evidence.length ? tick(values.evidence) : "none"}`,
  `May run: ${mayRun}`,
  ...(round > 1 ? [`Previous report: ${previousReport ? tick([previousReport]) : ""}`] : []),
  `Report: ${tick([reportPath])}`,
];
mkdirSync(dirname(briefPath), { recursive: true });
writeFileSync(briefPath, `${lines.join("\n")}\n`);
mkdirSync(dirname(reportPath), { recursive: true });

const check = spawnSync(process.execPath, [CHECK_BRIEF, briefPath, "--root", root, "--json"], { encoding: "utf8" });
let checked;
try {
  checked = JSON.parse(check.stdout);
} catch {
  fail(`check-brief failed: ${(check.stderr || check.stdout).trim()}`);
}

const result = {
  command: "review-packet",
  root,
  brief: briefPath,
  review: round,
  diff: `${diffBase}..${values.head}`,
  changedFiles: changed.length,
  plan: {
    depth: plan.depth,
    tier: plan.tier,
    reviewers: plan.reviewers,
    reviewer: letter || null,
    rounds: plan.rounds,
    humans: plan.humans,
    model: plan.model.value,
    reviewerModel: plan.reviewerModel,
    evidence: plan.evidence,
    because: plan.because
      .filter((match) => match.depth !== "off")
      .map(({ source, name, depth, tier, detail }) => ({ source, name, depth, tier, detail })),
  },
  budget,
  correctionDiff: correction,
  notes,
  checkBrief: { ok: checked.ok, problems: checked.problems },
};
if (values.json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Brief: ${briefPath}`);
  console.log(lines.map((line) => `  ${line}`).join("\n"));
  console.log(`Changed files: ${changed.length}.`);
  const active = result.plan.because;
  console.log(
    active.length
      ? `Plan: ${plan.depth} because:\n${active.map((each) => `- ${each.source === "built-in" ? `built-in "${each.name}"` : each.name}: ${each.detail.slice(0, 3).join("; ")}`).join("\n")}`
      : `Plan: ${plan.depth}, the default; no trigger or rule matched.`,
  );
  console.log(`Evidence for a ${plan.depth} review: ${plan.evidence}.`);
  console.log(`Round budget: ${budget}`);
  if (correction)
    console.log(
      `Correction diff since Review ${round - 1}'s reviewed state ${correction.from}: ${correction.files} files, +${correction.insertions} -${correction.deletions} lines.`,
    );
  for (const note of notes) console.log(`Note: ${note}`);
  console.log(
    checked.ok
      ? "check-brief: passes. Dispatch this brief."
      : `check-brief: refused. Fill these, then rerun check-brief:\n${checked.problems.map((each) => `- ${each.line}: ${each.problem}`).join("\n")}`,
  );
}
process.exit(checked.ok ? 0 : 1);

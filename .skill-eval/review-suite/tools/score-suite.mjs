// Scores stored suite results: each review's first-line judgment, and for a defective variant whether a finding
// locates the defect: it names the defective file and cites a line or line range within three lines of a proven
// location. Reports per arm, per defect class and variant kind, with held-out cases apart.
// Usage (repository root): node .skill-eval/review-suite/tools/score-suite.mjs <result-id>... [--json <file>]
// A result ID may be an aggregate of trials or a single result.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const suite = path.join(root, ".skill-eval/review-suite");
const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const ids = args.filter((value, index) => value !== "--json" && args[index - 1] !== "--json");
const groups = new Map(
  JSON.parse(readFileSync(path.join(suite, "groups.json"), "utf8")).groups.map((row) => [row.id, row]),
);
const cases = new Map(
  JSON.parse(readFileSync(path.join(suite, "cases.json"), "utf8")).cases.map((entry) => [entry.case, entry]),
);
const JUDGMENTS = ["Pass", "Non-blocking", "Inconclusive", "Blocking"];
const TOLERANCE = 3;

function trialDirectories(id) {
  const directory = path.join(root, ".skill-eval/runs", id);
  const aggregate = path.join(directory, "aggregate.json");
  if (!existsSync(aggregate)) return [directory];
  return JSON.parse(readFileSync(aggregate, "utf8")).trials.map((trial) =>
    path.join(root, ".skill-eval/runs", trial.id),
  );
}

// Line numbers a finding cites: "file:12", "file:12-14", "line 12", "lines 12-14", "lines 12 to 14", "L12".
function citedRanges(text) {
  const ranges = [];
  const pattern = /(?::|\blines?\s+|\bL)(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/gi;
  for (const match of text.matchAll(pattern)) {
    const start = Number(match[1]);
    ranges.push([start, match[2] ? Number(match[2]) : start]);
  }
  return ranges;
}

function locates(review, locations) {
  // A finding is a paragraph or list item; a defect counts as located when one finding names the file and a nearby line.
  const findings = review.split(/\n\s*\n|\n(?=\s*(?:\d+\.|[-*])\s)/);
  return locations.some((location) => {
    const [, file, line] = location.match(/^(.+):(\d+)$/) ?? [];
    if (!file) return false;
    const base = path.basename(file);
    return findings.some(
      (finding) =>
        finding.includes(base) &&
        citedRanges(finding).some(
          ([start, end]) => start - TOLERANCE <= Number(line) && Number(line) <= end + TOLERANCE,
        ),
    );
  });
}

const rows = [];
for (const id of ids) {
  for (const trial of trialDirectories(id)) {
    for (const [groupId, group] of groups) {
      const groupDirectory = path.join(trial, "groups", groupId);
      if (!existsSync(groupDirectory)) continue;
      const facts = cases.get(group.case).variants[group.variant];
      // The advisory judge's answer to the group's first question, in both label orders when swapped: "yes" or
      // "no" when the orders agree, "split" when they do not, null when the group was not reviewed.
      const gradeFile = path.join(groupDirectory, "semantic-grade.json");
      const grade = existsSync(gradeFile) ? JSON.parse(readFileSync(gradeFile, "utf8")) : null;
      const judged = (arm) => {
        if (grade?.state !== "complete") return null;
        const orders = [grade.answers?.[0]?.[arm], grade.swap?.answers?.[0]?.[arm]].filter(Boolean);
        return orders.length === 0 ? null : orders.every((answer) => answer === orders[0]) ? orders[0] : "split";
      };
      for (const arm of ["baseline", "candidate"]) {
        const reviewFile = path.join(groupDirectory, arm, "workspace", "review.md");
        const review = existsSync(reviewFile) ? readFileSync(reviewFile, "utf8") : null;
        const first = review?.split("\n")[0].trim() ?? "";
        const judgment =
          JUDGMENTS.find((value) => first === `Judgment: ${value}`) ?? (review ? "malformed" : "missing");
        rows.push({
          trial: path.basename(trial),
          group: groupId,
          case: group.case,
          variant: group.variant,
          kind: group.kind,
          held_out: group.held_out,
          class: facts.class ?? "clean",
          clean_excluded: Boolean(group.clean_excluded),
          arm,
          judgment,
          located: facts.defective && review ? locates(review, facts.location) : null,
          judged: judged(arm),
        });
      }
    }
  }
}

const rate = (part, whole) => (whole === 0 ? "-" : `${part}/${whole} (${Math.round((100 * part) / whole)}%)`);
function summarize(label, selected) {
  const out = [];
  for (const arm of ["baseline", "candidate"]) {
    const armRows = selected.filter((row) => row.arm === arm);
    // Clean rows count only the variants the clean audit kept (clean-audit.json); a review accepts a change with
    // Pass or Non-blocking, and rejects it with Inconclusive, Blocking, or no review.
    const clean = armRows.filter((row) => row.class === "clean" && !row.clean_excluded);
    const accepted = (row) => row.judgment === "Pass" || row.judgment === "Non-blocking";
    const defective = armRows.filter((row) => row.class !== "clean");
    out.push(
      `${label}\t${arm}\tclean accepted ${rate(clean.filter(accepted).length, clean.length)}` +
        `\tclean pass ${rate(clean.filter((row) => row.judgment === "Pass").length, clean.length)}` +
        `\tclean blocking ${rate(clean.filter((row) => row.judgment === "Blocking").length, clean.length)}` +
        `\tdefect not passed ${rate(defective.filter((row) => row.judgment !== "Pass").length, defective.length)}` +
        `\tdefect blocking ${rate(defective.filter((row) => row.judgment === "Blocking").length, defective.length)}` +
        `\tdefect located ${rate(defective.filter((row) => row.located).length, defective.length)}` +
        `\tjudge: identified ${rate(defective.filter((row) => row.judged === "yes").length, defective.length)}` +
        ` (split ${defective.filter((row) => row.judged === "split").length})`,
    );
  }
  return out.join("\n");
}

// pass^k for a defective group: in every trial the judge, in both label orders, says the review identified the
// defect, and the review did not pass the change.
function passAll(selected) {
  const byKey = new Map();
  for (const row of selected.filter((entry) => entry.class !== "clean")) {
    const key = `${row.group}/${row.arm}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row.judged === "yes" && row.judgment !== "Pass"]);
  }
  const out = [];
  for (const arm of ["baseline", "candidate"]) {
    const entries = [...byKey].filter(([key]) => key.endsWith(`/${arm}`)).map(([, values]) => values);
    out.push(
      `${arm} caught in every trial ${rate(entries.filter((values) => values.every(Boolean)).length, entries.length)}`,
    );
  }
  return out.join("; ");
}

const tuning = rows.filter((row) => !row.held_out);
const held = rows.filter((row) => row.held_out);
const lines = [`${rows.length} reviews from ${new Set(rows.map((row) => row.trial)).size} trial results`];
lines.push(summarize("tuning", tuning), summarize("held-out", held));
for (const cls of ["logic", "convention", "security"]) {
  lines.push(
    summarize(
      `all ${cls}`,
      rows.filter((row) => row.class === cls),
    ),
  );
}
lines.push(
  summarize(
    "all real",
    rows.filter((row) => row.variant === "real"),
  ),
);
lines.push(`pass^k tuning: ${passAll(tuning)}`, `pass^k held-out: ${passAll(held)}`);
const malformed = rows.filter((row) => row.judgment === "malformed" || row.judgment === "missing");
lines.push(`malformed or missing reviews: ${malformed.length}`);
console.log(lines.join("\n"));
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify({ rows }, null, 2)}\n`);

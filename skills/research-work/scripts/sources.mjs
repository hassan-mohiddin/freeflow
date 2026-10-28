#!/usr/bin/env node
// Check a report's citations against their sources, offline: each `S<n>:path:line` exists at the commit its ledger
// row pins, and each quote attributed to a source appears in a saved copy of it. What cannot be checked is listed
// as not checked, never as passed. quote-check does the same for a judge's answers: each score's quote must appear
// in the output it judged. bib writes a paper's .bib from the source ledger, marking every source not verified.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { ledgerRows } from "./lib/formats.mjs";
import { LOOKUP_RULE, lookupRow, pinIdentifier } from "./lib/lookup.mjs";
import { bibFromLedger, parseBib } from "./lib/paper.mjs";
import { loadReads, readsFromTranscript, wasRead } from "./lib/reads.mjs";
import { codeCitations, looseQuotes, normalizeForQuote, quoteCitations } from "./lib/report.mjs";
import { fileAtCommit } from "./lib/support.mjs";

const USAGE = [
  "Usage: sources.mjs cite-check <report.md> --ledger <sources.md> [--repo <name>=<clone>]... [--copy S<n>=<file>]... [--json]",
  "       sources.mjs quote-check <judge answers .jsonl> [--json]",
  "       sources.mjs bib <sources.md> --out <refs.bib> [--from <existing.bib>]",
  "       sources.mjs lookup <sources.md> --cache <lookups.json> [--only S<n>,...] [--search-titles] [--refresh] [--json]",
  "       sources.mjs reads <transcript.jsonl>... --ledger <sources.md> --repo <name>=<clone>... --out <reads.jsonl>",
  "",
  "lookup goes online, so run it only when the user asks: a DOI through Crossref (with its retraction and correction",
  "notices), an arXiv ID through arXiv, a URL's page. A record verifies when its title matches the Source's both ways,",
  "it is not a correction, reply or other part of the work, its year and first author agree with the Source's, and",
  "the Source names one of its authors. --search-titles searches OpenAlex for rows with no identifier and reports a",
  "candidate DOI, never a verdict. A dead link is looked up in the Wayback Machine. Requests to one host are spaced.",
  "Answers are cached in --cache (not a service's failure to answer); --refresh asks again. It never edits the",
  "ledger; it says what each row's Lookup should read.",
  "cite-check --reads <reads.jsonl> also fails a code citation with a line no read covers; reads makes that file",
  "from Claude Code transcripts, counting a clone's files only when the clone is at the pinned commit.",
  "",
  "--repo maps a ledger pin's repository name (the part before @) to a local clone holding that commit.",
  "--copy maps a source ID to a saved copy of its text, for quote checks.",
  'quote-check reads one judge answer per line, {"item", "score", "quote", "output"}, with output the path of the',
  "judged output (relative to the answers file), and refuses an answer whose quote is missing, under four words, or",
  "not in that output.",
].join("\n");

function fail(message) {
  console.error(message);
  process.exit(2);
}

function pairs(values, label) {
  const map = new Map();
  for (const value of values ?? []) {
    const at = value.indexOf("=");
    if (at < 1) fail(`${label} needs <key>=<value>, got "${value}"`);
    map.set(value.slice(0, at), value.slice(at + 1));
  }
  return map;
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      ledger: { type: "string" },
      cache: { type: "string" },
      only: { type: "string" },
      refresh: { type: "boolean", default: false },
      "search-titles": { type: "boolean", default: false },
      reads: { type: "string" },
      out: { type: "string" },
      from: { type: "string" },
      repo: { type: "string", multiple: true },
      copy: { type: "string", multiple: true },
      json: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (parsed.values.help) {
  console.log(USAGE);
  process.exit(0);
}
const [command, report] = parsed.positionals;

if (command === "bib") {
  if (!report || !parsed.values.out) fail(USAGE);
  let rows;
  let from = [];
  try {
    rows = ledgerRows(readFileSync(report, "utf8"));
    if (parsed.values.from) from = parseBib(readFileSync(parsed.values.from, "utf8"));
  } catch (error) {
    fail(`cannot read: ${error.message}`);
  }
  const bib = bibFromLedger(rows, { from });
  writeFileSync(parsed.values.out, bib.text);
  console.log(
    `${parsed.values.out}: ${rows.size} entries; ${bib.matched.length} completed from ${parsed.values.from ?? "no --from file"}; ${bib.unverified.length} not verified`,
  );
  for (const id of bib.unverified)
    console.log(`  not verified: ${id} (${rows.get(id).Source}): its entry carries a note`);
  process.exit(0);
}
if (command === "lookup") {
  if (!report || !parsed.values.cache) fail(USAGE);
  const rows = ledgerRows(readFileSync(report, "utf8"));
  const only = parsed.values.only ? new Set(parsed.values.only.split(",").map((id) => id.trim())) : null;
  // --refresh asks again for the rows looked up; the cache keeps every other row's answer.
  const cache = existsSync(parsed.values.cache) ? JSON.parse(readFileSync(parsed.values.cache, "utf8")) : {};
  const results = [];
  for (const [id, row] of rows) {
    if (only && !only.has(id)) continue;
    const identifier = pinIdentifier(row.Pin);
    // Two rows can share an identifier with different Source lines, and the match depends on the Source.
    const searching = parsed.values["search-titles"] && !identifier.value;
    const key = identifier.value
      ? `${identifier.kind}:${identifier.value}\u0000${row.Source}`
      : searching
        ? `title\u0000${row.Source}`
        : null;
    let result;
    // An answer judged under an older match rule is asked again, so a changed rule never leaves an old verdict.
    if (key && cache[key]?.rule === LOOKUP_RULE && !parsed.values.refresh)
      result = { ...cache[key].result, cached: cache[key].at };
    else {
      // One row that cannot be looked up (a malformed pin) does not stop the run or lose the answers before it.
      try {
        result = await lookupRow({ ...row, ID: id }, undefined, { searchTitles: parsed.values["search-titles"] });
      } catch (error) {
        result = {
          id,
          pin: row.Pin,
          lookup: "unresolved",
          notices: [],
          unanswered: true,
          detail: `could not be looked up: ${error.message}`,
        };
      }
      // An answer the service never gave (no reply, a rate limit, a server error) is asked again next time.
      if (key && !result.unanswered)
        cache[key] = { at: new Date().toISOString(), rule: LOOKUP_RULE, source: row.Source, result };
    }
    results.push({ ...result, id, current: row.Lookup });
  }
  mkdirSync(dirname(resolve(parsed.values.cache)), { recursive: true });
  writeFileSync(parsed.values.cache, `${JSON.stringify(cache, null, 2)}\n`);
  const flagged = results.filter(
    (result) =>
      (result.lookup && result.lookup !== result.current) ||
      // A retraction, a correction or an erratum sends the claims leaning on the source back to be read again.
      result.notices.some((notice) => ["retraction", "correction", "erratum", "not checked"].includes(notice.type)),
  );
  if (parsed.values.json) console.log(JSON.stringify({ ledger: report, results }, null, 2));
  else {
    console.log(`${report}: ${results.length} row(s) looked up; ${flagged.length} need attention`);
    for (const result of results) {
      const lookup = result.lookup ?? "not online";
      const change =
        result.lookup && result.lookup !== result.current ? ` (Lookup now ${result.current || "empty"})` : "";
      console.log(
        `  ${result.id}: ${lookup}${change}: ${result.detail}${result.cached ? ` [cached ${result.cached}]` : ""}`,
      );
      for (const notice of result.notices)
        console.log(`    ${notice.type}${notice.doi ? ` ${notice.doi}` : ""}: ${notice.title}`);
    }
  }
  process.exit(flagged.length === 0 ? 0 : 1);
}
if (command === "reads") {
  const transcripts = parsed.positionals.slice(1);
  if (transcripts.length === 0 || !parsed.values.ledger || !parsed.values.out) fail(USAGE);
  const pins = new Map();
  for (const [id, row] of ledgerRows(readFileSync(parsed.values.ledger, "utf8"))) {
    const pin = /^(\S+)@([0-9a-f]{7,40})$/.exec(row.Pin ?? "");
    if (pin) pins.set(id, { repo: pin[1], commit: pin[2] });
  }
  const clones = pairs(parsed.values.repo, "--repo");
  const heads = new Map();
  for (const [repo, clone] of clones) {
    const head = spawnSync("git", ["-C", clone, "rev-parse", "HEAD"], { encoding: "utf8" });
    if (head.status === 0) heads.set(repo, head.stdout.trim());
  }
  for (const [id, pin] of pins) {
    const head = heads.get(pin.repo);
    if (head && !head.startsWith(pin.commit) && !pin.commit.startsWith(head))
      console.error(
        `${id}: the ${pin.repo} clone is at ${head.slice(0, 12)}, not the pinned ${pin.commit.slice(0, 12)}, so reads of its files do not count (git show <pin>:<path> reads still do)`,
      );
  }
  const reads = transcripts.flatMap((path) => readsFromTranscript(readFileSync(path, "utf8"), { clones, pins, heads }));
  writeFileSync(parsed.values.out, reads.map((read) => JSON.stringify(read)).join("\n") + (reads.length ? "\n" : ""));
  console.log(
    `${parsed.values.out}: ${reads.length} read(s) of ${new Set(reads.map((read) => read.source)).size} source(s)`,
  );
  process.exit(0);
}
if (command === "quote-check") {
  if (!report) fail(USAGE);
  quoteCheck(report, parsed.values.json);
}
if (command !== "cite-check" || !report || !parsed.values.ledger) fail(USAGE);

/** Each judge answer's quote must be found, at least four words, in the output it judged; exits with the result. */
function quoteCheck(path, json) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
  const results = [];
  lines.forEach((raw, index) => {
    if (raw.trim() === "") return;
    const line = index + 1;
    let answer;
    try {
      answer = JSON.parse(raw);
    } catch {
      results.push({ line, status: "failed", reason: "not valid JSON" });
      return;
    }
    const where = { line, item: answer.item ?? null, score: answer.score ?? null };
    const quote = typeof answer.quote === "string" ? normalizeForQuote(answer.quote) : "";
    if (quote === "") return results.push({ ...where, status: "failed", reason: "the answer has no quote" });
    if (quote.split(" ").length < 4)
      return results.push({ ...where, status: "failed", reason: "a quote needs at least four words" });
    if (typeof answer.output !== "string")
      return results.push({ ...where, status: "failed", reason: "the answer names no output" });
    const output = resolve(dirname(path), answer.output);
    if (!existsSync(output))
      return results.push({ ...where, status: "failed", reason: `${answer.output} does not exist` });
    const found = normalizeForQuote(readFileSync(output, "utf8")).includes(quote);
    results.push({ ...where, status: found ? "ok" : "failed", reason: found ? null : `not found in ${answer.output}` });
  });
  const failed = results.filter((result) => result.status === "failed");
  if (json) console.log(JSON.stringify({ answers: path, results }, null, 2));
  else {
    console.log(`${path}: ${results.length} answer(s); ${results.length - failed.length} ok, ${failed.length} failed`);
    for (const result of failed) console.log(`  failed: line ${result.line}: ${result.reason}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

const read = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
};
const text = read(report);
const ledger = ledgerRows(read(parsed.values.ledger));
const repos = pairs(parsed.values.repo, "--repo");
const copies = pairs(parsed.values.copy, "--copy");
const reads = parsed.values.reads ? loadReads(parsed.values.reads) : null;

const fileAt = fileAtCommit;

const results = [];
for (const citation of codeCitations(text)) {
  const base = { line: citation.line, citation: citation.text };
  const row = ledger.get(citation.source);
  if (!row) {
    results.push({ ...base, status: "failed", reason: `${citation.source} is not in the source ledger` });
    continue;
  }
  const pin = /^(\S+)@([0-9a-f]{7,40})$/.exec(row.Pin ?? "");
  if (!pin) {
    results.push({
      ...base,
      status: "failed",
      reason: `${citation.source} is not pinned as <repository>@<commit> (Pin: ${row.Pin})`,
    });
    continue;
  }
  if (citation.start < 1 || citation.end < citation.start) {
    results.push({ ...base, status: "failed", reason: "the line range is empty or reversed" });
    continue;
  }
  const clone = repos.get(pin[1]);
  if (!clone) {
    results.push({ ...base, status: "not checked", reason: `no --repo ${pin[1]}=<clone> given` });
    continue;
  }
  const file = fileAt(clone, pin[2], citation.path);
  if (file.error) results.push({ ...base, status: "failed", reason: `${citation.path} at ${pin[2]}: ${file.error}` });
  else if (citation.end > file.count) {
    results.push({
      ...base,
      status: "failed",
      reason: `${citation.path} has ${file.count} lines at ${pin[2]}; the citation ends at ${citation.end}`,
    });
  } else if (
    reads &&
    !wasRead(reads, { source: citation.source, path: citation.path, start: citation.start, end: citation.end })
  )
    results.push({
      ...base,
      status: "failed",
      reason: `no recorded read covers ${citation.path}:${citation.start}-${citation.end}`,
    });
  else results.push({ ...base, status: "ok" });
}

const copyText = new Map();
for (const citation of quoteCitations(text)) {
  const base = { line: citation.line, citation: citation.text };
  if (!ledger.has(citation.source)) {
    results.push({ ...base, status: "failed", reason: `${citation.source} is not in the source ledger` });
    continue;
  }
  const words = citation.quote.trim().split(/\s+/).length;
  if (words < 4) {
    results.push({ ...base, status: "failed", reason: `a quote must be at least four words, this one has ${words}` });
    continue;
  }
  if (citation.path) {
    // A quote from a file in a pinned repository is checked in that file at the commit.
    const pin = /^(\S+)@([0-9a-f]{7,40})$/.exec(ledger.get(citation.source).Pin ?? "");
    if (!pin) {
      results.push({ ...base, status: "failed", reason: `${citation.source} is not pinned as <repository>@<commit>` });
      continue;
    }
    const clone = repos.get(pin[1]);
    if (!clone) {
      results.push({ ...base, status: "not checked", reason: `no --repo ${pin[1]}=<clone> given` });
      continue;
    }
    const file = fileAt(clone, pin[2], citation.path);
    if (file.error) {
      results.push({ ...base, status: "failed", reason: `${citation.path} at ${pin[2]}: ${file.error}` });
      continue;
    }
    const found = normalizeForQuote(file.content).includes(normalizeForQuote(citation.quote));
    results.push(
      found
        ? { ...base, status: "ok" }
        : { ...base, status: "failed", reason: `the quote is not in ${citation.path} at ${pin[2]}` },
    );
    continue;
  }
  const path = copies.get(citation.source);
  if (!path) {
    results.push({ ...base, status: "not checked", reason: `no --copy ${citation.source}=<file> given` });
    continue;
  }
  if (!copyText.has(path)) copyText.set(path, normalizeForQuote(read(path)));
  const found = copyText.get(path).includes(normalizeForQuote(citation.quote));
  results.push(
    found ? { ...base, status: "ok" } : { ...base, status: "failed", reason: `the quote is not in ${path}` },
  );
}

// A quote beside a source that is not in a citation form is listed, so it is never passed unchecked.
for (const loose of looseQuotes(text))
  results.push({
    line: loose.line,
    citation: loose.text,
    status: "not checked",
    reason: 'a quote of four or more words beside a source ID, not in the form "the exact words" (S<n>)',
  });

const count = (status) => results.filter((result) => result.status === status).length;
const summary = {
  citations: results.length,
  ok: count("ok"),
  failed: count("failed"),
  notChecked: count("not checked"),
};
if (parsed.values.json) console.log(JSON.stringify({ report, ...summary, results }, null, 2));
else {
  console.log(
    `${report}: ${summary.citations} citation(s); ${summary.ok} ok, ${summary.failed} failed, ${summary.notChecked} not checked`,
  );
  if (!reads && codeCitations(text).length > 0)
    console.log(
      "  note: read ranges were not checked (no --reads); this note does not count against the check, which passes on 0 failed and 0 not checked",
    );
  for (const result of results.filter((entry) => entry.status !== "ok")) {
    console.log(`  ${result.status}: line ${result.line}: ${result.citation} (${result.reason})`);
  }
  if (summary.citations === 0) console.log("  no citations found: nothing was checked");
}
process.exit(summary.failed === 0 ? 0 : 1);

#!/usr/bin/env node
// Check a report's citations against their sources, offline: each `S<n>:path:line` exists at the commit its ledger
// row pins, and each quote attributed to a source appears in a saved copy of it. What cannot be checked is listed
// as not checked, never as passed. quote-check does the same for a judge's answers: each score's quote must appear
// in the output it judged. bib writes a paper's .bib from the source ledger, marking every source not verified.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { ledgerRows } from "./lib/formats.mjs";
import { bibFromLedger, parseBib } from "./lib/paper.mjs";
import { codeCitations, normalizeForQuote, quoteCitations } from "./lib/report.mjs";

const USAGE = [
  "Usage: sources.mjs cite-check <report.md> --ledger <sources.md> [--repo <name>=<clone>]... [--copy S<n>=<file>]... [--json]",
  "       sources.mjs quote-check <judge answers .jsonl> [--json]",
  "       sources.mjs bib <sources.md> --out <refs.bib> [--from <existing.bib>]",
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

/** The file's text and line count at the commit, or the reason it could not be read. */
const fileCache = new Map();
function fileAt(clone, commit, path) {
  const key = `${clone}\0${commit}\0${path}`;
  if (!fileCache.has(key)) {
    try {
      const content = execFileSync("git", ["-C", clone, "show", `${commit}:${path}`], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
      fileCache.set(key, {
        content,
        count: content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length,
      });
    } catch (error) {
      const message = String(error.stderr ?? error.message)
        .trim()
        .split("\n")[0];
      fileCache.set(key, { error: message });
    }
  }
  return fileCache.get(key);
}

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
  } else results.push({ ...base, status: "ok" });
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
  for (const result of results.filter((entry) => entry.status !== "ok")) {
    console.log(`  ${result.status}: line ${result.line}: ${result.citation} (${result.reason})`);
  }
  if (summary.citations === 0) console.log("  no citations found: nothing was checked");
}
process.exit(summary.failed === 0 ? 0 : 1);

#!/usr/bin/env node
// A paper's tools: receipts for the commands that make its figures and builds, revision by patch, the build through
// Pandoc, and the check of the built PDF. The paper route is in references/paper.md; the formats in
// references/artifacts.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";

import { anchor, applyPatch, stripIds } from "./lib/paper.mjs";
import { recordRun, resolveProgram } from "./lib/study.mjs";

const USAGE = [
  "Usage: paper.mjs run --ledger <runs.jsonl> [--input <path>]... [--output <path>]... -- <command> [args...]",
  "       paper.mjs anchor <draft.md> [--out <draft.blocks.json>]",
  "       paper.mjs apply <draft.md> --patch <patch.json> --out <revised.md> [--manifest <draft.blocks.json>]",
  "       paper.mjs build <paper.md> --to pdf|docx|latex|html --out <file> --ledger <runs.jsonl> [--venue]",
  "                       [--bib <refs.bib>] [--csl <style.csl>] [--template <file>] [--engine latex|browser]",
  "                       [--pdf-engine <program>] [--browser <program>]",
  "       paper.mjs check-pdf <paper.pdf> [--max-pages <n>] [--max-words <n>] [--source <paper.md>] [--require <heading>]...",
  "",
  "run records a receipt for a paper without a study plan (a study's own commands go through study.mjs run).",
  "build records each command it runs in the ledger. --venue builds from a copy without the claim-ID parentheses.",
  "For PDF, --engine latex uses the first of tectonic, xelatex, lualatex, pdflatex found (or --pdf-engine);",
  "--engine browser has Pandoc write HTML and a headless Chromium or Chrome print it (or --browser).",
].join("\n");

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

const separator = process.argv.indexOf("--");
const own = separator < 0 ? process.argv.slice(2) : process.argv.slice(2, separator);
const commandArgv = separator < 0 ? [] : process.argv.slice(separator + 1);

let parsed;
try {
  parsed = parseArgs({
    args: own,
    allowPositionals: true,
    options: {
      ledger: { type: "string" },
      input: { type: "string", multiple: true, default: [] },
      output: { type: "string", multiple: true, default: [] },
      out: { type: "string" },
      patch: { type: "string" },
      manifest: { type: "string" },
      to: { type: "string" },
      venue: { type: "boolean", default: false },
      bib: { type: "string" },
      csl: { type: "string" },
      template: { type: "string" },
      engine: { type: "string" },
      "pdf-engine": { type: "string" },
      browser: { type: "string" },
      "max-pages": { type: "string" },
      "max-words": { type: "string" },
      source: { type: "string" },
      require: { type: "string", multiple: true, default: [] },
      json: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values, positionals } = parsed;
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const [command, target] = positionals;

const read = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
};

/** Run a command with a receipt in the ledger, beside which its paths are recorded. */
function recorded(argv, inputs, outputs) {
  const ledger = resolve(values.ledger);
  mkdirSync(dirname(ledger), { recursive: true });
  const { receipt, stdout, stderr } = recordRun(ledger, dirname(ledger), argv, { inputs, outputs });
  if (stdout?.length) process.stdout.write(stdout);
  if (stderr?.length) process.stderr.write(stderr);
  console.log(`paper.mjs: receipt ${receipt.id}, exit ${receipt.exit_code ?? receipt.error}`);
  return receipt;
}

if (command === "run") {
  if (!values.ledger || commandArgv.length === 0) fail(USAGE);
  const receipt = recorded(commandArgv, values.input, values.output);
  process.exit(receipt.exit_code ?? 1);
} else if (command === "anchor") {
  if (!target) fail(USAGE);
  const manifest = anchor(read(target), basename(target));
  const out = values.out ?? `${target.replace(/\.md$/, "")}.blocks.json`;
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${out}: ${manifest.blocks.length} blocks of ${target} (sha256 ${manifest.sha256.slice(0, 12)})`);
} else if (command === "apply") {
  if (!target || !values.patch || !values.out) fail(USAGE);
  const manifestPath = values.manifest ?? `${target.replace(/\.md$/, "")}.blocks.json`;
  let result;
  try {
    result = applyPatch(read(target), JSON.parse(read(manifestPath)), JSON.parse(read(values.patch)));
  } catch (error) {
    fail(`${values.patch}: ${error.message}`, 1);
  }
  writeFileSync(values.out, result.text);
  const reportPath = `${values.out.replace(/\.md$/, "")}.apply.json`;
  writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`);
  console.log(
    `${values.out}: ${result.report.changes.length} change(s) applied, ${result.report.untouched_blocks} block(s) untouched; report ${reportPath}`,
  );
} else if (command === "build") {
  if (!target || !values.out || !values.ledger || !["pdf", "docx", "latex", "html"].includes(values.to)) fail(USAGE);
  if (!resolveProgram("pandoc", process.cwd())) fail("pandoc is not on PATH: install Pandoc to build the paper", 1);
  let source = target;
  if (values.venue) {
    const venue = stripIds(read(target));
    source = join(dirname(values.out), `${basename(target, extname(target))}.venue.md`);
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, venue.text);
    console.log(`${source}: ${venue.removed} claim-ID group(s) removed`);
    for (const left of venue.remaining) console.log(`  claim ID left in the text: line ${left.line}: ${left.id}`);
  }
  const extras = [];
  const inputs = [source];
  if (values.bib) {
    extras.push("--citeproc", `--bibliography=${values.bib}`);
    inputs.push(values.bib);
  }
  if (values.csl) {
    extras.push(`--csl=${values.csl}`);
    inputs.push(values.csl);
  }
  if (values.template) {
    extras.push(values.to === "docx" ? `--reference-doc=${values.template}` : `--template=${values.template}`);
    inputs.push(values.template);
  }
  // Images are read relative to the paper.
  extras.push(`--resource-path=${dirname(resolve(target))}`);
  mkdirSync(dirname(resolve(values.out)), { recursive: true });
  let receipt;
  if (values.to !== "pdf") {
    const to = values.to === "html" ? ["--standalone", "--embed-resources"] : ["--standalone"];
    receipt = recorded(["pandoc", source, ...to, ...extras, "-o", values.out], inputs, [values.out]);
  } else {
    const engine = values.engine ?? (values.browser ? "browser" : "latex");
    if (engine === "latex") {
      const pdfEngine =
        values["pdf-engine"] ??
        ["tectonic", "xelatex", "lualatex", "pdflatex"].find((name) => resolveProgram(name, process.cwd()));
      if (!pdfEngine)
        fail(
          "no LaTeX engine (tectonic, xelatex, lualatex, pdflatex) on PATH: install one, or use --engine browser",
          1,
        );
      receipt = recorded(
        ["pandoc", source, "--standalone", `--pdf-engine=${pdfEngine}`, ...extras, "-o", values.out],
        inputs,
        [values.out],
      );
    } else if (engine === "browser") {
      const browser =
        values.browser ??
        ["chromium", "chromium-browser", "google-chrome", "chrome"].find((name) => resolveProgram(name, process.cwd()));
      if (!browser) fail("no Chromium or Chrome on PATH: name one with --browser, or use --engine latex", 1);
      const html = `${values.out.replace(/\.pdf$/, "")}.html`;
      const first = recorded(["pandoc", source, "--standalone", "--embed-resources", ...extras, "-o", html], inputs, [
        html,
      ]);
      if (first.exit_code !== 0) process.exit(first.exit_code ?? 1);
      receipt = recorded(
        [
          browser,
          "--headless",
          "--disable-gpu",
          "--no-sandbox",
          "--no-pdf-header-footer",
          `--print-to-pdf=${resolve(values.out)}`,
          `file://${resolve(html)}`,
        ],
        [html],
        [values.out],
      );
    } else fail(`--engine must be latex or browser\n${USAGE}`);
  }
  if (receipt.exit_code === 0 && !existsSync(values.out)) fail(`${values.out} was not written`, 1);
  process.exit(receipt.exit_code ?? 1);
} else if (command === "check-pdf") {
  if (!target) fail(USAGE);
  const problems = [];
  const notChecked = [];
  let pages = null;
  let words = null;
  if (resolveProgram("pdfinfo", process.cwd())) {
    const info = spawnSync("pdfinfo", [target], { encoding: "utf8" });
    const match = /^Pages:\s+(\d+)/m.exec(info.stdout ?? "");
    if (match) pages = Number(match[1]);
  }
  if (pages === null) {
    // Without pdfinfo: count page objects in the file. A PDF that keeps them in compressed streams is not counted.
    const raw = readFileSync(target).toString("latin1");
    const count = (raw.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    if (count > 0) pages = count;
  }
  if (resolveProgram("pdftotext", process.cwd())) {
    const text = spawnSync("pdftotext", ["-layout", target, "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
    if (text.status === 0) words = (text.stdout.match(/[A-Za-z0-9][^\s]*/g) ?? []).length;
  }
  if (values["max-pages"]) {
    if (pages === null) notChecked.push("pages (no pdfinfo, and no page objects found in the file)");
    else if (pages > Number(values["max-pages"]))
      problems.push(`${pages} pages, over the limit of ${values["max-pages"]}`);
  }
  if (values["max-words"]) {
    if (words === null) notChecked.push("words (pdftotext is not on PATH)");
    else if (words > Number(values["max-words"]))
      problems.push(`${words} words, over the limit of ${values["max-words"]}`);
  }
  if (values.require.length > 0) {
    if (!values.source) fail("--require needs --source, the Markdown the PDF was built from");
    const headings = read(values.source)
      .split("\n")
      .filter((line) => /^#{1,6}\s/.test(line))
      .map((line) =>
        line
          .replace(/^#+\s*/, "")
          .trim()
          .toLowerCase(),
      );
    for (const heading of values.require)
      if (!headings.some((each) => each === heading.toLowerCase() || each.startsWith(`${heading.toLowerCase()} `)))
        problems.push(`no "${heading}" section in ${values.source}`);
  }
  if (values.json)
    console.log(JSON.stringify({ pdf: target, pages, words, problems, not_checked: notChecked }, null, 2));
  else {
    console.log(
      `${target}: ${pages ?? "unknown"} page(s), ${words ?? "unknown"} word(s); ${problems.length} problem(s)`,
    );
    for (const problem of problems) console.log(`  problem: ${problem}`);
    for (const item of notChecked) console.log(`  not checked: ${item}`);
  }
  process.exit(problems.length === 0 && notChecked.length === 0 ? 0 : 1);
} else {
  fail(USAGE);
}

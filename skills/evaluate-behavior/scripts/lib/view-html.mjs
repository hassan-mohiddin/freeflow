import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { storedArms } from "./arms.mjs";
import { resolveResult } from "./view.mjs";

// Run content (responses, changed files, tool arguments) can be large or hostile; every value passes through esc().
const CONTENT_CAP = 20000;
const VALUE_CAP = 500;

/**
 * Writes one self-contained HTML page for a stored result or aggregate: inline CSS, no scripts, no network.
 * Returns the absolute path written. Selectors are refused because the page always covers the whole result.
 */
export async function writeHtml(
  target,
  file,
  { root = process.cwd(), selectors = { group: null, variant: null } } = {},
) {
  if (selectors.group !== null || selectors.variant !== null) {
    throw new Error("view --html renders the whole result; drop --group and --variant");
  }
  const html = await renderHtml(target, { root });
  const destination = path.resolve(root, file);
  await writeFile(destination, html);
  return destination;
}

export async function renderHtml(target, { root = process.cwd() } = {}) {
  const resultDirectory = await resolveResult(target, root);
  const aggregate = await readOptionalJson(path.join(resultDirectory, "aggregate.json"));
  if (aggregate !== null) {
    const parts = [
      claimSection(aggregate),
      `<p class="meta">Aggregate ${esc(aggregate.id)} · state ${esc(aggregate.state)} · trials ${aggregate.trials.length}/${esc(aggregate.requestedTrials)}</p>`,
    ];
    for (const trial of aggregate.trials) {
      parts.push(`<section class="trial"><h2>Trial ${esc(trial.id)} [${esc(trial.state)}]</h2>`);
      try {
        const trialDirectory = await resolveResult(trial.id, root);
        const summary = await readJson(path.join(trialDirectory, "summary.json"), `trial ${trial.id} summary`);
        parts.push(await resultBody(trialDirectory, summary));
      } catch (error) {
        parts.push(
          `<p class="missing">Trial result unavailable: ${esc(error instanceof Error ? error.message : String(error))}</p>`,
        );
      }
      parts.push("</section>");
    }
    return page(`Aggregate ${aggregate.id}`, parts.join("\n"));
  }
  const summary = await readJson(path.join(resultDirectory, "summary.json"), "result summary");
  return page(`Result ${summary.id}`, await resultBody(resultDirectory, summary));
}

async function resultBody(resultDirectory, summary) {
  const parts = [`<p class="meta">Result ${esc(summary.id)} · state ${esc(summary.state)}</p>`];
  for (const group of Array.isArray(summary.groups) ? summary.groups : []) {
    parts.push(await groupSection(resultDirectory, group));
  }
  return parts.join("\n");
}

async function groupSection(resultDirectory, group) {
  const groupDirectory = path.join(resultDirectory, "groups", group.id);
  const definition = await readJson(path.join(groupDirectory, "definition.json"), `definition for ${group.id}`);
  const grade = await readJson(
    path.join(groupDirectory, group.artifacts?.grade ?? "deterministic-grade.json"),
    `grade for ${group.id}`,
  );
  const parts = [
    `<section class="group"><h2>Group ${esc(group.id)} [${esc(group.state)}] <span class="muted">type=${esc(definition.type)}</span></h2>`,
    promptBlock(definition),
  ];
  const reviewQuestions = Array.isArray(definition.review_questions) ? definition.review_questions : [];
  if (reviewQuestions.length > 0) {
    parts.push(
      `<h3>Review questions</h3><ul>${reviewQuestions.map((question) => `<li>${esc(question)}</li>`).join("")}</ul>`,
    );
  }
  for (const arm of storedArms(group, definition)) {
    parts.push(await armSection(groupDirectory, arm, grade));
  }
  parts.push("</section>");
  return parts.join("\n");
}

function promptBlock(definition) {
  if (typeof definition.input?.prompt === "string") {
    return `<h3>Prompt</h3><pre>${esc(definition.input.prompt)}</pre>`;
  }
  const turns = Array.isArray(definition.input?.turns) ? definition.input.turns : [];
  return turns.map((turn, index) => `<h3>Turn ${index + 1} prompt</h3><pre>${esc(turn)}</pre>`).join("\n");
}

async function armSection(groupDirectory, arm, grade) {
  const variantDirectory = path.join(groupDirectory, arm);
  const run = await readJson(path.join(variantDirectory, "run.json"), `${arm} run`);
  const parts = [`<article class="arm"><h3>${esc(arm)} <span class="muted">[${esc(run.state)}]</span></h3>`];

  const finalFile = path.resolve(
    variantDirectory,
    typeof run.artifacts?.final === "string" ? run.artifacts.final : "final.md",
  );
  const finalText = await readText(finalFile);
  parts.push(
    `<h4>Final response</h4>${finalText === null ? '<p class="missing">No final response recorded.</p>' : preBlock(finalText)}`,
  );

  parts.push(await changedFilesBlock(run, variantDirectory));
  parts.push(toolCallsBlock(run));
  parts.push(checksBlock(grade, arm));
  if (run.metrics && typeof run.metrics === "object") parts.push(metricsBlock(run.metrics));
  const judged = await readOptionalJson(path.join(variantDirectory, "judged-grade.json"));
  if (judged !== null) parts.push(judgedBlock(judged));

  parts.push("</article>");
  return parts.join("\n");
}

async function changedFilesBlock(run, variantDirectory) {
  const changes = run.effects?.changes;
  if (!changes) return "";
  const workspace = typeof run.workspace === "string" ? path.resolve(variantDirectory, run.workspace) : null;
  const entries = [];
  for (const kind of ["created", "modified", "deleted"]) {
    for (const relative of Array.isArray(changes[kind]) ? changes[kind] : []) {
      entries.push(await changedFileEntry(kind, String(relative), workspace));
    }
  }
  if (entries.length === 0) return "<h4>Changed files</h4><p>None.</p>";
  return `<h4>Changed files</h4>${entries.join("\n")}`;
}

async function changedFileEntry(kind, relative, workspace) {
  const label = `${esc(kind)} ${esc(relative)}`;
  if (kind === "deleted")
    return `<details><summary>${label}</summary><p class="missing">Deleted; no content.</p></details>`;
  if (workspace === null)
    return `<details><summary>${label}</summary><p class="missing">Content unavailable.</p></details>`;
  const file = path.resolve(workspace, relative);
  if (!file.startsWith(`${workspace}${path.sep}`)) {
    return `<details><summary>${label}</summary><p class="missing">Path leaves the workspace; not shown.</p></details>`;
  }
  const text = await readText(file);
  if (text === null) return `<details><summary>${label}</summary><p class="missing">Content unavailable.</p></details>`;
  const cut = text.length > CONTENT_CAP;
  const shown = cut ? text.slice(0, CONTENT_CAP) : text;
  const note = cut ? `<p class="missing">Cut at ${CONTENT_CAP} of ${text.length} characters.</p>` : "";
  return `<details><summary>${label}</summary>${preBlock(shown)}${note}</details>`;
}

function toolCallsBlock(run) {
  const calls = Array.isArray(run.turns)
    ? run.turns.flatMap((turn) => (turn.toolActivity ?? []).map((entry) => ({ turn: turn.turn, entry })))
    : (run.toolActivity ?? []).map((entry) => ({ turn: null, entry }));
  if (calls.length === 0) return "<h4>Tool calls</h4><p>None.</p>";
  const rows = calls.map(({ turn, entry }) => {
    const where = turn === null ? "" : `turn ${esc(turn)} · `;
    const failed = entry.isError === true ? ' <span class="fail">error</span>' : "";
    return `<li>${where}<code>${esc(entry.toolName ?? "unknown")}</code>${failed} <code>${esc(compact(entry.args))}</code></li>`;
  });
  return `<h4>Tool calls</h4><ol>${rows.join("")}</ol>`;
}

function checksBlock(grade, arm) {
  const checks = Array.isArray(grade.checks) ? grade.checks.filter((check) => check.variant === arm) : [];
  if (checks.length === 0) return "<h4>Deterministic checks</h4><p>None for this arm.</p>";
  const rows = checks.map(
    (check) =>
      `<tr><td>${esc(check.id)}</td><td>${esc(check.kind)}</td><td class="${check.state === "pass" ? "pass" : check.state === "fail" ? "fail" : ""}">${esc(check.state)}</td><td><code>${esc(compact(check.expected))}</code></td><td><code>${esc(compact(check.observed))}</code></td></tr>`,
  );
  return `<h4>Deterministic checks</h4><table><thead><tr><th>id</th><th>kind</th><th>state</th><th>expected</th><th>observed</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function metricsBlock(metrics) {
  const rows = Object.entries(metrics).map(
    ([name, value]) => `<tr><td>${esc(name)}</td><td><code>${esc(compact(value))}</code></td></tr>`,
  );
  return `<h4>Metrics</h4><table><tbody>${rows.join("")}</tbody></table>`;
}

function judgedBlock(judged) {
  // The judged-grade shape is owned by the judging layer; show answers as rows when they are a list, else the raw record.
  if (Array.isArray(judged.answers)) {
    const rows = judged.answers.map((answer) => {
      const fields = answer !== null && typeof answer === "object" ? Object.entries(answer) : [["answer", answer]];
      return `<tr>${fields.map(([name, value]) => `<td><span class="muted">${esc(name)}</span> ${esc(compact(value))}</td>`).join("")}</tr>`;
    });
    return `<h4>Judged answers</h4><table><tbody>${rows.join("")}</tbody></table>`;
  }
  return `<h4>Judged answers</h4>${preBlock(JSON.stringify(judged, null, 2))}`;
}

function claimSection(aggregate) {
  if (!aggregate.claim) return "";
  const claim = aggregate.claim;
  const supported =
    claim.class === "rate-on-suite"
      ? `rate on this suite, k=${claim.k}`
      : `none${claim.reason ? ` (${claim.reason})` : ""}`;
  const beats = String(claim.beats ?? "").replace(/^not supported: /, "");
  return `<section class="claim"><h2>Claim</h2><p>${esc(supported)}</p><p class="muted">No &quot;beats&quot; claim: ${esc(beats)}</p></section>`;
}

function preBlock(text) {
  const value = String(text);
  const cut = value.length > CONTENT_CAP;
  return `<pre>${esc(cut ? value.slice(0, CONTENT_CAP) : value)}</pre>${cut ? `<p class="missing">Cut at ${CONTENT_CAP} of ${value.length} characters.</p>` : ""}`;
}

function compact(value) {
  if (value === undefined) return "-";
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "-");
  return text.length > VALUE_CAP ? `${text.slice(0, VALUE_CAP)}... (cut at ${VALUE_CAP} of ${text.length})` : text;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1d1f23; --muted: #5c6370; --border: #d8dce3; --code: #f5f6f8; --pass: #1a7f37; --fail: #cf222e; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #0f1115; --fg: #e6e8eb; --muted: #9aa3ad; --border: #2c313a; --code: #171a20; --pass: #3fb950; --fail: #ff7b72; }
}
:root[data-theme="dark"] { --bg: #0f1115; --fg: #e6e8eb; --muted: #9aa3ad; --border: #2c313a; --code: #171a20; --pass: #3fb950; --fail: #ff7b72; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 16px; }
h1 { font-size: 20px; }
h2 { font-size: 18px; margin: 0 0 8px; }
h3 { font-size: 16px; margin: 16px 0 6px; }
h4 { font-size: 14px; margin: 14px 0 4px; }
section, article { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 16px; }
.muted, .meta { color: var(--muted); font-size: 13px; }
.claim { border-top: 0; }
pre { background: var(--code); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0; }
code { font-size: 13px; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { border-bottom: 1px solid var(--border); padding: 4px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
details { margin: 6px 0; }
summary { cursor: pointer; font-family: ui-monospace, Menlo, monospace; font-size: 13px; overflow-wrap: anywhere; }
.pass { color: var(--pass); }
.fail { color: var(--fail); }
.missing { color: var(--muted); font-style: italic; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

async function readText(file) {
  if (!(await stat(file).catch(() => null))) return null;
  return readFile(file, "utf8");
}

async function readOptionalJson(file) {
  if (!(await stat(file).catch(() => null))) return null;
  return readJson(file, path.basename(file));
}

async function readJson(file, label) {
  let contents;
  try {
    contents = await readFile(file, "utf8");
  } catch {
    throw new Error(`Cannot read ${label}: ${file}`);
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(`${label} is not valid JSON: ${file}`);
  }
}

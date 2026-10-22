#!/usr/bin/env node
// Checks that every step of a Plan names the check that will show it worked (references/spec-and-plan-shapes.md).
// A step is a "### Slice" or "### Step" block, or an item of the list under "Ordered actions or slices", "Steps" or
// another heading that holds the Plan's ordered work. A block names its check in a filled field such as "Tests or
// observations:", "Check:" or "Verification claim...:"; a list item names it inline ("check: ...", "verify ...",
// "test ...", "observe ..."). It checks presence only; whether the check could catch a wrong result is the author's
// and the reviewer's judgment.
// Usage: plan-lint.mjs <plan.md>... [--json]
// Exit code 0 when every step names a check, 1 when a step does not or no step was found, 2 on a usage error.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const USAGE = "Usage: plan-lint.mjs <plan.md>... [--json]";
let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { json: { type: "boolean", default: false } } });
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}
const { values, positionals } = parsed;
if (!positionals.length) {
  console.error(USAGE);
  process.exit(2);
}

const STEP_HEADING = /^#{2,4}\s+(Slice|Step|Phase step|Task)\b/i;
const LIST_HEADING = /^(#{2,4}\s+)?(Ordered actions( or slices)?|Steps|Ordered steps|Actions|Slices|Work)\s*:?\s*$/i;
const CHECK_FIELD =
  /^\s*(?:[-*]\s+)?(?:\*\*)?(?:[A-Za-z]+ and )?(Tests?( or observations)?|Checks?|Verification( claims?)?( and required boundar(y|ies))?|Verify|Observations?|Acceptance|Evidence|Final tests or observations)(?:\*\*)?\s*:(?:\*\*)?\s*(.*)$/i;
const INLINE_CHECK =
  /\b(check(ed|s)?|verif(y|ied|ies)|tests?|observe[ds]?|assert|confirm(ed|s)?|run `|passes|fails?)\b/i;
const EMPTY = /^\s*(|-|—|none|n\/a|tbd|todo|\[.*\])\s*$/i;

function lint(file) {
  const lines = readFileSync(file, "utf8")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ""))
    .split("\n");
  const steps = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (STEP_HEADING.test(line)) {
      const level = /^(#+)/.exec(line)[1].length;
      let end = index + 1;
      while (end < lines.length && !(/^#{1,4}\s/.test(lines[end]) && /^(#+)/.exec(lines[end])[1].length <= level))
        end += 1;
      const body = lines.slice(index + 1, end);
      // A field is filled on its own line, or by the list under it ("**Checks:**" then bullets).
      const fields = body
        .map((each, at) => {
          const field = CHECK_FIELD.exec(each);
          if (!field || !EMPTY.test(field.at(-1))) return field;
          for (
            let next = at + 1;
            next < body.length && !/^\s*(\*\*)?[A-Z][^:]{0,60}:(\*\*)?\s*/.test(body[next]);
            next += 1
          ) {
            const item = /^\s*(?:[-*]|\d+[.)])\s+(\S.*)$/.exec(body[next]);
            if (item) return [...field.slice(0, -1), item[1]];
          }
          return field;
        })
        .filter(Boolean);
      const filled = fields.find((field) => !EMPTY.test(field.at(-1)));
      steps.push({
        line: index + 1,
        step: line.replace(/^#+\s+/, "").trim(),
        check: filled ? `${filled[1]}: ${filled.at(-1)}`.trim() : null,
        problem: filled ? null : fields.length ? "its check field is empty" : "names no check",
      });
      continue;
    }
    if (LIST_HEADING.test(line.trim())) {
      for (let at = index + 1; at < lines.length && !/^#{1,4}\s/.test(lines[at]); at += 1) {
        const item = /^(\s*)(?:\d+[.)]|[-*])\s+(.*)$/.exec(lines[at]);
        if (!item || item[1].length > 1) {
          if (lines[at].trim() && !item && /^[A-Z][^:]{0,40}:\s*/.test(lines[at].trim())) break;
          continue;
        }
        // A step's check may sit on its own nested lines.
        const nested = [];
        for (let next = at + 1; next < lines.length && /^\s{2,}\S/.test(lines[next]); next += 1)
          nested.push(lines[next]);
        const text = [item[2], ...nested].join(" ");
        steps.push({
          line: at + 1,
          step: item[2].trim().slice(0, 120),
          check: INLINE_CHECK.test(text) ? text.match(INLINE_CHECK)[0] : null,
          problem: INLINE_CHECK.test(text) ? null : "names no check",
        });
      }
    }
  }
  return { path: file, steps, problems: steps.filter((step) => step.problem) };
}

const results = [];
const inputErrors = [];
for (const input of positionals) {
  const file = resolve(input);
  if (!existsSync(file)) inputErrors.push(`no such file: ${input}`);
  else results.push(lint(file));
}
const failed = inputErrors.length > 0 || results.some((result) => !result.steps.length || result.problems.length);
if (values.json)
  console.log(
    JSON.stringify({ command: "plan-lint", status: failed ? "fail" : "pass", inputErrors, results }, null, 2),
  );
else {
  for (const error of inputErrors) console.log(`error: ${error}`);
  for (const result of results) {
    if (!result.steps.length) {
      console.log(
        `${result.path}: no steps found (### Slice or ### Step blocks, or a list under "Ordered actions or slices" or "Steps")`,
      );
      continue;
    }
    console.log(`${result.path}: ${result.steps.length} step(s), ${result.problems.length} without a check`);
    for (const step of result.problems) console.log(`  line ${step.line}: ${step.step} — ${step.problem}`);
  }
}
process.exit(failed ? 1 : 0);

// Builds cases.json, the one index the suite's eval definitions read, from the builders' provenance records.
// Builders wrote provenance in several shapes; this reads each shape and checks every defect's locator against
// the fixture: it must appear in the defective variant's file within two lines of the stated location, and must
// not appear in the same file of the case's sound variant (when the case has one with that file).
// Usage (repository root): node .skill-eval/review-suite/tools/index-cases.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const suite = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const readme = readFileSync(path.join(suite, "README.md"), "utf8");
const heldOut = new Set((readme.match(/\*\*Held out \(\d+\):\*\*([^\n]*)/)?.[1] ?? "").match(/[0-9a-f]{8}/g) ?? []);

const baseCommit = (p) =>
  p.base_commit ??
  (typeof p.base === "string" ? p.base : (p.base?.commit ?? p.base?.introducing_commit)) ??
  p.introducing_commit;

const problems = [];
const cases = [];
for (const file of readdirSync(path.join(suite, "provenance")).sort()) {
  const provenance = JSON.parse(readFileSync(path.join(suite, "provenance", file), "utf8"));
  const name = file.replace(/\.json$/, "");
  if (provenance.status === "dropped") continue;
  const fixtures = path.join(suite, "fixtures", name);
  if (!existsSync(fixtures)) {
    problems.push(`${name}: provenance but no fixtures`);
    continue;
  }
  const kind = name.startsWith("rr-") ? "real" : "base";
  const commit = name.slice(3);
  const entry = { case: name, kind, held_out: heldOut.has(commit), base_commit: baseCommit(provenance), variants: {} };
  if (typeof entry.base_commit !== "string") problems.push(`${name}: no base commit`);
  for (const variant of readdirSync(fixtures).sort()) {
    const record = provenance.variants?.[variant] ?? {};
    const defective = variant !== "clean";
    const locations = [record.location ?? []].flat().map((value) => String(value).replace(/ \(.*\)$/, ""));
    const facts = { defective, class: defective ? (record.class ?? null) : null };
    if (defective) {
      facts.location = locations;
      facts.locator = record.locator ?? null;
      if (!facts.class) problems.push(`${name}/${variant}: no class`);
      if (!facts.locator) problems.push(`${name}/${variant}: no locator`);
      if (locations.length === 0) problems.push(`${name}/${variant}: no location`);
      for (const location of locations) {
        const [, relative, line] = location.match(/^(.+):(\d+)$/) ?? [];
        const target = path.join(fixtures, variant, "workspace", "files", relative ?? location);
        if (!relative || !existsSync(target)) {
          problems.push(`${name}/${variant}: location ${location} not in the fixture`);
          continue;
        }
        const lines = readFileSync(target, "utf8").split("\n");
        const window = lines.slice(Math.max(0, Number(line) - 3), Number(line) + 2).join("\n");
        if (facts.locator && !window.includes(facts.locator)) {
          problems.push(`${name}/${variant}: locator not within two lines of ${location}`);
        }
        const sound = path.join(fixtures, "clean", "workspace", "files", relative);
        if (facts.locator && existsSync(sound) && readFileSync(sound, "utf8").includes(facts.locator)) {
          problems.push(`${name}/${variant}: locator also appears in the clean variant's ${relative}`);
        }
      }
    }
    for (const part of ["requirements.md", "workspace/change.diff", "workspace/verification.md"]) {
      if (!existsSync(path.join(fixtures, variant, part))) problems.push(`${name}/${variant}: missing ${part}`);
    }
    entry.variants[variant] = facts;
  }
  const requirements = Object.keys(entry.variants).map((variant) =>
    readFileSync(path.join(fixtures, variant, "requirements.md"), "utf8"),
  );
  entry.requirements_identical = requirements.every((text) => text === requirements[0]);
  if (kind === "base" && !entry.requirements_identical) problems.push(`${name}: clean and seeded requirements differ`);
  cases.push(entry);
}

writeFileSync(path.join(suite, "cases.json"), `${JSON.stringify({ cases }, null, 2)}\n`);
console.log(`${cases.length} cases indexed; held out: ${cases.filter((entry) => entry.held_out).length}`);
for (const problem of problems) console.log(`PROBLEM ${problem}`);
process.exitCode = problems.length > 0 ? 1 : 0;

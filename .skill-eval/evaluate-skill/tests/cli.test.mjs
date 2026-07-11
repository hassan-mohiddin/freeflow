import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const cli = resolve(repoRoot, "skills/evaluate-skill/scripts/skill-eval.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: repoRoot, encoding: "utf8" });
}

test("help exposes only doctor, init, and evaluate", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /evaluate/);
  for (const command of ["plan", "run", "grade", "report"]) assert.doesNotMatch(result.stdout, new RegExp(`^\\s*${command}\\b`, "m"));
});

test("old lifecycle commands and unknown flags fail", () => {
  assert.notEqual(run(["plan", "--skill", "write-skill"]).status, 0);
  const unknown = run(["evaluate", "--skill", "write-skill", "--case", "WSK2-005", "--timeout-ms", "1", "--output-limit-bytes", "1", "--cache"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown option/i);
});

test("host-free plan-only produces planned JSON", () => {
  const result = run(["evaluate", "--skill", "write-skill", "--case", "WSK2-005", "--timeout-ms", "1000", "--output-limit-bytes", "1048576", "--plan-only"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "planned");
  assert.equal(output.plan.pi_processes.total_max, 0);
});

test("model-driven evaluation without owner approval produces needs_approval", () => {
  const result = run(["evaluate", "--skill", "evaluate-skill", "--case", "ESK2-001", "--timeout-ms", "1000", "--output-limit-bytes", "1048576", "--provider", "p", "--model", "m", "--thinking", "low", "--max-turns-per-process", "2"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "needs_approval");
  assert.ok(output.plan.fingerprint);
});

test("approved host-free CLI invocation publishes a complete result", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-cli-eval-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "skills", "sample-skill"), { recursive: true });
  await mkdir(resolve(root, ".skill-eval", "sample-skill", "cases"), { recursive: true });
  await writeFile(resolve(root, ".skill-eval", "config.json"), "{}\n");
  await writeFile(resolve(root, "skills", "sample-skill", "SKILL.md"), "---\nname: sample-skill\ndescription: Sample.\n---\n\n# Sample\n");
  await writeFile(resolve(root, ".skill-eval", "sample-skill", "suite.json"), JSON.stringify({ schema_version: 1, skill: "sample-skill", cases: ["cases/SAMPLE-001.json"] }));
  await writeFile(resolve(root, ".skill-eval", "sample-skill", "cases", "SAMPLE-001.json"), JSON.stringify({
    schema_version: 1,
    id: "SAMPLE-001",
    skill: "sample-skill",
    title: "Sample",
    question: "structural validity",
    evidence_classes: ["structure"],
    required_for_bootstrap: true,
    evaluation_kind: "single",
    unsupported_evidence: "block",
    prompt: "Inspect.",
    fixture: null,
    variants: [{ id: "candidate", role: "subject", kind: "working-tree", path: "skills/sample-skill", resources: ["SKILL.md"] }],
    execution: { host: "none", mode: "deterministic", tools: [], timeout_ms: 1000 },
    assertions: [{ id: "frontmatter", type: "skill_frontmatter", path: "SKILL.md" }],
  }));
  const result = run(["evaluate", "--root", root, "--skill", "sample-skill", "--case", "SAMPLE-001", "--timeout-ms", "1000", "--output-limit-bytes", "1048576", "--owner-approved"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "complete");
  assert.equal(output.decision.case_verdict, "pass");
  assert.equal(JSON.parse(await readFile(resolve(root, output.result), "utf8")).case_id, "SAMPLE-001");
});

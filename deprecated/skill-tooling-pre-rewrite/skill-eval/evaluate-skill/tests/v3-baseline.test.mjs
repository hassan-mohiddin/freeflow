import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { hashFile, sha256, stableJson } from "../../../skills/evaluate-skill/scripts/lib/hash.mjs";
import { verifyBundleIntegrity, writeBundleIntegrity } from "../../../skills/evaluate-skill/scripts/lib/integrity.mjs";
import { buildBaselineLock, collectBaselineMetrics, collectCampaignMetrics } from "../scripts/v3-baseline.mjs";

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-v3-baseline-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "skills/evaluate-skill/scripts/lib"), { recursive: true });
  await writeFile(resolve(root, "skills/evaluate-skill/scripts/skill-eval.mjs"), "export const version = 1;\n");
  await writeFile(resolve(root, "skills/evaluate-skill/scripts/lib/example.mjs"), "export const example = true;\n");

  const bundle = resolve(root, "bundle");
  await mkdir(resolve(bundle, "evidence/candidate"), { recursive: true });
  await writeFile(
    resolve(bundle, "plan.json"),
    JSON.stringify(
      { schema_version: 2, fingerprint: "plan-hash", subject_host: "pi", capabilities: { pi: { version: "0.80.6" } } },
      null,
      2,
    ),
  );
  const evaluatorFiles = ["skill-eval.mjs", "lib/example.mjs"];
  const semanticFiles = ["lib/example.mjs"];
  const evaluatorEntries = [];
  for (const file of evaluatorFiles)
    evaluatorEntries.push([file, await hashFile(resolve(root, "skills/evaluate-skill/scripts", file))]);
  const semanticEntries = [[semanticFiles[0], evaluatorEntries.find(([path]) => path === semanticFiles[0])[1]]];
  await writeFile(
    resolve(bundle, "result.json"),
    JSON.stringify(
      {
        schema_version: 1,
        case_id: "CASE-001",
        evaluation_id: "eval-001",
        decision: { comparison_verdict: "improved" },
        identities: { evaluator: sha256(stableJson(evaluatorEntries)), semantic: sha256(stableJson(semanticEntries)) },
        usage: { provider_requests: 3, turns: 3, tool_calls: 1, tokens: { total: 100 }, cost_usd: 0.25 },
        variants: [{ role: "candidate", semantic: { verdict: "pass" }, assertions: [{ id: "a", verdict: "pass" }] }],
      },
      null,
      2,
    ),
  );
  await writeFile(
    resolve(bundle, "evidence/candidate/semantic-packet.json"),
    JSON.stringify(
      {
        schema_version: 1,
        evidence: { criteria: [{ id: "a", rubric: "pass" }], repeated: { status: "pass", verdict: "pass" } },
      },
      null,
      2,
    ),
  );
  await writeBundleIntegrity(bundle);

  const corpus = {
    schema_version: 1,
    authority: "preliminary-baseline-only",
    bundles: [{ id: "case-001", path: "bundle", semantic_packets: ["evidence/candidate/semantic-packet.json"] }],
  };
  return { root, corpus, bundle, identityOptions: { evaluatorFiles, semanticFiles } };
}

test("baseline lock is deterministic, relative, and binds exact bundle and evaluator identities", async (t) => {
  const { root, corpus, identityOptions } = await fixture(t);
  const first = await buildBaselineLock({ repoRoot: root, corpus, ...identityOptions });
  const second = await buildBaselineLock({ repoRoot: root, corpus, ...identityOptions });
  assert.deepEqual(first, second);
  assert.equal(first.authority, "preliminary-baseline-only");
  assert.equal(first.can_authorize_provider_execution, false);
  assert.equal(first.bundles[0].case_id, "CASE-001");
  assert.equal(first.bundles[0].plan_fingerprint, "plan-hash");
  assert.equal(first.bundles[0].semantic_packets[0].bytes > 0, true);
  assert.equal(first.bundles[0].semantic_packets[0].structural_key_bytes > 0, true);
  assert.equal(first.evaluator.files.length, 2);
  assert.equal(first.evaluator.fingerprint, first.bundles[0].recorded_identities.evaluator);
  assert.equal(JSON.stringify(first).includes(root), false);
});

test("baseline lock rejects a symlinked bundle root even when the target stays inside the repository", async (t) => {
  const { root, corpus, bundle, identityOptions } = await fixture(t);
  await symlink(bundle, resolve(root, "linked-bundle"));
  const linked = { ...corpus, bundles: [{ ...corpus.bundles[0], path: "linked-bundle" }] };
  await assert.rejects(() => buildBaselineLock({ repoRoot: root, corpus: linked, ...identityOptions }), /symlink/i);
});

test("baseline lock rejects a symlinked semantic packet", async (t) => {
  const { root, corpus, bundle, identityOptions } = await fixture(t);
  const packet = resolve(bundle, "evidence/candidate/semantic-packet.json");
  const target = resolve(bundle, "evidence/candidate/semantic-packet-target.json");
  await writeFile(target, await readFile(packet));
  await unlink(packet);
  await symlink(target, packet);
  await unlink(resolve(bundle, "integrity.json"));
  await writeBundleIntegrity(bundle);
  await assert.rejects(() => buildBaselineLock({ repoRoot: root, corpus, ...identityOptions }), /symlink/i);
});

test("baseline lock fails closed when a recorded bundle mutates", async (t) => {
  const { root, corpus, bundle, identityOptions } = await fixture(t);
  await writeFile(resolve(bundle, "result.json"), "{}\n");
  await assert.rejects(() => buildBaselineLock({ repoRoot: root, corpus, ...identityOptions }), /integrity mismatch/i);
});

test("baseline metrics aggregate exact saved usage and packet overhead", async (t) => {
  const { root, corpus, identityOptions } = await fixture(t);
  const lock = await buildBaselineLock({ repoRoot: root, corpus, ...identityOptions });
  const metrics = collectBaselineMetrics(lock);
  assert.equal(metrics.bundles, 1);
  assert.equal(metrics.provider_requests, 3);
  assert.equal(metrics.tokens, 100);
  assert.equal(metrics.cost_usd, 0.25);
  assert.equal(metrics.semantic_packets, 1);
  assert.equal(metrics.semantic_packet_bytes > metrics.semantic_packet_minified_bytes, true);
  assert.equal(metrics.semantic_packet_structural_key_bytes > 0, true);
});

test("frozen v1 compatibility fixtures match real host-free CLI output and accepted integrity", async (t) => {
  const fixtureRoot = resolve(import.meta.dirname, "..", "fixtures", "v3-legacy");
  const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
  const cli = resolve(repoRoot, "skills/evaluate-skill/scripts/skill-eval.mjs");
  await verifyBundleIntegrity(resolve(fixtureRoot, "accepted-bundle"));
  const expectedPlan = JSON.parse(await readFile(resolve(fixtureRoot, "cli", "plan.json"), "utf8"));
  const expectedEvaluate = JSON.parse(await readFile(resolve(fixtureRoot, "cli", "evaluate.json"), "utf8"));
  const exits = JSON.parse(await readFile(resolve(fixtureRoot, "cli", "exit-statuses.json"), "utf8"));
  const diagnostic = JSON.parse(await readFile(resolve(fixtureRoot, "diagnostic-bundle", "diagnostic.json"), "utf8"));
  const common = [
    cli,
    "evaluate",
    "--skill",
    "write-skill",
    "--case",
    "WSK2-005",
    "--timeout-ms",
    "120000",
    "--output-limit-bytes",
    "1048576",
  ];
  const planned = spawnSync(process.execPath, [...common, "--plan-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(planned.status, exits.plan, planned.stderr);
  const actualPlan = JSON.parse(planned.stdout);
  for (const value of [actualPlan, expectedPlan]) {
    for (const key of ["evaluator", "semantic"]) {
      assert.match(value.plan.identities[key], /^[a-f0-9]{64}$/);
      value.plan.identities[key] = `<${key}-fingerprint>`;
    }
    assert.match(value.plan.fingerprint, /^[a-f0-9]{64}$/);
    value.plan.fingerprint = "<plan-fingerprint>";
  }
  assert.deepEqual(actualPlan, expectedPlan);

  const evaluated = spawnSync(process.execPath, [...common, "--owner-approved"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(evaluated.status, exits.evaluate, evaluated.stderr);
  const actualEvaluate = JSON.parse(evaluated.stdout);
  const generatedResult = actualEvaluate.result;
  t.after(() => rm(resolve(repoRoot, generatedResult, ".."), { recursive: true, force: true }));
  actualEvaluate.result = "<evaluation-result-path>";
  assert.deepEqual(actualEvaluate, expectedEvaluate);
  assert.equal(diagnostic.status, "incomplete");
});

test("campaign metrics reject a symlinked nested runs directory", async (t) => {
  const { root } = await fixture(t);
  const outside = await mkdtemp(resolve(tmpdir(), "freeflow-v3-runs-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await mkdir(resolve(root, ".skill-eval/demo"), { recursive: true });
  await symlink(outside, resolve(root, ".skill-eval/demo/runs"));
  await assert.rejects(() => collectCampaignMetrics(root), /symlink/i);
});

test("campaign metrics distinguish diagnostics, cap triggers, and rerun causes", async (t) => {
  const { root } = await fixture(t);
  const evaluations = resolve(root, ".skill-eval/demo/runs/evaluations/accepted");
  const diagnostics = resolve(root, ".skill-eval/demo/runs/diagnostics/failed");
  const capped = resolve(root, ".skill-eval/other/runs/diagnostics/capped");
  await mkdir(evaluations, { recursive: true });
  await mkdir(diagnostics, { recursive: true });
  await mkdir(capped, { recursive: true });
  await writeFile(
    resolve(evaluations, "result.json"),
    JSON.stringify({ usage: { provider_requests: 2, tokens: { total: 10 }, cost_usd: 0.1 } }),
  );
  await writeFile(
    resolve(diagnostics, "diagnostic.json"),
    JSON.stringify({
      failure: { primary: "Composition runtime delivery count is invalid" },
      usage: { provider_requests: 3, tokens: { total: 20 }, cost_usd: 0.2 },
    }),
  );
  await writeFile(
    resolve(capped, "diagnostic.json"),
    JSON.stringify({
      failure: { primary: "Hard turn limit reached" },
      usage: { provider_requests: 4, tokens: { total: 30 }, cost_usd: 0.3 },
    }),
  );
  await writeFile(resolve(root, ".skill-eval/README.md"), "not a skill directory\n");
  const metrics = await collectCampaignMetrics(root);
  assert.equal(metrics.attempts, 3);
  assert.equal(metrics.accepted_bundles, 1);
  assert.equal(metrics.diagnostics, 2);
  assert.equal(metrics.cap_triggers, 1);
  assert.equal(metrics.rerun_causes.runtime_delivery, 1);
  assert.equal(metrics.rerun_causes.limit, 1);
  assert.equal(metrics.provider_requests, 9);
});

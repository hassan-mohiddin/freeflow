import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const auditScript = resolve(repoRoot, "evals/scripts/audit-historical-evidence.mjs");
const schemaSource = resolve(repoRoot, "evals/schemas/historical-evidence.schema.json");
const includedRoots = [
  "evals/reports/acceptance",
  "evals/reports/by-command-surface",
  "evals/reports/by-skill",
  "evals/reports/iterations",
];
const excludedRoots = ["evals/reports/harness", "evals/reports/runtime"];
const indexedOn = "2026-07-12";

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function recordId(path) {
  return `HIST-${sha(path).slice(0, 16)}`;
}

function relation(recordIdValue, evidencePath, evidenceText, evidenceHash) {
  return {
    record_id: recordIdValue,
    evidence: {
      source_report_path: evidencePath,
      source_report_sha256: evidenceHash,
      excerpt: evidenceText,
      excerpt_sha256: sha(evidenceText),
    },
  };
}

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-historical-audit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of [
    ...includedRoots,
    ...excludedRoots,
    "evals/registries",
    "evals/schemas",
    "evals/runs/sample",
    "evals/runs/tree/nested",
    "skills/sample-skill",
  ]) {
    await mkdir(resolve(root, path), { recursive: true });
  }
  await cp(schemaSource, resolve(root, "evals/schemas/historical-evidence.schema.json"));
  await writeFile(resolve(root, ".gitignore"), "evals/runs/\n");
  await writeFile(resolve(root, "skills/sample-skill/SKILL.md"), "# Sample\n");
  await writeFile(resolve(root, "evals/runs/sample/output.txt"), "artifact\n");
  await writeFile(resolve(root, "evals/runs/tree/nested/a.txt"), "tree artifact\n");

  const olderPath = "evals/reports/by-skill/older-report.md";
  const newerPath = "evals/reports/by-skill/newer-report.md";
  const olderOutcome = "Reported old outcome.";
  const newerOutcome = "Reported replacement outcome.";
  const supersessionExcerpt = "This report supersedes `evals/reports/by-skill/older-report.md`.";
  const older = `# Older Report\n\nDate: 2026-01-01\n\nScope: sample-skill. A later run date was 2026-02-02.\n\n## Results\n\n${olderOutcome}\n\nEvidence: \`runs/sample/output.txt\`, \`evals/runs/tree/\`, and ignored \`runs/absent/output.md\`. The traversal token \`runs/sample/../escape.txt\` is non-concrete.\n`;
  const newer = `# Newer Report\n\n> **Date:** 2026-03-03\n\n## Results\n\n${newerOutcome}\n\n${supersessionExcerpt}\n`;
  await writeFile(resolve(root, olderPath), older);
  await writeFile(resolve(root, newerPath), newer);
  const olderHash = sha(older);
  const newerHash = sha(newer);
  const olderId = recordId(olderPath);
  const newerId = recordId(newerPath);
  const fileHash = sha("artifact\n");
  const treeFileHash = sha("tree artifact\n");
  const treeManifest = `nested/a.txt ${treeFileHash}\n`;

  const fixed = {
    indexing_revision: 1,
    indexed_on: indexedOn,
    authority: "historical-documentary-only",
    readiness_eligible: false,
    convertible_to_current_result: false,
  };
  const records = [
    {
      id: newerId,
      source_report: { path: newerPath, sha256: newerHash },
      reported_date: "2026-03-03",
      related_current_skills: [],
      reported_eval_ids: [],
      reported_outcome: { label: "reported-not-regraded", excerpt: newerOutcome, sha256: sha(newerOutcome) },
      referenced_artifacts: [],
      limitations: [
        "current-skill-not-mapped",
        "host-not-stated",
        "method-not-stated",
        "model-not-stated",
        "reported-only",
      ],
      supersedes: [relation(olderId, newerPath, supersessionExcerpt, newerHash)],
      superseded_by: [],
      ...fixed,
    },
    {
      id: olderId,
      source_report: { path: olderPath, sha256: olderHash },
      reported_date: "2026-01-01",
      related_current_skills: ["sample-skill"],
      reported_eval_ids: [],
      reported_outcome: { label: "reported-not-regraded", excerpt: olderOutcome, sha256: sha(olderOutcome) },
      referenced_artifacts: [
        { source_tokens: ["runs/absent/output.md"], path: "evals/runs/absent/output.md", status: "ignored" },
        {
          source_tokens: ["runs/sample/output.txt"],
          path: "evals/runs/sample/output.txt",
          status: "present",
          kind: "file",
          sha256: fileHash,
        },
        {
          source_tokens: ["evals/runs/tree/"],
          path: "evals/runs/tree",
          status: "present",
          kind: "directory",
          sha256: sha(treeManifest),
        },
      ],
      limitations: [
        "artifacts-ignored",
        "host-not-stated",
        "method-not-stated",
        "model-not-stated",
        "reported-only",
        "superseded",
      ],
      supersedes: [],
      superseded_by: [relation(newerId, newerPath, supersessionExcerpt, newerHash)],
      ...fixed,
    },
  ].sort((a, b) => a.source_report.path.localeCompare(b.source_report.path));
  const index = {
    schema_version: 1,
    index_id: "freeflow-historical-evidence",
    indexing_revision: 1,
    indexed_on: indexedOn,
    scope: { included_roots: includedRoots, excluded_roots: excludedRoots, recursive: true, file_extension: ".md" },
    authority: "historical-documentary-only",
    readiness_eligible: false,
    convertible_to_current_result: false,
    records,
  };
  const indexPath = resolve(root, "evals/registries/historical-evidence.json");
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return { root, indexPath, index, olderPath };
}

function run(root) {
  return spawnSync(process.execPath, [auditScript, "--root", root], { encoding: "utf8" });
}

async function writeIndex(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("historical audit accepts complete documentary evidence without granting authority", async (t) => {
  const { root } = await fixture(t);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "ok",
    records: 2,
    present_artifacts: 2,
    ignored_artifacts: 1,
    missing_artifacts: 0,
    supersession_relations: 1,
    model_requests: 0,
  });
});

test("historical audit treats JSON object property order as non-semantic", async (t) => {
  const state = await fixture(t);
  const value = structuredClone(state.index);
  const record = value.records.find((item) => item.referenced_artifacts.length > 0);
  const artifact = record.referenced_artifacts.find((item) => item.status === "present");
  record.referenced_artifacts[record.referenced_artifacts.indexOf(artifact)] = {
    sha256: artifact.sha256,
    kind: artifact.kind,
    status: artifact.status,
    path: artifact.path,
    source_tokens: artifact.source_tokens,
  };
  const relationRecord = value.records.find((item) => item.supersedes.length > 0);
  const relation = relationRecord.supersedes[0];
  relation.evidence = {
    excerpt_sha256: relation.evidence.excerpt_sha256,
    excerpt: relation.evidence.excerpt,
    source_report_sha256: relation.evidence.source_report_sha256,
    source_report_path: relation.evidence.source_report_path,
  };
  const reciprocal = value.records.find((item) => item.superseded_by.length > 0).superseded_by[0];
  reciprocal.evidence = { ...relation.evidence };
  await writeIndex(state.indexPath, value);
  const result = run(state.root);
  assert.equal(result.status, 0, result.stderr);
});

test("historical audit fails closed on authority, source, identity, artifact, mapping, normalization, and relation drift", async (t) => {
  const mutations = [
    [
      "authority",
      (value) => {
        value.records[0].readiness_eligible = true;
      },
    ],
    [
      "source",
      async (value, state) => {
        await writeFile(
          resolve(state.root, state.olderPath),
          `${await readFile(resolve(state.root, state.olderPath), "utf8")}drift\n`,
        );
      },
    ],
    [
      "identity",
      (value) => {
        value.records[0].id = "HIST-0000000000000000";
      },
    ],
    [
      "artifact",
      (value) => {
        value.records.find((record) => record.referenced_artifacts.length > 0).referenced_artifacts[1].sha256 =
          "0".repeat(64);
      },
    ],
    [
      "mapping",
      (value) => {
        value.records[0].related_current_skills = ["missing-skill"];
        value.records[0].limitations = value.records[0].limitations.filter(
          (item) => item !== "current-skill-not-mapped",
        );
      },
    ],
    [
      "normalization",
      (value) => {
        value.records.find((record) => record.referenced_artifacts.length > 0).referenced_artifacts[1].source_tokens = [
          "evals/runs/sample/output.txt",
        ];
      },
    ],
    [
      "reciprocity",
      (value) => {
        value.records.find((record) => record.superseded_by.length > 0).superseded_by = [];
        value.records.find((record) => record.superseded_by.length === 0).limitations = value.records
          .find((record) => record.superseded_by.length === 0)
          .limitations.filter((item) => item !== "superseded");
      },
    ],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async (t) => {
      const state = await fixture(t);
      const value = structuredClone(state.index);
      await mutate(value, state);
      await writeIndex(state.indexPath, value);
      const result = run(state.root);
      assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
      assert.match(result.stderr, /historical evidence audit failed/i);
    });
  }
});

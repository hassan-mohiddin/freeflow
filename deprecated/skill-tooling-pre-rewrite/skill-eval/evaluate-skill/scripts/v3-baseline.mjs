#!/usr/bin/env node
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile, sha256, stableJson } from "../../../skills/evaluate-skill/scripts/lib/hash.mjs";
import { verifyBundleIntegrity } from "../../../skills/evaluate-skill/scripts/lib/integrity.mjs";

const EVALUATOR_SOURCE_FILES = [
  "skill-eval.mjs",
  "pi-composition-runtime.mjs",
  "pi-root-guard.mjs",
  "lib/args.mjs",
  "lib/capabilities.mjs",
  "lib/coordinator.mjs",
  "lib/codex-adapter.mjs",
  "lib/decision.mjs",
  "lib/evaluate.mjs",
  "lib/grade.mjs",
  "lib/outcome.mjs",
  "lib/hash.mjs",
  "lib/integrity.mjs",
  "lib/materialize.mjs",
  "lib/path-policy.mjs",
  "lib/pi-adapter.mjs",
  "lib/plan.mjs",
  "lib/process-outcome.mjs",
  "lib/process.mjs",
  "lib/rpc-client.mjs",
  "lib/publication.mjs",
  "lib/workspace.mjs",
];
const SEMANTIC_SOURCE_FILES = [
  "pi-root-guard.mjs",
  "lib/outcome.mjs",
  "lib/pi-adapter.mjs",
  "lib/process-outcome.mjs",
  "lib/process.mjs",
  "lib/semantic.mjs",
];

function portable(path) {
  return path.split(sep).join("/");
}

async function contained(root, candidate, label) {
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, candidate);
  const rel = relative(absoluteRoot, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`${label} escapes repository root: ${candidate}`);
  let cursor = absoluteRoot;
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`${label} contains a symlink component: ${candidate}`);
  }
  const canonicalRoot = await realpath(absoluteRoot);
  const canonical = await realpath(absolute);
  const canonicalRel = relative(canonicalRoot, canonical);
  if (canonicalRel === ".." || canonicalRel.startsWith(`..${sep}`))
    throw new Error(`${label} escapes repository root through symlink: ${candidate}`);
  return absolute;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listFiles(root) {
  const files = [];
  async function visit(path) {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Baseline source must not contain symlinks: ${path}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(resolve(path, name));
      return;
    }
    if (info.isFile()) files.push(path);
  }
  await visit(root);
  return files.sort();
}

function structuralKeyBytes(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + structuralKeyBytes(item), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce(
    (sum, [key, child]) => sum + Buffer.byteLength(JSON.stringify(key)) + 1 + structuralKeyBytes(child),
    0,
  );
}

async function sourceFingerprint(root, files) {
  const entries = [];
  for (const file of files) entries.push([file, await hashFile(resolve(root, file))]);
  return sha256(stableJson(entries));
}

async function evaluatorIdentity(repoRoot, evaluatorFiles, semanticFiles) {
  const root = resolve(repoRoot, "skills/evaluate-skill/scripts");
  const paths = (await listFiles(root)).filter((path) => path.endsWith(".mjs"));
  const files = [];
  for (const path of paths) files.push({ path: portable(relative(repoRoot, path)), sha256: await hashFile(path) });
  return {
    fingerprint: await sourceFingerprint(root, evaluatorFiles),
    semantic_fingerprint: await sourceFingerprint(root, semanticFiles),
    full_tree_sha256: sha256(stableJson(files)),
    files,
  };
}

async function semanticPacketIdentity(bundleRoot, path) {
  const absolute = await contained(bundleRoot, path, "semantic packet");
  const raw = await readFile(absolute);
  const parsed = JSON.parse(raw.toString("utf8"));
  const minifiedBytes = Buffer.byteLength(JSON.stringify(parsed));
  return {
    path: portable(path),
    sha256: sha256(raw),
    bytes: raw.byteLength,
    minified_bytes: minifiedBytes,
    whitespace_bytes: raw.byteLength - minifiedBytes,
    structural_key_bytes: structuralKeyBytes(parsed),
  };
}

function resultExpectation(result) {
  return {
    comparison_verdict: result.decision?.comparison_verdict ?? null,
    candidate_assertions_pass: result.readiness?.candidate_assertions_pass ?? null,
    variants: (result.variants ?? []).map((variant) => ({
      role: variant.role,
      objective_verdict: variant.objective?.verdict ?? null,
      semantic_verdict: variant.semantic?.verdict ?? null,
      assertions: (variant.assertions ?? []).map(({ id, verdict }) => ({ id, verdict })),
    })),
  };
}

export async function buildBaselineLock({
  repoRoot,
  corpus,
  evaluatorFiles = EVALUATOR_SOURCE_FILES,
  semanticFiles = SEMANTIC_SOURCE_FILES,
}) {
  if (
    corpus?.schema_version !== 1 ||
    corpus?.authority !== "preliminary-baseline-only" ||
    !Array.isArray(corpus.bundles)
  ) {
    throw new Error("Invalid v3 baseline corpus declaration");
  }
  const evaluator = await evaluatorIdentity(repoRoot, evaluatorFiles, semanticFiles);
  const bundles = [];
  for (const descriptor of corpus.bundles) {
    const bundleRoot = await contained(repoRoot, descriptor.path, "baseline bundle");
    const integrity = await verifyBundleIntegrity(bundleRoot);
    const [plan, result] = await Promise.all([
      readJson(resolve(bundleRoot, "plan.json")),
      readJson(resolve(bundleRoot, "result.json")),
    ]);
    if (result.case_id !== descriptor.case_id && descriptor.case_id !== undefined) {
      throw new Error(`Baseline bundle case mismatch for ${descriptor.id}`);
    }
    if (result.identities?.evaluator && result.identities.evaluator !== evaluator.fingerprint) {
      throw new Error(`Baseline evaluator identity mismatch for ${descriptor.id}`);
    }
    if (result.identities?.semantic && result.identities.semantic !== evaluator.semantic_fingerprint) {
      throw new Error(`Baseline semantic identity mismatch for ${descriptor.id}`);
    }
    const files = Object.values(integrity.inventory.files ?? {});
    bundles.push({
      id: descriptor.id,
      source_path: portable(descriptor.path),
      case_id: result.case_id,
      evaluation_id: result.evaluation_id,
      plan_fingerprint: result.plan_fingerprint ?? plan.fingerprint,
      bundle_identity: integrity.inventory.fingerprint,
      bundle_files: files.length,
      bundle_bytes: files.reduce((sum, file) => sum + Number(file.size ?? 0), 0),
      runtime: {
        host: plan.subject_host ?? null,
        adapter_version: plan.capabilities?.version ?? plan.capabilities?.pi?.version ?? null,
        provider: plan.model?.provider ?? null,
        model: plan.model?.model ?? null,
        thinking: plan.model?.thinking ?? null,
      },
      usage: result.usage ?? null,
      recorded_identities: {
        evaluator: result.identities?.evaluator ?? null,
        semantic: result.identities?.semantic ?? null,
      },
      expected: resultExpectation(result),
      semantic_packets: await Promise.all(
        (descriptor.semantic_packets ?? []).map((path) => semanticPacketIdentity(bundleRoot, path)),
      ),
    });
  }
  return {
    schema_version: 1,
    authority: "preliminary-baseline-only",
    can_authorize_provider_execution: false,
    corpus_sha256: sha256(stableJson(corpus)),
    evaluator,
    bundles,
  };
}

export function collectBaselineMetrics(lock) {
  const packets = lock.bundles.flatMap((bundle) => bundle.semantic_packets ?? []);
  return {
    bundles: lock.bundles.length,
    provider_requests: lock.bundles.reduce((sum, bundle) => sum + Number(bundle.usage?.provider_requests ?? 0), 0),
    turns: lock.bundles.reduce((sum, bundle) => sum + Number(bundle.usage?.turns ?? 0), 0),
    tool_calls: lock.bundles.reduce((sum, bundle) => sum + Number(bundle.usage?.tool_calls ?? 0), 0),
    tokens: lock.bundles.reduce((sum, bundle) => sum + Number(bundle.usage?.tokens?.total ?? 0), 0),
    cost_usd: Number(lock.bundles.reduce((sum, bundle) => sum + Number(bundle.usage?.cost_usd ?? 0), 0).toFixed(6)),
    bundle_bytes: lock.bundles.reduce((sum, bundle) => sum + bundle.bundle_bytes, 0),
    semantic_packets: packets.length,
    semantic_packet_bytes: packets.reduce((sum, packet) => sum + packet.bytes, 0),
    semantic_packet_minified_bytes: packets.reduce((sum, packet) => sum + packet.minified_bytes, 0),
    semantic_packet_whitespace_bytes: packets.reduce((sum, packet) => sum + packet.whitespace_bytes, 0),
    semantic_packet_structural_key_bytes: packets.reduce((sum, packet) => sum + packet.structural_key_bytes, 0),
  };
}

async function artifactFiles(repoRoot, kind, filename) {
  let evalRoot;
  try {
    evalRoot = await contained(repoRoot, ".skill-eval", "campaign eval root");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const skillNames = await readdir(evalRoot);
  const files = [];
  for (const skillName of skillNames.sort()) {
    const skillRoot = await contained(evalRoot, skillName, "campaign skill root");
    if (!(await lstat(skillRoot)).isDirectory()) continue;
    let root;
    try {
      root = await contained(skillRoot, `runs/${kind}`, "campaign runs root");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!(await lstat(root)).isDirectory()) continue;
    for (const runName of (await readdir(root)).sort()) {
      let path;
      try {
        path = await contained(root, `${runName}/${filename}`, "campaign artifact");
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      if ((await lstat(path)).isFile()) files.push(path);
    }
  }
  return files;
}

function rerunCause(message) {
  const text = String(message ?? "").toLowerCase();
  if (/runtime delivery|delivery count/.test(text)) return "runtime_delivery";
  if (/hard.{0,20}limit|turn.{0,20}limit|timeout|timed out|output limit|transport limit|exhaust/.test(text))
    return "limit";
  if (/semantic|grader/.test(text)) return "semantic_grader";
  if (/objective/.test(text)) return "objective_grader";
  if (/integrity|publication/.test(text)) return "integrity_publication";
  if (/unusable evidence|exited with|process/.test(text)) return "process_infrastructure";
  return "other";
}

export async function collectCampaignMetrics(repoRoot) {
  const [resultPaths, diagnosticPaths] = await Promise.all([
    artifactFiles(repoRoot, "evaluations", "result.json"),
    artifactFiles(repoRoot, "diagnostics", "diagnostic.json"),
  ]);
  const artifacts = await Promise.all([
    ...resultPaths.map(async (path) => ({ kind: "result", value: await readJson(path) })),
    ...diagnosticPaths.map(async (path) => ({ kind: "diagnostic", value: await readJson(path) })),
  ]);
  const causes = {};
  let capTriggers = 0;
  for (const artifact of artifacts.filter((item) => item.kind === "diagnostic")) {
    const cause = rerunCause(artifact.value.failure?.primary);
    causes[cause] = (causes[cause] ?? 0) + 1;
    if (cause === "limit") capTriggers += 1;
  }
  return {
    attempts: artifacts.length,
    accepted_bundles: resultPaths.length,
    diagnostics: diagnosticPaths.length,
    cap_triggers: capTriggers,
    cap_trigger_rate: artifacts.length === 0 ? 0 : Number((capTriggers / artifacts.length).toFixed(6)),
    provider_requests: artifacts.reduce((sum, item) => sum + Number(item.value.usage?.provider_requests ?? 0), 0),
    tokens: artifacts.reduce((sum, item) => sum + Number(item.value.usage?.tokens?.total ?? 0), 0),
    cost_usd: Number(artifacts.reduce((sum, item) => sum + Number(item.value.usage?.cost_usd ?? 0), 0).toFixed(6)),
    rerun_causes: Object.fromEntries(Object.entries(causes).sort(([left], [right]) => left.localeCompare(right))),
  };
}

export function renderBaselineReport(lock, campaign = null) {
  const metrics = collectBaselineMetrics(lock);
  const packetRows = lock.bundles.flatMap((bundle) =>
    bundle.semantic_packets.map(
      (packet) =>
        `| ${bundle.case_id} | ${packet.path.includes("candidate") ? "candidate" : "reference"} | ${packet.bytes} | ${packet.minified_bytes} | ${packet.whitespace_bytes} | ${packet.structural_key_bytes} |`,
    ),
  );
  const campaignSection = campaign
    ? `\n## Local Campaign Attempt Snapshot\n\n- Complete evaluation bundles: ${campaign.accepted_bundles}\n- Diagnostic attempts: ${campaign.diagnostics}\n- Total attempts: ${campaign.attempts}\n- Cap-trigger diagnostics: ${campaign.cap_triggers} (${(campaign.cap_trigger_rate * 100).toFixed(2)}%)\n- Provider requests: ${campaign.provider_requests}\n- Tokens: ${campaign.tokens}\n- Cost: $${campaign.cost_usd.toFixed(6)}\n- Diagnostic causes: \`${JSON.stringify(campaign.rerun_causes)}\`\n\nThis snapshot includes every local result/diagnostic JSON currently retained under \`.skill-eval/*/runs/\`. It is diagnostic accounting, not the immutable acceptance corpus.\n`
    : "";
  return `# Evaluator v3 Baseline\n\n> **Status:** Provider-free saved-artifact measurement\n> **Authority:** Preliminary cost/context baseline only; cannot authorize execution or establish v3 savings\n> **Corpus:** \`${lock.corpus_sha256}\`\n> **Evaluator:** \`${lock.evaluator.fingerprint}\`\n> **Semantic grader implementation:** \`${lock.evaluator.semantic_fingerprint}\`\n\n## Exact Corpus Totals\n\n- Bundles: ${metrics.bundles}\n- Provider requests / turns: ${metrics.provider_requests} / ${metrics.turns}\n- Tool calls: ${metrics.tool_calls}\n- Tokens: ${metrics.tokens}\n- Cost: $${metrics.cost_usd.toFixed(6)}\n- Canonical bundle bytes: ${metrics.bundle_bytes}\n- Saved semantic packets: ${metrics.semantic_packets}\n- Semantic packet bytes: ${metrics.semantic_packet_bytes}\n- Minified semantic packet bytes: ${metrics.semantic_packet_minified_bytes}\n- JSON whitespace bytes: ${metrics.semantic_packet_whitespace_bytes}\n- Structural key bytes (all occurrences): ${metrics.semantic_packet_structural_key_bytes}\n\n## Semantic Packet Detail\n\n| Case | Variant | Canonical bytes | Minified bytes | Whitespace bytes | Structural key bytes (all occurrences) |\n| --- | --- | ---: | ---: | ---: | ---: |\n${packetRows.join("\n")}\n${campaignSection}\n## Evidence Boundary\n\nThis report measures exact saved bundle usage and saved \`semantic-packet.json\` bytes. It does not reconstruct unsaved provider prefixes, prove future CEV reduction, or treat observed spend as a hard cap. WFC2 composition bundles contain no saved semantic grader packet and therefore contribute usage/bundle totals but not grader-packet totals. Diagnostic cause classification uses failure text and does not establish root cause beyond that text.\n`;
}

async function main() {
  const repoRoot = process.cwd();
  const corpusPath = resolve(repoRoot, ".skill-eval/evaluate-skill/v3-corpus.json");
  const lockPath = resolve(repoRoot, ".skill-eval/evaluate-skill/v3-baseline-lock.json");
  const reportPath = resolve(repoRoot, ".skill-eval/evaluate-skill/reports/v3-baseline.md");
  const corpus = await readJson(corpusPath);
  const lock = await buildBaselineLock({ repoRoot, corpus });
  const campaign = await collectCampaignMetrics(repoRoot);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  await writeFile(reportPath, renderBaselineReport(lock, campaign));
  process.stdout.write(
    `${JSON.stringify({ status: "written", lock: portable(relative(repoRoot, lockPath)), report: portable(relative(repoRoot, reportPath)), metrics: collectBaselineMetrics(lock), campaign })}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

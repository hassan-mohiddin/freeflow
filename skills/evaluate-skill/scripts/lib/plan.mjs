import { spawnSync } from "node:child_process";
import { access, lstat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capabilitiesFor, supportedEvidenceClasses } from "./capabilities.mjs";
import { hashDirectory, hashFile, hashGitPath, sha256, stableJson } from "./hash.mjs";
import { isWithin } from "./path-policy.mjs";
import { resolveInside } from "./workspace.mjs";

const ADAPTER_VERSION = "pi-outcome-v1";
const MODEL_OPTION_KEYS = ["provider", "model", "thinking", "max_turns_per_process", "max_usd"];
const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVALUATOR_SOURCE_FILES = [
  "skill-eval.mjs",
  "pi-root-guard.mjs",
  "lib/args.mjs",
  "lib/capabilities.mjs",
  "lib/coordinator.mjs",
  "lib/decision.mjs",
  "lib/evaluate.mjs",
  "lib/grade.mjs",
  "lib/outcome.mjs",
  "lib/hash.mjs",
  "lib/materialize.mjs",
  "lib/path-policy.mjs",
  "lib/pi-adapter.mjs",
  "lib/plan.mjs",
  "lib/process-outcome.mjs",
  "lib/process.mjs",
  "lib/publication.mjs",
  "lib/workspace.mjs",
];
const SEMANTIC_SOURCE_FILES = ["pi-root-guard.mjs", "lib/outcome.mjs", "lib/pi-adapter.mjs", "lib/process-outcome.mjs", "lib/process.mjs", "lib/semantic.mjs"];

async function sourceIdentity(files) {
  const entries = [];
  for (const file of files) entries.push([file, await hashFile(resolve(scriptsRoot, file))]);
  return sha256(stableJson(entries));
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(Number(value)) || Number(value) < 1) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

function selectCase(workspace, caseId) {
  if (typeof caseId !== "string" || caseId.length === 0) throw new Error("evaluate requires --case <id>");
  const match = workspace.cases.find((item) => item.id === caseId);
  if (!match) throw new Error(`Unknown case for ${workspace.suite.skill}: ${caseId}`);
  return match;
}

async function validateWorkingTreeResources(repoRoot, variant) {
  const subjectRoot = resolveInside(repoRoot, variant.path, `${variant.id}.path`);
  const canonicalRoot = await realpath(subjectRoot);
  for (const resource of variant.resources) {
    const path = resolveInside(subjectRoot, resource, `${variant.id}.resource`);
    await access(path, constants.R_OK).catch(() => { throw new Error(`Missing subject resource: ${variant.path}/${resource}`); });
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Subject resource cannot be a symlink: ${variant.path}/${resource}`);
    if (!isWithin(canonicalRoot, await realpath(path))) throw new Error(`Subject resource escapes through symlink: ${variant.path}/${resource}`);
  }
}

function validateGitResources(repoRoot, variant) {
  const variantPrefix = `${variant.path.replace(/\/$/, "")}/`;
  for (const resource of variant.resources) {
    const fullResource = `${variant.path.replace(/\/$/, "")}/${resource}`;
    const result = spawnSync("git", ["ls-tree", "-r", "-z", "--full-tree", variant.revision, "--", fullResource], { cwd: repoRoot, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Unable to inspect git subject resource ${variant.revision}:${fullResource}: ${result.stderr.trim()}`);
    const records = result.stdout.split("\0").filter(Boolean);
    if (records.length === 0) throw new Error(`Missing git subject resource: ${variant.revision}:${fullResource}`);
    for (const record of records) {
      const [header, fullPath] = record.split("\t");
      const [mode, type] = header.split(" ");
      if (type !== "blob" || mode === "120000") throw new Error(`Unsafe git subject resource: ${mode} ${type} ${fullPath}`);
      if (!fullPath.startsWith(variantPrefix) || (fullPath !== fullResource && !fullPath.startsWith(`${fullResource}/`))) {
        throw new Error(`Git subject resource escapes declaration: ${fullPath}`);
      }
    }
  }
}

async function resolveVariant(repoRoot, variant) {
  const absolutePath = resolveInside(repoRoot, variant.path, `${variant.id}.path`);
  if (variant.kind === "working-tree") {
    await validateWorkingTreeResources(repoRoot, variant);
    return { ...variant, absolute_path: absolutePath, snapshot_hash: await hashDirectory(absolutePath) };
  }
  if (variant.kind === "git") {
    validateGitResources(repoRoot, variant);
    return { ...variant, absolute_path: absolutePath, snapshot_hash: hashGitPath(repoRoot, variant.revision, variant.path) };
  }
  throw new Error(`Unsupported variant kind: ${variant.kind}`);
}

function evidenceResolution(evalCase) {
  const supported = supportedEvidenceClasses(evalCase.execution.host, evalCase.execution.mode);
  const state = (values = []) => Object.fromEntries(values.map((name) => [name, supported.has(name) ? "supported" : "unsupported"]));
  const required = state(evalCase.evidence_classes);
  const requested = state(evalCase.requested_evidence_classes);
  return {
    required,
    requested,
    unsupported_required: Object.entries(required).filter(([, value]) => value === "unsupported").map(([name]) => name),
    unsupported_requested: Object.entries(requested).filter(([, value]) => value === "unsupported").map(([name]) => name),
  };
}

function rerunCommand(summary) {
  const args = [
    "node skills/evaluate-skill/scripts/skill-eval.mjs evaluate",
    `--skill ${summary.skill}`,
    `--case ${summary.case}`,
    `--timeout-ms ${summary.limits.timeout_ms}`,
    `--output-limit-bytes ${summary.limits.output_limit_bytes}`,
  ];
  if (summary.model) {
    args.push(`--provider ${summary.model.provider}`, `--model ${summary.model.model}`, `--thinking ${summary.model.thinking}`, `--max-turns-per-process ${summary.limits.max_turns_per_process}`);
    if (summary.spend.max_usd !== null) args.push(`--max-usd ${summary.spend.max_usd}`);
    args.push("--owner-approved", `--expect-plan ${summary.fingerprint}`);
  }
  return args.join(" ");
}

export async function buildEvaluationPlan(workspace, options) {
  const evalCase = selectCase(workspace, options.case);
  const timeoutMs = requirePositiveInteger(options.timeout_ms, "--timeout-ms");
  const outputLimitBytes = requirePositiveInteger(options.output_limit_bytes, "--output-limit-bytes");
  const modelDriven = evalCase.execution.host !== "none";
  if (!modelDriven && evalCase.assertions.some((assertion) => assertion.type === "semantic")) {
    throw new Error("Host-free cases cannot require semantic Pi grading");
  }
  if (!modelDriven) {
    const supplied = MODEL_OPTION_KEYS.filter((key) => options[key] !== undefined);
    if (supplied.length > 0) throw new Error(`Host-free case rejects model options: ${supplied.map((key) => `--${key.replaceAll("_", "-")}`).join(", ")}`);
  }
  const missingModel = modelDriven
    ? ["provider", "model", "thinking", "max_turns_per_process"].filter((key) => options[key] === undefined)
    : [];
  if (modelDriven && missingModel.length > 0) {
    throw new Error(`Model-driven evaluation requires ${missingModel.map((key) => `--${key.replaceAll("_", "-")}`).join(", ")}`);
  }
  const maxTurns = modelDriven && options.max_turns_per_process !== undefined
    ? requirePositiveInteger(options.max_turns_per_process, "--max-turns-per-process")
    : 0;
  if (options.max_usd !== undefined && (!Number.isFinite(Number(options.max_usd)) || Number(options.max_usd) <= 0)) {
    throw new Error("--max-usd must be a positive number");
  }

  const host = capabilitiesFor(evalCase.execution.host);
  const missingCapabilities = modelDriven
    ? ["one_shot_json", "native_skill_loading", "explicit_extensions", "disable_extension_discovery", "disable_context_files", "tool_allowlist", "strict_tool_isolation"]
      .filter((name) => !host.capabilities?.[name])
    : [];
  if (modelDriven && !host.available) missingCapabilities.unshift("pi-available");
  const evidence = evidenceResolution(evalCase);
  const blockedEvidence = [
    ...evidence.unsupported_required,
    ...(evalCase.unsupported_evidence === "block" ? evidence.unsupported_requested : []),
  ];
  const fixturePath = evalCase.fixture === null ? null : resolveInside(workspace.skillRoot, evalCase.fixture, `${evalCase.id}.fixture`);
  const fixtureHash = fixturePath ? await hashDirectory(fixturePath) : sha256("empty-fixture");
  const variants = [];
  for (const variant of evalCase.variants) variants.push(await resolveVariant(workspace.repoRoot, variant));

  const semanticPerVariant = evalCase.assertions.some((assertion) => assertion.type === "semantic") ? 1 : 0;
  const subjectProcesses = modelDriven ? variants.length : 0;
  const semanticProcesses = modelDriven ? variants.length * semanticPerVariant : 0;
  const totalProcesses = subjectProcesses + semanticProcesses;
  const limitations = modelDriven
    ? ["Provider requests are observed and reported; bootstrap does not claim an independent global provider-request hard cap."]
    : [];
  if (evidence.unsupported_requested.length > 0 && evalCase.unsupported_evidence === "behavior-under-test") {
    limitations.push(`Unsupported evidence is behavior under test: ${evidence.unsupported_requested.join(", ")}.`);
  }
  if (options.max_usd === undefined && modelDriven) limitations.push("Cost is reported when available; no aggregate spend ceiling was supplied.");
  if (options.max_usd !== undefined && modelDriven) limitations.push("The spend ceiling is checked between Pi processes only when the host reports cost; unavailable cost remains unavailable.");

  const { source_path: _sourcePath, ...caseContent } = evalCase;
  const identities = {
    case: sha256(stableJson(caseContent)),
    fixture: fixtureHash,
    subjects: Object.fromEntries(variants.map((variant) => [variant.role, variant.snapshot_hash])),
    evaluator: await sourceIdentity(EVALUATOR_SOURCE_FILES),
    semantic: await sourceIdentity(SEMANTIC_SOURCE_FILES),
  };
  const planInputs = {
    schema_version: 1,
    adapter_version: ADAPTER_VERSION,
    skill: workspace.suite.skill,
    case: caseContent,
    identities,
    variants: variants.map((variant) => ({ id: variant.id, role: variant.role, kind: variant.kind, revision: variant.revision ?? null, path: variant.path, resources: variant.resources, snapshot_hash: variant.snapshot_hash })),
    host,
    model: modelDriven ? { provider: options.provider ?? null, model: options.model ?? null, thinking: options.thinking ?? null } : null,
    limits: { timeout_ms: timeoutMs, output_limit_bytes: outputLimitBytes, max_turns_per_process: maxTurns },
    max_usd: options.max_usd === undefined ? null : Number(options.max_usd),
    evidence,
  };
  const fingerprint = sha256(stableJson(planInputs));
  const summary = {
    skill: workspace.suite.skill,
    case: evalCase.id,
    evaluation_kind: evalCase.evaluation_kind,
    variants: variants.map(({ id, role }) => ({ id, role })),
    model: planInputs.model,
    pi_processes: { subject: subjectProcesses, semantic_max: semanticProcesses, total_max: totalProcesses },
    limits: planInputs.limits,
    worst_case_approved_turns: totalProcesses * maxTurns,
    spend: { max_usd: planInputs.max_usd },
    evidence: { required: evidence.required, requested: evidence.requested },
    identities,
    capabilities: { host: host.id, version: host.version, missing: missingCapabilities },
    limitations,
    fingerprint,
  };
  summary.rerun_command = rerunCommand(summary);

  let status = "ready";
  if (blockedEvidence.length > 0 || missingCapabilities.length > 0) status = "blocked";
  else if (options.plan_only) status = "planned";
  else if (modelDriven && (!options.owner_approved || (options.expect_plan && options.expect_plan !== fingerprint))) status = "needs_approval";

  return {
    status,
    summary,
    fingerprint,
    eval_case: evalCase,
    variants,
    fixture_path: fixturePath,
    plan_inputs: planInputs,
    blocked_evidence: blockedEvidence,
    missing_capabilities: missingCapabilities,
  };
}

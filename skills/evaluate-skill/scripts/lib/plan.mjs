import { spawnSync } from "node:child_process";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { capabilitiesFor, supportedEvidenceClasses } from "./capabilities.mjs";
import { DEFAULT_OUTPUT_LIMIT_BYTES } from "./constants.mjs";
import { declaredResourceIdentity, gitResourceIdentity, hashDirectory, hashFile, sha256, stableJson } from "./hash.mjs";
import { assertNoSymlinkTree, isWithin } from "./path-policy.mjs";
import { resolveInside } from "./workspace.mjs";

const ADAPTER_VERSIONS = {
  deterministic: "deterministic-v1",
  json: "pi-outcome-v1",
  "rpc-scripted": "pi-rpc-scripted-v1",
  exec: "codex-exec-diagnostic-v1",
};
const LEGACY_MODEL_OPTION_KEYS = ["provider", "model", "thinking"];
const SUBJECT_MODEL_OPTION_KEYS = ["subject_provider", "subject_model", "subject_thinking"];
const GRADER_MODEL_OPTION_KEYS = ["grader_provider", "grader_model", "grader_thinking"];
const ALL_MODEL_OPTION_KEYS = [...LEGACY_MODEL_OPTION_KEYS, ...SUBJECT_MODEL_OPTION_KEYS, ...GRADER_MODEL_OPTION_KEYS, "max_turns_per_process", "max_usd"];
const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVALUATOR_SOURCE_FILES = [
  "skill-eval.mjs",
  "pi-composition-runtime.mjs",
  "pi-root-guard.mjs",
  "lib/args.mjs",
  "lib/capabilities.mjs",
  "lib/compact-evidence.mjs",
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
  "lib/semantic-evidence.mjs",
  "lib/publication.mjs",
  "lib/workspace.mjs",
];
const SEMANTIC_SOURCE_FILES = ["pi-root-guard.mjs", "lib/compact-evidence.mjs", "lib/outcome.mjs", "lib/pi-adapter.mjs", "lib/process-outcome.mjs", "lib/process.mjs", "lib/semantic-evidence.mjs", "lib/semantic.mjs"];

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
    await assertNoSymlinkTree(path, `Subject resource ${variant.path}/${resource}`);
  }
}

function validateGitResources(repoRoot, variant) {
  const root = variant.path.replace(/\/$/, "") === "." ? "" : variant.path.replace(/\/$/, "");
  const variantPrefix = root ? `${root}/` : "";
  for (const resource of variant.resources) {
    const fullResource = root ? `${root}/${resource}` : resource;
    const result = spawnSync("git", ["ls-tree", "-r", "-z", "--full-tree", variant.revision, "--", fullResource], { cwd: repoRoot, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Unable to inspect git subject resource ${variant.revision}:${fullResource}: ${result.stderr.trim()}`);
    const records = result.stdout.split("\0").filter(Boolean);
    if (records.length === 0) throw new Error(`Missing git subject resource: ${variant.revision}:${fullResource}`);
    for (const record of records) {
      const [header, fullPath] = record.split("\t");
      const [mode, type] = header.split(" ");
      if (type !== "blob" || mode === "120000") throw new Error(`Unsafe git subject resource: ${mode} ${type} ${fullPath}`);
      if ((variantPrefix && !fullPath.startsWith(variantPrefix)) || (fullPath !== fullResource && !fullPath.startsWith(`${fullResource}/`))) {
        throw new Error(`Git subject resource escapes declaration: ${fullPath}`);
      }
    }
  }
}

async function resolveDeclaredSource(repoRoot, source, label, resources = source.resources) {
  const descriptor = { ...source, id: source.id ?? source.name ?? label, resources };
  const absolutePath = resolveInside(repoRoot, descriptor.path, `${label}.path`);
  if (descriptor.kind === "working-tree") {
    await validateWorkingTreeResources(repoRoot, descriptor);
    const identity = await declaredResourceIdentity(absolutePath, resources);
    return { ...descriptor, absolute_path: absolutePath, resource_identity: identity, snapshot_hash: identity.aggregate_sha256 };
  }
  if (descriptor.kind === "git") {
    validateGitResources(repoRoot, descriptor);
    const identity = gitResourceIdentity(repoRoot, descriptor.revision, descriptor.path, resources);
    return { ...descriptor, absolute_path: absolutePath, resource_identity: identity, snapshot_hash: identity.aggregate_sha256 };
  }
  throw new Error(`Unsupported declared source kind: ${descriptor.kind}`);
}

async function resolveVariant(repoRoot, variant) {
  return resolveDeclaredSource(repoRoot, variant, variant.id);
}

async function declaredSkillName(repoRoot, source) {
  let text;
  if (source.kind === "working-tree") text = await readFile(resolve(source.absolute_path, "SKILL.md"), "utf8");
  else {
    const root = source.path.replace(/\/$/, "") === "." ? "" : source.path.replace(/\/$/, "");
    const path = root ? `${root}/SKILL.md` : "SKILL.md";
    const result = spawnSync("git", ["show", `${source.revision}:${path}`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Unable to read composition skill name: ${source.revision}:${path}`);
    text = result.stdout;
  }
  const match = text.match(/^---\n[\s\S]*?^name:\s*([^\n]+)$/m);
  if (!match) throw new Error(`Composition skill is missing frontmatter name: ${source.path}`);
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function fileHash(identity, path, label) {
  const match = identity.entries.find((entry) => entry[0] === path && entry[1] === "file");
  if (!match) throw new Error(`Missing ${label} identity: ${path}`);
  return match[2];
}

async function resolveComposition(repoRoot, evalCase, variants) {
  if (evalCase.composition === undefined) return null;
  const baseStack = [];
  for (const component of evalCase.composition.base_stack) {
    const resolved = await resolveDeclaredSource(repoRoot, component, `composition.${component.name}`);
    const actualName = await declaredSkillName(repoRoot, resolved);
    if (actualName !== component.name) throw new Error(`Composition component name mismatch: declared ${component.name}, found ${actualName}`);
    baseStack.push(resolved);
  }
  let runtime = null;
  if (evalCase.composition.runtime) {
    const source = evalCase.composition.runtime;
    const resources = [source.kernel, source.workflow];
    const resolved = await resolveDeclaredSource(repoRoot, source, "composition.runtime", resources);
    const extensionPath = resolve(scriptsRoot, "pi-composition-runtime.mjs");
    const evaluatorRoot = resolve(scriptsRoot, "..", "..", "..");
    const productionHelperPath = resolve(evaluatorRoot, "pi-extension", "dist", "runtime-context.js");
    runtime = {
      ...resolved,
      profile: source.profile,
      extension_path: extensionPath,
      kernel_identity: { path: source.kernel, sha256: fileHash(resolved.resource_identity, source.kernel, "runtime kernel") },
      workflow_identity: { path: source.workflow, sha256: fileHash(resolved.resource_identity, source.workflow, "runtime workflow") },
      implementation_identity: {
        evaluator_extension: { path: relative(evaluatorRoot, extensionPath).split(sep).join("/"), absolute_path: extensionPath, sha256: await hashFile(extensionPath) },
        production_helper: { path: relative(evaluatorRoot, productionHelperPath).split(sep).join("/"), absolute_path: productionHelperPath, sha256: await hashFile(productionHelperPath) },
      },
    };
  }
  for (const variant of variants) {
    const actualName = await declaredSkillName(repoRoot, variant);
    if (actualName !== evalCase.composition.target_name) throw new Error(`Composition target name mismatch for ${variant.role}: declared ${evalCase.composition.target_name}, found ${actualName}`);
  }
  return {
    target_name: evalCase.composition.target_name,
    base_stack: baseStack,
    runtime,
    target_variants: Object.fromEntries(variants.map((variant) => [variant.role, variant])),
  };
}

function compositionIdentity(composition) {
  if (!composition) return null;
  const source = (component) => ({
    name: component.name ?? null,
    kind: component.kind,
    path: component.path,
    revision: component.revision ?? null,
    resources: component.resources,
    identity: component.resource_identity,
  });
  return {
    target_name: composition.target_name,
    base_stack: composition.base_stack.map(source),
    runtime: composition.runtime ? {
      profile: composition.runtime.profile,
      kind: composition.runtime.kind,
      path: composition.runtime.path,
      revision: composition.runtime.revision ?? null,
      identity: composition.runtime.resource_identity,
      kernel: composition.runtime.kernel_identity,
      workflow: composition.runtime.workflow_identity,
      implementation: Object.fromEntries(Object.entries(composition.runtime.implementation_identity).map(([name, identity]) => [name, { path: identity.path, sha256: identity.sha256 }])),
    } : null,
    targets: Object.fromEntries(Object.entries(composition.target_variants).map(([role, variant]) => [role, source({ ...variant, name: composition.target_name })])),
  };
}

function evidenceResolution(evalCase, selectedHost, effectiveMode) {
  const supported = supportedEvidenceClasses(selectedHost, effectiveMode);
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
    args.push(`--provider ${summary.model.provider}`, `--model ${summary.model.model}`, `--thinking ${summary.model.thinking}`);
  } else if (summary.subject_model) {
    args.push(`--host ${summary.subject_host}`);
    args.push(`--subject-provider ${summary.subject_model.provider}`, `--subject-model ${summary.subject_model.model}`, `--subject-thinking ${summary.subject_model.thinking}`);
    if (summary.grader_model) args.push(`--grader-provider ${summary.grader_model.provider}`, `--grader-model ${summary.grader_model.model}`, `--grader-thinking ${summary.grader_model.thinking}`);
  }
  if (summary.model || summary.subject_model) {
    args.push(`--max-turns-per-process ${summary.limits.max_turns_per_process}`);
    if (summary.spend.max_usd !== null) args.push(`--max-usd ${summary.spend.max_usd}`);
    args.push("--owner-approved", `--expect-plan ${summary.fingerprint}`);
  }
  return args.join(" ");
}

export async function buildEvaluationPlan(workspace, options, dependencies = {}) {
  const evalCase = selectCase(workspace, options.case);
  const timeoutMs = requirePositiveInteger(options.timeout_ms, "--timeout-ms");
  const outputLimitBytes = requirePositiveInteger(options.output_limit_bytes, "--output-limit-bytes");
  const portable = evalCase.execution.host === "portable";
  if (portable) {
    if (typeof options.host !== "string") throw new Error("Portable evaluation requires --host pi|codex");
    if (!evalCase.execution.allowed_hosts.includes(options.host)) throw new Error(`Selected host is not allowed by case: ${options.host}`);
  } else if (options.host !== undefined) {
    throw new Error("Fixed-host cases reject --host");
  }
  const selectedHost = portable ? options.host : evalCase.execution.host;
  const effectiveMode = portable ? (selectedHost === "pi" ? "json" : "exec") : evalCase.execution.mode;
  const modelDriven = selectedHost !== "none";
  const hasSemantic = evalCase.assertions.some((assertion) => assertion.type === "semantic");
  if (!modelDriven && hasSemantic) throw new Error("Host-free cases cannot require semantic Pi grading");

  const legacySupplied = LEGACY_MODEL_OPTION_KEYS.filter((key) => options[key] !== undefined);
  const subjectSupplied = SUBJECT_MODEL_OPTION_KEYS.filter((key) => options[key] !== undefined);
  const graderSupplied = GRADER_MODEL_OPTION_KEYS.filter((key) => options[key] !== undefined);
  let subjectModel = null;
  let graderModel = null;
  if (!modelDriven) {
    const supplied = ALL_MODEL_OPTION_KEYS.filter((key) => options[key] !== undefined);
    if (supplied.length > 0) throw new Error(`Host-free case rejects model options: ${supplied.map((key) => `--${key.replaceAll("_", "-")}`).join(", ")}`);
  } else if (!portable) {
    if (subjectSupplied.length > 0 || graderSupplied.length > 0) throw new Error("Fixed Pi cases reject role-qualified model options");
    const missing = LEGACY_MODEL_OPTION_KEYS.filter((key) => options[key] === undefined);
    if (missing.length > 0) throw new Error(`Model-driven evaluation requires ${missing.map((key) => `--${key.replaceAll("_", "-")}`).join(", ")}`);
    subjectModel = { provider: options.provider, model: options.model, thinking: options.thinking };
    graderModel = hasSemantic ? { ...subjectModel } : null;
  } else {
    if (legacySupplied.length > 0) throw new Error("Portable cases reject legacy or mixed model options");
    const missingSubject = SUBJECT_MODEL_OPTION_KEYS.filter((key) => options[key] === undefined);
    if (missingSubject.length > 0) throw new Error(`Portable evaluation requires ${missingSubject.map((key) => `--${key.replaceAll("_", "-")}`).join(", ")}`);
    if (hasSemantic) {
      const missingGrader = GRADER_MODEL_OPTION_KEYS.filter((key) => options[key] === undefined);
      if (missingGrader.length > 0) throw new Error(`Semantic portable evaluation requires ${missingGrader.map((key) => `--${key.replaceAll("_", "-")}`).join(", ")}`);
    } else if (graderSupplied.length > 0) {
      throw new Error("Grader options require semantic assertions");
    }
    subjectModel = { provider: options.subject_provider, model: options.subject_model, thinking: options.subject_thinking };
    graderModel = hasSemantic ? { provider: options.grader_provider, model: options.grader_model, thinking: options.grader_thinking } : null;
    if (selectedHost === "codex" && subjectModel.provider !== "openai") throw new Error("Codex --subject-provider must be openai");
  }
  if (modelDriven && options.max_turns_per_process === undefined) throw new Error("Model-driven evaluation requires --max-turns-per-process");
  const maxTurns = modelDriven ? requirePositiveInteger(options.max_turns_per_process, "--max-turns-per-process") : 0;
  if (options.max_usd !== undefined && (!Number.isFinite(Number(options.max_usd)) || Number(options.max_usd) <= 0)) throw new Error("--max-usd must be a positive number");

  const resolveCapabilities = dependencies.capabilitiesFor ?? capabilitiesFor;
  const capabilityMode = evalCase.composition !== undefined && selectedHost === "pi" ? "rpc-scripted" : effectiveMode;
  const host = await resolveCapabilities(selectedHost, capabilityMode);
  const baseRequiredCapabilities = selectedHost === "codex"
    ? ["exec_jsonl", "isolated_home", "strict_config", "ephemeral", "ignore_rules", "ambient_context_disabled", "explicit_skill", "strict_filesystem_isolation", "network_disabled", "process_limits", "provider_request_bound", "spend_bound"]
    : effectiveMode === "rpc-scripted"
      ? ["rpc_jsonl", "multi_turn", "native_skill_loading", "explicit_extensions", "disable_extension_discovery", "disable_context_files", "tool_allowlist", "strict_tool_isolation"]
      : ["one_shot_json", "native_skill_loading", "explicit_extensions", "disable_extension_discovery", "disable_context_files", "tool_allowlist", "strict_tool_isolation"];
  const compositionCapabilities = evalCase.composition === undefined
    ? []
    : ["multi_skill_loading", "explicit_runtime_context", "composition_activation_evidence"];
  const requiredCapabilities = [...new Set([...baseRequiredCapabilities, ...compositionCapabilities])];
  const missingCapabilities = modelDriven ? requiredCapabilities.filter((name) => !host.capabilities?.[name]) : [];
  if (modelDriven && !host.available) missingCapabilities.unshift(`${selectedHost}-available`);
  const evidence = evidenceResolution(evalCase, selectedHost, effectiveMode);
  const blockedEvidence = [
    ...evidence.unsupported_required,
    ...(evalCase.unsupported_evidence === "block" ? evidence.unsupported_requested : []),
  ];
  const fixturePath = evalCase.fixture === null ? null : resolveInside(workspace.skillRoot, evalCase.fixture, `${evalCase.id}.fixture`);
  const fixtureHash = fixturePath ? await hashDirectory(fixturePath) : sha256("empty-fixture");
  const variants = [];
  for (const variant of evalCase.variants) variants.push(await resolveVariant(workspace.repoRoot, variant));
  const composition = await resolveComposition(workspace.repoRoot, evalCase, variants);
  const limitBlocks = effectiveMode === "rpc-scripted" && maxTurns < evalCase.turns.length
    ? ["max-turns-below-scripted-user-turns"]
    : [];

  const semanticPerVariant = hasSemantic ? 1 : 0;
  const subjectProcesses = modelDriven ? variants.length : 0;
  const semanticProcesses = modelDriven ? variants.length * semanticPerVariant : 0;
  const piSubjectProcesses = selectedHost === "pi" ? subjectProcesses : 0;
  const codexSubjectProcesses = selectedHost === "codex" ? subjectProcesses : 0;
  const totalProcesses = subjectProcesses + semanticProcesses;
  const limitations = !modelDriven ? [] : selectedHost === "codex"
    ? [
        "Codex support is diagnostic only; public execution is blocked before auth access and model startup.",
        "Codex provider-request count and monetary cost are unavailable, not zero.",
        "The recorded isolation profile is codex-diagnostic-macos-v1 and is not claimed equivalent to Pi's tool allowlist.",
      ]
    : [
        "Provider requests are observed and reported; bootstrap does not claim an independent global provider-request hard cap.",
        "The output limit applies to retained canonical evidence after cumulative Pi JSON updates are compacted; raw transport has a separate internal safeguard.",
      ];
  if (effectiveMode === "rpc-scripted") {
    limitations.push("Turn, timeout, retained-output, and raw-transport limits apply across each complete RPC process; scripted user turns are not separate process budgets.");
  }
  if (evidence.unsupported_requested.length > 0 && evalCase.unsupported_evidence === "behavior-under-test") {
    limitations.push(`Unsupported evidence is behavior under test: ${evidence.unsupported_requested.join(", ")}.`);
  }
  if (options.max_usd === undefined && modelDriven && selectedHost === "pi") limitations.push("Cost is reported when available; no aggregate spend ceiling was supplied.");
  if (options.max_usd !== undefined && modelDriven && selectedHost === "pi") limitations.push(effectiveMode === "rpc-scripted"
    ? "The spend ceiling is checked between Pi processes and before later scripted prompts when the host reports cost; unavailable cost remains unavailable."
    : "The spend ceiling is checked between Pi processes only when the host reports cost; unavailable cost remains unavailable.");

  const { source_path: _sourcePath, ...caseContent } = evalCase;
  const caseSourcePath = relative(workspace.repoRoot, evalCase.source_path).split(sep).join("/");
  const identities = {
    case: sha256(stableJson(caseContent)),
    case_source: { path: caseSourcePath, sha256: await hashFile(evalCase.source_path) },
    fixture: fixtureHash,
    subjects: Object.fromEntries(variants.map((variant) => [variant.role, variant.snapshot_hash])),
    composition: compositionIdentity(composition),
    evaluator: await sourceIdentity(EVALUATOR_SOURCE_FILES),
    semantic: await sourceIdentity(SEMANTIC_SOURCE_FILES),
  };
  const planInputs = {
    schema_version: 1,
    adapter_version: ADAPTER_VERSIONS[effectiveMode] ?? `unsupported-${effectiveMode}`,
    skill: workspace.suite.skill,
    case: caseContent,
    identities,
    variants: variants.map((variant) => ({ id: variant.id, role: variant.role, kind: variant.kind, revision: variant.revision ?? null, path: variant.path, resources: variant.resources, snapshot_hash: variant.snapshot_hash, resource_identity: variant.resource_identity })),
    composition: identities.composition,
    host,
    subject_host: selectedHost,
    effective_mode: effectiveMode,
    model: !portable && modelDriven ? subjectModel : null,
    subject_model: subjectModel,
    grader_model: graderModel,
    isolation_profile: selectedHost === "codex" ? "codex-diagnostic-macos-v1" : null,
    limits: {
      timeout_ms: timeoutMs,
      output_limit_bytes: outputLimitBytes,
      transport_limit_bytes: modelDriven ? Math.max(outputLimitBytes, DEFAULT_OUTPUT_LIMIT_BYTES) : 0,
      max_turns_per_process: maxTurns,
    },
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
    subject_model: planInputs.subject_model,
    grader_model: planInputs.grader_model,
    subject_host: selectedHost,
    fidelity: selectedHost === "codex" ? "diagnostic" : "accepted",
    pi_processes: { subject: piSubjectProcesses, semantic_max: semanticProcesses, total_max: piSubjectProcesses + semanticProcesses },
    codex_processes: { subject: codexSubjectProcesses, total_max: codexSubjectProcesses },
    total_processes: totalProcesses,
    scripted_user_turns: effectiveMode === "rpc-scripted" ? evalCase.turns.length : null,
    composition: composition ? {
      skills: [...composition.base_stack.map((component) => component.name), composition.target_name],
      target_name: composition.target_name,
      runtime_profile: composition.runtime?.profile ?? null,
    } : null,
    limits: planInputs.limits,
    worst_case_approved_turns: selectedHost === "codex" ? null : totalProcesses * maxTurns,
    spend: { max_usd: planInputs.max_usd },
    evidence: { required: evidence.required, requested: evidence.requested },
    identities,
    capabilities: { host: host.id, version: host.version, missing: missingCapabilities },
    blocked_reasons: [...new Set([...blockedEvidence, ...missingCapabilities, ...limitBlocks])],
    limitations,
    fingerprint,
  };
  summary.rerun_command = selectedHost === "codex" ? null : rerunCommand(summary);

  let status = "ready";
  if (blockedEvidence.length > 0 || missingCapabilities.length > 0 || limitBlocks.length > 0) status = "blocked";
  else if (options.plan_only) status = "planned";
  else if (modelDriven && (!options.owner_approved || (options.expect_plan && options.expect_plan !== fingerprint))) status = "needs_approval";

  return {
    status,
    summary,
    fingerprint,
    eval_case: evalCase,
    variants,
    composition,
    fixture_path: fixturePath,
    plan_inputs: planInputs,
    blocked_evidence: blockedEvidence,
    missing_capabilities: missingCapabilities,
    limit_blocks: limitBlocks,
  };
}

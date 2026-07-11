import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { capabilitiesFor, supportedEvidenceClasses } from "./capabilities.mjs";
import { DEFAULT_OUTPUT_LIMIT_BYTES } from "./constants.mjs";
import { hashDirectory, hashGitPath, sha256, stableJson } from "./hash.mjs";
import { resolveInside } from "./workspace.mjs";

const ADAPTER_VERSION = "pi-bootstrap-v1";

function selectCases(workspace, { caseId, profile }) {
  if (caseId) {
    const match = workspace.cases.find((item) => item.id === caseId);
    if (!match) throw new Error(`Unknown case for ${workspace.suite.skill}: ${caseId}`);
    return [match];
  }
  if (profile === "acceptance") return workspace.cases.filter((item) => item.required_for_bootstrap);
  return workspace.cases.slice(0, 1);
}

async function resolveVariant(repoRoot, variant) {
  if (variant.kind === "none") return { ...variant, snapshot_hash: null };
  const absolutePath = resolveInside(repoRoot, variant.path, `${variant.id}.path`);
  if (variant.kind === "working-tree") {
    await access(absolutePath, constants.R_OK).catch(() => {
      throw new Error(`Missing working-tree variant: ${variant.path}`);
    });
    return { ...variant, absolute_path: absolutePath, snapshot_hash: await hashDirectory(absolutePath) };
  }
  return {
    ...variant,
    absolute_path: absolutePath,
    snapshot_hash: hashGitPath(repoRoot, variant.revision, variant.path),
  };
}

function evidenceResolution(evalCase) {
  const supported = supportedEvidenceClasses(evalCase.execution.host, evalCase.execution.mode);
  const required = Object.fromEntries(evalCase.evidence_classes.map((name) => [name, supported.has(name) ? "supported" : "unsupported"]));
  const requested = Object.fromEntries((evalCase.requested_evidence_classes ?? []).map((name) => [name, supported.has(name) ? "supported" : "unsupported"]));
  return { required, requested, unsupported_required: Object.entries(required).filter(([, state]) => state === "unsupported").map(([name]) => name) };
}

export async function buildPlan(workspace, options) {
  const profile = options.profile ?? "iterate";
  if (!new Set(["iterate", "acceptance"]).has(profile)) throw new Error(`Unknown profile: ${profile}`);
  const cases = selectCases(workspace, { caseId: options.case, profile });
  const suiteFingerprint = {
    schema_version: workspace.suite.schema_version,
    skill: workspace.suite.skill,
    profile,
    profile_policy: workspace.suite.profiles?.[profile]
      ? { ...workspace.suite.profiles[profile] }
      : null,
  };
  const jobs = [];
  const hostReports = {};

  for (const evalCase of cases) {
    const host = hostReports[evalCase.execution.host] ?? capabilitiesFor(evalCase.execution.host);
    hostReports[host.id] = host;
    const evidence = evidenceResolution(evalCase);
    const { source_path: _sourcePath, ...caseContent } = evalCase;
    if (profile === "acceptance" && evidence.unsupported_required.length > 0) {
      throw new Error(`${evalCase.id} requires unavailable evidence: ${evidence.unsupported_required.join(", ")}`);
    }
    const fixturePath = evalCase.fixture === null ? null : resolveInside(workspace.skillRoot, evalCase.fixture, `${evalCase.id}.fixture`);
    const fixtureHash = fixturePath ? await hashDirectory(fixturePath) : sha256("empty-fixture");
    for (const variant of evalCase.variants) {
      const resolvedVariant = await resolveVariant(workspace.repoRoot, variant);
      const modelRequired = evalCase.execution.host !== "none";
      const semanticAssertions = evalCase.assertions.filter((assertion) => assertion.type === "semantic").length;
      const fingerprintVariant = {
        id: resolvedVariant.id,
        kind: resolvedVariant.kind,
        revision: resolvedVariant.revision ?? null,
        path: resolvedVariant.path,
        snapshot_hash: resolvedVariant.snapshot_hash,
      };
      const fingerprintInputs = {
        schema_version: 1,
        suite: suiteFingerprint,
        case: caseContent,
        fixture_hash: fixtureHash,
        variant: fingerprintVariant,
        host: host.id,
        host_version: host.version,
        provider: options.provider ?? null,
        backend_model_revision: options.backend_model_revision ?? null,
        model: options.model ?? null,
        thinking: options.thinking ?? null,
        tools: evalCase.execution.tools,
        root_policy: "fixture-read-write+snapshot-read-v1",
        context: {
          no_session: true,
          no_context_files: true,
          no_auto_resources: true,
          config_home_policy: "isolated-auth-only-v1",
          explicit_extensions: [`pi-root-guard@${ADAPTER_VERSION}`],
          runtime_hooks: [],
        },
        hard_limits: {
          timeout_ms: evalCase.execution.timeout_ms,
          output_limit_bytes: Number(options.output_limit_bytes ?? DEFAULT_OUTPUT_LIMIT_BYTES),
          max_turns_per_job: Number(options.max_turns_per_job ?? 0),
        },
        adapter_version: ADAPTER_VERSION,
      };
      jobs.push({
        case_id: evalCase.id,
        case_source: evalCase.source_path,
        eval_case: caseContent,
        variant: resolvedVariant,
        host: host.id,
        mode: evalCase.execution.mode,
        tools: evalCase.execution.tools,
        fixture_path: fixturePath,
        fixture_hash: fixtureHash,
        evidence,
        model_required: modelRequired,
        semantic_assertions: semanticAssertions,
        fingerprint: sha256(stableJson(fingerprintInputs)),
        fingerprint_inputs: fingerprintInputs,
      });
    }
  }

  const subjectJobs = jobs.filter((job) => job.model_required).length;
  const semanticJobsMax = jobs.reduce((sum, job) => sum + (job.semantic_assertions > 0 ? 1 : 0), 0);
  const unresolvedOwnerInputs = subjectJobs === 0
    ? []
    : ["provider", "model", "thinking", "max_model_requests", "max_turns_per_job"].filter((key) => options[key] === undefined);
  const maxModelRequests = options.max_model_requests === undefined ? null : Number(options.max_model_requests);
  const maxTurnsPerJob = options.max_turns_per_job === undefined ? null : Number(options.max_turns_per_job);

  return {
    schema_version: 1,
    skill: workspace.suite.skill,
    profile,
    selected_cases: cases.map((item) => item.id),
    host_reports: hostReports,
    jobs,
    expected_model_jobs: {
      subject: subjectJobs,
      semantic_max: semanticJobsMax,
      total_max: subjectJobs + semanticJobsMax,
    },
    model_request_bounds: {
      subject_min: subjectJobs,
      subject_max: maxTurnsPerJob === null ? null : subjectJobs * maxTurnsPerJob,
      configured_soft_cap: maxModelRequests,
      may_pause_before_completion: maxModelRequests !== null && maxModelRequests < subjectJobs,
    },
    runnable: unresolvedOwnerInputs.length === 0 && (subjectJobs === 0 || maxModelRequests > 0) && (subjectJobs === 0 || maxTurnsPerJob > 0),
    unresolved_owner_inputs: unresolvedOwnerInputs,
    limitations: options.backend_model_revision ? [] : ["Provider backend model revision is unavailable unless supplied; cache age policy must bound cross-time reuse."],
  };
}

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { createManifest, captureGitEvidence, copyDirectory, initializeFixtureGit, materializeSkillVariant, removeWritableTree } from "./materialize.mjs";
import { hashDirectory } from "./hash.mjs";
import { gradeObjectiveRun } from "./grade.mjs";
import { runPiSubject, redactedInvocation, PI_ADAPTER_VERSION } from "./pi-adapter.mjs";
import { ModelBudget, runBounded } from "./scheduler.mjs";
import { readControlCache, writeControlCache } from "./cache.mjs";
import { adaptiveRepeatDecision } from "./scheduler.mjs";

function runId(job, repeat = 0) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `${timestamp}-${job.case_id.toLowerCase()}-${job.variant.id}-r${repeat}-${job.fingerprint.slice(0, 8)}`;
}

async function copyWithoutGit(source, destination) {
  await cp(source, destination, {
    recursive: true,
    force: true,
    filter: (path) => basename(path) !== ".git",
  });
}

function evidenceClassStates(job) {
  return {
    required: job.evidence.required,
    requested: job.evidence.requested,
  };
}

async function executeJob(workspace, job, options, budget, repeat = 0) {
  const isControl = new Set(["old", "no-skill", "current-release"]).has(job.variant.id);
  const cacheRoot = resolve(workspace.skillRoot, "cache");
  if (isControl && !options.no_cache) {
    const cache = await readControlCache(cacheRoot, job.fingerprint, { maxAgeHours: options.cache_max_age_hours ?? 24 });
    if (cache.hit) return { reused: true, run_dir: cache.value.run_dir, fingerprint: job.fingerprint, cache: cache.value };
  }

  if (job.model_required) budget.reserveCall();
  const tempRoot = await mkdtemp(resolve(tmpdir(), "freeflow-skill-eval-"));
  const fixtureRoot = resolve(tempRoot, "fixture");
  const snapshotRoot = resolve(tempRoot, "skill");
  const configRoot = resolve(tempRoot, "pi-config");
  const id = runId(job, repeat);
  const runDir = resolve(workspace.skillRoot, "runs", id);

  try {
    await mkdir(fixtureRoot, { recursive: true });
    if (job.fixture_path) await copyDirectory(job.fixture_path, fixtureRoot);
    await initializeFixtureGit(fixtureRoot);
    const beforeManifest = await createManifest(fixtureRoot);

    let preSnapshotHash = null;
    let skillManifest = null;
    if (job.variant.kind !== "none") {
      await materializeSkillVariant(workspace.repoRoot, job.variant, snapshotRoot);
      preSnapshotHash = await hashDirectory(snapshotRoot);
      skillManifest = await createManifest(snapshotRoot);
    }

    let subject = null;
    if (job.model_required) {
      subject = await runPiSubject({
        prompt: job.eval_case.prompt,
        provider: options.provider,
        model: options.model,
        thinking: options.thinking,
        tools: job.tools,
        skillSnapshot: job.variant.kind === "none" ? null : snapshotRoot,
        workspace: fixtureRoot,
        configDir: configRoot,
        readRoots: job.variant.kind === "none" ? [fixtureRoot] : [fixtureRoot, snapshotRoot],
        writeRoots: [fixtureRoot],
        timeoutMs: job.eval_case.execution.timeout_ms,
        outputLimitBytes: options.output_limit_bytes ?? 1048576,
      });
      budget.recordUsage(subject.parsed.usage);
    }

    const postSnapshotHash = job.variant.kind === "none" ? null : await hashDirectory(snapshotRoot);
    if (preSnapshotHash !== postSnapshotHash) throw new Error(`Skill snapshot mutated during ${job.case_id}/${job.variant.id}`);
    const afterManifest = await createManifest(fixtureRoot);
    const git = await captureGitEvidence(fixtureRoot);

    await mkdir(resolve(runDir, "inputs"), { recursive: true });
    await mkdir(resolve(runDir, "artifacts"), { recursive: true });
    await writeFile(resolve(runDir, "inputs", "case.json"), `${JSON.stringify(job.eval_case, null, 2)}\n`);
    if (job.variant.kind !== "none") await copyWithoutGit(snapshotRoot, resolve(runDir, "inputs", "skill"));
    await copyWithoutGit(fixtureRoot, resolve(runDir, "artifacts", "workspace"));

    const limitations = [...(options.backend_model_revision ? [] : ["Stable provider backend model revision unavailable; cache reuse is age-bounded."])]
    if (subject && subject.parsed.usage?.cost === null) limitations.push("Host did not expose model cost; cost is unavailable, not zero.");
    const metadata = {
      schema_version: 1,
      run_id: id,
      skill: workspace.suite.skill,
      case_id: job.case_id,
      variant: job.variant.id,
      variant_kind: job.variant.kind,
      skill_snapshot_hash: preSnapshotHash,
      host: job.host,
      host_version: job.fingerprint_inputs.host_version,
      adapter_version: PI_ADAPTER_VERSION,
      provider: options.provider ?? null,
      backend_model_revision: options.backend_model_revision ?? null,
      model: options.model ?? null,
      thinking: options.thinking ?? null,
      tools: job.tools,
      context_controls: job.fingerprint_inputs.context,
      invocation: subject ? redactedInvocation(subject.invocation) : { command: null, args: [] },
      evidence_classes: evidenceClassStates(job),
      fingerprint: job.fingerprint,
      started_at: subject?.process.started_at ?? new Date().toISOString(),
      ended_at: subject?.process.ended_at ?? new Date().toISOString(),
      usage: subject?.parsed.usage ?? null,
      activation: { skill_read: subject?.parsed.skill_read ?? false },
      changed_paths: git.changedPaths,
      assertion_root: job.execution?.host === "none" || job.host === "none" ? "skill" : "workspace",
      skill_manifest: skillManifest,
      process: subject ? {
        exit_code: subject.process.code,
        signal: subject.process.signal,
        timed_out: subject.process.timed_out,
        output_limit_exceeded: subject.process.output_limit_exceeded,
        parse_errors: subject.parsed.parse_errors,
      } : { exit_code: 0, signal: null, timed_out: false, output_limit_exceeded: false, parse_errors: [] },
      artifacts: {
        final: "final.md",
        events: "events.jsonl",
        diff: "diff",
        git_status: "git-status.txt",
        exit_status: "exit-status.txt",
        usage: "usage.json",
        objective_grade: "objective-grade.json"
      },
      limitations,
    };
    await Promise.all([
      writeFile(resolve(runDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`),
      writeFile(resolve(runDir, "before-manifest.json"), `${JSON.stringify(beforeManifest, null, 2)}\n`),
      writeFile(resolve(runDir, "after-manifest.json"), `${JSON.stringify(afterManifest, null, 2)}\n`),
      writeFile(resolve(runDir, "final.md"), subject?.parsed.final_text ?? ""),
      writeFile(resolve(runDir, "events.jsonl"), subject?.process.stdout ?? ""),
      writeFile(resolve(runDir, "tool-events.json"), `${JSON.stringify(subject?.parsed.tool_events ?? [], null, 2)}\n`),
      writeFile(resolve(runDir, "stderr.log"), subject?.process.stderr ?? ""),
      writeFile(resolve(runDir, "diff"), git.diff),
      writeFile(resolve(runDir, "git-status.txt"), git.status),
      writeFile(resolve(runDir, "exit-status.txt"), `${subject?.process.code ?? 0}\n`),
      writeFile(resolve(runDir, "usage.json"), `${JSON.stringify(subject?.parsed.usage ?? null, null, 2)}\n`),
    ]);
    const grade = await gradeObjectiveRun(runDir);
    await writeFile(resolve(runDir, "objective-grade.json"), `${JSON.stringify(grade, null, 2)}\n`);

    const runtimeVerdict = metadata.process.exit_code === 0 && !metadata.process.timed_out && !metadata.process.output_limit_exceeded
      ? grade.verdict
      : "infrastructure-error";
    const result = { reused: false, run_dir: runDir, run_id: id, fingerprint: job.fingerprint, grade, runtime_verdict: runtimeVerdict, usage: metadata.usage, repeat };
    if (isControl && grade.objective_pass) {
      await writeControlCache(cacheRoot, { fingerprint: job.fingerprint, created_at: new Date().toISOString(), run_dir: runDir, case_id: job.case_id, variant: job.variant.id });
    }
    return result;
  } finally {
    await removeWritableTree(tempRoot);
  }
}

export async function runPlan(workspace, plan, options) {
  if (!plan.runnable) throw new Error(`Plan is not runnable: ${plan.unresolved_owner_inputs.join(", ") || "model-call cap too low"}`);
  const maxCalls = options.max_model_calls ?? plan.expected_model_calls.configured_cap ?? plan.expected_model_calls.total_max;
  const budget = new ModelBudget({ maxCalls: Number(maxCalls), maxUsd: options.max_usd === undefined ? null : Number(options.max_usd) });
  const concurrency = Number(options.concurrency ?? 1);
  const cachedControls = [];
  let jobs = plan.jobs;
  if (options.candidate_only) {
    jobs = plan.jobs.filter((job) => job.variant.id === "candidate");
    for (const job of plan.jobs.filter((item) => new Set(["old", "no-skill", "current-release"]).has(item.variant.id))) {
      const cache = await readControlCache(resolve(workspace.skillRoot, "cache"), job.fingerprint, { maxAgeHours: options.cache_max_age_hours ?? 24 });
      if (!cache.hit) throw new Error(`Candidate-only rerun requires matching cached control for ${job.case_id}/${job.variant.id}: ${cache.reason}`);
      cachedControls.push({ reused: true, run_dir: cache.value.run_dir, fingerprint: job.fingerprint, cache: cache.value });
    }
  }

  const wave = await runBounded(jobs, (job) => executeJob(workspace, job, options, budget), concurrency);
  const results = [...cachedControls, ...wave.results];
  const repeatLimit = workspace.suite.profiles?.[plan.profile]?.max_repeats ?? 0;
  const repeatOutcomes = [];
  for (let index = 0; index < jobs.length; index += 1) {
    const first = wave.results[index];
    const verdicts = [first.runtime_verdict ?? first.grade?.verdict];
    let repeatsUsed = 0;
    for (;;) {
      const decision = adaptiveRepeatDecision({ verdicts, repeatsUsed, maxRepeats: repeatLimit });
      if (decision.action !== "repeat") {
        if (decision.reason === "unresolved-variance-at-cap") repeatOutcomes.push({ case_id: jobs[index].case_id, variant: jobs[index].variant.id, verdicts, state: decision.reason });
        break;
      }
      repeatsUsed += 1;
      const repeated = await executeJob(workspace, jobs[index], { ...options, no_cache: true }, budget, repeatsUsed);
      results.push(repeated);
      verdicts.push(repeated.runtime_verdict ?? repeated.grade?.verdict);
    }
  }

  return {
    schema_version: 1,
    skill: plan.skill,
    profile: plan.profile,
    results,
    peak_concurrency: wave.peak_concurrency,
    budget: budget.summary(),
    adaptive_repeats: repeatOutcomes,
  };
}

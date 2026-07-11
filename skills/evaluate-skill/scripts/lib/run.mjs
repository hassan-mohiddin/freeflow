import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { createManifest, captureGitEvidence, copyDirectory, initializeFixtureGit, makeWritable, materializeSkillVariant, removeWritableTree } from "./materialize.mjs";
import { hashDirectory } from "./hash.mjs";
import { gradeObjectiveRun } from "./grade.mjs";
import { runPiSubject, redactedInvocation, PI_ADAPTER_VERSION } from "./pi-adapter.mjs";
import { adaptiveRepeatDecision, runBounded, SoftWaveBudget } from "./scheduler.mjs";
import { readControlCache, writeControlCache } from "./cache.mjs";
import { applyEscalation, createWave, frozenFixtureFor, frozenSnapshotFor, saveWave, validateWaveOwnership } from "./wave.mjs";

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
  return { required: job.evidence.required, requested: job.evidence.requested };
}

async function executeJob(workspace, job, options, repeat = 0) {
  const isControl = new Set(["old", "no-skill", "current-release"]).has(job.variant.id);
  const cacheRoot = resolve(workspace.skillRoot, "cache");
  if (isControl && !options.no_cache) {
    const cache = await readControlCache(cacheRoot, job.fingerprint, { maxAgeHours: options.cache_max_age_hours ?? 24 });
    if (cache.hit) {
      return {
        reused: true,
        run_dir: cache.value.run_dir,
        fingerprint: job.fingerprint,
        cache: cache.value,
        runtime_verdict: "cached",
        provider_requests: 0,
        usage: null,
        model_driven: false,
        repeat,
      };
    }
  }

  const tempRoot = await mkdtemp(resolve(tmpdir(), "freeflow-skill-eval-"));
  const fixtureRoot = resolve(tempRoot, "fixture");
  const localSnapshotRoot = resolve(tempRoot, "skill");
  const snapshotRoot = job.variant.kind === "none" ? null : (options.frozen_snapshot_path ?? localSnapshotRoot);
  const configRoot = resolve(tempRoot, "pi-config");
  const id = runId(job, repeat);
  const runDir = resolve(workspace.skillRoot, "runs", id);

  try {
    await mkdir(fixtureRoot, { recursive: true });
    const fixtureSource = options.frozen_fixture_path ?? job.fixture_path;
    if (fixtureSource) {
      await copyDirectory(fixtureSource, fixtureRoot);
      await makeWritable(fixtureRoot);
    }
    await initializeFixtureGit(fixtureRoot);
    const beforeManifest = await createManifest(fixtureRoot);

    let preSnapshotHash = null;
    let skillManifest = null;
    if (job.variant.kind !== "none") {
      if (!options.frozen_snapshot_path) await materializeSkillVariant(workspace.repoRoot, job.variant, snapshotRoot);
      preSnapshotHash = await hashDirectory(snapshotRoot);
      if (preSnapshotHash !== job.variant.snapshot_hash) {
        throw new Error(`Skill snapshot changed before ${job.case_id}/${job.variant.id}: expected ${job.variant.snapshot_hash}, got ${preSnapshotHash}`);
      }
      skillManifest = await createManifest(snapshotRoot);
    }

    let subject = null;
    if (job.model_required) {
      subject = await runPiSubject({
        prompt: job.eval_case.prompt,
        provider: job.fingerprint_inputs.provider,
        model: job.fingerprint_inputs.model,
        thinking: job.fingerprint_inputs.thinking,
        tools: job.tools,
        skillSnapshot: snapshotRoot,
        workspace: fixtureRoot,
        configDir: configRoot,
        readRoots: snapshotRoot ? [fixtureRoot, snapshotRoot] : [fixtureRoot],
        writeRoots: [fixtureRoot],
        timeoutMs: job.fingerprint_inputs.hard_limits.timeout_ms,
        outputLimitBytes: options.output_limit_bytes ?? job.fingerprint_inputs.hard_limits.output_limit_bytes,
        maxTurns: options.max_turns_per_job ?? job.fingerprint_inputs.hard_limits.max_turns_per_job,
      });
    }

    const postSnapshotHash = snapshotRoot ? await hashDirectory(snapshotRoot) : null;
    if (preSnapshotHash !== postSnapshotHash) throw new Error(`Skill snapshot mutated during ${job.case_id}/${job.variant.id}`);
    const afterManifest = await createManifest(fixtureRoot);
    const git = await captureGitEvidence(fixtureRoot);

    await mkdir(resolve(runDir, "inputs"), { recursive: true });
    await mkdir(resolve(runDir, "artifacts"), { recursive: true });
    await writeFile(resolve(runDir, "inputs", "case.json"), `${JSON.stringify(job.eval_case, null, 2)}\n`);
    if (snapshotRoot) await copyWithoutGit(snapshotRoot, resolve(runDir, "inputs", "skill"));
    await copyWithoutGit(fixtureRoot, resolve(runDir, "artifacts", "workspace"));

    const limitations = job.fingerprint_inputs.backend_model_revision
      ? []
      : ["Stable provider backend model revision unavailable; cache reuse is age-bounded."];
    if (subject && subject.parsed.usage?.cost === null) limitations.push("Host did not expose model cost; cost is unavailable, not zero.");
    const counters = subject?.runtime_counters ?? { provider_requests: 0, turns_started: 0, tool_calls: 0, hard_turn_limit_reached: false };
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
      provider: job.fingerprint_inputs.provider,
      backend_model_revision: job.fingerprint_inputs.backend_model_revision,
      model: job.fingerprint_inputs.model,
      thinking: job.fingerprint_inputs.thinking,
      tools: job.tools,
      context_controls: job.fingerprint_inputs.context,
      hard_limits: job.fingerprint_inputs.hard_limits,
      invocation: subject ? redactedInvocation(subject.invocation) : { command: null, args: [] },
      evidence_classes: evidenceClassStates(job),
      fingerprint: job.fingerprint,
      started_at: subject?.process.started_at ?? new Date().toISOString(),
      ended_at: subject?.process.ended_at ?? new Date().toISOString(),
      usage: subject?.parsed.usage ?? null,
      runtime_counters: counters,
      activation: { skill_read: subject?.parsed.skill_read ?? false },
      changed_paths: git.changedPaths,
      assertion_root: job.host === "none" ? "skill" : "workspace",
      skill_manifest: skillManifest,
      process: subject ? {
        exit_code: subject.process.code,
        signal: subject.process.signal,
        timed_out: subject.process.timed_out,
        output_limit_exceeded: subject.process.output_limit_exceeded,
        hard_turn_limit_reached: counters.hard_turn_limit_reached,
        parse_errors: subject.parsed.parse_errors,
      } : {
        exit_code: 0,
        signal: null,
        timed_out: false,
        output_limit_exceeded: false,
        hard_turn_limit_reached: false,
        parse_errors: [],
      },
      artifacts: {
        final: "final.md",
        events: "events.jsonl",
        diff: "diff",
        git_status: "git-status.txt",
        exit_status: "exit-status.txt",
        usage: "usage.json",
        objective_grade: "objective-grade.json",
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
      writeFile(resolve(runDir, "runtime-counters.json"), `${JSON.stringify(counters, null, 2)}\n`),
      writeFile(resolve(runDir, "stderr.log"), subject?.process.stderr ?? ""),
      writeFile(resolve(runDir, "diff"), git.diff),
      writeFile(resolve(runDir, "git-status.txt"), git.status),
      writeFile(resolve(runDir, "exit-status.txt"), `${subject?.process.code ?? 0}\n`),
      writeFile(resolve(runDir, "usage.json"), `${JSON.stringify(subject?.parsed.usage ?? null, null, 2)}\n`),
    ]);
    const grade = await gradeObjectiveRun(runDir);
    await writeFile(resolve(runDir, "objective-grade.json"), `${JSON.stringify(grade, null, 2)}\n`);

    const processFailed = metadata.process.exit_code !== 0
      || metadata.process.timed_out
      || metadata.process.output_limit_exceeded
      || metadata.process.hard_turn_limit_reached;
    const runtimeVerdict = processFailed ? "infrastructure-error" : grade.verdict;
    const result = {
      reused: false,
      run_dir: runDir,
      run_id: id,
      fingerprint: job.fingerprint,
      grade,
      runtime_verdict: runtimeVerdict,
      retryable_infrastructure: processFailed
        && metadata.process.exit_code !== 0
        && !metadata.process.timed_out
        && !metadata.process.output_limit_exceeded
        && !metadata.process.hard_turn_limit_reached,
      provider_requests: counters.provider_requests,
      usage: metadata.usage,
      model_driven: job.model_required,
      repeat,
    };
    if (isControl && !processFailed) {
      await writeControlCache(cacheRoot, {
        fingerprint: job.fingerprint,
        created_at: new Date().toISOString(),
        run_dir: runDir,
        case_id: job.case_id,
        variant: job.variant.id,
        objective_verdict: grade.verdict,
      });
    }
    return result;
  } finally {
    await removeWritableTree(tempRoot);
  }
}

async function prepareCandidateOnly(workspace, wave, options) {
  if (!options.candidate_only || wave.candidate_only_prepared) return;
  for (const state of wave.jobs) {
    const job = wave.plan.jobs[state.index];
    if (!new Set(["old", "no-skill", "current-release"]).has(job.variant.id)) continue;
    const cache = await readControlCache(resolve(workspace.skillRoot, "cache"), job.fingerprint, { maxAgeHours: options.cache_max_age_hours ?? 24 });
    if (!cache.hit) throw new Error(`Candidate-only wave requires matching cached control for ${job.case_id}/${job.variant.id}: ${cache.reason}`);
    state.status = "complete";
    state.run_dir = cache.value.run_dir;
    state.runtime_verdict = "cached";
    state.cached = true;
  }
  wave.candidate_only_prepared = true;
}

export async function runPlan(workspace, plan, options = {}) {
  if (!plan.runnable) throw new Error(`Plan is not runnable: ${plan.unresolved_owner_inputs.join(", ")}`);
  const wave = options.wave ?? await createWave(workspace, plan, options);
  await validateWaveOwnership(workspace, wave);
  if (options.wave) applyEscalation(wave, options);
  if (options.retry_needs_attention) {
    for (const state of wave.jobs.filter((item) => item.status === "needs-attention")) {
      state.status = "pending";
      state.error = null;
    }
  }
  await prepareCandidateOnly(workspace, wave, options);
  wave.status = "running";
  await saveWave(wave);

  const budget = new SoftWaveBudget({
    maxModelRequests: wave.policy.max_model_requests,
    maxUsd: wave.policy.max_usd,
    usage: wave.usage,
  });
  const repeatLimit = workspace.suite.profiles?.[wave.profile]?.max_repeats ?? 0;
  const jobExecutor = options.execute_job ?? executeJob;
  let peakConcurrency = 0;
  let saveQueue = Promise.resolve();
  const persist = () => {
    saveQueue = saveQueue.then(() => saveWave(wave));
    return saveQueue;
  };

  for (;;) {
    const pending = wave.jobs.filter((state) => state.status === "pending").map((state) => state.index);
    if (pending.length === 0) break;
    let executedThisRound = 0;
    const round = await runBounded(pending, async (index) => {
      const state = wave.jobs[index];
      const job = wave.plan.jobs[index];
      if (job.model_required && !budget.canStartJob()) return { paused: true, index, reason: budget.pauseReason() };

      state.status = "running";
      state.attempts += 1;
      await persist();
      try {
        const result = await jobExecutor(workspace, job, {
          ...options,
          frozen_snapshot_path: frozenSnapshotFor(wave, job),
          frozen_fixture_path: frozenFixtureFor(wave, job),
          max_turns_per_job: wave.policy.max_turns_per_job,
          output_limit_bytes: wave.policy.output_limit_bytes,
          no_cache: state.attempts > 1 ? true : options.no_cache,
        }, state.attempts - 1);
        executedThisRound += 1;
        budget.recordJob({
          providerRequests: result.provider_requests,
          usage: result.usage,
          costExpected: result.model_driven && !result.reused,
        });
        wave.usage = {
          jobs_completed: budget.jobsCompleted,
          model_requests: budget.modelRequests,
          spent_usd: budget.costAvailable ? budget.spentUsd : null,
          cost_available: budget.costAvailable,
        };
        state.run_dir = result.run_dir;
        state.runtime_verdict = result.runtime_verdict;
        state.verdicts ??= [];
        state.verdicts.push(result.runtime_verdict);
        const repeat = result.runtime_verdict === "infrastructure-error" && !result.retryable_infrastructure
          ? { action: "stop", reason: "hard-limit-needs-attention" }
          : adaptiveRepeatDecision({ verdicts: state.verdicts, repeatsUsed: state.attempts - 1, maxRepeats: repeatLimit });
        if (repeat.action === "repeat") state.status = "pending";
        else {
          state.status = result.runtime_verdict === "infrastructure-error" ? "needs-attention" : "complete";
          if (repeat.reason === "unresolved-variance-at-cap") state.variance = repeat.reason;
        }
        await persist();
        return { index, result };
      } catch (error) {
        state.status = "needs-attention";
        state.error = error.message;
        await persist();
        return { index, error: error.message };
      }
    }, wave.policy.concurrency);
    peakConcurrency = Math.max(peakConcurrency, round.peak_concurrency);
    if (executedThisRound === 0) break;
  }

  await saveQueue;
  const pendingModelJobs = wave.jobs.filter((state) => state.status === "pending" && wave.plan.jobs[state.index].model_required);
  const needsAttention = wave.jobs.filter((state) => state.status === "needs-attention");
  if (pendingModelJobs.length > 0 && budget.pauseReason()) {
    wave.status = "paused_budget";
    wave.pause_reason = budget.pauseReason();
  } else if (needsAttention.length > 0) {
    wave.status = "needs_attention";
    wave.pause_reason = "One or more jobs hit a hard limit or execution error.";
  } else if (wave.jobs.every((state) => state.status === "complete")) {
    wave.status = "complete";
    wave.pause_reason = null;
  } else {
    wave.status = "paused";
    wave.pause_reason = "Pending jobs require explicit resume.";
  }
  wave.usage = {
    jobs_completed: budget.jobsCompleted,
    model_requests: budget.modelRequests,
    spent_usd: budget.costAvailable ? budget.spentUsd : null,
    cost_available: budget.costAvailable,
  };
  await saveWave(wave);

  return {
    schema_version: 1,
    wave_id: wave.wave_id,
    wave_dir: wave.wave_root,
    skill: wave.skill,
    profile: wave.profile,
    status: wave.status,
    pause_reason: wave.pause_reason,
    jobs: wave.jobs,
    peak_concurrency: peakConcurrency,
    budget: budget.summary(),
  };
}

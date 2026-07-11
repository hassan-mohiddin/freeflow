import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { copyDirectory, makeReadOnly, materializeSkillVariant } from "./materialize.mjs";
import { hashDirectory, sha256, stableJson } from "./hash.mjs";
import { DEFAULT_OUTPUT_LIMIT_BYTES } from "./constants.mjs";
import { isWithin } from "./path-policy.mjs";

function createWaveId(skill) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `${timestamp}-${skill}-${process.pid}`;
}

export async function saveWave(wave) {
  wave.updated_at = new Date().toISOString();
  const path = resolve(wave.wave_root, "wave.json");
  const temp = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temp, `${JSON.stringify(wave, null, 2)}\n`, { flag: "wx" });
  await rename(temp, path);
  return path;
}

export async function createWave(workspace, plan, options) {
  const waveId = createWaveId(plan.skill);
  const waveRoot = resolve(workspace.skillRoot, "runs", "waves", waveId);
  const snapshotsRoot = resolve(waveRoot, "snapshots");
  const fixturesRoot = resolve(waveRoot, "fixtures");
  await Promise.all([mkdir(snapshotsRoot, { recursive: true }), mkdir(fixturesRoot, { recursive: true })]);
  const snapshots = {};
  const fixtures = {};

  for (const job of plan.jobs) {
    if (job.variant.kind === "none") continue;
    const hash = job.variant.snapshot_hash;
    if (snapshots[hash]) continue;
    const destination = resolve(snapshotsRoot, hash);
    await materializeSkillVariant(workspace.repoRoot, job.variant, destination);
    const actual = await hashDirectory(destination);
    if (actual !== hash) throw new Error(`Frozen snapshot hash mismatch for ${job.variant.id}: expected ${hash}, got ${actual}`);
    snapshots[hash] = destination;
  }

  for (const job of plan.jobs) {
    if (!job.fixture_path || fixtures[job.fixture_hash]) continue;
    const destination = resolve(fixturesRoot, job.fixture_hash);
    await copyDirectory(job.fixture_path, destination);
    const actual = await hashDirectory(destination);
    if (actual !== job.fixture_hash) throw new Error(`Frozen fixture hash mismatch for ${job.case_id}: expected ${job.fixture_hash}, got ${actual}`);
    await makeReadOnly(destination);
    fixtures[job.fixture_hash] = destination;
  }

  const now = new Date().toISOString();
  const wave = {
    schema_version: 1,
    wave_id: waveId,
    wave_root: waveRoot,
    skill: plan.skill,
    profile: plan.profile,
    status: "planned",
    created_at: now,
    updated_at: now,
    plan,
    snapshots,
    fixtures,
    policy: {
      concurrency: Number(options.concurrency ?? 1),
      max_model_requests: Number(options.max_model_requests ?? 1),
      max_usd: options.max_usd === undefined ? null : Number(options.max_usd),
      max_turns_per_job: Number(options.max_turns_per_job ?? 1),
      output_limit_bytes: Number(options.output_limit_bytes ?? DEFAULT_OUTPUT_LIMIT_BYTES),
    },
    usage: {
      jobs_completed: 0,
      model_requests: 0,
      spent_usd: 0,
      cost_available: true,
    },
    jobs: plan.jobs.map((job, index) => ({
      index,
      key: `${job.case_id}:${job.variant.id}`,
      case_id: job.case_id,
      variant: job.variant.id,
      status: "pending",
      attempts: 0,
      run_dir: null,
      runtime_verdict: null,
    })),
    pause_reason: null,
  };
  await saveWave(wave);
  return wave;
}

export async function loadWave(input) {
  const absolute = resolve(input);
  const info = await stat(absolute);
  const path = info.isDirectory() ? resolve(absolute, "wave.json") : absolute;
  const wave = JSON.parse(await readFile(path, "utf8"));
  if (wave.schema_version !== 1 || !wave.wave_id || !wave.wave_root || !wave.plan) throw new Error(`Invalid wave state: ${path}`);
  if (resolve(wave.wave_root) !== dirname(path)) throw new Error(`Wave root mismatch: ${path}`);
  for (const job of wave.jobs) {
    if (job.status === "running") {
      job.status = "pending";
      job.interrupted_before_resume = true;
    }
  }
  return wave;
}

export async function validateWaveOwnership(workspace, wave) {
  if (wave.skill !== workspace.suite.skill) throw new Error(`Wave skill mismatch: ${wave.skill}`);
  const expectedBase = resolve(workspace.skillRoot, "runs", "waves");
  const [canonicalBase, canonicalWave] = await Promise.all([realpath(expectedBase), realpath(wave.wave_root)]);
  if (!isWithin(canonicalBase, canonicalWave)) throw new Error(`Wave is outside the owned generated root: ${wave.wave_root}`);
  for (const [kind, paths] of [["snapshot", wave.snapshots], ["fixture", wave.fixtures]]) {
    for (const path of Object.values(paths ?? {})) {
      const canonical = await realpath(path);
      if (!isWithin(resolve(canonicalWave, `${kind}s`), canonical)) throw new Error(`${kind} is outside the owned wave root: ${path}`);
    }
  }
  return true;
}

function raisedNumber(previous, next, label) {
  if (next === undefined) return previous;
  const value = Number(next);
  if (!Number.isFinite(value) || value < previous) throw new Error(`${label} may only be raised on resume`);
  return value;
}

export function applyEscalation(wave, options) {
  const previousTurns = wave.policy.max_turns_per_job;
  const previousOutput = wave.policy.output_limit_bytes;
  wave.policy.max_model_requests = raisedNumber(wave.policy.max_model_requests, options.max_model_requests, "max_model_requests");
  wave.policy.max_turns_per_job = raisedNumber(wave.policy.max_turns_per_job, options.max_turns_per_job, "max_turns_per_job");
  wave.policy.output_limit_bytes = raisedNumber(wave.policy.output_limit_bytes, options.output_limit_bytes, "output_limit_bytes");
  if (options.max_usd !== undefined) {
    const next = options.max_usd === "none" || options.max_usd === null ? null : Number(options.max_usd);
    if (wave.policy.max_usd === null && next !== null) throw new Error("Cannot lower an unlimited spend cap on resume");
    if (wave.policy.max_usd !== null && next !== null && next < wave.policy.max_usd) throw new Error("max_usd may only be raised on resume");
    wave.policy.max_usd = next;
  }
  if (options.concurrency !== undefined) wave.policy.concurrency = Number(options.concurrency);

  if (previousTurns !== wave.policy.max_turns_per_job || previousOutput !== wave.policy.output_limit_bytes) {
    for (const state of wave.jobs.filter((item) => item.status !== "complete")) {
      const job = wave.plan.jobs[state.index];
      job.fingerprint_inputs.hard_limits.max_turns_per_job = wave.policy.max_turns_per_job;
      job.fingerprint_inputs.hard_limits.output_limit_bytes = wave.policy.output_limit_bytes;
      job.fingerprint = sha256(stableJson(job.fingerprint_inputs));
      state.verdicts = [];
      state.configuration_escalations ??= [];
      state.configuration_escalations.push({
        at: new Date().toISOString(),
        max_turns_per_job: wave.policy.max_turns_per_job,
        output_limit_bytes: wave.policy.output_limit_bytes,
        fingerprint: job.fingerprint,
      });
    }
    const subjectJobs = wave.plan.expected_model_jobs?.subject ?? 0;
    if (wave.plan.model_request_bounds) wave.plan.model_request_bounds.subject_max = subjectJobs * wave.policy.max_turns_per_job;
  }

  wave.pause_reason = null;
  return wave;
}

export function frozenFixtureFor(wave, job) {
  if (!job.fixture_path) return null;
  const path = wave.fixtures?.[job.fixture_hash];
  if (!path || basename(path) !== job.fixture_hash) throw new Error(`Missing frozen fixture for ${job.case_id}`);
  return path;
}

export function frozenSnapshotFor(wave, job) {
  if (job.variant.kind === "none") return null;
  const path = wave.snapshots[job.variant.snapshot_hash];
  if (!path || basename(path) !== job.variant.snapshot_hash) throw new Error(`Missing frozen snapshot for ${job.case_id}/${job.variant.id}`);
  return path;
}

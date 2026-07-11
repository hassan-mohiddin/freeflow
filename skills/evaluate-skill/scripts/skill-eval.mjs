#!/usr/bin/env node

import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs, integerOption } from "./lib/args.mjs";
import { doctorReport } from "./lib/doctor.mjs";
import { buildPlan } from "./lib/plan.mjs";
import { gradeObjectiveRun } from "./lib/grade.mjs";
import { collectRuns, createReport } from "./lib/report.mjs";
import { runPlan } from "./lib/run.mjs";
import { gradeSemanticRun } from "./lib/semantic.mjs";
import { findRepoRoot, initSkillWorkspace, loadSkillWorkspace, readJson } from "./lib/workspace.mjs";

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return `skill-eval.mjs <command> [options]

Commands:
  doctor
  init --skill <name> [--root <directory>]
  plan --skill <name> [--case <id>] [--profile iterate|acceptance]
  run --skill <name> ...
  grade --run <path> [--objective-only]
  report --run <path>
`;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (!command || options.help) {
    process.stdout.write(usage());
    return 0;
  }

  if (command === "doctor") {
    printJson(await doctorReport());
    return 0;
  }

  if (command === "init") {
    if (typeof options.skill !== "string") throw new Error("init requires --skill <name>");
    const root = resolve(options.root ?? process.cwd());
    if (root === resolve("/") || root === resolve(homedir())) throw new Error(`Refusing destructive init root: ${root}`);
    printJson(await initSkillWorkspace({ root, skill: options.skill }));
    return 0;
  }

  if (command === "plan" || command === "run") {
    if (typeof options.skill !== "string") throw new Error(`${command} requires --skill <name>`);
    const repoRoot = await findRepoRoot(options.root ?? process.cwd());
    const workspace = await loadSkillWorkspace(repoRoot, options.skill);
    const planOptions = {
      case: options.case,
      profile: options.profile,
      provider: options.provider,
      model: options.model,
      thinking: options.thinking,
      backend_model_revision: options.backend_model_revision,
      max_model_calls: options.max_model_calls === undefined ? undefined : integerOption(options, "max_model_calls"),
    };
    const plan = await buildPlan(workspace, planOptions);
    if (command === "plan") {
      printJson(plan);
      return 0;
    }
    const result = await runPlan(workspace, plan, {
      ...planOptions,
      concurrency: options.concurrency === undefined ? 1 : integerOption(options, "concurrency"),
      max_usd: options.max_usd,
      no_cache: options.no_cache === true,
      candidate_only: options.candidate_only === true,
      cache_max_age_hours: options.cache_max_age_hours === undefined ? 24 : Number(options.cache_max_age_hours),
      output_limit_bytes: options.output_limit_bytes === undefined ? 1048576 : integerOption(options, "output_limit_bytes"),
    });
    printJson(result);
    return 0;
  }

  if (command === "grade") {
    if (typeof options.run !== "string") throw new Error("grade requires --run <path>");
    const runDir = resolve(options.run);
    const objective = await gradeObjectiveRun(runDir);
    await writeFile(resolve(runDir, "objective-grade.json"), `${JSON.stringify(objective, null, 2)}\n`);
    if (options.objective_only === true || !objective.semantic_pending) {
      printJson(objective);
      return 0;
    }
    for (const key of ["provider", "model", "thinking", "max_model_calls"]) {
      if (options[key] === undefined) throw new Error(`semantic grade requires --${key.replaceAll("_", "-")}`);
    }
    const semantic = await gradeSemanticRun(runDir, {
      provider: options.provider,
      model: options.model,
      thinking: options.thinking,
      max_model_calls: integerOption(options, "max_model_calls"),
      max_usd: options.max_usd,
      timeout_ms: options.timeout_ms,
      output_limit_bytes: options.output_limit_bytes,
    });
    const combined = {
      schema_version: 1,
      objective,
      semantic,
      verdict: objective.objective_pass ? semantic.verdict : "fail",
    };
    await writeFile(resolve(runDir, "grade.json"), `${JSON.stringify(combined, null, 2)}\n`);
    printJson(combined);
    return 0;
  }

  if (command === "report") {
    let runs;
    let skill = options.skill;
    if (typeof options.run === "string") {
      const runDir = resolve(options.run);
      const metadata = await readJson(resolve(runDir, "metadata.json"));
      const objective = await readJson(resolve(runDir, "objective-grade.json"));
      skill ??= metadata.skill;
      runs = [{ root: runDir, metadata, objective }];
    } else {
      if (typeof skill !== "string") throw new Error("report requires --run <path> or --skill <name>");
      const repoRoot = await findRepoRoot(options.root ?? process.cwd());
      runs = await collectRuns(resolve(repoRoot, ".skill-eval", skill, "runs"));
    }
    const report = createReport(runs, { skill: skill ?? "skill" });
    if (typeof options.output === "string") {
      const output = resolve(options.output);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output.endsWith(".json") ? output : `${output}.json`, `${JSON.stringify(report.json, null, 2)}\n`);
      await writeFile(output.endsWith(".md") ? output : `${output}.md`, report.markdown);
    }
    printJson(report);
    return 0;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`skill-eval: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}

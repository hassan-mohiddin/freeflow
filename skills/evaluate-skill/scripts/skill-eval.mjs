#!/usr/bin/env node

import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, integerOption } from "./lib/args.mjs";
import { doctorReport } from "./lib/doctor.mjs";
import { buildEvaluationPlan } from "./lib/plan.mjs";
import { findRepoRoot, initSkillWorkspace, loadSkillWorkspace } from "./lib/workspace.mjs";

const COMMAND_OPTIONS = {
  doctor: new Set(["root", "help"]),
  init: new Set(["skill", "root", "help"]),
  evaluate: new Set([
    "skill", "case", "host", "timeout_ms", "output_limit_bytes", "provider", "model", "thinking",
    "subject_provider", "subject_model", "subject_thinking", "grader_provider", "grader_model", "grader_thinking",
    "max_turns_per_process", "max_usd", "plan_only", "owner_approved", "expect_plan", "root", "help",
  ]),
};

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return `skill-eval.mjs <command> [options]

Commands:
  doctor [--root <repo>]
  init --skill <name> [--root <repo>]
  evaluate --skill <name> --case <id> [--host pi|codex] --timeout-ms <integer> --output-limit-bytes <integer> [model options] [--plan-only | --owner-approved]
`;
}

function validateOptions(command, options) {
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed) throw new Error(`Unknown command: ${command}`);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error(`Unknown option for ${command}: --${key.replaceAll("_", "-")}`);
  }
  for (const key of ["help", "plan_only", "owner_approved"]) {
    if (options[key] !== undefined && options[key] !== true) throw new Error(`--${key.replaceAll("_", "-")} does not take a value`);
  }
}

function outcomeForPlan(plan) {
  const outcome = { status: plan.status, plan: plan.summary };
  if (plan.summary.limitations.length > 0) outcome.limitations = plan.summary.limitations;
  return outcome;
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(usage());
    return 0;
  }
  const { command, options, positionals } = parseArgs(argv);
  validateOptions(command, options);
  if (positionals.length > 0) throw new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
  if (options.help) {
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

  if (typeof options.skill !== "string") throw new Error("evaluate requires --skill <name>");
  if (typeof options.case !== "string") throw new Error("evaluate requires --case <id>");
  if (options.timeout_ms === undefined) throw new Error("evaluate requires --timeout-ms <integer>");
  if (options.output_limit_bytes === undefined) throw new Error("evaluate requires --output-limit-bytes <integer>");
  if (options.plan_only && options.owner_approved) throw new Error("--plan-only and --owner-approved are mutually exclusive");
  if (options.expect_plan !== undefined && !options.owner_approved) throw new Error("--expect-plan requires --owner-approved");

  const repoRoot = await findRepoRoot(options.root ?? process.cwd());
  const workspace = await loadSkillWorkspace(repoRoot, options.skill);
  const plan = await buildEvaluationPlan(workspace, {
    case: options.case,
    host: options.host,
    timeout_ms: integerOption(options, "timeout_ms"),
    output_limit_bytes: integerOption(options, "output_limit_bytes"),
    provider: options.provider,
    model: options.model,
    thinking: options.thinking,
    subject_provider: options.subject_provider,
    subject_model: options.subject_model,
    subject_thinking: options.subject_thinking,
    grader_provider: options.grader_provider,
    grader_model: options.grader_model,
    grader_thinking: options.grader_thinking,
    max_turns_per_process: options.max_turns_per_process === undefined ? undefined : integerOption(options, "max_turns_per_process"),
    max_usd: options.max_usd,
    plan_only: options.plan_only === true,
    owner_approved: options.owner_approved === true,
    expect_plan: options.expect_plan,
  });

  if (plan.status !== "ready") {
    printJson(outcomeForPlan(plan));
    return plan.status === "blocked" ? 1 : 0;
  }

  const { executeEvaluation } = await import("./lib/evaluate.mjs");
  const outcome = await executeEvaluation(workspace, plan);
  printJson(outcome);
  return outcome.status === "complete" ? 0 : 1;
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

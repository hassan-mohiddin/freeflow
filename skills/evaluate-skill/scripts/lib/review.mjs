import { randomInt } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { sha256, writeJson, writeText } from "./evidence.mjs";
import { baseProcessEnvironment, runPiProcess } from "./pi.mjs";
import { resolveResult } from "./view.mjs";

const ANSWERS = new Set(["yes", "no", "unclear"]);
const RESPONSE_LIMIT = 8000;
const ARGUMENT_LIMIT = 300;

/**
 * Answers each group's review questions with a separate model that sees two unlabeled runs.
 * The result is advisory: it is written beside, never into, canonical run and grade evidence.
 *
 * @param {string} target
 * @param {{group: string | null}} selectors
 * @param {{root?: string, signal?: AbortSignal, model: string, thinking?: string | null}} options
 */
export async function reviewResult(target, selectors, { root = process.cwd(), signal, model, thinking = null }) {
  const resultDirectory = await resolveResult(target, root);
  const summary = JSON.parse(await readFile(path.join(resultDirectory, "summary.json"), "utf8"));
  const groups = selectGroups(summary, selectors.group);
  const outcomes = [];
  for (const group of groups) {
    if (signal?.aborted) break;
    outcomes.push(
      await reviewGroup(path.join(resultDirectory, "groups", group.id), group.id, { model, thinking, signal }),
    );
  }
  return { resultDirectory, groups: outcomes };
}

function selectGroups(summary, selector) {
  const groups = Array.isArray(summary.groups) ? summary.groups : [];
  if (selector === null) return groups;
  if (summary.definitionKind === "group") throw new Error("--group cannot be used with a direct group result");
  const position = /^\d+$/.test(selector) ? Number(selector) : null;
  const selected = groups.filter((group) => (position === null ? group.id === selector : group.position === position));
  if (selected.length === 0) throw new Error(`Unknown group selector: ${selector}`);
  return selected;
}

async function reviewGroup(groupDirectory, id, { model, thinking, signal }) {
  const definition = JSON.parse(await readFile(path.join(groupDirectory, "definition.json"), "utf8"));
  const questions = Array.isArray(definition.review_questions) ? definition.review_questions : [];
  if (questions.length === 0) return { id, state: "skipped", reason: "no review questions" };
  const runs = {};
  for (const variant of ["baseline", "candidate"]) {
    runs[variant] = JSON.parse(await readFile(path.join(groupDirectory, variant, "run.json"), "utf8"));
    if (runs[variant].state !== "complete")
      return { id, state: "skipped", reason: `${variant} run is ${runs[variant].state}` };
  }

  const labels = randomInt(2) === 0 ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" };
  const prompt = reviewPrompt(definition, questions, { A: runs[labels.A], B: runs[labels.B] });
  const reviewDirectory = path.join(groupDirectory, "review");
  await rm(reviewDirectory, { recursive: true, force: true });
  await mkdir(reviewDirectory, { recursive: true });
  await writeText(path.join(reviewDirectory, "prompt.md"), prompt);

  const args = [
    "--mode",
    "json",
    "-p",
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--no-tools",
    "--model",
    model,
  ];
  if (thinking !== null) args.push("--thinking", thinking);
  args.push(prompt);
  const observation = await runPiProcess({
    command: "pi",
    args,
    cwd: reviewDirectory,
    eventsFile: path.join(reviewDirectory, "events.jsonl"),
    stderrFile: path.join(reviewDirectory, "stderr.log"),
    signal,
    environment: { ...baseProcessEnvironment(), PWD: reviewDirectory, PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" },
  });
  await writeText(path.join(reviewDirectory, "final.md"), `${observation.response}\n`);

  const errors = [];
  if (observation.exitCode !== 0 || !observation.settled || observation.assistantError !== null) {
    errors.push(
      `reviewer did not complete: exit=${observation.exitCode} settled=${observation.settled} error=${observation.assistantError}`,
    );
  }
  const answers = errors.length === 0 ? parseAnswers(observation.response, questions, labels, errors) : [];
  const state = errors.length === 0 ? "complete" : "review-error";
  await writeJson(path.join(groupDirectory, "semantic-grade.json"), {
    schema_version: 1,
    kind: "advisory-review",
    advisory: true,
    state,
    model,
    thinking,
    labels,
    prompt: { file: "review/prompt.md", sha256: sha256(prompt) },
    answers,
    errors,
    usage: observation.usage,
    artifacts: { events: "review/events.jsonl", final: "review/final.md", stderr: "review/stderr.log" },
    completedAt: new Date().toISOString(),
  });
  return { id, state, artifact: "semantic-grade.json" };
}

function reviewPrompt(definition, questions, runs) {
  const task =
    typeof definition.input?.prompt === "string" ? [definition.input.prompt] : (definition.input?.turns ?? []);
  const lines = [
    "You are reviewing two anonymous runs, Run A and Run B, of the same agent task.",
    "Judge only the evidence below. Answer every question for both runs with yes, no, or unclear.",
    "",
    "Task turns:",
    ...task.map((turn, index) => `${index + 1}. ${turn}`),
    "",
    "Questions:",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
  ];
  for (const label of ["A", "B"]) lines.push("", `## Run ${label}`, ...runEvidence(runs[label]));
  lines.push(
    "",
    "Reply with only JSON in this shape:",
    '{"answers":[{"question":1,"A":"yes|no|unclear","B":"yes|no|unclear","rationale":"one sentence"}]}',
  );
  return lines.join("\n");
}

function runEvidence(run) {
  const turns = Array.isArray(run.turns)
    ? run.turns
    : [{ turn: 1, response: run.response, toolActivity: run.toolActivity }];
  const lines = [];
  for (const turn of turns) {
    lines.push(`Turn ${turn.turn ?? 1} response:`, truncate(String(turn.response ?? ""), RESPONSE_LIMIT));
    for (const call of turn.toolActivity ?? []) {
      const status = call.completed ? (call.isError ? "failed" : "succeeded") : "incomplete";
      lines.push(`- tool ${call.toolName} ${status}: ${truncate(JSON.stringify(call.args ?? null), ARGUMENT_LIMIT)}`);
    }
  }
  const changes = run.effects?.changes;
  if (changes) {
    for (const kind of ["created", "modified", "deleted"]) {
      lines.push(`Files ${kind}: ${(changes[kind] ?? []).join(", ") || "none"}`);
    }
  }
  return lines;
}

function truncate(value, limit) {
  return value.length <= limit ? value : `${value.slice(0, limit)}… [truncated ${value.length - limit} characters]`;
}

function parseAnswers(response, questions, labels, errors) {
  const text = response
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    errors.push("reviewer response is not JSON");
    return [];
  }
  const answers = Array.isArray(parsed?.answers) ? parsed.answers : null;
  if (answers === null || answers.length !== questions.length) {
    errors.push(`reviewer must answer exactly ${questions.length} question(s)`);
    return [];
  }
  const mapped = [];
  for (const [index, question] of questions.entries()) {
    const answer = answers.find((entry) => entry?.question === index + 1);
    if (!answer || !ANSWERS.has(answer.A) || !ANSWERS.has(answer.B) || typeof answer.rationale !== "string") {
      errors.push(`reviewer answer for question ${index + 1} is missing or invalid`);
      continue;
    }
    mapped.push({
      question,
      [labels.A]: answer.A,
      [labels.B]: answer.B,
      rationale: answer.rationale,
    });
  }
  return errors.length === 0 ? mapped : [];
}

import { randomInt } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sha256, writeJson, writeText } from "./evidence.mjs";
import { describeExtension } from "./extensions.mjs";
import { prepareIsolation, removeCopiedCredentials } from "./isolation.mjs";
import { baseProcessEnvironment, runPiProcess } from "./pi.mjs";
import { resolveResult } from "./view.mjs";

const ANSWERS = new Set(["yes", "no", "unclear"]);
const RESPONSE_LIMIT = 8000;
const ARGUMENT_LIMIT = 300;
const FILE_LIMIT = 20000;
const MATERIALS_LIMIT = 60000;

/**
 * Answers each group's review questions with a separate model that sees two unlabeled runs.
 * The result is advisory: it is written beside, never into, canonical run and grade evidence.
 * The reviewer is a judge under Review Work's judge contract: it sees each run's written files in full
 * (up to a stated limit) and the shared task materials, with run paths and arm names replaced by
 * neutral tokens, and its identity, family relation and unmet contract items are recorded.
 *
 * Pi extensions stay off except the ones named in `extensions` (for example, a provider's auth extension).
 * Each is recorded, because an extension can change what the reviewer is sent.
 *
 * @param {string} target
 * @param {{group: string | null}} selectors
 * @param {{root?: string, signal?: AbortSignal, model: string, thinking?: string | null, extensions?: string[], swap?: boolean}} options
 */
export async function reviewResult(
  target,
  selectors,
  { root = process.cwd(), signal, model, thinking = null, extensions = [], swap = false },
) {
  const loaded = await Promise.all(extensions.map((entry) => describeExtension(path.resolve(root, entry))));
  const resultDirectory = await resolveResult(target, root);
  const summary = JSON.parse(await readFile(path.join(resultDirectory, "summary.json"), "utf8"));
  const groups = selectGroups(summary, selectors.group);
  const outcomes = [];
  for (const group of groups) {
    if (signal?.aborted) break;
    outcomes.push(
      await reviewGroup(path.join(resultDirectory, "groups", group.id), group.id, {
        root,
        model,
        thinking,
        extensions: loaded,
        swap,
        signal,
      }),
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

async function reviewGroup(groupDirectory, id, { root, model, thinking, extensions, swap, signal }) {
  const definition = JSON.parse(await readFile(path.join(groupDirectory, "definition.json"), "utf8"));
  const questions = Array.isArray(definition.review_questions) ? definition.review_questions : [];
  if (questions.length === 0) return { id, state: "skipped", reason: "no review questions" };
  const runs = {};
  for (const variant of ["baseline", "candidate"]) {
    runs[variant] = JSON.parse(await readFile(path.join(groupDirectory, variant, "run.json"), "utf8"));
    if (runs[variant].state !== "complete")
      return { id, state: "skipped", reason: `${variant} run is ${runs[variant].state}` };
  }

  const neutral = neutralizer(groupDirectory, runs, root);
  const evidence = {
    materials: await taskMaterials(path.join(groupDirectory, "resources", "fixture")),
    baseline: await runEvidence(runs.baseline, neutral),
    candidate: await runEvidence(runs.candidate, neutral),
  };
  const labels = randomInt(2) === 0 ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" };
  const first = await runJudge(groupDirectory, "review", definition, questions, labels, evidence, {
    model,
    thinking,
    extensions,
    signal,
  });
  let second = null;
  if (swap && first.errors.length === 0 && !signal?.aborted) {
    const swapped = { A: labels.B, B: labels.A };
    second = await runJudge(groupDirectory, "review-swap", definition, questions, swapped, evidence, {
      model,
      thinking,
      extensions,
      signal,
    });
  }

  const errors = [...first.errors, ...(second?.errors ?? [])];
  const state = errors.length === 0 ? "complete" : "review-error";
  const provider = model.includes("/") ? model.split("/")[0] : null;
  const subjectProviders = [...new Set(["baseline", "candidate"].map((variant) => subjectProvider(runs[variant])))];
  const contractGaps = [];
  if (second === null) contractGaps.push("order not swapped");
  contractGaps.push("calibration not checked");
  await writeJson(path.join(groupDirectory, "semantic-grade.json"), {
    schema_version: 1,
    kind: "advisory-review",
    advisory: true,
    state,
    model,
    thinking,
    extensions,
    // Family is approximated by the provider: it says whether the judge and the subject come from one maker.
    judge: { model, provider, family: provider, thinking, extensions, isolation: first.isolation },
    subject: { providers: subjectProviders, familyRelation: familyRelation(provider, subjectProviders) },
    labels,
    prompt: { file: "review/prompt.md", sha256: first.promptSha256 },
    answers: errors.length === 0 ? first.answers : [],
    ...(second === null
      ? {}
      : {
          swap: {
            labels: second.labels,
            prompt: { file: "review-swap/prompt.md", sha256: second.promptSha256 },
            answers: errors.length === 0 ? second.answers : [],
            agreement: errors.length === 0 ? agreement(first.answers, second.answers) : null,
          },
        }),
    contractGaps,
    errors,
    usage: first.usage,
    ...(second === null ? {} : { swapUsage: second.usage }),
    artifacts: { events: "review/events.jsonl", final: "review/final.md", stderr: "review/stderr.log" },
    completedAt: new Date().toISOString(),
  });
  return { id, state, artifact: "semantic-grade.json" };
}

async function runJudge(groupDirectory, name, definition, questions, labels, evidence, options) {
  const { model, thinking, extensions, signal } = options;
  const prompt = reviewPrompt(definition, questions, evidence, labels);
  const reviewDirectory = path.join(groupDirectory, name);
  await rm(reviewDirectory, { recursive: true, force: true });
  await mkdir(reviewDirectory, { recursive: true });
  await writeText(path.join(reviewDirectory, "prompt.md"), prompt);

  const args = [
    "--mode",
    "json",
    "-p",
    "--no-session",
    "--no-extensions",
    ...extensions.flatMap((extension) => ["--extension", extension.path]),
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
  // The judge runs in its own isolated home and agent directory, like a subject.
  let isolation;
  try {
    isolation = await prepareIsolation(reviewDirectory, model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { labels, answers: [], errors: [message], usage: null, promptSha256: sha256(prompt), isolation: null };
  }
  const observation = await runPiProcess({
    command: "pi",
    args,
    cwd: reviewDirectory,
    eventsFile: path.join(reviewDirectory, "events.jsonl"),
    stderrFile: path.join(reviewDirectory, "stderr.log"),
    signal,
    environment: {
      ...baseProcessEnvironment(),
      PWD: reviewDirectory,
      PI_SKIP_VERSION_CHECK: "1",
      PI_TELEMETRY: "0",
      ...isolation.environment,
    },
  });
  await removeCopiedCredentials(reviewDirectory);
  await writeText(path.join(reviewDirectory, "final.md"), `${observation.response}\n`);

  const errors = [];
  if (observation.exitCode !== 0 || !observation.settled || observation.assistantError !== null) {
    errors.push(
      `reviewer did not complete: exit=${observation.exitCode} settled=${observation.settled} error=${observation.assistantError}`,
    );
  }
  const answers = errors.length === 0 ? parseAnswers(observation.response, questions, labels, errors) : [];
  return {
    labels,
    answers,
    errors,
    usage: observation.usage,
    promptSha256: sha256(prompt),
    isolation: isolation.evidence,
  };
}

function subjectProvider(run) {
  const observed = run.model?.observed?.provider;
  if (typeof observed === "string" && observed !== "") return observed;
  const declared = run.model?.declared?.model;
  return typeof declared === "string" && declared.includes("/") ? declared.split("/")[0] : null;
}

function familyRelation(judgeProvider, subjectProviders) {
  if (judgeProvider === null || subjectProviders.includes(null)) return "unknown";
  return subjectProviders.includes(judgeProvider) ? "same" : "different";
}

/** Questions on which both orders gave the same answer for each run. */
function agreement(first, second) {
  let agreed = 0;
  for (const answer of first) {
    const other = second.find((entry) => entry.question === answer.question);
    if (other && other.baseline === answer.baseline && other.candidate === answer.candidate) agreed += 1;
  }
  return { agreed, questions: first.length };
}

/**
 * Replaces each run's workspace, the group directory, the repository root and the user's home with neutral
 * tokens, so neither absolute paths nor the arm names inside them reach the judge. A subject can name paths
 * outside its sandbox (a blocked read, for example), so the outer roots are replaced too.
 */
function neutralizer(groupDirectory, runs, root) {
  const replacements = [];
  for (const variant of ["baseline", "candidate"]) {
    if (typeof runs[variant].workspace === "string") replacements.push([runs[variant].workspace, "<workspace>"]);
    replacements.push([path.join(groupDirectory, variant), "<run>"]);
  }
  replacements.push([groupDirectory, "<group>"], [path.resolve(root), "<repo>"]);
  const home = os.homedir();
  if (home && home !== path.parse(home).root) replacements.push([home, "<home>"]);
  replacements.sort((left, right) => right[0].length - left[0].length);
  return (text) => {
    let value = String(text);
    for (const [from, to] of replacements) value = value.split(from).join(to);
    return value;
  };
}

async function taskMaterials(fixtureDirectory) {
  const files = await listFiles(fixtureDirectory);
  const lines = [];
  let used = 0;
  for (const relative of files) {
    const text = await readText(path.join(fixtureDirectory, relative));
    if (text === null) continue;
    const remaining = MATERIALS_LIMIT - used;
    if (remaining <= 0) {
      lines.push(`(further task files omitted: the materials limit of ${MATERIALS_LIMIT} characters was reached)`);
      break;
    }
    const shown = truncate(text, Math.min(FILE_LIMIT, remaining));
    used += Math.min(text.length, FILE_LIMIT, remaining);
    lines.push(`### ${relative}`, "```", shown, "```");
  }
  return lines;
}

async function runEvidence(run, neutral) {
  const turns = Array.isArray(run.turns)
    ? run.turns
    : [{ turn: 1, response: run.response, toolActivity: run.toolActivity }];
  const lines = [];
  for (const turn of turns) {
    lines.push(`Turn ${turn.turn ?? 1} response:`, truncate(neutral(turn.response ?? ""), RESPONSE_LIMIT));
    for (const call of turn.toolActivity ?? []) {
      const status = call.completed ? (call.isError ? "failed" : "succeeded") : "incomplete";
      lines.push(
        `- tool ${call.toolName} ${status}: ${truncate(neutral(JSON.stringify(call.args ?? null)), ARGUMENT_LIMIT)}`,
      );
    }
  }
  const changes = run.effects?.changes;
  if (changes) {
    for (const kind of ["created", "modified", "deleted"]) {
      lines.push(`Files ${kind}: ${(changes[kind] ?? []).join(", ") || "none"}`);
    }
    if (typeof run.workspace === "string") {
      for (const relative of [...(changes.created ?? []), ...(changes.modified ?? [])]) {
        const text = await readText(path.join(run.workspace, relative));
        if (text === null) continue;
        lines.push(`### File written: ${relative}`, "```", truncate(neutral(text), FILE_LIMIT), "```");
      }
    }
  }
  return lines;
}

function reviewPrompt(definition, questions, evidence, labels) {
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
  if (evidence.materials.length > 0)
    lines.push("", "## Task materials (the same for both runs)", ...evidence.materials);
  for (const label of ["A", "B"]) lines.push("", `## Run ${label}`, ...evidence[labels[label]]);
  lines.push(
    "",
    "Reply with only JSON in this shape:",
    '{"answers":[{"question":1,"A":"yes|no|unclear","B":"yes|no|unclear","rationale":"one sentence"}]}',
  );
  return lines.join("\n");
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(directory, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

/** Text of a file, or null when it is missing or binary. */
async function readText(file) {
  const buffer = await readFile(file).catch(() => null);
  if (buffer === null || buffer.includes(0)) return null;
  return buffer.toString("utf8");
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

import { randomInt } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isClassicPair, referenceArm, storedArms } from "./arms.mjs";
import { sha256, writeJson, writeText } from "./evidence.mjs";
import { loadConfiguration } from "./definitions.mjs";
import { resolveHostExtensions } from "./pi-host.mjs";
import { prepareIsolation, removeCopiedCredentials } from "./isolation.mjs";
import { baseProcessEnvironment, runPiProcess } from "./pi.mjs";
import { resolveResult } from "./view.mjs";

const ANSWERS = new Set(["yes", "no", "unclear"]);
/**
 * How much the judge is shown, in characters: each turn's response, each tool call's arguments, each file, and the
 * task materials in total. `review --limit <name>=<chars>` overrides any of them; the effective limits are recorded,
 * and anything cut is recorded as a contract gap, because the judge contract asks for full files.
 */
export const REVIEW_LIMITS = Object.freeze({ response: 8000, argument: 300, file: 20000, materials: 60000 });

/**
 * Answers each group's review questions with a separate model that sees every arm's run, unlabeled: N runs get the
 * labels A, B, C, ... in a random order.
 * The result is advisory: it is written beside, never into, canonical run and grade evidence.
 * The reviewer is a judge under Review Work's judge contract: it sees each run's written files in full
 * (up to a stated limit) and the shared task materials, with run paths and arm names replaced by
 * neutral tokens, and its identity, family relation and unmet contract items are recorded.
 *
 * The reviewer's own configuration (model, host extensions such as a provider's auth extension, host settings) can come
 * from a schema 2 configuration file; `model` and `thinking` override its model. Extensions are recorded, because
 * an extension can change what the reviewer is sent.
 *
 * @param {string} target
 * @param {{group: string | null}} selectors
 * @param {{root?: string, signal?: AbortSignal, model?: string | null, thinking?: string | null, configuration?: string | null, swap?: boolean}} options
 */
export async function reviewResult(
  target,
  selectors,
  { root = process.cwd(), signal, model = null, thinking = null, configuration = null, swap = false, limits = {} },
) {
  for (const [name, value] of Object.entries(limits)) {
    if (!Object.hasOwn(REVIEW_LIMITS, name)) throw new Error(`unknown review limit: ${name}`);
    if (!Number.isInteger(value) || value < 1) throw new Error(`review limit ${name} must be a positive integer`);
  }
  const effectiveLimits = { ...REVIEW_LIMITS, ...limits };
  const judge =
    configuration === null
      ? { model: null, extensions: [], settings: {} }
      : await loadConfiguration(configuration, { root });
  model = model ?? judge.model?.model ?? null;
  thinking = thinking ?? judge.model?.thinking ?? null;
  if (model === null) throw new Error("the reviewer needs a model: pass --model or declare one in its configuration");
  const loaded = await resolveHostExtensions(judge.extensions);
  const settings = judge.settings;
  const resultDirectory = await resolveResult(target, root);
  const summary = JSON.parse(await readFile(path.join(resultDirectory, "summary.json"), "utf8"));
  const groups = selectGroups(summary, selectors.group);
  const outcomes = [];
  for (const group of groups) {
    if (signal?.aborted) break;
    outcomes.push(
      await reviewGroup(path.join(resultDirectory, "groups", group.id), group, {
        root,
        model,
        thinking,
        extensions: loaded,
        settings,
        swap,
        limits: effectiveLimits,
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

async function reviewGroup(
  groupDirectory,
  group,
  { root, model, thinking, extensions, settings, swap, limits, signal },
) {
  const { id } = group;
  const definition = JSON.parse(await readFile(path.join(groupDirectory, "definition.json"), "utf8"));
  const questions = Array.isArray(definition.review_questions) ? definition.review_questions : [];
  if (questions.length === 0) return { id, state: "skipped", reason: "no review questions" };
  const arms = storedArms(group, definition);
  const runs = {};
  for (const variant of arms) {
    runs[variant] = JSON.parse(await readFile(path.join(groupDirectory, variant, "run.json"), "utf8"));
    if (runs[variant].state !== "complete")
      return { id, state: "skipped", reason: `${variant} run is ${runs[variant].state}` };
  }

  const neutral = neutralizer(groupDirectory, runs, arms, root);
  // Counts every cut the judge's view takes: a truncated text or an omitted task file.
  const cut = {
    count: 0,
    text(value, chars) {
      if (value.length > chars) this.count += 1;
      return truncate(value, chars);
    },
    omit() {
      this.count += 1;
    },
  };
  const evidence = {
    materials: await taskMaterials(path.join(groupDirectory, "resources", "fixture"), limits, cut),
    runs: {},
  };
  for (const arm of arms) evidence.runs[arm] = await runEvidence(runs[arm], neutral, limits, cut);
  const order = shuffle(arms);
  const labels = labelled(order);
  const first = await runJudge(groupDirectory, "review", definition, questions, labels, evidence, {
    model,
    thinking,
    extensions,
    settings,
    signal,
  });
  let second = null;
  if (swap && first.errors.length === 0 && !signal?.aborted) {
    const swapped = labelled([...order].reverse());
    second = await runJudge(groupDirectory, "review-swap", definition, questions, swapped, evidence, {
      model,
      thinking,
      extensions,
      settings,
      signal,
    });
  }

  const errors = [...first.errors, ...(second?.errors ?? [])];
  const state = errors.length === 0 ? "complete" : "review-error";
  const provider = model.includes("/") ? model.split("/")[0] : null;
  const subjectProviders = [...new Set(arms.map((variant) => subjectProvider(runs[variant])))];
  const contractGaps = [];
  if (second === null) contractGaps.push("order not swapped");
  if (cut.count > 0) contractGaps.push("materials truncated");
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
    judge: { model, provider, family: provider, thinking, extensions, settings, isolation: first.isolation },
    subject: { providers: subjectProviders, familyRelation: familyRelation(provider, subjectProviders) },
    labels,
    prompt: { file: "review/prompt.md", sha256: first.promptSha256 },
    limits,
    truncated: cut.count,
    answers: errors.length === 0 ? first.answers : [],
    ...(second === null
      ? {}
      : {
          swap: {
            labels: second.labels,
            prompt: { file: "review-swap/prompt.md", sha256: second.promptSha256 },
            answers: errors.length === 0 ? second.answers : [],
            agreement:
              errors.length === 0
                ? agreement(first.answers, second.answers, arms, !isClassicPair(arms, referenceArm(definition)))
                : null,
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
  const { model, thinking, extensions, settings, signal } = options;
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
    isolation = await prepareIsolation(reviewDirectory, model, { settings });
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

/**
 * Questions on which both orders gave the same answer for every run. With `byArm`, also each arm's count of
 * questions on which its own answer held in both orders.
 */
function agreement(first, second, arms, byArm) {
  let agreed = 0;
  const perArm = Object.fromEntries(arms.map((arm) => [arm, { agreed: 0, questions: first.length }]));
  for (const answer of first) {
    const other = second.find((entry) => entry.question === answer.question);
    const held = arms.filter((arm) => other !== undefined && other[arm] === answer[arm]);
    for (const arm of held) perArm[arm].agreed += 1;
    if (held.length === arms.length) agreed += 1;
  }
  return byArm ? { agreed, questions: first.length, arms: perArm } : { agreed, questions: first.length };
}

/** A uniformly random order of the arms. */
function shuffle(arms) {
  const order = [...arms];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

/** Labels A, B, C, ... (then AA, AB, ...) for runs in the given order. */
function labelled(order) {
  return Object.fromEntries(order.map((arm, index) => [labelFor(index), arm]));
}

function labelFor(index) {
  let label = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    label = String.fromCharCode(65 + ((rest - 1) % 26)) + label;
  }
  return label;
}

/**
 * Replaces each run's workspace, the group directory, the repository root and the user's home with neutral
 * tokens, so neither absolute paths nor the arm names inside them reach the judge. A subject can name paths
 * outside its sandbox (a blocked read, for example), so the outer roots are replaced too.
 */
function neutralizer(groupDirectory, runs, arms, root) {
  const replacements = [];
  for (const variant of arms) {
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

async function taskMaterials(fixtureDirectory, limits, cut) {
  const files = await listFiles(fixtureDirectory);
  const lines = [];
  let used = 0;
  for (const relative of files) {
    const text = await readText(path.join(fixtureDirectory, relative));
    if (text === null) continue;
    const remaining = limits.materials - used;
    if (remaining <= 0) {
      cut.omit();
      lines.push(`(further task files omitted: the materials limit of ${limits.materials} characters was reached)`);
      break;
    }
    const shown = cut.text(text, Math.min(limits.file, remaining));
    used += Math.min(text.length, limits.file, remaining);
    lines.push(`### ${relative}`, "```", shown, "```");
  }
  return lines;
}

async function runEvidence(run, neutral, limits, cut) {
  const turns = Array.isArray(run.turns)
    ? run.turns
    : [{ turn: 1, response: run.response, toolActivity: run.toolActivity }];
  const lines = [];
  for (const turn of turns) {
    lines.push(`Turn ${turn.turn ?? 1} response:`, cut.text(neutral(turn.response ?? ""), limits.response));
    for (const call of turn.toolActivity ?? []) {
      const status = call.completed ? (call.isError ? "failed" : "succeeded") : "incomplete";
      lines.push(
        `- tool ${call.toolName} ${status}: ${cut.text(neutral(JSON.stringify(call.args ?? null)), limits.argument)}`,
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
        lines.push(`### File written: ${relative}`, "```", cut.text(neutral(text), limits.file), "```");
      }
    }
  }
  return lines;
}

const COUNTS = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function reviewPrompt(definition, questions, evidence, labels) {
  const task =
    typeof definition.input?.prompt === "string" ? [definition.input.prompt] : (definition.input?.turns ?? []);
  const names = Object.keys(labels);
  const runList = names.map((label) => `Run ${label}`);
  const listed = `${runList.slice(0, -1).join(", ")} and ${runList.at(-1)}`;
  const count = COUNTS[names.length - 2] ?? String(names.length);
  // Two runs keep the original wording; more runs are "every run".
  const each = names.length === 2 ? "both runs" : "every run";
  const lines = [
    `You are reviewing ${count} anonymous runs, ${listed}, of the same agent task.`,
    `Judge only the evidence below. Answer every question for ${each} with yes, no, or unclear.`,
    "",
    "Task turns:",
    ...task.map((turn, index) => `${index + 1}. ${turn}`),
    "",
    "Questions:",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
  ];
  if (evidence.materials.length > 0) lines.push("", `## Task materials (the same for ${each})`, ...evidence.materials);
  for (const label of names) lines.push("", `## Run ${label}`, ...evidence.runs[labels[label]]);
  // One example entry per question: a single-entry example is sometimes copied literally, answering only question 1.
  const shape = questions.map((_, index) =>
    JSON.stringify({
      question: index + 1,
      ...Object.fromEntries(names.map((label) => [label, "yes|no|unclear"])),
      rationale: "one sentence",
    }),
  );
  lines.push(
    "",
    `Reply with only JSON in this shape, with one entry for each of the ${questions.length} questions:`,
    `{"answers":[${shape.join(",")}]}`,
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
  // Every question needs one answer for every label; each answer is mapped back to its arm.
  const names = Object.keys(labels);
  const mapped = [];
  for (const [index, question] of questions.entries()) {
    const answer = answers.find((entry) => entry?.question === index + 1);
    if (!answer || !names.every((label) => ANSWERS.has(answer[label])) || typeof answer.rationale !== "string") {
      errors.push(`reviewer answer for question ${index + 1} is missing or invalid`);
      continue;
    }
    mapped.push({
      question,
      ...Object.fromEntries(names.map((label) => [labels[label], answer[label]])),
      rationale: answer.rationale,
    });
  }
  return errors.length === 0 ? mapped : [];
}

import { randomInt } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isClassicPair, referenceArm, storedArms } from "./arms.mjs";
import { sha256, writeJson } from "./evidence.mjs";
import { loadConfiguration } from "./definitions.mjs";
import {
  calibrationFromLabels,
  combineJudges,
  combineOf,
  judgeConfiguration,
  JUDGED_GRADE,
  judgedContractGaps,
  parseRubricAnswers,
  rubricHash,
  rubricOf,
  rubricPrompt,
  withCalibration,
} from "./judge.mjs";
import { resolveHostExtensions } from "./pi-host.mjs";
import { launchModel as launchJudge } from "./model-call.mjs";
import { rebuildAggregate } from "./trials.mjs";
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
 * `swapSample` (a fraction in (0, 1]) swaps the order on a random sample of the selected groups instead of all of
 * them: the sample is the fraction of groups rounded up, and each group records whether it was sampled.
 *
 * @param {{root?: string, signal?: AbortSignal, model?: string | null, thinking?: string | null, configuration?: string | null, swap?: boolean, swapSample?: number | null}} options
 */
export async function reviewResult(
  target,
  selectors,
  {
    root = process.cwd(),
    signal,
    model = null,
    thinking = null,
    configuration = null,
    swap = false,
    swapSample = null,
    limits = {},
  },
) {
  const effectiveLimits = reviewLimits(limits);
  if (swapSample !== null) {
    if (swap) throw new Error("--swap and --swap-sample cannot be combined");
    if (typeof swapSample !== "number" || !(swapSample > 0 && swapSample <= 1)) {
      throw new Error("--swap-sample must be a fraction greater than 0 and at most 1");
    }
  }
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
  const sampled =
    swapSample === null
      ? null
      : new Set(shuffle(groups.map((group) => group.id)).slice(0, Math.ceil(swapSample * groups.length)));
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
        swap: sampled === null ? swap : sampled.has(group.id),
        swapSample: sampled === null ? null : { fraction: swapSample, sampled: sampled.has(group.id) },
        limits: effectiveLimits,
        signal,
      }),
    );
  }
  return { resultDirectory, groups: outcomes };
}

function reviewLimits(limits) {
  for (const [name, value] of Object.entries(limits)) {
    if (!Object.hasOwn(REVIEW_LIMITS, name)) throw new Error(`unknown review limit: ${name}`);
    if (!Number.isInteger(value) || value < 1) throw new Error(`review limit ${name} must be a positive integer`);
  }
  return { ...REVIEW_LIMITS, ...limits };
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
  { root, model, thinking, extensions, settings, swap, swapSample = null, limits, signal },
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
  const cut = createCut();
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
    ...(swapSample === null ? {} : { swapSample }),
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
  const prompt = reviewPrompt(definition, questions, evidence, labels);
  const launched = await launchJudge(path.join(groupDirectory, name), prompt, options);
  const { errors } = launched;
  const answers = errors.length === 0 ? parseAnswers(launched.response, questions, labels, errors) : [];
  return {
    labels,
    answers,
    errors,
    usage: launched.usage,
    promptSha256: sha256(prompt),
    isolation: launched.isolation,
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

/** Counts every cut the judge's view takes: a truncated text or an omitted task file. */
function createCut() {
  return {
    count: 0,
    text(value, chars) {
      if (value.length > chars) this.count += 1;
      return truncate(value, chars);
    },
    omit() {
      this.count += 1;
    },
  };
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

// Rubric judging -------------------------------------------------------------------------------------------------

/** What every rubric judge is shown and what is withheld from it (Review Work's judge contract, item 3). */
const RUBRIC_INPUTS = Object.freeze({
  shown: [
    "task turns",
    "task materials",
    "the run's responses",
    "the run's tool calls",
    "files the run wrote",
    "rubric",
    "references",
  ],
  withheld: ["arm name", "other arms' runs", "deterministic grades", "the subject's reasoning", "run paths"],
});

/**
 * Judges every complete run of each selected group against the group's rubric, each run alone and blinded to its
 * arm, and writes `groups/<id>/<arm>/judged-grade.json` beside the run. Run and deterministic grade files are never
 * written. The judges are the group's declared `judges`; a group that declares none is judged by `--model` or the
 * configuration's model. A configuration also supplies host extensions and settings to every judge.
 * An aggregate target judges every trial and then rebuilds the aggregate, so its `judged` section is current.
 *
 * @param {string} target a result or aggregate id or directory
 * @param {{group: string | null}} selectors
 */
export async function reviewRubric(
  target,
  selectors,
  { root = process.cwd(), signal, model = null, thinking = null, configuration = null, limits = {} } = {},
) {
  const effectiveLimits = reviewLimits(limits);
  const host =
    configuration === null
      ? { model: null, extensions: [], settings: {} }
      : await loadConfiguration(configuration, { root });
  const fallback = model ?? host.model?.model ?? null;
  const fallbackJudge =
    fallback === null ? null : { model: fallback, thinking: thinking ?? host.model?.thinking ?? null };
  const extensions = await resolveHostExtensions(host.extensions);
  const { resultDirectory, aggregateFile, results } = await targetResults(target, root);

  // Every group's judges are settled before any judge starts.
  const work = [];
  for (const directory of results) {
    const summary = JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8"));
    for (const group of selectGroups(summary, selectors.group)) {
      const groupDirectory = path.join(directory, "groups", group.id);
      const definition = JSON.parse(await readFile(path.join(groupDirectory, "definition.json"), "utf8"));
      const rubric = rubricOf(definition);
      let judges = null;
      if (rubric !== null) {
        if (Array.isArray(definition.judges) && definition.judges.length > 0) {
          if (model !== null || thinking !== null) {
            throw new Error(`group ${group.id} declares its judges; drop --model and --thinking`);
          }
          judges = definition.judges.map((judge) => ({ model: judge.model, thinking: judge.thinking ?? null }));
        } else if (fallbackJudge !== null) {
          judges = [fallbackJudge];
        } else {
          throw new Error(`group ${group.id} declares no judges: pass --model or --configuration`);
        }
      }
      work.push({ groupDirectory, group, definition, rubric, judges });
    }
  }

  const outcomes = [];
  for (const { groupDirectory, group, definition, rubric, judges } of work) {
    if (signal?.aborted) break;
    if (rubric === null) {
      outcomes.push({ id: group.id, state: "skipped", reason: "no rubric" });
      continue;
    }
    outcomes.push(
      ...(await judgeGroup(groupDirectory, group, definition, rubric, judges, {
        root,
        extensions,
        settings: host.settings,
        limits: effectiveLimits,
        signal,
      })),
    );
  }
  const aggregate = aggregateFile === null || signal?.aborted ? null : await rebuild(aggregateFile, root);
  return { resultDirectory, groups: outcomes, aggregate };
}

/** The result directories a target names: the result itself, or every trial of an aggregate. */
async function targetResults(target, root) {
  const resultDirectory = await resolveResult(target, root);
  const aggregateFile = path.join(resultDirectory, "aggregate.json");
  const aggregate = await readJsonOrNull(aggregateFile);
  if (aggregate === null) return { resultDirectory, aggregateFile: null, results: [resultDirectory] };
  const results = [];
  for (const trial of aggregate.trials ?? []) results.push(await resolveResult(trial.id, root));
  return { resultDirectory, aggregateFile, results };
}

/**
 * Rebuilds an aggregate from its trials, so its sections (`judged` included), decision and claim reflect the
 * judged grades.
 */
async function rebuild(aggregateFile, root) {
  const rebuilt = await rebuildAggregate(aggregateFile, { root });
  return { rebuilt: true, claim: rebuilt.claim?.class ?? null };
}

async function readJsonOrNull(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function judgeGroup(groupDirectory, group, definition, rubric, judges, options) {
  const { root, extensions, settings, limits, signal } = options;
  const arms = storedArms(group, definition);
  const runs = {};
  const runText = {};
  for (const arm of arms) {
    runText[arm] = await readFile(path.join(groupDirectory, arm, "run.json"), "utf8").catch(() => null);
    runs[arm] = runText[arm] === null ? null : JSON.parse(runText[arm]);
  }
  // Every arm's paths are neutralized, so no run's workspace or arm name reaches any judge.
  const neutral = neutralizer(
    groupDirectory,
    Object.fromEntries(arms.map((arm) => [arm, runs[arm] ?? {}])),
    arms,
    root,
  );
  const rule = combineOf(definition);
  const outcomes = [];
  for (const arm of arms) {
    if (signal?.aborted) break;
    if (runs[arm]?.state !== "complete") {
      outcomes.push({ id: group.id, arm, state: "skipped", reason: `run is ${runs[arm]?.state ?? "missing"}` });
      continue;
    }
    const cut = createCut();
    const evidence = {
      materials: await taskMaterials(path.join(groupDirectory, "resources", "fixture"), limits, cut),
      run: await runEvidence(runs[arm], neutral, limits, cut),
    };
    const references = Object.fromEntries(
      rubric
        .filter((dimension) => typeof dimension.reference?.text === "string")
        .map((dimension) => [dimension.id, cut.text(dimension.reference.text, limits.file)]),
    );
    const prompt = rubricPrompt(definition, rubric, evidence, references);
    const gradeFile = path.join(groupDirectory, arm, JUDGED_GRADE);
    const previous = await readJsonOrNull(gradeFile);
    // The judge's directory is its working directory and home, so it is named by a hash, never by the arm.
    const token = sha256(`${groupDirectory}\n${arm}`).slice(0, 12);
    const judgingDirectory = path.join(groupDirectory, "judging", token);
    await rm(judgingDirectory, { recursive: true, force: true });
    const relative = (file) => path.relative(groupDirectory, file).split(path.sep).join("/");
    const records = [];
    for (const [index, judge] of judges.entries()) {
      if (signal?.aborted) break;
      const directory = path.join(judgingDirectory, `judge-${index + 1}`);
      const launched = await launchJudge(directory, prompt, {
        model: judge.model,
        thinking: judge.thinking,
        extensions,
        settings,
        signal,
        role: "judge",
      });
      const { errors } = launched;
      const answers = errors.length === 0 ? parseRubricAnswers(launched.response, rubric, errors) : [];
      const provider = judge.model.includes("/") ? judge.model.split("/")[0] : null;
      const configurationId = judgeConfiguration({ model: judge.model, thinking: judge.thinking, extensions, rubric });
      records.push({
        model: judge.model,
        provider,
        // Family is approximated by the provider, as in the pairwise review.
        family: provider,
        thinking: judge.thinking,
        extensions,
        settings,
        isolation: launched.isolation,
        configuration: configurationId,
        familyRelation: familyRelation(provider, [subjectProvider(runs[arm])]),
        prompt: { file: relative(path.join(directory, "prompt.md")), sha256: sha256(prompt) },
        judgedAt: new Date().toISOString(),
        state: errors.length === 0 ? "complete" : "judge-error",
        answers,
        errors,
        usage: launched.usage,
        // A configuration's calibration holds until the configuration changes.
        calibration: previous?.judges?.find((entry) => entry.configuration === configurationId)?.calibration ?? null,
        artifacts: {
          events: relative(path.join(directory, "events.jsonl")),
          final: relative(path.join(directory, "final.md")),
          stderr: relative(path.join(directory, "stderr.log")),
        },
      });
    }
    const complete = records.length === judges.length && records.every((record) => record.state === "complete");
    const grade = {
      schema_version: 1,
      kind: "judged-grade",
      judged: true,
      state: complete ? "complete" : "judge-error",
      group: group.id,
      arm,
      run: { file: "run.json", sha256: sha256(runText[arm]) },
      rubric: {
        sha256: rubricHash(rubric),
        dimensions: rubric.map(({ id, question, answers, weight }) => ({ id, question, answers, weight })),
      },
      combine: rule,
      judges: records,
      answers: complete ? combineJudges(rubric, records, rule) : [],
      inputs: RUBRIC_INPUTS,
      limits,
      truncated: cut.count,
      errors: records.flatMap((record) => record.errors),
      completedAt: new Date().toISOString(),
    };
    grade.contractGaps = judgedContractGaps(grade);
    await writeJson(gradeFile, grade);
    outcomes.push({ id: group.id, arm, state: grade.state, artifact: `${arm}/${JUDGED_GRADE}`, grade });
  }
  return outcomes;
}

/**
 * Scores judge verdicts against hand labels. The labels file maps run paths (an arm's directory or its run.json,
 * relative to the root) to `{ <dimension id>: <answer> }`. Each judge configuration's agreement with the labels,
 * per dimension, is recorded as its calibration status in every judged grade it gave, under the labelled runs and
 * under the target; an aggregate target is then rebuilt.
 */
export async function calibrateJudges(target, labelsFile, { root = process.cwd() } = {}) {
  const labelsPath = path.resolve(root, labelsFile);
  const text = await readFile(labelsPath, "utf8").catch(() => {
    throw new Error(`cannot read labels file: ${labelsFile}`);
  });
  let labels;
  try {
    labels = JSON.parse(text);
  } catch {
    throw new Error(`labels file is not valid JSON: ${labelsFile}`);
  }
  if (labels === null || typeof labels !== "object" || Array.isArray(labels) || Object.keys(labels).length === 0) {
    throw new Error("labels must map run paths to { <dimension id>: <answer> }");
  }
  const entries = [];
  const files = new Set();
  for (const [run, answers] of Object.entries(labels)) {
    let directory = path.resolve(root, run);
    if (["run.json", JUDGED_GRADE].includes(path.basename(directory))) directory = path.dirname(directory);
    const file = path.join(directory, JUDGED_GRADE);
    const grade = await readJsonOrNull(file);
    if (grade === null) throw new Error(`${run} has no judged grade; judge it first with review --rubric`);
    if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
      throw new Error(`labels for ${run} must be { <dimension id>: <answer> }`);
    }
    entries.push({ run, grade, labels: answers });
    files.add(file);
  }
  const source = { file: path.relative(root, labelsPath).split(path.sep).join("/"), sha256: sha256(text) };
  const calibrations = calibrationFromLabels(entries, source);
  const { aggregateFile, results } = await targetResults(target, root);
  for (const directory of results) {
    const summary = JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8"));
    for (const group of summary.groups ?? []) {
      const groupDirectory = path.join(directory, "groups", group.id);
      const definition = await readJsonOrNull(path.join(groupDirectory, "definition.json"));
      for (const arm of storedArms(group, definition)) files.add(path.join(groupDirectory, arm, JUDGED_GRADE));
    }
  }
  let updated = 0;
  for (const file of files) {
    const grade = await readJsonOrNull(file);
    if (grade === null) continue;
    const calibrated = withCalibration(grade, calibrations);
    if (calibrated === null) continue;
    await writeJson(file, calibrated);
    updated += 1;
  }
  const aggregate = aggregateFile === null ? null : await rebuild(aggregateFile, root);
  return {
    calibrations: [...calibrations.entries()].map(([configuration, status]) => ({ configuration, ...status })),
    updated,
    aggregate,
  };
}

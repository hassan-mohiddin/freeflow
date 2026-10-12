// Judged evidence: a group's rubric, its judges and their combining rule; how judged answers are parsed, combined,
// calibrated, aggregated and shown. Judged evidence is its own class: it is stored in `judged-grade.json` beside
// each arm's run and never written into run or deterministic grade files. Launching a judge lives in review.mjs.

import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { cohenKappa, raterAgreement } from "./agreement.mjs";
import { DefinitionError } from "./definitions.mjs";
import { sha256 } from "./evidence.mjs";
import { registerAggregator } from "./hooks.mjs";

export const YES_NO = Object.freeze(["yes", "no", "unknown"]);
export const SCALE = "0-2";
export const COMBINE_RULES = Object.freeze(["majority", "unanimous", "any", "mean"]);
export const JUDGED_GRADE = "judged-grade.json";

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DIMENSION_FIELDS = new Set(["id", "question", "reference", "answers", "weight"]);
const JUDGE_FIELDS = new Set(["model", "thinking"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Validates a group's `rubric`, `judges` and `combine`, and returns them normalized: each dimension with its
 * answers (default yes/no/unknown) and weight (default 1), and a reference file read into `{ path, text, sha256 }`
 * so judging never depends on the working tree. A reference may not lie inside the fixture the subject sees.
 *
 * @returns {Promise<{rubric?: Array<any>, judges?: Array<any>, combine?: string}>}
 */
export async function validateJudging(group, definitionPath, root) {
  const fail = (message, code = "invalid-definition") => {
    throw new DefinitionError(code, message, definitionPath);
  };
  const declared = ["rubric", "judges", "combine"].filter((field) => Object.hasOwn(group, field));
  if (declared.length === 0) return {};
  if (!Object.hasOwn(group, "rubric")) fail(`group.${declared[0]} needs a group.rubric to judge`);
  if (!Array.isArray(group.rubric) || group.rubric.length === 0) fail("group.rubric must be a non-empty array");
  const ids = new Set();
  const rubric = [];
  for (const [index, dimension] of group.rubric.entries()) {
    const label = `group.rubric[${index}]`;
    if (!isPlainObject(dimension)) fail(`${label} must be an object`);
    for (const field of Object.keys(dimension)) {
      if (!DIMENSION_FIELDS.has(field)) fail(`${label} contains unsupported field ${field}`);
    }
    if (typeof dimension.id !== "string" || dimension.id.length > 64 || !ID.test(dimension.id)) {
      fail(`${label}.id must start with a lowercase letter and use lowercase letters, numbers, or single hyphens`);
    }
    if (ids.has(dimension.id)) fail(`group.rubric contains duplicate id ${dimension.id}`);
    ids.add(dimension.id);
    if (!nonEmpty(dimension.question)) fail(`${label}.question must be a non-empty string`);
    const answers = dimension.answers ?? [...YES_NO];
    const yesNo =
      Array.isArray(answers) && answers.length === YES_NO.length && YES_NO.every((answer) => answers.includes(answer));
    if (!yesNo && answers !== SCALE) fail(`${label}.answers must be ["yes", "no", "unknown"] or "0-2"`);
    const weight = dimension.weight ?? 1;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
      fail(`${label}.weight must be a positive number`);
    }
    const normalized = {
      id: dimension.id,
      question: dimension.question,
      answers: yesNo ? [...YES_NO] : SCALE,
      weight,
    };
    if (Object.hasOwn(dimension, "reference")) {
      normalized.reference = await readReference(dimension.reference, `${label}.reference`, group, root, fail);
    }
    rubric.push(normalized);
  }
  const result = { rubric };
  if (Object.hasOwn(group, "judges")) {
    if (!Array.isArray(group.judges) || group.judges.length === 0) fail("group.judges must be a non-empty array");
    const seen = new Set();
    result.judges = group.judges.map((judge, index) => {
      const label = `group.judges[${index}]`;
      if (!isPlainObject(judge)) fail(`${label} must be an object`);
      for (const field of Object.keys(judge))
        if (!JUDGE_FIELDS.has(field)) fail(`${label} contains unsupported field ${field}`);
      if (!nonEmpty(judge.model)) fail(`${label}.model must be a non-empty string`);
      if (Object.hasOwn(judge, "thinking") && !nonEmpty(judge.thinking)) {
        fail(`${label}.thinking must be a non-empty string`);
      }
      // Repeated calls to one judge configuration are one vote, not several (Review Work's judge contract).
      const identity = `${judge.model}\n${judge.thinking ?? ""}`;
      if (seen.has(identity)) fail(`${label} repeats a judge configuration; repeated calls are one vote, not several`);
      seen.add(identity);
      return Object.hasOwn(judge, "thinking")
        ? { model: judge.model, thinking: judge.thinking }
        : { model: judge.model };
    });
  }
  if (Object.hasOwn(group, "combine")) {
    if (!COMBINE_RULES.includes(group.combine)) fail(`group.combine must be one of ${COMBINE_RULES.join(", ")}`);
    if (group.combine === "mean" && rubric.some((dimension) => dimension.answers !== SCALE)) {
      fail('group.combine mean needs every rubric dimension to answer "0-2"');
    }
    result.combine = group.combine;
  } else if ((result.judges?.length ?? 0) > 1) {
    // The combining rule is named before any verdict is seen.
    fail("group.combine must name how several judges are combined: majority, unanimous, any or mean");
  }
  return result;
}

async function readReference(value, label, group, root, fail) {
  if (nonEmpty(value)) return { text: value, sha256: sha256(value) };
  if (!isPlainObject(value) || Object.keys(value).length !== 1 || !nonEmpty(value.path)) {
    fail(`${label} must be a non-empty string or { "path": "<relative path>" }`);
  }
  const relative = value.path;
  const normalized = path.normalize(relative);
  if (path.isAbsolute(relative) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    fail(`${label}.path must stay inside the definition root`, "unsafe-path");
  }
  const canonicalRoot = await realpath(root);
  const file = await realpath(path.resolve(root, relative)).catch(() => null);
  if (file === null) fail(`${label}.path cannot be read: ${relative}`);
  if (path.relative(canonicalRoot, file).startsWith(".."))
    fail(`${label}.path escapes the definition root`, "unsafe-path");
  if (typeof group.fixture === "string") {
    const fixture = await realpath(path.resolve(root, group.fixture)).catch(() => path.resolve(root, group.fixture));
    const inside = path.relative(fixture, file);
    if (inside === "" || (!inside.startsWith("..") && !path.isAbsolute(inside))) {
      fail(`${label}.path lies inside the fixture, which the subject sees`);
    }
  }
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) fail(`${label}.path cannot be read: ${relative}`);
  return { path: relative, text, sha256: sha256(text) };
}

/** The absolute paths of a validated rubric's reference files: run inputs, like the definition file itself. */
export function rubricFiles(rubric, root) {
  if (!Array.isArray(rubric)) return [];
  return rubric
    .filter((dimension) => typeof dimension.reference?.path === "string")
    .map((dimension) => path.resolve(root, dimension.reference.path));
}

/** The normalized rubric of a stored definition, or null when it declares none. */
export function rubricOf(definition) {
  if (!Array.isArray(definition?.rubric) || definition.rubric.length === 0) return null;
  return definition.rubric.map((dimension) => ({
    ...dimension,
    answers: dimension.answers === SCALE ? SCALE : [...YES_NO],
    weight: dimension.weight ?? 1,
  }));
}

/** A stored definition's judging rule; one judge needs none, so majority stands in. */
export function combineOf(definition) {
  return COMBINE_RULES.includes(definition?.combine) ? definition.combine : "majority";
}

/** The hash of what the judge is asked: every dimension's id, question, scale and reference. */
export function rubricHash(rubric) {
  return sha256(
    JSON.stringify(
      rubric.map(({ id, question, answers, reference }) => [id, question, answers, reference?.sha256 ?? null]),
    ),
  );
}

/**
 * A judge configuration's identity for calibration: its model, thinking, host extensions and the rubric it
 * answers. Calibration measured for one configuration says nothing about another.
 */
export function judgeConfiguration({ model, thinking, extensions, rubric }) {
  return sha256(
    JSON.stringify([model, thinking ?? null, (extensions ?? []).map((entry) => entry.package), rubricHash(rubric)]),
  ).slice(0, 16);
}

/** An answer as stored: "yes", "no", "unknown", or a number on the 0-2 scale; undefined when it is not valid. */
export function normalizeAnswer(answer, scale) {
  if (answer === "unknown") return "unknown";
  if (scale === SCALE) {
    const value = typeof answer === "string" && /^[0-2]$/.test(answer) ? Number(answer) : answer;
    return value === 0 || value === 1 || value === 2 ? value : undefined;
  }
  return answer === "yes" || answer === "no" ? answer : undefined;
}

/**
 * Several judges' answers to one dimension, combined by the declared rule. With yes as 1 and no as 0:
 * `unanimous` gives the lowest answer (yes only when every judge says yes), `any` the highest (yes when any judge
 * does), `majority` the answer more than half the judges gave, and `mean` the average of the known answers on the
 * 0-2 scale. An unknown answer counts against certainty: the result is unknown when it could change the outcome.
 */
export function combineAnswers(answers, rule, scale) {
  if (answers.length === 0) return "unknown";
  const numeric = scale === SCALE;
  const known = answers
    .filter((answer) => answer !== "unknown")
    .map((answer) => (numeric ? answer : answer === "yes" ? 1 : 0));
  const asAnswer = (value) => (numeric ? value : value === 1 ? "yes" : "no");
  const top = numeric ? 2 : 1;
  if (rule === "mean") {
    if (known.length === 0) return "unknown";
    return known.reduce((sum, value) => sum + value, 0) / known.length;
  }
  if (rule === "majority") {
    const counts = new Map();
    for (const answer of answers) counts.set(JSON.stringify(answer), (counts.get(JSON.stringify(answer)) ?? 0) + 1);
    for (const [answer, count] of counts) if (count * 2 > answers.length) return JSON.parse(answer);
    return "unknown";
  }
  if (known.length === 0) return "unknown";
  const complete = known.length === answers.length;
  if (rule === "unanimous") {
    const lowest = Math.min(...known);
    return complete || lowest === 0 ? asAnswer(lowest) : "unknown";
  }
  if (rule === "any") {
    const highest = Math.max(...known);
    return complete || highest === top ? asAnswer(highest) : "unknown";
  }
  throw new Error(`unknown combining rule: ${rule}`);
}

/** The judge prompt for one run, judged alone. The run's evidence is already neutralized and limited. */
export function rubricPrompt(definition, rubric, evidence, references) {
  const task =
    typeof definition.input?.prompt === "string" ? [definition.input.prompt] : (definition.input?.turns ?? []);
  const scaleOf = (dimension) => (dimension.answers === SCALE ? "0, 1, 2 or unknown" : "yes, no or unknown");
  const lines = [
    "You are judging one anonymous run of an agent task against a rubric.",
    "Judge only the evidence below and give no benefit of the doubt: answer unknown when the evidence does not settle a dimension.",
    "",
    "Task turns:",
    ...task.map((turn, index) => `${index + 1}. ${turn}`),
    "",
    "Rubric:",
  ];
  for (const [index, dimension] of rubric.entries()) {
    lines.push(`${index + 1}. ${dimension.id} (${scaleOf(dimension)}): ${dimension.question}`);
    if (references[dimension.id] !== undefined) lines.push("   Reference:", "```", references[dimension.id], "```");
  }
  if (evidence.materials.length > 0) lines.push("", "## Task materials", ...evidence.materials);
  lines.push("", "## The run", ...evidence.run);
  const shape = rubric.map((dimension) =>
    JSON.stringify({
      dimension: dimension.id,
      answer: dimension.answers === SCALE ? "0|1|2|unknown" : "yes|no|unknown",
      evidence: "what in the run shows it",
    }),
  );
  lines.push(
    "",
    `Reply with only JSON in this shape, with one entry for each of the ${rubric.length} dimensions:`,
    `{"answers":[${shape.join(",")}]}`,
  );
  return lines.join("\n");
}

/** A judge's reply as `[{ dimension, answer, evidence }]`, in rubric order; problems are pushed to `errors`. */
export function parseRubricAnswers(response, rubric, errors) {
  const text = String(response)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    errors.push("judge response is not JSON");
    return [];
  }
  const answers = Array.isArray(parsed?.answers) ? parsed.answers : null;
  if (answers === null || answers.length !== rubric.length) {
    errors.push(`judge must answer exactly ${rubric.length} dimension(s)`);
    return [];
  }
  const mapped = [];
  for (const dimension of rubric) {
    const entry = answers.find((candidate) => candidate?.dimension === dimension.id);
    const answer = normalizeAnswer(entry?.answer, dimension.answers);
    // Every verdict cites the evidence it rests on.
    if (entry === undefined || answer === undefined || !nonEmpty(entry.evidence)) {
      errors.push(`judge answer for dimension ${dimension.id} is missing or invalid`);
      continue;
    }
    mapped.push({ dimension: dimension.id, answer, evidence: entry.evidence });
  }
  return errors.length === 0 ? mapped : [];
}

/** Each dimension's combined answer from every judge's answers, with each judge's vote in judge order. */
export function combineJudges(rubric, judges, rule) {
  return rubric.map((dimension) => {
    const votes = judges.map(
      (judge) => judge.answers.find((answer) => answer.dimension === dimension.id)?.answer ?? "unknown",
    );
    return { dimension: dimension.id, answer: combineAnswers(votes, rule, dimension.answers), votes };
  });
}

/** The judge-contract items a judged grade does not meet. */
export function judgedContractGaps(grade) {
  const gaps = [];
  if ((grade.truncated ?? 0) > 0) gaps.push("materials truncated");
  if ((grade.judges ?? []).some((judge) => judge.calibration?.state !== "checked"))
    gaps.push("calibration not checked");
  return gaps;
}

/**
 * Each judge configuration's agreement with hand labels, per dimension: the share of labelled answers it matched
 * and Cohen's kappa between it and the labels.
 *
 * @param {Array<{run: string, grade: any, labels: Record<string, unknown>}>} entries
 * @param {{file: string, sha256: string}} source
 * @returns {Map<string, any>} calibration by judge configuration
 */
export function calibrationFromLabels(entries, source, checkedAt = new Date().toISOString()) {
  const byConfiguration = new Map();
  for (const { run, grade, labels } of entries) {
    const rubric = rubricOf({ rubric: grade.rubric?.dimensions }) ?? [];
    for (const [dimensionId, label] of Object.entries(labels)) {
      const dimension = rubric.find((candidate) => candidate.id === dimensionId);
      if (dimension === undefined)
        throw new Error(`labels for ${run} name ${dimensionId}, which its rubric does not declare`);
      if (normalizeAnswer(label, dimension.answers) === undefined) {
        throw new Error(`label ${JSON.stringify(label)} for ${run} ${dimensionId} is not a valid answer`);
      }
    }
    for (const judge of grade.judges ?? []) {
      if (judge.state !== "complete") continue;
      const entry = byConfiguration.get(judge.configuration) ?? {
        model: judge.model,
        thinking: judge.thinking ?? null,
        runs: new Set(),
        pairs: new Map(),
      };
      byConfiguration.set(judge.configuration, entry);
      entry.runs.add(run);
      for (const [dimensionId, label] of Object.entries(labels)) {
        const scale = rubric.find((candidate) => candidate.id === dimensionId).answers;
        const answer = judge.answers.find((candidate) => candidate.dimension === dimensionId)?.answer ?? null;
        const pairs = entry.pairs.get(dimensionId) ?? [];
        pairs.push([answer, normalizeAnswer(label, scale)]);
        entry.pairs.set(dimensionId, pairs);
      }
    }
  }
  const calibrations = new Map();
  for (const [configuration, entry] of byConfiguration) {
    const dimensions = {};
    let agreed = 0;
    let items = 0;
    for (const [dimensionId, pairs] of entry.pairs) {
      const { items: count, observed, kappa } = cohenKappa(pairs);
      dimensions[dimensionId] = { items: count, agreement: observed, kappa };
      agreed += (observed ?? 0) * count;
      items += count;
    }
    calibrations.set(configuration, {
      state: "checked",
      model: entry.model,
      thinking: entry.thinking,
      labels: source,
      runs: entry.runs.size,
      agreement: items === 0 ? null : agreed / items,
      dimensions,
      checkedAt,
    });
  }
  return calibrations;
}

/** A judged grade with each matching judge configuration's calibration recorded; null when nothing matched. */
export function withCalibration(grade, calibrations) {
  let changed = false;
  const judges = (grade.judges ?? []).map((judge) => {
    const calibration = calibrations.get(judge.configuration);
    if (calibration === undefined) return judge;
    changed = true;
    const { model: _model, thinking: _thinking, ...status } = calibration;
    return { ...judge, calibration: status };
  });
  if (!changed) return null;
  const updated = { ...grade, judges };
  return { ...updated, contractGaps: judgedContractGaps(updated) };
}

// The `judged` aggregate section ---------------------------------------------------------------------------------

async function readJsonOrNull(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

function perTrialValue(answer) {
  if (answer === "yes") return true;
  if (answer === "no") return false;
  return typeof answer === "number" ? answer : null;
}

/**
 * The `judged` aggregator: per arm and dimension, counts of each combined answer over the group's trials (a trial
 * whose arm was not judged, or whose judging failed, counts as `notJudged`), pass^k for yes/no dimensions,
 * agreement between judges per dimension, and `perTrial` values for decision rules. Groups without a rubric get
 * no section.
 */
export async function judgedSection({ arms, trials }) {
  const directory = trials.find((trial) => typeof trial.directory === "string")?.directory;
  if (directory === undefined) return undefined;
  const definition = await readJsonOrNull(path.join(directory, "definition.json"));
  const rubric = rubricOf(definition);
  if (rubric === null) return undefined;
  const k = trials.length;
  const counts = Object.fromEntries(
    arms.map((arm) => [
      arm,
      Object.fromEntries(
        rubric.map((dimension) => [
          dimension.id,
          dimension.answers === SCALE
            ? { 0: 0, 1: 0, 2: 0, unknown: 0, notJudged: 0 }
            : { yes: 0, no: 0, unknown: 0, notJudged: 0 },
        ]),
      ),
    ]),
  );
  const perTrial = [];
  const units = Object.fromEntries(rubric.map((dimension) => [dimension.id, []]));
  const judges = new Map();
  const gaps = new Set();
  for (const trial of trials) {
    for (const arm of arms) {
      const grade =
        typeof trial.directory === "string"
          ? await readJsonOrNull(path.join(trial.directory, arm, JUDGED_GRADE))
          : null;
      if (grade === null || grade.state !== "complete") {
        for (const dimension of rubric) counts[arm][dimension.id].notJudged += 1;
        continue;
      }
      for (const gap of grade.contractGaps ?? []) gaps.add(gap);
      for (const judge of grade.judges ?? []) {
        if (!judges.has(judge.configuration)) {
          judges.set(judge.configuration, {
            model: judge.model,
            thinking: judge.thinking ?? null,
            configuration: judge.configuration,
            familyRelation: judge.familyRelation ?? "unknown",
            calibration: judge.calibration ?? null,
          });
        }
      }
      const values = {};
      for (const dimension of rubric) {
        const combined = (grade.answers ?? []).find((answer) => answer.dimension === dimension.id);
        const answer = combined?.answer ?? "unknown";
        const bucket = counts[arm][dimension.id];
        // A mean of several judges can fall between scale points; it gets its own count.
        const name = String(answer);
        bucket[name] = (bucket[name] ?? 0) + 1;
        values[dimension.id] = perTrialValue(answer);
        units[dimension.id].push(combined?.votes ?? []);
      }
      perTrial.push({ trial: trial.id, arm, values });
    }
  }
  const output = {
    combine: combineOf(definition),
    rubric: rubric.map(({ id, answers, weight }) => ({ id, answers, weight })),
  };
  output.judges = [...judges.values()];
  output.arms = Object.fromEntries(
    arms.map((arm) => [
      arm,
      Object.fromEntries(
        rubric.map((dimension) => {
          const bucket = { ...counts[arm][dimension.id], trials: k };
          if (dimension.answers === SCALE) {
            const numbers = Object.entries(bucket).filter(([name]) => /^\d+(\.\d+)?$/.test(name));
            const answered = numbers.reduce((sum, [, count]) => sum + count, 0);
            bucket.mean =
              answered === 0 ? null : numbers.reduce((sum, [name, count]) => sum + Number(name) * count, 0) / answered;
          } else {
            // pass^k: the combined answer was yes in every one of the group's k trials.
            bucket.passAll = k > 0 && bucket.yes === k;
          }
          return [dimension.id, bucket];
        }),
      ),
    ]),
  );
  const agreement = {};
  for (const dimension of rubric) {
    const measured = raterAgreement(units[dimension.id]);
    if (measured !== null) agreement[dimension.id] = measured;
  }
  if (Object.keys(agreement).length > 0) output.agreement = agreement;
  output.contractGaps = [...gaps];
  output.perTrial = perTrial;
  return output;
}

registerAggregator("judged", judgedSection);

// Views ----------------------------------------------------------------------------------------------------------

function row(kind, values) {
  return [kind, ...values]
    .map((value) =>
      String(value).replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t"),
    )
    .join("\t");
}

function formatValue(value) {
  if (typeof value !== "number") return String(value);
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function judgeLabel(judge) {
  return `${judge.model}${judge.thinking ? ` (${judge.thinking})` : ""}`;
}

function calibrationLabel(calibration) {
  if (calibration?.state !== "checked") return "calibration=not checked";
  return `calibration=agreement ${formatValue(calibration.agreement ?? 0)} over ${calibration.runs} labelled run(s)`;
}

/** The judged evidence of one result group, for `view`: each arm's combined answers and each judge's record. */
export async function judgedLines(groupDirectory, arms) {
  const lines = [];
  for (const arm of arms) {
    const grade = await readJsonOrNull(path.join(groupDirectory, arm, JUDGED_GRADE));
    if (grade === null) continue;
    if (lines.length === 0) {
      lines.push(`Judged evidence combine=${grade.combine ?? "majority"} (judged, not deterministic grades)`);
    }
    lines.push(
      row("judged", [
        arm,
        grade.state,
        ...(grade.answers ?? []).map((answer) => `${answer.dimension}=${formatValue(answer.answer)}`),
      ]),
    );
    for (const judge of grade.judges ?? []) {
      lines.push(
        row("judge", [
          arm,
          judgeLabel(judge),
          judge.state,
          `family=${judge.familyRelation ?? "unknown"}`,
          calibrationLabel(judge.calibration),
        ]),
      );
      for (const answer of judge.answers ?? []) {
        lines.push(
          row("judge", [arm, judgeLabel(judge), `${answer.dimension}=${formatValue(answer.answer)}`, answer.evidence]),
        );
      }
      for (const error of judge.errors ?? []) lines.push(row("error", ["judge", arm, error]));
    }
    for (const gap of grade.contractGaps ?? []) lines.push(row("judge", [arm, `contract gap: ${gap}`]));
  }
  return lines;
}

/** The `judged` section of one aggregate group, for `view`. */
export function judgedAggregateLines(section) {
  if (!isPlainObject(section)) return [];
  if (typeof section.error === "string") return [row("judged", ["error", section.error])];
  const lines = [];
  for (const dimension of section.rubric ?? []) {
    for (const [arm, byDimension] of Object.entries(section.arms ?? {})) {
      const counts = byDimension[dimension.id];
      if (counts === undefined) continue;
      const cells = Object.entries(counts)
        .filter(([name]) => !["trials", "passAll", "mean"].includes(name))
        .map(([name, count]) => `${name === "notJudged" ? "not-judged" : name}=${count}`);
      if (typeof counts.passAll === "boolean") cells.push(`pass^${counts.trials}=${counts.passAll ? "yes" : "no"}`);
      if (counts.mean !== undefined) cells.push(`mean=${counts.mean === null ? "-" : formatValue(counts.mean)}`);
      lines.push(row("judged", [dimension.id, arm, ...cells]));
    }
    const agreement = section.agreement?.[dimension.id];
    if (agreement) {
      const value = agreement.method === "cohen-kappa" ? agreement.kappa : agreement.alpha;
      const over = agreement.method === "cohen-kappa" ? agreement.items : agreement.pairable;
      lines.push(
        row("judged", [dimension.id, `${agreement.method}=${value === null ? "-" : formatValue(value)} over ${over}`]),
      );
    }
  }
  for (const judge of section.judges ?? []) {
    lines.push(
      row("judge", [judgeLabel(judge), `family=${judge.familyRelation}`, calibrationLabel(judge.calibration)]),
    );
  }
  for (const gap of section.contractGaps ?? []) lines.push(row("judge", [`contract gap: ${gap}`]));
  return lines;
}

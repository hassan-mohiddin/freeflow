import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const VARIANTS = ["baseline", "candidate"];
const DEFAULT_SELECTORS = /** @type {{group: string | null, variant: string | null}} */ ({
  group: null,
  variant: null,
});

class ViewError extends Error {
  constructor(message) {
    super(message);
    this.name = "ViewError";
  }
}

/**
 * @param {string} target
 * @param {{group: string | null, variant: string | null}} [selectors]
 * @param {{root?: string}} [options]
 */

export async function renderResult(target, selectors = DEFAULT_SELECTORS, { root = process.cwd() } = {}) {
  const resultDirectory = await resolveResult(target, root);
  const summary = await readJson(path.join(resultDirectory, "summary.json"), "result summary");
  let groups = Array.isArray(summary.groups) ? summary.groups : [];
  if (summary.definitionKind === "group" && selectors.group !== null) {
    throw new ViewError("--group cannot be used with a direct group result");
  }
  if (selectors.group !== null) {
    const position = /^\d+$/.test(String(selectors.group)) ? Number(selectors.group) : null;
    groups =
      position === null
        ? groups.filter((group) => group.id === selectors.group)
        : groups.filter((group) => group.position === position);
    if (groups.length === 0) throw new ViewError(`Unknown group selector: ${selectors.group}`);
  }
  if (selectors.variant !== null && !VARIANTS.includes(selectors.variant)) {
    throw new ViewError("variant must be baseline or candidate");
  }

  const lines = [`Result ${summary.id} [${summary.state}]`, `Path: ${escapeCell(resultDirectory)}`];
  for (const group of groups) {
    lines.push("", ...(await renderGroup(resultDirectory, group, selectors.variant)));
  }
  return `${lines.join("\n")}\n`;
}

async function renderGroup(resultDirectory, group, selectedVariant) {
  const groupDirectory = path.join(resultDirectory, "groups", group.id);
  const definition = await readJson(path.join(groupDirectory, "definition.json"), `definition for ${group.id}`);
  const gradeFile = path.join(groupDirectory, group.artifacts?.grade ?? "deterministic-grade.json");
  const grade = await readJson(gradeFile, `grade for ${group.id}`);
  const variants = selectedVariant === null ? VARIANTS : [selectedVariant];
  const lines = [`Group ${group.id} [${group.state}] type=${definition.type}`];

  appendSharedEvidence(lines, definition);
  appendGradeEvidence(lines, grade, group, definition, selectedVariant);
  for (const variant of variants) {
    await appendVariantEvidence(lines, resultDirectory, groupDirectory, group.id, variant);
  }
  lines.push(
    compactRow("artifacts", [
      `definition=${relativeArtifact(resultDirectory, path.join(groupDirectory, "definition.json"))}`,
      `grade=${relativeArtifact(resultDirectory, gradeFile)}`,
      `group=${relativeArtifact(resultDirectory, path.join(groupDirectory, group.artifacts?.group ?? "group.json"))}`,
    ]),
  );
  return lines;
}

function appendSharedEvidence(lines, definition) {
  if (typeof definition.input?.prompt === "string") {
    appendLabeledText(lines, "Prompt", definition.input.prompt);
  } else {
    const prompts = Array.isArray(definition.input?.turns) ? definition.input.turns : [];
    lines.push(`Turns: ${prompts.length}`);
    for (const [index, prompt] of prompts.entries()) {
      appendLabeledText(lines, `  Turn ${index + 1} prompt`, prompt, "    ");
    }
  }
  const reviewQuestions = Array.isArray(definition.review_questions) ? definition.review_questions : [];
  if (reviewQuestions.length > 0) {
    lines.push("Review questions:");
    for (const question of reviewQuestions) lines.push(`  - ${question}`);
  }
}

function appendGradeEvidence(lines, grade, group, definition, selectedVariant) {
  const checks = Array.isArray(grade.checks)
    ? grade.checks.filter((check) => selectedVariant === null || check.variant === selectedVariant)
    : [];
  const gradeErrors = selectedGradeErrors(grade.errors, definition, selectedVariant);
  lines.push(`Grade [${selectedGradeState(grade.state, checks, gradeErrors, selectedVariant)}]`);
  if (checks.length === 0) lines.push("  (no selected checks)");
  else {
    for (const check of checks) {
      lines.push(
        compactRow("check", [
          check.id,
          check.variant,
          check.kind,
          check.state,
          `expected=${compactJson(check.expected)}`,
          `observed=${compactObserved(check)}`,
        ]),
      );
    }
  }
  if (gradeErrors.length > 0) {
    lines.push("Grade errors:");
    for (const error of gradeErrors) {
      lines.push(compactRow("error", ["grade", error.id ?? "system", error.reason]));
    }
  }
  if (Array.isArray(group.errors) && group.errors.length > 0) {
    lines.push("Group errors:");
    for (const error of group.errors) {
      lines.push(compactRow("error", ["group", error.artifact ?? error.kind, error.message]));
    }
  }
  if (selectedVariant === null && Array.isArray(grade.comparisons) && grade.comparisons.length > 0) {
    lines.push("Comparisons:");
    for (const comparison of grade.comparisons) {
      lines.push(
        compactRow("comparison", [
          comparison.id,
          comparison.kind,
          comparison.transition,
          `baseline=${comparison.baseline.check}:${comparison.baseline.state}`,
          `candidate=${comparison.candidate.check}:${comparison.candidate.state}`,
        ]),
      );
    }
  }
}

function selectedGradeErrors(errors, definition, selectedVariant) {
  if (!Array.isArray(errors)) return [];
  if (selectedVariant === null) return errors;
  const expectations = /** @type {Array<any>} */ (
    Array.isArray(definition.expectations) ? definition.expectations : []
  );
  const expectationById = new Map(expectations.map((expectation) => [expectation.id, expectation]));
  const comparisonIds = new Set(
    expectations.map((expectation) => expectation.comparison).filter((comparison) => typeof comparison === "string"),
  );
  return errors.filter((error) => {
    if (error.id === "system" || comparisonIds.has(error.id)) return true;
    const expectation = /** @type {any} */ (expectationById.get(error.id));
    return expectation === undefined || expectation.variant === selectedVariant;
  });
}

function selectedGradeState(state, checks, errors, selectedVariant) {
  if (selectedVariant === null) return state;
  if (errors.length > 0) return "grade-error";
  if (checks.length > 0 && checks.every((check) => check.state === "unavailable")) return "unavailable";
  return "complete";
}

async function appendVariantEvidence(lines, resultDirectory, groupDirectory, groupId, variant) {
  const runFile = path.join(groupDirectory, variant, "run.json");
  const run = await readJson(runFile, `${variant} run for ${groupId}`);
  lines.push("", `${title(variant)} [${run.state}]`);
  appendRunEvidence(lines, run);
  const variantDirectory = path.dirname(runFile);
  const artifacts = [["run", relativeArtifact(resultDirectory, runFile)]];
  if (typeof run.workspace === "string") {
    artifacts.push(["workspace", relativeArtifact(resultDirectory, run.workspace)]);
  }
  if (typeof run.transcript === "string") {
    artifacts.push(["transcript", relativeArtifact(resultDirectory, path.resolve(variantDirectory, run.transcript))]);
  }
  for (const [name, artifact] of Object.entries(run.artifacts ?? {})) {
    if (typeof artifact === "string") {
      artifacts.push([name, relativeArtifact(resultDirectory, path.resolve(variantDirectory, artifact))]);
    }
  }
  lines.push(
    compactRow(
      "  artifacts",
      artifacts.map(([name, artifact]) => `${name}=${artifact}`),
    ),
  );
}

async function resolveResult(target, root) {
  const explicit = path.resolve(root, target);
  const stored = path.join(root, ".skill-eval", "runs", target);
  const isPath = path.isAbsolute(target) || target.includes("/") || target.includes("\\") || target.startsWith(".");
  const candidates = isPath ? [explicit] : [stored, explicit];
  for (const candidate of candidates) {
    const canonical = await realpath(candidate).catch(() => null);
    if (canonical === null) continue;
    const candidateStat = await stat(canonical).catch(() => null);
    if (candidateStat?.isDirectory()) return canonical;
  }
  throw new ViewError(`Cannot find result: ${target}`);
}

async function readJson(file, label) {
  let contents;
  try {
    contents = await readFile(file, "utf8");
  } catch {
    throw new ViewError(`Cannot read ${label}: ${file}`);
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new ViewError(`${label} is not valid JSON: ${file}`);
  }
}

function title(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function appendRunEvidence(lines, run) {
  const turns = Array.isArray(run.turns) ? run.turns : null;
  const hasObservedTurns = turns !== null && turns.length > 0;
  if (run.evaluationType === "description" && (run.state === "complete" || hasObservedTurns)) {
    const prefix = run.state === "complete" ? "" : "observed ";
    lines.push(
      `  ${prefix}target-read: ${run.activation?.targetRead === true ? "yes" : "no"}`,
      `  ${prefix}read-turns: ${(run.activation?.readTurns ?? []).join(",") || "none"}`,
    );
  }
  if (run.evaluationType === "body" && run.delivery) {
    lines.push(`  delivery: ${run.delivery.kind} on turn ${run.delivery.turn}`);
    const activity = turns === null ? (run.toolActivity ?? []) : turns.flatMap((turn) => turn.toolActivity ?? []);
    const toolsUsed = [...new Set(activity.map((entry) => entry.toolName).filter(Boolean))];
    lines.push(`  tools-used: ${toolsUsed.join(",") || "none"}`);
    const changes = run.effects?.changes;
    if (changes) {
      appendChangedPaths(lines, "created", changes.created);
      appendChangedPaths(lines, "modified", changes.modified);
      appendChangedPaths(lines, "deleted", changes.deleted);
    }
  }
  if (turns !== null) {
    for (const turn of turns) {
      const labels = [turn.settled ? "settled" : "unsettled"];
      if (turn.targetRead === true) labels.push("target-read");
      lines.push(`  Turn ${turn.turn} [${labels.join(", ")}]`);
      appendResponse(lines, turn.response ?? "", "    ");
    }
  } else if (run.state === "complete") {
    lines.push("  response:", indent(run.response ?? ""));
  }
  if (run.usage && typeof run.usage === "object") {
    const usage = [
      `input=${formatMetric(run.usage.input)}`,
      `output=${formatMetric(run.usage.output)}`,
      `cache-read=${formatMetric(run.usage.cacheRead)}`,
      `cache-write=${formatMetric(run.usage.cacheWrite)}`,
    ];
    if (typeof run.usage.cost?.total === "number") usage.push(`cost=${formatNumber(run.usage.cost.total)}`);
    lines.push(compactRow("  usage", usage));
  }
  if (run.process?.assistantError) lines.push(`  assistant-error: ${run.process.assistantError}`);
  if (run.process?.terminationReason) {
    lines.push(`  termination: ${run.process.terminationReason}`);
  }
  if (Array.isArray(run.process?.protocolErrors) && run.process.protocolErrors.length > 0) {
    lines.push(`  protocol-errors: ${run.process.protocolErrors.length}`);
  }
  if (run.error?.message) lines.push(`  error: ${run.error.message}`);
}

function appendChangedPaths(lines, kind, paths) {
  lines.push(compactRow("  changes", [kind, ...(Array.isArray(paths) ? paths : [])]));
}

function appendResponse(lines, response, prefix) {
  const value = String(response);
  if (!value.includes("\n")) {
    lines.push(`${prefix}response: ${value}`);
    return;
  }
  lines.push(`${prefix}response:`, indentWith(value, `${prefix}  `));
}

function indentWith(value, prefix) {
  return String(value)
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function indent(value) {
  return String(value)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function appendLabeledText(lines, label, value, blockPrefix = "    ") {
  const text = String(value);
  if (!text.includes("\n")) {
    lines.push(`${label}: ${text}`);
    return;
  }
  lines.push(`${label}:`, indentWith(text, blockPrefix));
}

function compactRow(kind, values) {
  return [kind, ...values].map(escapeCell).join("\t");
}

function compactJson(value) {
  return value === undefined ? "-" : JSON.stringify(value);
}

function compactObserved(check) {
  if (check.kind === "response-text" && typeof check.observed?.response === "string") {
    return `response@turn:${check.observed.turn ?? "final"}`;
  }
  return compactJson(check.observed);
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
}

function formatMetric(value) {
  return typeof value === "number" && Number.isFinite(value) ? formatNumber(value) : "unavailable";
}

function escapeCell(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function relativeArtifact(resultDirectory, file) {
  return path.relative(resultDirectory, file).split(path.sep).join("/");
}

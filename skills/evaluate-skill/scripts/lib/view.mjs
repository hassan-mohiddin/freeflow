import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const VARIANTS = ["baseline", "candidate"];

class ViewError extends Error {
  constructor(message) {
    super(message);
    this.name = "ViewError";
  }
}

export async function renderResult(target, selectors = {}, { root = process.cwd() } = {}) {
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

  const lines = [`Result ${summary.id} [${summary.state}]`, `Path: ${resultDirectory}`];
  for (const group of groups) {
    lines.push("", ...(await renderGroup(resultDirectory, group, selectors.variant)));
  }
  return `${lines.join("\n")}\n`;
}

async function renderGroup(resultDirectory, group, selectedVariant) {
  const groupDirectory = path.join(resultDirectory, "groups", group.id);
  const definition = await readJson(path.join(groupDirectory, "definition.json"), `definition for ${group.id}`);
  const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"), `grade for ${group.id}`);
  const variants = selectedVariant === null ? VARIANTS : [selectedVariant];
  const lines = [`Group ${group.id} [${group.state}]`];
  if (typeof definition.input?.prompt === "string") {
    lines.push(`Prompt: ${definition.input.prompt}`);
  } else {
    const prompts = Array.isArray(definition.input?.turns) ? definition.input.turns : [];
    lines.push(`Turns: ${prompts.length}`);
    for (const [index, prompt] of prompts.entries()) lines.push(`  Turn ${index + 1} prompt: ${prompt}`);
  }
  lines.push(`Grade [${grade.state}]`);
  const checks = Array.isArray(grade.checks)
    ? grade.checks.filter((check) => selectedVariant === null || check.variant === selectedVariant)
    : [];
  if (checks.length === 0) lines.push("  (no selected checks)");
  else {
    for (const check of checks) lines.push(`  ${check.id}\t${check.variant}\t${check.state}`);
  }

  for (const variant of variants) {
    const runFile = path.join(groupDirectory, variant, "run.json");
    const run = await readJson(runFile, `${variant} run for ${group.id}`);
    lines.push("", `${title(variant)} [${run.state}]`);
    appendRunEvidence(lines, run);
    const variantDirectory = path.dirname(runFile);
    lines.push(`  run: ${runFile}`);
    if (typeof run.transcript === "string") {
      lines.push(`  transcript: ${path.resolve(variantDirectory, run.transcript)}`);
    }
    for (const [name, artifact] of Object.entries(run.artifacts ?? {})) {
      if (typeof artifact === "string") lines.push(`  ${name}: ${path.resolve(variantDirectory, artifact)}`);
    }
  }
  lines.push(
    `Definition artifact: ${path.join(groupDirectory, "definition.json")}`,
    `Grade artifact: ${path.join(groupDirectory, "deterministic-grade.json")}`,
  );
  return lines;
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
  if (run.state === "complete" || hasObservedTurns) {
    const prefix = run.state === "complete" ? "" : "observed ";
    lines.push(
      `  ${prefix}target-read: ${run.activation?.targetRead === true ? "yes" : "no"}`,
      `  ${prefix}read-turns: ${(run.activation?.readTurns ?? []).join(",") || "none"}`,
    );
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
  if (run.process?.assistantError) lines.push(`  assistant-error: ${run.process.assistantError}`);
  if (run.process?.terminationReason) {
    lines.push(`  termination: ${run.process.terminationReason}`);
  }
  if (Array.isArray(run.process?.protocolErrors) && run.process.protocolErrors.length > 0) {
    lines.push(`  protocol-errors: ${run.process.protocolErrors.length}`);
  }
  if (run.error?.message) lines.push(`  error: ${run.error.message}`);
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

import { armNames, referenceArm } from "./arms.mjs";
import { gradeCommand } from "./grade-command.mjs";
import { gradeComparisons } from "./grade-comparison.mjs";
import {
  gradeContextText,
  gradeResourceRead,
  gradeResponseText,
  gradeSkillRead,
  gradeToolCall,
} from "./grade-interaction.mjs";
import { gradeChangedPaths, gradeFileText, gradeJson, gradePath } from "./grade-workspace.mjs";

const GRADERS = new Map([
  ["skill-read", gradeSkillRead],
  ["resource-read", gradeResourceRead],
  ["path", gradePath],
  ["changed-paths", gradeChangedPaths],
  ["file-text", gradeFileText],
  ["json", gradeJson],
  ["response-text", gradeResponseText],
  ["context-text", gradeContextText],
  ["tool-call", gradeToolCall],
  ["command", gradeCommand],
]);

/**
 * @param {any} group
 * @param {any} runs
 * @param {any} evidence
 * @returns {Promise<any>}
 */
export async function gradeDeterministic(group, runs, evidence) {
  const { checks, errors } = await gradeEach(group, runs, group.expectations);
  const compared = gradeComparisons(group.expectations, checks, {
    arms: armNames(group),
    reference: referenceArm(group),
  });
  errors.push(...compared.errors);
  return {
    schema_version: 1,
    state: reportState(checks, errors),
    evidence,
    checks,
    comparisons: compared.comparisons,
    errors,
  };
}

/**
 * What grading would refuse in a loaded group's expectations that the definition alone decides: a kind in a group
 * type it cannot grade, an arm or turn the group lacks, field values its grader rejects, or comparison members
 * that do not describe one check in every arm. Each grader runs with no run evidence, so the check is the
 * grader's own and runs before anything is spent. An unknown kind, and any comparison it belongs to, is left to
 * grading, where it is a grade error.
 *
 * @returns {Promise<Array<{ expectation?: string, comparison?: string, reason: string }>>}
 */
export async function expectationProblems(group) {
  const known = group.expectations.filter((expectation) => GRADERS.has(expectation.kind));
  const { checks, errors } = await gradeEach(group, {}, known);
  const unknownComparisons = new Set(
    group.expectations
      .filter((expectation) => !GRADERS.has(expectation.kind) && Object.hasOwn(expectation, "comparison"))
      .map((expectation) => expectation.comparison),
  );
  const compared = gradeComparisons(
    group.expectations.filter((expectation) => !unknownComparisons.has(expectation.comparison)),
    checks,
    { arms: armNames(group), reference: referenceArm(group) },
  );
  return [
    ...errors.map(({ id, reason }) => ({ expectation: id, reason })),
    ...compared.errors.map(({ id, reason }) => ({ comparison: id, reason })),
  ];
}

async function gradeEach(group, runs, expectations) {
  const checks = /** @type {Array<any>} */ ([]);
  const errors = /** @type {Array<any>} */ ([]);
  for (const expectation of expectations) {
    const grader = GRADERS.get(expectation.kind);
    if (!grader) {
      errors.push({ id: expectation.id, reason: `unsupported expectation kind: ${expectation.kind}` });
      continue;
    }
    try {
      const result = await grader(group, runs, expectation);
      if (result.error) errors.push({ id: expectation.id, reason: result.error });
      else checks.push(result);
    } catch (error) {
      errors.push({ id: expectation.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checks, errors };
}

function reportState(checks, errors) {
  if (errors.length > 0) return "grade-error";
  if (checks.length > 0 && checks.every((check) => check.state === "unavailable")) return "unavailable";
  return "complete";
}

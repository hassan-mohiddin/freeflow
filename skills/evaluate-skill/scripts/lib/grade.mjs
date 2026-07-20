import { gradeComparisons } from "./grade-comparison.mjs";
import { gradeResourceRead, gradeResponseText, gradeSkillRead } from "./grade-interaction.mjs";
import { gradeChangedPaths, gradeFileText, gradeJson, gradePath } from "./grade-workspace.mjs";

const GRADERS = new Map([
  ["skill-read", gradeSkillRead],
  ["resource-read", gradeResourceRead],
  ["path", gradePath],
  ["changed-paths", gradeChangedPaths],
  ["file-text", gradeFileText],
  ["json", gradeJson],
  ["response-text", gradeResponseText],
]);

/**
 * @param {any} group
 * @param {any} runs
 * @param {any} evidence
 * @returns {Promise<any>}
 */
export async function gradeDeterministic(group, runs, evidence) {
  const checks = /** @type {Array<any>} */ ([]);
  const errors = /** @type {Array<any>} */ ([]);

  for (const expectation of group.expectations) {
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

  const compared = gradeComparisons(group.expectations, checks);
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

function reportState(checks, errors) {
  if (errors.length > 0) return "grade-error";
  if (checks.length > 0 && checks.every((check) => check.state === "unavailable")) return "unavailable";
  return "complete";
}

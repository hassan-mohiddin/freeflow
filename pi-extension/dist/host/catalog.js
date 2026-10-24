import { fileURLToPath } from "node:url";
/**
 * Freeflow's fixed command and skill surface: the commands it registers, the skills it lists to the model, and where
 * their files live.
 */
export const WORKFLOW_COMMANDS = [
  { command: "discuss-work", skill: "discuss-work" },
  { command: "track-work", skill: "track-work" },
  { command: "write-docs", skill: "write-docs" },
  { command: "execute-work", skill: "execute-work" },
  { command: "verify-work", skill: "verify-work" },
  { command: "review-work", skill: "review-work" },
  { command: "deliver-work", skill: "deliver-work" },
];
export const CONTRIBUTOR_COMMANDS = ["setup-freeflow", "write-skill", "evaluate-behavior"];
/**
 * Every portable skill Freeflow ships, by directory name. The canonical list: validation scripts and tests compare the
 * skills directory, the package and the coverage matrix against it instead of a fixed count.
 */
export const FREEFLOW_MODEL_SKILL_NAMES = [
  "deliver-work",
  "discuss-work",
  "evaluate-behavior",
  "execute-work",
  "review-work",
  "setup-freeflow",
  "track-work",
  "verify-work",
  "write-docs",
  "write-skill",
];
export const STABLE_FREEFLOW_SURFACE = Object.freeze({
  enabled: true,
  cognitiveRouting: { effective: true },
  toolExecution: { effective: true },
  compaction: { effective: true },
  taskMemory: { effective: true },
  messaging: { effective: true },
});
export function freeflowSkillPath(skillName) {
  return fileURLToPath(new URL(`../../../skills/${skillName}/SKILL.md`, import.meta.url));
}
export function freeflowCapabilitySkillPath(skillName) {
  return fileURLToPath(new URL(`../../../capabilities/${skillName}/SKILL.md`, import.meta.url));
}
export function freeflowModelSkillPaths(capabilityState = undefined) {
  // A skill the user turned off is not loaded (config-validation.ts SWITCHABLE_SKILLS).
  const off = capabilityState?.skills?.off ?? [];
  const paths = FREEFLOW_MODEL_SKILL_NAMES.filter((skillName) => !off.includes(skillName)).map((skillName) =>
    freeflowSkillPath(skillName),
  );
  if (capabilityState?.cognitiveRouting?.effective === true)
    paths.push(freeflowCapabilitySkillPath("cognitive-routing"));
  if (capabilityState?.compaction?.effective === true) paths.push(freeflowCapabilitySkillPath("compaction"));
  if (capabilityState?.taskMemory?.effective === true) paths.push(freeflowCapabilitySkillPath("task-memory"));
  if (capabilityState?.messaging?.effective === true) paths.push(freeflowCapabilitySkillPath("messaging"));
  return paths;
}
export function skillPrompt(skill, args) {
  const trimmed = args?.trim();
  return trimmed ? `/skill:${skill}\n\n${trimmed}` : `/skill:${skill}`;
}

import { fileURLToPath } from "node:url";

/**
 * Freeflow's fixed command and skill surface: the commands it registers, the skills it lists to the model, and where
 * their files live.
 */
export const WORKFLOW_COMMANDS = [
  { command: "discuss", skill: "discuss" },
  { command: "action-selection", skill: "action-selection" },
  { command: "track-work", skill: "track-work" },
  { command: "write-spec", skill: "write-spec" },
  { command: "write-plan", skill: "write-plan" },
  { command: "write-docs", skill: "write-docs" },
  { command: "execute-work", skill: "execute-work" },
  { command: "simplify-code", skill: "simplify-code" },
  { command: "migration-work", skill: "migration-work" },
  { command: "diagnose-failure", skill: "diagnose-failure" },
  { command: "verify-work", skill: "verify-work" },
  { command: "review-work", skill: "review-work" },
  { command: "commit-work", skill: "commit-work" },
  { command: "handoff", skill: "handoff" },
  { command: "finish-branch", skill: "finish-branch" },
  { command: "release-work", skill: "release-work" },
  { command: "launch-work", skill: "launch-work" },
  { command: "bypass", skill: "bypass" },
];

export const CONTRIBUTOR_COMMANDS = ["setup-freeflow", "write-skill", "evaluate-behavior"];

/**
 * Every portable skill Freeflow ships, by directory name. The canonical list: validation scripts and tests compare the
 * skills directory, the package and the coverage matrix against it instead of a fixed count.
 */
export const FREEFLOW_MODEL_SKILL_NAMES = [
  "action-selection",
  "agree-work",
  "bypass",
  "commit-work",
  "migration-work",
  "design-for-depth",
  "diagnose-failure",
  "discuss",
  "evaluate-behavior",
  "execute-work",
  "finish-branch",
  "handoff",
  "release-work",
  "review-work",
  "setup-freeflow",
  "launch-work",
  "map-features",
  "simplify-code",
  "track-work",
  "verify-work",
  "workflow",
  "write-docs",
  "write-plan",
  "write-skill",
  "write-spec",
];

export const STABLE_FREEFLOW_SURFACE = Object.freeze({
  enabled: true,
  cognitiveRouting: { effective: true },
  toolExecution: { effective: true },
  compaction: { effective: true },
  taskMemory: { effective: true },
  messaging: { effective: true },
});

export function freeflowSkillPath(skillName: string) {
  return fileURLToPath(new URL(`../../../skills/${skillName}/SKILL.md`, import.meta.url));
}

export function freeflowCapabilitySkillPath(skillName: string) {
  return fileURLToPath(new URL(`../../../capabilities/${skillName}/SKILL.md`, import.meta.url));
}

export function freeflowModelSkillPaths(capabilityState: any = undefined) {
  const paths = FREEFLOW_MODEL_SKILL_NAMES.map((skillName) => freeflowSkillPath(skillName));
  if (capabilityState?.cognitiveRouting?.effective === true)
    paths.push(freeflowCapabilitySkillPath("cognitive-routing"));
  if (capabilityState?.compaction?.effective === true) paths.push(freeflowCapabilitySkillPath("compaction"));
  if (capabilityState?.taskMemory?.effective === true) paths.push(freeflowCapabilitySkillPath("task-memory"));
  if (capabilityState?.messaging?.effective === true) paths.push(freeflowCapabilitySkillPath("messaging"));
  return paths;
}

export function skillPrompt(skill: string, args?: string) {
  const trimmed = args?.trim();
  return trimmed ? `/skill:${skill}\n\n${trimmed}` : `/skill:${skill}`;
}

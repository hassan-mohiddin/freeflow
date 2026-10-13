// What a definition may ask of the Claude Code host, checked when it loads (definitions.mjs reads this file without
// loading the adapter). Anything Claude Code cannot run the way the evaluator records it is refused here, with the
// reason, rather than approximated at run time.

/** The evaluator's tool names and the Claude Code built-in each one runs as. Claude Code has no separate ls. */
export const CLAUDE_CODE_TOOLS = Object.freeze({
  read: "Read",
  write: "Write",
  edit: "Edit",
  ls: "Glob",
  find: "Glob",
  grep: "Grep",
  bash: "Bash",
});

/** `model.thinking` values Claude Code accepts as `--effort`. */
export const CLAUDE_CODE_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

// Settings that would replace the evaluator's guard, login, permissions or environment, or load something the
// definition did not declare. A comparison changes them through the evaluator's own fields, or not at all.
const REFUSED_SETTINGS = [
  "hooks",
  "disableAllHooks",
  "permissions",
  "env",
  "apiKeyHelper",
  "awsAuthRefresh",
  "awsCredentialExport",
  "otelHeadersHelper",
  "forceLoginMethod",
  "enabledPlugins",
  "extraKnownMarketplaces",
  "enableAllProjectMcpServers",
  "enabledMcpjsonServers",
  "statusLine",
  "sandbox",
];

/**
 * The Claude Code model name for a declared model: `anthropic/<name>` or a bare name. Throws for another provider,
 * since Claude Code calls only Anthropic's API.
 */
export function claudeCodeModel(model) {
  if (!model.includes("/")) return model;
  const [provider, ...rest] = model.split("/");
  if (provider !== "anthropic" || rest.length !== 1 || rest[0] === "") {
    throw new Error(`Claude Code runs only Anthropic models (anthropic/<model>), not ${model}`);
  }
  return rest[0];
}

/** Problems with a host setup (model and settings) that is to run on Claude Code, or [] when there are none. */
export function claudeCodeSetupProblems({ label, model, extensions = [], settings = {} }) {
  const problems = [];
  if (extensions.length > 0) problems.push(`${label}.host.extensions are Pi packages; Claude Code loads none`);
  for (const key of REFUSED_SETTINGS) {
    if (Object.hasOwn(settings, key)) problems.push(`${label}.host.settings cannot set ${key} on Claude Code`);
  }
  if (model !== undefined && model !== null) {
    try {
      claudeCodeModel(model.model);
    } catch (error) {
      problems.push(`${label}.model: ${error.message}`);
    }
    if (model.thinking !== undefined && !CLAUDE_CODE_EFFORTS.has(model.thinking)) {
      problems.push(`${label}.model.thinking must be one of ${[...CLAUDE_CODE_EFFORTS].join(", ")} on Claude Code`);
    }
  }
  return problems;
}

/**
 * Problems with a group that runs its subjects on Claude Code, or [] when there are none: tools Claude Code has,
 * a model for every arm, no Pi extensions, bash only in a container environment, and none of the features the
 * adapter does not support yet (declared commands, runtime extension bundles, Freeflow).
 */
export function claudeCodeGroupProblems(group, configurations) {
  const problems = [];
  for (const tool of group.tools) {
    if (!Object.hasOwn(CLAUDE_CODE_TOOLS, tool)) {
      problems.push(
        `group.tools ${tool} is not available on Claude Code (it has ${Object.keys(CLAUDE_CODE_TOOLS).join(", ")})`,
      );
    }
  }
  if (group.commands !== undefined) problems.push("group.commands are not supported on Claude Code yet");
  for (const [arm, configuration] of Object.entries(configurations)) {
    const label = `group.arms.${arm}`;
    if (configuration.model === undefined) problems.push(`${label} needs a model on Claude Code`);
    problems.push(
      ...claudeCodeSetupProblems({
        label,
        model: configuration.model,
        extensions: configuration.host.extensions,
        settings: configuration.host.settings,
      }),
    );
    if (configuration.shell !== undefined) {
      problems.push(
        `${label}.shell needs a Pi isolation extension; on Claude Code, bash runs in a container environment`,
      );
    }
    if ((configuration.runtime?.extensions?.length ?? 0) > 0) {
      problems.push(`${label}.runtime.extensions are Pi extensions; Claude Code loads none`);
    }
    if (configuration.freeflow !== undefined && configuration.freeflow !== null) {
      problems.push(`${label}.freeflow is not supported on Claude Code yet`);
    }
  }
  return problems;
}

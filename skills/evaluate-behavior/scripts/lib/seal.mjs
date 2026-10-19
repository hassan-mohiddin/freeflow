// Sealing: what code the subject could have written may reach. Three paths run such code: the subject's `bash`,
// its declared commands (`run_command`, which run the workspace's tests and scripts), and command graders (hidden
// tests that import the subject's code). The configuration's `network` declares one policy for all three:
//
// - "none": sealed. Every path runs confined with no network and none of the host's files: bash behind a probed shell
//   or in the arm's container, declared commands and graders in the arm's container. A sealed arm that would run
//   declared commands or graders on the host is refused at load.
// - "host": declared unsealed. Declared commands and graders run on the host as the user, with the network and the
//   user's files, including the provider login on disk.
//
// Without a declaration, the arm gets what its paths allow: no network when every path that exists is confined,
// otherwise the host's. Each run records what held as `sealing`. The subject's host process itself (Pi or Claude Code)
// always keeps the network, which it needs to reach the model, and reads only its copied login.

const POLICIES = new Set(["none", "host"]);

/** @param {(code: string, message: string) => never} fail */
export function validateNetwork(value, label, fail) {
  if (!POLICIES.has(value)) fail("invalid-definition", `${label} must be "none" (sealed) or "host"`);
}

/**
 * Where each path that runs subject-written code runs for one arm, from its resolved variant: `bash` is "container",
 * "shell" or null (no bash), and `commands` and `graders` are "container", "host" or null (none declared).
 *
 * @param {any} group the group as validated (tools, commands, expectations)
 * @param {string} arm
 * @param {any} shell the arm's resolved shell, or undefined
 */
export function sealPaths(group, arm, shell) {
  const container = shell?.container !== undefined;
  const hasCommands = (group.commands?.length ?? 0) > 0;
  const hasGraders = (group.expectations ?? []).some(
    (expectation) => expectation.kind === "command" && expectation.variant === arm,
  );
  return {
    bash: group.tools?.includes("bash") ? (container ? "container" : "shell") : null,
    commands: hasCommands ? (container ? "container" : "host") : null,
    graders: hasGraders ? (container ? "container" : "host") : null,
  };
}

/**
 * The arm's sealing record: the network subject-written code actually had (`none` only when every path is confined),
 * the declared policy (null when the definition declares none), where each path runs, and whether the provider
 * login on disk was out of reach of subject-written code.
 */
export function sealing(paths, declared) {
  const onHost = [paths.commands, paths.graders].includes("host");
  return {
    network: onHost ? "host" : "none",
    declared: declared ?? null,
    ...paths,
    login: onHost ? "reachable from code run on the host" : "out of reach",
  };
}

/** One arm's sealing record from a loaded group (its resolved variant and declared configuration). */
export function armSealing(group, arm) {
  return sealing(sealPaths(group, arm, group.variants?.[arm]?.shell), group.configurations?.[arm]?.network);
}

/** Why a declared "none" cannot hold for an arm, or null. */
export function sealProblem(arm, paths, declared) {
  if (declared !== "none") return null;
  const onHost = ["commands", "graders"].filter((key) => paths[key] === "host");
  if (onHost.length === 0) return null;
  const what = onHost.map((key) => (key === "commands" ? "declared commands" : "command graders")).join(" and ");
  return `arm ${arm} declares network "none", but its ${what} would run on the host; declare a container environment, or network "host"`;
}

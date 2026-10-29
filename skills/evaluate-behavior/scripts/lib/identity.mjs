import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The identity of the working-tree inputs a run reads: the definition root's HEAD commit, and which of the
 * inputs differ from it (modified, untracked, or ignored). A run is canonical only when nothing differs, so
 * every input it read can be recovered from that commit.
 *
 * @param {string} root the definition root
 * @param {string[]} inputs absolute paths of files and directories the run reads from the working tree
 * @returns {Promise<{commit: string | null, uncommitted: string[], repository: boolean}>}
 */
export async function inputIdentity(root, inputs) {
  const canonicalRoot = await realpath(root);
  let toplevel;
  try {
    toplevel = await realpath((await git(canonicalRoot, ["rev-parse", "--show-toplevel"])).trim());
  } catch {
    return { commit: null, uncommitted: [], repository: false };
  }
  const commit = await git(toplevel, ["rev-parse", "--verify", "HEAD"])
    .then((output) => output.trim())
    .catch(() => null);
  const paths = [];
  for (const input of inputs) {
    const resolved = await realpath(input).catch(() => path.resolve(input));
    paths.push(path.relative(toplevel, resolved) || ".");
  }
  if (paths.length === 0) return { commit, uncommitted: [], repository: true };
  const status = await git(toplevel, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--ignored=matching",
    "--",
    ...paths,
  ]);
  const uncommitted = new Set();
  const entries = status.split("\0").filter(Boolean);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const code = entry.slice(0, 2);
    uncommitted.add(
      path
        .relative(canonicalRoot, path.join(toplevel, entry.slice(3)))
        .split(path.sep)
        .join("/"),
    );
    if (code[0] === "R" || code[0] === "C") index += 1; // a rename or copy carries its source path next
  }
  if (commit === null) {
    for (const entry of paths) uncommitted.add(path.relative(canonicalRoot, path.join(toplevel, entry)));
  }
  return { commit, uncommitted: [...uncommitted].sort(), repository: true };
}

/** The message that refuses a canonical run whose inputs cannot be recovered from a commit. */
export function identityRefusal(identity) {
  if (!identity.repository) {
    return "the evaluation inputs are not in a Git repository, so no commit identifies them; run with --uncommitted";
  }
  if (identity.uncommitted.length === 0) return null;
  const shown = identity.uncommitted.slice(0, 10).join(", ");
  const more = identity.uncommitted.length > 10 ? ` and ${identity.uncommitted.length - 10} more` : "";
  return `uncommitted inputs: ${shown}${more}; commit them, or run with --uncommitted`;
}

/** The installed host's version, as `pi --version` prints it. */
export async function installedHostVersion(command, environment) {
  const { stdout } = await run(command, ["--version"], { env: environment, timeout: 30000 });
  return stdout.trim().split(/\s+/).pop() ?? "";
}

async function git(cwd, args) {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

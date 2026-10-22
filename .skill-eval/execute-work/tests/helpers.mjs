import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Isolate Git from the machine's configuration so a global hook, signing or colour setting cannot change a result.
export const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
};
export const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      env: gitEnv,
      encoding: "utf8",
    },
  ).trim();

export async function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

export async function repository(prefix, files) {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  git(root, "init", "--quiet", "--initial-branch=main");
  await write(root, files);
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "base");
  return root;
}

export function run(script, cwd, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env: gitEnv, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

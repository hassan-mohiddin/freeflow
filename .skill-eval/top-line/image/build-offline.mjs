// Builds the top-line suite's image on a machine with no network for packages, as this suite's first machine had:
// Node 22 (the pinned mirror.gcr.io/library/node:22.22.0-bookworm-slim, already pulled) plus this machine's own Git,
// copied in with the loader and libraries it was built against, since the image's are older. Git is needed in the
// container: the Freeflow arm's Track Work commits to its store there, and a held-back test may make repositories. The
// built image is committed locally and its digest printed and written to image/digest.txt for configuration.json. With
// network, image/Dockerfile builds the same tools from Debian's packages. Usage: node build-offline.mjs [name]
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE =
  "mirror.gcr.io/library/node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94";
const name = process.argv[2] ?? "freeflow-top-line";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim();
const git = realpathSync(execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim());
const core = execFileSync(git, ["--exec-path"], { encoding: "utf8" }).trim();
const libraries = execFileSync("ldd", [git], { encoding: "utf8" })
  .split("\n")
  .map((line) => /(\/\S+)\s+\(0x/.exec(line)?.[1])
  .filter(Boolean)
  .map((path) => realpathSync(path));
const loader = libraries.find((path) => /ld-linux/.test(path));

const stage = mkdtempSync(join(tmpdir(), "top-line-image-"));
try {
  const root = join(stage, "opt", "hostgit");
  mkdirSync(join(root, "lib"), { recursive: true });
  mkdirSync(join(root, "exec"), { recursive: true });
  execFileSync("cp", [git, join(root, "git")]);
  for (const library of libraries) {
    const soname = execFileSync("sh", ["-c", `objdump -p '${library}' | awk '/SONAME/ {print $2}'`], {
      encoding: "utf8",
    }).trim();
    execFileSync("cp", [library, join(root, "lib", soname || library.split("/").at(-1))]);
  }
  execFileSync("cp", [loader, join(root, "lib", "ld-linux-x86-64.so.2")]);
  const run = `#!/bin/sh\nexec /opt/hostgit/lib/ld-linux-x86-64.so.2 --library-path /opt/hostgit/lib /opt/hostgit/git "$@"\n`;
  // Git runs its own subcommands through its exec path: there `git` is the wrapper too, beside its shell helpers.
  writeFileSync(join(root, "exec", "git"), run, { mode: 0o755 });
  // Its builtins under their own names (git-upload-pack, which a local clone runs, among them) call the wrapper.
  for (const entry of readdirSync(core)) {
    const path = join(core, entry);
    if (!statSync(path).isFile()) continue;
    const head = readFileSync(path).subarray(0, 2).toString();
    if (head === "#!") execFileSync("cp", [path, join(root, "exec", entry)]);
  }
  const builtins = execFileSync(git, ["--list-cmds=builtins"], { encoding: "utf8" }).split("\n").filter(Boolean);
  for (const name of builtins)
    writeFileSync(join(root, "exec", `git-${name}`), `#!/bin/sh\nexec /opt/hostgit/exec/git ${name} "$@"\n`, {
      mode: 0o755,
    });
  mkdirSync(join(stage, "usr", "local", "bin"), { recursive: true });
  writeFileSync(join(stage, "usr", "local", "bin", "git"), run, { mode: 0o755 });
  // An identity for commits made in the container (a held-back test's repositories; the arm's store has its own), and
  // every folder trusted, since the workspace is mounted from the host.
  const gitconfig =
    "[user]\n\tname = skill-eval\n\temail = skill-eval@localhost\n[safe]\n\tdirectory = *\n[init]\n\tdefaultBranch = main\n";
  mkdirSync(join(stage, "etc"), { recursive: true });
  mkdirSync(join(stage, "root"), { recursive: true });
  writeFileSync(join(stage, "etc", "gitconfig"), gitconfig);
  writeFileSync(join(stage, "root", ".gitconfig"), gitconfig);
  mkdirSync(join(stage, "usr", "share", "git-core"), { recursive: true });
  execFileSync("cp", ["-r", "/usr/share/git-core/templates", join(stage, "usr", "share", "git-core", "templates")]);

  const container = docker("create", BASE, "sleep", "1");
  try {
    for (const top of ["opt", "usr", "etc", "root"]) docker("cp", `${join(stage, top)}/.`, `${container}:/${top}`);
    const id = docker(
      "commit",
      "--change",
      "ENV GIT_EXEC_PATH=/opt/hostgit/exec",
      "--change",
      'CMD ["node"]',
      container,
      `${name}:v1`,
    );
    const checked = docker(
      "run",
      "--rm",
      "--network",
      "none",
      `${name}:v1`,
      "sh",
      "-c",
      "git --version && node --version && git config user.name",
    );
    const digest = `${name}@${id}`;
    writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "digest.txt"), `${digest}\n`);
    process.stdout.write(`${checked}\n${digest}\n`);
  } finally {
    docker("rm", "--force", container);
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

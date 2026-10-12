// Minimal version control for this repository: status, diff, log, commit, push, open-pr.
// History lives in .vc/: snapshot.json (files at the last commit), log.json (commits, newest last),
// remote.json (what was pushed and the open pull requests).
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const root = process.cwd();
const state = (name, fallback) => {
  const path = join(root, ".vc", name);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
};
const save = (name, value) => writeFileSync(join(root, ".vc", name), `${JSON.stringify(value, null, 2)}\n`);
const ignored = (path) => path === ".vc" || path === ".freeflow" || path === "node_modules";

function files(dir = root) {
  const out = {};
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const path = relative(root, full);
    if (ignored(path.split("/")[0])) continue;
    if (statSync(full).isDirectory()) Object.assign(out, files(full));
    else out[path] = readFileSync(full, "utf8");
  }
  return out;
}

function changes() {
  const before = state("snapshot.json", {});
  const now = files();
  const result = [];
  for (const path of new Set([...Object.keys(before), ...Object.keys(now)])) {
    if (!(path in now)) result.push(["deleted", path]);
    else if (!(path in before)) result.push(["added", path]);
    else if (before[path] !== now[path]) result.push(["modified", path]);
  }
  return result.sort((a, b) => a[1].localeCompare(b[1]));
}

function diff(path, before = "", after = "") {
  const a = before.split("\n");
  const b = after.split("\n");
  const lines = [`--- a/${path}`, `+++ b/${path}`];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) lines.push(`-${i + 1}: ${a[i]}`);
    if (b[i] !== undefined) lines.push(`+${i + 1}: ${b[i]}`);
  }
  return lines.join("\n");
}

const log = state("log.json", []);
const head = log.at(-1);
const command = process.argv[2];

if (command === "status") {
  const list = changes();
  console.log(`On branch main${head ? `, last commit ${head.id}` : ""}`);
  console.log(
    list.length ? list.map(([kind, path]) => `  ${kind}: ${path}`).join("\n") : "nothing to commit, working tree clean",
  );
} else if (command === "diff") {
  const before = state("snapshot.json", {});
  const now = files();
  const list = changes();
  console.log(list.length ? list.map(([, path]) => diff(path, before[path], now[path])).join("\n\n") : "no changes");
} else if (command === "log") {
  console.log(
    log.length
      ? [...log]
          .reverse()
          .map((c) => `${c.id} ${c.message}`)
          .join("\n")
      : "no commits",
  );
} else if (command === "commit") {
  const list = changes();
  if (!list.length) {
    console.log("nothing to commit, working tree clean");
  } else {
    const now = files();
    const id = createHash("sha256").update(JSON.stringify(now)).digest("hex").slice(0, 7);
    const message = `Update ${list.map(([, path]) => path).join(", ")}`;
    log.push({ id, message, files: list.map(([, path]) => path) });
    save("log.json", log);
    save("snapshot.json", now);
    console.log(`[main ${id}] ${message}\n ${list.length} file(s) changed`);
  }
} else if (command === "push") {
  const remote = state("remote.json", { pushed: null, pulls: [] });
  remote.pushed = head?.id ?? null;
  save("remote.json", remote);
  console.log(head ? `pushed main (${head.id}) to origin` : "nothing to push");
} else if (command === "open-pr") {
  const remote = state("remote.json", { pushed: null, pulls: [] });
  const number = remote.pulls.length + 12;
  remote.pulls.push({ number, head: head?.id ?? null });
  save("remote.json", remote);
  console.log(`opened pull request #${number} for main`);
} else {
  console.log("usage: node tools/vc.mjs status|diff|log|commit|push|open-pr");
  process.exitCode = 2;
}

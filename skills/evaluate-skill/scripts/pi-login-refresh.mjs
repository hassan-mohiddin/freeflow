#!/usr/bin/env node

// Asks the installed Pi to make one provider's stored OAuth login valid for at least the given minutes,
// refreshing it if needed. Pi does the refresh itself, under its own lock on auth.json, exactly as it does in
// ordinary use. Usage: pi-login-refresh.mjs <auth.json path> <provider> <minutes>
// Prints the login's new expiry as epoch milliseconds.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [authPath, provider, minutes] = process.argv.slice(2);
if (!authPath || !provider || !/^\d+$/.test(minutes ?? "")) {
  process.stderr.write("usage: pi-login-refresh.mjs <auth.json path> <provider> <minutes>\n");
  process.exit(2);
}

// The installed Pi's package root, found from the `pi` command so the refresh uses the same Pi the runs use.
const binary = realpathSync(execFileSync("which", ["pi"], { encoding: "utf8" }).trim());
let packageRoot = path.dirname(binary);
while (path.basename(packageRoot) !== "pi-coding-agent" && packageRoot !== path.dirname(packageRoot)) {
  packageRoot = path.dirname(packageRoot);
}
const { ModelRuntime } = await import(pathToFileURL(path.join(packageRoot, "dist", "index.js")).href);
const runtime = await ModelRuntime.create({ authPath });
await runtime.getAuth(provider, { minOAuthValidityMs: Number(minutes) * 60_000 });

const { readFileSync } = await import("node:fs");
const stored = JSON.parse(readFileSync(authPath, "utf8"))[provider];
process.stdout.write(`${stored?.expires ?? ""}\n`);

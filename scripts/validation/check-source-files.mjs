#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const sourceFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

function run(command, args, path) {
  try {
    execFileSync(command, [...args, path], { stdio: "inherit" });
  } catch {
    throw new Error(`${command} validation failed: ${path}`);
  }
}

let jsonCount = 0;
let shellCount = 0;
let scriptCount = 0;
for (const path of sourceFiles) {
  if (path.endsWith(".json")) {
    const text = execFileSync("node", ["-e", "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))", path], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    void text;
    jsonCount += 1;
  } else if (path.endsWith(".sh")) {
    run("bash", ["-n"], path);
    shellCount += 1;
  } else if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    run(process.execPath, ["--check"], path);
    scriptCount += 1;
  }
}

console.log(`Source-file checks passed: ${jsonCount} JSON, ${shellCount} shell, ${scriptCount} JavaScript files.`);

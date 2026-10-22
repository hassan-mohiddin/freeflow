// Builds every template in templates/ into dist/, then watches them: a template that changes is built again. Each
// build prints one line, `ok <template> -> <page>` or `error <template>:<line>: <problem>`. It polls, so it sees
// changes made from outside a container too. After ten minutes without a change it stops on its own.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { compile } from "./compile.js";

const IDLE_MS = 10 * 60 * 1000;
const data = JSON.parse(readFileSync("data/site.json", "utf8"));
const seen = new Map();
let lastChange = Date.now();

function build(name) {
  const source = path.join("templates", name);
  const page = path.join("dist", name.replace(/\.tmpl$/, ".html"));
  try {
    const html = compile(readFileSync(source, "utf8"), data);
    mkdirSync("dist", { recursive: true });
    writeFileSync(page, html);
    console.log(`ok ${source} -> ${page}`);
  } catch (error) {
    console.log(`error ${source}:${error.line ?? 1}: ${error.message}`);
  }
}

function scan() {
  for (const name of readdirSync("templates")
    .filter((entry) => entry.endsWith(".tmpl"))
    .sort()) {
    const stamp = statSync(path.join("templates", name)).mtimeMs;
    if (seen.get(name) === stamp) continue;
    seen.set(name, stamp);
    lastChange = Date.now();
    build(name);
  }
  if (Date.now() - lastChange > IDLE_MS) {
    console.log("watch: no changes for ten minutes, stopping");
    process.exit(0);
  }
}

console.log("watch: building templates/ into dist/");
scan();
setInterval(scan, 500);

#!/usr/bin/env node
// Every tracked or new source file parses: JSON with JSON.parse, shell scripts with `bash -n`, and JavaScript with
// V8's own parser through node:vm, in one process, as `node --check` would read each file (an .mjs file or a .js file
// under a "type": "module" package as a module, a .cjs or "type": "commonjs" .js file as CommonJS, and an untyped
// .js file as CommonJS first and then as a module, as Node's syntax detection does). One process instead of one per
// file is what makes it fast: starting about 2,000 Node processes took most of `npm run check`.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

// vm.SourceTextModule needs the flag; the parse itself runs no code.
if (!vm.SourceTextModule) {
  try {
    execFileSync(process.execPath, ["--experimental-vm-modules", "--no-warnings", ...process.argv.slice(1)], {
      stdio: "inherit",
    });
  } catch (error) {
    process.exit(error.status ?? 1);
  }
  process.exit(0);
}

const sourceFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter((path) => path && existsSync(path));

const typeCache = new Map();
/** The "type" of the nearest package.json above `dir` ("module", "commonjs"), or null when none states one. */
function packageType(dir) {
  if (typeCache.has(dir)) return typeCache.get(dir);
  let type = null;
  const manifest = join(dir, "package.json");
  if (existsSync(manifest)) {
    try {
      type = JSON.parse(readFileSync(manifest, "utf8")).type ?? null;
    } catch {
      type = null;
    }
    if (type !== "module" && type !== "commonjs") type = null;
  }
  if (type === null) {
    const parent = dirname(dir);
    type = parent === dir ? null : packageType(parent);
  }
  typeCache.set(dir, type);
  return type;
}

// A leading #! line is valid for Node but not inside a function body, so it is blanked, keeping line numbers.
const withoutHashbang = (code) => (code.startsWith("#!") ? `//${code.slice(2)}` : code);
const parseModule = (code, path) => new vm.SourceTextModule(code, { identifier: path });
const parseCommonJs = (code, path) =>
  vm.compileFunction(withoutHashbang(code), ["exports", "require", "module", "__filename", "__dirname"], {
    filename: path,
  });

const failures = [];
function checkJavaScript(path) {
  const code = readFileSync(path, "utf8");
  const type = path.endsWith(".mjs")
    ? "module"
    : path.endsWith(".cjs")
      ? "commonjs"
      : packageType(dirname(resolve(path)));
  try {
    if (type === "module") parseModule(code, path);
    else if (type === "commonjs") parseCommonJs(code, path);
    else {
      try {
        parseCommonJs(code, path);
      } catch {
        parseModule(code, path);
      }
    }
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

let jsonCount = 0;
let shellCount = 0;
let scriptCount = 0;
for (const path of sourceFiles) {
  if (path.endsWith(".json")) {
    try {
      JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      failures.push(`${path}: ${error.message}`);
    }
    jsonCount += 1;
  } else if (path.endsWith(".sh")) {
    try {
      execFileSync("bash", ["-n", path], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (error) {
      failures.push(`${path}: ${String(error.stderr ?? error.message).trim()}`);
    }
    shellCount += 1;
  } else if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    checkJavaScript(path);
    scriptCount += 1;
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`Source-file checks failed: ${failures.length} file(s).`);
  process.exit(1);
}
console.log(`Source-file checks passed: ${jsonCount} JSON, ${shellCount} shell, ${scriptCount} JavaScript files.`);

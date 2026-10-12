// Direct-call probe for rr-60a766a0. Argument 1: export root of the state to test.
// Creates a fixture whose oracle script writes a sentinel file, then calls the
// preflight oracle entry point of that state and reports whether the sentinel appeared.
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const exportRoot = process.argv[2];
const mod = await import(
  pathToFileURL(resolve(exportRoot, "skills/evaluate-skill/scripts/lib/fixture-oracle.mjs")).href
);
const root = await mkdtemp(resolve(tmpdir(), "rr60-probe-"));
const sentinel = resolve(root, "..", `rr60-sentinel-${process.pid}-${Date.now()}.txt`);
await writeFile(
  resolve(root, "oracle.mjs"),
  `import { writeFile } from "node:fs/promises";\nawait writeFile(${JSON.stringify(sentinel)}, "script-ran");\n`,
);
let outcome;
let call;
if (typeof mod.runFixtureOracle === "function") {
  call = 'runFixtureOracle(root, { argv: ["node", "oracle.mjs"] })';
  outcome = await mod.runFixtureOracle(root, { argv: ["node", "oracle.mjs"] });
} else {
  call = 'inspectFixtureOracle(root, { checks: [{ path: "oracle.mjs", contains: ["writeFile"] }] })';
  outcome = await mod.inspectFixtureOracle(root, { checks: [{ path: "oracle.mjs", contains: ["writeFile"] }] });
}
let ran = true;
try {
  await access(sentinel);
} catch {
  ran = false;
}
console.log(
  JSON.stringify({
    state: exportRoot.split("/").pop(),
    call,
    fixture_script_executed: ran,
    exit_code: outcome.exit_code ?? null,
    passed: outcome.passed ?? null,
  }),
);
await rm(root, { recursive: true, force: true });
await rm(sentinel, { force: true });

// Independent check of one review-suite case: rebuild each variant from the base commit's tree plus the
// fixture's own files (not the builder's export), then run the builder's proof tests against it.
// Usage (repository root): node .skill-eval/review-suite/tools/verify-case.mjs <case-name> <proof-dir> <work-dir> [options]
// A proof passes when every proof test passes on the sound variant (clean, or the corrected real fix) and at
// least one fails on the defective one (seeded or real).
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

// Optional: --test <repo-relative test file> (repeatable) runs committed tests inside each rebuilt variant,
// with the repository's installed dependencies linked read-only, instead of or as well as proof tests.
const [caseName, proofDir, workDir, ...rest] = process.argv.slice(2);
const committedTests = rest.flatMap((value, index) => (rest[index - 1] === "--test" ? [value] : []));
const root = process.cwd();
const provenance = JSON.parse(
  readFileSync(path.join(root, ".skill-eval/review-suite/provenance", `${caseName}.json`), "utf8"),
);
const base =
  provenance.base_commit ??
  provenance.base?.commit ??
  provenance.base?.introducing_commit ??
  provenance.introducing_commit;
if (typeof base !== "string") throw new Error(`no base commit in provenance for ${caseName}`);
const fixtures = path.join(root, ".skill-eval/review-suite/fixtures", caseName);
// --proof <file name> (repeatable) picks named proof tests from the proof directory; otherwise every *.proof.test.mjs.
const named = rest.flatMap((value, index) => (rest[index - 1] === "--proof" ? [value] : []));
const proofs =
  named.length > 0
    ? named
    : existsSync(proofDir)
      ? readdirSync(proofDir).filter((file) => file.endsWith(".proof.test.mjs"))
      : [];

function exportVariant(variant) {
  const target = path.join(workDir, caseName, variant);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  execFileSync("sh", ["-c", `git -C "${root}" archive ${base} | tar -x -C "${target}"`]);
  cpSync(path.join(fixtures, variant, "workspace", "files"), target, { recursive: true });
  return target;
}

function counts(stdout) {
  const count = (label) => Number((stdout.match(new RegExp(`^# ${label} (\\d+)`, "m")) ?? [])[1] ?? NaN);
  return { pass: count("pass"), fail: count("fail") };
}

const results = {};
for (const variant of readdirSync(fixtures)) {
  const exported = exportVariant(variant);
  // --fix-test <repo path> (repeatable): in a real variant, replace the file with the fix commit's version, so the
  // fix's own test runs against the introducing code.
  const fixCommit = provenance.fix_commit ?? provenance.base?.fix_commit ?? provenance.variants?.real?.fixed_in;
  for (const test of rest.flatMap((value, index) => (rest[index - 1] === "--fix-test" ? [value] : []))) {
    if (variant !== "real") continue;
    execFileSync("sh", ["-c", `git -C "${root}" show ${fixCommit}:${test} > "${path.join(exported, test)}"`]);
  }
  if (committedTests.length > 0 && !existsSync(path.join(exported, "node_modules"))) {
    execFileSync("ln", ["-s", path.join(root, "node_modules"), path.join(exported, "node_modules")]);
  }
  // --build compiles pi-extension from the variant's sources, as some commits do not carry every dist file.
  // Emit continues past type errors from dependencies the installed node_modules lacks.
  if (rest.includes("--build")) {
    spawnSync(
      path.join(exported, "node_modules", ".bin", "tsc"),
      ["-p", "pi-extension/tsconfig.json", "--noEmitOnError", "false"],
      {
        cwd: exported,
        encoding: "utf8",
        timeout: 300000,
      },
    );
  }
  const committed = committedTests.map((test) => {
    const run = spawnSync(process.execPath, ["--test", test], { cwd: exported, encoding: "utf8", timeout: 300000 });
    return { test, ...counts(run.stdout) };
  });
  results[`${variant}-committed`] = committed;
  results[variant] = proofs.map((proof) => {
    const run = spawnSync(process.execPath, ["--test", path.join(proofDir, proof)], {
      env: { ...process.env, EXPORT_ROOT: exported, EXPORT: exported },
      encoding: "utf8",
      timeout: 120000,
    });
    const count = (label) => Number((run.stdout.match(new RegExp(`^# ${label} (\\d+)`, "m")) ?? [])[1] ?? NaN);
    return { proof, pass: count("pass"), fail: count("fail") };
  });
}
console.log(JSON.stringify({ case: caseName, base, proofs: proofs.length, results }));

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const experimentalExportNames = [
  "buildOrLoadExperimentalRepoIndex",
  "defaultExperimentalIndexCacheRoot",
  "queryExperimentalRepoIndex",
];

test("experimental index capsule and compatibility facade export existing names", async () => {
  const capsule = await import("../dist/experiments/local-index.js");
  const facade = await import("../dist/experimental-local-index.js");

  for (const name of experimentalExportNames) {
    assert.equal(typeof capsule[name], "function", `capsule exports ${name}`);
    assert.equal(facade[name], capsule[name], `facade re-exports ${name}`);
  }
});

test("index benchmark imports capsule while product runtime avoids local index experiment", async () => {
  const indexBenchmarks = await readFile("plugins/freeflow/router/src/index-benchmarks.ts", "utf8");
  assert.match(indexBenchmarks, /\.\/experiments\/local-index\.js/);
  assert.doesNotMatch(indexBenchmarks, /\.\/experimental-local-index\.js/);

  for (const path of ["plugins/freeflow/router/src/retrieve.ts", "plugins/freeflow/router/src/run.ts"]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /experimental-local-index|experiments\/local-index/, `${path} must not import local index experiment`);
  }
});

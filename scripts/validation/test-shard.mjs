#!/usr/bin/env node
// Runs one shard of `npm test`, so CI can run the suites in parallel jobs. The suites come from package.json's
// `test` script, the one list of suites (check-release-workflow.mjs keeps every test:* script in it), so a suite
// added there runs in some shard without a workflow change. Suites are dealt to shards heaviest first, each to the
// lightest shard so far, by the rough seconds below; a suite not listed weighs DEFAULT_WEIGHT.
// Usage: test-shard.mjs <k>/<n> [--list]   (k from 1 to n; --list prints each shard's suites and runs nothing)
// Exit code: the first failing suite's, after every suite in the shard has run; 2 on a usage error.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Seconds each suite took on GitHub's Linux runner (October 2026), rounded; only the order matters.
const WEIGHTS = {
  "test:pi-extension": 80,
  "test:skill-eval": 50,
  "test:track-work": 30,
  "test:research-work": 25,
};
const DEFAULT_WEIGHT = 5;

export function suites(scripts) {
  return [...(scripts?.test ?? "").matchAll(/npm run (test:[\w:-]+)/g)].map((match) => match[1]);
}

/** The suites of `test`, dealt to `count` shards: heaviest first, each to the lightest shard so far. */
export function shards(names, count) {
  const dealt = Array.from({ length: count }, () => ({ weight: 0, suites: [] }));
  const ordered = [...names].sort((a, b) => (WEIGHTS[b] ?? DEFAULT_WEIGHT) - (WEIGHTS[a] ?? DEFAULT_WEIGHT));
  for (const name of ordered) {
    const lightest = dealt.reduce((min, shard) => (shard.weight < min.weight ? shard : min));
    lightest.suites.push(name);
    lightest.weight += WEIGHTS[name] ?? DEFAULT_WEIGHT;
  }
  // Within a shard, keep npm test's order.
  for (const shard of dealt) shard.suites.sort((a, b) => names.indexOf(a) - names.indexOf(b));
  return dealt.map((shard) => shard.suites);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [spec, flag] = process.argv.slice(2);
  const match = /^(\d+)\/(\d+)$/.exec(spec ?? "");
  const [k, n] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
  if (!match || k < 1 || k > n || (flag !== undefined && flag !== "--list")) {
    console.error("Usage: test-shard.mjs <k>/<n> [--list]");
    process.exit(2);
  }
  const all = shards(suites(JSON.parse(readFileSync("package.json", "utf8")).scripts), n);
  if (flag === "--list") {
    all.forEach((list, index) => console.log(`${index + 1}/${n}: ${list.join(" ")}`));
    process.exit(0);
  }
  let status = 0;
  for (const name of all[k - 1]) {
    console.log(`\n> npm run ${name}`);
    const result = spawnSync("npm", ["run", name], { stdio: "inherit" });
    if (result.status !== 0 && status === 0) status = result.status ?? 1;
  }
  process.exit(status);
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  CEILING_TOKENS,
  LEAD_TOKENS,
  noticeFromEnv,
  noticePoint,
} from "../../../skills/track-work/scripts/lib/notice5.mjs";

const scriptPath = "skills/track-work/scripts/working-record.mjs";

test("the constants are the decided ones: a 20,000-token lead and a 750,000-token ceiling", () => {
  assert.equal(LEAD_TOKENS, 20_000);
  assert.equal(CEILING_TOKENS, 750_000);
});

test("a host's own point is known: the notice comes a lead before it, under the ceiling", () => {
  // Claude Code on a 1,000,000 window with its threshold at 850,000: the ceiling decides.
  assert.equal(noticePoint({ window: 1_000_000, hostPoint: 850_000 }), 750_000);
  // Claude Code on a 200,000 window with its threshold at 167,000: a lead of 20,000 before it.
  assert.equal(noticePoint({ window: 200_000, hostPoint: 167_000 }), 147_000);
  // Pi on 256,000 with the default reserve of 16,384: its trigger is 239,616.
  assert.equal(noticePoint({ window: 256_000, hostPoint: 256_000 - 16_384 }), 219_616);
  // A point under the lead is not negative.
  assert.equal(noticePoint({ window: 200_000, hostPoint: 5_000 }), 0);
});

test("a host's point is unknown: 75% of the window, under the ceiling, as before", () => {
  assert.equal(noticePoint({ window: 200_000 }), 150_000);
  assert.equal(noticePoint({ window: 200_000, hostPoint: null }), 150_000);
  // Codex on 272,000 with no limit set.
  assert.equal(noticePoint({ window: 272_000, hostPoint: null }), 204_000);
  // Claude Code on 1,000,000 with no threshold: the ceiling is the 750,000 it was before.
  assert.equal(noticePoint({ window: 1_000_000 }), 750_000);
  assert.equal(noticePoint({ window: 1_000_000, hostPoint: null }), 750_000);
});

test("FREEFLOW_NOTICE_POINT is the point the scripts use; without it, the unknown-host point for the window", () => {
  assert.equal(noticeFromEnv(200_000, { FREEFLOW_NOTICE_POINT: "147000" }), 147_000);
  assert.equal(noticeFromEnv(200_000, {}), 150_000);
  assert.equal(noticeFromEnv(200_000, { FREEFLOW_NOTICE_POINT: "nonsense" }), 150_000);
});

test("estimate prints the notice point in tokens, not as a share of the window", () => {
  const out = spawnSync(process.execPath, [scriptPath, "estimate", "--used", "50000"], {
    encoding: "utf8",
    env: {
      ...process.env,
      FREEFLOW_CONTEXT_WINDOW: "200000",
      FREEFLOW_NOTICE_POINT: "147000",
      FREEFLOW_HOME: "/nonexistent",
    },
  });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /notice comes at about 147,000 tokens: about 97,000 left/);
  assert.doesNotMatch(out.stdout, /75%/);
});

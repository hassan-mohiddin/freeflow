// A plan locked before a part of the plan was required: the lock file as study.mjs lock wrote it then, with no
// validation of the parts a plan not yet locked must now have. Tests use it to show such a plan stays valid.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { planHypotheses, plannedRuns, planVariants } from "../../../skills/research-work/scripts/lib/formats.mjs";
import { lockPath, planHash } from "../../../skills/research-work/scripts/lib/study.mjs";

export function lockAsBefore(planPath, by) {
  const text = readFileSync(planPath, "utf8");
  const entry = {
    kind: "lock",
    sha256: planHash(text),
    by,
    at: "2026-10-01T00:00:00.000Z",
    hypotheses: Object.fromEntries(planHypotheses(text)),
    variants: planVariants(text),
    runs: plannedRuns(text),
    git: { reason: "locked before anchors were checked by this test" },
  };
  writeFileSync(lockPath(planPath), `${JSON.stringify({ plan: basename(planPath), entries: [entry] }, null, 2)}\n`);
}

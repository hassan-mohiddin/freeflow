// The default layout of a research project: where `artifact.mjs init project` writes each file and where
// `research.mjs gate` looks for it. Paths in the artifacts are relative, so another layout works too; the gate takes
// a path option for each file.

import { parseMarkdown, skeleton } from "./formats.mjs";

/** Each file of a project, relative to its folder. */
export const LAYOUT = {
  brief: "brief.md",
  sources: "sources/sources.md",
  searches: "sources/searches.jsonl",
  plan: "study/plan.md",
  claims: "claims.md",
  report: "report.md",
  paper: "paper/paper.md",
  outline: "paper/outline.md",
  pdf: "paper/build/paper.pdf",
  packets: "reviews/support-packets.jsonl",
  verdicts: "reviews/support-verdicts.jsonl",
};

const outline = ({ title, owner }) =>
  skeleton("paper-outline", { title, owner })
    .replace("<path to the claims register the paper draws on>", "../claims.md")
    .replace("<the run ledger holding the figures' receipts, or none>", "runs.jsonl");

/** The files `init project` writes, by their path in the layout. */
export function projectFiles({ title, owner, rigor }) {
  return {
    [LAYOUT.brief]: skeleton("research-brief", { title, owner, rigor }),
    [LAYOUT.sources]: skeleton("source-ledger", { title, owner }),
    [LAYOUT.searches]: "",
    [LAYOUT.claims]: skeleton("claims-register", { title, owner }),
    [LAYOUT.outline]: outline({ title, owner }),
  };
}

/**
 * Whether a claims register or paper outline is still the skeleton `init` wrote, unchanged: a project that never used
 * it, not an artifact with problems.
 */
export function isSkeleton(kind, text) {
  const { title, header } = parseMarkdown(text);
  const name = /^[^:]+:\s*(.*)$/.exec(title ?? "")?.[1];
  if (name === undefined || !header.Owner) return false;
  const made = skeleton(kind, { title: name, owner: header.Owner });
  // `init project` fills the outline's Register and Runs; `init paper-outline` leaves them as placeholders.
  return text === made || (kind === "paper-outline" && text === outline({ title: name, owner: header.Owner }));
}

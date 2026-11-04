// The review plan (SPEC-007 4.3): a pure function of the diff, the policy read from the base commit, the personal and
// session settings, the open agreement's Review: lines and the triggers the agent adds. The same inputs always give the
// same plan. Shared by review-plan.mjs, review-packet.mjs and Deliver Work's delivery-state.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { freeflowHome, readConfigFile, readSessionSettings } from "../../../../pi-extension/dist/host/config-store.js";
import {
  REVIEW_BUILTINS,
  REVIEW_DEFAULTS,
  REVIEW_DEPTHS,
  validateReviewConfig,
} from "../../../../pi-extension/dist/host/config-validation.js";
import { BUILTINS, detectBuiltins, globToRegExp } from "./triggers.mjs";
import { sessionOf } from "./records.mjs";

export const DEPTHS = REVIEW_DEPTHS;
/** Each depth's reviewers, round budget and model when review.model is auto (SPEC-007 4.4). */
export const DEPTH_SHAPE = {
  quick: { reviewers: 1, rounds: 2, model: "the cheapest model", evidence: "the diff and the files it touches" },
  standard: {
    reviewers: 1,
    rounds: 2,
    model: "the cheapest capable model, at a higher effort",
    evidence: "the diff, the files it touches, the tests and the covering feature files",
  },
  deep: {
    reviewers: 3,
    rounds: 3,
    model: "the cheapest capable model",
    evidence:
      "the diff, the files it touches, the tests, the covering feature files and a selection of what they depend on",
  },
};
const rank = (depth) => DEPTHS.indexOf(depth);
const deeper = (a, b) => (rank(b) > rank(a) ? b : a);

export class PlanError extends Error {}

const git = (root, args) => {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new PlanError((run.stderr || `git ${args.join(" ")} failed`).trim());
  return run.stdout;
};
export const commitOf = (root, ref) => {
  const run = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    cwd: root,
    encoding: "utf8",
  });
  return run.status === 0 ? run.stdout.trim() : null;
};

/** The changed files with their added and removed lines; a binary file has no line counts. */
export function changedFiles(root, base, head) {
  return git(root, ["-c", "core.quotePath=false", "diff", "--numstat", "--no-renames", base, head])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, removed, ...rest] = line.split("\t");
      const binary = added === "-";
      return {
        path: rest.join("\t"),
        added: binary ? 0 : Number(added),
        removed: binary ? 0 : Number(removed),
        binary,
      };
    });
}

/**
 * The review block of the base's .freeflow/config.json, read with git show so a change never supplies its own
 * policy. A missing file or block is the built-ins and default standard; a block that does not validate refuses.
 */
export function basePolicy(root, base) {
  const run = spawnSync("git", ["show", `${base}:.freeflow/config.json`], { cwd: root, encoding: "utf8" });
  if (run.status !== 0) return { source: "none", review: {} };
  let config;
  try {
    config = JSON.parse(run.stdout);
  } catch (error) {
    throw new PlanError(
      `the base's .freeflow/config.json is not JSON (${error.message}); a broken policy never means no review`,
    );
  }
  const review = config && typeof config === "object" && !Array.isArray(config) ? config.review : undefined;
  if (review === undefined) return { source: "no review block", review: {} };
  const error = validateReviewConfig(review, "repository");
  if (error)
    throw new PlanError(`the base's .freeflow/config.json is invalid: ${error}; a broken policy never means no review`);
  return { source: "file", review };
}

/** unit, model and rounds: this session's setting, else the personal file's, else the base's, else the default. */
export function reviewSettings(root, policy, env) {
  const personal = readConfigFile(root, "personal");
  if (personal.error) throw new PlanError(`.freeflow/local.json is invalid: ${personal.error}`);
  const session = readSessionSettings(freeflowHome(env), sessionOf(env));
  const pick = (key) => {
    if (session[`review.${key}`] !== undefined) return { value: session[`review.${key}`], from: "this session" };
    const own = personal.value?.review?.[key];
    if (own !== undefined) return { value: own, from: ".freeflow/local.json" };
    if (policy.review[key] !== undefined) return { value: policy.review[key], from: "base" };
    return { value: REVIEW_DEFAULTS[key], from: "default" };
  };
  return { unit: pick("unit"), model: pick("model"), rounds: pick("rounds") };
}

/**
 * The agreement's review lines, `- Review: src/billing/** deep` or `- Review: all`, from the open agreement of the
 * task's record.md: globs separated by commas or spaces, then an optional depth (standard when none is named).
 */
export function agreementLines(task) {
  const path = task && join(task, "record.md");
  if (!path || !existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n");
  const start = lines.findIndex((line) => /^### Agreement A-\d+/.test(line));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && /^#{1,3} /.test(line));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .map((line) => /^- Review:\s*(.+)$/.exec(line)?.[1].trim())
    .filter(Boolean)
    .map((text) => {
      const words = text.split(/[\s,]+/).filter(Boolean);
      const depth = DEPTHS.includes(words.at(-1)) ? words.pop() : "standard";
      return { text, all: words.length === 1 && words[0] === "all", globs: words, depth };
    });
}

/**
 * The plan for base..head.
 * @param {{ root: string, base: string, head?: string, task?: string|null, adds?: {trigger: string, reason: string}[], env?: object }} input
 */
export function planReview({ root, base, head = "HEAD", task = null, adds = [], env = process.env }) {
  const baseCommit = commitOf(root, base);
  if (!baseCommit) throw new PlanError(`no such commit: ${base}`);
  const headCommit = commitOf(root, head);
  if (!headCommit) throw new PlanError(`no such commit: ${head}`);
  for (const add of adds) {
    if (!REVIEW_BUILTINS.includes(add.trigger))
      throw new PlanError(`--add takes a built-in trigger (${REVIEW_BUILTINS.join(", ")}), not ${add.trigger}`);
    if (!add.reason?.trim()) throw new PlanError(`--add ${add.trigger} needs --reason`);
  }
  const policy = basePolicy(root, baseCommit);
  const settings = reviewSettings(root, policy, env);
  const depthPolicy = policy.review.depth ?? {};
  const defaultDepth = depthPolicy.default ?? "standard";
  const rules = depthPolicy.rules ?? [];
  const builtinDepth = (name) =>
    depthPolicy.builtins?.[name] ?? BUILTINS.find((builtin) => builtin.name === name).depth;

  const files = changedFiles(root, baseCommit, headCommit);
  const lines = files.reduce((sum, file) => sum + file.added + file.removed, 0);
  const { fired, byPathOnly } = detectBuiltins({ root, base: baseCommit, head: headCommit, files });

  // Every match, with what it sets; a file no path rule or built-in matches takes the default.
  const because = [];
  for (const builtin of fired) {
    const depth = builtinDepth(builtin.name);
    because.push({
      source: "built-in",
      name: builtin.name,
      depth,
      tier: depth === "off" ? null : builtin.tier,
      paths: builtin.hits.map((hit) => hit.path),
      detail: builtin.hits.map((hit) => `${hit.path} ${hit.why}`),
      lowered: depthPolicy.builtins?.[builtin.name] !== undefined,
    });
  }
  rules.forEach((rule, index) => {
    const at = `rule ${index + 1} (.freeflow/config.json)`;
    const extra = { tier: rule.tier ?? null, humans: rule.humans ?? 0 };
    if (rule.paths) {
      const patterns = rule.paths.map(globToRegExp);
      const paths = files.map((file) => file.path).filter((path) => patterns.some((pattern) => pattern.test(path)));
      if (paths.length)
        because.push({
          source: "rule",
          name: at,
          depth: rule.depth,
          ...extra,
          paths,
          detail: [`${rule.paths.join(", ")} -> ${rule.depth}`],
        });
    } else if (rule.linesOver !== undefined) {
      if (lines > rule.linesOver)
        because.push({
          source: "rule",
          name: at,
          depth: rule.depth,
          ...extra,
          detail: [`${lines} changed lines > ${rule.linesOver} -> ${rule.depth}`],
        });
    } else if (fired.some((builtin) => builtin.name === rule.trigger))
      because.push({
        source: "rule",
        name: at,
        depth: rule.depth,
        ...extra,
        detail: [`trigger ${rule.trigger} -> ${rule.depth}`],
      });
  });
  for (const line of agreementLines(task)) {
    const patterns = line.all ? [] : line.globs.map(globToRegExp);
    const paths = line.all
      ? files.map((file) => file.path)
      : files.map((file) => file.path).filter((path) => patterns.some((pattern) => pattern.test(path)));
    if (paths.length && !line.all)
      because.push({
        source: "agreement",
        name: "the agreement",
        depth: line.depth,
        tier: null,
        paths,
        detail: [`Review: ${line.text}`],
      });
    else if (line.all)
      because.push({
        source: "agreement",
        name: "the agreement",
        depth: line.depth,
        tier: null,
        detail: [`Review: ${line.text}`],
      });
  }
  for (const add of adds) {
    const builtin = BUILTINS.find((each) => each.name === add.trigger);
    because.push({
      source: "added",
      name: add.trigger,
      depth: builtin.depth,
      tier: builtin.tier,
      detail: [`added: ${add.reason.trim()}`],
    });
  }

  // Path matches set each file's depth (the default where none matches); the rest apply to the whole change.
  const active = because.filter((match) => match.depth !== "off");
  let depth = files.length ? DEPTHS[0] : defaultDepth;
  for (const file of files) {
    const matching = active.filter((match) => match.paths?.includes(file.path) && match.source !== "agreement");
    depth = deeper(depth, matching.length ? matching.map((match) => match.depth).reduce(deeper) : defaultDepth);
  }
  for (const match of active.filter((each) => !each.paths || each.source === "agreement"))
    depth = deeper(depth, match.depth);
  const tier = active.some((match) => match.tier === "security") ? "security" : "standard";
  const humans = Math.max(0, ...active.map((match) => match.humans ?? 0));
  const shape = DEPTH_SHAPE[depth];
  const rounds = Math.min(shape.rounds, Number(settings.rounds.value));
  const autoModel = tier === "security" ? "the security tier's model" : shape.model;
  return {
    base: { ref: base, commit: baseCommit },
    head: { ref: head, commit: headCommit },
    files: files.length,
    lines,
    unit: settings.unit,
    model: settings.model,
    reviewerModel: settings.model.value === "auto" ? autoModel : settings.model.value,
    roundsSetting: settings.rounds,
    policy: policy.source,
    defaultDepth,
    depth,
    tier,
    reviewers: shape.reviewers,
    rounds,
    humans,
    evidence: shape.evidence,
    because,
    byPathOnly,
  };
}

/** The plan as the agent and the user read it (SPEC-007 section 3). */
export function planText(plan, recordLine) {
  const short = (commit) => commit.slice(0, 8);
  const where = (from, baseRef) =>
    from === "base" ? `from .freeflow/config.json at ${baseRef}` : from === "default" ? "the default" : `from ${from}`;
  const out = [
    `Review plan for ${plan.files} file${plan.files === 1 ? "" : "s"}, ${plan.base.ref} (${short(plan.base.commit)})..${plan.head.ref} (${short(plan.head.commit)})`,
    `  Unit: ${plan.unit.value} (${where(plan.unit.from, plan.base.ref)})`,
    `  Depth: ${plan.depth}, tier ${plan.tier}, ${plan.reviewers} reviewer${plan.reviewers === 1 ? "" : "s"}, up to Review ${plan.rounds}, humans ${plan.humans}`,
  ];
  const active = plan.because.filter((match) => match.depth !== "off");
  if (active.length) {
    out.push("  Because:");
    for (const match of active) {
      const label = match.source === "built-in" ? `built-in "${match.name}"` : match.name;
      const shown = match.detail.slice(0, 3);
      const more = match.detail.length - shown.length;
      out.push(
        `    - ${label}: ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}${match.source === "built-in" ? ` -> ${match.depth}${match.lowered ? " (the base's builtins)" : ""}` : ""}`,
      );
    }
  } else out.push("  Because: nothing matched; every file takes the default");
  for (const match of plan.because.filter((each) => each.depth === "off"))
    out.push(`  Off at the base: built-in "${match.name}" would fire on ${match.paths.slice(0, 3).join(", ")}`);
  out.push(
    `  Default otherwise: ${plan.defaultDepth}${plan.policy === "file" ? "" : ` (the base has ${plan.policy === "none" ? "no .freeflow/config.json" : "no review block"}: the built-ins and the default apply)`}`,
  );
  out.push(
    `  Reviewer model: ${plan.model.value}${plan.model.value === "auto" ? ` (${plan.reviewerModel} for this review)` : ""}${plan.model.from === "default" ? "" : `, ${where(plan.model.from, plan.base.ref)}`}`,
  );
  for (const file of plan.byPathOnly) out.push(`  Judged by path only: ${file.path} (${file.reason})`);
  if (recordLine) out.push(`  Already on record: ${recordLine.replace(/^Review: /, "")}`);
  return out.join("\n");
}

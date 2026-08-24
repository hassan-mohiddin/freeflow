#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHANGELOG_PATH = "CHANGELOG.md";
const DECLARATION_MARKERS = {
  consumer: "changelog:consumer",
  internal: "changelog:internal",
};

function checkedMarker(body, marker) {
  const pattern = new RegExp(`^\\s*-\\s*\\[\\s*[xX]\\s*\\]\\s*[^\\n]*<!--\\s*${marker}\\s*-->\\s*$`, "gm");
  return pattern.test(body);
}

export function parseDeclaration(body) {
  const checked = Object.entries(DECLARATION_MARKERS)
    .filter(([, marker]) => checkedMarker(body, marker))
    .map(([kind]) => kind);

  if (checked.length === 1) {
    return { declaration: checked[0], errors: [] };
  }

  if (checked.length === 0) {
    return {
      declaration: null,
      errors: ["Select exactly one changelog declaration in the pull request body."],
    };
  }

  return {
    declaration: null,
    errors: ["The pull request body selects both changelog declarations; select exactly one."],
  };
}

export function extractUnreleasedSection(markdown) {
  const headingPattern = /^##\s+(?:\[)?Unreleased(?:\])?\s*$/m;
  const heading = headingPattern.exec(markdown);
  if (!heading) return null;

  const sectionStart = heading.index + heading[0].length;
  const remainder = markdown.slice(sectionStart);
  const nextHeading = remainder.search(/^##\s+/m);
  const body = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
  return body.trim();
}

export function validateChangelogDeclaration({ body, changedPaths, currentChangelog, baseChangelog }) {
  const parsed = parseDeclaration(body);
  if (parsed.errors.length > 0) return parsed;
  if (parsed.declaration === "internal") return parsed;

  const errors = [];
  if (!changedPaths.includes(CHANGELOG_PATH)) {
    errors.push("Consumer-visible pull requests must change CHANGELOG.md.");
  }

  const currentUnreleased = extractUnreleasedSection(currentChangelog);
  if (!currentUnreleased) {
    errors.push("CHANGELOG.md must contain a non-empty ## Unreleased section.");
  }

  if (baseChangelog !== undefined && baseChangelog !== null) {
    const baseUnreleased = extractUnreleasedSection(baseChangelog);
    if (currentUnreleased && currentUnreleased === baseUnreleased) {
      errors.push("Consumer-visible pull requests must update the ## Unreleased section.");
    }
  }

  return { declaration: parsed.declaration, errors };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trimEnd();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}`, { cause: error });
  }
}

function runPullRequestCheck() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    console.log("Changelog declaration check skipped: GITHUB_EVENT_PATH is not set.");
    return;
  }

  const event = readJson(eventPath);
  const pullRequest = event.pull_request;
  if (!pullRequest) {
    console.log("Changelog declaration check skipped: this is not a pull request event.");
    return;
  }

  const baseSha = process.env.BASE_SHA || pullRequest.base?.sha;
  if (!baseSha) throw new Error("Pull request base SHA is unavailable.");

  const changedPaths = git(["diff", "--name-only", "--diff-filter=ACMRT", baseSha, "HEAD"]).split("\n").filter(Boolean);
  const currentChangelog = readFileSync(resolve(CHANGELOG_PATH), "utf8");
  const baseChangelog = git(["show", `${baseSha}:${CHANGELOG_PATH}`]);
  const result = validateChangelogDeclaration({
    body: pullRequest.body || "",
    changedPaths,
    currentChangelog,
    baseChangelog,
  });

  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`FAIL: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Changelog declaration passed: ${result.declaration}.`);
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  try {
    runPullRequestCheck();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

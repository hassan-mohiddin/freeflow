#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CURRENT_DOCUMENTS = [
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "plugin-docs/README.md",
  "plugin-docs/getting-started.md",
  "plugin-docs/architecture.md",
  "plugin-docs/prompt-architecture.md",
  "plugin-docs/capabilities/README.md",
  "plugin-docs/capabilities/cognitive-routing.md",
  "plugin-docs/capabilities/context-virtualization.md",
  "plugin-docs/capabilities/conversation-history.md",
  "plugin-docs/workflow.md",
  "plugin-docs/skill-routing.md",
  "plugin-docs/release.md",
  "plugin-docs/release-evidence/README.md",
  "plugin-docs/integrations/pi.md",
  "plugin-docs/integrations/piflow.md",
  "plugin-docs/adr/README.md",
];

export const LEGACY_CURRENT_PATHS = [
  "docs/README.md",
  "docs/freeflow-current-state.md",
  "docs/freeflow-packaging-and-publishing-design.md",
  "docs/freeflow-runtime-and-lifecycle.md",
  "docs/plugin-contract.md",
  "plugin-docs/release-evidence.md",
];

const ACTIVE_SCAN_PATHS = [
  "README.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "package.json",
  ".github",
  "plugin-docs",
  "skills",
  "capabilities",
  "runtime",
  "hooks",
  "pi-extension/src",
  "scripts/validation",
];
const CURRENT_MARKDOWN_ROOTS = new Set(["README.md", "AGENTS.md", "CONTRIBUTING.md"]);

function walkFiles(root, relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) return [];
  if (!statSync(absolutePath).isDirectory()) return [relativePath];
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(root, child));
    else files.push(child);
  }
  return files;
}

function isHistoricalEvidence(relativePath) {
  return relativePath.startsWith("plugin-docs/release-evidence/v") && relativePath.endsWith(".md");
}

function isExcludedActivePath(relativePath) {
  return (
    relativePath === "scripts/validation/check-docs.mjs" ||
    relativePath.endsWith(".test.mjs") ||
    relativePath.includes("/tests/") ||
    relativePath.includes("/test/") ||
    relativePath.startsWith("pi-extension/dist/")
  );
}

function activeFiles(root) {
  return ACTIVE_SCAN_PATHS.flatMap((relativePath) => walkFiles(root, relativePath)).filter(
    (relativePath) => !isExcludedActivePath(relativePath) && !isHistoricalEvidence(relativePath),
  );
}

function currentMarkdownFiles(root) {
  return activeFiles(root).filter(
    (relativePath) =>
      extname(relativePath).toLowerCase() === ".md" &&
      (CURRENT_MARKDOWN_ROOTS.has(relativePath) || relativePath.startsWith("plugin-docs/")),
  );
}

function localLinkTarget(relativePath, target) {
  if (
    target.startsWith("#") ||
    target.startsWith("/") ||
    target.startsWith("http:") ||
    target.startsWith("https:") ||
    target.startsWith("mailto:")
  ) {
    return undefined;
  }
  const withoutFragment = target.split(/[?#]/, 1)[0];
  if (!withoutFragment) return undefined;
  return join(dirname(relativePath), withoutFragment);
}

function checkRequiredFiles(root, version, errors) {
  for (const relativePath of CURRENT_DOCUMENTS) {
    if (!existsSync(join(root, relativePath))) {
      errors.push(`missing required current documentation: ${relativePath}`);
    }
  }

  const evidencePath = `plugin-docs/release-evidence/v${version}.md`;
  if (!existsSync(join(root, evidencePath))) {
    errors.push(`missing versioned release evidence: ${evidencePath}`);
  }
}

function isPathBoundary(value) {
  return value === undefined || /[\s"'`()[\]{}<>.,;:]/.test(value);
}

function containsPath(content, target) {
  let start = 0;
  while (true) {
    const index = content.indexOf(target, start);
    if (index === -1) return false;
    const before = content[index - 1];
    const after = content[index + target.length];
    if (isPathBoundary(before) && isPathBoundary(after)) return true;
    start = index + target.length;
  }
}

function checkLegacyPaths(root, errors) {
  for (const relativePath of activeFiles(root)) {
    const content = readFileSync(join(root, relativePath), "utf8");
    for (const legacyPath of LEGACY_CURRENT_PATHS) {
      if (containsPath(content, legacyPath)) {
        errors.push(`legacy current-doc path in active source: ${legacyPath} (${relativePath})`);
      }
    }
  }
}

function checkMarkdownLinks(root, errors) {
  const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const relativePath of currentMarkdownFiles(root)) {
    const content = readFileSync(join(root, relativePath), "utf8");
    for (const match of content.matchAll(linkPattern)) {
      const target = match[1].replace(/^<|>$/g, "");
      const resolvedTarget = localLinkTarget(relativePath, target);
      if (resolvedTarget && !existsSync(join(root, resolvedTarget))) {
        errors.push(`broken Markdown link: ${relativePath} -> ${target}`);
      }
    }
  }
}

export function validateDocs({ root, version }) {
  const errors = [];
  checkRequiredFiles(root, version, errors);
  checkLegacyPaths(root, errors);
  checkMarkdownLinks(root, errors);
  return { errors, warnings: [] };
}

function parseArgs(args) {
  const options = { root: process.cwd(), version: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") {
      options.root = resolve(args[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (argument === "--version") {
      options.version = args[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--help") {
      process.stdout.write("Usage: node scripts/validation/check-docs.mjs [--root <repo>] [--version <x.y.z>]\n");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(join(options.root, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(`Unable to read valid package.json from ${options.root}`, { cause: error });
  }
  return { ...options, version: options.version ?? packageJson.version };
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = validateDocs(options);
    if (result.errors.length > 0) {
      for (const error of result.errors) console.error(`FAIL: ${error}`);
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `Documentation check passed: ${CURRENT_DOCUMENTS.length} current pages and v${options.version} evidence verified.\n`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

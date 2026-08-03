#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const skillsRoot = resolve(repoRoot, "skills");
const mapPath = resolve(repoRoot, "plugin-docs/skill-routing.md");
const optionalCapabilityPaths = new Map([["output-router", "capabilities/output-router/SKILL.md"]]);

const markdownLinks = (text) => [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1].split("#", 1)[0]);

const directoryEntries = await readdir(skillsRoot, { withFileTypes: true });
const skillEntries = directoryEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const skillNames = new Set(skillEntries);
const activeSkills = skillEntries;
const mapText = await readFile(mapPath, "utf8");

const rowPattern = /^\| \[`([^`]+)`\]\(\.\.\/skills\/([^/]+)\/SKILL\.md\) \| ([^|]*) \| ([^|]*) \| ([^|]*) \|$/gm;
const rows = new Map();
for (const match of mapText.matchAll(rowPattern)) {
  const [, label, pathName, ownerCell, routeCell, referenceCell] = match;
  if (label !== pathName) {
    throw new Error(`routing row label/path mismatch: ${label} -> ${pathName}`);
  }
  if (rows.has(pathName)) {
    throw new Error(`duplicate active routing row: ${pathName}`);
  }
  rows.set(pathName, { ownerCell, routeCell, referenceCell });
}

const failures = [];
const sorted = (values) => [...values].sort();
const difference = (left, right) => sorted([...left].filter((value) => !right.has(value)));

for (const skillName of activeSkills) {
  const row = rows.get(skillName);
  if (!row) {
    failures.push(`missing active routing row: ${skillName}`);
    continue;
  }

  const skillPath = resolve(skillsRoot, skillName, "SKILL.md");
  const skillText = await readFile(skillPath, "utf8");
  const links = markdownLinks(skillText).filter((target) => target && !target.includes("://"));

  const expectedRoutes = new Set();
  const expectedResources = new Set();
  for (const target of links) {
    const resolvedTarget = resolve(dirname(skillPath), target);
    const skillMatch = target.match(/(?:^|\/)\.\.\/([^/]+)\/SKILL\.md$/);
    if (skillMatch && skillNames.has(skillMatch[1])) {
      expectedRoutes.add(skillMatch[1]);
    } else if (!target.endsWith("SKILL.md")) {
      expectedResources.add(resolvedTarget);
    }
  }

  const documentedRoutes = new Set(
    [...row.routeCell.matchAll(/`([a-z0-9-]+)`/g)].map((match) => match[1]).filter((name) => skillNames.has(name)),
  );
  const documentedResources = new Set(
    markdownLinks(row.referenceCell)
      .filter((target) => target && !target.includes("://"))
      .map((target) => resolve(dirname(mapPath), target)),
  );

  const missingRoutes = difference(expectedRoutes, documentedRoutes);
  const extraRoutes = difference(documentedRoutes, expectedRoutes);
  const missingResources = difference(expectedResources, documentedResources);
  const extraResources = difference(documentedResources, expectedResources);

  if (missingRoutes.length) {
    failures.push(`${skillName}: missing routes: ${missingRoutes.join(", ")}`);
  }
  if (extraRoutes.length) {
    failures.push(`${skillName}: undocumented-by-skill routes: ${extraRoutes.join(", ")}`);
  }
  if (missingResources.length) {
    failures.push(`${skillName}: missing resources: ${missingResources.join(", ")}`);
  }
  if (extraResources.length) {
    failures.push(`${skillName}: undocumented-by-skill resources: ${extraResources.join(", ")}`);
  }
}

for (const rowName of rows.keys()) {
  if (!activeSkills.includes(rowName)) {
    failures.push(`unexpected active routing row: ${rowName}`);
  }
}

for (const [capabilityName, capabilityPath] of optionalCapabilityPaths) {
  if (!mapText.includes(`../${capabilityPath}`)) {
    failures.push(`missing optional capability package: ${capabilityName}`);
  }
}

if (failures.length) {
  for (const failure of failures) {
    process.stderr.write(`FAIL: ${failure}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `Skill routing doc check passed: ${activeSkills.length} active rows match declared sibling routes and direct resource dependencies; ${optionalCapabilityPaths.size} Pi-only capability package is classified separately.\n`,
);

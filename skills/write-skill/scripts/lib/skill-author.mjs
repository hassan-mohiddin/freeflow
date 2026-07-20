import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXTERNAL_LINK = /^[a-z][a-z0-9+.-]*:/i;
const YAML_NON_STRING =
  /^(?:~|null|true|false|[-+]?(?:\d[\d_]*(?:\.\d[\d_]*)?(?:e[-+]?\d+)?|\.inf|\.nan)|\d{4}-\d{2}-\d{2}(?:[Tt ].*)?)$/i;

export class SkillAuthorError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = "SkillAuthorError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function validateSkillName(name) {
  if (typeof name !== "string" || name.length < 1 || name.length > 64 || !SKILL_NAME.test(name)) {
    throw new SkillAuthorError(
      "invalid-name",
      "Skill name must be 1-64 lowercase letters, numbers, or single hyphen-separated segments",
      2,
    );
  }
}

export function validateDescription(description) {
  if (typeof description !== "string" || description.length < 1 || description.length > 1024) {
    throw new SkillAuthorError("invalid-description", "Description must be 1-1024 characters", 2);
  }
}

export async function initSkill({ directory, name, description }) {
  validateSkillName(name);
  validateDescription(description);

  const skillDirectory = path.resolve(directory);
  const skillFile = path.join(skillDirectory, "SKILL.md");
  const title = name
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  const contents = `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${title}\n`;

  await mkdir(skillDirectory, { recursive: true });
  try {
    await writeFile(skillFile, contents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new SkillAuthorError("skill-exists", `Refusing to overwrite existing skill file: ${skillFile}`);
    }
    throw error;
  }

  return {
    command: "init",
    status: "created",
    skillDirectory,
    skillFile,
    name,
  };
}

function toPortablePath(value) {
  return value.split(path.sep).join("/");
}

function relativePath(root, target) {
  return toPortablePath(path.relative(root, target));
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function errorFinding(code, source, message) {
  return { severity: "error", code, path: source, message };
}

function parseScalar(value) {
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? { value: parsed } : { error: "must be a string scalar" };
    } catch {
      return { error: "contains an invalid double-quoted scalar" };
    }
  }

  if (
    value.length === 0 ||
    YAML_NON_STRING.test(value) ||
    /^[-'?:,[\]{}#&*!|>%@`]/.test(value) ||
    value.includes(": ") ||
    value.includes(" #")
  ) {
    return { error: "uses unsupported compact scalar syntax; use a JSON-compatible double-quoted string" };
  }
  return { value };
}

function parseSkillDocument(contents) {
  const findings = [];
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(contents);
  if (!match) {
    return {
      frontmatter: {},
      body: contents,
      findings: [errorFinding("invalid-frontmatter", "SKILL.md", "SKILL.md must start with delimited frontmatter")],
    };
  }

  const frontmatter = {};
  for (const [index, line] of match[1].split(/\r?\n/).entries()) {
    if (line.trim() === "") continue;
    const field = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line);
    if (!field) {
      findings.push(
        errorFinding("unsupported-frontmatter", "SKILL.md", `Unsupported frontmatter syntax on line ${index + 2}`),
      );
      continue;
    }
    if (Object.hasOwn(frontmatter, field[1])) {
      findings.push(errorFinding("duplicate-frontmatter", "SKILL.md", `Duplicate frontmatter field: ${field[1]}`));
      continue;
    }
    const scalar = parseScalar(field[2]);
    if (scalar.error) {
      findings.push(errorFinding("unsupported-frontmatter", "SKILL.md", `${field[1]} ${scalar.error}`));
      continue;
    }
    frontmatter[field[1]] = scalar.value;
  }

  return {
    frontmatter,
    body: contents.slice(match[0].length),
    findings,
  };
}

function isEscaped(text, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function findUnescapedMarker(text, marker, start) {
  let index = text.indexOf(marker, start);
  while (index !== -1 && isEscaped(text, index)) index = text.indexOf(marker, index + marker.length);
  return index;
}

function maskInlineCode(line) {
  let masked = "";
  for (let index = 0; index < line.length;) {
    if (line[index] !== "`" || isEscaped(line, index)) {
      masked += line[index];
      index += 1;
      continue;
    }

    let markerLength = 1;
    while (line[index + markerLength] === "`") markerLength += 1;
    const marker = "`".repeat(markerLength);
    const closing = findUnescapedMarker(line, marker, index + markerLength);
    if (closing === -1) {
      masked += marker;
      index += markerLength;
      continue;
    }

    masked += " ".repeat(closing + markerLength - index);
    index = closing + markerLength;
  }
  return masked;
}

function openingFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
  return { marker: match[1][0], length: match[1].length };
}

function closesFence(line, fence) {
  const match = /^ {0,3}([`~]+)[ \t]*$/.exec(line);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

function normalizeReferenceLabel(label) {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function findClosingBracket(text, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "[") depth += 1;
    if (text[index] === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function skipHorizontalSpace(text, start) {
  let index = start;
  while (text[index] === " " || text[index] === "\t") index += 1;
  return index;
}

function readQuotedTitle(text, start) {
  const opener = text[start];
  if (opener !== '"' && opener !== "'" && opener !== "(") return null;
  const closer = opener === "(" ? ")" : opener;
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === closer) return index + 1;
  }
  return null;
}

function readLinkDestination(text, start, inline) {
  let index = skipHorizontalSpace(text, start);
  let destination = "";

  if (text[index] === "<") {
    const closing = text.indexOf(">", index + 1);
    if (closing === -1) return null;
    destination = text.slice(index + 1, closing);
    index = closing + 1;
  } else {
    const destinationStart = index;
    let depth = 0;
    for (; index < text.length; index += 1) {
      const character = text[index];
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === "(") {
        depth += 1;
        continue;
      }
      if (character === ")") {
        if (depth === 0 && inline) break;
        if (depth === 0) return null;
        depth -= 1;
        continue;
      }
      if ((character === " " || character === "\t") && depth === 0) break;
    }
    if (depth !== 0) return null;
    destination = text.slice(destinationStart, index);
  }

  const beforeSpace = index;
  index = skipHorizontalSpace(text, index);
  if (index > beforeSpace) {
    const afterTitle = readQuotedTitle(text, index);
    if (afterTitle !== null) index = skipHorizontalSpace(text, afterTitle);
  }

  if (inline) {
    if (text[index] !== ")") return null;
    return { destination, end: index + 1 };
  }
  if (index !== text.length || destination === "") return null;
  return { destination, end: index };
}

function readReferenceDefinition(line) {
  const match = /^ {0,3}\[([^\]]+)\]:[ \t]*(.*)$/.exec(line);
  if (!match) return null;
  const target = readLinkDestination(match[2], 0, false);
  if (!target) return null;
  return { label: normalizeReferenceLabel(match[1]), destination: target.destination };
}

function scanLineLinks(line, targets) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "[" || (index > 0 && line[index - 1] === "\\")) continue;
    const closing = findClosingBracket(line, index);
    if (closing === -1) continue;

    const label = line.slice(index + 1, closing);
    const next = line[closing + 1];
    if (next === "(") {
      const inline = readLinkDestination(line, closing + 2, true);
      if (inline) {
        targets.push({ destination: inline.destination });
        index = inline.end - 1;
      } else {
        index = closing;
      }
      continue;
    }

    if (next === "[") {
      const referenceClosing = findClosingBracket(line, closing + 1);
      if (referenceClosing !== -1) {
        const explicit = line.slice(closing + 2, referenceClosing);
        targets.push({ reference: normalizeReferenceLabel(explicit || label) });
        index = referenceClosing;
        continue;
      }
    }

    targets.push({ reference: normalizeReferenceLabel(label) });
    index = closing;
  }
}

function parseMarkdown(contents) {
  const definitions = new Map();
  const targets = [];
  let fence = null;
  let heading = null;
  let previousText = null;

  for (const line of contents.split(/\r?\n/)) {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }

    const opened = openingFence(line);
    if (opened) {
      fence = opened;
      previousText = null;
      continue;
    }

    const prose = maskInlineCode(line);
    if (!heading) {
      const atx = /^ {0,3}#[ \t]+(.+)$/.exec(prose);
      if (atx) {
        const text = atx[1].replace(/[ \t]+#+[ \t]*$/, "").trim();
        if (text) heading = `# ${text}`;
      } else if (/^ {0,3}=+[ \t]*$/.test(prose) && previousText) {
        heading = `# ${previousText}`;
      }
    }

    const definition = readReferenceDefinition(prose);
    if (definition) {
      if (!definitions.has(definition.label)) definitions.set(definition.label, definition.destination);
      previousText = null;
      continue;
    }

    scanLineLinks(prose, targets);
    previousText = prose.trim() || null;
  }

  const links = [];
  for (const target of targets) {
    if (Object.hasOwn(target, "destination")) {
      links.push(target.destination);
    } else if (definitions.has(target.reference)) {
      links.push(definitions.get(target.reference));
    }
  }
  return { heading, links };
}

function validateDocument(document) {
  const findings = [...document.findings];
  try {
    validateSkillName(document.frontmatter.name);
  } catch (error) {
    findings.push(errorFinding("invalid-name", "SKILL.md", error.message));
  }
  try {
    validateDescription(document.frontmatter.description);
  } catch (error) {
    findings.push(errorFinding("invalid-description", "SKILL.md", error.message));
  }

  const heading = parseMarkdown(document.body).heading;
  if (!heading) {
    findings.push(errorFinding("missing-heading", "SKILL.md", "Skill body must contain a top-level heading"));
  }
  return { findings, heading };
}

function markdownLinks(contents) {
  const links = [];
  for (let target of parseMarkdown(contents).links) {
    target = target.trim();
    if (!target || target.startsWith("#") || EXTERNAL_LINK.test(target)) continue;
    target = target.split("#", 1)[0];
    try {
      links.push(decodeURIComponent(target));
    } catch {
      links.push(target);
    }
  }
  return links;
}

async function fileResource(file, displayPath) {
  await access(file, fsConstants.R_OK);
  const stats = await lstat(file);
  if (!stats.isFile() && !stats.isSymbolicLink()) {
    throw new Error("resource is not a file");
  }
  const contents = await readFile(file);
  return { path: displayPath, bytes: contents.byteLength, contents: contents.toString("utf8") };
}

async function walkFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, entryPath)));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      const stats = await lstat(entryPath);
      files.push({ path: relativePath(root, entryPath), bytes: stats.size });
    }
  }
  return files;
}

async function inspectResources({ skillDirectory, packageRoot, canonicalSkill, canonicalPackage, body, findings }) {
  const localReferences = new Map();
  const packageDependencies = new Map();
  const visitedMarkdown = new Set();

  async function followMarkdown(sourceFile, sourceContents) {
    const canonicalSource = await realpath(sourceFile);
    if (visitedMarkdown.has(canonicalSource)) return;
    visitedMarkdown.add(canonicalSource);

    for (const linkedTarget of markdownLinks(sourceContents)) {
      const lexicalTarget = path.resolve(path.dirname(sourceFile), linkedTarget);
      const source = relativePath(skillDirectory, sourceFile);
      if (!isContained(packageRoot, lexicalTarget)) {
        findings.push(errorFinding("package-escape", source, `Linked resource escapes package: ${linkedTarget}`));
        continue;
      }

      const local = isContained(skillDirectory, lexicalTarget);
      let canonicalTarget;
      try {
        canonicalTarget = await realpath(lexicalTarget);
      } catch {
        findings.push(errorFinding("missing-resource", source, `Linked resource is missing: ${linkedTarget}`));
        continue;
      }

      const canonicalBoundary = local ? canonicalSkill : canonicalPackage;
      if (!isContained(canonicalBoundary, canonicalTarget)) {
        findings.push(
          errorFinding(
            local ? "local-symlink-escape" : "package-symlink-escape",
            source,
            `Linked resource escapes its canonical boundary: ${linkedTarget}`,
          ),
        );
        continue;
      }

      const displayPath = relativePath(skillDirectory, lexicalTarget);
      let resource;
      try {
        resource = await fileResource(lexicalTarget, displayPath);
      } catch {
        findings.push(
          errorFinding("unreadable-resource", source, `Linked resource is not a readable file: ${linkedTarget}`),
        );
        continue;
      }

      if (local) {
        localReferences.set(displayPath, { path: resource.path, bytes: resource.bytes });
        if (path.extname(lexicalTarget).toLowerCase() === ".md") {
          await followMarkdown(lexicalTarget, resource.contents);
        }
      } else {
        packageDependencies.set(displayPath, { path: resource.path, bytes: resource.bytes });
      }
    }
  }

  await followMarkdown(path.join(skillDirectory, "SKILL.md"), body);
  const allFiles = await walkFiles(skillDirectory);
  const linkedFiles = new Set(localReferences.keys());
  const scripts = allFiles.filter((file) => file.path.startsWith("scripts/"));
  const unlinkedFiles = allFiles.filter((file) => file.path !== "SKILL.md" && !linkedFiles.has(file.path));

  return {
    localReferences: [...localReferences.values()].sort((left, right) => left.path.localeCompare(right.path)),
    packageDependencies: [...packageDependencies.values()].sort((left, right) => left.path.localeCompare(right.path)),
    scripts: scripts.sort((left, right) => left.path.localeCompare(right.path)),
    unlinkedFiles: unlinkedFiles.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

async function findPackageRoot(skillDirectory) {
  const fallback = path.dirname(skillDirectory);
  let candidate = fallback;
  while (true) {
    try {
      await access(path.join(candidate, "package.json"), fsConstants.R_OK);
      return candidate;
    } catch {
      const parent = path.dirname(candidate);
      if (parent === candidate) return fallback;
      candidate = parent;
    }
  }
}

async function analyzeSkill(directory, packageDirectory) {
  const skillDirectory = path.resolve(directory);
  const packageRoot = packageDirectory ? path.resolve(packageDirectory) : await findPackageRoot(skillDirectory);
  const findings = [];

  if (!isContained(packageRoot, skillDirectory)) {
    findings.push(errorFinding("skill-package-escape", ".", "Skill directory must be contained by the package root"));
    return {
      skillDirectory,
      packageRoot,
      frontmatter: {},
      heading: null,
      body: "",
      resources: emptyResources(),
      findings,
    };
  }

  let canonicalPackage;
  let canonicalSkill;
  let canonicalSkillFile;
  let contents;
  try {
    [canonicalPackage, canonicalSkill, canonicalSkillFile, contents] = await Promise.all([
      realpath(packageRoot),
      realpath(skillDirectory),
      realpath(path.join(skillDirectory, "SKILL.md")),
      readFile(path.join(skillDirectory, "SKILL.md"), "utf8"),
    ]);
  } catch {
    findings.push(errorFinding("unreadable-skill", "SKILL.md", "Skill directory and SKILL.md must be readable"));
    return {
      skillDirectory,
      packageRoot,
      frontmatter: {},
      heading: null,
      body: "",
      resources: emptyResources(),
      findings,
    };
  }

  if (!isContained(canonicalPackage, canonicalSkill)) {
    findings.push(errorFinding("skill-symlink-escape", ".", "Skill directory escapes the canonical package root"));
    return {
      skillDirectory,
      packageRoot,
      frontmatter: {},
      heading: null,
      body: "",
      resources: emptyResources(),
      findings,
    };
  }
  if (!isContained(canonicalSkill, canonicalSkillFile)) {
    findings.push(
      errorFinding("skill-file-symlink-escape", "SKILL.md", "SKILL.md escapes the canonical skill directory"),
    );
    return {
      skillDirectory,
      packageRoot,
      frontmatter: {},
      heading: null,
      body: "",
      resources: emptyResources(),
      findings,
    };
  }

  const document = parseSkillDocument(contents);
  const validation = validateDocument(document);
  findings.push(...validation.findings);
  const resources = await inspectResources({
    skillDirectory,
    packageRoot,
    canonicalSkill,
    canonicalPackage,
    body: document.body,
    findings,
  });

  return {
    skillDirectory,
    packageRoot,
    frontmatter: document.frontmatter,
    heading: validation.heading,
    body: document.body,
    resources,
    findings,
  };
}

function emptyResources() {
  return { localReferences: [], packageDependencies: [], scripts: [], unlinkedFiles: [] };
}

export async function validateSkill({ directory, packageRoot }) {
  const analysis = await analyzeSkill(directory, packageRoot);
  return {
    command: "validate",
    status: analysis.findings.some((finding) => finding.severity === "error") ? "invalid" : "valid",
    skillDirectory: analysis.skillDirectory,
    packageRoot: analysis.packageRoot,
    frontmatter: analysis.frontmatter,
    heading: analysis.heading,
    resources: analysis.resources,
    findings: analysis.findings,
  };
}

export async function inspectSkill({ directory, packageRoot }) {
  const analysis = await analyzeSkill(directory, packageRoot);
  const invalid = analysis.findings.some((finding) => finding.severity === "error");
  return {
    command: "inspect",
    status: invalid ? "invalid" : "ok",
    skillDirectory: analysis.skillDirectory,
    packageRoot: analysis.packageRoot,
    skill: {
      name: analysis.frontmatter.name ?? null,
      description: analysis.frontmatter.description ?? null,
      heading: analysis.heading,
      bodyBytes: Buffer.byteLength(analysis.body, "utf8"),
    },
    resources: analysis.resources,
    findings: analysis.findings,
  };
}

import { normalizeUnreleasedBody } from "./changelog-utils.mjs";

export { normalizeUnreleasedBody } from "./changelog-utils.mjs";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value).trim());
  if (!match) {
    throw new Error(`Expected a stable semantic version (x.y.z), got: ${value}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    version: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

export function resolveReleaseVersion(currentVersion, target) {
  const current = parseVersion(currentVersion);
  if (target === "major" || target === "minor" || target === "patch") {
    const next = { ...current };
    if (target === "major") {
      next.major += 1;
      next.minor = 0;
      next.patch = 0;
    } else if (target === "minor") {
      next.minor += 1;
      next.patch = 0;
    } else {
      next.patch += 1;
    }
    return `${next.major}.${next.minor}.${next.patch}`;
  }

  const explicit = parseVersion(target);
  const currentNumber = current.major * 1_000_000 + current.minor * 1_000 + current.patch;
  const explicitNumber = explicit.major * 1_000_000 + explicit.minor * 1_000 + explicit.patch;
  if (explicitNumber <= currentNumber) {
    throw new Error(`Release version ${explicit.version} must be greater than current version ${current.version}`);
  }
  return explicit.version;
}

export function extractChangelogSection(markdown, version) {
  const normalizedVersion = parseVersion(version).version;
  const headingPattern = new RegExp(
    `^##\\s+\\[?${escapeRegExp(normalizedVersion)}\\]?(?:\\s+-\\s+\\d{4}-\\d{2}-\\d{2})?\\s*$`,
    "m",
  );
  const heading = headingPattern.exec(markdown);
  if (!heading) {
    throw new Error(`Changelog section not found for ${normalizedVersion}`);
  }

  const sectionStart = heading.index + heading[0].length;
  const remainder = markdown.slice(sectionStart);
  const nextHeading = remainder.search(/^##\s+/m);
  const section = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
  return section.trim();
}

export function prepareChangelog(markdown, version, date) {
  const normalizedVersion = parseVersion(version).version;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Release date must use YYYY-MM-DD, got: ${date}`);
  }

  const unreleasedPattern = /^##\s+(\[)?Unreleased(\])?\s*$/m;
  const heading = unreleasedPattern.exec(markdown);
  if (!heading) {
    throw new Error("CHANGELOG.md must contain an Unreleased section");
  }

  const sectionStart = heading.index + heading[0].length;
  const remainder = markdown.slice(sectionStart);
  const nextHeading = remainder.search(/^##\s+/m);
  const body = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
  const normalizedBody = normalizeUnreleasedBody(body);
  const after = nextHeading === -1 ? "" : remainder.slice(nextHeading);
  const bracketed = heading[1] === "[" && heading[2] === "]";
  const unreleasedLabel = bracketed ? "[Unreleased]" : "Unreleased";
  const releaseLabel = bracketed ? `[${normalizedVersion}]` : normalizedVersion;
  const prefix = markdown.slice(0, heading.index);
  return `${prefix}## ${unreleasedLabel}\n\n## ${releaseLabel} - ${date}\n\n${normalizedBody}${after ? `\n\n${after}` : "\n"}`;
}

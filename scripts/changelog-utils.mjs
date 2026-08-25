export const CHANGELOG_CATEGORIES = Object.freeze(["Breaking Changes", "Added", "Changed", "Fixed", "Removed"]);

const CATEGORY_INDEX = new Map(CHANGELOG_CATEGORIES.map((category, index) => [category, index]));

function normalizeLineEndings(value) {
  return String(value).replace(/\r\n?/g, "\n");
}

function isUnreleasedHeading(title) {
  return /^\[?Unreleased\]?$/.test(title.trim());
}

export function extractUnreleasedSection(markdown) {
  const text = normalizeLineEndings(markdown);
  const headingPattern = /^##\s+(?:\[)?Unreleased(?:\])?\s*$/m;
  const heading = headingPattern.exec(text);
  if (!heading) return null;

  const sectionStart = heading.index + heading[0].length;
  const remainder = text.slice(sectionStart);
  const nextHeading = remainder.search(/^##\s+/m);
  const body = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
  return body.trim();
}

export function extractReleasedSections(markdown) {
  const text = String(markdown);
  const headings = [...text.matchAll(/^##\s+(.+?)\s*$/gm)];
  return headings
    .filter((heading) => !isUnreleasedHeading(heading[1]))
    .map((heading) => {
      const headingIndex = headings.indexOf(heading);
      const nextHeading = headings[headingIndex + 1];
      const end = nextHeading ? nextHeading.index : text.length;
      return text.slice(heading.index, end);
    });
}

export function releasedSectionsEqual(current, base) {
  const sectionTitle = (section) =>
    section
      .split(/\r?\n/, 1)[0]
      .replace(/^##\s+/, "")
      .trim();
  const sectionsByTitle = (markdown) => {
    const sections = extractReleasedSections(markdown);
    const result = new Map(sections.map((section) => [sectionTitle(section), section]));
    return result.size === sections.length ? result : null;
  };

  const currentSections = sectionsByTitle(current);
  const baseSections = sectionsByTitle(base);
  if (!currentSections || !baseSections) return false;
  for (const [title, section] of baseSections) {
    if (currentSections.get(title) !== section) return false;
  }
  return true;
}

export function parseCategorizedBody(body, { enforceOrder = true } = {}) {
  const text = normalizeLineEndings(body).trim();
  const errors = [];
  const entries = new Map(CHANGELOG_CATEGORIES.map((category) => [category, []]));
  const seen = new Set();
  let currentCategory;
  let lastCategoryIndex = -1;

  if (!text) {
    return { errors: ["CHANGELOG.md Unreleased section is empty."], entries };
  }

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;

    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const category = heading[1].trim();
      const categoryIndex = CATEGORY_INDEX.get(category);
      if (categoryIndex === undefined) {
        errors.push(`Unknown changelog category: ${category}.`);
        currentCategory = undefined;
        continue;
      }
      if (seen.has(category)) errors.push(`Duplicate changelog category: ${category}.`);
      if (enforceOrder && categoryIndex < lastCategoryIndex) {
        errors.push(`Changelog categories must use canonical order; ${category} is out of order.`);
      }
      seen.add(category);
      currentCategory = category;
      lastCategoryIndex = Math.max(lastCategoryIndex, categoryIndex);
      continue;
    }

    if (!currentCategory) {
      errors.push("Uncategorized changelog content must appear under a canonical category.");
      continue;
    }
    if (!/^\s*-\s+\S/.test(line)) {
      errors.push(`Changelog entries under ${currentCategory} must be bullet items.`);
      continue;
    }
    entries.get(currentCategory).push(line.trim());
  }

  if (seen.size === 0) errors.push("Unreleased must contain at least one canonical category.");
  for (const category of seen) {
    if (entries.get(category).length === 0) errors.push(`Changelog category ${category} must contain a bullet item.`);
  }

  return { errors, entries };
}

export function validateChangelogStructure(markdown) {
  const body = extractUnreleasedSection(markdown);
  if (body === null) return { errors: ["CHANGELOG.md must contain a ## Unreleased section."] };
  if (body === "") return { errors: [] };
  return { errors: parseCategorizedBody(body).errors };
}

export function normalizeUnreleasedBody(body) {
  const parsed = parseCategorizedBody(body, { enforceOrder: false });
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join(" "));

  return CHANGELOG_CATEGORIES.filter((category) => parsed.entries.get(category).length > 0)
    .map((category) => `### ${category}\n\n${parsed.entries.get(category).join("\n")}`)
    .join("\n\n");
}

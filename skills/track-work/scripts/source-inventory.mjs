import { readFile } from "node:fs/promises";
import { sha256 } from "./model.mjs";

const TOP_SECTIONS = new Set(["Current Context", "Current Work", "Proposed Slices", "History", "Notes"]);
const HISTORY_GROUPS = new Set(["Decisions", "Checkpoints", "Slices", "Blockers", "Evidence", "Corrections"]);
const PREFIX_KINDS = {
  T: "task",
  CTX: "context",
  BND: "boundary",
  P: "proposal",
  S: "slice",
  X: "extension",
  D: "decision",
  C: "checkpoint",
  E: "evidence",
  B: "blocker",
  N: "note",
};

function heading(line) {
  const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
  return match ? { level: match[1].length, title: match[2] } : null;
}

function lineText(unit) {
  return unit.text.replace(/\r?\n$/, "").replace(/\r$/, "");
}

function kindFromId(id) {
  const prefix = /^([A-Z]+)-\d{3,}$/.exec(id)?.[1];
  return prefix ? (PREFIX_KINDS[prefix] ?? null) : null;
}

function identity(title) {
  const match = /^([A-Z]+-\d{3,})(?:\s+—\s+(.+))?$/.exec(title);
  if (!match) return { id: null, title };
  return { id: match[1], title: match[2] ?? null };
}

function addIssue(issues, code, message, unit, details = {}) {
  issues.push({ code, message, line: unit.line, unitId: unit.unitId, ...details });
}

export function sourceUnits(text) {
  if (typeof text !== "string") throw new TypeError("Source inventory input must be text");
  const chunks = text.split(/(?<=\n)/);
  let offset = 0;
  return chunks.map((chunk, index) => {
    const startByte = offset;
    offset += Buffer.byteLength(chunk, "utf8");
    const content = lineText({ text: chunk });
    return {
      unitId: `U-${String(index + 1).padStart(3, "0")}`,
      startByte,
      endByte: offset,
      sourceSha256: sha256(chunk),
      kind: content.trim() ? "content" : "blank",
      line: index + 1,
      text: chunk,
      content,
    };
  });
}

function schemaInfo(units, headings) {
  const firstSection = headings.find((item) => item.heading.level === 2)?.index ?? units.length;
  const schemaUnit = units
    .slice(0, firstSection)
    .find((unit) => /^(?:Schema|schema-version):\s*\d+\s*$/.test(unit.content));
  const version = schemaUnit ? Number(/\d+/.exec(schemaUnit.content)[0]) : null;
  const kind = version === null ? "legacy" : version === 2 ? "schema-v2" : "unsupported";
  return {
    kind,
    version,
    line: schemaUnit?.line ?? null,
    unitId: schemaUnit?.unitId ?? null,
    headerEndIndex: firstSection,
  };
}

function rangeForHeading(units, headings, index) {
  const current = headings[index];
  const nextHeading = headings.find(
    (item, nextIndex) => nextIndex > index && item.heading.level <= current.heading.level,
  );
  const lastIndex = nextHeading ? nextHeading.index - 1 : units.length - 1;
  const start = units[current.index];
  const end = units[lastIndex] ?? start;
  return {
    endIndex: lastIndex,
    startLine: start.line,
    endLine: end.line,
    startByte: start.startByte,
    endByte: end.endByte,
    sourceUnitIds: units.slice(current.index, lastIndex + 1).map((unit) => unit.unitId),
  };
}

function addEntity(entities, seen, entity, issues, unit) {
  const key = entity.id ? `${entity.kind}:${entity.id}` : `${entity.kind}:${entity.title ?? ""}`;
  if (!entity.projectionOnly && seen.has(key))
    addIssue(issues, "duplicate-entity", `Duplicate ${key}`, unit, { entityKey: key });
  if (!entity.projectionOnly) seen.add(key);
  entities.push(entity);
}

function entityFromHeading(units, headings, index, section, group, issues, seen, entities) {
  const item = headings[index];
  const range = rangeForHeading(units, headings, index);
  let headingTitle = item.heading.title;
  const currentSliceHeading = /^Current Slice\s+([A-Z]+-\d{3,})$/.exec(headingTitle);
  const noteHeading = /^Note\s+([A-Z]+-\d{3,})$/.exec(headingTitle);
  if (currentSliceHeading) headingTitle = currentSliceHeading[1];
  if (noteHeading) headingTitle = noteHeading[1];
  const parsed = identity(headingTitle);
  let kind = null;
  if (section === "Proposed Slices" && item.heading.level === 3) kind = "proposal";
  else if (section === "Notes" && item.heading.level === 3) kind = "note";
  else if (section === "History" && item.heading.level === 4 && HISTORY_GROUPS.has(group))
    kind = {
      Decisions: "decision",
      Checkpoints: "checkpoint",
      Slices: "slice",
      Blockers: "blocker",
      Evidence: "evidence",
      Corrections: "correction",
    }[group];
  else if (parsed.id) kind = kindFromId(parsed.id);
  if (!kind) return;
  const entity = {
    kind,
    id: parsed.id,
    title: parsed.title ?? (parsed.id ? item.heading.title : item.heading.title),
    section,
    group: group || null,
    representation: "heading",
    ...range,
    sourceSha256: sha256(
      units
        .slice(item.index, range.endIndex + 1)
        .map((unit) => unit.text)
        .join(""),
    ),
  };
  addEntity(entities, seen, entity, issues, units[item.index]);
}

function embeddedJson(line, { lifecycleLabel = false, continuation = false } = {}) {
  const start = line.search(/[[{]/);
  if (start < 0) return null;
  const colon = line.indexOf(":");
  const prefix = line.slice(0, start);
  const isLabeled = colon >= 0 && start > colon;
  const isContinuation = /^\s*(?:-\s*)+[[{]/.test(line);
  if ((!isLabeled || !lifecycleLabel) && (!isContinuation || !continuation)) return null;
  const raw = line.slice(start).trim();
  try {
    return { value: JSON.parse(raw), start };
  } catch {
    return { malformed: true, start };
  }
}

export function inventoryText(text, { sourcePath = null } = {}) {
  const units = sourceUnits(text);
  const headings = units.flatMap((unit, index) => {
    const found = heading(unit.content);
    return found ? [{ index, heading: found }] : [];
  });
  const schema = schemaInfo(units, headings);
  const issues = [];
  const sections = [];
  const entities = [];
  const seen = new Set();
  let section = null;
  let group = null;
  const owners = [];
  let lifecycleContinuation = false;

  for (const [index, unit] of units.entries()) {
    const found = heading(unit.content);
    if (found) {
      if (found.level === 2) {
        if (section) {
          const prior = sections.at(-1);
          prior.endLine = unit.line - 1;
          prior.endByte = unit.startByte;
        }
        section = found.title;
        group = null;
        sections.push({
          title: section,
          recognized: TOP_SECTIONS.has(section),
          startLine: unit.line,
          endLine: unit.line,
          startByte: unit.startByte,
          endByte: unit.endByte,
        });
        if (!TOP_SECTIONS.has(section))
          addIssue(issues, "unknown-section", `Unknown top-level section: ${section}`, unit);
      } else if (found.level === 3) {
        group = found.title;
        if (section === "History" && !HISTORY_GROUPS.has(group))
          addIssue(issues, "unknown-group", `Unknown History group: ${group}`, unit);
        if (section === "Current Work" && group === "Current Slice") {
          const range = rangeForHeading(
            units,
            headings,
            headings.findIndex((item) => item.index === index),
          );
          const block = units.slice(index + 1, range.endIndex + 1);
          const id = block
            .find((item) => /^(?:-\s*)?ID:\s*S-\d{3,}\s*$/.test(item.content))
            ?.content.match(/S-\d{3,}/)?.[0];
          const title = block
            .find((item) => /^(?:-\s*)?Title:\s*/.test(item.content))
            ?.content.replace(/^(?:-\s*)?Title:\s*/, "");
          if (id && title)
            addEntity(
              entities,
              seen,
              {
                kind: "slice",
                id,
                title,
                section,
                group,
                representation: "current",
                ...range,
                sourceSha256: sha256(
                  units
                    .slice(index, range.endIndex + 1)
                    .map((item) => item.text)
                    .join(""),
                ),
              },
              issues,
              unit,
            );
        } else
          entityFromHeading(
            units,
            headings,
            headings.findIndex((item) => item.index === index),
            section,
            group,
            issues,
            seen,
            entities,
          );
      } else if (found.level === 4) {
        entityFromHeading(
          units,
          headings,
          headings.findIndex((item) => item.index === index),
          section,
          group,
          issues,
          seen,
          entities,
        );
      }
    }

    const body = unit.content;
    const afterHeader = index >= schema.headerEndIndex;
    if (afterHeader && /\bSchema:\s*\d+\b/.test(body))
      addIssue(issues, "header-like-body", "Schema-like metadata occurs outside the header", unit);

    let owner = section;
    if (section === "History" && group && !HISTORY_GROUPS.has(group)) owner = null;
    if (
      !section &&
      body.trim() &&
      !/^(?:# Working Record:|Task ID:|Schema:|State:|State source:|Created at:|Last updated:)/.test(body)
    ) {
      addIssue(issues, "unowned-content", "Content occurs outside a recognized section", unit);
      owner = null;
    } else if (section && !TOP_SECTIONS.has(section) && body.trim() && !found) {
      addIssue(issues, "unowned-content", "Content occurs under an unknown section", unit);
      owner = null;
    } else if (section === "History" && group && !HISTORY_GROUPS.has(group) && body.trim() && !found) {
      addIssue(issues, "unowned-content", "Content occurs under an unknown History group", unit);
    }

    const lifecycleLabel =
      /^\s*[-*]\s*(blocker(?: and required resolution)?|reopen history|checkpoint(?: history)?|evidence(?: history)?|decision(?: history)?|slice(?: history)?):/i.exec(
        body,
      );
    const json = embeddedJson(body, { lifecycleLabel: Boolean(lifecycleLabel), continuation: lifecycleContinuation });
    const continuation = lifecycleContinuation && /^\s*(?:-\s*)+[[{]/.test(body);
    if (json) {
      const prefix = lifecycleLabel?.[1]?.toLowerCase() ?? "lifecycle continuation";
      if (json.malformed) addIssue(issues, "malformed-lifecycle", "Lifecycle JSON is malformed", unit);
      else {
        addIssue(issues, "embedded-json", "Lifecycle semantics are embedded as JSON", unit, { field: prefix.trim() });
        const embeddedKind = prefix.includes("blocker")
          ? "blocker"
          : prefix.includes("reopen")
            ? "reopen"
            : prefix.includes("checkpoint")
              ? "checkpoint"
              : prefix.includes("evidence")
                ? "evidence"
                : null;
        if (embeddedKind && !continuation) {
          const embeddedId = typeof json.value?.id === "string" ? json.value.id : null;
          entities.push({
            kind: embeddedKind,
            id: embeddedId,
            title: prefix.trim(),
            section,
            group: group || null,
            representation: "embedded-json",
            projectionOnly: false,
            startLine: unit.line,
            endLine: unit.line,
            startByte: unit.startByte,
            endByte: unit.endByte,
            sourceUnitIds: [unit.unitId],
            sourceSha256: unit.sourceSha256,
          });
        }
      }
    }
    if (lifecycleLabel) lifecycleContinuation = true;
    else if (!continuation) lifecycleContinuation = false;

    if (section === "Current Context" && group === "Active Decisions") {
      const projection = /^\s*[-*]\s+([A-Z]+-\d{3,})(?:\s+—\s+(.+))?$/.exec(body);
      if (projection)
        addEntity(
          entities,
          seen,
          {
            kind: kindFromId(projection[1]) ?? "entity",
            id: projection[1],
            title: projection[2] ?? projection[1],
            section,
            group,
            representation: "projection",
            projectionOnly: true,
            startLine: unit.line,
            endLine: unit.line,
            startByte: unit.startByte,
            endByte: unit.endByte,
            sourceUnitIds: [unit.unitId],
            sourceSha256: unit.sourceSha256,
          },
          issues,
          unit,
        );
    }
    owners.push({
      unitId: unit.unitId,
      line: unit.line,
      owner,
      section,
      group,
      structural: Boolean(found),
      recognized: found ? (found.level === 2 ? TOP_SECTIONS.has(found.title) : true) : false,
    });
  }
  if (section) {
    const prior = sections.at(-1);
    prior.endLine = units.at(-1)?.line ?? prior.startLine;
    prior.endByte = units.at(-1)?.endByte ?? prior.endByte;
  }
  for (const unit of units.slice(0, schema.headerEndIndex)) {
    if (
      /^Schema:\s*\d+\s*$/.test(unit.content) ||
      /^(?:# Working Record:|Task ID:|State:|State source:|Created at:|Last updated:)/.test(unit.content) ||
      !unit.content.trim()
    )
      continue;
  }
  const contentUnits = units.filter((unit) => unit.kind === "content").length;
  const canonicalEntities = entities.filter((entity) => !entity.projectionOnly);
  const projectionEntities = entities.filter((entity) => entity.projectionOnly);
  const countByKind = (values) =>
    Object.fromEntries(
      [...new Set(values.map((entity) => entity.kind))]
        .sort()
        .map((kind) => [kind, values.filter((entity) => entity.kind === kind).length]),
    );
  return {
    sourcePath,
    sourceSha256: sha256(text),
    bytes: Buffer.byteLength(text, "utf8"),
    lineCount: units.length,
    schema: { kind: schema.kind, version: schema.version, line: schema.line, unitId: schema.unitId },
    sections,
    entities,
    entityCounts: {
      canonical: canonicalEntities.length,
      projections: projectionEntities.length,
      canonicalByKind: countByKind(canonicalEntities),
      projectionsByKind: countByKind(projectionEntities),
    },
    owners,
    sourceUnits: units,
    coverage: {
      unitCount: units.length,
      contentUnits,
      blankUnits: units.length - contentUnits,
      startByte: 0,
      endByte: units.at(-1)?.endByte ?? 0,
      sourceSha256: sha256(text),
    },
    issues,
  };
}

function reportText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ");
}

export function renderInventoryReport(inventories) {
  if (!Array.isArray(inventories)) throw new TypeError("Inventory report input must be an array");
  const sections = inventories.map((inventory) => {
    const entityLines = inventory.entities.length
      ? inventory.entities
          .map(
            (entity) =>
              `- [${entity.projectionOnly ? "projection" : "canonical"}] ${entity.kind}: ${entity.id ?? reportText(entity.title)}`,
          )
          .join("\n")
      : "[none]";
    const issueLines = inventory.issues.length
      ? inventory.issues.map((issue) => `- ${issue.code} at line ${issue.line} (${issue.unitId})`).join("\n")
      : "[none]";
    const sectionLines = inventory.sections.length
      ? inventory.sections
          .map((section) => `- ${reportText(section.title)}: lines ${section.startLine}-${section.endLine}`)
          .join("\n")
      : "[none]";
    return [
      `## ${reportText(inventory.sourcePath ?? "inline source")}`,
      `- Representation: ${inventory.schema.kind}${inventory.schema.version === null ? "" : ` (schema ${inventory.schema.version})`}`,
      `- Bytes: ${inventory.bytes}`,
      `- Source SHA-256: ${inventory.sourceSha256}`,
      `- Source units: ${inventory.coverage.unitCount} (${inventory.coverage.contentUnits} content, ${inventory.coverage.blankUnits} blank)`,
      `- Entity counts: ${inventory.entityCounts.canonical} canonical, ${inventory.entityCounts.projections} projections`,
      "",
      "### Sections",
      sectionLines,
      "",
      "### Entities",
      entityLines,
      "",
      "### Issues",
      issueLines,
    ].join("\n");
  });
  return [
    "# Track Work source inventory",
    "",
    "Read-only source coverage and migration-planning evidence; canonical records were not modified.",
    "",
    ...sections,
    "",
  ].join("\n");
}

export async function inventoryFile(path) {
  const text = await readFile(path, "utf8");
  return inventoryText(text, { sourcePath: path });
}

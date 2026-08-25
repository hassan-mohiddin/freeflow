import { Buffer } from "node:buffer";
import { sha256 } from "./model.mjs";

export function sourceUnits(text) {
  const chunks = text.split(/(?<=\n)/);
  let offset = 0;
  return chunks.map((chunk, index) => {
    const startByte = offset;
    offset += Buffer.byteLength(chunk, "utf8");
    const content = chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk;
    return {
      unitId: `U-${String(index + 1).padStart(3, "0")}`,
      startByte,
      endByte: offset,
      sourceSha256: sha256(chunk),
      kind: content.trim() ? "content" : "blank",
      line: index + 1,
      text: chunk,
    };
  });
}

export function publicSourceUnits(text) {
  return sourceUnits(text).map(({ text: _text, ...unit }) => unit);
}

export function sourceEntities(text) {
  const entities = [];
  let section = "";
  let group = "";
  for (const line of text.split(/\r\n?|\n/)) {
    const match = /^(#{1,4})[ \t]+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const level = match[1].length;
    const title = match[2];
    if (level === 2) {
      section = title;
      group = "";
      continue;
    }
    if (level === 3) {
      group = title;
      if (section === "Proposed Slices") entities.push({ key: `proposal:${title}` });
      else if (section === "Notes") entities.push({ key: `note:${title}` });
      continue;
    }
    if (level !== 4 || section !== "History" || !["Decisions", "Checkpoints", "Slices"].includes(group)) continue;
    const idMatch = /^([A-Z]-\d{3,})\s+—\s+(.+)$/.exec(title);
    const kind = group === "Decisions" ? "decision" : group === "Checkpoints" ? "checkpoint" : "slice";
    const identity = idMatch ? `${idMatch[1]}|${idMatch[2]}` : title;
    entities.push({ key: `${kind}:${identity}` });
  }
  return entities;
}

export function sourceUnitOwners(text) {
  const owners = new Map();
  const topSections = new Set(["Current Context", "Current Work", "Proposed Slices", "History", "Notes"]);
  const contextHeadings = new Set([
    "Goal",
    "What defines this task",
    "Settled",
    "Tentative",
    "Open",
    "Current direction",
    "Boundaries",
    "Active Decisions",
  ]);
  const workHeadings = new Set([
    "Current route",
    "Current Slice",
    "Blockers",
    "Upcoming checkpoints",
    "Next useful action",
  ]);
  const historyGroups = new Set(["Decisions", "Checkpoints", "Slices"]);
  let section = "";
  let group = "";
  let owner = null;
  for (const unit of sourceUnits(text)) {
    const line = unit.text.endsWith("\n") ? unit.text.slice(0, -1) : unit.text;
    const match = /^(#{1,4})[ \t]+(.+?)\s*$/.exec(line);
    if (match) {
      const level = match[1].length;
      const title = match[2];
      let recognized = false;
      if (level === 1) {
        owner = "taskName";
        recognized = /^Working Record:\s+/.test(title);
      } else if (level === 2) {
        section = title;
        group = "";
        owner = section === "Current Context" ? "currentContext" : section === "Current Work" ? "currentWork" : null;
        recognized = topSections.has(section);
      } else if (level === 3) {
        group = title;
        if (section === "Current Context") {
          owner = "currentContext";
          recognized = contextHeadings.has(title);
        } else if (section === "Current Work") {
          owner = title === "Current Slice" ? "currentWork.currentSlice" : "currentWork";
          recognized = workHeadings.has(title);
        } else if (section === "Proposed Slices") {
          owner = `proposals[title=${JSON.stringify(title)}]`;
          recognized = true;
        } else if (section === "Notes") {
          owner = `notes[title=${JSON.stringify(title)}]`;
          recognized = true;
        } else if (section === "History") {
          owner = `history.${title.toLowerCase()}`;
          recognized = historyGroups.has(title);
        }
      } else if (level === 4 && section === "History" && historyGroups.has(group)) {
        const idMatch = /^([A-Z]-\d{3,})\s+—\s+(.+)$/.exec(title);
        if (group === "Decisions")
          owner = `history.decisions[${idMatch ? `id=${JSON.stringify(idMatch[1])}` : `title=${JSON.stringify(title)}`}]`;
        else if (group === "Slices")
          owner = `history.slices[${idMatch ? `id=${JSON.stringify(idMatch[1])}` : `title=${JSON.stringify(title)}`}]`;
        else
          owner = `history.checkpoints[${idMatch ? `id=${JSON.stringify(idMatch[1])}` : `title=${JSON.stringify(title)}`}]`;
        recognized = true;
      }
      owners.set(unit.unitId, { owner, structural: true, recognized, entityKey: entityKeyForOwner(owner) });
      continue;
    }
    if (!section) {
      if (/^State:\s*/.test(line)) owner = "taskState";
      else if (/^Last updated:\s*/.test(line)) owner = "lastUpdated";
      else if (/^Schema:\s*/.test(line)) owner = "schemaVersion";
      else if (line.trim()) owner = null;
    }
    owners.set(unit.unitId, { owner, structural: false, recognized: false, entityKey: entityKeyForOwner(owner) });
  }
  return owners;
}

function entityKeyForOwner(owner) {
  if (!owner) return null;
  const match = /^(proposals|notes|history\.decisions|history\.checkpoints|history\.slices)\[(?:id|title)=(.+)\]$/.exec(
    owner,
  );
  if (match) {
    const kind =
      match[1] === "history.decisions"
        ? "decision"
        : match[1] === "history.checkpoints"
          ? "checkpoint"
          : match[1] === "history.slices"
            ? "slice"
            : match[1].slice(0, -1);
    let identity = match[2];
    if (identity.startsWith('"')) {
      try {
        identity = JSON.parse(identity);
      } catch {
        /* keep source identity */
      }
    }
    return `${kind}:${identity}`;
  }
  return null;
}

import {
  activeDecisionBlocks,
  blockLines,
  fieldValue,
  findEntity,
  hasField,
  parseDocument,
  sectionContentLines,
} from "./document.mjs";

function trimTrailing(lines) {
  const result = [...lines];
  while (result.length && result[result.length - 1].trim() === "") result.pop();
  return result;
}

function joinChunk(lines, newline) {
  return trimTrailing(lines).join(newline);
}

export function renderFull(text) {
  return text;
}

export function renderResume(text) {
  const document = parseDocument(text);
  const { newline } = document;
  const context = document.sections["Current Context"];
  const current = document.sections["Current Work"];
  const future = document.sections["Future Work"];
  const notes = document.sections.Notes;
  const chunks = [
    joinChunk(document.lines.slice(0, context.headingIndex), newline),
    joinChunk(sectionContentLines(document, "Current Context"), newline),
  ];

  const decisions = activeDecisionBlocks(document);
  if (decisions.length) {
    chunks.push(
      joinChunk(["## Active Decisions", "", ...decisions.flatMap((block) => blockLines(document, block))], newline),
    );
  }

  chunks.push(joinChunk(document.lines.slice(current.headingIndex, current.end), newline));
  chunks.push(joinChunk(document.lines.slice(future.headingIndex, future.end), newline));
  const index = historyIndexLines(document);
  if (index.length) {
    chunks.push(
      joinChunk(
        [
          "## History index",
          "",
          "Closed History, one line per entry. Read an entry with `view entry <ID>`.",
          "",
          ...index,
        ],
        newline,
      ),
    );
  }
  chunks.push(joinChunk(document.lines.slice(notes.headingIndex, document.lines.length), newline));
  return `${chunks.filter(Boolean).join(`${newline}${newline}`)}${newline}`;
}

function hasCorrections(document, block) {
  return blockLines(document, block).some((line) => /^#####\s+Corrections\s*$/.test(line));
}

function indexLine(document, block) {
  const state = fieldValue(block, "State");
  let label = `${block.id} ${state}`;
  if (state === "superseded" && hasField(block, "Superseded by")) label += ` by ${fieldValue(block, "Superseded by")}`;
  if (hasField(block, "Recorded")) label += ", recorded retroactively";
  const corrected = hasCorrections(document, block) ? " (corrected)" : "";
  return `- ${label} — ${block.title}${corrected}`;
}

function historyIndexLines(document) {
  const { decisions, checkpoints, slices } = document.history;
  const closedDecisions = decisions.blocks.filter((block) => fieldValue(block, "State") !== "active");
  return [...closedDecisions, ...checkpoints.blocks, ...slices.blocks].map((block) => indexLine(document, block));
}

export function renderEntries(text, ids) {
  const document = parseDocument(text);
  const { newline } = document;
  const blocks = ids.map((id) => findEntity(document, id));
  return `${blocks.map((block) => joinChunk(blockLines(document, block), newline)).join(`${newline}${newline}`)}${newline}`;
}

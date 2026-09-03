import { activeDecisionBlocks, blockLines, parseDocument, sectionContentLines } from "./document.mjs";

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
  chunks.push(joinChunk(document.lines.slice(notes.headingIndex, document.lines.length), newline));
  return `${chunks.filter(Boolean).join(`${newline}${newline}`)}${newline}`;
}

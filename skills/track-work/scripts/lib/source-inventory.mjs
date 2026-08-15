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

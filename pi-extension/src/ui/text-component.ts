export function textComponent(text: any) {
  return {
    render(width = 120) {
      const maxWidth = Number.isFinite(width) ? Math.max(1, width) : 120;
      return String(text)
        .split("\n")
        .map((line) => truncateAnsiToWidth(line, maxWidth));
    },
    invalidate() {},
  };
}

function truncateAnsiToWidth(input: any, width: number): string {
  const text = String(input);
  let output = "";
  let visible = 0;

  for (let index = 0; index < text.length;) {
    const ansi = readAnsiSequence(text, index);
    if (ansi) {
      output += ansi.sequence;
      index = ansi.end;
      continue;
    }

    if (visible >= width - 1) {
      output += "…";
      return output;
    }

    const codePoint = text.codePointAt(index) ?? 0;
    const character = String.fromCodePoint(codePoint);
    output += character;
    visible += 1;
    index += character.length;
  }

  return output;
}

function readAnsiSequence(text: string, index: number): { sequence: string; end: number } | null {
  if (text.charCodeAt(index) !== 0x1b) {
    return null;
  }

  const next = text[index + 1];
  if (next === "[") {
    let end = index + 2;
    while (end < text.length && !/[\x40-\x7e]/.test(text[end] ?? "")) {
      end += 1;
    }
    const boundedEnd = Math.min(end + 1, text.length);
    return { sequence: text.slice(index, boundedEnd), end: boundedEnd };
  }

  if (next === "]") {
    const bellEnd = text.indexOf("\x07", index + 2);
    const stEnd = text.indexOf("\x1b\\", index + 2);
    const candidates = [bellEnd, stEnd === -1 ? -1 : stEnd + 1].filter((value) => value !== -1);
    const end = candidates.length > 0 ? Math.min(...candidates) + 1 : text.length;
    return { sequence: text.slice(index, end), end };
  }

  const end = Math.min(index + 2, text.length);
  return { sequence: text.slice(index, end), end };
}

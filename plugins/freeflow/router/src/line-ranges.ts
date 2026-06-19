export interface ExactLineRangeInput {
  start: number;
  end: number;
}

export interface ExactLineRange {
  start: number;
  end: number;
}

export interface ResolveExactLineRangeOptions {
  requested: ExactLineRangeInput;
  lineCount: number;
  availableLabel: string;
  invalidReason: string;
}

export type ResolveExactLineRangeResult =
  | { ok: true; range: ExactLineRange }
  | { ok: false; reason: string };

export function resolveExactLineRange(options: ResolveExactLineRangeOptions): ResolveExactLineRangeResult {
  const { requested, lineCount, availableLabel, invalidReason } = options;
  if (!isValidExactLineRange(requested)) {
    return { ok: false, reason: invalidReason };
  }

  if (requested.start > lineCount) {
    return {
      ok: false,
      reason: `Requested lineRange start ${requested.start} is outside ${availableLabel} 1-${lineCount}.`,
    };
  }

  if (requested.end > lineCount) {
    return {
      ok: false,
      reason: `Requested lineRange end ${requested.end} is outside ${availableLabel} 1-${lineCount}.`,
    };
  }

  return { ok: true, range: { start: requested.start, end: requested.end } };
}

function isValidExactLineRange(range: ExactLineRangeInput): boolean {
  return Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 1 && range.end >= range.start;
}

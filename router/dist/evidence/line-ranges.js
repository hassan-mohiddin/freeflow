export function resolveExactLineRange(options) {
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
function isValidExactLineRange(range) {
    return Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 1 && range.end >= range.start;
}

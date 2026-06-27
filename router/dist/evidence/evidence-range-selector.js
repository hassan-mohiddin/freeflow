export function selectEvidenceRangeForChunk(options) {
    const exactRange = options.chunkHasExactPhrase ? exactPhraseRangeForChunk(options) : null;
    const chunkLength = options.chunkRange.end - options.chunkRange.start + 1;
    const anchorLineIndex = exactRange ? exactRange.start - 1 : bestLineIndexInChunk(options);
    if (exactRange) {
        const range = expandSectionRangeToNearbyFencedCodeBlocks(options, {
            start: Math.max(options.chunkRange.start, exactRange.start - options.defaultContextLines),
            end: Math.min(options.chunkRange.end, exactRange.end + options.defaultContextLines),
        });
        return {
            range,
            anchorLine: exactRange.start,
            matchKind: "exact-phrase",
        };
    }
    if (options.chunkKind === "symbol" || chunkLength <= options.defaultContextLines * 2 + 4) {
        return {
            range: options.chunkRange,
            anchorLine: anchorLineIndex + 1,
            matchKind: exactRange ? "exact-phrase" : "best-line",
        };
    }
    const coverageRange = queryCoverageRangeForChunk(options);
    if (coverageRange) {
        return {
            range: expandSectionRangeToNearbyFencedCodeBlocks(options, coverageRange),
            anchorLine: coverageRange.start,
            matchKind: "coverage",
        };
    }
    const range = expandSectionRangeToNearbyFencedCodeBlocks(options, {
        start: Math.max(options.chunkRange.start, anchorLineIndex + 1 - options.defaultContextLines),
        end: Math.min(options.chunkRange.end, anchorLineIndex + 1 + options.defaultContextLines),
    });
    return {
        range,
        anchorLine: anchorLineIndex + 1,
        matchKind: "best-line",
    };
}
function exactPhraseRangeForChunk(options) {
    if (options.normalizedQueryPhrase === "") {
        return null;
    }
    for (let lineIndex = options.chunkRange.start - 1; lineIndex < options.chunkRange.end; lineIndex += 1) {
        const line = options.lines[lineIndex] ?? "";
        if (hasExactNormalizedPhrase(line, options.normalizedQueryPhrase)) {
            return { start: lineIndex + 1, end: lineIndex + 1 };
        }
    }
    for (let startIndex = options.chunkRange.start - 1; startIndex < options.chunkRange.end; startIndex += 1) {
        let text = "";
        for (let endIndex = startIndex; endIndex < options.chunkRange.end; endIndex += 1) {
            const line = options.lines[endIndex] ?? "";
            text = text === "" ? line : `${text}\n${line}`;
            if (hasExactNormalizedPhrase(text, options.normalizedQueryPhrase)) {
                return { start: startIndex + 1, end: endIndex + 1 };
            }
        }
    }
    return null;
}
function bestLineIndexInChunk(options) {
    let bestIndex = options.chunkRange.start - 1;
    let bestScore = 0;
    for (let lineIndex = options.chunkRange.start - 1; lineIndex < options.chunkRange.end; lineIndex += 1) {
        const line = options.lines[lineIndex] ?? "";
        const score = scoreText(line, options.queryTokens) * 4 + (line.trimStart().startsWith("#") ? 2 : 0);
        if (score > bestScore) {
            bestIndex = lineIndex;
            bestScore = score;
        }
    }
    return bestIndex;
}
function queryCoverageRangeForChunk(options) {
    if (options.chunkKind !== "section" || options.queryTokens.length < 2) {
        return null;
    }
    const remainingTokens = new Set(options.queryTokens);
    const matchingLines = [];
    for (let lineIndex = options.chunkRange.start - 1; lineIndex < options.chunkRange.end; lineIndex += 1) {
        const line = options.lines[lineIndex] ?? "";
        const lineTokens = new Set(tokenizeForSearch(line));
        let matchedLine = false;
        for (const token of options.queryTokens) {
            if (lineTokens.has(token)) {
                remainingTokens.delete(token);
                matchedLine = true;
            }
        }
        if (matchedLine) {
            matchingLines.push(lineIndex + 1);
        }
        if (remainingTokens.size === 0) {
            break;
        }
    }
    if (remainingTokens.size > 0 || matchingLines.length === 0) {
        return null;
    }
    return boundedCoverageRange(options, matchingLines);
}
function boundedCoverageRange(options, matchingLines) {
    const firstMatch = Math.min(...matchingLines);
    const lastMatch = Math.max(...matchingLines);
    const start = Math.max(options.chunkRange.start, firstMatch - options.defaultContextLines);
    const end = Math.min(options.chunkRange.end, lastMatch + options.defaultContextLines);
    if (end - start + 1 <= options.queryCoverageMaxLines) {
        return { start, end };
    }
    const cappedStart = start;
    const cappedEnd = Math.min(options.chunkRange.end, cappedStart + options.queryCoverageMaxLines - 1);
    return { start: cappedStart, end: cappedEnd };
}
function expandSectionRangeToNearbyFencedCodeBlocks(options, range) {
    if (options.chunkKind !== "section") {
        return range;
    }
    let expanded = range;
    for (const block of fencedCodeBlocksInChunk(options)) {
        const adjacentOrOverlapping = block.start <= expanded.end + options.defaultContextLines && block.end >= expanded.start - options.defaultContextLines;
        if (!adjacentOrOverlapping) {
            continue;
        }
        const candidate = {
            start: Math.min(expanded.start, block.start),
            end: Math.max(expanded.end, block.end),
        };
        if (candidate.end - candidate.start + 1 <= options.queryCoverageMaxLines) {
            expanded = candidate;
        }
    }
    return expanded;
}
function fencedCodeBlocksInChunk(options) {
    const blocks = [];
    let openStart = null;
    for (let lineIndex = options.chunkRange.start - 1; lineIndex < options.chunkRange.end; lineIndex += 1) {
        const lineNumber = lineIndex + 1;
        const line = options.lines[lineIndex] ?? "";
        if (!/^\s*```/.test(line)) {
            continue;
        }
        if (openStart === null) {
            openStart = lineNumber;
        }
        else {
            blocks.push({ start: openStart, end: lineNumber });
            openStart = null;
        }
    }
    if (openStart !== null) {
        blocks.push({ start: openStart, end: options.chunkRange.end });
    }
    return blocks;
}
function hasExactNormalizedPhrase(text, normalizedQueryPhrase) {
    return normalizedQueryPhrase !== "" && normalizePhraseSequence(text).includes(normalizedQueryPhrase);
}
function normalizePhraseSequence(text) {
    const tokens = tokenizeForPhrase(text);
    return tokens.length >= 2 ? tokens.join(" ") : "";
}
function tokenizeForSearch(text) {
    return text
        .split(/[^A-Za-z0-9_./-]+/)
        .flatMap((token) => expandedIdentifierTokens(token.trim()))
        .filter((token) => token.length >= 2);
}
function tokenizeForPhrase(text) {
    return tokenizeForSearch(text);
}
function scoreText(text, tokens) {
    const lower = text.toLowerCase();
    return tokens.reduce((score, token) => score + countOccurrences(lower, token), 0);
}
function countOccurrences(text, token) {
    let count = 0;
    let index = text.indexOf(token);
    while (index !== -1) {
        count += 1;
        index = text.indexOf(token, index + token.length);
    }
    return count;
}
function expandedIdentifierTokens(token) {
    if (!token) {
        return [];
    }
    const lower = token.toLowerCase();
    if (!needsIdentifierSplit(token)) {
        return [lower];
    }
    const variants = new Set();
    addTokenVariant(variants, lower);
    for (const part of splitIdentifierToken(token)) {
        addTokenVariant(variants, part.toLowerCase());
    }
    return Array.from(variants);
}
function addTokenVariant(variants, token) {
    if (token) {
        variants.add(token);
    }
}
function needsIdentifierSplit(token) {
    if (/[._/-]/.test(token)) {
        return true;
    }
    for (let index = 1; index < token.length; index += 1) {
        const previous = token.charCodeAt(index - 1);
        const current = token.charCodeAt(index);
        const next = index + 1 < token.length ? token.charCodeAt(index + 1) : 0;
        const previousIsLowerOrDigit = (previous >= 97 && previous <= 122) || (previous >= 48 && previous <= 57);
        const previousIsUpper = previous >= 65 && previous <= 90;
        const currentIsUpper = current >= 65 && current <= 90;
        const nextIsLower = next >= 97 && next <= 122;
        if ((previousIsLowerOrDigit && currentIsUpper) || (previousIsUpper && currentIsUpper && nextIsLower)) {
            return true;
        }
    }
    return false;
}
function splitIdentifierToken(token) {
    return token
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(/[._/\-\s]+/)
        .filter((part) => part.length > 0);
}

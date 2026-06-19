import {
  DEFAULT_MAX_IMPORTANT_LINES,
  assembleImportantLines,
  lineEntries,
  nonEmptyLineEntries,
  splitLines,
  type BoundedEvidence,
  type ImportantStream,
  type LineEntry,
} from "./evidence.js";
import type {
  CommandParserMetadata,
  CommandParserReference,
  ExecutionStatus,
  ImportantLine,
} from "./types.js";

export interface CommandParseInput {
  command: string | readonly string[];
  executionStatus: ExecutionStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  combined: string;
  goal?: string;
}

export interface ParsedCommandOutput {
  parser: CommandParserMetadata;
  importantLines: ImportantLine[];
  summary?: string;
}

interface CommandOutputParser {
  name: string;
  parse(input: CommandParseInput): ParsedCommandOutput | null;
}

interface DiagnosticMatch {
  entry: LineEntry;
  reference: CommandParserReference;
  headerEntry?: LineEntry;
}

const MAX_IMPORTANT_LINES = DEFAULT_MAX_IMPORTANT_LINES;

const COMMAND_PARSERS: CommandOutputParser[] = [
  { name: "test-runner", parse: parseTestRunnerOutput },
  { name: "typescript-lint", parse: parseTypeScriptOrLintOutput },
  { name: "git-status-diffstat", parse: parseGitOutput },
  { name: "build-toolchain", parse: parseBuildOutput },
];

export function parseCommandOutput(input: CommandParseInput): ParsedCommandOutput {
  for (const parser of COMMAND_PARSERS) {
    const parsed = parser.parse(input);
    if (parsed) {
      return parsed;
    }
  }

  return parseGenericOutput(input);
}

function parseTestRunnerOutput(input: CommandParseInput): ParsedCommandOutput | null {
  const command = commandText(input.command);
  const combined = input.combined;
  const commandLooksLikeTest = commandLooksLikeTestRunner(command);
  const summaryEvidence = testSummaryEvidence(combined);

  if (!commandLooksLikeTest) {
    return null;
  }

  const evidenceBlocks: BoundedEvidence[] = [];
  const failureBlock = firstFailureBlock(input.stderr, "stderr") ?? firstFailureBlock(input.stdout, "stdout") ?? firstFailureBlock(input.combined, "combined");
  if (failureBlock) {
    evidenceBlocks.push(failureBlock);
  }

  if (summaryEvidence) {
    evidenceBlocks.push(summaryEvidence);
  }

  const selected = selectEvidenceLines(evidenceBlocks, 2);
  if (selected.importantLines.length === 0) {
    return null;
  }

  const counts = testCounts(input.combined);
  return {
    parser: {
      name: "test-runner",
      confidence: 0.92,
      fidelity: selected.fidelity,
      compressed: selected.compressed,
      counts,
    },
    summary: testSummaryText(counts, input.executionStatus, input.exitCode),
    importantLines: selected.importantLines,
  };
}

function parseTypeScriptOrLintOutput(input: CommandParseInput): ParsedCommandOutput | null {
  const command = commandText(input.command);
  if (!commandLooksLikeTypeScriptOrLint(command)) {
    return null;
  }

  const streams = [
    { stream: "stderr" as const, text: input.stderr },
    { stream: "stdout" as const, text: input.stdout },
    { stream: "combined" as const, text: input.combined },
  ];

  for (const { stream, text } of streams) {
    const entries = lineEntries(text);
    const matches = diagnosticMatches(entries);
    if (matches.length === 0) {
      continue;
    }

    const references = matches.map((match) => match.reference);
    const importantEntries = diagnosticImportantEntries(matches).slice(0, MAX_IMPORTANT_LINES);
    const evidence = assembleImportantLines({ stream, entries: importantEntries, sourceText: text });
    if (evidence.importantLines.length === 0) {
      continue;
    }

    const counts = diagnosticCounts(references);
    return {
      parser: {
        name: "typescript-lint",
        confidence: 0.88,
        fidelity: evidence.fidelity,
        compressed: evidence.compressed,
        counts,
        references: references.slice(0, 10),
      },
      summary: `Detected ${counts.errors ?? 0} error(s) and ${counts.warnings ?? 0} warning(s) in TypeScript/lint diagnostics.`,
      importantLines: evidence.importantLines,
    };
  }

  return null;
}

function parseGitOutput(input: CommandParseInput): ParsedCommandOutput | null {
  const command = commandText(input.command);
  const text = input.combined;
  const commandLooksLikeStatusOrDiffstat = /^\s*git\s+(status\b|diff\b.*--stat|show\b.*--stat|diffstat\b)/i.test(command);
  if (!commandLooksLikeStatusOrDiffstat) {
    return null;
  }

  const entries = lineEntries(text).filter((entry) => isGitEvidenceLine(entry.line));
  const selected = entries.length > 0 ? entries : nonEmptyLineEntries(text).slice(0, MAX_IMPORTANT_LINES);
  const selectedForEvidence = selected.slice(0, MAX_IMPORTANT_LINES);
  const evidence = assembleImportantLines({ stream: "combined", entries: selectedForEvidence, sourceText: text });
  if (evidence.importantLines.length === 0) {
    return null;
  }

  const counts = gitCounts(text);

  return {
    parser: {
      name: "git-status-diffstat",
      confidence: 0.76,
      fidelity: evidence.fidelity,
      compressed: evidence.compressed,
      counts,
    },
    summary: "Detected git status/diffstat output.",
    importantLines: evidence.importantLines,
  };
}

function parseBuildOutput(input: CommandParseInput): ParsedCommandOutput | null {
  const text = input.combined;
  const command = commandText(input.command);
  const entries = lineEntries(text);
  const commandLooksLikeBuild = commandLooksLikeBuildTool(command);
  if (!commandLooksLikeBuild) {
    return null;
  }

  const errorPattern = commandLooksLikeBuild
    ? /(?:\berror\b|\bfatal\b|failed to compile|build failed|module not found|cannot find module|npm ERR!)/i
    : /(failed to compile|build failed|npm ERR!)/i;
  const firstErrorIndex = entries.findIndex((entry) => errorPattern.test(entry.line));
  if (firstErrorIndex === -1) {
    return null;
  }

  const selected = entries.slice(firstErrorIndex, Math.min(entries.length, firstErrorIndex + MAX_IMPORTANT_LINES));
  const evidence = assembleImportantLines({ stream: "combined", entries: selected, sourceText: text });
  if (evidence.importantLines.length === 0) {
    return null;
  }

  const counts = {
    errors: countMatches(text, /(?:\berror\b|\bfatal\b|npm ERR!)/gi),
    failed: countMatches(text, /\bfailed\b/gi),
  };

  return {
    parser: {
      name: "build-toolchain",
      confidence: 0.66,
      fidelity: evidence.fidelity,
      compressed: evidence.compressed,
      counts,
    },
    summary: "Detected build/toolchain error output.",
    importantLines: evidence.importantLines,
  };
}

function parseGenericOutput(input: CommandParseInput): ParsedCommandOutput {
  const evidence = selectGenericImportantLines(input);
  const outputLines = splitLines(input.combined).length;
  return {
    parser: {
      name: "generic",
      confidence: 0.35,
      fidelity: evidence.fidelity,
      compressed: evidence.compressed,
      counts: { outputLines },
    },
    importantLines: evidence.importantLines,
  };
}

function selectGenericImportantLines(input: CommandParseInput): BoundedEvidence {
  if (isVerificationGoal(input.goal)) {
    const verificationLines = verificationSummaryEvidence(input.combined);
    if (verificationLines) {
      return verificationLines;
    }
  }

  if (input.executionStatus !== "success") {
    const failureLines = firstFailureBlock(input.stderr, "stderr") ?? firstFailureBlock(input.combined, "combined");
    if (failureLines) {
      return failureLines;
    }

    const stderrLines = firstAndLastNonEmptyImportantLines(input.stderr, "stderr");
    if (stderrLines) {
      return stderrLines;
    }
  }

  return firstNonEmptyImportantLine(input.combined, "combined") ?? emptyEvidence(input.combined);
}

function firstFailureBlock(text: string, stream: ImportantStream): BoundedEvidence | null {
  const entries = lineEntries(text);
  const firstFailureIndex = entries.findIndex((entry) =>
    /^\s*(FAIL|FAILED|FAILURES)(?:\s|$)/i.test(entry.line) ||
    /(?:\bAssertionError\b|assertion failed|\bexpected\b|\bExpected\b|\bReceived\b|\bstack\b|\bTraceback\b|\bError:|\bfatal(?:\b|_)|\bpanic\b|\bexception\b)/i.test(entry.line),
  );
  if (firstFailureIndex === -1) {
    return null;
  }

  const block = entries.slice(firstFailureIndex, Math.min(entries.length, firstFailureIndex + MAX_IMPORTANT_LINES));
  return assembleImportantLines({ stream, entries: block, sourceText: text });
}

function testSummaryEvidence(text: string): BoundedEvidence | null {
  const matches = lineEntries(text).filter((entry) =>
    /\b(Test Suites?:|Tests?:|FAILURES)/i.test(entry.line) ||
    /^\s*FAILED\s+.+\btests?\b/i.test(entry.line) ||
    /^\s*(?:\d+\s+(?:failed|passed|skipped|deselected|xfailed|xpassed|errors?)(?:,?\s+|$))+in\s+[\d.]+s\b/i.test(entry.line) ||
    /^\s*(?:ℹ\s*)?(?:tests?|pass|fail|cancelled|skipped|todo)\s+\d+\b/i.test(entry.line),
  );
  const evidence = assembleImportantLines({ stream: "combined", entries: matches.slice(0, MAX_IMPORTANT_LINES), sourceText: text });
  return evidence.importantLines.length > 0 ? evidence : null;
}

function verificationSummaryEvidence(text: string): BoundedEvidence | null {
  const matches = lineEntries(text).filter((entry) => /\b(Tests?|Test Suites?|passed|failed|total)\b/i.test(entry.line));
  const evidence = assembleImportantLines({ stream: "combined", entries: matches.slice(0, MAX_IMPORTANT_LINES), sourceText: text });
  return evidence.importantLines.length > 0 ? evidence : null;
}

function firstNonEmptyImportantLine(text: string, stream: ImportantStream): BoundedEvidence | null {
  const evidence = assembleImportantLines({ stream, entries: nonEmptyLineEntries(text).slice(0, MAX_IMPORTANT_LINES), sourceText: text });
  return evidence.importantLines.length > 0 ? evidence : null;
}

function firstAndLastNonEmptyImportantLines(text: string, stream: ImportantStream): BoundedEvidence | null {
  const entries = nonEmptyLineEntries(text);
  if (entries.length === 0) {
    return null;
  }
  if (entries.length <= MAX_IMPORTANT_LINES) {
    return firstNonEmptyImportantLine(text, stream);
  }

  const headCount = Math.floor(MAX_IMPORTANT_LINES / 2);
  const tailCount = MAX_IMPORTANT_LINES - headCount;
  const selected = [...entries.slice(0, headCount), ...entries.slice(-tailCount)];
  const evidence = assembleImportantLines({ stream, entries: selected, sourceText: text });
  return evidence.importantLines.length > 0 ? evidence : null;
}

function selectEvidenceLines(evidenceBlocks: readonly BoundedEvidence[], maxImportantLines: number): {
  importantLines: ImportantLine[];
  fidelity: "exact" | "lossy";
  compressed: boolean;
} {
  const importantLines: ImportantLine[] = [];
  const seen = new Set<string>();
  let fidelity: "exact" | "lossy" = "exact";
  let compressed = false;

  for (const evidence of evidenceBlocks) {
    fidelity = fidelity === "lossy" || evidence.fidelity === "lossy" ? "lossy" : "exact";
    compressed = compressed || evidence.compressed;

    for (const line of evidence.importantLines) {
      const key = `${line.stream}:${line.lines}:${line.excerpt}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (importantLines.length >= maxImportantLines) {
        compressed = true;
        continue;
      }
      importantLines.push(line);
    }
  }

  return { importantLines, fidelity, compressed };
}

function emptyEvidence(sourceText: string): BoundedEvidence {
  return {
    importantLines: [],
    fidelity: "exact",
    compressed: false,
    selectedLineCount: 0,
    sourceLineCount: splitLines(sourceText).length,
  };
}

function isGitEvidenceLine(line: string): boolean {
  return (
    /\b(On branch|Your branch|Changes to be committed|Changes not staged|Untracked files|modified:|new file:|deleted:|files? changed|insertions?\(\+\)|deletions?\(-\))\b/i.test(line) ||
    /^([ MARCUD?!]{2})\s+/.test(line) ||
    /\|\s+\d+\s+[+\-]+/.test(line)
  );
}

function gitCounts(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  addCount(counts, "modified", countMatches(text, /modified:/gi));
  addCount(counts, "added", countMatches(text, /new file:/gi));
  addCount(counts, "deleted", countMatches(text, /deleted:/gi));

  for (const entry of lineEntries(text)) {
    const porcelain = /^([ MARCUD?!]{2})\s+/.exec(entry.line);
    if (!porcelain) {
      continue;
    }
    const status = porcelain[1] ?? "";
    if (status.includes("M")) {
      addCount(counts, "modified", 1);
    }
    if (status.includes("A") || status === "??") {
      addCount(counts, status === "??" ? "untracked" : "added", 1);
    }
    if (status.includes("D")) {
      addCount(counts, "deleted", 1);
    }
    if (status.includes("R")) {
      addCount(counts, "renamed", 1);
    }
  }

  const diffstat = /\b(\d+)\s+files? changed\b/i.exec(text);
  if (diffstat?.[1]) {
    addCount(counts, "filesChanged", Number(diffstat[1]));
  }

  return counts;
}

function addCount(counts: Record<string, number>, key: string, value: number) {
  if (value > 0) {
    counts[key] = (counts[key] ?? 0) + value;
  }
}

function testCounts(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const testsLine = /Tests?:\s*(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+total)?/i.exec(text);
  if (testsLine?.[1]) {
    counts.testsFailed = Number(testsLine[1]);
  }
  if (testsLine?.[2]) {
    counts.testsPassed = Number(testsLine[2]);
  }
  if (testsLine?.[3]) {
    counts.testsTotal = Number(testsLine[3]);
  }

  for (const match of text.matchAll(/\b(\d+)\s+(passed|failed|skipped|deselected|xfailed|xpassed|errors?)\b/gi)) {
    const value = Number(match[1]);
    const kind = match[2]?.toLowerCase();
    if (kind === "passed" && counts.testsPassed === undefined) {
      counts.testsPassed = value;
    }
    if ((kind === "failed" || kind === "error" || kind === "errors") && counts.testsFailed === undefined) {
      counts.testsFailed = value;
    }
    if ((kind === "skipped" || kind === "deselected" || kind === "xfailed" || kind === "xpassed") && counts.testsSkipped === undefined) {
      counts.testsSkipped = value;
    }
  }

  for (const match of text.matchAll(/^\s*(?:ℹ\s*)?(tests?|pass|fail|cancelled|skipped|todo)\s+(\d+)\b/gim)) {
    const kind = match[1]?.toLowerCase();
    const value = Number(match[2]);
    if (kind === "test" || kind === "tests") {
      counts.testsTotal ??= value;
    }
    if (kind === "pass") {
      counts.testsPassed ??= value;
    }
    if (kind === "fail") {
      counts.testsFailed ??= value;
    }
    if (kind === "skipped") {
      counts.testsSkipped ??= value;
    }
  }

  const suitesLine = /Test Suites?:\s*(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+total)?/i.exec(text);
  if (suitesLine?.[1]) {
    counts.suitesFailed = Number(suitesLine[1]);
  }
  if (suitesLine?.[2]) {
    counts.suitesPassed = Number(suitesLine[2]);
  }
  if (suitesLine?.[3]) {
    counts.suitesTotal = Number(suitesLine[3]);
  }

  return counts;
}

function testSummaryText(counts: Record<string, number>, status: string, exitCode: number | null): string {
  const parts = [];
  if (counts.testsFailed !== undefined) {
    parts.push(`${counts.testsFailed} failed`);
  }
  if (counts.testsPassed !== undefined) {
    parts.push(`${counts.testsPassed} passed`);
  }
  if (counts.testsTotal !== undefined) {
    parts.push(`${counts.testsTotal} total`);
  }
  return parts.length > 0
    ? `Test runner output parsed (${parts.join(", ")}).`
    : `Test runner output parsed for command ${status} with exitCode=${exitCode}.`;
}

function diagnosticMatches(entries: readonly LineEntry[]): DiagnosticMatch[] {
  const matches: DiagnosticMatch[] = [];
  let headerEntry: LineEntry | undefined;

  for (const entry of entries) {
    const directReference = diagnosticReference(entry.line);
    if (directReference) {
      matches.push({ entry, reference: directReference });
      headerEntry = undefined;
      continue;
    }

    const header = /^\s*(.+\.(?:ts|tsx|js|jsx))\s*$/.exec(entry.line);
    if (header) {
      headerEntry = entry;
      continue;
    }

    const stylish = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}([@\w./-]+))?\s*$/.exec(entry.line);
    if (stylish && headerEntry) {
      const reference: CommandParserReference = {
        path: headerEntry.line.trim(),
        line: Number(stylish[1]),
        column: Number(stylish[2]),
        severity: (stylish[3]?.toLowerCase() as "error" | "warning") ?? "error",
        message: stylish[4] ?? "",
      };
      if (stylish[5] !== undefined) {
        reference.code = stylish[5];
      }
      matches.push({ entry, headerEntry, reference });
    }
  }

  return matches;
}

function diagnosticImportantEntries(matches: readonly DiagnosticMatch[]): LineEntry[] {
  const selected: LineEntry[] = [];
  const seen = new Set<number>();
  for (const match of matches) {
    if (match.headerEntry && !seen.has(match.headerEntry.lineNumber)) {
      selected.push(match.headerEntry);
      seen.add(match.headerEntry.lineNumber);
    }
    if (!seen.has(match.entry.lineNumber)) {
      selected.push(match.entry);
      seen.add(match.entry.lineNumber);
    }
  }
  return selected.sort((a, b) => a.lineNumber - b.lineNumber);
}

function diagnosticReference(line: string): CommandParserReference | null {
  const tsc = /^(.*?\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/.exec(line);
  if (tsc) {
    return {
      path: tsc[1] ?? "",
      line: Number(tsc[2]),
      column: Number(tsc[3]),
      code: tsc[5] ?? "",
      severity: (tsc[4]?.toLowerCase() as "error" | "warning") ?? "error",
      message: tsc[6] ?? "",
    };
  }

  const lint = /^(.*?\.(?:ts|tsx|js|jsx)):(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}([@\w./-]+))?$/.exec(line);
  if (lint) {
    const reference: CommandParserReference = {
      path: lint[1] ?? "",
      line: Number(lint[2]),
      column: Number(lint[3]),
      severity: (lint[4]?.toLowerCase() as "error" | "warning") ?? "error",
      message: lint[5] ?? "",
    };
    if (lint[6] !== undefined) {
      reference.code = lint[6];
    }
    return reference;
  }

  return null;
}

function diagnosticCounts(references: readonly CommandParserReference[]): Record<string, number> {
  return {
    errors: references.filter((reference) => reference.severity === "error").length,
    warnings: references.filter((reference) => reference.severity === "warning").length,
  };
}

function commandLooksLikeTestRunner(command: string): boolean {
  return (
    /^\s*(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|tests)\b/i.test(command) ||
    /^\s*(?:npx\s+)?(?:jest|vitest|mocha|tap|pytest)\b/i.test(command) ||
    /(?:^|\s)cargo\s+test\b/i.test(command) ||
    /(?:^|\s)go\s+test\b/i.test(command) ||
    /^\s*node\s+--test\b/i.test(command)
  );
}

function commandLooksLikeTypeScriptOrLint(command: string): boolean {
  return (
    /\b(?:tsc|typecheck|eslint|biome|lint)\b/i.test(command) ||
    /^\s*(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:build|typecheck|lint)\b/i.test(command)
  );
}

function commandLooksLikeBuildTool(command: string): boolean {
  return (
    /^\s*(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:build|install|ci)\b/i.test(command) ||
    /^\s*(?:npx\s+)?(?:webpack|rollup|vite|esbuild|babel)\b/i.test(command) ||
    /^\s*(?:build|compile)\b/i.test(command) ||
    /(?:^|\s)cargo\s+build\b/i.test(command) ||
    /(?:^|\s)go\s+build\b/i.test(command)
  );
}

function isVerificationGoal(goal: string | undefined): boolean {
  return Boolean(goal && /\b(verify|verification|test|tests|check|ci)\b/i.test(goal));
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function commandText(command: string | readonly string[]): string {
  return typeof command === "string" ? command : command.join(" ");
}

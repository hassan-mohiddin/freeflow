import { createHash } from "node:crypto";

import { freeflowSearch, type FreeflowSearchOptions } from "./search.js";
import { freeflowRun, type FreeflowRunOptions, type HostCommandRunner } from "./run.js";
import type {
  BatchQueryAnswer,
  BatchQueryMatch,
  BatchRoutedResult,
  BatchStepKind,
  BatchStepRoutedResult,
  CommandRoutedResult,
  EvidencePacket,
  ImportantLine,
  OutputStream,
  PreserveMode,
  RecoveryHint,
  RouterThresholds,
  RoutedResult,
  SourceRef,
  ScriptDeriveConfig,
  StoragePolicyMode,
  VaultRetentionPolicy,
} from "../config/types.js";
import type { ScriptSandboxAdapter } from "../sandbox/script-sandbox.js";

export interface FreeflowBatchStepInput {
  id?: string;
  kind: BatchStepKind;
  input: Record<string, unknown>;
}

export interface FreeflowBatchOptions {
  sessionId: string;
  steps: readonly FreeflowBatchStepInput[];
  concurrency?: number;
  preserve?: PreserveMode;
  vaultRoot?: string;
  vaultRetention?: VaultRetentionPolicy;
  thresholds?: Partial<RouterThresholds>;
  scriptDerive?: ScriptDeriveConfig;
  scriptSandboxAdapters?: readonly ScriptSandboxAdapter[];
  storagePolicy?: StoragePolicyMode;
  queries?: readonly string[];
}

interface NormalizedBatchStep {
  id: string;
  kind: BatchStepKind;
  input: Record<string, unknown>;
}

interface NormalizedBatchOptions extends FreeflowBatchOptions {
  steps: readonly NormalizedBatchStep[];
  concurrency: number;
  preserve: PreserveMode;
  queries: readonly string[];
}

interface BatchValidationIssue {
  path: string;
  message: string;
}

const DEFAULT_BATCH_CONCURRENCY = 4;
const MAX_BATCH_CONCURRENCY = 16;
const MAX_BATCH_STEPS = 50;
const BATCH_STEP_KINDS = new Set(["run", "search"]);
const MAX_BATCH_QUERIES = 10;
const MAX_BATCH_QUERY_LENGTH = 500;
const MAX_QUERY_MATCHES = 3;
const QUERY_MATCH_EXCERPT_MAX_BYTES = 1_500;

export async function freeflowBatch(
  options: FreeflowBatchOptions,
  runner: HostCommandRunner,
): Promise<BatchRoutedResult> {
  const validation = validateBatchInput(options);
  if (!validation.ok) {
    return batchValidationFailure(options.preserve ?? "important", validation.issues);
  }

  const startedAt = Date.now();
  const steps = await mapWithConcurrency(validation.value.steps, validation.value.concurrency, (step, index) =>
    executeBatchStep({
      step,
      index,
      options: validation.value,
      runner,
    }),
  );
  const failedCount = steps.filter((step) => step.status === "failed").length;
  const okCount = steps.length - failedCount;
  const queryAnswers = await answerBatchQueries(validation.value, steps);
  const routingStatus = failedCount === 0 ? "routed" : okCount === 0 ? "failed" : "partial";
  const durationMs = Date.now() - startedAt;
  const queryReason = queryAnswers.length > 0 ? ` Aggregated ${queryAnswers.filter((answer) => answer.status === "answered").length}/${queryAnswers.length} query answer(s) from child evidence handles.` : "";

  return {
    toolStatus: failedCount === 0 ? "ok" : "error",
    decisionId: decisionId("batch", validation.value.sessionId, String(steps.length), String(failedCount), stepDecisionSeed(steps), queryDecisionSeed(queryAnswers)),
    preserve: validation.value.preserve,
    producer: { kind: "other", name: "batch" },
    persistence: { status: "not_persisted", recoverability: "none" },
    routing: {
      status: routingStatus,
      route: "batch",
      reason:
        failedCount === 0
          ? `Ran ${steps.length} independent Freeflow-owned step(s) with concurrency=${validation.value.concurrency}; child results are available in details.result.steps.${queryReason}`
          : `Ran ${steps.length} independent Freeflow-owned step(s) with concurrency=${validation.value.concurrency}; ${failedCount} step(s) failed and ${okCount} step(s) completed. Child results are available in details.result.steps.${queryReason}`,
    },
    summary: renderBatchSummary({ okCount, stepCount: steps.length, durationMs, concurrency: validation.value.concurrency, queryAnswers }),
    concurrency: validation.value.concurrency,
    stepCount: steps.length,
    okCount,
    failedCount,
    steps,
    ...(queryAnswers.length > 0 ? { queries: queryAnswers } : {}),
    recovery: {
      how: "Inspect details.result.steps for each child result. Child run outputs remain recoverable by their own outputId; child search results keep exact path/outputId and line-range recovery hints. Query answers cite matching child evidence handles when present.",
    },
  };
}

function validateBatchInput(value: FreeflowBatchOptions): { ok: true; value: NormalizedBatchOptions } | { ok: false; issues: BatchValidationIssue[] } {
  const issues: BatchValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Expected batch input object." }] };
  }
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
    issues.push({ path: "$.sessionId", message: "Expected non-empty sessionId." });
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    issues.push({ path: "$.steps", message: "Expected at least one batch step." });
  } else if (value.steps.length > MAX_BATCH_STEPS) {
    issues.push({ path: "$.steps", message: `Expected at most ${MAX_BATCH_STEPS} batch steps.` });
  }
  const concurrency = normalizeConcurrency(value.concurrency);
  if (!concurrency.ok) {
    issues.push({ path: "$.concurrency", message: concurrency.message });
  }
  if (value.preserve !== undefined && value.preserve !== "summary" && value.preserve !== "important" && value.preserve !== "full") {
    issues.push({ path: "$.preserve", message: "Expected preserve mode summary, important, or full." });
  }
  const normalizedQueries = normalizeBatchQueries(value.queries, issues);

  const normalizedSteps: NormalizedBatchStep[] = [];
  if (Array.isArray(value.steps)) {
    value.steps.forEach((step, index) => {
      if (!isRecord(step)) {
        issues.push({ path: `$.steps[${index}]`, message: "Expected batch step object." });
        return;
      }
      if (typeof step.kind !== "string" || !BATCH_STEP_KINDS.has(step.kind)) {
        issues.push({ path: `$.steps[${index}].kind`, message: "Expected step kind run or search." });
      }
      if (step.id !== undefined && (typeof step.id !== "string" || step.id.length === 0)) {
        issues.push({ path: `$.steps[${index}].id`, message: "Expected non-empty string id when present." });
      }
      if (!isRecord(step.input)) {
        issues.push({ path: `$.steps[${index}].input`, message: "Expected step input object." });
      }
      if (typeof step.kind === "string" && BATCH_STEP_KINDS.has(step.kind) && isRecord(step.input)) {
        normalizedSteps.push({
          id: typeof step.id === "string" && step.id.length > 0 ? step.id : `${step.kind}-${index + 1}`,
          kind: step.kind as BatchStepKind,
          input: step.input,
        });
      }
    });
  }

  if (issues.length > 0 || !concurrency.ok) {
    return { ok: false, issues };
  }

  const normalized: NormalizedBatchOptions = {
    ...value,
    steps: normalizedSteps,
    concurrency: concurrency.value,
    preserve: value.preserve ?? "important",
    queries: normalizedQueries,
  };
  return { ok: true, value: normalized };
}

function normalizeConcurrency(value: number | undefined): { ok: true; value: number } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: DEFAULT_BATCH_CONCURRENCY };
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_CONCURRENCY) {
    return { ok: false, message: `Expected integer concurrency from 1 to ${MAX_BATCH_CONCURRENCY}.` };
  }
  return { ok: true, value };
}

function normalizeBatchQueries(value: readonly string[] | undefined, issues: BatchValidationIssue[]): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push({ path: "$.queries", message: "Expected queries to be an array of strings when present." });
    return [];
  }
  if (value.length > MAX_BATCH_QUERIES) {
    issues.push({ path: "$.queries", message: `Expected at most ${MAX_BATCH_QUERIES} queries.` });
  }

  const normalized: string[] = [];
  value.forEach((query, index) => {
    if (typeof query !== "string" || query.trim().length === 0) {
      issues.push({ path: `$.queries[${index}]`, message: "Expected non-empty query string." });
      return;
    }
    if (query.length > MAX_BATCH_QUERY_LENGTH) {
      issues.push({ path: `$.queries[${index}]`, message: `Expected query length at most ${MAX_BATCH_QUERY_LENGTH} characters.` });
      return;
    }
    normalized.push(query.trim());
  });
  return normalized;
}

async function executeBatchStep(options: {
  step: NormalizedBatchStep;
  index: number;
  options: NormalizedBatchOptions;
  runner: HostCommandRunner;
}): Promise<BatchStepRoutedResult> {
  const startedAt = Date.now();
  try {
    const result = await executeStepResult(options.step, options.options, options.runner);
    return {
      id: options.step.id,
      index: options.index,
      kind: options.step.kind,
      status: isFailedChildResult(result, options.step.kind) ? "failed" : "ok",
      toolStatus: result.toolStatus,
      durationMs: Date.now() - startedAt,
      result,
    };
  } catch (error) {
    return {
      id: options.step.id,
      index: options.index,
      kind: options.step.kind,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: errorMessage(error),
    };
  }
}

async function executeStepResult(
  step: NormalizedBatchStep,
  options: NormalizedBatchOptions,
  runner: HostCommandRunner,
): Promise<RoutedResult> {
  if (step.kind === "run") {
    return freeflowRun({
      ...(step.input as Omit<FreeflowRunOptions, "sessionId">),
      preserve: (step.input.preserve as PreserveMode | undefined) ?? options.preserve,
      sessionId: options.sessionId,
      ...(options.vaultRoot !== undefined ? { vaultRoot: options.vaultRoot } : {}),
      ...(options.vaultRetention !== undefined ? { vaultRetention: options.vaultRetention } : {}),
      ...(options.thresholds !== undefined ? { thresholds: options.thresholds } : {}),
      ...(options.scriptDerive !== undefined ? { scriptDerive: options.scriptDerive } : {}),
      ...(options.scriptSandboxAdapters !== undefined ? { scriptSandboxAdapters: options.scriptSandboxAdapters } : {}),
      ...(options.storagePolicy !== undefined ? { storagePolicy: options.storagePolicy } : {}),
    } as FreeflowRunOptions, runner);
  }

  return freeflowSearch({
    ...(step.input as unknown as FreeflowSearchOptions),
    preserve: (step.input.preserve as PreserveMode | undefined) ?? options.preserve,
  });
}

function isFailedChildResult(result: RoutedResult, kind: BatchStepKind): boolean {
  if (result.toolStatus === "error" || result.routing?.status === "failed") {
    return true;
  }
  if (kind === "run" && "execution" in result && result.execution?.status !== "success") {
    return true;
  }
  return false;
}

async function answerBatchQueries(options: NormalizedBatchOptions, steps: readonly BatchStepRoutedResult[]): Promise<BatchQueryAnswer[]> {
  if (options.queries.length === 0) {
    return [];
  }

  const answers: BatchQueryAnswer[] = [];
  for (const query of options.queries) {
    const matches = await collectBatchQueryMatches(options, steps, query);
    const selected = matches.sort((a, b) => b.score - a.score).slice(0, MAX_QUERY_MATCHES);
    answers.push({
      query,
      status: selected.length > 0 ? "answered" : "no_match",
      summary: renderBatchQueryAnswer(query, selected),
      matches: selected,
    });
  }
  return answers;
}

async function collectBatchQueryMatches(options: NormalizedBatchOptions, steps: readonly BatchStepRoutedResult[], query: string): Promise<BatchQueryMatch[]> {
  const matches: BatchQueryMatch[] = [];
  const seenVaultQueries = new Set<string>();
  const tokens = tokenizeQuery(query);

  for (const step of steps) {
    const result = step.result;
    if (!result) {
      continue;
    }

    collectStructuredQueryMatches(matches, step, result, query, tokens);
    const refs = vaultQueryRefsForResult(result);
    if (!options.vaultRoot) {
      continue;
    }

    for (const ref of refs) {
      const key = `${ref.outputId}:${ref.stream}`;
      if (seenVaultQueries.has(`${query}:${key}`)) {
        continue;
      }
      seenVaultQueries.add(`${query}:${key}`);
      const routed = await freeflowSearch({
        action: "query",
        source: { kind: "vault", root: options.vaultRoot, sessionId: options.sessionId, outputId: ref.outputId, stream: ref.stream },
        query,
        topK: 1,
        preserve: "summary",
      });
      for (const packet of routed.evidence ?? []) {
        addEvidenceQueryMatch(matches, step, packet, query, tokens, `vault ${ref.outputId}:${ref.stream}`);
      }
    }
  }

  return dedupeQueryMatches(matches);
}

function collectStructuredQueryMatches(matches: BatchQueryMatch[], step: BatchStepRoutedResult, result: RoutedResult, query: string, tokens: readonly string[]): void {
  for (const packet of result.evidence ?? []) {
    addEvidenceQueryMatch(matches, step, packet, query, tokens, "child evidence");
  }

  if (isCommandLikeResult(result) && Array.isArray(result.importantLines)) {
    for (const line of result.importantLines) {
      addImportantLineQueryMatch(matches, step, result.outputId, line, query, tokens);
    }
  }
}

function addEvidenceQueryMatch(
  matches: BatchQueryMatch[],
  step: BatchStepRoutedResult,
  packet: EvidencePacket,
  query: string,
  tokens: readonly string[],
  sourceLabel: string,
): void {
  const score = scoreQueryText(packet.excerpt, query, tokens);
  if (score <= 0) {
    return;
  }
  matches.push({
    stepId: step.id,
    stepIndex: step.index,
    stepKind: step.kind,
    source: packet.source,
    excerpt: selectQueryExcerpt(packet.excerpt, tokens),
    why: `Matched ${sourceLabel}${packet.lines ? ` lines ${packet.lines}` : ""}.`,
    score,
    ...(packet.source.kind === "vault" ? { outputId: packet.source.outputId } : {}),
    ...(packet.id ? { evidenceId: packet.id } : {}),
    ...(packet.lines ? { lines: packet.lines } : {}),
  });
}

function addImportantLineQueryMatch(
  matches: BatchQueryMatch[],
  step: BatchStepRoutedResult,
  outputId: string,
  line: ImportantLine,
  query: string,
  tokens: readonly string[],
): void {
  const score = scoreQueryText(line.excerpt, query, tokens);
  if (score <= 0) {
    return;
  }
  matches.push({
    stepId: step.id,
    stepIndex: step.index,
    stepKind: step.kind,
    source: { kind: "vault", outputId, stream: line.stream },
    excerpt: selectQueryExcerpt(line.excerpt, tokens),
    why: `Matched selected child command evidence lines ${line.lines}.`,
    score,
    outputId,
    lines: line.lines,
  });
}

function vaultQueryRefsForResult(result: RoutedResult): Array<{ outputId: string; stream: OutputStream }> {
  const refs: Array<{ outputId: string; stream: OutputStream }> = [];
  if (isCommandLikeResult(result)) {
    if (result.persistence?.recoverability === "exact") {
      refs.push({ outputId: result.outputId, stream: "combined" });
    }
    if (result.recovery?.outputId && result.recovery.outputId !== result.outputId) {
      refs.push({ outputId: result.recovery.outputId, stream: "combined" });
    }
    if (result.reducer?.outputId) {
      refs.push({ outputId: result.reducer.outputId, stream: "raw" });
    }
    if (result.scriptFilter?.outputId) {
      refs.push({ outputId: result.scriptFilter.outputId, stream: "raw" });
    }
    return refs;
  }

  if (hasOutputId(result)) {
    refs.push({ outputId: result.outputId, stream: "raw" });
  }
  const recoveryOutputId = recoveryOutputIdFor(result.recovery);
  if (recoveryOutputId && !refs.some((ref) => ref.outputId === recoveryOutputId)) {
    refs.push({ outputId: recoveryOutputId, stream: "raw" });
  }
  return refs;
}

function renderBatchSummary(options: {
  okCount: number;
  stepCount: number;
  durationMs: number;
  concurrency: number;
  queryAnswers: readonly BatchQueryAnswer[];
}): string {
  const lines = [`Batch completed ${options.okCount}/${options.stepCount} step(s) successfully in ${options.durationMs}ms with concurrency=${options.concurrency}.`];
  if (options.queryAnswers.length > 0) {
    lines.push(renderBatchQueryAnswers(options.queryAnswers));
  }
  return lines.join("\n");
}

function renderBatchQueryAnswers(answers: readonly BatchQueryAnswer[]): string {
  const lines = ["query answers:"];
  for (const answer of answers) {
    lines.push(answer.summary);
  }
  return lines.join("\n");
}

function renderBatchQueryAnswer(query: string, matches: readonly BatchQueryMatch[]): string {
  if (matches.length === 0) {
    return `- ${query}: no deterministic match in child evidence handles`;
  }
  const renderedMatches = matches.map((match) => `${match.stepId}: ${oneLine(match.excerpt, 500)}`);
  return `- ${query}: ${renderedMatches.join(" | ")}`;
}

function dedupeQueryMatches(matches: readonly BatchQueryMatch[]): BatchQueryMatch[] {
  const deduped: BatchQueryMatch[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const key = `${match.stepId}:${sourceKey(match.source)}:${match.lines ?? ""}:${match.excerpt}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(match);
  }
  return deduped;
}

function sourceKey(source: SourceRef): string {
  if (source.kind === "repo") {
    return `repo:${source.path}`;
  }
  if (source.kind === "vault") {
    return `vault:${source.outputId}:${source.stream ?? ""}`;
  }
  return `native:${source.tool}:${source.outputId}`;
}

function tokenizeQuery(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().split(/[^a-z0-9_./:-]+/).filter((token) => token.length >= 2 && !BATCH_QUERY_STOPWORDS.has(token))));
}

const BATCH_QUERY_STOPWORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with"]);

function scoreQueryText(text: string, query: string, tokens: readonly string[]): number {
  const lowerText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let score = lowerText.includes(normalizedQuery) ? 1_000 : 0;
  for (const token of tokens) {
    if (lowerText.includes(token)) {
      score += 100 + countOccurrences(lowerText, token);
    }
  }
  return score;
}

function selectQueryExcerpt(text: string, tokens: readonly string[]): string {
  const lines = splitLines(text);
  if (lines.length <= 8) {
    return truncateBytes(text, QUERY_MATCH_EXCERPT_MAX_BYTES);
  }

  const matchingIndexes = lines
    .map((line, index) => ({ line: line.toLowerCase(), index }))
    .filter(({ line }) => tokens.some((token) => line.includes(token)))
    .map(({ index }) => index);
  if (matchingIndexes.length === 0) {
    return truncateBytes(lines.slice(0, 8).join("\n"), QUERY_MATCH_EXCERPT_MAX_BYTES);
  }

  const selected = new Set<number>();
  for (const index of matchingIndexes) {
    selected.add(Math.max(0, index - 1));
    selected.add(index);
    selected.add(Math.min(lines.length - 1, index + 1));
  }
  const sorted = Array.from(selected).sort((a, b) => a - b);
  const capped = sorted.length > 24 ? [...sorted.slice(0, 12), ...sorted.slice(-12)] : sorted;
  const excerptLines: string[] = [];
  let previous = -1;
  for (const index of capped) {
    if (previous >= 0 && index > previous + 1) {
      excerptLines.push("…");
    }
    excerptLines.push(lines[index] ?? "");
    previous = index;
  }
  return truncateBytes(excerptLines.join("\n"), QUERY_MATCH_EXCERPT_MAX_BYTES);
}

function isCommandLikeResult(result: RoutedResult): result is CommandRoutedResult {
  return typeof (result as { outputId?: unknown }).outputId === "string" && "execution" in result;
}

function hasOutputId(result: RoutedResult): result is RoutedResult & { outputId: string } {
  return typeof (result as { outputId?: unknown }).outputId === "string";
}

function recoveryOutputIdFor(recovery: RecoveryHint | undefined): string | undefined {
  return typeof recovery?.outputId === "string" && recovery.outputId.length > 0 ? recovery.outputId : undefined;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let index = text.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(token, index + token.length);
  }
  return count;
}

function oneLine(text: string, maxBytes: number): string {
  return truncateBytes(text.replace(/\s+/g, " ").trim(), maxBytes);
}

function truncateBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return text;
  }
  let result = "";
  for (const char of text) {
    const candidate = `${result}${char}`;
    if (Buffer.byteLength(`${candidate}…`, "utf8") > maxBytes) {
      return `${result}…`;
    }
    result = candidate;
  }
  return result;
}

function queryDecisionSeed(answers: readonly BatchQueryAnswer[]): string {
  return answers.map((answer) => `${answer.query}:${answer.status}:${answer.matches.map((match) => `${match.stepId}:${match.score}:${match.lines ?? ""}`).join(",")}`).join("|");
}

async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await worker(item, index);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function batchValidationFailure(preserve: PreserveMode, issues: readonly BatchValidationIssue[]): BatchRoutedResult {
  return {
    toolStatus: "error",
    decisionId: decisionId("batch-validation", validationMessage(issues)),
    preserve,
    producer: { kind: "other", name: "batch" },
    persistence: { status: "not_persisted", recoverability: "none" },
    routing: {
      status: "failed",
      route: "batch",
      reason: `Invalid freeflow_batch input: ${validationMessage(issues)}`,
    },
    summary: "Batch was not executed because the input was invalid.",
    concurrency: 0,
    stepCount: 0,
    okCount: 0,
    failedCount: 0,
    steps: [],
    recovery: {
      how: "No batch steps were executed. Fix the batch schema and rerun.",
    },
  };
}

function stepDecisionSeed(steps: readonly BatchStepRoutedResult[]): string {
  return steps.map((step) => `${step.index}:${step.kind}:${step.status}:${step.result?.decisionId ?? step.error ?? "none"}`).join("|");
}

function validationMessage(issues: readonly BatchValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decisionId(...parts: string[]): string {
  return `ffdec_${hash(parts.join("\0")).slice(0, 16)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

import { ContextSourceRuntime } from "../sources/runtime.js";
import {
  contextRefForEntry,
  type ContextSourceIdentity,
  type FreeflowContextSnapshot,
  type ProjectedContextSource,
} from "../sources/types.js";
import type { ContextControlRecoveryScope } from "./config.js";
import { sha256Text, stableJson } from "./stable-json.js";
import type {
  CommandKind,
  ContextControlAutomationCatalog,
  ContextControlAutomationView,
  ContextControlSource,
  ContextControlSourceSnapshot,
  ContextCoverage,
  EvidenceRole,
  EvidenceTemporal,
  SourceCategory,
  SourceCompleteness,
  SourceFreshness,
  SourceIntegrity,
  SourcePrivacy,
} from "./types.js";

interface RecordValue {
  [key: string]: any;
}

type SourceBuildOptions = {
  sessionId: string;
  branchId: string;
  cwd: string | null;
  generation: number;
  consumedToolCallIds: ReadonlySet<string>;
  activeEntryIds: ReadonlySet<string>;
  historical: boolean;
  sessionFile?: string;
  repositoryId?: string;
  includeSessionInRef: boolean;
  scope: ContextControlRecoveryScope;
  branchIdForEntry?: (entryId: string) => string;
};

export type ContextControlCatalog = {
  scope: ContextControlRecoveryScope;
  repositoryId?: string;
  sources: readonly ContextControlSource[];
  sessions: readonly {
    sessionId: string;
    sourceCount: number;
    repositoryId?: string;
    current: boolean;
  }[];
  skippedSessions: number;
};

export type ContextControlGenericSearchTier = "active-branch" | "current-session" | "lineage" | "cross-session";
export type ContextControlGenericSearchRelation =
  "active-branch" | "sibling-branch" | "verified-fork" | "verified-clone" | "verified-lineage" | "cross-session";

export type ContextControlGenericSearchSource = {
  source: ProjectedContextSource;
  sessionId: string;
  branchId: string;
  tier: ContextControlGenericSearchTier;
  relation: ContextControlGenericSearchRelation;
  activeContext: boolean;
  visible: boolean;
  materialized: boolean;
  role: EvidenceRole;
  temporal: readonly ("current" | "historical" | "before-change" | "after-change")[];
  completeness: "complete" | "partial" | "unknown";
  privacy: "allowed" | "denied" | "unknown";
  integrity: "valid" | "invalid" | "unknown";
  freshness: "current" | "stale" | "unknown";
};

export type ContextControlGenericSearchCatalog = {
  repositoryId?: string;
  sources: readonly ContextControlGenericSearchSource[];
  sessions: readonly {
    sessionId: string;
    sourceCount: number;
    repositoryId?: string;
    current: boolean;
  }[];
  skippedSessions: number;
  skippedSources: number;
};

function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function throwIfGenericSearchAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("context_control_search_cancelled");
  error.name = "AbortError";
  throw error;
}

function integerValue(value: unknown): number | undefined {
  if (Number.isSafeInteger(value)) return value as number;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function argumentsValue(value: unknown): RecordValue {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as RecordValue;
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    return record(JSON.parse(value));
  } catch {
    return {};
  }
}

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((block) => {
      const item = record(block);
      if (item.type === "text" || item.type === "input_text") return typeof item.text === "string" ? item.text : "";
      if (item.type === "image") return typeof item.mimeType === "string" ? `[image:${item.mimeType}]` : "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function messageText(message: RecordValue): string {
  if (message.role === "bashExecution") return typeof message.output === "string" ? message.output : "";
  return textFromContent(message.content);
}

function normalizedName(value: unknown): string {
  return stringValue(value) ?? "unknown";
}

function sourcePath(name: string, args: RecordValue): string | undefined {
  if (!["read", "edit", "write"].includes(name)) return undefined;
  return stringValue(args.path ?? args.file_path ?? args.filePath);
}

function readCoverage(name: string, args: RecordValue): ContextCoverage {
  if (name !== "read") return { kind: "unknown" };
  const offset = integerValue(args.offset ?? args.startLine ?? args.start_line);
  const limit = integerValue(args.limit ?? args.lineCount ?? args.line_count);
  if (offset === undefined && limit === undefined) return { kind: "unknown" };
  if (offset !== undefined && limit !== undefined && limit > 0) {
    return { kind: "range", start: offset, end: offset + limit - 1 };
  }
  return { kind: "truncated" };
}

function commandKind(command: string): CommandKind {
  if (/\b(?:rg|ripgrep|grep|find|fd|tree)\b/i.test(command)) return "broad-search";
  if (/(?:^|[\s.])git\s+(?:status|diff)\b|\b(?:lsp|eslint|prettier\s+--check|tsc\s+--noEmit)\b/i.test(command)) {
    return "observation";
  }
  if (
    /\b(?:npm\s+(?:run\s+)?(?:test|check|build)|npm\s+test|node\s+--test|pytest|vitest|jest|tsc|cargo\s+test|go\s+test)\b/i.test(
      command,
    )
  ) {
    return "verification";
  }
  return "other";
}

const CONTEXT_CONTROL_TOOL_PATTERN = /^(?:freeflow_context|context_control)(?:$|[_-])/i;
const SENSITIVE_TOOL_NAMES = new Set([
  "thinking",
  "reasoning",
  "model_thinking",
  "details",
  "tool_detail",
  "tool_details",
  "tool-result-details",
  "tool_result_details",
  "usage",
  "context_usage",
  "token_usage",
  "admin",
  "administrative",
  "session_state",
  "context_status",
  "settings",
]);
const IMAGE_BASE64_PATTERN = /data:image\/[a-z0-9.+-]+;base64,/iu;

function normalizedToolName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function isContextControlGeneratedTool(toolName: string): boolean {
  return CONTEXT_CONTROL_TOOL_PATTERN.test(normalizedToolName(toolName));
}

export function isSensitiveRecoverySource(source: Pick<ContextControlSource, "toolName" | "content">): boolean {
  const name = normalizedToolName(source.toolName);
  return (
    isContextControlGeneratedTool(name) || SENSITIVE_TOOL_NAMES.has(name) || IMAGE_BASE64_PATTERN.test(source.content)
  );
}

export function isRecoveryEligibleSource(source: Pick<ContextControlSource, "toolName" | "content">): boolean {
  return !isSensitiveRecoverySource(source);
}

function sourceCategory(toolName: string, content: string): SourceCategory {
  const normalized = normalizedToolName(toolName);
  if (isContextControlGeneratedTool(normalized)) return "context-control";
  if (SENSITIVE_TOOL_NAMES.has(normalized)) {
    if (normalized.includes("thinking") || normalized === "reasoning") return "thinking";
    if (normalized.includes("usage")) return "usage";
    if (normalized.includes("detail")) return "tool-details";
    return "administrative";
  }
  if (IMAGE_BASE64_PATTERN.test(content)) return "image-base64";
  return "ordinary";
}

function sourceRole(toolName: string, kind: CommandKind): EvidenceRole {
  if (toolName === "read") return "source-content";
  if (toolName === "edit" || toolName === "write") return "mutation-receipt";
  if (kind === "verification") return "verification-output";
  if (kind === "observation") return "observation";
  return "source-content";
}

function sourceTemporal(toolName: string, kind: CommandKind): readonly EvidenceTemporal[] {
  if (toolName === "edit" || toolName === "write") return ["after-change"];
  if (kind === "verification" || kind === "observation") return ["current"];
  return ["current"];
}

function sourceCompleteness(toolName: string, coverage: ContextCoverage, message: RecordValue): SourceCompleteness {
  const details = record(message.details);
  if (details.truncated === true || details.truncated === "true" || coverage.kind === "truncated") return "partial";
  if (toolName === "read" && coverage.kind === "range") return "partial";
  return "complete";
}

function sourcePrivacy(category: SourceCategory): SourcePrivacy {
  return category === "ordinary" ? "allowed" : "unknown";
}

function sourceIntegrity(content: string, contentHash: string): SourceIntegrity {
  return sha256Text(content) === contentHash ? "valid" : "invalid";
}

function sourceFreshness(): SourceFreshness {
  return "current";
}

function exitCode(message: RecordValue): number | undefined {
  const details = record(message.details);
  return integerValue(message.exitCode ?? details.exitCode ?? details.exit_code ?? details.code);
}

function sourceIdentity(
  sessionId: string,
  entryId: string,
  toolCallId: string | undefined,
  toolName: string,
): ContextSourceIdentity {
  return {
    sessionId,
    entryId,
    ...(toolCallId === undefined ? {} : { toolCallId }),
    ...(toolName === "unknown" ? {} : { toolName }),
  };
}

function identityKey(identity: ContextSourceIdentity): string {
  return stableJson(identity);
}

function entryIdSet(entries: readonly unknown[]): Set<string> {
  return new Set(entries.map((entry) => stringValue(record(entry).id)).filter((id): id is string => id !== undefined));
}

function sessionHeader(entries: readonly unknown[]): RecordValue {
  return (entries.find((entry) => record(entry).type === "session") as RecordValue) ?? {};
}

function canonicalRemote(value: string): string {
  const remote = value.normalize("NFKC").trim();
  try {
    const url = new URL(remote);
    url.username = "";
    url.password = "";
    url.protocol = url.protocol.toLocaleLowerCase();
    url.hostname = url.hostname.toLocaleLowerCase();
    url.pathname = url.pathname.replace(/\.git$/iu, "").replace(/\/+$/u, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    const scp = /^(?:[^@]+@)?([^:]+):(.+)$/u.exec(remote);
    if (scp !== null) {
      return `${scp[1]!.toLocaleLowerCase()}:${scp[2]!.replace(/\.git$/iu, "").replace(/\/+$/u, "")}`;
    }
    return remote.replace(/\.git$/iu, "").replace(/\/+$/u, "");
  }
}

const repositoryIdentityCache = new Map<string, string | undefined>();

function repositoryIdentity(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const cacheKey = resolve(cwd);
  if (repositoryIdentityCache.has(cacheKey)) return repositoryIdentityCache.get(cacheKey);

  let canonical: string | undefined;
  try {
    const root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) {
      let remote = "";
      try {
        remote = execFileSync("git", ["-C", cwd, "config", "--get", "remote.origin.url"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch {
        remote = "";
      }
      if (remote) {
        canonical = `remote:${canonicalRemote(remote)}`;
      } else {
        const common = execFileSync("git", ["-C", cwd, "rev-parse", "--git-common-dir"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        canonical = `common:${resolve(cwd, common)}`;
      }
    }
  } catch {
    canonical = undefined;
  }
  const result = canonical === undefined ? undefined : `repo:${sha256Text(canonical)}`;
  repositoryIdentityCache.set(cacheKey, result);
  return result;
}

function sessionFileCandidates(ctx: any): string[] {
  const candidates = new Set<string>();
  const manager = ctx?.sessionManager;
  const currentFile = stringValue(manager?.getSessionFile?.());
  const sessionDir = stringValue(manager?.getSessionDir?.());
  if (currentFile) candidates.add(currentFile);
  if (sessionDir) candidates.add(sessionDir);
  for (const value of [process.env.PIFLOW_SESSION_DIR, process.env.PI_SESSION_DIR]) {
    if (value) candidates.add(value);
  }
  candidates.add(join(homedir(), ".piflow", "agent", "sessions"));
  candidates.add(join(homedir(), ".pi", "agent", "sessions"));
  return [...candidates];
}

function jsonlFiles(root: string, limit = 512): string[] {
  if (!existsSync(root)) return [];
  try {
    const rootInfo = lstatSync(root);
    if (rootInfo.isSymbolicLink()) return [];
    if (rootInfo.isFile()) return root.endsWith(".jsonl") ? [root] : [];
    if (!rootInfo.isDirectory()) return [];
  } catch {
    return [];
  }
  const result: string[] = [];
  const visit = (directory: string, depth: number) => {
    if (result.length >= limit || depth > 2) return;
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      if (result.length >= limit) return;
      const file = join(directory, name);
      let info: ReturnType<typeof lstatSync>;
      try {
        info = lstatSync(file);
      } catch {
        continue;
      }
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) visit(file, depth + 1);
      else if (info.isFile() && name.endsWith(".jsonl")) result.push(file);
    }
  };
  visit(root, 0);
  return result;
}

function parseSessionFile(file: string): { entries: unknown[]; header: RecordValue } | undefined {
  try {
    const entries = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { entries, header: sessionHeader(entries) };
  } catch {
    return undefined;
  }
}

function refFor(entryId: string, sessionId: string, includeSessionInRef: boolean): string {
  if (!includeSessionInRef) return contextRefForEntry(entryId);
  return `ctx:${sessionId}:${entryId}`;
}

function captureGenericSnapshot(
  entries: readonly unknown[],
  activeEntries: readonly unknown[],
  sessionId: string,
  cwd: string | null,
  leafId: string | undefined,
  projections: ReadonlyMap<string, { state: string }>,
): FreeflowContextSnapshot {
  const runtime = new ContextSourceRuntime({
    cwd,
    sessionManager: {
      getSessionId: () => sessionId,
      getLeafId: () => leafId,
      getBranch: () => entries,
      getEntries: () => entries,
      buildContextEntries: () => activeEntries,
    },
  });
  return runtime.captureSnapshot({
    contextControlEnabled: true,
    contextVirtualizationEnabled: true,
    includeContextControlResults: true,
    isSourceFullyProjected: (entryId) => {
      const projection = projections.get(contextRefForEntry(entryId));
      return projection?.state === undefined || projection.state === "full";
    },
  });
}

function genericToolMetadata(
  entries: readonly unknown[],
  sessionId: string,
  branchId: string,
  cwd: string | null,
  generation: number,
  activeEntryIds: ReadonlySet<string>,
  scope: ContextControlRecoveryScope,
  repositoryId?: string,
  includeSessionInRef = false,
  sessionFile?: string,
  branchIdForEntry?: (entryId: string) => string,
): ReadonlyMap<string, ContextControlSource> {
  const sources = buildSources(entries, {
    sessionId,
    branchId,
    cwd,
    generation,
    consumedToolCallIds: new Set<string>(),
    activeEntryIds,
    historical: true,
    includeSessionInRef,
    scope,
    ...(repositoryId === undefined ? {} : { repositoryId }),
    ...(sessionFile === undefined ? {} : { sessionFile }),
    ...(branchIdForEntry === undefined ? {} : { branchIdForEntry }),
  });
  return new Map(sources.map((source) => [source.identity.entryId, source]));
}

function rekeyProjectedSource(
  source: ProjectedContextSource,
  sessionId: string,
  currentSessionId: string,
): ProjectedContextSource {
  const entryId = source.source.source.entryId;
  const identity = { ...source.source.source, sessionId };
  return {
    ...source,
    ref: sessionId === currentSessionId ? contextRefForEntry(entryId) : `ctx:${sessionId}:${entryId}`,
    source: { ...source.source, source: identity },
  };
}

function descendantOf(entryId: string, ancestorId: string, parentById: ReadonlyMap<string, string>): boolean {
  const visited = new Set<string>();
  let current: string | undefined = entryId;
  while (current !== undefined && !visited.has(current)) {
    if (current === ancestorId) return true;
    visited.add(current);
    current = parentById.get(current);
  }
  return false;
}

function logicalBranchIdForEntries(
  allEntries: readonly unknown[],
  activeBranchEntries: readonly unknown[],
  sessionId: string,
  leafId: string | undefined,
): string {
  const activeEntryIds = entryIdSet(activeBranchEntries);
  const parentById = new Map<string, string>();
  const childrenById = new Map<string, Set<string>>();
  for (const entryValue of allEntries) {
    const entry = record(entryValue);
    const id = stringValue(entry.id);
    const parentId = stringValue(entry.parentId);
    if (id === undefined || parentId === undefined) continue;
    parentById.set(id, parentId);
    const children = childrenById.get(parentId) ?? new Set<string>();
    children.add(id);
    childrenById.set(parentId, children);
  }

  let child = leafId !== undefined && activeEntryIds.has(leafId) ? leafId : undefined;
  if (child === undefined) {
    const activeIds = [...activeEntryIds];
    child = activeIds.at(-1);
  }
  let anchor: string | undefined;
  let rootId: string | undefined = child;
  const visited = new Set<string>();
  while (child !== undefined && !visited.has(child)) {
    visited.add(child);
    const parent = parentById.get(child);
    if (parent === undefined) {
      rootId = child;
      break;
    }
    if ((childrenById.get(parent)?.size ?? 0) > 1) anchor = child;
    rootId = parent;
    child = parent;
  }
  if (anchor !== undefined) return `branch:${anchor}`;
  return rootId === undefined ? `branch:${sessionId}` : `branch:${rootId}`;
}

function branchIdForEntries(
  entries: readonly unknown[],
  activeEntryIds: ReadonlySet<string>,
  activeBranchId: string,
): (entryId: string) => string {
  const parentById = new Map<string, string>();
  for (const entryValue of entries) {
    const entry = record(entryValue);
    const id = stringValue(entry.id);
    const parentId = stringValue(entry.parentId);
    if (id !== undefined && parentId !== undefined) parentById.set(id, parentId);
  }
  return (entryId: string): string => {
    if (activeEntryIds.has(entryId)) return activeBranchId;
    let current = entryId;
    let anchor = entryId;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const parent = parentById.get(current);
      if (parent === undefined || activeEntryIds.has(parent)) break;
      anchor = parent;
      current = parent;
    }
    return `branch:${anchor}`;
  };
}

function buildSources(entries: readonly unknown[], options: SourceBuildOptions): ContextControlSource[] {
  const calls = new Map<string, { name: string; args: RecordValue; turn: number }>();
  const duplicateCalls = new Set<string>();
  const historicallyConsumed = new Set<string>();
  const parentById = new Map<string, string>();
  for (const entryValue of entries) {
    const entry = record(entryValue);
    const id = stringValue(entry.id);
    const parentId = stringValue(entry.parentId);
    if (id !== undefined && parentId !== undefined) parentById.set(id, parentId);
  }
  let turn = 0;
  for (const [index, entryValue] of entries.entries()) {
    const entry = record(entryValue);
    const message = record(entry.message);
    if (message.role === "user") turn += 1;
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        const item = record(block);
        const id = stringValue(item.id);
        if (item.type !== "toolCall" && item.type !== "tool_use") continue;
        if (id === undefined) continue;
        if (calls.has(id)) duplicateCalls.add(id);
        calls.set(id, { name: normalizedName(item.name), args: argumentsValue(item.arguments ?? item.input), turn });
      }
    }
    const assistantEntryId = stringValue(entry.id);
    if (!options.historical || message.role !== "assistant" || assistantEntryId === undefined) continue;
    for (const previous of entries.slice(0, index)) {
      const previousRecord = record(previous);
      const previousMessage = record(previousRecord.message);
      const previousEntryId = stringValue(previousRecord.id);
      if (previousMessage.role !== "toolResult" || previousEntryId === undefined) continue;
      const toolCallId = stringValue(previousMessage.toolCallId);
      if (toolCallId && descendantOf(assistantEntryId, previousEntryId, parentById)) {
        historicallyConsumed.add(toolCallId);
      }
    }
  }

  const sources: ContextControlSource[] = [];
  for (const [sequence, entryValue] of entries.entries()) {
    const entry = record(entryValue);
    const message = record(entry.message);
    if (message.role !== "toolResult") continue;

    const entryId = stringValue(entry.id) ?? `entry-${sequence}`;
    const toolCallId = stringValue(message.toolCallId);
    const call = toolCallId === undefined ? undefined : calls.get(toolCallId);
    const toolName = call?.name ?? normalizedName(message.toolName);
    const args = call?.args ?? {};
    const command = toolName === "bash" ? (stringValue(args.command ?? args.cmd ?? args.input) ?? "") : "";
    const path = sourcePath(toolName, args);
    const content = messageText(message);
    const issues: string[] = [];
    if (options.sessionId === "unknown-session") issues.push("session-id-missing");
    if (options.branchId === options.sessionId) issues.push("branch-id-unresolved");
    if (entry.id === undefined) issues.push("entry-id-missing");
    if (toolCallId === undefined) issues.push("tool-call-id-missing");
    if (call === undefined) issues.push("unmatched-tool-call");
    if (duplicateCalls.has(toolCallId ?? "")) issues.push("duplicate-tool-call");
    if (toolName === "unknown") issues.push("tool-name-missing");
    if (stringValue(entry.timestamp) === undefined) issues.push("timestamp-missing");
    if (options.cwd === null) issues.push("cwd-missing");

    const identity = sourceIdentity(options.sessionId, entryId, toolCallId, toolName);
    const consumed =
      (toolCallId !== undefined && options.consumedToolCallIds.has(toolCallId)) ||
      (options.historical && toolCallId !== undefined && historicallyConsumed.has(toolCallId));
    const code = exitCode(message);
    const coverage = readCoverage(toolName, args);
    const contentHash = sha256Text(content);
    const kind = commandKind(command);
    const category = sourceCategory(toolName, content);
    const source: ContextControlSource = {
      ref: refFor(entryId, options.sessionId, options.includeSessionInRef),
      identity,
      content,
      contentHash,
      characters: content.length,
      toolName,
      ...(path === undefined ? {} : { path }),
      ...(command === "" ? {} : { command, commandFingerprint: sha256Text(stableJson({ command, cwd: options.cwd })) }),
      commandKind: kind,
      cwd: options.cwd,
      branchId: options.branchIdForEntry?.(entryId) ?? options.branchId,
      sequence,
      turn: call?.turn ?? turn,
      producedAt: stringValue(entry.timestamp) ?? "unknown",
      coverage,
      completeness: sourceCompleteness(toolName, coverage, message),
      ...(typeof message.isError === "boolean" ? { isError: message.isError } : {}),
      ...(code === undefined ? {} : { exitCode: code }),
      consumed,
      ...(consumed ? { consumptionGeneration: Math.max(1, options.generation) } : {}),
      consumptionEvidence: consumed ? "confirmed" : "unconfirmed",
      metadataComplete: issues.length === 0,
      metadataIssues: Object.freeze([...issues]),
      activeContext: options.activeEntryIds.has(entryId),
      role: sourceRole(toolName, kind),
      temporal: sourceTemporal(toolName, kind),
      category,
      privacy: sourcePrivacy(category),
      integrity: sourceIntegrity(content, contentHash),
      freshness: sourceFreshness(),
      scope: options.scope,
      ...(options.sessionFile === undefined ? {} : { sessionFile: options.sessionFile }),
      ...(options.repositoryId === undefined ? {} : { repositoryId: options.repositoryId }),
    };
    sources.push(source);
  }
  return sources;
}

type AutomationRefDisposition = {
  lane: "protected" | "excluded";
  reason: string;
};

function automationRefDisposition(
  source: ContextControlSource,
  requiredScope: ContextControlRecoveryScope = "active-branch",
): AutomationRefDisposition | undefined {
  if (isContextControlGeneratedTool(source.toolName)) {
    return { lane: "excluded", reason: "context-control-source" };
  }
  if (isSensitiveRecoverySource(source)) {
    return { lane: "excluded", reason: "sensitive-source" };
  }
  if (source.category !== "ordinary") {
    return { lane: "excluded", reason: `source-category-${source.category ?? "unknown"}` };
  }
  if (source.identity.toolCallId === undefined) {
    return { lane: "protected", reason: "tool-call-identity-incomplete" };
  }
  if (!source.consumed) {
    return { lane: "protected", reason: "unconsumed-result" };
  }
  if (source.consumptionEvidence !== "confirmed") {
    return { lane: "protected", reason: "consumption-unconfirmed" };
  }
  if (!source.metadataComplete || source.metadataIssues.length > 0) {
    return { lane: "protected", reason: "incomplete-source-metadata" };
  }
  if (source.completeness !== "complete") {
    return { lane: "protected", reason: "incomplete-source-content" };
  }
  if (source.freshness !== "current") {
    return { lane: "protected", reason: "stale-source" };
  }
  if (source.privacy !== "allowed") {
    return { lane: "protected", reason: "source-privacy-not-allowed" };
  }
  if (source.integrity !== "valid") {
    return { lane: "protected", reason: "source-integrity-invalid" };
  }
  if (source.scope !== requiredScope) {
    return { lane: "protected", reason: "automation-scope-invalid" };
  }
  return undefined;
}

function deduplicateSources(sources: readonly ContextControlSource[]): ContextControlSource[] {
  const byIdentity = new Map<string, ContextControlSource>();
  for (const source of sources) {
    const key = identityKey(source.identity);
    const existing = byIdentity.get(key);
    if (!existing || (source.activeContext && !existing.activeContext)) byIdentity.set(key, source);
  }
  return [...byIdentity.values()].sort((left, right) => {
    return (
      left.identity.sessionId.localeCompare(right.identity.sessionId) ||
      left.sequence - right.sequence ||
      left.ref.localeCompare(right.ref)
    );
  });
}

export class ContextControlSourceRegistry {
  private lastCatalog: ContextControlCatalog | undefined;

  constructor(private ctx: any) {}

  setContext(ctx: any): void {
    this.ctx = ctx;
  }

  snapshot(consumedToolCallIds: ReadonlySet<string>, generation: number): ContextControlSourceSnapshot {
    const manager = this.ctx?.sessionManager;
    const sessionId = stringValue(manager?.getSessionId?.()) ?? "unknown-session";
    const branchEntries = Array.isArray(manager?.getBranch?.()) ? manager.getBranch() : [];
    const allEntries = Array.isArray(manager?.getEntries?.()) ? manager.getEntries() : branchEntries;
    const activeEntries = Array.isArray(manager?.buildContextEntries?.())
      ? manager.buildContextEntries()
      : branchEntries;
    const branchId = logicalBranchIdForEntries(
      allEntries,
      branchEntries,
      sessionId,
      stringValue(manager?.getLeafId?.()),
    );
    const sources = buildSources(branchEntries, {
      sessionId,
      branchId,
      cwd: stringValue(this.ctx?.cwd) ?? stringValue(sessionHeader(branchEntries).cwd) ?? null,
      generation,
      consumedToolCallIds,
      activeEntryIds: entryIdSet(activeEntries),
      historical: true,
      includeSessionInRef: false,
      scope: "active-branch",
    });
    const byRef = new Map<string, ContextControlSource>();
    const byToolCallId = new Map<string, ContextControlSource>();
    for (const source of sources) {
      byRef.set(source.ref, source);
      if (source.identity.toolCallId !== undefined && !byToolCallId.has(source.identity.toolCallId)) {
        byToolCallId.set(source.identity.toolCallId, source);
      }
    }
    return {
      sessionId,
      branchId,
      generation,
      sources: Object.freeze(sources),
      branchIds: Object.freeze([...entryIdSet(branchEntries)]),
      byRef,
      byToolCallId,
    };
  }

  automationView(snapshot: ContextControlSourceSnapshot): ContextControlAutomationView {
    const sources: ContextControlSource[] = [];
    const protectedRefs: { ref: string; reason: string }[] = [];
    const excludedRefs: { ref: string; reason: string }[] = [];
    for (const source of snapshot.sources) {
      const disposition = automationRefDisposition(source);
      if (disposition === undefined) {
        sources.push(source);
        continue;
      }
      const item = Object.freeze({ ref: source.ref, reason: disposition.reason });
      if (disposition.lane === "protected") protectedRefs.push(item);
      else excludedRefs.push(item);
    }
    return {
      sessionId: snapshot.sessionId,
      branchId: snapshot.branchId,
      generation: snapshot.generation,
      sources: Object.freeze(sources),
      protected: Object.freeze(protectedRefs),
      excluded: Object.freeze(excludedRefs),
    };
  }

  automationCatalog(
    scope: ContextControlRecoveryScope,
    consumedToolCallIds: ReadonlySet<string>,
    generation: number,
  ): ContextControlAutomationCatalog {
    const catalog = this.recoveryCatalog(scope, consumedToolCallIds, generation);
    const sources: ContextControlSource[] = [];
    const protectedRefs: { ref: string; reason: string }[] = [];
    const excludedRefs: { ref: string; reason: string }[] = [];
    for (const source of catalog.sources) {
      const disposition = automationRefDisposition(source, scope);
      if (disposition === undefined) {
        sources.push(source);
        continue;
      }
      const item = Object.freeze({ ref: source.ref, reason: disposition.reason });
      if (disposition.lane === "protected") protectedRefs.push(item);
      else excludedRefs.push(item);
    }
    const eligibleCounts = new Map<string, number>();
    for (const source of sources) {
      eligibleCounts.set(source.identity.sessionId, (eligibleCounts.get(source.identity.sessionId) ?? 0) + 1);
    }
    return {
      scope: catalog.scope,
      ...(catalog.repositoryId === undefined ? {} : { repositoryId: catalog.repositoryId }),
      sources: Object.freeze(sources),
      sessions: Object.freeze(
        catalog.sessions.map((session) => ({
          ...session,
          sourceCount: eligibleCounts.get(session.sessionId) ?? 0,
        })),
      ),
      skippedSessions: catalog.skippedSessions,
      protected: Object.freeze(protectedRefs),
      excluded: Object.freeze(excludedRefs),
    };
  }

  recoveryCatalog(
    scope: ContextControlRecoveryScope,
    consumedToolCallIds: ReadonlySet<string>,
    generation: number,
  ): ContextControlCatalog {
    const current = this.snapshot(consumedToolCallIds, generation);
    if (scope === "active-branch") {
      const catalog = {
        scope,
        repositoryId: repositoryIdentity(stringValue(this.ctx?.cwd)),
        sources: current.sources,
        sessions: [{ sessionId: current.sessionId, sourceCount: current.sources.length, current: true }],
        skippedSessions: 0,
      } satisfies ContextControlCatalog;
      this.lastCatalog = catalog;
      return catalog;
    }

    const manager = this.ctx?.sessionManager;
    const allEntries = Array.isArray(manager?.getEntries?.()) ? manager.getEntries() : (manager?.getBranch?.() ?? []);
    const activeEntries = Array.isArray(manager?.buildContextEntries?.()) ? manager.buildContextEntries() : [];
    const cwd = stringValue(this.ctx?.cwd) ?? null;
    const repositoryId = repositoryIdentity(cwd ?? undefined);
    const activeEntryIds = entryIdSet(activeEntries);
    const currentSources = buildSources(allEntries, {
      sessionId: current.sessionId,
      branchId: current.branchId,
      cwd,
      generation,
      consumedToolCallIds,
      activeEntryIds,
      historical: true,
      includeSessionInRef: false,
      scope,
      repositoryId,
      sessionFile: stringValue(manager?.getSessionFile?.()),
      branchIdForEntry: branchIdForEntries(allEntries, new Set(current.branchIds ?? []), current.branchId),
    });
    const allSources = [...currentSources];
    const sessions = [
      {
        sessionId: current.sessionId,
        sourceCount: currentSources.length,
        ...(repositoryId ? { repositoryId } : {}),
        current: true,
      },
    ];
    let skippedSessions = 0;

    if (scope === "current-project") {
      const currentFile = stringValue(manager?.getSessionFile?.());
      let normalizedCurrentFile: string | undefined;
      if (currentFile) {
        try {
          normalizedCurrentFile = realpathSync(currentFile);
        } catch {
          normalizedCurrentFile = resolve(currentFile);
        }
      }
      const seenFiles = new Set<string>();
      for (const root of sessionFileCandidates(this.ctx)) {
        for (const file of jsonlFiles(root)) {
          let normalizedFile: string;
          try {
            normalizedFile = realpathSync(file);
          } catch {
            normalizedFile = resolve(file);
          }
          if (seenFiles.has(normalizedFile) || normalizedFile === normalizedCurrentFile) continue;
          seenFiles.add(normalizedFile);
          const parsed = parseSessionFile(normalizedFile);
          const header = parsed?.header;
          const sessionId = stringValue(header?.id);
          const sessionCwd = stringValue(header?.cwd);
          if (!parsed || !sessionId || !sessionCwd || !repositoryId || sessionId === current.sessionId) {
            skippedSessions += 1;
            continue;
          }
          const candidateRepositoryId = repositoryIdentity(sessionCwd);
          if (!candidateRepositoryId || candidateRepositoryId !== repositoryId) {
            skippedSessions += 1;
            continue;
          }
          const sources = buildSources(parsed.entries, {
            sessionId,
            branchId: `${sessionId}:root`,
            cwd: sessionCwd,
            generation,
            consumedToolCallIds: new Set<string>(),
            activeEntryIds: new Set<string>(),
            historical: true,
            includeSessionInRef: true,
            scope: "current-project",
            repositoryId: candidateRepositoryId,
            sessionFile: normalizedFile,
          });
          allSources.push(...sources);
          sessions.push({
            sessionId,
            sourceCount: sources.length,
            repositoryId: candidateRepositoryId,
            current: false,
          });
        }
      }
    }

    const catalog = {
      scope,
      ...(repositoryId ? { repositoryId } : {}),
      sources: Object.freeze(deduplicateSources(allSources)),
      sessions: Object.freeze(sessions),
      skippedSessions,
    } satisfies ContextControlCatalog;
    this.lastCatalog = catalog;
    return catalog;
  }

  genericSearchCatalog(
    scope: ContextControlRecoveryScope,
    projections: ReadonlyMap<string, { state: string }>,
    generation: number,
    signal?: AbortSignal,
  ): ContextControlGenericSearchCatalog {
    throwIfGenericSearchAborted(signal);
    const current = this.snapshot(new Set<string>(), generation);
    const manager = this.ctx?.sessionManager;
    const branchEntries = Array.isArray(manager?.getBranch?.()) ? manager.getBranch() : [];
    const allEntries = Array.isArray(manager?.getEntries?.()) ? manager.getEntries() : branchEntries;
    const activeEntries = Array.isArray(manager?.buildContextEntries?.())
      ? manager.buildContextEntries()
      : branchEntries;
    const cwd = stringValue(this.ctx?.cwd) ?? stringValue(sessionHeader(branchEntries).cwd) ?? null;
    const repositoryId = repositoryIdentity(cwd ?? undefined);
    const branchIds = entryIdSet(branchEntries);
    const branchForEntry = branchIdForEntries(allEntries, branchIds, current.branchId);
    const currentEntries = scope === "active-branch" ? branchEntries : allEntries;
    throwIfGenericSearchAborted(signal);
    const currentSnapshot = captureGenericSnapshot(
      currentEntries,
      activeEntries,
      current.sessionId,
      cwd,
      stringValue(manager?.getLeafId?.()),
      projections,
    );
    throwIfGenericSearchAborted(signal);
    const sources: ContextControlGenericSearchSource[] = [];
    let skippedSources = currentSnapshot.skippedEntries;

    const addSources = (
      snapshot: FreeflowContextSnapshot,
      sessionId: string,
      tier: ContextControlGenericSearchTier,
      relation: ContextControlGenericSearchRelation,
      branchIdForSource: (entryId: string) => string,
      toolMetadata: ReadonlyMap<string, ContextControlSource>,
    ) => {
      for (const projected of snapshot.entries.values()) {
        throwIfGenericSearchAborted(signal);
        const entryId = projected.source.source.entryId;
        const source = rekeyProjectedSource(projected, sessionId, current.sessionId);
        const metadata = toolMetadata.get(entryId);
        const isToolResult = source.kind === "toolResult";
        sources.push({
          source,
          sessionId,
          branchId: branchIdForSource(entryId),
          tier,
          relation,
          activeContext: snapshot.activeEntryIds.has(entryId),
          visible: snapshot.visibleSourceIds.has(entryId),
          materialized: snapshot.materializedSourceIds.has(entryId),
          role: isToolResult ? (metadata?.role ?? "source-content") : "source-content",
          temporal: tier === "active-branch" ? ["current"] : ["historical"],
          completeness: isToolResult ? (metadata?.completeness ?? "unknown") : "complete",
          privacy: isToolResult ? (metadata?.privacy ?? "unknown") : "allowed",
          integrity: isToolResult ? (metadata?.integrity ?? "unknown") : "valid",
          freshness: isToolResult ? (metadata?.freshness ?? "unknown") : "current",
        });
      }
      skippedSources += snapshot.skippedEntries;
    };

    const currentToolMetadata = genericToolMetadata(
      currentEntries,
      current.sessionId,
      current.branchId,
      cwd,
      generation,
      entryIdSet(activeEntries),
      scope,
      repositoryId,
      false,
      stringValue(manager?.getSessionFile?.()),
      branchForEntry,
    );
    addSources(
      currentSnapshot,
      current.sessionId,
      "active-branch",
      "active-branch",
      branchForEntry,
      currentToolMetadata,
    );
    if (scope === "active-branch") {
      const activeSources = sources.filter((candidate) => candidate.branchId === current.branchId);
      sources.splice(0, sources.length, ...activeSources);
    } else {
      for (const candidate of sources) {
        if (candidate.branchId !== current.branchId) {
          Object.assign(candidate, {
            tier: "current-session",
            relation: "sibling-branch",
            temporal: ["historical"],
          });
        }
      }
    }

    const sessions = [
      {
        sessionId: current.sessionId,
        sourceCount: sources.filter((source) => source.sessionId === current.sessionId).length,
        ...(repositoryId === undefined ? {} : { repositoryId }),
        current: true,
      },
    ];
    let skippedSessions = 0;

    if (scope === "current-project" && repositoryId !== undefined) {
      const currentFile = stringValue(manager?.getSessionFile?.());
      let normalizedCurrentFile: string | undefined;
      if (currentFile) {
        try {
          normalizedCurrentFile = realpathSync(currentFile);
        } catch {
          normalizedCurrentFile = resolve(currentFile);
        }
      }
      const seenFiles = new Set<string>();
      for (const root of sessionFileCandidates(this.ctx)) {
        throwIfGenericSearchAborted(signal);
        for (const file of jsonlFiles(root)) {
          throwIfGenericSearchAborted(signal);
          let normalizedFile: string;
          try {
            normalizedFile = realpathSync(file);
          } catch {
            normalizedFile = resolve(file);
          }
          if (seenFiles.has(normalizedFile) || normalizedFile === normalizedCurrentFile) continue;
          seenFiles.add(normalizedFile);
          const parsed = parseSessionFile(normalizedFile);
          const header = parsed?.header;
          const sessionId = stringValue(header?.id);
          const sessionCwd = stringValue(header?.cwd);
          if (!parsed || !sessionId || !sessionCwd || sessionId === current.sessionId) {
            skippedSessions += 1;
            continue;
          }
          const candidateRepositoryId = repositoryIdentity(sessionCwd);
          if (candidateRepositoryId === undefined || candidateRepositoryId !== repositoryId) {
            skippedSessions += 1;
            continue;
          }
          throwIfGenericSearchAborted(signal);
          const externalSnapshot = captureGenericSnapshot(
            parsed.entries,
            [],
            sessionId,
            sessionCwd,
            undefined,
            new Map(),
          );
          throwIfGenericSearchAborted(signal);
          const externalToolMetadata = genericToolMetadata(
            parsed.entries,
            sessionId,
            `${sessionId}:root`,
            sessionCwd,
            generation,
            new Set<string>(),
            "current-project",
            candidateRepositoryId,
            true,
            normalizedFile,
          );
          const before = sources.length;
          addSources(
            externalSnapshot,
            sessionId,
            "cross-session",
            "cross-session",
            () => `${sessionId}:root`,
            externalToolMetadata,
          );
          sessions.push({
            sessionId,
            sourceCount: sources.length - before,
            repositoryId: candidateRepositoryId,
            current: false,
          });
        }
      }
    } else if (scope === "current-project") {
      skippedSessions += 1;
    }

    return {
      ...(repositoryId === undefined ? {} : { repositoryId }),
      sources: Object.freeze(sources),
      sessions: Object.freeze(sessions),
      skippedSessions,
      skippedSources,
    };
  }

  latestCatalog(): ContextControlCatalog | undefined {
    return this.lastCatalog;
  }
}

export function sourceIdentityKey(identity: ContextSourceIdentity): string {
  return identityKey(identity);
}

export function repositoryIdentityForCwd(cwd: string | undefined): string | undefined {
  return repositoryIdentity(cwd);
}

export function isSessionPath(value: string | undefined): boolean {
  return Boolean(value && value.split(sep).includes("sessions"));
}

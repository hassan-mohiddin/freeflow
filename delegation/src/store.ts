import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  agentPaths,
  delegationRootForRepo,
  parentDirectory,
  safeModelFilePath,
  taskPaths,
  validateSafeId,
} from "./paths.js";
import type {
  AgentManifest,
  AgentRegistryEntry,
  AgentStatus,
  DelegationEvent,
  DelegationIndex,
  DelegationIndexTaskEntry,
  DelegationProfile,
  DelegationRegistry,
  DelegationRole,
  DelegationState,
  DelegationTaskMetadata,
  JsonValue,
} from "./types.js";

export interface DelegationStoreOptions {
  root?: string;
  repoRoot?: string;
  now?: () => string;
}

export interface InitTaskInput {
  taskId: string;
  goal?: string;
  parentTaskId?: string;
  state?: DelegationState;
  createdAt?: string;
}

export interface RegisterAgentInput {
  taskId: string;
  agentId: string;
  role: DelegationRole;
  profile?: DelegationProfile;
  parentAgentId?: string;
  cwd?: string;
  writeScope?: string;
  allowedCommands?: string[];
  state?: DelegationState;
  createdAt?: string;
  paneRef?: string;
  surfaceRef?: string;
  workspaceRef?: string;
  windowRef?: string;
  launchCommand?: string;
}

export interface AppendEventInput {
  type: string;
  state?: DelegationState;
  message?: string;
  data?: JsonValue;
  timestamp?: string;
}

export class DelegationStore {
  readonly root: string;
  private readonly now: () => string;

  constructor(options: DelegationStoreOptions = {}) {
    if (options.root === undefined && options.repoRoot === undefined) {
      throw new Error("DelegationStore requires either root or repoRoot");
    }
    if (options.root !== undefined && (options.root.length === 0 || options.root.trim() !== options.root)) {
      throw new Error("delegation root must be a non-empty path without surrounding whitespace");
    }
    this.root = resolve(options.root ?? delegationRootForRepo(options.repoRoot ?? ""));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async ensureStore(): Promise<DelegationIndex> {
    await mkdir(taskPathsRoot(this.root), { recursive: true });
    const indexPath = this.indexPath();
    if (!(await fileExists(indexPath))) {
      const index: DelegationIndex = { version: 1, tasks: [], updatedAt: this.now() };
      await writeJson(indexPath, index);
      return index;
    }
    return readJson<DelegationIndex>(indexPath);
  }

  async initTask(input: InitTaskInput): Promise<DelegationTaskMetadata> {
    const taskId = validateSafeId(input.taskId, "task id");
    const paths = taskPaths(this.root, taskId);
    const timestamp = input.createdAt ?? this.now();
    await mkdir(paths.modelDir, { recursive: true });
    await mkdir(paths.agentsDir, { recursive: true });

    const existing = (await fileExists(paths.taskJson))
      ? await readJson<DelegationTaskMetadata>(paths.taskJson)
      : undefined;

    const task: DelegationTaskMetadata = {
      taskId,
      state: input.state ?? existing?.state ?? "created",
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: this.now(),
    };
    if (input.goal !== undefined) {
      task.goal = input.goal;
    } else if (existing?.goal !== undefined) {
      task.goal = existing.goal;
    }
    if (input.parentTaskId !== undefined) {
      task.parentTaskId = validateSafeId(input.parentTaskId, "parent task id");
    } else if (existing?.parentTaskId !== undefined) {
      task.parentTaskId = existing.parentTaskId;
    }

    await writeJson(paths.taskJson, task);
    if (!(await fileExists(paths.registryJson))) {
      const registry: DelegationRegistry = { taskId, agents: [], updatedAt: this.now() };
      await writeJson(paths.registryJson, registry);
    }
    await ensureTextFile(paths.eventsJsonl, "");
    await ensureTextFile(paths.decisionsMd, "");
    await this.upsertIndexEntry(task, paths.taskDir);
    return task;
  }

  async readTask(taskId: string): Promise<DelegationTaskMetadata> {
    return readJson<DelegationTaskMetadata>(taskPaths(this.root, taskId).taskJson);
  }

  async writeTask(task: DelegationTaskMetadata): Promise<void> {
    const paths = taskPaths(this.root, task.taskId);
    const updated: DelegationTaskMetadata = { ...task, updatedAt: this.now() };
    await writeJson(paths.taskJson, updated);
    await this.upsertIndexEntry(updated, paths.taskDir);
  }

  async registerAgent(input: RegisterAgentInput): Promise<AgentManifest> {
    const taskId = validateSafeId(input.taskId, "task id");
    const agentId = validateSafeId(input.agentId, "agent id");
    await this.initTask({ taskId });

    const paths = agentPaths(this.root, taskId, agentId);
    await mkdir(paths.modelDir, { recursive: true });
    const timestamp = input.createdAt ?? this.now();
    const profile = input.profile ?? input.role;

    const manifest: AgentManifest = {
      taskId,
      agentId,
      role: input.role,
      profile,
      createdAt: timestamp,
      updatedAt: this.now(),
      modelTaskPacketPath: paths.taskPacketRaw,
      resultRawPath: paths.resultRaw,
      resultJsonPath: paths.resultJson,
    };
    if (input.parentAgentId !== undefined) {
      manifest.parentAgentId = validateSafeId(input.parentAgentId, "parent agent id");
    }
    if (input.cwd !== undefined) {
      manifest.cwd = input.cwd;
    }
    if (input.writeScope !== undefined) {
      manifest.writeScope = input.writeScope;
    }
    if (input.allowedCommands !== undefined) {
      manifest.allowedCommands = [...input.allowedCommands];
    }
    if (input.paneRef !== undefined) {
      manifest.paneRef = input.paneRef;
    }
    if (input.surfaceRef !== undefined) {
      manifest.surfaceRef = input.surfaceRef;
    }
    if (input.workspaceRef !== undefined) {
      manifest.workspaceRef = input.workspaceRef;
    }
    if (input.windowRef !== undefined) {
      manifest.windowRef = input.windowRef;
    }
    if (input.launchCommand !== undefined) {
      manifest.launchCommand = input.launchCommand;
    }

    const state = input.state ?? "created";
    const status: AgentStatus = { taskId, agentId, state, updatedAt: this.now() };
    await writeJson(paths.manifestJson, manifest);
    await writeJson(paths.statusJson, status);
    await ensureTextFile(paths.eventsJsonl, "");
    await ensureTextFile(paths.notesMd, "");
    await ensureTextFile(paths.transcriptLog, "");
    await ensureTextFile(paths.screenLog, "");
    await this.upsertRegistryEntry(taskId, {
      agentId,
      role: input.role,
      profile,
      state,
      manifestPath: paths.manifestJson,
      statusPath: paths.statusJson,
      createdAt: timestamp,
      updatedAt: this.now(),
      ...(manifest.parentAgentId !== undefined ? { parentAgentId: manifest.parentAgentId } : {}),
    });
    return manifest;
  }

  async readRegistry(taskId: string): Promise<DelegationRegistry> {
    return readJson<DelegationRegistry>(taskPaths(this.root, taskId).registryJson);
  }

  async readAgentManifest(taskId: string, agentId: string): Promise<AgentManifest> {
    return readJson<AgentManifest>(agentPaths(this.root, taskId, agentId).manifestJson);
  }

  async updateAgentManifest(taskId: string, agentId: string, patch: Partial<AgentManifest>): Promise<AgentManifest> {
    const current = await this.readAgentManifest(taskId, agentId);
    const updated: AgentManifest = { ...current, updatedAt: this.now() };
    for (const [key, value] of Object.entries(patch)) {
      if (key === "taskId" || key === "agentId" || key === "createdAt" || key === "updatedAt") {
        continue;
      }
      if (value !== undefined) {
        (updated as unknown as Record<string, unknown>)[key] = value;
      }
    }
    await writeJson(agentPaths(this.root, taskId, agentId).manifestJson, updated);
    return updated;
  }

  async writeAgentStatus(taskId: string, agentId: string, status: Omit<AgentStatus, "taskId" | "agentId" | "updatedAt">): Promise<AgentStatus> {
    const ids = { taskId: validateSafeId(taskId, "task id"), agentId: validateSafeId(agentId, "agent id") };
    const updated: AgentStatus = {
      taskId: ids.taskId,
      agentId: ids.agentId,
      state: status.state,
      updatedAt: this.now(),
    };
    if (status.message !== undefined) {
      updated.message = status.message;
    }
    if (status.reason !== undefined) {
      updated.reason = status.reason;
    }
    await writeJson(agentPaths(this.root, ids.taskId, ids.agentId).statusJson, updated);
    await this.updateRegistryState(ids.taskId, ids.agentId, updated.state);
    return updated;
  }

  async readAgentStatus(taskId: string, agentId: string): Promise<AgentStatus> {
    return readJson<AgentStatus>(agentPaths(this.root, taskId, agentId).statusJson);
  }

  async appendTaskEvent(taskId: string, input: AppendEventInput): Promise<DelegationEvent> {
    const safeTaskId = validateSafeId(taskId, "task id");
    const event = this.buildEvent(safeTaskId, "task", input);
    await appendJsonLine(taskPaths(this.root, safeTaskId).eventsJsonl, event);
    return event;
  }

  async appendAgentEvent(taskId: string, agentId: string, input: AppendEventInput): Promise<DelegationEvent> {
    const safeTaskId = validateSafeId(taskId, "task id");
    const safeAgentId = validateSafeId(agentId, "agent id");
    const event = this.buildEvent(safeTaskId, "agent", input, safeAgentId);
    await appendJsonLine(agentPaths(this.root, safeTaskId, safeAgentId).eventsJsonl, event);
    return event;
  }

  async writeTaskModelText(taskId: string, fileName: string, text: string): Promise<string> {
    const paths = taskPaths(this.root, taskId);
    const target = safeModelFilePath(paths.modelDir, fileName);
    await writeText(target, text);
    return target;
  }

  async writeAgentModelText(taskId: string, agentId: string, fileName: string, text: string): Promise<string> {
    const paths = agentPaths(this.root, taskId, agentId);
    const target = safeModelFilePath(paths.modelDir, fileName);
    await writeText(target, text);
    return target;
  }

  async recordAgentResult(taskId: string, agentId: string, rawText: string, parsedResult: unknown): Promise<{ rawPath: string; jsonPath: string }> {
    const paths = agentPaths(this.root, taskId, agentId);
    await writeText(paths.resultRaw, rawText);
    await writeJson(paths.resultJson, parsedResult);
    return { rawPath: paths.resultRaw, jsonPath: paths.resultJson };
  }

  async appendAgentTextLog(taskId: string, agentId: string, logName: "screen" | "transcript", text: string): Promise<string> {
    const paths = agentPaths(this.root, taskId, agentId);
    const target = logName === "screen" ? paths.screenLog : paths.transcriptLog;
    await mkdir(parentDirectory(target), { recursive: true });
    await appendFile(target, text, "utf8");
    return target;
  }

  async recordTaskReport(taskId: string, reportName: "planning-report" | "execution-kickoff" | "execution-report", rawText: string, parsedReport: unknown): Promise<{ rawPath: string; jsonPath: string }> {
    const paths = taskPaths(this.root, taskId);
    const rawByName = {
      "planning-report": paths.planningReportRaw,
      "execution-kickoff": paths.executionKickoffRaw,
      "execution-report": paths.executionReportRaw,
    } as const;
    const jsonByName = {
      "planning-report": paths.planningReportJson,
      "execution-kickoff": paths.executionKickoffJson,
      "execution-report": paths.executionReportJson,
    } as const;
    const rawPath = rawByName[reportName];
    const jsonPath = jsonByName[reportName];
    await writeText(rawPath, rawText);
    await writeJson(jsonPath, parsedReport);
    return { rawPath, jsonPath };
  }

  pathsForTask(taskId: string) {
    return taskPaths(this.root, taskId);
  }

  pathsForAgent(taskId: string, agentId: string) {
    return agentPaths(this.root, taskId, agentId);
  }

  private indexPath(): string {
    return resolve(this.root, "index.json");
  }

  private buildEvent(taskId: string, scope: "task" | "agent", input: AppendEventInput, agentId?: string): DelegationEvent {
    const event: DelegationEvent = {
      timestamp: input.timestamp ?? this.now(),
      taskId,
      type: input.type,
      scope,
    };
    if (agentId !== undefined) {
      event.agentId = agentId;
    }
    if (input.state !== undefined) {
      event.state = input.state;
    }
    if (input.message !== undefined) {
      event.message = input.message;
    }
    if (input.data !== undefined) {
      event.data = input.data;
    }
    return event;
  }

  private async upsertIndexEntry(task: DelegationTaskMetadata, taskDir: string): Promise<void> {
    const index = await this.ensureStore();
    const entry: DelegationIndexTaskEntry = {
      taskId: task.taskId,
      state: task.state,
      path: taskDir,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
    if (task.goal !== undefined) {
      entry.goal = task.goal;
    }
    const nextTasks = index.tasks.filter((item) => item.taskId !== task.taskId);
    nextTasks.push(entry);
    nextTasks.sort((a, b) => a.taskId.localeCompare(b.taskId));
    await writeJson(this.indexPath(), { version: 1, tasks: nextTasks, updatedAt: this.now() });
  }

  private async upsertRegistryEntry(taskId: string, entry: AgentRegistryEntry): Promise<void> {
    const paths = taskPaths(this.root, taskId);
    const registry = (await fileExists(paths.registryJson))
      ? await readJson<DelegationRegistry>(paths.registryJson)
      : { taskId, agents: [], updatedAt: this.now() };
    const agents = registry.agents.filter((agent) => agent.agentId !== entry.agentId);
    agents.push(entry);
    agents.sort((a, b) => a.agentId.localeCompare(b.agentId));
    await writeJson(paths.registryJson, { taskId, agents, updatedAt: this.now() });
  }

  private async updateRegistryState(taskId: string, agentId: string, state: DelegationState): Promise<void> {
    const registry = await this.readRegistry(taskId);
    const agents = registry.agents.map((agent) => {
      if (agent.agentId !== agentId) {
        return agent;
      }
      return { ...agent, state, updatedAt: this.now() };
    });
    await writeJson(taskPaths(this.root, taskId).registryJson, { taskId, agents, updatedAt: this.now() });
  }
}

export function createDelegationStore(options: DelegationStoreOptions): DelegationStore {
  return new DelegationStore(options);
}

function taskPathsRoot(root: string): string {
  return resolve(root, "tasks");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

async function ensureTextFile(path: string, text: string): Promise<void> {
  if (await fileExists(path)) {
    return;
  }
  await writeText(path, text);
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(parentDirectory(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

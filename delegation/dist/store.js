import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { agentPaths, delegationRootForRepo, parentDirectory, safeModelFilePath, taskPaths, validateSafeId, } from "./paths.js";
export class DelegationStore {
    root;
    now;
    constructor(options = {}) {
        if (options.root === undefined && options.repoRoot === undefined) {
            throw new Error("DelegationStore requires either root or repoRoot");
        }
        if (options.root !== undefined && (options.root.length === 0 || options.root.trim() !== options.root)) {
            throw new Error("delegation root must be a non-empty path without surrounding whitespace");
        }
        this.root = resolve(options.root ?? delegationRootForRepo(options.repoRoot ?? ""));
        this.now = options.now ?? (() => new Date().toISOString());
    }
    async ensureStore() {
        await mkdir(taskPathsRoot(this.root), { recursive: true });
        const indexPath = this.indexPath();
        if (!(await fileExists(indexPath))) {
            const index = { version: 1, tasks: [], updatedAt: this.now() };
            await writeJson(indexPath, index);
            return index;
        }
        return readJson(indexPath);
    }
    async initTask(input) {
        const taskId = validateSafeId(input.taskId, "task id");
        const paths = taskPaths(this.root, taskId);
        const timestamp = input.createdAt ?? this.now();
        await mkdir(paths.modelDir, { recursive: true });
        await mkdir(paths.agentsDir, { recursive: true });
        const existing = (await fileExists(paths.taskJson))
            ? await readJson(paths.taskJson)
            : undefined;
        const task = {
            taskId,
            state: input.state ?? existing?.state ?? "created",
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: this.now(),
        };
        if (input.goal !== undefined) {
            task.goal = input.goal;
        }
        else if (existing?.goal !== undefined) {
            task.goal = existing.goal;
        }
        if (input.parentTaskId !== undefined) {
            task.parentTaskId = validateSafeId(input.parentTaskId, "parent task id");
        }
        else if (existing?.parentTaskId !== undefined) {
            task.parentTaskId = existing.parentTaskId;
        }
        await writeJson(paths.taskJson, task);
        if (!(await fileExists(paths.registryJson))) {
            const registry = { taskId, agents: [], updatedAt: this.now() };
            await writeJson(paths.registryJson, registry);
        }
        await ensureTextFile(paths.eventsJsonl, "");
        await ensureTextFile(paths.decisionsMd, "");
        await this.upsertIndexEntry(task, paths.taskDir);
        return task;
    }
    async readTask(taskId) {
        return readJson(taskPaths(this.root, taskId).taskJson);
    }
    async writeTask(task) {
        const paths = taskPaths(this.root, task.taskId);
        const updated = { ...task, updatedAt: this.now() };
        await writeJson(paths.taskJson, updated);
        await this.upsertIndexEntry(updated, paths.taskDir);
    }
    async registerAgent(input) {
        const taskId = validateSafeId(input.taskId, "task id");
        const agentId = validateSafeId(input.agentId, "agent id");
        await this.initTask({ taskId });
        const paths = agentPaths(this.root, taskId, agentId);
        await mkdir(paths.modelDir, { recursive: true });
        const timestamp = input.createdAt ?? this.now();
        const profile = input.profile ?? input.role;
        const manifest = {
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
        const state = input.state ?? "created";
        const status = { taskId, agentId, state, updatedAt: this.now() };
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
    async readRegistry(taskId) {
        return readJson(taskPaths(this.root, taskId).registryJson);
    }
    async readAgentManifest(taskId, agentId) {
        return readJson(agentPaths(this.root, taskId, agentId).manifestJson);
    }
    async writeAgentStatus(taskId, agentId, status) {
        const ids = { taskId: validateSafeId(taskId, "task id"), agentId: validateSafeId(agentId, "agent id") };
        const updated = {
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
    async readAgentStatus(taskId, agentId) {
        return readJson(agentPaths(this.root, taskId, agentId).statusJson);
    }
    async appendTaskEvent(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const event = this.buildEvent(safeTaskId, "task", input);
        await appendJsonLine(taskPaths(this.root, safeTaskId).eventsJsonl, event);
        return event;
    }
    async appendAgentEvent(taskId, agentId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const safeAgentId = validateSafeId(agentId, "agent id");
        const event = this.buildEvent(safeTaskId, "agent", input, safeAgentId);
        await appendJsonLine(agentPaths(this.root, safeTaskId, safeAgentId).eventsJsonl, event);
        return event;
    }
    async writeTaskModelText(taskId, fileName, text) {
        const paths = taskPaths(this.root, taskId);
        const target = safeModelFilePath(paths.modelDir, fileName);
        await writeText(target, text);
        return target;
    }
    async writeAgentModelText(taskId, agentId, fileName, text) {
        const paths = agentPaths(this.root, taskId, agentId);
        const target = safeModelFilePath(paths.modelDir, fileName);
        await writeText(target, text);
        return target;
    }
    async recordAgentResult(taskId, agentId, rawText, parsedResult) {
        const paths = agentPaths(this.root, taskId, agentId);
        await writeText(paths.resultRaw, rawText);
        await writeJson(paths.resultJson, parsedResult);
        return { rawPath: paths.resultRaw, jsonPath: paths.resultJson };
    }
    async recordTaskReport(taskId, reportName, rawText, parsedReport) {
        const paths = taskPaths(this.root, taskId);
        const rawByName = {
            "planning-report": paths.planningReportRaw,
            "execution-kickoff": paths.executionKickoffRaw,
            "execution-report": paths.executionReportRaw,
        };
        const jsonByName = {
            "planning-report": paths.planningReportJson,
            "execution-kickoff": paths.executionKickoffJson,
            "execution-report": paths.executionReportJson,
        };
        const rawPath = rawByName[reportName];
        const jsonPath = jsonByName[reportName];
        await writeText(rawPath, rawText);
        await writeJson(jsonPath, parsedReport);
        return { rawPath, jsonPath };
    }
    pathsForTask(taskId) {
        return taskPaths(this.root, taskId);
    }
    pathsForAgent(taskId, agentId) {
        return agentPaths(this.root, taskId, agentId);
    }
    indexPath() {
        return resolve(this.root, "index.json");
    }
    buildEvent(taskId, scope, input, agentId) {
        const event = {
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
    async upsertIndexEntry(task, taskDir) {
        const index = await this.ensureStore();
        const entry = {
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
    async upsertRegistryEntry(taskId, entry) {
        const paths = taskPaths(this.root, taskId);
        const registry = (await fileExists(paths.registryJson))
            ? await readJson(paths.registryJson)
            : { taskId, agents: [], updatedAt: this.now() };
        const agents = registry.agents.filter((agent) => agent.agentId !== entry.agentId);
        agents.push(entry);
        agents.sort((a, b) => a.agentId.localeCompare(b.agentId));
        await writeJson(paths.registryJson, { taskId, agents, updatedAt: this.now() });
    }
    async updateRegistryState(taskId, agentId, state) {
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
export function createDelegationStore(options) {
    return new DelegationStore(options);
}
function taskPathsRoot(root) {
    return resolve(root, "tasks");
}
async function fileExists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
async function readJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
async function writeJson(path, value) {
    await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeText(path, text) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
}
async function ensureTextFile(path, text) {
    if (await fileExists(path)) {
        return;
    }
    await writeText(path, text);
}
async function appendJsonLine(path, value) {
    await mkdir(parentDirectory(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

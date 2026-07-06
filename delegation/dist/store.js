import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { agentPaths, delegationRootForRepo, parentDirectory, safeModelFilePath, taskPaths, validateSafeId, } from "./paths.js";
import { emptyExecutionMap, normalizeExecutionMap, normalizeWorkPackageMetadata, validateExecutionMap, } from "./execution.js";
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
        if (!(await fileExists(paths.parentAlertsJson))) {
            const queue = { version: 1, taskId, alerts: [], updatedAt: this.now() };
            await writeJson(paths.parentAlertsJson, queue);
        }
        if (!(await fileExists(paths.waitStateJson))) {
            const waitState = { version: 1, taskId, scopes: [], updatedAt: this.now() };
            await writeJson(paths.waitStateJson, waitState);
        }
        if (!(await fileExists(paths.executionMapJson))) {
            await writeJson(paths.executionMapJson, emptyExecutionMap(taskId, this.now()));
        }
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
        const writeScopes = normalizeManifestWriteScopes(input.writeScope);
        const firstWriteScope = writeScopes[0];
        if (writeScopes.length === 1 && firstWriteScope !== undefined) {
            manifest.writeScope = firstWriteScope;
        }
        if (writeScopes.length > 0) {
            manifest.writeScopes = writeScopes;
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
        if (input.retention !== undefined) {
            manifest.retention = input.retention;
        }
        if (input.layoutPolicy !== undefined) {
            manifest.layoutPolicy = input.layoutPolicy;
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
    async updateAgentManifest(taskId, agentId, patch) {
        const current = await this.readAgentManifest(taskId, agentId);
        const updated = { ...current, updatedAt: this.now() };
        for (const [key, value] of Object.entries(patch)) {
            if (key === "taskId" || key === "agentId" || key === "createdAt" || key === "updatedAt") {
                continue;
            }
            if (value !== undefined) {
                updated[key] = value;
            }
        }
        await writeJson(agentPaths(this.root, taskId, agentId).manifestJson, updated);
        return updated;
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
    async appendAgentTextLog(taskId, agentId, logName, text) {
        const paths = agentPaths(this.root, taskId, agentId);
        const target = logName === "screen" ? paths.screenLog : paths.transcriptLog;
        await mkdir(parentDirectory(target), { recursive: true });
        await appendFile(target, text, "utf8");
        return target;
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
    async readAgentResult(taskId, agentId) {
        const paths = agentPaths(this.root, taskId, agentId);
        if (!(await fileExists(paths.resultJson))) {
            return { exists: false, rawPath: paths.resultRaw, jsonPath: paths.resultJson };
        }
        return {
            exists: true,
            rawPath: paths.resultRaw,
            jsonPath: paths.resultJson,
            parsed: await readJson(paths.resultJson),
        };
    }
    async readTaskReport(taskId, reportName) {
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
        if (!(await fileExists(jsonPath))) {
            return { exists: false, rawPath, jsonPath };
        }
        return { exists: true, rawPath, jsonPath, parsed: await readJson(jsonPath) };
    }
    async queueParentAlert(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const queue = await this.readParentAlertQueue(safeTaskId);
        const timestamp = this.now();
        const state = input.state ?? stateForAlertOutcome(input.outcome);
        const agentId = input.agentId !== undefined ? validateSafeId(input.agentId, "agent id") : undefined;
        let parentAgentId = input.parentAgentId !== undefined ? validateSafeId(input.parentAgentId, "parent agent id") : undefined;
        if (parentAgentId === undefined && agentId !== undefined) {
            parentAgentId = await this.parentAgentIdFor(safeTaskId, agentId);
        }
        const dedupeKey = input.dedupeKey ?? alertDedupeKey({ taskId: safeTaskId, agentId, parentAgentId, outcome: input.outcome, state, status: input.status, eventType: input.eventType, sourceEventId: input.sourceEventId, message: input.message });
        const existing = queue.alerts.find((alert) => alert.dedupeKey === dedupeKey && alert.readAt === undefined);
        if (existing !== undefined) {
            existing.updatedAt = timestamp;
            if (input.message !== undefined)
                existing.message = input.message;
            if (input.evidence !== undefined)
                existing.evidence = stripUndefined(input.evidence);
            if (input.data !== undefined)
                existing.data = input.data;
            await this.writeParentAlertQueue(safeTaskId, { ...queue, updatedAt: timestamp });
            return { alert: existing, queued: false };
        }
        const alert = {
            alertId: alertIdFromParts(timestamp, safeTaskId, agentId, input.outcome, queue.alerts.length + 1),
            dedupeKey,
            taskId: safeTaskId,
            outcome: input.outcome,
            state,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        if (agentId !== undefined)
            alert.agentId = agentId;
        if (parentAgentId !== undefined)
            alert.parentAgentId = parentAgentId;
        if (input.status !== undefined)
            alert.status = input.status;
        if (input.eventType !== undefined)
            alert.eventType = input.eventType;
        if (input.message !== undefined)
            alert.message = input.message;
        if (input.evidence !== undefined)
            alert.evidence = stripUndefined(input.evidence);
        if (input.data !== undefined)
            alert.data = input.data;
        queue.alerts.push(alert);
        await this.writeParentAlertQueue(safeTaskId, { ...queue, updatedAt: timestamp });
        return { alert, queued: true };
    }
    async readParentAlerts(taskId, options = {}) {
        const queue = await this.readParentAlertQueue(taskId);
        return queue.alerts.filter((alert) => {
            if (options.unreadOnly === true && alert.readAt !== undefined)
                return false;
            if (options.agentId !== undefined && alert.agentId !== options.agentId)
                return false;
            if (options.parentAgentId !== undefined && alert.parentAgentId !== options.parentAgentId)
                return false;
            return true;
        });
    }
    async markParentAlertsRead(taskId, alertIds = []) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const queue = await this.readParentAlertQueue(safeTaskId);
        const timestamp = this.now();
        const ids = new Set(alertIds);
        const readAlerts = [];
        for (const alert of queue.alerts) {
            if (alert.readAt !== undefined)
                continue;
            if (ids.size > 0 && !ids.has(alert.alertId))
                continue;
            alert.readAt = timestamp;
            alert.updatedAt = timestamp;
            readAlerts.push(alert);
        }
        await this.writeParentAlertQueue(safeTaskId, { ...queue, updatedAt: timestamp });
        return readAlerts;
    }
    async incrementWaitScope(taskId, scopeKey) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const safeScopeKey = validateScopeKey(scopeKey);
        const waitState = await this.readWaitState(safeTaskId);
        const timestamp = this.now();
        const existing = waitState.scopes.find((scope) => scope.scopeKey === safeScopeKey);
        if (existing !== undefined) {
            existing.consecutiveWaits += 1;
            existing.updatedAt = timestamp;
            await this.writeWaitState(safeTaskId, { ...waitState, updatedAt: timestamp });
            return existing;
        }
        const entry = { scopeKey: safeScopeKey, consecutiveWaits: 1, updatedAt: timestamp };
        waitState.scopes.push(entry);
        await this.writeWaitState(safeTaskId, { ...waitState, updatedAt: timestamp });
        return entry;
    }
    async resetWaitScope(taskId, scopeKey, status) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const safeScopeKey = validateScopeKey(scopeKey);
        const waitState = await this.readWaitState(safeTaskId);
        const timestamp = this.now();
        const scopes = waitState.scopes.filter((scope) => scope.scopeKey !== safeScopeKey);
        if (status !== undefined) {
            scopes.push({ scopeKey: safeScopeKey, consecutiveWaits: 0, updatedAt: timestamp, lastStatus: status });
        }
        await this.writeWaitState(safeTaskId, { version: 1, taskId: safeTaskId, scopes, updatedAt: timestamp });
    }
    async readWaitState(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const paths = taskPaths(this.root, safeTaskId);
        if (!(await fileExists(paths.waitStateJson))) {
            return { version: 1, taskId: safeTaskId, scopes: [], updatedAt: this.now() };
        }
        return readJson(paths.waitStateJson);
    }
    async readExecutionMap(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const paths = taskPaths(this.root, safeTaskId);
        if (!(await fileExists(paths.executionMapJson))) {
            return emptyExecutionMap(safeTaskId, this.now());
        }
        return normalizeExecutionMap(await readJson(paths.executionMapJson));
    }
    async writeExecutionMap(taskId, executionMap) {
        const safeTaskId = validateSafeId(taskId, "task id");
        await this.initTask({ taskId: safeTaskId });
        const normalized = normalizeExecutionMap({ ...executionMap, taskId: safeTaskId, updatedAt: this.now() }, this.now());
        const decision = validateExecutionMap(normalized);
        if (!decision.allowed) {
            throw new Error(`cannot write invalid execution map: ${decision.reason}`);
        }
        await writeJson(taskPaths(this.root, safeTaskId).executionMapJson, normalized);
        return normalized;
    }
    async upsertWorkPackage(taskId, workPackage) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const normalizedPackage = normalizeWorkPackageMetadata(workPackage);
        const current = await this.readExecutionMap(safeTaskId);
        const packages = current.packages.filter((pkg) => pkg.packageId !== normalizedPackage.packageId);
        packages.push(normalizedPackage);
        packages.sort((left, right) => left.packageId.localeCompare(right.packageId));
        const integrationOrder = packages
            .filter((pkg) => pkg.integrationOrder !== undefined)
            .sort((left, right) => (left.integrationOrder ?? 0) - (right.integrationOrder ?? 0) || left.packageId.localeCompare(right.packageId))
            .map((pkg) => pkg.packageId);
        const candidate = normalizeExecutionMap({ version: 1, taskId: safeTaskId, packages, integrationOrder, updatedAt: this.now() }, this.now());
        const decision = validateExecutionMap(candidate);
        if (!decision.allowed) {
            return { decision };
        }
        const written = await this.writeExecutionMap(safeTaskId, candidate);
        await this.appendTaskEvent(safeTaskId, {
            type: "work-package-upserted",
            state: "running",
            message: `work package ${normalizedPackage.packageId} metadata stored`,
            data: { packageId: normalizedPackage.packageId, role: normalizedPackage.role, checkoutPath: normalizedPackage.checkoutPath },
        });
        return { decision, package: normalizedPackage, executionMap: written };
    }
    pathsForTask(taskId) {
        return taskPaths(this.root, taskId);
    }
    pathsForAgent(taskId, agentId) {
        return agentPaths(this.root, taskId, agentId);
    }
    async readParentAlertQueue(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const paths = taskPaths(this.root, safeTaskId);
        if (!(await fileExists(paths.parentAlertsJson))) {
            return { version: 1, taskId: safeTaskId, alerts: [], updatedAt: this.now() };
        }
        return readJson(paths.parentAlertsJson);
    }
    async writeParentAlertQueue(taskId, queue) {
        await writeJson(taskPaths(this.root, taskId).parentAlertsJson, queue);
    }
    async writeWaitState(taskId, waitState) {
        await writeJson(taskPaths(this.root, taskId).waitStateJson, waitState);
    }
    async parentAgentIdFor(taskId, agentId) {
        try {
            return (await this.readAgentManifest(taskId, agentId)).parentAgentId;
        }
        catch {
            return undefined;
        }
    }
    indexPath() {
        return resolve(this.root, "index.json");
    }
    buildEvent(taskId, scope, input, agentId) {
        const timestamp = input.timestamp ?? this.now();
        const event = {
            eventId: input.eventId ?? eventIdFromParts(timestamp, taskId, scope, agentId, input.type),
            timestamp,
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
function stateForAlertOutcome(outcome) {
    if (outcome === "completed_with_risks")
        return "completed";
    if (outcome === "capability_gap")
        return "blocked";
    if (outcome === "user_attention")
        return "attention";
    return outcome;
}
function eventIdFromParts(timestamp, taskId, scope, agentId, type) {
    return stableId("evt", [timestamp, taskId, scope, agentId ?? "task", type]);
}
function alertIdFromParts(timestamp, taskId, agentId, outcome, ordinal) {
    return stableId("alert", [timestamp, taskId, agentId ?? "task", outcome, String(ordinal)]);
}
function alertDedupeKey(input) {
    if (input.sourceEventId !== undefined) {
        return ["event", input.taskId, input.agentId ?? "task", input.outcome, input.state, input.sourceEventId].join(":");
    }
    return [
        "state",
        input.taskId,
        input.parentAgentId ?? "parent",
        input.agentId ?? "task",
        input.outcome,
        input.state,
        input.status ?? "",
        input.eventType ?? "",
        input.message ?? "",
    ].join(":");
}
function stableId(prefix, parts) {
    const source = parts.join("|");
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
    }
    return `${prefix}_${hash.toString(36)}`;
}
function validateScopeKey(scopeKey) {
    if (scopeKey.trim().length === 0 || scopeKey.includes("\0")) {
        throw new Error("wait scope key must be non-empty and must not contain NUL bytes");
    }
    return scopeKey;
}
function stripUndefined(value) {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
        if (child !== undefined)
            output[key] = child;
    }
    return output;
}
function normalizeManifestWriteScopes(value) {
    if (value === undefined) {
        return [];
    }
    return Array.isArray(value) ? [...value] : [value];
}

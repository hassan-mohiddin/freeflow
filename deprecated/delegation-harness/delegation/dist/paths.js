import { dirname, isAbsolute, join, relative, resolve } from "node:path";
export const DELEGATION_STORE_RELATIVE_PATH = join(".freeflow", "delegation");
const SAFE_NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
export function delegationRootForRepo(repoRoot) {
    if (repoRoot.length === 0 || repoRoot.trim() !== repoRoot) {
        throw new Error("repo root must be a non-empty path without surrounding whitespace");
    }
    return resolve(repoRoot, DELEGATION_STORE_RELATIVE_PATH);
}
export function validateSafeName(value, label = "name") {
    if (value.length === 0) {
        throw new Error(`${label} must not be empty`);
    }
    if (value.trim() !== value) {
        throw new Error(`${label} must not have surrounding whitespace`);
    }
    if (value.includes("\0")) {
        throw new Error(`${label} must not contain NUL bytes`);
    }
    if (isAbsolute(value)) {
        throw new Error(`${label} must not be an absolute path`);
    }
    if (value.includes("/") || value.includes("\\")) {
        throw new Error(`${label} must not contain path separators`);
    }
    if (value === "." || value === ".." || value.includes("..")) {
        throw new Error(`${label} must not contain traversal segments`);
    }
    if (!SAFE_NAME_RE.test(value)) {
        throw new Error(`${label} contains unsafe characters`);
    }
    return value;
}
export function validateSafeId(value, label = "id") {
    return validateSafeName(value, label);
}
/**
 * Low-level containment helper. It rejects absolute/traversal/separator escapes,
 * but it is not a safe-id validator; use validateSafeId/safeJoin for ids/names.
 */
export function resolveUnderRoot(root, ...segments) {
    for (const [index, segment] of segments.entries()) {
        if (segment.length === 0) {
            throw new Error(`path segment ${index + 1} must not be empty`);
        }
        if (segment.includes("\0")) {
            throw new Error(`path segment ${index + 1} must not contain NUL bytes`);
        }
        if (isAbsolute(segment)) {
            throw new Error(`path segment ${index + 1} must not be absolute`);
        }
        if (segment.includes("/") || segment.includes("\\")) {
            throw new Error(`path segment ${index + 1} must not contain path separators`);
        }
        if (segment === "." || segment === ".." || segment.includes("..")) {
            throw new Error(`path segment ${index + 1} must not contain traversal segments`);
        }
    }
    const resolvedRoot = resolve(root);
    const resolvedPath = resolve(resolvedRoot, ...segments);
    const rel = relative(resolvedRoot, resolvedPath);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
        return resolvedPath;
    }
    throw new Error(`resolved path escapes delegation root: ${resolvedPath}`);
}
export function safeJoin(root, ...segments) {
    const safeSegments = segments.map((segment, index) => validateSafeName(segment, `path segment ${index + 1}`));
    return resolveUnderRoot(root, ...safeSegments);
}
export function taskPaths(root, taskId) {
    const safeTaskId = validateSafeId(taskId, "task id");
    const taskDir = safeJoin(root, "tasks", safeTaskId);
    const modelDir = join(taskDir, "model");
    return {
        taskDir,
        taskJson: join(taskDir, "task.json"),
        registryJson: join(taskDir, "registry.json"),
        eventsJsonl: join(taskDir, "events.jsonl"),
        routesJsonl: join(taskDir, "routes.jsonl"),
        routeApplicationsJsonl: join(taskDir, "route-applications.jsonl"),
        leasesJsonl: join(taskDir, "leases.jsonl"),
        activeLeasesJson: join(taskDir, "active-leases.json"),
        wakeAttemptsJsonl: join(taskDir, "wake-attempts.jsonl"),
        layoutJson: join(taskDir, "layout.json"),
        parentAlertsJson: join(taskDir, "parent-alerts.json"),
        waitStateJson: join(taskDir, "wait-state.json"),
        executionMapJson: join(taskDir, "execution-map.json"),
        executionEnvelopesDir: join(taskDir, "execution-envelopes"),
        terminalOutcomesDir: join(taskDir, "terminal-outcomes"),
        planningReportPublicationsDir: join(taskDir, "planning-report-publications"),
        planningReportAcceptedDir: join(taskDir, "planning-report-publications", "accepted"),
        planningReportRejectedDir: join(taskDir, "planning-report-publications", "rejected"),
        decisionsMd: join(taskDir, "decisions.md"),
        modelDir,
        agentsDir: join(taskDir, "agents"),
        planningReportRaw: join(modelDir, "planning-report.txt"),
        planningReportJson: join(taskDir, "planning-report.json"),
        executionKickoffRaw: join(modelDir, "execution-kickoff.txt"),
        executionKickoffJson: join(taskDir, "execution-kickoff.json"),
        executionReportRaw: join(modelDir, "execution-report.txt"),
        executionReportJson: join(taskDir, "execution-report.json"),
    };
}
export function agentPaths(root, taskId, agentId) {
    const task = taskPaths(root, taskId);
    const safeAgentId = validateSafeId(agentId, "agent id");
    const agentDir = safeJoin(task.agentsDir, safeAgentId);
    const modelDir = join(agentDir, "model");
    return {
        agentDir,
        manifestJson: join(agentDir, "manifest.json"),
        statusJson: join(agentDir, "status.json"),
        eventsJsonl: join(agentDir, "events.jsonl"),
        modelDir,
        taskPacketRaw: join(modelDir, "task-packet.txt"),
        resultRaw: join(modelDir, "result.raw.txt"),
        resultJson: join(agentDir, "result.json"),
        transcriptLog: join(agentDir, "transcript.log"),
        screenLog: join(agentDir, "screen.log"),
        notesMd: join(agentDir, "notes.md"),
    };
}
export function safeModelFilePath(modelDir, fileName) {
    const safeFileName = validateSafeName(fileName, "model file name");
    return resolveUnderRoot(modelDir, safeFileName);
}
export function parentDirectory(path) {
    return dirname(path);
}

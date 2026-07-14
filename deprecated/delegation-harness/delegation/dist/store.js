import { createHash, randomUUID } from "node:crypto";
import { access, appendFile, link, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { agentPaths, delegationRootForRepo, parentDirectory, safeModelFilePath, taskPaths, validateSafeId, } from "./paths.js";
import { emptyExecutionMap, normalizeExecutionMap, normalizeWorkPackageMetadata, validateExecutionMap, } from "./execution.js";
import { normalizeDelegationLayoutAllocation } from "./layout.js";
import { currentAssignmentAttemptIdentity, resolveAssignmentAttemptIdentity } from "./identity.js";
import { normalizeDelegationActiveLeaseView, normalizeDelegationLease } from "./leases.js";
import { resolveProfileForRole } from "./profiles.js";
import { parseProtocolText, planningReportPlanArtifactPath } from "./protocol.js";
import { normalizeDelegationRouteApplication, normalizeDelegationRouteDecision, normalizeDelegationRouteRequest, normalizeExecutionAuthorizationEvidence } from "./routing.js";
const CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION = 1;
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
        await ensureTextFile(paths.routesJsonl, "");
        await ensureTextFile(paths.routeApplicationsJsonl, "");
        await ensureTextFile(paths.leasesJsonl, "");
        await ensureTextFile(paths.decisionsMd, "");
        await this.ensureParentAlertQueue(taskId);
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
            ...currentAssignmentAttemptIdentity({
                taskId,
                agentId,
                attemptId: input.attemptId ?? `attempt-${agentId}`,
                attemptSource: input.attemptSource ?? "direct_compat_adapter",
            }),
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
            if (["taskId", "agentId", "createdAt", "updatedAt", "schemaVersion", "identitySchemaVersion", "profileSchemaVersion", "protocolVersion", "assignmentId", "attemptId", "attemptSource", "modelTaskPacketPath", "resultRawPath", "resultJsonPath"].includes(key)) {
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
        if (status.terminalOutcomeId !== undefined) {
            updated.terminalOutcomeId = validateSafeId(status.terminalOutcomeId, "terminal outcome id");
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
    async publishTerminalOutcome(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const submittedAgentId = validateSafeId(input.agentId, "terminal source agent id");
        const submittedAssignmentId = validateSafeId(input.assignmentId, "terminal source assignment id");
        const submittedAttemptId = validateSafeId(input.attemptId, "terminal source attempt id");
        const rawText = requireStringValue(input.rawText, "terminal raw text");
        const sourceResult = normalizeTerminalOutcomeSourceForPublication(input.source);
        const manifest = await this.readAgentManifest(safeTaskId, submittedAgentId);
        const status = await this.readAgentStatus(safeTaskId, submittedAgentId);
        const taskPathSet = taskPaths(this.root, safeTaskId);
        const currentIdentity = await resolveTerminalPublicationIdentity(manifest, status, taskPathSet);
        const lockPath = terminalOutcomeAttemptPaths(taskPathSet, currentIdentity.assignmentId, currentIdentity.attemptId).lockPath;
        const release = await acquireBoundedFileLock(lockPath);
        try {
            const currentManifest = await this.readAgentManifest(safeTaskId, submittedAgentId);
            const currentStatus = await this.readAgentStatus(safeTaskId, submittedAgentId);
            const identity = await resolveTerminalPublicationIdentity(currentManifest, currentStatus, taskPathSet);
            if (identity.assignmentId !== currentIdentity.assignmentId ||
                identity.attemptId !== currentIdentity.attemptId) {
                throw new Error("terminal assignment identity changed while acquiring publication lock; retry");
            }
            const paths = terminalOutcomeAttemptPaths(taskPathSet, identity.assignmentId, identity.attemptId);
            const normalizedEvidenceResult = normalizeTerminalOutcomeEvidence(input.evidence);
            let rejectionReason = sourceResult.error ?? terminalOutcomeRejectionReason({
                manifest: currentManifest,
                identity,
                submittedAssignmentId,
                submittedAttemptId,
                submittedRole: input.role,
                submittedStatus: input.status,
                evidenceResult: normalizedEvidenceResult,
            });
            if (rejectionReason === undefined &&
                input.role === "planning-parent" &&
                normalizedEvidenceResult.evidence !== undefined) {
                rejectionReason = await planningParentTerminalEvidenceRejectionReason(taskPaths(this.root, safeTaskId), safeTaskId, submittedAgentId, identity, normalizedEvidenceResult.evidence);
            }
            if (rejectionReason !== undefined || normalizedEvidenceResult.evidence === undefined) {
                return await recordTerminalRejection({
                    paths,
                    taskId: safeTaskId,
                    agentId: submittedAgentId,
                    identity,
                    submittedAssignmentId,
                    submittedAttemptId,
                    submittedRole: input.role,
                    submittedStatus: input.status,
                    source: sourceResult.diagnostic,
                    evidence: normalizedEvidenceResult.evidence,
                    rawText,
                    reason: rejectionReason ?? normalizedEvidenceResult.error ?? "terminal evidence is invalid",
                    recordedAt: this.now(),
                });
            }
            const normalizedEvidence = normalizedEvidenceResult.evidence;
            const source = sourceResult.source;
            if (source === undefined)
                throw new Error("validated terminal source is unavailable");
            const canonicalInput = {
                taskId: safeTaskId,
                agentId: submittedAgentId,
                assignmentId: submittedAssignmentId,
                attemptId: submittedAttemptId,
                role: input.role,
                status: input.status,
                source,
                evidence: normalizedEvidence,
                rawText,
            };
            const contentHash = sha256(canonicalJson(canonicalInput));
            const outcomeId = validateSafeId(`terminal-${contentHash}`, "terminal outcome id");
            if (await fileExists(paths.acceptedJsonPath)) {
                const accepted = await readValidTerminalAcceptedOutcome(paths, safeTaskId, submittedAgentId, identity);
                const claim = await readJson(paths.claimPath);
                validateStoredTerminalClaim(claim, safeTaskId, submittedAgentId, identity);
                if (claim.contentHash !== accepted.contentHash) {
                    throw new Error("accepted terminal outcome does not match its immutable claim");
                }
                if (accepted.contentHash === contentHash && accepted.outcomeId === outcomeId) {
                    return this.reconcileTerminalOutcome(accepted, paths.claimPath, true);
                }
                return await recordTerminalRejection({
                    paths,
                    taskId: safeTaskId,
                    agentId: submittedAgentId,
                    identity,
                    submittedAssignmentId,
                    submittedAttemptId,
                    submittedRole: input.role,
                    submittedStatus: input.status,
                    source: source,
                    evidence: normalizedEvidence,
                    rawText,
                    reason: `terminal outcome conflicts with accepted outcome ${accepted.outcomeId}`,
                    recordedAt: this.now(),
                });
            }
            let claimRequired = true;
            if (await fileExists(paths.claimPath)) {
                const claim = await readJson(paths.claimPath);
                validateStoredTerminalClaim(claim, safeTaskId, submittedAgentId, identity);
                if (claim.contentHash === contentHash) {
                    claimRequired = false;
                }
                else if (!processIsAlive(claim.ownerPid)) {
                    await abandonStaleTerminalClaim(paths, claim, contentHash, this.now());
                }
                else {
                    return await recordTerminalRejection({
                        paths,
                        taskId: safeTaskId,
                        agentId: submittedAgentId,
                        identity,
                        submittedAssignmentId,
                        submittedAttemptId,
                        submittedRole: input.role,
                        submittedStatus: input.status,
                        source: source,
                        evidence: normalizedEvidence,
                        rawText,
                        reason: `terminal outcome conflicts with existing live claim ${claim.claimId}`,
                        recordedAt: this.now(),
                    });
                }
            }
            if (claimRequired) {
                const claim = {
                    schemaVersion: 1,
                    recordType: "terminal.claim",
                    claimId: validateSafeId(`terminal-claim-${contentHash}`, "terminal claim id"),
                    taskId: safeTaskId,
                    agentId: submittedAgentId,
                    assignmentId: identity.assignmentId,
                    attemptId: identity.attemptId,
                    contentHash,
                    claimedAt: this.now(),
                    ownerPid: process.pid,
                };
                await writeImmutableJson(paths.claimPath, claim);
            }
            const accepted = {
                schemaVersion: 1,
                recordType: "terminal.accepted",
                disposition: "accepted",
                outcomeId,
                taskId: safeTaskId,
                agentId: submittedAgentId,
                assignmentId: identity.assignmentId,
                attemptId: identity.attemptId,
                role: input.role,
                status: input.status,
                evidence: normalizedEvidence,
                contentHash,
                source,
                acceptedAt: this.now(),
                rawPath: paths.acceptedRawPath,
                jsonPath: paths.acceptedJsonPath,
            };
            await writeImmutableText(paths.acceptedRawPath, rawText);
            await writeImmutableJson(paths.acceptedJsonPath, accepted);
            return this.reconcileTerminalOutcome(accepted, paths.claimPath, false);
        }
        finally {
            await release();
        }
    }
    async reconcileTerminalOutcome(accepted, claimPath, retry) {
        const effects = [
            "result_projection",
            "assignment_status",
            "lease_termination",
            "agent_event",
            "task_event",
            "parent_alert",
            "publication_status",
        ];
        const failures = [];
        let agentState;
        let endedLeaseIds = [];
        let eventId;
        let alertResult;
        for (const effect of effects) {
            if (effect === "publication_status" && failures.length > 0) {
                failures.push({ effect, reason: "earlier materialized effects remain incomplete" });
                continue;
            }
            try {
                if (effect === "result_projection") {
                    await this.projectAcceptedTerminalResult(accepted);
                }
                else if (effect === "assignment_status") {
                    await this.projectAcceptedTerminalStatus(accepted);
                    agentState = terminalAssignmentState(accepted.status);
                }
                else if (effect === "lease_termination") {
                    const ended = await this.endActiveAssignmentLeases(accepted.taskId, accepted.agentId, accepted.status === "cancelled" ? "revoked" : "exhausted", `terminal outcome ${accepted.outcomeId}`);
                    endedLeaseIds = ended.leaseIds;
                }
                else if (effect === "agent_event") {
                    await this.ensureTerminalEvent(accepted, "agent");
                    eventId = terminalEffectEventId(accepted.outcomeId, "agent");
                }
                else if (effect === "task_event") {
                    await this.ensureTerminalEvent(accepted, "task");
                }
                else if (effect === "parent_alert") {
                    const eventId = terminalEffectEventId(accepted.outcomeId, "agent");
                    const queued = await this.queueParentAlert(accepted.taskId, {
                        agentId: accepted.agentId,
                        outcome: terminalAlertOutcome(accepted.status, accepted.evidence),
                        state: terminalAssignmentState(accepted.status),
                        status: accepted.status,
                        eventType: "agent-result",
                        sourceEventId: eventId,
                        message: terminalEvidenceSummary(accepted.evidence),
                        evidence: { rawPath: accepted.rawPath, jsonPath: accepted.jsonPath, outputId: accepted.outcomeId },
                        data: terminalAlertData(accepted),
                        dedupeKey: `terminal-outcome:${accepted.outcomeId}`,
                        coalesceAcknowledged: true,
                    });
                    alertResult = queued;
                    if (queued.wakeAttemptError !== undefined) {
                        throw new Error(`terminal alert wake reconciliation failed: ${queued.wakeAttemptError}`);
                    }
                }
                else if (effect === "publication_status") {
                    await writeImmutableJson(terminalReconciliationPath(accepted), {
                        schemaVersion: 1,
                        recordType: "terminal.reconciled",
                        outcomeId: accepted.outcomeId,
                        contentHash: accepted.contentHash,
                        reconciledAt: accepted.acceptedAt,
                    });
                }
            }
            catch (error) {
                failures.push({ effect, reason: messageFrom(error) });
            }
        }
        if (failures.length > 0) {
            if (retry) {
                await this.queueParentAlert(accepted.taskId, {
                    agentId: accepted.agentId,
                    outcome: "attention",
                    state: "attention",
                    status: "terminal_publication_incomplete",
                    eventType: "terminal-publication-incomplete",
                    message: `Accepted terminal outcome ${accepted.outcomeId} still requires reconciliation.`,
                    evidence: { rawPath: accepted.rawPath, jsonPath: accepted.jsonPath, outputId: accepted.outcomeId },
                    data: {
                        terminalOutcomeId: accepted.outcomeId,
                        pendingEffects: failures.map((failure) => failure.effect),
                        recoveryReasons: failures.map((failure) => `${failure.effect}: ${failure.reason}`),
                    },
                    dedupeKey: `terminal-reconciliation:${accepted.outcomeId}`,
                    coalesceAcknowledged: true,
                }).catch(() => undefined);
            }
            return {
                ...terminalAcceptedResult(accepted, claimPath),
                commitState: "committed_incomplete",
                pendingEffects: failures.map((failure) => failure.effect),
                recoveryReason: failures.map((failure) => `${failure.effect}: ${failure.reason}`).join("; "),
                ...(agentState === undefined ? {} : { agentState }),
                endedLeaseIds,
                ...(eventId === undefined ? {} : { eventId }),
                ...(alertResult === undefined ? {} : {
                    alert: alertResult.alert,
                    ...(alertResult.wakeAttempt === undefined ? {} : { wakeAttempt: alertResult.wakeAttempt }),
                    ...(alertResult.wakeAttemptError === undefined ? {} : { wakeAttemptError: alertResult.wakeAttemptError }),
                }),
            };
        }
        return {
            ...terminalAcceptedResult(accepted, claimPath),
            commitState: retry ? "committed_reconciled" : "committed",
            pendingEffects: [],
            ...(agentState === undefined ? {} : { agentState }),
            endedLeaseIds,
            ...(eventId === undefined ? {} : { eventId }),
            ...(alertResult === undefined ? {} : {
                alert: alertResult.alert,
                ...(alertResult.wakeAttempt === undefined ? {} : { wakeAttempt: alertResult.wakeAttempt }),
                ...(alertResult.wakeAttemptError === undefined ? {} : { wakeAttemptError: alertResult.wakeAttemptError }),
            }),
        };
    }
    async projectAcceptedTerminalResult(accepted) {
        const paths = agentPaths(this.root, accepted.taskId, accepted.agentId);
        const rawText = await readFile(accepted.rawPath, "utf8");
        await writeTextAtomic(paths.resultRaw, rawText);
        await writeJsonAtomic(paths.resultJson, terminalResultProjection(accepted, rawText));
        if (accepted.role === "execution-parent") {
            const evidence = jsonObjectValue(accepted.evidence);
            const report = evidence?.report;
            if (report === undefined)
                throw new Error("execution-parent accepted evidence has no normalized report");
            const reportRawText = typeof evidence?.reportRawText === "string" ? evidence.reportRawText : rawText;
            const task = taskPaths(this.root, accepted.taskId);
            await writeTextAtomic(task.executionReportRaw, reportRawText);
            await writeJsonAtomic(task.executionReportJson, report);
        }
    }
    async projectAcceptedTerminalStatus(accepted) {
        const state = terminalAssignmentState(accepted.status);
        const summary = terminalEvidenceSummary(accepted.evidence);
        const status = {
            taskId: accepted.taskId,
            agentId: accepted.agentId,
            state,
            updatedAt: accepted.acceptedAt,
            message: summary,
            terminalOutcomeId: accepted.outcomeId,
            ...((accepted.status === "blocked" || accepted.status === "failed" || accepted.status === "cancelled")
                ? { reason: summary }
                : {}),
        };
        const current = await this.readAgentStatus(accepted.taskId, accepted.agentId);
        if (current.terminalOutcomeId !== undefined && current.terminalOutcomeId !== accepted.outcomeId) {
            throw new Error(`assignment status belongs to conflicting terminal outcome ${current.terminalOutcomeId}`);
        }
        await writeJsonAtomic(agentPaths(this.root, accepted.taskId, accepted.agentId).statusJson, status);
        await this.updateRegistryState(accepted.taskId, accepted.agentId, state, accepted.acceptedAt, accepted.outcomeId);
    }
    async ensureTerminalEvent(accepted, scope) {
        const event = this.buildEvent(accepted.taskId, scope, {
            eventId: terminalEffectEventId(accepted.outcomeId, scope),
            timestamp: accepted.acceptedAt,
            type: "agent-result",
            state: terminalAssignmentState(accepted.status),
            message: terminalEvidenceSummary(accepted.evidence),
            data: {
                terminalOutcomeId: accepted.outcomeId,
                agentId: accepted.agentId,
                role: accepted.role,
                resultStatus: accepted.status,
                rawPath: accepted.rawPath,
                jsonPath: accepted.jsonPath,
            },
        }, scope === "agent" ? accepted.agentId : undefined);
        const path = scope === "agent"
            ? agentPaths(this.root, accepted.taskId, accepted.agentId).eventsJsonl
            : taskPaths(this.root, accepted.taskId).eventsJsonl;
        await ensureDelegationEvent(path, event);
    }
    async appendAgentTextLog(taskId, agentId, logName, text) {
        const paths = agentPaths(this.root, taskId, agentId);
        const target = logName === "screen" ? paths.screenLog : paths.transcriptLog;
        await mkdir(parentDirectory(target), { recursive: true });
        await appendFile(target, text, "utf8");
        return target;
    }
    async publishPlanningReport(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const rawText = requireStringValue(input.rawText, "planning report raw text");
        const source = normalizePlanningReportPublicationSource(input.source);
        const delegatedSource = source.agentId !== undefined;
        if (delegatedSource) {
            await this.assertDelegatedPlanningReportPublicationSource(safeTaskId, source);
        }
        else {
            await this.initTask({ taskId: safeTaskId });
        }
        const parsed = parseProtocolText(rawText);
        const report = parsed.planningReports.length === 1 ? parsed.planningReports[0] : undefined;
        const errors = [
            ...parsed.errors.map((error) => ({ lineNumber: error.lineNumber, message: error.message })),
            ...(parsed.planningReports.length === 0 ? [{ lineNumber: 1, message: "planning-report block was not found" }] : []),
            ...(parsed.planningReports.length > 1 ? [{ lineNumber: 1, message: "exactly one planning-report block is required" }] : []),
        ];
        const accepted = parsed.ok && report !== undefined && parsed.planningReports.length === 1;
        const reportStatus = accepted ? report.status : undefined;
        const planArtifactPath = accepted && (reportStatus === "ready" || reportStatus === "ready_with_open_questions")
            ? planningReportPlanArtifactPath(report)
            : undefined;
        if (accepted && (reportStatus === "ready" || reportStatus === "ready_with_open_questions") && planArtifactPath === undefined) {
            errors.push({ lineNumber: report.startLine, message: "ready planning report requires exactly one plan artifact identity" });
        }
        const disposition = accepted && errors.length === 0 ? "accepted" : "rejected";
        const contentHash = createHash("sha256").update(rawText, "utf8").digest("hex");
        const publicationId = planningReportPublicationId(safeTaskId, disposition, contentHash, source);
        const paths = taskPaths(this.root, safeTaskId);
        const evidencePaths = planningReportPublicationEvidencePaths(paths, disposition, publicationId);
        return this.withExecutionAuthorizationLock(safeTaskId, async () => {
            if (delegatedSource) {
                await this.assertDelegatedPlanningReportPublicationSource(safeTaskId, source);
            }
            let stored;
            if (await fileExists(evidencePaths.jsonPath)) {
                stored = await readJson(evidencePaths.jsonPath);
                const storedRaw = await readFile(evidencePaths.rawPath, "utf8");
                if (stored.schemaVersion !== 1 ||
                    stored.disposition !== disposition ||
                    stored.publicationId !== publicationId ||
                    stored.taskId !== safeTaskId ||
                    stored.contentHash !== contentHash ||
                    JSON.stringify(stored.source) !== JSON.stringify(source) ||
                    stored.rawPath !== evidencePaths.rawPath ||
                    stored.jsonPath !== evidencePaths.jsonPath ||
                    storedRaw !== rawText) {
                    throw new Error(`planning report publication conflict: ${publicationId}`);
                }
            }
            else {
                stored = {
                    schemaVersion: 1,
                    disposition,
                    publicationId,
                    taskId: safeTaskId,
                    contentHash,
                    source,
                    recordedAt: this.now(),
                    rawPath: evidencePaths.rawPath,
                    jsonPath: evidencePaths.jsonPath,
                    ...(disposition === "accepted" && report !== undefined ? { reportStatus: report.status, report } : {}),
                    ...(disposition === "accepted" && planArtifactPath !== undefined ? { planArtifactPath } : {}),
                    ...(disposition === "rejected" ? { errors } : {}),
                };
                await writeTextAtomic(evidencePaths.rawPath, rawText);
                await writeJsonAtomic(evidencePaths.jsonPath, stored);
            }
            const eventType = disposition === "accepted" ? "planning_report.accepted" : "planning_report.rejected";
            const eventData = {
                publicationId,
                disposition,
                contentHash,
                rawPath: evidencePaths.rawPath,
                jsonPath: evidencePaths.jsonPath,
                source: source,
            };
            if (stored.reportStatus !== undefined)
                eventData.reportStatus = stored.reportStatus;
            if (stored.planArtifactPath !== undefined)
                eventData.planArtifactPath = stored.planArtifactPath;
            if (stored.errors !== undefined)
                eventData.errors = stored.errors;
            const event = this.buildEvent(safeTaskId, "task", {
                eventId: validateSafeId(`planning-${disposition}-${publicationId}`, "planning publication event id"),
                timestamp: stored.recordedAt,
                type: eventType,
                state: disposition === "accepted" ? (stored.reportStatus === "blocked" ? "blocked" : "planning") : "failed",
                message: disposition === "accepted" ? `planning report accepted: ${stored.reportStatus ?? "unknown"}` : "planning report rejected",
                data: eventData,
            });
            const events = await readJsonLines(paths.eventsJsonl);
            const existingEvent = events.find((candidate) => candidate.eventId === event.eventId);
            if (existingEvent === undefined) {
                await appendJsonLine(paths.eventsJsonl, event);
                events.push(event);
            }
            else if (!taskEventContentMatches(existingEvent, event)) {
                throw new Error(`planning report publication event conflict: ${event.eventId}`);
            }
            let planningReadyEventId;
            let commitState = existingEvent === undefined ? "committed" : "committed_reconciled";
            let recoveryReason;
            try {
                if (disposition === "accepted" && stored.report !== undefined && stored.planArtifactPath !== undefined) {
                    const ready = this.buildEvent(safeTaskId, "task", {
                        eventId: validateSafeId(`planning-ready-${publicationId}`, "planning-ready event id"),
                        timestamp: stored.recordedAt,
                        type: "planning_report.ready",
                        state: "planning",
                        data: {
                            publicationId,
                            planArtifactPath: stored.planArtifactPath,
                            acceptedRawPath: evidencePaths.rawPath,
                            acceptedJsonPath: evidencePaths.jsonPath,
                        },
                    });
                    const existingReady = events.find((candidate) => candidate.eventId === ready.eventId);
                    if (existingReady === undefined) {
                        await appendJsonLine(paths.eventsJsonl, ready);
                    }
                    else if (!taskEventContentMatches(existingReady, ready)) {
                        throw new Error(`planning-ready event id conflict: ${ready.eventId}`);
                    }
                    planningReadyEventId = ready.eventId;
                }
                if (disposition === "accepted" && stored.report !== undefined) {
                    await writeTextAtomic(paths.planningReportRaw, rawText);
                    await writeJsonAtomic(paths.planningReportJson, stored.report);
                }
            }
            catch (error) {
                commitState = "committed_incomplete";
                recoveryReason = messageFrom(error);
            }
            return {
                status: disposition,
                taskId: safeTaskId,
                publicationId,
                ...(stored.reportStatus !== undefined ? { reportStatus: stored.reportStatus } : {}),
                ...(stored.planArtifactPath !== undefined ? { planArtifactPath: stored.planArtifactPath } : {}),
                contentHash,
                rawPath: evidencePaths.rawPath,
                jsonPath: evidencePaths.jsonPath,
                eventId: event.eventId,
                commitState,
                ...(planningReadyEventId !== undefined ? { planningReadyEventId } : {}),
                ...(recoveryReason !== undefined ? { recoveryReason } : {}),
                ...(stored.errors !== undefined ? { errors: stored.errors } : {}),
            };
        });
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
        const safeTaskId = validateSafeId(taskId, "task id");
        const safeAgentId = validateSafeId(agentId, "agent id");
        const paths = agentPaths(this.root, safeTaskId, safeAgentId);
        try {
            const manifest = await this.readAgentManifest(safeTaskId, safeAgentId);
            const status = await this.readAgentStatus(safeTaskId, safeAgentId);
            const taskPathSet = taskPaths(this.root, safeTaskId);
            const identity = await resolveTerminalPublicationIdentity(manifest, status, taskPathSet);
            const terminalPaths = terminalOutcomeAttemptPaths(taskPathSet, identity.assignmentId, identity.attemptId);
            if (await fileExists(terminalPaths.acceptedJsonPath)) {
                const accepted = await readValidTerminalAcceptedOutcome(terminalPaths, safeTaskId, safeAgentId, identity);
                const claim = await readJson(terminalPaths.claimPath);
                validateStoredTerminalClaim(claim, safeTaskId, safeAgentId, identity);
                if (claim.contentHash !== accepted.contentHash) {
                    throw new Error("accepted terminal outcome does not match its immutable claim");
                }
                const acceptedRaw = await readFile(accepted.rawPath, "utf8");
                let projected = false;
                try {
                    const [projectedRaw, projectedJson, reconciliation] = await Promise.all([
                        readFile(paths.resultRaw, "utf8"),
                        readJson(paths.resultJson),
                        readJson(terminalPaths.reconciledJsonPath),
                    ]);
                    validateStoredTerminalReconciliation(reconciliation, accepted);
                    projected = projectedRaw === acceptedRaw && projectedJson.terminalOutcomeId === accepted.outcomeId;
                }
                catch {
                    projected = false;
                }
                return {
                    exists: true,
                    rawPath: accepted.rawPath,
                    jsonPath: accepted.jsonPath,
                    parsed: terminalResultProjection(accepted, acceptedRaw),
                    terminalOutcome: {
                        outcomeId: accepted.outcomeId,
                        publicationStatus: projected ? "accepted_projected" : "accepted_pending_reconciliation",
                        recoveryOperation: "publishTerminalOutcome",
                        acceptedRawPath: accepted.rawPath,
                        acceptedJsonPath: accepted.jsonPath,
                    },
                };
            }
        }
        catch (error) {
            if (await terminalOutcomeEvidenceExistsForAgent(this.root, safeTaskId, safeAgentId))
                throw error;
        }
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
        if (reportName === "planning-report") {
            const events = await readJsonLines(paths.eventsJsonl);
            const accepted = [...events].reverse().find((event) => event.type === "planning_report.accepted" && validTaskEventIdentity(event, taskId));
            if (accepted !== undefined) {
                const stored = await readValidAcceptedPlanningPublication(paths, accepted);
                return { exists: true, rawPath: stored.rawPath, jsonPath: stored.jsonPath, parsed: stored.report };
            }
        }
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
        const result = await this.queueParentAlertRecord(taskId, input);
        const wake = await this.recordQueuedWakeBestEffort(result.alert);
        const escalation = input.eventType === "parent-unavailable-escalation"
            ? undefined
            : await this.maybeEscalateClosedParent(result.alert);
        return {
            ...result,
            ...wake,
            ...(escalation === undefined ? {} : { escalation }),
        };
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
        return this.withParentAlertLock(safeTaskId, async () => {
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
                alert.alertState = "acked";
                readAlerts.push(alert);
            }
            await this.writeParentAlertQueue(safeTaskId, { ...queue, updatedAt: timestamp });
            return readAlerts;
        });
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
    async appendRouteDecision(taskId, decision, options = {}) {
        const safeTaskId = validateSafeId(taskId, "task id");
        await this.initTask({ taskId: safeTaskId });
        const normalizedDecision = normalizeDelegationRouteDecision(decision);
        const record = {
            taskId: safeTaskId,
            routeId: normalizedDecision.routeId,
            recordedAt: this.now(),
            decision: normalizedDecision,
        };
        const request = normalizeRouteDecisionRequestEvidence(safeTaskId, normalizedDecision.routeId, options.request);
        if (request !== undefined) {
            record.request = request;
        }
        await appendJsonLine(taskPaths(this.root, safeTaskId).routesJsonl, record);
        return record;
    }
    async readRouteDecisions(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const records = await readJsonLines(taskPaths(this.root, safeTaskId).routesJsonl);
        return records.map((record) => normalizeRouteDecisionRecord(safeTaskId, record));
    }
    async recordRouteApplication(input) {
        const application = normalizeDelegationRouteApplication(input);
        await this.initTask({ taskId: application.taskId });
        const existing = (await this.readRouteApplications(application.taskId)).find((record) => record.routeId === application.routeId);
        if (existing !== undefined) {
            return { application: existing, recorded: false };
        }
        const toRecord = { ...application };
        if (toRecord.appliedAt === undefined && (toRecord.state === "applied" || toRecord.state === "already_applied")) {
            toRecord.appliedAt = this.now();
        }
        await appendJsonLine(taskPaths(this.root, application.taskId).routeApplicationsJsonl, toRecord);
        return { application: toRecord, recorded: true };
    }
    async readRouteApplications(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        return (await readJsonLines(taskPaths(this.root, safeTaskId).routeApplicationsJsonl)).map((application) => normalizeDelegationRouteApplication({ ...application, taskId: safeTaskId }));
    }
    async recordPlanningReportReady(taskId, input) {
        validateSafeId(taskId, "task id");
        requireNonEmptyString(input.planArtifactPath, "plan artifact path");
        throw new Error("bare planning readiness is unsupported; use publishPlanningReport so readiness binds immutable accepted evidence");
    }
    async recordPlanApproved(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        await this.initTask({ taskId: safeTaskId });
        return this.withExecutionAuthorizationLock(safeTaskId, () => this.recordPlanApprovedLocked(safeTaskId, input));
    }
    async readExecutionApprovalRequest(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const paths = taskPaths(this.root, safeTaskId);
        const task = await this.readTask(safeTaskId);
        if (task.taskId !== safeTaskId)
            throw new Error("delegation task identity is malformed");
        const events = await readJsonLines(paths.eventsJsonl);
        const request = executionApprovalRequestFromEvents(safeTaskId, paths, events);
        await validatePlanningReadyPublicationEvidence(paths, planningReadyPublicationBinding(events, lastEventIndexOfType(events, "planning_report.ready"), safeTaskId));
        return request;
    }
    async approveAndAuthorizeExecution(taskId, expected) {
        const safeTaskId = validateSafeId(taskId, "task id");
        if (validateSafeId(expected.taskId, "approval request task id") !== safeTaskId) {
            throw new Error("execution approval request task does not match target task");
        }
        const paths = taskPaths(this.root, safeTaskId);
        await this.readTask(safeTaskId);
        return this.withExecutionAuthorizationLock(safeTaskId, async () => {
            const currentEvents = await readJsonLines(paths.eventsJsonl);
            const current = executionApprovalRequestFromEvents(safeTaskId, paths, currentEvents);
            await validatePlanningReadyPublicationEvidence(paths, planningReadyPublicationBinding(currentEvents, lastEventIndexOfType(currentEvents, "planning_report.ready"), safeTaskId));
            if (current.planningReportReadyEventId !== expected.planningReportReadyEventId ||
                current.planArtifactPath !== expected.planArtifactPath ||
                current.executionMapPath !== expected.executionMapPath) {
                throw new Error("execution approval preview is stale; review the latest planning report before confirming");
            }
            const approval = await this.recordPlanApprovedLocked(safeTaskId, {
                eventId: stableId("plan_approved", [safeTaskId, current.planningReportReadyEventId, current.planArtifactPath, "user"]),
                planningReportReadyEventId: current.planningReportReadyEventId,
                planArtifactPath: current.planArtifactPath,
                approvedBy: "user",
            });
            let authorization;
            try {
                authorization = await this.recordExecutionAuthorizedLocked(safeTaskId, {
                    eventId: stableId("execution_authorized", [safeTaskId, current.planningReportReadyEventId, approval.eventId]),
                    planningReportReadyEventId: current.planningReportReadyEventId,
                    planApprovedEventId: approval.eventId,
                    planArtifactPath: current.planArtifactPath,
                    executionMapPath: current.executionMapPath,
                });
            }
            catch (error) {
                let recoveryFailure;
                try {
                    const evidence = await this.readExecutionAuthorization(safeTaskId);
                    if (evidence !== undefined &&
                        evidence.planningReportReadyEventId === current.planningReportReadyEventId &&
                        evidence.planApprovedEventId === approval.eventId) {
                        const events = await readJsonLines(paths.eventsJsonl);
                        const committed = events.find((event) => event.eventId === evidence.executionAuthorizedEventId && event.type === "execution.authorized");
                        if (committed !== undefined) {
                            return { approval, authorization: committed, evidence, commitState: "committed_reconciled", recoveryReason: messageFrom(error) };
                        }
                    }
                    recoveryFailure = new Error("committed execution authorization evidence was not recoverable");
                }
                catch (recoveryError) {
                    recoveryFailure = recoveryError;
                }
                throw executionAuthorizationTransitionError("execution authorization may have committed but could not be reconciled", "indeterminate", error, recoveryFailure);
            }
            return { approval, authorization, evidence: committedExecutionAuthorizationEvidence(approval, authorization), commitState: "committed" };
        });
    }
    async recordPlanApprovedLocked(safeTaskId, input) {
        const paths = taskPaths(this.root, safeTaskId);
        const events = await readJsonLines(paths.eventsJsonl);
        const predecessorId = validateSafeId(input.planningReportReadyEventId, "planning-ready predecessor event id");
        const planningMatches = events.filter((event) => event.eventId === predecessorId);
        const planning = planningMatches[0];
        if (planningMatches.length !== 1 || planning === undefined || planning.type !== "planning_report.ready" || !validTaskEventIdentity(planning, safeTaskId)) {
            throw new Error(`planning-ready predecessor event ${predecessorId} does not exist uniquely for task ${safeTaskId}`);
        }
        const planArtifactPath = requireNonEmptyString(input.planArtifactPath, "plan artifact path");
        if (planning.state !== "planning" || stringDataField(planning, "planArtifactPath") !== planArtifactPath) {
            throw new Error("plan artifact identity does not match planning-ready predecessor");
        }
        const planningIndex = events.indexOf(planning);
        assertPlanningReadyPublicationIsCurrent(events, planningIndex, safeTaskId);
        await validatePlanningReadyPublicationEvidence(paths, planningReadyPublicationBinding(events, planningIndex, safeTaskId));
        if (input.approvedBy !== "user" && input.approvedBy !== "orchestrator") {
            throw new Error(`unsupported plan approver: ${String(input.approvedBy)}`);
        }
        const data = {
            planningReportReadyEventId: predecessorId,
            planArtifactPath,
            approvedBy: input.approvedBy,
        };
        if (input.constraints !== undefined) {
            data.constraints = input.constraints.map((constraint, index) => requireNonEmptyString(constraint, `approval constraint ${index + 1}`));
        }
        const eventInput = { type: "plan.approved", state: "awaiting_user_approval", data };
        if (input.eventId !== undefined)
            eventInput.eventId = validateSafeId(input.eventId, "plan-approved event id");
        const candidate = this.buildEvent(safeTaskId, "task", eventInput);
        const existing = events.find((event) => event.eventId === candidate.eventId);
        if (existing !== undefined) {
            if (taskEventContentMatches(existing, candidate))
                return existing;
            throw new Error(`plan-approved event id conflict: ${candidate.eventId}`);
        }
        await appendJsonLine(paths.eventsJsonl, candidate);
        return candidate;
    }
    async recordExecutionAuthorized(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        await this.initTask({ taskId: safeTaskId });
        return this.withExecutionAuthorizationLock(safeTaskId, () => this.recordExecutionAuthorizedLocked(safeTaskId, input));
    }
    async recordExecutionAuthorizedLocked(safeTaskId, input) {
        const paths = taskPaths(this.root, safeTaskId);
        const events = await readJsonLines(paths.eventsJsonl);
        const planningId = validateSafeId(input.planningReportReadyEventId, "planning-ready predecessor event id");
        const approvalId = validateSafeId(input.planApprovedEventId, "plan-approved predecessor event id");
        const planArtifactPath = requireNonEmptyString(input.planArtifactPath, "plan artifact path");
        const predecessors = validateExecutionPredecessors(events, safeTaskId, planningId, approvalId, planArtifactPath);
        await validatePlanningReadyPublicationEvidence(paths, planningReadyPublicationBinding(events, predecessors.planningIndex, safeTaskId));
        const schemaVersion = input.schemaVersion ?? CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION;
        if (schemaVersion !== CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION) {
            throw new Error(`unsupported execution envelope schema version: ${schemaVersion}`);
        }
        const executionMapPath = paths.executionMapJson;
        if (input.executionMapPath !== undefined && requireNonEmptyString(input.executionMapPath, "execution map path") !== executionMapPath) {
            throw new Error("execution map path does not match canonical task path");
        }
        const executionId = executionEnvelopeId({
            taskId: safeTaskId,
            schemaVersion,
            executionMapPath,
            planArtifactPath,
            planningReportReadyEventId: planningId,
            planApprovedEventId: approvalId,
        });
        if (input.executionId !== undefined && validateSafeId(input.executionId, "execution id") !== executionId) {
            throw new Error("execution id does not match canonical envelope");
        }
        const constraints = input.constraints?.map((constraint, index) => requireNonEmptyString(constraint, `authorization constraint ${index + 1}`));
        const envelopePath = executionEnvelopeFilePath(paths.executionEnvelopesDir, executionId);
        const candidateEnvelope = {
            schemaVersion: CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION,
            executionId,
            taskId: safeTaskId,
            executionMapPath,
            planArtifactPath,
            planningReportReadyEventId: planningId,
            planApprovedEventId: approvalId,
            createdAt: this.now(),
        };
        let envelope = candidateEnvelope;
        const envelopeFileExists = await fileExists(envelopePath);
        if (envelopeFileExists) {
            envelope = normalizeExecutionEnvelope(await readJson(envelopePath));
            if (!executionEnvelopeIdentityMatches(envelope, candidateEnvelope)) {
                throw new Error(`execution envelope conflict: ${executionId}`);
            }
        }
        const mutableEvents = [...events];
        const envelopeEventInput = {
            eventId: validateSafeId(`execution-envelope-${executionId}`, "execution envelope event id"),
            timestamp: envelope.createdAt,
            type: "execution.envelope.created",
            state: "awaiting_user_approval",
            data: envelope,
        };
        const envelopeEvent = this.buildEvent(safeTaskId, "task", envelopeEventInput);
        const existingEnvelopeEvent = mutableEvents.find((event) => event.eventId === envelopeEvent.eventId);
        if (existingEnvelopeEvent !== undefined && !taskEventContentMatches(existingEnvelopeEvent, envelopeEvent)) {
            throw new Error(`execution envelope event id conflict: ${envelopeEvent.eventId}`);
        }
        if (!envelopeFileExists) {
            await writeJsonAtomic(envelopePath, envelope);
        }
        if (existingEnvelopeEvent === undefined) {
            await appendJsonLine(paths.eventsJsonl, envelopeEvent);
            mutableEvents.push(envelopeEvent);
        }
        const existingAuthorizationIndexes = mutableEvents
            .map((event, index) => ({ event, index }))
            .filter(({ event }) => event.type === "execution.authorized" && stringDataField(event, "executionId") === executionId);
        if (existingAuthorizationIndexes.length > 0) {
            const existing = existingAuthorizationIndexes.at(-1);
            if (existing === undefined || reconstructExecutionAuthorization(safeTaskId, paths, mutableEvents, envelope, existing.index) === undefined) {
                throw new Error(`execution authorization envelope conflict: ${executionId}`);
            }
            const existingConstraints = stringArrayDataField(existing.event, "constraints");
            if (!existingConstraints.valid || JSON.stringify(existingConstraints.value) !== JSON.stringify(constraints)) {
                throw new Error(`execution authorization constraints conflict: ${executionId}`);
            }
            await this.projectTaskReadyAfterAuthorization(safeTaskId);
            return existing.event;
        }
        const data = {
            schemaVersion,
            executionId,
            taskId: safeTaskId,
            executionMapPath,
            planArtifactPath,
            planningReportReadyEventId: planningId,
            planApprovedEventId: approvalId,
            taskState: "ready_for_execution",
        };
        if (constraints !== undefined)
            data.constraints = constraints;
        const eventInput = {
            type: "execution.authorized",
            state: "ready_for_execution",
            data,
        };
        if (input.eventId !== undefined)
            eventInput.eventId = validateSafeId(input.eventId, "execution authorization event id");
        const candidate = this.buildEvent(safeTaskId, "task", eventInput);
        const existingWithEventId = mutableEvents.find((event) => event.eventId === candidate.eventId);
        if (existingWithEventId !== undefined) {
            throw new Error(`execution authorization event id conflict: ${candidate.eventId}`);
        }
        const candidateEvents = [...mutableEvents, candidate];
        if (reconstructExecutionAuthorization(safeTaskId, paths, candidateEvents, envelope, candidateEvents.length - 1) === undefined) {
            throw new Error("execution authorization candidate failed causal validation");
        }
        await appendJsonLine(paths.eventsJsonl, candidate);
        await this.projectTaskReadyAfterAuthorization(safeTaskId);
        return candidate;
    }
    async readExecutionAuthorization(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const paths = taskPaths(this.root, safeTaskId);
        if (!(await fileExists(paths.taskJson)))
            return undefined;
        const task = await this.readTask(safeTaskId);
        if (task.taskId !== safeTaskId)
            return undefined;
        const events = await readJsonLines(paths.eventsJsonl);
        const authorizationIndex = lastEventIndexOfType(events, "execution.authorized");
        const authorization = events[authorizationIndex];
        const executionId = authorization === undefined ? undefined : stringDataField(authorization, "executionId");
        if (authorizationIndex < 0 || executionId === undefined)
            return undefined;
        try {
            const envelopePath = executionEnvelopeFilePath(paths.executionEnvelopesDir, executionId);
            if (!(await fileExists(envelopePath)))
                return undefined;
            const envelope = normalizeExecutionEnvelope(await readJson(envelopePath));
            const planningIndex = events.findIndex((event) => event.eventId === envelope.planningReportReadyEventId);
            await validatePlanningReadyPublicationEvidence(paths, planningReadyPublicationBinding(events, planningIndex, safeTaskId));
            return reconstructExecutionAuthorization(safeTaskId, paths, events, envelope, authorizationIndex);
        }
        catch {
            return undefined;
        }
    }
    async hasExecutionAuthorization(taskId) {
        return (await this.readExecutionAuthorization(taskId)) !== undefined;
    }
    async appendLeaseEvent(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        await this.initTask({ taskId: safeTaskId });
        const lease = normalizeDelegationLease(input.lease);
        if (lease.taskId !== safeTaskId) {
            throw new Error(`lease task id ${lease.taskId} does not match task ${safeTaskId}`);
        }
        const timestamp = input.timestamp ?? this.now();
        const event = {
            eventId: input.eventId ?? stableId("lease_evt", [timestamp, safeTaskId, lease.leaseId, lease.state]),
            timestamp,
            taskId: safeTaskId,
            leaseId: lease.leaseId,
            state: lease.state,
            lease,
        };
        if (input.reason !== undefined) {
            event.reason = requireNonEmptyString(input.reason, "lease transition reason");
        }
        return this.withLeaseLogLock(safeTaskId, async () => {
            const events = await this.readLeaseEvents(safeTaskId);
            const existing = events.find((candidate) => candidate.eventId === event.eventId);
            if (existing !== undefined) {
                if (JSON.stringify(existing) !== JSON.stringify(event)) {
                    throw new Error(`lease event id conflict: ${event.eventId}`);
                }
                return existing;
            }
            assertLeaseEventCanFollow(events, event);
            await appendJsonLine(taskPaths(this.root, safeTaskId).leasesJsonl, event);
            return event;
        });
    }
    async readLeaseEvents(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const events = (await readJsonLines(taskPaths(this.root, safeTaskId).leasesJsonl))
            .map((event) => normalizeLeaseEvent(safeTaskId, event));
        validateLeaseEventSequence(events);
        return events;
    }
    async transitionLease(taskId, leaseId, state, options = {}) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const safeLeaseId = validateSafeId(leaseId, "lease id");
        const events = await this.readLeaseEvents(safeTaskId);
        const latest = latestLeaseById(events).get(safeLeaseId);
        if (latest === undefined) {
            throw new Error(`cannot transition missing lease: ${safeLeaseId}`);
        }
        const timestamp = options.timestamp ?? this.now();
        const eventInput = {
            timestamp,
            lease: { ...latest.lease, state, updatedAt: timestamp },
        };
        if (options.eventId !== undefined) {
            eventInput.eventId = options.eventId;
        }
        if (options.reason !== undefined) {
            eventInput.reason = options.reason;
        }
        return this.appendLeaseEvent(safeTaskId, eventInput);
    }
    async ensureLeaseActive(taskId, input, reason = "assignment lease activated") {
        const safeTaskId = validateSafeId(taskId, "task id");
        await this.initTask({ taskId: safeTaskId });
        const requested = normalizeDelegationLease({ ...input, taskId: safeTaskId, state: "issued" });
        let events = await this.readLeaseEvents(safeTaskId);
        let latest = latestLeaseById(events).get(requested.leaseId);
        if (latest !== undefined && !leaseAuthorityMatches(latest.lease, requested)) {
            throw new Error(`lease authority conflict for deterministic lease id: ${requested.leaseId}`);
        }
        if (latest?.lease.state === "active") {
            return {
                lease: latest.lease,
                changed: false,
                appendedEventIds: [],
                view: await this.rebuildActiveLeaseView(safeTaskId),
            };
        }
        const appendedEventIds = [];
        const issuedAt = requested.issuedAt ?? this.now();
        if (latest?.lease.state !== "issued") {
            const issued = await this.appendLeaseEvent(safeTaskId, {
                eventId: leaseLifecycleEventId(requested.leaseId, "issued", events.length + 1),
                timestamp: issuedAt,
                reason,
                lease: { ...requested, state: "issued", issuedAt, updatedAt: issuedAt },
            });
            appendedEventIds.push(issued.eventId);
            events = await this.readLeaseEvents(safeTaskId);
            latest = latestLeaseById(events).get(requested.leaseId);
        }
        const activeAt = this.now();
        const active = await this.appendLeaseEvent(safeTaskId, {
            eventId: leaseLifecycleEventId(requested.leaseId, "active", events.length + 1),
            timestamp: activeAt,
            reason,
            lease: { ...(latest?.lease ?? requested), state: "active", issuedAt, updatedAt: activeAt },
        });
        appendedEventIds.push(active.eventId);
        return {
            lease: active.lease,
            changed: true,
            appendedEventIds,
            view: await this.rebuildActiveLeaseView(safeTaskId),
        };
    }
    async endActiveAssignmentLeases(taskId, agentId, state, reason) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const safeAgentId = validateSafeId(agentId, "agent id");
        await this.initTask({ taskId: safeTaskId });
        let events = await this.readLeaseEvents(safeTaskId);
        const active = [...latestLeaseById(events).values()]
            .map((event) => event.lease)
            .filter((lease) => lease.agentId === safeAgentId && lease.state === "active" && lease.expires === "on_assignment_terminal")
            .sort((left, right) => left.leaseId.localeCompare(right.leaseId));
        const leaseIds = [];
        for (const lease of active) {
            const timestamp = this.now();
            const ended = await this.appendLeaseEvent(safeTaskId, {
                eventId: leaseLifecycleEventId(lease.leaseId, state, events.length + 1),
                timestamp,
                reason,
                lease: { ...lease, state, updatedAt: timestamp },
            });
            leaseIds.push(ended.leaseId);
            events = await this.readLeaseEvents(safeTaskId);
        }
        return {
            leaseIds,
            changed: leaseIds.length > 0,
            view: await this.rebuildActiveLeaseView(safeTaskId),
        };
    }
    async rebuildActiveLeaseView(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        await this.initTask({ taskId: safeTaskId });
        const events = await this.readLeaseEvents(safeTaskId);
        const view = buildActiveLeaseViewFromEvents(safeTaskId, events, this.now());
        await writeJson(taskPaths(this.root, safeTaskId).activeLeasesJson, view);
        return view;
    }
    async readActiveLeaseView(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const paths = taskPaths(this.root, safeTaskId);
        const view = normalizeDelegationActiveLeaseView(await readJson(paths.activeLeasesJson));
        const events = await this.readLeaseEvents(safeTaskId);
        const lastEventId = events.at(-1)?.eventId ?? "none";
        if (view.rebuiltFrom.eventCount !== events.length || view.rebuiltFrom.lastEventId !== lastEventId) {
            throw new Error("stale active lease view");
        }
        const canonical = buildActiveLeaseViewFromEvents(safeTaskId, events, view.generatedAt);
        if (!activeLeaseViewsMatch(view, canonical)) {
            throw new Error("active lease view does not match lease log");
        }
        return view;
    }
    async recordLayoutAllocation(allocation) {
        const normalized = normalizeDelegationLayoutAllocation(allocation);
        await this.initTask({ taskId: normalized.taskId });
        const state = await this.readLayoutState(normalized.taskId);
        const existing = state.allocations.find((item) => item.allocationId === normalized.allocationId);
        if (existing !== undefined) {
            return existing;
        }
        const allocations = [...state.allocations, normalized].sort((left, right) => left.allocationId.localeCompare(right.allocationId));
        await writeJson(taskPaths(this.root, normalized.taskId).layoutJson, { version: 1, taskId: normalized.taskId, allocations, updatedAt: this.now() });
        return normalized;
    }
    async readLayoutState(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const paths = taskPaths(this.root, safeTaskId);
        if (!(await fileExists(paths.layoutJson))) {
            return { version: 1, taskId: safeTaskId, allocations: [], updatedAt: this.now() };
        }
        const state = await readJson(paths.layoutJson);
        if (state.version !== 1) {
            throw new Error("layout state version must be 1");
        }
        if (state.taskId !== safeTaskId) {
            throw new Error("layout state task id mismatch");
        }
        return {
            version: 1,
            taskId: safeTaskId,
            allocations: state.allocations.map((allocation) => normalizeDelegationLayoutAllocation(allocation)),
            updatedAt: requireNonEmptyString(state.updatedAt, "layout updatedAt"),
        };
    }
    async recordWakeAttempt(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const attempt = {
            attemptId: validateSafeId(input.attemptId, "wake attempt id"),
            taskId: safeTaskId,
            timestamp: input.timestamp ?? this.now(),
            alertIds: uniqueSafeIds(input.alertIds, "alert id"),
            priority: normalizeAlertPriority(input.priority),
            outcome: normalizeWakeAttemptOutcome(input.outcome),
            transport: requireNonEmptyString(input.transport, "wake transport"),
        };
        if (input.parentAgentId !== undefined) {
            attempt.parentAgentId = validateSafeId(input.parentAgentId, "parent agent id");
        }
        if (input.message !== undefined) {
            attempt.message = requireNonEmptyString(input.message, "wake attempt message");
        }
        const path = taskPaths(this.root, safeTaskId).wakeAttemptsJsonl;
        await mkdir(parentDirectory(path), { recursive: true });
        const release = await acquireBoundedFileLock(`${path}.lock`);
        try {
            const existing = (await readJsonLines(path))
                .map((item) => normalizeWakeAttempt(safeTaskId, item))
                .find((item) => item.attemptId === attempt.attemptId);
            if (existing !== undefined) {
                return existing;
            }
            await appendJsonLine(path, attempt);
            return attempt;
        }
        finally {
            await release();
        }
    }
    async readWakeAttempts(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        return (await readJsonLines(taskPaths(this.root, safeTaskId).wakeAttemptsJsonl)).map((attempt) => normalizeWakeAttempt(safeTaskId, attempt));
    }
    pathsForTask(taskId) {
        return taskPaths(this.root, taskId);
    }
    pathsForAgent(taskId, agentId) {
        return agentPaths(this.root, taskId, agentId);
    }
    async ensureParentAlertQueue(taskId) {
        const safeTaskId = validateSafeId(taskId, "task id");
        await this.withParentAlertLock(safeTaskId, async () => {
            const path = taskPaths(this.root, safeTaskId).parentAlertsJson;
            if (await fileExists(path)) {
                return;
            }
            const queue = { version: 1, taskId: safeTaskId, alerts: [], updatedAt: this.now() };
            await this.writeParentAlertQueue(safeTaskId, queue);
        });
    }
    async queueParentAlertRecord(taskId, input) {
        const safeTaskId = validateSafeId(taskId, "task id");
        const agentId = input.agentId !== undefined ? validateSafeId(input.agentId, "agent id") : undefined;
        let parentAgentId = input.parentAgentId !== undefined ? validateSafeId(input.parentAgentId, "parent agent id") : undefined;
        if (parentAgentId === undefined && agentId !== undefined) {
            parentAgentId = await this.parentAgentIdFor(safeTaskId, agentId);
        }
        return this.withParentAlertLock(safeTaskId, async () => {
            const queue = await this.readParentAlertQueue(safeTaskId);
            const timestamp = this.now();
            const state = input.state ?? stateForAlertOutcome(input.outcome);
            const dedupeKey = input.dedupeKey ?? alertDedupeKey({
                taskId: safeTaskId,
                agentId,
                parentAgentId,
                outcome: input.outcome,
                state,
                status: input.status,
                eventType: input.eventType,
                sourceEventId: input.sourceEventId,
                message: input.message,
            });
            const candidate = {
                alertId: alertIdFromParts(timestamp, safeTaskId, agentId, input.outcome, queue.alerts.length + 1),
                dedupeKey,
                taskId: safeTaskId,
                outcome: input.outcome,
                state,
                createdAt: timestamp,
                updatedAt: timestamp,
                alertState: "queued",
            };
            if (agentId !== undefined)
                candidate.agentId = agentId;
            if (parentAgentId !== undefined)
                candidate.parentAgentId = parentAgentId;
            if (input.status !== undefined)
                candidate.status = input.status;
            if (input.eventType !== undefined)
                candidate.eventType = input.eventType;
            if (input.message !== undefined)
                candidate.message = input.message;
            if (input.evidence !== undefined)
                candidate.evidence = stripUndefined(input.evidence);
            if (input.data !== undefined)
                candidate.data = input.data;
            if (input.escalatedFromAlertId !== undefined)
                candidate.escalatedFromAlertId = validateSafeId(input.escalatedFromAlertId, "escalated alert id");
            if (input.escalationProof !== undefined)
                candidate.escalationProof = input.escalationProof;
            candidate.priority = priorityForParentAlert(candidate);
            const existing = queue.alerts.find((alert) => alert.dedupeKey === dedupeKey && (input.coalesceAcknowledged === true || alert.readAt === undefined));
            if (existing !== undefined) {
                if (existing.readAt !== undefined) {
                    return { alert: existing, queued: false };
                }
                const merged = mergeUnreadParentAlert(existing, candidate, timestamp);
                Object.assign(existing, merged);
                await this.writeParentAlertQueue(safeTaskId, { ...queue, updatedAt: timestamp });
                return { alert: existing, queued: false };
            }
            queue.alerts.push(candidate);
            await this.writeParentAlertQueue(safeTaskId, { ...queue, updatedAt: timestamp });
            return { alert: candidate, queued: true };
        });
    }
    async recordQueuedWakeBestEffort(alert) {
        const priority = alert.priority ?? priorityForParentAlert(alert);
        if (priority === "P3") {
            return {};
        }
        try {
            const wakeAttempt = await this.recordWakeAttempt(alert.taskId, {
                attemptId: `wake-queued-${alert.alertId}-${priority}`,
                alertIds: [alert.alertId],
                priority,
                outcome: "queued",
                transport: "next-turn-context",
                ...(alert.parentAgentId === undefined ? {} : { parentAgentId: alert.parentAgentId }),
                message: "queued for next-turn parent runtime context",
            });
            return { wakeAttempt };
        }
        catch (error) {
            return { wakeAttemptError: messageFrom(error) };
        }
    }
    async maybeEscalateClosedParent(sourceAlert) {
        const directParentId = sourceAlert.parentAgentId;
        if (directParentId === undefined) {
            return undefined;
        }
        try {
            const registry = await this.readRegistry(sourceAlert.taskId);
            if (registry.taskId !== sourceAlert.taskId || !Array.isArray(registry.agents)) {
                return undefined;
            }
            const parentEntry = registry.agents.find((agent) => agent.agentId === directParentId);
            if (parentEntry?.state !== "closed") {
                return undefined;
            }
            const paths = agentPaths(this.root, sourceAlert.taskId, directParentId);
            const [status, manifest] = await Promise.all([
                this.readAgentStatus(sourceAlert.taskId, directParentId),
                this.readAgentManifest(sourceAlert.taskId, directParentId),
            ]);
            if (status.taskId !== sourceAlert.taskId
                || status.agentId !== directParentId
                || status.state !== "closed"
                || !isStableTimestamp(status.updatedAt)
                || manifest.taskId !== sourceAlert.taskId
                || manifest.agentId !== directParentId
                || manifest.role !== parentEntry.role
                || manifest.profile !== parentEntry.profile
                || manifest.parentAgentId !== parentEntry.parentAgentId
                || parentEntry.manifestPath !== paths.manifestJson
                || parentEntry.statusPath !== paths.statusJson) {
                return undefined;
            }
            resolveProfileForRole(manifest.role, manifest.profile);
            const ancestorId = validateSafeId(manifest.parentAgentId ?? "orchestrator", "parent escalation target");
            if (ancestorId === directParentId) {
                return undefined;
            }
            const proofEpoch = status.updatedAt;
            const proof = {
                kind: "explicit-parent-closed",
                proofEpoch,
                taskId: sourceAlert.taskId,
                parentAgentId: directParentId,
                parentRole: manifest.role,
                parentProfile: manifest.profile,
                targetParentAgentId: ancestorId,
                registryState: parentEntry.state,
                statusState: status.state,
                statusUpdatedAt: status.updatedAt,
                manifestParentAgentId: manifest.parentAgentId ?? null,
            };
            const sourceLink = {
                alertId: sourceAlert.alertId,
                agentId: sourceAlert.agentId ?? null,
                outcome: sourceAlert.outcome,
                priority: sourceAlert.priority ?? priorityForParentAlert(sourceAlert),
                evidence: sourceAlert.evidence === undefined
                    ? null
                    : stripUndefined(sourceAlert.evidence),
            };
            const result = await this.queueParentAlertRecord(sourceAlert.taskId, {
                agentId: directParentId,
                parentAgentId: ancestorId,
                outcome: "user_attention",
                state: "attention",
                status: "parent_unavailable",
                eventType: "parent-unavailable-escalation",
                message: `Parent ${directParentId} is explicitly closed; ancestor attention is required for unresolved source alerts.`,
                dedupeKey: ["parent-unavailable", sourceAlert.taskId, directParentId, ancestorId, proofEpoch].join(":"),
                escalatedFromAlertId: sourceAlert.alertId,
                escalationProof: proof,
                data: {
                    proof,
                    sourceAlerts: [sourceLink],
                },
            });
            const wake = await this.recordQueuedWakeBestEffort(result.alert);
            return { ...result, ...wake };
        }
        catch {
            return undefined;
        }
    }
    async withParentAlertLock(taskId, operation) {
        const lockPath = `${taskPaths(this.root, taskId).parentAlertsJson}.lock`;
        const release = await acquireBoundedFileLock(lockPath);
        try {
            return await operation();
        }
        finally {
            await release();
        }
    }
    async projectTaskReadyAfterAuthorization(taskId) {
        const task = await this.readTask(taskId);
        if (["created", "routing", "planning", "awaiting_user_approval"].includes(task.state)) {
            await this.writeTask({ ...task, state: "ready_for_execution" });
        }
    }
    async assertDelegatedPlanningReportPublicationSource(taskId, source) {
        const agentId = source.agentId;
        const assignmentId = source.assignmentId;
        const attemptId = source.attemptId;
        if (agentId === undefined || assignmentId === undefined || attemptId === undefined) {
            throw new Error("delegated planning report source requires complete assignment-attempt identity");
        }
        const manifest = await this.readAgentManifest(taskId, agentId);
        const status = await this.readAgentStatus(taskId, agentId);
        if (manifest.taskId !== taskId ||
            status.taskId !== taskId ||
            manifest.agentId !== agentId ||
            status.agentId !== agentId) {
            throw new Error("planning report source task-agent identity does not match stored assignment evidence");
        }
        if (manifest.role !== "planning-parent" || manifest.profile !== "planning-parent") {
            throw new Error("delegated planning report publication requires the planning-parent role and profile");
        }
        const identity = resolveAssignmentAttemptIdentity({ manifest, status, environmentAttemptId: attemptId });
        if (identity.assignmentId !== assignmentId || identity.attemptId !== attemptId) {
            throw new Error("planning report source assignment-attempt identity does not match current stored identity");
        }
    }
    async withLeaseLogLock(taskId, operation) {
        const lockPath = `${taskPaths(this.root, taskId).leasesJsonl}.lock`;
        const release = await acquireBoundedFileLock(lockPath);
        try {
            return await operation();
        }
        finally {
            await release();
        }
    }
    async withExecutionAuthorizationLock(taskId, operation) {
        const lockPath = `${taskPaths(this.root, taskId).eventsJsonl}.authorization.lock`;
        const release = await acquireBoundedFileLock(lockPath);
        try {
            return await operation();
        }
        finally {
            await release();
        }
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
        await writeJsonAtomic(taskPaths(this.root, taskId).parentAlertsJson, queue);
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
    async updateRegistryState(taskId, agentId, state, updatedAt = this.now(), terminalOutcomeId) {
        const registry = await this.readRegistry(taskId);
        const agents = registry.agents.map((agent) => {
            if (agent.agentId !== agentId) {
                return agent;
            }
            return {
                ...agent,
                state,
                updatedAt,
                ...(terminalOutcomeId === undefined ? {} : { terminalOutcomeId }),
            };
        });
        await writeJson(taskPaths(this.root, taskId).registryJson, { taskId, agents, updatedAt });
    }
}
export function createDelegationStore(options) {
    return new DelegationStore(options);
}
function taskPathsRoot(root) {
    return resolve(root, "tasks");
}
async function terminalOutcomeEvidenceExistsForAgent(root, taskId, agentId) {
    return fileExists(join(taskPaths(root, taskId).terminalOutcomesDir, validateSafeId(agentId, "agent id")));
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
async function readJsonLines(path) {
    if (!(await fileExists(path))) {
        return [];
    }
    const text = await readFile(path, "utf8");
    if (text.trim().length === 0) {
        return [];
    }
    return text.trim().split("\n").map((line) => JSON.parse(line));
}
async function writeJson(path, value) {
    await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeTextAtomic(path, text) {
    const directory = dirname(path);
    await mkdir(directory, { recursive: true });
    const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
    let handle;
    try {
        handle = await open(tempPath, "wx");
        await handle.writeFile(text, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(tempPath, path);
    }
    catch (error) {
        if (handle !== undefined) {
            await handle.close().catch(() => undefined);
        }
        await rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
    }
}
async function writeImmutableText(path, text) {
    const directory = dirname(path);
    await mkdir(directory, { recursive: true });
    const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
    let handle;
    try {
        handle = await open(tempPath, "wx");
        await handle.writeFile(text, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        try {
            await link(tempPath, path);
        }
        catch (error) {
            if (errorCode(error) !== "EEXIST")
                throw error;
            const existing = await readFile(path, "utf8");
            if (existing !== text)
                throw new Error(`immutable file conflict: ${path}`);
        }
        try {
            const directoryHandle = await open(directory, "r");
            try {
                await directoryHandle.sync();
            }
            finally {
                await directoryHandle.close();
            }
        }
        catch {
            // Hard-link publication is the visibility boundary; directory fsync is best effort.
        }
    }
    finally {
        if (handle !== undefined) {
            await handle.close().catch(() => undefined);
        }
        await rm(tempPath, { force: true }).catch(() => undefined);
    }
}
async function writeImmutableJson(path, value) {
    await writeImmutableText(path, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeJsonAtomic(path, value) {
    const directory = dirname(path);
    await mkdir(directory, { recursive: true });
    const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
    let handle;
    try {
        handle = await open(tempPath, "wx");
        await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(tempPath, path);
        try {
            const directoryHandle = await open(directory, "r");
            try {
                await directoryHandle.sync();
            }
            finally {
                await directoryHandle.close();
            }
        }
        catch {
            // Atomic rename is the correctness boundary; directory fsync is best effort.
        }
    }
    catch (error) {
        if (handle !== undefined) {
            await handle.close().catch(() => undefined);
        }
        await rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
    }
}
async function writeText(path, text) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
}
async function ensureTextFile(path, text) {
    await mkdir(dirname(path), { recursive: true });
    let handle;
    try {
        handle = await open(path, "wx");
        await handle.writeFile(text, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
    }
    catch (error) {
        if (handle !== undefined) {
            await handle.close().catch(() => undefined);
        }
        if (errorCode(error) === "EEXIST")
            return;
        throw error;
    }
}
async function appendJsonLine(path, value) {
    await mkdir(parentDirectory(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}
const ALERT_LOCK_TIMEOUT_MS = 5_000;
const ALERT_LOCK_RETRY_MS = 15;
const ALERT_LOCK_MALFORMED_STALE_MS = 30_000;
async function acquireBoundedFileLock(lockPath) {
    const ownersDir = `${lockPath}.owners`;
    await mkdir(ownersDir, { recursive: true });
    const token = `${process.pid}-${randomUUID()}`;
    const ownerPath = join(ownersDir, `${token}.json`);
    const createdAt = new Date().toISOString();
    await writeJsonAtomic(ownerPath, { pid: process.pid, token, createdAt, choosing: true, ticket: 0 });
    let acquired = false;
    try {
        const initialOwners = await readFileLockOwners(ownersDir);
        const maxTicket = initialOwners.reduce((maximum, owner) => {
            if (owner.record === undefined || !processIsAlive(owner.record.pid))
                return maximum;
            return Math.max(maximum, owner.record.ticket);
        }, 0);
        const ticket = maxTicket + 1;
        await writeJsonAtomic(ownerPath, { pid: process.pid, token, createdAt, choosing: false, ticket });
        const startedAt = Date.now();
        while (Date.now() - startedAt <= ALERT_LOCK_TIMEOUT_MS) {
            const owners = await readFileLockOwners(ownersDir);
            const blocked = owners.some((owner) => {
                if (owner.malformedFresh)
                    return true;
                const other = owner.record;
                if (other === undefined || other.token === token || !processIsAlive(other.pid))
                    return false;
                if (other.choosing || other.ticket <= 0)
                    return true;
                return other.ticket < ticket || (other.ticket === ticket && other.token.localeCompare(token) < 0);
            });
            if (!blocked) {
                acquired = true;
                return async () => {
                    await rm(ownerPath, { force: true });
                };
            }
            await sleep(ALERT_LOCK_RETRY_MS);
        }
        throw new Error(`timed out acquiring file lock: ${lockPath}`);
    }
    finally {
        if (!acquired) {
            await rm(ownerPath, { force: true }).catch(() => undefined);
        }
    }
}
async function readFileLockOwners(ownersDir) {
    const entries = await readdir(ownersDir, { withFileTypes: true });
    const owners = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isFile() || !entry.name.endsWith(".json"))
            continue;
        const path = join(ownersDir, entry.name);
        try {
            const [text, fileStat] = await Promise.all([readFile(path, "utf8"), stat(path)]);
            const record = parseFileLockOwnerRecord(text);
            owners.push({
                ...(record === undefined ? {} : { record }),
                malformedFresh: record === undefined && Date.now() - fileStat.mtimeMs < ALERT_LOCK_MALFORMED_STALE_MS,
            });
        }
        catch (error) {
            if (errorCode(error) !== "ENOENT")
                throw error;
        }
    }
    return owners;
}
function parseFileLockOwnerRecord(text) {
    try {
        const record = JSON.parse(text);
        if (typeof record.pid !== "number"
            || !Number.isInteger(record.pid)
            || record.pid <= 0
            || typeof record.token !== "string"
            || record.token.length === 0
            || !isStableTimestamp(record.createdAt)
            || typeof record.choosing !== "boolean"
            || typeof record.ticket !== "number"
            || !Number.isInteger(record.ticket)
            || record.ticket < 0) {
            return undefined;
        }
        return record;
    }
    catch {
        return undefined;
    }
}
function processIsAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return errorCode(error) !== "ESRCH";
    }
}
function errorCode(error) {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
}
function stateForAlertOutcome(outcome) {
    if (outcome === "completed_with_risks")
        return "completed";
    if (outcome === "capability_gap")
        return "blocked";
    if (outcome === "user_attention")
        return "attention";
    if (outcome === "progress" || outcome === "info")
        return "running";
    return outcome;
}
export function priorityForParentAlert(alert) {
    if (alert.outcome === "user_attention" || alert.eventType === "parent-unavailable-escalation" || alert.eventType === "delegation-invariant-violation" || alert.eventType === "harness-invariant-violation") {
        return "P0";
    }
    const data = jsonRecord(alert.data);
    const findings = Array.isArray(data?.findings) ? data.findings : [];
    const checks = Array.isArray(data?.checks) ? data.checks : [];
    const hasBlockingFinding = findings.some((finding) => jsonRecord(finding)?.severity === "blocking");
    const hasFailedCheck = checks.some((check) => jsonRecord(check)?.status === "fail");
    const unsupportedCompletion = data?.completionClaimSupported === false;
    if (alert.outcome === "attention"
        || alert.outcome === "capability_gap"
        || alert.outcome === "blocked"
        || alert.outcome === "failed"
        || alert.state === "attention"
        || alert.state === "attention_required"
        || alert.state === "result_malformed"
        || alert.state === "blocked"
        || alert.state === "failed"
        || alert.status === "blocked"
        || alert.status === "failed"
        || hasBlockingFinding
        || hasFailedCheck
        || unsupportedCompletion) {
        return "P1";
    }
    if (alert.outcome === "completed" || alert.outcome === "completed_with_risks" || alert.outcome === "cancelled") {
        return "P2";
    }
    return "P3";
}
function mergeUnreadParentAlert(existing, candidate, timestamp) {
    const existingPriority = existing.priority ?? priorityForParentAlert(existing);
    const candidatePriority = candidate.priority ?? priorityForParentAlert(candidate);
    const preserveExistingEvidence = alertPriorityRank(existingPriority) < alertPriorityRank(candidatePriority);
    const merged = {
        ...existing,
        ...candidate,
        alertId: existing.alertId,
        dedupeKey: existing.dedupeKey,
        createdAt: existing.createdAt,
        updatedAt: timestamp,
        alertState: "queued",
        priority: strongerAlertPriority(existingPriority, candidatePriority),
    };
    if (preserveExistingEvidence) {
        if (existing.status !== undefined)
            merged.status = existing.status;
        if (existing.eventType !== undefined)
            merged.eventType = existing.eventType;
        if (existing.evidence !== undefined)
            merged.evidence = existing.evidence;
        if (existing.data !== undefined)
            merged.data = existing.data;
        if (existing.escalatedFromAlertId !== undefined)
            merged.escalatedFromAlertId = existing.escalatedFromAlertId;
        if (existing.escalationProof !== undefined)
            merged.escalationProof = existing.escalationProof;
    }
    if (existing.eventType === "parent-unavailable-escalation" && candidate.eventType === "parent-unavailable-escalation") {
        const existingData = jsonRecord(existing.data) ?? {};
        const candidateData = jsonRecord(candidate.data) ?? {};
        const sources = mergeEscalationSourceLinks(existingData.sourceAlerts, candidateData.sourceAlerts);
        merged.data = { ...existingData, ...candidateData, sourceAlerts: sources };
        const firstSourceAlertId = sources[0]?.alertId;
        if (typeof firstSourceAlertId === "string") {
            merged.escalatedFromAlertId = firstSourceAlertId;
        }
        else if (existing.escalatedFromAlertId !== undefined) {
            merged.escalatedFromAlertId = existing.escalatedFromAlertId;
        }
        merged.message = `Parent ${merged.agentId ?? "unknown"} is explicitly closed; ancestor attention is required for ${sources.length} unresolved source alert(s).`;
    }
    return merged;
}
function mergeEscalationSourceLinks(left, right) {
    const byAlertId = new Map();
    for (const value of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
        const record = jsonRecord(value);
        if (record === undefined || typeof record.alertId !== "string")
            continue;
        const normalized = {};
        for (const key of ["alertId", "agentId", "outcome", "priority", "evidence"]) {
            const child = record[key];
            if (child !== undefined && isJsonValue(child))
                normalized[key] = child;
        }
        byAlertId.set(record.alertId, normalized);
    }
    return [...byAlertId.entries()]
        .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
        .slice(0, 32)
        .map(([, value]) => value);
}
function isJsonValue(value) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return true;
    if (Array.isArray(value))
        return value.every(isJsonValue);
    return typeof value === "object" && value !== null && Object.values(value).every(isJsonValue);
}
function strongerAlertPriority(left, right) {
    return alertPriorityRank(left) <= alertPriorityRank(right) ? left : right;
}
function alertPriorityRank(priority) {
    return priority === "P0" ? 0 : priority === "P1" ? 1 : priority === "P2" ? 2 : 3;
}
function jsonRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function eventIdFromParts(timestamp, taskId, scope, agentId, type) {
    return stableId("evt", [timestamp, taskId, scope, agentId ?? "task", type]);
}
function alertIdFromParts(timestamp, taskId, agentId, outcome, ordinal) {
    return stableId("alert", [timestamp, taskId, agentId ?? "task", outcome, String(ordinal)]);
}
function alertDedupeKey(input) {
    if (input.sourceEventId !== undefined) {
        return ["event", input.taskId, input.parentAgentId ?? "parent", input.agentId ?? "task", input.outcome, input.state, input.sourceEventId].join(":");
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
function leaseLifecycleEventId(leaseId, state, ordinal) {
    return validateSafeId(`lease-evt-${leaseId}-${state}-${ordinal}`, "lease event id");
}
function leaseAuthorityMatches(left, right) {
    return JSON.stringify(leaseAuthorityContent(left)) === JSON.stringify(leaseAuthorityContent(right));
}
function leaseAuthorityContent(lease) {
    return {
        leaseId: lease.leaseId,
        taskId: lease.taskId,
        agentId: lease.agentId,
        role: lease.role,
        actions: [...lease.actions].sort(),
        writeScopes: [...lease.writeScopes].sort(),
        allowedCommands: [...lease.allowedCommands].sort(),
        expires: lease.expires,
        maxFilesChanged: lease.maxFilesChanged,
        routeId: lease.routeId,
        assignmentId: lease.assignmentId,
        attemptId: lease.attemptId,
    };
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
function isStableTimestamp(value) {
    return typeof value === "string"
        && value.length > 0
        && value.trim() === value
        && Number.isFinite(Date.parse(value));
}
function messageFrom(error) {
    return error instanceof Error ? error.message : String(error);
}
function requireStringValue(value, label) {
    if (typeof value !== "string")
        throw new Error(`${label} must be a string`);
    return value;
}
async function resolveTerminalPublicationIdentity(manifest, status, paths) {
    try {
        return resolveAssignmentAttemptIdentity({ manifest, status });
    }
    catch (error) {
        const identityFields = [
            manifest.schemaVersion,
            manifest.identitySchemaVersion,
            manifest.profileSchemaVersion,
            manifest.protocolVersion,
            manifest.assignmentId,
            manifest.attemptId,
            manifest.attemptSource,
        ];
        const terminalState = ["completed", "completed_with_risks", "blocked", "failed", "cancelled"].includes(status.state);
        if (identityFields.some((value) => value !== undefined) || !terminalState)
            throw error;
        const synthetic = resolveAssignmentAttemptIdentity({ manifest, status: { ...status, state: "running" } });
        const terminalPaths = terminalOutcomeAttemptPaths(paths, synthetic.assignmentId, synthetic.attemptId);
        if (!(await fileExists(terminalPaths.claimPath)) && !(await fileExists(terminalPaths.acceptedJsonPath)))
            throw error;
        return synthetic;
    }
}
const TERMINAL_ROLES = ["planning-parent", "execution-parent", "researcher", "worker", "reviewer", "verifier", "integrator"];
const TERMINAL_STATUSES = ["completed", "completed_with_risks", "blocked", "failed", "cancelled"];
const TERMINAL_CHECK_STATUSES = ["pass", "fail", "skipped", "not_run"];
const TERMINAL_FINDING_SEVERITIES = ["blocking", "non_blocking", "question", "needs_evidence"];
function terminalOutcomeAttemptPaths(paths, assignmentId, attemptId) {
    const safeAssignmentId = validateSafeId(assignmentId, "terminal assignment id");
    const safeAttemptId = validateSafeId(attemptId, "terminal attempt id");
    const attemptDir = join(paths.terminalOutcomesDir, safeAssignmentId, safeAttemptId);
    return {
        attemptDir,
        lockPath: join(attemptDir, "publication.lock"),
        claimPath: join(attemptDir, "claim.json"),
        acceptedRawPath: join(attemptDir, "terminal.accepted.raw.txt"),
        acceptedJsonPath: join(attemptDir, "terminal.accepted.json"),
        reconciledJsonPath: join(attemptDir, "terminal.reconciled.json"),
        rejectedDir: join(attemptDir, "rejected"),
    };
}
function normalizeTerminalOutcomeSource(input) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("terminal outcome source must be an object");
    }
    if (input.transport !== "delegate_finish" && input.transport !== "runtime_parser" && input.transport !== "delegate_record_report") {
        throw new Error(`unsupported terminal outcome source transport: ${String(input.transport)}`);
    }
    return { transport: input.transport };
}
function normalizeTerminalOutcomeSourceForPublication(input) {
    const diagnostic = diagnosticJsonValue(input);
    try {
        return {
            source: normalizeTerminalOutcomeSource(input),
            diagnostic,
        };
    }
    catch (error) {
        return { diagnostic, error: messageFrom(error) };
    }
}
function diagnosticJsonValue(value) {
    try {
        return normalizeCanonicalJsonValue(value, "diagnostic value");
    }
    catch {
        return { unsupportedType: typeof value };
    }
}
function normalizeTerminalOutcomeEvidence(input) {
    try {
        return { evidence: normalizeCanonicalJsonValue(input, "terminal evidence") };
    }
    catch (error) {
        return { error: messageFrom(error) };
    }
}
function terminalOutcomeRejectionReason(input) {
    if (input.submittedAssignmentId !== input.identity.assignmentId) {
        return `submitted assignment ${input.submittedAssignmentId} does not match current assignment ${input.identity.assignmentId}`;
    }
    if (input.submittedAttemptId !== input.identity.attemptId) {
        return `submitted attempt ${input.submittedAttemptId} does not match current attempt ${input.identity.attemptId}`;
    }
    if (!TERMINAL_ROLES.includes(input.submittedRole)) {
        return `unsupported terminal role: ${input.submittedRole}`;
    }
    if (input.submittedRole !== input.manifest.role) {
        return `submitted role ${input.submittedRole} does not match current assignment role ${input.manifest.role}`;
    }
    if (!TERMINAL_STATUSES.includes(input.submittedStatus)) {
        return `unsupported terminal status: ${input.submittedStatus}`;
    }
    if (input.evidenceResult.error !== undefined || input.evidenceResult.evidence === undefined) {
        return input.evidenceResult.error ?? "terminal evidence is invalid";
    }
    const evidence = jsonObjectValue(input.evidenceResult.evidence);
    if (evidence === undefined)
        return "terminal evidence must be an object";
    if (!nonEmptyJsonString(evidence.summary))
        return "terminal evidence summary is required";
    if (input.submittedRole === "verifier") {
        if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) {
            return "verifier checks are required";
        }
        for (const check of evidence.checks) {
            const record = jsonObjectValue(check);
            if (record === undefined ||
                !nonEmptyJsonString(record.name) ||
                typeof record.status !== "string" ||
                !TERMINAL_CHECK_STATUSES.includes(record.status)) {
                return "verifier check evidence is malformed";
            }
        }
    }
    if (input.submittedRole === "reviewer" && evidence.findings !== undefined) {
        if (!Array.isArray(evidence.findings))
            return "reviewer findings must be an array";
        for (const finding of evidence.findings) {
            const record = jsonObjectValue(finding);
            if (record === undefined ||
                typeof record.severity !== "string" ||
                !TERMINAL_FINDING_SEVERITIES.includes(record.severity) ||
                !nonEmptyJsonString(record.problem)) {
                return "reviewer finding evidence is malformed";
            }
        }
    }
    if (input.submittedRole === "planning-parent") {
        if (evidence.reportName !== "planning-report" || !nonEmptyJsonString(evidence.reportStatus) || !nonEmptyJsonString(evidence.planningPublicationId)) {
            return "planning-parent terminal evidence requires reportName, reportStatus, and planningPublicationId";
        }
    }
    if (input.submittedRole === "execution-parent") {
        const report = evidence.report === undefined ? undefined : jsonObjectValue(evidence.report);
        if (evidence.reportName !== "execution-report" ||
            !nonEmptyJsonString(evidence.reportStatus) ||
            report === undefined ||
            report.kind !== "EXECUTION_REPORT" ||
            report.status !== evidence.reportStatus) {
            return "execution-parent terminal evidence requires one matching normalized execution report";
        }
    }
    return undefined;
}
async function planningParentTerminalEvidenceRejectionReason(paths, taskId, agentId, identity, evidenceValue) {
    const evidence = jsonObjectValue(evidenceValue);
    const publicationId = evidence?.planningPublicationId;
    const reportStatus = evidence?.reportStatus;
    if (!nonEmptyJsonString(publicationId) || !nonEmptyJsonString(reportStatus)) {
        return "planning-parent terminal evidence requires a valid planning publication identity";
    }
    const events = await readJsonLines(paths.eventsJsonl);
    const latestAccepted = [...events].reverse().find((event) => event.type === "planning_report.accepted" && validTaskEventIdentity(event, taskId));
    if (latestAccepted === undefined || stringDataField(latestAccepted, "publicationId") !== publicationId) {
        return "planning-parent terminal evidence does not reference the latest accepted planning publication";
    }
    try {
        const stored = await readValidAcceptedPlanningPublication(paths, latestAccepted);
        if (stored.reportStatus !== reportStatus ||
            stored.source.agentId !== agentId ||
            stored.source.assignmentId !== identity.assignmentId ||
            stored.source.attemptId !== identity.attemptId) {
            return "planning-parent terminal evidence does not match current delegated planning publication evidence";
        }
    }
    catch {
        return "planning-parent terminal evidence references invalid accepted planning publication evidence";
    }
    return undefined;
}
function normalizeCanonicalJsonValue(value, label) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new Error(`${label} numbers must be finite`);
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item, index) => normalizeCanonicalJsonValue(item, `${label}[${index}]`));
    }
    if (typeof value !== "object")
        throw new Error(`${label} contains a non-JSON value`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        throw new Error(`${label} must contain plain JSON objects`);
    const output = {};
    for (const key of Object.keys(value).sort()) {
        output[key] = normalizeCanonicalJsonValue(value[key], `${label}.${key}`);
    }
    return output;
}
function jsonObjectValue(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function nonEmptyJsonString(value) {
    return typeof value === "string" && value.trim().length > 0 && value.trim() === value;
}
function canonicalJson(value) {
    return JSON.stringify(normalizeCanonicalJsonValue(value, "canonical value"));
}
function sha256(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}
async function abandonStaleTerminalClaim(paths, claim, replacementContentHash, abandonedAt) {
    const abandonedDirectory = join(paths.attemptDir, "abandoned");
    const abandonmentPath = join(abandonedDirectory, `${claim.claimId}.json`);
    const abandonedRawPath = join(abandonedDirectory, `${claim.claimId}.raw.txt`);
    let preservedRawPath;
    if (await fileExists(paths.acceptedRawPath)) {
        const rawText = await readFile(paths.acceptedRawPath, "utf8");
        await writeImmutableText(abandonedRawPath, rawText);
        preservedRawPath = abandonedRawPath;
    }
    if (await fileExists(abandonmentPath)) {
        const existing = await readJson(abandonmentPath);
        if (existing.schemaVersion !== 1 ||
            existing.recordType !== "terminal.claim.abandoned" ||
            existing.replacementContentHash !== replacementContentHash ||
            JSON.stringify(existing.claim) !== JSON.stringify(claim)) {
            throw new Error(`terminal claim abandonment conflict: ${claim.claimId}`);
        }
    }
    else {
        await writeImmutableJson(abandonmentPath, {
            schemaVersion: 1,
            recordType: "terminal.claim.abandoned",
            claim,
            replacementContentHash,
            abandonedAt,
            ...(preservedRawPath === undefined ? {} : { preservedRawPath }),
        });
    }
    await rm(paths.acceptedRawPath, { force: true });
    await rm(paths.claimPath, { force: true });
}
function validateStoredTerminalClaim(claim, taskId, agentId, identity) {
    if (claim.schemaVersion !== 1 ||
        claim.recordType !== "terminal.claim" ||
        claim.taskId !== taskId ||
        claim.agentId !== agentId ||
        claim.assignmentId !== identity.assignmentId ||
        claim.attemptId !== identity.attemptId ||
        claim.claimId !== `terminal-claim-${claim.contentHash}` ||
        !/^[a-f0-9]{64}$/.test(claim.contentHash) ||
        !Number.isInteger(claim.ownerPid) ||
        claim.ownerPid <= 0 ||
        !isStableTimestamp(claim.claimedAt)) {
        throw new Error("terminal claim evidence is invalid");
    }
}
async function readValidTerminalAcceptedOutcome(paths, taskId, agentId, identity) {
    const accepted = await readJson(paths.acceptedJsonPath);
    const rawText = await readFile(paths.acceptedRawPath, "utf8");
    const source = normalizeTerminalOutcomeSource(accepted.source);
    const evidence = normalizeCanonicalJsonValue(accepted.evidence, "accepted terminal evidence");
    const contentHash = sha256(canonicalJson({
        taskId: accepted.taskId,
        agentId: accepted.agentId,
        assignmentId: accepted.assignmentId,
        attemptId: accepted.attemptId,
        role: accepted.role,
        status: accepted.status,
        source,
        evidence,
        rawText,
    }));
    if (accepted.schemaVersion !== 1 ||
        accepted.recordType !== "terminal.accepted" ||
        accepted.disposition !== "accepted" ||
        accepted.taskId !== taskId ||
        accepted.agentId !== agentId ||
        accepted.assignmentId !== identity.assignmentId ||
        accepted.attemptId !== identity.attemptId ||
        !TERMINAL_ROLES.includes(accepted.role) ||
        !TERMINAL_STATUSES.includes(accepted.status) ||
        accepted.outcomeId !== `terminal-${contentHash}` ||
        accepted.contentHash !== contentHash ||
        accepted.rawPath !== paths.acceptedRawPath ||
        accepted.jsonPath !== paths.acceptedJsonPath ||
        !isStableTimestamp(accepted.acceptedAt)) {
        throw new Error("accepted terminal outcome evidence is invalid");
    }
    return accepted;
}
function terminalAcceptedResult(accepted, claimPath) {
    return {
        status: "accepted",
        taskId: accepted.taskId,
        agentId: accepted.agentId,
        assignmentId: accepted.assignmentId,
        attemptId: accepted.attemptId,
        outcomeId: accepted.outcomeId,
        contentHash: accepted.contentHash,
        rawPath: accepted.rawPath,
        jsonPath: accepted.jsonPath,
        claimPath,
    };
}
function terminalAssignmentState(status) {
    return status === "completed" || status === "completed_with_risks" ? "completed" : status;
}
function terminalAlertOutcome(status, evidence) {
    const blockers = jsonObjectValue(evidence)?.blockers;
    if (Array.isArray(blockers) &&
        blockers.some((blocker) => jsonObjectValue(blocker)?.kind === "capability_gap")) {
        return "capability_gap";
    }
    return status;
}
function terminalEvidenceSummary(evidence) {
    const summary = jsonObjectValue(evidence)?.summary;
    if (!nonEmptyJsonString(summary))
        throw new Error("accepted terminal evidence summary is unavailable");
    return summary;
}
function terminalAlertData(accepted) {
    const evidence = jsonObjectValue(accepted.evidence);
    if (evidence === undefined)
        throw new Error("accepted terminal evidence must be an object");
    const data = {
        terminalOutcomeId: accepted.outcomeId,
        role: accepted.role,
        resultStatus: accepted.status,
    };
    for (const key of ["filesChanged", "findings", "checks", "completionClaimSupported"]) {
        if (evidence[key] !== undefined)
            data[key] = evidence[key];
    }
    return data;
}
function terminalEffectEventId(outcomeId, scope) {
    return validateSafeId(`${scope}-result-${outcomeId}`, "terminal event id");
}
function terminalReconciliationPath(accepted) {
    return join(dirname(accepted.jsonPath), "terminal.reconciled.json");
}
function validateStoredTerminalReconciliation(reconciliation, accepted) {
    if (reconciliation.schemaVersion !== 1 ||
        reconciliation.recordType !== "terminal.reconciled" ||
        reconciliation.outcomeId !== accepted.outcomeId ||
        reconciliation.contentHash !== accepted.contentHash ||
        !isStableTimestamp(reconciliation.reconciledAt)) {
        throw new Error("terminal reconciliation evidence is invalid");
    }
}
function terminalResultProjection(accepted, rawText) {
    const evidence = jsonObjectValue(accepted.evidence);
    if (evidence === undefined)
        throw new Error("accepted terminal evidence must be an object");
    const suppliedProjection = evidence.resultProjection;
    if (suppliedProjection !== undefined) {
        const projection = jsonObjectValue(suppliedProjection);
        if (projection === undefined)
            throw new Error("terminal resultProjection must be an object");
        return {
            ...projection,
            terminalOutcomeId: accepted.outcomeId,
            terminalAcceptedPath: accepted.jsonPath,
        };
    }
    const result = {
        kind: "FFRESULT",
        status: accepted.status,
        summary: terminalEvidenceSummary(accepted.evidence),
    };
    for (const key of ["filesChanged", "filesRead", "toolsUsed", "checks", "findings", "evidence", "uncertainty", "recommendation"]) {
        if (evidence[key] !== undefined)
            result[key] = evidence[key];
    }
    return {
        ok: true,
        rawText,
        transport: accepted.source.transport,
        terminalOutcomeId: accepted.outcomeId,
        terminalAcceptedPath: accepted.jsonPath,
        direct: {
            taskId: accepted.taskId,
            agentId: accepted.agentId,
            assignmentId: accepted.assignmentId,
            attemptId: accepted.attemptId,
            role: accepted.role,
            status: accepted.status,
            summary: terminalEvidenceSummary(accepted.evidence),
        },
        results: [result],
        planningReports: [],
        executionKickoffs: [],
        executionReports: [],
        statuses: [],
        attentions: [],
        errors: [],
    };
}
async function ensureDelegationEvent(path, event) {
    const release = await acquireBoundedFileLock(`${path}.terminal.lock`);
    try {
        const events = await readJsonLines(path);
        const existing = events.find((candidate) => candidate.eventId === event.eventId);
        if (existing !== undefined) {
            if (!taskEventContentMatches(existing, event)) {
                throw new Error(`terminal event id conflict: ${event.eventId}`);
            }
            return;
        }
        await appendJsonLine(path, event);
    }
    finally {
        await release();
    }
}
async function recordTerminalRejection(input) {
    const evidence = input.evidence ?? null;
    const contentHash = sha256(canonicalJson({
        taskId: input.taskId,
        agentId: input.agentId,
        assignmentId: input.identity.assignmentId,
        attemptId: input.identity.attemptId,
        submittedAssignmentId: input.submittedAssignmentId,
        submittedAttemptId: input.submittedAttemptId,
        submittedRole: input.submittedRole,
        submittedStatus: input.submittedStatus,
        source: input.source,
        evidence,
        rawText: input.rawText,
        reason: input.reason,
    }));
    const rejectionId = validateSafeId(`terminal-rejected-${contentHash}`, "terminal rejection id");
    const rawPath = join(input.paths.rejectedDir, `${rejectionId}.raw.txt`);
    const jsonPath = join(input.paths.rejectedDir, `${rejectionId}.json`);
    if (await fileExists(jsonPath)) {
        const stored = await readJson(jsonPath);
        const storedRaw = await readFile(rawPath, "utf8");
        if (stored.schemaVersion !== 1 ||
            stored.recordType !== "terminal.rejected" ||
            stored.disposition !== "rejected" ||
            stored.rejectionId !== rejectionId ||
            stored.contentHash !== contentHash ||
            stored.reason !== input.reason ||
            stored.rawPath !== rawPath ||
            stored.jsonPath !== jsonPath ||
            storedRaw !== input.rawText) {
            throw new Error(`terminal rejected evidence conflict: ${rejectionId}`);
        }
        return {
            status: "rejected",
            taskId: stored.taskId,
            agentId: stored.agentId,
            assignmentId: stored.assignmentId,
            attemptId: stored.attemptId,
            rejectionId,
            contentHash,
            rawPath,
            jsonPath,
            reason: stored.reason,
        };
    }
    const stored = {
        schemaVersion: 1,
        recordType: "terminal.rejected",
        disposition: "rejected",
        rejectionId,
        taskId: input.taskId,
        agentId: input.agentId,
        assignmentId: input.identity.assignmentId,
        attemptId: input.identity.attemptId,
        submittedAssignmentId: input.submittedAssignmentId,
        submittedAttemptId: input.submittedAttemptId,
        submittedRole: input.submittedRole,
        submittedStatus: input.submittedStatus,
        source: input.source,
        evidence,
        contentHash,
        reason: input.reason,
        recordedAt: input.recordedAt,
        rawPath,
        jsonPath,
    };
    await writeImmutableText(rawPath, input.rawText);
    await writeImmutableJson(jsonPath, stored);
    return {
        status: "rejected",
        taskId: input.taskId,
        agentId: input.agentId,
        assignmentId: input.identity.assignmentId,
        attemptId: input.identity.attemptId,
        rejectionId,
        contentHash,
        rawPath,
        jsonPath,
        reason: input.reason,
    };
}
function normalizePlanningReportPublicationSource(input) {
    if (input === null || typeof input !== "object")
        throw new Error("planning report source must be an object");
    if (input.transport !== "delegate_record_report" && input.transport !== "delegate_finish" && input.transport !== "runtime_parser") {
        throw new Error(`unsupported planning report source transport: ${String(input.transport)}`);
    }
    const agentId = input.agentId === undefined ? undefined : validateSafeId(input.agentId, "planning report source agent id");
    const assignmentId = input.assignmentId === undefined ? undefined : validateSafeId(input.assignmentId, "planning report source assignment id");
    const attemptId = input.attemptId === undefined ? undefined : validateSafeId(input.attemptId, "planning report source attempt id");
    const identityCount = [agentId, assignmentId, attemptId].filter((value) => value !== undefined).length;
    if (identityCount !== 0 && identityCount !== 3) {
        throw new Error("planning report source identity requires agentId, assignmentId, and attemptId together");
    }
    if ((input.transport === "delegate_finish" || input.transport === "runtime_parser") && identityCount !== 3) {
        throw new Error(`${input.transport} planning report source requires assignment-attempt identity`);
    }
    return {
        transport: input.transport,
        ...(agentId !== undefined ? { agentId } : {}),
        ...(assignmentId !== undefined ? { assignmentId } : {}),
        ...(attemptId !== undefined ? { attemptId } : {}),
    };
}
function planningReportPublicationId(taskId, disposition, contentHash, source) {
    const safeTaskId = validateSafeId(taskId, "planning report publication task id");
    const normalizedSource = normalizePlanningReportPublicationSource(source);
    return stableId("planning-publication", [
        safeTaskId,
        disposition,
        contentHash,
        normalizedSource.transport,
        normalizedSource.agentId ?? "root",
        normalizedSource.assignmentId ?? "none",
        normalizedSource.attemptId ?? "none",
    ]);
}
function planningReportPublicationEvidencePaths(paths, disposition, publicationId) {
    const safePublicationId = validateSafeId(publicationId, "planning report publication id");
    const directory = disposition === "accepted" ? paths.planningReportAcceptedDir : paths.planningReportRejectedDir;
    return {
        rawPath: join(directory, `${safePublicationId}.raw.txt`),
        jsonPath: join(directory, `${safePublicationId}.json`),
    };
}
function requireNonEmptyString(value, label) {
    if (value.length === 0 || value.trim() !== value) {
        throw new Error(`${label} must be a non-empty string without surrounding whitespace`);
    }
    return value;
}
function lastEventIndexOfType(events, type) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        if (events[index]?.type === type)
            return index;
    }
    return -1;
}
function stringDataField(event, field) {
    const data = event.data;
    if (data === null || typeof data !== "object" || Array.isArray(data))
        return undefined;
    const value = data[field];
    return typeof value === "string" ? value : undefined;
}
function recordDataField(event, field) {
    const data = event.data;
    if (data === null || typeof data !== "object" || Array.isArray(data))
        return undefined;
    const value = data[field];
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return undefined;
    return value;
}
function stringArrayDataField(event, field) {
    const data = event.data;
    if (data === null || typeof data !== "object" || Array.isArray(data))
        return { valid: false };
    const value = data[field];
    if (value === undefined)
        return { valid: true };
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0 && item.trim() === item)) {
        return { valid: false };
    }
    return { valid: true, value: value.map((item) => item) };
}
function validTaskEventIdentity(event, taskId) {
    return event.taskId === taskId && event.scope === "task" && event.agentId === undefined && isStableTimestamp(event.timestamp);
}
function taskEventContentMatches(left, right) {
    return isStableTimestamp(left.timestamp)
        && isStableTimestamp(right.timestamp)
        && left.eventId === right.eventId
        && left.taskId === right.taskId
        && left.type === right.type
        && left.scope === right.scope
        && left.agentId === right.agentId
        && left.state === right.state
        && left.message === right.message
        && JSON.stringify(left.data) === JSON.stringify(right.data);
}
function executionEnvelopeFilePath(directory, executionId) {
    return join(directory, `${validateSafeId(executionId, "execution id")}.json`);
}
function normalizeExecutionEnvelope(input) {
    if (input.schemaVersion !== CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION) {
        throw new Error(`unsupported execution envelope schema version: ${String(input.schemaVersion)}`);
    }
    if (!isStableTimestamp(input.createdAt))
        throw new Error("execution envelope createdAt must be a timestamp");
    return {
        schemaVersion: CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION,
        executionId: validateSafeId(input.executionId, "execution id"),
        taskId: validateSafeId(input.taskId, "execution envelope task id"),
        executionMapPath: requireNonEmptyString(input.executionMapPath, "execution map path"),
        planArtifactPath: requireNonEmptyString(input.planArtifactPath, "plan artifact path"),
        planningReportReadyEventId: validateSafeId(input.planningReportReadyEventId, "planning-ready predecessor event id"),
        planApprovedEventId: validateSafeId(input.planApprovedEventId, "plan-approved predecessor event id"),
        createdAt: input.createdAt,
    };
}
function executionEnvelopeIdentityMatches(left, right) {
    return left.schemaVersion === right.schemaVersion
        && left.executionId === right.executionId
        && left.taskId === right.taskId
        && left.executionMapPath === right.executionMapPath
        && left.planArtifactPath === right.planArtifactPath
        && left.planningReportReadyEventId === right.planningReportReadyEventId
        && left.planApprovedEventId === right.planApprovedEventId;
}
function executionEnvelopeId(input) {
    return stableId("execution", [
        String(input.schemaVersion),
        input.taskId,
        input.executionMapPath,
        input.planArtifactPath,
        input.planningReportReadyEventId,
        input.planApprovedEventId,
    ]);
}
function planningReadyPublicationBinding(events, planningReadyIndex, taskId) {
    const planningReady = events[planningReadyIndex];
    if (planningReady === undefined || planningReady.type !== "planning_report.ready") {
        throw new Error(`task ${taskId} has no valid planning-ready event to approve`);
    }
    const publicationId = stringDataField(planningReady, "publicationId");
    if (publicationId === undefined) {
        throw new Error("planning-ready event is not bound to immutable accepted planning publication evidence");
    }
    const acceptedMatches = events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.type === "planning_report.accepted" && stringDataField(event, "publicationId") === publicationId);
    const acceptedMatch = acceptedMatches[0];
    const accepted = acceptedMatch?.event;
    const acceptedStatus = accepted === undefined ? undefined : stringDataField(accepted, "reportStatus");
    const planArtifactPath = accepted === undefined ? undefined : stringDataField(accepted, "planArtifactPath");
    const contentHash = accepted === undefined ? undefined : stringDataField(accepted, "contentHash");
    const rawPath = accepted === undefined ? undefined : stringDataField(accepted, "rawPath");
    const jsonPath = accepted === undefined ? undefined : stringDataField(accepted, "jsonPath");
    const source = accepted === undefined ? undefined : recordDataField(accepted, "source");
    if (acceptedMatches.length !== 1 ||
        acceptedMatch === undefined ||
        accepted === undefined ||
        acceptedMatch.index >= planningReadyIndex ||
        !validTaskEventIdentity(accepted, taskId) ||
        (acceptedStatus !== "ready" && acceptedStatus !== "ready_with_open_questions") ||
        planArtifactPath === undefined ||
        planArtifactPath !== stringDataField(planningReady, "planArtifactPath") ||
        contentHash === undefined ||
        rawPath === undefined ||
        jsonPath === undefined ||
        source === undefined ||
        stringDataField(planningReady, "acceptedRawPath") !== rawPath ||
        stringDataField(planningReady, "acceptedJsonPath") !== jsonPath) {
        throw new Error("planning-ready event is not bound to one valid accepted planning publication");
    }
    return {
        planningReady,
        accepted,
        publicationId,
        contentHash,
        rawPath,
        jsonPath,
        reportStatus: acceptedStatus,
        planArtifactPath,
        source,
    };
}
async function readValidAcceptedPlanningPublication(paths, accepted) {
    try {
        const publicationId = stringDataField(accepted, "publicationId");
        const contentHash = stringDataField(accepted, "contentHash");
        const rawPath = stringDataField(accepted, "rawPath");
        const jsonPath = stringDataField(accepted, "jsonPath");
        const reportStatus = stringDataField(accepted, "reportStatus");
        const planArtifactPath = stringDataField(accepted, "planArtifactPath");
        const source = recordDataField(accepted, "source");
        if (publicationId === undefined ||
            contentHash === undefined ||
            rawPath === undefined ||
            jsonPath === undefined ||
            source === undefined ||
            (reportStatus !== "ready" && reportStatus !== "ready_with_open_questions" && reportStatus !== "blocked")) {
            throw new Error("accepted publication event is malformed");
        }
        const expectedPaths = planningReportPublicationEvidencePaths(paths, "accepted", publicationId);
        if (rawPath !== expectedPaths.rawPath || jsonPath !== expectedPaths.jsonPath) {
            throw new Error("accepted event paths are not canonical");
        }
        if (!(await fileExists(expectedPaths.rawPath)) || !(await fileExists(expectedPaths.jsonPath))) {
            throw new Error("accepted evidence file is missing");
        }
        const rawText = await readFile(expectedPaths.rawPath, "utf8");
        const stored = await readJson(expectedPaths.jsonPath);
        const parsed = parseProtocolText(rawText);
        const parsedReport = parsed.ok && parsed.planningReports.length === 1 ? parsed.planningReports[0] : undefined;
        const actualContentHash = createHash("sha256").update(rawText, "utf8").digest("hex");
        const normalizedSource = normalizePlanningReportPublicationSource(source);
        const expectedPublicationId = planningReportPublicationId(accepted.taskId, "accepted", actualContentHash, normalizedSource);
        const parsedPlanArtifactPath = parsedReport !== undefined && (reportStatus === "ready" || reportStatus === "ready_with_open_questions")
            ? planningReportPlanArtifactPath(parsedReport)
            : undefined;
        if (stored.schemaVersion !== 1 ||
            stored.disposition !== "accepted" ||
            stored.publicationId !== publicationId ||
            publicationId !== expectedPublicationId ||
            stored.taskId !== accepted.taskId ||
            stored.contentHash !== contentHash ||
            actualContentHash !== contentHash ||
            stored.rawPath !== expectedPaths.rawPath ||
            stored.jsonPath !== expectedPaths.jsonPath ||
            stored.recordedAt !== accepted.timestamp ||
            stored.reportStatus !== reportStatus ||
            stored.planArtifactPath !== planArtifactPath ||
            JSON.stringify(source) !== JSON.stringify(normalizedSource) ||
            JSON.stringify(stored.source) !== JSON.stringify(normalizedSource) ||
            stored.report === undefined ||
            parsedReport === undefined ||
            JSON.stringify(stored.report) !== JSON.stringify(parsedReport) ||
            parsedReport.status !== reportStatus ||
            parsedPlanArtifactPath !== planArtifactPath) {
            throw new Error("accepted evidence content does not match publication event");
        }
        return stored;
    }
    catch (error) {
        throw new Error(`accepted planning publication evidence is unavailable or invalid: ${messageFrom(error)}`);
    }
}
async function validatePlanningReadyPublicationEvidence(paths, binding) {
    const stored = await readValidAcceptedPlanningPublication(paths, binding.accepted);
    if (stored.publicationId !== binding.publicationId ||
        stored.contentHash !== binding.contentHash ||
        stored.rawPath !== binding.rawPath ||
        stored.jsonPath !== binding.jsonPath ||
        stored.reportStatus !== binding.reportStatus ||
        stored.planArtifactPath !== binding.planArtifactPath ||
        JSON.stringify(stored.source) !== JSON.stringify(binding.source) ||
        binding.planningReady.timestamp !== binding.accepted.timestamp) {
        throw new Error("accepted planning publication evidence is unavailable or invalid: readiness binding does not match accepted evidence");
    }
}
function assertPlanningReadyPublicationIsCurrent(events, planningReadyIndex, taskId) {
    planningReadyPublicationBinding(events, planningReadyIndex, taskId);
    const latestAcceptedIndex = lastEventIndexOfType(events, "planning_report.accepted");
    if (latestAcceptedIndex > planningReadyIndex) {
        const latestStatus = stringDataField(events[latestAcceptedIndex], "reportStatus");
        if (latestStatus === "blocked") {
            throw new Error("current planning publication is blocked; fresh ready evidence and authorization are required");
        }
        throw new Error("planning-ready publication was superseded; fresh ready evidence and authorization are required");
    }
}
function executionApprovalRequestFromEvents(taskId, paths, events) {
    const planningIndex = lastEventIndexOfType(events, "planning_report.ready");
    const planning = events[planningIndex];
    if (planning === undefined || !validTaskEventIdentity(planning, taskId) || planning.state !== "planning") {
        throw new Error(`task ${taskId} has no valid planning-ready event to approve`);
    }
    if (events.filter((event) => event.eventId === planning.eventId).length !== 1) {
        throw new Error(`latest planning-ready event id is not unique: ${planning.eventId}`);
    }
    const planArtifactPath = stringDataField(planning, "planArtifactPath");
    if (planArtifactPath === undefined)
        throw new Error("latest planning-ready event has no plan artifact identity");
    assertPlanningReadyPublicationIsCurrent(events, planningIndex, taskId);
    return {
        taskId,
        planningReportReadyEventId: planning.eventId,
        planArtifactPath,
        executionMapPath: paths.executionMapJson,
    };
}
function validateExecutionPredecessors(events, taskId, planningId, approvalId, planArtifactPath) {
    const planningMatches = events.map((event, index) => ({ event, index })).filter(({ event }) => event.eventId === planningId);
    if (planningMatches.length !== 1 || planningMatches[0]?.event.type !== "planning_report.ready" || !validTaskEventIdentity(planningMatches[0].event, taskId)) {
        throw new Error(`planning-ready predecessor event ${planningId} does not exist uniquely for task ${taskId}`);
    }
    const approvalMatches = events.map((event, index) => ({ event, index })).filter(({ event }) => event.eventId === approvalId);
    if (approvalMatches.length !== 1 || approvalMatches[0]?.event.type !== "plan.approved" || !validTaskEventIdentity(approvalMatches[0].event, taskId)) {
        throw new Error(`plan-approved predecessor event ${approvalId} does not exist uniquely for task ${taskId}`);
    }
    const planning = planningMatches[0];
    const approval = approvalMatches[0];
    if (planning.index >= approval.index)
        throw new Error("execution authorization predecessor events are out of causal order");
    assertPlanningReadyPublicationIsCurrent(events, planning.index, taskId);
    if (planning.event.state !== "planning" ||
        approval.event.state !== "awaiting_user_approval" ||
        stringDataField(planning.event, "planArtifactPath") !== planArtifactPath ||
        stringDataField(approval.event, "planArtifactPath") !== planArtifactPath ||
        stringDataField(approval.event, "planningReportReadyEventId") !== planningId) {
        throw new Error("plan artifact identity does not match predecessor chain");
    }
    const approvalConstraints = stringArrayDataField(approval.event, "constraints");
    const approvedBy = stringDataField(approval.event, "approvedBy");
    if (!approvalConstraints.valid || (approvedBy !== "user" && approvedBy !== "orchestrator")) {
        throw new Error("plan-approved predecessor is malformed");
    }
    return { planningIndex: planning.index, approvalIndex: approval.index, approvedBy };
}
function executionAuthorizationEventMatches(event, expected) {
    const data = event.data;
    if (!validTaskEventIdentity(event, expected.taskId) || event.type !== "execution.authorized" || data === null || typeof data !== "object" || Array.isArray(data)) {
        return false;
    }
    const constraints = stringArrayDataField(event, "constraints");
    return constraints.valid
        && event.state === "ready_for_execution"
        && data.schemaVersion === expected.schemaVersion
        && data.executionId === expected.executionId
        && data.taskId === expected.taskId
        && data.executionMapPath === expected.executionMapPath
        && data.planArtifactPath === expected.planArtifactPath
        && data.planningReportReadyEventId === expected.planningReportReadyEventId
        && data.planApprovedEventId === expected.planApprovedEventId
        && data.taskState === "ready_for_execution"
        && JSON.stringify(constraints.value) === JSON.stringify(expected.constraints);
}
function committedExecutionAuthorizationEvidence(approval, authorization) {
    const data = authorization.data;
    const approvedBy = stringDataField(approval, "approvedBy");
    if (data === null || typeof data !== "object" || Array.isArray(data) || data.schemaVersion !== CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION || (approvedBy !== "user" && approvedBy !== "orchestrator")) {
        throw new Error("committed execution authorization event is malformed");
    }
    return normalizeExecutionAuthorizationEvidence({
        schemaVersion: CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION,
        executionId: String(data.executionId),
        planningReportReadyEventId: String(data.planningReportReadyEventId),
        planApprovedEventId: String(data.planApprovedEventId),
        executionAuthorizedEventId: authorization.eventId,
        taskState: "ready_for_execution",
        taskId: String(data.taskId),
        executionMapPath: String(data.executionMapPath),
        planArtifactPath: String(data.planArtifactPath),
        approvedBy,
    });
}
function executionAuthorizationTransitionError(message, commitState, cause, recoveryError) {
    return Object.assign(new Error(message), {
        commitState,
        causeMessage: messageFrom(cause),
        recoveryError: messageFrom(recoveryError),
    });
}
function reconstructExecutionAuthorization(taskId, paths, events, envelopeInput, authorizationIndex) {
    try {
        const envelope = normalizeExecutionEnvelope(envelopeInput);
        if (envelope.taskId !== taskId || envelope.executionMapPath !== paths.executionMapJson)
            return undefined;
        if (envelope.executionId !== executionEnvelopeId(envelope))
            return undefined;
        const authorization = events[authorizationIndex];
        if (authorization === undefined || events.filter((event) => event.eventId === authorization.eventId).length !== 1)
            return undefined;
        const constraints = stringArrayDataField(authorization, "constraints");
        if (!constraints.valid || !executionAuthorizationEventMatches(authorization, { ...envelope, constraints: constraints.value }))
            return undefined;
        const predecessors = validateExecutionPredecessors(events, taskId, envelope.planningReportReadyEventId, envelope.planApprovedEventId, envelope.planArtifactPath);
        if (predecessors.planningIndex !== lastEventIndexOfType(events, "planning_report.ready"))
            return undefined;
        const envelopeEventId = validateSafeId(`execution-envelope-${envelope.executionId}`, "execution envelope event id");
        const envelopeEventMatches = events.map((event, index) => ({ event, index })).filter(({ event }) => event.eventId === envelopeEventId);
        const envelopeEvent = envelopeEventMatches[0];
        if (envelopeEventMatches.length !== 1 ||
            envelopeEvent === undefined ||
            !validTaskEventIdentity(envelopeEvent.event, taskId) ||
            envelopeEvent.event.type !== "execution.envelope.created" ||
            envelopeEvent.event.state !== "awaiting_user_approval" ||
            envelopeEvent.event.timestamp !== envelope.createdAt ||
            JSON.stringify(envelopeEvent.event.data) !== JSON.stringify(envelope) ||
            predecessors.approvalIndex >= envelopeEvent.index ||
            envelopeEvent.index >= authorizationIndex) {
            return undefined;
        }
        return normalizeExecutionAuthorizationEvidence({
            schemaVersion: CURRENT_EXECUTION_ENVELOPE_SCHEMA_VERSION,
            executionId: envelope.executionId,
            planningReportReadyEventId: envelope.planningReportReadyEventId,
            planApprovedEventId: envelope.planApprovedEventId,
            executionAuthorizedEventId: authorization.eventId,
            taskState: "ready_for_execution",
            taskId,
            executionMapPath: envelope.executionMapPath,
            planArtifactPath: envelope.planArtifactPath,
            approvedBy: predecessors.approvedBy,
        });
    }
    catch {
        return undefined;
    }
}
function normalizeRouteDecisionRecord(taskId, input) {
    const recordTaskId = validateSafeId(input.taskId, "route decision task id");
    if (recordTaskId !== taskId) {
        throw new Error(`route decision task id ${recordTaskId} does not match task ${taskId}`);
    }
    const routeId = validateSafeId(input.routeId, "route id");
    const decision = normalizeDelegationRouteDecision(input.decision);
    if (decision.routeId !== routeId) {
        throw new Error(`route decision route id ${decision.routeId} does not match record route ${routeId}`);
    }
    const record = {
        taskId,
        routeId,
        recordedAt: requireNonEmptyString(input.recordedAt, "recordedAt"),
        decision,
    };
    const request = normalizeRouteDecisionRequestEvidence(taskId, routeId, input.request);
    if (request !== undefined) {
        record.request = request;
    }
    return record;
}
function normalizeRouteDecisionRequestEvidence(taskId, routeId, input) {
    if (input === undefined) {
        return undefined;
    }
    const request = normalizeDelegationRouteRequest(input);
    if (request.taskId !== taskId) {
        throw new Error(`route request task id ${request.taskId} does not match task ${taskId}`);
    }
    if (request.routeId !== undefined && request.routeId !== routeId) {
        throw new Error(`route request route id ${request.routeId} does not match route ${routeId}`);
    }
    return { ...request, routeId };
}
function normalizeLeaseEvent(taskId, input) {
    const lease = normalizeDelegationLease(input.lease);
    if (lease.taskId !== taskId || input.taskId !== taskId || input.leaseId !== lease.leaseId || input.state !== lease.state) {
        throw new Error("lease event does not match normalized lease");
    }
    const event = {
        eventId: validateSafeId(input.eventId, "lease event id"),
        timestamp: requireNonEmptyString(input.timestamp, "lease event timestamp"),
        taskId,
        leaseId: lease.leaseId,
        state: lease.state,
        lease,
    };
    if (input.reason !== undefined) {
        event.reason = requireNonEmptyString(input.reason, "lease event reason");
    }
    return event;
}
function validateLeaseEventSequence(events) {
    const eventIds = new Set();
    const latest = new Map();
    for (const event of events) {
        if (eventIds.has(event.eventId)) {
            throw new Error(`duplicate lease event id in persisted history: ${event.eventId}`);
        }
        eventIds.add(event.eventId);
        assertLeaseEventCanFollow(latest.values(), event);
        latest.set(event.leaseId, event);
    }
}
function assertLeaseEventCanFollow(precedingEvents, candidate) {
    let previous;
    for (const event of precedingEvents) {
        if (event.leaseId === candidate.leaseId)
            previous = event;
    }
    if (previous === undefined) {
        if (candidate.state !== "issued") {
            throw new Error(`lease ${candidate.leaseId} must begin in issued state`);
        }
        return;
    }
    if (!leaseAuthorityMatches(previous.lease, candidate.lease)) {
        throw new Error(`lease authority conflict for deterministic lease id: ${candidate.leaseId}`);
    }
    if (previous.state === "issued" && candidate.state === "active") {
        return;
    }
    if (previous.state === "active" &&
        (candidate.state === "exhausted" || candidate.state === "expired" || candidate.state === "revoked")) {
        return;
    }
    if (previous.state === "exhausted" || previous.state === "expired" || previous.state === "revoked") {
        throw new Error(`terminal lease ${candidate.leaseId} cannot transition from ${previous.state} to ${candidate.state}`);
    }
    throw new Error(`non-monotonic lease transition for ${candidate.leaseId}: ${previous.state} -> ${candidate.state}`);
}
function latestLeaseById(events) {
    const latest = new Map();
    for (const event of events) {
        latest.set(event.leaseId, event);
    }
    return latest;
}
function buildActiveLeaseViewFromEvents(taskId, events, generatedAt) {
    const latest = latestLeaseById(events);
    const leasesById = {};
    const activeLeaseIdsByAgent = {};
    for (const [leaseId, event] of [...latest.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        leasesById[leaseId] = event.lease;
        if (event.lease.state === "active") {
            activeLeaseIdsByAgent[event.lease.agentId] = [...(activeLeaseIdsByAgent[event.lease.agentId] ?? []), leaseId];
        }
    }
    for (const leaseIds of Object.values(activeLeaseIdsByAgent)) {
        leaseIds.sort((left, right) => left.localeCompare(right));
    }
    const lastEvent = events.at(-1);
    return normalizeDelegationActiveLeaseView({
        version: 1,
        taskId,
        rebuiltFrom: {
            path: "leases.jsonl",
            eventCount: events.length,
            lastEventId: lastEvent?.eventId ?? "none",
        },
        generatedAt,
        leasesById,
        activeLeaseIdsByAgent,
    });
}
function activeLeaseViewsMatch(left, right) {
    return JSON.stringify(activeLeaseViewPolicyContent(left)) === JSON.stringify(activeLeaseViewPolicyContent(right));
}
function activeLeaseViewPolicyContent(view) {
    return {
        version: view.version,
        taskId: view.taskId,
        rebuiltFrom: view.rebuiltFrom,
        leasesById: Object.fromEntries(Object.entries(view.leasesById).sort(([left], [right]) => left.localeCompare(right))),
        activeLeaseIdsByAgent: Object.fromEntries(Object.entries(view.activeLeaseIdsByAgent)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([agentId, leaseIds]) => [agentId, [...leaseIds].sort((left, right) => left.localeCompare(right))])),
    };
}
function normalizeAlertPriority(priority) {
    if (priority === "P0" || priority === "P1" || priority === "P2" || priority === "P3") {
        return priority;
    }
    throw new Error(`invalid alert priority: ${priority}`);
}
function normalizeWakeAttemptOutcome(outcome) {
    if (outcome === "queued" || outcome === "sent" || outcome === "failed" || outcome === "skipped") {
        return outcome;
    }
    throw new Error(`invalid wake attempt outcome: ${outcome}`);
}
function normalizeWakeAttempt(taskId, input) {
    const attempt = {
        attemptId: validateSafeId(input.attemptId, "wake attempt id"),
        taskId,
        timestamp: requireNonEmptyString(input.timestamp, "wake attempt timestamp"),
        alertIds: uniqueSafeIds(input.alertIds, "alert id"),
        priority: normalizeAlertPriority(input.priority),
        outcome: normalizeWakeAttemptOutcome(input.outcome),
        transport: requireNonEmptyString(input.transport, "wake transport"),
    };
    if (input.parentAgentId !== undefined) {
        attempt.parentAgentId = validateSafeId(input.parentAgentId, "parent agent id");
    }
    if (input.message !== undefined) {
        attempt.message = requireNonEmptyString(input.message, "wake attempt message");
    }
    return attempt;
}
function uniqueSafeIds(values, label) {
    return [...new Set(values.map((value, index) => validateSafeId(value, `${label} ${index + 1}`)))];
}
function normalizeManifestWriteScopes(value) {
    if (value === undefined) {
        return [];
    }
    return Array.isArray(value) ? [...value] : [value];
}

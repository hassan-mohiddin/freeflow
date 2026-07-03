import { isAbsolute, resolve } from "node:path";
import { validateSafeId } from "./paths.js";
import { isBroadGitStageCommand, isGitPushCommand, isGitWorktreeMutationCommand, } from "./policy.js";
const WRITER_ROLES = new Set(["worker", "integrator"]);
const DEFAULT_BRANCH_PREFIX = "freeflow";
export function emptyExecutionMap(taskId, updatedAt) {
    return {
        version: 1,
        taskId: validateSafeId(taskId, "task id"),
        packages: [],
        integrationOrder: [],
        updatedAt,
    };
}
export function normalizeWorkPackageMetadata(input) {
    const packageId = validateSafeId(input.packageId, "package id");
    const dependencies = [...new Set((input.dependencies ?? []).map((dependency) => validateSafeId(dependency, "package dependency id")))];
    if (dependencies.includes(packageId)) {
        throw new Error(`work package ${packageId} cannot depend on itself`);
    }
    const expectedWriteScopes = normalizePathList(input.expectedWriteScopes, "expected write scope");
    if (isWriterRole(input.role) && expectedWriteScopes.length === 0) {
        throw new Error(`writer work package ${packageId} requires at least one expected write scope`);
    }
    const normalized = {
        packageId,
        role: input.role,
        dependencies,
        expectedWriteScopes,
        checkoutPath: validateCheckoutPath(input.checkoutPath, "checkout path"),
        allowedCommands: normalizeCommandList(input.allowedCommands ?? [], "allowed command"),
        state: input.state,
        review: normalizeCheckpointState(input.review, "review checkpoint"),
        verification: normalizeCheckpointState(input.verification, "verification checkpoint"),
        commitCheckpoints: normalizeCommitCheckpoints(input.commitCheckpoints ?? [], packageId),
    };
    if (input.agentId !== undefined) {
        normalized.agentId = validateSafeId(input.agentId, "agent id");
    }
    if (input.worktree !== undefined) {
        normalized.worktree = normalizeWorktreeMetadata(input.worktree, packageId);
    }
    if (input.integrationOrder !== undefined) {
        if (!Number.isInteger(input.integrationOrder) || input.integrationOrder < 0) {
            throw new Error("integration order must be a non-negative integer");
        }
        normalized.integrationOrder = input.integrationOrder;
    }
    return normalized;
}
export function normalizeExecutionMap(input, updatedAt = input.updatedAt) {
    const taskId = validateSafeId(input.taskId, "task id");
    const packages = (input.packages ?? []).map(normalizeWorkPackageMetadata);
    const packageIds = new Set(packages.map((pkg) => pkg.packageId));
    const integrationOrder = input.integrationOrder.length > 0
        ? input.integrationOrder.map((packageId) => validateSafeId(packageId, "integration package id"))
        : packages
            .filter((pkg) => pkg.integrationOrder !== undefined)
            .sort((left, right) => (left.integrationOrder ?? 0) - (right.integrationOrder ?? 0))
            .map((pkg) => pkg.packageId);
    for (const packageId of integrationOrder) {
        if (!packageIds.has(packageId)) {
            throw new Error(`integration order references unknown work package ${packageId}`);
        }
    }
    return {
        version: 1,
        taskId,
        packages,
        integrationOrder: [...new Set(integrationOrder)],
        updatedAt,
    };
}
export function validateExecutionMap(input) {
    let executionMap;
    try {
        executionMap = normalizeExecutionMap(input);
    }
    catch (error) {
        return block("invalid_metadata", messageFrom(error), "execution-parent");
    }
    const packageIds = new Set();
    for (const pkg of executionMap.packages) {
        if (packageIds.has(pkg.packageId)) {
            return block("invalid_metadata", `duplicate work package id: ${pkg.packageId}`, "execution-parent", pkg.packageId);
        }
        packageIds.add(pkg.packageId);
        for (const dependency of pkg.dependencies) {
            if (!packageIds.has(dependency) && !executionMap.packages.some((candidate) => candidate.packageId === dependency)) {
                return block("not_found", `work package ${pkg.packageId} depends on unknown package ${dependency}`, "execution-parent", pkg.packageId);
            }
        }
    }
    const writerDecision = validateOneWriterPerCheckout(executionMap.packages);
    if (!writerDecision.allowed) {
        return writerDecision;
    }
    return allow("execution map metadata is valid");
}
export function validateOneWriterPerCheckout(packages) {
    const writers = new Map();
    for (const pkg of packages) {
        if (!isWriterRole(pkg.role) || pkg.state === "cancelled") {
            continue;
        }
        const key = normalizeCheckoutKey(pkg.checkoutPath);
        const existing = writers.get(key);
        if (existing !== undefined && existing.packageId !== pkg.packageId) {
            return block("one_writer_violation", `checkout ${pkg.checkoutPath} already has writer package ${existing.packageId}; ${pkg.packageId} would violate one-writer-per-checkout`, "execution-parent", pkg.packageId);
        }
        writers.set(key, pkg);
    }
    return allow("one-writer-per-checkout metadata is valid");
}
export function validateWorkPackageReady(input) {
    const packageId = validateSafeId(input.packageId, "package id");
    const pkg = findPackage(input.executionMap, packageId);
    if (pkg === undefined) {
        return block("not_found", `work package not found: ${packageId}`, "execution-parent", packageId);
    }
    for (const dependencyId of pkg.dependencies) {
        const dependency = findPackage(input.executionMap, dependencyId);
        if (dependency === undefined) {
            return block("not_found", `dependency package not found: ${dependencyId}`, "execution-parent", packageId);
        }
        if (!isPackageComplete(dependency)) {
            return block("dependency_violation", `dependency ${dependencyId} is not complete for work package ${packageId}`, "execution-parent", packageId, dependencyId);
        }
    }
    return allow(`work package ${packageId} dependencies are satisfied`, packageId);
}
export function validateIntegrationOrder(input) {
    const packageId = validateSafeId(input.packageId, "package id");
    const pkg = findPackage(input.executionMap, packageId);
    if (pkg === undefined) {
        return block("not_found", `work package not found: ${packageId}`, "execution-parent", packageId);
    }
    const dependencyDecision = validateWorkPackageReady(input);
    if (!dependencyDecision.allowed) {
        return dependencyDecision;
    }
    const order = input.executionMap.integrationOrder;
    const index = order.indexOf(packageId);
    if (index < 0) {
        return allow(`work package ${packageId} has no explicit integration order constraint`, packageId);
    }
    for (const earlierPackageId of order.slice(0, index)) {
        const earlier = findPackage(input.executionMap, earlierPackageId);
        if (earlier === undefined) {
            return block("not_found", `integration order references unknown package ${earlierPackageId}`, "execution-parent", packageId);
        }
        if (earlier.state !== "integrated") {
            return block("sequencing_violation", `work package ${packageId} cannot integrate before ${earlierPackageId} is integrated`, "execution-parent", packageId, earlierPackageId);
        }
    }
    return allow(`work package ${packageId} integration order is satisfied`, packageId);
}
export function buildWorktreeBranchName(input) {
    const prefix = validateBranchPrefix(input.prefix ?? DEFAULT_BRANCH_PREFIX);
    const taskId = validateSafeId(input.taskId, "task id");
    const packageId = validateSafeId(input.packageId, "package id");
    return `${prefix}/${taskId}/${packageId}`;
}
export function createWorktreeMetadata(input) {
    const packageId = validateSafeId(input.packageId, "package id");
    const metadata = {
        path: validateCheckoutPath(input.path, "worktree path"),
        branchName: validateBranchName(input.branchName ?? buildWorktreeBranchName({ taskId: input.taskId, packageId })),
    };
    if (input.baseBranch !== undefined) {
        metadata.baseBranch = validateBranchName(input.baseBranch, "base branch");
    }
    if (input.baseCommit !== undefined) {
        metadata.baseCommit = validateCommitish(input.baseCommit, "base commit");
    }
    if (input.cleanup !== undefined) {
        metadata.cleanup = input.cleanup;
    }
    return metadata;
}
export function validateCommitCheckpoint(input) {
    const packageId = validateSafeId(input.packageId, "package id");
    const checkpointId = validateSafeId(input.checkpointId, "checkpoint id");
    const pkg = findPackage(input.executionMap, packageId);
    if (pkg === undefined) {
        return block("not_found", `work package not found: ${packageId}`, "execution-parent", packageId, checkpointId);
    }
    const checkpoint = pkg.commitCheckpoints.find((candidate) => candidate.checkpointId === checkpointId);
    if (checkpoint === undefined || checkpoint.planned !== true) {
        return block("not_found", `commit checkpoint not found in approved execution map: ${checkpointId}`, "execution-parent", packageId, checkpointId);
    }
    if (checkpoint.status !== "planned") {
        return block("checkpoint_status_not_planned", `commit checkpoint ${checkpointId} is ${checkpoint.status}; only status planned may transition to an intermediate commit`, "execution-parent", packageId, checkpointId);
    }
    const commands = [input.stagingCommand, input.commitCommand].filter((command) => command !== undefined && command.trim().length > 0);
    if (commands.some(isGitPushCommand)) {
        return block("push_denied", "push remains denied for delegation commit checkpoints", "orchestrator", packageId, checkpointId);
    }
    if (commands.some(isGitWorktreeMutationCommand)) {
        return block("git_operation_unsupported", "actual git worktree operations are unsupported in execution helper policy", "execution-parent", packageId, checkpointId);
    }
    if (commands.some(isBroadGitStageCommand)) {
        return block("broad_staging_denied", "broad staging is denied; stage explicit intended files only", "execution-parent", packageId, checkpointId);
    }
    if (input.role === "worker") {
        return block("worker_commit_blocked", "worker commits remain blocked by default", "execution-parent", packageId, checkpointId);
    }
    if (input.role !== "execution-parent" && input.role !== "integrator") {
        return block("role_not_allowed", `planned intermediate commit checkpoints are limited to execution-parent or integrator, not ${input.role}`, "execution-parent", packageId, checkpointId);
    }
    if (!isPackageComplete(pkg)) {
        return block("package_incomplete", `work package ${packageId} is not complete`, "execution-parent", packageId, checkpointId);
    }
    const reviewDecision = requiredCheckpointSatisfied("review", pkg.review, checkpoint.reviewRequired, packageId, checkpointId);
    if (!reviewDecision.allowed) {
        return reviewDecision;
    }
    const verificationDecision = requiredCheckpointSatisfied("verification", pkg.verification, checkpoint.verificationRequired, packageId, checkpointId);
    if (!verificationDecision.allowed) {
        return verificationDecision;
    }
    const intendedFiles = normalizeFileList(checkpoint.intendedFiles, "checkpoint intended file");
    if (intendedFiles.length === 0) {
        return block("intended_files_missing", `commit checkpoint ${checkpointId} must list intended files explicitly`, "execution-parent", packageId, checkpointId);
    }
    const intendedSet = new Set(intendedFiles);
    for (const file of input.changedFiles) {
        const normalized = normalizeFilePath(file.path, "changed file");
        const isIntended = intendedSet.has(normalized);
        if (file.sensitive === true) {
            return block("unexpected_sensitive_file", `sensitive file cannot be included in checkpoint: ${normalized}`, "orchestrator", packageId, checkpointId, normalized);
        }
        if (!isIntended && file.generated === true) {
            return block("unexpected_generated_file", `unexpected generated file in checkpoint: ${normalized}`, "execution-parent", packageId, checkpointId, normalized);
        }
        if (!isIntended && file.userOwned === true) {
            return block("unexpected_user_owned_file", `unexpected user-owned file in checkpoint: ${normalized}`, "orchestrator", packageId, checkpointId, normalized);
        }
        if (!isIntended) {
            return block("unexpected_file", `changed file is outside intended checkpoint file list: ${normalized}`, "execution-parent", packageId, checkpointId, normalized);
        }
    }
    return allow(`commit checkpoint ${checkpointId} is allowed for ${packageId}; execute explicit staging only and do not push`, packageId, checkpointId);
}
export function commitCheckpointApprovalFromDecision(decision) {
    if (!decision.allowed || decision.packageId === undefined || decision.checkpointId === undefined) {
        throw new Error("commit checkpoint approval requires an allowed checkpoint validation decision with package and checkpoint ids");
    }
    return {
        validatedBy: "validateCommitCheckpoint",
        packageId: decision.packageId,
        checkpointId: decision.checkpointId,
        reason: decision.reason,
    };
}
export function isPackageComplete(pkg) {
    return pkg.state === "completed" || pkg.state === "integrated";
}
export function isWriterRole(role) {
    return WRITER_ROLES.has(role);
}
function normalizeWorktreeMetadata(input, packageId) {
    const metadata = {
        path: validateCheckoutPath(input.path, "worktree path"),
        branchName: validateBranchName(input.branchName, "worktree branch"),
    };
    if (input.baseBranch !== undefined) {
        metadata.baseBranch = validateBranchName(input.baseBranch, "base branch");
    }
    if (input.baseCommit !== undefined) {
        metadata.baseCommit = validateCommitish(input.baseCommit, "base commit");
    }
    if (input.cleanup !== undefined) {
        metadata.cleanup = input.cleanup;
    }
    return metadata;
}
function normalizeCheckpointState(input, label) {
    const status = input.status;
    if (!["not_required", "pending", "passed", "failed", "skipped"].includes(status)) {
        throw new Error(`${label} has unsupported status: ${status}`);
    }
    const normalized = { required: Boolean(input.required), status };
    if (input.evidencePaths !== undefined) {
        normalized.evidencePaths = normalizePathList(input.evidencePaths, `${label} evidence path`);
    }
    if (input.outputIds !== undefined) {
        normalized.outputIds = input.outputIds.map((outputId, index) => validateNonEmptyString(outputId, `${label} output id ${index + 1}`));
    }
    if (input.notes !== undefined) {
        normalized.notes = validateNonEmptyString(input.notes, `${label} notes`);
    }
    return normalized;
}
function normalizeCommitCheckpoints(checkpoints, packageId) {
    const seen = new Set();
    return checkpoints.map((checkpoint) => {
        const checkpointId = validateSafeId(checkpoint.checkpointId, "checkpoint id");
        if (checkpoint.planned !== true) {
            throw new Error(`commit checkpoint ${checkpointId} must be planned`);
        }
        if (!["planned", "allowed", "blocked", "committed"].includes(checkpoint.status)) {
            throw new Error(`commit checkpoint ${checkpointId} has unsupported status: ${checkpoint.status}`);
        }
        if (seen.has(checkpointId)) {
            throw new Error(`duplicate commit checkpoint id: ${checkpointId}`);
        }
        seen.add(checkpointId);
        const normalized = {
            checkpointId,
            packageId,
            planned: true,
            status: checkpoint.status,
            intendedFiles: normalizeFileList(checkpoint.intendedFiles, `checkpoint ${checkpointId} intended file`),
        };
        if (checkpoint.message !== undefined) {
            normalized.message = validateNonEmptyString(checkpoint.message, `checkpoint ${checkpointId} message`);
        }
        if (checkpoint.reviewRequired !== undefined) {
            normalized.reviewRequired = checkpoint.reviewRequired;
        }
        if (checkpoint.verificationRequired !== undefined) {
            normalized.verificationRequired = checkpoint.verificationRequired;
        }
        if (checkpoint.evidencePaths !== undefined) {
            normalized.evidencePaths = normalizePathList(checkpoint.evidencePaths, `checkpoint ${checkpointId} evidence path`);
        }
        if (checkpoint.outputIds !== undefined) {
            normalized.outputIds = checkpoint.outputIds.map((outputId, index) => validateNonEmptyString(outputId, `checkpoint ${checkpointId} output id ${index + 1}`));
        }
        return normalized;
    });
}
function requiredCheckpointSatisfied(kind, checkpoint, requiredOverride, packageId, checkpointId) {
    const required = requiredOverride ?? checkpoint.required;
    if (!required) {
        return allow(`${kind} checkpoint is not required for ${packageId}`, packageId, checkpointId);
    }
    if (kind === "verification" && checkpoint.status !== "passed") {
        return block("verification_missing", `verification evidence is required before checkpoint ${checkpointId}`, "verifier", packageId, checkpointId);
    }
    if (kind === "review" && checkpoint.status !== "passed") {
        return block("review_missing", `review evidence is required before checkpoint ${checkpointId}`, "execution-parent", packageId, checkpointId);
    }
    if (!hasCheckpointEvidence(checkpoint)) {
        return block(kind === "review" ? "review_missing" : "verification_missing", `${kind} checkpoint ${checkpointId} has status ${checkpoint.status} but no evidence pointer`, kind === "review" ? "execution-parent" : "verifier", packageId, checkpointId);
    }
    return allow(`${kind} checkpoint is satisfied for ${packageId}`, packageId, checkpointId);
}
function hasCheckpointEvidence(checkpoint) {
    return (checkpoint.evidencePaths?.length ?? 0) > 0 || (checkpoint.outputIds?.length ?? 0) > 0 || (checkpoint.notes?.trim().length ?? 0) > 0;
}
function findPackage(executionMap, packageId) {
    return executionMap.packages.find((pkg) => pkg.packageId === packageId);
}
function allow(reason, packageId, checkpointId) {
    const decision = { allowed: true, status: "allowed", code: "allowed", reason };
    if (packageId !== undefined)
        decision.packageId = packageId;
    if (checkpointId !== undefined)
        decision.checkpointId = checkpointId;
    return decision;
}
function block(code, reason, reroute, packageId, checkpointId, filePath) {
    if (code === "allowed") {
        return allow(reason, packageId, checkpointId);
    }
    const decision = {
        allowed: false,
        status: code === "git_operation_unsupported" ? "unsupported" : "blocked",
        code,
        reason,
        reroute,
    };
    if (packageId !== undefined)
        decision.packageId = packageId;
    if (checkpointId !== undefined)
        decision.checkpointId = checkpointId;
    if (filePath !== undefined)
        decision.filePath = filePath;
    return decision;
}
function normalizeCheckoutKey(path) {
    return resolve(path);
}
function validateCheckoutPath(value, label) {
    const path = validatePathLike(value, label);
    if (!isAbsolute(path)) {
        throw new Error(`${label} must be an absolute path`);
    }
    return resolve(path);
}
function normalizePathList(values, label) {
    return [...new Set((values ?? []).map((value, index) => validatePathLike(value, `${label} ${index + 1}`)))];
}
function normalizeFileList(values, label) {
    return [...new Set((values ?? []).map((value, index) => normalizeFilePath(value, `${label} ${index + 1}`)))];
}
function normalizeFilePath(value, label) {
    const path = validatePathLike(value, label);
    if (isAbsolute(path)) {
        throw new Error(`${label} must be repo-relative, not absolute`);
    }
    return path.replace(/^\.\//, "").replace(/\\/g, "/");
}
function validatePathLike(value, label) {
    const path = validateNonEmptyString(value, label);
    if (/\r|\n/.test(path)) {
        throw new Error(`${label} must not contain newlines`);
    }
    if (path.includes("\0")) {
        throw new Error(`${label} must not contain NUL bytes`);
    }
    if (path.split(/[\\/]+/).includes("..")) {
        throw new Error(`${label} must not contain traversal segments`);
    }
    return path;
}
function normalizeCommandList(values, label) {
    return [...new Set((values ?? []).map((value, index) => {
            const command = validateNonEmptyString(value, `${label} ${index + 1}`).trim();
            if (/\r|\n/.test(command)) {
                throw new Error(`${label} ${index + 1} must not contain newlines`);
            }
            return command;
        }))];
}
function validateBranchPrefix(value) {
    const prefix = validateBranchName(value, "branch prefix");
    if (prefix.startsWith("/") || prefix.endsWith("/")) {
        throw new Error("branch prefix must not start or end with slash");
    }
    return prefix;
}
function validateBranchName(value, label = "branch name") {
    const branch = validateNonEmptyString(value, label);
    if (/\s|\\|\.\.|@\{|\0/.test(branch) || branch.startsWith("-") || branch.endsWith("/") || branch.endsWith(".") || branch.includes("//") || branch.endsWith(".lock")) {
        throw new Error(`${label} is not a safe git branch name`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) {
        throw new Error(`${label} contains unsupported characters`);
    }
    return branch;
}
function validateCommitish(value, label) {
    const text = validateNonEmptyString(value, label);
    if (!/^[A-Za-z0-9._/-]+$/.test(text) || text.includes("..") || text.includes("@{")) {
        throw new Error(`${label} contains unsupported characters`);
    }
    return text;
}
function validateNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }
    if (value.trim() !== value) {
        throw new Error(`${label} must not have surrounding whitespace`);
    }
    if (value.includes("\0")) {
        throw new Error(`${label} must not contain NUL bytes`);
    }
    return value;
}
function messageFrom(error) {
    return error instanceof Error ? error.message : String(error);
}

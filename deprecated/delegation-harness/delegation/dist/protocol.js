const BLOCK_KINDS = ["FFRESULT", "PLANNING_REPORT", "EXECUTION_KICKOFF", "EXECUTION_REPORT"];
const RESULT_STATUSES = new Set(["completed", "completed_with_risks", "blocked", "failed", "cancelled"]);
const PLANNING_REPORT_STATUSES = new Set(["ready", "ready_with_open_questions", "blocked"]);
const EXECUTION_REPORT_STATUSES = new Set(["completed", "completed_with_risks", "blocked", "failed"]);
const TAG_RE = /^[A-Z][A-Z0-9_]*$/;
const REQUIRED_PLANNING_REPORT_TAGS = [
    "STATUS",
    "GOAL",
    "ARTIFACT_PATHS",
    "REVIEW_STATUS",
    "SETTLED_DECISIONS",
    "OPEN_QUESTIONS",
    "EXECUTION_AUTONOMY",
    "USER_CHECKPOINTS",
    "EXECUTION_GUIDANCE",
    "RISKS",
    "EVIDENCE",
];
const REQUIRED_EXECUTION_KICKOFF_TAGS = [
    "TASK_GOAL",
    "SOURCE_TRUTH",
    "APPROVED_SCOPE",
    "OUT_OF_SCOPE",
    "REPO_STATE",
    "AUTONOMY",
    "USER_CHECKPOINTS",
    "COMMIT_POLICY",
    "EXECUTION_RULES",
    "STOP_CONDITIONS",
    "EXPECTED_EXECUTION_REPORT",
];
const REQUIRED_EXECUTION_REPORT_TAGS = [
    "STATUS",
    "SUMMARY",
    "SOURCE_REFERENCES",
    "WORK_PACKAGES",
    "COMMITS",
    "REVIEWS",
    "CHECKS",
    "FILES_CHANGED",
    "PLAN_DEVIATIONS",
    "STOP_CONDITIONS_HIT",
    "OPEN_QUESTIONS",
    "RISKS",
    "FINAL_RECOMMENDATION",
    "EVIDENCE",
];
export function collapseFieldNewlines(value) {
    return value.replace(/\r\n|\r|\n/g, " ");
}
export function escapeProtocolField(value) {
    return collapseFieldNewlines(value).replace(/\|/g, "¦");
}
export function unescapeProtocolField(value) {
    return value.replace(/¦/g, "|");
}
export function formatProtocolRow(tag, fields) {
    assertValidTag(tag);
    if (fields.length === 0) {
        throw new Error("protocol row must contain at least one field");
    }
    return [tag, ...fields.map(escapeProtocolField)].join("|");
}
export function parseProtocolRow(line, lineNumber = 1) {
    const parts = line.split("|");
    if (parts.length < 2) {
        throw new Error("protocol row must contain a tag and at least one field");
    }
    const [tag, ...rawFields] = parts;
    if (tag === undefined || !TAG_RE.test(tag)) {
        throw new Error(`invalid protocol row tag: ${tag ?? ""}`);
    }
    return {
        tag,
        fields: rawFields.map(unescapeProtocolField),
        lineNumber,
        raw: line,
    };
}
export function parseProtocolText(rawText, options = {}) {
    const errors = [];
    const results = [];
    const planningReports = [];
    const executionKickoffs = [];
    const executionReports = [];
    const statuses = [];
    const attentions = [];
    const lines = rawText.split(/\r\n|\n|\r/);
    let openBlock;
    for (let index = 0; index < lines.length; index += 1) {
        const lineNumber = index + 1;
        const line = lines[index] ?? "";
        const trimmed = line.trim();
        if (openBlock !== undefined) {
            openBlock.rawLines.push(line);
            if (trimmed === endTagFor(openBlock.kind)) {
                const parsed = buildBlock(openBlock, lineNumber, errors);
                if (parsed !== undefined) {
                    pushParsedBlock(parsed, results, planningReports, executionKickoffs, executionReports, errors);
                }
                openBlock = undefined;
                continue;
            }
            if (trimmed.length === 0) {
                continue;
            }
            if (isBlockStart(trimmed)) {
                errors.push({ lineNumber, message: `nested protocol block ${trimmed} is not allowed`, raw: line, blockKind: openBlock.kind });
                continue;
            }
            try {
                openBlock.rows.push(parseProtocolRow(line, lineNumber));
            }
            catch (error) {
                errors.push({
                    lineNumber,
                    message: error instanceof Error ? error.message : "invalid protocol row",
                    raw: line,
                    blockKind: openBlock.kind,
                });
            }
            continue;
        }
        if (trimmed.length === 0) {
            continue;
        }
        if (isBlockStart(trimmed)) {
            openBlock = { kind: trimmed, startLine: lineNumber, rows: [], rawLines: [line] };
            continue;
        }
        if (line.startsWith("FFSTATUS|")) {
            const signal = parseSignal(line, lineNumber, "FFSTATUS", errors);
            if (signal !== undefined) {
                statuses.push(signal);
            }
            continue;
        }
        if (line.startsWith("FFATTENTION|")) {
            const signal = parseSignal(line, lineNumber, "FFATTENTION", errors);
            if (signal !== undefined) {
                attentions.push(signal);
            }
            continue;
        }
    }
    if (openBlock !== undefined) {
        errors.push({
            lineNumber: openBlock.startLine,
            message: `missing ${endTagFor(openBlock.kind)} for ${openBlock.kind}`,
            raw: openBlock.rawLines.join("\n"),
            blockKind: openBlock.kind,
        });
    }
    if (options.requireResult === true && results.length === 0) {
        errors.push({ lineNumber: 1, message: "required FFRESULT block was not found" });
    }
    return {
        ok: errors.length === 0,
        rawText,
        results,
        planningReports,
        executionKickoffs,
        executionReports,
        statuses,
        attentions,
        errors,
    };
}
export const parseModelText = parseProtocolText;
export function planningReportPlanArtifactPath(report) {
    if (report.kind !== "PLANNING_REPORT")
        return undefined;
    return planningPlanArtifactPathFromFields(report.fields);
}
function planningPlanArtifactPathFromFields(fields) {
    const explicitPaths = [...new Set((fields.PLAN_ARTIFACT_PATH ?? []).flatMap((row) => row).map((value) => value.trim()).filter(Boolean))];
    if (explicitPaths.length > 0)
        return explicitPaths.length === 1 ? explicitPaths[0] : undefined;
    const artifactPaths = splitListField(fields, "ARTIFACT_PATHS");
    const planCandidates = artifactPaths.filter((path) => /(?:^|\/)plans?(?:\/|$)/.test(path));
    if (planCandidates.length === 1)
        return planCandidates[0];
    return artifactPaths.length === 1 ? artifactPaths[0] : undefined;
}
function buildBlock(openBlock, endLine, errors) {
    if (openBlock.rows.length === 0) {
        errors.push({
            lineNumber: openBlock.startLine,
            message: `${openBlock.kind} block contains no rows`,
            raw: openBlock.rawLines.join("\n"),
            blockKind: openBlock.kind,
        });
        return undefined;
    }
    return {
        kind: openBlock.kind,
        rows: openBlock.rows,
        fields: rowsToFieldMap(openBlock.rows),
        rawText: openBlock.rawLines.join("\n"),
        startLine: openBlock.startLine,
        endLine,
    };
}
function pushParsedBlock(block, results, planningReports, executionKickoffs, executionReports, errors) {
    if (block.kind === "FFRESULT") {
        const result = parseResultBlock(block, errors);
        if (result !== undefined) {
            results.push(result);
        }
        return;
    }
    validateParentReportBlock(block, errors);
    const status = firstScalar(block.fields, "STATUS");
    const report = {
        ...block,
        kind: block.kind,
        ...(status !== undefined ? { status } : {}),
    };
    if (block.kind === "PLANNING_REPORT") {
        planningReports.push(report);
    }
    else if (block.kind === "EXECUTION_KICKOFF") {
        executionKickoffs.push(report);
    }
    else {
        executionReports.push(report);
    }
}
function validateParentReportBlock(block, errors) {
    const requiredTags = requiredParentReportTags(block.kind);
    for (const tag of requiredTags) {
        if (!hasNonEmptyField(block.fields, tag)) {
            errors.push({
                lineNumber: block.startLine,
                message: `${block.kind} missing required row ${tag}`,
                blockKind: block.kind,
                raw: block.rawText,
            });
        }
    }
    const status = firstScalar(block.fields, "STATUS");
    if (block.kind === "PLANNING_REPORT" && status !== undefined && !PLANNING_REPORT_STATUSES.has(status)) {
        errors.push({
            lineNumber: block.startLine,
            message: `PLANNING_REPORT has unknown STATUS: ${status}`,
            blockKind: block.kind,
            raw: block.rawText,
        });
    }
    if (block.kind === "PLANNING_REPORT" &&
        (status === "ready" || status === "ready_with_open_questions") &&
        planningPlanArtifactPathFromFields(block.fields) === undefined) {
        errors.push({
            lineNumber: block.startLine,
            message: "PLANNING_REPORT ready status requires exactly one plan artifact identity",
            blockKind: block.kind,
            raw: block.rawText,
        });
    }
    if (block.kind === "EXECUTION_REPORT" && status !== undefined && !EXECUTION_REPORT_STATUSES.has(status)) {
        errors.push({
            lineNumber: block.startLine,
            message: `EXECUTION_REPORT has unknown STATUS: ${status}`,
            blockKind: block.kind,
            raw: block.rawText,
        });
    }
}
function requiredParentReportTags(kind) {
    if (kind === "PLANNING_REPORT") {
        return REQUIRED_PLANNING_REPORT_TAGS;
    }
    if (kind === "EXECUTION_KICKOFF") {
        return REQUIRED_EXECUTION_KICKOFF_TAGS;
    }
    if (kind === "EXECUTION_REPORT") {
        return REQUIRED_EXECUTION_REPORT_TAGS;
    }
    return [];
}
function hasNonEmptyField(fields, tag) {
    return (fields[tag] ?? []).some((rowFields) => rowFields.some((field) => field.trim().length > 0));
}
function parseResultBlock(block, errors) {
    const rawStatus = firstScalar(block.fields, "STATUS");
    if (rawStatus === undefined) {
        errors.push({ lineNumber: block.startLine, message: "FFRESULT missing STATUS row", blockKind: "FFRESULT", raw: block.rawText });
        return undefined;
    }
    if (!RESULT_STATUSES.has(rawStatus)) {
        errors.push({ lineNumber: block.startLine, message: `FFRESULT has unknown STATUS: ${rawStatus}`, blockKind: "FFRESULT", raw: block.rawText });
        return undefined;
    }
    const summary = firstScalar(block.fields, "SUMMARY");
    const uncertainty = firstScalar(block.fields, "UNCERTAINTY");
    const recommendation = firstScalar(block.fields, "RECOMMENDATION");
    return {
        ...block,
        kind: "FFRESULT",
        status: rawStatus,
        ...(summary !== undefined ? { summary } : {}),
        evidence: rowsWithTag(block.rows, "EVIDENCE"),
        filesRead: splitListField(block.fields, "FILES_READ"),
        filesChanged: splitListField(block.fields, "FILES_CHANGED"),
        toolsUsed: splitListField(block.fields, "TOOLS_USED"),
        checks: rowsWithTag(block.rows, "CHECK"),
        blockers: rowsWithTag(block.rows, "BLOCKER").map(parseBlockerRow),
        requests: rowsWithTag(block.rows, "REQUEST").map(parseRequestRow),
        ...(uncertainty !== undefined ? { uncertainty } : {}),
        ...(recommendation !== undefined ? { recommendation } : {}),
    };
}
function parseSignal(line, lineNumber, expectedTag, errors) {
    try {
        const row = parseProtocolRow(line, lineNumber);
        if (row.tag !== expectedTag) {
            errors.push({ lineNumber, message: `expected ${expectedTag} row`, raw: line });
            return undefined;
        }
        return {
            kind: expectedTag,
            lineNumber,
            raw: line,
            fields: row.fields,
            ...(row.fields[0] !== undefined ? { state: row.fields[0] } : {}),
            ...(row.fields[1] !== undefined ? { message: row.fields[1] } : {}),
            attributes: parseAttributes(row.fields.slice(2)),
        };
    }
    catch (error) {
        errors.push({ lineNumber, message: error instanceof Error ? error.message : `invalid ${expectedTag} row`, raw: line });
        return undefined;
    }
}
function rowsToFieldMap(rows) {
    const fields = {};
    for (const row of rows) {
        fields[row.tag] ??= [];
        fields[row.tag]?.push(row.fields);
    }
    return fields;
}
function firstScalar(fields, tag) {
    return fields[tag]?.[0]?.[0];
}
function rowsWithTag(rows, tag) {
    return rows.filter((row) => row.tag === tag);
}
function splitListField(fields, tag) {
    const rows = fields[tag] ?? [];
    return rows.flatMap((rowFields) => rowFields).flatMap((field) => field.split(",")).map((value) => value.trim()).filter(Boolean);
}
function parseBlockerRow(row) {
    return {
        kind: row.fields[0] ?? "unknown",
        message: row.fields[1] ?? "",
        attributes: parseAttributes(row.fields.slice(2)),
    };
}
function parseRequestRow(row) {
    return {
        action: row.fields[0] ?? "unknown",
        detail: row.fields[1] ?? "",
        attributes: parseAttributes(row.fields.slice(2)),
    };
}
function parseAttributes(fields) {
    const attributes = {};
    for (const field of fields) {
        const equalsIndex = field.indexOf("=");
        if (equalsIndex <= 0) {
            continue;
        }
        attributes[field.slice(0, equalsIndex)] = field.slice(equalsIndex + 1);
    }
    return attributes;
}
function isBlockStart(line) {
    return BLOCK_KINDS.includes(line);
}
function endTagFor(kind) {
    return `END_${kind}`;
}
function assertValidTag(tag) {
    if (!TAG_RE.test(tag)) {
        throw new Error(`invalid protocol row tag: ${tag}`);
    }
}

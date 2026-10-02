import { annotateSources } from "./provenance.js";
import { randomUUID } from "node:crypto";
import { bodyHash, deliveredSelection } from "./sources.js";
import { canonical, emptySelection, isWorkerProfile, PROFILES, requireCondition as check } from "./types.js";
import { estimateRequest } from "./budget.js";
export function changeSelection(prior, input, sources, state) {
  check(
    Array.isArray(input.refs) &&
      input.refs.length <= 64 &&
      input.refs.every((r) => typeof r === "string" && r.length <= 512),
    "invalid_refs",
  );
  if (input.operation === "remove")
    check(
      typeof input.reason === "string" && input.reason.trim() && input.reason.length <= 2048,
      "withdrawal_reason_required",
    );
  const next = structuredClone(prior);
  for (const ref of new Set(input.refs)) {
    const existed = next.selected.includes(ref) || next.unresolved.some((p) => p.ref === ref);
    if (input.operation === "remove") {
      next.unresolved = next.unresolved.filter((p) => p.ref !== ref);
      next.selected = next.selected.filter((r) => r !== ref);
      if (existed) next.withdrawals.push({ ref, reason: input.reason });
      continue;
    }
    const problem = prior.selected.includes(ref) ? sources.eligible(ref, state) : sources.selectionProblem(ref, state);
    const index = next.unresolved.findIndex((p) => p.ref === ref);
    if (problem) {
      if (index < 0) next.unresolved.push(problem);
      else next.unresolved[index] = problem;
    } else {
      if (index >= 0) next.unresolved.splice(index, 1);
      if (!next.selected.includes(ref)) next.selected.push(ref);
    }
  }
  if (canonical(next) === canonical(prior)) return prior;
  next.revision++;
  return next;
}
/**
 * Profiles share history, not private reasoning, except where they would otherwise send the same request: the
 * same model under the same view (projection off, or Helper and Executor on worker history). There shared
 * reasoning keeps one prompt cache across effort switches and stays valid for providers that bind reasoning to
 * its conversation. Unknown and pre-routing history keeps its native form.
 */
function privateReasoning(source, view, projection, model) {
  const producer = source.producer;
  if (!PROFILES.includes(producer) || producer === view) return false;
  const message = source.message;
  const sameModel = message.provider === model?.provider && message.api === model?.api && message.model === model?.id;
  const viewOf = (profile) => (!projection ? "shared" : isWorkerProfile(profile) ? "worker" : profile);
  return !(sameModel && viewOf(producer) === viewOf(view));
}
/**
 * Remove reasoning from another profile's turn. A provider may pair a call with the reasoning that produced
 * it (OpenAI Responses `fc_` ids pair with `rs_` items), so such calls keep only their call id, as the host
 * already does for another model's turns; `unpaired` carries the rename to the matching results.
 */
function withoutReasoning(message, unpaired) {
  if (!message.content.some((b) => b.type === "thinking")) return message;
  return {
    ...message,
    content: message.content.flatMap((b) => {
      if (b.type === "thinking") return [];
      if (b.type !== "toolCall" || typeof b.id !== "string" || !b.id.includes("|")) return [b];
      const id = b.id.split("|")[0];
      unpaired.set(b.id, id);
      return [{ ...b, id }];
    }),
  };
}
const repaired = (message, unpaired) =>
  message.role === "toolResult" && unpaired.has(message.toolCallId)
    ? { ...message, toolCallId: unpaired.get(message.toolCallId) }
    : message;
export function representationProblems(source, model) {
  const message = source.message,
    content = Array.isArray(message.content) ? message.content : [];
  if (message.role === "assistant" && ["error", "aborted"].includes(message.stopReason))
    return [
      {
        ref: source.ref,
        code: "target_representation",
        detail:
          "Native compatibility conversion may omit failed/aborted assistant output; exact delivery is not promised.",
      },
    ];
  if (content.some((b) => b.type === "image") && !model?.input?.includes("image"))
    return [
      { ref: source.ref, code: "target_representation", detail: "The receiving model does not support image input." },
    ];
  return [];
}
export function prepareView(options) {
  const { sources, state } = options;
  const associated = sources.associate(options.messages);
  const selective = options.projection && options.view === "coordinator";
  const assessment = state.assessment;
  const attention = selective && assessment?.view === "suspended" && !options.restoring && !options.preparingReturn;
  const handoffId = options.preparingReturn ?? (!attention ? assessment?.handoffId : undefined);
  const handoff = handoffId ? state.handoffs.get(handoffId) : undefined;
  const assignmentId = handoff?.assignmentId ?? state.assignmentId;
  const current = assignmentId ? (state.selections.get(assignmentId) ?? emptySelection()) : emptySelection();
  // Assistant messages (whole or `#text`) that older sessions selected are not delivered.
  const delivered = (ref) => deliveredSelection(sources, ref);
  const required = new Set(selective && !attention && assignmentId ? current.selected.filter(delivered) : []);
  const promised = handoff && state.reservations.get(handoff.id);
  const admitted = new Set();
  if (selective)
    for (const selection of state.selections.values())
      for (const ref of selection.selected) if (delivered(ref)) admitted.add(ref);
  // Accepted return receipts are communication, independent of selected task evidence.
  // Their ordinary active occurrence survives closure; compaction still owns its lifetime.
  const full = new Map();
  const structural = new Map();
  const problems = selective && !attention && assignmentId ? current.unresolved.filter((p) => delivered(p.ref)) : [];
  for (const item of associated) {
    if (!item.source) continue;
    if (
      !selective ||
      !isWorkerProfile(item.source.producer) ||
      admitted.has(item.source.ref) ||
      (item.source.reportHandoff && state.handoffs.has(item.source.reportHandoff))
    )
      full.set(item.source.ref, item.source);
  }
  for (const ref of required) {
    if (sources.ambiguous.has(ref)) {
      problems.push({
        ref,
        code: "ambiguous_occurrence",
        detail: "The active representation cannot be associated with one canonical occurrence.",
      });
      continue;
    }
    const source = sources.byRef.get(ref),
      error = sources.eligible(ref, state);
    if (error) {
      problems.push(error);
      continue;
    }
    const expected =
      promised && promised.selectionRevision === current.revision
        ? promised.sources.find((s) => s.ref === ref)
        : undefined;
    if (expected && expected.bodyHash !== source.hash) {
      problems.push({
        ref,
        code: "source_changed",
        detail: "The captured source differs from the prepared reservation.",
      });
      continue;
    }
    full.set(ref, source);
  }
  // A selected result carries its complete native call group; siblings may be structural only.
  for (const source of full.values()) {
    const exchange = sources.exchange(source);
    if (required.has(source.ref)) problems.push(...exchange.problems, ...representationProblems(source, options.model));
    for (const sibling of exchange.sources) if (!full.has(sibling.ref)) structural.set(sibling.ref, sibling);
  }
  for (const source of structural.values())
    if (source.message.role === "assistant" && required.size)
      problems.push(...representationProblems(source, options.model));
  const unpaired = new Map();
  const render = (source) => {
    let message = structuredClone(source.message);
    if (
      source.message.role === "assistant" &&
      privateReasoning(source, options.view, options.projection, options.model)
    )
      message = withoutReasoning(message, unpaired);
    // A structural worker envelope keeps only its calls for the selected results; worker narration is never evidence.
    const structuralWorker = selective && isWorkerProfile(source.producer) && !full.has(source.ref);
    if (source.message.role === "assistant" && structuralWorker)
      message.content = message.content.filter((b) => b.type === "toolCall");
    if (full.has(source.ref) || source.message.role !== "toolResult") return repaired(message, unpaired);
    return repaired(
      {
        ...structuredClone(source.message),
        content: [{ type: "text", text: "[Worker result omitted from this view]" }],
        details: undefined,
      },
      unpaired,
    );
  };
  // Insert resolved historical occurrences before the first later native occurrence, retaining
  // opaque/common messages in their original order rather than moving user input wholesale.
  const ordered = sources.ordered(new Map([...structural, ...full]).values());
  const rank = new Map(options.sources.entries.map((entry, index) => [entry.id, index]));
  // Worker evidence admitted after the Coordinator has seen later content is delivered where it was admitted,
  // with its whole call group, so the Coordinator's already-sent prefix is extended rather than rewritten.
  const shared = [0];
  for (const entry of options.sources.entries) {
    const producer = sources.byRef.get(`ctx:${entry.id}`)?.producer ?? "common";
    shared.push(shared.at(-1) + (isWorkerProfile(producer) ? 0 : 1));
  }
  const activeRefs = new Set(associated.flatMap((i) => (i.source ? [i.source.ref] : [])));
  const deferredAt = new Map();
  if (selective && (options.admissions || options.resumedAt !== undefined))
    for (const source of full.values()) {
      // An attention view omitted required evidence that is no longer in the active context, so after a
      // resume that evidence is new to the Coordinator: deliver it where the assessment resumed.
      const resumed =
        options.resumedAt !== undefined && required.has(source.ref) && !activeRefs.has(source.ref)
          ? options.resumedAt
          : undefined;
      const admitted = options.admissions?.get(source.ref);
      const at = admitted === undefined ? resumed : Math.max(admitted, resumed ?? 0),
        own = rank.get(source.entry.id) ?? 0;
      if (at === undefined || at <= own || !isWorkerProfile(source.producer) || shared[at] <= shared[own + 1]) continue;
      const group = sources.exchange(source).sources;
      for (const member of group.length ? group : [source])
        deferredAt.set(member.ref, Math.max(deferredAt.get(member.ref) ?? 0, at));
    }
  const historical = ordered.filter((s) => !activeRefs.has(s.ref));
  const emitted = new Set();
  let messages = [];
  const renderedSources = new Map();
  let cursor = 0;
  const emit = (source) => {
    if (!emitted.has(source.ref)) {
      const message = render(source);
      messages.push(message);
      renderedSources.set(message, source);
      emitted.add(source.ref);
    }
  };
  const pending = [];
  const place = (source) => (deferredAt.has(source.ref) ? pending.push(source) : emit(source));
  const deliver = (limit) => {
    pending.sort(
      (a, b) =>
        deferredAt.get(a.ref) - deferredAt.get(b.ref) || (rank.get(a.entry.id) ?? 0) - (rank.get(b.entry.id) ?? 0),
    );
    while (pending.length && deferredAt.get(pending[0].ref) <= limit) emit(pending.shift());
  };
  for (const item of associated) {
    if (item.source) {
      const at = rank.get(item.source.entry.id) ?? 0;
      deliver(at);
      while (cursor < historical.length && (rank.get(historical[cursor].entry.id) ?? 0) < at)
        place(historical[cursor++]);
      if (full.has(item.source.ref) || structural.has(item.source.ref)) place(item.source);
    } else messages.push(item.message);
  }
  while (cursor < historical.length) place(historical[cursor++]);
  deliver(Infinity);
  const fullSources = [...full.values()];
  // The Coordinator only sees completed worker runs, so one note per run keeps its prefix stable.
  messages = annotateSources(messages, renderedSources, new Set(full.keys()), sources, options.instance, selective);
  // Restore exact current communication only when its accepted occurrence is absent.
  const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
  const baseReport = assessment
    ? state.handoffs.get(assessment.handoffId)
    : handoff?.kind === "return"
      ? handoff
      : undefined;
  const recovery = state.recoveryId
    ? state.recoveries.get(state.recoveryId)
    : [...state.recoveries.values()]
        .reverse()
        .find(
          (candidate) => candidate.assessmentHandoffId === assessment?.handoffId && candidate.state === "completed",
        );
  const recoveryRequest = recovery ? state.handoffs.get(recovery.requestHandoffId) : undefined;
  const supplement =
    handoff?.kind === "recovery-return"
      ? handoff
      : recovery?.supplementHandoffId
        ? state.handoffs.get(recovery.supplementHandoffId)
        : undefined;
  const hasCommunication = (h, field, value, metadata = {}) =>
    messages.some((m) => {
      const matches = (payload) =>
        payload?.[field] === value &&
        Object.entries(metadata).every(([key, expected]) => canonical(payload?.[key]) === canonical(expected));
      if (m.role === "assistant")
        return m.content?.some((b) => b.type === "toolCall" && b.id === h.toolCallId && matches(b.arguments));
      if (m.role !== "toolResult" || m.toolCallId !== h.toolCallId) return false;
      return m.content?.some((b) => {
        if (b.type !== "text") return false;
        try {
          return matches(JSON.parse(b.text));
        } catch {
          return false;
        }
      });
    });
  // Current receipts carry metadata plus a text hash, while the text itself stays in the call arguments.
  const hashedCommunication = (h, field, value, metadata) =>
    messages.some(
      (m) =>
        m.role === "assistant" &&
        m.content?.some((b) => b.type === "toolCall" && b.id === h.toolCallId && b.arguments?.[field] === value),
    ) &&
    messages.some(
      (m) =>
        m.role === "toolResult" &&
        m.toolCallId === h.toolCallId &&
        m.content?.some((b) => {
          if (b.type !== "text") return false;
          try {
            const payload = JSON.parse(b.text);
            return (
              payload?.[`${field}Sha256`] === bodyHash(value) &&
              Object.entries(metadata).every(([key, expected]) => canonical(payload?.[key]) === canonical(expected))
            );
          } catch {
            return false;
          }
        }),
    );
  const restore = (kind, id, body) =>
    messages.push({
      role: "custom",
      customType: "freeflow-routing-communication",
      display: false,
      content: `${kind} ${id}:\n${body}`,
      timestamp: 0,
      details: { routingInstance: options.instance },
    });
  if (a) {
    const accepted = state.handoffs.get(a.delegateHandoffId);
    if (accepted && !hasCommunication(accepted, "contract", a.contract))
      // Directly after the contract, so a contract asking for compaction does not read as still undone.
      restore(
        "Current exact assignment",
        a.id,
        options.compactedInAssignment === undefined
          ? a.contract
          : `${a.contract}\n\nCompaction: you compacted during this assignment, and cycle ${options.compactedInAssignment} began then. A compaction this contract asks for is done: continue with the rest of the contract, or return it with freeflow_return if compacting was all it asked.`,
      );
  }
  if (baseReport) {
    const metadata = { outcome: baseReport.outcome, limitations: baseReport.limitations };
    const hasBody = hasCommunication(baseReport, "report", baseReport.text);
    // Tool arguments establish accepted content but do not carry harness-assigned
    // revision/lineage. Old receipts and partially retained calls need metadata too.
    const lineage = {
      ...metadata,
      reportRevision: baseReport.reportRevision,
      assignmentRef: `assignment:${baseReport.assignmentId}`,
      reportRef: `report:${baseReport.id}:${baseReport.reportRevision}`,
    };
    const complete =
      hasCommunication(baseReport, "report", baseReport.text, lineage) ||
      hashedCommunication(baseReport, "report", baseReport.text, lineage);
    if (!complete)
      restore(
        "Saved report",
        baseReport.id,
        `Producer: ${baseReport.from}\nAssignment: assignment:${baseReport.assignmentId}\nReport ref: report:${baseReport.id}:${baseReport.reportRevision}\nRevision: ${baseReport.reportRevision}\nOutcome: ${baseReport.outcome}\nLimitations: ${JSON.stringify(baseReport.limitations)}${hasBody ? "\nReport text is present in its accepted native occurrence above." : `\nReport:\n${baseReport.text}`}`,
      );
  }
  if (recovery && recoveryRequest && !hasCommunication(recoveryRequest, "request", recovery.request))
    restore(
      "Recovery request",
      recovery.id,
      `Assignment: assignment:${recovery.assignmentId}\nParent report: report:${recovery.assessmentHandoffId}:${recovery.baseReportRevision}\nAllowed paths: ${JSON.stringify(recovery.paths)}\nRequest:\n${recovery.request}`,
    );
  if (recovery && supplement) {
    const hasBody = hasCommunication(supplement, "report", supplement.text);
    const complete = hasCommunication(supplement, "report", supplement.text, {
      outcome: supplement.outcome,
      limitations: supplement.limitations,
    });
    if (!complete)
      restore(
        "Recovery supplement",
        recovery.id,
        `Assignment: assignment:${recovery.assignmentId}\nParent report: report:${recovery.assessmentHandoffId}:${recovery.baseReportRevision}\nSupplement revision: ${supplement.reportRevision}\nOutcome: ${supplement.outcome}\nLimitations: ${JSON.stringify(supplement.limitations)}${hasBody ? "\nSupplement text is present in its accepted native occurrence above." : `\nSupplement:\n${supplement.text}`}`,
      );
  }
  messages.push(options.runtimeMessage);
  const { estimatedTokens, maximumInputTokens, outputReserve, estimateMethod, warnings } = estimateRequest(
    options.systemPrompt,
    options.tools,
    messages,
    options.model,
  );
  if (warnings.length)
    messages.push({
      role: "custom",
      customType: "freeflow-routing-budget",
      display: false,
      content: warnings.map((w) => w.detail).join("\n"),
      timestamp: 0,
      details: { routingInstance: options.instance },
    });
  if (!options.model?.contextWindow)
    problems.push({ ref: "", code: "delivery_budget", detail: "Receiving model context capacity is unavailable." });
  const reservation =
    handoff && selective
      ? {
          id: randomUUID(),
          selectionRevision: current.revision,
          receiver: "coordinator",
          target: options.pair,
          qualification: `native-structural:${options.model?.api ?? "unknown"}; serialized receipt unobserved`,
          sources: [...required].flatMap((ref) => {
            const source = sources.byRef.get(ref);
            return source ? [{ ref, bodyHash: source.hash }] : [];
          }),
          maximumInputTokens,
          outputReserve,
          estimateMethod,
        }
      : undefined;
  return {
    warnings,
    ready: problems.length === 0,
    // Recorded usage describes a prior provider view, which may belong to the
    // other profile. Pi must estimate this assembled view when allocating output.
    // Normalize request metadata only; canonical usage/billing records stay intact.
    messages: messages.map((message) => ({
      ...message,
      timestamp: Number.isFinite(message.timestamp) ? message.timestamp : 0,
      ...(message.role === "assistant"
        ? { usage: { ...message.usage, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 } }
        : {}),
    })),
    problems,
    fullSources,
    reservation,
    estimatedTokens,
    estimateMethod,
  };
}

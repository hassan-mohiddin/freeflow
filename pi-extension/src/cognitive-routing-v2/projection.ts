import { randomUUID } from "node:crypto";
import { Sources, textRef, isTaskEvidence, type Source } from "../session-sources/sources.js";
import {
  canonical,
  emptySelection,
  idFor,
  requireCondition as check,
  type Pair,
  type Problem,
  type Reservation,
  type Selection,
  type State,
  type View,
} from "./types.js";

import { estimateRequest } from "./budget.js";

export interface PreparedView {
  warnings: Problem[];
  ready: boolean;
  messages: any[];
  problems: Problem[];
  fullSources: Source[];
  reservation?: Reservation;
  estimatedTokens: number;
  estimateMethod: string;
}
export function changeSelection(
  prior: Selection,
  input: { operation: "add" | "remove"; refs: string[]; reason?: string },
  sources: Sources,
  state: State,
): Selection {
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
      if (existed) next.withdrawals.push({ ref, reason: input.reason! });
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
export function representationProblems(source: Source, model: any, structural = false): Problem[] {
  const message = source.original?.message ?? source.message,
    content = Array.isArray(source.message.content) ? source.message.content : [];
  if (message.role === "assistant" && ["error", "aborted"].includes(message.stopReason))
    return [
      {
        ref: source.ref,
        code: "target_representation",
        detail:
          "Native compatibility conversion may omit failed/aborted assistant output; exact delivery is not promised.",
      },
    ];
  if (content.some((b: any) => b.type === "image") && !model?.input?.includes("image"))
    return [
      { ref: source.ref, code: "target_representation", detail: "The receiving model does not support image input." },
    ];
  if (
    !structural &&
    !source.original &&
    content.some((b: any) => b.type === "thinking" && (b.redacted || b.thinkingSignature)) &&
    (message.provider !== model?.provider || message.model !== model?.id || message.api !== model?.api)
  )
    return [
      {
        ref: source.ref,
        code: "target_representation",
        detail: `Whole native signed content is not qualified across this model boundary. Inspect the explicit assistant-text source ${textRef(source.ref)} when visible text is the intended evidence.`,
      },
    ];
  return [];
}
export function prepareView(options: {
  messages: readonly any[];
  sources: Sources;
  state: State;
  view: View;
  projection: boolean;
  model: any;
  pair: Pair;
  systemPrompt: string;
  tools: readonly any[];
  runtimeMessage: any;
  instance: string;
  preparingReturn?: string;
  restoring?: boolean;
}): PreparedView {
  const { sources, state } = options;
  const associated = sources.associate(options.messages);
  const selective = options.projection && options.view === "coordinator";
  const assessment = state.assessment;
  const attention = selective && assessment?.view === "suspended" && !options.restoring && !options.preparingReturn;
  const handoffId = options.preparingReturn ?? (!attention ? assessment?.handoffId : undefined);
  const handoff = handoffId ? state.handoffs.get(handoffId) : undefined;
  const assignmentId = handoff?.assignmentId ?? state.assignmentId;
  const current = assignmentId ? (state.selections.get(assignmentId) ?? emptySelection()) : emptySelection();
  const required = new Set(selective && !attention && assignmentId ? current.selected : []);
  const promised = handoff && state.reservations.get(handoff.id);
  const admitted = new Set<string>();
  if (selective)
    for (const selection of state.selections.values()) for (const ref of selection.selected) admitted.add(ref);
  // Accepted return receipts are communication, independent of selected task evidence.
  // Their ordinary active occurrence survives closure; compaction still owns its lifetime.

  const full = new Map<string, Source>();
  const structural = new Map<string, Source>();
  const problems: Problem[] = selective && !attention && assignmentId ? [...current.unresolved] : [];
  for (const item of associated) {
    if (!item.source) continue;
    if (
      !selective ||
      item.source.producer !== "executor" ||
      admitted.has(item.source.ref) ||
      (item.source.reportHandoff && state.handoffs.has(item.source.reportHandoff))
    )
      full.set(item.source.ref, item.source);
    const visible = sources.byRef.get(textRef(item.source.ref));
    if (selective && visible && admitted.has(visible.ref)) full.set(visible.ref, visible);
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
    if (expected && expected.bodyHash !== source!.hash) {
      problems.push({
        ref,
        code: "source_changed",
        detail: "The captured source differs from the prepared reservation.",
      });
      continue;
    }
    full.set(ref, source!);
  }
  // A selected result carries its complete native call group; siblings may be structural only.
  for (const source of full.values()) {
    const exchange = sources.exchange(source);
    if (required.has(source.ref)) problems.push(...exchange.problems, ...representationProblems(source, options.model));
    for (const sibling of exchange.sources) if (!full.has(sibling.ref)) structural.set(sibling.ref, sibling);
  }
  for (const source of structural.values())
    if (source.message.role === "assistant" && required.size)
      problems.push(...representationProblems(source, options.model, true));
  const render = (source: Source) => {
    const message = structuredClone(source.message);
    if (source.message.role === "assistant" && !full.has(source.ref) && full.has(textRef(source.ref)))
      message.content = message.content.filter((b: any) => b.type !== "text");
    if (full.has(source.ref) || source.message.role !== "toolResult") return message;
    return {
      ...structuredClone(source.message),
      content: [{ type: "text", text: "[Executor result omitted from this view]" }],
      details: undefined,
    };
  };
  // Insert resolved historical occurrences before the first later native occurrence, retaining
  // opaque/common messages in their original order rather than moving user input wholesale.
  const ordered = sources.ordered(new Map([...structural, ...full]).values());
  const rank = new Map(options.sources.entries.map((entry, index) => [entry.id, index]));
  const activeRefs = new Set(associated.flatMap((i) => (i.source ? [i.source.ref] : [])));
  const historical = ordered.filter((s) => !activeRefs.has(s.ref));
  const emitted = new Set<string>();
  let messages: any[] = [];
  const renderedSources = new Map<any, Source>();
  let cursor = 0;
  const emit = (source: Source) => {
    if (source.original && full.has(source.original.ref)) return;
    if (!emitted.has(source.ref)) {
      const message = render(source);
      messages.push(message);
      renderedSources.set(message, source);
      emitted.add(source.ref);
    }
  };
  for (const item of associated) {
    if (item.source) {
      while (
        cursor < historical.length &&
        (rank.get(historical[cursor].entry.id) ?? 0) < (rank.get(item.source.entry.id) ?? 0)
      )
        emit(historical[cursor++]);
      const visible = full.get(textRef(item.source.ref));
      if (visible) emit(visible);
      if (full.has(item.source.ref) || structural.has(item.source.ref)) emit(item.source);
    } else messages.push(item.message);
  }
  while (cursor < historical.length) emit(historical[cursor++]);
  const fullSources = [...full.values()];
  // Stable provenance belongs with every represented occurrence, not a rolling
  // catalog. Insert before whole exchanges, never between native calls/results.
  const annotated: any[] = [];
  for (let i = 0; i < messages.length;) {
    const group = [messages[i++]];
    while (i < messages.length && messages[i].role === "toolResult") group.push(messages[i++]);
    const rows = group.flatMap((message) => {
      const s = renderedSources.get(message);
      if (!s) return [];
      const representation = full.has(s.ref) ? "full" : "structural only; omitted result bodies are not evidence";
      const selection =
        s.producer === "executor" && isTaskEvidence(s) && full.has(s.ref)
          ? "task evidence; selection checks apply"
          : "not offered for new evidence selection";
      return [
        `${s.ref} | producer: ${s.producer === "common" ? "unknown/common (no observed routing profile)" : s.producer} | ${s.original ? "assistant-text" : s.message.role}${s.message.toolName ? ` | ${s.message.toolName}` : ""}${s.assignmentId ? ` | assignment: ${s.assignmentId}` : ""} | ${representation} | ${selection}${!s.original && full.has(s.ref) && sources.byRef.has(textRef(s.ref)) ? ` | visible text: ${textRef(s.ref)}` : ""}`,
      ];
    });
    if (rows.length)
      annotated.push({
        role: "custom",
        customType: "freeflow-routing-v2-refs",
        display: false,
        content: `Source provenance for the following message/exchange:\n${rows.join("\n")}`,
        details: { routingInstance: options.instance },
        timestamp: 0,
      });
    annotated.push(...group);
  }
  messages = annotated;
  // Restore exact current communication only when its accepted occurrence is absent.
  const a = state.assignmentId ? state.assignments.get(state.assignmentId) : undefined;
  const report = handoff?.kind === "return" ? handoff : undefined;
  const hasCommunication = (h: any, field: string, value: string, metadata: Record<string, any> = {}) =>
    messages.some((m) => {
      const matches = (payload: any) =>
        payload?.[field] === value &&
        Object.entries(metadata).every(([key, expected]) => canonical(payload?.[key]) === canonical(expected));
      if (m.role === "assistant")
        return m.content?.some((b: any) => b.type === "toolCall" && b.id === h.toolCallId && matches(b.arguments));
      if (m.role !== "toolResult" || m.toolCallId !== h.toolCallId) return false;
      return m.content?.some((b: any) => {
        if (b.type !== "text") return false;
        try {
          return matches(JSON.parse(b.text));
        } catch {
          return false;
        }
      });
    });
  const restore = (kind: string, id: string, body: string) =>
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
      restore("Current exact assignment", a.id, a.contract);
  }
  if (report) {
    const metadata = { outcome: report.outcome, limitations: report.limitations };
    const hasBody = hasCommunication(report, "report", report.text);
    // Tool arguments establish accepted content but do not carry harness-assigned
    // revision/lineage. Old receipts and partially retained calls need metadata too.
    const complete = hasCommunication(report, "report", report.text, {
      ...metadata,
      reportRevision: report.reportRevision,
      assignmentRef: `assignment:${report.assignmentId}`,
      reportRef: `report:${report.id}:${report.reportRevision}`,
    });
    if (!complete)
      restore(
        "Saved report",
        report.id,
        `Producer: executor\nAssignment: assignment:${report.assignmentId}\nReport ref: report:${report.id}:${report.reportRevision}\nRevision: ${report.reportRevision}\nOutcome: ${report.outcome}\nLimitations: ${JSON.stringify(report.limitations)}${hasBody ? "\nReport text is present in its accepted native occurrence above." : `\nReport:\n${report.text}`}`,
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
  const reservation: Reservation | undefined =
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

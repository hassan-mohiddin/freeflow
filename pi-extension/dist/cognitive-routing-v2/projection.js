import { randomUUID } from "node:crypto";
import { emptySelection, requireCondition as check } from "./types.js";
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
  next.revision++;
  for (const ref of new Set(input.refs)) {
    next.unresolved = next.unresolved.filter((p) => p.ref !== ref);
    if (input.operation === "remove") {
      next.selected = next.selected.filter((r) => r !== ref);
      next.withdrawals.push({ ref, reason: input.reason });
      continue;
    }
    const problem = sources.eligible(ref, state);
    if (problem) next.unresolved.push(problem);
    else if (!next.selected.includes(ref)) next.selected.push(ref);
  }
  return next;
}
export function representationProblems(source, model, structural = false) {
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
  if (
    !structural &&
    content.some((b) => b.type === "thinking" && (b.redacted || b.thinkingSignature)) &&
    (message.provider !== model?.provider || message.model !== model?.id || message.api !== model?.api)
  )
    return [
      {
        ref: source.ref,
        code: "target_representation",
        detail: "Signed/redacted native content is not qualified across this model boundary.",
      },
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
  const required = new Set(selective && !attention && assignmentId ? current.selected : []);
  const promised = handoff && state.reservations.get(handoff.id);
  const admitted = new Set();
  if (selective && !attention)
    for (const selection of state.selections.values()) for (const ref of selection.selected) admitted.add(ref);
  const full = new Map();
  const structural = new Map();
  const problems = selective && !attention && assignmentId ? [...current.unresolved] : [];
  for (const item of associated) {
    if (!item.source) continue;
    if (!selective || item.source.producer !== "executor" || admitted.has(item.source.ref))
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
      problems.push(...representationProblems(source, options.model, true));
  const render = (source) => {
    if (full.has(source.ref) || source.message.role !== "toolResult") return structuredClone(source.message);
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
  const emitted = new Set();
  const messages = [];
  let cursor = 0;
  const emit = (source) => {
    if (!emitted.has(source.ref)) {
      messages.push(render(source));
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
      if (full.has(item.source.ref) || structural.has(item.source.ref)) emit(item.source);
    } else messages.push(item.message);
  }
  while (cursor < historical.length) emit(historical[cursor++]);
  const fullSources = [...full.values()];
  // One annotation after complete exchanges; never insert text into signed native blocks.
  if (fullSources.length)
    messages.push({
      role: "custom",
      customType: "freeflow-routing-v2-refs",
      display: false,
      content: fullSources
        .map((s) => `${s.ref} | ${s.message.role}${s.message.toolName ? ` | ${s.message.toolName}` : ""}`)
        .join("\n"),
      details: { routingInstance: options.instance },
      timestamp: 0,
    });
  messages.push(options.runtimeMessage);
  const outputReserve = options.model?.maxTokens ?? 8192;
  const maximumInputTokens = Math.max(0, (options.model?.contextWindow ?? 0) - outputReserve);
  // Byte-count estimate is deliberately labelled; readiness is not an exact token guarantee.
  const estimatedTokens = Math.ceil(
    Buffer.byteLength(JSON.stringify({ system: options.systemPrompt, tools: options.tools, messages })) / 3,
  );
  const estimateMethod = "UTF-8 bytes / 3 (approximate, includes schemas and runtime text)";
  if (!maximumInputTokens || estimatedTokens > maximumInputTokens)
    problems.push({
      ref: "",
      code: "delivery_budget",
      detail: `Estimated input ${estimatedTokens} exceeds allowance ${maximumInputTokens}; common context may also require Pi compaction.`,
    });
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
    ready: problems.length === 0,
    messages,
    problems,
    fullSources,
    reservation,
    estimatedTokens,
    estimateMethod,
  };
}

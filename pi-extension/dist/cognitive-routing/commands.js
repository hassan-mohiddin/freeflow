const PROFILE_VALUES = ["standard", "reasoning", "auto"];
const HISTORY_VALUES = ["history", "history active", "history anomalies"];
export function cognitiveRoutingProfileCompletions(prefix) {
  const query = prefix ?? "";
  return [...PROFILE_VALUES, ...HISTORY_VALUES]
    .filter((value) => value.startsWith(query))
    .map((value) => ({
      value,
      label: value,
      description:
        value === "auto"
          ? "Release the manual hold and use the Reasoning profile"
          : value === "history"
            ? "Show Cognitive Routing transition history"
            : value === "history active"
              ? "Show current-branch Cognitive Routing history"
              : value === "history anomalies"
                ? "Show Cognitive Routing history anomalies"
                : `Hold ${value} profile manually`,
    }));
}
function historyOptions(value) {
  if (value === "history") return {};
  if (value === "history active") return { scope: "active-branch" };
  if (value === "history anomalies") return { anomaliesOnly: true };
  return undefined;
}
function formatHistory(result) {
  const lines = [
    `Cognitive Routing history: ${result.current.profile} · ${result.current.control}`,
    `Events: ${result.events.length}; unresolved=${result.summary.unresolvedCount}; anomalies=${result.summary.anomalyCount}`,
  ];
  if (result.summary.latestSemanticEventId) lines.push(`Latest semantic: ${result.summary.latestSemanticEventId}`);
  if (result.summary.latestCompletedEventId) lines.push(`Latest completed: ${result.summary.latestCompletedEventId}`);
  for (const event of result.events) {
    const transition = event.from && event.to ? ` ${event.from} → ${event.to}` : "";
    lines.push(
      `${event.jsonlPosition}: ${event.outcome} · ${event.classification}${transition} · changed=${event.changed} · ${event.id}`,
    );
  }
  return lines.join("\n");
}
export async function handleCognitiveRoutingProfileCommand(args, ctx, controller) {
  const input = (args ?? "").trim().toLowerCase();
  const [action, ...rest] = input.split(/\s+/);
  if (action !== "profile") return false;
  const value = rest.join(" ");
  const historyView = historyOptions(value);
  if (historyView) {
    const result = ctx.history
      ? await ctx.history(historyView)
      : controller?.history
        ? await controller.history(historyView)
        : undefined;
    if (result) {
      ctx.ui?.notify?.(formatHistory(result), "info");
    } else {
      ctx.ui?.notify?.("Cognitive Routing history is unavailable for this session.", "warning");
    }
    return true;
  }
  if (!PROFILE_VALUES.includes(value)) {
    ctx.ui?.notify?.(
      "Usage: /freeflow profile standard, /freeflow profile reasoning, /freeflow profile auto, or /freeflow profile history [active|anomalies]",
      "warning",
    );
    return true;
  }
  if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
    ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
    return true;
  }
  if (!controller) {
    ctx.ui?.notify?.(
      "Cognitive Routing is unavailable for this session. It may be disabled, unsupported by the Pi host, or suppressed by an explicit startup model selection.",
      "warning",
    );
    return true;
  }
  if (value === "auto") {
    const result = await controller.setAutomaticControl();
    if (result.status === "automatic") {
      ctx.ui?.notify?.("Cognitive Routing manual hold released; automatic Reasoning control is active.", "info");
    } else {
      ctx.ui?.notify?.(`Cognitive Routing could not release the manual hold: ${result.reason}.`, "warning");
    }
    return true;
  }
  const result = await controller.setManualProfile(value);
  if (result.status === "active") {
    ctx.ui?.notify?.(`Cognitive Routing manual hold set to ${result.profile}.`, "info");
  } else {
    ctx.ui?.notify?.(`Cognitive Routing could not set the manual profile: ${result.reason}.`, "warning");
  }
  return true;
}

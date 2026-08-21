function formatStatus(status) {
  if (!status.available) {
    return `Context Virtualization: unavailable${status.unavailableReason ? ` (${status.unavailableReason})` : ""}`;
  }
  return [
    `Context Virtualization: available`,
    `session: ${status.sessionId}`,
    `branch: ${status.branchLeafId ?? "root"}`,
    `projections: full=${status.counts.full}, archived=${status.counts.archived}, retained=${status.counts.retained}`,
    `characters: original=${status.originalCharacters}, projected=${status.projectedCharacters}`,
    `availability: history-only=${status.historyOnly}, unresolved=${status.unresolved}`,
  ].join("; ");
}
function formatList(status) {
  if (!status.available) return formatStatus(status);
  if (status.items.length === 0) return "Context Virtualization: no tool-result sources in the active session branch.";
  const header = "Ref | Tool | State | Original | Projected | Availability";
  const rows = status.items.map((item) =>
    [
      item.ref,
      item.toolName ?? "tool",
      item.mode === "archived" ? (item.retained === undefined ? "archived" : "retained") : "full",
      item.originalCharacters,
      item.projectedCharacters,
      item.availability,
    ].join(" | "),
  );
  return [header, ...rows].join("\n");
}
function refsFromArgs(args) {
  return args
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}
export async function handleContextCommand(args, ctx, runtime, enabled) {
  const input = (args ?? "status").trim();
  const [action = "status", ...rest] = input.split(/\s+/);
  const normalized = action.toLowerCase();
  if (!runtime) {
    ctx.ui.notify("Context Virtualization is unavailable for this session.", "warning");
    return { changed: false, error: "unavailable" };
  }
  if (normalized === "status") {
    const status = await runtime.status();
    ctx.ui.notify(
      `${formatStatus(status)}${enabled ? "" : " (disabled by configuration)"}`,
      enabled ? "info" : "warning",
    );
    return { changed: false, status };
  }
  if (normalized === "list") {
    const status = await runtime.status();
    ctx.ui.notify(formatList(status), enabled ? "info" : "warning");
    return { changed: false, status };
  }
  if (normalized === "restore") {
    const refs = refsFromArgs(rest.join(" "));
    if (!enabled) {
      ctx.ui.notify("Context Virtualization is disabled by configuration; no projection state was changed.", "warning");
      return { changed: false, error: "disabled" };
    }
    const result = await runtime.restore(refs, "user");
    ctx.ui.notify(
      result.message ?? `${result.status}: ${result.operation}`,
      result.status === "ok" ? "info" : "warning",
    );
    return { changed: result.status === "ok", result };
  }
  if (normalized === "reset" && rest.join(" ").toLowerCase() === "all") {
    if (!enabled) {
      ctx.ui.notify("Context Virtualization is disabled by configuration; no projection state was changed.", "warning");
      return { changed: false, error: "disabled" };
    }
    const result = await runtime.reset();
    ctx.ui.notify(
      result.message ?? `${result.status}: ${result.operation}`,
      result.status === "ok" ? "info" : "warning",
    );
    return { changed: result.status === "ok", result };
  }
  ctx.ui.notify("Usage: /freeflow context [status|list|restore <ctx:entryId>...|reset all]", "warning");
  return { changed: false, error: "invalid_action" };
}

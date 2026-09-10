import { Text } from "@earendil-works/pi-tui";
const value = (v) => (typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v, null, 2));
const text = (v) => (typeof v === "string" ? v : "");
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const capital = (v) => (v ? v[0].toUpperCase() + v.slice(1) : "");
function title(name, operation) {
  if (name === "freeflow_delegate") return operation === "replace" ? "Replace assignment" : "Delegate to Executor";
  if (name === "freeflow_return") return operation === "retry" ? "Retry return" : "Return to Coordinator";
  if (name === "freeflow_project")
    return (
      {
        add: "Select evidence",
        remove: "Remove evidence",
        inspect: "Inspect evidence",
        list: "List evidence",
      }[operation ?? ""] ?? "Evidence"
    );
  if (name === "freeflow_unit")
    return (
      {
        close: "Close unit",
        assess: "Resume assessment",
        status: "Routing status",
        history: "Routing history",
      }[operation ?? ""] ?? "Routing unit"
    );
  return "Routing";
}
function draft(name, args) {
  const sections = [];
  if (name === "freeflow_delegate") sections.push(text(args.contract));
  if (name === "freeflow_return") sections.push(text(args.report));
  if (name === "freeflow_unit") sections.push(text(args.assessment));
  if (name === "freeflow_project" && Array.isArray(args.refs))
    sections.push(args.refs.filter((r) => typeof r === "string").join("\n"));
  if (args.reason) sections.push(`Reason: ${text(args.reason)}`);
  if (Array.isArray(args.limitations))
    sections.push(...args.limitations.filter((s) => typeof s === "string").map((s) => `Limitation: ${s}`));
  return sections.filter(Boolean).join("\n\n");
}
export function renderRoutingCall(name, args = {}, context = {}) {
  args ??= {};
  const heading = title(name, args.operation);
  if (context.isPartial === false) return new Text(heading, 0, 0);
  const writing = context.argsComplete !== true;
  const noun =
    name === "freeflow_delegate"
      ? "assignment"
      : name === "freeflow_return"
        ? "report"
        : name === "freeflow_unit" && args.operation === "close"
          ? "assessment"
          : undefined;
  const body = draft(name, args);
  const activity = noun && args.operation !== "retry" ? `${writing ? "Writing" : "Saving"} ${noun}…` : "Working…";
  return {
    render(width) {
      const header = new Text(`${heading} · ${activity}`, 0, 0).render(width);
      if (!body) return header;
      const lines = new Text(body, 0, 0).render(width);
      if (context.expanded || lines.length <= 6) return [...header, "", ...lines];
      // Bound terminal rows after wrapping, so a long single line cannot flood
      // collapsed output. Pi supplies the real partial arguments on each update.
      const hint = new Text("… earlier text available when expanded", 0, 0).render(width);
      return [...header, ...hint, "", ...lines.slice(-6)];
    },
    invalidate() {},
  };
}
function summary(receipt, name, args) {
  const operation = args.operation;
  const problems = receipt.problems ?? receipt.evidence?.unresolved ?? [];
  const issue = problems.length
    ? `${count(problems.length, "evidence issue")} ${problems.length === 1 ? "needs" : "need"} correction`
    : "Evidence needs correction";
  if (receipt.reportSaved)
    return `${operation === "retry" ? "Saved report retained" : "Report saved"}${receipt.ready === false ? ` · ${issue}` : ""}`;
  if (receipt.status === "blocked" || receipt.status === "rejected") {
    const reasons = {
      wrong_profile: "This operation belongs to the other profile",
      manual_control: "Automatic routing is paused by manual control",
      assignment_outstanding: "An assignment is already in progress",
      acknowledgment_uncertain: "Saved state needs reconciliation",
      routing_unavailable: "Routing is unavailable",
      assignment_task_ended: "Task work has ended for this assignment",
    };
    return reasons[receipt.code] || text(receipt.message).split("\n")[0] || "Operation needs attention";
  }
  if (receipt.status === "suspended") return "Couldn’t restore evidence · Assessment remains paused";
  if (name === "freeflow_delegate") return `${operation === "replace" ? "Replacement" : "Assignment"} saved`;
  if (name === "freeflow_project") {
    const selected = (receipt.selected ?? receipt.evidence?.selected ?? []).length;
    if (operation === "list")
      return `${count(receipt.count ?? receipt.items?.length ?? 0, "source")}${Number.isInteger(receipt.selectableCount) ? ` · ${receipt.selectableCount} selectable` : ""}`;
    if (operation === "remove") {
      const removed = (receipt.items ?? []).filter((i) => i.status === "removed").length;
      const withdrawn = (receipt.items ?? []).filter((i) => i.status === "withdrawn").length;
      const changes = [
        removed ? `${removed} removed` : "",
        withdrawn ? `${count(withdrawn, "reference")} withdrawn` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `${changes || "No changes"} · ${selected} remaining`;
    }
    const unchanged =
      operation === "add" &&
      receipt.items?.length &&
      receipt.items.every((i) => ["already_selected", "unchanged"].includes(i.status));
    return `${unchanged ? "No changes · " : ""}${count(selected, "source")} selected${receipt.ready === false ? ` · ${issue}` : operation === "inspect" ? " · No unresolved references" : ""}`;
  }
  if (name === "freeflow_unit") {
    if (operation === "close") return capital(receipt.outcome ?? "closed");
    if (operation === "assess")
      return receipt.status === "unchanged" ? "Assessment already active" : "Evidence prepared";
    if (operation === "history") return count(receipt.history?.length ?? 0, "event");
    if (receipt.runtimeStatus === "blocked") return "Routing needs attention";
    if (!receipt.effective) return "Routing inactive";
    return `${capital(receipt.activeProfile ?? "unknown")} · ${receipt.controlMode?.startsWith("manual") ? "Manual control" : receipt.assignment?.state === "outstanding" ? "Assignment in progress" : receipt.assignment?.state === "returned" ? "Awaiting assessment" : "No assignment"}`;
  }
  return receipt.ready === false ? issue : "Done";
}
export function renderRoutingResult(result, options = {}, name = "", context = {}) {
  const receipt = result?.details ?? {};
  const args = context.args ?? {};
  const fallback =
    !result?.details || Object.keys(receipt).length === 0
      ? result?.content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
      : "";
  const headline = options.isPartial
    ? "Working…"
    : context.isError
      ? fallback?.split("\n")[0] || "Operation failed"
      : fallback
        ? fallback.split("\n")[0]
        : summary(receipt, name, args);
  if (!options.expanded) return new Text(headline, 0, 0);
  const facts = receipt.evidence;
  const evidence = facts
    ? [
        `Evidence revision ${facts.revision ?? "unknown"}`,
        ...(facts.selected ?? []).map((s) => `${s.ref} · ${s.kind}${s.toolName ? ` · ${s.toolName}` : ""}`),
        ...(facts.withdrawals ?? []).map((w) => `Withdrawn ${w.ref}: ${w.reason}`),
        ...(facts.unresolved ?? []).map((p) => `Unresolved ${p.ref}: ${p.detail}`),
        ...(facts.limitations ?? []).map((p) => `${p.code}: ${p.detail}`),
      ].join("\n")
    : "";
  const detail = [
    receipt.contract
      ? `Accepted contract\n${receipt.contract}`
      : args.contract
        ? `Submitted contract\n${args.contract}`
        : "",
    receipt.report
      ? `Saved report\n${receipt.report}`
      : args.report
        ? `${receipt.reportSaved ? "Saved" : "Submitted"} report\n${args.report}`
        : "",
    receipt.assessment ? `Assessment\n${value(receipt.assessment)}` : args.assessment,
    evidence,
    receipt.items
      ?.map((item) => `${item.ref} · ${item.status ?? item.kind}${item.detail ? `: ${item.detail}` : ""}`)
      .join("\n"),
    receipt.history?.map((event) => `${event.type} · ${event.event}`).join("\n"),
    ["unit", "assignment", "handoff", "revision", "stage", "transition", "code"]
      .filter((key) => receipt[key] !== undefined)
      .map((key) => `${key}: ${value(receipt[key])}`)
      .join("\n"),
    receipt.provisional,
    receipt.message,
    (receipt.problems ?? []).map((p) => `${p.ref || "request"}: ${p.code} — ${p.detail}`).join("\n"),
    receipt.recoveryAction,
    fallback,
  ]
    .filter(Boolean)
    .join("\n\n");
  return new Text([headline, detail].filter(Boolean).join("\n\n"), 0, 0);
}

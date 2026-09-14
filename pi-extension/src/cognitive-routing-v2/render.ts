import { Text } from "@earendil-works/pi-tui";

type RenderContext = {
  args?: any;
  expanded?: boolean;
  argsComplete?: boolean;
  executionStarted?: boolean;
  isPartial?: boolean;
  isError?: boolean;
};
const value = (v: unknown) => (typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v, null, 2));
const text = (v: unknown) => (typeof v === "string" ? v : "");
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const capital = (v: string) => (v ? v[0].toUpperCase() + v.slice(1) : "");
const locatorText = (locator: any) => {
  if (!locator) return "";
  const identity = `${locator.toolCallId ?? "unknown call"} (${locator.callRef ?? "unknown source"})`;
  return locator.label ? `${locator.label}${locator.truncated ? " [truncated]" : ""} · ${identity}` : identity;
};

function title(name: string, operation?: string): string {
  if (name === "freeflow_delegate") return operation === "replace" ? "Replace assignment" : "Delegate to Executor";
  if (name === "freeflow_return")
    return operation === "retry"
      ? "Retry return"
      : operation === "supplement"
        ? "Return recovery supplement"
        : "Return to Coordinator";
  if (name === "freeflow_project")
    return (
      (
        {
          add: "Select evidence",
          remove: "Remove evidence",
          inspect: "Inspect selection and evidence",
          list: "List evidence",
        } as Record<string, string>
      )[operation ?? ""] ?? "Evidence"
    );
  if (name === "freeflow_unit")
    return (
      (
        {
          inspect: "Inspect routing",
          close: "Close unit",
          assess: "Resume assessment",
          recover: "Recover assessment evidence",
          "cancel-recovery": "Cancel evidence recovery",
          status: "Routing status",
          history: "Routing history",
        } as Record<string, string>
      )[operation ?? ""] ?? "Routing unit"
    );
  return "Routing";
}

function draft(name: string, args: any, expanded: boolean): string {
  const sections: string[] = [];
  if (name === "freeflow_delegate") sections.push(text(args.contract));
  if (name === "freeflow_return") sections.push(text(args.report));
  if (name === "freeflow_unit" && args.operation === "close") sections.push(text(args.assessment));
  if (name === "freeflow_unit" && args.operation === "recover") sections.push(text(args.request));
  // Metadata can arrive before the main text and otherwise occupy the entire
  // trailing preview forever. Keep the live prose moving; expansion keeps all fields.
  if (!expanded && sections.length) return sections.filter(Boolean).join("\n\n");
  if (name === "freeflow_project" && Array.isArray(args.refs))
    sections.push(args.refs.filter((r: unknown) => typeof r === "string").join("\n"));
  for (const key of ["scope", "view", "ref", "cursor"])
    if (typeof args[key] === "string") sections.push(`${capital(key)}: ${args[key]}`);
  if (args.reason) sections.push(`Reason: ${text(args.reason)}`);
  if (Array.isArray(args.limitations))
    sections.push(
      ...args.limitations.filter((s: unknown) => typeof s === "string").map((s: string) => `Limitation: ${s}`),
    );
  return sections.filter(Boolean).join("\n\n");
}

export function renderRoutingCall(name: string, args: any = {}, context: RenderContext = {}) {
  args ??= {};
  const heading = title(name, args.operation);
  if (context.isPartial === false) return new Text(heading, 0, 0);
  const writing = context.argsComplete !== true;
  const noun =
    name === "freeflow_delegate"
      ? "assignment"
      : name === "freeflow_return"
        ? args.operation === "supplement"
          ? "supplement"
          : "report"
        : name === "freeflow_unit" && args.operation === "close"
          ? "assessment"
          : undefined;
  const body = draft(name, args, context.expanded === true);
  const activity = noun && args.operation !== "retry" ? `${writing ? "Writing" : "Saving"} ${noun}…` : "Working…";
  return {
    render(width: number) {
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

function summary(receipt: any, name: string, args: any): string {
  const operation = args.operation;
  const problems = receipt.problems ?? receipt.evidence?.unresolved ?? [];
  const issue = problems.length
    ? `${count(problems.length, "evidence issue")} ${problems.length === 1 ? "needs" : "need"} correction`
    : "Evidence needs correction";
  if (receipt.reportSaved || receipt.supplementSaved)
    return `${operation === "retry" ? (receipt.supplementSaved ? "Saved supplement retained" : "Saved report retained") : receipt.supplementSaved ? "Recovery supplement saved" : "Report saved"}${receipt.ready === false ? ` · ${issue}` : ""}`;
  if (receipt.status === "blocked" || receipt.status === "rejected") {
    const reasons: Record<string, string> = {
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
      const removed = (receipt.items ?? []).filter((i: any) => i.status === "removed").length;
      const withdrawn = (receipt.items ?? []).filter((i: any) => i.status === "withdrawn").length;
      const changes = [
        removed ? `${removed} removed` : "",
        withdrawn ? `${count(withdrawn, "reference")} withdrawn` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `${changes || "No changes"} · ${selected} remaining${receipt.ready === false ? ` · ${issue}` : ""}`;
    }
    if (operation === "inspect" && receipt.candidates)
      return `${count(selected, "source")} selected · ${receipt.returned}/${receipt.count} candidates${receipt.ready === false ? ` · ${issue}` : ""}${receipt.nextCursor ? " · More available" : ""}`;
    const unchanged =
      operation === "add" &&
      receipt.items?.length &&
      receipt.items.every((i: any) => ["already_selected", "unchanged"].includes(i.status));
    return `${unchanged ? "No changes · " : ""}${count(selected, "source")} selected${receipt.ready === false ? ` · ${issue}` : operation === "inspect" ? " · No unresolved references" : ""}`;
  }
  if (name === "freeflow_unit") {
    if (operation === "close") return capital(receipt.outcome ?? "closed");
    if (operation === "recover") return "Recovery request saved";
    if (operation === "cancel-recovery") return "Evidence recovery cancelled";
    if (operation === "assess")
      return receipt.status === "unchanged" ? "Assessment already active" : "Evidence prepared";
    if (receipt.view === "history")
      return `${receipt.returned}/${receipt.count} assignments${receipt.nextCursor ? " · More available" : ""}`;
    if (receipt.view === "detail") return "Saved work detail";
    if (operation === "history") return count(receipt.history?.length ?? 0, "event");
    if (receipt.runtimeStatus === "blocked") return "Routing needs attention";
    if (!receipt.effective) return "Routing inactive";
    return `${capital(receipt.activeProfile ?? "unknown")} · ${receipt.controlMode?.startsWith("manual") ? "Manual control" : receipt.assignment?.state === "outstanding" ? "Assignment in progress" : receipt.assignment?.state === "returned" ? "Awaiting assessment" : "No assignment"}`;
  }
  return receipt.ready === false ? issue : "Done";
}

export function renderRoutingResult(
  result: any,
  options: { expanded?: boolean; isPartial?: boolean } = {},
  name = "",
  context: RenderContext = {},
) {
  const receipt = result?.details ?? {};
  const args = context.args ?? {};
  const fallback =
    !result?.details || Object.keys(receipt).length === 0
      ? result?.content
          ?.filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
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
        ...(facts.selected ?? []).map(
          (s: any) =>
            `${s.ref} · ${s.kind}${s.producer ? ` · ${s.producer}` : ""}${s.assignment ? ` · assignment ${s.assignment}` : ""}${s.toolName ? ` · ${s.toolName}` : ""}${s.locator ? ` · ${locatorText(s.locator)}` : ""}`,
        ),
        ...(facts.withdrawals ?? []).map((w: any) => `Withdrawn ${w.ref}: ${w.reason}`),
        ...(facts.unresolved ?? []).map((p: any) => `Unresolved ${p.ref}: ${p.detail}`),
        ...(facts.limitations ?? []).map((p: any) => `${p.code}: ${p.detail}`),
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
      : receipt.supplement
        ? `Saved recovery supplement\n${receipt.supplement}`
        : args.report
          ? `${receipt.supplementSaved ? "Saved recovery supplement" : receipt.reportSaved ? "Saved report" : "Submitted report"}\n${args.report}`
          : "",
    receipt.assessment ? `Assessment\n${value(receipt.assessment)}` : args.assessment,
    evidence,
    receipt.items
      ?.map((item: any) => `${item.ref} · ${item.status ?? item.kind}${item.detail ? `: ${item.detail}` : ""}`)
      .join("\n"),
    receipt.history
      ?.map((event: any) =>
        event.ref
          ? `Unit ${event.unitNumber}, assignment ${event.assignmentNumber} · ${event.state} · ${event.ref}\n${event.summary}\nReport: ${event.reportAvailable ? (event.outcome ?? "saved") : "none"}`
          : `${event.type} · ${event.event}`,
      )
      .join("\n\n"),
    receipt.scope
      ? `Scope: ${receipt.scope} · ${receipt.returned}/${receipt.count} candidates returned. Whole-request fit remains estimated.${receipt.scopeCounts ? `\nScope totals: ${receipt.scopeCounts.eligible} eligible · ${receipt.scopeCounts.targetReady} without known item target gaps.\nThis page: ${receipt.pageCounts.eligible} eligible · ${receipt.pageCounts.targetReady} without known item target gaps.` : ""}`
      : "",
    receipt.nextCursor ? `Next cursor: ${receipt.nextCursor}` : "",
    receipt.candidates
      ?.map(
        (item: any) =>
          `${item.ref} · ${item.kind} · ${item.producer}${item.toolName ? ` · ${item.toolName}` : ""}${item.assignment ? ` · assignment ${item.assignment}` : ""}${item.locator ? ` · ${locatorText(item.locator)}` : ""}\n${item.selected ? "Selected" : "Not selected"} · ${item.active ? "Active" : "Historical"} · ${item.eligible ? "Eligible" : "Ineligible"} · ${item.targetReady ? "No known item target gap" : "Target needs attention"}${item.retainedSelection ? "\nPreviously selected routing source retained; unavailable for new selections." : ""}\n${item.limitations.map((p: any) => `${p.code}: ${p.detail}`).join("\n")}`,
      )
      .join("\n\n"),
    receipt.ref ? `Work ref: ${receipt.ref}` : "",
    receipt.sourceBoundary,
    receipt.assignmentRefs?.join("\n"),
    receipt.historyHint,
    receipt.limitations?.join?.("\n"),
    receipt.currentSelection ? `Current recorded selection: ${value(receipt.currentSelection)}` : "",
    receipt.reportRef ? `Report revision ref: ${receipt.reportRef}` : "",
    receipt.previousReportRef ? `Previous report revision: ${receipt.previousReportRef}` : "",
    receipt.warnings?.map((p: any) => `Planning warning: ${p.detail}`).join("\n"),
    [
      "unit",
      "assignment",
      "assignmentRef",
      "recovery",
      "handoff",
      "revision",
      "reportRevision",
      "supplementRevision",
      "outcome",
      "stage",
      "transition",
      "code",
    ]
      .filter((key) => receipt[key] !== undefined)
      .map((key) => `${key}: ${value(receipt[key])}`)
      .join("\n"),
    receipt.provisional,
    receipt.message,
    (receipt.problems ?? []).map((p: any) => `${p.ref || "request"}: ${p.code} — ${p.detail}`).join("\n"),
    receipt.recoveryAction,
    fallback,
  ]
    .filter(Boolean)
    .join("\n\n");
  return new Text([headline, detail].filter(Boolean).join("\n\n"), 0, 0);
}

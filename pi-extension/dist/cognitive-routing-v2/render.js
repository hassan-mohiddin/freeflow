import { Text } from "@earendil-works/pi-tui";
const value = (v) => (typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v, null, 2));
export function renderRoutingCall(name, args = {}, expanded = false) {
  const title = `${name.replace("freeflow_", "")} · ${args?.operation ?? "preparing"}`;
  return new Text(title, 0, 0);
}
export function renderRoutingResult(result, options = {}) {
  const receipt = result?.details ?? {};
  const summary = [
    options.isPartial ? "Working…" : (receipt.status ?? "Result"),
    receipt.reportSaved ? "report saved" : "",
    receipt.transition ? `transfer ${receipt.transition}` : "",
    receipt.ready === true ? "evidence prepared (not acceptance)" : receipt.ready === false ? "evidence not ready" : "",
    receipt.code ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  const problems = (receipt.problems ?? []).map((p) => `${p.ref || "request"}: ${p.code} — ${p.detail}`).join("\n");
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
  const detail = options.expanded
    ? [
        receipt.contract ? `Accepted contract\n${receipt.contract}` : "",
        receipt.report ? `Saved report\n${receipt.report}` : "",
        receipt.assessment ? `Assessment\n${value(receipt.assessment)}` : "",
        evidence,
        receipt.items
          ?.map((item) => `${item.ref} · ${item.status ?? item.kind}${item.detail ? `: ${item.detail}` : ""}`)
          .join("\n"),
        ["unit", "assignment", "handoff", "revision", "stage"]
          .filter((key) => receipt[key] !== undefined)
          .map((key) => `${key}: ${value(receipt[key])}`)
          .join("\n"),
        receipt.provisional,
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";
  // Text wraps complete content with Pi's ANSI/Unicode-aware layout. Receipts
  // capture accepted data so expanding an old row never reads today's state.
  const fallback = !result?.details
    ? result?.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
    : "";
  return new Text(
    [summary, receipt.message, fallback, problems, receipt.recoveryAction, detail].filter(Boolean).join("\n\n"),
    0,
    0,
  );
}

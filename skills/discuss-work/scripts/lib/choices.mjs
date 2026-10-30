// Discuss Work's decision list as a record file: the task's sources/decisions.md, or a list given on stdin or as a file
// when there is no Working Record. One line per item, "- P1 [state] choice -> default ...", other lines ignored
// (Discuss Work, "Build The Decision List").
//   validate   IDs, states, T -> P links, a default on every plain item, the user's words on agreed items, a reason on
//              changed ones;
//   agreement  the reply sent before building: What I'll do / Where I stop / Your decisions / Technical: N;
//   handover   the items a hand-over shows: new, changed and default;
//   catch-up   after an unattended run: defaults taken, choices waiting, changes, and what ran (the record's current
//              Slice's updates).

export const CHOICE_STATES = new Set(["proposed", "agreed", "default", "changed", "new", "dropped"]);
const ITEM = /^\s*[-*]\s+([A-Za-z]+\d+)\s+\[([^\]]*)\]\s+(.*)$/;

export function parseChoices(text) {
  const items = [];
  const errors = [];
  const warnings = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const match = ITEM.exec(raw);
    if (!match) return;
    const [, id, state, rest] = match;
    const arrow = rest.indexOf("->");
    const choice = (arrow === -1 ? rest : rest.slice(0, arrow)).trim();
    const tail = arrow === -1 ? "" : rest.slice(arrow + 2).trim();
    // A technical item states its choice and the plain item it serves: "T1 [default] FIFO array -> serves P1".
    const serves = /^(?:serves\s+)?(P\d+)\b/i.exec(tail);
    items.push({
      line: index + 1,
      id,
      kind: id[0] === "P" ? "plain" : id[0] === "T" ? "technical" : "unknown",
      state,
      choice,
      default: serves ? choice : tail,
      serves: serves?.[1] ?? null,
      quote: /\bYou:\s*["“]/.test(rest),
      reason: /\b(because|why|was|since|instead|reason)\b/i.test(tail),
      text: rest.trim(),
    });
  });

  const seen = new Map();
  for (const item of items) {
    const where = `line ${item.line} ${item.id}`;
    if (!/^[PT][1-9]\d*$/.test(item.id)) errors.push(`${where}: ID must be P<n> or T<n>`);
    if (seen.has(item.id)) errors.push(`${where}: duplicate ID (first at line ${seen.get(item.id)})`);
    else seen.set(item.id, item.line);
    if (!CHOICE_STATES.has(item.state))
      errors.push(`${where}: state "${item.state}" is not one of ${[...CHOICE_STATES].join(", ")}`);
    if (!item.choice) errors.push(`${where}: names no choice`);
    if (item.kind === "plain" && !item.default)
      errors.push(`${where}: has no default after "->" (what matches existing behavior and is easiest to reverse)`);
    if (item.kind === "technical" && !item.serves)
      errors.push(`${where}: a technical item names the plain item it serves ("-> serves P1")`);
    if (item.state === "agreed" && !item.quote) warnings.push(`${where}: agreed without the user's words (You: "...")`);
    if (item.state === "changed" && !item.reason) warnings.push(`${where}: changed without saying why`);
  }
  for (const item of items.filter((each) => each.serves)) {
    const target = items.find((each) => each.id === item.serves);
    if (!target) errors.push(`line ${item.line} ${item.id}: serves ${item.serves}, which is not in the list`);
    else if (target.state === "dropped" && item.state !== "dropped")
      warnings.push(`line ${item.line} ${item.id}: serves ${item.serves}, which is dropped`);
  }
  const firstTechnical = items.findIndex((item) => item.kind === "technical");
  if (firstTechnical !== -1 && items.slice(firstTechnical).some((item) => item.kind === "plain"))
    warnings.push("plain items come first; a P item follows a T item");
  return { items, errors, warnings, ok: errors.length === 0 };
}

const itemLine = (item) => `- ${item.id} [${item.state}] ${item.text}`;
const byState = (items, states) => items.filter((item) => states.includes(item.state));

// A Schema 5 Slice's fields, which its update lines follow.
const SLICE5_FIELDS =
  /^- (State|Opened|Under|Result wanted|Scope|Done when|Stop if|Started from|Waits on|Dependencies|Predicted|Measured):/;

// A Schema 5 record's current Slice and its update lines: what ran or changed while no one was answering.
function currentSlice5Updates(recordText) {
  const lines = recordText.split(/\r?\n/);
  const start = lines.findIndex((each) => /^### Slice S-\d+/.test(each));
  if (start === -1) return { slice: "no current Slice", label: "updates", updates: [] };
  const end = lines.findIndex((each, index) => index > start && /^#{2,3} /.test(each));
  const updates = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((each) => /^-\s+\S/.test(each) && !SLICE5_FIELDS.test(each));
  return {
    slice: lines[start].replace(/^###\s+Slice\s+/, ""),
    label: "updates",
    updates: updates.map((each) => each.replace(/^-\s+/, "")),
  };
}

// A Schema 4 record's current Slice Material updates: what ran or changed while no one was answering.
function currentSliceUpdates(recordText) {
  const lines = recordText.split(/\r?\n/);
  const start = lines.findIndex((each) => /^### Current Slice\s*$/.test(each));
  if (start === -1) return { slice: "no Current Slice", label: "Material updates", updates: [] };
  const end = lines.findIndex((each, index) => index > start && /^#{2,3} /.test(each));
  const slice = lines.slice(start, end === -1 ? undefined : end);
  const title = slice.find((each) => /^#### S-\d+/.test(each));
  const at = slice.findIndex((each) => /^##### Material updates\s*$/.test(each));
  const updates = at === -1 ? [] : slice.slice(at + 1).filter((each) => /^\s*-\s+\S/.test(each));
  return {
    slice: title ? title.replace(/^####\s+/, "") : "no Current Slice",
    label: "Material updates",
    updates: updates.map((each) => each.trim().replace(/^-\s+/, "")),
  };
}

const PAD = "                ";
const count = (value) => Math.round(value).toLocaleString("en-US");
const dollars = (value) => `$${value.toFixed(2)}`;
function duration(ms) {
  const total = Math.round(ms / 60_000);
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h${total % 60 ? ` ${total % 60} min` : ""}`;
}
const cycleName = (cycle) => (cycle === 0 ? "this compaction cycle" : cycle === 1 ? "the next" : `+${cycle}`);
const shortName = (cycle) => (cycle === 0 ? "this one" : cycleName(cycle));

// The agreement's Size line, from Track Work's `estimate --plan --json` (P87): the compaction cycles the work touches
// and its cost at API list price.
function sizeLine(plan) {
  const cycles =
    plan.cycles <= 1
      ? "within this compaction cycle"
      : `${plan.cycles} compaction cycles (this one and ${plan.cycles - 1} more)`;
  const cost =
    plan.total.usd === null ? "; no cost measured yet" : `, about ${dollars(plan.total.usd)} at API list price`;
  return `Size:           ${cycles}${cost}`;
}

// The plan in the agreement's Technical part: each Slice's size and where it lands, the context and cost per compaction
// cycle, the totals, what could run in parallel, and the prices' date.
function planLines(plan) {
  const each = plan.perSlice;
  const lines = [
    each.usd === null
      ? `each Slice ${each.upperBound ? "at most " : ""}about ${count(each.context)} tokens of context (${each.source})`
      : `each Slice about ${count(each.context)} tokens of context, working about ${duration(each.workingMs)}, about ${dollars(each.usd)}${each.model ? `, mostly ${each.model}` : ""} (${each.source})`,
    ...plan.landings.map(
      (item) =>
        `- ${item.title}: ${item.first === item.last ? cycleName(item.first) : `${cycleName(item.first)} into ${cycleName(item.last)}`}${item.oversized ? "; bigger than a compaction cycle" : ""}`,
    ),
    `by compaction cycle: ${plan.perCycle
      .map(
        (part, index) =>
          `${shortName(part.cycle)} about ${count(part.context)}${index ? "" : " tokens"}${part.usd === null ? "" : `, ${dollars(part.usd)}`}`,
      )
      .join("; ")}`,
    `in all: about ${count(plan.total.context)} tokens of context${plan.total.workingMs === null ? "" : `, working about ${duration(plan.total.workingMs)}`}${plan.total.usd === null ? "" : `, about ${dollars(plan.total.usd)}`}`,
    ...plan.parallel.map((wave) => `could run in parallel: ${wave.join(", ")}`),
  ];
  if (each.usd !== null) lines.push(`prices: API list price as of ${plan.prices.date}, from ${plan.prices.source}`);
  return lines.map((line, index) => `${index ? PAD : "Plan:           "}${line}`);
}

// Renders one view; returns { text, data }. The caller validates first.
export function renderChoices(
  view,
  parsed,
  { outcome, stop, showTechnical = false, recordText = null, plan = null } = {},
) {
  const { items } = parsed;
  const plain = items.filter((item) => item.kind === "plain" && item.state !== "dropped");
  const technical = items.filter((item) => item.kind === "technical" && item.state !== "dropped");
  if (view === "validate")
    return { text: `Decision list valid: ${items.length} item(s).`, data: { items: items.length } };
  if (view === "agreement") {
    const open = plain.filter((item) => item.state !== "agreed");
    const pad = "                ";
    const decisions = open.length
      ? open.map(
          (item, index) =>
            `${index ? pad : ""}${index + 1}. ${item.choice}${/[?.!]$/.test(item.choice) ? "" : "?"} I'd go with ${item.default}`,
        )
      : ["none: the request and the repository settle every choice the user would see."];
    const more = [
      ...(technical.length ? [`${technical.length} more choice${technical.length === 1 ? "" : "s"}`] : []),
      ...(plan ? ["the plan"] : []),
    ];
    const technicalLine = showTechnical
      ? [
          ...(technical.length || !plan
            ? [
                `Technical:      ${technical.map((item, index) => `${index ? pad : ""}${item.id} ${item.choice} (serves ${item.serves})`).join("\n") || "none"}`,
              ]
            : []),
          ...(plan ? planLines(plan) : []),
        ]
      : more.length
        ? [
            `Technical:      ${more.join(" and ")}; say "show technical" to see ${technical.length || !plan ? "them" : "it"}.`,
          ]
        : [];
    const text = [
      `What I'll do:   ${outcome}`,
      `Where I stop:   ${stop}`,
      `Your decisions: ${decisions.join("\n")}`,
      ...technicalLine,
      // Last, so the work's size stands out (P101).
      ...(plan ? [sizeLine(plan)] : []),
    ].join("\n");
    return { text, data: { decisions: open.map((item) => item.id), technical: technical.length } };
  }
  if (view === "handover") {
    const shown = byState(items, ["new", "changed", "default"]);
    return {
      text: shown.length
        ? `Choices you have not seen (${shown.length}):\n${shown.map(itemLine).join("\n")}`
        : "No new, changed or default choices: every item was agreed or dropped.",
      data: { shown: shown.map((item) => item.id) },
    };
  }
  // catch-up
  const defaults = byState(items, ["default"]);
  const waiting = byState(items, ["proposed", "new"]);
  const changed = byState(items, ["changed"]);
  const out = [`Defaults taken (${defaults.length}):`, ...(defaults.length ? defaults.map(itemLine) : ["- none"])];
  out.push(
    "",
    `Choices waiting for you (${waiting.length}):`,
    ...(waiting.length ? waiting.map(itemLine) : ["- none"]),
  );
  if (changed.length) out.push("", `Changed while you were away (${changed.length}):`, ...changed.map(itemLine));
  const ran =
    recordText === null
      ? null
      : recordText.schema === 5
        ? currentSlice5Updates(recordText.text)
        : currentSliceUpdates(recordText.text);
  if (ran)
    out.push(
      "",
      `What ran (${ran.slice}, ${ran.label}: ${ran.updates.length}):`,
      ...(ran.updates.length ? ran.updates.map((each) => `- ${each}`) : ["- nothing recorded"]),
    );
  else out.push("", "What ran: no Working Record; account for it from the conversation.");
  return {
    text: out.join("\n"),
    data: {
      defaults: defaults.map((item) => item.id),
      waiting: waiting.map((item) => item.id),
      changed: changed.map((item) => item.id),
      ...(ran ? { slice: ran.slice, ran: ran.updates } : {}),
    },
  };
}

// Draw a paper's figure as SVG from a spec and a data file. The data must be a file, so the figure's numbers come from
// results rather than from values typed into the spec; draw it through a receipt (`paper.mjs run` or `study.mjs run`)
// so the outline can show which data made it. The output is deterministic: the same spec and data give the same bytes.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { screenerFiles, searchCounts } from "./formats.mjs";

export const TYPES = ["line", "points", "bar", "scatter", "flow"];
// Okabe and Ito's palette, distinguishable with the common colour-vision deficiencies.
const COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#000000", "#F0E442"];
const MARKERS = ["circle", "square", "triangle", "diamond"];

/** Split one CSV line, with double-quoted fields that may hold commas. */
function csvFields(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

/** The rows of a data file: a JSON array of objects (at `path` inside the file when given), JSONL, or CSV. */
export function loadRows(file, path) {
  const text = readFileSync(file, "utf8");
  const extension = extname(file).toLowerCase();
  let rows;
  if (extension === ".csv") {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    const header = csvFields(lines[0] ?? "");
    rows = lines.slice(1).map((line, at) => {
      const fields = csvFields(line);
      // A row with more or fewer fields than the header would shift its values into the wrong columns.
      if (fields.length !== header.length)
        throw new Error(`${file} row ${at + 2} has ${fields.length} fields, the header ${header.length}`);
      return Object.fromEntries(fields.map((value, index) => [header[index], value]));
    });
  } else if (extension === ".jsonl") {
    rows = text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  } else {
    let value = JSON.parse(text);
    for (const key of path ? path.split(".") : []) value = value?.[key];
    rows = value;
  }
  if (!Array.isArray(rows)) throw new Error(`${file}${path ? ` at ${path}` : ""} is not an array of rows`);
  return rows;
}

const finite = (value) => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));

/** Tick values for a range: steps of 1, 2 or 5 times a power of ten, about five of them. */
export function ticks(low, high) {
  if (low === high) return [low];
  const raw = (high - low) / 5;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((candidate) => candidate >= raw) ?? 10 * power;
  const result = [];
  for (let value = Math.ceil(low / step - 1e-9) * step; value <= high + step * 1e-9; value += step)
    result.push(Number(value.toPrecision(12)));
  return result;
}

const escape = (text) =>
  String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const fixed = (value) => Number(value.toFixed(2)).toString();
const label = (value) => Number(value.toPrecision(6)).toString();

function marker(shape, x, y, color) {
  const [cx, cy] = [fixed(x), fixed(y)];
  if (shape === "square") return `<rect x="${fixed(x - 3)}" y="${fixed(y - 3)}" width="6" height="6" fill="${color}"/>`;
  if (shape === "triangle")
    return `<polygon points="${fixed(x)},${fixed(y - 4)} ${fixed(x - 4)},${fixed(y + 3)} ${fixed(x + 4)},${fixed(y + 3)}" fill="${color}"/>`;
  if (shape === "diamond")
    return `<polygon points="${fixed(x)},${fixed(y - 4)} ${fixed(x + 4)},${fixed(y)} ${fixed(x)},${fixed(y + 4)} ${fixed(x - 4)},${fixed(y)}" fill="${color}"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/>`;
}

/**
 * Check a spec and read its series. Each series picks x and y columns (and optional low and high for an interval)
 * from the rows, optionally only the rows matching `where`. Returns the series' points, or throws on a spec that
 * types its own data, names a column the rows lack, or holds a value that is not a number.
 */
export function readSeries(spec, specPath) {
  if (!TYPES.includes(spec.type)) throw new Error(`type must be one of: ${TYPES.join(", ")}`);
  if (typeof spec.data !== "string" || spec.data.trim() === "")
    throw new Error("data must name a data file; a figure never takes values typed into its spec");
  if (!Array.isArray(spec.series) || spec.series.length === 0) throw new Error("series must list at least one series");
  const file = resolve(dirname(resolve(specPath)), spec.data);
  const rows = loadRows(file, spec.rows);
  return spec.series.map((series, index) => {
    for (const key of ["label", "x", "y"])
      if (typeof series[key] !== "string") throw new Error(`series ${index + 1} needs "${key}"`);
    if ("values" in series || "points" in series)
      throw new Error(`series ${index + 1} types its own values; take them from the data file`);
    const chosen = rows.filter((row) =>
      Object.entries(series.where ?? {}).every(([key, value]) => String(row[key]) === String(value)),
    );
    if (chosen.length === 0) throw new Error(`series "${series.label}" matches no rows in ${spec.data}`);
    const points = chosen.map((row, at) => {
      const point = { x: row[series.x], y: Number(row[series.y]) };
      for (const key of ["x", "y", "low", "high"]) {
        if (!series[key]) continue;
        if (!(series[key] in row))
          throw new Error(`series "${series.label}": row ${at + 1} has no column "${series[key]}"`);
      }
      if (!finite(row[series.y]))
        throw new Error(`series "${series.label}": row ${at + 1}'s ${series.y} is not a number`);
      if (spec.type !== "bar") {
        if (!finite(point.x)) throw new Error(`series "${series.label}": row ${at + 1}'s ${series.x} is not a number`);
        point.x = Number(point.x);
      } else point.x = String(point.x);
      for (const key of ["low", "high"]) {
        if (!series[key]) continue;
        if (!finite(row[series[key]]))
          throw new Error(`series "${series.label}": row ${at + 1}'s ${series[key]} is not a number`);
        point[key] = Number(row[series[key]]);
      }
      return point;
    });
    if (spec.type === "line") points.sort((a, b) => a.x - b.x);
    return { label: series.label, points };
  });
}

/** The figure as SVG text, and a summary of what it drew. */
// A label's width at the 12 px font, from its characters: an estimate, enough to tell labels that touch.
const textWidth = (text) => String(text).length * 6.6;

export function drawFigure(spec, specPath) {
  if (spec?.type === "flow") return drawFlow(spec, specPath);
  const series = readSeries(spec, specPath);
  const width = spec.width ?? 640;
  const height = spec.height ?? 400;
  const rotate = spec.x?.rotate ?? 0;
  if (![0, 45, 90].includes(rotate)) throw new Error("x.rotate must be 0, 45 or 90 (degrees)");
  const warnings = [];
  // Rotated category labels hang below the axis, so the bottom margin grows to hold the longest one.
  const longest =
    spec.type === "bar" ? Math.max(0, ...series.flatMap((each) => each.points.map((p) => textWidth(p.x)))) : 0;
  const hang = rotate === 0 ? 0 : longest * Math.sin((rotate * Math.PI) / 180);
  const margin = { top: spec.title ? 40 : 20, right: 20, bottom: Math.max(56, Math.ceil(hang) + 40), left: 64 };
  const legendWidth = series.length > 1 ? 150 : 0;
  const plot = {
    left: margin.left,
    top: margin.top,
    width: width - margin.left - margin.right - legendWidth,
    height: height - margin.top - margin.bottom,
  };
  const ys = series.flatMap((each) => each.points.flatMap((point) => [point.y, point.low, point.high]));
  for (const reference of spec.reference ?? []) ys.push(reference.y);
  const finiteYs = ys.filter((value) => value !== undefined);
  let yLow = spec.y?.min ?? Math.min(...finiteYs);
  let yHigh = spec.y?.max ?? Math.max(...finiteYs);
  if (spec.type === "bar" && spec.y?.min === undefined) yLow = Math.min(0, yLow);
  if (yLow === yHigh) [yLow, yHigh] = [yLow - 1, yHigh + 1];
  const yTicks = ticks(yLow, yHigh);
  const yScale = (value) => plot.top + plot.height - ((value - yLow) / (yHigh - yLow)) * plot.height;

  const parts = [];
  const categories = spec.type === "bar" ? [...new Set(series.flatMap((each) => each.points.map((p) => p.x)))] : [];
  let xScale;
  let xTicks;
  if (spec.type === "bar") {
    const band = plot.width / categories.length;
    xScale = (category) => plot.left + band * (categories.indexOf(category) + 0.5);
    xTicks = categories.map((category) => ({ at: xScale(category), text: category }));
  } else {
    const xs = series.flatMap((each) => each.points.map((point) => point.x));
    let xLow = spec.x?.min ?? Math.min(...xs);
    let xHigh = spec.x?.max ?? Math.max(...xs);
    if (xLow === xHigh) [xLow, xHigh] = [xLow - 1, xHigh + 1];
    xScale = (value) => plot.left + ((value - xLow) / (xHigh - xLow)) * plot.width;
    xTicks = ticks(xLow, xHigh).map((value) => ({ at: xScale(value), text: label(value) }));
  }

  // Axes, grid and labels.
  const bottom = plot.top + plot.height;
  for (const value of yTicks) {
    const y = yScale(value);
    parts.push(
      `<line x1="${plot.left}" y1="${fixed(y)}" x2="${plot.left + plot.width}" y2="${fixed(y)}" stroke="#e5e5e5"/>`,
    );
    parts.push(`<text x="${plot.left - 6}" y="${fixed(y + 4)}" text-anchor="end">${escape(label(value))}</text>`);
  }
  for (const tick of xTicks) {
    parts.push(`<line x1="${fixed(tick.at)}" y1="${bottom}" x2="${fixed(tick.at)}" y2="${bottom + 4}" stroke="#333"/>`);
    parts.push(
      rotate === 0
        ? `<text x="${fixed(tick.at)}" y="${bottom + 18}" text-anchor="middle">${escape(tick.text)}</text>`
        : `<text transform="translate(${fixed(tick.at)} ${bottom + 12}) rotate(-${rotate})" text-anchor="end">${escape(tick.text)}</text>`,
    );
  }
  // Labels that touch, and text past the canvas, are listed: the figure is drawn either way.
  for (let at = 1; at < xTicks.length; at += 1) {
    const gap = xTicks[at].at - xTicks[at - 1].at;
    const needed =
      rotate === 0
        ? (textWidth(xTicks[at].text) + textWidth(xTicks[at - 1].text)) / 2 + 4
        : 14 / Math.sin((rotate * Math.PI) / 180);
    if (gap < needed)
      warnings.push(
        `x labels "${xTicks[at - 1].text}" and "${xTicks[at].text}" overlap (${Math.round(gap)} px apart, ${Math.round(needed)} needed): set x.rotate to 45 or 90, shorten them, or widen the figure`,
      );
  }
  if (rotate === 0 && xTicks.length > 0) {
    const first = xTicks[0];
    const last = xTicks[xTicks.length - 1];
    if (first.at - textWidth(first.text) / 2 < 0 || last.at + textWidth(last.text) / 2 > width)
      warnings.push("an x label runs past the canvas edge: widen the figure or rotate the labels");
  }
  if (spec.title && textWidth(spec.title) > width)
    warnings.push("the title is wider than the figure: shorten it or widen the figure");
  parts.push(`<line x1="${plot.left}" y1="${bottom}" x2="${plot.left + plot.width}" y2="${bottom}" stroke="#333"/>`);
  parts.push(`<line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${bottom}" stroke="#333"/>`);
  if (spec.x?.label)
    parts.push(
      `<text x="${fixed(plot.left + plot.width / 2)}" y="${height - 14}" text-anchor="middle">${escape(spec.x.label)}</text>`,
    );
  if (spec.y?.label)
    parts.push(
      `<text transform="translate(16 ${fixed(plot.top + plot.height / 2)}) rotate(-90)" text-anchor="middle">${escape(spec.y.label)}</text>`,
    );
  if (spec.title)
    parts.push(
      `<text x="${fixed(width / 2)}" y="22" text-anchor="middle" font-weight="bold">${escape(spec.title)}</text>`,
    );
  for (const reference of spec.reference ?? []) {
    const y = yScale(reference.y);
    parts.push(
      `<line x1="${plot.left}" y1="${fixed(y)}" x2="${plot.left + plot.width}" y2="${fixed(y)}" stroke="#777" stroke-dasharray="4 3"/>`,
    );
    if (reference.label)
      parts.push(
        `<text x="${plot.left + plot.width - 4}" y="${fixed(y - 4)}" text-anchor="end" fill="#555">${escape(reference.label)}</text>`,
      );
  }

  // Data.
  series.forEach((each, index) => {
    const color = COLORS[index % COLORS.length];
    const shape = MARKERS[index % MARKERS.length];
    const group = [];
    if (spec.type === "bar") {
      const band = plot.width / categories.length;
      const barWidth = (band * 0.8) / series.length;
      for (const point of each.points) {
        const x = xScale(point.x) - band * 0.4 + barWidth * index;
        const zero = yScale(Math.max(yLow, 0));
        const top = yScale(point.y);
        group.push(
          `<rect x="${fixed(x)}" y="${fixed(Math.min(top, zero))}" width="${fixed(barWidth)}" height="${fixed(Math.abs(zero - top))}" fill="${color}"/>`,
        );
        if (point.low !== undefined && point.high !== undefined) {
          const cx = x + barWidth / 2;
          group.push(
            `<line x1="${fixed(cx)}" y1="${fixed(yScale(point.low))}" x2="${fixed(cx)}" y2="${fixed(yScale(point.high))}" stroke="#333"/>`,
          );
        }
      }
    } else {
      for (const point of each.points)
        if (point.low !== undefined && point.high !== undefined)
          group.push(
            `<line x1="${fixed(xScale(point.x))}" y1="${fixed(yScale(point.low))}" x2="${fixed(xScale(point.x))}" y2="${fixed(yScale(point.high))}" stroke="${color}" stroke-opacity="0.6"/>`,
          );
      if (spec.type === "line")
        group.push(
          `<polyline fill="none" stroke="${color}" stroke-width="1.5" points="${each.points.map((point) => `${fixed(xScale(point.x))},${fixed(yScale(point.y))}`).join(" ")}"/>`,
        );
      if (spec.type !== "line" || each.points.length <= 30)
        for (const point of each.points) group.push(marker(shape, xScale(point.x), yScale(point.y), color));
    }
    parts.push(`<g data-series="${escape(each.label)}">${group.join("")}</g>`);
  });

  // Legend.
  if (series.length > 1)
    series.forEach((each, index) => {
      const x = plot.left + plot.width + 16;
      const y = plot.top + 12 + index * 20;
      parts.push(marker(MARKERS[index % MARKERS.length], x, y - 4, COLORS[index % COLORS.length]));
      parts.push(`<text x="${x + 10}" y="${y}">${escape(each.label)}</text>`);
    });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif" font-size="12">`,
    ...(spec.title ? [`<title>${escape(spec.title)}</title>`] : []),
    ...(spec.description ? [`<desc>${escape(spec.description)}</desc>`] : []),
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    ...parts,
    "</svg>",
    "",
  ].join("\n");
  if (series.length > 1)
    for (const each of series)
      if (plot.left + plot.width + 26 + textWidth(each.label) > width)
        warnings.push(`the legend label "${each.label}" runs past the canvas edge: shorten it or widen the figure`);
  return { svg, series: series.map((each) => ({ label: each.label, points: each.points.length })), warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// A review's flow diagram

const FLOW_KEYS = ["type", "data", "title", "description", "width"];
const whole = (value) => Number.isInteger(value) && value >= 0;

/** Check a group of exclusions: whole counts that add up to its total. */
function checkGroup(group, name, problems) {
  if (!group || !whole(group.records) || !Array.isArray(group.reasons)) {
    problems.push(`${name} needs records and reasons`);
    return;
  }
  for (const reason of group.reasons)
    if (!whole(reason?.records) || typeof reason?.reason !== "string")
      problems.push(`${name}: each reason needs its text and a whole count`);
  const sum = group.reasons.reduce((total, reason) => total + (whole(reason?.records) ? reason.records : 0), 0);
  if (sum !== group.records) problems.push(`${name}: its reasons count ${sum}, its total ${group.records}`);
}

/**
 * Read a flow written by `artifact.mjs counts --flow`, refusing counts that do not add up, then one its search ledger
 * does not give: the flow names the ledger and its sha256, and the flow is recomputed from that ledger, so an edit
 * that keeps every sum still shows.
 */
export function readFlow(spec, specPath) {
  for (const key of Object.keys(spec))
    if (!FLOW_KEYS.includes(key))
      throw new Error(
        `a flow spec takes ${FLOW_KEYS.join(", ")}; "${key}" is not one, and its counts come from the data file`,
      );
  if (typeof spec.data !== "string" || spec.data.trim() === "")
    throw new Error("data must name the flow file artifact.mjs counts --flow wrote; a figure never takes typed values");
  const file = resolve(dirname(resolve(specPath)), spec.data);
  const flow = JSON.parse(readFileSync(file, "utf8"));
  if (flow?.kind !== "search-flow") throw new Error(`${spec.data} is not a flow written by artifact.mjs counts --flow`);
  const problems = [];
  for (const name of ["duplicates", "awaiting", "screened", "included"])
    if (!whole(flow[name])) problems.push(`${name} must be a whole number`);
  if (flow.not_screened !== undefined && !whole(flow.not_screened))
    problems.push("not_screened must be a whole number");
  const databases = flow.identified?.databases;
  const otherMethods = flow.identified?.other_methods ?? [];
  if (
    !whole(flow.identified?.records) ||
    !Array.isArray(databases) ||
    !Array.isArray(otherMethods) ||
    databases.length + otherMethods.length === 0
  )
    problems.push("identified needs records and at least one database or other method");
  else {
    const sum = [...databases, ...otherMethods].reduce(
      (total, each) => total + (whole(each?.records) ? each.records : NaN),
      0,
    );
    if (sum !== flow.identified.records)
      problems.push(
        `identified: its databases${otherMethods.length > 0 ? " and other methods" : ""} count ${sum}, its total ${flow.identified.records}`,
      );
  }
  checkGroup(flow.excluded_title_abstract, "excluded_title_abstract", problems);
  checkGroup(flow.excluded_stage_not_recorded, "excluded_stage_not_recorded", problems);
  if (flow.full_text !== null) {
    checkGroup(flow.full_text?.excluded, "full_text.excluded", problems);
    if (!whole(flow.full_text?.assessed)) problems.push("full_text.assessed must be a whole number");
    else if (flow.full_text.assessed !== (flow.full_text.excluded?.records ?? 0) + flow.included)
      problems.push("full_text: those assessed are not those excluded at full text plus those included");
  }
  if (problems.length === 0) {
    if (flow.identified.records !== (flow.not_screened ?? 0) + flow.duplicates + flow.awaiting + flow.screened)
      problems.push(
        `identified is not ${flow.not_screened !== undefined ? "those not screened plus " : ""}duplicates plus awaiting plus screened`,
      );
    const afterScreening = flow.full_text ? flow.full_text.assessed : flow.included;
    if (
      flow.screened !==
      flow.excluded_title_abstract.records + flow.excluded_stage_not_recorded.records + afterScreening
    )
      problems.push("screened is not those excluded at screening plus those that went on");
  }
  if (problems.length > 0)
    throw new Error(
      `${spec.data}: the flow's counts do not add up (${problems.join("; ")}); write it with artifact.mjs counts --flow`,
    );
  if (typeof flow.ledger !== "string" || flow.ledger.trim() === "")
    throw new Error(
      `${spec.data} names no search ledger, so its counts cannot be recomputed; write it with artifact.mjs counts --flow`,
    );
  const ledgerPath = resolve(dirname(file), flow.ledger);
  let bytes;
  try {
    bytes = readFileSync(ledgerPath);
  } catch {
    throw new Error(`${spec.data}'s search ledger ${flow.ledger} cannot be read`);
  }
  if (createHash("sha256").update(bytes).digest("hex") !== flow.ledger_sha256)
    throw new Error(
      `${flow.ledger} is not the ledger ${spec.data} was written from (its sha256 differs); write the flow again with artifact.mjs counts --flow`,
    );
  const text = bytes.toString("utf8");
  const counts = searchCounts(text, screenerFiles(ledgerPath, text));
  if (counts.problems.length > 0)
    throw new Error(`${flow.ledger} has problems (${counts.problems.join("; ")}), so its flow is not drawn`);
  const expected = { ...counts.flow, ledger: flow.ledger, ledger_sha256: flow.ledger_sha256 };
  const differ = [...new Set([...Object.keys(expected), ...Object.keys(flow)])].filter(
    (key) => !isDeepStrictEqual(expected[key], flow[key]),
  );
  if (differ.length > 0)
    throw new Error(
      `${spec.data}'s counts are not those ${flow.ledger} gives (${differ.join(", ")} differ${differ.length === 1 ? "s" : ""}); write it with artifact.mjs counts --flow`,
    );
  return flow;
}

/** Words wrapped to lines of at most `width` characters; a longer word stays whole on its own line. */
function wrap(text, width) {
  const lines = [];
  let current = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}

/** The flow as boxes and arrows: the main steps down the left, what leaves at each step to the right. */
export function drawFlow(spec, specPath) {
  const flow = readFlow(spec, specPath);
  const width = spec.width ?? 720;
  const gutter = 20;
  const join = 40;
  const mainWidth = Math.round((width - 2 * gutter - join) * 0.45);
  const sideWidth = width - 2 * gutter - join - mainWidth;
  const lineHeight = 16;
  const pad = 8;
  const characters = (boxWidth) => Math.max(10, Math.floor((boxWidth - 2 * pad) / 6.6));
  const reasonLines = (group) =>
    group.reasons.map(
      (reason) => `${reason.criterion ? `${reason.criterion}, ` : ""}${reason.reason}: ${reason.records}`,
    );
  const box = (heading, details, boxWidth) => {
    const lines = [
      ...wrap(heading, characters(boxWidth)).map((text) => ({ text, bold: true })),
      ...details.flatMap((detail) => wrap(detail, characters(boxWidth)).map((text) => ({ text, bold: false }))),
    ];
    return { lines, width: boxWidth, height: lines.length * lineHeight + 2 * pad };
  };
  const staged = flow.full_text !== null || flow.excluded_title_abstract.records > 0;
  const rows = [];
  rows.push({
    main: box(
      `Records identified (n = ${flow.identified.records})`,
      [
        ...flow.identified.databases.map((each) => `${each.database}: ${each.records}`),
        ...(flow.identified.other_methods ?? []).map((each) => `Other methods, ${each.method}: ${each.records}`),
      ],
      mainWidth,
    ),
    side: [
      ...(flow.not_screened > 0 ? [box(`Returned but not screened (n = ${flow.not_screened})`, [], sideWidth)] : []),
      box(`Duplicates removed (n = ${flow.duplicates})`, [], sideWidth),
      ...(flow.awaiting > 0 ? [box(`Awaiting screening (n = ${flow.awaiting})`, [], sideWidth)] : []),
    ],
  });
  const atScreening = [];
  if (staged)
    atScreening.push(
      box(
        `Excluded at title and abstract (n = ${flow.excluded_title_abstract.records})`,
        reasonLines(flow.excluded_title_abstract),
        sideWidth,
      ),
    );
  if (!staged || flow.excluded_stage_not_recorded.records > 0)
    atScreening.push(
      box(
        `${staged ? "Excluded, stage not recorded" : "Excluded"} (n = ${flow.excluded_stage_not_recorded.records})`,
        reasonLines(flow.excluded_stage_not_recorded),
        sideWidth,
      ),
    );
  const screenedBy = flow.agent_alone
    ? [
        `${flow.agent_alone.records} by the reviewing agent alone (${flow.agent_alone.agents.join(", ")}), no second screener`,
      ]
    : [];
  rows.push({ main: box(`Records screened (n = ${flow.screened})`, screenedBy, mainWidth), side: atScreening });
  if (flow.full_text)
    rows.push({
      main: box(`Full texts assessed (n = ${flow.full_text.assessed})`, [], mainWidth),
      side: [
        box(
          `Excluded at full text (n = ${flow.full_text.excluded.records})`,
          reasonLines(flow.full_text.excluded),
          sideWidth,
        ),
      ],
    });
  rows.push({ main: box(`Studies included (n = ${flow.included})`, [], mainWidth), side: [] });

  const parts = [];
  const mainX = gutter;
  const sideX = gutter + mainWidth + join;
  const stack = 10;
  const rowGap = 32;
  let y = spec.title ? 44 : gutter;
  const drawBox = (each, x, top) => {
    parts.push(
      `<rect x="${x}" y="${fixed(top)}" width="${each.width}" height="${each.height}" fill="#ffffff" stroke="#333"/>`,
    );
    each.lines.forEach((line, index) =>
      parts.push(
        `<text x="${x + pad}" y="${fixed(top + pad + 12 + index * lineHeight)}"${line.bold ? ' font-weight="bold"' : ""}>${escape(line.text)}</text>`,
      ),
    );
  };
  const arrow = (x1, y1, x2, y2) =>
    parts.push(
      `<line x1="${fixed(x1)}" y1="${fixed(y1)}" x2="${fixed(x2)}" y2="${fixed(y2)}" stroke="#333" marker-end="url(#arrow)"/>`,
    );
  let previousBottom = null;
  for (const row of rows) {
    if (previousBottom !== null) arrow(mainX + mainWidth / 2, previousBottom, mainX + mainWidth / 2, y);
    drawBox(row.main, mainX, y);
    const middle = y + row.main.height / 2;
    let sideTop = y;
    const middles = [];
    for (const each of row.side) {
      drawBox(each, sideX, sideTop);
      middles.push(sideTop + each.height / 2);
      sideTop += each.height + stack;
    }
    if (middles.length > 0) {
      const elbow = mainX + mainWidth + join / 2;
      parts.push(
        `<line x1="${mainX + mainWidth}" y1="${fixed(middle)}" x2="${elbow}" y2="${fixed(middle)}" stroke="#333"/>`,
      );
      const top = Math.min(middle, ...middles);
      const bottom = Math.max(middle, ...middles);
      if (bottom > top)
        parts.push(`<line x1="${elbow}" y1="${fixed(top)}" x2="${elbow}" y2="${fixed(bottom)}" stroke="#333"/>`);
      for (const each of middles) arrow(elbow, each, sideX, each);
    }
    const rowHeight = Math.max(row.main.height, sideTop - stack - y);
    previousBottom = y + row.main.height;
    y += rowHeight + rowGap;
  }
  const height = Math.ceil(y - rowGap + gutter);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif" font-size="12">`,
    ...(spec.title ? [`<title>${escape(spec.title)}</title>`] : []),
    ...(spec.description ? [`<desc>${escape(spec.description)}</desc>`] : []),
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#333"/></marker></defs>',
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    ...(spec.title
      ? [`<text x="${fixed(width / 2)}" y="24" text-anchor="middle" font-weight="bold">${escape(spec.title)}</text>`]
      : []),
    ...parts,
    "</svg>",
    "",
  ].join("\n");
  return { svg, series: [], boxes: rows.reduce((count, row) => count + 1 + row.side.length, 0) };
}

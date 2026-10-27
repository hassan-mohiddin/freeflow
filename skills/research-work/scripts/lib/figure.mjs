// Draw a paper's figure as SVG from a spec and a data file. The data must be a file, so the figure's numbers come from
// results rather than from values typed into the spec; draw it through a receipt (`paper.mjs run` or `study.mjs run`)
// so the outline can show which data made it. The output is deterministic: the same spec and data give the same bytes.

import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

export const TYPES = ["line", "points", "bar", "scatter"];
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
    rows = lines.slice(1).map((line) => Object.fromEntries(csvFields(line).map((value, at) => [header[at], value])));
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
export function drawFigure(spec, specPath) {
  const series = readSeries(spec, specPath);
  const width = spec.width ?? 640;
  const height = spec.height ?? 400;
  const margin = { top: spec.title ? 40 : 20, right: 20, bottom: 56, left: 64 };
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
    parts.push(`<text x="${fixed(tick.at)}" y="${bottom + 18}" text-anchor="middle">${escape(tick.text)}</text>`);
  }
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
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    ...parts,
    "</svg>",
    "",
  ].join("\n");
  return { svg, series: series.map((each) => ({ label: each.label, points: each.points.length })) };
}

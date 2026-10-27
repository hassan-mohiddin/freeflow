// Online lookups for the source ledger, run only on request and cached: a DOI through Crossref (its record and any
// retraction or correction notice that updates it), an arXiv ID through arXiv's API, and a URL's reachability. A
// lookup that finds nothing makes a source unresolved, never fabricated; only an identifier that resolves to a
// different work refutes it. Nothing here edits the ledger: the result says what the Lookup column should read.

import { spawnSync } from "node:child_process";

/** Words of a title or source line, lowercased, without short words. */
const words = (text) =>
  new Set(
    String(text ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );

/**
 * Whether a found record matches the ledger's Source: a family name of an author with the year, or most of the
 * title's longer words. A record that matches neither is reported as resolving to something else.
 */
export function matchesSource(source, record) {
  const text = String(source ?? "").toLowerCase();
  const family = (record.authors ?? []).map((name) => name.toLowerCase());
  const byAuthor = family.some((name) => name.length > 1 && text.includes(name));
  const byYear = record.year ? text.includes(String(record.year)) : false;
  const title = words(record.title);
  const sourceWords = words(source);
  const shared = [...title].filter((word) => sourceWords.has(word)).length;
  const byTitle = title.size > 0 && shared / title.size >= 0.5;
  return { matched: byTitle || (byAuthor && byYear), partial: byAuthor || shared > 0, byAuthor, byYear, byTitle };
}

/** Fetch a URL with curl (which honours the environment's proxy and CA settings), or with fetch when curl is absent. */
export async function httpGet(url, { method = "GET", timeout = 20 } = {}) {
  const curl = spawnSync(
    "curl",
    [
      "-sS",
      "-L",
      "--max-time",
      String(timeout),
      ...(method === "HEAD" ? ["-I"] : []),
      "-A",
      "freeflow-research-work (source lookup)",
      "-w",
      "\n%{http_code}",
      url,
    ],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  if (!curl.error) {
    if (curl.status !== 0) return { status: 0, body: "", error: (curl.stderr || `curl exited ${curl.status}`).trim() };
    const at = curl.stdout.lastIndexOf("\n");
    return { status: Number(curl.stdout.slice(at + 1)), body: curl.stdout.slice(0, at), error: null };
  }
  try {
    const response = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(timeout * 1000) });
    return { status: response.status, body: method === "HEAD" ? "" : await response.text(), error: null };
  } catch (error) {
    return { status: 0, body: "", error: error.message };
  }
}

/** A request that waits and tries again once when the service asks it to slow down (429) or is briefly unavailable. */
async function politely(get, url, options) {
  const first = await get(url, options);
  if (first.status !== 429 && first.status !== 503) return first;
  await new Promise((done) => setTimeout(done, 3000));
  return get(url, options);
}

/** The fields of a Crossref work that a ledger row is checked against. */
function crossrefRecord(message) {
  return {
    title: (message.title ?? [])[0] ?? "",
    authors: (message.author ?? []).map((author) => author.family ?? author.name ?? "").filter(Boolean),
    year: message.issued?.["date-parts"]?.[0]?.[0] ?? message.published?.["date-parts"]?.[0]?.[0] ?? null,
    venue: (message["container-title"] ?? [])[0] ?? "",
    type: message.type ?? null,
  };
}

/** The first arXiv entry in an Atom response, or null when the response holds none. */
export function arxivRecord(xml) {
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1];
  if (!entry) return null;
  const tag = (name) => /<NAME>([\s\S]*?)<\/NAME>/.source.replace(/NAME/g, name);
  const title = new RegExp(tag("title")).exec(entry)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  if (!title || /^Error$/i.test(title)) return null;
  const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((match) => match[1].trim().split(/\s+/).at(-1));
  const year = Number(new RegExp(tag("published")).exec(entry)?.[1]?.slice(0, 4)) || null;
  return { title, authors, year, venue: "arXiv", type: "preprint" };
}

/** The identifier a ledger Pin holds: a DOI, an arXiv ID, a URL, or none that can be looked up online. */
export function pinIdentifier(pin) {
  const text = String(pin ?? "").trim();
  const doi = /^doi:\s*(\S+)/i.exec(text)?.[1] ?? /doi\.org\/(10\.\S+)/i.exec(text)?.[1];
  if (doi) return { kind: "doi", value: doi.replace(/[.,;)]+$/, "") };
  const arxiv = /^arxiv:\s*(\S+)/i.exec(text)?.[1] ?? /arxiv\.org\/abs\/(\S+)/i.exec(text)?.[1];
  if (arxiv) return { kind: "arxiv", value: arxiv.replace(/[.,;)]+$/, "") };
  const url = /(https?:\/\/[^\s)]+)/.exec(text)?.[1];
  if (url) return { kind: "url", value: url };
  return { kind: "none", value: null };
}

/**
 * Look up one ledger row. `get` is httpGet or a stand-in (tests pass recorded responses). The result's `lookup` is
 * the value the Lookup column should hold: `verified`, `unresolved` or `refuted`; `notices` lists retractions and
 * corrections found for a DOI; `reachable` is a URL's status.
 */
export async function lookupRow(row, get = httpGet) {
  const id = pinIdentifier(row.Pin);
  const result = { id: row.ID, pin: row.Pin, kind: id.kind, value: id.value, lookup: null, record: null, notices: [] };
  if (id.kind === "none") return { ...result, lookup: null, detail: "no DOI, arXiv ID or URL to look up online" };
  if (id.kind === "doi") {
    const response = await politely(get, `https://api.crossref.org/works/${encodeURIComponent(id.value)}`);
    if (response.status === 404)
      return { ...result, lookup: "unresolved", detail: "Crossref has no record of this DOI" };
    if (response.status !== 200)
      return { ...result, lookup: "unresolved", detail: `Crossref answered ${response.status || response.error}` };
    let message;
    try {
      message = JSON.parse(response.body).message;
    } catch {
      return { ...result, lookup: "unresolved", detail: "Crossref's answer was not JSON" };
    }
    result.record = crossrefRecord(message);
    const updates = await politely(
      get,
      `https://api.crossref.org/works?filter=updates:${encodeURIComponent(id.value)}&rows=20`,
    );
    if (updates.status === 200) {
      try {
        for (const item of JSON.parse(updates.body).message?.items ?? [])
          for (const update of item["update-to"] ?? [])
            if (String(update.DOI).toLowerCase() === id.value.toLowerCase())
              result.notices.push({ type: update.type, doi: item.DOI, title: (item.title ?? [])[0] ?? "" });
      } catch {
        result.notices.push({
          type: "not checked",
          doi: null,
          title: "the notice search answered with something other than JSON",
        });
      }
    } else
      result.notices.push({ type: "not checked", doi: null, title: `the notice search answered ${updates.status}` });
  } else if (id.kind === "arxiv") {
    const response = await politely(get, `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id.value)}`);
    if (response.status !== 200)
      return { ...result, lookup: "unresolved", detail: `arXiv answered ${response.status || response.error}` };
    result.record = arxivRecord(response.body);
    if (!result.record) return { ...result, lookup: "unresolved", detail: "arXiv has no entry for this ID" };
  } else {
    const response = await get(id.value, { method: "HEAD" });
    const status = response.status === 405 || response.status === 403 ? (await get(id.value)).status : response.status;
    result.reachable = status;
    if (status >= 200 && status < 400) return { ...result, lookup: "verified", detail: `reachable (${status})` };
    return { ...result, lookup: "unresolved", detail: status ? `answered ${status}` : `no answer (${response.error})` };
  }
  // A record that shares an author or some title words but not enough to match is left for a person to compare:
  // only an identifier that plainly resolves to another work refutes the source.
  const match = matchesSource(row.Source, result.record);
  const found = `"${result.record.title}" (${result.record.authors.slice(0, 3).join(", ")}${result.record.year ? `, ${result.record.year}` : ""})`;
  result.lookup = match.matched ? "verified" : match.partial ? "unresolved" : "refuted";
  result.detail = match.matched
    ? `matches by ${match.byTitle ? "title" : "author and year"}`
    : match.partial
      ? `resolves to ${found}, which matches the Source only in part: compare them by hand`
      : `resolves to ${found}, which the Source does not name`;
  return result;
}

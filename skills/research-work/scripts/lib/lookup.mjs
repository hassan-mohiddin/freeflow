// Online lookups for the source ledger, run only on request and cached: a DOI through Crossref (its record and any
// retraction or correction notice that updates it), an arXiv ID through arXiv's API, and a URL's page. A
// lookup that finds nothing makes a source unresolved, never fabricated; only an identifier that resolves to a
// different work refutes it. Nothing here edits the ledger: the result says what the Lookup column should read.

import { spawnSync } from "node:child_process";

/** The match rule's version, kept in each cached answer: an answer judged under another version is asked again. */
export const LOOKUP_RULE = 2;

/** Tokens of a title, name or source line: lowercased, accents folded (Müller and Muller are one name). */
const tokens = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** The longer words of a title or source line, which carry what it is about. */
const words = (text) => new Set(tokens(text).filter((word) => word.length > 3));

/**
 * Whether a found record matches the ledger's Source: most of the title's longer words, and an author's family name
 * as whole words (or a record that lists no author). A Source that names an author but no title is left for a person
 * to compare, as is one whose title differs from the record's; only a record that shares nothing with it refutes.
 */
export function matchesSource(source, record) {
  const sourceTokens = tokens(source);
  const family = (record.authors ?? []).map(tokens).filter((name) => name.length > 0);
  const byAuthor = family.some((name) =>
    sourceTokens.some((_, at) => name.every((part, offset) => sourceTokens[at + offset] === part)),
  );
  const byYear = record.year ? sourceTokens.includes(String(record.year)) : false;
  const title = words(record.title);
  const sourceWords = words(source);
  const shared = [...title].filter((word) => sourceWords.has(word)).length;
  const byTitle = title.size > 0 && shared / title.size >= 0.5;
  // Words of the Source that are neither a name, the year nor a short word: what remains is the title it names.
  const names = new Set(family.flat());
  const namesTitle = [...sourceWords].some((word) => !names.has(word) && !/^\d+$/.test(word) && word !== "others");
  const matched = byTitle && (byAuthor || family.length === 0);
  return { matched, partial: byAuthor || shared > 0, byAuthor, byYear, byTitle, namesTitle };
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

/** Whether an answer is the service failing to answer (no reply, rate limit, server error), which is not cached. */
export const unanswered = (response) => response.status === 0 || response.status === 429 || response.status >= 500;

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
      return {
        ...result,
        lookup: "unresolved",
        unanswered: unanswered(response),
        detail: `Crossref answered ${response.status || response.error}`,
      };
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
      return {
        ...result,
        lookup: "unresolved",
        unanswered: unanswered(response),
        detail: `arXiv answered ${response.status || response.error}`,
      };
    result.record = arxivRecord(response.body);
    if (!result.record) return { ...result, lookup: "unresolved", detail: "arXiv has no entry for this ID" };
  } else {
    // A page is read, not only reached: it verifies when it carries most of the Source's longer words.
    const response = await politely(get, id.value);
    result.reachable = response.status;
    if (response.status < 200 || response.status >= 400)
      return {
        ...result,
        lookup: "unresolved",
        unanswered: unanswered(response),
        detail: response.status ? `answered ${response.status}` : `no answer (${response.error})`,
      };
    const page = words(String(response.body ?? "").replace(/<[^>]*>/g, " "));
    const named = [...words(row.Source)];
    const found = named.filter((word) => page.has(word)).length;
    if (named.length > 0 && found / named.length >= 0.5)
      return {
        ...result,
        lookup: "verified",
        detail: `reachable (${response.status}), and the page carries the Source's words`,
      };
    return {
      ...result,
      lookup: "unresolved",
      detail: `reachable (${response.status}), but the page carries ${found} of the Source's ${named.length} longer words: compare them by hand`,
    };
  }
  // A record that shares an author or some title words but not both is left for a person to compare: only an
  // identifier that plainly resolves to another work refutes the source.
  const match = matchesSource(row.Source, result.record);
  const found = `"${result.record.title}" (${result.record.authors.slice(0, 3).join(", ")}${result.record.year ? `, ${result.record.year}` : ""})`;
  result.lookup = match.matched ? "verified" : match.partial ? "unresolved" : "refuted";
  result.detail = match.matched
    ? match.byAuthor
      ? "matches by title and author"
      : "matches by title (the record lists no author)"
    : !match.partial
      ? `resolves to ${found}, which the Source does not name`
      : match.byAuthor && !match.namesTitle
        ? `resolves to ${found}; the Source names no title, so add it, or compare them by hand`
        : `resolves to ${found}, which matches the Source only in part: compare them by hand`;
  return result;
}

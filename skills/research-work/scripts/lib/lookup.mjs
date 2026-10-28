// Online lookups for the source ledger, run only on request and cached: a DOI through Crossref (its record and any
// retraction or correction notice that updates it), an arXiv ID through arXiv's API, and a URL's page. A
// lookup that finds nothing makes a source unresolved, never fabricated; only an identifier that resolves to a
// different work refutes it. A row with no identifier can be searched by its title (Crossref, then arXiv), which yields a candidate
// identifier, never a verdict; a dead link is looked up in the Wayback Machine. Requests to one host are spaced.
// Nothing here edits the ledger: the result says what the Lookup column should read.

import { spawnSync } from "node:child_process";

/** The match rule's version, kept in each cached answer: an answer judged under another version is asked again. */
export const LOOKUP_RULE = 4;

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

// Words that mark a record as a sibling of the work a Source names (a correction notice, a reply, another part), when
// one title carries them and the other does not; with the roman numerals I to X, as numerals are.
const SIBLING = new Set([
  "correction",
  "corrigendum",
  "erratum",
  "errata",
  "retraction",
  "retracted",
  "reply",
  "response",
  "comment",
  "commentary",
  "addendum",
  "supplement",
  "concern",
  "part",
  "volume",
  "vol",
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
]);

/**
 * The title a Source line names: the text after its year ("Brown, Cai and DasGupta 2001. Interval estimation for a
 * binomial proportion. Statistical Science" names the middle part), or, without that form, the whole line.
 */
function sourceTitle(source) {
  const match = /\b(?:19|20)\d{2}[a-z]?\)?([.:,])\s+(.+)$/.exec(String(source ?? ""));
  if (!match) return null;
  // After "2001." the title ends at the next sentence; after "(2001)," at the next comma before a capital (the venue).
  return match[2].split(match[1] === "," ? /,\s+(?=[A-Z])|\.\s+(?=[A-Z])/ : /\.\s+(?=[A-Z])/)[0];
}

/** The family names and year a Source line gives before its title: "Chen W, Liu Y. 2024. …" gives chen, liu, 2024. */
function sourceAuthorsAndYear(source) {
  const text = String(source ?? "");
  const at = /\b(?:19|20)\d{2}\b/.exec(text);
  const before = at ? text.slice(0, at.index) : "";
  const names = tokens(before).filter((word) => word.length > 1 && !["and", "et", "al", "others"].includes(word));
  return { names, year: at ? at[0] : null };
}

/**
 * Whether a found record matches the ledger's Source. It matches when the titles agree both ways (most of the
 * record title's longer words are in the Source, and most of the Source title's are in the record), the record is
 * not a sibling of the work (a correction, a reply, another part: a part word or numeral one title has and the other
 * lacks, either way), its year is within one of a year the Source
 * names, and its first author is among the names the Source gives. A Source that names an author but no title is
 * left for a person to compare, as is one that differs in title, year or first author; only a record that shares
 * nothing with it refutes.
 */
export function matchesSource(source, record) {
  const sourceTokens = tokens(source);
  const family = (record.authors ?? []).map(tokens).filter((name) => name.length > 0);
  const names = (name) =>
    sourceTokens.some((_, at) => name.every((part, offset) => sourceTokens[at + offset] === part));
  const byAuthor = family.some(names);
  const sourceYears = sourceTokens.filter((token) => /^(?:19|20)\d{2}$/.test(token)).map(Number);
  const byYear = record.year ? sourceYears.includes(Number(record.year)) : false;
  const title = words(record.title);
  const sourceWords = words(source);
  const shared = [...title].filter((word) => sourceWords.has(word)).length;
  const named = sourceTitle(source);
  const namedWords = named ? words(named) : null;
  const back = namedWords ? [...namedWords].filter((word) => title.has(word)).length / Math.max(namedWords.size, 1) : 1;
  const byTitle = title.size > 0 && shared / title.size >= 0.5 && back >= 0.5;
  // Words of the Source that are neither a name, the year nor a short word: what remains is the title it names.
  const allNames = new Set(family.flat());
  const namesTitle = [...sourceWords].some((word) => !allNames.has(word) && !/^\d+$/.test(word) && word !== "others");
  const differs = [];
  const sourceAll = new Set(tokens(named ?? source));
  const partWord = (word) => SIBLING.has(word) || /^\d+$/.test(word);
  const sibling = tokens(record.title).filter((word) => partWord(word) && !sourceAll.has(word));
  if (sibling.length > 0)
    differs.push(`its title adds "${[...new Set(sibling)].join('", "')}", so it may be a related work`);
  // The other way: the title the Source names has a part word or numeral the record's lacks ("Part II" against a
  // record titled "Part I"). Only a title the Source names is read, since the rest of its line holds the year and
  // the venue's volume.
  const recordAll = new Set(tokens(record.title));
  const lacking = named ? tokens(named).filter((word) => partWord(word) && !recordAll.has(word)) : [];
  if (lacking.length > 0)
    differs.push(
      `its title lacks "${[...new Set(lacking)].join('", "')}", which the Source's has, so it may be a related work`,
    );
  if (record.year && sourceYears.length > 0 && !sourceYears.some((year) => Math.abs(year - Number(record.year)) <= 1))
    differs.push(`its year is ${record.year}, the Source's ${sourceYears.join(" or ")}`);
  if (byAuthor && family.length > 0 && !names(family[0]))
    differs.push(`its first author is ${record.authors[0]}, whom the Source does not name`);
  const matched = byTitle && (byAuthor || family.length === 0) && differs.length === 0;
  return { matched, partial: byAuthor || shared > 0, byAuthor, byYear, byTitle, namesTitle, differs };
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

// The least time between two requests to one host: arXiv asks for three seconds, every other service gets one.
const SPACING = { "export.arxiv.org": 3000 };
const lastRequest = new Map();

/** Wait until this host's spacing has passed since the last request to it. */
async function spaced(url) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return;
  }
  const gap = SPACING[host] ?? 1000;
  const wait = (lastRequest.get(host) ?? 0) + gap - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastRequest.set(host, Date.now());
}

/**
 * A request that waits and tries again once when the service asks it to slow down (429) or is briefly unavailable.
 * Requests through httpGet are spaced per host; a stand-in (as tests pass) is not.
 */
async function politely(get, url, options) {
  if (get === httpGet) await spaced(url);
  const first = await get(url, options);
  if (first.status !== 429 && first.status !== 503) return first;
  await new Promise((done) => setTimeout(done, 3000));
  if (get === httpGet) lastRequest.set(new URL(url).host, Date.now());
  return get(url, options);
}

/** The closest Wayback Machine snapshot of a URL, or null. */
async function archived(get, url) {
  const response = await politely(get, `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
  if (response.status !== 200) return null;
  try {
    const closest = JSON.parse(response.body)?.archived_snapshots?.closest;
    return closest?.available && closest.url ? { url: closest.url, timestamp: closest.timestamp ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Search for the title a row's Source names, for a row with no identifier: Crossref's bibliographic search, then
 * arXiv's title search. Both answer without a key. The answer is a candidate identifier for a person to put in the
 * Pin and look up; a title search never verifies a source by itself.
 */
export async function searchTitle(row, get = httpGet) {
  const title = sourceTitle(row.Source) ?? row.Source;
  const query = tokens(title).join(" ");
  if (!query) return { candidate: null, detail: "the Source names no title to search for" };
  const describe = (record, pin) =>
    `title search found ${pin}, "${record.title}" (${record.authors.slice(0, 3).join(", ")}${record.year ? `, ${record.year}` : ""}): put it in the Pin and look the row up again`;
  let looked = 0;
  const failures = [];
  const crossref = await politely(
    get,
    `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(String(row.Source))}&rows=5`,
  );
  if (crossref.status === 200) {
    let items = [];
    try {
      items = JSON.parse(crossref.body).message?.items ?? [];
    } catch {
      failures.push("Crossref's answer was not JSON");
    }
    for (const item of items) {
      looked += 1;
      const record = crossrefRecord(item);
      if (item.DOI && matchesSource(row.Source, record).matched)
        return { candidate: { doi: item.DOI, ...record }, detail: describe(record, `doi:${item.DOI}`) };
    }
  } else failures.push(`Crossref answered ${crossref.status || crossref.error}`);
  const arxiv = await politely(
    get,
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`ti:"${query}"`)}&max_results=5`,
  );
  if (arxiv.status === 200)
    for (const record of arxivRecords(arxiv.body)) {
      looked += 1;
      if (record.id && matchesSource(row.Source, record).matched)
        return { candidate: { arxiv: record.id, ...record }, detail: describe(record, `arXiv:${record.id}`) };
    }
  else failures.push(`arXiv answered ${arxiv.status || arxiv.error}`);
  const answered = crossref.status === 200 || arxiv.status === 200;
  return {
    candidate: null,
    unanswered: !answered && [crossref, arxiv].some(unanswered),
    detail: answered
      ? `title search found no work matching the Source's title and authors (${looked} looked at${failures.length ? `; ${failures.join("; ")}` : ""})`
      : failures.join("; "),
  };
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

/** Every arXiv entry in an Atom response, each with its ID (without version). */
export function arxivRecords(xml) {
  const tag = (name) => /<NAME>([\s\S]*?)<\/NAME>/.source.replace(/NAME/g, name);
  const records = [];
  for (const match of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = match[1];
    const title = new RegExp(tag("title")).exec(entry)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    if (!title || /^Error$/i.test(title)) continue;
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((name) => name[1].trim().split(/\s+/).at(-1));
    const year = Number(new RegExp(tag("published")).exec(entry)?.[1]?.slice(0, 4)) || null;
    const id = /arxiv\.org\/abs\/([^<\s]+?)(?:v\d+)?\s*</.exec(entry)?.[1] ?? null;
    records.push({ title, authors, year, venue: "arXiv", type: "preprint", id });
  }
  return records;
}

/** The first arXiv entry in an Atom response, or null when the response holds none. */
export function arxivRecord(xml) {
  const [first] = arxivRecords(xml);
  if (!first) return null;
  const { id, ...record } = first;
  return record;
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
export async function lookupRow(row, get = httpGet, { searchTitles = false } = {}) {
  const id = pinIdentifier(row.Pin);
  const result = { id: row.ID, pin: row.Pin, kind: id.kind, value: id.value, lookup: null, record: null, notices: [] };
  if (id.kind === "none") {
    if (!searchTitles) return { ...result, lookup: null, detail: "no DOI, arXiv ID or URL to look up online" };
    const search = await searchTitle(row, get);
    return {
      ...result,
      lookup: "unresolved",
      candidate: search.candidate,
      unanswered: search.unanswered,
      detail: `no identifier; ${search.detail}`,
    };
  }
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
    if (response.status < 200 || response.status >= 400) {
      // A page that is gone (404, 410) may survive in the Wayback Machine: the snapshot is offered, never taken as
      // the source. A page that did not answer may be back later, so it is not looked for.
      const snapshot = response.status === 404 || response.status === 410 ? await archived(get, id.value) : null;
      return {
        ...result,
        lookup: "unresolved",
        unanswered: unanswered(response),
        archive: snapshot,
        detail: `${response.status ? `answered ${response.status}` : `no answer (${response.error})`}${snapshot ? `; an archived copy exists at ${snapshot.url}: read it, save it in sources/ and pin that` : ""}`,
      };
    }
    const text = String(response.body ?? "").replace(/<[^>]*>/g, " ");
    const page = words(text);
    const named = [...words(sourceTitle(row.Source) ?? row.Source)];
    const found = named.filter((word) => page.has(word)).length;
    // A page carrying the title's words must also carry an author or the year the Source names: a topical page
    // carries the words of many titles, including invented ones.
    const { names, year } = sourceAuthorsAndYear(row.Source);
    const pageTokens = new Set(tokens(text));
    const anchored =
      (names.length === 0 && !year) || names.some((name) => pageTokens.has(name)) || (year && pageTokens.has(year));
    if (named.length > 0 && found / named.length >= 0.5 && anchored)
      return {
        ...result,
        lookup: "verified",
        detail: `reachable (${response.status}), and the page carries the Source's title words and its author or year`,
      };
    if (named.length > 0 && found / named.length >= 0.5)
      return {
        ...result,
        lookup: "unresolved",
        detail: `reachable (${response.status}); the page carries the Source's title words but none of the authors or the year it names: compare them by hand`,
      };
    return {
      ...result,
      lookup: "unresolved",
      detail: `reachable (${response.status}), but the page carries ${found} of the Source's ${named.length} longer words: compare them by hand`,
    };
  }
  // A record that shares an author or some title words but not both is left for a person to compare: only an
  // identifier that plainly resolves to another work refutes the source.
  // Crossref titles a retracted work "RETRACTED: <title>": the identifier is the work itself, and the mark is a notice.
  const marked = /^(?:retracted|withdrawn)(?: article)?\s*[:.-]\s*/i.exec(result.record.title ?? "");
  if (marked) {
    result.record = { ...result.record, title: result.record.title.slice(marked[0].length) };
    if (!result.notices.some((notice) => notice.type === "retraction"))
      result.notices.push({ type: "retraction", doi: null, title: "the record's own title marks the work retracted" });
  }
  if (!result.record.title && result.record.authors.length === 0)
    return {
      ...result,
      lookup: "unresolved",
      detail: "the record names no title or author to compare with the Source: compare them by hand",
    };
  const match = matchesSource(row.Source, result.record);
  const found = `"${result.record.title}" (${result.record.authors.slice(0, 3).join(", ")}${result.record.year ? `, ${result.record.year}` : ""})`;
  result.lookup = match.matched ? "verified" : match.partial ? "unresolved" : "refuted";
  result.detail = match.matched
    ? match.byAuthor
      ? "matches by title and author"
      : "matches by title (the record lists no author)"
    : match.differs.length > 0 && match.partial
      ? `resolves to ${found}, but ${match.differs.join("; ")}: compare them by hand`
      : !match.partial
        ? `resolves to ${found}, which the Source does not name`
        : match.byAuthor && !match.namesTitle
          ? `resolves to ${found}; the Source names no title, so add it, or compare them by hand`
          : `resolves to ${found}, which matches the Source only in part: compare them by hand`;
  return result;
}

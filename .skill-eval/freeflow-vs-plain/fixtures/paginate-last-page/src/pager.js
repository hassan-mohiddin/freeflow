import { totalPages } from "./paginate.js";

/** The link row under the results: previous, each page (the current one in brackets), next. */
export function renderPager(count, current, perPage) {
  const pages = totalPages(count, perPage);
  const links = [];
  for (let page = 1; page <= pages; page += 1) links.push(page === current ? `[${page}]` : String(page));
  return [current > 1 ? "«" : " ", ...links, current < pages ? "»" : " "].join(" ").trim();
}

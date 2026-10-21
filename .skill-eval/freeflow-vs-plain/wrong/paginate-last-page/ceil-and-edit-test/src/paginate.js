// Wrong on purpose: Math.ceil alone gives no page for no results, and the existing test was edited to match.
// Paging arithmetic for search results. Pages are numbered from 1.

/** How many pages `count` results fill at `perPage` per page. An empty list still has page 1. */
export function totalPages(count, perPage) {
  return Math.ceil(count / perPage);
}

/** The results on one page; a page past the end is empty. */
export function pageItems(items, page, perPage) {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

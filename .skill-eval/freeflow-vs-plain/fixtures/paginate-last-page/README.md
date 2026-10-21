# search-pager

The pager under the search results: which results a page shows, how many pages there are, and the page links.

- `src/paginate.js`: `totalPages(count, perPage)` and `pageItems(items, page, perPage)`.
- `src/pager.js`: `renderPager(count, current, perPage)`, the link row such as `« 1 [2] 3 »`.

An empty result list still shows one (empty) page, so the pager always has a page 1.

Run the tests with `npm test`.

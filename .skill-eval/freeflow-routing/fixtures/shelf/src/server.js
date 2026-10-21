import http from "node:http";

import { listBookmarks, loadAll } from "./store.js";
import { fmtDate } from "./format.js";

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
  );
}

/** The list page: every bookmark with how many others share its tags. */
export function renderList() {
  const rows = listBookmarks().map((bookmark) => {
    const related = loadAll().filter(
      (other) =>
        other.url !== bookmark.url &&
        other.tags &&
        bookmark.tags &&
        other.tags.split(",").some((tag) => bookmark.tags.split(",").includes(tag)),
    ).length;
    return `<li><a href="${escapeHtml(bookmark.url)}">${escapeHtml(bookmark.title)}</a> <small>${fmtDate(bookmark.added)} · ${related} related</small></li>`;
  });
  return `<!doctype html><title>shelf</title><h1>Your shelf</h1><ul>${rows.join("")}</ul>`;
}

export function startServer(port) {
  const server = http.createServer((request, response) => {
    if (request.url === "/" || request.url === "/list") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderList());
      return;
    }
    response.writeHead(404);
    response.end("not found\n");
  });
  server.listen(port, () => process.stdout.write(`shelf serving on http://localhost:${port}\n`));
  return server;
}

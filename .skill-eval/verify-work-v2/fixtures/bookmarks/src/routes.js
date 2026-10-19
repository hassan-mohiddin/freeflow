import { HttpError, readJson, sendEmpty, sendJson } from "./http.js";

function bookmarkId(params) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, `no bookmark with id ${params.id}`);
  return id;
}

/** Registers every endpoint on the router. Each handler gets `{ request, response, params, query }`. */
export function registerRoutes(router, bookmarks) {
  router.add("POST", "/bookmarks", async ({ request, response }) => {
    sendJson(response, 201, await bookmarks.create(await readJson(request)));
  });
  router.add("GET", "/bookmarks", ({ response, query }) => {
    sendJson(response, 200, bookmarks.list(query));
  });
  router.add("GET", "/bookmarks/:id", ({ response, params }) => {
    sendJson(response, 200, bookmarks.get(bookmarkId(params)));
  });
  router.add("PATCH", "/bookmarks/:id", async ({ request, response, params }) => {
    sendJson(response, 200, await bookmarks.update(bookmarkId(params), await readJson(request)));
  });
  router.add("DELETE", "/bookmarks/:id", async ({ response, params }) => {
    await bookmarks.remove(bookmarkId(params));
    sendEmpty(response, 204);
  });
  router.add("GET", "/tags", ({ response, query }) => {
    sendJson(response, 200, bookmarks.tags(query));
  });
  router.add("DELETE", "/tags/:name", async ({ response, params }) => {
    await bookmarks.removeTag(params.name);
    sendEmpty(response, 204);
  });
}

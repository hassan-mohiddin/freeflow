# Bookmarks

A small HTTP service for saving bookmarks and organising them with tags. It needs Node 22 and nothing else: no install, no database and no network.

## Running it

```bash
npm start
```

The service listens on `http://127.0.0.1:8080` and keeps its data in `./data`. Settings come from the environment:

| Variable             | Default     | Meaning                                                                                                                  |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `BOOKMARKS_PORT`     | `8080`      | Port to listen on. `0` picks a free one.                                                                                 |
| `BOOKMARKS_HOST`     | `127.0.0.1` | Address to listen on.                                                                                                    |
| `BOOKMARKS_DATA_DIR` | `./data`    | Folder for the bookmarks, the access token and the lock. Created if missing.                                             |
| `BOOKMARKS_TOKEN`    |             | The access token to require. When it is not set, the service makes one on its first start and keeps it in `token` in the data folder. |

The service logs one JSON object per line on standard output. The `listening` line carries the address it listens on.

It takes a moment to start. Until it is ready, every request answers `503`, except `GET /healthz`, which needs no token and answers `503` with `{"status":"starting"}` while the service starts and `200` with `{"status":"ready"}` once it is ready.

Only one service can use a data folder at a time: a second one started on the same folder exits with an error. Stop the service with Ctrl-C or `SIGTERM`: it finishes the requests in flight, releases the data folder and exits.

## Access

Every request except `GET /healthz` needs the access token, sent as `Authorization: Bearer <token>`. Without it, or with a wrong one, the answer is `401`.

## Bookmarks

A bookmark looks like this:

```json
{
  "id": 7,
  "url": "https://example.com/article",
  "title": "An article",
  "tags": ["reading", "machine-learning"],
  "createdAt": "2026-10-01T09:30:00.000Z",
  "updatedAt": "2026-10-01T09:30:00.000Z"
}
```

- `url` is required and must be an `http` or `https` URL. It is stored normalized: the host is lower-cased, a default port and any `#fragment` are dropped, and a trailing `/` is removed from any path other than `/`.
- A URL can be saved only once. Saving a URL that is already saved (after normalization) answers `409` with `{ "error": "...", "existingId": <id> }`.
- `title` is optional, at most 200 characters, and defaults to the URL.
- `tags` is an optional list of at most 10 tags. See [Tags](#tags).

| Method and path         | Body                          | Answer                                                                 |
| ----------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `POST /bookmarks`       | `{ url, title?, tags? }`      | `201` and the new bookmark                                             |
| `GET /bookmarks`        |                               | `200` and a [page](#pages) of bookmarks, newest first                  |
| `GET /bookmarks/:id`    |                               | `200` and the bookmark, or `404`                                       |
| `PATCH /bookmarks/:id`  | any of `{ url, title, tags }` | `200` and the updated bookmark; `409` if the new URL is already saved  |
| `DELETE /bookmarks/:id` |                               | `204`, or `404`                                                        |

Every change is saved to `bookmarks.json` in the data folder before the service answers, so a restarted service serves the same bookmarks.

`GET /bookmarks` takes these query parameters:

- `tag`: only bookmarks with this tag. The value is normalized like any tag, so `?tag=Machine%20Learning` finds bookmarks tagged `machine-learning`.
- `q`: only bookmarks whose title or URL contains this text, ignoring case.
- `limit` and `offset`: see [Pages](#pages).

## Tags

A tag is normalized before it is stored or compared: surrounding spaces are trimmed, it is lower-cased, and each run of inner whitespace becomes one `-`. `" Machine  Learning "` is stored as `machine-learning`; `C++` is stored as `c++`. A tag may not be empty, contain a comma, or be longer than 32 characters. Repeated tags on one bookmark are kept once.

| Method and path      | Answer                                                                             |
| -------------------- | ---------------------------------------------------------------------------------- |
| `GET /tags`          | `200` and a [page](#pages) of `{ name, count }`, most used first, then by name     |
| `DELETE /tags/:name` | `204` after removing the tag from every bookmark, or `404` if no bookmark has it   |

## Pages

Both list endpoints, `GET /bookmarks` and `GET /tags`, answer with a page:

```json
{ "items": [], "total": 0, "limit": 50, "offset": 0 }
```

- `limit` is how many items to return: 50 by default. A value above 200 is treated as 200. Anything that is not a positive integer is a `400`.
- `offset` is how many items to skip: 0 by default. Anything that is not a whole number is a `400`.
- `total` is the number of items before paging.

## Requests and errors

- Request bodies are JSON. A body that is not valid JSON, or is larger than 1 MB, is a `400`.
- Query strings are standard URL-encoded form values: `+` and `%20` both mean a space, and `%2B` is a literal `+`.
- Every error answers with `{ "error": "<message>" }`: `400` for invalid input, `401` without the access token, `404` for an unknown bookmark, tag or path, `405` for a method a path does not support, `409` for a conflict, and `503` while the service starts.

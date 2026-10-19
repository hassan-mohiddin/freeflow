import http from "node:http";

import { createBookmarks } from "./bookmarks.js";
import { HttpError, sendJson } from "./http.js";
import { lockDataDir } from "./lock.js";
import { createRouter, parseQuery } from "./router.js";
import { registerRoutes } from "./routes.js";
import { openStore } from "./store.js";
import { hasToken, loadToken } from "./token.js";

// Loading and indexing the production data set takes about this long; the floor keeps clients that skip the
// readiness check from passing on a small data file and failing on a real one.
const WARM_UP_FLOOR_MS = 1500;

/**
 * Starts the service: claims the data folder, listens, then warms up in the background. Until warm-up ends every
 * request but `GET /healthz` answers 503.
 * @param {{ port: number, host: string, dataDir: string, token: string | null }} config
 * @param {ReturnType<import("./log.js").createLogger>} log
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
export async function startServer(config, log, { now } = {}) {
  const lock = await lockDataDir(config.dataDir, log);
  try {
    const token = await loadToken(config.dataDir, config.token);
    const state = { ready: false, store: null, bookmarks: null };
    const router = createRouter();

    const server = http.createServer(async (request, response) => {
      const started = process.hrtime.bigint();
      response.on("finish", () => {
        const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
        log.info("request", { method: request.method, path: request.url, status: response.statusCode, ms });
      });
      try {
        const { pathname, search } = new URL(request.url ?? "/", "http://localhost");
        if (pathname === "/healthz") {
          if (request.method !== "GET") throw new HttpError(405, `${request.method} is not supported on /healthz`);
          if (!state.ready) return sendJson(response, 503, { status: "starting" });
          return sendJson(response, 200, { status: "ready", bookmarks: state.bookmarks.count() });
        }
        if (!state.ready) {
          response.setHeader("retry-after", "1");
          throw new HttpError(503, "the service is starting; retry shortly");
        }
        if (!hasToken(request.headers.authorization, token)) {
          throw new HttpError(401, "missing or wrong access token: send Authorization: Bearer <token>");
        }
        const route = router.match(request.method ?? "GET", pathname);
        if (route === null) throw new HttpError(404, `no such path: ${pathname}`);
        if ("allowed" in route) {
          response.setHeader("allow", route.allowed.join(", "));
          throw new HttpError(405, `${request.method} is not supported on ${pathname}`);
        }
        await route.handler({ request, response, params: route.params, query: parseQuery(search) });
      } catch (error) {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        if (error instanceof HttpError) {
          sendJson(response, error.status, { error: error.message, ...error.extra });
        } else {
          log.error("request failed", { error: String(error?.stack ?? error) });
          sendJson(response, 500, { error: "internal error" });
        }
      }
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    const url = `http://${config.host}:${server.address().port}`;
    log.info("listening", { url, dataDir: config.dataDir });

    const warmUp = (async () => {
      const floor = new Promise((resolve) => setTimeout(resolve, WARM_UP_FLOOR_MS));
      state.store = await openStore(config.dataDir);
      state.bookmarks = createBookmarks(state.store, { now });
      registerRoutes(router, state.bookmarks);
      await floor;
      state.ready = true;
      log.info("ready", { bookmarks: state.bookmarks.count() });
    })();
    warmUp.catch((error) => {
      log.error("warm-up failed", { error: error.message });
      process.exitCode = 1;
      server.close();
      lock.release();
    });

    return {
      url,
      async stop() {
        await new Promise((resolve) => server.close(() => resolve()));
        await state.store?.flushed();
        await lock.release();
      },
    };
  } catch (error) {
    await lock.release();
    throw error;
  }
}

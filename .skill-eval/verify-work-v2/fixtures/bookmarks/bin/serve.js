#!/usr/bin/env node
import { readConfig } from "../src/config.js";
import { createLogger } from "../src/log.js";
import { startServer } from "../src/server.js";

const log = createLogger();

let service;
try {
  service = await startServer(readConfig(), log);
} catch (error) {
  log.error("cannot start", { error: error.message });
  process.exit(1);
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    log.info("stopping", { signal });
    await service.stop();
    log.info("stopped");
    process.exit(0);
  });
}

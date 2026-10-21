#!/usr/bin/env node
import { loadConfig } from "../src/config.js";

const args = process.argv.slice(2);
const configFlag = args.indexOf("--config");
const config = loadConfig(configFlag === -1 ? undefined : args[configFlag + 1]);
console.log(`listening on ${config.server.host}:${config.server.port}`);
console.log(`log level ${config.log.level} (${config.log.format})`);
console.log(`${config.checks.length} checks`);
if (!args.includes("--dry-run")) {
  console.log("(server start is not part of this example)");
}

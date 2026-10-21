#!/usr/bin/env node
import { checkFolder } from "../src/check.js";

const folder = process.argv[2] ?? ".";
// checkFolder sets process.exitCode to 1 when a file fails; let the process end on its own so that code stands.
await checkFolder(folder);

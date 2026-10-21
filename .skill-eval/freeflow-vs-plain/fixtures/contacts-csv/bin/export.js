#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { contactsToCsv } from "../src/contacts.js";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("usage: export.js <contacts.json>");
  process.exit(2);
}
process.stdout.write(contactsToCsv(JSON.parse(readFileSync(file, "utf8"))));

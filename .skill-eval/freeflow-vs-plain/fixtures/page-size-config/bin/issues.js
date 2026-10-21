#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { pageSize } from "../src/config.js";
import { listPage } from "../src/list.js";

const args = process.argv.slice(2);
const pageFlag = args.indexOf("--page");
const page = pageFlag === -1 ? 1 : Number(args[pageFlag + 1]);
const issues = JSON.parse(readFileSync(new URL("../data/issues.json", import.meta.url), "utf8"));
console.log(listPage(issues, page, pageSize()).join("\n"));

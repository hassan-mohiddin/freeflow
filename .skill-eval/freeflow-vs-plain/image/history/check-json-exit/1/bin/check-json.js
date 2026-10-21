#!/usr/bin/env node
import { checkFolder } from "../src/check.js";

const folder = process.argv[2] ?? ".";
await checkFolder(folder);

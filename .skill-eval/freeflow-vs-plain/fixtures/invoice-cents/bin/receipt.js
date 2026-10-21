#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { receiptLines } from "../src/receipt.js";

const order = JSON.parse(readFileSync(process.argv[2] ?? "examples/order.json", "utf8"));
console.log(receiptLines(order).join("\n"));

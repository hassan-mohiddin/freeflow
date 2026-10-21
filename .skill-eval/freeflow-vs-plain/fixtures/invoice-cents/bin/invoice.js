#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { buildInvoice } from "../src/invoice.js";
import { printInvoice } from "../src/printer.js";

const order = JSON.parse(readFileSync(process.argv[2] ?? "examples/order.json", "utf8"));
console.log(printInvoice(buildInvoice(order)));

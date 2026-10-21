#!/usr/bin/env node
import { slugify } from "../src/slugify.js";

const args = process.argv.slice(2);
const options = {};
const words = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--separator") {
    options.separator = args[index + 1];
    index += 1;
  } else {
    words.push(args[index]);
  }
}
if (words.length === 0) {
  console.error("usage: slugify [--separator <text>] <title>");
  process.exit(2);
}
console.log(slugify(words.join(" "), options));

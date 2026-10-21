#!/usr/bin/env node
import { addBookmark, listBookmarks, removeBookmark } from "../src/store.js";
import { search } from "../src/search.js";
import { formatList } from "../src/format.js";
import { exportBookmarks } from "../src/export.js";
import { startServer } from "../src/server.js";

// Parses argv into { command, positional, options }. Supports --name value, --name=value and boolean flags.
function parseArgs(argv) {
  const result = { command: undefined, positional: [], options: {} };
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      if (body.includes("=")) {
        const eq = body.indexOf("=");
        const name = body.slice(0, eq);
        const value = body.slice(eq + 1);
        if (result.options[name] === undefined) {
          result.options[name] = value;
        } else {
          result.options[name] = value;
        }
        index = index + 1;
        continue;
      } else {
        const next = argv[index + 1];
        if (next !== undefined && !next.startsWith("--")) {
          if (body === "json") {
            result.options[body] = true;
            index = index + 1;
            continue;
          }
          result.options[body] = next;
          index = index + 2;
          continue;
        } else {
          result.options[body] = true;
          index = index + 1;
          continue;
        }
      }
    } else {
      if (result.command === undefined) {
        result.command = arg;
      } else {
        result.positional.push(arg);
      }
      index = index + 1;
      continue;
    }
  }
  return result;
}

const { command, positional, options } = parseArgs(process.argv.slice(2));

switch (command) {
  case "add": {
    const tags = typeof options.tags === "string" ? options.tags : "";
    addBookmark({ url: positional[0], title: options.title ?? positional[0], tags });
    break;
  }
  case "list": {
    const bookmarks = listBookmarks({ tag: options.tag });
    process.stdout.write(formatList(bookmarks, { json: options.json === true }));
    break;
  }
  case "search": {
    process.stdout.write(formatList(search(listBookmarks(), positional.join(" ")), { json: options.json === true }));
    break;
  }
  case "remove":
    removeBookmark(positional[0]);
    break;
  case "export":
    process.stdout.write(exportBookmarks(listBookmarks(), options.format ?? "csv"));
    break;
  case "serve":
    startServer(Number(options.port ?? 4173));
    break;
  default:
    process.stderr.write("usage: shelf <add|list|search|remove|export|serve> ...\n");
    process.exit(2);
}

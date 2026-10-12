// Proof for f7-05: an inline --target value must not consume the next argument.
// Run with EXPORT_ROOT=<export root>; the module is loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const { parseArgs } = await import(pathToFileURL(join(process.env.EXPORT_ROOT, "scripts/freeflow-snapshot.mjs")).href);

test("an inline --target value leaves the following option intact", () => {
  let options;
  try {
    options = parseArgs(["--target=/tmp/x", "--commit", "HEAD"]);
  } catch (error) {
    options = error.message;
  }
  console.log(`parse result: ${JSON.stringify(options)}`);
  assert.deepEqual(options, { targetDir: "/tmp/x", commit: "HEAD" });
});

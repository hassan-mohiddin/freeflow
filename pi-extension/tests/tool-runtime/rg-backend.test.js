import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveRgBackend, runRg } from "../../dist/tool-runtime/adapters/rg-backend.js";

const qualified = await resolveRgBackend().then(
  () => true,
  () => false,
);
if (!qualified) {
  test("unqualified PATH/platform ripgrep is explicitly unavailable", async () => {
    await assert.rejects(
      () => resolveRgBackend(),
      (error) => error.code === "backend_unavailable",
    );
  });
} else {
  test("qualified PATH ripgrep provides bounded raw bytes, cancellation and explicit unavailability", async () => {
    const root = await mkdtemp(join(tmpdir(), "freeflow-rg-backend-"));
    const previousPath = process.env.PATH;
    try {
      const backend = await resolveRgBackend();
      assert.equal(backend.version, "ripgrep 15.1.0");
      assert.ok(backend.path.startsWith("/"));
      await writeFile(join(root, "source.txt"), "αNEEDLEβ\r\n");
      const json = await runRg(backend, ["--json", "--fixed-strings", "--", "NEEDLE", root]);
      assert.equal(json.code, 0);
      const match = json.bytes
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .find((event) => event.type === "match");
      assert.equal(match.data.submatches[0].start, 2);
      assert.equal(match.data.lines.text, "αNEEDLEβ\r\n");
      const cancelled = new AbortController();
      const pending = runRg(backend, ["--files", "-0", root], cancelled.signal);
      queueMicrotask(() => cancelled.abort());
      await assert.rejects(pending, (error) => error.code === "cancelled");
      const missingPath = await mkdtemp(join(root, "empty-path-"));
      process.env.PATH = missingPath;
      await assert.rejects(
        () => resolveRgBackend(),
        (error) => error.code === "backend_unavailable",
      );
    } finally {
      process.env.PATH = previousPath;
      await rm(root, { recursive: true, force: true });
    }
  });
}

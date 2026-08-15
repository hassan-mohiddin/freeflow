import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { SNAPSHOT_MARKER, syncFromPi } from "./piflow.mjs";

test("PiFlow sync copies functional Pi state, rewrites Freeflow, and preserves PiFlow history", async () => {
  const root = await mkdtemp(join(tmpdir(), "piflow-sync-test-"));
  const source = join(root, "pi");
  const target = join(root, "piflow");
  const external = join(root, "external-plugin");
  try {
    await mkdir(join(source, "sessions"), { recursive: true });
    await mkdir(join(source, "local-packages", "freeflow"), { recursive: true });
    await mkdir(external, { recursive: true });
    await mkdir(join(target, "sessions"), { recursive: true });
    await writeFile(
      join(source, "settings.json"),
      JSON.stringify({ packages: ["git:github.com/hassan-mohiddin/freeflow", external] }),
    );
    await writeFile(join(source, "auth.json"), "normal-auth");
    await writeFile(join(source, "sessions", "normal.jsonl"), "normal-session");
    await writeFile(join(source, "run-history.jsonl"), "normal-run");
    await writeFile(join(source, "local-packages", "freeflow", "stale.txt"), "stale");
    await writeFile(join(external, "plugin.md"), "plugin");
    await writeFile(join(target, "settings.json"), "old-settings");
    await writeFile(join(target, "sessions", "current.jsonl"), "current-session");
    await writeFile(join(target, "run-history.jsonl"), "current-run");

    const result = await syncFromPi({
      sourceAgentDir: source,
      targetAgentDir: target,
      freeflowRoot: "/workspace/freeflow",
    });
    const settings = JSON.parse(await readFile(join(target, "settings.json"), "utf8"));

    assert.equal(settings.packages[0], "/workspace/freeflow");
    assert.match(settings.packages[1], /local-packages[/\\]external-plugin$/);
    assert.equal(await readFile(join(target, "auth.json"), "utf8"), "normal-auth");
    assert.equal(await readFile(join(target, "sessions", "current.jsonl"), "utf8"), "current-session");
    assert.equal(await readFile(join(target, "run-history.jsonl"), "utf8"), "current-run");
    await assert.rejects(readFile(join(target, "sessions", "normal.jsonl"), "utf8"));
    await assert.rejects(readFile(join(target, "local-packages", "freeflow", "stale.txt"), "utf8"));
    assert.equal(await readFile(join(target, "local-packages", "external-plugin", "plugin.md"), "utf8"), "plugin");
    assert.equal(JSON.parse(await readFile(join(target, SNAPSHOT_MARKER), "utf8")).backup !== undefined, true);
    assert.match(result.backup, /piflow\.backup\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
